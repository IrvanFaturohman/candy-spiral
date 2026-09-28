import { BLADE, BONUS, COLLECT, MOVE, PEEL, WORLD } from '../config';
import { chooseLanding, hash01 } from '../scatter';
import type { SimContext } from '../context';
import { expSmooth } from '../context';
import {
  NUM_LAYERS,
  allocId,
  bladeDurability,
  hasBlade,
  helperRate,
  rollMassFor,
  layerRemaining,
  maxSurfaceRadiusInSpan,
  scraperRate,
  sectorAngle,
  sectorRadius,
  targetSpinRate,
  toolWidth,
  worldToLocalAngle,
  wrapAngle,
} from '../state';
import type { Collectible, ContractInstance, GameState, Peeler } from '../types';

export interface CarveResult {
  taken: number;
  sectors: number; // how many sectors contributed
}

/**
 * Take up to `budget` mass from the active layer inside the tool footprint.
 * The footprint is the arc of width `width` centred on `worldAngle`; only
 * sectors whose surface is still within reach (radius ≥ minReachRadius) count.
 * Mass is clamped per sector so nothing ever goes below zero.
 */
export function carveFootprint(
  c: ContractInstance,
  worldAngle: number,
  surfaceR: number,
  minReachRadius: number,
  width: number,
  budget: number,
): CarveResult {
  if (c.activeLayer >= NUM_LAYERS || budget <= 0) return { taken: 0, sectors: 0 };
  const layer = c.activeLayer;
  const masses = c.sectors[layer];
  const n = masses.length;
  const sa = sectorAngle();
  const halfAngle = width / 2 / Math.max(0.5, surfaceR);
  const local = worldToLocalAngle(c, worldAngle);
  const first = Math.floor((local - halfAngle) / sa);
  const last = Math.floor((local + halfAngle) / sa);
  const candidates: number[] = [];
  for (let k = first; k <= last; k++) {
    const idx = ((k % n) + n) % n;
    if (masses[idx] <= PEEL.sectorEps) continue;
    if (sectorRadius(c, layer, idx) < minReachRadius) continue;
    if (!candidates.includes(idx)) candidates.push(idx);
  }
  let remaining = budget;
  let taken = 0;
  const contributed = candidates.length;
  // Equal-share allocation with redistribution when a sector runs dry.
  for (let iter = 0; iter < 6 && remaining > 1e-12 && candidates.length > 0; iter++) {
    const share = remaining / candidates.length;
    for (let i = candidates.length - 1; i >= 0; i--) {
      const idx = candidates[i];
      let take = Math.min(share, masses[idx]);
      let left = masses[idx] - take;
      if (left <= PEEL.sectorEps) {
        take += left; // snap dust into this take; never create mass
        left = 0;
        candidates.splice(i, 1);
      }
      masses[idx] = left;
      remaining -= take;
      taken += take;
    }
  }
  return { taken, sectors: contributed };
}

function spawnRoll(ctx: SimContext, peeler: Peeler, mass: number, fromX: number, fromZ: number): void {
  const { state } = ctx;
  const buf = peeler.buffer!;
  const id = allocId(state);
  const angle = Math.atan2(fromZ - WORLD.source.z, fromX - WORLD.source.x);
  const spot = chooseLanding(angle, id, state.collectibles);
  const roll: Collectible = {
    id,
    ciid: buf.ciid,
    defId: buf.defId,
    layer: buf.layer,
    mass,
    x: spot.x,
    z: spot.z,
    y: 0,
    age: 0,
  };
  state.collectibles.push(roll);
  ctx.events.push({ type: 'rollSpawned', id: roll.id, peeler: peeler.id, fromX, fromZ, mass, layer: buf.layer, defId: buf.defId });
  aggregateRolls(state);
}

/** Keep active roll meshes bounded: merge the smallest roll into its nearest same-contract neighbour. Mass is preserved. */
export function aggregateRolls(state: GameState): void {
  while (state.collectibles.length > COLLECT.maxActiveRolls) {
    const rolls = state.collectibles;
    let small = -1;
    for (let i = 0; i < rolls.length; i++) if (small < 0 || rolls[i].mass < rolls[small].mass) small = i;
    const a = rolls[small];
    let near = -1;
    let nearD = Infinity;
    for (let i = 0; i < rolls.length; i++) {
      if (i === small || rolls[i].ciid !== a.ciid) continue;
      const d = (rolls[i].x - a.x) ** 2 + (rolls[i].z - a.z) ** 2;
      if (d < nearD) {
        nearD = d;
        near = i;
      }
    }
    if (near < 0) break; // nothing mergeable; never delete resources
    rolls[near].mass += a.mass;
    rolls.splice(small, 1);
  }
}

