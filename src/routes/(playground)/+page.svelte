<script lang="ts">

	import {getBluetoothContext} from "$lib/context/bluetooth.svelte.ts";
	import ConnectionStatus from "$lib/components/layout/ConnectionStatus.svelte";
	import {untrack} from "svelte";
	import {Slider} from "$lib/components/ui/slider";
	import GameCanvas from "$lib/components/game/GameCanvas.svelte";

	let bluetoothContext = getBluetoothContext()

	$effect(() => {
		if (bluetoothContext.isConnected && value > -1) {
			untrack(() => {
				console.log(value)
				bluetoothContext.sendCommand("LIFE", {level: value})
			})
		}
	})

	let value = $state(50);
</script>

<div class="h-screen w-screen flex overflow-hidden">
	<ConnectionStatus/>
	<GameCanvas />
	<!--{#if bluetoothContext.isConnected}-->
	<!--	<p>Received data: {bluetoothContext.receivedData}</p>-->
	<!--	<Slider type="single" bind:value max={255} step={1} class="max-w-[70%]" />-->
	<!--{/if}-->
</div>
