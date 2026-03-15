// src/lib/game/world/WorldFactory.ts
//
// Factory functions for creating initial or test world states.
// Extracted here so SimulationModule stays focused on the game loop,
// and so world-creation logic can later grow into a full generator without
// touching the engine.

import type { WorldState, ChunkState } from '../types/world';
import { TileType }                    from '../types/world';
import { CHUNK_WIDTH, CHUNK_HEIGHT, TILE_SIZE } from './WorldConstants';

// ─── Test world layout ────────────────────────────────────────────────────────
//
// The test chunk is a solid wall block with a cross corridor carved through
// its centre — one tile wide in each direction.  The corridor runs the full
// width and height of the chunk, so its ends open at the chunk borders.
// When additional chunks are loaded in the future, corridors will connect
// naturally across chunk boundaries.
//
//   W W W W W W W W | W W W W W W W W
//   W W W W W W W W | W W W W W W W W
//   W W W W W W W W | W W W W W W W W
//   W W W W W W W W | W W W W W W W W
//   W W W W W W W W | W W W W W W W W
//   W W W W W W W W | W W W W W W W W
//   W W W W W W W W | W W W W W W W W
//   W W W W W W W W | W W W W W W W W
//   _ _ _ _ _ _ _ _ + _ _ _ _ _ _ _ _   ← CORRIDOR_ROW
//   W W W W W W W W | W W W W W W W W
//   W W W W W W W W | W W W W W W W W
//   W W W W W W W W | W W W W W W W W
//   W W W W W W W W | W W W W W W W W
//   W W W W W W W W | W W W W W W W W
//   W W W W W W W W | W W W W W W W W
//   W W W W W W W W | W W W W W W W W
//                   ↑ CORRIDOR_COL

const CORRIDOR_ROW = Math.floor(CHUNK_HEIGHT / 2); // tile row of the horizontal corridor
const CORRIDOR_COL = Math.floor(CHUNK_WIDTH  / 2); // tile col of the vertical   corridor

// ─── Spawn point ──────────────────────────────────────────────────────────────

/**
 * Default player spawn position in world-space pixels.
 *
 * Positioned so the player's physical hitbox (offsetY=24, height=8) sits
 * exactly at the corridor intersection tile, centred on the column.
 * The sprite will visually extend one tile above the intersection, which is
 * normal for a 16×32 character standing in a one-tile-wide corridor.
 */
export const SPAWN_POINT = {
  // Centre the sprite on the corridor column
  x: CORRIDOR_COL * TILE_SIZE,
  // Shift up by the hitbox top-offset so the feet land on the corridor row
  y: CORRIDOR_ROW * TILE_SIZE - 24, // 24 = PLAYER_HITBOX.offsetY
} as const;

// ─── World factory ────────────────────────────────────────────────────────────

/**
 * Create the development test world: a single chunk at (0,0) with a cross
 * corridor carved through a solid wall block.
 *
 * Replace this with a procedural generator when chunk streaming is implemented.
 */
export function createInitialWorld(): WorldState {
  const tiles = new Uint8Array(CHUNK_WIDTH * CHUNK_HEIGHT);

  // Start with everything solid
  tiles.fill(TileType.WALL);

  // Carve horizontal corridor — one tile wide, full chunk width
  for (let x = 0; x < CHUNK_WIDTH; x++) {
    tiles[CORRIDOR_ROW * CHUNK_WIDTH + x] = TileType.CARPET;
  }

  // Carve vertical corridor — one tile wide, full chunk height
  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    tiles[y * CHUNK_WIDTH + CORRIDOR_COL] = TileType.CARPET;
  }

  const chunk: ChunkState = { chunkX: 0, chunkY: 0, tiles };

  return {
    seed:         0,
    name:         'test',
    chunks:       new Map([['0,0', chunk]]),
    activeChunks: new Set(['0,0']),
    time:         { ticks: 0, dayLength: 24000 },
    weather:      { current: 'clear', intensity: 0, transitionTimer: 0 },
  };
}
