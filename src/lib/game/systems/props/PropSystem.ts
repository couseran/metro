// src/lib/game/systems/props/PropSystem.ts
//
// Pure functions for all prop-related simulation operations.
//
// All functions are deterministic: given the same inputs they always return
// the same outputs and never mutate their arguments.  This keeps the simulation
// replayable, snapshotable, and easy to unit-test.
//
// Responsibilities
// ────────────────
//  Footprint      Compute which tile coords a prop occupies (accounting for rotation).
//  Indexing       Build and incrementally update propLayerIndex / propSolidIndex.
//  Placement      Validate and execute prop placement; generate EntityIds.
//  Removal        Remove a prop and clean up its index entries.
//  Damage         Apply damage and destroy a prop when HP reaches zero.
//  Interaction    Handle E-key interactions (door toggle, container open, etc.).
//  Tick           Advance animated and growing props each simulation tick.
//
// ID generation
// ─────────────
// A module-level counter generates stable EntityIds during one session.  For
// deterministic multiplayer/replay, replace generatePropId() with a seeded
// counter passed through GameState.

import type { EntityId, TileCoord }   from '$lib/game/types/primitives.ts';
import type { PropState, PropLayerSlot, PropDefinition, GrowthStageDefinition, PropCollisionInset } from '$lib/game/types/props.ts';
import type { ItemStack }              from '$lib/game/types/inventory.ts';
import { getPropDefinition }           from '$lib/game/systems/props/PropRegistry.ts';
import { rollLoot }                    from '$lib/game/systems/props/LootRegistry.ts';
import type { PixelBox }               from '$lib/game/systems/tiles/TileCollision.ts';
import { TILE_SIZE }                   from '$lib/game/world/WorldConstants.ts';

// ─── GameState shape ──────────────────────────────────────────────────────────
// Import the runtime GameState from SimulationModule (the sole source of truth
// at runtime).  Importing just what we need avoids circular deps.

import type { GameState } from '$lib/game/engine/SimulationModule.ts';

// ─── ID generation ────────────────────────────────────────────────────────────

let _nextPropId = 1;

/** Reset the counter — for unit tests only. */
export function _resetPropIdCounter(): void { _nextPropId = 1; }

function generatePropId(): EntityId {
    return `prop_${_nextPropId++}`;
}

// ─── Collision inset helpers ──────────────────────────────────────────────────

/**
 * Returns true when a prop definition uses a sub-tile pixel AABB for collision.
 *
 * A sub-tile AABB (propSolidBoxes) is required whenever:
 *   • solidInset has at least one side > 0 — the box is smaller than a full tile, OR
 *   • solidOffset has any non-zero component — the box is shifted off the tile grid.
 *
 * When false, the prop uses the faster tile-snapped propSolidIndex.
 * When true,  the prop uses propSolidBoxes and is NOT in propSolidIndex.
 */
function hasSubTileCollision(def: PropDefinition): boolean {
    const i = def.solidInset;
    if (i && (i.top > 0 || i.right > 0 || i.bottom > 0 || i.left > 0)) return true;

    const o = def.solidOffset;
    if (o && (o.x !== 0 || o.y !== 0 || o.z !== 0)) return true;

    return false;
}

/**
 * Rotate a PropCollisionInset to match a prop's on-screen orientation.
 *
 * solidInset is always defined in the definition's own (unrotated) coordinate
 * space.  When the prop is rotated, the inset must be remapped so the collision
 * box shrinks from the correct physical edges.
 *
 * Rotation mapping (which original face is now facing which direction):
 *   rot0 (  0°): identity
 *   rot1 ( 90°CW): top←left, right←top, bottom←right, left←bottom
 *   rot2 (180°):  top←bottom, right←left, bottom←top, left←right
 *   rot3 (270°CW): top←right, right←bottom, bottom←left, left←top
 */
