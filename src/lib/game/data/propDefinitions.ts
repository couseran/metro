// src/lib/game/data/propDefinitions.ts
//
// Global registry of static prop blueprints.
//
// HOW TO ADD A NEW PROP TYPE
// ──────────────────────────
//  1. Define a PropDefinition object (see interface in types/props.ts).
//  2. Call registerPropDefinition(def) — typically at module load time in a
//     dedicated file (e.g. data/props/PropDefinitionRegistration.ts) that is imported by the
//     game's entry point.
//  3. Register the matching sprite config in rendering/props/PropSpriteRegistry.ts
//     via registerPropSprite(def.type, config).
//
// Registry design
// ───────────────
// A plain Map is used instead of a static Record so that:
//   • Definitions can be loaded lazily or from external data files.
//   • The registry can be inspected/iterated at runtime (editor tools, debug UI).
//   • Adding a new prop never requires modifying this file.
import './props/furnitures/chair/PropDefinitionRegistration.ts'

import type { PropDefinition } from '$lib/game/types/props.ts';

// ─── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, PropDefinition>();

/**
 * Register a prop blueprint.  Overwrites any existing definition with the same
 * type key — use this intentionally when hot-reloading definitions in dev mode.
 *
 * @throws {Error} If `def.type` is an empty string.
 */
export function registerPropDefinition(def: PropDefinition): void {
    if (!def.type) throw new Error('[PropDefinitions] def.type must be a non-empty string.');
    registry.set(def.type, def);
}

/**
 * Look up a prop blueprint by its type key.
 * Returns undefined for unknown types; callers should handle this gracefully
 * (e.g. skip rendering, warn in development).
 */
export function getPropDefinition(type: string): PropDefinition | undefined {
    return registry.get(type);
}

/**
 * Returns true when a definition exists for the given type key.
 * Useful for validation in the placement system and save-file loading.
 */
export function hasPropDefinition(type: string): boolean {
    return registry.has(type);
}

/**
 * Iterate all registered definitions.
 * Intended for editor tools, debug overlays, and save-file migrations.
 */
export function allPropDefinitions(): IterableIterator<PropDefinition> {
    return registry.values();
}

// ─── Built-in definitions ─────────────────────────────────────────────────────
//
// This section registers a minimal set of built-in prop types so the engine
// starts with a functional (if empty-looking) world.  Additional prop packs
// should be registered in separate files and imported at game startup.
//
// To keep this file short, prop definitions are grouped into dedicated modules:
//
//   data/props/PropDefinitionRegistration.ts  — chairs, tables, beds, bookshelves
//   data/props/nature.ts     — trees, rocks, bushes, plants
//   data/props/structures.ts — doors, fences, walls, bridges
//   data/props/containers.ts — chests, barrels, crates
//   data/props/lighting.ts   — campfires, torches, lanterns
//
// (None of these files exist yet — add them as prop artwork is finalised.)
