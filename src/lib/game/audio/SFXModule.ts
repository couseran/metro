// src/lib/game/audio/SFXModule.ts
//
// One-shot sound-effect system.
//
// ── Architecture ─────────────────────────────────────────────────────────────
//
//   SFXModule owns a shared buffer cache and one SFXPool per registered
//   sound ID.  A pool encapsulates all runtime state for one logical sound:
//
//     SFXModule
//       └─ pools: Map<soundId, SFXPool>
//            ├─ bufferCache (shared reference)
//            └─ active: ActiveNode[]
//
//   Each play() call on a pool:
//     1. Picks a random variant path from config.variants.
//     2. Reads the pre-decoded AudioBuffer from the shared cache.
//        (If missing, logs a warning — call preload() during zone load.)
//     3. Enforces maxConcurrent: if the limit is already reached, the oldest
//        active instance is stopped immediately before starting the new one.
//     4. Creates a short per-play subgraph:
//          AudioBufferSourceNode → GainNode → sfxGain (module output)
//        The GainNode is needed so individual plays can have their own volume
//        without a global gain change affecting all concurrent instances.
//     5. Applies optional pitch variation: a small random offset to
//        playbackRate that keeps repeated sounds from sounding identical even
//        after exhausting all recorded variants.
//     6. Registers an onended handler that removes the entry from active[]
//        and disconnects the gain node so the subgraph can be GC'd.
//
// ── Scalability ───────────────────────────────────────────────────────────────
//
//   Adding a new SFX category requires only:
//     • Drop .ogg files into static/audio/sfx/
//     • Add an entry to AUDIO_MANIFEST.sfx (id, variants, optional overrides)
//     • Call audio.sfx.play('your.sound.id') from AudioModule.handleEvents()
//
//   No changes to SFXModule or SFXPool are needed.

import type { SFXConfig } from './AudioTypes';

// ─── Play options ──────────────────────────────────────────────────────────────

export interface SFXPlayOptions {
  /** Per-play volume multiplier [0–1], applied on top of the config volume.  Default: 1. */
  volume?: number;
  /**
   * Explicit playback-rate override [0.5–2].
   * When set, pitchVariation from the config is NOT applied — the caller has
   * full control.  Omit to let the pool apply its configured random variation.
   */
  rate?: number;
}

// ─── SFXPool ──────────────────────────────────────────────────────────────────

interface ActiveNode {
  source:   AudioBufferSourceNode;
  gainNode: GainNode;
}

/**
 * Manages all concurrent instances of a single logical sound.
 * One pool exists per sound ID registered in the SFX manifest.
 *
 * Pools are created lazily on the first play() call for their ID so that
 * sounds that are never triggered consume no resources at all.
 */
class SFXPool {
  private readonly ctx:         AudioContext;
  private readonly output:      GainNode;
  private readonly config:      SFXConfig;
  private readonly bufferCache: Map<string, AudioBuffer>;

  private active: ActiveNode[] = [];

  constructor(
      ctx:         AudioContext,
      output:      GainNode,
      config:      SFXConfig,
      bufferCache: Map<string, AudioBuffer>,
  ) {
    this.ctx         = ctx;
    this.output      = output;
    this.config      = config;
    this.bufferCache = bufferCache;
  }

  play(options?: SFXPlayOptions): void {
    // ── 1. Enforce maxConcurrent ──────────────────────────────────────────────
    const max = this.config.maxConcurrent ?? 4;
    if (this.active.length >= max) {
      const oldest = this.active.shift()!;
      try { oldest.source.stop(); } catch { /* already ended naturally */ }
      oldest.gainNode.disconnect();
    }

    // ── 2. Pick a random variant ──────────────────────────────────────────────
    const { variants } = this.config;
    const src = variants[Math.floor(Math.random() * variants.length)];

    const buffer = this.bufferCache.get(src);
    if (!buffer) {
      console.warn(`[SFXPool] Buffer not loaded for variant: ${src}. Call preload() first.`);
      return;
    }

    // ── 3. Build per-play subgraph: source → gainNode → output ───────────────
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = (this.config.volume ?? 1) * (options?.volume ?? 1);
    gainNode.connect(this.output);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // ── 4. Pitch variation ────────────────────────────────────────────────────
    if (options?.rate !== undefined) {
      // Caller overrides pitch entirely
      source.playbackRate.value = options.rate;
    } else {
      const variation = this.config.pitchVariation ?? 0;
      source.playbackRate.value = variation > 0
          ? 1 - variation / 2 + Math.random() * variation
          : 1;
    }

    source.connect(gainNode);

    // ── 5. Track and start ────────────────────────────────────────────────────
    const entry: ActiveNode = { source, gainNode };
    this.active.push(entry);

    source.onended = () => {
      const idx = this.active.indexOf(entry);
      if (idx !== -1) this.active.splice(idx, 1);
      gainNode.disconnect();
    };

    source.start();
  }

