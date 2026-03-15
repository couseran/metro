// ============================================================
// GAME EVENTS (simulation → outside world, one-way)
// ============================================================

// The simulation never calls audio.play() or UI.show() directly.
// Instead it pushes GameEvents into GameState.events. The game loop
// drains and dispatches them after each render pass, keeping the
// simulation pure and side-effect-free.

import type {EntityId, TileCoord} from "$lib/game/types/primitives.ts";
import type {TileTypeValue, WeatherKind} from "$lib/game/types/world.ts";

export type GameEvent =
    /** Emitted when the player walks over and collects an item from the ground. */
    | { type: 'ITEM_PICKED_UP';    entityId: EntityId;  itemId: string }

    /** Emitted when a destructible prop (tree, rock, etc.) reaches 0 health. */
    | { type: 'PROP_DESTROYED';    propId: EntityId;    position: TileCoord }

    /** Emitted when the player initiates a conversation with an NPC. */
    | { type: 'DIALOGUE_STARTED';  npcId: EntityId }

    /**
     * Emitted each time an entity takes a footstep.
     * `tileType` drives the audio system to pick the correct surface sound (stone, carpet, sand…).
     */
    | { type: 'FOOTSTEP';          entityId: EntityId;  tileType: TileTypeValue }

    /** Emitted when weather transitions between two states — triggers ambient audio crossfade. */
    | { type: 'WEATHER_CHANGED';   from: WeatherKind;   to: WeatherKind }

    /** Emitted when a new entity is added to the world (spawn, warp-in, etc.). */
    | { type: 'ENTITY_SPAWNED';    entityId: EntityId }

    /** Emitted when an entity is removed from the world (death, despawn, disconnect). */
    | { type: 'ENTITY_REMOVED';    entityId: EntityId };
