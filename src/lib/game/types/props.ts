// src/lib/game/types/props.ts
// ============================================================
// PROPS — placeable, destructible, interactive world objects
// ============================================================
//
// Architecture overview
// ─────────────────────
// PropDefinition  Static blueprint for a prop type (collision mask, interaction
//                 rules, growth stages, etc.).  One entry per type string in the
//                 PropDefinitionRegistry.  Never mutated at runtime.
//
// PropState       One runtime instance of a prop in the world.  References its
//                 blueprint via PropState.type.  Only stores fields that differ
//                 between instances or change during gameplay.
//
// PropLayerSlot   Per-tile slot record used by propLayerIndex.  At most one prop
//                 per render layer per tile — enforced at placement time.
//
// Layer model
// ───────────
//   floor   Flat surface props (carpet, rug, doormat).  Drawn in the ground pass
//           before entities — never Y-sorted.
//
//   object  Standard world objects (furniture, trees, chests, doors).  Y-sorted
//           with entities in the world pass.  sortY = (originY + height) * TILE_SIZE.
//
//   wall    Wall-mounted props (paintings, windows, mounted shelves).  Participate
//           in the same Y-sort pass as objects and entities.
//           sortY = (originY + height) * TILE_SIZE + WALL_PROP_SORT_BIAS
//           This places them just after the wall tile in the sort order (in front
//           of the wall surface), while still sorting behind entities whose feet
//           are further south than the wall row.

import type { EntityId } from '$lib/game/types/primitives.ts';

// ─── Layer ────────────────────────────────────────────────────────────────────

/**
 * The render layer a prop occupies.
 * Each tile holds at most one prop per layer (enforced by PropSystem.canPlaceProp).
 */
export type PropLayer = 'floor' | 'object' | 'wall';

/**
 * Small positive bias added to the tile-foot sortY of a wall prop so it draws
 * on top of its wall tile while remaining in the unified Y-sort pass.
 *
 * Value choice: 0.5 px.  This is larger than zero (so wall tiles always render
 * first), yet much smaller than TILE_SIZE (so normal entity sortY arithmetic is
 * unaffected).  The renderer never needs to special-case this value — it is an
 * implementation detail of the sortY formula.
 */
export const WALL_PROP_SORT_BIAS = 0.5;

// ─── Interaction type ─────────────────────────────────────────────────────────

/**
 * How a prop responds when interacted with (E key, tool hit, or proximity).
 *
 *  none         — Purely decorative; no interaction.
 *  destructible — Accepts hit events; drops loot when health reaches 0.
 *  container    — Opens an inventory UI (chest, barrel, crate).
 *  door         — Toggles between 'open' and 'closed' states; rebuilds solid index.
 *  sign         — Shows metadata.text in a dialogue box.
 *  seat         — Player/NPC can sit; triggers the sit animation on the entity.
 *  crafting     — Opens a crafting UI (workbench, forge, cooking pot).
 *  light        — Toggle lit/unlit (campfire, torch, lantern).
 *  growth       — Plant that advances through growth stages each tick.
 */
export type PropInteractionType =
    | 'none'
    | 'destructible'
    | 'container'
    | 'door'
    | 'sign'
    | 'seat'
    | 'crafting'
    | 'light'
    | 'growth';

// ─── Tool kind ────────────────────────────────────────────────────────────────

/**
 * Tool required to break a destructible prop.
 * 'hands' = bare-hand breakable (decoration props, one or more hits).
 */
export type ToolKind = 'axe' | 'pickaxe' | 'shovel' | 'sword' | 'hands';

// ─── Placement constraints ────────────────────────────────────────────────────

/**
 * A single rule evaluated when the player attempts to place a prop.
 * All constraints on a PropDefinition must pass for placement to succeed.
 */
