import { CONTRACTS, MACHINE } from '../config';
import type { SimContext } from '../context';
import { allocId, machineRate, rawUpstream } from '../state';
import type { GameState } from '../types';

function hopperMassFor(state: GameState, ciid: number): number {
  let s = 0;
  for (const b of state.machine.hopper) if (b.ciid === ciid) s += b.mass;
  return s;
}

/** Remove `amount` of one contract's raw from the hopper FIFO. Returns what was actually removed. */
function drawFromHopper(state: GameState, ciid: number, amount: number): number {
  let need = amount;
  const hopper = state.machine.hopper;
  for (let i = 0; i < hopper.length && need > 1e-12; ) {
    const b = hopper[i];
    if (b.ciid !== ciid) {
      i++;
      continue;
    }
    const take = Math.min(b.mass, need);
    b.mass -= take;
    need -= take;
    if (b.mass <= 1e-12) hopper.splice(i, 1);
    else i++;
  }
  return amount - need;
}

/** Try to start a production cycle for the head-of-queue contract. */
function tryStartCycle(ctx: SimContext): boolean {
  const { state, events } = ctx;
  const m = state.machine;
  if (m.cycle || m.hopper.length === 0) return false;
  const head = m.hopper[0];
  const available = hopperMassFor(state, head.ciid);
  const unit = MACHINE.unitsPerProduct;
  let mass = 0;
  if (available >= unit - MACHINE.massEps) {
    mass = drawFromHopper(state, head.ciid, Math.min(unit, available));
  } else if (rawUpstream(state, head.ciid) <= MACHINE.massEps) {
    // Nothing more of this contract is coming: finish the tail as a final (partial) product.
    mass = drawFromHopper(state, head.ciid, available);
    if (mass <= MACHINE.dustMass) {
      // Float residue: retire it into the ledger instead of producing an empty product.
      if (state.contract.ciid === head.ciid) state.contract.dustMass += mass;
      return false;
    }
  } else {
    return false;
  }
  m.cycle = { ciid: head.ciid, defId: head.defId, mass, progress: 0, productId: allocId(state) };
  events.push({ type: 'productionStarted', defId: head.defId });
  return true;
}

function finishCycle(ctx: SimContext): void {
  const { state, events } = ctx;
  const m = state.machine;
  const cyc = m.cycle!;
  const def = CONTRACTS[cyc.defId];
  const unit = MACHINE.unitsPerProduct;
  const count = cyc.mass >= unit - MACHINE.massEps ? 1 : cyc.mass / unit;
  const value = Math.max(0, Math.round(def.productValue * Math.min(1, cyc.mass / unit)));
  const conv = state.conveyor;
  let merged = false;
  if (conv.length >= MACHINE.maxVisualProducts) {
    // Package on a crowded belt: the newest product carries the extra quantity.
    const last = conv[conv.length - 1];
    if (last.ciid === cyc.ciid) {
      last.count += count;
      last.mass += cyc.mass;
      last.value += value;
      merged = true;
    }
  }
  if (!merged) conv.push({ id: cyc.productId, ciid: cyc.ciid, defId: cyc.defId, count, mass: cyc.mass, value, t: 0 });
  m.cycle = null;
  m.producedTotal += 1;
  state.stats.produced += 1;
  events.push({ type: 'productProduced', id: cyc.productId, defId: cyc.defId, merged });
}

export function updateMachine(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  const m = state.machine;
  const rate = machineRate(state);
  let time = dt;
  // Loop so high machine rates stay frame-rate independent.
  for (let guard = 0; guard < 8 && time > 1e-9; guard++) {
    if (!m.cycle && !tryStartCycle(ctx)) break;
    const cyc = m.cycle!;
    const duration = Math.max(1e-3, cyc.mass / rate);
    const need = (1 - cyc.progress) * duration;
    if (time >= need) {
      time -= need;
      cyc.progress = 1;
      finishCycle(ctx);
    } else {
      cyc.progress += time / duration;
      time = 0;
    }
  }
  if (m.cycle) m.status = 'processing';
  else if (m.hopper.length > 0) m.status = 'blocked';
  else m.status = 'idle';
}

export function updateConveyor(ctx: SimContext, dt: number): void {
  const { state, events } = ctx;
  const conv = state.conveyor;
  const step = dt / MACHINE.conveyorTravel;
  for (let i = 0; i < conv.length; i++) {
    // Keep a little spacing so products never overlap on the belt.
    const ahead = i > 0 ? conv[i - 1].t : Infinity;
    const next = Math.min(conv[i].t + step, ahead - 0.07);
    conv[i].t = Math.max(conv[i].t, next);
  }
  // Sell exactly once: remove from the belt and credit in the same transaction.
  while (conv.length > 0 && conv[0].t >= 1) {
    const p = conv.shift()!;
    state.coins += p.value;
    state.stats.sold += p.count;
    state.stats.coinsEarned += p.value;
    if (state.contract.ciid === p.ciid) {
      state.contract.soldCount += p.count;
      state.contract.soldMass += p.mass;
      state.contract.revenue += p.value;
    }
    state.tutorial.flags.sell = true;
    events.push({ type: 'productSold', id: p.id, defId: p.defId, count: p.count, value: p.value });
  }
}
