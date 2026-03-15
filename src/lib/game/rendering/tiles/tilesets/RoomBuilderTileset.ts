// src/lib/game/rendering/tiles/tilesets/RoomBuilderTileset.ts
//
// Tileset config for Room_Builder_16x16.png — LimeZu "Modern Interiors".
//
// Sheet dimensions: 272 × 368 px → 17 columns × 23 rows of 16×16 tiles.
//
// HOW TO ADD A TILE:
//   1. Open /static/sprites/tilesets/Room_Builder_16x16.png in an image editor.
//   2. Find the tile at column C, row R (zero-based).
//   3. Flat index = R * 17 + C.  Add it to tileMap.
//   4. If the sprite is taller than 16px, add a TileOverride (height + yOffset).
//   5. If the sprite can visually overlap entities, add it to tileRenderLayer as 'world'.
//
// TileType.VOID is intentionally absent — unloaded tiles are never drawn.

import type { TilesetConfig } from '../TilesetConfig';
import { TileType }           from '../../../types/world';

export const ROOM_BUILDER_TILESET: TilesetConfig = {
  src:         '/sprites/tilesets/Room_Builder_16x16.png',
  tileWidth:   16,
  tileHeight:  16,
  tilesPerRow: 17,  // 272px / 16px = 17 columns

  tileMap: {
    // col 15, row 10  →  10 * 17 + 15 = 185
    [TileType.CARPET]: 185,

    // col 1,  row 6   →  6  * 17 + 1  = 103
    // Sprite is 16×32 (spans two tile rows in the image).
    [TileType.WALL]:   103-17,

    // TODO: identify remaining tile coordinates from the spritesheet
    // [TileType.SAND]:          ?,
    // [TileType.PATH_SAND]:     ?,
    // [TileType.DIRT]:          ?,
    // [TileType.STONE]:         ?,
    // [TileType.WATER]:         ?,
    // [TileType.SHALLOW_WATER]: ?,
    // [TileType.SNOW]:          ?,
    // [TileType.FLOWERS]:       ?,
  },

  tileOverrides: {
    // The wall sprite is 16×32: its bottom 16px aligns with the tile's ground row,
    // and the top 16px visually extends one tile upward into the row above.
    // yOffset = -16 shifts the draw origin up so the sprite anchors correctly.
    [TileType.WALL]: { height: 32, yOffset: -16 },
  },

  tileRenderLayer: {
    // Walls have vertical extent and must be Y-sorted against entities so the
    // player appears correctly in front of or behind them depending on position.
    [TileType.WALL]: 'world',
  },
};