function rotateInset(i: PropCollisionInset, rotation: 0 | 1 | 2 | 3): PropCollisionInset {
    switch (rotation) {
        case 0: return i;
        case 1: return { top: i.left,   right: i.top,    bottom: i.right,  left: i.bottom };
        case 2: return { top: i.bottom, right: i.left,   bottom: i.top,    left: i.right  };
        case 3: return { top: i.right,  right: i.bottom, bottom: i.left,   left: i.top    };
    }
}

/**
 * Rotate a (x, y) ground-plane offset vector to match a prop's on-screen orientation.
 *
 * Uses the same CW screen-space rotation convention as rotateInset so the two
 * helpers stay in lockstep.  Screen space has y pointing downward.
 *
 * Matrix per quarter-turn (CW, y-down):
 *   rot0 (  0°): ( x,  y)   — identity
 *   rot1 ( 90°CW): (-y,  x)   — right→down, down→left
 *   rot2 (180°): (-x, -y)   — full reversal
 *   rot3 (270°CW): ( y, -x)   — right→up,   up→left
 *
 * The z component of PropCollisionOffset is intentionally not handled here —
 * it is rotation-invariant by definition and must be applied directly to the
 * screen-Y axis without any remapping.
 */
function rotateOffset(x: number, y: number, rotation: 0 | 1 | 2 | 3): { x: number; y: number } {
    switch (rotation) {
        case 0: return {  x,  y };
        case 1: return { x: -y, y:  x };
        case 2: return { x: -x, y: -y };
        case 3: return { x:  y, y: -x };
    }
}

// ─── Footprint helpers ────────────────────────────────────────────────────────

/**
 * Return the effective (width, height) of a prop accounting for rotation.
 * Rotation 1 (90°CW) and 3 (270°CW) swap width and height.
 */
export function getEffectiveDimensions(
    width:    number,
    height:   number,
    rotation: 0 | 1 | 2 | 3,
): { w: number; h: number } {
    return (rotation === 1 || rotation === 3)
        ? { w: height, h: width }
        : { w: width,  h: height };
}

/**
 * Return all tile coordinates occupied by a prop instance.
 *
 * The footprint is a rectangle from (prop.x, prop.y) with effective dimensions
 * derived from prop.width, prop.height, and prop.rotation.
 */
export function getPropFootprint(prop: PropState): TileCoord[] {
    const { w, h } = getEffectiveDimensions(prop.width, prop.height, prop.rotation);
    const tiles: TileCoord[] = [];
    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            tiles.push({ x: prop.x + dx, y: prop.y + dy });
        }
    }
    return tiles;
}

/**
 * Return true when the tile at world-tile coordinate (tx, ty) is solid for
 * the given prop instance, accounting for rotation and the definition's solidMask.
 *
 * Returns false for any tile outside the prop's footprint.
 */
export function isPropSolidAt(
    prop: PropState,
    def:  PropDefinition,
    tx:   number,
    ty:   number,
): boolean {
    const { w, h } = getEffectiveDimensions(prop.width, prop.height, prop.rotation);
    const localX = tx - prop.x;
    const localY = ty - prop.y;

    if (localX < 0 || localX >= w || localY < 0 || localY >= h) return false;

    // Map the local (rotated) coordinate back to the definition mask coordinate.
    const [maskRow, maskCol] = rotatedToMask(localX, localY, prop.rotation, def.defaultWidth, def.defaultHeight);
    return getSolidMaskAt(def, maskRow, maskCol, prop.width);
}

/**
 * Convert a rotated local (x, y) inside the footprint back to a (row, col)
 * index into the definition's solidMask.
 *
 * Rotation 0 (0°):   (lx, ly) → mask[ly][lx]
 * Rotation 1 (90°CW): prop width ← def height, prop height ← def width
 *                     (lx, ly) → mask[lx][defH - 1 - ly]  ... wait this needs careful thinking
 *
 * Standard 2D rotation conventions (90°CW = transpose + reverse rows):
 *   rot0:  mask[ly][lx]
 *   rot1:  mask[defH-1-lx][ly]   (90° CW)
 *   rot2:  mask[defH-1-ly][defW-1-lx] (180°)
 *   rot3:  mask[lx][defW-1-ly]   (270° CW / 90° CCW)
 */
