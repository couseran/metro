// src/lib/game/world/Autotile.ts
//
// Bitmask autotiling — computes which sprite variant a tile should display
// based on which of its neighbours are of a "connecting" type.
//
// Two modes are supported, chosen per tile type in AutotileRules.ts:
//
// ── 4-neighbour mode (default) ────────────────────────────────────────────────
//
//   Checks only the 4 cardinal neighbours (N, E, S, W).
//   Produces a 4-bit bitmask (0–15, lower nibble only).
//   Suitable for walls, fences, pipes — shapes where corners add no information.
//
//              NORTH (bit 0 = 1)
//       WEST (bit 3 = 8) · EAST (bit 1 = 2)
//              SOUTH (bit 2 = 4)
//
// ── 8-neighbour / blob mode ───────────────────────────────────────────────────
//
//   Checks all 8 neighbours.  Diagonal (corner) bits are placed in the upper
//   nibble and are subject to the "blob masking" rule: a corner bit is only
//   set when BOTH adjacent cardinal neighbours also connect.  This collapses
//   the theoretical 256 combinations down to 47 meaningful ones — the industry-
//   standard "blob tileset" layout used in RPG Maker, Tiled, and similar tools.
//
//   Full 8-bit layout:
//
//       NW (bit 7 = 128) · NORTH (bit 0 =  1) · NE (bit 4 =  16)
//       WEST (bit 3 =  8)  ·  tile  ·  EAST (bit 1 =   2)
//       SW (bit 6 =  64) · SOUTH (bit 2 =  4) · SE (bit 5 =  32)
//
//   Corner bits are only set when both adjacent cardinals are set:
//     NE (16) ← N (1)  AND E (2)  AND NE neighbour connects
//     SE (32) ← E (2)  AND S (4)  AND SE neighbour connects
//     SW (64) ← S (4)  AND W (8)  AND SW neighbour connects
//     NW(128) ← W (8)  AND N (1)  AND NW neighbour connects
//
// ── Backward compatibility ────────────────────────────────────────────────────
//
//   The lower-nibble cardinal bits (0–15) are identical in both modes.
//   All existing autoTileMap entries keyed on 4-bit bitmasks remain valid
//   when a tile type uses 4-neighbour mode.
//
// ── Lifecycle ─────────────────────────────────────────────────────────────────
//
//   1. World is built/loaded → computeChunkVariants() populates variantCache.
//   2. A tile is mutated → updateVariantsAround() refreshes the 3×3 neighbourhood.
//   3. Renderer reads variantCache[i] each frame — zero per-frame neighbour checks.
//
// ── Adding a new autotiled tile type ──────────────────────────────────────────
//
//   4-neighbour (no corners):
//     TILE_AUTOTILE_RULES: { [TileType.FOO]: (n) => n === TileType.FOO }
//     autoTileMap: map bitmask values 0–15 → sprite index.
//
//   8-neighbour (with corners):
//     TILE_AUTOTILE_RULES: { [TileType.FOO]: { connects: (n) => …, corners: true } }
//     autoTileMap: map the 47 meaningful bitmask values (0–255) → sprite index.

import type { WorldState, ChunkState } from '../types/world';
import { getTileAt }                   from './TileCollision';
import { CHUNK_WIDTH, CHUNK_HEIGHT }   from './WorldConstants';

// ─── Neighbor bitmask constants ───────────────────────────────────────────────

/**
 * Bit flags for all 8 neighbours used in autotiling.
 *
 * The 4 cardinal bits occupy the lower nibble (0–15), identical to the
 * classic 4-neighbour encoding — all existing autoTileMap entries remain valid.
 *
 * The 4 diagonal bits occupy the upper nibble (16–128) and are only ever set
 * in 8-neighbour (blob) mode, subject to the masking rule:
 *   a diagonal bit is set only when BOTH adjacent cardinals are also set.
 *
 * Layout:
 *   NW (128) · N (1) · NE (16)
 *    W  (8)  ·  ·  ·  E  (2)
 *   SW (64)  · S (4) · SE (32)
 */
