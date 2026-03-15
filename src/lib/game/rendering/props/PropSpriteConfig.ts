// src/lib/game/rendering/props/PropSpriteConfig.ts

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single visual frame for a prop.
 * Props are drawn at their tile coordinate, adjusted by the anchor point so the
 * sprite aligns correctly with the tile grid regardless of sprite dimensions.
 */
export interface PropSpriteFrame {
  /** Image path. Must be declared in the AssetLoader manifest. */
  src: string;
  /** Source X in pixels on the spritesheet. */
  sx: number;
  /** Source Y in pixels on the spritesheet. */
  sy: number;
  /** Source width in pixels. May span multiple tiles (e.g. a tall tree is 16×32). */
  sw: number;
  /** Source height in pixels. */
  sh: number;
  /**
   * Horizontal anchor as a fraction of sprite width [0.0 → 1.0].
   * The prop's tile X maps to: drawX = tileX * TILE_SIZE - anchorX * sw
   * 0.0 = left-align sprite to tile. 0.5 = center (most common).
   */
  anchorX: number;
  /**
   * Vertical anchor as a fraction of sprite height [0.0 → 1.0].
   * 0.0 = top-align. 1.0 = bottom of sprite sits on top of the tile (common for
   * upright props like trees, chests, and signs that occupy tile rows above their base).
   */
  anchorY: number;
}

/**
 * Visual configuration for a prop kind.
 * Static props use a single frame. Animated props (campfire, water, etc.) use multiple.
 */
export interface PropSpriteConfig {
  /** At least one frame is required. Single-element array for static props. */
  frames: [PropSpriteFrame, ...PropSpriteFrame[]];
  /** Playback speed in fps for animated props. Ignored when frames.length === 1. */
  fps?: number;
  /** Whether the animation loops. Defaults to true. */
  loop?: boolean;
}
