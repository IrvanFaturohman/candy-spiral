import { CANDY, CONTRACTS, PEEL, UPGRADES, WORLD, SAVE, type UpgradeId, TUTORIAL_STEPS, type TutorialStepId } from './config';
import type { ContractInstance, GameState, Ledger, Peeler } from './types';

export const NUM_LAYERS = 5;

export interface LayerRadii {
  outer: number;
  inner: number;
}

let cachedRadii: LayerRadii[] | null = null;

/** Outer/inner radius of each annulus, outer → inner. */
export function layerRadii(): LayerRadii[] {
  if (cachedRadii) return cachedRadii;
  const out: LayerRadii[] = [];
  let r = WORLD.source.radius;
  for (let i = 0; i < NUM_LAYERS; i++) {
    const w = WORLD.source.layerWidths[i];
    out.push({ outer: r, inner: r - w });
    r -= w;
  }
  cachedRadii = out;
  return out;
}

export function allocId(state: GameState): number {
  return state.nextId++;
}

export function upgradeValue(state: GameState, id: UpgradeId): number {
  const def = UPGRADES[id];
  const lvl = Math.max(0, Math.min(def.values.length - 1, state.upgrades[id] | 0));
  return def.values[lvl];
}

export function scraperRate(state: GameState): number {
  return upgradeValue(state, 'scraper');
}

/** Pieces a fresh blade can cut before it breaks. */
export function bladeDurability(state: GameState): number {
  return upgradeValue(state, 'durability');
}

/** Blades the chef can carry at once. */
export function bladeCapacity(state: GameState): number {
  return upgradeValue(state, 'bladeCap');
}

/** Mass of one full piece for a peeler (Precision makes the chef's pieces longer). */
export function rollMassFor(state: GameState, peeler: 'player' | 'helper'): number {
  return peeler === 'player' ? upgradeValue(state, 'precision') * PEEL.rollMass : PEEL.rollMass;
}

export function hasBlade(state: GameState): boolean {
  return state.player.blades > 0 && state.player.bladeSwap <= 0;
}

export function helperRate(state: GameState): number {
  return upgradeValue(state, 'helper');
}

export function cartCapacity(state: GameState): number {
  return upgradeValue(state, 'capacity');
}

export function cartSpeed(state: GameState): number {
  return upgradeValue(state, 'cartSpeed');
}

export function pickupRadius(state: GameState): number {
  return upgradeValue(state, 'intake');
}

export function machineRate(state: GameState): number {
  return upgradeValue(state, 'machine');
}

export function pickupRate(state: GameState): number {
  return 6 * Math.sqrt(cartCapacity(state) / 12);
}

export function unloadRate(state: GameState): number {
  return 10 * Math.sqrt(cartCapacity(state) / 12);
}

export function toolWidth(state: GameState): number {
  const lvl = state.upgrades.scraper | 0;
  const steps = (lvl >= 1 ? 1 : 0) + (lvl >= 3 ? 1 : 0); // visually wider at level 2 and 4 (index 1 and 3)
  return PEEL.toolWidth * (1 + PEEL.toolWidthBonusPerStep * steps);
}

/**
 * Target motor speed in rad/s. Derived only from configured rates and the
 * candy's own state (never from momentary input), so releasing the stick
 * never jerks the motor:
 *  - brief baseline: clamp(90 × (scraper + helper) / 2, 90, 270) °/s
 *  - supply floor: as the active layer thins, spin just fast enough that the
 *    material rotating past the blade can still feed the configured rate.
 * Rotation only moves material to the blade; it never multiplies output.
 */
export function targetSpinRate(state: GameState): number {
  const demand = scraperRate(state) + helperRate(state);
  let deg = (PEEL.baseSpinDeg * demand) / 2;
  const c = state.contract as ContractInstance | undefined;
  if (c && c.activeLayer < NUM_LAYERS) {
    const rem = layerRemaining(c, c.activeLayer);
    const needRad = (demand * Math.PI * 2 * PEEL.supplyMargin) / Math.max(rem, 0.05);
    deg = Math.max(deg, (needRad * 180) / Math.PI);
  }
  deg = Math.min(PEEL.maxSpinDeg, Math.max(PEEL.minSpinDeg, deg));
  return (deg * Math.PI) / 180;
}

/** Design mass of one layer after the durability scale. */
export function layerMass(defId: number, layer: number): number {
  return CONTRACTS[defId].layerMasses[layer] * CANDY.massScale;
}

export function contractRawTotal(defId: number): number {
  let t = 0;
  for (let l = 0; l < NUM_LAYERS; l++) t += layerMass(defId, l);
  return t;
}

