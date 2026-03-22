// ============================================================
// GAME EVENTS (simulation → outside world, one-way)
// ============================================================

// The simulation never calls audio.play() or UI.show() directly.
// Instead it pushes GameEvents into GameState.events. The game loop
// drains and dispatches them after each render pass, keeping the
// simulation pure and side-effect-free.

import type { EntityId, TileCoord } from '$lib/game/types/primitives.ts';
import type { ItemStack }           from '$lib/game/types/inventory.ts';
import type { TileTypeValue, WeatherKind } from '$lib/game/types/world.ts';

export type GameEvent =
    /** Emitted when the player walks over and collects an item from the ground. */
    | { type: 'ITEM_PICKED_UP';         entityId: EntityId;  itemId: string }

    // ── Prop lifecycle ───────────────────────────────────────────────────────

    /** Emitted when a prop is successfully placed in the world. */
    | { type: 'PROP_PLACED';            propId: EntityId;    position: TileCoord }

    /**
     * Emitted each time a destructible prop takes damage.
     * healthRemaining is the new HP value after applying the hit.
     */
    | { type: 'PROP_DAMAGED';           propId: EntityId;    healthRemaining: number }

    /**
     * Emitted when a destructible prop reaches 0 HP and is removed.
     * loot contains the ItemStack array rolled from the prop's loot table.
     * Handlers should spawn ground-item entities at `position`.
     */
    | { type: 'PROP_DESTROYED';         propId: EntityId;    position: TileCoord;  loot: ItemStack[] }

    /**
     * Emitted when a stateful prop transitions between named states.
     * Examples: door 'closed' → 'open', campfire 'unlit' → 'lit',
     *           plant 'sprout' → 'mature'.
     */
    | { type: 'PROP_STATE_CHANGED';     propId: EntityId;    from: string; to: string }

    /**
     * Emitted when the player opens a container prop (chest, barrel).
     * The UI layer should open the inventory panel for this prop.
     */
    | { type: 'PROP_CONTAINER_OPENED';  propId: EntityId;    playerId: EntityId }

    /**
     * Emitted when a resizable prop's width changes (carpet extended/shrunk).
     * Handlers may play a placement sound or update a ghost preview.
     */
    | { type: 'PROP_RESIZED';           propId: EntityId;    newWidth: number }

    // ── Entities ─────────────────────────────────────────────────────────────

    /** Emitted when the player initiates a conversation with an NPC. */
    | { type: 'DIALOGUE_STARTED';       npcId: EntityId }

    /**
     * Emitted each time an entity takes a footstep.
     * `tileType` drives the audio system to pick the correct surface sound.
     */
    | { type: 'FOOTSTEP';              entityId: EntityId;  tileType: TileTypeValue }

    /** Emitted when weather transitions between two states. */
    | { type: 'WEATHER_CHANGED';       from: WeatherKind;   to: WeatherKind }

    /** Emitted when a new entity is added to the world (spawn, warp-in, etc.). */
    | { type: 'ENTITY_SPAWNED';        entityId: EntityId }

    /** Emitted when an entity is removed from the world (death, despawn, disconnect). */
    | { type: 'ENTITY_REMOVED';        entityId: EntityId }

    // ── Inventory ────────────────────────────────────────────────────────────

    /**
     * Emitted when one or more items are added to an entity's inventory
     * (pickup, loot collection, trade, etc.).
     * Handlers may play a pick-up sound or show a brief item-gained animation.
     */
    | { type: 'INVENTORY_ITEM_ADDED';  entityId: EntityId; items: ItemStack[] }

    /**
     * Emitted when an entity tries to pick up or receive items but their
     * inventory has no free slots.
     * Handlers should show a "Inventory full" notification in the UI.
     */
    | { type: 'INVENTORY_FULL';        entityId: EntityId };
