// src/lib/game/rendering/debug/DebugHitboxOverlay.ts
//
// Debugging visualisation for collision AABBs.
//
// Draws the exact bounding boxes used by the movement resolution system,
// colour-coded by collision category.  Useful for diagnosing why the player
// gets blocked, where a prop's physical boundary actually is, and how
// solidInset asymmetry looks at runtime vs the sprite.
//
// Color key:
//   Green       — player physical hitbox (the AABB tested against all solids)
//   Orange      — tile-snapped prop solid  (full TILE_SIZE box, propSolidIndex)
//   Yellow/gold — sub-tile prop pixel box  (precise AABB, propSolidBoxes)
//
// The two prop categories correspond directly to the two collision paths in
// resolveMovement(): propSolidIndex (fast tile-grid test) and propSolidBoxes
// (pixel-accurate AABB test for props with any solidInset side > 0).
//
// Toggle with RendererModule.debugHitboxOverlay = true/false,
// or press the backslash key (\) in-game.

import type { GameState }  from '../../engine/SimulationModule';
import { lerp }            from '../ViewportUtils';
import { PLAYER_HITBOX }   from '../../world/TileCollision';
import { TILE_SIZE }       from '../../world/WorldConstants';

// ─── Colour palette ───────────────────────────────────────────────────────────

const COLOR_PLAYER      = 'rgba( 50, 220,  90, 1.0)';
const COLOR_PLAYER_FILL = 'rgba( 50, 220,  90, 0.15)';

const COLOR_TILE_SNAP      = 'rgba(255, 140,   0, 1.0)';
const COLOR_TILE_SNAP_FILL = 'rgba(255, 140,   0, 0.10)';

const COLOR_PIXEL_BOX      = 'rgba(255, 220,  50, 1.0)';
const COLOR_PIXEL_BOX_FILL = 'rgba(255, 220,  50, 0.15)';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Draw a filled + outlined AABB in the (already-transformed) world-scaled ctx. */
function drawBox(
    ctx:    CanvasRenderingContext2D,
    x:      number,
    y:      number,
    w:      number,
    h:      number,
    stroke: string,
    fill:   string,
    scale:  number,
): void {
    const dx = Math.round(x * scale);
    const dy = Math.round(y * scale);
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);

    ctx.fillStyle = fill;
    ctx.fillRect(dx, dy, dw, dh);

    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 1;
    ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Draw collision AABBs for all active props and the player.
 *
 * Must be called with the viewport transform already applied (same as every
 * other layer — see RendererModule.draw).  Labels are drawn in screen space
 * via ctx.resetTransform() so they remain a consistent pixel size.
 *
 * @param ctx           - 2D context with viewport transform applied
 * @param current       - Current simulation tick state
 * @param prev          - Previous simulation tick state (for player lerp)
 * @param alpha         - Interpolation factor [0, 1]
 * @param effectiveScale - config.scale × camera.zoom × dpr
 */
export function drawHitboxDebugOverlay(
    ctx:            CanvasRenderingContext2D,
    current:        GameState,
    prev:           GameState,
    alpha:          number,
    effectiveScale: number,
): void {
    // Capture the viewport translation so we can convert world → screen coords
    // for the label pass without inverting the full transform matrix.
    const transform  = ctx.getTransform();
    const translateX = transform.e;
    const translateY = transform.f;

    ctx.save();

    // ── 1. Tile-snapped prop solids (propSolidIndex) ───────────────────────────
    // Each "tx,ty" key is one full tile that blocks movement.
    for (const key of current.propSolidIndex) {
        const comma = key.indexOf(',');
        const tx    = parseInt(key.slice(0, comma), 10);
        const ty    = parseInt(key.slice(comma + 1), 10);

        drawBox(
            ctx,
            tx * TILE_SIZE,
            ty * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE,
            COLOR_TILE_SNAP,
            COLOR_TILE_SNAP_FILL,
            effectiveScale,
        );
    }

    // ── 2. Sub-tile prop pixel boxes (propSolidBoxes) ─────────────────────────
    // Precise AABBs for props with any solidInset side > 0.
    for (const [, box] of current.propSolidBoxes) {
        drawBox(
            ctx,
            box.x,
            box.y,
            box.w,
            box.h,
            COLOR_PIXEL_BOX,
            COLOR_PIXEL_BOX_FILL,
            effectiveScale,
        );
    }

    // ── 3. Player hitbox ──────────────────────────────────────────────────────
    const renderX = lerp(prev.player.x, current.player.x, alpha);
    const renderY = lerp(prev.player.y, current.player.y, alpha);

    drawBox(
        ctx,
        renderX + PLAYER_HITBOX.offsetX,
        renderY + PLAYER_HITBOX.offsetY,
        PLAYER_HITBOX.width,
        PLAYER_HITBOX.height,
        COLOR_PLAYER,
        COLOR_PLAYER_FILL,
        effectiveScale,
    );

    // ── Labels (screen space) ─────────────────────────────────────────────────
    // Reset the transform so text renders at a fixed 10 px on-screen size,
    // matching the convention from DebugSortOverlay.
    ctx.resetTransform();
    ctx.font         = '10px monospace';
    ctx.textBaseline = 'top';

    // Label: player hitbox
    {
        const sx = translateX + Math.round((renderX + PLAYER_HITBOX.offsetX) * effectiveScale);
        const sy = translateY + Math.round((renderY + PLAYER_HITBOX.offsetY) * effectiveScale);
        _drawLabel(ctx, 'player', sx, sy - 13, COLOR_PLAYER);
    }

    // Labels: sub-tile prop pixel boxes
    for (const [id, box] of current.propSolidBoxes) {
        const prop = current.props.get(id);
        if (!prop) continue;

        const sx = translateX + Math.round(box.x * effectiveScale);
        const sy = translateY + Math.round(box.y * effectiveScale);
        _drawLabel(ctx, prop.type, sx, sy - 13, COLOR_PIXEL_BOX);
    }

    ctx.restore();
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function _drawLabel(
    ctx:   CanvasRenderingContext2D,
    text:  string,
    x:     number,
    y:     number,
    color: string,
): void {
    const w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 1, y, w + 6, 12);
    ctx.fillStyle = color;
    ctx.fillText(text, x + 2, y + 1);
}
