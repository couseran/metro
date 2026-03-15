// src/lib/game/world/Autotile.ts
//
// Bitmask autotiling — computes which sprite variant a tile should display
// based on which of its 4 cardinal neighbours are of a "connecting" type.
//
// ── How it works ─────────────────────────────────────────────────────────────
//
//   Each tile type that supports autotiling is assigned a predicate (see
//   AutotileRules.ts) that answers: "does this neighbour type connect to me?".
//   The 4 results are packed into a 4-bit bitmask (0–15):
//
//              NORTH (bit 0 = 1)
//       WEST (bit 3 = 8) + EAST (bit 1 = 2)
//              SOUTH (bit 2 = 4)
//
//   That bitmask is stored in ChunkState.variantCache and read by the renderer
//   to pick the correct sprite from the tileset's autoTileMap.  The renderer
//   never calls getTileAt or inspects neighbours itself.
//
// ── Lifecycle ────────────────────────────────────────────────────────────────
//
//   1. World is built/loaded → computeChunkVariants() populates variantCache.
//   2. A tile is mutated → updateVariantsAround() refreshes the 5 affected tiles.
//   3. Renderer reads variantCache[i] each frame — zero per-frame neighbour checks.
//
// ── Adding a new autotiled tile type ─────────────────────────────────────────
//
//   1. Add a predicate to TILE_AUTOTILE_RULES in AutotileRules.ts.
//   2. Map each bitmask value (0–15) to a sprite index in the tileset's autoTileMap.

import type { WorldState, ChunkState } from '../types/world';
import { getTileAt }                   from './TileCollision';
import { CHUNK_WIDTH, CHUNK_HEIGHT }   from './WorldConstants';

// ─── Neighbor bitmask constants ───────────────────────────────────────────────

/**
 * Bit flags for the 4 cardinal neighbours used in bitmask autotiling.
 *
 * Standard 4-neighbour encoding used by most RPG-style autotile systems.
 * The same encoding is used for both tile autotiling and prop autotiling.
 *
 *         NORTH = 1
 *   WEST = 8  +  EAST = 2
 *         SOUTH = 4
 */
export const NeighborBit = {
  NORTH: 1 << 0,  // 1
  EAST:  1 << 1,  // 2
  SOUTH: 1 << 2,  // 4
  WEST:  1 << 3,  // 8
} as const;

// ─── Predicate map ────────────────────────────────────────────────────────────

/**
 * Maps each autotile-enabled tile type to a predicate that determines whether
 * a given neighbouring tile type should count as a connecting neighbour.
 *
 * Tile types absent from this map receive variant 0 and use the default
 * tileMap sprite (no autotiling).
 *
 * Example:
 *   { [TileType.WALL]: (n) => n === TileType.WALL }
 */
export type TilePredicateMap = Partial<Record<number, (neighborTileType: number) => boolean>>;

// ─── Core bitmask computation ─────────────────────────────────────────────────

/**
 * Compute the 4-neighbour autotile bitmask for a single tile at world tile
 * coordinates (tx, ty).
 *
 * Each of the 4 cardinal neighbours is queried via getTileAt (returns
 * TileType.VOID for unloaded chunks), then the connect predicate is applied.
 * Set bits indicate connecting neighbours; the resulting value is 0–15.
 *
 * @param world    - Full world state (for cross-chunk tile lookups)
 * @param tx       - World tile X of the tile being evaluated
 * @param ty       - World tile Y of the tile being evaluated
 * @param connects - Returns true if the given neighbour type should connect
 */
export function computeTileBitmask(
    world:    WorldState,
    tx:       number,
    ty:       number,
    connects: (neighborTileType: number) => boolean,
): number {
  let mask = 0;
  if (connects(getTileAt(world, tx,     ty - 1))) mask |= NeighborBit.NORTH;
  if (connects(getTileAt(world, tx + 1, ty    ))) mask |= NeighborBit.EAST;
  if (connects(getTileAt(world, tx,     ty + 1))) mask |= NeighborBit.SOUTH;
  if (connects(getTileAt(world, tx - 1, ty    ))) mask |= NeighborBit.WEST;
  return mask;
}

