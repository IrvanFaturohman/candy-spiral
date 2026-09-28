import { describe, expect, it } from 'vitest';
import { CANDY, CONTRACTS, UPGRADES, WORLD } from '../src/game/config';
import { Simulation } from '../src/game/Simulation';
import { computeLedger, contractRawTotal, targetSpinRate } from '../src/game/state';
import { Bot, DT, FRONT, shrinkContract } from './bot';

// Pacing measurements used for TUNING.md. They assert loose bounds so a
// tuning change that breaks the intended feel shows up as a failing test.

describe('pacing', () => {
  it('measured steady-hold output per scraper level', () => {
    const rows: string[] = [];
    let prev = 0;
    for (let lvl = 0; lvl < UPGRADES.scraper.values.length; lvl++) {
      const sim = new Simulation();
      sim.state.upgrades.scraper = lvl;
      sim.state.contract.spinRate = targetSpinRate(sim.state);
      const bot = new Bot(sim);
      bot.walkTo(FRONT.x, FRONT.z);
      bot.carve(0.5); // make contact first; measure only the steady hold
      const before = sim.state.stats.carved;
      bot.carve(8);
      const rate = (sim.state.stats.carved - before) / 8.5;
      rows.push(`L${lvl + 1}: config ${UPGRADES.scraper.values[lvl]} U/s → measured ${rate.toFixed(2)} U/s (spin ${((targetSpinRate(sim.state) * 180) / Math.PI).toFixed(0)}°/s)`);
      expect(rate).toBeGreaterThan(prev);
      prev = rate;
    }
    console.log(rows.join('\n'));
  });

  it('contract 2 (base-size candy) with autopilot while the player only carves', () => {
    const sim = new Simulation();
    const s = sim.state;
    // State after a normal contract 1: a few upgrades bought, autopilot owned.
    s.contractsCompleted = [0];
    s.totalContractsCompleted = 1;
    s.contract.status = 'completed';
    s.upgrades.scraper = 1;
    s.upgrades.capacity = 1;
    s.upgrades.autopilot = 1;
    s.autopilotEnabled = true;
    s.cart.control = 'autopilot';
    sim.startContract(1);
    shrinkContract(sim);
    const bot = new Bot(sim);
    const t0 = s.time;
    for (let i = 0; i < 600 && s.contract.status !== 'completed'; i++) {
      if (s.contract.activeLayer < 5) bot.carve(5);
      else bot.idle(2);
    }
    const minutes = (s.time - t0) / 60;
    console.log(`contract 2 (autopilot, manual carving): ${minutes.toFixed(1)} min, revenue ${s.contract.revenue}`);
    expect(s.contract.status).toBe('completed');
    expect(minutes).toBeLessThan(20);
    expect(bot.maxMismatch).toBeLessThan(1e-6);
    expect(s.contract.revenue).toBe((CONTRACTS[1].productValue * contractRawTotal(1)) / CANDY.massScale / 2 + CONTRACTS[1].bonus);
  });

  it('contract 3 (base-size candy) with helper + autopilot, player idle (idle loop must still finish)', () => {
    const sim = new Simulation();
    const s = sim.state;
    s.contractsCompleted = [0, 1];
    s.totalContractsCompleted = 2;
    s.contract.status = 'completed';
    s.upgrades.autopilot = 1;
    s.upgrades.helper = 1;
    s.upgrades.machine = 1;
    s.autopilotEnabled = true;
    s.cart.control = 'autopilot';
    sim.startContract(2);
    shrinkContract(sim);
    const bot = new Bot(sim);
    // Park the player out of the way.
    bot.walkTo(WORLD.parkBay.x + 1.5, WORLD.parkBay.z - 2);
    const t0 = s.time;
    for (let i = 0; i < 7200 && s.contract.status !== 'completed'; i++) bot.idle(1);
    const minutes = (s.time - t0) / 60;
    console.log(`contract 3 fully idle (helper 0.75 U/s + autopilot): ${minutes.toFixed(1)} min`);
    expect(s.contract.status).toBe('completed');
    expect(Math.abs(computeLedger(s).mismatch)).toBeLessThan(1e-6);
  });

  it('player never gets stuck inside the candy after a contract reset', () => {
    const sim = new Simulation();
    const s = sim.state;
    for (const l of s.contract.sectors) l.fill(0);
    s.contract.activeLayer = 5;
    s.contract.soldMass = s.contract.initialRaw;
    s.player.x = WORLD.source.x + 0.9;
    s.player.z = WORLD.source.z;
    s.cart.x = WORLD.source.x - 1.2;
    s.cart.z = WORLD.source.z + 0.4;
    sim.step(DT);
    sim.step(DT);
    expect(s.contract.status).toBe('completed');
    sim.startNextContract();
    const dp = Math.hypot(s.player.x - WORLD.source.x, s.player.z - WORLD.source.z);
    const dc = Math.hypot(s.cart.x - WORLD.source.x, s.cart.z - WORLD.source.z);
    expect(dp).toBeGreaterThan(WORLD.source.radius);
    expect(dc).toBeGreaterThan(WORLD.source.radius);
  });
});

describe('real-size (hard) candy', () => {
  it('five minutes of normal play barely dents it, but rolls, coins and milestones keep coming', () => {
    const sim = new Simulation();
    const bot = new Bot(sim);
    const s = sim.state;
    const buyOrder = ['durability', 'scraper', 'capacity', 'bladeCap', 'precision', 'machine'] as const;
    let milestones = 0;
    while (s.time < 300) {
      if (s.player.mode === 'driving') bot.leave();
      bot.carve(8);
      bot.board();
      bot.collect(25);
      bot.unload();
      bot.leave();
      for (const id of buyOrder) sim.purchase(id);
      milestones = (bot.seen.milestone ?? 0);
    }
    const remaining = computeLedger(s).source / s.contract.initialRaw;
    console.log(
      `5 min real candy: remaining ${(remaining * 100).toFixed(2)}%, carved ${s.stats.carved.toFixed(0)} U, ` +
        `sold ${s.stats.sold} products, coins earned ${s.stats.coinsEarned}, milestones ${milestones}, blades broken ${bot.seen.bladeBroken ?? 0}, ` +
        `upgrades ${JSON.stringify(s.upgrades)}`,
    );
    expect(remaining).toBeGreaterThan(0.9); // still > 90% after 5 minutes
    expect(s.stats.sold).toBeGreaterThan(20);
    expect(milestones).toBeGreaterThanOrEqual(1);
    expect(bot.maxMismatch).toBeLessThan(1e-6);
  });
});
