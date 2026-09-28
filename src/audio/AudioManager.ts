import { AUDIO } from '../game/config';

// Everything is synthesised with the Web Audio API — no audio files.

type SfxName =
  | 'uiPress'
  | 'uiConfirm'
  | 'step'
  | 'snip'
  | 'plop'
  | 'pickup'
  | 'binFull'
  | 'unload'
  | 'roller'
  | 'coin'
  | 'upgrade'
  | 'layerDone'
  | 'contract'
  | 'noMoney'
  | 'boardUp'
  | 'boardDown'
  | 'start'
  | 'machineFull'
  | 'helperOn'
  | 'bladeBreak'
  | 'bladeTake'
  | 'doubleCarve'
  | 'chest';

const MIN_INTERVAL: Partial<Record<SfxName, number>> = {
  pickup: 1 / AUDIO.pickupPerSec,
  coin: 1 / AUDIO.coinPerSec,
  unload: 1 / AUDIO.unloadPerSec,
  step: 0.11,
  plop: 0.05,
  snip: 0.07,
  roller: 0.12,
  uiPress: 0.04,
  noMoney: 0.2,
  binFull: 0.5,
  machineFull: 1.5,
  bladeTake: 0.4,
  doubleCarve: 0.2,
};

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0];

interface LoopNodes {
  gain: GainNode;
}

export class AudioManager {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private voices = 0;
  private last = new Map<SfxName, number>();
  private recent = new Map<SfxName, number>();
  private pickupIdx = 0;
  private scrape: LoopNodes | null = null;
  private fizz: LoopNodes | null = null;
  private fizzLfo: GainNode | null = null;
  private motor: (LoopNodes & { osc: OscillatorNode; osc2: OscillatorNode }) | null = null;
  private cartMotor: (LoopNodes & { osc: OscillatorNode; filter: BiquadFilterNode }) | null = null;
  private scrapeFilter: BiquadFilterNode | null = null;
  private music: MusicPlayer | null = null;
  private sfxVol: number = AUDIO.defaultSfx;
  private musicVol: number = AUDIO.defaultMusic;
  private paused = false;
  private hidden = false;
  failed = false;

  /** Create/resume the context. Must be called from a user gesture. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) {
          this.failed = true;
          return;
        }
        this.ctx = new Ctor();
        this.build();
      }
      if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
    } catch {
      this.failed = true;
      this.ctx = null;
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8; // headroom
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.applyVolumes();
    // One reusable noise buffer.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b = 0.97 * b + 0.03 * w; // a touch of pink-ish warmth mixed in
      d[i] = w * 0.7 + b * 1.8;
    }
    this.buildLoops();
    this.music = new MusicPlayer(ctx, this.musicBus, this.noise);
    this.music.start();
  }

  private buildLoops(): void {
    const ctx = this.ctx!;
    // Scrape: band-passed noise, gain driven by the actual carve output.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2100;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bp).connect(g).connect(this.sfxBus);
    src.start();
    this.scrape = { gain: g };
    this.scrapeFilter = bp;
    // Sugar fizz: high sparkle with a wobbling amplitude.
    const src2 = ctx.createBufferSource();
    src2.buffer = this.noise;
    src2.loop = true;
    src2.playbackRate.value = 1.3;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const g2 = ctx.createGain();
    g2.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0;
    const mod = ctx.createGain();
    mod.gain.value = 0.5;
    lfo.connect(lfoGain).connect(mod.gain);
    src2.connect(hp).connect(mod).connect(g2).connect(this.sfxBus);
    src2.start();
    lfo.start();
    this.fizz = { gain: g2 };
    this.fizzLfo = lfoGain;
    // Candy motor hum (spinning source).
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 58;
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 116;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    const mg = ctx.createGain();
    mg.gain.value = 0;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.35;
    osc.connect(lp);
    osc2.connect(o2g).connect(lp);
    lp.connect(mg).connect(this.sfxBus);
    osc.start();
    osc2.start();
    this.motor = { gain: mg, osc, osc2 };
    // Cart toy motor.
    const co = ctx.createOscillator();
    co.type = 'sawtooth';
    co.frequency.value = 60;
    const cf = ctx.createBiquadFilter();
    cf.type = 'lowpass';
    cf.frequency.value = 420;
    cf.Q.value = 2;
    const cg = ctx.createGain();
    cg.gain.value = 0;
    co.connect(cf).connect(cg).connect(this.sfxBus);
    co.start();
    this.cartMotor = { gain: cg, osc: co, filter: cf };
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVol = sfx;
    this.musicVol = music;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const silent = this.paused || this.hidden;
    this.sfxBus.gain.setTargetAtTime(this.sfxVol * this.sfxVol * 1.2, t, 0.03);
    this.musicBus.gain.setTargetAtTime(silent ? 0 : this.musicVol * this.musicVol * 1.6, t, 0.08);
  }

  /** Pause stops music and loops; one-shot UI sounds still work. */
  setPaused(p: boolean): void {
    this.paused = p;
    this.music?.setRunning(!p && !this.hidden);
    if (p) this.setLoops(0, 0, 0, false);
    this.applyVolumes();
  }

