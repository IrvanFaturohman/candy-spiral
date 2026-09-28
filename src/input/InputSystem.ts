// Pointer (floating joystick) + keyboard input. Produces a screen-space move
// vector; the game maps screen-up to world −Z so "drag up" moves up the screen.

export interface MoveInput {
  x: number; // screen right
  y: number; // screen down
  mag: number; // 0..1
  source: 'none' | 'pointer' | 'keys';
}

const RADIUS = 52;
const DEAD = 0.12;

export class InputSystem {
  private pointerId: number | null = null;
  private ox = 0;
  private oy = 0;
  private jx = 0;
  private jy = 0;
  private keys = new Set<string>();
  enabled = true;
  onEscape: () => void = () => undefined;
  onDebug: () => void = () => undefined;
  onFirstInput: () => void = () => undefined;

  constructor(
    private surface: HTMLElement,
    private app: HTMLElement,
    private joyBase: HTMLElement,
    private joyKnob: HTMLElement,
  ) {
    surface.addEventListener('pointerdown', this.down, { passive: false });
    surface.addEventListener('pointermove', this.move, { passive: false });
    surface.addEventListener('pointerup', this.up);
    surface.addEventListener('pointercancel', this.up);
    surface.addEventListener('lostpointercapture', this.up);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', () => this.reset());
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.app.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down = (e: PointerEvent): void => {
    this.onFirstInput();
    if (!this.enabled || this.pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Only the bare world surface starts a joystick; UI elements sit above it.
    if (e.target !== this.surface && !(e.target instanceof HTMLCanvasElement)) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const p = this.local(e);
    this.ox = p.x;
    this.oy = p.y;
    this.jx = 0;
    this.jy = 0;
    this.joyBase.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
    this.joyKnob.style.transform = 'translate(0px, 0px)';
    this.joyBase.classList.remove('hidden');
  };

  private move = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const p = this.local(e);
    let dx = p.x - this.ox;
    let dy = p.y - this.oy;
    let len = Math.hypot(dx, dy);
    // Floating base follows the finger if it drags far away.
    if (len > RADIUS * 1.35) {
      const excess = len - RADIUS * 1.35;
      this.ox += (dx / len) * excess;
      this.oy += (dy / len) * excess;
      dx = p.x - this.ox;
      dy = p.y - this.oy;
      len = Math.hypot(dx, dy);
      this.joyBase.style.transform = `translate(${this.ox}px, ${this.oy}px)`;
    }
    const k = len > RADIUS ? RADIUS / len : 1;
    const kx = dx * k;
    const ky = dy * k;
    this.joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;
    this.jx = kx / RADIUS;
    this.jy = ky / RADIUS;
  };

  private up = (e: PointerEvent | Event): void => {
    if ('pointerId' in e && e.pointerId !== this.pointerId) return;
    this.releasePointer();
  };

  private releasePointer(): void {
    if (this.pointerId !== null) {
      try {
        if (this.surface.hasPointerCapture(this.pointerId)) this.surface.releasePointerCapture(this.pointerId);
      } catch {
        /* ignore */
      }
    }
    this.pointerId = null;
    this.jx = 0;
    this.jy = 0;
    this.joyBase.classList.add('hidden');
  }

  private keyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    if (e.key === 'F2') {
      e.preventDefault();
      this.onDebug();
      return;
    }
    if (e.key === 'Escape') {
      this.onEscape();
      return;
    }
    if (inField) return;
    this.onFirstInput();
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      if (!this.enabled) return;
      this.keys.add(k);
      if (k.startsWith('arrow')) e.preventDefault();
    }
  };

  private keyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  /** Zero every movement source (modal opened, focus lost, tab hidden, resize…). */
  reset(): void {
    this.keys.clear();
    this.releasePointer();
  }

  read(): MoveInput {
    if (!this.enabled) return { x: 0, y: 0, mag: 0, source: 'none' };
    if (this.pointerId !== null) {
      const mag = Math.hypot(this.jx, this.jy);
      if (mag < DEAD) return { x: 0, y: 0, mag: 0, source: 'pointer' };
      const m = Math.min(1, (mag - DEAD) / (1 - DEAD) + 0.15);
      return { x: this.jx / mag, y: this.jy / mag, mag: Math.min(1, m), source: 'pointer' };
    }
    let x = 0;
    let y = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
    const len = Math.hypot(x, y);
    if (len === 0) return { x: 0, y: 0, mag: 0, source: 'none' };
    return { x: x / len, y: y / len, mag: 1, source: 'keys' };
  }
}
