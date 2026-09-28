import { CART, CONTRACTS, FX, MILESTONES, MOVE, SAVE, SIM, TUTORIAL_STEPS, UPGRADES, UPGRADE_ORDER, WORLD, type StationId } from './config';
import type { GameEvent } from './events';
import { Simulation } from './Simulation';
import { bladeDurability, cargoMass, cartCapacity, computeLedger, hopperMass, nextContractDef, nextUpgradeCost, NUM_LAYERS, sourceRemaining, upgradeAvailable, upgradeValue } from './state';
import { canBoard, intakePosition } from './systems/MovementSystem';
import { inUnloadZone } from './systems/CollectionSystem';
import { currentTutorialStep } from './systems/TutorialSystem';
import { lerpAngle } from './context';
import { findPath } from './nav';
import { World, type Quality } from '../world/World';
import { AudioManager } from '../audio/AudioManager';
import { SaveManager, type Settings } from '../persistence/SaveManager';
import { InputSystem } from '../input/InputSystem';
import { HUD, type HudData } from '../ui/HUD';
import { UpgradePanel } from '../ui/UpgradePanel';
import { SettingsPanel } from '../ui/SettingsPanel';
import { ContractModal, StartOverlay, showFatal } from '../ui/Modals';
import { DebugPanel } from '../ui/DebugPanel';
import { el } from '../ui/dom';

const STEP = 1 / SIM.tickRate;

export class Game {
  readonly sim: Simulation;
  world!: World;
  readonly audio = new AudioManager();
  readonly saves = new SaveManager();
  settings: Settings;
  private hud!: HUD;
  private upgrades!: UpgradePanel;
  private settingsPanel!: SettingsPanel;
  private contractModal!: ContractModal;
  private startOverlay!: StartOverlay;
  private debug!: DebugPanel;
  private input!: InputSystem;
  private worldEl!: HTMLDivElement;
  private started = false;
  private paused = false;
  private contextLost = false;
  private resetting = false;
  private acc = 0;
  private last = performance.now();
  private prev = { px: 0, pz: 0, cx: 0, cz: 0, heading: 0, rotation: 0 };
  private saveTimer = 0;
  private dirty = false;
  private stepDist = 0;
  private lastPx = 0;
  private lastPz = 0;
  private shakeT = 0;
  private yumCooldown = 0;
  private pendingContractModal = -1;
  private pickupBurst = 0;
  private frameTimes: number[] = [];
  private qualityWindow = 0;
  private slowWindows = 0;
  private fastWindows = 0;
  private fps = 60;
  private loadNotice: string | null = null;
  private lastInsetKey = '';
  private frameTarget: { x: number; z: number; y?: number } | null = null;
  private framePlayer = { x: 0, z: 0 };
  private qa = false;

