# Adding Props

This guide covers adding new props to the game — furniture, trees, chests, doors, rugs, paintings, and any other placeable world object.

## Overview

The prop system has three layers of indirection:

1. **PropDefinition** — static blueprint: size, collision, loot, interaction type. Registered once at startup in `data/propDefinitions.ts`.
2. **PropState** — runtime instance: position, health, stateId, animFrame. Lives in `GameState.props`.
3. **PropSpriteConfig** — rendering data: spritesheet coordinates, animations, tiled-repeat layout. Registered in `rendering/props/PropSpriteRegistry.ts`.

All three use the same `type` string as their shared key (e.g. `'chair'`, `'oak_tree'`, `'chest'`).

### Render layers

Every prop belongs to one of three render layers:

| Layer    | Description                                                                 | Draw pass         |
|----------|-----------------------------------------------------------------------------|-------------------|
| `floor`  | Flat surface objects (rugs, doormats, floor decals). Always beneath entities. | Pass 1b — no Y-sort |
| `object` | Furniture, trees, rocks — anything with height. Y-sorted with entities.    | Pass 2 — Y-sorted |
| `wall`   | Mounted objects (paintings, windows, shelves). Y-sorted with a +0.5 bias so they appear on the wall face but behind entities approaching from the south. | Pass 2 — Y-sorted |

### Collision

Two spatial indexes are maintained on `GameState`:

- `propLayerIndex: Map<string, PropLayerSlot>` — one slot per layer per tile, used to validate placement.
- `propSolidIndex: Set<string>` — flat set of `"tx,ty"` keys for all solid tiles, used by `TileCollision.resolveMovement` for O(1) collision.

Both are rebuilt from scratch by `buildPropLayerIndex` / `buildPropSolidIndex` in `PropSystem.ts`, and incrementally updated by `indexProp` / `deindexProp`.

---

## Step 1 — Define the PropDefinition

Prop definitions live in `src/lib/game/data/props/`. Create a file per category (furniture, nature, structures…) and import it from `data/propDefinitions.ts`.

**`src/lib/game/data/props/PropDefinitionRegistration.ts`** (example)

```ts
import { registerPropDefinition } from '../propDefinitions';

registerPropDefinition({
  type:       'chair',
  layer:      'object',
  defaultWidth:  1,
  defaultHeight: 1,
  resizable:  false,
  rotatable:  true,

  // Solid mask: 1 = solid, 0 = passable. Row-major, [row][col].
  // For a 1×1 prop this is always [[1]].
  solidMask: [[1]],

  placementConstraints: [{ tileType: 'CARPET' }, { tileType: 'STONE' }],

  interactionType: 'seat',
  breakable: true,
  breakTool: null,     // null = any tool / bare hand
  breakHits: 1,
  maxHealth: 1,

  lootTableId: 'chair_drop',    // null if no drops
  npcPathable: false,           // blocks NPC pathfinding
});
```

**Key fields:**

| Field | Type | Notes |
|---|---|---|
| `type` | `string` | Unique key. Must match the sprite registry key. |
| `layer` | `'floor' \| 'object' \| 'wall'` | See render layer table above. |
| `defaultWidth` / `defaultHeight` | `number` | Tile size. For resizable props `defaultWidth` is the minimum width. |
| `resizable` | `boolean` | Horizontal extension only. Uses tiled-repeat sprite layout. |
| `rotatable` | `boolean` | Enables 0/1/2/3 rotation values (90° CW increments). |
| `solidMask` | `number[][]` | `solidMask[row][col]`. Must be `defaultHeight` rows × `defaultWidth` cols. |
| `placementConstraints` | `PlacementConstraint[]` | Array of allowed tile types. Empty = any tile. |
| `interactionType` | see below | Drives `interactWithProp()` behavior. |
| `breakTool` | `ToolKind \| null` | Required tool kind. `null` = bare hand. |
| `breakHits` | `number` | Hits to destroy. `1` = one-shot. |
| `lootTableId` | `string \| null` | Key into `data/lootTables.ts`. |
| `npcPathable` | `boolean` | Whether NPCs can walk through this prop. |

**Interaction types:**

| Value | Behavior |
|---|---|
| `'none'` | No interaction |
| `'destructible'` | Hit to break only |
| `'container'` | Opens inventory UI on interact |
| `'door'` | Toggles `stateId` between `'open'` and `'closed'`, rebuilds solid index |
| `'sign'` | Emits dialogue event |
| `'seat'` | Player sits down |
| `'crafting'` | Opens crafting UI |
| `'growth'` | Advances through `growthStages` over time |

