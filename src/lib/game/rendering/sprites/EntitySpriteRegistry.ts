// src/lib/game/rendering/sprites/EntitySpriteRegistry.ts
//
// Maps entity kinds to their spritesheet and animation configs.
// The renderer uses this to resolve which sheet and animations to use when
// drawing any entity, without branching on kind inside draw calls.

import type { UniformSheetConfig }  from './SpriteSheet';
import type { AnimationDefinition } from './AnimationController';
import type { EntityKind }          from '../../types/entities';
import { ADAM_SHEET, ADAM_ANIMATIONS } from './characters/adam';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Combined visual config for an entity kind: spritesheet + animation library. */
export interface EntityVisualConfig {
  sheet:      UniformSheetConfig;
  animations: Record<string, AnimationDefinition>;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Registry keyed by EntityKind.
 * Entities with no entry here will not be rendered.
 */
export const ENTITY_VISUALS: Partial<Record<EntityKind, EntityVisualConfig>> = {
  player:        { sheet: ADAM_SHEET, animations: ADAM_ANIMATIONS },
  remote_player: { sheet: ADAM_SHEET, animations: ADAM_ANIMATIONS },
  // npc:    { sheet: NPC_SHEET, animations: NPC_ANIMATIONS },
  // animal: { sheet: ANIMAL_SHEET, animations: ANIMAL_ANIMATIONS },
};

/**
 * Resolve the visual config for a given entity kind.
 * Returns undefined if no config is registered — the renderer skips the entity.
 */
export function getEntityVisuals(kind: EntityKind): EntityVisualConfig | undefined {
  return ENTITY_VISUALS[kind];
}
