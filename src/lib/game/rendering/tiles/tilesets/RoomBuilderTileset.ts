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
// HOW TO ADD AUTOTILE VARIANTS FOR A TILE (shape-based, e.g. walls):
//   1. Add a rule to TILE_AUTOTILE_RULES in AutotileRules.ts.
//   2. Identify the sprite positions in the sheet (one per bitmask value).
//      4-neighbour: bitmask 0–15.  8-neighbour/blob: up to 47 meaningful values.
//      Bitmask bits: N=1, E=2, S=4, W=8, NE=16, SE=32, SW=64, NW=128.
//   3. Map each bitmask → flat index in the tile's autoTileMap entry.
//   4. Variants that are not yet mapped fall back to tileMap automatically.
//
// HOW TO ADD A SHADOW / DIRECTIONAL AUTOTILE (e.g. carpet shadows):
//   1. Add a blob rule to AutotileRules.ts whose predicate checks for the
//      shadow-casting tile type (e.g. WALL).
//   2. Add an autoTileMask entry to restrict which bits affect the lookup.
//      Only bits in the mask are used; all others collapse to the same key.
//      Example: NORTH | WEST | NORTH_WEST — only three directions produce shadows.
//   3. Map only the meaningful masked bitmask values in autoTileMap.
//      All other combinations fall through to tileMap (no-shadow fallback).
//
// HOW TO ADD A MATERIAL VARIANT FOR A TILE:
//   1. Add the new variant constant to the relevant *Variant object in materials.ts.
//   2. Identify the sprite positions for this variant in the sheet.
//   3. Add a materialAutoTileMap entry:
//        [TileType.FOO]: { [FooVariant.BAR]: { maskedBitmask: R*17+C, … } }
//   4. Non-default variants must map bitmask 0 to their own base sprite; otherwise
//      they fall through to tileMap (the SMOOTH/default base sprite).
//   5. Unmapped bitmasks fall back to autoTileMap[tileType][bitmask] automatically.
//
// TileType.VOID is intentionally absent — unloaded tiles are never drawn.

import type { TilesetConfig } from '../TilesetConfig';
import { TileType }           from '../../../types/world';
import { NeighborBit }        from '../../../systems/tiles/Autotile.ts';
import { WallVariant, CarpetVariant } from '../../../types/materials';

