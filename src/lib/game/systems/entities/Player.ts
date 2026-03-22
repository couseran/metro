// src/lib/game/systems/entities/Player.ts

import type { AnimationState }       from '$lib/game/rendering/sprites/AnimationController';
import type { AdamAnimationName }    from '$lib/game/content/characters/adam';
import type { InventoryState }       from '$lib/game/types/inventory';
import { tickAnimation, transitionAnimation } from '$lib/game/rendering/sprites/AnimationController';
import { ADAM_ANIMATIONS }           from '$lib/game/content/characters/adam';
import { createInventory }           from '$lib/game/systems/inventory/InventorySystem';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Direction = 'down' | 'up' | 'left' | 'right';

export type PlayerActivity =
    | 'idle'
    | 'running'
    | 'sitting_1'
    | 'sitting_2'
    | 'sitting_3'
    | 'phone';

export interface PlayerState {
  // Position & movement
  x:         number;
  y:         number;
  vx:        number;
  vy:        number;
  direction: Direction;

  // Activity
  activity: PlayerActivity;

  /** Which angle the player faces when seated. */
  sitAngle: 'right' | 'left';

  /** True once the phone_open animation has finished — switches to phone_idle. */
  phoneReady: boolean;

  /** Animation playback state. Owned by simulation, read by renderer. */
  animation: AnimationState;

  /** Item storage — 4 columns × 3 rows = 12 slots. */
  inventory: InventoryState;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createPlayer(x: number, y: number): PlayerState {
  return {
    x,
    y,
    vx:         0,
    vy:         0,
    direction:  'down',
    activity:   'idle',
    sitAngle:   'right',
    phoneReady: false,
    animation:  { current: 'idle_down', frameIndex: 0, timer: 0 },
    inventory:  createInventory(6, 3),
  };
}

// ─── Animation resolver ───────────────────────────────────────────────────────

/**
 * Derive the correct animation name from the current player state.
 * Pure function — no side effects.
 */
function resolveAnimation(player: PlayerState): AdamAnimationName {
  const { activity, direction, sitAngle, phoneReady } = player;

  switch (activity) {
    case 'running':
      return `run_${direction}` as AdamAnimationName;

    case 'sitting_1':
      return `sit_1_${sitAngle}` as AdamAnimationName;

    case 'sitting_2':
      return `sit_2_${sitAngle}` as AdamAnimationName;

    case 'sitting_3':
      return `sit_3_${sitAngle}` as AdamAnimationName;

    case 'phone':
      // Play open sequence first, then transition to the looping idle
      return phoneReady ? 'phone_idle' : 'phone_open';

    case 'idle':
    default:
      return `idle_${direction}` as AdamAnimationName;
  }
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

/**
 * Advance player state by one simulation tick.
 * Called by SimulationModule — never by the renderer.
 *
 * @param player - Current immutable player state
 * @param dt     - Delta time in ms (fixed timestep, typically 16.67ms)
 * @returns        New player state — previous state is never mutated
 */
export function tickPlayer(player: PlayerState, dt: number): PlayerState {
  // 1. Resolve which animation should be playing
  const targetAnim = resolveAnimation(player);

  // 2. Transition if animation changed, then advance the timer
  const afterTransition = transitionAnimation(player.animation, targetAnim);
  const animation       = tickAnimation(afterTransition, dt, ADAM_ANIMATIONS);

  // 3. Detect phone_open finishing — transition to phone_idle next tick.
  //    loop:false animations park on their last frame, so we check frameIndex.
  let phoneReady = player.phoneReady;
  if (player.activity === 'phone' && !phoneReady) {
    const PHONE_OPEN_FRAMES = 3;
    if (animation.frameIndex >= PHONE_OPEN_FRAMES - 1) {
      phoneReady = true;
    }
  }

  // Note: position integration is performed by SimulationModule after this function
  // returns, so that tile collision can be resolved before the new position is committed.

  return { ...player, phoneReady, animation };
}

// ─── State transitions ────────────────────────────────────────────────────────
// Called by SimulationModule on input or world events. Each returns new state.

export function setMovement(player: PlayerState, vx: number, vy: number): PlayerState {
  if (vx === 0 && vy === 0) {
    return { ...player, vx: 0, vy: 0, activity: 'idle' };
  }

  // Derive facing direction from dominant velocity axis
  const direction: Direction =
      Math.abs(vx) >= Math.abs(vy)
          ? vx > 0 ? 'right' : 'left'
          : vy > 0 ? 'down'  : 'up';

  return { ...player, vx, vy, direction, activity: 'running' };
}

export function sit(
    player:  PlayerState,
    variant: 'sitting_1' | 'sitting_2' | 'sitting_3',
    angle:   'right' | 'left',
): PlayerState {
  return { ...player, vx: 0, vy: 0, activity: variant, sitAngle: angle };
}

export function standUp(player: PlayerState): PlayerState {
  return { ...player, activity: 'idle' };
}

export function openPhone(player: PlayerState): PlayerState {
  if (player.activity === 'phone') return player;
  return { ...player, vx: 0, vy: 0, activity: 'phone', phoneReady: false };
}

export function closePhone(player: PlayerState): PlayerState {
  if (player.activity !== 'phone') return player;
  return { ...player, activity: 'idle', phoneReady: false };
}