export const NeighborBit = {
  // Cardinal (lower nibble) — same as original 4-neighbour layout
  NORTH:      1 << 0,  //   1
  EAST:       1 << 1,  //   2
  SOUTH:      1 << 2,  //   4
  WEST:       1 << 3,  //   8

  // Diagonal (upper nibble) — blob mode only, gated by adjacent cardinals
  NORTH_EAST: 1 << 4,  //  16
  SOUTH_EAST: 1 << 5,  //  32
  SOUTH_WEST: 1 << 6,  //  64
  NORTH_WEST: 1 << 7,  // 128
} as const;

// ─── Rule types ───────────────────────────────────────────────────────────────

/**
 * Full autotile rule for a tile type that needs 8-neighbour (blob) evaluation.
 *
 * Use this object form only when corners are required.  For tiles that only
 * need 4-cardinal neighbours, use the bare function shorthand instead —
 * it requires no extra syntax and produces a smaller, simpler autoTileMap.
 */
export interface TileAutotileRule {
  /** Returns true when a given neighbouring tile type should visually connect. */
  connects: (neighborTileType: number) => boolean;
  /**
   * Enable 8-neighbour (blob) evaluation.
   * Corner bits are masked by adjacent cardinals (see file header).
   * The resulting bitmask is 0–255 with at most 47 meaningful values.
   */
  corners: true;
}

/**
 * Either a bare predicate (4-neighbour, no boilerplate) or a full rule object
 * (8-neighbour with corners).
 *
 * Bare function shorthand:
 *   { [TileType.WALL]: (n) => n === TileType.WALL }
 *
 * Object form for corner-aware tiles:
 *   { [TileType.WATER]: { connects: (n) => n === TileType.WATER, corners: true } }
 */
export type TilePredicateEntry =
  | ((neighborTileType: number) => boolean)
  | TileAutotileRule;

/**
 * Maps each autotile-enabled tile type to its connection rule.
 * Tile types absent from this map receive variant 0 (no autotiling).
 */
export type TilePredicateMap = Partial<Record<number, TilePredicateEntry>>;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Normalise a TilePredicateEntry to a full rule object. */
function resolveRule(entry: TilePredicateEntry): { connects: (n: number) => boolean; corners: boolean } {
  return typeof entry === 'function'
      ? { connects: entry, corners: false }
      : { connects: entry.connects, corners: true };
}

/** Return the chunk that contains world tile (tx, ty), or null if not loaded. */
function getChunkForTile(world: WorldState, tx: number, ty: number): ChunkState | null {
  const chunkX = Math.floor(tx / CHUNK_WIDTH);
  const chunkY = Math.floor(ty / CHUNK_HEIGHT);
  return world.chunks.get(`${chunkX},${chunkY}`) ?? null;
}

// ─── Core bitmask computation ─────────────────────────────────────────────────

/**
 * Compute the autotile bitmask for a single tile at world tile coordinates (tx, ty).
 *
 * In 4-neighbour mode (`corners = false`, the default) the result is 0–15.
 * In 8-neighbour mode (`corners = true`) the result is 0–255, with diagonal
 * bits only set when both adjacent cardinal neighbours also connect (blob rule).
 *
 * @param world    - Full world state (for cross-chunk tile lookups)
 * @param tx       - World tile X of the tile being evaluated
 * @param ty       - World tile Y of the tile being evaluated
 * @param connects - Returns true if the given neighbour type should connect
 * @param corners  - When true, evaluate diagonal neighbours under the blob rule
 */
