// src/lib/game/world/TileCollision.ts
//
// Tile-based AABB collision resolution for entities.
//
// Collision is resolved per axis (X then Y) so entities slide along walls
// rather than stopping dead when they touch a corner.
// All inputs and outputs are in world-space pixels.

import type { WorldState } from '../types/world';
import { TileType }        from '../types/world';
import { TILE_SIZE, CHUNK_WIDTH, CHUNK_HEIGHT } from './WorldConstants';

// ─── Hitbox ───────────────────────────────────────────────────────────────────

/**
 * Axis-aligned bounding box defined relative to an entity's (x, y) origin.
 * The origin is the top-left corner of the entity's sprite.
 * The hitbox represents the entity's physical footprint — typically a small box
 * at the base of the sprite, not the full visual extent.
 */
export interface Hitbox {
  /** Horizontal offset from the entity origin to the left edge of the hitbox. */
  offsetX: number;
  /** Vertical offset from the entity origin to the top edge of the hitbox. */
  offsetY: number;
  /** Hitbox width in pixels. */
  width: number;
  /** Hitbox height in pixels. */
  height: number;
}

/**
 * The player's physical hitbox.
 * The Adam sprite is 16×32; the hitbox is a narrow strip at the feet (bottom 8px),
 * inset 2px on each side to feel fair on tight passages.
 */
export const PLAYER_HITBOX: Hitbox = {
  offsetX: 1,
  offsetY: 24,
  width:   14,
  height:  8,
};

// ─── Solid tile registry ──────────────────────────────────────────────────────

/**
 * Set of tile types that block movement.
 * VOID is included so unloaded/out-of-bounds areas are impassable by default.
 * Extend this set when new impassable tile types are added (e.g. water, lava).
 */
const SOLID_TILES = new Set<number>([
  TileType.VOID,
  TileType.WALL,
]);

/** Returns true when the tile at the given type value blocks movement. */
function isTileSolid(tileType: number): boolean {
  return SOLID_TILES.has(tileType);
}

// ─── World lookup ─────────────────────────────────────────────────────────────

/**
 * Return the tile type at world tile coordinates (worldTX, worldTY).
 * Returns TileType.VOID for coordinates outside any loaded chunk.
 *
 * Exported so other world-layer modules (e.g. Autotile) can perform
 * neighbour lookups without duplicating the chunk-addressing logic.
 */
export function getTileAt(world: WorldState, worldTX: number, worldTY: number): number {
  const chunkX = Math.floor(worldTX / CHUNK_WIDTH);
  const chunkY = Math.floor(worldTY / CHUNK_HEIGHT);

  const chunk = world.chunks.get(`${chunkX},${chunkY}`);
  if (!chunk) return TileType.VOID;

  const localX = worldTX - chunkX * CHUNK_WIDTH;
  const localY = worldTY - chunkY * CHUNK_HEIGHT;

  return chunk.tiles[localY * CHUNK_WIDTH + localX];
}

// ─── AABB overlap check ───────────────────────────────────────────────────────

/**
 * Returns true when the AABB defined by (left, top, width, height) overlaps
 * at least one solid tile in the world.
 * Uses a small epsilon on the right/bottom edges so exact tile-boundary contact
 * does not count as a collision (allows flush wall-sliding).
 */
function overlapsAnySolid(
    left:   number,
    top:    number,
    width:  number,
    height: number,
    world:  WorldState,
): boolean {
  const EDGE_EPS = 0.01; // pixel epsilon — prevents false positives on tile edges

  const minTX = Math.floor(left              / TILE_SIZE);
  const maxTX = Math.floor((left + width  - EDGE_EPS) / TILE_SIZE);
  const minTY = Math.floor(top               / TILE_SIZE);
  const maxTY = Math.floor((top  + height - EDGE_EPS) / TILE_SIZE);

  for (let ty = minTY; ty <= maxTY; ty++) {
    for (let tx = minTX; tx <= maxTX; tx++) {
      if (isTileSolid(getTileAt(world, tx, ty))) return true;
    }
  }
  return false;
}

// ─── Movement resolution ──────────────────────────────────────────────────────

/**
 * Advance an entity's position by its velocity over dt milliseconds,
 * resolving tile collisions on each axis independently.
 *
 * Separate-axis resolution means the entity slides along walls instead of
 * stopping when it touches a corner — a standard technique for grid-based games.
 *
 * Algorithm per axis:
 *   1. Compute the candidate new position after the full velocity step.
 *   2. If the hitbox at the new position overlaps a solid tile, push the
 *      entity back to the nearest tile boundary in the movement direction.
 *
 * @param x     - Entity origin X (world pixels)
 * @param y     - Entity origin Y (world pixels)
 * @param vx    - Horizontal velocity (pixels/second)
 * @param vy    - Vertical velocity   (pixels/second)
 * @param hb    - Entity hitbox (offsets and size relative to origin)
 * @param world - Current world state used for tile lookups
 * @param dt    - Fixed timestep in milliseconds
 * @returns       New {x, y} origin — velocity unchanged, position resolved
 */
export function resolveMovement(
    x:     number,
    y:     number,
    vx:    number,
    vy:    number,
    hb:    Hitbox,
    world: WorldState,
    dt:    number,
): { x: number; y: number } {
  const dtSec = dt / 1000;

  // ── X axis ──────────────────────────────────────────────────────────────────
  let newX = x + vx * dtSec;

  if (vx !== 0) {
    const hbLeft   = newX + hb.offsetX;
    const hbTop    = y    + hb.offsetY;   // Y is not yet moved for X-axis check
    const hbWidth  = hb.width;
    const hbHeight = hb.height;

    if (overlapsAnySolid(hbLeft, hbTop, hbWidth, hbHeight, world)) {
      if (vx > 0) {
        // Hit a wall to the right — push left edge of nearest wall to our right edge
        const wallTX = Math.floor((hbLeft + hbWidth - 0.01) / TILE_SIZE);
        newX = wallTX * TILE_SIZE - hb.offsetX - hb.width;
      } else {
        // Hit a wall to the left — push right edge of nearest wall to our left edge
        const wallTX = Math.floor(hbLeft / TILE_SIZE);
        newX = (wallTX + 1) * TILE_SIZE - hb.offsetX;
      }
    }
  }

  // ── Y axis ──────────────────────────────────────────────────────────────────
  let newY = y + vy * dtSec;

  if (vy !== 0) {
    const hbLeft   = newX + hb.offsetX;  // Use resolved X for Y-axis check
    const hbTop    = newY + hb.offsetY;
    const hbWidth  = hb.width;
    const hbHeight = hb.height;

    if (overlapsAnySolid(hbLeft, hbTop, hbWidth, hbHeight, world)) {
      if (vy > 0) {
        // Hit a floor tile below — push bottom of hitbox to tile top edge
        const wallTY = Math.floor((hbTop + hbHeight - 0.01) / TILE_SIZE);
        newY = wallTY * TILE_SIZE - hb.offsetY - hb.height;
      } else {
        // Hit a ceiling tile above — push top of hitbox to tile bottom edge
        const wallTY = Math.floor(hbTop / TILE_SIZE);
        newY = (wallTY + 1) * TILE_SIZE - hb.offsetY;
      }
    }
  }

  return { x: newX, y: newY };
}