export type PlacementConstraint =
    /** The tile type at each footprint cell must be in this whitelist. */
    | { type: 'allowed_tile_types';   tileTypes: number[] }
    /** The tile type at each footprint cell must NOT be in this blacklist. */
    | { type: 'forbidden_tile_types'; tileTypes: number[] }
    /** Every footprint cell's floor slot must hold a prop of this type. */
    | { type: 'requires_floor_prop';  propType: string }
    /** The target layer slot must be empty for every footprint cell. */
    | { type: 'layer_must_be_empty';  layer: PropLayer }
    /** No entity's hitbox may overlap the footprint (for solid props). */
    | { type: 'no_entity_overlap' };

// ─── Sprite layout ────────────────────────────────────────────────────────────

/**
 * How the prop's visual is constructed from sprite source data.
 *
 *  single       — One sprite covers the entire footprint.  Standard for 1×1 props
 *                 and small fixed-size multi-tile props.
 *
 *  tiled_repeat — Resizable props: [left_cap | middle × (width-2) | right_cap].
 *                 Each section is one tile wide and defaultHeight tiles tall.
 *                 Used for horizontally resizable props (carpet, hedge, fence row).
 */
export type PropSpriteLayout = 'single' | 'tiled_repeat';

// ─── Growth stages ────────────────────────────────────────────────────────────

/**
 * One stage in a growing prop's life cycle.
 * Stages are ordered: index 0 is the starting stage, terminal stages have
 * ticksToNextStage = null.
 */
export interface GrowthStageDefinition {
    /** State identifier stored in PropState.stateId at this stage. */
    stageId: string;
    /** Simulation ticks before advancing to the next stage. null = terminal. */
    ticksToNextStage: number | null;
    /** Whether this stage blocks movement. */
    solid: boolean;
    /** Whether the player can harvest this stage with the E key. */
    harvestable: boolean;
    /** Loot table key for harvesting, or null if harvesting drops nothing. */
    harvestLootTableId: string | null;
    /** Sprite variant index to select at this stage (maps to PropSpriteConfig). */
    spriteVariant: number;
}

// ─── Collision inset ──────────────────────────────────────────────────────────

/**
 * Per-side pixel inset for a prop's collision AABB.
 *
 * All values are in world-space pixels and shrink the collision box inward from
 * the corresponding edge of the tile footprint.  Zero on all sides means the
 * collision box is exactly the tile-aligned footprint (full-tile blocking).
 *
 * When a prop is rotated, PropSystem rotates this inset geometrically so the
 * collision box remains correct for every orientation.
 */
export interface PropCollisionInset {
    /** Pixels to shrink from the top edge of the footprint. */
    top:    number;
    /** Pixels to shrink from the right edge of the footprint. */
    right:  number;
    /** Pixels to shrink from the bottom edge of the footprint. */
    bottom: number;
    /** Pixels to shrink from the left edge of the footprint. */
    left:   number;
}

/**
 * Factory helpers for PropCollisionInset — follows the CSS shorthand convention.
 *
 *   solidInset(4)            → all four sides = 4
 *   solidInset(0, 4)         → top/bottom = 0, left/right = 4
 *   solidInset(0, 4, 6, 4)   → top=0, right=4, bottom=6, left=4
 */
export function solidInset(uniform: number): PropCollisionInset;
export function solidInset(vertical: number, horizontal: number): PropCollisionInset;
export function solidInset(top: number, right: number, bottom: number, left: number): PropCollisionInset;
export function solidInset(a: number, b?: number, c?: number, d?: number): PropCollisionInset {
    if (b === undefined) return { top: a, right: a, bottom: a, left: a };
    if (c === undefined) return { top: a, right: b, bottom: a, left: b };
    return { top: a, right: b, bottom: c, left: d! };
}

// ─── Collision offset ─────────────────────────────────────────────────────────