function contactPoint(worldAngle: number, r: number): { x: number; z: number } {
  return { x: WORLD.source.x + Math.cos(worldAngle) * r, z: WORLD.source.z + Math.sin(worldAngle) * r };
}

/** Add carved mass to a peeler's buffer and turn every whole unit into a roll. */
/** Add carved mass to a peeler's buffer and turn every full piece into a roll. Returns full pieces spawned. */
function feedBuffer(ctx: SimContext, peeler: Peeler, mass: number, layer: number, fromX: number, fromZ: number): number {
  const c = ctx.state.contract;
  const piece = rollMassFor(ctx.state, peeler.id);
  if (peeler.buffer && (peeler.buffer.layer !== layer || peeler.buffer.ciid !== c.ciid)) flushPeeler(ctx, peeler, fromX, fromZ, true);
  if (!peeler.buffer) peeler.buffer = { ciid: c.ciid, defId: c.defId, layer, mass: 0 };
  peeler.buffer.mass += mass;
  let spawned = 0;
  while (peeler.buffer.mass >= piece - 1e-9) {
    const m = Math.min(piece, peeler.buffer.mass);
    peeler.buffer.mass -= m;
    if (peeler.buffer.mass < 1e-9) peeler.buffer.mass = 0;
    spawnRoll(ctx, peeler, m, fromX, fromZ);
    spawned++;
  }
  return spawned;
}

/**
 * "DOUBLE CARVE!": the blade bites an extra piece out of the candy at the same
 * contact. The mass comes from real sectors (never created) and does not wear
 * the blade.
 */
function doubleCarve(ctx: SimContext, worldAngle: number, surfaceR: number, minReach: number, fromX: number, fromZ: number): void {
  const { state } = ctx;
  const c = state.contract;
  const layer = c.activeLayer;
  if (layer >= NUM_LAYERS) return;
  const piece = rollMassFor(state, 'player');
  const res = carveFootprint(c, worldAngle, surfaceR, minReach, toolWidth(state) * 1.6, piece);
  if (res.taken <= PEEL.minFlushMass) {
    // Hardly any material under the blade: keep it (no roll) in the buffer so nothing is lost.
    if (res.taken > 0) {
      const pp = state.peelers.player;
      if (pp.buffer && pp.buffer.layer === layer && pp.buffer.ciid === c.ciid) pp.buffer.mass += res.taken;
      else if (!pp.buffer) pp.buffer = { ciid: c.ciid, defId: c.defId, layer, mass: res.taken };
      else {
        flushPeeler(ctx, pp, fromX, fromZ, true);
        pp.buffer = { ciid: c.ciid, defId: c.defId, layer, mass: res.taken };
      }
      state.stats.carved += res.taken;
    }
    return;
  }
  state.stats.carved += res.taken;
  const bonus: Peeler = { id: 'player', buffer: { ciid: c.ciid, defId: c.defId, layer, mass: res.taken }, idleTime: 0, outputRate: 0, streak: 0 };
  spawnRoll(ctx, bonus, res.taken, fromX, fromZ);
  ctx.events.push({ type: 'doubleCarve', x: fromX, z: fromZ });
}

/** One full piece wore the blade; break it at zero and swap in a spare. */
function wearBlade(ctx: SimContext, pieces: number): void {
  const { state, events } = ctx;
  const p = state.player;
  for (let i = 0; i < pieces && p.blades > 0; i++) {
    p.bladeWear -= 1;
    if (p.bladeWear > 0) continue;
    p.blades -= 1;
    events.push({ type: 'bladeBroken', spares: p.blades });
    if (p.blades > 0) {
      p.bladeWear = bladeDurability(state);
      p.bladeSwap = BLADE.swapPause;
    } else {
      p.bladeWear = 0;
    }
  }
}

/** Turn any fractional buffer into a small roll. */
export function flushPeeler(ctx: SimContext, peeler: Peeler, fromX?: number, fromZ?: number, force = false): void {
  const buf = peeler.buffer;
  if (!buf) return;
  if (buf.mass <= 0) {
    peeler.buffer = null;
    return;
  }
  if (!force && buf.mass < PEEL.minFlushMass) return;
  const pt = fromX !== undefined && fromZ !== undefined ? { x: fromX, z: fromZ } : peelerContact(ctx.state, peeler.id);
  const m = buf.mass;
  spawnRoll(ctx, peeler, m, pt.x, pt.z);
  peeler.buffer = null;
}

export function peelerContact(state: GameState, id: 'player' | 'helper'): { x: number; z: number } {
  if (id === 'player') {
    const p = state.player;
    const a = Math.atan2(p.z - WORLD.source.z, p.x - WORLD.source.x);
    const d = Math.hypot(p.x - WORLD.source.x, p.z - WORLD.source.z);
    return contactPoint(a, Math.max(WORLD.source.hubRadius, d - MOVE.playerRadius));
  }
  const pos = helperPosition(state);
  const a = (WORLD.helperAngleDeg * Math.PI) / 180;
  const d = Math.hypot(pos.x - WORLD.source.x, pos.z - WORLD.source.z);
  return contactPoint(a, d - PEEL.helperStandoff);
}

