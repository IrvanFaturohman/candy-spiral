import { CONTRACTS, type UpgradeId } from './config';
import { EventQueue, type GameEvent } from './events';
import type { SimContext, SimInput } from './context';
import { createInitialState, nextContractDef } from './state';
import type { GameState } from './types';
import { updatePeeling, updateSpin } from './systems/PeelingSystem';
import { resolvePlayerVsCart, updateAutoBoarding, updateCartManual, updatePlayerMovement } from './systems/MovementSystem';
import { updateCollection } from './systems/CollectionSystem';
import { updateConveyor, updateMachine } from './systems/ProductionSystem';
import { startContract, updateContract } from './systems/ContractSystem';
import { purchaseUpgrade, setAutopilot } from './systems/EconomySystem';
import { updateAutopilot } from './systems/AutomationSystem';
import { skipTutorial, updateTutorial } from './systems/TutorialSystem';
import { updateMilestones, updateStations } from './systems/StationSystem';

/**
 * Authoritative, headless game simulation. No DOM, audio or Three.js here —
 * presentation layers read `state` and consume the drained events.
 */
export class Simulation {
  state: GameState;
  readonly events = new EventQueue();
  readonly input: SimInput = { dirX: 0, dirZ: 0, mag: 0 };
  private autoContinueTimer = 0;

  constructor(state?: GameState) {
    this.state = state ?? createInitialState();
  }

  private get ctx(): SimContext {
    return { state: this.state, events: this.events, input: this.input };
  }

  setInput(dirX: number, dirZ: number, mag: number): void {
    const len = Math.hypot(dirX, dirZ);
    if (len < 1e-6 || mag <= 0) {
      this.input.dirX = 0;
      this.input.dirZ = 0;
      this.input.mag = 0;
      return;
    }
    this.input.dirX = dirX / len;
    this.input.dirZ = dirZ / len;
    this.input.mag = Math.min(1, mag);
  }

  purchase(id: UpgradeId): boolean {
    return purchaseUpgrade(this.ctx, id);
  }

  setAutopilot(on: boolean): void {
    setAutopilot(this.ctx, on);
  }

  startContract(defId: number): boolean {
    this.autoContinueTimer = 0;
    return startContract(this.ctx, defId);
  }

  startNextContract(): boolean {
    const next = nextContractDef(this.state);
    return this.startContract(next === -1 ? this.state.contract.defId : next);
  }

  skipTutorial(): void {
    skipTutorial(this.state);
    this.events.push({ type: 'tutorialStep', step: -1 });
  }

  step(dt: number): void {
    const ctx = this.ctx;
    const s = this.state;
    s.time += dt;
    s.stats.playTime += dt;
    updateSpin(s, dt);
    updatePlayerMovement(ctx, dt);
    updateAutopilot(ctx, dt);
    updateCartManual(ctx, dt);
    resolvePlayerVsCart(s);
    updateAutoBoarding(ctx, dt);
    updateStations(ctx, dt);
    updatePeeling(ctx, dt);
    updateMilestones(ctx);
    updateCollection(ctx, dt);
    updateMachine(ctx, dt);
    updateConveyor(ctx, dt);
    updateContract(ctx);
    updateTutorial(ctx);
    // Optional "Auto-start next contract" once the helper is unlocked (default off).
    if (s.autoContinue && s.upgrades.helper > 0 && s.contract.status === 'completed') {
      this.autoContinueTimer += dt;
      if (this.autoContinueTimer > 2.5) this.startNextContract();
    } else {
      this.autoContinueTimer = 0;
    }
  }

  drainEvents(): GameEvent[] {
    return this.events.drain();
  }

  get contractDef() {
    return CONTRACTS[this.state.contract.defId];
  }
}