/**
 * Three-axis pixel offset applied to the prop's collision AABB origin.
 *
 * x and y are ground-plane offsets and are rotated together with the prop
 * when a rotation is applied (just like solidInset sides).
 *
 * z is a screen-space vertical offset that is intentionally NOT rotated.
 * Because all prop rotations are quarter-turns around the vertical (z) axis,
 * a z offset always means "shift the hitbox up/down on screen by this many
 * pixels regardless of orientation".  Use it to fine-tune depth without
 * disturbing the rotated x/y placement.
 *
 * Positive values shift outward in each axis convention:
 *   x > 0  → right  (before rotation)
 *   y > 0  → down   (before rotation, i.e. toward the viewer)
 *   z > 0  → up on screen (lifts the AABB, rotation-invariant)
 */
export interface PropCollisionOffset {
    /** Ground-plane horizontal shift in pixels (rotated with the prop). */
    x: number;
    /** Ground-plane vertical shift in pixels (rotated with the prop). */
    y: number;
    /**
     * Screen-space vertical shift in pixels.
     * Not affected by prop rotation — rotation is around this axis.
     */
    z: number;
}

/**
 * Factory helper for PropCollisionOffset.
 *
 *   solidOffset(0, 4)     → x=0, y=4, z=0
 *   solidOffset(2, 0, -3) → x=2, y=0, z=-3
 */
export function solidOffset(x: number, y: number, z?: number): PropCollisionOffset {
    return { x, y, z: z ?? 0 };
}

// ─── Prop definition ──────────────────────────────────────────────────────────

/**
 * Static blueprint for one prop type.
 * Stored in the PropDefinitionRegistry; never mutated at runtime.
 * PropState instances reference this via PropState.type.
 */
export interface PropDefinition {
    /** Unique string key, e.g. 'oak_tree', 'chest_wood', 'carpet_red'. */
    type: string;

    // ── Size & resize ─────────────────────────────────────────────────────────

    /** Default tile width. */
    defaultWidth: number;
    /** Default tile height. */
    defaultHeight: number;
    /**
     * Whether the player can extend this prop horizontally after placement.
     * When true, the prop system tiles inner columns of solidMask.
     */
    resizable: boolean;
    /** Minimum width when resizable (always ≥ defaultWidth). */
    minWidth: number;
    /** Maximum width when resizable. null = unlimited. */
    maxWidth: number | null;

    // ── Layer ─────────────────────────────────────────────────────────────────

    layer: PropLayer;

    // ── Solid mask ────────────────────────────────────────────────────────────

    /**
     * Per-cell solidity for the default-width footprint.
     * solidMask[row][col], row ∈ [0, defaultHeight), col ∈ [0, defaultWidth).
     * true = movement-blocking.
     *
     * For resizable props the inner columns (index 1 to defaultWidth-2) are
     * repeated when width > defaultWidth.  A 2-column definition only has a
     * left cap (col 0) and a right cap (col 1); the prop system inserts extra
     * right-cap-shaped columns in between.
     */
    solidMask: ReadonlyArray<ReadonlyArray<boolean>>;

    // ── Placement ─────────────────────────────────────────────────────────────

    /** All constraints must pass for the placement to succeed. */
    placementConstraints: ReadonlyArray<PlacementConstraint>;
    /** Can the player rotate this prop? */
    rotatable: boolean;
    /** How many distinct orientations: 1=none, 2=0°/180°, 4=all 90° steps. */
    rotationSteps: 1 | 2 | 4;

    // ── Interaction ───────────────────────────────────────────────────────────

    interactionType: PropInteractionType;
    /** What event fires the interaction handler. null for non-interactive props. */
    interactionTrigger: 'key_e' | 'proximity' | 'tool_hit' | null;
    /**
     * Default stateId for newly placed instances.
     * e.g. 'closed' for doors, 'unlit' for campfires, 'seedling' for plants.
     * Empty string for stateless props.
     */
    defaultStateId: string;

    // ── Collision inset ───────────────────────────────────────────────────────

