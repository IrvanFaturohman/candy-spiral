# Candy Spiral — QA Report

This report only records what was actually run. The "Not verified" section matters as much as the rest.

The prototype went through four rounds. Sections 1–3 describe the current build (round 4). The history at the end records what was checked in earlier rounds; those numbers came from older builds and older tuning.

## Environment

- macOS (Darwin 25.6), Node 25.9, npm 11.12.
- Browser: local Google Chrome, **headless**, driven by `puppeteer-core`. The QA scripts live outside the project and are not a dependency. WebGL runs on **SwiftShader (a software renderer)**, so measured FPS says nothing about devices.
- Mobile viewports are emulated (`isMobile`, DPR 2). The joystick is driven with **mouse pointer events** (drag), not a real finger.
- No physical phone was used.

## 1. Build and tests (current build)

| Command | Result |
|---|---|
| `npm run build` (tsc `--noEmit` + vite build) | ✅ passes with no type errors. JS 770 kB (gzip 207 kB), mostly Three.js. |
| `npm run test` | ✅ **39/39** pass |
| `npm run preview -- --host 0.0.0.0` | ✅ used for the browser playtest below |
| `npm run dev -- --host 0.0.0.0` | ✅ binds to Local + Network |

The Vitest suite checks logic risks, not getters:

- **Carving**: two carvers on the last sector never take it below zero; only sectors inside the footprint lose mass; holding into the candy makes rolls, not coins; releasing stops carving; a higher Sharpness level gives more real output.
- **Cart and hopper**: partial pickup (pile > free capacity); a full hopper stops unloading without loss; leaving the pad stops the transfer; hopping in/out never touches cargo.
- **Economy**: each product costs 2 U and sells exactly once; the economy gives the same result at dt 1/120 and 1/30; a double tap on a purchase never goes negative or grants a free level; coin-gated unlocks (Autopilot at 299 coins fails, at 300 succeeds, no double charge).
- **Save/load**: a roundtrip keeps damaged sectors, typed cargo, partial production and unsold products; corrupt, NaN and unknown-version saves are rejected without a crash; the bonus is not paid again after a reload or a manipulated status; a v1 save migrates to the harder candy with the ledger still balanced (< 1e-9).
- **Contracts and automation**: a contract completes only after all raw is processed and sold; the autopilot hauls a small tail; the robot and the chef carving together stay mass-conservative; replay gives a new instance id with the bonus once per instance; "Auto-start next contract" is off by default and needs the robot.
- **No-button boarding**: not boarded after 1.9 s by the cart, boarded by 2.9 s; walking past does not board; stopping outside P keeps you driving; the P bay drops you off without an instant re-board.
- **Loose rolls**: every landing point is outside the candy, clear of obstacles and pads, and cart-reachable; carving from 6 sides (including behind) scatters rolls > 2 u apart and the cart collects **all** of them (0 left, ledger 0).
- **Blades and stations**: no blade → no carving; the pad refills to capacity; a blade breaks after its durability in full pieces and spares swap in; Precision makes bigger pieces with mass conserved; DOUBLE CARVE happens and only moves real candy mass (source loss = floor + buffer, ±1e-6); upgrade pads do not open when walked across; milestones pay once per instance, also across a reload.
- **Pacing** (numbers in [TUNING.md](TUNING.md)): steady-hold output rises at every level; a full contract 1 on a fresh save with no debug coins (base-size candy); contract 2 with autopilot; contract 3 with **no input at all** (robot + autopilot) still finishes; the chef/cart are moved out when a new candy drops; **5 minutes of normal play on the real candy leaves 97.6% remaining** while rolls, sales, upgrades and a milestone keep coming.

The ledger (`source + buffers + world + cart + hopper/production + conveyor + sold + dust = initial total`) is checked by the bot every tick. Max drift ≤ 1e-6 in tests.

## 2. Browser playtest (current build, production preview, 390 × 844)

Fresh save, 1× speed, no debug coins. Driven by `play11.mjs` and `tour4.mjs`.

| Step | Observed |
|---|---|
| Start | `blades 0`, Remaining **100.0%**, prompt "Swipe to move" |
| Blade pad | blades 0 → 1 at durability **8/8**, prompt "Hold to carve" |
| Carve until the blade breaks | exactly **8 U** carved (8 pieces), blade gone, Remaining **99.9%**, "Grab a blade!" pill, prompt "Wait next to the Candy Cart", edge arrow toward the cart |
| Board | waited next to the cart → hopped in automatically |
| Collect | the cart swept the loose rolls on the floor |
| Unload | on the pad left of the machine → lollipops on the conveyor → sold, **16 coins** |
| Drive behind the candy | the cart circles the whole candy (screenshot 07) |
| Park | stopped in P → hopped out, prompt "Upgrade your blades!" |
| BLADE pad | stopping opens **"Blade Upgrades"** with exactly 4 rows: Sharpness 2 → 2.6 U/s (20), Precision 1 → 1.25 U/piece (30), Durability 8 → 11 pieces (15), Blade Capacity 1 → 2 blades (40) |
| Settings | opens, all English |
| Console | **0 page errors, 0 console errors** |
| Rendering | 75 draw calls, 51.5k triangles |

All visible game text checked in these runs is English (HUD, prompts, toasts, sheets, settings, start overlay). Numbers use `en-US` formatting (dot decimals).

## 3. Issues found and fixed in round 4

