# Candy Spiral — Tuning

All numbers live in `src/game/config.ts`. This file records the final values and why they differ from the brief's baseline.

## World and camera

| Parameter | Brief | Final | Why |
|---|---|---|---|
| Workshop | — | 15 × 21.3 u (x ±7.5, z −10.5…10.8) | Feedback: "make the area wider". The follow camera shows a slice at a time, so the world can be large without shrinking anything. |
| Candy radius / hub | 3.2 / 0.65 | **4.2 / 0.8** | Feedback: "a bigger spiral". The cart can now circle the whole candy. |
| Layer widths (outer→inner) | — | 0.60 / 0.64 / 0.70 / 0.72 / 0.74 | Different thicknesses so the five rings read apart. |
| Candy height | 0.65 | 0.70 → 0.86 (low dome) | Chunkier for the bigger disc; inner rings slightly taller. |
| Sectors per layer | 96–128 | 128 | Smooth enough for the larger circumference. |
| Character height | 0.9 | 0.9 × 1.2 scale | Chunky and readable. |
| Cart | 1.2 × 1.5 | 1.24 × 1.5, collider r 0.62 | — |
| Cart path | ≥ 1.8 | ≥ 3.3 on every side of the candy | Consequence of the bigger workshop. |
| Camera | ortho, 50–60° | perspective FOV 30°, pitch 54°, ~7.4 u across a portrait screen, follow τ 0.16 s, look-ahead 0.28 | Matches the reference's close follow camera. The chef is ~50 px tall on a 390 px screen. |
| Roll diameter | ≈ ⅓ chef height | ≈ 0.36 u | — |

## Candy hardness

| Parameter | Value | Notes |
|---|---|---|
| `CANDY.massScale` | **100** | Every layer holds 100× the brief's design mass. Rolls still come out at the blade's rate; only the disc lasts much longer. |
| Raw per contract | 8,000 / 16,000 / 24,000 U | Brief: 80 / 160 / 240 |
| Products per contract | 4,000 / 8,000 / 12,000 | Product prices unchanged (4 / 6 / 8) |
| Completion bonus | 500 / 1,500 / 3,000 | Brief: 25 / 50 / 100 (scaled so finishing a long contract still feels worth it) |

**Measured on the real candy** (`tests/pacing.test.ts`: headless bot, normal loop of carve → cart → unload → park → buy upgrades, 5 minutes of sim time, no debug coins): **97.6% remaining** after 5 minutes, 190 U carved, 81 products sold, 384 coins earned, 1 milestone, 13 blades broken, 9 upgrade levels bought. In the reference the wood reads 99.4% after about a minute of carving; this is the same order of "barely moves".

## Blades and stations

| Parameter | Value | Cost |
|---|---|---|
| Durability (pieces per blade) | **8** → 11 → 15 → 20 → 26 | 15 / 40 / 90 / 180. Level 1 was 12; feedback asked for a more fragile starting blade. |
| Blade Capacity (carried) | 1 → 2 → 3 → 4 | 40 / 100 / 200. Spares switch in automatically (0.25 s pause). |
| Precision (U per piece) | 1 → 1.25 → 1.5 → 1.75 → 2 | 30 / 70 / 140 / 250 |
| Sharpness (carve rate) | 2.0 → 2.6 → 3.3 → 4.1 → 5.0 U/s | 20 / 45 / 90 / 160 |
| DOUBLE CARVE | 8% per full piece, bite 1.6× wide | Does not wear the blade |
| Upgrade pad | opens after stopping 0.45 s (speed < 0.9 u/s) | Walking across never opens a menu |
| Hop in / out | wait 2.5 s next to the cart / stop in P for 0.35 s | Re-arms after walking 1.8 u away |

## Milestones

Paid once per contract instance when the Remaining bar passes them. Reward = product value × multiplier.

| Carved | 2% | 9% | 20% | 35% | 50% | 70% | 90% |
|---|---|---|---|---|---|---|---|
| Kind | coin | chest | coin | chest | coin | chest | chest |
| Multiplier | 15 | 40 | 30 | 60 | 50 | 90 | 140 |
| Contract 1 (×4) | 60 | 160 | 120 | 240 | 200 | 360 | 560 |

The first reward arrives after ~160 U carved (≈ 4 minutes of normal play). The 2% and 9% positions keep the icons from overlapping on a phone-width bar.

## Carving

