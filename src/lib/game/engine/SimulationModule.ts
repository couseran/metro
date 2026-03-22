// src/lib/game/engine/SimulationModule.ts

import type { InputEvent }                        from './InputModule';
import type { WorldState, CameraState, TileTypeValue } from '../types/world';
import type { PropState, PropLayerSlot }          from '../types/props';
import type { EntityId }                          from '../types/primitives';
import type { GameEvent }                         from '../types/events';
import type { GroundItemState }                   from '../types/groundItems';
import type { ContextStack }                      from '../types/context';
import { GROUND_ITEM_DESPAWN_MS }                 from '../types/groundItems';
import { ROOT_CONTEXT }                           from '../types/context';
import { createInitialWorld, SPAWN_POINT }        from '../world/WorldFactory';
import { resolveMovement, PLAYER_HITBOX, getTileAt } from '../systems/tiles/TileCollision.ts';
import { TILE_SIZE }                              from '../world/WorldConstants';
import { placeProp, damageProp, interactWithProp } from '../systems/props/PropSystem';
import { getPropDefinition }                      from '../systems/props/PropRegistry';
import { addItems, moveSlot, removeItem }         from '../systems/inventory/InventorySystem';
import { flushUIActions }                         from '../bridge/UIActionQueue';
import {
    pushContext,
    popContext,
    peekContext,
    canPlayerMove,
    canPlayerInteract,
    canOpenInventory,
}                                                 from '../systems/context/ContextSystem';
import type { PixelBox }                          from '../systems/tiles/TileCollision.ts';

// ─── Content registration (side-effect imports) ───────────────────────────────
import '../content/props/furnitures/chair/PropDefinitionRegistration';
import '../content/props/furnitures/chair/ItemRegistration';
import '../content/props/furnitures/chair/LootTableRegistration';

import {
  type PlayerState,
  createPlayer,
  tickPlayer,
  setMovement,
  sit,
  standUp,
  openPhone,
  closePhone,
} from '../systems/entities/Player';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameState {
  player:           PlayerState;
  tick:             number;
  timestamp:        number;

  world:            WorldState;

  props:            Map<EntityId, PropState>;
  propLayerIndex:   Map<string, PropLayerSlot>;
  propSolidIndex:   Set<string>;
  propSolidBoxes:   Map<EntityId, PixelBox>;

  /**
   * All active ground item piles in the loaded world.
   * Keyed by EntityId.  Mirrored to UIStore after each render frame so the
   * Svelte overlay layer can position badges in world-space CSS coordinates.
   */
  groundItems:      Map<EntityId, GroundItemState>;

  camera:           CameraState;

  /**
   * Interaction context stack.
   * Index 0 is always { kind: 'gameplay' }.  The top element (last index)
   * determines which input systems are active and which UI panels are shown.
   * All context transitions go through SimulationModule so they are
   * deterministic, serializable, and replay-safe.
   * Mirrored to UIStore every frame via GameLoop.syncUIStore().
   */
  contextStack:     ContextStack;
}

// ─── Ground item ID generation ────────────────────────────────────────────────

let _nextGroundItemId = 1;

