// src/lib/game/world/AutotileRules.ts
//
// Game-specific autotile connection rules.
//
// This file is intentionally separate from Autotile.ts (the algorithm) so that
// connection rules can grow — new tile types, connection groups, cross-type
// connections — without touching the core bitmask machinery.
//
// ── Adding a 4-neighbour tile (no corners) ───────────────────────────────────
//
//   Use the bare function shorthand.  The bitmask will be 0–15.
//   Map those 16 values to sprite indices in the tileset's autoTileMap.
//
//     [TileType.WALL]: (n) => n === TileType.WALL,
//
// ── Adding an 8-neighbour / blob tile (with corners) ─────────────────────────
//
//   Use the object form with corners: true.  The bitmask will be 0–255
//   (47 meaningful values under the blob masking rule).
//   Map those values to sprite indices in the tileset's autoTileMap.
//
//     [TileType.WATER]: { connects: (n) => n === TileType.WATER, corners: true },
//
// ── Connection groups ────────────────────────────────────────────────────────
//
//   If two tile types should visually merge (e.g. stone wall and stone arch),
//   make both predicates accept the other type:
//
//     [TileType.WALL]: (n) => n === TileType.WALL || n === TileType.ARCH,
//     [TileType.ARCH]: (n) => n === TileType.ARCH || n === TileType.WALL,

import type { TilePredicateMap } from './Autotile';
import { TileType }              from '../types/world';

// ─── Tile autotile rules ──────────────────────────────────────────────────────

/**
 * Autotile connection predicates for all tile types in this game.
 *
 * Imported by WorldFactory (and future chunk loaders) to populate
 * ChunkState.variantCache on load and by the tile-mutation system to refresh
 * variants incrementally via updateVariantsAround.
 */
export const TILE_AUTOTILE_RULES: TilePredicateMap = {
  // Walls connect only to other walls.
  [TileType.WALL]: (neighbor) => neighbor === TileType.WALL,

  // Add further rules here as new tile types are introduced, e.g.:
  // [TileType.WATER]:  (n) => n === TileType.WATER || n === TileType.SHALLOW_WATER,
  // [TileType.CARPET]: (n) => n === TileType.CARPET,
};
