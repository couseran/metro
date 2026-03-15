// src/lib/game/rendering/layers/WorldLayer.ts
//
// Render Pass 2 — the Y-sorted world layer.
//
// Every object that has vertical extent and can visually overlap an entity is
// converted into a WorldObject, sorted by sortY (the world-space Y of its visual
// foot), and drawn back-to-front.  This means:
//
//   • A player standing ABOVE a wall (lower Y) is drawn before the wall,
//     so the wall sprite correctly occludes the player.
//   • A player standing BELOW a wall (higher Y) is drawn after the wall,
//     so the player appears in front.
//
// Sources collected each frame:
//   1. World-layer tiles  (walls and any future tall tiles)
//   2. Props              (furniture, trees, interactive objects)
//   3. Entities           (player; extend for NPCs, remote players)
//
// To add a new source of WorldObjects, add a collect* function and include
// its output in buildWorldLayer().

import type { GameState }    from '../../engine/SimulationModule';
import type { CameraState }  from '../../types/world';
import type { LoadedAssets } from '../../assets/AssetLoader';
import type { WorldObject }  from '../WorldObject';
import { sortWorldObjects }  from '../WorldObject';
import { getTileDrawInfo, getTileRenderLayer } from '../tiles/TilesetConfig';
import { ROOM_BUILDER_TILESET }               from '../tiles/tilesets/RoomBuilderTileset';
import { getPropSprite }                      from '../props/PropSpriteRegistry';
import { ADAM_SHEET, ADAM_ANIMATIONS }        from '../sprites/characters/adam';
import { getSourceRect }                      from '../sprites/SpriteSheet';
import { PLAYER_HITBOX }                      from '../../world/TileCollision';
import { lerp, getViewportTileBounds }        from '../ViewportUtils';
import { TILE_SIZE, CHUNK_WIDTH, CHUNK_HEIGHT } from '../../world/WorldConstants';

// ─── Tile collector ───────────────────────────────────────────────────────────

/**
 * Convert all visible 'world'-layer tiles into WorldObjects.
 *
 * Only tiles whose tileRenderLayer is 'world' are included (e.g. walls).
 * Off-screen tiles are culled using the same viewport bounds as the ground layer.
 */
function collectTileObjects(
    state:          GameState,
    camera:         CameraState,
    effectiveScale: number,
    assets:         LoadedAssets,
    canvasWidth:    number,
    canvasHeight:   number,
): WorldObject[] {
  const objects: WorldObject[] = [];

  const img = assets.images.get(ROOM_BUILDER_TILESET.src);
  if (!img) return objects;

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
        if (getTileRenderLayer(tileType, ROOM_BUILDER_TILESET) !== 'world') continue;

        // Read the precomputed autotile bitmask — 0 for non-autotiled tiles
        const variant = chunk.variantCache[i];
        const draw    = getTileDrawInfo(tileType, ROOM_BUILDER_TILESET, variant);
        if (!draw) continue;

        // Sort by the bottom edge of the tile's base (ground) row.
        // This is the correct anchor: a wall at row 5 should sort at Y = 6 * TILE_SIZE,
        // meaning it draws after entities whose feet are above that line, and before
        // entities whose feet are below it.
        const sortY = (worldTY + 1) * TILE_SIZE;

        // Capture loop-local values explicitly so each closure is independent.
        const capturedDraw = draw;
        const capturedTX   = worldTX;
        const capturedTY   = worldTY;

        objects.push({
          sortY,
          draw(ctx, scale) {
            const dstX = Math.round( capturedTX * TILE_SIZE                         * scale);
            const dstY = Math.round((capturedTY * TILE_SIZE + capturedDraw.yOffset) * scale);
            const dstW = Math.round( capturedDraw.sw                                * scale);
            const dstH = Math.round( capturedDraw.sh                                * scale);
            ctx.drawImage(img, capturedDraw.sx, capturedDraw.sy, capturedDraw.sw, capturedDraw.sh, dstX, dstY, dstW, dstH);
          },
        });
      }
    }
  }

  return objects;
}

// ─── Prop collector ───────────────────────────────────────────────────────────

/**
 * Convert all active props into WorldObjects.
 *
 * The sort key is the bottom edge of the rendered sprite, which correctly
 * represents the prop's "foot" on the ground plane regardless of anchor.
 *
 * TODO: advance animated prop frame indices using state.tick and fps.
 */
