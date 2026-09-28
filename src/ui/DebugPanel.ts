import { CONTRACTS } from '../game/config';
import type { GameState } from '../game/types';
import { computeLedger } from '../game/state';
import { button, el } from './dom';

export interface DebugInfo {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  rolls: number;
  particles: number;
  quality: string;
}

/** Hidden tuning panel (F2 or ?debug=1). Never shown in normal play. */
export class DebugPanel {
  readonly root: HTMLDivElement;
  private pre: HTMLPreElement;
  visible = false;
  simSpeed = 1;
  showZones = false;
  onAddCoins: () => void = () => undefined;
  onSkipTutorial: () => void = () => undefined;
  onPickContract: (defId: number) => void = () => undefined;
  onReset: () => void = () => undefined;
  onZones: (on: boolean) => void = () => undefined;
  private acc = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'debug hidden', undefined, parent);
    this.pre = el('pre', '', '', this.root);
    const row = el('div', 'debug-row', undefined, this.root);
    button('dbg', '+500 coins', 'debug coins', row).addEventListener('click', () => this.onAddCoins());
    button('dbg', 'Skip tut', 'debug skip tutorial', row).addEventListener('click', () => this.onSkipTutorial());
    button('dbg', 'Zones', 'debug zones', row).addEventListener('click', () => {
      this.showZones = !this.showZones;
      this.onZones(this.showZones);
    });
    const row2 = el('div', 'debug-row', undefined, this.root);
    for (const sp of [0.5, 1, 2]) {
      const b = button('dbg', `${sp}×`, `sim speed ${sp}`, row2);
      b.addEventListener('click', () => (this.simSpeed = sp));
    }
    for (const d of CONTRACTS) button('dbg', `K${d.id + 1}`, `contract ${d.id + 1}`, row2).addEventListener('click', () => this.onPickContract(d.id));
    button('dbg danger', 'Reset save', 'debug reset', row2).addEventListener('click', () => this.onReset());
  }

  toggle(on = !this.visible): void {
    this.visible = on;
    this.root.classList.toggle('hidden', !on);
  }

  update(state: GameState, info: DebugInfo, dt: number): void {
    if (!this.visible) return;
    this.acc += dt;
    if (this.acc < 0.25) return;
    this.acc = 0;
    const l = computeLedger(state);
    const c = state.contract;
    const f = (n: number) => n.toFixed(3);
    this.pre.textContent =
      `FPS ${info.fps.toFixed(0)} (${info.frameMs.toFixed(1)} ms) · q=${info.quality}\n` +
      `draw ${info.drawCalls} · tris ${(info.triangles / 1000).toFixed(1)}k · rolls ${info.rolls} · fx ${info.particles}\n` +
      `player ${state.player.mode} · cart ${state.cart.control}/${state.cart.activity}/${state.cart.auto.phase}\n` +
      `machine ${state.machine.status} · contract ${CONTRACTS[c.defId].shortName} #${c.ciid} ${c.status} L${c.activeLayer + 1}\n` +
      `coins ${state.coins} · sim ${this.simSpeed}×\n` +
      `raw src ${f(l.source)} buf ${f(l.buffers)} world ${f(l.world)}\n` +
      `cart ${f(l.cart)} hopper ${f(l.hopper)} conv ${f(l.conveyor)} sold ${f(l.sold)}\n` +
      `ledger ${f(l.total)} / ${f(l.initial)}  Δ ${l.mismatch.toExponential(2)}`;
  }
}