export function createContractInstance(state: GameState, defId: number): ContractInstance {
  const n = WORLD.source.sectors;
  const sectors: number[][] = [];
  const initialSectorMass: number[] = [];
  for (let l = 0; l < NUM_LAYERS; l++) {
    const per = layerMass(defId, l) / n;
    initialSectorMass.push(per);
    sectors.push(new Array(n).fill(per));
  }
  const initialRaw = contractRawTotal(defId);
  return {
    ciid: allocId(state),
    defId,
    status: 'active',
    activeLayer: 0,
    sectors,
    initialSectorMass,
    initialRaw,
    rotation: 0,
    spinRate: targetSpinRate(state),
    soldCount: 0,
    soldMass: 0,
    revenue: 0,
    bonusPaid: false,
    dustMass: 0,
    milestones: 0,
    startedAt: state.time,
  };
}

export function newPeeler(id: 'player' | 'helper'): Peeler {
  return { id, buffer: null, idleTime: 0, outputRate: 0, streak: 0 };
}

export function createInitialState(): GameState {
  const flags = {} as Record<TutorialStepId, boolean>;
  for (const s of TUTORIAL_STEPS) flags[s.id] = false;
  const state: GameState = {
    version: SAVE.version,
    nextId: 1,
    time: 0,
    coins: 0,
    upgrades: { scraper: 0, precision: 0, durability: 0, bladeCap: 0, capacity: 0, machine: 0, intake: 0, cartSpeed: 0, autopilot: 0, helper: 0 },
    autopilotEnabled: true,
    autoContinue: false,
    // Placeholder, replaced right below once the id allocator exists.
    contract: null as unknown as ContractInstance,
    contractsCompleted: [],
    completedInstances: [],
    totalContractsCompleted: 0,
    player: {
      x: WORLD.playerStart.x,
      z: WORLD.playerStart.z,
      vx: 0,
      vz: 0,
      facing: -Math.PI / 2,
      mode: 'onFoot',
      modeTime: 0,
      fromX: 0,
      fromZ: 0,
      toX: 0,
      toZ: 0,
      distanceWalked: 0,
      carveContact: false,
      boardDwell: 0,
      boardArmed: true,
      parkDwell: 0,
      blades: 0,
      bladeWear: 0,
      bladeSwap: 0,
      station: null,
      stationDwell: 0,
    },
    cart: {
      x: WORLD.cartPark.x,
      z: WORLD.cartPark.z,
      vx: 0,
      vz: 0,
      heading: WORLD.cartPark.heading,
      control: 'idle',
      activity: 'none',
      cargo: [],
      pickupBudget: 1,
      fullNotified: false,
      hopperFullNotified: false,
      odometer: 0,
      auto: {
        phase: 'idle',
        targetRoll: -1,
        path: [],
        pathGoal: null,
        phaseTime: 0,
        stuckTime: 0,
        lastProgressDist: 0,
        waitWithCargo: 0,
      },
    },
    collectibles: [],
    peelers: { player: newPeeler('player'), helper: newPeeler('helper') },
    machine: { hopper: [], cycle: null, status: 'idle', producedTotal: 0 },
    conveyor: [],
    tutorial: { done: false, skipped: false, flags },
    stats: { carved: 0, collected: 0, unloaded: 0, produced: 0, sold: 0, coinsEarned: 0, playTime: 0 },
  };
  state.contract = createContractInstance(state, 0);
  return state;
}

// ---------------------------------------------------------------------------
// Source geometry helpers (pure; shared by collision, peeling and the mesh).

export function sectorRadius(c: ContractInstance, layer: number, sector: number): number {
  const radii = layerRadii();
  if (layer >= NUM_LAYERS) return WORLD.source.hubRadius;
  const { outer, inner } = radii[layer];
  const init = c.initialSectorMass[layer];
  const f = init > 0 ? Math.max(0, Math.min(1, c.sectors[layer][sector] / init)) : 0;
  return Math.sqrt(inner * inner + f * (outer * outer - inner * inner));
}

/** Current outer surface radius of the candy at a sector (active layer only can be partial). */
export function surfaceRadius(c: ContractInstance, sector: number): number {
  if (c.activeLayer >= NUM_LAYERS) return WORLD.source.hubRadius;
  return sectorRadius(c, c.activeLayer, sector);
}

export function sectorAngle(): number {
  return (Math.PI * 2) / WORLD.source.sectors;
}

export function wrapAngle(a: number): number {
  const t = Math.PI * 2;
  a %= t;
  return a < 0 ? a + t : a;
}

/** Local (candy-space) angle for a world angle, using the inverse rotation. */
export function worldToLocalAngle(c: ContractInstance, worldAngle: number): number {
  return wrapAngle(worldAngle - c.rotation);
}

