import type {InventoryState} from "$lib/game/types/inventory.ts";
import type {EntityId, TileCoord} from "$lib/game/types/primitives.ts";

// ============================================================
// ENTITY TYPES
// ============================================================

export type EntityKind = 'player' | 'npc' | 'animal' | 'remote_player';

/**
 * Fields shared by every entity in the world.
 * All animation and position data lives here so the renderer can handle
 * any entity type uniformly without branching on kind.
 */
export interface BaseEntity {
  /** Stable unique identifier. Never reused after an entity is removed. */
  id: EntityId;
  /** Discriminant for narrowing Entity to a specific subtype. */
  kind: EntityKind;

  // World position (simulation units, not pixels)
  x: number;
  y: number;
  /** Position from the previous simulation tick — used by the renderer to lerp smoothly between ticks. */
  prevX: number;
  /** Position from the previous simulation tick — used by the renderer to lerp smoothly between ticks. */
  prevY: number;

  /** Cardinal direction the entity is currently facing — drives sprite row selection. */
  facing: 'north' | 'south' | 'east' | 'west';

  // Animation state (owned by simulation, not renderer)
  /** High-level locomotion state; maps to an animation clip in the sprite sheet. */
  animState: 'idle' | 'walk' | 'run' | 'interact';
  /** Current frame index within the active animation clip. */
  animFrame: number;
  /** Milliseconds accumulated since the last frame advance. */
  animTimer: number;
}

/**
 * The locally-controlled player character.
 * Carries inventory and dialogue state — neither field exists on remote or NPC entities
 * because those are server-authoritative or AI-driven.
 */
export interface PlayerEntity extends BaseEntity {
  kind: 'player';
  /** Display name shown in the UI. */
  name: string;
  /** Movement speed in simulation units per second. */
  speed: number;
  inventory: InventoryState;
  /** EntityId of the item currently held/wielded, or null if hands are empty. */
  heldItemId: EntityId | null;
  /** 0.0 → 1.0 — gates sprinting and physical interactions; regenerates over time. */
  stamina: number;
  /** Non-null while the player is in an active dialogue exchange. */
  dialogue: DialogueState | null;
}

/**
 * A remote player in a multiplayer session.
 * Position is interpolated from server snapshots — no local simulation authority.
 * Inventory is intentionally absent; the server is authoritative for other players.
 */
export interface RemotePlayerEntity extends BaseEntity {
  kind: 'remote_player';
  name: string;
}

/**
 * A non-player character driven by an AI behavior state machine.
 * Behavior and schedule are separate so patrol/wander logic can be hot-swapped
 * without discarding the NPC's time-of-day schedule.
 */
export interface NpcEntity extends BaseEntity {
  kind: 'npc';
  /** Key into the NPC definition table (e.g. "villager_tom"). Drives dialogue trees and loot. */
  npcType: string;
  /** Current AI state — updated each simulation tick by the behavior system. */
  behaviorState: NpcBehaviorState;
  /** Non-null while the NPC is engaged in conversation with the player. */
  dialogue: DialogueState | null;
  /** Time-of-day location schedule — where this NPC should be and what they do. */
  schedule: NpcScheduleState;
}

/**
 * A passive or reactive animal entity (fox, rabbit, bird, etc.).
 * Simpler than NPCs — no dialogue, no schedule, purely reactive behavior.
 */
export interface AnimalEntity extends BaseEntity {
  kind: 'animal';
  /** Species identifier — references animal definition table (e.g. "fox", "rabbit"). */
  species: string;
  /** Current AI state — updated each simulation tick. */
  behaviorState: AnimalBehaviorState;
  /** True while the animal is in an active flee response — overrides normal movement. */
  fleeing: boolean;
}

/**
 * Discriminated union of all entity types.
 * Use a switch on `entity.kind` for exhaustive type narrowing:
 *   switch (entity.kind) { case 'player': ...; case 'npc': ...; }
 */
export type Entity = PlayerEntity | RemotePlayerEntity | NpcEntity | AnimalEntity;



// ============================================================
// NPC / ANIMAL BEHAVIOR
// ============================================================

export interface NpcBehaviorState {
  /** Active behavior mode. The behavior system transitions between these each tick. */
  current: 'idle' | 'wander' | 'follow_schedule' | 'talking' | 'fleeing';
  /** Tile the NPC is currently navigating toward, or null if stationary. */
  target: TileCoord | null;
  /** Pre-computed tile path from the pathfinder. Consumed front-to-back as the NPC moves. */
  pathQueue: TileCoord[];
  /** Countdown timer in ms before the NPC picks a new wander destination. */
  wanderTimer: number;
}

export interface NpcScheduleState {
  /**
   * Ordered list of time-of-day slots defining where the NPC should be and what activity
   * they perform. `fromTick`/`toTick` are absolute simulation ticks (see WorldTime.ticks).
   */
  entries: Array<{ fromTick: number; toTick: number; location: TileCoord; activity: string }>;
}

export interface AnimalBehaviorState {
  /** Active behavior mode. Transitions are triggered by proximity, time, or noise events. */
  current: 'idle' | 'graze' | 'wander' | 'flee' | 'sleep';
  /** Tile the animal is moving toward, or null if stationary. */
  target: TileCoord | null;
  /** EntityId of the entity the animal is fleeing from, or null if not in flee mode. */
  fleeTarget: EntityId | null;
  /** General-purpose tick timer used by idle, graze, and wander transitions. */
  timer: number;
}

// ============================================================
// DIALOGUE
// ============================================================

export interface DialogueState {
  /** Whether the dialogue UI is currently visible and blocking player input. */
  active: boolean;
  /** The NPC participating in this exchange. */
  npcId: EntityId;
  /** Ordered list of dialogue lines to display sequentially. */
  lines: string[];
  /** Index into `lines` for the line currently being shown. */
  currentLine: number;
  /** True when the system is waiting for the player to press a confirm key to advance. */
  awaitingInput: boolean;
}
