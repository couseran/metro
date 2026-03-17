// src/lib/game/audio/AudioTypes.ts
//
// Type definitions for the game's audio manifest.
// The manifest is the single source of truth for every audio asset in the game.
//
// Three asset categories are supported:
//   music — long looping BGM tracks, organised into named playlists
//   sfx   — short one-shot effects, optionally multi-variant for natural variation
//
// (Ambient beds, UI sounds, etc. will extend this file when needed.)

// ─── Music ────────────────────────────────────────────────────────────────────

export interface PlaylistConfig {
  /**
   * Ordered list of track paths, relative to /static.
   * Example: '/audio/music/track01.ogg'
   */
  tracks: string[];

  /**
   * 'sequential' plays tracks in declaration order and wraps around.
   * 'shuffle' randomizes the order and reshuffles after each full cycle.
   */
  mode: 'sequential' | 'shuffle';

  /**
   * Overlap duration in seconds between the outgoing and incoming track.
   * Default: 3.  Set to 0 for a hard cut between tracks.
   */
  crossfadeDuration?: number;
}

export interface MusicManifest {
  /** Named playlists — switch by name on zone or weather changes. */
  playlists: Record<string, PlaylistConfig>;

  /**
   * The playlist started automatically after the first user interaction.
   * Must be a key that exists in `playlists`.
   */
  defaultPlaylist: string;
}

// ─── SFX ──────────────────────────────────────────────────────────────────────

export interface SFXConfig {
  /**
   * One or more audio file paths for this sound.
   * Multiple variants let the SFX module pick at random on each play call,
   * which prevents the "machine-gun effect" on frequently triggered sounds.
   */
  variants: string[];

  /**
   * Volume multiplier relative to the sfxGain master [0–1].
   * Use this to balance individual effects without touching the master.
   * Default: 1.
   */
  volume?: number;

  /**
   * Maximum number of simultaneously active instances of this sound.
   * When the limit is reached, the oldest active instance is stopped.
   * Default: 4.
   */
  maxConcurrent?: number;
}

// ─── Root manifest ────────────────────────────────────────────────────────────

export interface AudioManifest {
  music: MusicManifest;

  /**
   * Sound-effect library.
   * Use dot-notation for namespacing: 'footstep.carpet', 'ui.button_click'.
   */
  sfx: Record<string, SFXConfig>;
}
