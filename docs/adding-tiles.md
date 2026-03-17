# Adding Tile Types and Variants

This guide covers adding new surface types (floors, walls, water, etc.) and their visual variants to the game world.

## Overview

The tile system has three layers of indirection:

1. **TileType** — gameplay identity (affects collision, audio, pathfinding)
2. **Material variant** — visual sub-type within a TileType (same gameplay, different sprite)
3. **Autotile bitmask** — shape variant driven by neighboring tiles (edge blending, wall corners)

Each `ChunkState` stores three parallel `Uint8Array`s per tile: `tiles` (TileType), `variantCache` (autotile bitmask), and `materialTiles` (material index).

## Step 1 — Add the TileType constant

**`src/lib/game/types/world.ts`**

Add a new entry to the `TileType` object. The value must be a unique integer.

```ts
export const TileType = {
  // ...existing...
  TILE_FLOOR: 11,
} as const;
```

If the tile is impassable (like a wall), also mark it in any walkability checks in the simulation layer.

## Step 2 — Add material variants (optional)

**`src/lib/game/types/materials.ts`**

Add an enum-style object for visual sub-types of your new tile. Omit this step if the tile has no variants.

```ts
export const TileFloorVariant = {
  PLAIN:      0,
  CHECKERED:  1,
  HEXAGONAL:  2,
} as const;
```

Material index `0` is always the default/fallback.

## Step 3 — Map sprites in the tileset config

**`src/lib/game/rendering/tiles/tilesets/RoomBuilderTileset.ts`**

This is the main rendering registration file. Sprite positions are expressed as flat indices into the tileset sheet (`row * tilesPerRow + col`, zero-indexed). The sheet is `Room_Builder_16x16.png` (17 columns).

### 3a — Static fallback sprite

Add an entry to `tileMap` as the default render position:

```ts
tileMap: {
  // ...existing...
  [TileType.TILE_FLOOR]: 7 * 17 + 3,  // row 7, col 3
},
```

### 3b — Tile dimensions (walls and tall sprites only)

If the sprite is taller than one tile (e.g. walls are 16×32), add an override:

```ts
tileOverrides: {
  // ...existing...
  [TileType.WALL]: { height: 32, yOffset: -16 },
},
```

### 3c — Render layer

Ground-level tiles render beneath entities. Tall tiles (walls, props) must be Y-sorted with entities:

```ts
tileRenderLayer: {
  // ...existing...
  [TileType.TILE_FLOOR]: 'ground',  // or 'world' for tall tiles
},
```

### 3d — Autotile variants (optional)

If the tile should blend with neighbors (wall corners, carpet shadows), add a bitmask → sprite index map. The bitmask encodes which of the 4 cardinal neighbors are the same tile type (N=1, E=2, S=4, W=8).

```ts
autoTileMap: {
  // ...existing...
  [TileType.TILE_FLOOR]: {
    0b0000: 7 * 17 + 3,
    0b0001: 7 * 17 + 4,
    // ...up to 0b1111 (16 entries)
  },
},
```

Use `autoTileMask` to restrict which neighbor bits are considered (e.g. only check north and west):

```ts
autoTileMask: {
  [TileType.TILE_FLOOR]: NORTH | WEST | NORTH_WEST,
},
```

### 3e — Material variant sprites (optional)

For each non-default material, provide its own bitmask → sprite map:

```ts
materialAutoTileMap: {
  // ...existing...
  [TileType.TILE_FLOOR]: {
    [TileFloorVariant.CHECKERED]: {
      0b0000: 8 * 17 + 0,
      // ...
    },
  },
},
```

The renderer resolves sprites in this priority order:
1. `materialAutoTileMap[tileType][material][maskedVariant]`
2. `autoTileMap[tileType][maskedVariant]`
3. `tileMap[tileType]`

## Step 4 — Add the sprite image (new tilesets only)

If your sprites come from a new image file, place it in `static/sprites/tilesets/` and register it:

**`src/lib/game/assets/manifest.ts`**

```ts
export const MANIFEST = {
  images: [
    // ...existing...
    '/sprites/tilesets/your_tileset.png',
  ],
};
```

Then create a new tileset config file alongside `RoomBuilderTileset.ts` and register it in `RendererModule.ts`.

## Footstep audio

See [adding-audio.md](./adding-audio.md) — footstep sounds are mapped from TileType in `AudioModule.ts`.

## Wall-mounted objects

Paintings, windows, shelves, and similar objects that hang on a wall face are **props**, not tiles. They are registered as `layer: 'wall'` props and participate in the Y-sorted world pass with a small sort bias so they appear on the wall face while still being correctly occluded by entities approaching from the south.

See [adding-props.md](./adding-props.md) for the full prop registration workflow.
