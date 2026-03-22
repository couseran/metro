<!--
  World-space CSS overlay for ground items.
  Positioned absolutely within the GameCanvas container (same relative parent as the canvas).
  Each item badge floats at its world-space position, tracking the camera every frame.

  World → CSS coordinate formula (within the relative container):
    cssX = containerWidth  / 2 + (worldX - camera.x) * (scale * zoom) − BADGE_SIZE / 2
    cssY = containerHeight / 2 + (worldY - camera.y) * (scale * zoom) − BADGE_SIZE / 2
-->
<script lang="ts">
    import { uiState }  from '$lib/game/bridge/UIStore.svelte';
    import ItemSprite   from '$lib/components/game/ItemSprite.svelte';
    import {Card, CardContent} from "$lib/components/ui/card/index.ts";

    /** Display size of each item badge in CSS pixels. */
    const BADGE_SIZE = 32;

    function worldToCss(wx: number, wy: number): { left: number; top: number } {
        const { camera, scale, containerWidth, containerHeight } = uiState;
        if (!camera) return { left: -9999, top: -9999 };

        const effectiveScale = scale * camera.zoom;
        return {
            left: containerWidth  / 2 + (wx - camera.x) * effectiveScale - BADGE_SIZE / 2,
            top:  containerHeight / 2 + (wy - camera.y) * effectiveScale - BADGE_SIZE / 2 - 12,
        };
    }
</script>

<!--
  pointer-events: none so the overlay never intercepts mouse events destined for the canvas.
  Interaction (pickup) is keyboard-driven (E key), not click-driven.
-->
<div class="absolute inset-0 pointer-events-none overflow-hidden">
    {#each uiState.groundItems as item (item.id)}
        {@const pos = worldToCss(item.x, item.y)}
	    <Card
        class="absolute p-0 flex items-center justify-center rounded-full bg-muted shadow-md opacity-80"
        style="left: {pos.left}px; top: {pos.top}px; width: {BADGE_SIZE}px; height: {BADGE_SIZE}px;"
	    >
          <ItemSprite itemId={item.itemId} size={BADGE_SIZE} />
	   </Card>
    {/each}
</div>