function rotatedToMask(
    lx: number, ly: number,
    rotation: 0 | 1 | 2 | 3,
    defW: number, defH: number,
): [row: number, col: number] {
    switch (rotation) {
        case 0: return [ly,          lx];
        case 1: return [defH - 1 - lx, ly];
        case 2: return [defH - 1 - ly, defW - 1 - lx];
        case 3: return [lx,          defW - 1 - ly];
    }
}

/**
 * Look up one cell in a prop definition's solidMask, handling the tiling logic
 * for resizable props.
 *
 * For resizable props (defaultWidth = 2, meaning left cap + right cap):
 *   col 0              → left cap (mask col 0)
 *   col 1…width-2      → middle (mask col 1, if present; otherwise false)
 *   col width-1        → right cap (mask col defaultWidth-1)
 */
function getSolidMaskAt(def: PropDefinition, row: number, col: number, instanceWidth: number): boolean {
    if (!def.resizable || instanceWidth <= def.defaultWidth) {
        // Non-resizable or default size: direct lookup
        return def.solidMask[row]?.[col] ?? false;
    }

    const dw = def.defaultWidth;
    const lastDefCol = dw - 1;

    if (col === 0)                         return def.solidMask[row]?.[0]         ?? false;
    if (col === instanceWidth - 1)         return def.solidMask[row]?.[lastDefCol] ?? false;
    // Middle columns: use the second definition column if it exists (inner column)
    const midMaskCol = Math.min(1, lastDefCol - 1);
    return def.solidMask[row]?.[midMaskCol] ?? false;
}

// ─── Index builders ───────────────────────────────────────────────────────────

/**
 * Build a fresh propLayerIndex from the full props map.
 * O(n × footprint_size) — call only on chunk load/unload, not per tick.
 */
export function buildPropLayerIndex(props: Map<EntityId, PropState>): Map<string, PropLayerSlot> {
    const index = new Map<string, PropLayerSlot>();
    for (const prop of props.values()) {
        _indexPropIntoLayerIndex(prop, index);
    }
    return index;
}

/**
 * Build a fresh propSolidIndex from the full props map.
 * Only includes props with solidInset === 0 (full-tile blockers).
 * O(n × footprint_size) — call only on chunk load/unload, not per tick.
 */
export function buildPropSolidIndex(props: Map<EntityId, PropState>): Set<string> {
    const solid = new Set<string>();
    for (const prop of props.values()) {
        _indexPropIntoSolidIndex(prop, solid);
    }
    return solid;
}

/**
 * Build a fresh propSolidBoxes map from the full props map.
 * Only includes props with solidInset > 0 (sub-tile pixel-box blockers).
 * O(n) — call only on chunk load/unload, not per tick.
 */
export function buildPropSolidBoxes(props: Map<EntityId, PropState>): Map<EntityId, PixelBox> {
    const boxes = new Map<EntityId, PixelBox>();
    for (const prop of props.values()) {
        _indexPropIntoSolidBoxes(prop, boxes);
    }
    return boxes;
}

/**
 * Add one prop's footprint to an existing layerIndex, solidIndex, and solidBoxes.
 * Used for incremental updates after placement or chunk load.
 */
export function indexProp(
    prop:       PropState,
    layerIndex: Map<string, PropLayerSlot>,
    solidIndex: Set<string>,
    solidBoxes: Map<EntityId, PixelBox>,
): void {
    _indexPropIntoLayerIndex(prop, layerIndex);
    _indexPropIntoSolidIndex(prop, solidIndex);
    _indexPropIntoSolidBoxes(prop, solidBoxes);
}

/**
 * Remove one prop's footprint from an existing layerIndex, solidIndex, and solidBoxes.
 * Used for incremental updates after removal or chunk unload.
 */
