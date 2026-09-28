import { CONTRACTS } from '../game/config';
import { productIcon } from './icons';
import { button, el } from './dom';

export class StartOverlay {
  readonly root: HTMLDivElement;
  private sub: HTMLParagraphElement;
  private btn: HTMLButtonElement;
  onStart: () => void = () => undefined;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'start-overlay', undefined, parent);
    const card = el('div', 'start-card', undefined, this.root);
    el('div', 'start-logo', `${productIcon(0, 56)}<span>Candy<br/>Spiral</span>`, card);
    this.sub = el('p', 'start-sub', 'Carve a giant candy roll, haul it with the Candy Cart, sell lollipops!', card);
    this.btn = button('primary-btn big', 'Start', 'Start playing', card);
    this.btn.addEventListener('click', () => this.onStart());
    el('p', 'start-hint', 'Swipe or WASD · wait by the cart to hop in', card);
  }

  setWelcomeBack(on: boolean): void {
    if (on) {
      this.sub.textContent = 'Welcome back! Your workshop is just as you left it.';
      this.btn.textContent = 'Continue';
    }
  }

  hide(): void {
    this.root.classList.add('gone');
    window.setTimeout(() => this.root.remove(), 350);
  }
}

export interface ContractSummary {
  defId: number;
  soldCount: number;
  revenue: number;
  bonus: number;
  nextDefId: number; // -1 = all done → album/replay
  completedDefs: number[];
}

/** Completion popup; after all three contracts it becomes the album + replay picker. */
export class ContractModal {
  readonly root: HTMLDivElement;
  private box: HTMLDivElement;
  open = false;
  onNext: (defId: number) => void = () => undefined;
  onClose: () => void = () => undefined;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'modal-backdrop hidden', undefined, parent);
    this.box = el('div', 'modal contract-modal', undefined, this.root);
    this.box.setAttribute('role', 'dialog');
  }

  show(s: ContractSummary): void {
    const def = CONTRACTS[s.defId];
    this.box.innerHTML = '';
    el('div', 'burst-icon', productIcon(s.defId, 84), this.box);
    el('h2', 'contract-done-title', 'Contract complete!', this.box);
    el('p', 'contract-done-sub', def.name, this.box);
    const stats = el('div', 'stats', undefined, this.box);
    const stat = (label: string, value: string) => {
      const r = el('div', 'stat', undefined, stats);
      el('span', 'stat-label', label, r);
      el('span', 'stat-value', value, r);
    };
    stat('Products sold', `${Math.round(s.soldCount).toLocaleString('en-US')} ${def.productName}`);
    stat('Revenue', `${s.revenue.toLocaleString('en-US')} coins`);
    stat('Contract bonus', `+${s.bonus.toLocaleString('en-US')} coins`);
    if (s.nextDefId >= 0) {
      const nd = CONTRACTS[s.nextDefId];
      const b = button('primary-btn big', `Next contract: ${nd.name}`, `Start contract ${nd.name}`, this.box);
      b.addEventListener('click', () => this.onNext(s.nextDefId));
      b.focus({ preventScroll: true });
    } else {
      el('h3', 'album-title', 'Candy album', this.box);
      const album = el('div', 'album', undefined, this.box);
      for (const d of CONTRACTS) {
        const done = s.completedDefs.includes(d.id);
        const card = el('div', `album-card${done ? '' : ' locked'}`, undefined, album);
        el('div', 'album-icon', productIcon(d.id, 52), card);
        el('div', 'album-name', d.shortName, card);
        const b = button('ghost-btn small', 'Play again', `Play ${d.name} again`, card);
        b.addEventListener('click', () => this.onNext(d.id));
      }
      el('p', 'album-note', 'Pick a flavor to play again. Your upgrades stay.', this.box);
    }
    this.open = true;
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.open = false;
    this.root.classList.add('hidden');
  }
}

export function showFatal(parent: HTMLElement, title: string, body: string, retry = true): void {
  const wrap = el('div', 'fatal', undefined, parent);
  const card = el('div', 'start-card', undefined, wrap);
  el('h2', '', title, card);
  el('p', 'start-sub', body, card);
  if (retry) {
    const b = button('primary-btn', 'Reload', 'Reload the page', card);
    b.addEventListener('click', () => window.location.reload());
  }
}