Import the file in **`src/lib/game/data/propDefinitions.ts`**:

```ts
import './props/furniture';
import './props/nature';
// …
```

---

## Step 2 — Register the sprite config

**`src/lib/game/rendering/props/PropSpriteRegistry.ts`** (or a sub-file imported from it)

```ts
import { registerPropSprite } from './PropSpriteRegistry';

registerPropSprite('chair', {
  frames: [
    { src: '/sprites/props/furniture.png', sx: 0, sy: 0, sw: 16, sh: 32, anchorX: 0, anchorY: 0 },
  ],
});
```

**`PropSpriteFrame` fields:**

| Field | Description |
|---|---|
| `src` | Path to the spritesheet (must be in the asset manifest) |
| `sx`, `sy` | Source X/Y in the spritesheet (pixels) |
| `sw`, `sh` | Source width/height (pixels) |
| `anchorX`, `anchorY` | Fractional tile offset applied before drawing. `(0, 0)` = top-left of tile. |

### Rotation variants

For rotatable props, provide a frame per rotation:

```ts
registerPropSprite('chair', {
  frames: [/* fallback */],
  rotationFrames: {
    0: [{ src: '/sprites/props/furniture.png', sx: 0,  sy: 0, sw: 16, sh: 32, anchorX: 0, anchorY: 0 }],
    1: [{ src: '/sprites/props/furniture.png', sx: 16, sy: 0, sw: 16, sh: 32, anchorX: 0, anchorY: 0 }],
    2: [{ src: '/sprites/props/furniture.png', sx: 32, sy: 0, sw: 16, sh: 32, anchorX: 0, anchorY: 0 }],
    3: [{ src: '/sprites/props/furniture.png', sx: 48, sy: 0, sw: 16, sh: 32, anchorX: 0, anchorY: 0 }],
  },
});
```

### State variants (doors, chests, etc.)

```ts
registerPropSprite('chest', {
  frames: [/* fallback */],
  stateFrames: {
    'closed': [{ src: '/sprites/props/chest.png', sx: 0,  sy: 0, sw: 16, sh: 32, anchorX: 0, anchorY: 0 }],
    'open':   [{ src: '/sprites/props/chest.png', sx: 16, sy: 0, sw: 16, sh: 32, anchorX: 0, anchorY: 0 }],
  },
});
```

### Animation

Multiple frames in an array animate automatically (frame advances via `prop.animFrame`):

```ts
registerPropSprite('torch', {
  frames: [
    { src: '/sprites/props/torches.png', sx: 0,  sy: 0, sw: 16, sh: 32, anchorX: 0, anchorY: 0 },
    { src: '/sprites/props/torches.png', sx: 16, sy: 0, sw: 16, sh: 32, anchorX: 0, anchorY: 0 },
    { src: '/sprites/props/torches.png', sx: 32, sy: 0, sw: 16, sh: 32, anchorX: 0, anchorY: 0 },
  ],
});
```

Frame advancement is driven by `prop.animTimer` and `prop.animFrame` in `tickProps()`. Set `animated: true` in the `PropDefinition` to enable ticking.

### Frame resolution priority

`resolveActiveFrames()` picks frames in this order:

1. `rotationFrames[prop.rotation]` — if defined for this rotation
2. `stateFrames[prop.stateId]` — if defined for this state
3. `variantFrames[prop.variant]` — if defined for this variant
4. `frames` — base fallback

---

## Step 3 — Add sprite images to the asset manifest

If the sprite comes from a new image file, place it in `static/sprites/props/` and register it:

**`src/lib/game/assets/manifest.ts`**

```ts
export const MANIFEST = {
  images: [
    // …existing…
    '/sprites/props/furniture.png',
  ],
};
```

Existing images shared with other props do not need to be re-added.

---

## Step 4 — Register a loot table (if the prop drops items)

**`src/lib/game/data/lootTables.ts`**

```ts
import { registerLootTable } from './lootTables';

registerLootTable({
  id:    'chair_drop',
  rolls: 1,           // number of independent draws
  entries: [
    {
      itemId:        'plank',
      quantity:      2,
      weight:        80,    // relative probability
      requiredTool:  null,  // null = any tool qualifies
      minToolTier:   0,     // minimum tool tier (0 = bare hand)
    },
    {
      itemId:        'nail',
      quantity:      1,
      weight:        20,
    },
  ],
});
```

The `rollLoot(tableId, toolUsed, toolTier, rng)` function in `PropSystem.ts` filters entries by tool requirement and picks `rolls` times using weighted random selection.

---

## Recipes

### Simple one-tile decoration (no drops)

