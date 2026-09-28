import { describe, expect, it } from 'vitest';
import { CANDY, COLLECT, MILESTONES, MOVE, SAVE, UPGRADES, WORLD } from '../src/game/config';
import { Simulation } from '../src/game/Simulation';
import { computeLedger, contractRawTotal, createInitialState } from '../src/game/state';
import { landingGrid } from '../src/game/scatter';
import { deserialize, serialize } from '../src/persistence/SaveManager';
import { AWAY, Bot, DT, FRONT } from './bot';

describe('auto board / park to leave (no buttons)', () => {
  it('hops in only after waiting beside the parked cart', () => {
    const sim = new Simulation();
    const bot = new Bot(sim);
    const c = sim.state.cart;
    bot.walkTo(c.x + 0.95, c.z);
    bot.idle(MOVE.autoBoardTime - 0.6);
    expect(sim.state.player.mode).toBe('onFoot');
    bot.idle(1.0);
    expect(sim.state.player.mode).toBe('driving');
  });

  it('walking past the cart does not board', () => {
    const sim = new Simulation();
    const bot = new Bot(sim);
    const c = sim.state.cart;
    bot.walkTo(c.x + 1.0, c.z - 1.6);
    bot.walkTo(c.x + 1.0, c.z + 1.6);
    bot.walkTo(c.x + 1.0, c.z - 1.6);
    expect(sim.state.player.mode).toBe('onFoot');
  });

  it('stopping away from the bay keeps you driving; the bay drops you off; no instant re-board', () => {
    const sim = new Simulation();
    const bot = new Bot(sim);
    expect(bot.board()).toBe(true);
    bot.driveTo(WORLD.cartStandby.x, WORLD.cartStandby.z);
    bot.idle(3);
    expect(sim.state.player.mode).toBe('driving');
    expect(bot.leave()).toBe(true);
    const p = sim.state.player;
    expect(Math.abs(sim.state.cart.x - WORLD.parkBay.x)).toBeLessThanOrEqual(WORLD.parkBay.hw);
    // Standing right there does not pull you back in…
    bot.idle(MOVE.autoBoardTime * 2);
    expect(p.mode).toBe('onFoot');
    // …but walking away and coming back does.
    bot.walkTo(AWAY.x, AWAY.z);
    expect(bot.board()).toBe(true);
  });

  it('the cargo survives hop-out / hop-in', () => {
    const sim = new Simulation();
    const bot = new Bot(sim);
    bot.carve(4);
    bot.board();
    bot.collect(20);
    const load = sim.state.cart.cargo.reduce((a, b) => a + b.mass, 0);
    expect(load).toBeGreaterThan(0);
    bot.leave();
    bot.walkTo(AWAY.x, AWAY.z);
    bot.board();
    expect(sim.state.cart.cargo.reduce((a, b) => a + b.mass, 0)).toBeCloseTo(load, 9);
    expect(bot.maxMismatch).toBeLessThan(1e-9);
  });
});

