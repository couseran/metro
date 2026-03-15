// src/lib/game/rendering/sprites/characters/adam.ts
//
// All visual data specific to the Adam character:
//   - AdamAnimationName   — the set of valid animation identifiers
//   - ADAM_ANIMATIONS     — frame sequences, playback rates, and per-animation overrides
//   - ADAM_SHEET          — spritesheet path, default frame size, and row mapping
//
// Limezu "Modern Interior" — Adam_16x16.png
//
// Sheet:   384 × 224 px
// Frame:   16 × 32 px (default) | 32 × 32 px (sit_1, sit_2) | 16 × 16 px (phone_sit_3)
// Grid:    24 cols × 7 rows
//
// Row layout:
//   Row 0 │ idle_static  │ 4 cols   │ 1 frame × 4 directions  [left][up][right][down]
//   Row 1 │ idle_anim    │ 24 cols  │ 4 directions × 6 frames [left×6][up×6][right×6][down×6]
//   Row 2 │ run          │ 24 cols  │ same col layout as idle_anim
//   Row 3 │ sit_1        │ 24 cols  │ 2 angles × 6 frames @ 32px [right×6][left×6]
//   Row 4 │ sit_2        │ 24 cols  │ 2 angles × 6 frames @ 32px [right×6][left×6]
//   Row 5 │ sit_3        │ 12 cols  │ 2 angles × 6 frames @ 16px [right×6][left×6]
//   Row 6 │ phone        │ 9 cols   │ open sequence (3) + looking idle (6)

import type { UniformSheetConfig } from '../SpriteSheet';
import type { AnimationDefinition } from '../AnimationController';

// ─── Animation names ──────────────────────────────────────────────────────────

/**
 * All valid animation identifiers for the Adam character.
 * Naming convention: "<state>_<qualifier>" where qualifier is a direction
 * (down/up/left/right), a sitting angle (right/left), or a phase (open/idle).
 */
export type AdamAnimationName =
    | 'idle_static'
    | 'idle_down'    | 'idle_up'    | 'idle_left'    | 'idle_right'
    | 'run_down'     | 'run_up'     | 'run_left'     | 'run_right'
    | 'sit_1_right'  | 'sit_1_left'
    | 'sit_2_right'  | 'sit_2_left'
    | 'sit_3_right'  | 'sit_3_left'
    | 'phone_open'   | 'phone_idle';

// ─── Animation definitions ────────────────────────────────────────────────────

/**
 * Frame sequences and playback config for every Adam animation.
 * Frame values are column indices on the spritesheet row (not pixel offsets).
 * Resolved to pixel rects by getSourceRect() in SpriteSheet.ts.
 */
export const ADAM_ANIMATIONS: Record<AdamAnimationName, AnimationDefinition> = {
  // Static idle — 1 frame, direction baked into col offset
  idle_static:  { frames: [0],                         fps: 1,  loop: true },

  // Idle anim — 6 frames per direction, col offset encodes direction
  idle_left:    { frames: [12, 13, 14, 15, 16, 17],   fps: 6,  loop: true },
  idle_up:      { frames: [6, 7, 8, 9, 10, 11],       fps: 6,  loop: true },
  idle_right:   { frames: [0, 1, 2, 3, 4, 5],         fps: 6,  loop: true },
  idle_down:    { frames: [18, 19, 20, 21, 22, 23],   fps: 6,  loop: true },

  // Run — same col layout as idle
  run_left:     { frames: [12, 13, 14, 15, 16, 17],   fps: 10, loop: true },
  run_up:       { frames: [6, 7, 8, 9, 10, 11],       fps: 10, loop: true },
  run_right:    { frames: [0, 1, 2, 3, 4, 5],         fps: 10, loop: true },
  run_down:     { frames: [18, 19, 20, 21, 22, 23],   fps: 10, loop: true },

  // Sit variants — right angle first; 32px wide frames occupy half the row each
  sit_1_right:  { frames: [0, 1, 2, 3, 4, 5],         fps: 6,  loop: true, frameWidth: 32 },
  sit_1_left:   { frames: [6, 7, 8, 9, 10, 11],       fps: 6,  loop: true, frameWidth: 32 },
  sit_2_right:  { frames: [0, 1, 2, 3, 4, 5],         fps: 6,  loop: true, frameWidth: 32 },
  sit_2_left:   { frames: [6, 7, 8, 9, 10, 11],       fps: 6,  loop: true, frameWidth: 32 },
  sit_3_right:  { frames: [0, 1, 2, 3, 4, 5],         fps: 6,  loop: true, frameWidth: 16 },
  sit_3_left:   { frames: [6, 7, 8, 9, 10, 11],       fps: 6,  loop: true, frameWidth: 16 },

  // Phone — 3-frame open sequence (loop: false → parks on last frame) then 6-frame looping idle
  phone_open:   { frames: [0, 1, 2],                   fps: 8,  loop: false },
  phone_idle:   { frames: [3, 4, 5, 6, 7, 8],         fps: 6,  loop: true },
};

// ─── Sheet config ─────────────────────────────────────────────────────────────

/**
 * Spritesheet layout for Adam_16x16.png.
 * Each entry in `rows` maps an AdamAnimationName to the zero-based row it occupies.
 * Multiple animation names may share a row when the column offset distinguishes them
 * (e.g. idle_left and idle_right both live on row 1).
 */
export const ADAM_SHEET: UniformSheetConfig = {
  src:         '/sprites/characters/Adam_16x16.png',
  frameWidth:  16,
  frameHeight: 32,

  rows: {
    idle_static:  0,

    idle_left:    1,
    idle_up:      1,
    idle_right:   1,
    idle_down:    1,

    run_left:     2,
    run_up:       2,
    run_right:    2,
    run_down:     2,

    sit_1_right:  3,
    sit_1_left:   3,

    sit_2_right:  4,
    sit_2_left:   4,

    sit_3_right:  5,
    sit_3_left:   5,

    phone_open:   6,
    phone_idle:   6,
  },
};
