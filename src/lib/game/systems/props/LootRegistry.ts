// src/lib/game/systems/props/LootRegistry.ts
//
// Loot table registry — defines what a prop drops when it is destroyed or
// harvested, using a weighted random selection model similar to Minecraft's
// loot table system.
//
// Architecture
// ────────────
// LootTable    Defines the roll count and a set of weighted LootEntries.
//              Registered by calling registerLootTable(table).
//
// LootEntry    One candidate item.  Has a relative weight (higher = more common),
//              a quantity range, an optional tool filter, and a minimum tool tier.
//
// rollLoot()   Pure function — given a table id, the tool used, and a seeded
//              PRNG, returns the array of ItemStacks that drop.  Deterministic:
//              same inputs always produce the same output.
//
// HOW TO ADD LOOT
// ───────────────
//  1. Define a LootTable object with a unique id.
//  2. Call registerLootTable(table) — typically alongside the PropDefinition
//     that references this table's id.
//  3. Reference the table id in PropDefinition.lootTableId.

import type { ItemStack } from '$lib/game/types/inventory.ts';
import type { ToolKind }  from '$lib/game/types/props.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * One candidate drop entry in a loot table.
 *
 * Weights are relative: an entry with weight 10 is twice as likely to be
 * selected as an entry with weight 5 in the same table.
 */
export interface LootEntry {
    /** Item definition key (e.g. 'wood_log', 'stone', 'health_potion'). */
    itemId: string;
    /** Quantity range. Both min and max are inclusive. */
    quantity: { min: number; max: number };
    /**
     * Relative selection weight.  Must be > 0.
     * Higher values make this entry more likely to be chosen.
     */
    weight: number;
    /**
     * If set, this entry only drops when the specified tool was used.
     * null = drops regardless of tool.
     *
     * Example: a log entry with requiredTool:'axe' would not drop if the
     * player punched the tree bare-handed (or used a pickaxe).
     */
    requiredTool: ToolKind | null;
    /**
     * Minimum tool tier for this entry to drop.
     * 0 = any tier (including bare hands).
     * Future: 1 = wood-tier, 2 = stone-tier, etc.
     */
    minToolTier: number;
}

/**
 * A complete loot table definition.
 *
 * On destruction, the system performs `rolls` independent weighted draws from
 * `entries`.  Each draw selects one entry (or nothing if all entries are
 * filtered out by tool requirements), then samples a random quantity from that
 * entry's range.
 */
export interface LootTable {
    /** Unique identifier referenced by PropDefinition.lootTableId. */
    id: string;
    /** Number of draws (rolls) performed per destruction event. */
    rolls: { min: number; max: number };
    /** Candidate items. */
    entries: LootEntry[];
}

// ─── PRNG helper ──────────────────────────────────────────────────────────────

/**
 * Minimal seeded pseudo-random number generator interface.
 * Callers supply a function that returns a value in [0, 1) each call.
 * This allows the simulation to use its own deterministic RNG without
 * coupling the loot system to a specific PRNG implementation.
 */
export type RngFn = () => number;

// ─── Registry ─────────────────────────────────────────────────────────────────

const registry = new Map<string, LootTable>();

/**
 * Register a loot table.  Overwrites any existing table with the same id.
 * @throws {Error} If `table.id` is empty or `table.entries` is empty.
 */
export function registerLootTable(table: LootTable): void {
    if (!table.id)           throw new Error('[LootRegistry] table.id must be a non-empty string.');
    if (!table.entries.length) throw new Error(`[LootRegistry] table "${table.id}" has no entries.`);
    registry.set(table.id, table);
}

/**
 * Look up a loot table by id.  Returns undefined for unknown ids.
 */
export function getLootTable(id: string): LootTable | undefined {
    return registry.get(id);
}

// ─── Roll logic ───────────────────────────────────────────────────────────────

/**
 * Perform a weighted random draw from a filtered set of loot entries.
 *
 * Only entries that pass the tool filter are eligible.  Returns null when no
 * eligible entries exist (the prop drops nothing for this tool).
 */
function drawEntry(
    entries:  LootEntry[],
    toolUsed: ToolKind,
    toolTier: number,
    rng:      RngFn,
): LootEntry | null {
    const eligible = entries.filter(e =>
        (e.requiredTool === null || e.requiredTool === toolUsed) &&
        e.minToolTier <= toolTier,
    );
    if (eligible.length === 0) return null;

    const totalWeight = eligible.reduce((sum, e) => sum + e.weight, 0);
    let roll = rng() * totalWeight;

    for (const entry of eligible) {
        roll -= entry.weight;
        if (roll <= 0) return entry;
    }
    // Floating-point edge case: return last eligible entry
    return eligible[eligible.length - 1];
}

/**
 * Roll the loot table for a given tool, returning the resulting ItemStacks.
 *
 * @param tableId  - Key into the loot table registry.
 * @param toolUsed - The tool the player used (affects entry eligibility).
 * @param toolTier - Tier of the tool (0 = bare hands).
 * @param rng      - Seeded PRNG function returning values in [0, 1).
 * @returns        - Array of ItemStacks to drop.  Empty array if tableId is
 *                   unknown, rolls result in zero, or no entries are eligible.
 */
export function rollLoot(
    tableId:  string,
    toolUsed: ToolKind,
    toolTier: number,
    rng:      RngFn,
): ItemStack[] {
    const table = registry.get(tableId);
    if (!table) return [];

    const rollCount = table.rolls.min + Math.floor(rng() * (table.rolls.max - table.rolls.min + 1));
    const drops: ItemStack[] = [];

    for (let i = 0; i < rollCount; i++) {
        const entry = drawEntry(table.entries, toolUsed, toolTier, rng);
        if (!entry) continue;

        const quantity = entry.quantity.min +
            Math.floor(rng() * (entry.quantity.max - entry.quantity.min + 1));

        // Merge with an existing stack for the same item if possible
        const existing = drops.find(s => s.itemId === entry.itemId);
        if (existing) {
            existing.quantity += quantity;
        } else {
            drops.push({ itemId: entry.itemId, quantity, durability: null, metadata: {} });
        }
    }

    return drops;
}
