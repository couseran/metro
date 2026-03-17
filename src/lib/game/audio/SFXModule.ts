// src/lib/game/audio/SFXModule.ts
//
// Sound-effect playback — stub with a future-proof interface.
//
// Planned implementation:
//
//   Pooling     — each soundId maps to a fixed pool of AudioBufferSourceNode
//                 instances.  When play() is called, the least-recently-used
//                 idle node is reused (or the oldest active one is stopped if
//                 maxConcurrent is reached).  This avoids GC spikes from
//                 constantly creating/destroying nodes.
//
//   Variants    — multiple recordings of the same action (e.g. 3 footstep
//                 variants) are stored per soundId and a random one is picked
//                 on each call, eliminating the "machine-gun effect".
//
//   Spatial     — an optional PannerNode can be inserted between the source
//                 and sfxGain to give sounds a world-space position relative
//                 to the camera (pass { x, y } in SFXPlayOptions).
//
//   Preloading  — preload() decodes and caches all variants for a set of
//                 soundIds so the first play call is latency-free.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SFXPlayOptions {
  /** Volume multiplier relative to the SFX master gain [0–1].  Default: 1. */
  volume?: number;
  /** Playback rate: 1 = normal, <1 = slower/lower, >1 = faster/higher.  Default: 1. */
  rate?: number;
  /** Future: world-space position for spatial audio. */
  // position?: { x: number; y: number };
}

// ─── SFXModule ────────────────────────────────────────────────────────────────

export class SFXModule {
  private readonly ctx:    AudioContext;
  private readonly output: GainNode;

  constructor(ctx: AudioContext, output: GainNode) {
    this.ctx    = ctx;
    this.output = output;
  }

  /**
   * Play a sound effect by its manifest id (e.g. 'footstep.carpet').
   * A random variant is selected from the registered variants array.
   *
   * No-op until the implementation is complete.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  play(_soundId: string, _options?: SFXPlayOptions): void {
    // TODO: look up soundId in SFX manifest, pick random variant,
    //       acquire a pooled source node, set rate/volume, start it.
    void this.ctx;    // suppress unused-variable warnings until implemented
    void this.output;
  }

  /**
   * Pre-decode a set of SFX variants so they are ready before the first
   * play() call.  Useful to call during area transitions or a loading screen.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async preload(_soundIds: string[]): Promise<void> {
    // TODO: fetch + decodeAudioData for every variant of each soundId.
  }

  /** Release all active nodes.  Called by AudioModule.dispose(). */
  dispose(): void {
    // TODO: stop and disconnect all pooled nodes.
  }
}
