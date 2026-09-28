export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

export function button(cls: string, html: string, label: string, parent?: HTMLElement): HTMLButtonElement {
  const b = el('button', cls, html, parent);
  b.type = 'button';
  b.setAttribute('aria-label', label);
  return b;
}

/** Set text only when it changed (avoids needless DOM writes). */
export function setText(e: HTMLElement, text: string): void {
  if (e.textContent !== text) e.textContent = text;
}

export function toggleClass(e: HTMLElement, cls: string, on: boolean): void {
  if (e.classList.contains(cls) !== on) e.classList.toggle(cls, on);
}

export function formatNum(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtStat(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(v < 10 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '');
}
