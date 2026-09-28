import { CONTRACTS, FX } from '../game/config';
import { ICON, productIcon } from './icons';
import { button, el, formatNum, setText, toggleClass } from './dom';

export interface HudData {
  coins: number;
  defId: number;
  contractLabel: string;
  remaining01: number;
  activeLayer: number;
  piecesValue: number;
  milestones: { at: number; kind: 'coin' | 'chest'; claimed: boolean }[];
  cargo: number;
  capacity: number;
  showCart: boolean;
  prompt: string | null;
  promptKind: 'tutorial' | 'info' | 'warn';
  promptX: number;
  promptY: number;
  tutorialActive: boolean;
  blades: number;
  bladeWear: number;
  bladeMax: number;
  autopilotOwned: boolean;
  autopilotOn: boolean;
  edge: { x: number; y: number; angle: number } | null;
}

interface Floaty {
  el: HTMLDivElement;
  t: number;
  value: number;
  x: number;
  y: number;
}

/** Heads-up display. DOM is built once; update() only writes what changed. */
export class HUD {
  readonly root: HTMLDivElement;
  readonly settingsBtn: HTMLButtonElement;
  readonly autopilotBtn: HTMLButtonElement;
  readonly skipBtn: HTMLButtonElement;
  readonly coinPill: HTMLDivElement;
  private coinText: HTMLSpanElement;
  private contractIcon: HTMLDivElement;
  private contractName: HTMLDivElement;
  private contractSub: HTMLDivElement;
  private barFill: HTMLDivElement;
  private barText: HTMLSpanElement;
  private valueText: HTMLSpanElement;
  private milestoneBox: HTMLDivElement;
  private milestoneEls: HTMLSpanElement[] = [];
  private milestoneKey = '';
  private layerDots: HTMLSpanElement[] = [];
  private nextLayer: HTMLSpanElement;
  private prompt: HTMLDivElement;
  private promptText: HTMLSpanElement;
  private cartPill: HTMLDivElement;
  private cartText: HTMLSpanElement;
  private cartFill: HTMLDivElement;
  private bladePill: HTMLDivElement;
  private bladeText: HTMLSpanElement;
  private bladeFill: HTMLDivElement;
  private bladeKey = '';
  private edgeArrow: HTMLDivElement;
  private autopilotText: HTMLSpanElement;
  private fxLayer: HTMLDivElement;
  private toastEl: HTMLDivElement;
  private toastTimer = 0;
  private displayCoins = 0;
  private lastCoins = -1;
  private lastDef = -1;
  private lastPct = '';
  private lastLayer = -1;
  private lastCart = '';
  private floaties: Floaty[] = [];
  private coinFlights: { el: HTMLDivElement; t: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  readonly joyBase: HTMLDivElement;
  readonly joyKnob: HTMLDivElement;
  reducedMotion = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', undefined, parent);
    const top = el('div', 'hud-top', undefined, this.root);
    const row = el('div', 'hud-row', undefined, top);
    const contract = el('div', 'contract-chip', undefined, row);
    this.contractIcon = el('div', 'contract-icon', '', contract);
    const ctext = el('div', 'contract-text', undefined, contract);
    this.contractName = el('div', 'contract-name', '', ctext);
    this.contractSub = el('div', 'contract-sub', '', ctext);
    this.coinPill = el('div', 'coin-pill', undefined, row);
    el('span', 'coin-icon', ICON.coin, this.coinPill);
    this.coinText = el('span', 'coin-text', '0', this.coinPill);
    this.settingsBtn = button('icon-btn settings-btn', ICON.pause, 'Pause and settings', row);

    // Info panel: remaining %, value lying around, reward milestones, layers.
    const prog = el('div', 'progress-card', undefined, top);
    const labelRow = el('div', 'progress-label', undefined, prog);
    const left = el('span', 'progress-remaining', 'Remaining ', labelRow);
    this.barText = el('b', 'progress-pct', '100%', left);
    const val = el('span', 'progress-value', 'Pieces value ', labelRow);
    el('span', 'coin-icon tiny', ICON.coin, val);
    this.valueText = el('b', '', '0', val);
    const bar = el('div', 'progress-bar', undefined, prog);
    this.barFill = el('div', 'progress-fill', undefined, bar);
    this.milestoneBox = el('div', 'milestones', undefined, bar);
    const layers = el('div', 'layer-row', undefined, prog);
    el('span', 'layer-label', 'Layers', layers);
    const dots = el('div', 'layer-dots', undefined, layers);
    for (let i = 0; i < 5; i++) this.layerDots.push(el('span', 'layer-dot', String(i + 1), dots));
    this.nextLayer = el('span', 'layer-next', '', layers);
    this.skipBtn = button('skip-btn hidden', 'Skip tutorial', 'Skip tutorial', layers);

    this.cartPill = el('div', 'cart-pill hidden', undefined, this.root);
    el('span', 'cart-icon', ICON.cart, this.cartPill);
    const cartBox = el('div', 'cart-box', undefined, this.cartPill);
    this.cartText = el('span', 'cart-text', '0 / 12', cartBox);
    const cartBar = el('div', 'cart-bar', undefined, cartBox);
    this.cartFill = el('div', 'cart-fill', undefined, cartBar);

    const bottom = el('div', 'hud-bottom', undefined, this.root);
    const hl = el('div', 'hud-left', undefined, bottom);
    this.autopilotBtn = button('pill-btn autopilot-btn hidden', `${ICON.robot}<span></span>`, 'Autopilot cart', hl);
    this.autopilotText = this.autopilotBtn.querySelector('span')!;
    this.bladePill = el('div', 'blade-pill', undefined, hl);
    el('span', 'blade-icon', ICON.blade, this.bladePill);
    const bladeBox = el('div', 'blade-box', undefined, this.bladePill);
    this.bladeText = el('span', 'blade-text', '', bladeBox);
    const bladeBar = el('div', 'blade-bar', undefined, bladeBox);
    this.bladeFill = el('div', 'blade-fill', undefined, bladeBar);

    this.fxLayer = el('div', 'fx-layer', undefined, this.root);
    this.prompt = el('div', 'prompt hidden', undefined, this.root);
    this.promptText = el('span', 'prompt-text', '', this.prompt);
    this.edgeArrow = el('div', 'edge-arrow hidden', '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M8 20h18M18 10l10 10-10 10" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>', this.root);
    this.toastEl = el('div', 'toast hidden', '', this.root);
    this.joyBase = el('div', 'joy-base hidden', undefined, this.root);
    this.joyKnob = el('div', 'joy-knob', undefined, this.joyBase);
  }

