// src/lib/game/world/WorldFactory.ts
//
// Factory functions for creating initial or test world states.

import type { WorldState, ChunkState } from '../types/world';
import { TileType }                    from '../types/world';
import { WallVariant, CarpetVariant }  from '../types/materials';
import { CHUNK_WIDTH, CHUNK_HEIGHT, TILE_SIZE } from './WorldConstants';
import { computeChunkVariants, NeighborBit }    from './Autotile';
import { TILE_AUTOTILE_RULES }                  from './AutotileRules';

// ─── Autotile debug layout ────────────────────────────────────────────────────
//
// The 16×16 chunk is divided into a 4×4 grid of 4×4-tile cells.
// Each cell contains exactly one wall bitmask variant (0–15) as an isolated
// test station so every autoTileMap entry can be verified visually.
//
// Cell layout (bitmask value printed at each center ×):
//
//   col:  0    1    2    3
//        ─────────────────────
//  row 0: × 0  × 1  × 2  × 3
//  row 1: × 4  × 5  × 6  × 7
//  row 2: × 8  × 9  × 10 × 11
//  row 3: × 12 × 13 × 14 × 15
//
// Within each 4×4 cell the center wall is at local offset (1, 1) and
// arm walls are placed at offset (1, 0), (2, 1), (1, 2), (0, 1) when
// the corresponding bitmask bit (N=1, E=2, S=4, W=8) is set.
//
// Isolation guarantee: the furthest arm from any cell center is at local
// offset 2 in one axis.  The nearest tile of the neighbouring cell's center
// is at local offset 5 (one full cell away).  No two cells' arm walls are
// ever adjacent, so each center tile receives exactly the intended bitmask.
//
// Bitmask reference (bits: N=1 E=2 S=4 W=8):
//
//   0  = ·          isolated pillar       (no neighbours)
//   1  = N          dead-end, cap south   (open towards south)
//   2  = E          dead-end, cap west    (open towards west)
//   3  = N+E        corner NE / └
//   4  = S          dead-end, cap north   (open towards north)
//   5  = N+S        vertical segment      ─
//   6  = E+S        corner SE / ┘ (flipped)
//   7  = N+E+S      T-junction, no west   ├
//   8  = W          dead-end, cap east    (open towards east)
//   9  = N+W        corner NW / ┘
//  10  = E+W        horizontal segment    │
//  11  = N+E+W      T-junction, no south  ┴
//  12  = S+W        corner SW / ┐ (flipped)
//  13  = N+S+W      T-junction, no east   ┤
//  14  = E+S+W      T-junction, no north  ┬
//  15  = N+E+S+W    cross / fully surrounded ┼

const CELL_SIZE  = 4; // tile width/height of each test cell
const CELL_COUNT = 4; // number of cells per row/column (4×4 = 16 total)

// Center of each cell within the chunk (world tile coords)
function cellCenter(col: number, row: number): { cx: number; cy: number } {
  return {
    cx: col * CELL_SIZE + 1,
    cy: row * CELL_SIZE + 1,
  };
}

// ─── Spawn point ──────────────────────────────────────────────────────────────

// Spawn between cell row 1 and row 2, at the right edge of cell col 0.
// Tile (3, 7) is at local offset (3, 3) within cell (0, 1) — arms are
// placed only at offsets (0–2), so this tile is always CARPET.
const SPAWN_TILE_X = 3;
const SPAWN_TILE_Y = 7;

/**
 * Default player spawn position in world-space pixels.
 * Placed in a guaranteed CARPET tile between two rows of variant stations.
 * Player.y is offset so the physical hitbox (offsetY=24) lands on the tile.
 */
export const SPAWN_POINT = {
  x: SPAWN_TILE_X * TILE_SIZE,
  y: SPAWN_TILE_Y * TILE_SIZE - 24, // 24 = PLAYER_HITBOX.offsetY
} as const;

// ─── World factory ────────────────────────────────────────────────────────────

