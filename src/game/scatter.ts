import { COLLECT, MOVE, WORLD } from './config';
import type { Collectible } from './types';

// Rolls are tossed loosely onto the floor around the candy. Landing spots come
// from a precomputed grid of floor points that are (a) outside the candy's
// *full* footprint, walls and obstacles, and (b) reachable by the cart's drum
// or body. That keeps every roll collectable, so a contract can never stall on
// a roll behind the candy or wedged against a wall.

export interface Spot {
  x: number;
  z: number;
}

let grid: Spot[] | null = null;

/** Static free check against walls, the full-size candy and obstacles. */
function staticFree(x: number, z: number, r: number): boolean {
  const b = WORLD.bounds;
  if (x < b.minX + r || x > b.maxX - r || z < b.minZ + r || z > b.maxZ - r) return false;
  if (Math.hypot(x - WORLD.source.x, z - WORLD.source.z) < WORLD.source.platterRadius + r) return false;
  for (const o of WORLD.obstacles) {
    const cx = Math.max(o.x - o.hw, Math.min(x, o.x + o.hw));
    const cz = Math.max(o.z - o.hd, Math.min(z, o.z + o.hd));
    if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
  }
  return true;
}

function cartCanReach(x: number, z: number): boolean {
  // Some free cart position within ~0.9 u puts the drum (0.82 ahead, 0.85 radius) over the roll.
  for (const d of [0, 0.45, 0.9]) {
    const steps = d === 0 ? 1 : 12;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      if (staticFree(x + Math.cos(a) * d, z + Math.sin(a) * d, MOVE.cartRadius + 0.03)) return true;
    }
  }
  return false;
}

function inZone(x: number, z: number, zone: { x: number; z: number; hw: number; hd: number }, pad: number): boolean {
  return Math.abs(x - zone.x) <= zone.hw + pad && Math.abs(z - zone.z) <= zone.hd + pad;
}

/** All valid landing spots (computed once). */
export function landingGrid(): Spot[] {
  if (grid) return grid;
  const out: Spot[] = [];
  const b = WORLD.bounds;
  const step = COLLECT.gridStep;
  for (let x = b.minX + 0.25; x <= b.maxX - 0.25; x += step) {
    for (let z = b.minZ + 0.25; z <= b.maxZ - 0.25; z += step) {
      if (!staticFree(x, z, COLLECT.rollRadius)) continue;
      // Keep the unload pad, parking bay and walk-on stations clear of rolls.
      if (inZone(x, z, WORLD.unloadZone, 0.1) || inZone(x, z, WORLD.parkBay, 0.1)) continue;
      if (Math.hypot(x - WORLD.bladePad.x, z - WORLD.bladePad.z) < WORLD.bladePad.r + 0.2) continue;
      if (WORLD.upgradePads.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 0.2)) continue;
      if (!cartCanReach(x, z)) continue;
      out.push({ x, z });
    }
  }
  grid = out;
  return out;
}

export function hash01(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 2246822507) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

/**
 * Where a new roll lands: tossed outward past the candy and a little along the
 * spin direction (away from the peeler), snapped to the nearest valid floor
 * spot that is not already crowded.
 */
export function chooseLanding(worldAngle: number, id: number, rolls: readonly Collectible[]): Spot {
  const g = landingGrid();
  const n = { x: Math.cos(worldAngle), z: Math.sin(worldAngle) };
  const s = { x: -Math.sin(worldAngle), z: Math.cos(worldAngle) };
  const out = WORLD.source.platterRadius + COLLECT.tossOutMin + (COLLECT.tossOutMax - COLLECT.tossOutMin) * hash01(id);
  const side = COLLECT.tossSideMin + (COLLECT.tossSideMax - COLLECT.tossSideMin) * hash01(id * 7 + 3);
  const want = {
    x: WORLD.source.x + n.x * out + s.x * side,
    z: WORLD.source.z + n.z * out + s.z * side,
  };
  const cr2 = COLLECT.crowdRadius * COLLECT.crowdRadius;
  let best: Spot = g[0];
  let bestScore = Infinity;
  for (const p of g) {
    const d = Math.hypot(p.x - want.x, p.z - want.z);
    if (d > bestScore) continue; // cannot beat the current best even without crowding
    let crowd = 0;
    for (const r of rolls) if ((r.x - p.x) ** 2 + (r.z - p.z) ** 2 < cr2) crowd += 1;
    const score = d + crowd * 0.45;
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  // Tiny deterministic jitter so the floor looks scattered, not gridded.
  const jx = (hash01(id * 13 + 1) - 0.5) * COLLECT.gridStep * 0.8;
  const jz = (hash01(id * 17 + 5) - 0.5) * COLLECT.gridStep * 0.8;
  return { x: best.x + jx, z: best.z + jz };
}
