// src/lib/game/engine/AnimationController.ts

export interface AnimationDefinition {
  frames: number[];
  fps: number;
  loop: boolean;
  frameWidth?: number;   // overrides sheet default when set
  frameHeight?: number;  // overrides sheet default when set
}

export type AnimationName =
    | 'idle_static'
    | 'idle_down'    | 'idle_up'    | 'idle_left'    | 'idle_right'
    | 'run_down'     | 'run_up'     | 'run_left'     | 'run_right'
    | 'sit_1_right'  | 'sit_1_left'
    | 'sit_2_right'  | 'sit_2_left'
    | 'sit_3_right'  | 'sit_3_left'
    | 'phone_open'   | 'phone_idle';

export interface AnimationState {
  current: AnimationName;
  frameIndex: number;      // which frame in the animation's frames[] array
  timer: number;           // ms accumulated since last frame advance
}

export const ANIMATIONS: Record<AnimationName, AnimationDefinition> = {
  // Static idle — 1 frame, direction baked into col offset
  idle_static:   { frames: [0],                         fps: 1,  loop: true },

  // Idle anim — 6 frames per direction, col offset applied in getSourceRect
  idle_left:     { frames: [12, 13, 14, 15, 16, 17],   fps: 6,  loop: true },
  idle_up:       { frames: [6, 7, 8, 9, 10, 11],       fps: 6,  loop: true },
  idle_right:    { frames: [0, 1, 2, 3, 4, 5],         fps: 6,  loop: true },
  idle_down:     { frames: [18, 19, 20, 21, 22, 23],   fps: 6,  loop: true },

  // Run — same col layout as idle
  run_left:      { frames: [12, 13, 14, 15, 16, 17],   fps: 10, loop: true },
  run_up:        { frames: [6, 7, 8, 9, 10, 11],       fps: 10, loop: true },
  run_right:     { frames: [0, 1, 2, 3, 4, 5],         fps: 10, loop: true },
  run_down:      { frames: [18, 19, 20, 21, 22, 23],   fps: 10, loop: true },

  // Sit variants — right angle first
  sit_1_right:   { frames: [0,1,2,3,4,5],   fps: 6, loop: true,  frameWidth: 32 },
  sit_1_left:    { frames: [6,7,8,9,10,11], fps: 6, loop: true,  frameWidth: 32 },
  sit_2_right:   { frames: [0,1,2,3,4,5],   fps: 6, loop: true,  frameWidth: 32 },
  sit_2_left:    { frames: [6,7,8,9,10,11], fps: 6, loop: true,  frameWidth: 32 },
  sit_3_right:   { frames: [0,1,2,3,4,5],   fps: 6, loop: true,  frameWidth: 16 },
  sit_3_left:    { frames: [6,7,8,9,10,11], fps: 6, loop: true,  frameWidth: 16 },

  // Phone — 3 frame open sequence (play once) + 6 frame loop
  phone_open:    { frames: [0, 1, 2],                   fps: 8,  loop: false },
  phone_idle:    { frames: [3, 4, 5, 6, 7, 8],         fps: 6,  loop: true },
};


/**
 * Advance animation timer by dt (milliseconds).
 * Pure function — takes state in, returns new state out.
 * Lives in simulation tick, never in renderer.
 */
export function tickAnimation(state: AnimationState, dt: number): AnimationState {
  const anim = ANIMATIONS[state.current];
  const frameDuration = 1000 / anim.fps; // ms per frame

  let timer = state.timer + dt;
  let frameIndex = state.frameIndex;

  // Advance frames for every full frame-duration elapsed
  // Using a while loop handles cases where dt > one frame duration
  while (timer >= frameDuration) {
    timer -= frameDuration;
    frameIndex++;

    if (frameIndex >= anim.frames.length) {
      frameIndex = anim.loop ? 0 : anim.frames.length - 1;
    }
  }

  return { ...state, timer, frameIndex };
}

/**
 * Switch to a new animation. Resets timer and frame.
 * Call this when movement state changes (idle → walk, etc).
 */
export function transitionAnimation(
    state: AnimationState,
    next: AnimationName
): AnimationState {
  if (state.current === next) return state; // no-op if already playing
  return { current: next, frameIndex: 0, timer: 0 };
}