export function computeTileBitmask(
    world:    WorldState,
    tx:       number,
    ty:       number,
    connects: (neighborTileType: number) => boolean,
    corners:  boolean = false,
): number {
  // Evaluate the 4 cardinal neighbours first — always needed
  const n = connects(getTileAt(world, tx,     ty - 1));
  const e = connects(getTileAt(world, tx + 1, ty    ));
  const s = connects(getTileAt(world, tx,     ty + 1));
  const w = connects(getTileAt(world, tx - 1, ty    ));

  let mask = 0;
  if (n) mask |= NeighborBit.NORTH;
  if (e) mask |= NeighborBit.EAST;
  if (s) mask |= NeighborBit.SOUTH;
  if (w) mask |= NeighborBit.WEST;

  // Diagonal neighbours — only evaluated in blob mode, and only when both
  // adjacent cardinals connect (masking rule keeps the 47-combination invariant)
  if (corners) {
    if (n && e && connects(getTileAt(world, tx + 1, ty - 1))) mask |= NeighborBit.NORTH_EAST;
    if (e && s && connects(getTileAt(world, tx + 1, ty + 1))) mask |= NeighborBit.SOUTH_EAST;
    if (s && w && connects(getTileAt(world, tx - 1, ty + 1))) mask |= NeighborBit.SOUTH_WEST;
    if (w && n && connects(getTileAt(world, tx - 1, ty - 1))) mask |= NeighborBit.NORTH_WEST;
  }

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
 * @param predicates - Per-tile-type autotile rules (see AutotileRules.ts)
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
      const entry    = predicates[tileType];

      if (!entry) {
        chunk.variantCache[i] = 0;
        continue;
      }

      const { connects, corners } = resolveRule(entry);
      const worldTX = chunk.chunkX * CHUNK_WIDTH  + localX;
      const worldTY = chunk.chunkY * CHUNK_HEIGHT + localY;

      chunk.variantCache[i] = computeTileBitmask(world, worldTX, worldTY, connects, corners);
    }
  }
}

// ─── Incremental update ───────────────────────────────────────────────────────

/**
 * Recompute the autotile variant for a tile and its entire 3×3 neighbourhood.
 *
 * Call this whenever a tile is placed or removed at world tile coordinates
 * (worldTX, worldTY).  Refreshing all 9 positions (the changed tile plus all
 * 8 surrounding tiles) handles both 4-neighbour and 8-neighbour (blob) modes:
 *
 * • In 4-neighbour mode the 4 diagonal positions compute to the same result
 *   they had before (no cardinal changed for them), so the extra 4 lookups
 *   are safe no-ops with negligible overhead.
 *
 * • In 8-neighbour mode, a diagonal neighbour's corner bit can change when T
 *   changes because T is that diagonal's own diagonal — the full 3×3 sweep
 *   is necessary for correctness.
 *
 * The variantCache arrays are mutated in place — they are purely derived
 * data, not primary simulation state, so in-place updates are safe.
 *
 * @param world      - Full world state (already updated with the new tile)
 * @param worldTX    - World tile X of the tile that changed
 * @param worldTY    - World tile Y of the tile that changed
 * @param predicates - Per-tile-type autotile rules
 */
export function updateVariantsAround(
    world:      WorldState,
    worldTX:    number,
    worldTY:    number,
    predicates: TilePredicateMap,
): void {
  // Full 3×3 grid centred on the mutated tile.
  // Diagonal positions are included so that corner bits in blob-mode tiles
  // are refreshed correctly when T enters or leaves their neighbourhood.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = worldTX + dx;
      const ty = worldTY + dy;

      const chunk = getChunkForTile(world, tx, ty);
      if (!chunk) continue;

      const localX   = tx - chunk.chunkX * CHUNK_WIDTH;
      const localY   = ty - chunk.chunkY * CHUNK_HEIGHT;
      const i        = localY * CHUNK_WIDTH + localX;
      const tileType = chunk.tiles[i];
      const entry    = predicates[tileType];

      if (!entry) {
        chunk.variantCache[i] = 0;
        continue;
      }

      const { connects, corners } = resolveRule(entry);
      chunk.variantCache[i] = computeTileBitmask(world, tx, ty, connects, corners);
    }
  }
}