    /**
     * Per-side pixel inset that shrinks the collision box relative to the prop's
     * tile-aligned footprint.
     *
     * undefined / all-zeros → full-tile blocking via propSolidIndex (fast tile-snapped
     *   push-back, no per-prop AABB test at runtime).
     *
     * any side > 0 → sub-tile AABB stored in propSolidBoxes (pixel-accurate push-back).
     *   The prop is NOT added to propSolidIndex in this case.
     *   When a rotation is applied, the inset is rotated geometrically so the collision
     *   box stays correct (e.g. bottom-inset of a 0° chair becomes left-inset at 90°CW).
     *
     * Build with the solidInset() helper:
     *   solidInset(4)            → 4 px on every side
     *   solidInset(0, 4)         → 0 top/bottom, 4 left/right
     *   solidInset(0, 4, 6, 4)   → top=0, right=4, bottom=6, left=4
     */
    solidInset?: PropCollisionInset;

    /**
     * Three-axis pixel offset applied to the collision AABB origin after
     * solidInset has been computed.
     *
     * x and y shift the AABB along the ground plane and are rotated with
     * the prop (same transform as solidInset sides).
     *
     * z is a screen-space vertical nudge that is intentionally rotation-
     * invariant: because all prop rotations are quarter-turns around the
     * vertical axis, a z offset always moves the AABB up or down on screen
     * by the same amount regardless of orientation.
     *
     * Useful when the visual anchor and the physical footprint need to be
     * decoupled on the depth axis without disturbing the rotated x/y layout.
     *
     * Build with the solidOffset() helper:
     *   solidOffset(0, 4)      → x=0, y=4 px forward, z=0
     *   solidOffset(0, 0, -3)  → lift AABB 3 px up on screen (rotation-invariant)
     */
    solidOffset?: PropCollisionOffset;

    // ── Sort-Y offset ─────────────────────────────────────────────────────────

    /**
     * Pixel delta added to the default Y-sort key for this prop type.
     *
     * Default sort key: (prop.y + prop.height) * TILE_SIZE (bottom edge of footprint).
     * Positive offset → prop draws later / in front; negative → earlier / behind.
     *
     * This is a purely visual depth-ordering knob, independent of solidInset.
     * Use the debug sort overlay (backtick key) to tune interactively.
     *
     * Rule of thumb when pairing with an asymmetric bottom inset:
     *   sortYOffset = -(solidInset.bottom)
     * This aligns the visual depth crossover with the physical collision boundary.
     */
    sortYOffset?: number;

    // ── Destruction ───────────────────────────────────────────────────────────

    breakable: boolean;
    /** Maximum HP. null = indestructible. */
    maxHealth: number | null;
    /** Tool kind that can break this prop. null = any tool or bare hands. */
    requiredTool: ToolKind | null;
    /** Minimum tool tier (0 = any). Future: 1=wood, 2=stone, etc. */
    minToolTier: number;

    // ── Loot ──────────────────────────────────────────────────────────────────

    /** LootTable key, or null if nothing drops on destruction. */
    lootTableId: string | null;

    // ── Animation ─────────────────────────────────────────────────────────────

    animated: boolean;
    /**
     * 'loop'          — Plays continuously (fire, waterfall, windmill).
     * 'interaction'   — Plays once on interaction, then stops.
     * 'state_driven'  — Driven by stateId; sprite and frames come from
     *                   PropSpriteConfig.stateFrames[stateId].
     * null            — Static sprite.
     */
    animationMode: 'loop' | 'interaction' | 'state_driven' | null;
    /** Total animation frames for loop/interaction modes. */
    frameCount: number;
    /** Milliseconds per animation frame. */
    frameDuration: number;

    // ── Growth ────────────────────────────────────────────────────────────────

    /**
     * Ordered growth stage definitions for plant props.
     * null for non-growing props.
     * The first entry's stageId must equal defaultStateId.
     */
    growthStages: ReadonlyArray<GrowthStageDefinition> | null;

    // ── NPC awareness ─────────────────────────────────────────────────────────