export function deindexProp(
    prop:       PropState,
    layerIndex: Map<string, PropLayerSlot>,
    solidIndex: Set<string>,
    solidBoxes: Map<EntityId, PixelBox>,
): void {
    const def = getPropDefinition(prop.type);
    const footprint = getPropFootprint(prop);

    for (const tile of footprint) {
        const key  = `${tile.x},${tile.y}`;
        const slot = layerIndex.get(key);
        if (slot) {
            const emptySlot: PropLayerSlot = { ...slot, [prop.layer]: null };
            if (!emptySlot.floor && !emptySlot.object && !emptySlot.wall) {
                layerIndex.delete(key);
            } else {
                layerIndex.set(key, emptySlot);
            }
        }
        // Only clear solid if this specific prop made it solid at this tile
        if (def && isPropSolidAt(prop, def, tile.x, tile.y)) {
            solidIndex.delete(key);
        }
    }
    // Remove pixel box (no-op if prop had solidInset === 0)
    solidBoxes.delete(prop.id);
}

// ─── Internal index helpers ───────────────────────────────────────────────────

function _indexPropIntoLayerIndex(prop: PropState, index: Map<string, PropLayerSlot>): void {
    for (const tile of getPropFootprint(prop)) {
        const key      = `${tile.x},${tile.y}`;
        const existing = index.get(key) ?? { floor: null, object: null, wall: null };
        index.set(key, { ...existing, [prop.layer]: prop.id });
    }
}

function _indexPropIntoSolidIndex(prop: PropState, solid: Set<string>): void {
    const def = getPropDefinition(prop.type);
    if (!def) return;

    // Props with any sub-tile inset use propSolidBoxes instead — skip here.
    if (hasSubTileCollision(def)) return;

    // Door in 'open' state is not solid regardless of solidMask
    const isDoorOpen = def.interactionType === 'door' && prop.stateId === 'open';
    if (isDoorOpen) return;

    for (const tile of getPropFootprint(prop)) {
        if (isPropSolidAt(prop, def, tile.x, tile.y)) {
            solid.add(`${tile.x},${tile.y}`);
        }
    }
}

/**
 * Add a sub-tile pixel AABB for props that require pixel-accurate collision.
 *
 * This path is taken when:
 *   • solidInset has at least one side > 0 — the box is smaller than a full tile.
 *   • solidOffset has any non-zero component — the box is shifted off the tile grid.
 *
 * Full-tile props (neither inset nor offset) continue to use propSolidIndex.
 *
 * Build order:
 *   1. Start from the prop's effective tile footprint (accounts for rotation).
 *   2. Shrink per-side by the rotated solidInset (zero if not defined).
 *   3. Translate the resulting AABB by the rotated ground-plane (x, y) components
 *      of solidOffset, then by the rotation-invariant screen-space z component.
 *
 * The inset and the x/y offset share the same CW rotation convention (rotateInset /
 * rotateOffset) so both stay aligned with the visual sprite at any orientation.
 * The z component is applied directly to the screen-Y axis — it is never rotated
 * because prop rotation is always a quarter-turn around that axis.
 */
