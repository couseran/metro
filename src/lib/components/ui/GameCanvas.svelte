<!--
  Self-contained game component.
  Owns the canvas element, instantiates all engine modules, manages lifecycle.
  Parent components never interact with game internals — they mount/unmount this.
-->
<script lang="ts">
	import { onMount, onDestroy }    from 'svelte';
	import { GameLoop }              from '$lib/game/engine/GameLoop';
	import { InputModule }           from '$lib/game/engine/InputModule';
	import { SimulationModule }      from '$lib/game/engine/SimulationModule';
	import { RendererModule }        from '$lib/game/engine/RendererModule';
	import { loadAssets }            from '$lib/game/assets/AssetLoader';
	import { MANIFEST }              from '$lib/game/assets/manifest';
	import { AudioModule }           from '$lib/game/audio/AudioModule';
	import { AUDIO_MANIFEST }        from '$lib/game/audio/audioManifest';

	// ── State ──────────────────────────────────────────────────────────────────
	let canvas:  HTMLCanvasElement;
	let status:  'loading' | 'running' | 'error' = 'loading';
	let errorMessage = '';
	let loadProgress = 0; // 0–100

	// Module refs kept for cleanup
	let loop:  GameLoop    | null = null;
	let input: InputModule | null = null;
	let audio: AudioModule | null = null;

	// ── Resize handler ─────────────────────────────────────────────────────────
	let renderer: RendererModule | null = null;

	function onResize() {
		renderer?.resize(canvas.clientWidth, canvas.clientHeight);
	}

	// ── Debug key handler ───────────────────────────────────────────────────────
	// Backtick  (`)  — Y-sort draw-order overlay
	// Backslash (\)  — collision hitbox overlay
	function onKeyDown(e: KeyboardEvent) {
		if (!renderer) return;
		if (e.key === '`') renderer.debugSortOverlay  = !renderer.debugSortOverlay;
		if (e.key === '\\') renderer.debugHitboxOverlay = !renderer.debugHitboxOverlay;
	}

	// ── Lifecycle ──────────────────────────────────────────────────────────────
	onMount(async () => {
		try {
			const assets = await loadAssets(MANIFEST, (loaded, total) => {
				loadProgress = Math.round((loaded / total) * 100);
			});

			const inputModule      = new InputModule();
			const simulationModule = new SimulationModule();

			renderer = new RendererModule({
				canvas,
				tileSize: 16,
				scale:    3,
			});

			renderer.init(assets);
			renderer.resize(canvas.clientWidth, canvas.clientHeight);
			inputModule.mount(window);

		// ── Audio ─────────────────────────────────────────────────────────────
		// Constructed before GameLoop so it can be passed as the 4th argument.
		// AudioContext must be resumed inside a user gesture (browser autoplay
		// policy).  autoResume() registers a one-time listener; music starts and
		// SFX buffers are pre-decoded the moment the first key or tap arrives.
		const audioModule   = new AudioModule(AUDIO_MANIFEST.sfx);
		const defaultConfig = AUDIO_MANIFEST.music.playlists[AUDIO_MANIFEST.music.defaultPlaylist];

		audioModule.autoResume(window, () => {
			// Preload every SFX that can fire during normal gameplay so the first
			// footstep has no decode latency.
			const activeSfxIds = Object.keys(AUDIO_MANIFEST.sfx);
			if (activeSfxIds.length > 0) {
				audioModule.sfx.preload(activeSfxIds).catch(console.error);
			}

			if (defaultConfig?.tracks.length > 0) {
				audioModule.music.setPlaylist(defaultConfig).catch(console.error);
			}
		});

		audio = audioModule;

		const gameLoop = new GameLoop(inputModule, simulationModule, renderer, audioModule);

			// Dev-only stats — tree-shaken in production builds
			if (import.meta.env.DEV) {
				gameLoop.onStats((s) => {
					console.debug(`FPS ${s.fps} | TPS ${s.simTps} | ft ${s.frameTime.toFixed(1)}ms`);
				});
			}

			gameLoop.start();

			loop  = gameLoop;
			input = inputModule;

			// ── Audio ─────────────────────────────────────────────────────────────
			window.addEventListener('resize', onResize);
			window.addEventListener('keydown', onKeyDown);
			status = 'running';

		} catch (e) {
			errorMessage = e instanceof Error ? e.message : String(e);
			status = 'error';
			console.error('[GameCanvas] Init failed:', e);
		}
	});

	onDestroy(() => {
		loop?.stop();
		input?.unmount();
		audio?.dispose();
		window.removeEventListener('resize', onResize);
		window.removeEventListener('keydown', onKeyDown);
	});
</script>

<!-- ── Markup ────────────────────────────────────────────────────────────── -->
<div class="relative w-full h-full bg-black overflow-hidden">

	<!-- Canvas — always in the DOM so bind:this resolves before onMount -->
	<canvas
		bind:this={canvas}
		class="block w-full h-full [image-rendering:pixelated]"
	/>

	<!-- Loading overlay -->
	{#if status === 'loading'}
		<div class="absolute inset-0 flex flex-col items-center justify-center bg-black gap-4">
      <span class="text-white font-mono text-sm tracking-widest uppercase">
        Loading
      </span>
			<!-- Progress bar -->
			<div class="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
				<div
					class="h-full bg-white rounded-full transition-all duration-150"
					style="width: {loadProgress}%"
				/>
			</div>
			<span class="text-white/40 font-mono text-xs">{loadProgress}%</span>
		</div>
	{/if}

	<!-- Error overlay -->
	{#if status === 'error'}
		<div class="absolute inset-0 flex flex-col items-center justify-center bg-black gap-3">
      <span class="text-red-400 font-mono text-sm uppercase tracking-widest">
        Failed to start
      </span>
			<span class="text-white/40 font-mono text-xs max-w-sm text-center px-4">
        {errorMessage}
      </span>
		</div>
	{/if}

</div>