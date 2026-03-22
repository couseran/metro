<script lang="ts">

import {Card} from "$lib/components/ui/card";
import {CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "$lib/components/ui/card/index.ts";
import {Input} from "$lib/components/ui/input";
import {Button} from "$lib/components/ui/button";
import {getBluetoothContext} from "$lib/context/bluetooth.svelte.ts";
import Icon from "@iconify/svelte";

let bluetoothContext = getBluetoothContext()
</script>



{#snippet bluetoothCompatibility()}
	{@const textColor = bluetoothContext.isSupported ? 'dark:text-green-400 text-green-500' : 'dark:text-red-400 text-red-500'}
	<div class=" flex gap-1 items-center">
		<Icon icon="mingcute:{bluetoothContext.isSupported ? 'check' : 'close'}-circle-fill" class="size-5 {textColor}"/>
	</div>
{/snippet}



<Card class="fixed z-10 top-4 left-4 max-w-screen p-1 rounded-full border-none">
	<div
		class="px-0 flex gap-1 items-center justify-between"
	>
		<div class="flex gap-1 items-center">
			{@render bluetoothCompatibility()}
			{#if (bluetoothContext.isConnected)}
				<span class="text-sm font-medium mr-2">{bluetoothContext.deviceName}</span>
			{/if}
		</div>
		{#if (!bluetoothContext.isConnected)}
			<div
				class="p-1 cursor-pointer bg-foreground/15 rounded-full"
				on:click={() => {
					console.log("Connecting")
					bluetoothContext.connect()
				}}
			>
				<Icon icon="mingcute:add-fill" class="size-3"/>
			</div>
		{:else}
			<div
				class="p-1 cursor-pointer bg-foreground/15 rounded-full"
				on:click={() => {
					console.log("Connecting")
					bluetoothContext.disconnect()
				}}
			>
				<Icon icon="mingcute:close-fill" class="size-3"/>
			</div>
		{/if}
	</div>
</Card>