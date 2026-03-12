// src/lib/game/engine/InputModule.ts

// ─── Types ────────────────────────────────────────────────────────────────────

export type InputEventType = 'keydown' | 'keyup';

export interface InputEvent {
  type:      InputEventType;
  key:       string;          // KeyboardEvent.code — layout-independent (e.g. 'KeyW', 'ArrowUp')
  timestamp: number;          // performance.now() at the moment of the DOM event
}

// ─── InputModule ──────────────────────────────────────────────────────────────

/**
 * Collect raw DOM input events into a queue between simulation ticks.
 * The queue is flushed and consumed at the start of each tick by SimulationModule.
 *
 * Rules:
 *  - Input is NEVER applied directly to game state from here.
 *  - Events are queued on the DOM event thread, consumed on the simulation thread.
 *  - flush() is the only way to read events — it clears the queue atomically.
 *  - This makes input deterministic and framerate-independent.
 *
 * Multiplayer note:
 *  - The flushed InputEvent[] is exactly what gets serialized and sent to the server.
 *  - Do not add any game logic here — this module is intentionally dumb.
 *
 * Usage:
 *   const input = new InputModule();
 *   input.mount(window);         // attach DOM listeners
 *   ...
 *   const events = input.flush() // called by GameLoop each tick
 *   ...
 *   input.unmount();             // call in onDestroy to avoid listener leaks
 */
export class InputModule {
  private queue:    InputEvent[] = [];
  private target:   Window | null = null;

  // Bound handler references kept so removeEventListener can match them exactly
  private _onKeyDown: (e: KeyboardEvent) => void;
  private _onKeyUp:   (e: KeyboardEvent) => void;

  constructor() {
    this._onKeyDown = this.onKeyDown.bind(this);
    this._onKeyUp   = this.onKeyUp.bind(this);
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Attach DOM event listeners.
   * Call once after the canvas is mounted (in SvelteKit: inside onMount).
   */
  mount(target: Window): void {
    if (this.target) {
      console.warn('[InputModule] Already mounted — call unmount() first.');
      return;
    }

    this.target = target;
    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup',   this._onKeyUp);
  }

  /**
   * Remove DOM event listeners.
   * Always call in onDestroy to prevent memory / listener leaks.
   */
  unmount(): void {
    if (!this.target) return;
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup',   this._onKeyUp);
    this.target = null;
    this.queue  = [];
  }

  // ─── Event handlers ──────────────────────────────────────────────────────────

  private onKeyDown(e: KeyboardEvent): void {
    // Prevent browser shortcuts (arrow keys scrolling the page, etc.)
    if (isGameKey(e.code)) e.preventDefault();

    // Ignore OS-level key repeat — we track held state in SimulationModule
    if (e.repeat) return;

    this.queue.push({
      type:      'keydown',
      key:       e.code,
      timestamp: performance.now(),
    });
  }

  private onKeyUp(e: KeyboardEvent): void {
    if (isGameKey(e.code)) e.preventDefault();

    this.queue.push({
      type:      'keyup',
      key:       e.code,
      timestamp: performance.now(),
    });
  }

  // ─── Queue access ────────────────────────────────────────────────────────────

  /**
   * Return all queued events since the last flush, then clear the queue.
   * Called once per simulation tick by the GameLoop — not by the renderer.
   */
  flush(): InputEvent[] {
    if (this.queue.length === 0) return [];

    const events  = this.queue;
    this.queue    = [];
    return events;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Keys the game consumes — preventDefault is called for these
 * to stop the browser from scrolling, navigating, or doing other things.
 */
const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'KeyE', 'KeyF',
  'ShiftLeft', 'ShiftRight',
  'Space',
  'Digit1', 'Digit2', 'Digit3',
]);

function isGameKey(code: string): boolean {
  return GAME_KEYS.has(code);
}