  dispose(): void {
    for (const { source, gainNode } of this.active) {
      try { source.stop(); } catch { /* already ended */ }
      gainNode.disconnect();
    }
    this.active = [];
  }
}

// ─── SFXModule ────────────────────────────────────────────────────────────────

export class SFXModule {
  private readonly ctx:    AudioContext;
  private readonly output: GainNode;

  private manifest:    Record<string, SFXConfig>   = {};
  private pools:       Map<string, SFXPool>         = new Map();
  private bufferCache: Map<string, AudioBuffer>     = new Map();

  constructor(ctx: AudioContext, output: GainNode) {
    this.ctx    = ctx;
    this.output = output;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Register the SFX manifest.
   * Must be called before play() or preload().
   * Passing a new manifest replaces the previous one and resets all pools
   * (useful for zone transitions where SFX sets change completely).
   */
  init(manifest: Record<string, SFXConfig>): void {
    this.manifest = manifest;
    this.pools.clear();
    // Note: bufferCache is intentionally kept so already-decoded buffers are
    // reused if the same paths appear in the new manifest.
  }

  // ─── Playback ─────────────────────────────────────────────────────────────────

  /**
   * Play a registered sound effect by its manifest ID.
   *
   * Pools are created lazily — the first call for a given ID creates its pool.
   * Subsequent calls reuse the same pool and its cached buffers.
   *
   * @param soundId - Dot-notation manifest ID, e.g. 'footstep.carpet'
   * @param options - Optional per-play volume or rate overrides
   */
  play(soundId: string, options?: SFXPlayOptions): void {
    let pool = this.pools.get(soundId);

    if (!pool) {
      const config = this.manifest[soundId];
      if (!config) {
        console.warn(`[SFXModule] Unknown sound ID: "${soundId}". Register it in AUDIO_MANIFEST.sfx.`);
        return;
      }
      pool = new SFXPool(this.ctx, this.output, config, this.bufferCache);
      this.pools.set(soundId, pool);
    }

    pool.play(options);
  }

  // ─── Preloading ───────────────────────────────────────────────────────────────

  /**
   * Pre-decode the audio buffers for a set of sound IDs so that the first
   * play() call has no latency.
   *
   * Call this during a loading screen or before entering an area where
   * specific sounds will be triggered.  Already-cached buffers are skipped.
   *
   * @param soundIds - IDs to preload, e.g. ['footstep.carpet', 'footstep.stone']
   */
  async preload(soundIds: string[]): Promise<void> {
    // Collect unique source paths across all requested IDs
    const srcs = new Set<string>();
    for (const id of soundIds) {
      this.manifest[id]?.variants.forEach((v) => srcs.add(v));
    }

    await Promise.all([...srcs].map((src) => this.fetchBuffer(src)));
  }

  // ─── Buffer cache ─────────────────────────────────────────────────────────────

  private async fetchBuffer(src: string): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(src);
    if (cached) return cached;

    const res = await fetch(src);
    if (!res.ok) throw new Error(`[SFXModule] Failed to fetch: ${src} (HTTP ${res.status})`);

    const raw    = await res.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(raw);
    this.bufferCache.set(src, buffer);
    return buffer;
  }

  // ─── Dispose ──────────────────────────────────────────────────────────────────

  /** Stop all active instances and release buffer memory. */
  dispose(): void {
    for (const pool of this.pools.values()) pool.dispose();
    this.pools.clear();
    this.bufferCache.clear();
  }
}
