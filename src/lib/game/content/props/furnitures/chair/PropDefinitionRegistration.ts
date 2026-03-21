import { registerPropDefinition }        from '$lib/game/systems/props/PropRegistry';
import type { PropDefinition }           from '$lib/game/types/props';
import {solidInset, solidOffset}from '$lib/game/types/props';
import { TileType }                      from '$lib/game/types/world';

registerPropDefinition({
    type:          'chair',
    layer:         'object',

    // ── Size ──────────────────────────────────────────────────────────────────
    defaultWidth:  1,
    defaultHeight: 1,
    resizable:     false,
    minWidth:      1,
    maxWidth:      1,

    // ── Solid mask ────────────────────────────────────────────────────────────
    solidMask: [[true]],

    // Shrink the collision box by 3 px on every side so the player can step
    // slightly inside the tile edge — makes the chair feel less "blocky".
    // The inset is rotated automatically when the chair is placed at 90°/180°/270°.
    solidInset: solidInset(3),

    solidOffset: solidOffset(0,0,3),

    // ── Sort-Y offset ─────────────────────────────────────────────────────────
    // Align the visual depth crossover with the physical collision boundary:
    //   player crosses behind the chair exactly when they can physically step there.
    sortYOffset: -5,

    // ── Placement ─────────────────────────────────────────────────────────────
    placementConstraints: [
        { type: 'allowed_tile_types', tileTypes: [TileType.CARPET, TileType.STONE] },
        { type: 'layer_must_be_empty', layer: 'object' },
    ],
    rotatable:      true,
    rotationSteps:  4,

    // ── Interaction ───────────────────────────────────────────────────────────
    interactionType:    'seat',
    interactionTrigger: 'key_e',
    defaultStateId:     '',

    // ── Destruction ───────────────────────────────────────────────────────────
    breakable:    true,
    maxHealth:    1,
    requiredTool: null,   // any tool or bare hands
    minToolTier:  0,

    // ── Loot ──────────────────────────────────────────────────────────────────
    lootTableId: 'chair_drop',

    // ── Animation ─────────────────────────────────────────────────────────────
    animated:      false,
    animationMode: null,
    frameCount:    1,
    frameDuration: 0,

    // ── Growth ────────────────────────────────────────────────────────────────
    growthStages: null,

    // ── NPC awareness ─────────────────────────────────────────────────────────
    npcPathable:            false,
    npcCanInteract:         true,
    npcInteractionBehavior: 'sit',

    // ── Sprite ────────────────────────────────────────────────────────────────
    spriteLayout: 'single',
} satisfies PropDefinition);