function _indexPropIntoSolidBoxes(prop: PropState, boxes: Map<EntityId, PixelBox>): void {
    const def = getPropDefinition(prop.type);
    if (!def) return;

    if (!hasSubTileCollision(def)) return;

    // Door in 'open' state is passable
    if (def.interactionType === 'door' && prop.stateId === 'open') return;

    // Skip if there are no solid cells in the mask
    if (!def.solidMask.some(row => row.some(Boolean))) return;

    // ── Step 1: rotate the inset (use zero on every side when not defined) ─────
    const inset = def.solidInset ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const ri    = rotateInset(inset, prop.rotation);

    // ── Step 2: derive box dimensions from the (rotated) effective footprint ───
    const { w, h } = getEffectiveDimensions(prop.width, prop.height, prop.rotation);
    const boxW = w * TILE_SIZE - ri.left - ri.right;
    const boxH = h * TILE_SIZE - ri.top  - ri.bottom;
    if (boxW <= 0 || boxH <= 0) return; // inset exceeds footprint — skip

    // ── Step 3: apply solidOffset ──────────────────────────────────────────────
    // x and y are ground-plane vectors — rotate them with the prop.
    // z is screen-space vertical — rotation-invariant, applied directly to Y.
    let extraX = 0;
    let extraY = 0;
    if (def.solidOffset) {
        const ro = rotateOffset(def.solidOffset.x, def.solidOffset.y, prop.rotation);
        extraX = ro.x;
        extraY = ro.y + def.solidOffset.z; // z is always a raw screen-Y shift
    }

    boxes.set(prop.id, {
        x: prop.x * TILE_SIZE + ri.left + extraX,
        y: prop.y * TILE_SIZE + ri.top  + extraY,
        w: boxW,
        h: boxH,
    });
}

// ─── Placement ────────────────────────────────────────────────────────────────

export type PlacementValidation =
    | { ok: true }
    | { ok: false; reason: string };

/**
 * Validate whether a prop can be placed at the given position.
 * Returns { ok: true } on success, or { ok: false, reason } on failure.
 *
 * Does NOT mutate state.
 */
export function canPlaceProp(
    state:    GameState,
    def:      PropDefinition,
    x:        number,
    y:        number,
    rotation: 0 | 1 | 2 | 3,
    width:    number,
): PlacementValidation {
    if (def.resizable) {
        if (width < def.minWidth)  return { ok: false, reason: `Width ${width} is below minimum ${def.minWidth}.` };
        if (def.maxWidth !== null && width > def.maxWidth)
            return { ok: false, reason: `Width ${width} exceeds maximum ${def.maxWidth}.` };
    }

    const { w, h } = getEffectiveDimensions(width, def.defaultHeight, rotation);

    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            const tx  = x + dx;
            const ty  = y + dy;
            const key = `${tx},${ty}`;

            // ── Chunk loaded check ─────────────────────────────────────────
            const chunkX = Math.floor(tx / 16); // CHUNK_WIDTH
            const chunkY = Math.floor(ty / 16); // CHUNK_HEIGHT
            const chunkKey = `${chunkX},${chunkY}`;
            if (!state.world.activeChunks.has(chunkKey)) {
                return { ok: false, reason: `Tile (${tx},${ty}) is in an unloaded chunk.` };
            }

            const chunk = state.world.chunks.get(chunkKey);
            const localX   = tx - chunkX * 16;
            const localY   = ty - chunkY * 16;
            const tileType = chunk ? chunk.tiles[localY * 16 + localX] : 0;

            // ── Placement constraints ──────────────────────────────────────
            for (const constraint of def.placementConstraints) {
                switch (constraint.type) {
                    case 'allowed_tile_types':
                        if (!constraint.tileTypes.includes(tileType)) {
                            return { ok: false, reason: `Tile type ${tileType} at (${tx},${ty}) is not allowed.` };
                        }
                        break;

                    case 'forbidden_tile_types':
                        if (constraint.tileTypes.includes(tileType)) {
                            return { ok: false, reason: `Tile type ${tileType} at (${tx},${ty}) is forbidden.` };
                        }
                        break;

                    case 'layer_must_be_empty': {
                        const slot = state.propLayerIndex.get(key);
                        if (slot && slot[constraint.layer] !== null) {
                            return { ok: false, reason: `Layer '${constraint.layer}' at (${tx},${ty}) is occupied.` };
                        }
                        break;
                    }

                    case 'requires_floor_prop': {
                        const slot = state.propLayerIndex.get(key);
                        const floorPropId = slot?.floor ?? null;
                        if (!floorPropId) {
                            return { ok: false, reason: `No floor prop at (${tx},${ty}).` };
                        }
                        const floorProp = state.props.get(floorPropId);
                        if (floorProp?.type !== constraint.propType) {
                            return { ok: false, reason: `Floor prop at (${tx},${ty}) is not '${constraint.propType}'.` };
                        }
                        break;
                    }

                    case 'no_entity_overlap':
                        // Entity overlap check: deferred to caller (requires entity positions)
                        // PropSystem exposes isPropSolidAt() for callers to perform hitbox tests
                        break;
                }
            }
        }
    }

    return { ok: true };
}

