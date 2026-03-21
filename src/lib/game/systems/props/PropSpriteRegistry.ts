// src/lib/game/systems/props/PropSpriteRegistry.ts
//
// Global registry mapping prop type strings to their visual configurations.
//
// HOW TO ADD A PROP SPRITE
// ─────────────────────────
//  1. Identify the source rect (sx, sy, sw, sh) by opening the sprite sheet in
//     an image editor.  The default sheet is Room_Builder_16x16.png.
//  2. Choose anchor values:
//       anchorX = 0.5 (centered), anchorY = 1.0 (bottom-aligned to tile)
//       is the standard for upright object-layer props.
//       anchorX = 0.0, anchorY = 0.0 is standard for floor-layer props (carpet, rug).
//  3. Call registerPropSprite(type, config) — typically at the bottom of the file
//     that defines the matching PropDefinition, so sprite + data live together.
//
// The registry uses a Map (not a static Record) so:
//   • Entries can be added lazily from any module at startup.
//   • The registry is iterable for editor tools and debug overlays.
//   • No hard dependency on a central file listing every prop type.

import type { PropSpriteConfig } from './PropSpriteConfig';

// ─── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, PropSpriteConfig>();

/**
 * Register a visual configuration for a prop type.
 * Overwrites any existing entry — use this intentionally for hot-reloading.
 *
 * @throws {Error} If `type` is an empty string.
 */
export function registerPropSprite(type: string, config: PropSpriteConfig): void {
    if (!type) throw new Error('[PropSpriteRegistry] type must be a non-empty string.');
    registry.set(type, config);
}

/**
 * Resolve the visual configuration for a prop type string.
 * Returns undefined when the type has no registered sprite — the renderer
 * silently skips props without sprite configs.
 */
export function getPropSprite(type: string): PropSpriteConfig | undefined {
    return registry.get(type);
}

/**
 * Returns true when a sprite config is registered for the given type.
 */
export function hasPropSprite(type: string): boolean {
    return registry.has(type);
}

/**
 * Iterate all registered sprite configs.
 * Intended for editor tooling and debug overlays.
 */
export function allPropSprites(): IterableIterator<[string, PropSpriteConfig]> {
    return registry.entries();
}
