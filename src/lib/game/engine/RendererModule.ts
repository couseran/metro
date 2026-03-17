// src/lib/game/engine/RendererModule.ts
//
// Public lifecycle wrapper for the rendering system.
//
// RendererModule owns the canvas and 2D context, manages resize / DPR scaling,
// and orchestrates the three-pass render pipeline each frame:
//
//   Pass 1 — Ground layer  (GroundLayer.ts)
//     Flat floor tiles (carpet, stone …).  No depth sort.  Always beneath all
//     world objects and entities.
//
//   Pass 2 — World layer   (WorldLayer.ts)
//     Y-sorted world objects: wall tiles, props, and entities (player, NPCs).
//     Objects with a lower foot-Y are drawn first (visually further back).
//     This is the pass that makes entities correctly appear behind or in front
//     of tall sprites such as walls.
//
//   Pass 3 — Overlay layer (future)
//     Particles, floating UI, roof tiles with proximity-based transparency, etc.
//
// The game loop calls draw() once per display frame; it never mutates state.

import type { GameState }   from './SimulationModule';
import type { LoadedAssets } from '../assets/AssetLoader';
import { lerpCamera, applyViewportTransform } from '../rendering/ViewportUtils';
import { drawGroundLayer }                    from '../rendering/layers/GroundLayer';
import { buildWorldLayer, drawWorldLayer }    from '../rendering/layers/WorldLayer';

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

    // ── Pass 1: ground ──────────────────────────────────────────────────────
    // Flat floor tiles — drawn beneath every world object, no sorting needed.
    drawGroundLayer(this.ctx, current, camera, effectiveScale, this.assets, canvas.width, canvas.height);

    // ── Pass 2: world (Y-sorted) ─────────────────────────────────────────────
    // Walls, props, and entities — collected, sorted by foot-Y, drawn back-to-front.
    const worldObjects = buildWorldLayer(
        prev, current, alpha,
        camera, effectiveScale,
        this.assets,
        canvas.width, canvas.height,
    );
    drawWorldLayer(this.ctx, worldObjects, effectiveScale);

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