describe('loose rolls on the floor', () => {
  it('every landing spot is outside the candy, clear of obstacles and pads, and cart-reachable', () => {
    const grid = landingGrid();
    expect(grid.length).toBeGreaterThan(200);
    for (const p of grid) {
      expect(Math.hypot(p.x - WORLD.source.x, p.z - WORLD.source.z)).toBeGreaterThanOrEqual(WORLD.source.platterRadius + COLLECT.rollRadius - 1e-9);
      for (const o of WORLD.obstacles) expect(Math.abs(p.x - o.x) > o.hw || Math.abs(p.z - o.z) > o.hd).toBe(true);
      const uz = WORLD.unloadZone;
      expect(Math.abs(p.x - uz.x) > uz.hw || Math.abs(p.z - uz.z) > uz.hd).toBe(true);
    }
  });

  it('carving all around the candy scatters rolls that the cart can collect, with no trays', () => {
    const sim = new Simulation();
    const bot = new Bot(sim);
    // Carve from several sides, including the back.
    for (const a of [90, 150, 210, -90, -30, 30]) {
      const r = WORLD.source.radius + 0.5;
      const rad = (a * Math.PI) / 180;
      bot.walkTo(WORLD.source.x + Math.cos(rad) * r, WORLD.source.z + Math.sin(rad) * r, 20);
      bot.carve(1.5);
    }
    const rolls = sim.state.collectibles;
    expect(rolls.length).toBeGreaterThan(5);
    // Scattered: not all piled on one spot.
    const xs = rolls.map((r) => r.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(2);
    // All of it can be hauled away.
    bot.board();
    for (let i = 0; i < 6 && sim.state.collectibles.length > 0; i++) {
      bot.collect(40);
      bot.unload();
    }
    expect(sim.state.collectibles.length).toBe(0);
    expect(bot.maxMismatch).toBeLessThan(1e-9);
  });
});

describe('candy durability', () => {
  it('holds CANDY.massScale × the base design mass', () => {
    expect(contractRawTotal(0)).toBe(80 * CANDY.massScale);
    expect(createInitialState().contract.initialRaw).toBe(80 * CANDY.massScale);
  });

  it('a v1 save migrates to the tougher candy with the ledger still balanced', () => {
    const s = createInitialState();
    // Build a v1-shaped save: base (unscaled) masses, some already carved and sold.
    const base = s.contract.sectors.map((l) => l.map((m) => m / CANDY.massScale));
    base[0].fill(0);
    s.contract.sectors = base;
    s.contract.initialSectorMass = s.contract.initialSectorMass.map((m) => m / CANDY.massScale);
    s.contract.initialRaw = 80;
    s.contract.activeLayer = 1;
    s.contract.soldMass = 10;
    s.contract.soldCount = 5;
    const v1 = JSON.parse(serialize(s));
    v1.version = 1;
    for (const r of v1.collectibles) {
      r.pocket = 0;
      r.slot = 0;
    }
    const res = deserialize(JSON.stringify(v1));
    expect(res.ok).toBe(true);
    const l = computeLedger(res.state);
    expect(Math.abs(l.mismatch)).toBeLessThan(1e-9);
    expect(l.source).toBeCloseTo(70 * CANDY.massScale, 6);
    expect(SAVE.version).toBe(2);
    // Geometry is unchanged by the migration (same remaining fraction per sector).
    expect(res.state.contract.sectors[1][0] / res.state.contract.initialSectorMass[1]).toBeCloseTo(1, 9);
  });
});

void DT;

describe('blades, stations, precision, double carve, milestones', () => {
  it('cannot carve without a blade; the pad refills to capacity', () => {
    const sim = new Simulation();
    const bot = new Bot(sim);
    // Push into the candy with no blade: nothing is carved.
    bot.walkTo(FRONT.x, FRONT.z);
    for (let i = 0; i < 120; i++) {
      sim.setInput(WORLD.source.x - sim.state.player.x, WORLD.source.z - sim.state.player.z, 1);
      bot.tick();
    }
    expect(sim.state.stats.carved).toBe(0);
    sim.state.upgrades.bladeCap = 2;
    expect(bot.fetchBlade()).toBe(true);
    expect(sim.state.player.blades).toBe(3);
    expect(sim.state.player.bladeWear).toBe(UPGRADES.durability.values[0]);
  });

  it('a blade breaks after its durability in full pieces; spares swap in', () => {
    const sim = new Simulation();
    const bot = new Bot(sim);
    sim.state.upgrades.bladeCap = 1; // carry 2
    bot.fetchBlade();
    const events: string[] = [];
    const drain = () => sim.drainEvents().forEach((e) => events.push(e.type));
    // Carve until both blades are gone (no auto-fetch here).
    bot.walkTo(FRONT.x, FRONT.z);
    for (let t = 0; t < 60 && sim.state.player.blades > 0; t += DT) {
      sim.setInput(WORLD.source.x - sim.state.player.x, WORLD.source.z - sim.state.player.z, 1);
      sim.step(DT);
      drain();
    }
    expect(sim.state.player.blades).toBe(0);
    expect(events.filter((e) => e === 'bladeBroken').length).toBe(2);
    const doubles = events.filter((e) => e === 'doubleCarve').length;
    // 2 blades × durability pieces from the chef's own cuts; double-carve pieces are free.
    const per = UPGRADES.durability.values[0];
    const chefPieces = sim.state.collectibles.length - doubles;
    expect(chefPieces).toBeGreaterThanOrEqual(2 * per);
    expect(chefPieces).toBeLessThanOrEqual(2 * per + 2); // + flush of the last partial buffer
    expect(Math.abs(computeLedger(sim.state).mismatch)).toBeLessThan(1e-9);
  });

  it('precision makes longer pieces without breaking conservation', () => {
    const sim = new Simulation();
    sim.state.upgrades.precision = 2; // 1.5 U per piece
    const bot = new Bot(sim);
    bot.carve(5);
    const full = sim.state.collectibles.filter((r) => r.mass > 1.2);
    expect(full.length).toBeGreaterThan(3);
    for (const r of full) expect(r.mass).toBeLessThanOrEqual(1.5 * 1.6 + 1e-9); // incl. double-carve bite
    expect(bot.maxMismatch).toBeLessThan(1e-9);
  });

  it('double carve happens sometimes and only moves real candy mass', () => {
    const sim = new Simulation();
    const bot = new Bot(sim);
    const src0 = computeLedger(sim.state).source;
    for (let i = 0; i < 12; i++) bot.carve(3);
    expect(bot.seen.doubleCarve ?? 0).toBeGreaterThan(0);
    const l = computeLedger(sim.state);
    expect(src0 - l.source).toBeCloseTo(l.world + l.buffers, 6);
    expect(bot.maxMismatch).toBeLessThan(1e-9);
  });

  it('upgrade pads open only when you stop on them (walking across does nothing)', () => {
    const sim = new Simulation();
    const bot = new Bot(sim);
    const pad = WORLD.upgradePads[0];
    // Walk straight across the pad at full speed.
    bot.walkTo(pad.x - 1.2, pad.z);
    const before = bot.seen.stationEntered ?? 0;
    bot.walkTo(pad.x + 1.2, pad.z);
    expect(bot.seen.stationEntered ?? 0).toBe(before);
    // Stop on it: opens once, however long you stand there.
    bot.walkTo(pad.x, pad.z);
    bot.idle(2);
    expect((bot.seen.stationEntered ?? 0) - before).toBe(1);
    expect(sim.state.player.station).toBe(pad.id);
    bot.walkTo(pad.x + 1.5, pad.z + 0.5);
    expect(bot.seen.stationLeft ?? 0).toBe(1);
    expect(sim.state.player.station).toBe(null);
  });

  it('milestones along the carved bar pay once per contract instance, also across reload', () => {
    const sim = new Simulation();
    const c = sim.state.contract;
    // Carve 42% straight out of the source into the sold ledger.
    let need = c.initialRaw * 0.42;
    for (const layer of c.sectors)
      for (let i = 0; i < layer.length && need > 0; i++) {
        const t = Math.min(layer[i], need);
        layer[i] -= t;
        need -= t;
        c.soldMass += t;
      }
    sim.step(DT);
    const got = sim.drainEvents().filter((e) => e.type === 'milestone');
    expect(got.length).toBe(MILESTONES.filter((m) => m.at <= 0.42).length);
    const coins = sim.state.coins;
    const loaded = new Simulation(deserialize(serialize(sim.state)).state);
    for (let i = 0; i < 10; i++) loaded.step(DT);
    expect(loaded.drainEvents().filter((e) => e.type === 'milestone').length).toBe(0);
    expect(loaded.state.coins).toBe(coins);
  });
});
