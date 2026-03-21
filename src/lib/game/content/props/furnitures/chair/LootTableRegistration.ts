import { type LootTable, registerLootTable } from '$lib/game/systems/props/LootRegistry';

registerLootTable(<LootTable>{
  id:    'chair_drop',
  rolls: { min: 1, max: 1 },
  entries: [
    {
      itemId:        'chair',
      quantity:      { min: 1, max: 1 },
      weight:        1,    // relative probability
      requiredTool:  null,  // null = any tool qualifies
      minToolTier:   0,     // minimum tool tier (0 = bare hand)
    },
  ],
});
