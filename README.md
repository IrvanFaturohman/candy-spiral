# Candy Spiral

A **3D idle-arcade prototype for portrait mobile** that also plays with a keyboard on desktop. You are a tiny chef in a candy workshop: carve a giant, very hard spinning candy roll with a blade, haul the loose curls with the **Candy Cart**, drop them at the lollipop machine, and let the kiosk sell the products. Buy upgrades at walk-on pads, unlock the cart autopilot and a carving robot, and finish three flavor contracts.

**▶ Play it: https://irvanfaturohman.github.io/candy-spiral/** (best on a phone in portrait; works with WASD on desktop)

All visuals (meshes + canvas textures) and audio (Web Audio) are procedural. There are no paid assets, API keys, accounts, ads or external services. Once the build is loaded, the game runs fully offline in the browser.

## Running

Requires Node.js 20+ (tested with Node 25).

```bash
npm install
npm run dev -- --host 0.0.0.0      # dev server (http://localhost:5173)
npm run build                      # typecheck + production build into dist/
npm run preview -- --host 0.0.0.0  # serve the production build (http://localhost:4173)
npm run test                       # logic tests (Vitest)
```

`--host 0.0.0.0` lets you open the game from a phone on the same network (`http://<computer-ip>:5173`).

`npm run deploy` runs the tests, builds, and publishes `dist/` to the `gh-pages` branch, which GitHub Pages serves (`scripts/deploy-pages.sh`).

## Controls

| Action | Mobile / touch | Desktop |
|---|---|---|
| Move / steer the cart | Drag on the world → floating joystick | WASD / arrow keys, or drag with the mouse |
| Grab blades | Step on the **yellow blade pad** near the candy (refills up to your blade capacity) | same |
| Carve | Hold the joystick **toward the candy** while standing at its edge (needs a blade) | same |
| Hop in the cart | **Stand next to the cart for ~2.5 s**; the ring around it fills, then the chef hops in | same |
| Hop out | **Drive the cart back into the P bay** and stop; the chef hops out | same |
| Upgrades | **Stop on an arrow pad**: BLADE (near the candy), CART (near P), MACHINE (right of the machine). A floating **!** means something is affordable. | same |
| Autopilot on/off | **Auto** pill, bottom left (after buying it) | Click |
| Pause & settings | Pause button (top right) | **Esc** (also closes the top panel) |
| Debug panel | `?debug=1` in the URL | **F2** |

There are no on-screen action buttons. Prompts appear under the chef, and a red arrow at the screen edge points at the current target when it is off camera.

## How it plays

1. Grab a blade at the yellow pad by the candy.
2. Walk to the candy's edge and hold toward it. The layer is carved exactly where the blade touches, a ribbon curls off and snaps into small rolls that land **loose on the floor**. Sometimes you get a **DOUBLE CARVE!** The candy is extremely hard: the "Remaining" readout barely moves, just like the reference.
3. Blades wear out: every piece costs one point of durability (8 at level 1). When a blade breaks, grab a new one (spares switch in automatically once you upgrade Blade Capacity).
4. Wait by the **Candy Cart** until the chef hops in, drive over the rolls (the drum and the cart body sweep them up), then stop on the striped pad on the **left side of the machine**. The load goes into the hopper, becomes lollipops on the conveyor, and sells at the kiosk.
5. Drive back into the **P** bay to hop out, then stop on an upgrade pad to spend coins.
6. **Milestone** rewards (coins and chests) pay out as the Remaining bar passes their icons. **Cart Autopilot** (CART pad) and the **Carving Robot** (MACHINE pad) are bought with coins.
7. Carve all five layers and sell everything to finish a contract. After three contracts the candy album lets you replay any flavor; upgrades stay.

## Features

- Sector-based annular carving model (5 layers × 128 sectors). Mass, mesh, collision, progress and production all read the same data.
- Typed physical resources: blade buffer → rolls on the floor → cart → FIFO hopper → products on the conveyor → sold, with a tested ledger invariant.
- Three contracts (Strawberry Swirl, Citrus Twist, Berry Carnival) with different colors, product shapes and prices.
- Ten upgrades on three station pads (Blade: Sharpness, Precision, Durability, Blade Capacity; Cart: Cart Bin, Sweeper Drum, Cart Engine, Autopilot; Machine: Lollipop Machine, Carving Robot) that change the simulation *and* the visuals.
- Perspective follow camera (close, like the reference) with an edge arrow for off-screen targets.
- The autopilot drives the same cart (waypoint + visibility-graph navigation), and the robot shares sectors with the chef without double-counting mass.
- Action-based tutorial that can be skipped, with an in-world arrow.
- Local saves (localStorage, schema version, validation, autosave every ~5 s, save on tab hide/pagehide), pause, and reset with confirmation.
- Synthesized audio: 23 SFX, carve/motor/cart loops that follow simulation values, generative 96 BPM music (40 s loop), separate SFX/music buses and a compressor.
- Reduced motion, optional vibration, auto/low/normal/high quality, handling for missing WebGL and lost contexts.

## Project layout

```text
src/
  main.ts                 bootstrap + WebGL check
  game/                   headless simulation (no DOM/Three) + orchestrator
    config.ts             all tuning numbers, palette, contracts, upgrades, text
    types.ts / state.ts   authoritative state, ledger, candy geometry helpers
    Simulation.ts         fixed 60 Hz tick, system order
    systems/              Peeling, Movement, Collection, Production, Contract,
                          Economy, Automation (autopilot), Station, Tutorial
    collision.ts, nav.ts  circle/AABB collision, autopilot pathfinding
    scatter.ts            where loose rolls may land (always cart-reachable)
    Game.ts               loop, interpolation, events → audio/UI, save, quality
  world/                  3D objects: CandyRoll, Character, CandyCart, FactoryMachine,
                          Conveyor, Kiosk, HelperBot, World (scene/camera/stations)
  visuals/                ribbon, instanced rolls, products, effects, textures, materials, merging
  audio/AudioManager.ts   SFX + loops + generative music
  input/InputSystem.ts    pointer joystick + keyboard
  persistence/            save/load + validation + v1→v2 migration
  ui/                     HUD, UpgradePanel, SettingsPanel, modals, debug
tests/                    simulation, mechanics and pacing tests + a headless player bot
```

More docs: [DESIGN.md](DESIGN.md) (implementation decisions), [TUNING.md](TUNING.md) (final numbers and why they changed), [QA.md](QA.md) (what was actually verified).

## Known limits

- Not tested on a physical phone. Viewport checks used headless Chrome emulation with a software renderer (SwiftShader), so the FPS measured there says nothing about real devices.
- Audio was only verified to run without errors; nobody has listened to the mix on speakers or headphones.
- No offline income (per the brief): automation only runs while the tab is active.
- One workshop, one cart, one robot. No prestige, shop, ads or accounts.
- The candy is deliberately extremely hard (100× the brief's base mass), so a full contract is a long session. `CANDY.massScale` in `config.ts` tunes this with one number.
