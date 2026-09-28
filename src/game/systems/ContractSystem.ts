import { CONTRACTS } from '../config';
import type { SimContext } from '../context';
import { computeLedger, createContractInstance, NUM_LAYERS } from '../state';
import { flushAllPeelers } from './PeelingSystem';
import { relocateIfCovered } from './MovementSystem';

const EPS = 1e-6;

/**
 * active → sourceEmpty (all layers carved) → settling (all raw turned into products)
 * → completed (every product sold; bonus paid exactly once per instance).
 */
export function updateContract(ctx: SimContext): void {
  const { state, events } = ctx;
  const c = state.contract;
  if (c.status === 'active' && c.activeLayer >= NUM_LAYERS) {
    c.status = 'sourceEmpty';
    events.push({ type: 'sourceEmptied', defId: c.defId });
  }
  if (c.status === 'sourceEmpty') {
    // Nothing more will be carved: make sure no fractional buffer is stuck.
    flushAllPeelers(ctx);
    const l = computeLedger(state, c.ciid);
    if (l.source + l.buffers + l.world + l.cart + l.hopper <= EPS && !state.machine.cycle) c.status = 'settling';
  }
  if (c.status === 'settling') {
    const l = computeLedger(state, c.ciid);
    if (l.conveyor <= EPS && !state.conveyor.some((p) => p.ciid === c.ciid)) {
      c.status = 'completed';
      let bonus = 0;
      if (!c.bonusPaid && !state.completedInstances.includes(c.ciid)) {
        bonus = CONTRACTS[c.defId].bonus;
        c.bonusPaid = true;
        state.completedInstances.push(c.ciid);
        state.coins += bonus;
        state.stats.coinsEarned += bonus;
        c.revenue += bonus;
        state.totalContractsCompleted += 1;
        if (!state.contractsCompleted.includes(c.defId)) {
          state.contractsCompleted.push(c.defId);
          state.contractsCompleted.sort((a, b) => a - b);
        }
        events.push({ type: 'contractCompleted', ciid: c.ciid, defId: c.defId, soldCount: c.soldCount, revenue: c.revenue - bonus, bonus });
      }
    }
  }
}

/** Start a new contract instance. Only allowed once the current one is completed. */
export function startContract(ctx: SimContext, defId: number): boolean {
  const { state, events } = ctx;
  if (state.contract.status !== 'completed') return false;
  if (defId < 0 || defId >= CONTRACTS.length) return false;
  // Replays of a definition require the previous ones to be done (no skipping ahead).
  const firstUndone = CONTRACTS.findIndex((d) => !state.contractsCompleted.includes(d.id));
  if (firstUndone !== -1 && defId !== firstUndone && !state.contractsCompleted.includes(defId)) return false;
  state.peelers.player.buffer = null;
  state.peelers.helper.buffer = null;
  state.contract = createContractInstance(state, defId);
  state.cart.auto.phase = 'idle';
  relocateIfCovered(ctx);
  events.push({ type: 'contractStarted', ciid: state.contract.ciid, defId });
  return true;
}
