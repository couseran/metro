# Debug Overlays

Two in-game debug overlays help visualise the two most common sources of prop/entity rendering and collision bugs: **draw order** and **hitbox shape**. Both overlays are toggled with keyboard shortcuts, can run simultaneously, have no effect on the simulation, and are never visible in production builds (they are guarded by the `RendererModule` flags which start as `false`).

---

## Quick reference

| Key | Overlay | What it draws |
|-----|---------|---------------|
| `` ` `` (backtick) | Y-sort overlay | Horizontal line at the `sortY` of every world-layer object |
| `\` (backslash) | Hitbox overlay | Collision AABBs for props and the player |

Both overlays are drawn **after** the Y-sorted world pass, so they always appear on top of all game sprites.

---

## Y-Sort Overlay

### What it shows

Every object in the Y-sorted world pass (Pass 2) gets a horizontal line drawn at the exact pixel row that determined its position in the draw order — its `sortY`. The painter's algorithm draws objects with a **lower** `sortY` first, meaning they appear **behind** objects with a higher value.

### Color key

| Color | Object type |
|-------|-------------|
| Blue | World-layer wall tile |
| Orange | Object-layer prop (furniture, trees, chests…) |
| Magenta | Wall-layer prop (paintings, windows, mounted shelves) |
| Green | Entity (player, future NPCs) |

Object-layer props, wall-layer props, and entities also show a small text label with their type and exact `sortY` value (e.g. `prop  y=128.0`). Tiles have no label because they are numerous.

### How sortY is computed

| Object | Formula |
|--------|---------|
| Wall tile at row `ty` | `(ty + 1) × TILE_SIZE` |
| Object/wall prop at tile `(px, py)` | `(py + height) × TILE_SIZE + sortYOffset` |
| Wall prop (additional bias) | `… + WALL_PROP_SORT_BIAS` (0.5 px) |
| Player at pixel `y` | `y + hitbox.offsetY + hitbox.height − 4` |

The `−4` on the player prevents a clipping artifact when standing flush against a tall south-facing wall.

### Reading the overlay

When two objects overlap visually and you cannot tell which should be in front:

1. Press `` ` `` to enable the overlay.
2. Find the two objects' lines.
3. The object whose line is **lower on screen** (higher `sortY`) is drawn **in front**.
4. If the ordering feels wrong, adjust `sortYOffset` on the prop's `PropDefinition` (see below).

### Tuning `sortYOffset`

`sortYOffset` is a pixel delta on `PropDefinition` that shifts a prop's `sortY` up or down without touching its collision or sprite position.

```ts
registerPropDefinition({
  type: 'bookshelf',
  // ...
  sortYOffset: -4,   // draw the bookshelf 4 px "earlier" — entities appear in front sooner
});
```

**Positive** → prop draws later / closer to the viewer (depth crossover shifts south).
**Negative** → prop draws earlier / further from the viewer (depth crossover shifts north).

Use the overlay to observe the effect in real time: the orange line moves up or down as you change the value and hot-reload.

---

## Hitbox Overlay

### What it shows

All active collision shapes used by `resolveMovement()`, drawn as outlined rectangles with a faint fill.

### Color key

| Color | Collision category | Source in `GameState` |
|-------|-------------------|-----------------------|
| Orange | Tile-snapped prop solid | `propSolidIndex` — one full `TILE_SIZE × TILE_SIZE` box per solid tile key |
| Yellow / gold | Sub-tile prop pixel box | `propSolidBoxes` — the exact asymmetric `PixelBox` from `solidInset` |
| Green | Player physical hitbox | `PLAYER_HITBOX` offset from the interpolated render position |

Sub-tile boxes (yellow) also show a label with the prop's type string.

### The two collision paths

Understanding why there are two prop colors:

**Tile-snapped (orange)** — the fast path. Collision is checked once per tile coordinate using a `Set<"tx,ty">` lookup. The blocking area is always a full `16 × 16` pixel tile, regardless of sprite shape. Props use this path when `solidInset` is `undefined` or all-zero.

**Sub-tile pixel box (yellow)** — the precise path. A `PixelBox` (x, y, w, h in world pixels) is stored per-prop and tested with an AABB overlap check. Props use this path when any side of `solidInset` is greater than zero. The box is **not** in `propSolidIndex` — it is tested separately, after the tile-grid pass.

Because the player's hitbox is only a few pixels tall (a strip at their feet), the difference between these two paths is very visible at tile boundaries: tile-snapped props block the player at the tile edge, while sub-tile props let the player step some pixels inside before being pushed back.

### Reading the overlay

1. Press `\` to enable the overlay.
2. Walk the player toward a prop.
3. Observe where the green hitbox first touches an orange or yellow box.
4. That contact point is where movement resolution kicks in — it should match the intended visual boundary of the prop.

If the orange or yellow box does not align with the visual sprite, adjust `solidInset` on the `PropDefinition` (see below).

### Tuning `solidInset`

`solidInset` is a per-side pixel inset that shrinks the collision AABB from the tile footprint boundary. It also automatically rotates with the prop at 90°/180°/270° so the collision box stays geometrically correct in every orientation.

```ts
import { solidInset } from '$lib/game/types/props';