  setHidden(h: boolean): void {
    this.hidden = h;
    if (!this.ctx) return;
    this.music?.setRunning(!h && !this.paused);
    if (h) {
      this.setLoops(0, 0, 0, false);
      void this.ctx.suspend().catch(() => undefined);
    } else {
      void this.ctx.resume().catch(() => undefined);
    }
    this.applyVolumes();
  }

  /** Continuous sounds follow real simulation values. */
  setLoops(scrapeRate: number, spin01: number, cartSpeed: number, cartActive: boolean): void {
    if (!this.ctx || !this.scrape || !this.fizz || !this.motor || !this.cartMotor) return;
    const t = this.ctx.currentTime;
    const off = this.paused || this.hidden;
    const s = off ? 0 : Math.min(1, scrapeRate / 3);
    this.scrape.gain.gain.setTargetAtTime(s * 0.32, t, s > 0 ? 0.03 : 0.025);
    this.scrapeFilter?.frequency.setTargetAtTime(1800 + s * 900, t, 0.1);
    this.fizz.gain.gain.setTargetAtTime(s * 0.12, t, 0.04);
    this.fizzLfo?.gain.setTargetAtTime(s * 0.5, t, 0.05);
    this.motor.gain.gain.setTargetAtTime(off ? 0 : 0.03 + spin01 * 0.025, t, 0.2);
    this.motor.osc.frequency.setTargetAtTime(52 + spin01 * 30, t, 0.3);
    this.motor.osc2.frequency.setTargetAtTime(104 + spin01 * 60, t, 0.3);
    const cg = off || !cartActive ? 0 : 0.012 + Math.min(1, cartSpeed / 5) * 0.03;
    this.cartMotor.gain.gain.setTargetAtTime(cg, t, 0.06);
    this.cartMotor.osc.frequency.setTargetAtTime(55 + cartSpeed * 16, t, 0.08);
    this.cartMotor.filter.frequency.setTargetAtTime(380 + cartSpeed * 90, t, 0.08);
  }

