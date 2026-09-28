import { TUTORIAL_STEPS } from '../config';
import type { SimContext } from '../context';
import type { GameState } from '../types';

/** Index of the first unmet step, or -1 when the tutorial is finished. */
export function currentTutorialStep(state: GameState): number {
  if (state.tutorial.done) return -1;
  for (let i = 0; i < TUTORIAL_STEPS.length; i++) if (!state.tutorial.flags[TUTORIAL_STEPS[i].id]) return i;
  return -1;
}

/** Evaluate flags from real state, so steps done early are recognised later. */
export function updateTutorial(ctx: SimContext): void {
  const { state, events } = ctx;
  const t = state.tutorial;
  if (t.done) return;
  const before = currentTutorialStep(state);
  const f = t.flags;
  if (state.player.distanceWalked >= 1.2) f.move = true;
  if (state.stats.carved >= 0.12) f.carve = true;
  if (state.player.mode === 'driving') f.board = true;
  if (state.stats.collected > 0) f.collect = true;
  if (state.stats.unloaded > 0) f.deliver = true;
  if (state.stats.sold > 0) f.sell = true;
  if (Object.entries(state.upgrades).some(([, v]) => v > 0)) f.upgrade = true;
  const after = currentTutorialStep(state);
  if (after === -1) t.done = true;
  if (after !== before) events.push({ type: 'tutorialStep', step: after });
}

export function skipTutorial(state: GameState): void {
  state.tutorial.done = true;
  state.tutorial.skipped = true;
}
