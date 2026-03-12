// src/lib/game/engine/SimulationModule.ts

import type { InputEvent } from './InputModule.ts';
import {
  type PlayerState,
  createPlayer,
  tickPlayer,
  setMovement,
  sit,
  standUp,
  openPhone,
  closePhone,
} from '../entities/Player';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameState {
  player: PlayerState;
  tick: number;       // monotonic tick counter — useful for determinism checks & replays
  timestamp: number;  // accumulated simulation time in ms
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Shallow-clone GameState for prevState snapshot.
 * Player is the only entity for now — extend this as entities are added.
 * We avoid a full deep clone here for performance; each entity is responsible
 * for returning new objects on mutation (see tickPlayer).
 */
function cloneState(state: GameState): GameState {
  return {
    ...state,
    player: { ...state.player, animation: { ...state.player.animation } },
  };
}

// ─── Input → Velocity mapping ─────────────────────────────────────────────────

const MOVE_SPEED = 55;  // px/sec

interface MovementVector {
  vx: number;
  vy: number;
}

/**
 * Derive a movement vector from the current set of held keys.
 * Normalizes diagonal movement so speed is consistent in all directions.
 */
function resolveMovementVector(heldKeys: Set<string>, speed: number): MovementVector {
  let vx = 0;
  let vy = 0;

  if (heldKeys.has('ArrowLeft')  || heldKeys.has('KeyA')) vx -= 1;
  if (heldKeys.has('ArrowRight') || heldKeys.has('KeyD')) vx += 1;
  if (heldKeys.has('ArrowUp')    || heldKeys.has('KeyW')) vy -= 1;
  if (heldKeys.has('ArrowDown')  || heldKeys.has('KeyS')) vy += 1;

  // Normalize diagonal — without this, diagonal movement is ~41% faster
  if (vx !== 0 && vy !== 0) {
    const INV_SQRT2 = 0.7071067811865476;
    vx *= INV_SQRT2;
    vy *= INV_SQRT2;
  }

  return { vx: vx * speed, vy: vy * speed };
}

// ─── SimulationModule ─────────────────────────────────────────────────────────

export class SimulationModule {
  state:     GameState;
  prevState: GameState;

  // Tracks which keys are currently held — rebuilt each tick from the input queue.
  // This is separate from the event queue: events are momentary, heldKeys is continuous.
  private heldKeys: Set<string> = new Set();

  constructor() {
    const initial: GameState = {
      player:    createPlayer(100, 100),
      tick:      0,
      timestamp: 0,
    };

    this.state     = initial;
    this.prevState = cloneState(initial);
  }

  // ─── Main tick ──────────────────────────────────────────────────────────────

  /**
   * Advance the simulation by one fixed timestep.
   * Called exclusively by the GameLoop — never by the renderer or UI.
   *
   * Order of operations:
   *   1. Snapshot previous state for renderer interpolation
   *   2. Process input events (update heldKeys, fire one-shot actions)
   *   3. Apply continuous input (movement) to player
   *   4. Tick all entities
   *
   * Given identical state + inputs, this always produces identical output. (determinism)
   *
   * @param dt     - Fixed timestep in ms (typically 16.67 — see GameLoop)
   * @param inputs - Input events flushed from InputModule for this tick
   */
  tick(dt: number, inputs: InputEvent[]): void {
    // 1. Snapshot — renderer interpolates between prevState and state
    this.prevState = cloneState(this.state);

    // 2. Process input events
    this.applyInputEvents(inputs);

    // 3. Apply continuous movement from held keys
    this.applyMovement();

    // 4. Tick entities
    let { player } = this.state;
    player = tickPlayer(player, dt);

    // 5. Commit new state
    this.state = {
      ...this.state,
      player,
      tick:      this.state.tick + 1,
      timestamp: this.state.timestamp + dt,
    };
  }

  // ─── Input processing ────────────────────────────────────────────────────────

  /**
   * Process the input event queue for this tick.
   * Separates continuous input (held keys) from one-shot actions (keypress).
   */
  private applyInputEvents(inputs: InputEvent[]): void {
    for (const event of inputs) {
      if (event.type === 'keydown') {
        this.heldKeys.add(event.key);
        this.handleKeyPress(event.key);
      } else if (event.type === 'keyup') {
        this.heldKeys.delete(event.key);
      }
    }
  }

  /**
   * One-shot key actions — fired once on keydown, not repeated while held.
   * Movement is NOT handled here — it's continuous and lives in applyMovement.
   */
  private handleKeyPress(key: string): void {
    let { player } = this.state;

    switch (key) {
      case 'KeyF':
        // Toggle phone
        if (player.activity === 'phone') {
          player = closePhone(player);
        } else {
          player = openPhone(player);
        }
        break;

      case 'KeyE':
        // Context-sensitive interact — stand up if seated, else interact with world
        if (
            player.activity === 'sitting_1' ||
            player.activity === 'sitting_2' ||
            player.activity === 'sitting_3'
        ) {
          player = standUp(player);
        }
        // Future: else { this.interactWithWorld(player); }
        break;

        // Sit for testing — remove when world interaction is implemented
      case 'Digit1':
        player = sit(player, 'sitting_1', 'right');
        break;
      case 'Digit2':
        player = sit(player, 'sitting_2', 'left');
        break;
      case 'Digit3':
        player = sit(player, 'sitting_3', 'left');
        break;
    }

    this.state = { ...this.state, player };
  }

  /**
   * Apply continuous movement from currently held keys.
   */
  private applyMovement(): void {
    let { player } = this.state;

    if (
        player.activity === 'sitting_1' ||
        player.activity === 'sitting_2' ||
        player.activity === 'sitting_3' ||
        player.activity === 'phone'
    ) return;

    const { vx, vy } = resolveMovementVector(this.heldKeys, MOVE_SPEED);
    player = setMovement(player, vx, vy);

    this.state = { ...this.state, player };
  }
}