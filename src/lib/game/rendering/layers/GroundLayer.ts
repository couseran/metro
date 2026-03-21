// src/lib/game/rendering/layers/GroundLayer.ts
//
// Render Pass 1 — the ground layer.
//
// Two sub-passes are executed in sequence before the Y-sorted world layer:
//
//   1a. Ground tiles  (drawGroundLayer)
//       Flat surface tiles (carpet, stone, sand …) that are always visually
//       beneath every entity and world object.  No depth sorting needed.
//
//   1b. Floor props   (drawFloorProps)
//       Flat prop-layer objects (rugs, doormats, floor decorations) that sit
//       on top of the tile surface but always beneath entities and object-layer
//       props.  Drawn in any order because floor props cannot visually overlap
//       each other (the placement system allows at most one floor prop per tile).
//
// Off-screen elements are culled per-tile / per-prop to avoid unnecessary draw calls.

import type { GameState }    from '../../engine/SimulationModule';
import type { CameraState }  from '../../types/world';
import type { LoadedAssets } from '../../assets/AssetLoader';
import { getTileDrawInfo, getTileRenderLayer } from '../tiles/TilesetConfig';
import { ROOM_BUILDER_TILESET }               from '../tiles/tilesets/RoomBuilderTileset';
import { getPropSprite }                      from '$lib/game/systems/props/PropSpriteRegistry';
import { resolveActiveFrames }                from '$lib/game/systems/props/PropSpriteConfig';
import { getViewportTileBounds }              from '../ViewportUtils';
import { TILE_SIZE, CHUNK_WIDTH, CHUNK_HEIGHT } from '../../world/WorldConstants';

// ─── Pass 1a: ground tiles ────────────────────────────────────────────────────

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

        // Read the precomputed autotile bitmask and authored material index
        const variant  = chunk.variantCache[i];
        const material = chunk.materialTiles[i];
        const draw     = getTileDrawInfo(tileType, ROOM_BUILDER_TILESET, variant, material);
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

// ─── Pass 1b: floor props ─────────────────────────────────────────────────────

/**
 * Draw all floor-layer props visible in the current viewport.
 *
 * Floor props (rugs, doormats, flat decorations) are always beneath entities
 * and object-layer props, so no Y-sorting is needed — they are drawn in any
 * order, just like ground tiles.
 *
 * Viewport culling is based on the prop's tile-aligned bounding box.  A prop
 * is drawn if any part of its footprint is within the viewport.
 *
 * This function handles both single-frame and tiled-repeat sprite layouts.
 *
 * @param ctx           - 2D context with viewport transform applied
 * @param state         - Current game state (props map)
 * @param camera        - Interpolated camera for this frame (for culling)
 * @param effectiveScale - config.scale × camera.zoom
 * @param assets        - Loaded image map
 * @param canvasWidth   - Canvas width in device pixels
 * @param canvasHeight  - Canvas height in device pixels
 */
export function drawFloorProps(
    ctx:            CanvasRenderingContext2D,
    state:          GameState,
    camera:         CameraState,
    effectiveScale: number,
    assets:         LoadedAssets,
    canvasWidth:    number,
    canvasHeight:   number,
): void {
  if (state.props.size === 0) return;

  const vp = getViewportTileBounds(camera, effectiveScale, canvasWidth, canvasHeight);

  for (const prop of state.props.values()) {
    if (prop.layer !== 'floor') continue;

    // Viewport cull: prop's footprint bounding box vs visible tile range
    if (
      prop.x + prop.width  <= vp.minTX || prop.x >= vp.maxTX ||
      prop.y + prop.height <= vp.minTY || prop.y >= vp.maxTY
    ) continue;

    const spriteConfig = getPropSprite(prop.type);
    if (!spriteConfig) continue;

    // ── Tiled-repeat path ─────────────────────────────────────────────────────
    if (spriteConfig.tiledRepeat) {
      const tr  = spriteConfig.tiledRepeat;
      const img = assets.images.get(tr.src);
      if (!img) {
        console.warn(`[GroundLayer] Missing floor prop image: ${tr.src} (type: ${prop.type})`);
        continue;
      }

      const dstY = Math.round(prop.y * TILE_SIZE * effectiveScale);
      const dstW = Math.round(tr.sectionWidth * effectiveScale);
      const dstH = Math.round(tr.totalHeight  * effectiveScale);

      for (let col = 0; col < prop.width; col++) {
        const srcX =
            col === 0                  ? tr.leftSx  :
            col === prop.width - 1     ? tr.rightSx :
                                         tr.midSx;
        const dstX = Math.round((prop.x + col) * TILE_SIZE * effectiveScale);
        ctx.drawImage(img, srcX, tr.sy, tr.sectionWidth, tr.totalHeight, dstX, dstY, dstW, dstH);
      }
      continue;
    }

    // ── Standard single-frame path ────────────────────────────────────────────
    const frames = resolveActiveFrames(
        spriteConfig,
        prop.rotation,
        prop.stateId,
        prop.variant,
    );
    const frame = frames[prop.animFrame % frames.length];
    const img   = assets.images.get(frame.src);
    if (!img) {
      console.warn(`[GroundLayer] Missing floor prop image: ${frame.src} (type: ${prop.type})`);
      continue;
    }

    const worldX = prop.x * TILE_SIZE - frame.anchorX * frame.sw;
    const worldY = prop.y * TILE_SIZE - frame.anchorY * frame.sh;

    const dstX = Math.round(worldX     * effectiveScale);
    const dstY = Math.round(worldY     * effectiveScale);
    const dstW = Math.round(frame.sw   * effectiveScale);
    const dstH = Math.round(frame.sh   * effectiveScale);

    ctx.drawImage(img, frame.sx, frame.sy, frame.sw, frame.sh, dstX, dstY, dstW, dstH);
  }
}
