<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import "../app.css";
	import { ModeWatcher } from "mode-watcher";
	import {bluetoothState, setBluetoothContext} from "$lib/context/bluetooth.svelte.ts";

	let { children } = $props();

	setBluetoothContext(bluetoothState)
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher/>
{@render children()}
