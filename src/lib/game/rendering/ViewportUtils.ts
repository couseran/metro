// src/lib/game/rendering/ViewportUtils.ts
//
// Pure helper functions shared across all render layers.
// Nothing here knows about game state or specific tile types.

import type { CameraState } from '../types/world';
import { TILE_SIZE }        from '../world/WorldConstants';

// ─── Math ─────────────────────────────────────────────────────────────────────

/** Linear interpolation between a and b at factor t ∈ [0, 1]. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ─── Camera ───────────────────────────────────────────────────────────────────

/**
 * Interpolate between two camera snapshots.
 * Called every display frame with alpha = accumulator / FIXED_STEP so the
 * viewport pans smoothly even when the simulation tick rate is lower than the
 * display refresh rate.  Zoom is also interpolated for smooth zoom transitions.
 *
 * @param prev    - Camera state from the previous simulation tick
 * @param current - Camera state from the most recent simulation tick
 * @param alpha   - Interpolation factor [0 → 1]
 */
export function lerpCamera(
    prev:    CameraState,
    current: CameraState,
    alpha:   number,
): CameraState {
  return {
    x:    lerp(prev.x,    current.x,    alpha),
    y:    lerp(prev.y,    current.y,    alpha),
    zoom: lerp(prev.zoom, current.zoom, alpha),
  };
}

// ─── Viewport tile bounds ─────────────────────────────────────────────────────

/**
 * Tile-coordinate bounds of the visible viewport.
 * Used by every layer to cull off-screen tiles before issuing draw calls.
 */
export interface ViewportTileBounds {
  minTX: number;
  minTY: number;
  maxTX: number;
  maxTY: number;
}

/**
 * Compute the range of tile coordinates visible through the camera.
 *
 * A one-tile margin is added on every edge so tiles at the border finish
 * scrolling into view before they are culled (prevents pop-in artefacts).
 *
 * @param camera         - Interpolated camera state for this frame
 * @param effectiveScale - config.scale × camera.zoom
 * @param canvasWidth    - Canvas width in device pixels (post-DPR)
 * @param canvasHeight   - Canvas height in device pixels (post-DPR)
 */
export function getViewportTileBounds(
    camera:         CameraState,
    effectiveScale: number,
    canvasWidth:    number,
    canvasHeight:   number,
): ViewportTileBounds {
  const halfW = canvasWidth  / 2 / effectiveScale;
  const halfH = canvasHeight / 2 / effectiveScale;

  return {
    minTX: Math.floor((camera.x - halfW) / TILE_SIZE) - 1,
    minTY: Math.floor((camera.y - halfH) / TILE_SIZE) - 1,
    maxTX: Math.ceil( (camera.x + halfW) / TILE_SIZE) + 1,
    maxTY: Math.ceil( (camera.y + halfH) / TILE_SIZE) + 1,
  };
}

// ─── Canvas transform ─────────────────────────────────────────────────────────

/**
 * Translate the 2D context so that world-space × effectiveScale coordinates
 * map to the correct screen pixel, with the camera center aligned to the
 * canvas center.
 *
 * After this call every layer can draw at (worldX * scale, worldY * scale)
 * and the result will be correctly positioned on screen.
 *
 * Must be balanced by a matching ctx.restore() in the caller.
 */
export function applyViewportTransform(
    ctx:            CanvasRenderingContext2D,
    canvas:         HTMLCanvasElement,
    camera:         CameraState,
    effectiveScale: number,
): void {
  ctx.translate(
      canvas.width  / 2 - camera.x * effectiveScale,
      canvas.height / 2 - camera.y * effectiveScale,
  );
}