    /** Should NPCs path around the solid tiles of this prop? */
    npcPathable: boolean;
    /** Can NPCs interact with this prop (sit, open door, harvest)? */
    npcCanInteract: boolean;
    /** Behavior key used by the NPC behavior system (e.g. 'sit', 'open_door'). */
    npcInteractionBehavior: string | null;

    // ── Sprite ────────────────────────────────────────────────────────────────

    /** Determines which rendering code path the WorldLayer uses. */
    spriteLayout: PropSpriteLayout;
}

// ─── Prop state ───────────────────────────────────────────────────────────────

/**
 * Runtime state of one prop instance in the world.
 *
 * All static behaviour is derived by looking up PropState.type in the
 * PropDefinitionRegistry — only instance-specific or changeable data lives here.
 */
export interface PropState {
    /** Stable unique identifier.  Key in GameState.props. */
    id: EntityId;
    /** Key into the PropDefinitionRegistry.  Determines all static behaviour. */
    type: string;

    // ── Position ──────────────────────────────────────────────────────────────

    /** Tile X of the top-left origin of the footprint. */
    x: number;
    /** Tile Y of the top-left origin of the footprint. */
    y: number;

    // ── Size ──────────────────────────────────────────────────────────────────

    /**
     * Actual tile width of this instance.
     * Equals definition.defaultWidth for non-resizable props.
     * May be wider for resizable props (carpet, hedge).
     */
    width: number;
    /** Actual tile height (always equals definition.defaultHeight for now). */
    height: number;

    // ── Layer ─────────────────────────────────────────────────────────────────

    /** Cached from PropDefinition.layer for fast access in rendering/collision. */
    layer: PropLayer;

    // ── Orientation ───────────────────────────────────────────────────────────

    /**
     * Quarter-turn rotation: 0=0°, 1=90°CW, 2=180°, 3=270°CW.
     * When rotation is 1 or 3, the effective footprint transposes width/height.
     * PropSystem.getEffectiveDimensions() returns the rotated size.
     */
    rotation: 0 | 1 | 2 | 3;

    // ── Visual ────────────────────────────────────────────────────────────────

    /**
     * Autotile bitmask (0–15, 4-neighbour) for connecting props (fences, hedges).
     * Style variant index for non-connecting props (0 = default).
     */
    variant: number;

    // ── Logical state ─────────────────────────────────────────────────────────

    /**
     * Named state for stateful props.
     * doors:     'open' | 'closed'
     * lights:    'lit'  | 'unlit'
     * plants:    'seedling' | 'sprout' | 'mature' | 'dead'
     * stateless: '' (empty string)
     */
    stateId: string;

    // ── Animation ─────────────────────────────────────────────────────────────

    /** Current frame index within the active animation clip. */
    animFrame: number;
    /** Milliseconds accumulated since the last frame advance. */
    animTimer: number;

    // ── Destruction ───────────────────────────────────────────────────────────

    /** Current HP.  null when the prop is indestructible. */
    health: number | null;

    // ── Chunk affiliation ─────────────────────────────────────────────────────

    /**
     * "cx,cy" key of the owning chunk.
     * Used to route the prop into ChunkState.savedProps when the chunk unloads.
     */
    chunkKey: string;

    // ── Per-instance data ─────────────────────────────────────────────────────

    /**
     * Arbitrary prop-type-specific runtime data.
     * chest:  { inventory: InventoryState }
     * sign:   { text: string }
     * plant:  { growthTimer: number }
     * door:   {} (state stored in stateId)
     */
    metadata: Record<string, unknown>;
}

// ─── Spatial index slot ───────────────────────────────────────────────────────

/**
 * Per-tile slot record stored in GameState.propLayerIndex.
 *
 * At most one prop may occupy each layer per tile.  null means the slot is
 * vacant.  The prop system enforces this constraint at placement time.
 */
export interface PropLayerSlot {
    floor:  EntityId | null;
    object: EntityId | null;
    wall:   EntityId | null;
}
