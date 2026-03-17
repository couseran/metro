import {LootTable, registerLootTable} from '../../../lootTables.ts';

registerLootTable(<LootTable>{
  id:    'chair_drop',
  rolls: 1,           // number of independent draws
  entries: [
    {
      itemId:        'chair',
      quantity:      1,
      weight:        1,    // relative probability
      requiredTool:  null,  // null = any tool qualifies
      minToolTier:   0,     // minimum tool tier (0 = bare hand)
    },
  ],
});