  /** Space the HUD occupies at the top/bottom, so the camera can fit around it. */
  insets(): { top: number; bottom: number } {
    const top = this.root.querySelector('.hud-top') as HTMLElement;
    const bottom = this.root.querySelector('.hud-bottom') as HTMLElement;
    const rb = this.root.getBoundingClientRect();
    const tb = top.getBoundingClientRect();
    const bb = bottom.getBoundingClientRect();
    // Bottom pills sit in the corners, so the world may extend partly beneath them.
    return { top: tb.bottom - rb.top + 6, bottom: Math.max(0, rb.bottom - bb.top) * 0.5 };
  }

  update(d: HudData, dt: number): void {
    // Coins: animate display toward the authoritative value (display only).
    if (this.lastCoins < 0) this.displayCoins = d.coins;
    if (d.coins !== this.lastCoins) {
      if (this.lastCoins >= 0 && d.coins > this.lastCoins && !this.reducedMotion) {
        this.coinPill.classList.remove('pop');
        void this.coinPill.offsetWidth;
        this.coinPill.classList.add('pop');
      }
      this.lastCoins = d.coins;
    }
    if (Math.round(this.displayCoins) !== d.coins) {
      const diff = d.coins - this.displayCoins;
      this.displayCoins += diff * Math.min(1, dt * 9);
      if (Math.abs(d.coins - this.displayCoins) < 0.5) this.displayCoins = d.coins;
    }
    setText(this.coinText, formatNum(this.displayCoins));

    if (d.defId !== this.lastDef) {
      this.lastDef = d.defId;
      const def = CONTRACTS[d.defId];
      this.contractIcon.innerHTML = productIcon(d.defId, 34);
      setText(this.contractName, def.name);
      this.root.style.setProperty('--flavor', def.primary);
      this.root.style.setProperty('--flavor2', def.secondary);
      this.lastLayer = -1;
      this.milestoneKey = '';
    }
    setText(this.contractSub, d.contractLabel);
    // One decimal, like the reference, so slow carving still visibly moves.
    const pct = (Math.floor(d.remaining01 * 1000 + 1e-6) / 10).toFixed(1);
    if (pct !== this.lastPct) {
      this.lastPct = pct;
      this.barFill.style.transform = `scaleX(${d.remaining01.toFixed(4)})`;
      setText(this.barText, `${pct}%`);
    }
    setText(this.valueText, formatNum(d.piecesValue));
    const mkey = d.milestones.map((m) => (m.claimed ? 1 : 0)).join('');
    if (mkey !== this.milestoneKey) {
      if (this.milestoneEls.length !== d.milestones.length) {
        this.milestoneBox.innerHTML = '';
        this.milestoneEls = d.milestones.map((m) => {
          const e = el('span', `milestone ${m.kind}`, m.kind === 'chest' ? ICON.chest : ICON.coin, this.milestoneBox);
          // The bar shows what is left, so a reward at X% carved sits at (1 − X) along it.
          e.style.left = `${(1 - m.at) * 100}%`;
          return e;
        });
      }
      d.milestones.forEach((m, i) => toggleClass(this.milestoneEls[i], 'claimed', m.claimed));
      this.milestoneKey = mkey;
    }
    if (d.activeLayer !== this.lastLayer) {
      this.lastLayer = d.activeLayer;
      const def = CONTRACTS[d.defId];
      this.layerDots.forEach((dot, i) => {
        dot.style.setProperty('--c', def.layerColors[i]);
        toggleClass(dot, 'done', i < d.activeLayer);
        toggleClass(dot, 'current', i === d.activeLayer);
      });
      if (d.activeLayer < 4) {
        this.nextLayer.innerHTML = `next <i style="background:${def.layerColors[d.activeLayer + 1]}"></i>`;
      } else if (d.activeLayer === 4) this.nextLayer.textContent = 'last one!';
      else this.nextLayer.textContent = 'all done';
    }
    toggleClass(this.skipBtn, 'hidden', !d.tutorialActive);
    toggleClass(this.nextLayer, 'hidden', d.tutorialActive);

    // Prompt under the chef (like the reference).
    toggleClass(this.prompt, 'hidden', !d.prompt);
    if (d.prompt) {
      setText(this.promptText, d.prompt);
      toggleClass(this.prompt, 'tutorial', d.promptKind === 'tutorial');
      toggleClass(this.prompt, 'warn', d.promptKind === 'warn');
      this.prompt.style.transform = `translate(${d.promptX.toFixed(1)}px, ${d.promptY.toFixed(1)}px) translate(-50%, 0)`;
    }

    // Off-screen target indicator.
    toggleClass(this.edgeArrow, 'hidden', !d.edge);
    if (d.edge) this.edgeArrow.style.transform = `translate(${d.edge.x.toFixed(1)}px, ${d.edge.y.toFixed(1)}px) translate(-50%, -50%) rotate(${d.edge.angle.toFixed(3)}rad)`;

    // Cart capacity pill.
    toggleClass(this.cartPill, 'hidden', !d.showCart);
    const cartKey = `${Math.floor(d.cargo + 1e-6)}/${d.capacity}`;
    if (cartKey !== this.lastCart) {
      this.lastCart = cartKey;
      setText(this.cartText, `${Math.floor(d.cargo + 1e-6)} / ${d.capacity}`);
      const r = d.capacity > 0 ? Math.min(1, d.cargo / d.capacity) : 0;
      this.cartFill.style.transform = `scaleX(${r.toFixed(3)})`;
      toggleClass(this.cartPill, 'near', r >= 0.8 && r < 0.999);
      toggleClass(this.cartPill, 'full', r >= 0.999);
    }

    // Blade pill: spares and wear of the blade in hand.
    const bkey = `${d.blades}|${d.bladeWear}|${d.bladeMax}`;
    if (bkey !== this.bladeKey) {
      this.bladeKey = bkey;
      const none = d.blades <= 0;
      toggleClass(this.bladePill, 'empty', none);
      setText(this.bladeText, none ? 'Grab a blade!' : `Blade ×${d.blades} · ${d.bladeWear}/${d.bladeMax}`);
      this.bladeFill.style.transform = `scaleX(${none ? 0 : Math.max(0, d.bladeWear / Math.max(1, d.bladeMax)).toFixed(3)})`;
      toggleClass(this.bladePill, 'low', !none && d.bladeWear <= Math.max(2, d.bladeMax * 0.2));
    }

    toggleClass(this.autopilotBtn, 'hidden', !d.autopilotOwned);
    if (d.autopilotOwned) {
      setText(this.autopilotText, d.autopilotOn ? 'Auto: ON' : 'Auto: OFF');
      toggleClass(this.autopilotBtn, 'on', d.autopilotOn);
    }

    this.updateFx(dt);
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.add('hidden');
    }
  }

  /** Where the milestone icon sits on screen (for a coin flight from the bar). */
  milestonePoint(index: number): { x: number; y: number } | null {
    const e = this.milestoneEls[index];
    if (!e) return null;
    const rb = this.root.getBoundingClientRect();
    const b = e.getBoundingClientRect();
    return { x: b.left - rb.left + b.width / 2, y: b.top - rb.top + b.height / 2 };
  }

  /** Big pop-up words ("DOUBLE CARVE!") at a screen point. */
  shout(x: number, y: number, text: string): void {
    const e = el('div', 'floaty shout', text, this.fxLayer);
    this.floaties.push({ el: e, t: -0.15, value: 0, x, y });
  }

  toast(text: string, seconds = 2.2): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    this.toastTimer = seconds;
  }

  /** "+N" near the kiosk; merges when sales arrive close together. */
  floatText(x: number, y: number, value: number): void {
    const recent = this.floaties.find((f) => f.t < 0.35);
    if (recent) {
      recent.value += value;
      recent.el.textContent = `+${recent.value}`;
      recent.t = 0;
      return;
    }
    if (this.floaties.length >= FX.maxFloaty) {
      const old = this.floaties.shift()!;
      old.el.remove();
    }
    const e = el('div', 'floaty', `+${value}`, this.fxLayer);
    this.floaties.push({ el: e, t: 0, value, x, y });
  }

  bubble(x: number, y: number, text: string): void {
    const e = el('div', 'floaty bubble', text, this.fxLayer);
    this.floaties.push({ el: e, t: -0.2, value: 0, x, y: y - 10 });
  }

  /** Coin flies from a world position to the coin pill. */
  coinTo(x: number, y: number): void {
    if (this.coinFlights.length > 8) return;
    const rb = this.root.getBoundingClientRect();
    const cb = this.coinPill.getBoundingClientRect();
    const e = el('div', 'fly-coin', ICON.coin, this.fxLayer);
    this.coinFlights.push({ el: e, t: 0, x0: x, y0: y, x1: cb.left - rb.left + 18, y1: cb.top - rb.top + cb.height / 2 });
  }

  private updateFx(dt: number): void {
    for (let i = this.floaties.length - 1; i >= 0; i--) {
      const f = this.floaties[i];
      f.t += dt;
      const life = 0.9;
      if (f.t >= life) {
        f.el.remove();
        this.floaties.splice(i, 1);
        continue;
      }
      const k = Math.max(0, f.t) / life;
      const rise = this.reducedMotion ? 10 : 34;
      f.el.style.transform = `translate(${f.x}px, ${f.y - k * rise}px) translate(-50%, -50%) scale(${f.t < 0.1 ? 0.7 + f.t * 3 : 1})`;
      f.el.style.opacity = String(k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
    }
    for (let i = this.coinFlights.length - 1; i >= 0; i--) {
      const c = this.coinFlights[i];
      c.t += dt / 0.42;
      if (c.t >= 1) {
        c.el.remove();
        this.coinFlights.splice(i, 1);
        continue;
      }
      const t = c.t;
      const e = t * t * (3 - 2 * t);
      const x = c.x0 + (c.x1 - c.x0) * e;
      const y = c.y0 + (c.y1 - c.y0) * e - Math.sin(t * Math.PI) * (this.reducedMotion ? 10 : 60);
      c.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 - t * 0.3})`;
    }
  }
}
