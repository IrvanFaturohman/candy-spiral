import { UPGRADES, type UpgradeId } from '../config';
import type { SimContext } from '../context';
import { nextUpgradeCost, upgradeAvailable } from '../state';

/**
 * Atomic purchase: the balance and level are re-read at transaction time, so a
 * double tap buys at most what the balance covers and never a free level.
 */
export function purchaseUpgrade(ctx: SimContext, id: UpgradeId): boolean {
  const { state, events } = ctx;
  const def = UPGRADES[id];
  if (!def || !upgradeAvailable(state, id)) {
    events.push({ type: 'purchaseFailed', id });
    return false;
  }
  const cost = nextUpgradeCost(state, id);
  if (cost === null || !Number.isFinite(cost) || state.coins < cost) {
    events.push({ type: 'purchaseFailed', id });
    return false;
  }
  state.coins -= cost;
  state.upgrades[id] = (state.upgrades[id] | 0) + 1;
  state.tutorial.flags.upgrade = true;
  if (id === 'autopilot') {
    state.autopilotEnabled = true;
    if (state.player.mode !== 'driving' && state.player.mode !== 'boarding') {
      state.cart.control = 'autopilot';
      state.cart.auto.phase = 'idle';
    }
  }
  events.push({ type: 'upgradePurchased', id, level: state.upgrades[id] });
  return true;
}

export function setAutopilot(ctx: SimContext, on: boolean): void {
  const { state, events } = ctx;
  if ((state.upgrades.autopilot | 0) < 1) return;
  state.autopilotEnabled = on;
  const p = state.player.mode;
  if (p !== 'driving' && p !== 'boarding') {
    state.cart.control = on ? 'autopilot' : 'idle';
    state.cart.auto.phase = 'idle';
  }
  events.push({ type: 'autopilotToggled', on });
}
