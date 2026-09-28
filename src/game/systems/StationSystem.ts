import { CONTRACTS, MILESTONES, WORLD } from '../config';
import type { SimContext } from '../context';
import { bladeCapacity, bladeDurability, sourceRemaining } from '../state';
import type { GameState } from '../types';

export function onBladePad(state: GameState): boolean {
  const p = state.player;
  const pad = WORLD.bladePad;
  return (p.mode === 'onFoot' || p.mode === 'carving') && Math.hypot(p.x - pad.x, p.z - pad.z) <= pad.r;
}

/** Which upgrade pad (if any) the chef is standing on. */
export function upgradePadAt(state: GameState): string | null {
  const p = state.player;
  if (p.mode !== 'onFoot') return null;
  for (const pad of WORLD.upgradePads) if (Math.hypot(p.x - pad.x, p.z - pad.z) <= pad.r) return pad.id;
  return null;
}

/**
 * Walk-on stations (no HUD buttons):
 * - blade pad: refill carried blades to capacity with fresh ones;
 * - upgrade pads: entering one emits `stationEntered` once (UI opens that group).
 */
export function updateStations(ctx: SimContext, dt: number): void {
  const { state, events } = ctx;
  const p = state.player;
  if (onBladePad(state)) {
    const cap = bladeCapacity(state);
    const full = bladeDurability(state);
    if (p.blades < cap || (p.blades > 0 && p.bladeWear < full)) {
      p.blades = cap;
      p.bladeWear = full;
      p.bladeSwap = 0;
      state.tutorial.flags.blade = true;
      events.push({ type: 'bladeTaken', blades: p.blades });
    }
  }
  // Upgrade pads open only once the chef stops on them, so walking across never pops a menu.
  const pad = upgradePadAt(state);
  if (!pad) {
    p.stationDwell = 0;
    if (p.station) {
      p.station = null;
      events.push({ type: 'stationLeft' });
    }
    return;
  }
  if (p.station === pad) return;
  const slow = Math.hypot(p.vx, p.vz) < STATION_STOP_SPEED;
  p.stationDwell = slow ? p.stationDwell + dt : 0;
  if (p.stationDwell >= STATION_DWELL) {
    p.station = pad;
    events.push({ type: 'stationEntered', station: pad });
  }
}

const STATION_DWELL = 0.45;
const STATION_STOP_SPEED = 0.9;

/** Reward for one milestone: a multiple of the contract's product value. */
export function milestoneReward(defId: number, index: number): number {
  return Math.max(1, Math.round(CONTRACTS[defId].productValue * MILESTONES[index].mult));
}

/** Pay each milestone on the carved bar exactly once per contract instance. */
export function updateMilestones(ctx: SimContext): void {
  const { state, events } = ctx;
  const c = state.contract;
  if (c.initialRaw <= 0) return;
  const carved = 1 - sourceRemaining(c) / c.initialRaw;
  for (let i = 0; i < MILESTONES.length; i++) {
    const bit = 1 << i;
    if (c.milestones & bit) continue;
    if (carved + 1e-9 < MILESTONES[i].at) continue;
    c.milestones |= bit;
    const reward = milestoneReward(c.defId, i);
    state.coins += reward;
    state.stats.coinsEarned += reward;
    events.push({ type: 'milestone', index: i, kind: MILESTONES[i].kind, reward });
  }
}
