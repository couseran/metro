// src/lib/game/engine/RendererModule.ts

import type { GameState } from './SimulationModule';
import type { LoadedAssets } from './AssetLoader';
import type { UniformSheetConfig } from './SpriteSheet';
import { getSourceRect } from './SpriteSheet';
import { ADAM_SHEET } from '../sprites/adam';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RendererConfig {
  canvas:      HTMLCanvasElement;
  tileSize:    number;   // logical tile size in px (e.g. 16)
  scale:       number;   // integer upscale factor for pixel art (e.g. 3 → 48px rendered tiles)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ─── RendererModule ───────────────────────────────────────────────────────────

export class RendererModule {
  private ctx:    CanvasRenderingContext2D;
  private config: RendererConfig;
  private assets: LoadedAssets | null = null;

  constructor(config: RendererConfig) {
    this.config = config;

    const ctx = config.canvas.getContext('2d');
    if (!ctx) throw new Error('[RendererModule] Failed to get 2D context');
    this.ctx = ctx;

    // Pixel art — never smooth. Enforced here and re-checked on every draw
    // in case the browser resets it (some do on canvas resize).
    this.ctx.imageSmoothingEnabled = false;
  }

  // ─── Initialisation ─────────────────────────────────────────────────────────

  /**
   * Called once after assets are loaded, before the game loop starts.
   * Attaches the loaded image map so draw() can reference sprites.
   */
  init(assets: LoadedAssets): void {
    this.assets = assets;
  }

  // ─── Resize ─────────────────────────────────────────────────────────────────

  /**
   * Resize the canvas to match its CSS display size at device pixel ratio.
   * Call this on window resize and on first init.
   * Pixel art scale is handled via ctx.scale, not CSS transform.
   */
  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio ?? 1;
    this.config.canvas.width  = width  * dpr;
    this.config.canvas.height = height * dpr;
    this.ctx.imageSmoothingEnabled = false; // reset after resize
  }

  // ─── Main draw ──────────────────────────────────────────────────────────────

  /**
   * Render one display frame.
   * Called by the GameLoop after each rAF tick — potentially multiple simulation
   * ticks may have run since the last draw.
   *
   * This function NEVER mutates state. It only reads.
   *
   * @param prev    - State from the previous simulation tick
   * @param current - State from the most recent simulation tick
   * @param alpha   - Interpolation factor [0.0 → 1.0] for sub-tick smoothness
   *                  (see GameLoop: alpha = accumulator / FIXED_STEP)
   */
  draw(prev: GameState, current: GameState, alpha: number): void {
    // Re-enforce pixel art on every frame — belt and suspenders
    this.ctx.imageSmoothingEnabled = false;

    this.clear();
    this.drawPlayer(prev, current, alpha);

    // Future layers added here in draw order (back → front):
    // this.drawTilemap(prev, current, alpha);
    // this.drawShadows(prev, current, alpha);
    // this.drawEntities(prev, current, alpha);
    // this.drawNPCs(prev, current, alpha);
    // this.drawParticles(prev, current, alpha);
    // this.drawLighting(prev, current, alpha);
  }

  // ─── Clear ──────────────────────────────────────────────────────────────────

  private clear(): void {
    const { width, height } = this.config.canvas;
    this.ctx.clearRect(0, 0, width, height);
  }

  // ─── Player ─────────────────────────────────────────────────────────────────

  private drawPlayer(prev: GameState, current: GameState, alpha: number): void {
    if (!this.assets) return;

    const sheet = ADAM_SHEET;
    const img   = this.assets.images.get(sheet.src);
    if (!img) {
      console.warn(`[RendererModule] Missing image: ${sheet.src}`);
      return;
    }

    // Interpolate world position for sub-tick smoothness.
    // NOTE: frameIndex is intentionally NOT interpolated — pixel art animation
    // is discrete by design. Lerping frames would look wrong.
    const renderX = lerp(prev.player.x, current.player.x, alpha);
    const renderY = lerp(prev.player.y, current.player.y, alpha);

    // Source rect derived purely from animation state — no branching in renderer
    const { sx, sy, sw, sh } = getSourceRect(current.player.animation, sheet);

    const scale = this.config.scale;

    this.ctx.drawImage(
        img,
        sx, sy, sw, sh,                           // source rect on spritesheet
        Math.round(renderX * scale),              // dest x  (round to avoid sub-pixel blurring)
        Math.round(renderY * scale),              // dest y
        sw * scale,                               // dest width  (integer upscale)
        sh * scale,                               // dest height
    );
  }
}