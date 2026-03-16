// src/lib/game/types/materials.ts
//
// Per-tile-type visual variant constants.
//
// Each tile type owns an independent variant index space: index 1 means
// something different for a wall than it does for carpet.  Two tiles of the
// same TileType with different variant indices share identical collision,
// passability, and audio — only the rendered sprite changes.
//
// ── How variant indices map to sprites ───────────────────────────────────────
//
//   The renderer looks up: materialAutoTileMap[tileType][variantIndex][bitmask]
//   (see TilesetConfig.ts).  Because tileType is always the first key, the
//   same integer (e.g. 1) is interpreted independently per tile type.
//   WallVariant.WOOD = 1 has no meaning for a CARPET tile and vice-versa.
//
// ── Adding a new variant ──────────────────────────────────────────────────────
//
//   1. Add a constant to the relevant *Variant object below (e.g. BRICK: 2).
//   2. Map each relevant bitmask (0–15) to a sprite index in the tileset's
//      materialAutoTileMap for that tile type and variant index.
//      Bitmasks absent from the entry fall back to variant 0 automatically.
//
// ── Adding a new tile type with variants ─────────────────────────────────────
//
//   1. Create a new *Variant object here following the pattern below.
//   2. Always include a DEFAULT: 0 entry — variant 0 is the universal fallback.
//
// ── Storage ───────────────────────────────────────────────────────────────────
//
//   Stored in ChunkState.materialTiles — a Uint8Array parallel to tiles[].
//   Values must fit in 0–255; each tile type may define up to 256 variants.

// ─── Wall variants ────────────────────────────────────────────────────────────

/**
 * Visual variant indices for TileType.WALL.
 * Determines which sprite row the wall autotile system draws from.
 */
export const WallVariant = {
  STONE: 0,  // Default — stone / plaster finish (row 13 in Room_Builder_16x16)
  WOOD:  1,  // Wooden planks                    (row 11 in Room_Builder_16x16)
} as const;

export type WallVariantValue = typeof WallVariant[keyof typeof WallVariant];

// ─── Carpet variants ──────────────────────────────────────────────────────────

/**
 * Visual variant indices for TileType.CARPET.
 *
 * Each variant has its own base sprite (no-shadow state, bitmask 0) plus
 * shadow overlay sprites for each relevant shadow bitmask (see RoomBuilderTileset
 * materialAutoTileMap and the CARPET autoTileMask entry).
 */
export const CarpetVariant = {
  SMOOTH:   0,  // Plain / default — no pattern, used as the universal fallback
  STRIPE_V: 1,  // Vertical stripes
  STRIPE_H: 2,  // Horizontal stripes
} as const;

export type CarpetVariantValue = typeof CarpetVariant[keyof typeof CarpetVariant];
