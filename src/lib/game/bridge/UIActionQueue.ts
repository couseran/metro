// src/lib/game/bridge/UIActionQueue.ts
//
// One-way command queue: Svelte UI → simulation.
//
// Svelte components call pushUIAction() to request simulation-side changes
// (inventory rearrangement, item drops).  The SimulationModule drains this
// queue at the start of each tick — same pattern as InputModule for keyboard
// events.
//
// UI-only state changes (opening/closing the inventory panel) do NOT go
// through this queue — components toggle uiState.inventoryOpen directly.

import type { EntityId } from '$lib/game/types/primitives';

export type UIAction =
    /** Move the item in slot `from` to slot `to` (swap). */
    | { type: 'MOVE_INVENTORY_SLOT'; from: number; to: number }
    /**
     * Drop `quantity` of the item in `slotIndex` onto the ground at the
     * player's current position.
     */
    | { type: 'DROP_ITEM'; slotIndex: number; quantity: number };

const queue: UIAction[] = [];

/** Push an action from a Svelte component. Safe to call outside reactive context. */
export function pushUIAction(action: UIAction): void {
    queue.push(action);
}

/**
 * Drain and return all pending actions.
 * Called by SimulationModule.tick() before processing input events.
 */
export function flushUIActions(): UIAction[] {
    return queue.splice(0);
}
