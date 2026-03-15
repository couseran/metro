// ============================================================
// WORLD / TILEMAP
// ============================================================

// Tile types are integers — fast to compare, cheap to serialize, safe to store in Uint8Array.
import type {EntityId} from "$lib/game/types/primitives.ts";
import type {DialogueState, Entity} from "$lib/game/types/entities.ts";
import type {PropState} from "$lib/game/types/props.ts";
import type {GameEvent} from "$lib/game/types/events.ts";

/**
 * Integer constants for tile surface types.
 * Values match the indices expected by the tileset renderer and the audio footstep system.
 * VOID (0) is the default — unloaded or out-of-bounds tiles should be treated as impassable.
 */
export const TileType = {
  VOID:          0,  // unloaded / out-of-bounds — impassable, renders as empty
  CARPET:        1,
  SAND:          2,
  PATH_SAND:     3,  // packed sand path — same surface as SAND but distinct sprite
  DIRT:          4,
  STONE:         5,
  WATER:         6,  // deep water — impassable without a boat
  SHALLOW_WATER: 7,  // wading depth — passable but slows movement
  SNOW:          8,
  FLOWERS:       9,
  WALL:          10, // solid wall — impassable, 16×32 sprite overhanging one tile above
} as const;

export type TileTypeValue = typeof TileType[keyof typeof TileType];

/**
 * A fixed-size section of the tile grid.
 * The world is divided into chunks so only nearby regions need to be loaded and simulated.
 * Chunks are keyed by their grid position ("cx,cy") in WorldState.chunks.
 */
export interface ChunkState {
  /** Chunk grid X — multiply by chunk width in tiles to get the world tile offset. */
  chunkX: number;
  /** Chunk grid Y — multiply by chunk height in tiles to get the world tile offset. */
  chunkY: number;
  /**
   * Flat tile array: index = y * chunkWidth + x.
   * Uint8Array is chosen for cache-friendliness, fast serialization, and zero GC pressure
   * compared to a nested array of objects.
   */
  tiles: Uint8Array;
}

/**
 * The persistent state of the game world: terrain, time, and weather.
 * Entities and props are stored separately in GameState (flat maps) for O(1) lookup.
 */
export interface WorldState {
  /** Deterministic PRNG seed — the same seed always regenerates the same terrain. */
  seed: number;
  /** Human-readable world name displayed in the save/load UI. */
  name: string;
  /** Loaded chunk data, keyed by "cx,cy" string (e.g. "0,0", "1,-1"). */
  chunks: Map<string, ChunkState>;
  /** Set of chunk keys that are currently loaded and eligible for simulation. */
  activeChunks: Set<string>;
  /** In-game clock. */
  time: WorldTime;
  /** Current atmospheric conditions. */
  weather: WeatherState;
}

export interface WorldTime {
  /** Total simulation ticks elapsed since world creation. Monotonically increasing. */
  ticks: number;
  /** How many ticks constitute one full in-game day. Derived: hour = (ticks % dayLength) / dayLength * 24 */
  dayLength: number;
}

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow';

export interface WeatherState {
  current: WeatherKind;
  /** Effect strength from 0.0 (light) to 1.0 (heavy). Used by renderer and audio. */
  intensity: number;
  /** Ticks remaining in the current weather transition blend. 0 = fully settled. */
  transitionTimer: number;
}

// ============================================================
// CAMERA
// ============================================================

/**
 * The viewport into the world, expressed in world-space units.
 * Kept in GameState (not the renderer) so camera position is deterministic,
 * replayable, and serializable alongside the rest of the simulation.
 * The renderer reads this; it never writes it.
 */
export interface CameraState {
  /** World-space X of the camera center. */
  x: number;
  /** World-space Y of the camera center. */
  y: number;
  /** Zoom multiplier — 1.0 is native tile size, 2.0 is double. Integer values preferred for pixel art. */
  zoom: number;
}

// ============================================================
// THE ROOT STATE (normalized, flat, indexable)
// ============================================================

/**
 * The single source of truth for the entire simulation.
 * Designed to be normalized (no nested entity maps), flat, and index-friendly.
 * All simulation functions take a GameState and return a new GameState — never mutate in place.
 */
export interface GameState {
  // --- Meta ---
  /** Monotonic simulation tick counter — useful for determinism checks and replay scrubbing. */
  tick: number;
  /** Accumulated simulation time in milliseconds. */
  timestamp: number;

  // --- Entities (flat map — O(1) lookup by id) ---
  entities: Map<EntityId, Entity>;

  /** EntityId of the player controlled by this client — used to resolve camera follow and input routing. */
  localPlayerId: EntityId;

  // --- Props (flat map) ---
  props: Map<EntityId, PropState>;

  /**
   * Spatial index mapping "tx,ty" tile keys to arrays of prop EntityIds at that tile.
   * Rebuilt each tick or on prop mutation — enables fast collision and interaction queries
   * without iterating the entire props map.
   */
  propSpatialIndex: Map<string, EntityId[]>;

  // --- World ---
  world: WorldState;

  // --- Camera ---
  camera: CameraState;

  // --- UI/interaction state that must be deterministic ---
  /** The dialogue exchange currently in progress, or null if none active. */
  activeDialogue: DialogueState | null;

  /**
   * One-way event queue: simulation → renderer / audio / UI.
   * The simulation never calls external systems directly; it pushes typed events here.
   * The game loop drains this queue after each render pass and dispatches to subscribers.
   * Cleared at the start of every tick.
   */
  events: GameEvent[];
}
