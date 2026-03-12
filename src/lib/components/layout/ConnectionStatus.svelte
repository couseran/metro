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
	<div class="ml-1 flex gap-1 items-center">
		<Icon icon="mingcute:{bluetoothContext.isSupported ? 'check' : 'close'}-circle-fill" class="size-3 {textColor}"/>
		<CardDescription
			class="{textColor} text-sm"
		>{bluetoothContext.isSupported ? "Bluetooth supported" : "Bluetooth not supported"}</CardDescription>
	</div>
{/snippet}
<Card class="fixed z-10 top-4 left-4 w-full max-w-sm p-2 px-0">
	<CardContent class="px-2 flex flex-col gap-2">
		{@render bluetoothCompatibility()}
		{#if !bluetoothContext.isConnected}
			<Button
				class="w-full"
				variant="secondary"
				disabled={!bluetoothContext.isSupported}
				onclick={() => {
					console.log("Connecting")
					bluetoothContext.connect()
				}}
			><Icon icon="mingcute:bluetooth-line"/>Connection
			</Button>
		{:else}
			<div class="w-full flex justify-between items-center">
				<div class="flex items-center gap-2 p-1.5 bg-muted rounded-sm w-full">
					<Icon icon="mingcute:game-2-fill" class="size-5"/>
					<span class="text-sm font-medium">{bluetoothContext.deviceName}</span>
				</div>
<!--				<Button-->
<!--					variant="ghost"-->
<!--					disabled={!bluetoothContext.isConnected}-->
<!--					class="text-destructive"-->
<!--					onclick={() => {-->
<!--					console.log("Connecting")-->
<!--					bluetoothContext.disconnect()-->
<!--				}}-->
<!--				><Icon icon="mingcute:user-x-line"/></Button>-->
			</div>
		{/if}
	</CardContent>
</Card>