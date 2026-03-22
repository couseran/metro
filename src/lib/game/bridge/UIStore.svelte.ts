// src/lib/game/bridge/UIStore.svelte.ts

import type { InventoryState } from '$lib/game/types/inventory';
import type { GroundItemState } from '$lib/game/types/groundItems';
import type { CameraState }     from '$lib/game/types/world';

export interface UIState {
    playerInventory: InventoryState | null;
    groundItems: GroundItemState[];
    camera: CameraState | null;
    scale: number;
    containerWidth: number;
    containerHeight: number;
    inventoryOpen: boolean;
    itemImages: Map<string, HTMLImageElement>;
}

export const uiState: UIState = $state({
    playerInventory:  null,
    groundItems:      [],
    camera:           null,
    scale:            3,
    containerWidth:   0,
    containerHeight:  0,
    inventoryOpen:    false,
    itemImages:       new Map(),
});
