// src/lib/game/systems/inventory/InventorySystem.ts

import type { InventoryState, ItemStack } from '$lib/game/types/inventory';
import { getItem }                        from '$lib/game/systems/items/ItemRegistry';

export function createInventory(cols: number, rows: number): InventoryState {
    return { slots: new Array<ItemStack | null>(cols * rows).fill(null), cols, rows };
}

function _tryAddMutable(slots: Array<ItemStack | null>, item: ItemStack): number {
    const maxStack = getItem(item.itemId)?.maxStackSize ?? 1;
    let remaining  = item.quantity;
    for (let i = 0; i < slots.length && remaining > 0; i++) {
        const slot = slots[i];
        if (slot && slot.itemId === item.itemId && slot.quantity < maxStack) {
            const taking = Math.min(maxStack - slot.quantity, remaining);
            slots[i] = { ...slot, quantity: slot.quantity + taking };
            remaining -= taking;
        }
    }
    for (let i = 0; i < slots.length && remaining > 0; i++) {
        if (slots[i] === null) {
            const taking = Math.min(maxStack, remaining);
            slots[i] = { itemId: item.itemId, quantity: taking, durability: null, metadata: {} };
            remaining -= taking;
        }
    }
    return remaining;
}

export function canAddItems(inv: InventoryState, items: ItemStack[]): boolean {
    return addItems(inv, items).overflow.length === 0;
}

export function addItems(inv: InventoryState, items: ItemStack[]): {
    inventory: InventoryState; overflow: ItemStack[];
} {
    const slots  = inv.slots.map(s => s ? { ...s } : null);
    const overflow: ItemStack[] = [];
    for (const item of items) {
        const leftover = _tryAddMutable(slots, item);
        if (leftover > 0) overflow.push({ ...item, quantity: leftover });
    }
    return { inventory: { ...inv, slots }, overflow };
}

export function removeItem(inv: InventoryState, slotIndex: number, quantity: number): InventoryState {
    const slot = inv.slots[slotIndex];
    if (!slot) return inv;
    const newSlots = [...inv.slots];
    newSlots[slotIndex] = quantity >= slot.quantity
        ? null : { ...slot, quantity: slot.quantity - quantity };
    return { ...inv, slots: newSlots };
}

export function moveSlot(inv: InventoryState, from: number, to: number): InventoryState {
    if (from === to) return inv;
    const newSlots = [...inv.slots];
    [newSlots[from], newSlots[to]] = [newSlots[to], newSlots[from]];
    return { ...inv, slots: newSlots };
}
