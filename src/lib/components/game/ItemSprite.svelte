<!--
  Renders a single item icon by clipping a frame from its spritesheet atlas.
  Uses a <canvas> so pixel-art scaling stays crisp at any display size.
  Re-draws reactively whenever the itemId or loaded images change.
-->
<script lang="ts">
    import { uiState } from '$lib/game/bridge/UIStore.svelte';
    import { getItem }  from '$lib/game/systems/items/ItemRegistry';

    let { itemId, size = 128 }: { itemId: string; size?: number } = $props();

    let canvas: HTMLCanvasElement | undefined = $state();

    $effect(() => {
        if (!canvas) return;

        const def = getItem(itemId);
        if (!def) return;

        // Reading uiState.itemImages inside $effect makes this reactive:
        // re-runs whenever the map reference changes (set after asset load).
        const img = uiState.itemImages.get(def.sprite.assetKey);
        if (!img) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, size, size);

        const { sx, sy, sw, sh } = def.sprite;
        // Scale the sprite to fit inside the canvas, preserving aspect ratio.
        const s  = Math.min(size / sw, size / sh);
        const dw = Math.round(sw * s);
        const dh = Math.round(sh * s);
        const dx = Math.floor((size - dw) / 2);
        const dy = Math.floor((size - dh) / 2);

        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    });
</script>

<canvas bind:this={canvas} width={size} height={size} style="image-rendering: pixelated;"></canvas>
