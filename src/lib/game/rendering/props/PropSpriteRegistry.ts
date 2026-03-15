// src/lib/game/rendering/props/PropSpriteRegistry.ts
//
// Maps each PropKind to its visual configuration.
// Props with no entry here are silently skipped by the renderer.
//
// HOW TO ADD A PROP:
//   1. Open the source image in an editor and note the sx/sy/sw/sh of the sprite.
//   2. Choose anchorX/anchorY:
//        - Floor-level props (campfire, chest lid-closed): anchorX=0.5, anchorY=1.0
//        - Tall props (tree, wall): anchorX=0.5, anchorY=1.0 (bottom-center on base tile)
//   3. Add an entry under the matching PropKind key.

import type { PropSpriteConfig } from './PropSpriteConfig';
import type { PropKind }         from '../../types/props';

/**
 * Registry of visual configs keyed by PropKind.
 * All source rects refer to Room_Builder_16x16.png unless noted otherwise.
 * TODO: Fill in correct sx/sy values by inspecting the sprite sheet.
 */
export const PROP_SPRITES: Partial<Record<PropKind, PropSpriteConfig>> = {
  // ── Natural ──────────────────────────────────────────────────────────────────
  // tree: {
  //   frames: [{ src: '/sprites/tilesets/Room_Builder_16x16.png', sx: 0, sy: 0, sw: 16, sh: 32, anchorX: 0.5, anchorY: 1.0 }],
  // },
  // rock: {
  //   frames: [{ src: '/sprites/tilesets/Room_Builder_16x16.png', sx: 0, sy: 0, sw: 16, sh: 16, anchorX: 0.5, anchorY: 1.0 }],
  // },
  // bush: {
  //   frames: [{ src: '/sprites/tilesets/Room_Builder_16x16.png', sx: 0, sy: 0, sw: 16, sh: 16, anchorX: 0.5, anchorY: 1.0 }],
  // },

  // ── Interactive ──────────────────────────────────────────────────────────────
  // chest: {
  //   frames: [{ src: '/sprites/tilesets/Room_Builder_16x16.png', sx: 0, sy: 0, sw: 16, sh: 16, anchorX: 0.5, anchorY: 1.0 }],
  // },
  // sign: {
  //   frames: [{ src: '/sprites/tilesets/Room_Builder_16x16.png', sx: 0, sy: 0, sw: 16, sh: 16, anchorX: 0.5, anchorY: 1.0 }],
  // },
  // campfire: {
  //   frames: [
  //     { src: '/sprites/tilesets/Room_Builder_16x16.png', sx: 0, sy: 0, sw: 16, sh: 16, anchorX: 0.5, anchorY: 1.0 },
  //     { src: '/sprites/tilesets/Room_Builder_16x16.png', sx: 16, sy: 0, sw: 16, sh: 16, anchorX: 0.5, anchorY: 1.0 },
  //   ],
  //   fps: 6,
  //   loop: true,
  // },
};

/**
 * Resolve the sprite config for a given prop kind.
 * Returns undefined if the prop has no registered visual — the renderer skips it.
 */
export function getPropSprite(kind: PropKind): PropSpriteConfig | undefined {
  return PROP_SPRITES[kind];
}
