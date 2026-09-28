import { describe, expect, it } from 'vitest';
import { CONTRACTS, MACHINE, UPGRADES, WORLD } from '../src/game/config';
import { Simulation } from '../src/game/Simulation';
import {
  cargoMass,
  computeLedger,
  contractRawTotal,
  createInitialState,
  hopperMass,
  layerRemaining,
  sourceRemaining,
} from '../src/game/state';
import { carveFootprint } from '../src/game/systems/PeelingSystem';
import { updatePickup, updateUnload } from '../src/game/systems/CollectionSystem';
import { updateConveyor, updateMachine } from '../src/game/systems/ProductionSystem';
import { EventQueue } from '../src/game/events';
import type { SimContext } from '../src/game/context';
import type { GameState } from '../src/game/types';
import { deserialize, serialize } from '../src/persistence/SaveManager';
import { AWAY, Bot, DT, shrinkContract } from './bot';
import { milestoneReward } from '../src/game/systems/StationSystem';
import { CANDY, MILESTONES } from '../src/game/config';

const milestonesTotal = (defId: number) => MILESTONES.reduce((a, _m, i) => a + milestoneReward(defId, i), 0);

function ctxFor(state: GameState): SimContext {
  return { state, events: new EventQueue(), input: { dirX: 0, dirZ: 0, mag: 0 } };
}

function addRoll(state: GameState, mass: number, x: number, z: number) {
  const c = state.contract;
  const id = state.nextId++;
  state.collectibles.push({ id, ciid: c.ciid, defId: c.defId, layer: 0, mass, x, z, y: 0, age: 5 });
  return id;
}

/** Move raw out of the source so tests can place it elsewhere without breaking the ledger. */
function takeFromSource(state: GameState, amount: number): void {
  const c = state.contract;
  let need = amount;
  for (let l = 0; l < 5 && need > 0; l++) {
    const layer = c.sectors[l];
    for (let i = 0; i < layer.length && need > 0; i++) {
      const t = Math.min(layer[i], need);
      layer[i] -= t;
      need -= t;
    }
  }
}

describe('peeling', () => {
  it('two peelers on the last sector never take it below zero', () => {
    const s = createInitialState();
    const c = s.contract;
    // Only sector 0 of the active layer has material left.
    for (let i = 0; i < c.sectors[0].length; i++) c.sectors[0][i] = 0;
    c.sectors[0][0] = 0.01;
    c.rotation = 0;
    const angle = ((0.5 * Math.PI * 2) / WORLD.source.sectors) as number;
    const a = carveFootprint(c, angle, 3, 0, 0.55, 5);
    const b = carveFootprint(c, angle, 3, 0, 0.55, 5);
    expect(a.taken + b.taken).toBeCloseTo(0.01, 10);
    expect(b.taken).toBe(0);
    expect(c.sectors[0].every((m) => m >= 0)).toBe(true);
  });

  it('only sectors inside the tool footprint lose mass', () => {
    const s = createInitialState();
    const c = s.contract;
    const before = c.sectors[0].slice();
    carveFootprint(c, 0, 3, 0, 0.55, 0.05);
    const changed = c.sectors[0].map((m, i) => (m !== before[i] ? i : -1)).filter((i) => i >= 0);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThanOrEqual(5);
    for (const i of changed) expect(Math.min(i, WORLD.source.sectors - i)).toBeLessThanOrEqual(3);
  });

  it('holding into the candy carves roughly the configured rate and spawns rolls, not coins', () => {
    const sim = new Simulation();
    const bot = new Bot(sim);
    const carved = bot.carve(4);
    expect(carved).toBeGreaterThan(4 * 2 * 0.6);
    expect(carved).toBeLessThanOrEqual(4 * 2 + 0.2);
    expect(sim.state.coins).toBe(0);
    expect(sim.state.collectibles.length).toBeGreaterThan(3);
    expect(bot.maxMismatch).toBeLessThan(1e-9);
  });

  it('releasing the stick stops carving', () => {
    const sim = new Simulation();
    const bot = new Bot(sim);
    bot.carve(1);
    const before = sim.state.stats.carved;
    bot.idle(1);
    expect(sim.state.stats.carved).toBe(before);
    expect(sim.state.player.mode).toBe('onFoot');
  });

  it('upgraded scraper produces more output on a steady hold', () => {
    const measure = (level: number) => {
      const sim = new Simulation();
      sim.state.upgrades.scraper = level;
      sim.state.contract.spinRate = 0; // let the motor ease in like in play
      const bot = new Bot(sim);
      return bot.carve(5);
    };
    const base = measure(0);
    const up = measure(4);
    expect(up).toBeGreaterThan(base * 1.6);
  });
});

