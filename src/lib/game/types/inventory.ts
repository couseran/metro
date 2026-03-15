// ============================================================
// INVENTORY
// ============================================================

/**
 * A single inventory slot holding a stackable item.
 * Item definitions (name, icon, effect) live in a separate definition table
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
 * The player's item storage, including the hotbar.
 * The hotbar is always the first `hotbarSize` slots — no separate array needed.
 */
export interface InventoryState {
  /** Fixed-length slot array. null indicates an empty slot. Length === maxSlots. */
  slots: Array<ItemStack | null>;
  /** Total number of inventory slots (hotbar + backpack). */
  maxSlots: number;
  /** Number of leading slots that form the hotbar (rendered as the quick-access bar). */
  hotbarSize: number;
  /** Index of the currently selected hotbar slot (0 to hotbarSize - 1). */
  selectedHotbarIndex: number;
}