```ts
registerPropDefinition({
  type: 'flower_pot', layer: 'object',
  defaultWidth: 1, defaultHeight: 1, resizable: false, rotatable: false,
  solidMask: [[0]],    // passable — player can walk through it
  placementConstraints: [], interactionType: 'none',
  breakable: true, breakTool: null, breakHits: 1, maxHealth: 1,
  lootTableId: null, npcPathable: true,
});
```

### Resizable floor prop (rug / carpet)

```ts
registerPropDefinition({
  type: 'rug', layer: 'floor',
  defaultWidth: 2, defaultHeight: 3, resizable: true, rotatable: false,
  solidMask: [[0,0],[0,0],[0,0]],   // floor props are never solid
  placementConstraints: [{ tileType: 'CARPET' }],
  interactionType: 'none', breakable: true, breakTool: null, breakHits: 1, maxHealth: 1,
  lootTableId: 'rug_drop', npcPathable: true,
});
```

For the sprite, use `tiledRepeat` instead of `frames`:

```ts
registerPropSprite('rug', {
  frames: [],    // unused when tiledRepeat is set
  tiledRepeat: {
    src:          '/sprites/props/rugs.png',
    leftSx:   0,  sy: 0,
    midSx:   48,
    rightSx: 96,
    sectionWidth: 48,   // pixels per column section
    totalHeight: 144,   // total sprite height in pixels
  },
});
```

The renderer draws: `leftSx` for column 0, `midSx` for all inner columns, `rightSx` for the last column.

### Stateful prop (door)

```ts
registerPropDefinition({
  type: 'wooden_door', layer: 'object',
  defaultWidth: 1, defaultHeight: 2, resizable: false, rotatable: true,
  solidMask: [[1],[1]],    // both tiles solid when closed
  placementConstraints: [{ tileType: 'WALL' }],
  interactionType: 'door',
  breakable: true, breakTool: 'axe', breakHits: 3, maxHealth: 3,
  lootTableId: 'door_drop', npcPathable: false,
});
```

`interactWithProp()` toggles `stateId` between `'closed'` (default) and `'open'`, and incrementally rebuilds `propSolidIndex` for the affected tiles. No extra code needed.

### Growing plant

```ts
registerPropDefinition({
  type: 'oak_sapling', layer: 'object',
  defaultWidth: 1, defaultHeight: 1, resizable: false, rotatable: false,
  solidMask: [[0]],
  placementConstraints: [{ tileType: 'GRASS' }],
  interactionType: 'growth',
  animated: false,
  growthStages: [
    { stateId: 'seedling',  duration: 12000 },  // ticks
    { stateId: 'sapling',   duration: 24000 },
    { stateId: 'mature',    duration: 0 },       // 0 = final stage, no more growth
  ],
  breakable: true, breakTool: 'axe', breakHits: 1, maxHealth: 1,
  lootTableId: 'sapling_drop', npcPathable: true,
});
```

`tickProps()` advances `prop.growthTimer` each tick and transitions `prop.stateId` automatically. Provide a `stateFrames` entry per stage in the sprite config.

### Container (chest)

```ts
registerPropDefinition({
  type: 'chest', layer: 'object',
  defaultWidth: 1, defaultHeight: 1, resizable: false, rotatable: false,
  solidMask: [[1]],
  placementConstraints: [],
  interactionType: 'container',
  breakable: true, breakTool: null, breakHits: 2, maxHealth: 2,
  lootTableId: null,   // chest contents are stored in prop.metadata, not rolled on break
  npcPathable: false,
});
```

On interaction `interactWithProp()` emits `PROP_CONTAINER_OPENED`. The UI layer listens for this event and opens the inventory panel, reading item data from `prop.metadata`.

---

## Placing props at runtime

Use `placeProp()` from `engine/PropSystem.ts`:

```ts
import { placeProp, canPlaceProp } from '$lib/game/engine/PropSystem';

const def = getPropDefinition('chair');
if (!def) return;

const validation = canPlaceProp(state, def, tileX, tileY, rotation, width);
if (!validation.ok) {
  console.warn('Cannot place prop:', validation.reason);
  return;
}

const { state: nextState } = placeProp(state, def, tileX, tileY, rotation);
```

`placeProp` returns a new `GameState` with the prop added to `state.props`, `propLayerIndex`, and `propSolidIndex`. It also emits a `PROP_PLACED` event.

---

## Prop sounds

See [adding-audio.md](./adding-audio.md#prop-sounds) for wiring prop events (`PROP_DESTROYED`, `PROP_DAMAGED`, `PROP_STATE_CHANGED`, `PROP_CONTAINER_OPENED`) to audio playback.