// ─── Chunk-level population ───────────────────────────────────────────────────

/**
 * Populate the variantCache for every tile in a chunk.
 *
 * Call this once immediately after a chunk is generated or loaded into memory.
 * Tiles whose type has no predicate in `predicates` receive variant 0 and are
 * rendered with the default (non-autotiled) sprite.
 *
 * Border note: tiles on a chunk edge query neighbouring chunks via getTileAt.
 * If those chunks are not yet loaded, VOID is returned and treated as
 * non-connecting — a safe approximation.  Border tiles are corrected when the
 * adjacent chunk later loads and its own computeChunkVariants call runs, or
 * when updateVariantsAround is invoked on the boundary tiles.
 *
 * @param chunk      - The chunk to populate (variantCache is mutated in place)
 * @param world      - World state the chunk belongs to (for border lookups)
 * @param predicates - Per-tile-type connection predicates (see AutotileRules.ts)
 */
export function computeChunkVariants(
    chunk:      ChunkState,
    world:      WorldState,
    predicates: TilePredicateMap,
): void {
  for (let localY = 0; localY < CHUNK_HEIGHT; localY++) {
    for (let localX = 0; localX < CHUNK_WIDTH; localX++) {
      const i        = localY * CHUNK_WIDTH + localX;
      const tileType = chunk.tiles[i];
      const connects = predicates[tileType];

      if (!connects) {
        chunk.variantCache[i] = 0;
        continue;
      }

      const worldTX = chunk.chunkX * CHUNK_WIDTH  + localX;
      const worldTY = chunk.chunkY * CHUNK_HEIGHT + localY;

      chunk.variantCache[i] = computeTileBitmask(world, worldTX, worldTY, connects);
    }
  }
}

// ─── Incremental update ───────────────────────────────────────────────────────

/**
 * Recompute the autotile variant for a tile and its 4 cardinal neighbours.
 *
 * Call this whenever a tile is placed or removed at world tile coordinates
 * (worldTX, worldTY).  Refreshing all 5 affected positions (the changed tile
 * plus each neighbour) ensures no stale variants remain after a mutation.
 *
 * The variantCache arrays are mutated in place — they are purely derived
 * data, not primary simulation state, so in-place updates are safe.
 *
 * @param world      - Full world state (already updated with the new tile)
 * @param worldTX    - World tile X of the tile that changed
 * @param worldTY    - World tile Y of the tile that changed
 * @param predicates - Per-tile-type connection predicates
 */
export function updateVariantsAround(
    world:      WorldState,
    worldTX:    number,
    worldTY:    number,
    predicates: TilePredicateMap,
): void {
  const affected = [
    { tx: worldTX,     ty: worldTY     },  // the mutated tile itself
    { tx: worldTX,     ty: worldTY - 1 },  // north neighbour
    { tx: worldTX + 1, ty: worldTY     },  // east  neighbour
    { tx: worldTX,     ty: worldTY + 1 },  // south neighbour
    { tx: worldTX - 1, ty: worldTY     },  // west  neighbour
  ];

  for (const { tx, ty } of affected) {
    const chunk = getChunkForTile(world, tx, ty);
    if (!chunk) continue;

    const localX   = tx - chunk.chunkX * CHUNK_WIDTH;
    const localY   = ty - chunk.chunkY * CHUNK_HEIGHT;
    const i        = localY * CHUNK_WIDTH + localX;
    const tileType = chunk.tiles[i];
    const connects = predicates[tileType];

    chunk.variantCache[i] = connects
        ? computeTileBitmask(world, tx, ty, connects)
        : 0;
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Return the chunk that contains world tile (tx, ty), or null if not loaded. */
function getChunkForTile(world: WorldState, tx: number, ty: number): ChunkState | null {
  const chunkX = Math.floor(tx / CHUNK_WIDTH);
  const chunkY = Math.floor(ty / CHUNK_HEIGHT);
  return world.chunks.get(`${chunkX},${chunkY}`) ?? null;
}
