// src/lib/game/rendering/WorldObject.ts
//
// The WorldObject interface is the fundamental abstraction for the Y-sorted
// render pass (Pass 2).  Anything that can visually overlap an entity —
// wall tiles, props, the player, NPCs — is converted into a WorldObject
// so the renderer can sort them all together in one unified depth pass.
//
// Flat ground tiles (carpet, stone, sand …) are NOT WorldObjects; they are
// drawn unconditionally in Pass 1 because they are always beneath everything.

// ─── Interface ────────────────────────────────────────────────────────────────

/**
 * A single drawable element that participates in Y-sort depth ordering.
 *
 * During each frame the renderer collects WorldObjects from every source
 * (tile chunks, prop map, entity map), sorts them by sortY ascending, and
 * calls draw() in order.  This implements the painter's algorithm so objects
 * lower on screen — which are visually closer to the player — correctly
 * appear in front of objects higher on screen.
 */
export interface WorldObject {
  /**
   * World-space Y coordinate of this object's visual "foot" in pixels.
   *
   * Objects are drawn in ascending sortY order (smallest = drawn first =
   * visually furthest back).  Choosing the foot rather than the origin
   * means a tall sprite (e.g. a wall or a tree) is correctly ordered
   * relative to an entity standing at its base.
   *
   * Conventions:
   *   - Tile at row ty       →  sortY = (ty + 1) * TILE_SIZE
   *   - Entity at pixel y    →  sortY = y + hitbox.offsetY + hitbox.height
   *   - Prop at tile py      →  sortY = (py + height) * TILE_SIZE + sortYOffset
   */
  sortY: number;

  /**
   * Object category — used by the debug sort overlay to colour-code draw-order
   * lines.  Present only when the debug overlay is active; tree-shaken in
   * production code paths that never access it.
   */
  debugKind?: 'tile' | 'prop-object' | 'prop-wall' | 'entity';

  /**
   * Render this object onto the canvas.
   *
   * The viewport transform (camera translate + scale) has already been applied
   * to `ctx` when this is called.  All coordinates must be expressed as
   * world-space pixels × effectiveScale.
   *
   * @param ctx           - 2D rendering context (transform already applied)
   * @param effectiveScale - config.scale × camera.zoom (pixel-art upscale factor)
   */
  draw(ctx: CanvasRenderingContext2D, effectiveScale: number): void;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Sort a list of WorldObjects by sortY ascending (back → front).
 * Mutates the array in place for performance and returns it for chaining.
 */
export function sortWorldObjects(objects: WorldObject[]): WorldObject[] {
  return objects.sort((a, b) => a.sortY - b.sortY);
}
