// src/lib/game/types/items.ts
// ============================================================
// ITEM DEFINITIONS — static blueprints for inventory items
// ============================================================
//
// ItemDefinition  Static data for an item type (name, sprite, stack size).
//                 Lives in ItemRegistry; never mutated at runtime.
//
// ItemSpriteInfo  Coordinates to clip a sprite from an atlas.
//                 Matches the format used by PropSpriteConfig for consistency.

export interface ItemSpriteInfo {
    /** Asset key (path) in LoadedAssets.images, e.g. '/sprites/props/Interiors_16x16.png'. */
    assetKey: string;
    /** Source X in the spritesheet, in pixels. */
    sx: number;
    /** Source Y in the spritesheet, in pixels. */
    sy: number;
    /** Source width in the spritesheet, in pixels. */
    sw: number;
    /** Source height in the spritesheet, in pixels. */
    sh: number;
}

export type ItemCategory = 'material' | 'tool' | 'furniture' | 'consumable' | 'key';

/**
 * Static blueprint for one item type.
 * Stored in ItemRegistry; never mutated at runtime.
 * ItemStack instances reference this via ItemStack.itemId.
 */
export interface ItemDefinition {
    /** Unique string key, e.g. 'chair', 'wood_log', 'health_potion'. */
    itemId: string;
    /** Human-readable name shown in the UI. */
    displayName: string;
    /**
     * Maximum items per stack in one inventory slot.
     * 1 = non-stackable (unique items, tools).
     * Higher values allow stacking (materials, consumables).
     */
    maxStackSize: number;
    /** Logical category for UI grouping and filtering. */
    category: ItemCategory;
    /** How to render this item's icon from a spritesheet atlas. */
    sprite: ItemSpriteInfo;
}
