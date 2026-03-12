# Project Context: SvelteKit 2D Pixel Game Engine

## Project Overview
We are building a top-down 2D pixel art video game using SvelteKit, inspired by Animal Crossing and early Pokémon games. The game features a tile-based world grid, pixelated characters, item placement, and is designed for scalability (including potential future multiplayer and in-game voice chat via WebRTC).

## Core Philosophy
- **Raw, minimal dependencies**: No heavy game engine abstractions (no Phaser, no Unity). We stay close to the metal.
- **Industry standard, professional, scalable**: Every architectural decision must reflect production-grade game development practices.
- **Separation of concerns**: Logic, rendering, and input are strictly isolated modules.
- **Determinism first**: The simulation must be deterministic — same inputs always produce same outputs. This is non-negotiable for future multiplayer readiness.

---

## Technology Stack
- **Framework**: SvelteKit (handles routing, UI layers, menus, HUD, inventory screens)
- **Rendering**: Raw HTML5 Canvas API (no PixiJS unless a hard performance ceiling is hit)
- **Game State**: Svelte stores (reactive, shared between simulation and UI)
- **Map Authoring**: Tiled editor → exported JSON, parsed manually
- **Audio**: Howler.js (lightweight, handles audio sprites and cross-browser quirks)
- **Input**: Raw DOM events (keydown/keyup/gamepad), no input library
- **Persistence**: localStorage / IndexedDB directly, no wrapper library
- **Pixel rendering**: `ctx.imageSmoothingEnabled = false` always enforced

---

## Architecture: The 3-Module System

The game is structured around three strictly separated modules, orchestrated by a central Game Loop.

### Game Loop (Orchestrator)
The game loop uses the **fixed timestep with interpolation** pattern (canonical reference: Glenn Fiedler's "Fix Your Timestep", 2006). This is the industry standard used by Valve, Unity, Unreal, and virtually every professional game engine.

```ts
const FIXED_STEP = 1000 / 60; // Simulation always runs at 60Hz
const MAX_STEPS = 5;           // Spiral-of-death prevention

let accumulator = 0;
let lastTime = performance.now();

const loop = (timestamp: number) => {
  const frameTime = Math.min(timestamp - lastTime, 200); // clamp max delta
  lastTime = timestamp;
  accumulator += frameTime;

  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < MAX_STEPS) {
    const inputs = inputModule.flush();
    simulation.tick(FIXED_STEP, inputs);
    accumulator -= FIXED_STEP;
    steps++;
  }

  const alpha = accumulator / FIXED_STEP; // interpolation factor [0.0 → 1.0]
  renderer.draw(simulation.prevState, simulation.state, alpha);

  requestAnimationFrame(loop);
};
```

**Rules:**
- If a frame is slow (e.g., 40ms instead of 16ms), the simulation runs multiple ticks to catch up.
- `MAX_STEPS` caps catchup to prevent infinite loops on severe lag.
- `alpha` allows the renderer to interpolate between the previous and current simulation state for sub-tick smooth visuals.

---

### Module 1 — InputModule
**Responsibility**: Collect and queue raw DOM input events between simulation ticks.

**Rules:**
- Input is NEVER applied directly to game state.
- Events are queued immediately on DOM event, then flushed and consumed at the start of each simulation tick.
- This makes input deterministic and framerate-independent.
- Future multiplayer: the input queue is exactly what gets serialized and sent to the server.

```ts
class InputModule {
  private queue: InputEvent[] = [];

  onKeyDown(e: KeyboardEvent) {
    this.queue.push({ type: 'keydown', key: e.code, time: performance.now() });
  }

  flush(): InputEvent[] {
    const events = [...this.queue];
    this.queue = [];
    return events;
  }
}
```

---

### Module 2 — SimulationModule
**Responsibility**: Own and mutate the authoritative game state. Pure logic, zero rendering concerns.

**Rules:**
- The simulation NEVER touches the DOM, Canvas, or any Svelte component directly.
- Before each tick, the previous state is snapshotted for interpolation.
- Given identical state + inputs, the simulation always produces identical output (determinism).
- All game logic lives here: player movement, collision detection, NPC behavior, item interaction, world state updates.

```ts
class SimulationModule {
  state: GameState;
  prevState: GameState;

  tick(dt: number, inputs: InputEvent[]) {
    this.prevState = deepClone(this.state);
    this.applyInputs(inputs);
    this.updateEntities(dt);
    this.checkCollisions();
    this.updateWorld(dt);
  }
}
```

---

### Module 3 — RendererModule
**Responsibility**: Read game state and draw to the Canvas. Never mutates state.

**Rules:**
- The renderer is a pure read on SimulationModule state.
- It interpolates between `prevState` and `state` using `alpha` for smooth visuals.
- It can be fully replaced (e.g., swap Canvas for WebGL) without touching any game logic.
- SvelteKit / Svelte components handle all UI outside the canvas (menus, inventory, dialogs, HUD).

```ts
class RendererModule {
  draw(prev: GameState, current: GameState, alpha: number) {
    const renderX = lerp(prev.player.x, current.player.x, alpha);
    const renderY = lerp(prev.player.y, current.player.y, alpha);
    // draw tilemap, entities, effects...
  }

  lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }
}
```

---

## Project File Structure

```
src/
├── lib/
│   ├── game/
│   │   ├── engine/
│   │   │   ├── GameLoop.ts
│   │   │   ├── InputModule.ts
│   │   │   ├── SimulationModule.ts
│   │   │   ├── RendererModule.ts
│   │   │   └── Camera.ts
│   │   ├── world/
│   │   │   ├── TileMap.ts
│   │   │   ├── Grid.ts
│   │   │   └── Collision.ts
│   │   ├── entities/
│   │   │   ├── Player.ts
│   │   │   └── NPC.ts
│   │   └── stores/
│   │       ├── player.ts
│   │       ├── inventory.ts
│   │       └── world.ts
│   └── ui/
│       ├── HUD.svelte
│       ├── Inventory.svelte
│       └── DialogBox.svelte
├── routes/
│   ├── +page.svelte
│   └── +layout.svelte
└── app.html
```

---

## Scalability Notes (Multiplayer / Voice Chat Readiness)
- The InputModule queue is serialization-ready for sending to a game server.
- The SimulationModule's determinism enables client-side prediction and server reconciliation.
- A future NetworkModule will sit between the local simulation and a server simulation, handling state snapshots, input relay, and delta compression.
- Voice chat will be implemented via WebRTC as a completely orthogonal module — it does not interact with the game loop.

---

## Coding Standards
- TypeScript everywhere. No `any`.
- Pure functions preferred in simulation logic.
- Svelte components are UI-only. They read from stores, they do not run game logic.
- Every new system must respect the Input → Simulation → Renderer data flow.
- No stateful side effects in the renderer.
- Document non-obvious decisions with a short comment referencing why (e.g., `// fixed timestep — see Fiedler 2006`).