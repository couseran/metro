// src/lib/game/sprites/adam.ts
//
// Limezu "Modern Interior" — Adam character spritesheet config.
//
// Sheet:     384×224px
// Frame:     16×32px (default) | 32×32px (sit animations — character is wider when seated)
// Grid:      24 cols × 7 rows
//
// Row layout (each row spans the full 384px width):
//
//   Row 0 │ idle_static   │ 4 cols  │ 1 frame × 4 directions
//         │               │         │ [left][up][right][down]
//   Row 1 │ idle_anim     │ 24 cols │ 4 directions × 6 frames
//         │               │         │ [left×6][up×6][right×6][down×6]
//   Row 2 │ run           │ 24 cols │ 4 directions × 6 frames
//         │               │         │ [left×6][up×6][right×6][down×6]
//   Row 3 │ sit_1         │ 24 cols │ 2 angles × 6 frames @ 32px/frame
//         │               │         │ [right×6][left×6]
//   Row 4 │ sit_2         │ 24 cols │ 2 angles × 6 frames @ 32px/frame
//         │               │         │ [right×6][left×6]
//   Row 5 │ sit_3         │ 12 cols │ 2 angles × 6 frames @ 16px/frame
//         │               │         │ [right×6][left×6]
//   Row 6 │ phone         │ 9 cols  │ open sequence (3) + looking idle (6)
//         │               │         │ [open×3][idle×6]

import type { UniformSheetConfig } from '../engine/SpriteSheet';

export const ADAM_SHEET: UniformSheetConfig = {
  src:         '/sprites/characters/Adam_16x16.png',
  frameWidth:  16,  // default — overridden per-animation for sit_1 and sit_2
  frameHeight: 32,  // consistent across all rows

  rows: {
    // ── Static idle — 1 frame per direction, col = direction index
    idle_static:  0,

    // ── Idle anim — direction encoded as absolute col offset in ANIMATIONS frames[]
    idle_left:    1,
    idle_up:      1,
    idle_right:   1,
    idle_down:    1,

    // ── Run — same col layout as idle_anim
    run_left:     2,
    run_up:       2,
    run_right:    2,
    run_down:     2,

    // ── Sit 1 — 32px wide frames, right angle first
    sit_1_right:  3,
    sit_1_left:   3,

    // ── Sit 2 — 32px wide frames, right angle first
    sit_2_right:  4,
    sit_2_left:   4,

    // ── Sit 3 — 16px wide frames, right angle first
    sit_3_right:  5,
    sit_3_left:   5,

    // ── Phone — open sequence + looping idle, same row
    phone_open:   6,
    phone_idle:   6,
  },
};