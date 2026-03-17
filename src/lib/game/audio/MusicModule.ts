// src/lib/game/audio/MusicModule.ts
//
// Background-music system: playlist management, lazy loading, and crossfading.
//
// ── Audio graph ───────────────────────────────────────────────────────────────
//
//   Two gain "slots" hang off the musicGain node supplied by AudioModule:
//
//     sourceA → slotGain[0] ─┐
//                             ├─ musicGain → masterGain → destination
//     sourceB → slotGain[1] ─┘
//
//   Crossfading works by alternating which slot is active:
//     • The outgoing slot's gain ramps from 1 → 0 over crossfadeDuration.
//     • The incoming slot's gain ramps from 0 → 1 over the same period.
//     • The old source is scheduled to stop exactly when its gain reaches 0.
//
// ── Track lifecycle ───────────────────────────────────────────────────────────
//
//   Track N starts playing
//     → (buffer.duration − crossfadeDuration) seconds later, a setTimeout fires
//     → crossfadeToTrack(N+1) begins:
//         - fetches buffer N+1  (already cached — prefetched when N started)
//         - schedules gain ramps on both slots
//         - starts source N+1, stops source N after the overlap
//         - schedules the NEXT crossfade for track N+2
//         - prefetches buffer N+2
//
// ── Shuffle ───────────────────────────────────────────────────────────────────
//
//   The playOrder array is a shuffled index permutation that is rebuilt at the
//   end of each full cycle, so every track plays exactly once per cycle and
//   the first track of the next cycle is never the same as the last of the
//   current one (Fisher-Yates guarantees a new shuffle each time).

import type { PlaylistConfig } from './AudioTypes';

export class MusicModule {
  private readonly ctx:       AudioContext;
  private readonly slotGains: [GainNode, GainNode];

  private slotSources: [AudioBufferSourceNode | null, AudioBufferSourceNode | null] = [null, null];
  private activeSlot:  0 | 1 = 0;

  private playlist:         PlaylistConfig | null = null;
  private playOrder:        number[] = [];
  private currentPos:       number   = 0;
  private crossfadeDuration: number  = 3;   // seconds

  private crossfadeTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly bufferCache = new Map<string, AudioBuffer>();

  // ─── Constructor ─────────────────────────────────────────────────────────────

  constructor(ctx: AudioContext, output: GainNode) {
    this.ctx = ctx;

    this.slotGains = [ctx.createGain(), ctx.createGain()];
    this.slotGains[0].gain.value = 0;
    this.slotGains[1].gain.value = 0;
    this.slotGains[0].connect(output);
    this.slotGains[1].connect(output);
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Start playing a playlist, crossfading from any currently-playing track.
   *
   * Safe to call at any time:
   *   • No music playing  → 1-second fade-in on the first track.
   *   • Music already playing → crossfades over crossfadeDuration seconds.
   *
   * @param config       - Playlist to play (tracks, mode, crossfadeDuration)
   * @param fadeDuration - Optional override for this specific transition.
   */
  async setPlaylist(config: PlaylistConfig, fadeDuration?: number): Promise<void> {
    const isFirstPlay = this.slotSources[this.activeSlot] === null;

    this.clearTimer();
    this.playlist         = config;
    this.crossfadeDuration = config.crossfadeDuration ?? 3;
    this.buildOrder();
    this.currentPos = 0;

    const fade = fadeDuration ?? (isFirstPlay ? 1 : this.crossfadeDuration);
    await this.crossfadeToTrack(this.currentPos, fade);
  }

  /**
   * Fade out the current track and halt playback.
   * Does not clear the playlist — call setPlaylist() to resume later.
   *
   * @param fadeDuration - Fade-out duration in seconds.  Default: 1.
   */
  stop(fadeDuration = 1): void {
    this.clearTimer();

    const now  = this.ctx.currentTime;
    const gain = this.slotGains[this.activeSlot];

    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + fadeDuration);

    const source = this.slotSources[this.activeSlot];
    if (source) {
      source.stop(now + fadeDuration);
      this.slotSources[this.activeSlot] = null;
    }
  }

  /** Release all resources.  Called by AudioModule.dispose(). */
  dispose(): void {
    this.clearTimer();
    try { this.slotSources[0]?.stop(); } catch { /* already stopped */ }
    try { this.slotSources[1]?.stop(); } catch { /* already stopped */ }
    this.slotSources = [null, null];
    this.bufferCache.clear();
  }