/**
 * Create the autotile debug world.
 *
 * Produces a single 16×16 chunk (at grid position 0,0) containing all 16 wall
 * bitmask configurations arranged in a 4×4 grid of isolated test stations.
 * Every cell is surrounded by CARPET so no station's arm walls touch another,
 * guaranteeing that each center tile receives exactly its intended bitmask.
 *
 * Use this world to verify that every entry in RoomBuilderTileset.autoTileMap
 * maps to the correct sprite before moving to real level design.
 *
 * Replace this function with a procedural or data-driven generator when real
 * chunk streaming is implemented.
 */
export function createInitialWorld(): WorldState {
  const tiles         = new Uint8Array(CHUNK_WIDTH * CHUNK_HEIGHT);
  const variantCache  = new Uint8Array(CHUNK_WIDTH * CHUNK_HEIGHT);
  const materialTiles = new Uint8Array(CHUNK_WIDTH * CHUNK_HEIGHT);

  // Floor — everything walkable by default
  tiles.fill(TileType.CARPET);

  // Assign carpet variant by cell column so all 3 variants are visible:
  //   col 0 (x  0– 3): SMOOTH    col 2 (x  8–11): STRIPE_H
  //   col 1 (x  4– 7): STRIPE_V  col 3 (x 12–15): SMOOTH (cycles back)
  const CARPET_VARIANT_BY_COL = [
    CarpetVariant.SMOOTH,
    CarpetVariant.STRIPE_V,
    CarpetVariant.STRIPE_H,
    CarpetVariant.SMOOTH,
  ] as const;
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let x = 0; x < CHUNK_WIDTH; x++) {
      materialTiles[y * CHUNK_WIDTH + x] = CARPET_VARIANT_BY_COL[Math.floor(x / CELL_SIZE)];
    }
  }

  // Place one isolated wall station per bitmask value (0–15).
  // Stations 0–7  (rows 0–1) use the DEFAULT material  → stone walls.
  // Stations 8–15 (rows 2–3) use the WOOD    material  → wood walls.
  // This lets every autotile shape be verified for both materials at once.
  for (let bitmask = 0; bitmask < 16; bitmask++) {
    const col = bitmask % CELL_COUNT;
    const row = Math.floor(bitmask / CELL_COUNT);
    const { cx, cy } = cellCenter(col, row);

    const material: number = bitmask >= 8 ? WallVariant.WOOD : WallVariant.STONE;

    // Center wall — this is the tile whose variant we are testing
    tiles[cy * CHUNK_WIDTH + cx] = TileType.WALL;
    materialTiles[cy * CHUNK_WIDTH + cx] = material;

    // Arm walls — placed only for the bits set in the bitmask
    if (bitmask & NeighborBit.NORTH) {
      tiles[(cy - 1) * CHUNK_WIDTH +  cx     ] = TileType.WALL;
      materialTiles[(cy - 1) * CHUNK_WIDTH +  cx     ] = material;
    }
    if (bitmask & NeighborBit.EAST) {
      tiles[ cy      * CHUNK_WIDTH + (cx + 1)] = TileType.WALL;
      materialTiles[ cy      * CHUNK_WIDTH + (cx + 1)] = material;
    }
    if (bitmask & NeighborBit.SOUTH) {
      tiles[(cy + 1) * CHUNK_WIDTH +  cx     ] = TileType.WALL;
      materialTiles[(cy + 1) * CHUNK_WIDTH +  cx     ] = material;
    }
    if (bitmask & NeighborBit.WEST) {
      tiles[ cy      * CHUNK_WIDTH + (cx - 1)] = TileType.WALL;
      materialTiles[ cy      * CHUNK_WIDTH + (cx - 1)] = material;
    }
  }

  const chunk: ChunkState = { chunkX: 0, chunkY: 0, tiles, variantCache, materialTiles, savedProps: [] };

  // Assemble the world before computing variants so that getTileAt can resolve
  // cross-chunk border queries (none here, but required by the API contract)
  const world: WorldState = {
    seed:         0,
    name:         'autotile_debug',
    chunks:       new Map([['0,0', chunk]]),
    activeChunks: new Set(['0,0']),
    time:         { ticks: 0, dayLength: 24000 },
    weather:      { current: 'clear', intensity: 0, transitionTimer: 0 },
  };

  // Compute and cache the autotile bitmask for every tile in the chunk
  computeChunkVariants(chunk, world, TILE_AUTOTILE_RULES);

  return world;
}
