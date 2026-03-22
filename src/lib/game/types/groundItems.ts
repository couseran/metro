// src/lib/game/types/groundItems.ts
// ============================================================
// GROUND ITEMS — items dropped on the world floor
// ============================================================
//
// GroundItemState  One pile of items lying on the ground.
//                  Rendered by a Svelte CSS overlay (not the canvas).
//                  Picked up when the player presses E nearby.

import type { EntityId } from '$lib/game/types/primitives';

export interface GroundItemState {
    /** Stable unique identifier. Key in GameState.groundItems. */
    id: EntityId;
    /** Key into the item definition table. */
    itemId: string;
    /** How many of this item are in the pile. Always ≥ 1. */
    quantity: number;
    /** World-space X position in pixels (tile center). */
    x: number;
    /** World-space Y position in pixels (tile center). */
    y: number;
    /** Milliseconds remaining before the pile despawns. */
    despawnTimer: number;
}

/** Default despawn duration: 5 minutes. */
export const GROUND_ITEM_DESPAWN_MS = 300_000;
