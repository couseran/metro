// src/lib/game/rendering/sprites/AnimationController.ts
//
// Generic animation playback — no character-specific data.
// Animation names and frame sequences for a specific character live alongside
// that character's sprite sheet (e.g. rendering/sprites/characters/adam.ts).

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single animation clip definition.
 * `frames` are column indices on the spritesheet row — resolved to pixel rects
 * by getSourceRect() in SpriteSheet.ts.
 */
export interface AnimationDefinition {
  /**
   * Ordered list of column indices on the spritesheet row.
   * Not pixel offsets — multiplied by frameWidth inside getSourceRect().
   */
  frames:       number[];
  /** Playback speed in frames per second. */
  fps:          number;
  /**
   * Whether the animation loops back to frame 0 on completion.
   * false → parks on the last frame (used for one-shot sequences like phone_open).
   */
  loop:         boolean;
  /** Overrides the sheet's default frameWidth for this animation (e.g. sit_1 uses 32px). */
  frameWidth?:  number;
  /** Overrides the sheet's default frameHeight for this animation. */
  frameHeight?: number;
}

/**
 * Runtime animation playback state for a single entity.
 * Owned and updated by the simulation — never mutated by the renderer.
 * `current` is typed as string so AnimationController is character-agnostic;
 * per-character files (e.g. characters/adam.ts) narrow it to a specific union.
 */
export interface AnimationState {
  /** The currently active animation clip name. */
  current:    string;
  /** Index into the animation's frames[] array. Not a raw column — use getSourceRect. */
  frameIndex: number;
  /** Milliseconds accumulated since the last frame advance. Resets each frame step. */
  timer:      number;
}

// ─── Functions ────────────────────────────────────────────────────────────────

/**
 * Advance animation timer by dt milliseconds.
 * Pure function — returns new state, never mutates.
 * Called by the simulation tick (e.g. tickPlayer), never by the renderer.
 *
 * Uses a while loop so a large dt (lag spike) still advances by the correct
 * number of frames rather than skipping ahead incorrectly.
 *
 * @param state      - Current animation state
 * @param dt         - Delta time in ms
 * @param animations - The character's animation definition map
 */
export function tickAnimation(
    state:      AnimationState,
    dt:         number,
    animations: Record<string, AnimationDefinition>,
): AnimationState {
  const anim = animations[state.current];
  if (!anim) return state; // unknown animation name — no-op

  const frameDuration = 1000 / anim.fps;
  let timer      = state.timer + dt;
  let frameIndex = state.frameIndex;

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
 * Switch to a different animation clip, resetting timer and frame to zero.
 * No-op if the requested animation is already playing — avoids restarting mid-clip.
 *
 * @param state - Current animation state
 * @param next  - Name of the animation to switch to
 */
export function transitionAnimation(
    state: AnimationState,
    next:  string,
): AnimationState {
  if (state.current === next) return state;
  return { current: next, frameIndex: 0, timer: 0 };
}