| Issue | Fix |
|---|---|
| Tests used hard-coded positions that are now inside the bigger candy | Tests use `FRONT`/`AWAY` helpers derived from `WORLD` |
| A real contract (8,000 U) is too long for unit tests | Contract tests call `shrinkContract` to go back to base mass; a separate test covers the real size |
| Milestone icons overlapped at the right end of the bar on a phone (2 / 5 / 10%) | 7 milestones with smaller icons; first two at 2% and 9% |
| With 3% as the first milestone, 5 minutes of play earned no milestone at all | First milestone moved to 2% (reached at ~160 U) |
| Autopilot/Robot were locked behind contracts 2/3, which now take hours | Coin-gated (300 / 800) |

## Not verified (honestly)

- **A real phone and real touch**: multi-touch, notch safe areas, mobile GPU performance and vibration (`navigator.vibrate`). The code uses the same Pointer Events, but it was never tried with `pointerType: touch`.
- **Feel of the new tuning for a human**: whether 100× hardness is fun rather than grindy, whether 8 pieces per blade sends you to the pad too often, and whether the follow camera is too close or causes motion sickness. Each is one number in `config.ts` (`CANDY.massScale`, `UPGRADES.durability.values`, `CAMERA`).
- **A full real-size contract** was never played to the end, in the browser or in tests (it would take hours). Completion is verified on base-size contracts; the real size is only verified for the first 5 minutes.
- **Later milestones and chests** on the real candy were not seen in the browser (the first one needs ~160 U carved). Their payout logic is unit-tested.
- **Audio quality** was never heard by a person. Only verified: every SFX, loop and the music run without errors, suspend/resume works, volumes are saved.
- **Device FPS** and auto-quality on slow devices (only the logic exists).
- **WebGL context lost/restored** was never triggered. The handler exists (save + toast).
- The contract-3 album and replay flow was not clicked through in this round (logic unit-tested; the album was checked in round 1).

## History (earlier builds)

These checks ran on earlier builds with smaller, softer candy and older prices. The mechanics they cover still exist and are still unit-tested.

**Round 1 (original brief).**
- A full manual contract 1 in the browser: 40 products sold, bonus +25, correct balance.
- Contract 2 with the autopilot and contract 3 with the robot, bought from normal income.
- Mid-pipeline save/load: byte-identical state snapshots before and after reload with the game paused.
- A full cart ignores rolls.
- Leaving the unload pad stops the transfer.
- Robustness:
  - `pointercancel` zeroes input.
  - A hidden tab saves, suspends audio and advances the sim by 0 s.
  - Pause advances by 0 s.
  - Settings persist.
  - Corrupt save, unknown version and QuotaExceeded all show toasts.
  - With WebGL disabled, the fallback screen shows with 0 page errors.
  - Keyboard works on desktop.
- 80-roll stress test: aggregation held at exactly 80 rolls, ledger 0.
- Viewports: 360 × 640, 390 × 844, 430 × 932, 1440 × 900. Every visible button is ≥ 48 px, or its touch area is extended to 48 px.
- Fixed in that round:
  - Non-finite AudioParam from a negative modulo.
  - `PCFSoftShadowMap` was removed in r186.
  - Ribbon clipping through the chef.
  - The motor supply floor.
  - An early upgrade prompt.
  - The missing roll-landing sound.
  - The contract offer after loading a completed save.
  - Draw calls 186 → 112.
  - The sim advancing while the tab was hidden.
  - Rolls stuck under the cart body.
  - Button sizes.

**Round 2 (loose rolls, no board buttons, harder candy).**
- Trays removed.
- Boarding by waiting, and hop-out at P, both verified in the browser: the coral ring fills, and the chef stays out 3 s after hopping out.
- Candy 3× harder.
- v1 → v2 save migration.
- Fixed: the upgrade sheet's backdrop swallowed the first tap during its 220 ms close animation.

**Round 3 (matching the reference video).**
- Blades and the blade pad.
- Blade breakage with spares.
- Precision.
- DOUBLE CARVE.
- Upgrade pads.
- Milestones across a reload.
- Follow camera with the edge arrow.
- Unload pad moved left of the machine so the funnel no longer hides the cart.
- Fixed:
  - An upgrade pad on the starting path opened mid-walk; pads now need a 0.45 s stop.
  - The prompt rendered in the top-left corner; the animation moved to an inner element.

## Screenshots

Real gameplay from the production build (390 × 844 @2x unless noted), retaken in round 4, in `screenshots/`:

- `00-title.png`: start overlay
- `01-blade-pad.png`: chef on the blade pad (8/8), BLADE upgrade pad nearby
- `02-carving.png`: carving with the close camera, prompt under the chef, ribbon curling off
- `03-blade-broken.png`: blade broken after 8 pieces, Remaining 99.9%, loose rolls, "Grab a blade!" pill, edge arrow toward the cart
- `04-waiting-to-board.png`: standing next to the cart, the hop-in ring filling
- `05-cart-collecting.png`: the cart sweeping rolls off the floor
- `06-unload-producing.png`: unloading on the left of the machine, lollipops on the conveyor
- `07-behind-the-candy.png`: the cart driving behind the candy (the whole disc is drivable around)
- `08-upgrade-pad.png`: stopping on the BLADE pad opens "Blade Upgrades"
- `09-desktop-1440.png`: desktop 1440 × 900, portrait play area centered
