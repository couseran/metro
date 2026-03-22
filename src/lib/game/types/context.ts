// src/lib/game/types/context.ts
//
// Interaction context system — controls what the player can do at any moment.
//
// The game maintains an immutable stack of InteractionContext values.
// The top of the stack is the "active context" and determines which systems
// process input each tick.  Only the root 'gameplay' context allows free
// movement and world interaction; all other contexts block or redirect input
// to their own logic (inventory browsing, dialogue selection, etc.).
//
// The stack pattern makes nested flows natural and composable:
//   [gameplay] → push inventory → [gameplay, inventory]
//   [gameplay, dialogue] → push inventory (sell flow) → [gameplay, dialogue, inventory]
// When each sub-flow resolves, it pops itself and passes an optional result
// back to the context below it.

import type { EntityId } from '$lib/game/types/primitives';

// ─── Container kinds ──────────────────────────────────────────────────────────

/**
 * The semantic kind of a container prop.
 * Determines which UI panel is opened and which inventory rules apply.
 */
export type ContainerKind = 'chest' | 'barrel' | 'shop';

// ─── Context union ────────────────────────────────────────────────────────────

/**
 * One frame in the interaction stack.
 * Each variant carries the payload its system needs.
 *
 * Adding a new interaction is a two-step process:
 *   1. Add a variant here.
 *   2. Handle it in ContextSystem (permissions) and SimulationModule (input routing).
 */
export type InteractionContext =
    /** Free-roam — player can move, interact, and pick up items. Always at index 0. */
    | { readonly kind: 'gameplay' }

    /**
     * Player is browsing their own inventory.
     * Movement and world interaction are blocked.
     * Player animation: phone_open → phone_idle.
     * Optionally restricted to a specific purpose (e.g. 'sell' limits visible items).
     */
    | {
        readonly kind:    'inventory';
        readonly purpose: InventoryPurpose;
      }

    /**
     * A dialogue exchange is in progress with an NPC.
     * Movement and world interaction are blocked.
     * The active script line drives which UI choices are shown.
     */
    | {
        readonly kind:     'dialogue';
        readonly npcId:    EntityId;
        readonly scriptId: string;
      }

    /**
     * Player is accessing a container prop (chest, barrel, shop).
     * Shows a split-panel UI: container contents + player inventory.
     * Movement and world interaction are blocked.
     */
    | {
        readonly kind:          'container';
        readonly propId:        EntityId;
        readonly containerKind: ContainerKind;
      }

    /** A full-screen menu is open (pause, settings, save/load). */
    | {
        readonly kind:   'menu';
        readonly menuId: string;
      };

// ─── Inventory purpose ────────────────────────────────────────────────────────

/**
 * Why the inventory was opened.
 * 'browse'  → free management (F key from gameplay)
 * 'sell'    → sell items to an NPC; only sellable items are actionable
 * 'select'  → pick one item for a dialogue branch; confirms on click
 * 'craft'   → ingredient selection at a crafting station
 */
export type InventoryPurpose = 'browse' | 'sell' | 'select' | 'craft';

// ─── Stack type ───────────────────────────────────────────────────────────────

/**
 * Immutable context stack.
 * Index 0 is always { kind: 'gameplay' }.
 * The active context is the last element (highest index).
 */
export type ContextStack = readonly InteractionContext[];

/**
 * The default stack every session starts from.
 * Frozen so it is safe to assign as a default without cloning.
 */
export const ROOT_CONTEXT: ContextStack = Object.freeze([
    { kind: 'gameplay' } as const,
]);