describe('cart and hopper', () => {
  it('partial pickup takes only what fits and leaves the rest of the pile', () => {
    const s = createInitialState();
    takeFromSource(s, 13);
    const ctx = ctxFor(s);
    s.cart.cargo.push({ id: s.nextId++, ciid: s.contract.ciid, defId: 0, layer: 0, mass: 11 });
    const intakeX = s.cart.x + Math.cos(s.cart.heading) * 0.82;
    const intakeZ = s.cart.z + Math.sin(s.cart.heading) * 0.82;
    addRoll(s, 2, intakeX, intakeZ);
    s.cart.pickupBudget = 5;
    updatePickup(ctx, DT);
    expect(cargoMass(s)).toBeCloseTo(12, 9);
    expect(s.collectibles[0].mass).toBeCloseTo(1, 9);
    // Full: nothing more is taken.
    updatePickup(ctx, 1);
    expect(s.collectibles[0].mass).toBeCloseTo(1, 9);
    // Unload a bit elsewhere → picks up again.
    s.cart.cargo[0].mass -= 3;
    s.cart.pickupBudget = 5;
    updatePickup(ctx, DT);
    expect(s.collectibles.length).toBe(0);
  });

  it('hopper full stops unloading without losing anything; leaving the pad stops transfer', () => {
    const s = createInitialState();
    const ctx = ctxFor(s);
    takeFromSource(s, 80);
    s.machine.hopper.push({ ciid: s.contract.ciid, defId: 0, layer: 0, mass: 72 });
    s.cart.cargo.push({ id: s.nextId++, ciid: s.contract.ciid, defId: 0, layer: 1, mass: 8 });
    s.cart.x = WORLD.unloadZone.x;
    s.cart.z = WORLD.unloadZone.z;
    const before = computeLedger(s).total;
    expect(updateUnload(ctx, 1)).toBe(-1);
    expect(cargoMass(s)).toBeCloseTo(8, 9);
    expect(hopperMass(s)).toBeCloseTo(72, 9);
    // Free some space → resumes, only up to capacity.
    s.machine.hopper[0].mass = 70;
    s.contract.soldMass += 2;
    updateUnload(ctx, 1);
    expect(hopperMass(s)).toBeCloseTo(72, 9);
    expect(cargoMass(s)).toBeCloseTo(6, 9);
    // Drive away: transfer stops immediately.
    s.machine.hopper[0].mass = 10;
    s.contract.soldMass += 60;
    s.cart.x = WORLD.unloadZone.x - 3;
    expect(updateUnload(ctx, 1)).toBe(0);
    expect(cargoMass(s)).toBeCloseTo(6, 9);
    expect(computeLedger(s).total).toBeCloseTo(before, 9);
  });

  it('boarding/leaving never touches the cargo', () => {
    const sim = new Simulation();
    const bot = new Bot(sim);
    bot.carve(3);
    expect(bot.board()).toBe(true);
    bot.collect(20);
    const load = cargoMass(sim.state);
    expect(load).toBeGreaterThan(0);
    expect(bot.leave()).toBe(true);
    expect(cargoMass(sim.state)).toBeCloseTo(load, 9);
    bot.walkTo(AWAY.x, AWAY.z); // auto-board re-arms only after walking away
    expect(bot.board()).toBe(true);
    expect(cargoMass(sim.state)).toBeCloseTo(load, 9);
    expect(bot.maxMismatch).toBeLessThan(1e-9);
  });
});

