// src/lib/game/world/Autotile.ts
//
// Bitmask autotiling — computes which sprite variant a tile should display
// based on which of its neighbours are of a "connecting" type.
//
// Three modes are supported, chosen per tile type in AutotileRules.ts:
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
// ── 8-neighbour / blob mode ('blob') ─────────────────────────────────────────
//
//   Checks all 8 neighbours.  Diagonal (corner) bits are placed in the upper
//   nibble and are subject to the "blob masking" rule: a corner bit is only
//   set when BOTH adjacent cardinal neighbours also connect.  This collapses
//   the theoretical 256 combinations down to 47 meaningful ones — the industry-
//   standard "blob tileset" layout used in RPG Maker, Tiled, and similar tools.
//
//       NW (bit 7 = 128) · NORTH (bit 0 =  1) · NE (bit 4 =  16)
//       WEST (bit 3 =  8)  ·  tile  ·  EAST (bit 1 =   2)
//       SW (bit 6 =  64) · SOUTH (bit 2 =  4) · SE (bit 5 =  32)
//
//   Corner bits are only set when both adjacent cardinals are set:
//     NE (16) ← N AND E AND NE connects
//     SE (32) ← E AND S AND SE connects
//     SW (64) ← S AND W AND SW connects
//     NW(128) ← W AND N AND NW connects
//
// ── 8-neighbour / independent mode ('independent') ───────────────────────────
//
//   Checks all 8 neighbours independently — no gating on adjacent cardinals.
//   A diagonal bit is set whenever that diagonal neighbour connects, regardless
//   of the cardinal neighbours.  Produces up to 256 bitmask values.
//
//   Use this for effect tiles (shadows, overlays) where a lone diagonal
//   neighbour should be detectable on its own.  In combination with autoTileMask,
//   only the relevant directions need entries in the autoTileMap.
//
//   Example — carpet shadow: connects to WALL, corners: 'independent',
//     mask = N|W|NW.  A wall only at NW produces bitmask 128 and shows the
//     inner-corner shadow sprite even without cardinal walls present.
//
// ── Backward compatibility ────────────────────────────────────────────────────
//
//   The lower-nibble cardinal bits (0–15) are identical in all three modes.
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
//   8-neighbour blob (terrain merging):
//     TILE_AUTOTILE_RULES: { [TileType.FOO]: { connects: (n) => …, corners: 'blob' } }
//     autoTileMap: map the 47 meaningful bitmask values → sprite index.
//
//   8-neighbour independent (effect / shadow detection):
//     TILE_AUTOTILE_RULES: { [TileType.FOO]: { connects: (n) => …, corners: 'independent' } }
//     autoTileMask: restrict to relevant bits to limit the number of entries needed.
//     autoTileMap: map the relevant masked bitmask values → sprite index.

import type { WorldState, ChunkState } from '../../types/world.ts';
import { getTileAt }                   from './TileCollision.ts';
import { CHUNK_WIDTH, CHUNK_HEIGHT }   from '../../world/WorldConstants.ts';

// ─── Neighbor bitmask constants ───────────────────────────────────────────────

/**
 * Bit flags for all 8 neighbours used in autotiling.
 *
 * The 4 cardinal bits occupy the lower nibble (0–15), identical in all modes.
 * The 4 diagonal bits occupy the upper nibble (16–128):
 *   • In 'blob' mode: only set when BOTH adjacent cardinals are also set.
 *   • In 'independent' mode: set whenever the diagonal neighbour connects,
 *     regardless of cardinal neighbours.
 *
 * Layout:
 *   NW (128) · N (1) · NE (16)
 *    W  (8)  ·  ·  ·  E  (2)
 *   SW (64)  · S (4) · SE (32)
 */
export const NeighborBit = {
  // Cardinal (lower nibble) — same in all autotile modes
  NORTH:      1 << 0,  //   1
  EAST:       1 << 1,  //   2
  SOUTH:      1 << 2,  //   4
  WEST:       1 << 3,  //   8

  // Diagonal (upper nibble) — behaviour depends on CornerMode
  NORTH_EAST: 1 << 4,  //  16
  SOUTH_EAST: 1 << 5,  //  32
  SOUTH_WEST: 1 << 6,  //  64
  NORTH_WEST: 1 << 7,  // 128
} as const;

// ─── Rule types ───────────────────────────────────────────────────────────────

/**
 * How diagonal (corner) neighbours are evaluated.
 *
 *   'blob'        — Standard blob tileset rule: a diagonal bit is only set
 *                   when BOTH adjacent cardinal neighbours also connect.
 *                   Produces at most 47 meaningful bitmask values.
 *                   Use for terrain tiles that should merge smoothly (water, grass…).
 *
 *   'independent' — All 8 directions are checked independently without any
 *                   gating.  Produces up to 256 bitmask values.
 *                   Use for effect tiles (shadows, overlays) where a lone
 *                   diagonal neighbour must be detectable on its own.
 */
