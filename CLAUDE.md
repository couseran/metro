# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run preview      # Preview production build
npm run check        # TypeScript + Svelte type check
npm run check:watch  # Watch mode type checking
```

No test runner is configured yet.

## Architecture

**Metro** is a SvelteKit 2.x / TypeScript web application with a 2D game engine and Bluetooth device integration. SSR is disabled (`export const ssr = false` in `+layout.ts`).

### Game Engine (`src/lib/game/`)

The engine uses a **fixed-timestep game loop with interpolation** (Fiedler pattern):

- **`engine/GameLoop.ts`** — Main loop: flushes input → runs fixed-step simulation ticks → renders interpolated frame. Constants: `FIXED_STEP=16.667ms`, `MAX_STEPS=5`, `MAX_FRAME_DELTA=200ms`.
- **`engine/SimulationModule.ts`** — Owns `GameState` (`{ player, tick, timestamp }`). All tick functions return new immutable state. Deterministic: same state + inputs → same output.
- **`engine/InputModule.ts`** — Queues DOM `keydown`/`keyup` events, flushed atomically once per simulation tick.
- **`engine/RendererModule.ts`** — Reads `(prevState, currentState, alpha)` and draws interpolated frames. Never mutates state. Pixel-art rendering: `imageSmoothingEnabled = false`.
- **`engine/AssetLoader.ts`** — Preloads images before game loop starts, returns `LoadedAssets` map.

### Entities & Animation

- **`entities/Player.ts`** — All player actions (`setMovement`, `sit`, `openPhone`, `tickPlayer`, etc.) are pure functions returning new `PlayerState`.
- **`rendering/sprites/AnimationController.ts`** — `tickAnimation`, `transitionAnimation`, `getSourceRect` — all pure functions on `AnimationState`.
- **`rendering/sprites/SpriteSheet.ts`** — Sprite grid config and source rect calculation.
- **`rendering/sprites/EntitySpriteRegistry.ts`** — Maps entity types to their sprite configs.
- **`sprites/adam.ts`** — Adam character spritesheet config (384×224px, 16×32px default frame, row/column mappings for each animation).

### Types (`src/lib/game/types/`)

- **`primitives.ts`** — `EntityId`, `TileCoord`
- **`entities.ts`** — `BaseEntity`, `PlayerEntity`, `NpcEntity`, etc. as discriminated unions
- **`world.ts`** — `TileType`, `ChunkState` (Uint8Array), `WorldState`, full `GameState`, `CameraState`
- **`inventory.ts`** — `ItemStack`, `InventoryState`
- **`events.ts`** — One-way simulation → UI/audio event queue (item pickup, footsteps, dialogue, etc.)
- **`props.ts`** — `PropKind`, `PropState` (trees, rocks, chests, interactive objects)

### Svelte Layer

- **`components/ui/GameCanvas.svelte`** — Self-contained game component; owns canvas + engine lifecycle, handles asset loading, mounts/unmounts input.
- **`routes/(playground)/+page.svelte`** — Main page: two-column layout (ConnectionStatus sidebar + GameCanvas) with Bluetooth slider control.
- **`context/bluetooth.svelte.ts`** — Global Bluetooth state set in root layout.

### Key Patterns

- **Immutable state**: simulation functions always return new state, never mutate in place.
- **Event queue**: simulation emits typed events (`GameEvent`) instead of calling UI/audio directly.
- **Chunk-based world**: `ChunkState` uses flat `Uint8Array` for cache-friendly tile storage — world generation not yet implemented.
- **Spatial indexing**: root `GameState` includes spatial index fields for future efficient world queries.
- **Renderer interpolation**: position is lerped between `prevState` and `currentState` using `alpha`; animation frames stay discrete for pixel-art quality.

### What's Implemented vs. Planned

Currently working: player movement, 4-direction + diagonal animation, sitting variants, phone animation, asset loading, fixed-timestep loop.

Typed but not yet implemented: world/chunk generation, NPC entities, inventory UI, dialogue system, audio, multiplayer (`RemotePlayerEntity`), tilemap rendering, props/interactive objects.

## Static Assets

Sprites live in `static/sprites/` and are referenced by path strings in `AssetLoader.ts` manifest. Add new sprites there and to the manifest.
