// src/lib/game/rendering/layers/GroundLayer.ts
//
// Render Pass 1 — the ground layer.
//
// Draws all tiles whose render layer is 'ground': flat surfaces such as
// carpet, stone, and sand that are always visually beneath every entity
// and world object.  Because these tiles never overlap entities vertically,
// no depth sorting is needed — they are rasterised in simple grid order.
//
// Off-screen tiles are culled per-tile to avoid unnecessary draw calls.

import type { GameState }    from '../../engine/SimulationModule';
import type { CameraState }  from '../../types/world';
import type { LoadedAssets } from '../../assets/AssetLoader';
import { getTileDrawInfo, getTileRenderLayer } from '../tiles/TilesetConfig';
import { ROOM_BUILDER_TILESET }               from '../tiles/tilesets/RoomBuilderTileset';
import { getViewportTileBounds }              from '../ViewportUtils';
import { TILE_SIZE, CHUNK_WIDTH, CHUNK_HEIGHT } from '../../world/WorldConstants';

// ─── Pass 1 ───────────────────────────────────────────────────────────────────

/**
 * Draw all ground-layer tiles visible in the current viewport.
 *
 * The viewport transform must have been applied to `ctx` before calling this
 * (see applyViewportTransform in ViewportUtils).  All draw coordinates are in
 * world-space pixels × effectiveScale.
 *
 * @param ctx           - 2D context with viewport transform applied
 * @param state         - Current (post-tick) game state — world tile data
 * @param camera        - Interpolated camera for this frame (for culling)
 * @param effectiveScale - config.scale × camera.zoom
 * @param assets        - Loaded image map
 * @param canvasWidth   - Canvas width in device pixels
 * @param canvasHeight  - Canvas height in device pixels
 */
export function drawGroundLayer(
    ctx:            CanvasRenderingContext2D,
    state:          GameState,
    camera:         CameraState,
    effectiveScale: number,
    assets:         LoadedAssets,
    canvasWidth:    number,
    canvasHeight:   number,
): void {
  const img = assets.images.get(ROOM_BUILDER_TILESET.src);
  if (!img) {
    console.warn(`[GroundLayer] Missing tileset image: ${ROOM_BUILDER_TILESET.src}`);
    return;
  }

  const vp = getViewportTileBounds(camera, effectiveScale, canvasWidth, canvasHeight);

  for (const [key, chunk] of state.world.chunks) {
    if (!state.world.activeChunks.has(key)) continue;

    const originTX = chunk.chunkX * CHUNK_WIDTH;
    const originTY = chunk.chunkY * CHUNK_HEIGHT;

    for (let localY = 0; localY < CHUNK_HEIGHT; localY++) {
      const worldTY = originTY + localY;
      if (worldTY < vp.minTY || worldTY >= vp.maxTY) continue;

      for (let localX = 0; localX < CHUNK_WIDTH; localX++) {
        const worldTX = originTX + localX;
        if (worldTX < vp.minTX || worldTX >= vp.maxTX) continue;

        const i        = localY * CHUNK_WIDTH + localX;
        const tileType = chunk.tiles[i];

        // Only draw 'ground' tiles here; 'world' tiles are handled by WorldLayer
        if (getTileRenderLayer(tileType, ROOM_BUILDER_TILESET) !== 'ground') continue;

        // Read the precomputed autotile bitmask — 0 for non-autotiled tiles
        const variant = chunk.variantCache[i];
        const draw    = getTileDrawInfo(tileType, ROOM_BUILDER_TILESET, variant);
        if (!draw) continue;

        // Destination coordinates are rounded to integer pixels.
        // Even after a rounded viewport translate, effectiveScale may be
        // non-integer (fractional DPR × zoom), making worldTX * TILE_SIZE * scale
        // fractional.  Rounding here prevents per-tile sub-pixel offsets that
        // would cause the canvas UV mapping to bleed into adjacent spritesheet cells.
        const dstX = Math.round( worldTX * TILE_SIZE                    * effectiveScale);
        const dstY = Math.round((worldTY * TILE_SIZE + draw.yOffset)    * effectiveScale);
        const dstW = Math.round( draw.sw                                 * effectiveScale);
        const dstH = Math.round( draw.sh                                 * effectiveScale);

        ctx.drawImage(img, draw.sx, draw.sy, draw.sw, draw.sh, dstX, dstY, dstW, dstH);
      }
    }
  }
}