| Parameter | Value | Notes |
|---|---|---|
| Blade width | 0.55 u, +12% at Sharpness level 2 and 4 | Throughput unchanged; footprint and looks only. |
| Blade reach | 0.34 u past the body (+0.08 slack) | — |
| Input hysteresis | start cos ≥ 0.38, keep cos ≥ 0.18, grace 0.12 s | Prevents flicker at the threshold. |
| Motor | `clamp(90·(sharpness+robot)/2, 90, 270)` °/s **+ supply floor** | Easing 0.4 s |
| Layer cleared | < max(0.025 U, 0.4% of layer mass) | Residue goes to a buffer, never lost. |
| Buffer flush | idle > 0.35 s and ≥ 0.04 U | — |

**Measured steady-hold output** (real candy, after 0.5 s of contact; carved U over 8 s of holding + 0.5 s release tail):

| Sharpness | Configured | Measured | Motor |
|---|---:|---:|---:|
| Lv 1 | 2.0 U/s | 1.82 | 90°/s |
| Lv 2 | 2.6 U/s | 2.24 | 117°/s |
| Lv 3 | 3.3 U/s | 2.78 | 149°/s |
| Lv 4 | 4.1 U/s | 3.09 | 184°/s |
| Lv 5 | 5.0 U/s | 3.72 | 225°/s |

Each upgrade is always felt (Lv1→Lv5 = 2× real output). The gap to the configured rate comes from the 8.5 s divisor, the walk back from the blade pad after a break (it counts as holding time; the walk to the pad does not), and contact settling. The upgrade sheet shows the blade's maximum throughput.

## Movement

| Parameter | Value |
|---|---|
| Walk | 2.7 u/s, accel τ 0.05 (≈0.15 s to full), stop τ 0.04 |
| Cart (levels 1–4) | 3.8 / 4.3 / 4.8 / 5.3 u/s, accel τ 0.05, stop τ 0.04 (≈0.12 s), turn τ 0.1 |
| Body radius | chef 0.28, cart 0.62 |
| Unload only below | 0.55 u/s |

## Cart, hopper, machine

| Parameter | Value |
|---|---|
| Cart capacity | 12 / 18 / 26 / 36 / 48 U (24 / 60 / 120 / 220) |
| Pickup radius | 0.85 / 1.05 / 1.25 / 1.45 u around the intake 0.82 u ahead, + 0.6 u body sweep (25 / 60 / 130) |
| Pickup rate | `6·√(cap/12)` U/s |
| Unload rate | `10·√(cap/12)` U/s |
| Hopper | 72 U |
| Machine | 2 / 3 / 4.5 / 6 U/s (30 / 70 / 150), 2 U per product |
| Conveyor | 1.4 s, max 12 visible products then packages |
| Max active rolls | 80 (aggregation), render cap 110 |
| Autopilot | 300 coins (no contract lock); delivers at ≥ 80%, when no rolls remain, or after 6 s with a partial load |
| Carving Robot | 800 coins (no contract lock), 0.75 U/s |

## Pacing on base-size contracts

These tests shrink a contract back to the brief's base mass (a real contract is too long for a unit test). They guard the loop itself:

| Scenario | Measured |
|---|---|
| Contract 1, fresh save, bot plays normally | first upgrade 22 s (paid by the 2% milestone), first sale 47 s, contract done 5.1 min |
| Contract 2 with autopilot, player only carves | ≈ 2.4 min |
| Contract 3 with no input at all (robot + autopilot) | ≈ 5.5 min (the idle loop finishes by itself) |

## Audio

| Parameter | Value |
|---|---|
| Default SFX / music | 65% / 18% (squared gain curve) |
| Max short voices | 22 |
| Rate limits | pickup 8/s, coin 4/s, unload 6/s, footstep every 0.42 u |
| Bursts | −12% volume per rapid repeat within 0.5 s |
| Carve loop | gain = min(1, real output/3) × 0.32, ~30 ms ramp |
| Music | 96 BPM, 16 bars ≈ 40 s |

## FX

| Event | Value |
|---|---|
| Carve chips | ~3 per U carved |
| Roll lands | 0.32 s arc, 0.2 s bounce, 20% squash |
| Pickup | flies into the bin in 0.24 s, suspension kick |
| Unload | flies into the funnel in 0.3 s, max 6/s |
| Blade breaks | 14 shards + a small ring pulse |
| Layer cleared | 0.5 s ring pulse + 12 sprinkles |
| Contract complete | 60 confetti, 0.8 s ring, 2 px / 0.12 s shake (off with reduced motion) |
| Coins | 0.42 s arc to the HUD, `+N` merged within 0.35 s |
| Max sprinkles / floaty labels | 170 / 10 |
| Haptics | 10 ms (bursts of pickups, bin full, blade break, milestones) |
| Auto quality | drops if the average frame > 28 ms for two 3 s windows; climbs back from low if < 17.5 ms for four windows |