function collectPropObjects(
    state:  GameState,
    assets: LoadedAssets,
): WorldObject[] {
  const objects: WorldObject[] = [];

  for (const prop of state.props.values()) {
    const spriteConfig = getPropSprite(prop.kind);
    if (!spriteConfig) continue;

    // Resolve the frame set for this variant.  Connecting props (fences, pipes …)
    // store a bitmask in prop.variant; non-connecting props always have variant 0
    // and fall through to the default frames.
    const frames = spriteConfig.variantFrames?.[prop.variant] ?? spriteConfig.frames;
    const frame  = frames[0];
    const img    = assets.images.get(frame.src);
    if (!img) {
      console.warn(`[WorldLayer] Missing prop image: ${frame.src}`);
      continue;
    }

    // World-space draw origin (top-left of the sprite), derived from tile coords + anchor
    const worldX = prop.x * TILE_SIZE - frame.anchorX * frame.sw;
    const worldY = prop.y * TILE_SIZE - frame.anchorY * frame.sh;

    const capturedFrame  = frame;
    const capturedWorldX = worldX;
    const capturedWorldY = worldY;

    objects.push({
      // Sort by the bottom edge of the sprite (foot of the prop)
      sortY: worldY + frame.sh,
      draw(ctx, scale) {
        const dstX = Math.round(capturedWorldX      * scale);
        const dstY = Math.round(capturedWorldY      * scale);
        const dstW = Math.round(capturedFrame.sw    * scale);
        const dstH = Math.round(capturedFrame.sh    * scale);
        ctx.drawImage(img, capturedFrame.sx, capturedFrame.sy, capturedFrame.sw, capturedFrame.sh, dstX, dstY, dstW, dstH);
      },
    });
  }

  return objects;
}

// ─── Entity collector ─────────────────────────────────────────────────────────

/**
 * Convert all renderable entities into WorldObjects.
 *
 * Entity positions are interpolated between the previous and current simulation
 * ticks using alpha so movement appears smooth at any display refresh rate.
 * The animation frame index is NOT interpolated — pixel-art animation advances
 * in discrete steps by design.
 *
 * Currently only the local player is rendered.  When remote players and NPCs are
 * added, collect their states here using the same pattern.
 *
 * @param prev    - Game state from the previous simulation tick (for lerp)
 * @param current - Game state from the most recent simulation tick
 * @param alpha   - Interpolation factor: accumulator / FIXED_STEP ∈ [0, 1]
 * @param assets  - Loaded image map
 */
function collectEntityObjects(
    prev:    GameState,
    current: GameState,
    alpha:   number,
    assets:  LoadedAssets,
): WorldObject[] {
  const objects: WorldObject[] = [];

  const img = assets.images.get(ADAM_SHEET.src);
  if (!img) {
    console.warn(`[WorldLayer] Missing player sprite: ${ADAM_SHEET.src}`);
    return objects;
  }

  // Sub-tick position interpolation for smooth rendering
  const renderX = lerp(prev.player.x, current.player.x, alpha);
  const renderY = lerp(prev.player.y, current.player.y, alpha);

  const { sx, sy, sw, sh } = getSourceRect(current.player.animation, ADAM_SHEET, ADAM_ANIMATIONS);

  objects.push({
    // Sort by the bottom of the player's physical hitbox (their feet),
    // not the bottom of the sprite — this matches the collision system's notion
    // of where the player "stands" and gives correct overlap with wall tiles.
    // The -4 avoid clipping effect when user is next to a y-long wall
    sortY: renderY + PLAYER_HITBOX.offsetY + PLAYER_HITBOX.height - 4,
    draw(ctx, scale) {
      const dstX = Math.round(renderX * scale);
      const dstY = Math.round(renderY * scale);
      const dstW = Math.round(sw      * scale);
      const dstH = Math.round(sh      * scale);
      ctx.drawImage(img, sx, sy, sw, sh, dstX, dstY, dstW, dstH);
    },
  });

  return objects;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Gather WorldObjects from all sources (tiles, props, entities) and sort
 * them by sortY in ascending order (back → front).
 *
 * Call this once per frame before drawWorldLayer().
 *
 * @param prev           - Previous tick state (for entity lerp)
 * @param current        - Current tick state
 * @param alpha          - Interpolation factor [0, 1]
 * @param camera         - Interpolated camera for this frame (for tile culling)
 * @param effectiveScale - config.scale × camera.zoom
 * @param assets         - Loaded image map
 * @param canvasWidth    - Canvas width in device pixels
 * @param canvasHeight   - Canvas height in device pixels
 * @returns Sorted array of WorldObjects ready to draw
 */
export function buildWorldLayer(
    prev:           GameState,
    current:        GameState,
    alpha:          number,
    camera:         CameraState,
    effectiveScale: number,
    assets:         LoadedAssets,
    canvasWidth:    number,
    canvasHeight:   number,
): WorldObject[] {
  const objects: WorldObject[] = [
    ...collectTileObjects(current, camera, effectiveScale, assets, canvasWidth, canvasHeight),
    ...collectPropObjects(current, assets),
    ...collectEntityObjects(prev, current, alpha, assets),
  ];

  return sortWorldObjects(objects);
}

/**
 * Draw Pass 2: iterate the pre-sorted WorldObject list and call each object's
 * draw() function.  Objects must already be sorted (call buildWorldLayer first).
 *
 * @param ctx           - 2D context with viewport transform applied
 * @param objects       - Sorted WorldObject array from buildWorldLayer()
 * @param effectiveScale - config.scale × camera.zoom
 */
export function drawWorldLayer(
    ctx:            CanvasRenderingContext2D,
    objects:        WorldObject[],
    effectiveScale: number,
): void {
  for (const obj of objects) {
    obj.draw(ctx, effectiveScale);
  }
}
