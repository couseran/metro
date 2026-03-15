// src/lib/game/rendering/tiles/tilesets/RoomBuilderTileset.ts
//
// Tileset config for Room_Builder_16x16.png — LimeZu "Modern Interiors".
//
// Sheet dimensions: 272 × 368 px → 17 columns × 23 rows of 16×16 tiles.
//
// HOW TO ADD A TILE:
//   1. Open /static/sprites/tilesets/Room_Builder_16x16.png in an image editor.
//   2. Find the tile at column C, row R (zero-based).
//   3. Flat index = R * 17 + C.  Add it to tileMap as the default/fallback sprite.
//   4. If the sprite is taller than 16px, add a TileOverride (height + yOffset).
//   5. If the tile can visually overlap entities, add it to tileRenderLayer as 'world'.
//
// HOW TO ADD AUTOTILE VARIANTS FOR A TILE:
//   1. Identify the 16 sprite positions in the sheet (one per bitmask value 0–15).
//      Bitmask bits: NORTH=1, EAST=2, SOUTH=4, WEST=8 (see NeighborBit in Autotile.ts).
//   2. Map each bitmask → flat index in the tile's autoTileMap entry.
//   3. Variants that are not yet mapped fall back to tileMap automatically.
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
    [TileType.WALL]: 0,

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

  autoTileMap: {
    // Wall autotile variants — one sprite per 4-neighbour bitmask value (0–15).
    // Bitmask bits: NORTH=1, EAST=2, SOUTH=4, WEST=8 (see NeighborBit in Autotile.ts).
    [TileType.WALL]: {
      0b0000: 17*17+1,  // 0  — isolated pillar         (no neighbours)
      0b0001: 17*17+3,  // 1  — dead end, open south     (N only)
      0b0010: 17*17,  // 2  — dead end, open west      (E only)
      0b0011: 17*17+7,  // 3  — corner NE                (N + E)
      0b0100: 17+16,  // 4  — dead end, open north     (S only)
      0b0101: 17+15,  // 5  — vertical segment         (N + S)
      0b0110: 16,  // 6  — corner SE                (E + S)
      0b0111: 17+15, // 7  — T-junction, open west    (N + E + S)
      0b1000: 17*17+2,  // 8  — dead end, open east      (W only)
      0b1001: 17*17+9,  // 9  — corner NW                (N + W)
      0b1010: 17*17+1,  // 10 — horizontal segment       (E + W)
      0b1011: 17*17+8,  // 11 — T-junction, open south   (N + E + W)
      0b1100: 14,      // 12 — corner SW                (S + W)
      0b1101: 17+15, // 13 — T-junction, open east    (N + S + W)
      0b1110: 15,      // 14 — T-junction, open north   (E + S + W)
      0b1111: 17+15,  // 15 — cross / fully surrounded (all 4 neighbours)
    },
  },
};