/** Helper stands on its radial rail just outside the current surface. */
export function helperPosition(state: GameState): { x: number; z: number; surface: number } {
  const a = (WORLD.helperAngleDeg * Math.PI) / 180;
  const c = state.contract;
  const surface = maxSurfaceRadiusInSpan(c, a, 0.06);
  const d = surface + PEEL.helperStandoff;
  return { x: WORLD.source.x + Math.cos(a) * d, z: WORLD.source.z + Math.sin(a) * d, surface };
}

export interface PlayerContact {
  valid: boolean;
  worldAngle: number;
  surfaceR: number;
  dist: number;
}

/** Is the player pressing the blade into the candy this tick? */
export function evaluatePlayerContact(ctx: SimContext, wasCarving: boolean): PlayerContact {
  const { state, input } = ctx;
  const p = state.player;
  const c = state.contract;
  const dx = p.x - WORLD.source.x;
  const dz = p.z - WORLD.source.z;
  const dist = Math.hypot(dx, dz);
  const worldAngle = Math.atan2(dz, dx);
  const res: PlayerContact = { valid: false, worldAngle, surfaceR: 0, dist };
  if (c.activeLayer >= NUM_LAYERS || dist < 1e-4) return res;
  const surfaceR = maxSurfaceRadiusInSpan(c, worldAngle, Math.asin(Math.min(1, MOVE.playerRadius / Math.max(dist, MOVE.playerRadius))));
  res.surfaceR = surfaceR;
  const gap = dist - MOVE.playerRadius - surfaceR;
  if (gap > PEEL.reachSlack) return res;
  const tx = -dx / dist;
  const tz = -dz / dist;
  const facingDot = Math.cos(p.facing) * tx + Math.sin(p.facing) * tz;
  const inputDot = input.dirX * tx + input.dirZ * tz;
  const need = wasCarving ? PEEL.inputCosKeep : PEEL.inputCosStart;
  if (input.mag < 0.15) return res;
  if (!hasBlade(state)) return res;
  if (inputDot < need) return res;
  if (facingDot < PEEL.facingCos - (wasCarving ? 0.15 : 0)) return res;
  res.valid = true;
  return res;
}

export function updateSpin(state: GameState, dt: number): void {
  const c = state.contract;
  const target = targetSpinRate(state);
  c.spinRate += (target - c.spinRate) * expSmooth(dt, PEEL.spinEaseTime / 3);
  c.rotation = wrapAngle(c.rotation + c.spinRate * dt);
}

