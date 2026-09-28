import { CART, MACHINE, MOVE, WORLD } from '../config';
import type { SimContext } from '../context';
import { allocId, cargoMass, cartCapacity, hopperMass, pickupRadius, pickupRate, unloadRate } from '../state';
import type { GameState } from '../types';
import { cartSpeedNow, intakePosition } from './MovementSystem';

export function inUnloadZone(state: GameState): boolean {
  const z = WORLD.unloadZone;
  const c = state.cart;
  return Math.abs(c.x - z.x) <= z.hw && Math.abs(c.z - z.z) <= z.hd;
}

export function cartFree(state: GameState): number {
  return Math.max(0, cartCapacity(state) - cargoMass(state));
}

export function hopperFree(state: GameState): number {
  return Math.max(0, MACHINE.hopperCapacity - hopperMass(state));
}

/** Pick up rolls near the intake. Each pickup is a single transaction world → cart. */
export function updatePickup(ctx: SimContext, dt: number): number {
  const { state, events } = ctx;
  const cart = state.cart;
  const p = state.player;
  if (p.mode === 'boarding' || p.mode === 'disembarking') return 0;
  const cap = cartCapacity(state);
  let free = cap - cargoMass(state);
  if (free > 1e-6) cart.fullNotified = false;
  if (free <= 1e-6) {
    cart.pickupBudget = Math.min(cart.pickupBudget, 1);
    return 0;
  }
  const rate = pickupRate(state);
  cart.pickupBudget = Math.min(cart.pickupBudget + rate * dt, Math.max(1, rate * 0.25));
  const intake = intakePosition(state);
  const radius = pickupRadius(state);
  const r2 = radius * radius;
  const b2 = CART.bodySweepRadius * CART.bodySweepRadius;
  let pickedTotal = 0;
  // Candidates near the drum — or directly under the cart body, so driving over a roll always takes it.
  const inRange = state.collectibles
    .filter((r) => r.age >= CART.settleTime && ((r.x - intake.x) ** 2 + (r.z - intake.z) ** 2 <= r2 || (r.x - cart.x) ** 2 + (r.z - cart.z) ** 2 <= b2))
    .sort((a, b) => (a.x - intake.x) ** 2 + (a.z - intake.z) ** 2 - ((b.x - intake.x) ** 2 + (b.z - intake.z) ** 2));
  for (const roll of inRange) {
    if (free <= 1e-6) break;
    const want = Math.min(roll.mass, free);
    if (cart.pickupBudget < Math.min(want, 1) - 1e-9) break;
    const take = want;
    const partial = take < roll.mass - 1e-9;
    // Transaction: remove from world (or shrink the pile) and add to cargo in one step.
    if (partial) {
      roll.mass -= take;
    } else {
      state.collectibles.splice(state.collectibles.indexOf(roll), 1);
    }
    state.cart.cargo.push({ id: allocId(state), ciid: roll.ciid, defId: roll.defId, layer: roll.layer, mass: take });
    cart.pickupBudget -= take;
    free -= take;
    pickedTotal += take;
    state.stats.collected += take;
    events.push({ type: 'rawCollected', id: roll.id, x: roll.x, z: roll.z, mass: take, layer: roll.layer, defId: roll.defId, partial });
  }
  if (pickedTotal > 0) state.tutorial.flags.collect = true;
  if (free <= 1e-6 && !cart.fullNotified) {
    cart.fullNotified = true;
    events.push({ type: 'capacityReached' });
  }
  return pickedTotal;
}

/** Transfer cargo into the hopper while the cart sits still on the unload pad. */
export function updateUnload(ctx: SimContext, dt: number): number {
  const { state, events } = ctx;
  const cart = state.cart;
  if (!inUnloadZone(state)) return 0;
  if (cartSpeedNow(state) > MOVE.unloadMaxSpeed) return 0;
  if (cart.cargo.length === 0) return 0;
  const space = hopperFree(state);
  if (space <= 1e-6) {
    return -1; // hopper full, nothing lost
  }
  let budget = Math.min(unloadRate(state) * dt, space);
  let moved = 0;
  while (budget > 1e-12 && cart.cargo.length > 0) {
    const item = cart.cargo[0];
    const take = Math.min(item.mass, budget);
    item.mass -= take;
    budget -= take;
    moved += take;
    const hopper = state.machine.hopper;
    const last = hopper[hopper.length - 1];
    if (last && last.ciid === item.ciid && last.layer === item.layer) last.mass += take;
    else hopper.push({ ciid: item.ciid, defId: item.defId, layer: item.layer, mass: take });
    if (item.mass <= 1e-9) {
      // Fold float dust into the hopper so nothing is lost.
      if (item.mass > 0) hopper[hopper.length - 1].mass += item.mass;
      cart.cargo.shift();
      events.push({ type: 'rawUnloaded', mass: 1, layer: item.layer, defId: item.defId });
    }
  }
  if (moved > 0) {
    state.stats.unloaded += moved;
    state.tutorial.flags.deliver = true;
  }
  return moved;
}

export function updateCollection(ctx: SimContext, dt: number): void {
  const { state, events } = ctx;
  for (const r of state.collectibles) r.age += dt;
  const picked = updatePickup(ctx, dt);
  const moved = updateUnload(ctx, dt);
  const cart = state.cart;
  if (moved < 0) {
    if (!cart.hopperFullNotified) events.push({ type: 'hopperFull' });
    cart.hopperFullNotified = true;
  } else {
    cart.hopperFullNotified = false;
  }
  if (moved !== 0) cart.activity = 'unloading';
  else if (picked > 0) cart.activity = 'collecting';
  else cart.activity = 'none';
}