export const ROOM_BUILDER_TILESET: TilesetConfig = {
  src:         '/sprites/tilesets/Room_Builder_16x16.png',
  tileWidth:   16,
  tileHeight:  16,
  tilesPerRow: 17,  // 272px / 16px = 17 columns

  tileMap: {
    // col 15, row 10  →  10 * 17 + 15 = 185
    [TileType.CARPET]: 6*17+15,

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

  // ─── Shadow direction mask ────────────────────────────────────────────────────
  //
  // Carpet only acts on N, W, NW bits.  Any other wall neighbour (E, S, SE…)
  // is irrelevant for shadows and is zeroed before the lookup, so all such
  // combinations collapse to 0 and fall through to tileMap (no-shadow sprite).
  //
  // Valid masked values: 0 (no shadow), 1 (N), 8 (W), 9 (N+W open), 137 (N+W+NW corner).
  autoTileMask: {
    [TileType.CARPET]: NeighborBit.NORTH | NeighborBit.WEST | NeighborBit.NORTH_WEST,
  },

  autoTileMap: {
    // Wall autotile variants (DEFAULT / stone material) — one sprite per bitmask (0–15).
    // Bitmask bits: NORTH=1, EAST=2, SOUTH=4, WEST=8 (see NeighborBit in Autotile.ts).
    [TileType.WALL]: {
      0b0000: 13*17+1,  //  0 — isolated pillar          (no neighbours)
      0b0001: 13*17+3,  //  1 — dead end, open south      (N only)
      0b0010: 13*17+0,  //  2 — dead end, open west       (E only)
      0b0011: 13*17+7,  //  3 — corner NE                 (N + E)
      0b0100: 17+16,    //  4 — dead end, open north      (S only)
      0b0101: 17+15,    //  5 — vertical segment          (N + S)
      0b0110: 16,       //  6 — corner SE                 (E + S)
      0b0111: 17+15,    //  7 — T-junction, open west     (N + E + S)
      0b1000: 13*17+2,  //  8 — dead end, open east       (W only)
      0b1001: 13*17+9,  //  9 — corner NW                 (N + W)
      0b1010: 13*17+1,  // 10 — horizontal segment        (E + W)
      0b1011: 13*17+8,  // 11 — T-junction, open south    (N + E + W)
      0b1100: 14,       // 12 — corner SW                 (S + W)
      0b1101: 17+15,    // 13 — T-junction, open east     (N + S + W)
      0b1110: 15,       // 14 — T-junction, open north    (E + S + W)
      0b1111: 17+15,    // 15 — cross / fully surrounded  (all 4 neighbours)
    },

    // ── Carpet shadow variants (SMOOTH / default material) ────────────────────
    //
    // Mode: 'independent' corners + autoTileMask N|W|NW.
    // After masking, the 7 non-zero combinations map as follows:
    //
    //   N dominates when present (regardless of NW).
    //   W dominates when present without N (regardless of NW).
    //   NW alone produces its own distinct diagonal shadow.
    //   N+W and N+W+NW are visually identical (NW adds nothing when N+W present).
    //
    // Bitmask 0 (no nearby walls) falls back to tileMap — no entry needed.
    //
    [TileType.CARPET]: {
      0b00000001: 6*17-17+15,  //   1 — N only          → top-edge shadow
      0b00001000: 6*17+14,     //   8 — W only          → left-edge shadow
      0b10000000: 6*17-17+16,  // 128 — NW only         → diagonal inner-corner shadow
      0b10000001: 6*17-17+15,  // 129 — N + NW          → top-edge shadow  (N dominates)
      0b10001000: 6*17+14,     // 136 — W + NW          → left-edge shadow (W dominates)
      0b00001001: 6*17-17+14,  //   9 — N + W           → top + left shadow
      0b10001001: 6*17-17+14,  // 137 — N + W + NW      → same as 9 (NW redundant here)
    },
  },

  materialAutoTileMap: {
    // ── WALL material variants ────────────────────────────────────────────────
    //
    // Wall sprites are laid out in the sheet with one material per row-pair.
    // Default (stone) uses row 13 as the pillar/corner base row.
    // Wood uses row 11 as its equivalent base row.
    //
    // Bitmasks 4–7 and 12–15 (shapes involving S or SW arms) reference rows 0–1
    // in the stone variant; their wood equivalents are not yet identified in the
    // sheet so they fall back to the stone shape via autoTileMap.
    [TileType.WALL]: {
      [WallVariant.WOOD]: {
        0b0000: 11*17+1,  //  0 — isolated pillar          (no neighbours)
        0b0001: 11*17+3,  //  1 — dead end, open south      (N only)
        0b0010: 11*17+0,  //  2 — dead end, open west       (E only)
        0b0011: 11*17+7,  //  3 — corner NE                 (N + E)
        // 0b0100 → 0b0111: For S-arm shapes, the variant are the same
        0b1000: 11*17+2,  //  8 — dead end, open east       (W only)
        0b1001: 11*17+9,  //  9 — corner NW                 (N + W)
        0b1010: 11*17+1,  // 10 — horizontal segment        (E + W)
        0b1011: 11*17+8,  // 11 — T-junction, open south    (N + E + W)
        // 0b1100 → 0b1111: For SW-arm shapes, the variant are the same
      },
    },

    // ── Carpet material variants ───────────────────────────────────────────────
    //
    // Each non-default variant must map bitmask 0 to its own base sprite;
    // without it, bitmask 0 falls through to tileMap (SMOOTH base, index 185).
    // The 7 shadow bitmasks mirror the SMOOTH layout above.
    //
    // TODO: replace all placeholder indices with actual sprite positions.
    [TileType.CARPET]: {
      [CarpetVariant.STRIPE_V]: {
        0b00000000: 10*17+15,     //   0 — STRIPE_V base (no shadow)
        0b00000001: 10*17-17+15,  //   1 — STRIPE_V N only          → top-edge shadow
        0b00001000: 10*17+14,     //   8 — STRIPE_V W only          → left-edge shadow
        0b10000000: 10*17-17+16,  // 128 — STRIPE_V NW only         → diagonal inner-corner shadow
        0b10000001: 10*17-17+15,  // 129 — STRIPE_V N + NW          → top-edge shadow  (N dominates)
        0b10001000: 10*17+14,     // 136 — STRIPE_V W + NW          → left-edge shadow (W dominates)
        0b00001001: 10*17-17+14,  //   9 — STRIPE_V N + W           → top + left shadow
        0b10001001: 10*17-17+14,  // 137 — STRIPE_V N + W + NW      → same as 9 (NW redundant here)
      },
      [CarpetVariant.STRIPE_H]: {
        0b00000000: 12*17+15,     //   0 — STRIPE_H base (no shadow)
        0b00000001: 12*17-17+15,  //   1 — STRIPE_H N only          → top-edge shadow
        0b00001000: 12*17+14,     //   8 — STRIPE_H W only          → left-edge shadow
        0b10000000: 12*17-17+16,  // 128 — STRIPE_H NW only         → diagonal inner-corner shadow
        0b10000001: 12*17-17+15,  // 129 — STRIPE_H N + NW          → top-edge shadow  (N dominates)
        0b10001000: 12*17+14,     // 136 — STRIPE_H W + NW          → left-edge shadow (W dominates)
        0b00001001: 12*17-17+14,  //   9 — STRIPE_H N + W           → top + left shadow
        0b10001001: 12*17-17+14,  // 137 — STRIPE_H N + W + NW      → same as 9 (NW redundant here)
      },
    },
  },
};
