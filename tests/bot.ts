// Headless "player" used by integration tests: it only uses the same inputs a
// human has (movement direction; boarding happens by waiting beside the cart and
// leaving by parking in the bay). No debug coins.
import { WORLD, CART, MOVE, CANDY } from '../src/game/config';
import { Simulation } from '../src/game/Simulation';
import { findPath } from '../src/game/nav';
import { cargoMass, cartCapacity, computeLedger, hasBlade } from '../src/game/state';
import { inUnloadZone } from '../src/game/systems/CollectionSystem';

export const DT = 1 / 60;

/** A spot on the floor just in front of the candy (reachable at any size). */
export const FRONT = { x: WORLD.source.x, z: WORLD.source.z + WORLD.source.radius + 0.45 };
/** Open floor away from the candy and the stations. */
export const AWAY = { x: WORLD.playerStart.x, z: WORLD.playerStart.z };

/**
 * The live candy is extremely hard (CANDY.massScale). End-to-end tests shrink the
 * current contract back to the base design mass so a whole contract fits in a test.
 * Every raw quantity is divided by the same factor, so the ledger stays balanced.
 */
export function shrinkContract(sim: Simulation, factor = CANDY.massScale): void {
  const c = sim.state.contract;
  for (const layer of c.sectors) for (let i = 0; i < layer.length; i++) layer[i] /= factor;
  c.initialSectorMass = c.initialSectorMass.map((m) => m / factor);
  c.initialRaw /= factor;
}

export class Bot {
  maxMismatch = 0;
  constructor(public sim: Simulation) {}

  get s() {
    return this.sim.state;
  }

  readonly seen: Record<string, number> = {};

  tick(n = 1): void {
    for (let i = 0; i < n; i++) {
      this.sim.step(DT);
      for (const e of this.sim.drainEvents()) this.seen[e.type] = (this.seen[e.type] ?? 0) + 1;
      const l = computeLedger(this.s);
      this.maxMismatch = Math.max(this.maxMismatch, Math.abs(l.mismatch));
    }
  }

  idle(seconds: number): void {
    this.sim.setInput(0, 0, 0);
    this.tick(Math.round(seconds / DT));
  }

  walkTo(x: number, z: number, maxSeconds = 12): boolean {
    for (let t = 0; t < maxSeconds; t += DT) {
      const p = this.s.player;
      const dx = x - p.x;
      const dz = z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) {
        this.sim.setInput(0, 0, 0);
        this.tick(3);
        return true;
      }
      this.sim.setInput(dx, dz, Math.min(1, d * 2));
      this.tick();
    }
    this.sim.setInput(0, 0, 0);
    return false;
  }

  /** Walk onto the blade pad (refills to capacity). */
  fetchBlade(): boolean {
    this.walkTo(WORLD.bladePad.x, WORLD.bladePad.z, 15);
    this.tick(2);
    return hasBlade(this.s);
  }

  /** Hold the stick toward the candy centre for `seconds` of carving (fetches blades as needed). */
  carve(seconds: number): number {
    const before = this.s.stats.carved;
    let spent = 0;
    let fetches = 0;
    while (spent < seconds && fetches < 50) {
      if (this.s.player.blades === 0) {
        this.fetchBlade();
        fetches++;
        continue;
      }
      const p = this.s.player;
      this.sim.setInput(WORLD.source.x - p.x, WORLD.source.z - p.z, 1);
      this.tick();
      spent += DT;
    }
    this.sim.setInput(0, 0, 0);
    this.tick(30);
    return this.s.stats.carved - before;
  }

  /** Walk up to the cart and wait beside it until the chef hops in by himself. */
  board(): boolean {
    const c = this.s.cart;
    this.walkTo(c.x + 0.95, c.z, 15);
    this.idle(MOVE.autoBoardTime + 0.4);
    return this.s.player.mode === 'driving';
  }

  /** Return the cart to the parking bay; the chef hops out there. */
  leave(): boolean {
    this.driveTo(WORLD.parkBay.x, WORLD.parkBay.z, 25, 0.3);
    this.idle(0.8);
    return this.s.player.mode === 'onFoot';
  }

  driveTo(x: number, z: number, maxSeconds = 20, arrive = 0.3): boolean {
    let path = findPath(this.s.contract, { x: this.s.cart.x, z: this.s.cart.z }, { x, z });
    let replan = 0;
    for (let t = 0; t < maxSeconds; t += DT) {
      const c = this.s.cart;
      if (Math.hypot(x - c.x, z - c.z) < arrive) {
        this.sim.setInput(0, 0, 0);
        this.tick(15);
        return true;
      }
      if ((replan += DT) > 1) {
        replan = 0;
        path = findPath(this.s.contract, { x: c.x, z: c.z }, { x, z });
      }
      while (path.length > 1 && Math.hypot(path[0].x - c.x, path[0].z - c.z) < 0.5) path.shift();
      const wp = path[0] ?? { x, z };
      const d = Math.hypot(wp.x - c.x, wp.z - c.z);
      this.sim.setInput(wp.x - c.x, wp.z - c.z, path.length <= 1 ? Math.max(0.3, Math.min(1, d)) : 1);
      this.tick();
    }
    this.sim.setInput(0, 0, 0);
    return false;
  }

  /** Sweep loose rolls until the cart is full or no settled rolls remain. */
  collect(maxSeconds = 40): number {
    const before = cargoMass(this.s);
    for (let t = 0; t < maxSeconds; ) {
      if (cargoMass(this.s) >= cartCapacity(this.s) - 1e-6) break;
      const rolls = this.s.collectibles.filter((r) => r.age >= CART.settleTime);
      if (rolls.length === 0) break;
      const c = this.s.cart;
      rolls.sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
      const r = rolls[0];
      const start = this.s.stats.collected;
      const ok = this.driveTo(r.x, r.z, 8, 0.45);
      t += 8;
      if (!ok && this.s.stats.collected === start) break;
    }
    return cargoMass(this.s) - before;
  }

  unload(maxSeconds = 20): number {
    const before = this.s.stats.unloaded;
    this.driveTo(WORLD.unloadZone.x, WORLD.unloadZone.z, 20, 0.25);
    for (let t = 0; t < maxSeconds && this.s.cart.cargo.length > 0 && inUnloadZone(this.s); t += DT) this.tick();
    return this.s.stats.unloaded - before;
  }
}