export type CornerMode = 'blob' | 'independent';

/**
 * Full autotile rule for a tile type that needs 8-neighbour evaluation.
 *
 * Use the bare function shorthand for 4-cardinal-only tiles — it requires
 * no extra syntax and the autoTileMap only needs 16 entries (0–15).
 */
export interface TileAutotileRule {
  /** Returns true when a given neighbouring tile type should visually connect. */
  connects: (neighborTileType: number) => boolean;
  /** Diagonal evaluation mode — see CornerMode. */
  corners: CornerMode;
}

/**
 * Either a bare predicate (4-neighbour, no boilerplate) or a full rule object
 * (8-neighbour with corners).
 *
 * Bare function — 4-neighbour, bitmask 0–15:
 *   { [TileType.WALL]: (n) => n === TileType.WALL }
 *
 * Object form — blob mode, bitmask 0–255 (47 meaningful values):
 *   { [TileType.WATER]: { connects: (n) => n === TileType.WATER, corners: 'blob' } }
 *
 * Object form — independent mode, all 8 directions ungated:
 *   { [TileType.CARPET]: { connects: (n) => n === TileType.WALL, corners: 'independent' } }
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
function resolveRule(entry: TilePredicateEntry): { connects: (n: number) => boolean; corners: CornerMode | undefined } {
  return typeof entry === 'function'
      ? { connects: entry, corners: undefined }
      : { connects: entry.connects, corners: entry.corners };
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
 * In 4-neighbour mode (`corners` undefined) the result is 0–15.
 * In 'blob' mode the result is 0–255 with at most 47 meaningful values.
 * In 'independent' mode the result is 0–255 with up to 256 possible values.
 *
 * @param world    - Full world state (for cross-chunk tile lookups)
 * @param tx       - World tile X of the tile being evaluated
 * @param ty       - World tile Y of the tile being evaluated
 * @param connects - Returns true if the given neighbour type should connect
 * @param corners  - Corner evaluation mode; undefined = 4-cardinal only
 */
export function computeTileBitmask(
    world:    WorldState,
    tx:       number,
    ty:       number,
    connects: (neighborTileType: number) => boolean,
    corners?: CornerMode,
): number {
  // Evaluate the 4 cardinal neighbours — always needed
  const n = connects(getTileAt(world, tx,     ty - 1));
  const e = connects(getTileAt(world, tx + 1, ty    ));
  const s = connects(getTileAt(world, tx,     ty + 1));
  const w = connects(getTileAt(world, tx - 1, ty    ));

  let mask = 0;
  if (n) mask |= NeighborBit.NORTH;
  if (e) mask |= NeighborBit.EAST;
  if (s) mask |= NeighborBit.SOUTH;
  if (w) mask |= NeighborBit.WEST;

  if (corners === 'blob') {
    // Standard blob rule: diagonal only fires when both adjacent cardinals connect
    if (n && e && connects(getTileAt(world, tx + 1, ty - 1))) mask |= NeighborBit.NORTH_EAST;
    if (e && s && connects(getTileAt(world, tx + 1, ty + 1))) mask |= NeighborBit.SOUTH_EAST;
    if (s && w && connects(getTileAt(world, tx - 1, ty + 1))) mask |= NeighborBit.SOUTH_WEST;
    if (w && n && connects(getTileAt(world, tx - 1, ty - 1))) mask |= NeighborBit.NORTH_WEST;
  } else if (corners === 'independent') {
    // Independent mode: each diagonal is checked unconditionally
    if (connects(getTileAt(world, tx + 1, ty - 1))) mask |= NeighborBit.NORTH_EAST;
    if (connects(getTileAt(world, tx + 1, ty + 1))) mask |= NeighborBit.SOUTH_EAST;
    if (connects(getTileAt(world, tx - 1, ty + 1))) mask |= NeighborBit.SOUTH_WEST;
    if (connects(getTileAt(world, tx - 1, ty - 1))) mask |= NeighborBit.NORTH_WEST;
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
 * 8 surrounding tiles) handles all three autotile modes correctly:
 *
 * • 4-neighbour: the 4 diagonal positions recompute to the same result as
 *   before (no cardinal changed for them) — safe no-ops with negligible overhead.
 *
 * • 'blob' mode: diagonal neighbours whose corner bit depends on T are refreshed.
 *
 * • 'independent' mode: diagonal neighbours can have their corner bit changed
 *   directly by T's presence, requiring the full 3×3 sweep.
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