  private gate(name: SfxName): number {
    if (!this.ctx || this.ctx.state !== 'running' || this.hidden) return 0;
    if (this.voices >= AUDIO.maxVoices) return 0;
    const now = this.ctx.currentTime;
    const min = MIN_INTERVAL[name] ?? 0;
    const last = this.last.get(name) ?? -1;
    if (now - last < min) return 0;
    // Repeated sounds in a burst get a little quieter.
    const rec = now - last < 0.5 ? (this.recent.get(name) ?? 0) + 1 : 0;
    this.recent.set(name, rec);
    this.last.set(name, now);
    return 1 / (1 + rec * 0.12);
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, attack = 0.005, dest?: AudioNode): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, attack, dur);
    o.connect(g).connect(dest ?? this.sfxBus);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    this.voices++;
    o.onended = () => {
      this.voices--;
      g.disconnect();
    };
    return o;
  }

  private noiseHit(t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, q = 1, freqEnd?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, peak, 0.003, dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    const off = Math.random() * 1.5;
    src.start(t, off, dur + 0.05);
    this.voices++;
    src.onended = () => {
      this.voices--;
      g.disconnect();
    };
  }

  play(name: SfxName, opts: { pitch?: number; big?: boolean } = {}): void {
    const k = this.gate(name);
    if (k <= 0) return;
    const t = this.ctx!.currentTime + 0.005;
    const v = 1 + (Math.random() - 0.5) * 0.1;
    const p = (opts.pitch ?? 1) * v;
    switch (name) {
      case 'uiPress':
        this.tone('sine', 720 * p, 520 * p, t, 0.07, 0.22 * k);
        break;
      case 'uiConfirm':
        this.tone('triangle', 660 * p, 660 * p, t, 0.07, 0.16 * k);
        this.tone('triangle', 990 * p, 990 * p, t + 0.07, 0.09, 0.16 * k);
        break;
      case 'step':
        this.noiseHit(t, 0.045, 0.1 * k, 'lowpass', 700 + Math.random() * 500, 0.8);
        this.tone('sine', 170 * p, 110 * p, t, 0.03, 0.06 * k);
        break;
      case 'snip':
        this.noiseHit(t, 0.035, 0.12 * k, 'highpass', 3200, 0.7);
        this.tone('triangle', 1250 * p, 720 * p, t + 0.005, 0.07, 0.07 * k);
        break;
      case 'plop':
        this.tone('sine', 540 * p, 210 * p, t, 0.1, 0.2 * k, 0.004);
        this.noiseHit(t, 0.02, 0.05 * k, 'bandpass', 1400, 1.2);
        break;
      case 'pickup': {
        const f = PENTA[this.pickupIdx % PENTA.length] * (1 + (Math.random() - 0.5) * 0.1);
        this.pickupIdx++;
        this.tone('triangle', f, f * 1.02, t, 0.11, 0.13 * k);
        this.tone('sine', f * 2, f * 2, t, 0.08, 0.05 * k);
        this.tone('sine', 300, 180, t, 0.05, 0.06 * k);
        break;
      }
      case 'binFull':
        this.tone('triangle', 523 * p, 523 * p, t, 0.1, 0.16 * k);
        this.tone('triangle', 392 * p, 392 * p, t + 0.11, 0.14, 0.16 * k);
        break;
      case 'machineFull':
        this.tone('triangle', 330 * p, 330 * p, t, 0.1, 0.12 * k);
        this.tone('triangle', 294 * p, 294 * p, t + 0.12, 0.14, 0.12 * k);
        break;
      case 'unload':
        this.noiseHit(t, 0.05, 0.1 * k, 'bandpass', 1500 + Math.random() * 800, 2.5);
        this.tone('sine', 260 * p, 200 * p, t, 0.04, 0.05 * k);
        break;
      case 'roller':
        this.noiseHit(t, 0.025, 0.1 * k, 'bandpass', 2600, 3);
        this.tone('sine', 280 * p, 560 * p, t + 0.03, 0.14, 0.08 * k, 0.02);
        break;
      case 'coin': {
        const notes = opts.big ? [1318.5, 1568, 2093] : [1318.5, 1760];
        notes.forEach((f, i) => {
          this.tone('sine', f * p, f * p, t + i * 0.055, 0.12, 0.1 * k);
          this.tone('triangle', f * 2 * p, f * 2 * p, t + i * 0.055, 0.05, 0.025 * k);
        });
        break;
      }
      case 'upgrade':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.075, 0.16, 0.14 * k));
        this.tone('sine', 1568, 1568, t + 0.3, 0.2, 0.06 * k);
        break;
      case 'layerDone':
        [523.25, 659.25, 783.99, 1046.5].forEach((f) => this.tone('sine', f, f, t, 0.45, 0.07 * k, 0.02));
        [659.25, 783.99].forEach((f) => this.tone('triangle', f * 2, f * 2, t + 0.05, 0.3, 0.025 * k));
        break;
      case 'contract': {
        const mel = [523.25, 659.25, 783.99, 659.25, 880, 1046.5];
        mel.forEach((f, i) => {
          const dt = i * 0.14 + (i === 5 ? 0.06 : 0);
          this.tone('triangle', f, f, t + dt, i === 5 ? 0.45 : 0.14, 0.15 * k);
          this.tone('sine', f / 2, f / 2, t + dt, i === 5 ? 0.45 : 0.12, 0.06 * k);
        });
        break;
      }
      case 'noMoney':
        this.tone('sine', 170, 95, t, 0.13, 0.16 * k, 0.004);
        break;
      case 'boardUp':
        this.noiseHit(t, 0.14, 0.06 * k, 'bandpass', 500, 2, 1800);
        this.tone('sine', 330, 520, t, 0.12, 0.08 * k);
        break;
      case 'boardDown':
        this.noiseHit(t, 0.14, 0.06 * k, 'bandpass', 1600, 2, 450);
        this.tone('sine', 480, 300, t, 0.12, 0.07 * k);
        break;
      case 'start':
        [659.25, 783.99, 1046.5].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.08, 0.2, 0.12 * k));
        break;
      case 'bladeBreak':
        // Brittle sugar-glass crack: bright noise snap + a falling ping.
        this.noiseHit(t, 0.06, 0.2 * k, 'highpass', 2500, 0.8);
        this.noiseHit(t + 0.03, 0.12, 0.1 * k, 'bandpass', 1400, 2, 500);
        this.tone('triangle', 1400 * p, 380 * p, t, 0.22, 0.1 * k);
        break;
      case 'bladeTake':
        // Short "shing" of a fresh blade.
        this.noiseHit(t, 0.12, 0.08 * k, 'bandpass', 5200, 4, 7500);
        this.tone('sine', 1760 * p, 2350 * p, t, 0.14, 0.07 * k);
        this.tone('triangle', 880 * p, 880 * p, t + 0.05, 0.12, 0.06 * k);
        break;
      case 'doubleCarve':
        [1046.5, 1318.5, 1568, 2093].forEach((f, i) => this.tone('sine', f, f, t + i * 0.045, 0.12, 0.08 * k));
        this.noiseHit(t, 0.1, 0.05 * k, 'highpass', 7000, 0.7);
        break;
      case 'chest': {
        const mel = [784, 988, 1175, 1568];
        mel.forEach((f, i) => this.tone('triangle', f, f, t + i * 0.08, 0.22, 0.13 * k));
        [1318.5, 1760, 2093].forEach((f, i) => this.tone('sine', f, f, t + 0.32 + i * 0.05, 0.16, 0.07 * k));
        break;
      }
      case 'helperOn':
        [880, 1174.66, 880, 1318.5].forEach((f, i) => this.tone('square', f, f, t + i * 0.06, 0.05, 0.03 * k));
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Generative (but deterministic) 16-bar loop, 96 BPM ≈ 40 s: soft marimba,
// simple bass and a little percussion. Scheduled with a lookahead timer.

