// src/lib/game/rendering/debug/DebugSortOverlay.ts
//
// Debugging visualisation for Y-sort draw order (Pass 2 — world layer).
//
// For every WorldObject in the sorted draw list, draws a horizontal colored
// line at the world-space Y position used to determine draw order (sortY).
// This lets you see at a glance why one sprite is drawn on top of another,
// and where to adjust sortY offsets for props, tiles, or entities.
//
// Color key:
//   Blue    — wall tile  (world-layer tile, e.g. WALL)
//   Orange  — object-layer prop  (furniture, chests, doors …)
//   Magenta — wall-layer prop    (paintings, windows, wall-mounted items)
//   Green   — entity             (player, NPCs)
//
// The overlay is drawn AFTER drawWorldLayer() so lines appear on top of all
// game sprites.  Toggle with RendererModule.debugSortOverlay = true/false,
// or press the backtick key (`) in-game.

import type { WorldObject } from '../WorldObject';

// ─── Colour palette ───────────────────────────────────────────────────────────

const KIND_COLOR: Record<NonNullable<WorldObject['debugKind']>, string> = {
  'tile':        'rgba( 80, 140, 255, 0.85)',   // blue
  'prop-object': 'rgba(255, 165,  40, 0.85)',   // orange
  'prop-wall':   'rgba(220,  80, 220, 0.85)',   // magenta
  'entity':      'rgba( 50, 220,  90, 0.85)',   // green
};

const KIND_LABEL: Record<NonNullable<WorldObject['debugKind']>, string> = {
  'tile':        'tile',
  'prop-object': 'prop',
  'prop-wall':   'wall-prop',
  'entity':      'entity',
};

// Tiles are very numerous — draw their lines thinner and more transparent so
// they don't overwhelm the display.
const KIND_LINE_WIDTH: Record<NonNullable<WorldObject['debugKind']>, number> = {
  'tile':        0.5,
  'prop-object': 1.5,
  'prop-wall':   1.5,
  'entity':      2,
};

// Only draw a text label for non-tile objects (tiles would create too much noise).
const KIND_SHOW_LABEL: Record<NonNullable<WorldObject['debugKind']>, boolean> = {
  'tile':        false,
  'prop-object': true,
  'prop-wall':   true,
  'entity':      true,
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Draw a horizontal colored line at each WorldObject's sortY value.
 *
 * Must be called AFTER `drawWorldLayer()` with the same `ctx` (viewport
 * transform already applied) and the same sorted `objects` array.
 *
 * @param ctx           - 2D context with viewport transform applied
 * @param objects       - Sorted WorldObject array from buildWorldLayer()
 * @param effectiveScale - config.scale × camera.zoom × dpr
 */
export function drawSortDebugOverlay(
    ctx:            CanvasRenderingContext2D,
    objects:        WorldObject[],
    effectiveScale: number,
): void {
  // The viewport transform is a pure translation — no scale is baked into the
  // context matrix.  Every draw call manually multiplies by effectiveScale.
  // getTransform().f gives us the Y-translation so we can convert a world-space
  // Y (× scale) into screen-space Y for the label pass.
  const translateY = ctx.getTransform().f;

  ctx.save();

  // Draw all lines first, then labels — avoids re-entering save/restore per object.

  // ── Lines (world-transformed space) ─────────────────────────────────────────
  for (const obj of objects) {
    if (!obj.debugKind) continue;
    const color = KIND_COLOR[obj.debugKind];
    const lineW = KIND_LINE_WIDTH[obj.debugKind];

    const drawnY = obj.sortY * effectiveScale;

    ctx.strokeStyle = color;
    ctx.lineWidth   = lineW;
    ctx.beginPath();
    // Draw across a very large X range — the canvas clip region limits output.
    ctx.moveTo(-100_000, drawnY);
    ctx.lineTo( 100_000, drawnY);
    ctx.stroke();
  }

  // ── Labels (screen space) ────────────────────────────────────────────────────
  // Reset the transform so text renders at a consistent 10 px regardless of
  // effectiveScale.
  ctx.resetTransform();
  ctx.font         = '10px monospace';
  ctx.textBaseline = 'bottom';

  for (const obj of objects) {
    if (!obj.debugKind) continue;
    if (!KIND_SHOW_LABEL[obj.debugKind]) continue;

    const color     = KIND_COLOR[obj.debugKind];
    const labelText = `${KIND_LABEL[obj.debugKind]}  y=${obj.sortY.toFixed(1)}`;

    // Screen Y = viewport-translate-Y + sortY drawn in world-scaled coords
    const screenY = translateY + obj.sortY * effectiveScale;

    // Background pill for readability
    const textWidth = ctx.measureText(labelText).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(3, screenY - 12, textWidth + 6, 12);

    ctx.fillStyle = color;
    ctx.fillText(labelText, 6, screenY - 1);
  }

  ctx.restore();
}