function generateGroundItemId(): EntityId {
    return `gi_${_nextGroundItemId++}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Shallow-clone GameState for the prevState snapshot used by the renderer.
 * Only fields that change every tick need deep cloning (player, camera).
 * Structural data (props, world, groundItems) is stable between ticks and can
 * share the same reference in both snapshots.
 */
function cloneState(state: GameState): GameState {
  return {
    ...state,
    player: { ...state.player, animation: { ...state.player.animation } },
    camera: { ...state.camera },
  };
}

// ─── Camera ───────────────────────────────────────────────────────────────────

const PLAYER_CAM_OFFSET_X = 8;
const PLAYER_CAM_OFFSET_Y = 16;

function tickCamera(camera: CameraState, player: PlayerState): CameraState {
  return { ...camera, x: player.x + PLAYER_CAM_OFFSET_X, y: player.y + PLAYER_CAM_OFFSET_Y };
}

// ─── Footstep detection ───────────────────────────────────────────────────────

const FOOT_CONTACT_FRAMES = new Set([0, 3]);

const PLAYER_ENTITY_ID: EntityId = 'player';

const PLAYER_FOOT_OFFSET_X = 8;
const PLAYER_FOOT_OFFSET_Y = PLAYER_HITBOX.offsetY + PLAYER_HITBOX.height / 2; // 28

// ─── Proximity constants ──────────────────────────────────────────────────────

/** Maximum distance in world-space pixels to pick up a ground item. */
const PICKUP_RANGE_PX = TILE_SIZE * 1.5; // 24 px

// ─── Input → Velocity mapping ─────────────────────────────────────────────────

const MOVE_SPEED = 55;

interface MovementVector { vx: number; vy: number; }

function resolveMovementVector(heldKeys: Set<string>, speed: number): MovementVector {
  let vx = 0;
  let vy = 0;

  if (heldKeys.has('ArrowLeft')  || heldKeys.has('KeyA')) vx -= 1;
  if (heldKeys.has('ArrowRight') || heldKeys.has('KeyD')) vx += 1;
  if (heldKeys.has('ArrowUp')    || heldKeys.has('KeyW')) vy -= 1;
  if (heldKeys.has('ArrowDown')  || heldKeys.has('KeyS')) vy += 1;

  if (vx !== 0 && vy !== 0) {
    const INV_SQRT2 = 0.7071067811865476;
    vx *= INV_SQRT2;
    vy *= INV_SQRT2;
  }

  return { vx: vx * speed, vy: vy * speed };
}

// ─── Debug helpers ────────────────────────────────────────────────────────────

function getFrontTile(
    footTX:    number,
    footTY:    number,
    direction: 'up' | 'down' | 'left' | 'right',
): { tx: number; ty: number; rotation: 0 | 1 | 2 | 3 } {
    switch (direction) {
        case 'up':    return { tx: footTX,     ty: footTY - 1, rotation: 0 };
        case 'down':  return { tx: footTX,     ty: footTY + 1, rotation: 2 };
        case 'left':  return { tx: footTX - 1, ty: footTY,     rotation: 3 };
        case 'right': return { tx: footTX + 1, ty: footTY,     rotation: 1 };
    }
}

// ─── SimulationModule ─────────────────────────────────────────────────────────

export class SimulationModule {
  state:     GameState;
  prevState: GameState;

  private heldKeys: Set<string> = new Set();

  private pendingEvents: GameEvent[] = [];

  constructor() {
    const player = createPlayer(SPAWN_POINT.x, SPAWN_POINT.y);

    const initial: GameState = {
      player,
      tick:             0,
      timestamp:        0,
      world:            createInitialWorld(),
      props:            new Map(),
      propLayerIndex:   new Map(),
      propSolidIndex:   new Set(),
      propSolidBoxes:   new Map(),
      groundItems:      new Map(),
      camera:           { x: player.x + PLAYER_CAM_OFFSET_X, y: player.y + PLAYER_CAM_OFFSET_Y, zoom: 1 },
      contextStack:     ROOT_CONTEXT,
    };

    this.state     = initial;
    this.prevState = cloneState(initial);
  }

  // ─── Event queue ────────────────────────────────────────────────────────────

  flushEvents(): GameEvent[] {
    if (this.pendingEvents.length === 0) return [];
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  // ─── Main tick ──────────────────────────────────────────────────────────────

  tick(dt: number, inputs: InputEvent[]): void {
    this.prevState = cloneState(this.state);

    // Drain UI actions first — inventory operations from the Svelte layer
    this.handleUIActions();

    this.applyInputEvents(inputs);
    this.applyMovement();

    let { player } = this.state;
    player = tickPlayer(player, dt);

    const { x, y } = resolveMovement(
        player.x, player.y,
        player.vx, player.vy,
        PLAYER_HITBOX,
        this.state.world,
        dt,
        this.state.propSolidIndex,
        this.state.propSolidBoxes,
    );
    player = { ...player, x, y };

    this.collectFootstepEvent(this.prevState.player.animation, player);

    const camera = tickCamera(this.state.camera, player);

    this.state = {
      ...this.state,
      player,
      camera,
      tick:      this.state.tick + 1,
      timestamp: this.state.timestamp + dt,
    };

    // Tick ground item despawn timers
    this.tickGroundItems(dt);
  }

  // ─── UI action handling ──────────────────────────────────────────────────────

  private handleUIActions(): void {
    const actions = flushUIActions();
    if (actions.length === 0) return;

    for (const action of actions) {
      switch (action.type) {
        case 'MOVE_INVENTORY_SLOT': {
          const newInv = moveSlot(this.state.player.inventory, action.from, action.to);
          this.state = { ...this.state, player: { ...this.state.player, inventory: newInv } };
          break;
        }

        case 'DROP_ITEM': {
          const slot = this.state.player.inventory.slots[action.slotIndex];
          if (!slot) break;

          const qty    = Math.min(action.quantity, slot.quantity);
          const newInv = removeItem(this.state.player.inventory, action.slotIndex, qty);

          // Spawn the dropped item at the player's feet
          const gi: GroundItemState = {
            id:           generateGroundItemId(),
            itemId:       slot.itemId,
            quantity:     qty,
            x:            this.state.player.x + PLAYER_FOOT_OFFSET_X,
            y:            this.state.player.y + PLAYER_FOOT_OFFSET_Y,
            despawnTimer: GROUND_ITEM_DESPAWN_MS,
          };

          const newGroundItems = new Map(this.state.groundItems);
          newGroundItems.set(gi.id, gi);

          this.state = {
            ...this.state,
            player:      { ...this.state.player, inventory: newInv },
            groundItems: newGroundItems,
          };
          break;
        }

        case 'POP_CONTEXT': {
          this.applyContextPop();
          break;
        }
      }
    }
  }

  // ─── Context transitions ──────────────────────────────────────────────────────

  /**
   * Pop the top interaction context and apply any side-effects to player state.
   *
   * Each context kind that modifies player state when it opens must reverse
   * that modification here.  This is the single authoritative place for
   * "on-context-close" logic — both Escape key handling and UI close buttons
   * route through this method.
   */
  private applyContextPop(): void {
    const top = peekContext(this.state.contextStack);
    if (top.kind === 'gameplay') return; // Root context cannot be popped

    const newContextStack = popContext(this.state.contextStack);
    let { player } = this.state;

    // Reverse any player state changes that were applied when this context opened
    switch (top.kind) {
      case 'inventory':
        player = closePhone(player);
        break;
      // dialogue, container, menu: no player animation to reverse (for now)
    }

    this.state = { ...this.state, contextStack: newContextStack, player };
  }

  // ─── Ground item despawn ─────────────────────────────────────────────────────

  private tickGroundItems(dt: number): void {
    const { groundItems } = this.state;
    if (groundItems.size === 0) return;

    const newGroundItems = new Map(groundItems);
    let changed = false;

    for (const [id, item] of newGroundItems) {
      const newTimer = item.despawnTimer - dt;
      if (newTimer <= 0) {
        newGroundItems.delete(id);
        changed = true;
      } else {
        newGroundItems.set(id, { ...item, despawnTimer: newTimer });
        changed = true;
      }
    }

    if (changed) {
      this.state = { ...this.state, groundItems: newGroundItems };
    }
  }

  // ─── Input processing ────────────────────────────────────────────────────────

  private applyInputEvents(inputs: InputEvent[]): void {
    for (const event of inputs) {
      if (event.type === 'keydown') {
        this.heldKeys.add(event.key);
        this.handleKeyPress(event.key);
      } else if (event.type === 'keyup') {
        this.heldKeys.delete(event.key);
      }
    }
  }

  private handleKeyPress(key: string): void {
    switch (key) {
      // ── F key — toggle inventory ───────────────────────────────────────────
      case 'KeyF': {
        const top = peekContext(this.state.contextStack);

        if (top.kind === 'inventory') {
          // Already in inventory — close it
          this.applyContextPop();
        } else if (canOpenInventory(this.state.contextStack)) {
          // Open inventory: push context + trigger phone animation
          const newContextStack = pushContext(
              this.state.contextStack,
              { kind: 'inventory', purpose: 'browse' },
          );
          const player = openPhone(this.state.player);
          this.state = { ...this.state, contextStack: newContextStack, player };
        }
        // In any other non-openable context, F is silently ignored
        break;
      }

      // ── Escape key — close active overlay ─────────────────────────────────
      case 'Escape': {
        this.applyContextPop();
        break;
      }

      // ── E key — world interaction ──────────────────────────────────────────
      case 'KeyE': {
        const { player } = this.state;

        // Stand up regardless of context — it's always safe to stand
        if (
            player.activity === 'sitting_1' ||
            player.activity === 'sitting_2' ||
            player.activity === 'sitting_3'
        ) {
          this.state = { ...this.state, player: standUp(player) };
          break;
        }

        // World interaction is only valid in the gameplay context
        if (!canPlayerInteract(this.state.contextStack)) break;

        // 1. Try to pick up a nearby ground item first.
        // 2. If nothing was picked up, try to interact with the prop in front.
        if (!this.tryPickupNearbyGroundItem()) {
          this.tryInteractWithFrontProp();
        }
        break;
      }

      // Temporary sit tests — remove when world interaction is implemented
      case 'Digit1': this.state = { ...this.state, player: sit(this.state.player, 'sitting_1', 'right') }; break;
      case 'Digit2': this.state = { ...this.state, player: sit(this.state.player, 'sitting_2', 'left') };  break;
      case 'Digit3': this.state = { ...this.state, player: sit(this.state.player, 'sitting_3', 'left') };  break;

      // ── Debug: spawn chair ─────────────────────────────────────────────────
      case 'KeyP': {
        const { player } = this.state;
        const chairDef = getPropDefinition('chair');
        if (!chairDef) break;
        const footTX = Math.floor((player.x + PLAYER_FOOT_OFFSET_X) / TILE_SIZE);
        const footTY = Math.floor((player.y + PLAYER_FOOT_OFFSET_Y) / TILE_SIZE);
        const { tx, ty, rotation } = getFrontTile(footTX, footTY, player.direction);
        const chairRotation = rotation % 2 === 1 ? rotation : 1;
        const { state: withChair } = placeProp(this.state, chairDef, tx, ty, chairRotation);
        this.state = withChair;
        break;
      }

      // ── Debug: remove chair and drop loot ─────────────────────────────────
      case 'KeyR': {
        const { player } = this.state;
        const footTX = Math.floor((player.x + PLAYER_FOOT_OFFSET_X) / TILE_SIZE);
        const footTY = Math.floor((player.y + PLAYER_FOOT_OFFSET_Y) / TILE_SIZE);
        const { tx, ty } = getFrontTile(footTX, footTY, player.direction);
        const slot   = this.state.propLayerIndex.get(`${tx},${ty}`);
        const propId = slot?.object ?? null;
        if (!propId) break;
        const prop = this.state.props.get(propId);
        if (!prop || prop.type !== 'chair') break;

        const propWorldX = prop.x * TILE_SIZE + TILE_SIZE / 2;
        const propWorldY = prop.y * TILE_SIZE + TILE_SIZE / 2;

        const { state: newState, destroyed, loot } = damageProp(
            this.state, propId,
            prop.health ?? 9999,
            'hands', 0,
            Math.random,
        );

        if (destroyed && loot.length > 0) {
          const { inventory: newInv, overflow } = addItems(player.inventory, loot);

          const newGroundItems = new Map(newState.groundItems);
          for (const overflowItem of overflow) {
            const gi: GroundItemState = {
              id:           generateGroundItemId(),
              itemId:       overflowItem.itemId,
              quantity:     overflowItem.quantity,
              x:            propWorldX,
              y:            propWorldY,
              despawnTimer: GROUND_ITEM_DESPAWN_MS,
            };
            newGroundItems.set(gi.id, gi);
          }

          this.state = {
            ...newState,
            player:      { ...newState.player, inventory: newInv },
            groundItems: newGroundItems,
          };
        } else {
          this.state = newState;
        }
        break;
      }
    }
  }

  // ─── Ground item pickup ──────────────────────────────────────────────────────

  /**
   * Find the closest ground item within PICKUP_RANGE_PX of the player's feet.
   * If found, add as much as possible to the player's inventory.
   * Items that don't fit remain on the ground with reduced quantity.
   *
   * @returns true if any item was picked up (even partially).
   */
  private tryPickupNearbyGroundItem(): boolean {
    const { player, groundItems } = this.state;
    const playerCX = player.x + PLAYER_FOOT_OFFSET_X;
    const playerCY = player.y + PLAYER_FOOT_OFFSET_Y;

    // Find the closest ground item pile in range
    let closestId:   EntityId | null = null;
    let closestDist: number          = PICKUP_RANGE_PX;

    for (const [id, item] of groundItems) {
      const dx   = item.x - playerCX;
      const dy   = item.y - playerCY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestId   = id;
      }
    }

    if (!closestId) return false;

    const item = groundItems.get(closestId)!;
    const { inventory: newInv, overflow } = addItems(player.inventory, [
      { itemId: item.itemId, quantity: item.quantity, durability: null, metadata: {} },
    ]);

    // Check how much was actually added
    const overflowQty   = overflow.length > 0 ? overflow[0].quantity : 0;
    const pickedUpQty   = item.quantity - overflowQty;

    if (pickedUpQty === 0) {
      // Inventory has no room at all for this item type
      this.pendingEvents.push({ type: 'INVENTORY_FULL', entityId: PLAYER_ENTITY_ID });
      return false;
    }

    const newGroundItems = new Map(groundItems);

    if (overflowQty === 0) {
      // Fully picked up — remove the ground pile
      newGroundItems.delete(closestId);
    } else {
      // Partially picked up — reduce the pile quantity
      newGroundItems.set(closestId, { ...item, quantity: overflowQty });
    }

    this.pendingEvents.push({
      type:     'INVENTORY_ITEM_ADDED',
      entityId: PLAYER_ENTITY_ID,
      items:    [{ itemId: item.itemId, quantity: pickedUpQty, durability: null, metadata: {} }],
    });

    this.state = {
      ...this.state,
      player:      { ...player, inventory: newInv },
      groundItems: newGroundItems,
    };

    return true;
  }

  // ─── Prop interaction ─────────────────────────────────────────────────────────

  /**
   * Interact with the prop occupying the tile directly in front of the player.
   *
   * Behaviour per interactionType:
   *   destructible → one-hit destroy; loot goes to inventory; overflow drops on floor.
   *   seat         → player sits down.
   *   door/light   → delegate to interactWithProp() (toggles state).
   *   container    → emit PROP_CONTAINER_OPENED (UI layer opens the chest panel).
   */
  private tryInteractWithFrontProp(): void {
    const { player } = this.state;
    const footTX = Math.floor((player.x + PLAYER_FOOT_OFFSET_X) / TILE_SIZE);
    const footTY = Math.floor((player.y + PLAYER_FOOT_OFFSET_Y) / TILE_SIZE);
    const { tx, ty } = getFrontTile(footTX, footTY, player.direction);

    const slot   = this.state.propLayerIndex.get(`${tx},${ty}`);
    const propId = slot?.object ?? slot?.floor ?? null;
    if (!propId) return;

    const prop = this.state.props.get(propId);
    if (!prop) return;

    const def = getPropDefinition(prop.type);
    if (!def) return;

    switch (def.interactionType) {
      case 'seat': {
        // Sit facing the chair. Rotation 3 (facing east) → player sits with angle 'left'.
        const angle: 'right' | 'left' = prop.rotation === 3 ? 'left' : 'right';
        this.state = { ...this.state, player: sit(player, 'sitting_1', angle) };
        break;
      }

      case 'destructible': {
        const propWorldX = prop.x * TILE_SIZE + TILE_SIZE / 2;
        const propWorldY = prop.y * TILE_SIZE + TILE_SIZE / 2;

        const { state: newState, destroyed, loot } = damageProp(
            this.state, propId,
            prop.health ?? 9999,   // one-hit kill for now
            'hands', 0,
            Math.random,           // TODO: replace with seeded RNG
        );

        if (destroyed && loot.length > 0) {
          const { inventory: newInv, overflow } = addItems(player.inventory, loot);

          const newGroundItems = new Map(newState.groundItems);
          for (const overflowItem of overflow) {
            const gi: GroundItemState = {
              id:           generateGroundItemId(),
              itemId:       overflowItem.itemId,
              quantity:     overflowItem.quantity,
              x:            propWorldX,
              y:            propWorldY,
              despawnTimer: GROUND_ITEM_DESPAWN_MS,
            };
            newGroundItems.set(gi.id, gi);
          }

          if (loot.length > overflow.length || (loot.length > 0 && overflow.length === 0)) {
            this.pendingEvents.push({
              type:     'INVENTORY_ITEM_ADDED',
              entityId: PLAYER_ENTITY_ID,
              items:    loot,
            });
          }

          this.state = {
            ...newState,
            player:      { ...newState.player, inventory: newInv },
            groundItems: newGroundItems,
          };
        } else {
          this.state = newState;
        }

        this.pendingEvents.push({
          type:     'PROP_DESTROYED',
          propId,
          position: { x: prop.x, y: prop.y },
          loot,
        });
        break;
      }

      default: {
        // door, container, light, sign, etc. — delegate to PropSystem
        const result = interactWithProp(this.state, propId, PLAYER_ENTITY_ID);

        if (result.event === 'PROP_STATE_CHANGED' && result.from !== undefined && result.to !== undefined) {
          this.pendingEvents.push({ type: 'PROP_STATE_CHANGED', propId, from: result.from, to: result.to });
        } else if (result.event === 'PROP_CONTAINER_OPENED') {
          this.pendingEvents.push({ type: 'PROP_CONTAINER_OPENED', propId, playerId: PLAYER_ENTITY_ID });
        }

        this.state = result.state;
        break;
      }
    }
  }

  // ─── Footstep helper ─────────────────────────────────────────────────────────

  private collectFootstepEvent(
      prevAnim: { current: string; frameIndex: number },
      player:   PlayerState,
  ): void {
    const { animation } = player;

    if (!animation.current.startsWith('run_')) return;

    const frameChanged =
        animation.frameIndex !== prevAnim.frameIndex ||
        animation.current    !== prevAnim.current;

    if (!frameChanged || !FOOT_CONTACT_FRAMES.has(animation.frameIndex)) return;

    const footTX   = Math.floor((player.x + PLAYER_FOOT_OFFSET_X) / TILE_SIZE);
    const footTY   = Math.floor((player.y + PLAYER_FOOT_OFFSET_Y) / TILE_SIZE);
    const tileType = getTileAt(this.state.world, footTX, footTY) as TileTypeValue;

    this.pendingEvents.push({ type: 'FOOTSTEP', entityId: PLAYER_ENTITY_ID, tileType });
  }

  private applyMovement(): void {
    const { player, contextStack } = this.state;

    // Seated animations are a player-activity lock, not a context lock
    if (
        player.activity === 'sitting_1' ||
        player.activity === 'sitting_2' ||
        player.activity === 'sitting_3'
    ) return;

    // Every non-gameplay context (inventory, dialogue, menu, …) suspends movement
    if (!canPlayerMove(contextStack)) return;

    const { vx, vy } = resolveMovementVector(this.heldKeys, MOVE_SPEED);
    this.state = { ...this.state, player: setMovement(player, vx, vy) };
  }
}
