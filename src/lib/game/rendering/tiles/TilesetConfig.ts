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
   * The bitmask is the value stored in ChunkState.variantCache (see Autotile.ts).
   *
   * Defines the DEFAULT material (material 0) appearance.  If a tile type has
   * an entry here, the renderer uses autoTileMap[tileType][bitmask] when no
   * material-specific override exists in materialAutoTileMap.
   * Falls back to tileMap[tileType] when the bitmask is not mapped, so tiles
   * always render something during development.
   *
   * Bitmask range depends on the tile's autotile mode (see AutotileRules.ts):
   *   • 4-neighbour mode: 0–15  (lower nibble, cardinal bits only)
   *   • 8-neighbour/blob mode: 0–255, but only 47 values are meaningful —
   *     corner bits (upper nibble) are masked by adjacent cardinals.
   *
   * Example — horizontal wall segment (east + west, 4-neighbour mode):
   *   autoTileMap: { [TileType.WALL]: { [NeighborBit.EAST | NeighborBit.WEST]: 42 } }
   */
  autoTileMap?: Partial<Record<number, Partial<Record<number, number>>>>;
  /**
   * Per-tile-type bitmask applied to variantCache before the autoTileMap lookup.
   *
   * Lets a tile type declare that only certain neighbour directions affect its
   * sprite — irrelevant bits are cleared before the key is used, so all
   * combinations that differ only in those bits collapse to the same lookup
   * and fall through to the tileMap fallback.
   *
   * Particularly useful for tiles that use blob mode (corners: true) but only
   * need a small subset of the 47 possible bitmask values:
   *
   * Example — carpet shadows only care about N, W, NW walls:
   *   autoTileMask: {
   *     [TileType.CARPET]: NeighborBit.NORTH | NeighborBit.WEST | NeighborBit.NORTH_WEST
   *   }
   *   → a carpet tile with walls to its N and E gets raw bitmask 3 (N|E),
   *     masked to 1 (N only), and looks up the N-shadow sprite.
   */
  autoTileMask?: Partial<Record<number, number>>;
  /**
   * Material-aware variant sprite map for tile types that support visual variants.
   *
   * Structure: tileType → materialIndex → (bitmask → flat sprite index).
   *
   * The renderer checks this map first when a tile has a non-zero material.
   * Any bitmask absent from a material's entry falls back to autoTileMap[tileType][bitmask]
   * (default material shape), then to tileMap[tileType] as a final fallback.
   *
   * Material indices are defined in TileMaterial (src/lib/game/types/materials.ts).
   * Material 0 (DEFAULT) is intentionally absent here — it is fully described
   * by autoTileMap above.
   *
   * Example — wood wall variant (material 1) for all 16 bitmasks:
   *   materialAutoTileMap: {
   *     [TileType.WALL]: {
   *       [TileMaterial.WOOD]: { 0b0000: 188, 0b0001: 190, … }
   *     }
   *   }
   */
  materialAutoTileMap?: Partial<Record<number, Partial<Record<number, Partial<Record<number, number>>>>>>;
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
 * Sprite resolution order (first match wins):
 *   1. materialAutoTileMap[tileType][material][maskedVariant]  — material + shape
 *   2. autoTileMap[tileType][maskedVariant]                    — default material shape
 *   3. tileMap[tileType]                                       — static fallback sprite
 *   4. null                                                    — no mapping, skip drawing
 *
 * If autoTileMask is defined for this tileType, the variant bitmask is ANDed
 * with the mask before lookup so irrelevant neighbour directions are ignored.
 *
 * Size overrides (tileOverrides) are keyed by tileType only, since all
 * materials and shape variants of a tile type share the same sprite dimensions.
 *
 * @param tileType - Integer value from the TileType const (e.g. TileType.CARPET)
 * @param config   - The tileset config
 * @param variant  - Autotile bitmask from ChunkState.variantCache (default 0)
 * @param material - Visual material index from ChunkState.materialTiles (default 0)
 */
export function getTileDrawInfo(
    tileType: number,
    config:   TilesetConfig,
    variant:  number = 0,
    material: number = 0,
): TileDrawInfo | null {
  // Mask irrelevant neighbour bits before lookup (see autoTileMask in TilesetConfig)
  const mask          = config.autoTileMask?.[tileType];
  const maskedVariant = mask !== undefined ? variant & mask : variant;

  // Prefer the material+variant-specific index, then shape-only, then the static fallback
  const matAutoIndex = config.materialAutoTileMap?.[tileType]?.[material]?.[maskedVariant];
  const autoIndex    = matAutoIndex ?? config.autoTileMap?.[tileType]?.[maskedVariant];
  const index        = autoIndex ?? config.tileMap[tileType];
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