registerPropDefinition({
  type: 'chair',
  // ...

  // One argument — same inset on all four sides
  solidInset: solidInset(3),

  // Two arguments — solidInset(vertical, horizontal)
  solidInset: solidInset(0, 4),

  // Four arguments — solidInset(top, right, bottom, left)
  solidInset: solidInset(0, 4, 6, 4),
});
```

With the hitbox overlay active, the yellow box updates immediately as you change the values. Verify the result with the player character: walk from each side and confirm the player is blocked where expected.

---

## Using Both Overlays Together

The two overlays address **independent** systems — collision (physics) and depth ordering (rendering). They are separate controls because they serve different concerns and don't need to match.

That said, there is one common pattern where they interact: when you want the player to be able to step slightly behind a prop, both systems need to agree on where the "crossing point" is.

**Rule of thumb for matching the depth crossover to the collision boundary:**

```
sortYOffset = -(solidInset.bottom)
```

Example — a chair with a 3 px bottom inset:

```ts
solidInset:  solidInset(3),   // player can step 3 px inside the south tile edge
sortYOffset: -3,              // depth swap happens exactly at that 3 px boundary
```

Without `sortYOffset = -3`, the chair's Y-sort line would sit 3 px south of the actual collision edge, so the player would visually appear in front of the chair slightly before they can physically walk behind it — a subtle but noticeable disconnect.

**Verification workflow:**

1. Enable both overlays simultaneously (`` ` `` then `\`).
2. The green player hitbox and the yellow prop box should swap their Y relationship exactly as the player steps behind the orange/yellow sort line.
3. If the swap happens before the player reaches the line, `sortYOffset` is too negative — increase it.
4. If the swap happens after, `sortYOffset` is too positive — decrease it.

---

## Workflow — Tuning a New Prop

When adding a new prop, follow this sequence to tune collision and depth:

**1. Place the prop** in the debug world (see [adding-props.md](./adding-props.md)).

**2. Enable the hitbox overlay (`\`).**
   Verify the collision shape. If it uses the default (`solidInset` unset), it will show as an orange full-tile box. If you specified a `solidInset`, it will show as a yellow box sized accordingly.

**3. Walk into the prop from each direction.**
   Check that the player is blocked where intended. Adjust `solidInset` until satisfied. Remember: when any side is non-zero, the prop uses the pixel-box path, letting the player step some pixels inside the tile before being stopped.

**4. Enable the Y-sort overlay (`` ` ``).**
   The orange line shows where in screen space the prop's depth crossover currently sits. Walk north and south of the line and confirm the prop and player swap draw order at the right moment.

**5. Set `sortYOffset` if needed.**
   If you set a bottom inset in step 3, start with `sortYOffset = -(solidInset.bottom)` as your initial value. Tune from there.

**6. Rotate the prop (if `rotatable: true`).**
   The `solidInset` is automatically rotated, so the yellow box should match the visual boundary in every orientation. Verify each rotation with the hitbox overlay active.

---

## Architecture Notes

These two systems are intentionally decoupled:

| Concern | Field | Controlled by |
|---------|-------|---------------|
| Where the player is blocked | `solidInset` on `PropDefinition` | Physics — `PropSystem`, `TileCollision` |
| When depth swaps between prop and entity | `sortYOffset` on `PropDefinition` | Rendering — `WorldLayer`, `RendererModule` |

Coupling them (deriving `sortYOffset` automatically from `solidInset.bottom`) would cause physics changes to silently alter rendering and vice versa. Keeping them independent means:

- A purely decorative prop (no collision) can still have its depth anchor tuned.
- A gameplay-only collision adjustment won't unexpectedly move the depth crossover.
- Both can be verified in isolation.

---

## Extending the Debug System

If you need a third overlay (e.g. NPC pathfinding graph, interaction radii, camera frustum):

**1. Create `src/lib/game/rendering/debug/DebugYourOverlay.ts`**

Follow the same pattern as `DebugSortOverlay.ts` and `DebugHitboxOverlay.ts`:
- Accept `ctx`, `current: GameState`, and `effectiveScale` as parameters.
- Draw boxes/lines in the viewport-transformed world space (coordinates × effectiveScale).
- Reset the transform with `ctx.resetTransform()` before drawing text labels.
- Wrap everything in `ctx.save()` / `ctx.restore()`.

**2. Add a toggle flag in `RendererModule`**

```ts
// src/lib/game/engine/RendererModule.ts
public debugYourOverlay = false;
```

Then call the function inside `draw()` after `drawWorldLayer()`:

```ts
if (this.debugYourOverlay) {
  drawYourOverlay(this.ctx, current, effectiveScale);
}
```

**3. Bind a key in `GameCanvas.svelte`**

```ts
if (e.key === 'chosen_key') renderer.debugYourOverlay = !renderer.debugYourOverlay;
```

Choose a key that does not conflict with gameplay input (WASD, arrow keys, E). Function keys (`F1`–`F12`) or punctuation keys (`\`, `` ` ``, `/`) are safe choices.
