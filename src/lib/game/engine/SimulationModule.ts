// src/lib/game/engine/SimulationModule.ts

import type { InputEvent }   from './InputModule';
import type { WorldState, CameraState } from '../types/world';
import type { PropState }    from '../types/props';
import type { EntityId }     from '../types/primitives';
import { createInitialWorld, SPAWN_POINT }    from '../world/WorldFactory';
import { resolveMovement, PLAYER_HITBOX }    from '../world/TileCollision';
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
  player:           PlayerState;
  tick:             number;       // monotonic tick counter
  timestamp:        number;       // accumulated simulation time in ms

  world:            WorldState;
  props:            Map<EntityId, PropState>;
  /**
   * Spatial index: "tx,ty" → array of prop EntityIds at that tile.
   * Rebuilt when props change — used for fast collision and interaction queries.
   */
  propSpatialIndex: Map<string, EntityId[]>;
  /**
   * Camera position in world-space pixels — tracks the player.
   * Kept in GameState so it is deterministic, snapshotted for interpolation,
   * and serializable alongside the rest of the simulation.
   */
  camera:           CameraState;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Shallow-clone GameState for the prevState snapshot used by the renderer.
 * Only fields that change every tick need deep cloning:
 *   - player — moves and animates each tick
 *   - camera — follows the player each tick
 * world and props are stable between ticks and do not need interpolation,
 * so the renderer safely shares the same reference from both snapshots.
 */
function cloneState(state: GameState): GameState {
  return {
    ...state,
    player: { ...state.player, animation: { ...state.player.animation } },
    camera: { ...state.camera },
  };
}

// ─── Camera ───────────────────────────────────────────────────────────────────

/**
 * Snap camera to player position — instant follow, no lag.
 * Replace with a lerp here when a specific camera-feel is desired.
 */
function tickCamera(camera: CameraState, player: PlayerState): CameraState {
  return { ...camera, x: player.x, y: player.y };
}

// ─── Input → Velocity mapping ─────────────────────────────────────────────────

const MOVE_SPEED = 55; // px/sec

interface MovementVector { vx: number; vy: number; }

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
  // Separate from the event queue: events are momentary, heldKeys is continuous.
  private heldKeys: Set<string> = new Set();

  constructor() {
    const player = createPlayer(SPAWN_POINT.x, SPAWN_POINT.y);

    const initial: GameState = {
      player,
      tick:             0,
      timestamp:        0,
      world:            createInitialWorld(),
      props:            new Map(),
      propSpatialIndex: new Map(),
      camera:           { x: player.x, y: player.y, zoom: 1 },
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
   *   3. Apply continuous input (movement)
   *   4. Tick entities
   *   5. Update camera
   *
   * Given identical state + inputs, this always produces identical output. (determinism)
   *
   * @param dt     - Fixed timestep in ms (typically 16.67ms — see GameLoop)
   * @param inputs - Input events flushed from InputModule for this tick
   */
  tick(dt: number, inputs: InputEvent[]): void {
    this.prevState = cloneState(this.state);

    this.applyInputEvents(inputs);
    this.applyMovement();

    let { player } = this.state;
    player = tickPlayer(player, dt);

    // Integrate velocity and resolve tile collisions on each axis independently.
    // Done here (not inside tickPlayer) so collision has access to the full world state.
    const { x, y } = resolveMovement(
        player.x, player.y,
        player.vx, player.vy,
        PLAYER_HITBOX,
        this.state.world,
        dt,
    );
    player = { ...player, x, y };

    const camera = tickCamera(this.state.camera, player);

    this.state = {
      ...this.state,
      player,
      camera,
      tick:      this.state.tick + 1,
      timestamp: this.state.timestamp + dt,
    };
  }

  // ─── Input processing ────────────────────────────────────────────────────────

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
        player = player.activity === 'phone' ? closePhone(player) : openPhone(player);
        break;

      case 'KeyE':
        // Stand up if seated; future: else interact with world
        if (
            player.activity === 'sitting_1' ||
            player.activity === 'sitting_2' ||
            player.activity === 'sitting_3'
        ) {
          player = standUp(player);
        }
        break;

      // Temporary sit tests — remove when world interaction is implemented
      case 'Digit1': player = sit(player, 'sitting_1', 'right'); break;
      case 'Digit2': player = sit(player, 'sitting_2', 'left');  break;
      case 'Digit3': player = sit(player, 'sitting_3', 'left');  break;
    }

    this.state = { ...this.state, player };
  }

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
