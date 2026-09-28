import type { Settings } from '../persistence/SaveManager';
import { ICON } from './icons';
import { button, el } from './dom';

/** Pause menu with audio, motion, haptics, quality, tutorial skip and a guarded reset. */
export class SettingsPanel {
  readonly root: HTMLDivElement;
  open = false;
  private sfx: HTMLInputElement;
  private music: HTMLInputElement;
  private reduced: HTMLInputElement;
  private haptics: HTMLInputElement;
  private quality: HTMLSelectElement;
  private autoContinue: HTMLInputElement;
  private autoRow: HTMLLabelElement;
  private confirmBox: HTMLDivElement;
  private resetBtn: HTMLButtonElement;
  private skipTut: HTMLButtonElement;
  private saveNote: HTMLDivElement;
  onChange: (s: Settings) => void = () => undefined;
  onResume: () => void = () => undefined;
  onReset: () => void = () => undefined;
  onSkipTutorial: () => void = () => undefined;
  onAutoContinue: (on: boolean) => void = () => undefined;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'modal-backdrop hidden', undefined, parent);
    const box = el('div', 'modal settings', undefined, this.root);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Paused');
    const head = el('div', 'modal-head', undefined, box);
    el('h2', '', 'Paused', head);
    const close = button('icon-btn close-btn', ICON.close, 'Resume', head);
    close.addEventListener('click', () => this.onResume());

    const slider = (label: string): HTMLInputElement => {
      const row = el('label', 'set-row', undefined, box);
      el('span', 'set-label', label, row);
      const input = el('input', 'slider', undefined, row);
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '1';
      input.addEventListener('input', () => this.emit());
      return input;
    };
    const toggle = (label: string, onChange: () => void = () => this.emit()): [HTMLInputElement, HTMLLabelElement] => {
      const row = el('label', 'set-row toggle', undefined, box);
      el('span', 'set-label', label, row);
      const input = el('input', 'switch', undefined, row);
      input.type = 'checkbox';
      input.addEventListener('change', onChange);
      return [input, row];
    };
    this.sfx = slider('Sound effects');
    this.music = slider('Music');
    [this.reduced] = toggle('Reduce motion');
    [this.haptics] = toggle('Vibration (if available)');
    const qrow = el('label', 'set-row', undefined, box);
    el('span', 'set-label', 'Graphics quality', qrow);
    this.quality = el('select', 'select', '<option value="auto">Auto</option><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>', qrow);
    this.quality.addEventListener('change', () => this.emit());
    [this.autoContinue, this.autoRow] = toggle('Auto-start next contract', () => this.onAutoContinue(this.autoContinue.checked));

    el('div', 'set-help', '<b>Controls:</b> swipe the screen (or WASD/arrows) to move. Hold toward the candy to carve. Stand by the cart for ~2.5 s to hop in; park in the <b>P</b> bay to hop out. <b>Esc</b> to pause.', box);
    this.saveNote = el('div', 'set-help warn hidden', 'Local storage is unavailable — progress will not be saved.', box);

    const actions = el('div', 'modal-actions', undefined, box);
    const resume = button('primary-btn', 'Resume', 'Resume', actions);
    resume.addEventListener('click', () => this.onResume());
    this.skipTut = button('ghost-btn', 'Skip tutorial', 'Skip tutorial', actions);
    this.skipTut.addEventListener('click', () => this.onSkipTutorial());
    this.resetBtn = button('danger-btn', 'Reset progress…', 'Reset progress', actions);
    this.resetBtn.addEventListener('click', () => {
      this.confirmBox.classList.remove('hidden');
      this.resetBtn.classList.add('hidden');
      (this.confirmBox.querySelector('.ghost-btn') as HTMLButtonElement).focus();
    });
    this.confirmBox = el('div', 'confirm hidden', undefined, box);
    el('p', '', 'Delete all progress, coins and upgrades? This cannot be undone.', this.confirmBox);
    const crow = el('div', 'confirm-row', undefined, this.confirmBox);
    const no = button('ghost-btn', 'Cancel', 'Cancel reset', crow);
    const yes = button('danger-btn solid', 'Yes, reset', 'Yes, delete progress', crow);
    no.addEventListener('click', () => this.hideConfirm());
    yes.addEventListener('click', () => this.onReset());
  }

  private hideConfirm(): void {
    this.confirmBox.classList.add('hidden');
    this.resetBtn.classList.remove('hidden');
  }

  private emit(): void {
    this.onChange({
      sfx: Number(this.sfx.value) / 100,
      music: Number(this.music.value) / 100,
      reducedMotion: this.reduced.checked,
      haptics: this.haptics.checked,
      quality: this.quality.value as Settings['quality'],
    });
  }

  show(s: Settings, opts: { tutorialDone: boolean; autoContinueAvailable: boolean; autoContinue: boolean; storageOk: boolean }): void {
    this.sfx.value = String(Math.round(s.sfx * 100));
    this.music.value = String(Math.round(s.music * 100));
    this.reduced.checked = s.reducedMotion;
    this.haptics.checked = s.haptics;
    this.quality.value = s.quality;
    this.skipTut.classList.toggle('hidden', opts.tutorialDone);
    this.autoRow.classList.toggle('hidden', !opts.autoContinueAvailable);
    this.autoContinue.checked = opts.autoContinue;
    this.saveNote.classList.toggle('hidden', opts.storageOk);
    this.hideConfirm();
    this.open = true;
    this.root.classList.remove('hidden');
    (this.root.querySelector('.primary-btn') as HTMLButtonElement).focus({ preventScroll: true });
  }

  hide(): void {
    this.open = false;
    this.root.classList.add('hidden');
  }
}
