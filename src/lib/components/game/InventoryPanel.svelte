<!--
  Player inventory panel — a Svelte component rendered outside the canvas.
  Opens/closes with the I key (wired in GameCanvas).
  Displays a grid of slots matching the inventory's cols × rows dimensions.
  Supports drag-and-drop slot reordering via pushUIAction(MOVE_INVENTORY_SLOT).
-->
<script lang="ts">
    import { uiState }     from '$lib/game/bridge/UIStore.svelte';
    import { pushUIAction } from '$lib/game/bridge/UIActionQueue';
    import ItemSprite       from '$lib/components/game/ItemSprite.svelte';

    const SLOT_SIZE = 48; // CSS px per grid cell
    const GAP       = 4;  // CSS px between cells

    let dragFrom: number | null = $state(null);

    function onDragStart(index: number) {
        if (uiState.playerInventory?.slots[index]) {
            dragFrom = index;
        }
    }

    function onDrop(index: number) {
        if (dragFrom !== null && dragFrom !== index) {
            pushUIAction({ type: 'MOVE_INVENTORY_SLOT', from: dragFrom, to: index });
        }
        dragFrom = null;
    }

    function onDragEnd() {
        dragFrom = null;
    }

    function close() {
        uiState.inventoryOpen = false;
    }
</script>

{#if uiState.inventoryOpen && uiState.playerInventory}
    {@const inv = uiState.playerInventory}
    <!-- Backdrop -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="absolute inset-0 flex items-center justify-center bg-black/40"
        onclick={close}
    >
        <!-- Panel — stop click propagation so clicking the grid doesn't close -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div
            class="bg-gray-900 border border-gray-600 rounded-lg p-4 select-none"
            onclick={(e) => e.stopPropagation()}
        >
            <div class="text-white/70 text-xs font-mono uppercase tracking-widest mb-3">
                Inventory
            </div>

            <!-- Slot grid -->
            <div
                class="grid"
                style="
                    grid-template-columns: repeat({inv.cols}, {SLOT_SIZE}px);
                    gap: {GAP}px;
                "
            >
                {#each inv.slots as slot, i}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="relative flex items-center justify-center rounded bg-gray-800 border cursor-pointer transition-colors"
                        class:border-gray-600={dragFrom !== i}
                        class:border-white={dragFrom === i}
                        class:bg-gray-700={slot !== null}
                        style="width: {SLOT_SIZE}px; height: {SLOT_SIZE}px;"
                        draggable={slot !== null}
                        ondragstart={() => onDragStart(i)}
                        ondragover={(e) => e.preventDefault()}
                        ondrop={() => onDrop(i)}
                        ondragend={onDragEnd}
                    >
                        {#if slot}
                            <ItemSprite itemId={slot.itemId} size={SLOT_SIZE - 10} />
                            {#if slot.quantity > 1}
                                <span
                                    class="absolute bottom-0.5 right-1 text-white text-[10px] font-mono font-bold drop-shadow"
                                >
                                    {slot.quantity}
                                </span>
                            {/if}
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
    </div>
{/if}
