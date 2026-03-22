<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import "../app.css";
	import {bluetoothState, setBluetoothContext} from "$lib/context/bluetooth.svelte.ts";
	import { ModeWatcher } from "mode-watcher";
	import { setMode } from "mode-watcher";

	let { children } = $props();

	setMode('dark')
	setBluetoothContext(bluetoothState)
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher/>
{@render children()}
