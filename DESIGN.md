# Candy Spiral — Implementation Decisions

This summarizes the final decisions. Exact numbers live in `src/game/config.ts` and [TUNING.md](TUNING.md).

The prototype went through three feedback rounds after the first build:

1. Rolls lie loose on the floor instead of in trays; no hop-in/out buttons (wait by the cart, park at P); a harder candy.
2. After watching the reference gameplay: a close follow camera, blades that wear out plus a blade pad, upgrades on walk-on pads, an info panel with milestone rewards, and DOUBLE CARVE. The cart → lollipop machine → conveyor → kiosk pipeline from the brief stays (owner's decision).
3. A much larger workshop and candy, an extremely hard candy (like the reference, where progress barely shows), a more fragile level-1 blade, and English everywhere.

## 1. Architecture

- **Headless simulation** (`src/game/`): one authoritative `GameState` (plain JSON) and pure systems, with no DOM, Three.js or audio. It is tested in Node and serialized directly into the save.
- **Fixed 60 Hz tick** with an accumulator (`SIM.maxCatchUpSteps = 6`, `maxFrameDt = 0.1`). A hidden tab skips simulation entirely, so there is no large catch-up. Player/cart positions and candy rotation are interpolated for >60 Hz screens.
- **Tick order**: motor spin → player movement → autopilot → manual cart → push player out of cart → auto board/park → stations (blade pad, upgrade pads) → carving (chef first, then robot, in the same tick) → milestones → pickup/unload → machine → conveyor/sales → contract status → tutorial.
- **Presentation events** (`events.ts`) are queued *after* a transaction commits. The renderer, audio and UI only read them and never touch the economy.
- **Presentation**: `World` (Three.js WebGLRenderer, perspective follow camera), DOM `HUD`/panels, and `AudioManager`. `Game.ts` runs the loop, input, saving, quality and the event → effect mapping.

## 2. Candy model and carving

- 5 annuli (outer → inner) of 128 sectors each; each sector stores its remaining mass. Sector surface radius: `r = sqrt(rIn² + f·(rOut² − rIn²))` with `f = remaining/initial`.
- **Hardness**: each layer holds the brief's design mass × `CANDY.massScale` (100). Contract 1 = 8,000 U. Rolls still come out at the blade's rate, so the "Remaining" readout moves only slowly, like the reference.
- Only the outermost non-empty layer is active; inner layers are locked.
- Carving needs a blade in hand. Valid contact requires: gap to the surface ≤ `reachSlack`, facing the center (`facingCos`), and input pointing into the surface. Hysteresis uses `inputCosStart` 0.38 / `inputCosKeep` 0.18, plus a 0.12 s grace so contact does not flicker.
- The contact angle is converted into candy space with the inverse rotation. The footprint is an arc as wide as the blade (0.55 u, +12% at Sharpness levels 2 and 4). Only sectors whose surface is still within reach count.
- **Allocation**: the budget `rate·dt` is split evenly across footprint sectors, clamped to each sector's mass, and the leftover is redistributed. Dust below 1e-5 is folded into the take, so mass is never created. The chef is allocated first, then the robot, in the same tick, so two carvers can never take the same mass.
- A layer is cleared below `max(0.025 U, 0.4% of the layer)`. The residue goes into the last carver's buffer, all buffers of that layer are flushed into rolls (one color per roll), and the next layer activates.
- **Motor**: target = `clamp(90·(sharpness + robot)/2, 90, 270)` °/s from the brief, plus a *supply floor*: when the active layer thins, the motor spins just fast enough that material passing the blade can still feed the configured rate. It depends only on configured rates and candy state (never on momentary input) and eases over ~0.4 s. Rotation only brings material to the blade; it never multiplies output.
- **Mesh**: one `BufferGeometry` per layer (256 columns × 6 rows: top, bevel, side). Only the active layer is rewritten, and only when sector masses change. Sector-boundary vertices use `min(left r, right r)`, so smoothing never shows extra mass. Nearly empty sectors are tucked inside the (slightly taller) inner layer to avoid z-fighting. Layers rise slightly toward the center (a low dome) so the rings read. Spiral stripes come from a diagonal-striped `emissiveMap` in polar UVs.

## 3. Blades, ribbon, rolls

- **Blades** (`PlayerState.blades/bladeWear/bladeSwap`): you start with none. Every full piece carved (not DOUBLE CARVE) costs one point of durability (8 at level 1). At 0 the blade breaks; a spare swaps in after 0.25 s if you carry one. The **blade pad** refills blades up to Blade Capacity at full durability.
- **Precision**: one chef piece = 1 / 1.25 / 1.5 / 1.75 / 2 U. Bigger pieces mean less wear per U and more efficient pickups; mass stays conserved.
- **DOUBLE CARVE!**: 8% chance per full piece (deterministic from the piece id). The blade bites one extra piece out of the same footprint (×1.6 width). That mass comes from the candy and is never created; if almost no material is left under the blade, the remainder goes to the buffer.
- **Buffer**: every carver has a fractional buffer tagged with contract and layer. Every full piece becomes one roll. The buffer is flushed into a small roll when the layer changes, the candy empties, the carver is idle > 0.35 s (≥ 0.04 U), or the chef hops in the cart. Buffers are saved.
- **Ribbon** (`RibbonRenderer`): a 24-segment strip with a 6-point cross section (visible thickness, 0.28 wide, a cream accent line). It starts at the blade, runs along the candy wall in the spin direction far enough to clear the chef, then curls outward over the floor. It is lifted above the rim on the far side of the candy. Its length follows the buffer; at a full piece it "snips" and the roll flies from the curl center. It is purely visual and owns no mass.
- **Loose rolls** (`scatter.ts`): a grid of floor points (0.2 u apart) is computed once. It keeps points outside the full candy/platter footprint, clear of walls, obstacles, the unload pad, the P bay and the station pads, and **reachable by the cart** (a free cart position within 0.9 u, so the drum or body can drive over it). A new roll is tossed outward from the contact (0.45–1.45 u past the platter) and a bit along the spin direction (0.2–1.0 u), snapped to the nearest uncrowded grid point, with deterministic jitter. Carving from behind the candy still lands rolls somewhere reachable, so a contract can never stall.
- Rolls are drawn from the authoritative list with one `InstancedMesh` (max 110), with rotation/tilt derived from the id so they look identical after loading. **Aggregation** above 80 active rolls merges the smallest roll into its nearest same-contract neighbor; mass is summed and nothing is deleted.

## 4. Cart, pickup, unload

- One cart for manual driving and autopilot. Arcade vehicle model: heading chases the input (τ 0.1 s), forward-only speed (accel τ 0.05, stop τ 0.04), sharp turns slow down. No drift, no brake.
- **Hop in/out without buttons**: stand ≤ 1.35 u from a (nearly) stopped cart for **2.5 s** to hop in (0.2 s tween), with a progress ring around the cart. Stop the cart inside the **P bay** for 0.35 s to hop out beside it. The exit spot is searched over 8 directions × 3 distances with `isFree`. After hopping out, auto-boarding re-arms only once the chef walks > 1.8 u away. Hopping in inside the bay does not immediately drop you out. Cargo is never touched.
- Circle collision against the workshop bounds, AABBs (machine, conveyor, kiosk, decor, blade rack), and the candy's real radius around the contact angle (conservative). Velocity into a surface is removed, so movement slides.
- **Pickup**: intake 0.82 u in front of the cart with the upgraded radius, plus a 0.6 u sweep under the cart body. Pickup budget `6·√(cap/12)` U/s. Each pickup is one world → cargo transaction. A pile larger than the free capacity is split. `capacityReached` fires once per fill.
- **Unload**: the cart on the unload pad (left of the machine) and slower than 0.55 → FIFO transfer at `10·√(cap/12)` U/s into the 72 U hopper, in separate contract/layer batches. A full hopper stops the transfer without loss ("Machine full"); leaving the pad stops it immediately.

## 5. Production and sales

- The machine takes exactly 2 U of the head-of-queue contract to start a cycle (`2/rate` seconds). Looping inside the tick keeps results frame-rate independent. A tail under 2 U is only processed when no more raw of that contract exists upstream (partial product, proportional value). Float residue ≤ 0.02 U is recorded as `dustMass` in the ledger.
- The conveyor shows at most 12 products; beyond that a new product merges into the last one as a package (`count`, `mass`, `value` summed). Travel takes 1.4 s with a minimum gap. A product is removed from the belt and credited in the same transaction, so it sells exactly once. Products on the belt are saved.
- Presentation: a pie progress lollipop shows the production timer, the rollers spin, a blank → product → stick/wrapper grows at the outlet, the wrapper flaps open, the machine squashes as a product leaves, the kiosk shelf shows sold items for 0.9 s, and coins fly to the HUD with merged `+N` labels.

## 6. Contracts, economy, milestones

- Status flow: `active → sourceEmpty → settling → completed`. The bonus (500 / 1,500 / 3,000) is paid once per `ciid`, recorded on the instance and in `completedInstances`, and stays safe across reloads or manipulated status.
- New contracts start only from the button, or via "Auto-start next contract" (off by default, shown once the robot is owned). A chef/cart covered by the new candy is moved to a safe spot. Upgrades and automation carry over.
- After three contracts, the album allows replaying any flavor with a new instance id.
- **Milestones**: 7 points on the Remaining bar (2 / 9 / 20 / 35 / 50 / 70 / 90% carved) pay product value × 15/40/30/60/50/90/140 (coins or chests), exactly once per instance (bitmask `ContractInstance.milestones`, saved).
- Purchases are atomic: balance and level are re-read at transaction time, so a double tap never goes negative or grants a free level. **Autopilot (300)** and the **Carving Robot (800)** are coin-gated instead of contract-gated, because contracts are now long.

## 7. Automation

- **Autopilot**: states `idle → toRolls → collecting → toMachine → unloading → standby`. The target is the roll with the most mass around it (1.3 u radius) divided by distance; the cart then sweeps the nearest rolls within 2.6 u. It delivers at ≥ 80% capacity, when no settled rolls remain, or after waiting 6 s with a partial load; a partial load is delivered right away once the candy is empty, so a contract can never stall. Navigation: a visibility graph (a full ring of 12 waypoints around the candy + floor nodes) with Dijkstra, re-planned every 1.5 s or after 1.4 s stuck. No teleports. When the chef hops in, manual control takes over; when the chef hops out with the toggle ON, the AI resumes from `idle`.
- **Carving robot**: a sugar robot on a radial rail at −42° (upper right). It always stands at the largest surface radius at that angle + 0.33 u, carves 0.75 U/s, and has its own buffer and ribbon. Its rolls land on reachable floor near it.

## 8. Camera, layout, UI

- **Camera**: `PerspectiveCamera`, FOV 30°, pitch 54°, never orbits. The distance is set so ~7.4 world units span a portrait screen at the player (at least 10 u tall in landscape). It follows the chef (or the cart while driving) with look-ahead 0.28 × velocity (±1.2 u) and τ 0.16 s smoothing, clamped to the workshop. `setViewOffset` centers the followed point in the HUD-free area. The sun and shadow camera follow the target so shadows stay crisp.
- **Layout** (z runs down the screen): a 15 × 21 u workshop. The candy (radius 4.2) sits in the upper middle with open floor all around; the cart can circle it completely. The blade pad and rack are front-right of the candy; the BLADE upgrade pad sits just beyond them. The machine (unload pad on its left, funnel on that side) is lower right, with an L-shaped conveyor to the kiosk at the bottom middle. The P bay and CART pad are lower left, and the MACHINE pad is right of the machine. Decor only sits in corners and has colliders.
- **Prompts** are written under the chef (DOM at the chef's screen position). When the target (`arrowTarget`) is outside the visible area, a round coral arrow appears at the screen edge, rotated toward it.
- **Upgrade pads** (`StationSystem`) open only when the chef stops on one for ≥ 0.45 s (speed < 0.9 u/s), so walking across never pops a menu. The bottom sheet lists only that pad's group, and a 3D "!" floats over a pad when something there is affordable.
- **Info panel**: Remaining with one decimal, "Pieces value" (sale value of raw not yet sold: floor + cart + hopper + buffers), milestone icons on the bar, and the layer row.
- Desktop/landscape: a portrait play area (ratio 0.5, max 520 px) on a plain backdrop, using `100dvh` with a `100vh` fallback and `env(safe-area-inset-*)`.
- Input: one pointer joystick (pointer capture) that only starts on the world surface; UI buttons never move it. Input is zeroed on blur, tab hide, resize/orientation, modals, and `pointercancel`/`lostpointercapture`.
- The HUD only writes to the DOM when a value changes. The coin counter animates toward the authoritative balance (display only).

## 9. Audio

- `AudioManager`: master (0.8 headroom) → DynamicsCompressor → output, with separate SFX and music buses (squared volume curve). One reusable noise buffer. The carve, fizz, motor and cart loops are created once and only their gain/frequency change; carve gain follows the actual carve output (~30 ms ramp).
- Limits: 22 short voices, pickups 8/s, coins 4/s, unloads 6/s; a burst drops 12% volume per rapid repeat.
- Tab hidden → `AudioContext.suspend()`. Pause → music and loops off, UI sounds still play.
- Music: 16 bars (C–Am–F–G ×2, F–G–Em–Am, F–G–C–G), 96 BPM, sine marimba with partials, triangle bass, soft kick/hat, scheduled with a 200 ms lookahead. The pattern is deterministic, so the loop is seamless.

## 10. Persistence

- `localStorage` key `candy-spiral-save`, schema version 2, settings stored separately. Strict validation of structure and numbers (NaN → `null` → rejected). A corrupt or unknown-version save starts fresh with a toast; unavailable or full storage shows a toast and the game keeps running.
- v1 saves are migrated: the running contract's sector masses are multiplied by `CANDY.massScale`, and `initialRaw` grows by exactly the added mass (the ledger stays balanced). Old tray fields are ignored. New fields (blades, milestones, stations) get defaults.
- Transitional modes are normalized on load (boarding → driving, disembarking → exit spot). The id generator is set to `max(saved id) + 1`.
