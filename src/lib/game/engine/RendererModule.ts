// src/lib/game/engine/RendererModule.ts
//
// Public lifecycle wrapper for the rendering system.
//
// RendererModule owns the canvas and 2D context, manages resize / DPR scaling,
// and orchestrates the four-pass render pipeline each frame:
//
//   Pass 1a — Ground tiles  (GroundLayer.drawGroundLayer)
//     Flat floor tiles (carpet, stone …).  No depth sort.  Always beneath all
//     world objects and entities.
//
//   Pass 1b — Floor props   (GroundLayer.drawFloorProps)
//     Flat prop-layer objects (rugs, doormats, floor decorations).  Always
//     beneath entities and object-layer props.  No depth sort needed because
//     floor props cannot visually overlap each other (one per tile, per layer).
//
//   Pass 2  — World layer   (WorldLayer.ts)
//     Y-sorted world objects: wall tiles, object-layer props, wall-layer props,
//     and entities (player, NPCs).  Objects with a lower foot-Y are drawn first
//     (visually further back).  Wall-layer props (paintings, windows) participate
//     in this sort with a small positive bias so they draw on top of the wall tile
//     they are mounted on while still sorting correctly with approaching entities.
//
//   Pass 3  — Overlay layer (future)
//     Particles, floating UI, roof tiles with proximity-based transparency, etc.
//
// The game loop calls draw() once per display frame; it never mutates state.

import type { GameState }   from './SimulationModule';
import type { LoadedAssets } from '../assets/AssetLoader';
import { lerpCamera, applyViewportTransform } from '../rendering/ViewportUtils';
import { drawGroundLayer, drawFloorProps }    from '../rendering/layers/GroundLayer';
import { buildWorldLayer, drawWorldLayer }    from '../rendering/layers/WorldLayer';
import { drawSortDebugOverlay }              from '../rendering/debug/DebugSortOverlay';
import { drawHitboxDebugOverlay }            from '../rendering/debug/DebugHitboxOverlay';

// ─── Prop sprite registration (side-effect imports) ───────────────────────────
// Import here (the renderer entry point) so sprites are registered before the
// first draw call.  Must NOT live inside PropSpriteRegistry.ts — same circular
// dependency risk as PropDefinitionRegistration / PropRegistry.ts.
import '../content/props/furnitures/chair/SpriteRegistration';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface RendererConfig {
  canvas:   HTMLCanvasElement;
  /** Logical tile size in world-space pixels (must match TILE_SIZE). */
  tileSize: number;
  /** Integer upscale factor for pixel art (e.g. 3 → each tile rendered at 48×48 px). */
  scale:    number;
}

// ─── RendererModule ───────────────────────────────────────────────────────────

export class RendererModule {
  private ctx:    CanvasRenderingContext2D;
  private config: RendererConfig;
  private assets: LoadedAssets | null = null;
  private dpr:    number = 1;

  /**
   * Toggle the Y-sort debug overlay.
   * When `true`, a colored horizontal line is drawn at the sortY of every
   * world-layer object after Pass 2, making draw-order decisions visible.
   * Keybind: backtick (`)
   */
  public debugSortOverlay = false;

  /**
   * Toggle the hitbox debug overlay.
   * When `true`, draws the collision AABBs for all props and the player:
   *   orange      — tile-snapped prop solids (propSolidIndex, full TILE_SIZE boxes)
   *   yellow/gold — sub-tile prop pixel boxes (propSolidBoxes, precise AABBs)
   *   green       — player physical hitbox
   * Keybind: backslash (\)
   */
  public debugHitboxOverlay = false;

  constructor(config: RendererConfig) {
    this.config = config;

    const ctx = config.canvas.getContext('2d');
    if (!ctx) throw new Error('[RendererModule] Failed to get 2D context');
    this.ctx = ctx;

    // Pixel art must never be filtered — enforce here and re-apply on every
    // draw call in case the browser resets it after a canvas resize.
    this.ctx.imageSmoothingEnabled = false;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /** Call once after assets are loaded, before the game loop starts. */
  init(assets: LoadedAssets): void {
    this.assets = assets;
  }

  /**
   * Resize the backing canvas buffer to match the CSS display size at the
   * device pixel ratio.  Called on mount and whenever the window is resized.
   */
  resize(width: number, height: number): void {
    this.dpr = window.devicePixelRatio ?? 1;
    this.config.canvas.width  = width  * this.dpr;
    this.config.canvas.height = height * this.dpr;
    this.ctx.imageSmoothingEnabled = false;
  }

  // ─── Frame render ────────────────────────────────────────────────────────────

  /**
   * Render one display frame.
   *
   * Called by the GameLoop after each rAF tick.  Never mutates simulation state.
   *
   * @param prev    - Simulation state from the previous tick (used for lerp)
   * @param current - Simulation state from the most recent tick
   * @param alpha   - Interpolation factor: accumulator / FIXED_STEP ∈ [0, 1]
   */
  draw(prev: GameState, current: GameState, alpha: number): void {
    if (!this.assets) return;

    // Re-enforce pixel art mode in case the browser reset it
    this.ctx.imageSmoothingEnabled = false;

    this.clear();

    const camera         = lerpCamera(prev.camera, current.camera, alpha);
    const effectiveScale = this.config.scale * camera.zoom * this.dpr;
    const { canvas }     = this.config;

    // Apply the shared viewport transform once — all layers draw in world-space
    // coordinates (× effectiveScale) so the camera center maps to the canvas center.
    this.ctx.save();
    applyViewportTransform(this.ctx, canvas, camera, effectiveScale);

    // ── Pass 1a: ground tiles ────────────────────────────────────────────────
    // Flat floor tiles — drawn beneath every world object, no sorting needed.
    drawGroundLayer(this.ctx, current, camera, effectiveScale, this.assets, canvas.width, canvas.height);

    // ── Pass 1b: floor props ─────────────────────────────────────────────────
    // Flat prop-layer objects (rugs, doormats) — drawn on top of ground tiles
    // but beneath all entities and object-layer props.  No sorting needed.
    drawFloorProps(this.ctx, current, camera, effectiveScale, this.assets, canvas.width, canvas.height);

    // ── Pass 2: world (Y-sorted) ─────────────────────────────────────────────
    // Wall tiles, object-layer props, wall-layer props, and entities — collected,
    // sorted by foot-Y, drawn back-to-front.  Wall-layer props use a small
    // positive sortY bias so they render on their wall face without appearing
    // as a flat overlay above all entities.
    const worldObjects = buildWorldLayer(
        prev, current, alpha,
        camera, effectiveScale,
        this.assets,
        canvas.width, canvas.height,
    );
    drawWorldLayer(this.ctx, worldObjects, effectiveScale);

    // ── Debug: Y-sort overlay ────────────────────────────────────────────────
    // Colored horizontal lines at each world-object's sortY.  Backtick key.
    if (this.debugSortOverlay) {
      drawSortDebugOverlay(this.ctx, worldObjects, effectiveScale);
    }

    // ── Debug: hitbox overlay ─────────────────────────────────────────────────
    // Collision AABBs for all props and the player.  Backslash key.
    if (this.debugHitboxOverlay) {
      drawHitboxDebugOverlay(this.ctx, current, prev, alpha, effectiveScale);
    }

    // ── Pass 3: overlay (future) ─────────────────────────────────────────────
    // Particles, floating labels, roof tiles, etc.

    this.ctx.restore();
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private clear(): void {
    const { width, height } = this.config.canvas;
    this.ctx.clearRect(0, 0, width, height);
  }
}
