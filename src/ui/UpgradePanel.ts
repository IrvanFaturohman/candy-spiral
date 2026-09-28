import { STATION_NAMES, UPGRADES, UPGRADE_ORDER, type StationId, type UpgradeId } from '../game/config';
import type { GameState } from '../game/types';
import { nextUpgradeCost, upgradeAvailable } from '../game/state';
import { ICON, UPGRADE_ICON } from './icons';
import { button, el, fmtStat, setText, toggleClass } from './dom';

interface Row {
  id: UpgradeId;
  card: HTMLDivElement;
  level: HTMLSpanElement;
  stat: HTMLDivElement;
  buy: HTMLButtonElement;
  price: HTMLSpanElement;
  key: string;
}

/** Bottom sheet listing every upgrade with current → next stat and price. */
export class UpgradePanel {
  readonly root: HTMLDivElement;
  private sheet: HTMLDivElement;
  private rows: Row[] = [];
  private coins: HTMLSpanElement;
  private title: HTMLHeadingElement;
  station: StationId = 'blade';
  open = false;
  onBuy: (id: UpgradeId) => void = () => undefined;
  onClose: () => void = () => undefined;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'sheet-backdrop hidden', undefined, parent);
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.onClose();
    });
    this.sheet = el('div', 'sheet', undefined, this.root);
    this.sheet.setAttribute('role', 'dialog');
    this.sheet.setAttribute('aria-label', 'Upgrade');
    const head = el('div', 'sheet-head', undefined, this.sheet);
    this.title = el('h2', 'sheet-title', 'Upgrade', head);
    const coinBox = el('div', 'coin-pill small', undefined, head);
    el('span', 'coin-icon', ICON.coin, coinBox);
    this.coins = el('span', 'coin-text', '0', coinBox);
    const close = button('icon-btn close-btn', ICON.close, 'Close', head);
    close.addEventListener('click', () => this.onClose());
    const list = el('div', 'upgrade-list', undefined, this.sheet);
    for (const id of UPGRADE_ORDER) {
      const def = UPGRADES[id];
      const card = el('div', 'upgrade-card', undefined, list);
      el('div', 'upgrade-icon', UPGRADE_ICON[id], card);
      const info = el('div', 'upgrade-info', undefined, card);
      const title = el('div', 'upgrade-title', undefined, info);
      el('span', 'upgrade-name', def.name, title);
      const level = el('span', 'upgrade-level', '', title);
      const stat = el('div', 'upgrade-stat', '', info);
      const buy = button('buy-btn', '', `Buy ${def.name}`, card);
      el('span', 'coin-icon', ICON.coin, buy);
      const price = el('span', 'price', '', buy);
      buy.addEventListener('click', () => {
        buy.classList.remove('pressed');
        void buy.offsetWidth;
        buy.classList.add('pressed');
        this.onBuy(id);
      });
      this.rows.push({ id, card, level, stat, buy, price, key: '' });
    }
  }

  /** Open the group that belongs to the pad the chef stepped on. */
  show(station: StationId): void {
    this.station = station;
    setText(this.title, STATION_NAMES[station]);
    for (const r of this.rows) {
      r.card.classList.toggle('hidden', UPGRADES[r.id].station !== station);
      r.key = '';
    }
    this.open = true;
    this.root.classList.remove('hidden');
    requestAnimationFrame(() => this.root.classList.add('open'));
    (this.rows.find((r) => !r.buy.disabled && UPGRADES[r.id].station === station)?.buy ?? (this.root.querySelector('.close-btn') as HTMLButtonElement))?.focus({ preventScroll: true });
  }

  hide(): void {
    this.open = false;
    this.root.classList.remove('open');
    window.setTimeout(() => {
      if (!this.open) this.root.classList.add('hidden');
    }, 220);
  }

  update(state: GameState): void {
    if (!this.open) return;
    setText(this.coins, state.coins.toLocaleString('en-US'));
    for (const r of this.rows) {
      const def = UPGRADES[r.id];
      const lvl = state.upgrades[r.id] | 0;
      const cost = nextUpgradeCost(state, r.id);
      const avail = upgradeAvailable(state, r.id);
      const key = `${lvl}|${cost}|${avail}|${cost !== null && state.coins >= cost}`;
      if (key === r.key) continue;
      r.key = key;
      const maxed = cost === null;
      const cur = def.values[lvl];
      const next = maxed ? cur : def.values[lvl + 1];
      if (def.kind === 'unlock') {
        setText(r.level, maxed ? 'Active' : 'New');
        r.stat.innerHTML = maxed ? `<b>${def.desc}</b>` : `${def.desc}`;
      } else {
        setText(r.level, `Lv ${lvl + 1}/${def.values.length}`);
        r.stat.innerHTML = maxed ? `<b>${fmtStat(cur)} ${def.unit}</b> · max` : `${fmtStat(cur)} → <b>${fmtStat(next)}</b> ${def.unit}`;
      }
      toggleClass(r.card, 'locked', !avail);
      toggleClass(r.card, 'maxed', maxed);
      if (!avail) {
        r.buy.disabled = true;
        r.buy.innerHTML = `${ICON.lock}<span class="price">Contract ${def.requiresContracts}</span>`;
        r.price = r.buy.querySelector('.price')!;
        r.buy.title = `Unlocks after contract ${def.requiresContracts}`;
        continue;
      }
      if (maxed) {
        r.buy.disabled = true;
        r.buy.innerHTML = `<span class="price">MAX</span>`;
        continue;
      }
      r.buy.innerHTML = `<span class="coin-icon">${ICON.coin}</span><span class="price">${cost}</span>`;
      r.buy.disabled = false;
      toggleClass(r.buy, 'cant', state.coins < (cost ?? 0));
      r.buy.setAttribute('aria-label', `Buy ${def.name} for ${cost} coins`);
    }
  }
}
