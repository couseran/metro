// ============================================================
// PROPS (interactive / placeable / destroyable objects)
// ============================================================

import type {EntityId} from "$lib/game/types/primitives.ts";

/**
 * Category of a world prop.
 * Natural props (tree, rock, bush) are typically destructible.
 * Interactive props (chest, sign, campfire) respond to the E key.
 * Structural props (fence, wall, bridge) are solid and usually indestructible.
 * placed_item covers anything the player has placed from their inventory.
 */
export type PropKind =
    | 'tree' | 'rock' | 'bush'               // natural — usually destructible, may have loot
    | 'chest' | 'sign' | 'campfire'           // interactive — triggered by player proximity + E
    | 'fence' | 'wall' | 'bridge'             // structural — solid, not interactive
    | 'placed_item';                          // player-placed — can always be picked back up

/**
 * Runtime state of a single world prop.
 * Props are stored in a flat map (GameState.props) and indexed spatially
 * via GameState.propSpatialIndex for fast collision and interaction lookups.
 */
export interface PropState {
  /** Stable unique identifier. Matches the key in GameState.props. */
  id: EntityId;
  /** Determines rendering, collision behaviour, and interaction type. */
  kind: PropKind;
  /** Tile X coordinate (not pixels). */
  x: number;
  /** Tile Y coordinate (not pixels). */
  y: number;
  /** Whether this prop blocks entity movement. Used by the collision system. */
  solid: boolean;
  /** Whether the player can interact with this prop via the E key. */
  interactive: boolean;
  /** Remaining hit points, or null if this prop cannot be destroyed. */
  health: number | null;
  /** Key into the loot definition table, or null if the prop drops nothing on destruction. */
  lootTable: string | null;
  /** Prop-specific runtime data (e.g. chest contents, sign text, campfire fuel level). */
  metadata: Record<string, unknown>;
}
