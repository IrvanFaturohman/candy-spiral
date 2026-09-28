import { AUDIO, CANDY, CONTRACTS, SAVE, UPGRADES, WORLD, type UpgradeId } from '../game/config';
import { contractRawTotal, createInitialState, NUM_LAYERS } from '../game/state';
import type { GameState } from '../game/types';

export interface Settings {
  sfx: number;
  music: number;
  reducedMotion: boolean;
  haptics: boolean;
  quality: 'auto' | 'low' | 'normal' | 'high';
}

export const DEFAULT_SETTINGS: Settings = {
  sfx: AUDIO.defaultSfx,
  music: AUDIO.defaultMusic,
  reducedMotion: false,
  haptics: true,
  quality: 'auto',
};

export type LoadResult =
  | { ok: true; state: GameState; fresh: boolean }
  | { ok: false; state: GameState; reason: 'corrupt' | 'version' | 'unavailable' };

// ---------------------------------------------------------------------------
// Pure (de)serialisation — unit tested without a browser.

export function serialize(state: GameState): string {
  return JSON.stringify({ ...state, version: SAVE.version, savedAt: Date.now() });
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function numOr(v: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  return isNum(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

class SaveError extends Error {}

function req<T>(cond: T, msg: string): asserts cond {
  if (!cond) throw new SaveError(msg);
}

function checkRawTag(o: unknown): o is { ciid: number; defId: number; layer: number; mass: number } {
  if (!isObj(o)) return false;
  return isNum(o.ciid) && isNum(o.defId) && o.defId >= 0 && o.defId < CONTRACTS.length && isNum(o.layer) && isNum(o.mass) && o.mass >= 0;
}

/**
 * Parse and validate a save. Anything structurally wrong (NaN, missing arrays,
 * unknown version) is rejected so the game can start fresh instead of crashing.
 */
export function deserialize(json: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, state: createInitialState(), reason: 'corrupt' };
  }
  if (!isObj(raw)) return { ok: false, state: createInitialState(), reason: 'corrupt' };
  if (raw.version !== SAVE.version && raw.version !== 1) return { ok: false, state: createInitialState(), reason: 'version' };
  try {
    const state = validate(raw);
    if (raw.version === 1) migrateV1(state);
    return { ok: true, state, fresh: false };
  } catch {
    return { ok: false, state: createInitialState(), reason: 'corrupt' };
  }
}

/**
 * v1 → v2: candy became more durable (CANDY.massScale) and rolls lie loose on
 * the floor instead of in trays. The in-progress disc is scaled so it wears
 * down at the new rate; initialRaw grows by exactly the added mass, so the
 * ledger stays balanced. Rolls keep their (valid) old positions.
 */
export function migrateV1(state: GameState): void {
  const c = state.contract;
  const k: number = CANDY.massScale;
  if (k === 1) return;
  let remaining = 0;
  for (const layer of c.sectors) for (const m of layer) remaining += m;
  for (const layer of c.sectors) for (let i = 0; i < layer.length; i++) layer[i] *= k;
  c.initialSectorMass = c.initialSectorMass.map((m) => m * k);
  c.initialRaw += (k - 1) * remaining;
}

function validate(raw: Record<string, unknown>): GameState {
  const base = createInitialState();
  const s = base;
  s.time = numOr(raw.time, 0, 0);
  s.coins = Math.floor(numOr(raw.coins, 0, 0));
  s.nextId = Math.floor(numOr(raw.nextId, 1, 1));
  s.autopilotEnabled = raw.autopilotEnabled !== false;
  s.autoContinue = raw.autoContinue === true;
  s.totalContractsCompleted = Math.floor(numOr(raw.totalContractsCompleted, 0, 0));
  s.contractsCompleted = Array.isArray(raw.contractsCompleted) ? (raw.contractsCompleted as unknown[]).filter((v): v is number => isNum(v) && v >= 0 && v < CONTRACTS.length) : [];
  s.completedInstances = Array.isArray(raw.completedInstances) ? (raw.completedInstances as unknown[]).filter(isNum) : [];

  req(isObj(raw.upgrades), 'upgrades');
  const ups = raw.upgrades as Record<string, unknown>;
  for (const id of Object.keys(UPGRADES) as UpgradeId[]) {
    s.upgrades[id] = Math.floor(numOr(ups[id], 0, 0, UPGRADES[id].values.length - 1));
  }

  // Contract instance with sector masses.
  req(isObj(raw.contract), 'contract');
  const rc = raw.contract as Record<string, unknown>;
  req(isNum(rc.ciid) && isNum(rc.defId) && rc.defId >= 0 && rc.defId < CONTRACTS.length, 'contract ids');
  req(Array.isArray(rc.sectors) && rc.sectors.length === NUM_LAYERS, 'sectors');
  req(Array.isArray(rc.initialSectorMass) && rc.initialSectorMass.length === NUM_LAYERS, 'initialSectorMass');
  const sectors: number[][] = [];
  for (const layer of rc.sectors as unknown[]) {
    req(Array.isArray(layer) && layer.length === WORLD.source.sectors, 'sector layer');
    for (const m of layer as unknown[]) req(isNum(m) && m >= 0, 'sector mass');
    sectors.push((layer as number[]).slice());
  }
  const initialSectorMass = (rc.initialSectorMass as unknown[]).map((v) => {
    req(isNum(v) && v >= 0, 'init sector');
    return v as number;
  });
  const status = rc.status;
  req(status === 'active' || status === 'sourceEmpty' || status === 'settling' || status === 'completed', 'status');
  s.contract = {
    ciid: rc.ciid as number,
    defId: rc.defId as number,
    status,
    activeLayer: Math.floor(numOr(rc.activeLayer, 0, 0, NUM_LAYERS)),
    sectors,
    initialSectorMass,
    initialRaw: numOr(rc.initialRaw, contractRawTotal(rc.defId as number), 0),
    rotation: numOr(rc.rotation, 0),
    spinRate: numOr(rc.spinRate, Math.PI / 2, 0, 10),
    soldCount: numOr(rc.soldCount, 0, 0),
    soldMass: numOr(rc.soldMass, 0, 0),
    revenue: numOr(rc.revenue, 0, 0),
    bonusPaid: rc.bonusPaid === true,
    dustMass: numOr(rc.dustMass, 0, 0),
    milestones: Math.floor(numOr(rc.milestones, 0, 0, 1 << 16)),
    startedAt: numOr(rc.startedAt, 0),
  };
  // Consistency: a paid instance must be marked in both places (never pay twice).
  if (s.contract.bonusPaid && !s.completedInstances.includes(s.contract.ciid)) s.completedInstances.push(s.contract.ciid);
  if (s.completedInstances.includes(s.contract.ciid)) s.contract.bonusPaid = true;

  // Player (normalised to a stable mode).
  req(isObj(raw.player), 'player');
  const rp = raw.player as Record<string, unknown>;
  const p = s.player;
  p.x = numOr(rp.x, p.x, WORLD.bounds.minX, WORLD.bounds.maxX);
  p.z = numOr(rp.z, p.z, WORLD.bounds.minZ, WORLD.bounds.maxZ);
  p.facing = numOr(rp.facing, p.facing);
  p.distanceWalked = numOr(rp.distanceWalked, 0, 0);
  p.boardArmed = rp.boardArmed !== false;
  p.blades = Math.floor(numOr(rp.blades, 0, 0, 10));
  p.bladeWear = Math.floor(numOr(rp.bladeWear, 0, 0, 1000));
  if (p.blades > 0 && p.bladeWear <= 0) p.bladeWear = 1;
  const mode = rp.mode;
  if (mode === 'driving' || mode === 'boarding') p.mode = 'driving';
  else if (mode === 'disembarking') {
    p.mode = 'onFoot';
    p.x = numOr(rp.toX, p.x, WORLD.bounds.minX, WORLD.bounds.maxX);
    p.z = numOr(rp.toZ, p.z, WORLD.bounds.minZ, WORLD.bounds.maxZ);
  } else p.mode = 'onFoot';

  // Cart and its typed cargo.
  req(isObj(raw.cart), 'cart');
  const rct = raw.cart as Record<string, unknown>;
  const c = s.cart;
  c.x = numOr(rct.x, c.x, WORLD.bounds.minX, WORLD.bounds.maxX);
  c.z = numOr(rct.z, c.z, WORLD.bounds.minZ, WORLD.bounds.maxZ);
  c.heading = numOr(rct.heading, c.heading);
  c.odometer = numOr(rct.odometer, 0);
  req(Array.isArray(rct.cargo), 'cargo');
  c.cargo = [];
  for (const it of rct.cargo as unknown[]) {
    req(checkRawTag(it) && isNum((it as { id?: unknown }).id), 'cargo item');
    const t = it as { id: number; ciid: number; defId: number; layer: number; mass: number };
    c.cargo.push({ id: t.id, ciid: t.ciid, defId: t.defId, layer: t.layer, mass: t.mass });
  }
  const owned = s.upgrades.autopilot > 0;
  c.control = p.mode === 'driving' ? 'manual' : owned && s.autopilotEnabled ? 'autopilot' : 'idle';

  // World rolls.
  req(Array.isArray(raw.collectibles), 'collectibles');
  s.collectibles = [];
  for (const r of raw.collectibles as unknown[]) {
    req(checkRawTag(r), 'roll');
    const o = r as Record<string, unknown>;
    req(isNum(o.id) && isNum(o.x) && isNum(o.z), 'roll pos');
    s.collectibles.push({
      id: o.id as number,
      ciid: o.ciid as number,
      defId: o.defId as number,
      layer: o.layer as number,
      mass: o.mass as number,
      x: o.x as number,
      z: o.z as number,
      y: numOr(o.y, 0, 0, 3),
      age: 10,
    });
  }

  // Peeler buffers (fractional raw).
  if (isObj(raw.peelers)) {
    const rpl = raw.peelers as Record<string, unknown>;
    for (const id of ['player', 'helper'] as const) {
      const pr = rpl[id];
      if (isObj(pr) && pr.buffer !== null && pr.buffer !== undefined) {
        req(checkRawTag(pr.buffer), 'buffer');
        const b = pr.buffer as { ciid: number; defId: number; layer: number; mass: number };
        s.peelers[id].buffer = { ciid: b.ciid, defId: b.defId, layer: b.layer, mass: b.mass };
      }
    }
  }

  // Machine: hopper FIFO and in-progress cycle.
  req(isObj(raw.machine), 'machine');
  const rm = raw.machine as Record<string, unknown>;
  req(Array.isArray(rm.hopper), 'hopper');
  s.machine.hopper = [];
  for (const b of rm.hopper as unknown[]) {
    req(checkRawTag(b), 'hopper batch');
    const t = b as { ciid: number; defId: number; layer: number; mass: number };
    s.machine.hopper.push({ ciid: t.ciid, defId: t.defId, layer: t.layer, mass: t.mass });
  }
  if (rm.cycle !== null && rm.cycle !== undefined) {
    req(isObj(rm.cycle), 'cycle');
    const cy = rm.cycle as Record<string, unknown>;
    req(isNum(cy.ciid) && isNum(cy.defId) && isNum(cy.mass) && isNum(cy.productId), 'cycle fields');
    s.machine.cycle = { ciid: cy.ciid as number, defId: cy.defId as number, mass: cy.mass as number, progress: numOr(cy.progress, 0, 0, 1), productId: cy.productId as number };
  }
  s.machine.producedTotal = numOr(rm.producedTotal, 0, 0);

  // Products still travelling (not yet paid).
  req(Array.isArray(raw.conveyor), 'conveyor');
  s.conveyor = [];
  for (const pr of raw.conveyor as unknown[]) {
    req(isObj(pr), 'product');
    const o = pr as Record<string, unknown>;
    req(isNum(o.id) && isNum(o.ciid) && isNum(o.defId) && isNum(o.count) && isNum(o.mass) && isNum(o.value), 'product fields');
    s.conveyor.push({ id: o.id as number, ciid: o.ciid as number, defId: o.defId as number, count: o.count as number, mass: o.mass as number, value: o.value as number, t: numOr(o.t, 0, 0, 0.999) });
  }

  // Tutorial and stats (lenient).
  if (isObj(raw.tutorial)) {
    const rt = raw.tutorial as Record<string, unknown>;
    s.tutorial.done = rt.done === true;
    s.tutorial.skipped = rt.skipped === true;
    if (isObj(rt.flags)) for (const k of Object.keys(s.tutorial.flags) as (keyof typeof s.tutorial.flags)[]) s.tutorial.flags[k] = (rt.flags as Record<string, unknown>)[k] === true;
  }
  if (isObj(raw.stats)) {
    const st = raw.stats as Record<string, unknown>;
    for (const k of Object.keys(s.stats) as (keyof typeof s.stats)[]) s.stats[k] = numOr(st[k], 0, 0);
  }

  // The id generator must never hand out an id that already exists.
  let maxId = s.contract.ciid;
  for (const r of s.collectibles) maxId = Math.max(maxId, r.id);
  for (const r of s.cart.cargo) maxId = Math.max(maxId, r.id);
  for (const r of s.conveyor) maxId = Math.max(maxId, r.id);
  for (const id of s.completedInstances) maxId = Math.max(maxId, id);
  if (s.machine.cycle) maxId = Math.max(maxId, s.machine.cycle.productId);
  s.nextId = Math.max(s.nextId, maxId + 1);
  return s;
}

export function validateSettings(raw: unknown): Settings {
  if (!isObj(raw)) return { ...DEFAULT_SETTINGS };
  const q = raw.quality;
  return {
    sfx: numOr(raw.sfx, DEFAULT_SETTINGS.sfx, 0, 1),
    music: numOr(raw.music, DEFAULT_SETTINGS.music, 0, 1),
    reducedMotion: raw.reducedMotion === true,
    haptics: raw.haptics !== false,
    quality: q === 'low' || q === 'normal' || q === 'high' || q === 'auto' ? q : 'auto',
  };
}

// ---------------------------------------------------------------------------
// Browser storage wrapper (never throws).

export type StorageStatus = 'ok' | 'unavailable' | 'quota';

export class SaveManager {
  private storage: Storage | null = null;
  status: StorageStatus = 'ok';

  constructor() {
    try {
      const ls = window.localStorage;
      const k = '__candy_probe__';
      ls.setItem(k, '1');
      ls.removeItem(k);
      this.storage = ls;
    } catch {
      this.storage = null;
      this.status = 'unavailable';
    }
  }

  get available(): boolean {
    return this.storage !== null;
  }

  hasSave(): boolean {
    try {
      return !!this.storage?.getItem(SAVE.key);
    } catch {
      return false;
    }
  }

  load(): LoadResult {
    if (!this.storage) return { ok: false, state: createInitialState(), reason: 'unavailable' };
    let json: string | null = null;
    try {
      json = this.storage.getItem(SAVE.key);
    } catch {
      return { ok: false, state: createInitialState(), reason: 'unavailable' };
    }
    if (!json) return { ok: true, state: createInitialState(), fresh: true };
    return deserialize(json);
  }

  save(state: GameState): StorageStatus {
    if (!this.storage) return (this.status = 'unavailable');
    try {
      this.storage.setItem(SAVE.key, serialize(state));
      return (this.status = 'ok');
    } catch {
      return (this.status = 'quota');
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(SAVE.key);
    } catch {
      /* ignore */
    }
  }

  loadSettings(): Settings {
    try {
      const raw = this.storage?.getItem(SAVE.settingsKey);
      return validateSettings(raw ? JSON.parse(raw) : null);
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(s: Settings): void {
    try {
      this.storage?.setItem(SAVE.settingsKey, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }
}
