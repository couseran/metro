// src/lib/game/systems/items/ItemRegistry.ts
//
// Global registry of item definitions.
// Mirrors PropRegistry / LootRegistry — a plain module-level Map.
//
// HOW TO ADD AN ITEM
// ──────────────────
//  1. Create an ItemRegistration.ts file alongside the relevant content
//     (e.g. content/props/furnitures/chair/ItemRegistration.ts).
//  2. Call registerItem(def) inside it.
//  3. Import the registration file from SimulationModule.ts (side-effect import).

import type { ItemDefinition } from '$lib/game/types/items';

const registry = new Map<string, ItemDefinition>();

/**
 * Register an item definition.
 * Overwrites any existing entry with the same itemId.
 * @throws {Error} if itemId is empty.
 */
export function registerItem(def: ItemDefinition): void {
    if (!def.itemId) throw new Error('[ItemRegistry] itemId must be a non-empty string.');
    registry.set(def.itemId, def);
}

/**
 * Look up an item definition by itemId.
 * Returns undefined for unknown ids.
 */
export function getItem(itemId: string): ItemDefinition | undefined {
    return registry.get(itemId);
}
