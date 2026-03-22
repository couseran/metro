// src/lib/game/engine/GameLoop.ts
// Fixed timestep with interpolation — Fiedler 2006 ("Fix Your Timestep")
// https://gafferongames.com/post/fix_your_timestep/

import type { InputModule }      from './InputModule.ts';
import type { SimulationModule } from './SimulationModule';
import type { RendererModule }   from './RendererModule';
import type { AudioModule }      from '../audio/AudioModule';
import { uiState } from '../bridge/UIStore.svelte';
import type { GameState } from './SimulationModule';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Simulation always runs at exactly 60Hz regardless of display refresh rate.
 * Decoupling simulation from display framerate is the core guarantee of this pattern.
 */
const FIXED_STEP = 1000 / 60; // ~16.667ms

/**
 * Maximum simulation steps per display frame.
 * Prevents the "spiral of death": if the simulation falls behind
 * (e.g. tab was backgrounded), we cap catchup rather than freezing.
 * At 60Hz fixed step, 5 steps = can handle up to 300ms frame spikes gracefully.
 */
const MAX_STEPS = 5;

/**
 * Maximum frame delta clamped to this value.
 * Prevents an enormous first delta after a long pause from
 * running hundreds of simulation steps at once.
 */
const MAX_FRAME_DELTA = 200; // ms

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameLoopStats {
  fps:          number;   // display frames per second (rolling average)
  simTps:       number;   // simulation ticks per second (rolling average)
  frameTime:    number;   // last raw frame delta in ms
  accumulator:  number;   // current accumulator value in ms (debug)
}

type StatsCallback = (stats: GameLoopStats) => void;

// ─── UI sync ──────────────────────────────────────────────────────────────────

/**
 * Mirror the relevant slice of GameState to the Svelte reactive UI store.
 * Called every display frame (after render) so overlays and panels always
 * show the freshest simulation data without polling.
 *
 * Only shallow-copies the fields the UI actually reads — the full GameState
 * is never exposed to Svelte components.
 */
function syncUIStore(state: GameState): void {
  uiState.camera           = state.camera;
  uiState.playerInventory  = state.player.inventory;
  uiState.groundItems      = [...state.groundItems.values()];
  uiState.contextStack     = state.contextStack;
}

// ─── GameLoop ─────────────────────────────────────────────────────────────────

export class GameLoop {
  private input:      InputModule;
  private simulation: SimulationModule;
  private renderer:   RendererModule;
  private audio:      AudioModule | undefined;

  private rafHandle:   number  = 0;
  private running:     boolean = false;
  private lastTime:    number  = 0;
  private accumulator: number  = 0;

  // ─── Stats (optional, for debug HUD) ───────────────────────────────────────
  private statsCallback: StatsCallback | null = null;
  private frameCount:    number  = 0;
  private tickCount:     number  = 0;
  private statsTimer:    number  = 0;
  private lastFps:       number  = 0;
  private lastTps:       number  = 0;
  private lastFrameTime: number  = 0;

  constructor(
      input:      InputModule,
      simulation: SimulationModule,
      renderer:   RendererModule,
      audio?:     AudioModule,
  ) {
    this.input      = input;
    this.simulation = simulation;
    this.renderer   = renderer;
    this.audio      = audio;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Start the game loop.
   * Safe to call multiple times — no-ops if already running.
   */
  start(): void {
    if (this.running) return;

    this.running  = true;
    this.lastTime = performance.now();

    this.rafHandle = requestAnimationFrame(this.loop);
  }

  /**
   * Stop the game loop cleanly.
   * The current frame finishes before stopping — no mid-frame teardown.
   */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafHandle);
    this.rafHandle = 0;
  }

  /**
   * Register a callback to receive performance stats once per second.
   * Useful for a debug HUD overlay — pass null to disable.
   */
  onStats(callback: StatsCallback | null): void {
    this.statsCallback = callback;
  }

  // ─── Core loop ───────────────────────────────────────────────────────────────

  /**
   * Arrow function so 'this' is always the GameLoop instance
   * when passed as a rAF callback — no .bind() needed.
   */
  private loop = (timestamp: number): void => {
    if (!this.running) return;

    // ── 1. Compute frame delta ────────────────────────────────────────────────
    // Clamp to MAX_FRAME_DELTA to absorb tab-switch spikes without
    // sending the simulation spiraling through hundreds of ticks.
    const frameTime   = Math.min(timestamp - this.lastTime, MAX_FRAME_DELTA);
    this.lastTime     = timestamp;
    this.accumulator += frameTime;
    this.lastFrameTime = frameTime;

    // ── 2. Simulation ticks ───────────────────────────────────────────────────
    // Drain the accumulator in fixed steps.
    // Multiple ticks run here when the display frame is slow (e.g. 40ms frame
    // → 2 simulation ticks of 16.67ms each).
    // MAX_STEPS prevents infinite loops on severe lag.
    let steps = 0;

    while (this.accumulator >= FIXED_STEP && steps < MAX_STEPS) {
      const inputs = this.input.flush();
      this.simulation.tick(FIXED_STEP, inputs);
      this.accumulator -= FIXED_STEP;
      steps++;
      this.tickCount++;
    }

    // If MAX_STEPS was hit, discard leftover accumulator time rather than
    // carrying it forward and compounding the lag on the next frame.
    if (steps === MAX_STEPS) {
      this.accumulator = 0;
    }

    // ── 3. Render ─────────────────────────────────────────────────────────────
    // alpha is the interpolation factor [0.0 → 1.0] representing how far
    // into the current fixed step we are. Passed to the renderer so it can
    // lerp entity positions between prevState and state for smooth visuals
    // even when the display runs at a different rate than the simulation.
    const alpha = this.accumulator / FIXED_STEP;

    this.renderer.draw(
        this.simulation.prevState,
        this.simulation.state,
        alpha,
    );

    // ── 3b. UI state sync ─────────────────────────────────────────────────────
    // Mirror simulation state to the Svelte reactive store every frame.
    // Svelte components read uiState — they never reach into GameState directly.
    syncUIStore(this.simulation.state);

    // ── 4. Audio event dispatch ───────────────────────────────────────────────
    // Flush all events accumulated across every simulation tick this frame and
    // forward them to the audio module in one batch.  Batching avoids per-tick
    // overhead and ensures the audio system always sees a complete frame's worth
    // of events rather than a partial tick.
    if (this.audio) {
      const events = this.simulation.flushEvents();
      if (events.length > 0) this.audio.handleEvents(events);
    }

    this.frameCount++;

    // ── 5. Stats (optional, dev only) ────────────────────────────────────────
    this.updateStats(frameTime);

    // ── 6. Schedule next frame ────────────────────────────────────────────────
    this.rafHandle = requestAnimationFrame(this.loop);
  };

  // ─── Stats ───────────────────────────────────────────────────────────────────

  private updateStats(frameTime: number): void {
    if (!this.statsCallback) return;

    this.statsTimer += frameTime;

    // Emit stats once per second
    if (this.statsTimer >= 1000) {
      this.lastFps = this.frameCount;
      this.lastTps = this.tickCount;

      this.frameCount = 0;
      this.tickCount  = 0;
      this.statsTimer = 0;

      this.statsCallback({
        fps:         this.lastFps,
        simTps:      this.lastTps,
        frameTime:   this.lastFrameTime,
        accumulator: this.accumulator,
      });
    }
  }
}