const BPM = AUDIO.bpm;
const STEPS = 16 * 8; // 16 bars of eighth notes
const CHORDS: number[][] = [
  [60, 64, 67], // C
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [55, 59, 62], // G
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
  [53, 57, 60], // F
  [55, 59, 62], // G
  [52, 55, 59], // Em
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [55, 59, 62], // G
  [60, 64, 67], // C
  [55, 59, 62], // G (turnaround)
];
const SCALE = [0, 2, 4, 7, 9];

function mtof(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function rng(seed: number): number {
  let x = Math.imul(seed | 0, 1103515245) + 12345;
  x = (x ^ (x >>> 15)) >>> 0;
  return (x % 1000) / 1000;
}

class MusicPlayer {
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private running = false;

  constructor(
    private ctx: AudioContext,
    private out: AudioNode,
    private noise: AudioBuffer,
  ) {}

  start(): void {
    this.setRunning(true);
  }

  setRunning(on: boolean): void {
    if (on === this.running) return;
    this.running = on;
    if (on) {
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 50);
    } else if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    if (this.ctx.state !== 'running') {
      this.nextTime = this.ctx.currentTime + 0.1;
      return;
    }
    const stepDur = 60 / BPM / 2;
    // Never try to catch up a long gap (e.g. after a tab switch).
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.2) {
      this.playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % STEPS;
      this.nextTime += stepDur;
    }
  }

  private note(freq: number, t: number, dur: number, peak: number, type: OscillatorType, partial = 0): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
    o.onended = () => g.disconnect();
    if (partial > 0) {
      // Marimba-ish bright partial that dies quickly.
      const o2 = this.ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = freq * 4;
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(peak * partial, t + 0.004);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o2.connect(g2).connect(this.out);
      o2.start(t);
      o2.stop(t + 0.12);
      o2.onended = () => g2.disconnect();
    }
  }

  private hat(t: number, peak: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random(), 0.06);
    src.onended = () => g.disconnect();
  }

  private kick(t: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.2);
    o.onended = () => g.disconnect();
  }

  private playStep(step: number, t: number): void {
    const bar = Math.floor(step / 8);
    const e = step % 8; // eighth within the bar
    const chord = CHORDS[bar];
    // Bass: root on 1, fifth on the "and" of 3.
    if (e === 0) this.note(mtof(chord[0] - 24), t, 0.5, 0.22, 'triangle');
    if (e === 5) this.note(mtof(chord[0] - 24 + 7), t, 0.3, 0.14, 'triangle');
    // Soft chord pluck on beats 2 and 4.
    if (e === 2 || e === 6) for (const n of chord) this.note(mtof(n), t, 0.35, 0.035, 'sine', 0.3);
    // Marimba melody from the pentatonic scale, sparse and repeatable.
    const r = rng(step * 7 + bar * 131);
    const play = e === 0 || e === 3 || (e === 4 && r > 0.3) || (e === 6 && r > 0.55) || (e === 7 && r > 0.8);
    if (play && !(bar % 4 === 3 && e > 4)) {
      const deg = Math.floor(rng(step * 13 + 5) * SCALE.length);
      const oct = rng(step * 3 + 1) > 0.7 ? 12 : 0;
      const m = 72 + SCALE[deg] + oct - (bar >= 8 && bar < 12 ? 2 : 0);
      this.note(mtof(m), t, 0.28, 0.08, 'sine', 0.55);
    }
    // Percussion.
    if (e === 0 || e === 4) this.kick(t);
    if (e % 2 === 1) this.hat(t, 0.035);
    if (e === 6 && bar % 2 === 1) this.hat(t, 0.05);
  }
}
