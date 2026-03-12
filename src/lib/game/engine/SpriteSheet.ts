// src/lib/game/engine/SpriteSheet.ts
import type { AnimationState } from './AnimationController';
import { ANIMATIONS } from './AnimationController';

// ─── Uniform Grid ───────────────────────────────────────────────────

export interface UniformSheetConfig {
  src: string;
  frameWidth: number;
  frameHeight: number;
  rows: Partial<Record<string, number>>; // animation name → row index
}

export type SpritesheetConfig = UniformSheetConfig;

// ─── Shared output ────────────────────────────────────────────────────────────

export interface SourceRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Pure function — given animation state + sheet config, return drawImage source rect.
 * Renderer calls this. No mutation, no side effects.
 */
export function getSourceRect(
    animState: AnimationState,
    sheet: UniformSheetConfig
): SourceRect {
  const anim = ANIMATIONS[animState.current];

  // Per-animation frame size takes priority over sheet default
  const fw = anim.frameWidth  ?? sheet.frameWidth;
  const fh = anim.frameHeight ?? sheet.frameHeight;

  const col = anim.frames[animState.frameIndex];
  const row = sheet.rows[animState.current] ?? 0;

  return {
    sx: col * fw,
    sy: row * fh,
    sw: fw,
    sh: fh,
  };
}