describe('production and economy', () => {
  it('each product costs 2 U and is sold exactly once', () => {
    const s = createInitialState();
    const ctx = ctxFor(s);
    takeFromSource(s, 10);
    s.machine.hopper.push({ ciid: s.contract.ciid, defId: 0, layer: 0, mass: 10 });
    for (let t = 0; t < 20; t += DT) {
      updateMachine(ctx, DT);
      updateConveyor(ctx, DT);
    }
    expect(s.contract.soldCount).toBe(5);
    expect(s.coins).toBe(5 * CONTRACTS[0].productValue);
    const sold = ctx.events.drain().filter((e) => e.type === 'productSold');
    expect(new Set(sold.map((e) => (e as { id: number }).id)).size).toBe(sold.length);
    expect(computeLedger(s).mismatch).toBeCloseTo(0, 9);
  });

  it('economy output is frame-rate independent', () => {
    const run = (dt: number) => {
      const s = createInitialState();
      s.upgrades.machine = 3;
      const ctx = ctxFor(s);
      takeFromSource(s, 40);
      s.machine.hopper.push({ ciid: s.contract.ciid, defId: 0, layer: 0, mass: 40 });
      for (let t = 0; t < 4.5; t += dt) {
        updateMachine(ctx, dt);
        updateConveyor(ctx, dt);
      }
      return { coins: s.coins, produced: s.stats.produced };
    };
    const a = run(1 / 120);
    const b = run(1 / 30);
    expect(Math.abs(a.produced - b.produced)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.coins - b.coins)).toBeLessThanOrEqual(CONTRACTS[0].productValue);
  });

  it('double-tapping a purchase never goes negative or gives a free level', () => {
    const sim = new Simulation();
    sim.state.coins = 50;
    expect(sim.purchase('scraper')).toBe(true); // 20
    expect(sim.purchase('scraper')).toBe(false); // 45 > 30
    expect(sim.state.coins).toBe(30);
    expect(sim.state.upgrades.scraper).toBe(1);
    sim.state.coins = 45;
    expect(sim.purchase('scraper')).toBe(true);
    expect(sim.purchase('scraper')).toBe(false);
    expect(sim.state.coins).toBe(0);
    expect(sim.state.upgrades.scraper).toBe(2);
    // Locked unlocks cannot be bought early.
    // Unlocks are coin-gated: one coin short fails and changes nothing.
    sim.state.coins = UPGRADES.autopilot.costs[0] - 1;
    expect(sim.purchase('autopilot')).toBe(false);
    expect(sim.state.upgrades.autopilot).toBe(0);
    sim.state.coins += 1;
    expect(sim.purchase('autopilot')).toBe(true);
    expect(sim.purchase('autopilot')).toBe(false); // already owned, no double charge
    expect(sim.state.coins).toBe(0);
  });

  it('upgrade values match the configured table', () => {
    expect(UPGRADES.scraper.values).toEqual([2.0, 2.6, 3.3, 4.1, 5.0]);
    expect(UPGRADES.capacity.values).toEqual([12, 18, 26, 36, 48]);
    expect(MACHINE.hopperCapacity).toBe(72);
  });
});

describe('save / load', () => {
  it('roundtrip keeps damaged sectors, typed cargo, partial production and unsold products', () => {
    const sim = new Simulation();
    const bot = new Bot(sim);
    bot.carve(3);
    bot.board();
    bot.collect(15);
    bot.unload(0.6);
    bot.idle(0.35);
    const s = sim.state;
    const json = serialize(s);
    const res = deserialize(json);
    expect(res.ok).toBe(true);
    const t = res.state;
    expect(t.contract.sectors).toEqual(s.contract.sectors);
    expect(t.cart.cargo).toEqual(s.cart.cargo);
    expect(t.machine.hopper).toEqual(s.machine.hopper);
    expect(t.machine.cycle).toEqual(s.machine.cycle);
    expect(t.conveyor.map((p) => p.id)).toEqual(s.conveyor.map((p) => p.id));
    expect(t.coins).toBe(s.coins);
    expect(computeLedger(t).mismatch).toBeCloseTo(0, 9);
    expect(t.nextId).toBeGreaterThanOrEqual(s.nextId);
  });

  it('rejects corrupt and unknown-version saves without throwing', () => {
    expect(deserialize('{nope').ok).toBe(false);
    expect(deserialize(JSON.stringify({ version: 999 })).ok).toBe(false);
    const s = createInitialState();
    const bad = JSON.parse(serialize(s));
    bad.contract.sectors[0][3] = null; // NaN serialises to null
    expect(deserialize(JSON.stringify(bad)).ok).toBe(false);
  });

  it('the completion bonus is not paid again after reload', () => {
    const sim = new Simulation();
    const s = sim.state;
    // Fast-forward: everything already sold.
    for (const l of s.contract.sectors) l.fill(0);
    s.contract.activeLayer = 5;
    s.contract.soldMass = s.contract.initialRaw;
    s.contract.soldCount = 40;
    sim.step(DT);
    sim.step(DT);
    expect(s.contract.status).toBe('completed');
    const coins = s.coins;
    expect(coins).toBe(CONTRACTS[0].bonus + milestonesTotal(0));
    const loaded = new Simulation(deserialize(serialize(s)).state);
    for (let i = 0; i < 10; i++) loaded.step(DT);
    expect(loaded.state.coins).toBe(coins);
    // Status could also be manipulated back to settling — still no double pay.
    loaded.state.contract.status = 'settling';
    loaded.step(DT);
    expect(loaded.state.coins).toBe(coins);
  });
});

