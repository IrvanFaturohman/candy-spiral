import type { UpgradeId } from './config';
import type { PlayerMode } from './types';

// Presentation events. The simulation has already committed the transaction
// described by each event before it is queued; listeners (renderer, audio, UI)
// must never mutate the economy in response.
export type GameEvent =
  | { type: 'rawCarved'; peeler: 'player' | 'helper'; mass: number; x: number; z: number; layer: number; defId: number }
  | { type: 'rollSpawned'; id: number; peeler: 'player' | 'helper'; fromX: number; fromZ: number; mass: number; layer: number; defId: number }
  | { type: 'rawCollected'; id: number; x: number; z: number; mass: number; layer: number; defId: number; partial: boolean }
  | { type: 'capacityReached' }
  | { type: 'rawUnloaded'; mass: number; layer: number; defId: number }
  | { type: 'hopperFull' }
  | { type: 'productionStarted'; defId: number }
  | { type: 'productProduced'; id: number; defId: number; merged: boolean }
  | { type: 'productSold'; id: number; defId: number; count: number; value: number }
  | { type: 'upgradePurchased'; id: UpgradeId; level: number }
  | { type: 'purchaseFailed'; id: UpgradeId }
  | { type: 'layerCleared'; layer: number; defId: number; nextLayer: number }
  | { type: 'sourceEmptied'; defId: number }
  | { type: 'contractCompleted'; ciid: number; defId: number; soldCount: number; revenue: number; bonus: number }
  | { type: 'contractStarted'; ciid: number; defId: number }
  | { type: 'modeChanged'; from: PlayerMode; to: PlayerMode }
  | { type: 'disembarkBlocked' }
  | { type: 'carveStart' }
  | { type: 'carveStop' }
  | { type: 'tutorialStep'; step: number }
  | { type: 'relocated'; who: 'player' | 'cart' }
  | { type: 'autopilotToggled'; on: boolean }
  | { type: 'bladeBroken'; spares: number }
  | { type: 'bladeTaken'; blades: number }
  | { type: 'doubleCarve'; x: number; z: number }
  | { type: 'milestone'; index: number; kind: 'coin' | 'chest'; reward: number }
  | { type: 'stationEntered'; station: string }
  | { type: 'stationLeft' };

export class EventQueue {
  private items: GameEvent[] = [];
  push(e: GameEvent): void {
    this.items.push(e);
  }
  drain(): GameEvent[] {
    const out = this.items;
    this.items = [];
    return out;
  }
  get length(): number {
    return this.items.length;
  }
}
