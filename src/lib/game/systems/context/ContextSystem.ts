// src/lib/game/systems/context/ContextSystem.ts
//
// Pure functions for managing the InteractionContext stack.
//
// Design rules:
//   - All functions are pure — they take a stack and return a new stack.
//   - The root 'gameplay' context at index 0 can never be removed.
//   - Permission queries are centralised here so SimulationModule
//     never hard-codes context-kind comparisons inline.

import type { InteractionContext, ContextStack } from '$lib/game/types/context';

// ─── Stack manipulation ───────────────────────────────────────────────────────

/**
 * Push a new context onto the stack.
 * Returns a new stack with the context appended at the top.
 */
export function pushContext(stack: ContextStack, ctx: InteractionContext): ContextStack {
    return [...stack, ctx];
}

/**
 * Pop the top context.
 * Silently no-ops if the stack only contains the root gameplay context —
 * that context is permanent and can never be removed.
 */
export function popContext(stack: ContextStack): ContextStack {
    if (stack.length <= 1) return stack;
    return stack.slice(0, -1);
}

// ─── Stack queries ────────────────────────────────────────────────────────────

/**
 * Return the currently active context (top of the stack).
 * Always returns a valid context — falls back to { kind: 'gameplay' }
 * if the stack is somehow empty (defensive).
 */
export function peekContext(stack: ContextStack): InteractionContext {
    return stack[stack.length - 1] ?? { kind: 'gameplay' };
}

/**
 * True when the active context matches the given kind.
 * Use this for single-context checks; do not inline `.kind` comparisons.
 */
export function isInContext(
    stack: ContextStack,
    kind:  InteractionContext['kind'],
): boolean {
    return peekContext(stack).kind === kind;
}

// ─── Permission queries ───────────────────────────────────────────────────────

/**
 * True when the player may receive movement input.
 *
 * Movement is only allowed while in the root gameplay context.
 * Any overlay (inventory, dialogue, menu) blocks locomotion so the
 * player cannot walk off-screen while reading a sign or managing items.
 */
export function canPlayerMove(stack: ContextStack): boolean {
    return peekContext(stack).kind === 'gameplay';
}

/**
 * True when the player may interact with the world:
 *   - Pick up ground items (KeyE auto-pickup)
 *   - Trigger prop interactions (doors, seats, containers)
 *   - Start dialogue with an NPC
 *
 * Interaction is blocked in every non-gameplay context so that, for example,
 * pressing E while a dialogue is open does not accidentally trigger a second
 * prop interaction behind the NPC.
 */
export function canPlayerInteract(stack: ContextStack): boolean {
    return peekContext(stack).kind === 'gameplay';
}

/**
 * True when the player can open their own inventory as a top-level browse.
 *
 * Opening inventory is blocked if a non-closable context is active (dialogue,
 * container) because those flows manage inventory access themselves.
 * It is allowed from gameplay and — in the future — from contexts that
 * explicitly permit it (e.g. a crafting station may allow free browsing).
 */
export function canOpenInventory(stack: ContextStack): boolean {
    const top = peekContext(stack);
    return top.kind === 'gameplay';
}
