import { registerPropDefinition } from '../../../propDefinitions.ts';
import type {PropDefinition} from "$lib/game/types/props.ts";

registerPropDefinition(<PropDefinition>{
  type:       'chair',
  layer:      'object',
  defaultWidth:  1,
  defaultHeight: 1,
  resizable:  false,
  rotatable:  true,

  // Solid mask: 1 = solid, 0 = passable. Row-major, [row][col].
  // For a 1×1 prop this is always [[1]].
  solidMask: [[1]],

  placementConstraints: [{ tileType: 'CARPET' }, { tileType: 'STONE' }],

  interactionType: 'seat',
  breakable: true,
  breakTool: null,     // null = any tool / bare hand
  breakHits: 1,
  maxHealth: 1,

  lootTableId: 'chair_drop',    // null if no drops
  npcPathable: false,           // blocks NPC pathfinding
});