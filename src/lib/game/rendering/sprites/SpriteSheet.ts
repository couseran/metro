// src/lib/game/rendering/sprites/SpriteSheet.ts

import type { AnimationState, AnimationDefinition } from './AnimationController';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Configuration for a spritesheet laid out on a uniform tile grid.
 * Every frame is the same size (frameWidth × frameHeight), except where an
 * AnimationDefinition overrides the dimensions for a specific clip.
 */
export interface UniformSheetConfig {
  /** Path to the image. Must be declared in the AssetLoader manifest. */
  src:         string;
  /** Default frame width in pixels. Animations may override via AnimationDefinition. */
  frameWidth:  number;
  /** Default frame height in pixels. */
  frameHeight: number;
  /**
   * Maps each animation name to its zero-based row index on the sheet.
   * Multiple names may share a row when the column offset in ANIMATIONS distinguishes them.
   * Missing keys default to row 0.
   */
  rows: Partial<Record<string, number>>;
}

export type SpritesheetConfig = UniformSheetConfig;

/**
 * Pixel-space source rectangle passed directly to ctx.drawImage as source arguments.
 */
export interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Compute the ctx.drawImage source rect from current animation state and sheet config.
 * Pure function — no mutation, no side effects. Called once per entity per render frame.
 *
 * Resolution order:
 *   1. Row   — sheet.rows[animState.current]
 *   2. Col   — animations[animState.current].frames[frameIndex]
 *   3. Size  — AnimationDefinition override if set, otherwise sheet defaults
 *
 * @param animState  - Current animation playback state
 * @param sheet      - The character's spritesheet config
 * @param animations - The character's animation definition map
 */
export function getSourceRect(
    animState:  AnimationState,
    sheet:      UniformSheetConfig,
    animations: Record<string, AnimationDefinition>,
): SourceRect {
  const anim = animations[animState.current];
  if (!anim) return { sx: 0, sy: 0, sw: sheet.frameWidth, sh: sheet.frameHeight };

  const fw  = anim.frameWidth  ?? sheet.frameWidth;
  const fh  = anim.frameHeight ?? sheet.frameHeight;
  const col = anim.frames[animState.frameIndex];
  const row = sheet.rows[animState.current] ?? 0;

  return {
    sx: col * fw,
    sy: row * fh,
    sw: fw,
    sh: fh,
  };
}