  // ─── Playlist helpers ────────────────────────────────────────────────────────

  private buildOrder(): void {
    if (!this.playlist) return;

    const n = this.playlist.tracks.length;
    this.playOrder = Array.from({ length: n }, (_, i) => i);

    if (this.playlist.mode === 'shuffle') {
      // Fisher-Yates in-place shuffle
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.playOrder[i], this.playOrder[j]] = [this.playOrder[j], this.playOrder[i]];
      }
    }
  }

  /** Advance currentPos, reshuffling when a full shuffle cycle wraps around. */
  private advancePos(): void {
    if (!this.playlist) return;

    this.currentPos = (this.currentPos + 1) % this.playOrder.length;

    if (this.currentPos === 0 && this.playlist.mode === 'shuffle') {
      this.buildOrder();
    }
  }

  // ─── Buffer loading ──────────────────────────────────────────────────────────

  private async fetchBuffer(src: string): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(src);
    if (cached) return cached;

    const res = await fetch(src);
    if (!res.ok) throw new Error(`[MusicModule] Failed to fetch: ${src} (HTTP ${res.status})`);

    const raw    = await res.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(raw);
    this.bufferCache.set(src, buffer);
    return buffer;
  }

  /** Fire-and-forget pre-fetch so the next buffer is cached before it's needed. */
  private prefetch(src: string): void {
    if (!this.bufferCache.has(src)) {
      this.fetchBuffer(src).catch((err) =>
          console.warn('[MusicModule] Prefetch failed:', err),
      );
    }
  }

  // ─── Crossfade engine ────────────────────────────────────────────────────────

  /**
   * Fade in the track at `orderPos` on the inactive slot while fading out
   * the currently active slot.  Then schedules the next crossfade.
   *
   * @param orderPos    - Index into this.playOrder (not the track index itself)
   * @param fadeDuration - Duration of this particular fade in seconds
   */
  private async crossfadeToTrack(orderPos: number, fadeDuration: number): Promise<void> {
    if (!this.playlist || this.playlist.tracks.length === 0) return;

    const src    = this.playlist.tracks[this.playOrder[orderPos]];
    const buffer = await this.fetchBuffer(src);

    const nextSlot: 0 | 1 = this.activeSlot === 0 ? 1 : 0;
    const now = this.ctx.currentTime;

    // ── Fade out current slot ─────────────────────────────────────────────────
    const outGain = this.slotGains[this.activeSlot];
    outGain.gain.cancelScheduledValues(now);
    outGain.gain.setValueAtTime(outGain.gain.value, now);
    outGain.gain.linearRampToValueAtTime(0, now + fadeDuration);

    const oldSource = this.slotSources[this.activeSlot];
    if (oldSource) {
      oldSource.stop(now + fadeDuration);
      this.slotSources[this.activeSlot] = null;
    }

    // ── Fade in next slot ─────────────────────────────────────────────────────
    const inGain = this.slotGains[nextSlot];
    inGain.gain.cancelScheduledValues(now);
    inGain.gain.setValueAtTime(0, now);
    inGain.gain.linearRampToValueAtTime(1, now + fadeDuration);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(inGain);
    source.start(now);

    this.slotSources[nextSlot] = source;
    this.activeSlot = nextSlot;

    // ── Prefetch next-next track ──────────────────────────────────────────────
    // Starts fetching while the current track plays, so the buffer is
    // decoded and cached before the next crossfade timer fires.
    const peekPos = (orderPos + 1) % this.playOrder.length;
    if (this.playlist.tracks[this.playOrder[peekPos]]) {
      this.prefetch(this.playlist.tracks[this.playOrder[peekPos]]);
    }

    // ── Schedule next crossfade ───────────────────────────────────────────────
    // Fire `crossfadeDuration` seconds before the track ends so the incoming
    // track is fully faded in exactly when the outgoing one finishes.
    const msUntilCrossfade = Math.max(0, buffer.duration - this.crossfadeDuration) * 1000;

    this.crossfadeTimer = setTimeout(async () => {
      this.advancePos();
      await this.crossfadeToTrack(this.currentPos, this.crossfadeDuration);
    }, msUntilCrossfade);
  }

  private clearTimer(): void {
    if (this.crossfadeTimer !== null) {
      clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
  }
}