describe('contracts and automation', () => {
  it('a contract completes only after all raw is processed and sold; autopilot hauls the small tail', () => {
    const sim = new Simulation();
    const s = sim.state;
    s.upgrades.autopilot = 1;
    s.cart.control = 'autopilot';
    // Leave only 1.3 U in the source's last layer; the rest is "already sold".
    const c = s.contract;
    for (const l of c.sectors) l.fill(0);
    c.activeLayer = 4;
    c.sectors[4][10] = 1.3;
    c.soldMass = c.initialRaw - 1.3;
    c.soldCount = Math.floor(c.soldMass / 2);
    const bot = new Bot(sim);
    // Walk to the candy and carve the last bit.
    for (let t = 0; t < 30 && c.activeLayer < 5; t += 2) bot.carve(2);
    expect(c.activeLayer).toBe(5);
    expect(['sourceEmpty', 'settling', 'active']).toContain(c.status);
    expect(c.status).not.toBe('completed');
    // Autopilot must deliver the partial load, the machine makes a final product, it sells.
    for (let t = 0; t < 90 && c.status !== 'completed'; t += DT) {
      sim.setInput(0, 0, 0);
      bot.tick();
    }
    expect(c.status).toBe('completed');
    expect(sourceRemaining(c)).toBe(0);
    const l = computeLedger(s);
    expect(l.world + l.cart + l.hopper + l.conveyor + l.buffers).toBeLessThan(1e-6);
    expect(Math.abs(l.mismatch)).toBeLessThan(1e-6);
  });

  it('helper and player carving together stay mass-conservative', () => {
    const sim = new Simulation();
    sim.state.upgrades.helper = 1;
    const bot = new Bot(sim);
    const layer0 = layerRemaining(sim.state.contract, 0);
    bot.carve(6);
    expect(layerRemaining(sim.state.contract, 0)).toBeLessThan(layer0);
    expect(bot.maxMismatch).toBeLessThan(1e-9);
    const hist = sim.state.contract.sectors.flat();
    expect(hist.every((m) => m >= 0)).toBe(true);
  });
});

