// src/lib/game/content/props/furnitures/chair/ItemRegistration.ts
//
// Registers the 'chair' item definition.
// Side-effect import — call from SimulationModule alongside the other chair registrations.

import { registerItem } from '$lib/game/systems/items/ItemRegistry';
import type { ItemDefinition } from '$lib/game/types/items';

registerItem(<ItemDefinition>{
    itemId:       'chair',
    displayName:  'Chair',
    maxStackSize: 1,
    category:     'furniture',
    sprite: {
        // Reuses the chair prop sprite (front-facing, rotation 1).
        assetKey: '/sprites/props/Interiors_16x16.png',
        sx: 16 * 9,
        sy: 16 * 31,
        sw: 16,
        sh: 32,
    },
});
