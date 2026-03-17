// src/lib/game/audio/AudioModule.ts
//
// Top-level audio manager.
//
// Owns the single shared AudioContext and the master gain graph:
//
//   AudioContext
//     └─ masterGain
//          ├─ musicGain  →  MusicModule  (BGM playlist + crossfade)
//          └─ sfxGain    →  SFXModule    (one-shot effects — stub)
//
// ── Autoplay policy ──────────────────────────────────────────────────────────
//
//   Browsers suspend the AudioContext until a user gesture has occurred.
//   Call autoResume(window, callback) immediately after constructing this
//   module — before the first interaction.  The callback is invoked once the
//   context is running, which is the right moment to call music.setPlaylist().
//
// ── Volume hierarchy ─────────────────────────────────────────────────────────
//
//   masterVolume  →  controls all audio simultaneously
//   musicVolume   →  scales BGM independently from SFX
//   sfxVolume     →  scales SFX independently from BGM
//
//   Each setter uses setTargetAtTime() with a short time-constant so volume
//   changes never produce audible clicks or pops.

import type { GameEvent }    from '../types/events';
import { MusicModule }       from './MusicModule';
import { SFXModule }         from './SFXModule';

export class AudioModule {
  private readonly ctx:        AudioContext;
  private readonly masterGain: GainNode;
  private readonly musicGain:  GainNode;
  private readonly sfxGain:    GainNode;

  readonly music: MusicModule;
  readonly sfx:   SFXModule;

  // ─── Constructor ─────────────────────────────────────────────────────────────

  constructor() {
    this.ctx = new AudioContext();

    // Build the gain hierarchy
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.masterGain);

    // Sub-modules
    this.music = new MusicModule(this.ctx, this.musicGain);
    this.sfx   = new SFXModule(this.ctx, this.sfxGain);
  }

  // ─── Autoplay policy ─────────────────────────────────────────────────────────

  /**
   * Register a one-time listener on `target` that resumes the AudioContext on
   * the first user interaction (keydown or pointer), then calls `onResume`.
   *
   * Start music playback inside `onResume` to guarantee the context is running:
   *
   *   audio.autoResume(window, () => audio.music.setPlaylist(config));
   *
   * The handler removes itself after the first trigger so it does not linger.
   */
  autoResume(target: EventTarget, onResume?: () => void): void {
    const handler = () => {
      target.removeEventListener('keydown',     handler);
      target.removeEventListener('pointerdown', handler);

      this.ctx.resume()
          .then(() => onResume?.())
          .catch(console.error);
    };

    target.addEventListener('keydown',     handler, { passive: true });
    target.addEventListener('pointerdown', handler, { passive: true });
  }

  // ─── Volume controls ─────────────────────────────────────────────────────────

  /** Set master volume [0–1].  Affects all audio simultaneously. */
  setMasterVolume(value: number): void {
    this.masterGain.gain.setTargetAtTime(
        Math.max(0, Math.min(1, value)),
        this.ctx.currentTime,
        0.015,
    );
  }

  /** Set BGM volume [0–1] independently from SFX. */
  setMusicVolume(value: number): void {
    this.musicGain.gain.setTargetAtTime(
        Math.max(0, Math.min(1, value)),
        this.ctx.currentTime,
        0.015,
    );
  }

  /** Set SFX volume [0–1] independently from BGM. */
  setSFXVolume(value: number): void {
    this.sfxGain.gain.setTargetAtTime(
        Math.max(0, Math.min(1, value)),
        this.ctx.currentTime,
        0.015,
    );
  }

  // ─── Game event dispatch ─────────────────────────────────────────────────────

  /**
   * Process game events emitted by the simulation each tick.
   *
   * Called by the game loop after the simulation step so that audio always
   * reacts to the latest state without ever touching simulation internals.
   *
   * Handlers are currently stubs — fill them in as each system is implemented.
   */
  handleEvents(events: GameEvent[]): void {
    for (const event of events) {
      switch (event.type) {

        case 'FOOTSTEP':
          // this.sfx.play(`footstep.${event.tileType}`);
          break;

        case 'WEATHER_CHANGED':
          // const playlist = AUDIO_MANIFEST.music.playlists[event.to];
          // if (playlist) this.music.setPlaylist(playlist).catch(console.error);
          break;

        case 'DIALOGUE_STARTED':
          // this.music.setMusicVolume(0.4);  // duck music during dialogue
          break;

        case 'ENTITY_SPAWNED':
        case 'ENTITY_REMOVED':
        case 'ITEM_PICKED_UP':
        case 'PROP_DESTROYED':
          break;
      }
    }
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  /** Stop all audio and release AudioContext resources. */
  dispose(): void {
    this.music.dispose();
    this.sfx.dispose();
    this.ctx.close().catch(console.error);
  }
}
