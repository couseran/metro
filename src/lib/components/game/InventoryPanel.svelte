<!--
  Player inventory panel — a Svelte component rendered outside the canvas.
  Opens when the active interaction context is 'inventory' (F key from gameplay,
  or pushed programmatically by dialogue / crafting flows).
  Displays a grid of slots matching the inventory's cols × rows dimensions.
  Supports drag-and-drop slot reordering via pushUIAction(MOVE_INVENTORY_SLOT).
  Closing routes through POP_CONTEXT so the simulation can update player
  animation (phone → idle) deterministically alongside the context change.
-->
<script lang="ts">
    import { uiState }      from '$lib/game/bridge/UIStore.svelte';
    import { pushUIAction } from '$lib/game/bridge/UIActionQueue';
    import { peekContext }  from '$lib/game/systems/context/ContextSystem';
    import ItemSprite       from '$lib/components/game/ItemSprite.svelte';

    const SLOT_SIZE = 24; // CSS px per grid cell
    const GAP       = 12;  // CSS px between cells

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
        // Route through the simulation so the player's phone animation is
        // closed deterministically (closePhone is called in applyContextPop).
        pushUIAction({ type: 'POP_CONTEXT' });
    }

    // Derive open state from the context stack — no separate boolean flag needed.
    const isOpen = $derived(
        peekContext(uiState.contextStack).kind === 'inventory' &&
        uiState.playerInventory !== null,
    );
</script>

{#if isOpen}
    {@const inv = uiState.playerInventory!}
    <!-- Backdrop -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        class="absolute inset-0 flex items-center justify-center"
        onclick={close}
    >
        <!-- Panel — stop click propagation so clicking the grid doesn't close -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div
            class="bg-muted rounded-3xl p-4 select-none mb-48"
            onclick={(e) => e.stopPropagation()}
        >
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
                        class="relative flex items-center justify-center rounded-full border cursor-pointer bg-card transition-colors"
                        class:border-none={dragFrom !== i}
                        class:border-white={dragFrom === i}
                        class:bg-muted={slot !== null}
                        style="width: {SLOT_SIZE}px; height: {SLOT_SIZE}px;"
                        draggable={slot !== null}
                        ondragstart={() => onDragStart(i)}
                        ondragover={(e) => e.preventDefault()}
                        ondrop={() => onDrop(i)}
                        ondragend={onDragEnd}
                    >
                        {#if slot}
                            <ItemSprite itemId={slot.itemId} size={SLOT_SIZE * 2} />
                            {#if slot.quantity > 1}
                                <span
                                    class="absolute -bottom-1 -right-1 text-foreground text-xs text-center bg-muted-foreground rounded-full font-bold h-4 w-4"
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
