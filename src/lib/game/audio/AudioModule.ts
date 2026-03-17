// src/lib/game/audio/AudioModule.ts
//
// Top-level audio manager.
//
// Owns the single shared AudioContext and the master gain graph:
//
//   AudioContext
//     └─ masterGain
//          ├─ musicGain  →  MusicModule  (BGM playlist + crossfade)
//          └─ sfxGain    →  SFXModule    (one-shot effects)
//
// ── Autoplay policy ──────────────────────────────────────────────────────────
//
//   Browsers suspend the AudioContext until a user gesture has occurred.
//   Call autoResume(window, callback) immediately after constructing this
//   module — before the first interaction.  The callback is invoked once the
//   context is running, which is the right moment to call music.setPlaylist()
//   and sfx.preload().
//
// ── Volume hierarchy ─────────────────────────────────────────────────────────
//
//   masterVolume  →  controls all audio simultaneously
//   musicVolume   →  scales BGM independently from SFX
//   sfxVolume     →  scales SFX independently from BGM
//
//   Each setter uses setTargetAtTime() with a short time-constant so volume
//   changes never produce audible clicks or pops.

import type { GameEvent }  from '../types/events';
import type { SFXConfig }  from './AudioTypes';
import { TileType }        from '../types/world';
import { MusicModule }     from './MusicModule';
import { SFXModule }       from './SFXModule';

// ─── Footstep surface map ─────────────────────────────────────────────────────

/**
 * Maps a TileTypeValue to its corresponding SFX manifest ID.
 *
 * Only surfaces that have audio registered need an entry — missing entries
 * produce no sound (silent step).  Add new surfaces here as SFX are added to
 * the manifest.
 */
const FOOTSTEP_SURFACE: Partial<Record<number, string>> = {
  [TileType.CARPET]:        'footstep.carpet',
  // Uncomment as matching SFX are added to AUDIO_MANIFEST.sfx:
  // [TileType.STONE]:         'footstep.stone',
  // [TileType.SAND]:          'footstep.sand',
  // [TileType.PATH_SAND]:     'footstep.sand',
  // [TileType.DIRT]:          'footstep.dirt',
  // [TileType.SNOW]:          'footstep.snow',
  // [TileType.FLOWERS]:       'footstep.grass',
  // [TileType.SHALLOW_WATER]: 'footstep.shallow_water',
};

// ─── AudioModule ──────────────────────────────────────────────────────────────

export class AudioModule {
  private readonly ctx:        AudioContext;
  private readonly masterGain: GainNode;
  private readonly musicGain:  GainNode;
  private readonly sfxGain:    GainNode;

  readonly music: MusicModule;
  readonly sfx:   SFXModule;

  // ─── Constructor ─────────────────────────────────────────────────────────────

  /**
   * @param sfxManifest - The sfx section of AUDIO_MANIFEST.
   *                      Forwarded to SFXModule.init() so play() and preload()
   *                      can resolve sound IDs immediately.
   */
  constructor(sfxManifest: Record<string, SFXConfig> = {}) {
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
    this.sfx.init(sfxManifest);
  }

  // ─── Autoplay policy ─────────────────────────────────────────────────────────

  /**
   * Register a one-time listener on `target` that resumes the AudioContext on
   * the first user interaction (keydown or pointer), then calls `onResume`.
   *
   * Start music playback and SFX preloading inside `onResume` to guarantee
   * the context is running:
   *
   *   audio.autoResume(window, () => {
   *     audio.music.setPlaylist(config);
   *     audio.sfx.preload(['footstep.carpet']);
   *   });
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
   * Process game events emitted by the simulation.
   *
   * Called by the game loop once per display frame, after all simulation ticks
   * for that frame have completed.  Events from every tick in the frame are
   * batched and delivered here together.
   *
   * Audio never touches simulation state — it only reacts to what the
   * simulation explicitly communicates through this event queue.
   */
  handleEvents(events: GameEvent[]): void {
    for (const event of events) {
      switch (event.type) {

        case 'FOOTSTEP': {
          const soundId = FOOTSTEP_SURFACE[event.tileType];
          if (soundId) this.sfx.play(soundId);
          break;
        }

        case 'WEATHER_CHANGED':
          // const playlist = AUDIO_MANIFEST.music.playlists[event.to];
          // if (playlist) this.music.setPlaylist(playlist).catch(console.error);
          break;

        case 'DIALOGUE_STARTED':
          // this.setMusicVolume(0.4);  // duck music during dialogue
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