export function sectorIndexForLocal(localAngle: number): number {
  const n = WORLD.source.sectors;
  return Math.min(n - 1, Math.floor(wrapAngle(localAngle) / sectorAngle()));
}

/** Largest surface radius within ±halfAngle of a world angle (conservative for collision). */
export function maxSurfaceRadiusInSpan(c: ContractInstance, worldAngle: number, halfAngle: number): number {
  if (c.activeLayer >= NUM_LAYERS) return WORLD.source.hubRadius;
  const n = WORLD.source.sectors;
  const sa = sectorAngle();
  const local = worldToLocalAngle(c, worldAngle);
  const center = Math.floor(local / sa);
  const span = Math.ceil(halfAngle / sa) + 1;
  let best: number = WORLD.source.hubRadius;
  for (let k = -span; k <= span; k++) {
    const idx = (((center + k) % n) + n) % n;
    const r = surfaceRadius(c, idx);
    if (r > best) best = r;
  }
  return best;
}

export function maxSurfaceRadius(c: ContractInstance): number {
  if (c.activeLayer >= NUM_LAYERS) return WORLD.source.hubRadius;
  const n = WORLD.source.sectors;
  let best: number = WORLD.source.hubRadius;
  for (let i = 0; i < n; i++) {
    const r = surfaceRadius(c, i);
    if (r > best) best = r;
  }
  return best;
}

export function layerRemaining(c: ContractInstance, layer: number): number {
  if (layer >= NUM_LAYERS) return 0;
  let s = 0;
  for (const m of c.sectors[layer]) s += m;
  return s;
}

export function sourceRemaining(c: ContractInstance): number {
  let s = 0;
  for (let l = 0; l < NUM_LAYERS; l++) s += layerRemaining(c, l);
  return s;
}

// ---------------------------------------------------------------------------
// Ledger: every unit of raw for a contract instance must be somewhere.

export function computeLedger(state: GameState, ciid = state.contract.ciid): Ledger {
  const c = state.contract;
  const src = c.ciid === ciid ? sourceRemaining(c) : 0;
  let buffers = 0;
  for (const p of [state.peelers.player, state.peelers.helper]) if (p.buffer && p.buffer.ciid === ciid) buffers += p.buffer.mass;
  let world = 0;
  for (const r of state.collectibles) if (r.ciid === ciid) world += r.mass;
  let cart = 0;
  for (const it of state.cart.cargo) if (it.ciid === ciid) cart += it.mass;
  let hopper = 0;
  for (const b of state.machine.hopper) if (b.ciid === ciid) hopper += b.mass;
  if (state.machine.cycle && state.machine.cycle.ciid === ciid) hopper += state.machine.cycle.mass;
  let conveyor = 0;
  for (const p of state.conveyor) if (p.ciid === ciid) conveyor += p.mass;
  const sold = c.ciid === ciid ? c.soldMass : 0;
  const dust = c.ciid === ciid ? c.dustMass : 0;
  const total = src + buffers + world + cart + hopper + conveyor + sold + dust;
  const initial = c.ciid === ciid ? c.initialRaw : total;
  return { source: src, buffers, world, cart, hopper, conveyor, sold, dust, total, initial, mismatch: total - initial };
}

/** Raw of this contract that is still upstream of the machine (source, buffers, world, cart). */
export function rawUpstream(state: GameState, ciid: number): number {
  const l = computeLedger(state, ciid);
  return l.source + l.buffers + l.world + l.cart;
}

export function cargoMass(state: GameState): number {
  let s = 0;
  for (const it of state.cart.cargo) s += it.mass;
  return s;
}

export function hopperMass(state: GameState): number {
  let s = 0;
  for (const b of state.machine.hopper) s += b.mass;
  return s;
}

export function worldRawMass(state: GameState): number {
  let s = 0;
  for (const r of state.collectibles) s += r.mass;
  return s;
}

export function upgradeAvailable(state: GameState, id: UpgradeId): boolean {
  return state.totalContractsCompleted >= UPGRADES[id].requiresContracts;
}

export function nextUpgradeCost(state: GameState, id: UpgradeId): number | null {
  const def = UPGRADES[id];
  const lvl = state.upgrades[id] | 0;
  if (lvl >= def.costs.length) return null;
  return def.costs[lvl];
}

export function anyAffordableUpgrade(state: GameState): boolean {
  for (const id of Object.keys(UPGRADES) as UpgradeId[]) {
    if (!upgradeAvailable(state, id)) continue;
    const cost = nextUpgradeCost(state, id);
    if (cost !== null && cost <= state.coins) return true;
  }
  return false;
}

export function nextContractDef(state: GameState): number {
  const done = state.contractsCompleted;
  for (let i = 0; i < CONTRACTS.length; i++) if (!done.includes(i)) return i;
  return -1; // all done → replay picker
}
