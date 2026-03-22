// ============================================================
// INVENTORY
// ============================================================

/**
 * A single inventory slot holding a stackable item.
 * Item definitions (name, icon, effect) live in ItemRegistry,
 * referenced by `itemId` — only runtime state is stored here.
 */
export interface ItemStack {
    /** Key into the item definition table (e.g. "wood_log", "health_potion"). Not the display name. */
    itemId: string;
    /** How many of this item are in the stack. Always ≥ 1. */
    quantity: number;
    /** Current durability, or null if the item does not have durability (e.g. consumables). */
    durability: number | null;
    /** Arbitrary item-specific runtime data (enchantments, custom names, charge counts, etc.). */
    metadata: Record<string, unknown>;
}

/**
 * Fixed-size item storage rendered as a rectangular grid.
 *
 * Grid dimensions:
 *   cols × rows = slots.length (total capacity).
 *
 * The visual layout in the UI always matches cols × rows — a 4×3 inventory
 * renders as 4 columns and 3 rows, regardless of how many slots are filled.
 */
export interface InventoryState {
    /** Fixed-length slot array. null indicates an empty slot. Length === cols × rows. */
    slots: Array<ItemStack | null>;
    /** Number of grid columns. */
    cols: number;
    /** Number of grid rows. */
    rows: number;
}
