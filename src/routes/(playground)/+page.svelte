<script lang="ts">

	import {getBluetoothContext} from "$lib/context/bluetooth.svelte.ts";
	import ConnectionStatus from "$lib/components/layout/ConnectionStatus.svelte";
	import {untrack} from "svelte";
	import {Slider} from "$lib/components/ui/slider";

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

<div class="h-dvh w-full flex flex-col p-4 justify-center items-center gap-2">
	<h1 class="text-4xl font-semibold">Metro</h1>
	<ConnectionStatus/>
	{#if bluetoothContext.isConnected}
		<p>Received data: {bluetoothContext.receivedData}</p>
		<Slider type="single" bind:value max={255} step={1} class="max-w-[70%]" />
	{/if}
</div>
