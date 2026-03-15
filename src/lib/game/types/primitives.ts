// ============================================================
// PRIMITIVES
// ============================================================

/**
 * Unique string identifier for any entity in the game world.
 * Convention: "<kind>_<uid>" — e.g. "player_abc123", "npc_001", "animal_fox_7".
 * Kept as a string (not a number) so IDs are self-documenting in logs and snapshots.
 */
export type EntityId = string;

/**
 * Integer tile-grid coordinate. One unit = one tile; not pixels or world-space units.
 * Used for world addressing, pathfinding, and spatial index keys ("tx,ty").
 */
export type TileCoord = { x: number; y: number };
