// src/lib/game/bridge/UIStore.svelte.ts
//
// One-way reactive bridge: Simulation → Svelte UI.
//
// GameLoop.syncUIStore() writes to this object every display frame.
// Svelte components read it reactively — they never reach into GameState directly.
// Only add fields here that at least one component needs to render.

import type { InventoryState } from '$lib/game/types/inventory';
import type { GroundItemState } from '$lib/game/types/groundItems';
import type { CameraState }     from '$lib/game/types/world';
import type { ContextStack }    from '$lib/game/types/context';
import { ROOT_CONTEXT }         from '$lib/game/types/context';

export interface UIState {
    playerInventory: InventoryState | null;
    groundItems:     GroundItemState[];
    camera:          CameraState | null;
    scale:           number;
    containerWidth:  number;
    containerHeight: number;
    /**
     * Mirror of GameState.contextStack.
     * Components use this to decide which panels to render and which
     * interactions to offer — no separate boolean flags needed.
     * The active context is always the last element.
     */
    contextStack:    ContextStack;
    itemImages:      Map<string, HTMLImageElement>;
}

export const uiState: UIState = $state({
    playerInventory: null,
    groundItems:     [],
    camera:          null,
    scale:           3,
    containerWidth:  0,
    containerHeight: 0,
    contextStack:    ROOT_CONTEXT,
    itemImages:      new Map(),
});
