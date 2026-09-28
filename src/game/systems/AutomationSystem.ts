import { CART, WORLD } from '../config';
import type { SimContext } from '../context';
import { findPath, type P2 } from '../nav';
import { cargoMass, cartCapacity } from '../state';
import type { AutopilotPhase, Collectible, GameState } from '../types';
import { inUnloadZone } from './CollectionSystem';
import { driveCart, intakePosition } from './MovementSystem';

const EPS = 1e-6;

function settled(state: GameState): Collectible[] {
  return state.collectibles.filter((r) => r.age >= CART.settleTime);
}

function hasUnsettled(state: GameState): boolean {
  return state.collectibles.some((r) => r.age < CART.settleTime);
}

function setPhase(state: GameState, phase: AutopilotPhase, roll = -1): void {
  const a = state.cart.auto;
  a.phase = phase;
  a.phaseTime = 0;
  a.targetRoll = roll;
  a.path = [];
  a.pathGoal = null;
  a.stuckTime = 0;
  a.lastProgressDist = Infinity;
  if (phase === 'toMachine' || phase === 'toRolls') a.waitWithCargo = 0;
}

/** Pick the roll with the most mass lying around it, discounted by distance. */
function bestRoll(state: GameState): Collectible | null {
  const rolls = settled(state);
  const c = state.cart;
  let best: Collectible | null = null;
  let bestScore = 0;
  for (const r of rolls) {
    let cluster = 0;
    for (const q of rolls) if ((q.x - r.x) ** 2 + (q.z - r.z) ** 2 < CLUSTER_R2) cluster += q.mass;
    const score = cluster / (1 + 0.25 * Math.hypot(r.x - c.x, r.z - c.z));
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

const CLUSTER_R2 = 1.3 * 1.3;

/** Choose the next job. Partial loads are always deliverable so a contract can never stall. */
export function decideAutopilot(state: GameState): void {
  const cap = cartCapacity(state);
  const cargo = cargoMass(state);
  const c = state.cart;
  if (cargo >= cap * CART.deliverRatio - EPS) return setPhase(state, 'toMachine');
  const target = bestRoll(state);
  if (target) return setPhase(state, 'toRolls', target.id);
  if (cargo > EPS) {
    const peelersIdle = !state.peelers.player.buffer && !state.peelers.helper.buffer;
    const sourceDone = state.contract.status !== 'active';
    if ((sourceDone && peelersIdle && !hasUnsettled(state)) || c.auto.waitWithCargo >= CART.partialWaitSeconds) return setPhase(state, 'toMachine');
  }
  if (c.auto.phase !== 'standby') setPhase(state, 'standby');
}

/** Follow a planned path to `goal`. Returns remaining distance to the goal. */
function followPath(state: GameState, goal: P2, dt: number, speedScale: number, arrive: number): number {
  const c = state.cart;
  const a = c.auto;
  const replan = !a.pathGoal || Math.hypot(a.pathGoal.x - goal.x, a.pathGoal.z - goal.z) > 0.25 || a.path.length === 0 || a.phaseTime % 1.5 < dt;
  if (replan) {
    a.path = findPath(state.contract, { x: c.x, z: c.z }, goal);
    a.pathGoal = { x: goal.x, z: goal.z };
  }
  while (a.path.length > 1 && Math.hypot(a.path[0].x - c.x, a.path[0].z - c.z) < 0.5) a.path.shift();
  const wp = a.path[0] ?? goal;
  const dx = wp.x - c.x;
  const dz = wp.z - c.z;
  const d = Math.hypot(dx, dz);
  const toGoal = Math.hypot(goal.x - c.x, goal.z - c.z);
  if (toGoal <= arrive) {
    driveCart(state, 0, 0, 0, dt);
    return toGoal;
  }
  const last = a.path.length <= 1;
  const mag = last ? Math.max(0.25, Math.min(1, d / 1.1)) : 1;
  driveCart(state, dx / (d || 1), dz / (d || 1), mag, dt, speedScale);
  // Stuck detection → re-plan (no teleports).
  if (toGoal < a.lastProgressDist - 0.05) {
    a.lastProgressDist = toGoal;
    a.stuckTime = 0;
  } else {
    a.stuckTime += dt;
    if (a.stuckTime > 1.4) {
      a.path = [];
      a.pathGoal = null;
      a.lastProgressDist = toGoal;
      a.stuckTime = 0;
    }
  }
  return toGoal;
}

export function updateAutopilot(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  const c = state.cart;
  if (c.control !== 'autopilot') return;
  const a = c.auto;
  a.phaseTime += dt;
  const cap = cartCapacity(state);
  const cargo = cargoMass(state);
  switch (a.phase) {
    case 'idle':
      driveCart(state, 0, 0, 0, dt);
      decideAutopilot(state);
      break;
    case 'toRolls': {
      if (cargo >= cap - EPS) return setPhase(state, 'toMachine');
      const target = state.collectibles.find((r) => r.id === a.targetRoll);
      if (!target) {
        driveCart(state, 0, 0, 0, dt);
        return decideAutopilot(state);
      }
      const rem = followPath(state, { x: target.x, z: target.z }, dt, 1, 0.3);
      if (rem < 1.6) setPhase(state, 'collecting', target.id);
      break;
    }
    case 'collecting': {
      if (cargo >= cap - EPS) return setPhase(state, 'toMachine');
      // Sweep the nearest rolls around the cart, one after another.
      const intake = intakePosition(state);
      let target: { x: number; z: number } | null = null;
      let bestD = Infinity;
      for (const r of state.collectibles) {
        if (r.age < CART.settleTime) continue;
        const dc = Math.hypot(r.x - c.x, r.z - c.z);
        if (dc > 2.6) continue;
        const d = Math.hypot(r.x - intake.x, r.z - intake.z);
        if (d < bestD) {
          bestD = d;
          target = r;
        }
      }
      if (!target || a.phaseTime > 9) {
        driveCart(state, 0, 0, 0, dt);
        return decideAutopilot(state);
      }
      const dx = target.x - c.x;
      const dz = target.z - c.z;
      const d = Math.hypot(dx, dz) || 1;
      driveCart(state, dx / d, dz / d, Math.max(0.3, Math.min(0.7, d / 1.4)), dt);
      break;
    }
    case 'toMachine': {
      const goal = { x: WORLD.unloadZone.x, z: WORLD.unloadZone.z };
      const rem = followPath(state, goal, dt, 1, 0.25);
      if (inUnloadZone(state) && rem < 0.4) setPhase(state, 'unloading');
      if (cargo <= EPS) setPhase(state, 'idle');
      break;
    }
    case 'unloading': {
      driveCart(state, 0, 0, 0, dt);
      if (!inUnloadZone(state)) return setPhase(state, 'toMachine');
      if (cargo <= EPS) setPhase(state, 'idle');
      break;
    }
    case 'standby':
    case 'waiting': {
      const goal = { x: WORLD.cartStandby.x, z: WORLD.cartStandby.z };
      followPath(state, goal, dt, 0.8, 0.35);
      if (cargo > EPS) a.waitWithCargo += dt;
      else a.waitWithCargo = 0;
      if (a.phaseTime > 0.5) {
        const before = a.phase;
        decideAutopilot(state);
        if (a.phase === before) a.phaseTime = 0.0001;
      }
      break;
    }
  }
}