/**
 * Place a prop in the world, updating props, propLayerIndex, and propSolidIndex.
 *
 * The caller must have already validated placement with canPlaceProp().
 * Returns the updated GameState and the new prop's EntityId.
 */
export function placeProp(
    state:    GameState,
    def:      PropDefinition,
    x:        number,
    y:        number,
    rotation: 0 | 1 | 2 | 3,
    width:    number = def.defaultWidth,
): { state: GameState; propId: EntityId } {
    const propId = generatePropId();

    // Determine which chunk owns this prop (use the origin tile)
    const chunkX   = Math.floor(x / 16);
    const chunkY   = Math.floor(y / 16);
    const chunkKey = `${chunkX},${chunkY}`;

    const prop: PropState = {
        id:        propId,
        type:      def.type,
        x, y,
        width,
        height:    def.defaultHeight,
        layer:     def.layer,
        rotation,
        variant:   0,
        stateId:   def.defaultStateId,
        animFrame: 0,
        animTimer: 0,
        health:    def.maxHealth,
        chunkKey,
        metadata:  {},
    };

    const newProps      = new Map(state.props);
    const newLayerIndex = new Map(state.propLayerIndex);
    const newSolidIndex = new Set(state.propSolidIndex);
    const newSolidBoxes = new Map(state.propSolidBoxes);

    newProps.set(propId, prop);
    indexProp(prop, newLayerIndex, newSolidIndex, newSolidBoxes);

    const newState: GameState = {
        ...state,
        props:          newProps,
        propLayerIndex: newLayerIndex,
        propSolidIndex: newSolidIndex,
        propSolidBoxes: newSolidBoxes,
    };

    return { state: newState, propId };
}

// ─── Removal ──────────────────────────────────────────────────────────────────

/**
 * Remove a prop from the world, cleaning up its index entries.
 * No loot is dropped — call damageProp() for destruction with loot.
 */
export function removeProp(state: GameState, propId: EntityId): GameState {
    const prop = state.props.get(propId);
    if (!prop) return state;

    const newProps      = new Map(state.props);
    const newLayerIndex = new Map(state.propLayerIndex);
    const newSolidIndex = new Set(state.propSolidIndex);
    const newSolidBoxes = new Map(state.propSolidBoxes);

    newProps.delete(propId);
    deindexProp(prop, newLayerIndex, newSolidIndex, newSolidBoxes);

    return { ...state, props: newProps, propLayerIndex: newLayerIndex, propSolidIndex: newSolidIndex, propSolidBoxes: newSolidBoxes };
}

// ─── Damage ───────────────────────────────────────────────────────────────────

export interface DamageResult {
    state:      GameState;
    destroyed:  boolean;
    loot:       ItemStack[];
}

/**
 * Apply `amount` damage to a prop.  If HP reaches 0 the prop is destroyed
 * and loot is rolled.  The caller must push the appropriate GameEvents
 * (PROP_DAMAGED or PROP_DESTROYED) from the returned result.
 *
 * @param toolUsed - Tool kind used for the hit (affects loot table filtering).
 * @param toolTier - Tier of the tool.
 * @param rng      - Seeded PRNG for loot rolling.
 */