export function updatePeeling(ctx: SimContext, dt: number): void {
  const { state, events } = ctx;
  const c = state.contract;
  const p = state.player;
  const pp = state.peelers.player;
  const hp = state.peelers.helper;

  let playerTaken = 0;
  let helperTaken = 0;
  if (p.bladeSwap > 0) p.bladeSwap = Math.max(0, p.bladeSwap - dt);

  // --- Manual scraper (priority 1 in the tick) ---
  if (p.mode === 'onFoot' || p.mode === 'carving') {
    const wasCarving = p.mode === 'carving';
    const contact = evaluatePlayerContact(ctx, wasCarving);
    p.carveContact = contact.valid;
    if (contact.valid) {
      const minReach = contact.dist - MOVE.playerRadius - PEEL.reach;
      const res = carveFootprint(c, contact.worldAngle, contact.surfaceR, minReach, toolWidth(state), scraperRate(state) * dt);
      playerTaken = res.taken;
      if (!wasCarving) {
        const from = p.mode;
        p.mode = 'carving';
        p.modeTime = 0;
        events.push({ type: 'modeChanged', from, to: 'carving' });
        events.push({ type: 'carveStart' });
      }
    }
    if (playerTaken > 0) {
      const layer = c.activeLayer;
      const pt = contactPoint(contact.worldAngle, contact.surfaceR);
      const firstId = state.nextId;
      const pieces = feedBuffer(ctx, pp, playerTaken, layer, pt.x, pt.z);
      state.stats.carved += playerTaken;
      events.push({ type: 'rawCarved', peeler: 'player', mass: playerTaken, x: pt.x, z: pt.z, layer, defId: c.defId });
      for (let i = 0; i < pieces; i++) {
        // Deterministic luck from the piece id, so replays and tests are stable.
        if (hash01((firstId + i) * 31 + 7) < BONUS.doubleCarveChance && c.activeLayer === layer) {
          doubleCarve(ctx, contact.worldAngle, contact.surfaceR, contact.dist - MOVE.playerRadius - PEEL.reach, pt.x, pt.z);
        }
      }
      if (pieces > 0) wearBlade(ctx, pieces);
    }
    if (p.mode === 'carving' && !contact.valid) {
      p.modeTime += dt;
      if (p.modeTime > PEEL.carveGraceTime) {
        p.mode = 'onFoot';
        p.modeTime = 0;
        events.push({ type: 'modeChanged', from: 'carving', to: 'onFoot' });
        events.push({ type: 'carveStop' });
      }
    } else if (contact.valid) {
      p.modeTime = 0;
    }
  } else {
    p.carveContact = false;
  }

  // --- Helper robot (priority 2 in the same tick; shares the same sector data) ---
  const hRate = helperRate(state);
  if (hRate > 0 && c.activeLayer < NUM_LAYERS) {
    const hpos = helperPosition(state);
    const a = (WORLD.helperAngleDeg * Math.PI) / 180;
    const dist = Math.hypot(hpos.x - WORLD.source.x, hpos.z - WORLD.source.z);
    const minReach = dist - PEEL.helperStandoff - PEEL.reach;
    const res = carveFootprint(c, a, hpos.surface, minReach, PEEL.helperToolWidth, hRate * dt);
    helperTaken = res.taken;
    if (helperTaken > 0) {
      const layer = c.activeLayer;
      const pt = contactPoint(a, hpos.surface);
      feedBuffer(ctx, hp, helperTaken, layer, pt.x, pt.z);
      state.stats.carved += helperTaken;
      events.push({ type: 'rawCarved', peeler: 'helper', mass: helperTaken, x: pt.x, z: pt.z, layer, defId: c.defId });
    }
  }

  // --- Buffers: flush fractional mass after the tool leaves the surface ---
  for (const [peeler, took] of [
    [pp, playerTaken],
    [hp, helperTaken],
  ] as const) {
    const rate = dt > 0 ? took / dt : 0;
    peeler.outputRate += (rate - peeler.outputRate) * expSmooth(dt, 0.08);
    if (took > 0) {
      peeler.idleTime = 0;
      peeler.streak += dt;
    } else {
      peeler.idleTime += dt;
      if (peeler.idleTime > 0.25) peeler.streak = 0;
      if (peeler.idleTime > PEEL.flushAfterIdle && peeler.buffer && peeler.buffer.mass >= PEEL.minFlushMass) flushPeeler(ctx, peeler);
    }
  }

  // --- Layer completion ---
  checkLayerCompletion(ctx, playerTaken >= helperTaken ? pp : hp);
}

export function checkLayerCompletion(ctx: SimContext, lastPeeler: Peeler): void {
  const { state, events } = ctx;
  const c = state.contract;
  while (c.activeLayer < NUM_LAYERS) {
    const L = c.activeLayer;
    const layerMass = c.initialSectorMass[L] * WORLD.source.sectors;
    const eps = Math.max(PEEL.layerEpsAbs, PEEL.layerEpsFraction * layerMass);
    const rem = layerRemaining(c, L);
    if (rem > eps) break;
    // Retire the residue into the peeler that finished it, so every unit is accounted for.
    const masses = c.sectors[L];
    for (let i = 0; i < masses.length; i++) masses[i] = 0;
    const pt = peelerContact(state, lastPeeler.id);
    if (rem > 0) {
      if (lastPeeler.buffer && (lastPeeler.buffer.layer !== L || lastPeeler.buffer.ciid !== c.ciid)) flushPeeler(ctx, lastPeeler, pt.x, pt.z, true);
      if (!lastPeeler.buffer) lastPeeler.buffer = { ciid: c.ciid, defId: c.defId, layer: L, mass: 0 };
      lastPeeler.buffer.mass += rem;
    }
    // Flush every buffer of the finished layer so rolls keep a single colour.
    for (const pr of [state.peelers.player, state.peelers.helper]) {
      if (pr.buffer && pr.buffer.layer === L) {
        const cp = peelerContact(state, pr.id);
        flushPeeler(ctx, pr, cp.x, cp.z, true);
      }
    }
    c.activeLayer = L + 1;
    events.push({ type: 'layerCleared', layer: L, defId: c.defId, nextLayer: c.activeLayer });
    if (c.activeLayer >= NUM_LAYERS) {
      c.status = 'sourceEmpty';
      events.push({ type: 'sourceEmptied', defId: c.defId });
    }
  }
}

/** Flush all peeler buffers (used when the source is empty, or before contract changes). */
export function flushAllPeelers(ctx: SimContext): void {
  for (const pr of [ctx.state.peelers.player, ctx.state.peelers.helper]) {
    if (pr.buffer && pr.buffer.mass > 0) flushPeeler(ctx, pr, undefined, undefined, true);
    else pr.buffer = null;
  }
}
