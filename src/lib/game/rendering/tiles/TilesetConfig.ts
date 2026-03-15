// src/lib/game/rendering/tiles/TilesetConfig.ts

// ─── Render layer ─────────────────────────────────────────────────────────────

/**
 * Which render pass a tile belongs to.
 *
 *   'ground' — Pass 1.  Flat surfaces (carpet, stone, sand …) that are always
 *              beneath every entity and prop.  Drawn in grid order with no
 *              depth-sort overhead.
 *
 *   'world'  — Pass 2.  Tiles with vertical extent that can visually overlap
 *              entities (walls, tall furniture …).  Collected into a WorldObject
 *              and Y-sorted together with props and entities.
 */
export type TileRenderLayer = 'ground' | 'world';

// ─── Tileset config ───────────────────────────────────────────────────────────

/**
 * Configuration for a tileset image laid out as a uniform grid.
 * Tiles are addressed by a flat index: index = row * tilesPerRow + column.
 */
export interface TilesetConfig {
  /** Path to the tileset image.  Must be declared in the AssetLoader manifest. */
  src: string;
  /** Width of each tile in pixels. */
  tileWidth: number;
  /** Height of each tile in pixels. */
  tileHeight: number;
  /** Number of tile columns in the tileset image.  Used to convert flat index → (col, row). */
  tilesPerRow: number;
  /**
   * Maps a TileTypeValue (integer from the TileType const) to a flat tile index
   * in the tileset image.  Absent tile types are not drawn (transparent).
   * Flat index = row * tilesPerRow + column.
   */
  tileMap: Partial<Record<number, number>>;
  /**
   * Per-tile size and draw-offset overrides for sprites that differ from the
   * standard tileWidth × tileHeight cell — e.g. walls whose sprite spans two
   * tile rows.  Only the fields that differ from the defaults need to be set.
   */
  tileOverrides?: Partial<Record<number, TileOverride>>;
  /**
   * Override the render pass for specific tile types.
   * Tile types absent from this map default to 'ground'.
   * Set a tile to 'world' when its sprite has vertical extent that can
   * overlap entities (e.g. walls, tall furniture).
   */
  tileRenderLayer?: Partial<Record<number, TileRenderLayer>>;
  /**
   * Variant-aware sprite map for autotiled tile types.
   *
   * Structure: tileType → (bitmask → flat sprite index).
   * The bitmask is the 4-neighbour value stored in ChunkState.variantCache
   * (see NeighborBit in Autotile.ts for the bit layout).
   *
   * If a tile type has an entry here, the renderer first checks
   * autoTileMap[tileType][variantBitmask] for the sprite index.
   * If that variant is not yet mapped (value is undefined), it falls back to
   * tileMap[tileType] so tiles always render something during development.
   *
   * Example — horizontal wall segment (east + west neighbours):
   *   autoTileMap: { [TileType.WALL]: { [NeighborBit.EAST | NeighborBit.WEST]: 42 } }
   */
  autoTileMap?: Partial<Record<number, Partial<Record<number, number>>>>;
}

// ─── Tile override ────────────────────────────────────────────────────────────

/**
 * Size and draw-offset override for a single tile type.
 * Applied on top of the tileset's tileWidth / tileHeight defaults.
 */
export interface TileOverride {
  /** Sprite width in pixels, if different from tileWidth. */
  width?: number;
  /** Sprite height in pixels, if different from tileHeight. */
  height?: number;
  /**
   * Vertical draw offset in pixels, applied after the tile's world-space Y.
   * Negative values shift the sprite upward — use this to make a tall sprite
   * (e.g. a 16×32 wall) visually anchor its bottom to the tile's ground row.
   */
  yOffset?: number;
}

// ─── Tile draw info ───────────────────────────────────────────────────────────

/**
 * Fully resolved draw parameters for one tile type, ready for ctx.drawImage.
 * Combines the source rect with any per-tile overrides.
 */
export interface TileDrawInfo {
  /** Source X in the tileset image (pixels). */
  sx: number;
  /** Source Y in the tileset image (pixels). */
  sy: number;
  /** Source width (pixels) — may differ from tileWidth for overridden tiles. */
  sw: number;
  /** Source height (pixels) — may differ from tileHeight for overridden tiles. */
  sh: number;
  /**
   * Vertical draw offset in world-space pixels.
   * 0 for standard tiles; negative for tiles that overhang the row above their
   * base tile (e.g. yOffset = -16 for a 16×32 wall tile).
   */
  yOffset: number;
}

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Resolve all draw parameters for a tile type in the given tileset.
 * Pure function — no side effects.
 * Returns null when the tile type has no mapping and should not be drawn.
 *
 * Variant resolution order:
 *   1. autoTileMap[tileType][variant]  — specific autotile sprite for this bitmask
 *   2. tileMap[tileType]               — fallback / non-autotiled default
 *   3. null                            — tile has no mapping, skip drawing
 *
 * Size overrides (tileOverrides) are always keyed by tileType, not by variant,
 * since all variants of a given tile type share the same sprite dimensions.
 *
 * @param tileType - Integer value from the TileType const (e.g. TileType.CARPET)
 * @param config   - The tileset config
 * @param variant  - Autotile bitmask from ChunkState.variantCache (default 0)
 */
export function getTileDrawInfo(
    tileType: number,
    config:   TilesetConfig,
    variant:  number = 0,
): TileDrawInfo | null {
  // Prefer the variant-specific index; fall back to the generic tileMap entry
  const autoIndex = config.autoTileMap?.[tileType]?.[variant];
  const index     = autoIndex ?? config.tileMap[tileType];
  if (index === undefined) return null;

  const col      = index % config.tilesPerRow;
  const row      = Math.floor(index / config.tilesPerRow);
  const override = config.tileOverrides?.[tileType];

  return {
    sx:      col * config.tileWidth,
    sy:      row * config.tileHeight,
    sw:      override?.width  ?? config.tileWidth,
    sh:      override?.height ?? config.tileHeight,
    yOffset: override?.yOffset ?? 0,
  };
}

/**
 * Return the render layer for a tile type in the given tileset.
 * Defaults to 'ground' for tile types absent from the tileRenderLayer map.
 *
 * @param tileType - Integer value from the TileType const
 * @param config   - The tileset config
 */
export function getTileRenderLayer(
    tileType: number,
    config:   TilesetConfig,
): TileRenderLayer {
  return config.tileRenderLayer?.[tileType] ?? 'ground';
}