export function damageProp(
    state:    GameState,
    propId:   EntityId,
    amount:   number,
    toolUsed: import('$lib/game/types/props.ts').ToolKind,
    toolTier: number,
    rng:      import('$lib/game/systems/props/LootRegistry.ts').RngFn,
): DamageResult {
    const prop = state.props.get(propId);
    if (!prop || prop.health === null) return { state, destroyed: false, loot: [] };

    const def = getPropDefinition(prop.type);
    if (!def?.breakable)               return { state, destroyed: false, loot: [] };

    const newHealth = Math.max(0, prop.health - amount);

    if (newHealth === 0) {
        // Destroyed — roll loot and remove
        const loot   = def.lootTableId ? rollLoot(def.lootTableId, toolUsed, toolTier, rng) : [];
        const newState = removeProp(state, propId);
        return { state: newState, destroyed: true, loot };
    }

    // Still alive — update HP
    const updatedProp: PropState = { ...prop, health: newHealth };
    const newProps = new Map(state.props);
    newProps.set(propId, updatedProp);
    return { state: { ...state, props: newProps }, destroyed: false, loot: [] };
}

// ─── Interaction ──────────────────────────────────────────────────────────────

export interface InteractionResult {
    state:  GameState;
    /** Event type the caller should emit, or null if no event is needed. */
    event:  'PROP_STATE_CHANGED' | 'PROP_CONTAINER_OPENED' | null;
    from?:  string;
    to?:    string;
}

/**
 * Handle an E-key interaction between `playerId` and prop `propId`.
 *
 * Only props with interactionTrigger 'key_e' are processed here.
 * Returns the (possibly unchanged) GameState and an event descriptor for the
 * caller to push into the event queue.
 */
export function interactWithProp(
    state:    GameState,
    propId:   EntityId,
    playerId: EntityId,
): InteractionResult {
    const prop = state.props.get(propId);
    if (!prop) return { state, event: null };

    const def = getPropDefinition(prop.type);
    if (!def || def.interactionTrigger !== 'key_e') return { state, event: null };

    switch (def.interactionType) {
        case 'door':
            return _toggleDoor(state, prop, def);
        case 'container':
            return { state, event: 'PROP_CONTAINER_OPENED' };
        case 'light':
            return _toggleLight(state, prop);
        default:
            return { state, event: null };
    }
}

function _toggleDoor(state: GameState, prop: PropState, def: PropDefinition): InteractionResult {
    const from  = prop.stateId;
    const to    = from === 'open' ? 'closed' : 'open';

    const updatedProp: PropState = { ...prop, stateId: to };
    const newProps = new Map(state.props);
    newProps.set(prop.id, updatedProp);

    // Rebuild solid index for the affected prop.
    // Doors are assumed to have no sub-tile inset (full-tile blocking when closed).
    const newSolidIndex = new Set(state.propSolidIndex);
    const footprint = getPropFootprint(prop);

    if (to === 'open') {
        // Door opened — remove solid entries
        for (const tile of footprint) {
            newSolidIndex.delete(`${tile.x},${tile.y}`);
        }
    } else {
        // Door closed — add solid entries
        for (const tile of footprint) {
            if (isPropSolidAt(updatedProp, def, tile.x, tile.y)) {
                newSolidIndex.add(`${tile.x},${tile.y}`);
            }
        }
    }

    return {
        state: { ...state, props: newProps, propSolidIndex: newSolidIndex },
        event: 'PROP_STATE_CHANGED',
        from,
        to,
    };
}

function _toggleLight(state: GameState, prop: PropState): InteractionResult {
    const from = prop.stateId;
    const to   = from === 'lit' ? 'unlit' : 'lit';

    const updatedProp: PropState = { ...prop, stateId: to };
    const newProps = new Map(state.props);
    newProps.set(prop.id, updatedProp);
    return { state: { ...state, props: newProps }, event: 'PROP_STATE_CHANGED', from, to };
}

// ─── Resize ───────────────────────────────────────────────────────────────────

/**
 * Resize a resizable prop to a new width.
 *
 * The new footprint columns are added on the right (positive X direction).
 * The caller must validate that the new tiles are clear before calling this.
 */
