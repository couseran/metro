// src/lib/game/rendering/props/PropSpriteConfig.ts
//
// Sprite configuration types for world props.
//
// Frame resolution order (first match wins for each prop instance):
//   1. rotationFrames[prop.rotation]   — rotation-specific sprite (e.g. chair facing N/S/E/W)
//   2. stateFrames[prop.stateId]       — state-specific sprite (door open/closed, fire lit/unlit)
//   3. variantFrames[prop.variant]     — autotile or style variant (fence bitmask, color variant)
//   4. frames                          — default sprite (always required)
//
// For resizable props (PropDefinition.spriteLayout === 'tiled_repeat') the renderer
// uses tiledRepeat instead of the frame arrays to draw the stretched sprite.

// ─── Frame ────────────────────────────────────────────────────────────────────

/**
 * A single visual frame for a prop.
 *
 * The prop is drawn at its tile coordinate, offset by the anchor so the sprite
 * aligns correctly with the tile grid regardless of sprite dimensions.
 *
 * Draw position:
 *   dstX = prop.x * TILE_SIZE - anchorX * sw
 *   dstY = prop.y * TILE_SIZE - anchorY * sh
 */
export interface PropSpriteFrame {
  /** Image path. Must be declared in the AssetLoader manifest. */
  src: string;
  /** Source X in pixels on the spritesheet. */
  sx: number;
  /** Source Y in pixels on the spritesheet. */
  sy: number;
  /** Source width in pixels. May span multiple tiles (e.g. a 1×2 tall prop = 16×32). */
  sw: number;
  /** Source height in pixels. */
  sh: number;
  /**
   * Horizontal anchor as a fraction of sprite width [0.0 → 1.0].
   * 0.0 = left edge of sprite aligned to tile left.
   * 0.5 = sprite centered on the tile (most common for upright props).
   * For multi-tile props use 0.0 to left-align to the origin tile.
   */
  anchorX: number;
  /**
   * Vertical anchor as a fraction of sprite height [0.0 → 1.0].
   * 0.0 = top edge of sprite at the tile's top pixel.
   * 1.0 = bottom edge of sprite at the tile's top pixel (sprite hangs above the tile).
   * For props that sit on the ground use 1.0 so the base of the sprite is on the tile.
   * For floor props (carpet) use 0.0 so the sprite starts at the origin tile's top.
   */
  anchorY: number;
}

// ─── Tiled repeat config ──────────────────────────────────────────────────────

/**
 * Sprite configuration for horizontally resizable props (carpets, hedges, fences).
 *
 * The prop is drawn as three sections, all the same height, tiled left-to-right:
 *   [left cap] [middle × (width - 2)] [right cap]
 *
 * Each section is exactly sectionWidth pixels wide.  The total drawn width is
 *   prop.width * sectionWidth pixels.
 *
 * For a 2-tile-wide prop (default size): only left cap + right cap are drawn.
 * For a 3-tile-wide prop: left + 1 middle + right.
 * And so on.
 *
 * All three sections share the same source image (src) and the same row in
 * that image (sy / totalHeight).
 */
export interface TiledRepeatConfig {
  /** Source image path. Must be declared in the AssetLoader manifest. */
  src: string;
  /** Source X of the left-cap tile. */
  leftSx: number;
  /** Source Y of the left-cap tile (same row as all sections). */
  sy: number;
  /** Source X of the middle tile (repeated for width > 2). */
  midSx: number;
  /** Source X of the right-cap tile. */
  rightSx: number;
  /** Width of each section in pixels. Typically TILE_SIZE = 16. */
  sectionWidth: number;
  /** Full height of every section in pixels (defaultHeight × TILE_SIZE). */
  totalHeight: number;
}

// ─── Prop sprite config ───────────────────────────────────────────────────────

/**
 * Complete visual configuration for one prop type.
 *
 * Registered in PropSpriteRegistry by the same type string used in PropDefinition.
 */
export interface PropSpriteConfig {
  /**
   * Default frame set — the fallback when no more-specific override matches.
   * Required; must contain at least one frame.
   */
  frames: [PropSpriteFrame, ...PropSpriteFrame[]];

  /**
   * Playback speed in frames-per-second for animated props.
   * Ignored when frames.length === 1 or animationMode is null.
   */
  fps?: number;

  /** Whether the animation loops. Defaults to true. */
  loop?: boolean;

  /**
   * Rotation-specific frame overrides.
   * Key: prop.rotation (0=0°, 1=90°CW, 2=180°, 3=270°CW).
   *
   * Use for props with distinct visual orientations (chairs, desks, stairs).
   * Absent rotation values fall through to stateFrames or frames.
   */
  rotationFrames?: Partial<Record<0 | 1 | 2 | 3, [PropSpriteFrame, ...PropSpriteFrame[]]>>;

  /**
   * State-specific frame overrides, keyed by PropState.stateId.
   *
   * Examples:
   *   stateFrames: { open: [...], closed: [...] }   // door
   *   stateFrames: { lit: [...], unlit: [...] }      // campfire / torch
   *   stateFrames: { seedling: [...], mature: [...] } // plant
   *
   * Takes lower precedence than rotationFrames.
   * The frame array may have multiple entries for animated states.
   */
  stateFrames?: Partial<Record<string, [PropSpriteFrame, ...PropSpriteFrame[]]>>;

  /**
   * Autotile / style-variant frame overrides.
   * Key: prop.variant (4-neighbour bitmask 0–15 for connecting props, or style index).
   *
   * Use for fence/hedge connection sprites, or color variants of the same prop.
   * Takes lower precedence than rotationFrames and stateFrames.
   */
  variantFrames?: Partial<Record<number, [PropSpriteFrame, ...PropSpriteFrame[]]>>;

  /**
   * Configuration for horizontally resizable props (spriteLayout='tiled_repeat').
   * When present, the renderer uses the tiled-repeat drawing path instead of
   * the single-frame path.  The frame arrays above are still used as a fallback
   * for tools / editor previews that don't support tiled rendering.
   */
  tiledRepeat?: TiledRepeatConfig;
}

// ─── Frame resolution helper ──────────────────────────────────────────────────

/**
 * Resolve the active frame set for a prop instance.
 *
 * Resolution order (first match wins):
 *   1. rotationFrames[rotation]
 *   2. stateFrames[stateId]
 *   3. variantFrames[variant]
 *   4. frames (default)
 *
 * The caller is responsible for indexing into the returned array using
 * (prop.animFrame % frames.length) for animated props.
 */
export function resolveActiveFrames(
    config:   PropSpriteConfig,
    rotation: 0 | 1 | 2 | 3,
    stateId:  string,
    variant:  number,
): [PropSpriteFrame, ...PropSpriteFrame[]] {
    return (
        config.rotationFrames?.[rotation] ??
        config.stateFrames?.[stateId]     ??
        config.variantFrames?.[variant]   ??
        config.frames
    );
}