  constructor(private app: HTMLElement) {
    const loaded = this.saves.load();
    this.sim = new Simulation(loaded.state);
    if (!loaded.ok) {
      if (loaded.reason === 'unavailable') this.loadNotice = "Storage unavailable — progress won't be saved.";
      else if (loaded.reason === 'version') this.loadNotice = 'Unknown save version — starting fresh.';
      else this.loadNotice = 'Save data was corrupted — starting fresh.';
    }
    this.settings = this.saves.loadSettings();
    const params = new URLSearchParams(window.location.search);
    this.qa = params.has('qa') || params.has('debug');

    this.worldEl = el('div', 'world', undefined, app);
    try {
      this.world = new World(this.worldEl);
    } catch (err) {
      console.error(err);
      showFatal(app, 'WebGL not available', 'This browser or device cannot show 3D graphics. Try another browser or turn on hardware acceleration.', false);
      throw err;
    }
    this.buildUI(loaded.ok && !loaded.fresh);
    this.applySettings(this.settings, false);
    this.world.onRollLand = () => this.audio.play('plop');
    this.bindWindow();
    this.snapPrev();
    this.lastPx = this.sim.state.player.x;
    this.lastPz = this.sim.state.player.z;
    if (params.has('debug')) this.debug.toggle(true);
    if (this.qa) (window as unknown as { __candy: unknown }).__candy = { game: this, sim: this.sim, findPath, computeLedger };
    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------------------
  // UI wiring

  private buildUI(welcomeBack: boolean): void {
    const app = this.app;
    this.hud = new HUD(app);
    this.upgrades = new UpgradePanel(app);
    this.settingsPanel = new SettingsPanel(app);
    this.contractModal = new ContractModal(app);
    this.debug = new DebugPanel(app);
    this.startOverlay = new StartOverlay(app);
    this.startOverlay.setWelcomeBack(welcomeBack);
    this.input = new InputSystem(this.worldEl, app, this.hud.joyBase, this.hud.joyKnob);

    this.input.onFirstInput = () => this.audio.unlock();
    this.input.onEscape = () => this.escape();
    this.input.onDebug = () => this.debug.toggle();

    this.startOverlay.onStart = () => {
      this.audio.unlock();
      this.audio.play('start');
      this.started = true;
      this.startOverlay.hide();
      // A save taken right at completion must still offer the next contract.
      const c = this.sim.state.contract;
      if (c.status === 'completed') {
        const bonus = CONTRACTS[c.defId].bonus;
        this.lastCompletion = { defId: c.defId, soldCount: c.soldCount, revenue: c.revenue - bonus, bonus };
        this.pendingContractModal = 0.3;
      }
      if (this.loadNotice) this.hud.toast(this.loadNotice, 3.2);
      else if (!this.saves.available) this.hud.toast("Storage unavailable — progress won't be saved.", 3.2);
    };

    const press = (b: HTMLElement) => b.addEventListener('pointerdown', () => this.audio.play('uiPress'));
    press(this.hud.settingsBtn);
    press(this.hud.autopilotBtn);

    this.hud.settingsBtn.addEventListener('click', () => this.openSettings());
    this.hud.skipBtn.addEventListener('click', () => {
      this.sim.skipTutorial();
      this.audio.play('uiConfirm');
      this.markDirty(true);
    });
    this.hud.autopilotBtn.addEventListener('click', () => {
      this.sim.setAutopilot(!this.sim.state.autopilotEnabled);
      this.markDirty(true);
    });

    this.upgrades.onClose = () => this.closeUpgrades();
    this.upgrades.onBuy = (id) => {
      this.sim.purchase(id);
      this.upgrades.update(this.sim.state);
    };

    this.settingsPanel.onChange = (s) => this.applySettings(s, true);
    this.settingsPanel.onResume = () => this.closeSettings();
    this.settingsPanel.onSkipTutorial = () => {
      this.sim.skipTutorial();
      this.markDirty(true);
      this.closeSettings();
    };
    this.settingsPanel.onAutoContinue = (on) => {
      this.sim.state.autoContinue = on;
      this.markDirty(true);
    };
    this.settingsPanel.onReset = () => this.resetProgress();

    this.contractModal.onNext = (defId) => {
      this.audio.play('uiConfirm');
      this.contractModal.hide();
      this.input.enabled = true;
      if (this.sim.startContract(defId)) this.markDirty(true);
    };

    this.debug.onAddCoins = () => {
      this.sim.state.coins += 500;
    };
    this.debug.onSkipTutorial = () => this.sim.skipTutorial();
    this.debug.onZones = (on) => (this.world.showDebug = on);
    this.debug.onReset = () => this.resetProgress();
    this.debug.onPickContract = (defId) => {
      // Debug only: force-complete the current instance without paying anything.
      const c = this.sim.state.contract;
      if (c.status !== 'completed') {
        c.status = 'completed';
        c.bonusPaid = true;
        this.sim.state.collectibles = this.sim.state.collectibles.filter((r) => r.ciid !== c.ciid);
        this.sim.state.cart.cargo = [];
        this.sim.state.machine.hopper = [];
        this.sim.state.machine.cycle = null;
        this.sim.state.conveyor = [];
        this.sim.state.peelers.player.buffer = null;
        this.sim.state.peelers.helper.buffer = null;
        for (let i = 0; i < defId; i++) if (!this.sim.state.contractsCompleted.includes(i)) this.sim.state.contractsCompleted.push(i);
        this.sim.state.totalContractsCompleted = Math.max(this.sim.state.totalContractsCompleted, defId);
      }
      this.sim.startContract(defId);
    };
  }

  private bindWindow(): void {
    const ro = new ResizeObserver(() => this.onResize());
    ro.observe(this.app);
    window.addEventListener('orientationchange', () => this.onResize());
    this.onResize();
    document.addEventListener('visibilitychange', () => {
      const hidden = document.visibilityState === 'hidden';
      this.input.reset();
      this.audio.setHidden(hidden);
      if (hidden) this.saveNow();
      this.last = performance.now();
      this.acc = 0;
    });
    window.addEventListener('pagehide', () => this.saveNow());
    const canvas = this.world.renderer.domElement;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.saveNow();
      this.hud.toast('Graphics lost — trying to recover…', 6);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.hud.toast('Graphics restored!', 1.5);
    });
  }

  private onResize(): void {
    this.input?.reset();
    const w = this.app.clientWidth;
    const h = this.app.clientHeight;
    const ins = this.hud.insets();
    this.lastInsetKey = `${w}x${h}:${Math.round(ins.top)}:${Math.round(ins.bottom)}`;
    this.world.resize(w, h, { top: ins.top, bottom: ins.bottom, left: 8, right: 8 });
  }

  private applySettings(s: Settings, persist: boolean): void {
    this.settings = s;
    this.audio.setVolumes(s.sfx, s.music);
    this.world.reducedMotion = s.reducedMotion;
    this.hud.reducedMotion = s.reducedMotion;
    document.documentElement.classList.toggle('reduced-motion', s.reducedMotion);
    const q: Quality = s.quality === 'auto' ? this.world.currentQuality : s.quality;
    this.world.setQuality(q);
    if (persist) this.saves.saveSettings(s);
  }

  private escape(): void {
    if (this.upgrades.open) return this.closeUpgrades();
    if (this.settingsPanel.open) return this.closeSettings();
    if (this.contractModal.open) return;
    if (this.started) this.openSettings();
  }

  private openUpgrades(station: StationId): void {
    if (!this.started || this.paused || this.contractModal.open) return;
    this.input.reset();
    this.input.enabled = false;
    this.audio.play('uiConfirm');
    this.upgrades.show(station);
    this.upgrades.update(this.sim.state);
  }

  /** Does this station have an upgrade the player can buy right now? */
  private stationAffordable(station: StationId): boolean {
    const s = this.sim.state;
    for (const id of UPGRADE_ORDER) {
      if (UPGRADES[id].station !== station || !upgradeAvailable(s, id)) continue;
      const cost = nextUpgradeCost(s, id);
      if (cost !== null && cost <= s.coins) return true;
    }
    return false;
  }

  private closeUpgrades(): void {
    this.upgrades.hide();
    this.input.enabled = !this.contractModal.open;
  }

  private openSettings(): void {
    if (!this.started) return;
    this.input.reset();
    this.input.enabled = false;
    this.paused = true;
    this.audio.setPaused(true);
    this.settingsPanel.show(this.settings, {
      tutorialDone: this.sim.state.tutorial.done,
      autoContinueAvailable: this.sim.state.upgrades.helper > 0,
      autoContinue: this.sim.state.autoContinue,
      storageOk: this.saves.available,
    });
  }

  private closeSettings(): void {
    this.settingsPanel.hide();
    this.paused = false;
    this.audio.setPaused(false);
    this.input.enabled = !this.upgrades.open && !this.contractModal.open;
    this.last = performance.now();
  }

  private resetProgress(): void {
    this.resetting = true;
    this.saves.clear();
    window.location.reload();
  }

  private markDirty(now = false): void {
    this.dirty = true;
    if (now) this.saveNow();
  }

  private saveNow(): void {
    if (this.resetting) return;
    const status = this.saves.save(this.sim.state);
    this.dirty = false;
    this.saveTimer = 0;
    if (status === 'quota') this.hud?.toast('Storage full — progress not saved.', 2.5);
  }

  // ---------------------------------------------------------------------------
  // Main loop

  private snapPrev(): void {
    const s = this.sim.state;
    this.prev.px = s.player.x;
    this.prev.pz = s.player.z;
    this.prev.cx = s.cart.x;
    this.prev.cz = s.cart.z;
    this.prev.heading = s.cart.heading;
    this.prev.rotation = s.contract.rotation;
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const rawDt = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    const dt = Math.min(SIM.maxFrameDt, rawDt);
    this.trackPerformance(rawDt);
    const running = this.started && !this.paused && !this.contextLost && document.visibilityState !== 'hidden';

    // Input → simulation intent (screen up = world −Z).
    const mv = this.input.read();
    if (running) this.sim.setInput(mv.x, mv.y, mv.mag);
    else this.sim.setInput(0, 0, 0);

    if (running) {
      this.acc += dt * this.debug.simSpeed;
      let steps = 0;
      while (this.acc >= STEP && steps < SIM.maxCatchUpSteps) {
        this.snapPrev();
        this.sim.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps >= SIM.maxCatchUpSteps) this.acc = 0; // never spiral after a hitch
    }
    const events = this.sim.drainEvents();
    if (events.length) this.handleEvents(events);

    const s = this.sim.state;
    const alpha = running ? Math.min(1, this.acc / STEP) : 1;
    const pdt = running ? dt : 0;
    const it = {
      px: this.prev.px + (s.player.x - this.prev.px) * alpha,
      pz: this.prev.pz + (s.player.z - this.prev.pz) * alpha,
      cx: this.prev.cx + (s.cart.x - this.prev.cx) * alpha,
      cz: this.prev.cz + (s.cart.z - this.prev.cz) * alpha,
      heading: lerpAngle(this.prev.heading, s.cart.heading, alpha),
      rotation: lerpAngle(this.prev.rotation, s.contract.rotation, alpha),
    };
    const tut = currentTutorialStep(s);
    this.frameTarget = running ? this.arrowTarget(tut) : null;
    this.world.update(s, it, pdt, {
      playerCutting: s.peelers.player.outputRate > 0.05 && s.player.mode === 'carving',
      helperCutting: s.upgrades.helper > 0 && s.peelers.helper.outputRate > 0.05,
      arrowTarget: this.frameTarget,
      highlightCart:
        s.player.mode === 'onFoot' &&
        s.player.boardArmed &&
        Math.hypot(s.cart.vx, s.cart.vz) <= MOVE.autoBoardMaxCartSpeed &&
        (canBoard(s) || (tut >= 0 && TUTORIAL_STEPS[tut].id === 'board')),
      boardProgress: s.player.boardDwell / MOVE.autoBoardTime,
      parkHighlight: s.player.mode === 'driving',
      parkProgress: Math.max(0, s.player.parkDwell) / MOVE.parkDisembarkTime,
      padBadges: { blade: this.stationAffordable('blade'), cart: this.stationAffordable('cart'), machine: this.stationAffordable('machine') },
    });
    this.framePlayer.x = it.px;
    this.framePlayer.z = it.pz;
    if (s.player.mode === 'driving' || s.player.mode === 'boarding') {
      this.framePlayer.x = it.cx;
      this.framePlayer.z = it.cz;
    }
    if (!this.contextLost) this.world.render();

    // Continuous audio follows real values.
    if (running) {
      const cartActive = s.player.mode === 'driving' || s.cart.control === 'autopilot';
      const spin01 = Math.min(1, (s.contract.spinRate - Math.PI / 2) / Math.PI);
      this.audio.setLoops(s.peelers.player.outputRate + s.peelers.helper.outputRate * 0.4, s.contract.activeLayer < NUM_LAYERS ? spin01 : 0, Math.hypot(s.cart.vx, s.cart.vz), cartActive);
      this.footsteps(s);
    }

    this.hud.update(this.hudData(tut), dt);
    this.upgrades.update(s);
    this.updateShake(dt);
    this.yumCooldown = Math.max(0, this.yumCooldown - pdt);
    this.pickupBurst = Math.max(0, this.pickupBurst - dt * 2);
    this.debug.update(s, { fps: this.fps, frameMs: 1000 / Math.max(1, this.fps), drawCalls: this.world.drawCalls, triangles: this.world.triangles, rolls: this.world.collectibles.activeCount, particles: this.world.effects.particleCount, quality: this.world.currentQuality }, dt);

    // Re-fit the camera if the HUD's height changed (fonts loading, safe-area…).
    if (Math.floor(now / 500) !== Math.floor((now - rawDt * 1000) / 500)) {
      const ins = this.hud.insets();
      const key = `${this.app.clientWidth}x${this.app.clientHeight}:${Math.round(ins.top)}:${Math.round(ins.bottom)}`;
      if (key !== this.lastInsetKey) this.onResize();
    }

    if (this.pendingContractModal >= 0) {
      this.pendingContractModal -= dt;
      if (this.pendingContractModal < 0) this.showContractModal();
    }
    if (running) {
      this.saveTimer += dt;
      if (this.dirty && this.saveTimer >= SAVE.autosaveInterval) this.saveNow();
    }
  };

  private footsteps(s: typeof this.sim.state): void {
    const p = s.player;
    if (p.mode === 'onFoot' || p.mode === 'carving') {
      this.stepDist += Math.hypot(p.x - this.lastPx, p.z - this.lastPz);
      if (this.stepDist > 0.42) {
        this.stepDist = 0;
        this.audio.play('step');
      }
    }
    this.lastPx = p.x;
    this.lastPz = p.z;
  }

  private trackPerformance(rawDt: number): void {
    if (rawDt <= 0 || rawDt > 0.5) return;
    this.frameTimes.push(rawDt);
    this.qualityWindow += rawDt;
    if (this.qualityWindow < 3) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.fps = 1 / avg;
    this.frameTimes = [];
    this.qualityWindow = 0;
    if (this.settings.quality !== 'auto' || !this.started || this.paused) return;
    // Hysteresis: several slow windows to drop, many fast windows to climb.
    if (avg > 0.028) {
      this.slowWindows++;
      this.fastWindows = 0;
    } else if (avg < 0.0175) {
      this.fastWindows++;
      this.slowWindows = 0;
    } else {
      this.slowWindows = 0;
      this.fastWindows = 0;
    }
    const q = this.world.currentQuality;
    if (this.slowWindows >= 2 && q !== 'low') {
      this.world.setQuality(q === 'high' ? 'normal' : 'low');
      this.slowWindows = 0;
    } else if (this.fastWindows >= 4 && q === 'low') {
      this.world.setQuality('normal');
      this.fastWindows = 0;
    }
  }

  private updateShake(dt: number): void {
    if (this.shakeT <= 0) return;
    this.shakeT -= dt;
    if (this.shakeT <= 0 || this.settings.reducedMotion) {
      this.worldEl.style.transform = '';
      this.shakeT = 0;
      return;
    }
    const a = FX.shakePx;
    this.worldEl.style.transform = `translate(${(Math.random() - 0.5) * 2 * a}px, ${(Math.random() - 0.5) * 2 * a}px)`;
  }

  private haptic(): void {
    if (!this.settings.haptics) return;
    const nav = navigator as Navigator & { vibrate?: (p: number) => boolean };
    if (typeof nav.vibrate === 'function') {
      try {
        nav.vibrate(FX.hapticMs);
      } catch {
        /* ignore */
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Events → audio + UI (never economy)

  private handleEvents(events: GameEvent[]): void {
    const s = this.sim.state;
    this.world.handleEvents(events, s);
    for (const e of events) {
      switch (e.type) {
        case 'rollSpawned':
          this.audio.play('snip', { pitch: 0.95 + e.layer * 0.03 });
          this.dirty = true;
          break;
        case 'rawCarved':
          if (e.peeler === 'player' && s.peelers.player.streak > 4 && this.yumCooldown <= 0) {
            this.yumCooldown = 25;
            const p = this.world.worldToScreen(s.player.x, 1.2, s.player.z);
            this.hud.bubble(p.x, p.y, 'Yum!');
          }
          break;
        case 'rawCollected':
          this.audio.play('pickup');
          this.pickupBurst += 1;
          if (this.pickupBurst > 2.5) {
            this.haptic();
            this.pickupBurst = 0;
            this.world.character.pickupWobble();
          }
          this.dirty = true;
          break;
        case 'capacityReached':
          this.audio.play('binFull');
          this.haptic();
          break;
        case 'rawUnloaded':
          this.audio.play('unload');
          this.dirty = true;
          break;
        case 'hopperFull':
          this.audio.play('machineFull');
          break;
        case 'productionStarted':
          this.audio.play('roller', { pitch: 0.9 + s.upgrades.machine * 0.08 });
          break;
        case 'productSold': {
          this.audio.play('coin', { big: e.count > 1 });
          const sp = this.world.kiosk.salePoint;
          const p = this.world.worldToScreen(sp.x, 0.9, sp.z);
          this.hud.floatText(p.x, p.y, e.value);
          this.hud.coinTo(p.x, p.y);
          this.dirty = true;
          break;
        }
        case 'upgradePurchased': {
          this.audio.play(e.id === 'helper' ? 'helperOn' : 'upgrade');
          const def = UPGRADES[e.id];
          this.hud.toast(def.kind === 'unlock' ? `${def.name} unlocked!` : `${def.name} Lv ${e.level + 1}!`, 1.6);
          this.markDirty(true);
          break;
        }
        case 'purchaseFailed':
          this.audio.play('noMoney');
          this.hud.toast('Not enough coins', 1.2);
          break;
        case 'layerCleared':
          this.audio.play('layerDone');
          this.haptic();
          if (e.nextLayer < NUM_LAYERS) this.hud.toast(`Layer ${e.layer + 1} cleared!`, 1.2);
          this.dirty = true;
          break;
        case 'sourceEmptied':
          this.hud.toast('Candy finished — collect the leftover ribbons!', 2);
          break;
        case 'contractCompleted':
          this.audio.play('contract');
          this.shakeT = FX.shakeTime;
          this.haptic();
          this.pendingContractModal = 1.1;
          this.lastCompletion = { defId: e.defId, soldCount: e.soldCount, revenue: e.revenue, bonus: e.bonus };
          this.markDirty(true);
          break;
        case 'contractStarted':
          this.audio.play('start');
          this.markDirty(true);
          break;
        case 'modeChanged':
          if (e.to === 'boarding') this.audio.play('boardUp');
          if (e.to === 'disembarking') this.audio.play('boardDown');
          this.dirty = true;
          break;
        case 'disembarkBlocked':
          this.audio.play('noMoney');
          this.hud.toast('No room to hop out', 1.4);
          break;
        case 'tutorialStep':
          this.audio.play('uiConfirm');
          if (e.step === -1 && !s.tutorial.skipped) this.hud.toast('Tutorial complete — happy selling!', 2);
          this.markDirty();
          break;
        case 'relocated':
          if (e.who === 'player') this.hud.toast('Moved you to a safe spot', 1.4);
          break;
        case 'bladeBroken': {
          this.audio.play('bladeBreak');
          this.haptic();
          const pt = this.world.worldToScreen(s.player.x, 1.3, s.player.z);
          this.hud.shout(pt.x, pt.y, e.spares > 0 ? 'Blade broke! Spare in hand' : 'Blade broke!');
          break;
        }
        case 'bladeTaken':
          this.audio.play('bladeTake');
          this.markDirty();
          break;
        case 'doubleCarve': {
          this.audio.play('doubleCarve');
          const pt = this.world.worldToScreen(s.player.x, 1.5, s.player.z);
          this.hud.shout(pt.x, pt.y, 'DOUBLE CARVE!');
          break;
        }
        case 'milestone': {
          this.audio.play(e.kind === 'chest' ? 'chest' : 'coin', { big: true });
          this.hud.toast(e.kind === 'chest' ? `Treasure chest! +${e.reward} coins` : `Milestone reward +${e.reward} coins`, 1.8);
          const pt = this.hud.milestonePoint(e.index);
          if (pt) for (let i = 0; i < (e.kind === 'chest' ? 4 : 2); i++) this.hud.coinTo(pt.x + i * 6, pt.y);
          this.markDirty(true);
          break;
        }
        case 'stationEntered':
          if (e.station === 'blade' || e.station === 'cart' || e.station === 'machine') this.openUpgrades(e.station);
          break;
        case 'autopilotToggled':
          this.audio.play('uiConfirm');
          break;
        default:
          break;
      }
    }
  }

  private lastCompletion: { defId: number; soldCount: number; revenue: number; bonus: number } | null = null;

  private showContractModal(): void {
    const s = this.sim.state;
    if (s.contract.status !== 'completed' || !this.lastCompletion) return;
    if (s.autoContinue && s.upgrades.helper > 0) return; // "Auto-start next contract" handles it
    this.input.reset();
    this.input.enabled = false;
    if (this.upgrades.open) this.upgrades.hide();
    this.contractModal.show({ ...this.lastCompletion, nextDefId: nextContractDef(s), completedDefs: s.contractsCompleted });
  }

  // ---------------------------------------------------------------------------
  // Derived HUD data, statuses and tutorial targets

  private arrowTarget(step: number): { x: number; z: number; y?: number } | null {
    const s = this.sim.state;
    const driving = s.player.mode === 'driving';
    const onFoot = s.player.mode === 'onFoot' || s.player.mode === 'carving';
    const bestRollSpot = () => {
      let best: { x: number; z: number } | null = null;
      let bestMass = 0;
      const rolls = s.collectibles.filter((r) => r.age >= CART.settleTime);
      for (const r of rolls) {
        let m = 0;
        for (const q of rolls) if ((q.x - r.x) ** 2 + (q.z - r.z) ** 2 < 1.7) m += q.mass;
        if (m > bestMass) {
          bestMass = m;
          best = { x: r.x, z: r.z };
        }
      }
      return best;
    };
    const park = { x: WORLD.parkBay.x, z: WORLD.parkBay.z };
    const bladePad = { x: WORLD.bladePad.x, z: WORLD.bladePad.z };
    const pad = (id: string) => {
      const p = WORLD.upgradePads.find((q) => q.id === id)!;
      return { x: p.x, z: p.z };
    };
    const rim = () => {
      const a = Math.atan2(s.player.z - WORLD.source.z, s.player.x - WORLD.source.x);
      const r = WORLD.source.radius - 0.45;
      return { x: WORLD.source.x + Math.cos(a) * r, z: WORLD.source.z + Math.sin(a) * r, y: 0.68 };
    };
    if (step >= 0) {
      const id = TUTORIAL_STEPS[step].id;
      if (id === 'blade') return bladePad;
      if (id === 'carve') return s.player.blades > 0 ? rim() : bladePad;
      if (id === 'board') return driving ? null : { x: s.cart.x, z: s.cart.z };
      if (id === 'collect') return driving ? bestRollSpot() : { x: s.cart.x, z: s.cart.z };
      if (id === 'deliver') return driving || s.cart.control === 'autopilot' ? { x: WORLD.unloadZone.x, z: WORLD.unloadZone.z } : { x: s.cart.x, z: s.cart.z };
      if (id === 'sell') return { x: WORLD.kiosk.x, z: WORLD.kiosk.z };
      if (id === 'park') return driving ? park : null;
      if (id === 'upgrade') return driving ? park : this.stationAffordable('blade') ? pad('blade') : null;
      return null;
    }
    // After the tutorial: soft hints only.
    if (onFoot && s.player.blades <= 0 && s.contract.status === 'active') return bladePad;
    if (driving && cargoMass(s) < 1e-6 && !s.collectibles.some((r) => r.age >= CART.settleTime)) return park;
    if (s.contract.status === 'sourceEmpty' && s.collectibles.length > 0 && s.cart.control !== 'autopilot') return bestRollSpot();
    return null;
  }

  /** Screen-edge arrow when the current target is off screen. */
  private edgeIndicator(): { x: number; y: number; angle: number } | null {
    const t = this.frameTarget;
    if (!t) return null;
    const w = this.app.clientWidth;
    const h = this.app.clientHeight;
    const ins = this.hud.insets();
    const p = this.world.worldToScreen(t.x, (t.y ?? 0) + 0.5, t.z);
    const m = 34;
    const minY = ins.top + m;
    const maxY = h - Math.max(ins.bottom, 70) - m;
    if (p.x >= m && p.x <= w - m && p.y >= minY && p.y <= maxY) return null;
    const cx = w / 2;
    const cy = (minY + maxY) / 2;
    let dx = p.x - cx;
    let dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const kx = dx !== 0 ? (dx > 0 ? w - m - cx : m - cx) / dx : Infinity;
    const ky = dy !== 0 ? (dy > 0 ? maxY - cy : minY - cy) / dy : Infinity;
    const k = Math.min(Math.abs(kx), Math.abs(ky));
    return { x: cx + dx * k, y: cy + dy * k, angle: Math.atan2(dy, dx) };
  }

  private hudData(step: number): HudData {
    const s = this.sim.state;
    const c = s.contract;
    const cap = cartCapacity(s);
    const cargo = cargoMass(s);
    const driving = s.player.mode === 'driving';
    const onFoot = s.player.mode === 'onFoot' || s.player.mode === 'carving';
    const auto = s.cart.control === 'autopilot';
    let prompt: string | null = null;
    let kind: HudData['promptKind'] = 'info';
    const tutorialActive = step >= 0;
    const l = computeLedger(s);
    const cheapestBlade = Math.min(...UPGRADE_ORDER.filter((id) => UPGRADES[id].station === 'blade').map((id) => nextUpgradeCost(s, id) ?? Infinity));
    if (tutorialActive) {
      const id = TUTORIAL_STEPS[step].id;
      prompt = TUTORIAL_STEPS[step].text;
      kind = 'tutorial';
      if (id === 'upgrade' && !this.stationAffordable('blade')) prompt = Number.isFinite(cheapestBlade) ? `Sell candy until you have ${cheapestBlade} coins` : null;
      if (id === 'upgrade' && driving) prompt = 'Park at P, then upgrade your blade';
      if (id === 'park' && !driving) prompt = 'Hop back in when you need to haul';
      if (id === 'carve' && s.player.blades <= 0) prompt = 'Grab a new blade';
      // Don't rush the chef to the cart while a good blade is still cutting.
      if ((id === 'board' || id === 'collect') && s.player.mode === 'carving') prompt = 'Hold to carve';
    } else if (c.status !== 'completed') {
      if (onFoot && s.player.blades <= 0 && c.status === 'active') {
        prompt = 'Grab a new blade';
        kind = 'warn';
      } else if ((driving || auto) && cargo >= cap - 1e-6) {
        prompt = 'Cart full — deliver to the machine';
        kind = 'warn';
      } else if (inUnloadZone(s) && cargo > 0 && hopperMass(s) >= 72 - 1e-6) {
        prompt = 'Machine full';
        kind = 'warn';
      } else if (c.status !== 'active') {
        if (l.world > 1e-6 || l.buffers > 1e-6) prompt = 'Find the leftover ribbons';
        else if (l.cart > 1e-6) prompt = 'Deliver to the machine';
        else prompt = 'Waiting for production…';
      } else if (driving && l.world > 1e-6 && cargo < cap - 1e-6) {
        const ip = intakePosition(s);
        const near = s.collectibles.some((r) => Math.hypot(r.x - ip.x, r.z - ip.z) < 2.2);
        if (!near) prompt = 'Get closer to the rolls';
      } else if (driving && cargo < 1e-6) {
        prompt = 'Park the cart at P to hop out';
      } else if (s.player.mode === 'carving') {
        prompt = 'Hold to carve';
      }
    }
    // Hop-in / hop-out progress beats every other message.
    if (s.player.boardDwell > 0.05) {
      prompt = 'Hopping in…';
      kind = 'info';
    } else if (driving && s.player.parkDwell > 0.02) {
      prompt = 'Hopping out…';
      kind = 'info';
    }
    const idx = c.defId;
    const replay = s.contractsCompleted.includes(idx) && c.status !== 'completed' ? ' · replay' : '';
    const autopilotOwned = upgradeValue(s, 'autopilot') > 0;
    const at = this.world.worldToScreen(this.framePlayer.x, 0, this.framePlayer.z);
    const pendingRaw = l.world + l.cart + l.hopper + l.buffers;
    return {
      coins: s.coins,
      defId: c.defId,
      contractLabel: `Contract ${idx + 1}/3${replay}`,
      remaining01: c.initialRaw > 0 ? sourceRemaining(c) / c.initialRaw : 0,
      activeLayer: c.activeLayer,
      piecesValue: Math.floor((pendingRaw / 2) * CONTRACTS[c.defId].productValue + 1e-6),
      milestones: MILESTONES.map((m, i) => ({ at: m.at, kind: m.kind, claimed: (c.milestones & (1 << i)) !== 0 })),
      cargo,
      capacity: cap,
      showCart: driving || cargo > 0 || auto,
      prompt,
      promptKind: kind,
      promptX: at.x,
      promptY: at.y + 22,
      tutorialActive,
      blades: s.player.blades,
      bladeWear: s.player.blades > 0 ? s.player.bladeWear : 0,
      bladeMax: bladeDurability(s),
      autopilotOwned,
      autopilotOn: s.autopilotEnabled,
      edge: this.edgeIndicator(),
    };
  }
}