export function resizeProp(
    state:    GameState,
    propId:   EntityId,
    newWidth: number,
): GameState {
    const prop = state.props.get(propId);
    if (!prop) return state;

    const def = getPropDefinition(prop.type);
    if (!def?.resizable) return state;

    // De-index old footprint, re-index new footprint
    const newLayerIndex = new Map(state.propLayerIndex);
    const newSolidIndex = new Set(state.propSolidIndex);
    const newSolidBoxes = new Map(state.propSolidBoxes);
    deindexProp(prop, newLayerIndex, newSolidIndex, newSolidBoxes);

    const resized: PropState = { ...prop, width: newWidth };
    const newProps = new Map(state.props);
    newProps.set(propId, resized);
    indexProp(resized, newLayerIndex, newSolidIndex, newSolidBoxes);

    return { ...state, props: newProps, propLayerIndex: newLayerIndex, propSolidIndex: newSolidIndex, propSolidBoxes: newSolidBoxes };
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

/**
 * Advance all props that require per-tick simulation:
 *   • Animated props (loop/interaction modes): advance animFrame and animTimer.
 *   • Growing props: advance growthTimer and promote to next growth stage.
 *
 * Only props in active chunks are ticked (checked via prop.chunkKey).
 * Returns the updated GameState.  Emits no events — callers must watch the
 * returned state for stage transitions if they need events.
 */
export function tickProps(state: GameState, dt: number): GameState {
    let changed = false;
    const newProps = new Map(state.props);
    let newSolidIndex: Set<string> | null = null;

    for (const [id, prop] of state.props) {
        if (!state.world.activeChunks.has(prop.chunkKey)) continue;

        const def = getPropDefinition(prop.type);
        if (!def) continue;

        let updated = prop;

        // ── Animation tick ───────────────────────────────────────────────────
        if (def.animated && def.animationMode === 'loop' && def.frameCount > 1) {
            const newTimer = prop.animTimer + dt;
            if (newTimer >= def.frameDuration) {
                const newFrame = (prop.animFrame + Math.floor(newTimer / def.frameDuration)) % def.frameCount;
                updated = { ...updated, animFrame: newFrame, animTimer: newTimer % def.frameDuration };
            } else {
                updated = { ...updated, animTimer: newTimer };
            }
        }

        // ── Growth tick ──────────────────────────────────────────────────────
        if (def.growthStages && def.growthStages.length > 0) {
            const currentStageIdx = def.growthStages.findIndex(s => s.stageId === prop.stateId);
            const currentStage    = def.growthStages[currentStageIdx] as GrowthStageDefinition | undefined;

            if (currentStage && currentStage.ticksToNextStage !== null) {
                const growthTimer  = ((prop.metadata.growthTimer as number | undefined) ?? 0) + 1;
                if (growthTimer >= currentStage.ticksToNextStage) {
                    const nextStage = def.growthStages[currentStageIdx + 1];
                    if (nextStage) {
                        // Advance to next stage
                        updated = {
                            ...updated,
                            stateId:  nextStage.stageId,
                            variant:  nextStage.spriteVariant,
                            metadata: { ...updated.metadata, growthTimer: 0 },
                        };
                        // Rebuild solid index if solidity changed
                        if (currentStage.solid !== nextStage.solid) {
                            if (!newSolidIndex) newSolidIndex = new Set(state.propSolidIndex);
                            const key = `${prop.x},${prop.y}`;
                            if (nextStage.solid) newSolidIndex.add(key);
                            else                 newSolidIndex.delete(key);
                        }
                    }
                } else {
                    updated = { ...updated, metadata: { ...updated.metadata, growthTimer } };
                }
            }
        }

        if (updated !== prop) {
            newProps.set(id, updated);
            changed = true;
        }
    }

    if (!changed) return state;
    return {
        ...state,
        props:          newProps,
        propSolidIndex: newSolidIndex ?? state.propSolidIndex,
    };
}