describe('full first contract (fresh save, no debug coins)', () => {
  it('carve → cart → unload → sell → first upgrade, then complete contract 1 (base-size candy)', () => {
    const sim = new Simulation();
    shrinkContract(sim);
    const bot = new Bot(sim);
    const s = sim.state;
    let bought = false;
    let firstSaleAt = -1;
    let firstUpgradeAt = -1;
    for (let round = 0; round < 160 && s.contract.status !== 'completed'; round++) {
      if (s.contract.activeLayer < 5) {
        if (s.player.mode === 'driving') bot.leave();
        bot.carve(Math.min(7, 1 + 12 / 2));
      }
      bot.board();
      bot.collect(30);
      bot.unload();
      bot.idle(0.5);
      if (s.stats.sold > 0 && firstSaleAt < 0) firstSaleAt = s.time;
      if (!bought && s.coins >= 20) {
        bought = sim.purchase('scraper');
        firstUpgradeAt = s.time;
      }
    }
    for (let t = 0; t < 60 && s.contract.status !== 'completed'; t += 1) bot.idle(1);
    expect(firstSaleAt).toBeGreaterThan(0);
    expect(bought).toBe(true);
    expect(s.contract.status).toBe('completed');
    const products = contractRawTotal(0) / CANDY.massScale / 2;
    expect(s.contract.soldCount).toBeCloseTo(products, 6);
    expect(s.coins + 20).toBe(4 * products + CONTRACTS[0].bonus + milestonesTotal(0));
    expect(bot.maxMismatch).toBeLessThan(1e-6);
    // Next contract resets the source and keeps upgrades.
    expect(sim.startNextContract()).toBe(true);
    expect(sim.state.contract.defId).toBe(1);
    expect(sim.state.upgrades.scraper).toBe(1);
    // eslint-disable-next-line no-console
    console.log(`contract 1 done at t=${s.time.toFixed(1)}s, first sale at ${firstSaleAt.toFixed(1)}s, first upgrade at ${firstUpgradeAt.toFixed(1)}s`);
  });
});

describe('replay after all contracts', () => {
  const finishCurrent = (sim: Simulation) => {
    const c = sim.state.contract;
    for (const l of c.sectors) l.fill(0);
    c.activeLayer = 5;
    c.soldMass = c.initialRaw;
    c.soldCount = c.initialRaw / 2;
    sim.step(DT);
    sim.step(DT);
  };

  it('replays any flavour with a new instance id; bonus once per instance; upgrades kept; no skipping ahead', () => {
    const sim = new Simulation();
    sim.state.upgrades.scraper = 3;
    // Cannot jump to contract 3 before finishing 1 and 2.
    finishCurrent(sim);
    expect(sim.startContract(2)).toBe(false);
    expect(sim.startContract(1)).toBe(true);
    finishCurrent(sim);
    expect(sim.startContract(2)).toBe(true);
    finishCurrent(sim);
    expect(sim.state.contractsCompleted).toEqual([0, 1, 2]);
    const coins = sim.state.coins;
    expect(coins).toBe(CONTRACTS[0].bonus + CONTRACTS[1].bonus + CONTRACTS[2].bonus + milestonesTotal(0) + milestonesTotal(1) + milestonesTotal(2));
    const ids = new Set(sim.state.completedInstances);
    expect(ids.size).toBe(3);
    // Replay contract 1 (no tutorial restart, no upgrade reset).
    const tutorialBefore = JSON.stringify(sim.state.tutorial);
    expect(sim.startContract(0)).toBe(true);
    expect(JSON.stringify(sim.state.tutorial)).toBe(tutorialBefore);
    const ciid = sim.state.contract.ciid;
    expect(ids.has(ciid)).toBe(false);
    expect(sim.state.upgrades.scraper).toBe(3);
    finishCurrent(sim);
    expect(sim.state.coins).toBe(coins + CONTRACTS[0].bonus + milestonesTotal(0));
    for (let i = 0; i < 20; i++) sim.step(DT);
    expect(sim.state.coins).toBe(coins + CONTRACTS[0].bonus + milestonesTotal(0));
  });
});

describe('auto-start next contract', () => {
  it('is off by default and only starts the next contract when enabled with the helper owned', () => {
    const finish = (sim: Simulation) => {
      const c = sim.state.contract;
      for (const l of c.sectors) l.fill(0);
      c.activeLayer = 5;
      c.soldMass = c.initialRaw;
      sim.step(DT);
      sim.step(DT);
    };
    const sim = new Simulation();
    expect(sim.state.autoContinue).toBe(false);
    finish(sim);
    for (let i = 0; i < 300; i++) sim.step(DT);
    expect(sim.state.contract.status).toBe('completed');
    // Enabled but no helper: still waits for the player.
    sim.state.autoContinue = true;
    for (let i = 0; i < 300; i++) sim.step(DT);
    expect(sim.state.contract.status).toBe('completed');
    // With the helper it moves on by itself after a short pause.
    sim.state.upgrades.helper = 1;
    for (let i = 0; i < 200; i++) sim.step(DT);
    expect(sim.state.contract.status).toBe('active');
    expect(sim.state.contract.defId).toBe(1);
  });
});
