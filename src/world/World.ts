import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CAMERA, CONTRACTS, MACHINE, MOVE, PALETTE, WORLD } from '../game/config';
import type { GameEvent } from '../game/events';
import type { GameState } from '../game/types';
import { cargoMass, cartCapacity, layerRadii, maxSurfaceRadiusInSpan, pickupRadius, NUM_LAYERS } from '../game/state';
import { helperPosition } from '../game/systems/PeelingSystem';
import { intakePosition } from '../game/systems/MovementSystem';
import { CandyRoll, LAYER_HEIGHTS } from './CandyRoll';
import { Character } from './Character';
import { CandyCart } from './CandyCart';
import { FactoryMachine } from './FactoryMachine';
import { Conveyor } from './Conveyor';
import { Kiosk } from './Kiosk';
import { HelperBot } from './HelperBot';
import { CollectibleRenderer } from '../visuals/CollectibleRenderer';
import { Ribbon } from '../visuals/RibbonRenderer';
import { Effects } from '../visuals/Effects';
import { ProductRenderer } from '../visuals/ProductRenderer';
import { badgeTexture, floorTexture, padIconTexture, parkingTexture, signTexture } from '../visuals/textures';
import { candy, cylinder, mesh, roundedBox, sphere, toy } from '../visuals/materials';
import { mergeStaticChildren } from '../visuals/merge';

export type Quality = 'low' | 'normal' | 'high';

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface Interp {
  px: number;
  pz: number;
  cx: number;
  cz: number;
  heading: number;
  rotation: number;
}

const PITCH = THREE.MathUtils.degToRad(CAMERA.pitchDeg);
const TAN_HALF_FOV = Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2));

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.5, 200);
  private sun: THREE.DirectionalLight;
  readonly candy = new CandyRoll();
  readonly character = new Character();
  readonly cart = new CandyCart();
  readonly machine = new FactoryMachine();
  readonly conveyor = new Conveyor();
  readonly kiosk = new Kiosk();
  readonly helper = new HelperBot();
  readonly collectibles = new CollectibleRenderer();
  readonly effects = new Effects();
  readonly products = new ProductRenderer();
  private ribbonPlayer = new Ribbon();
  private ribbonHelper = new Ribbon();
  private parkGlow: THREE.Mesh;
  private parkRing: THREE.Mesh;
  private arrow = new THREE.Group();
  private arrowRing: THREE.Mesh;
  private debugGroup = new THREE.Group();
  private tmpV = new THREE.Vector3();
  private shardTimer = 0;
  private unloadVisTimer = 0;
  private time = 0;
  private quality: Quality = 'normal';
  private viewW = 1;
  private viewH = 1;
  private camDist = 28;
  private camTarget = new THREE.Vector3();
  private camReady = false;
  reducedMotion = false;
  showDebug = false;
  onRollLand: ((x: number, z: number) => void) | null = null;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.className = 'game-canvas';
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight('#FFF6EA', '#D9B79A', 1.35);
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight('#FFF0DA', 2.1);
    this.sun.position.set(-5, 12, 6);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -7.5;
    sc.right = 7.5;
    sc.top = 8;
    sc.bottom = -8;
    sc.near = 1;
    sc.far = 30;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    this.scene.add(this.sun, this.sun.target);

    this.buildRoom();
    this.buildStations();
    this.scene.add(
      this.candy.group,
      this.character.root,
      this.cart.root,
      this.machine.root,
      this.conveyor.root,
      this.kiosk.root,
      this.helper.root,
      this.helper.stationObject,
      this.collectibles.group,
      this.effects.group,
      this.products.group,
      this.ribbonPlayer.mesh,
      this.ribbonHelper.mesh,
      this.arrow,
      this.debugGroup,
    );
    this.collectibles.onLand = (x, z) => this.onRollLand?.(x, z);

    // Tutorial arrow + target ring.
    const arrowMat = new THREE.MeshStandardMaterial({ color: PALETTE.coral, emissive: '#FF6F6F', emissiveIntensity: 0.25, roughness: 0.4 });
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.32, 16), arrowMat);
    head.rotation.x = Math.PI;
    head.position.y = 0.16;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.32, 12), arrowMat);
    shaft.position.y = 0.46;
    this.arrow.add(head, shaft);
    this.arrowRing = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 40), new THREE.MeshBasicMaterial({ color: PALETTE.coral, transparent: true, opacity: 0.8, depthWrite: false }));
    this.arrowRing.rotation.x = -Math.PI / 2;
    this.scene.add(this.arrowRing);
    this.arrow.visible = false;
    this.arrowRing.visible = false;

    // Parking bay feedback: soft glow while driving, filling ring while stopping in it.
    const bay = WORLD.parkBay;
    this.parkGlow = new THREE.Mesh(new THREE.PlaneGeometry(bay.hw * 2 + 0.2, bay.hd * 2 + 0.2), new THREE.MeshBasicMaterial({ color: PALETTE.lemon, transparent: true, opacity: 0.25, depthWrite: false }));
    this.parkGlow.rotation.x = -Math.PI / 2;
    this.parkGlow.position.set(bay.x, 0.013, bay.z);
    this.parkGlow.visible = false;
    this.parkRing = new THREE.Mesh(new THREE.RingGeometry(1.12, 1.26, 48, 1, Math.PI / 2, Math.PI * 2), new THREE.MeshBasicMaterial({ color: PALETTE.teal, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
    this.parkRing.rotation.x = -Math.PI / 2;
    this.parkRing.position.set(bay.x, 0.03, bay.z);
    this.parkRing.visible = false;
    this.scene.add(this.parkGlow, this.parkRing);

    this.placeCamera();
    this.buildDebug();
  }

  private buildRoom(): void {
    const room = new THREE.Group();
    const b = WORLD.bounds;
    const w = b.maxX - b.minX;
    const d = b.maxZ - b.minZ;
    const tex = floorTexture();
    tex.repeat.set(w / 1.6, d / 1.6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.6, d + 0.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    floor.receiveShadow = true;
    room.add(floor);
    // Soft plinth under the whole workshop so it floats over the background.
    const plinth = mesh(roundedBox(w + 1.0, 0.5, d + 1.0, 0.2), toy('#E7C7A3', 0.8), false);
    plinth.position.set(floor.position.x, -0.26, floor.position.z);
    room.add(plinth);

    const wallMat = toy('#F6CDB6', 0.8);
    const trimMat = toy(PALETTE.teal, 0.6);
    // Back wall with windows and shelves (outside the play area).
    const back = mesh(roundedBox(w + 0.9, 1.5, 0.35, 0.1), wallMat);
    back.position.set(0, 0.75, b.minZ - 0.18);
    back.receiveShadow = true;
    const backTrim = mesh(roundedBox(w + 0.95, 0.12, 0.4, 0.05), trimMat, false);
    backTrim.position.set(0, 1.5, b.minZ - 0.18);
    room.add(back, backTrim);
    for (const x of [-5.2, -2.6, 2.6, 5.2]) {
      const win = mesh(roundedBox(1.5, 0.8, 0.06, 0.1), toy('#BDE8F2', 0.2), false);
      win.position.set(x, 0.85, b.minZ + 0.01);
      const bar = mesh(roundedBox(0.06, 0.8, 0.08, 0.02), toy(PALETTE.panel, 0.5), false);
      bar.position.set(x, 0.85, b.minZ + 0.03);
      room.add(win, bar);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.5), new THREE.MeshBasicMaterial({ map: signTexture('CANDY SPIRAL', PALETTE.plum, PALETTE.lemon, 512, 110), transparent: true }));
    sign.position.set(0, 1.0, b.minZ + 0.02);
    room.add(sign);
    // Side walls (low, so they never hide the play area).
    for (const x of [b.minX - 0.15, b.maxX + 0.15]) {
      const side = mesh(roundedBox(0.3, 0.5, d + 0.35, 0.1), wallMat);
      side.position.set(x, 0.25, (b.minZ + b.maxZ) / 2 - 0.1);
      side.receiveShadow = true;
      const cap = mesh(roundedBox(0.36, 0.08, d + 0.4, 0.04), trimMat, false);
      cap.position.set(x, 0.52, (b.minZ + b.maxZ) / 2 - 0.1);
      room.add(side, cap);
    }
    // Front lip.
    const lip = mesh(roundedBox(w + 0.6, 0.14, 0.2, 0.06), trimMat, false);
    lip.position.set(0, 0.07, b.maxZ + 0.2);
    room.add(lip);

    // Parking bay for the cart.
    const bay = WORLD.parkBay;
    const park = new THREE.Mesh(new THREE.PlaneGeometry(bay.hw * 2 + 0.2, bay.hd * 2 + 0.2), new THREE.MeshBasicMaterial({ map: parkingTexture(), transparent: true, depthWrite: false }));
    park.rotation.x = -Math.PI / 2;
    park.position.set(bay.x, 0.011, bay.z);
    room.add(park);

    // Corner decor (both have colliders in config).
    const shelf = WORLD.obstacles.find((o) => o.id === 'shelfL')!;
    const shelfBody = mesh(roundedBox(shelf.hw * 2, 0.7, shelf.hd * 2, 0.08), toy('#E0A98C', 0.7));
    shelfBody.position.set(shelf.x, 0.35, shelf.z);
    room.add(shelfBody);
    const jarColors = [PALETTE.strawberry, PALETTE.lemon, PALETTE.mint];
    for (let i = 0; i < 3; i++) {
      const jar = mesh(cylinder(0.18, 0.18, 0.3, 16), new THREE.MeshStandardMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.45, roughness: 0.15 }), false);
      jar.position.set(shelf.x, 0.86, shelf.z - 0.45 + i * 0.45);
      const fill = mesh(sphere(0.14, 12, 10), candy(jarColors[i]), false);
      fill.position.set(shelf.x, 0.82, shelf.z - 0.45 + i * 0.45);
      const lid = mesh(cylinder(0.19, 0.19, 0.05, 16), toy(PALETTE.teal, 0.5), false);
      lid.position.set(shelf.x, 1.03, shelf.z - 0.45 + i * 0.45);
      room.add(fill, jar, lid);
    }
    const plant = WORLD.obstacles.find((o) => o.id === 'plantR')!;
    const pot = mesh(cylinder(0.3, 0.24, 0.4, 16), toy(PALETTE.coral, 0.6));
    pot.position.set(plant.x, 0.2, plant.z);
    const stick = mesh(cylinder(0.035, 0.035, 0.7, 8), toy(PALETTE.panel, 0.5), false);
    stick.position.set(plant.x, 0.7, plant.z);
    const pop = mesh(cylinder(0.3, 0.3, 0.1, 24), new THREE.MeshStandardMaterial({ map: signTexture(' ', PALETTE.mint, PALETTE.mint, 64, 64), color: PALETTE.mint, roughness: 0.35 }));
    pop.rotation.x = Math.PI / 2 - 0.6;
    pop.position.set(plant.x, 1.1, plant.z);
    room.add(pot, stick, pop);
    mergeStaticChildren(room);
    this.scene.add(room);
  }

  private padBadges = new Map<string, THREE.Sprite>();
  private bladeOnPad!: THREE.Group;

  /** Walk-on stations: blade pad + rack, and one upgrade pad per group. */
  private buildStations(): void {
    const g = new THREE.Group();
    const bp = WORLD.bladePad;
    const padMat = toy('#FFE7A1', 0.7);
    const pad = new THREE.Mesh(cylinder(bp.r, bp.r + 0.04, 0.035, 40), padMat);
    pad.position.set(bp.x, 0.018, bp.z);
    pad.receiveShadow = true;
    g.add(pad);
    for (const r of [bp.r * 0.72, bp.r * 0.42]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 6, 40), toy('#F7D57A', 0.6));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(bp.x, 0.04, bp.z);
      g.add(ring);
    }
    // A spare blade lying on the pad.
    this.bladeOnPad = new THREE.Group();
    const blade = mesh(roundedBox(0.42, 0.05, 0.16, 0.02), toy(PALETTE.coral, 0.35));
    const edge = mesh(roundedBox(0.42, 0.03, 0.04, 0.01), toy('#FFE9EC', 0.3), false);
    edge.position.z = 0.08;
    const handle = mesh(roundedBox(0.08, 0.05, 0.26, 0.02), toy(PALETTE.plum, 0.5));
    handle.position.z = -0.18;
    this.bladeOnPad.add(blade, edge, handle);
    this.bladeOnPad.position.set(bp.x, 0.08, bp.z);
    this.bladeOnPad.rotation.y = 0.5;
    g.add(this.bladeOnPad);
    // Blade rack next to the pad (has a collider in config).
    const rk = WORLD.bladeRack;
    const cab = mesh(roundedBox(0.54, 0.62, 0.46, 0.08), toy(PALETTE.teal, 0.5));
    cab.position.set(rk.x, 0.31, rk.z);
    const top = mesh(roundedBox(0.6, 0.08, 0.52, 0.04), toy(PALETTE.coral, 0.45), false);
    top.position.set(rk.x, 0.64, rk.z);
    g.add(cab, top);
    for (let i = 0; i < 3; i++) {
      const b = mesh(roundedBox(0.1, 0.34, 0.04, 0.015), toy(i === 1 ? PALETTE.coral : '#FFB3A8', 0.35), false);
      b.position.set(rk.x - 0.14 + i * 0.14, 0.86, rk.z);
      g.add(b);
    }
    // Upgrade pads.
    const labels: Record<string, string> = { blade: 'BLADE', cart: 'CART', machine: 'MACHINE' };
    for (const up of WORLD.upgradePads) {
      const disc = new THREE.Mesh(cylinder(up.r, up.r + 0.05, 0.04, 36), toy('#5A4866', 0.6));
      disc.position.set(up.x, 0.02, up.z);
      disc.receiveShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(up.r + 0.02, 0.035, 6, 36), toy(PALETTE.teal, 0.45));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(up.x, 0.045, up.z);
      const icon = new THREE.Mesh(new THREE.PlaneGeometry(up.r * 1.6, up.r * 1.6), new THREE.MeshBasicMaterial({ map: padIconTexture(up.id), transparent: true, depthWrite: false }));
      icon.rotation.x = -Math.PI / 2;
      icon.position.set(up.x, 0.05, up.z);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.2), new THREE.MeshBasicMaterial({ map: signTexture(labels[up.id], PALETTE.plum, '#FFFFFF', 160, 48), transparent: true, depthWrite: false }));
      label.rotation.x = -Math.PI / 2;
      label.position.set(up.x, 0.02, up.z + up.r + 0.2);
      const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTexture(), depthTest: false }));
      badge.scale.set(0.34, 0.34, 1);
      badge.position.set(up.x + 0.25, 0.75, up.z - 0.1);
      badge.renderOrder = 5;
      badge.visible = false;
      this.padBadges.set(up.id, badge);
      g.add(disc, ring, icon, label, badge);
    }
    this.scene.add(g);
  }

  private buildDebug(): void {
    const mat = new THREE.LineBasicMaterial({ color: '#FF2D55' });
    for (const o of WORLD.obstacles) {
      const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(o.hw * 2, 0.02, o.hd * 2));
      const l = new THREE.LineSegments(g, mat);
      l.position.set(o.x, 0.05, o.z);
      this.debugGroup.add(l);
    }
    const uz = WORLD.unloadZone;
    const uzl = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(uz.hw * 2, 0.02, uz.hd * 2)), new THREE.LineBasicMaterial({ color: '#00C2FF' }));
    uzl.position.set(uz.x, 0.06, uz.z);
    this.debugGroup.add(uzl);
    this.debugGroup.visible = false;
  }

  private debugDynamic: THREE.Object3D[] = [];
  private updateDebug(state: GameState): void {
    this.debugGroup.visible = this.showDebug;
    for (const o of this.debugDynamic) {
      this.debugGroup.remove(o);
      (o as THREE.Line).geometry.dispose();
    }
    this.debugDynamic = [];
    if (!this.showDebug) return;
    const circle = (x: number, z: number, r: number, color: string) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 48; i++) pts.push(new THREE.Vector3(x + Math.cos((i / 48) * Math.PI * 2) * r, 0.08, z + Math.sin((i / 48) * Math.PI * 2) * r));
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }));
      this.debugGroup.add(l);
      this.debugDynamic.push(l);
    };
    const ip = intakePosition(state);
    circle(ip.x, ip.z, pickupRadius(state), '#00FF88');
    circle(state.cart.x, state.cart.z, MOVE.cartRadius, '#FFAA00');
    circle(state.player.x, state.player.z, MOVE.playerRadius, '#FFAA00');
    // Active-layer surface per sector.
    const c = state.contract;
    if (c.activeLayer < NUM_LAYERS) {
      const pts: THREE.Vector3[] = [];
      const n = WORLD.source.sectors;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = maxSurfaceRadiusInSpan(c, a, 0.001);
        pts.push(new THREE.Vector3(WORLD.source.x + Math.cos(a) * r, 0.75, WORLD.source.z + Math.sin(a) * r));
      }
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#FF2D55' }));
      this.debugGroup.add(l);
      this.debugDynamic.push(l);
    }
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'normal' ? 1.5 : 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = q !== 'low';
    this.sun.castShadow = q !== 'low';
    const size = q === 'high' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.effects.scale = (q === 'low' ? 0.5 : 1) * (this.reducedMotion ? 0.45 : 1);
    this.resize(this.viewW, this.viewH, this.lastInsets);
  }

  private lastInsets: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

  /**
   * Perspective follow camera (like the reference): a fixed pitch, never orbits,
   * sized so ~CAMERA.viewWidth world units span a portrait screen at the player.
   * The followed point is centred in the HUD-free area via a view offset.
   */
  resize(w: number, h: number, insets: Insets): void {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
    this.lastInsets = insets;
    this.renderer.setSize(this.viewW, this.viewH, false);
    const aspect = this.viewW / this.viewH;
    this.camera.aspect = aspect;
    const byWidth = CAMERA.viewWidth / (2 * TAN_HALF_FOV * aspect);
    const byHeight = CAMERA.minViewHeight / (2 * TAN_HALF_FOV);
    this.camDist = Math.max(byWidth, byHeight);
    const availTop = insets.top;
    const availH = Math.max(50, this.viewH - insets.top - insets.bottom);
    const cy = availTop + availH / 2;
    this.camera.setViewOffset(this.viewW, this.viewH, 0, this.viewH / 2 - cy, this.viewW, this.viewH);
    this.camera.updateProjectionMatrix();
    this.placeCamera();
  }

  /** Ground-plane half extents visible around the camera target (approximate). */
  private visibleHalf(): { x: number; z: number } {
    const halfH = this.camDist * TAN_HALF_FOV;
    return { x: halfH * this.camera.aspect, z: halfH / Math.sin(PITCH) };
  }

  private placeCamera(): void {
    const t = this.camTarget;
    this.camera.position.set(t.x, t.y + Math.sin(PITCH) * this.camDist, t.z + Math.cos(PITCH) * this.camDist);
    this.camera.lookAt(t);
    this.camera.updateMatrixWorld();
    // Keep crisp shadows around what we are looking at.
    this.sun.position.set(t.x - 5, 12, t.z + 6);
    this.sun.target.position.copy(t);
  }

  /** Smoothly follow a focus point (player or cart), with a little look-ahead, clamped to the workshop. */
  follow(fx: number, fz: number, vx: number, vz: number, dt: number): void {
    const b = WORLD.bounds;
    const half = this.visibleHalf();
    const la = CAMERA.lookAhead;
    let tx = fx + THREE.MathUtils.clamp(vx * la, -1.2, 1.2);
    let tz = fz + THREE.MathUtils.clamp(vz * la, -1.2, 1.2);
    const minX = b.minX + half.x - 0.9;
    const maxX = b.maxX - half.x + 0.9;
    tx = minX > maxX ? (b.minX + b.maxX) / 2 : THREE.MathUtils.clamp(tx, minX, maxX);
    const minZ = b.minZ + half.z * 0.55;
    const maxZ = b.maxZ - half.z * 0.62;
    tz = minZ > maxZ ? (b.minZ + b.maxZ) / 2 : THREE.MathUtils.clamp(tz, minZ, maxZ);
    if (!this.camReady || dt <= 0) {
      if (!this.camReady) {
        this.camTarget.set(tx, 0, tz);
        this.camReady = true;
      }
    } else {
      const k = 1 - Math.exp(-dt / CAMERA.followTau);
      this.camTarget.x += (tx - this.camTarget.x) * k;
      this.camTarget.z += (tz - this.camTarget.z) * k;
    }
    this.placeCamera();
  }

  worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    this.tmpV.set(x, y, z).project(this.camera);
    return { x: (this.tmpV.x * 0.5 + 0.5) * this.viewW, y: (-this.tmpV.y * 0.5 + 0.5) * this.viewH };
  }

  handleEvents(events: GameEvent[], state: GameState): void {
    for (const e of events) {
      switch (e.type) {
        case 'rollSpawned': {
          const rib = e.peeler === 'player' ? this.ribbonPlayer : this.ribbonHelper;
          const from = rib.mesh.visible ? rib.curlCenter : this.tmpV.set(e.fromX, 0.45, e.fromZ);
          this.collectibles.spawnFrom(e.id, from.x, from.y, from.z);
          rib.snap();
          this.effects.burst(from.x, from.y, from.z, 4, { colors: [CONTRACTS[e.defId].layerColors[e.layer], '#FFFFFF'], speed: 0.8, up: 1.6, size: 0.8, life: 0.5 });
          break;
        }
        case 'rawCarved': {
          // Small candy shards while cutting (≈3–8/s), tied to real output.
          this.shardTimer += e.mass * 3.2;
          if (this.shardTimer >= 1) {
            this.shardTimer = 0;
            const col = CONTRACTS[e.defId].layerColors[e.layer];
            this.effects.burst(e.x, 0.4, e.z, 1, { colors: [col], speed: 0.9, up: 1.8, size: 0.7, life: 0.45 });
          }
          break;
        }
        case 'rawCollected': {
          const col = CONTRACTS[e.defId].layerColors[e.layer];
          const target = () => this.cart.binWorldPosition(new THREE.Vector3());
          this.collectibles.fly(new THREE.Vector3(e.x, 0.15, e.z), target, col, Math.cbrt(Math.max(0.1, e.mass)) * 0.95, 0.24, 0.55, () => this.cart.kick(0.35));
          break;
        }
        case 'capacityReached':
          this.cart.onFull();
          this.character.pickupWobble();
          break;
        case 'rawUnloaded': {
          if (this.unloadVisTimer > 0) break;
          this.unloadVisTimer = 1 / 6;
          const col = CONTRACTS[e.defId].layerColors[e.layer];
          const from = this.cart.binWorldPosition(new THREE.Vector3());
          const to = this.machine.funnelTop.clone();
          this.collectibles.fly(from, () => to, col, 0.85, 0.3, 0.9);
          break;
        }
        case 'productProduced':
          this.machine.onProduct();
          break;
        case 'productSold': {
          this.kiosk.onSale(e.defId, e.count > 1 || e.value >= 12);
          const sp = this.kiosk.salePoint;
          this.effects.sparkle(sp.x, sp.y + 0.2, sp.z, e.count > 1 ? 5 : 2);
          break;
        }
        case 'layerCleared': {
          const r = layerRadii()[e.layer];
          this.effects.pulse(WORLD.source.x, LAYER_HEIGHTS[Math.min(4, e.nextLayer)] + 0.03, WORLD.source.z, r.inner * 0.98, r.outer + 0.35, '#FFFFFF', 0.5);
          const a = Math.random() * Math.PI * 2;
          for (let i = 0; i < 3; i++) {
            const aa = a + (i * Math.PI * 2) / 3;
            this.effects.burst(WORLD.source.x + Math.cos(aa) * r.inner, 0.7, WORLD.source.z + Math.sin(aa) * r.inner, 4, { speed: 1.4, up: 2.6 });
          }
          break;
        }
        case 'contractCompleted':
          this.effects.burst(WORLD.source.x, 1.4, WORLD.source.z, 60, { speed: 2.6, up: 4.2, life: 1.2 });
          this.effects.pulse(WORLD.source.x, 0.1, WORLD.source.z, 0.5, 4.2, PALETTE.lemon, 0.8);
          this.character.hop();
          break;
        case 'upgradePurchased':
          if (e.id === 'scraper') this.character.upgradePop();
          else if (e.id === 'machine') this.machine.upgradePop();
          else if (e.id === 'helper') {
            const hp = helperPosition(state);
            this.effects.burst(hp.x, 0.5, hp.z, 16, { speed: 1.4, up: 2.8 });
          } else this.cart.upgradePop();
          break;
        case 'bladeBroken': {
          const p = state.player;
          this.effects.burst(p.x, 0.5, p.z, 14, { colors: [PALETTE.coral, '#FFFFFF', '#FFE9EC'], speed: 1.8, up: 2.6, size: 1.1, life: 0.6 });
          this.effects.pulse(p.x, 0.05, p.z, 0.2, 0.9, PALETTE.coral, 0.35);
          break;
        }
        case 'bladeTaken': {
          const bp = WORLD.bladePad;
          this.effects.sparkle(bp.x, 0.4, bp.z, 4);
          this.character.upgradePop();
          break;
        }
        case 'doubleCarve':
          this.effects.sparkle(e.x, 0.8, e.z, 6);
          this.effects.burst(e.x, 0.6, e.z, 8, { colors: ['#9BF6FF', '#FFFFFF', PALETTE.lemon], speed: 1.2, up: 2.4, size: 0.9, life: 0.6 });
          break;
        case 'relocated': {
          const p = e.who === 'cart' ? state.cart : state.player;
          this.effects.burst(p.x, 0.3, p.z, 10, { colors: ['#FFFFFF', PALETTE.cream], speed: 1, up: 1.5 });
          break;
        }
        default:
          break;
      }
    }
  }

  update(
    state: GameState,
    it: Interp,
    dt: number,
    extra: {
      playerCutting: boolean;
      helperCutting: boolean;
      arrowTarget: { x: number; z: number; y?: number } | null;
      highlightCart: boolean;
      boardProgress: number;
      parkHighlight: boolean;
      parkProgress: number;
      padBadges: Record<string, boolean>;
    },
  ): void {
    this.time += dt;
    const rm = this.reducedMotion;
    this.unloadVisTimer = Math.max(0, this.unloadVisTimer - dt);
    const c = state.contract;
    this.candy.update(c, it.rotation, dt, rm);

    // Player + ribbon.
    const p = state.player;
    const speed = Math.hypot(p.vx, p.vz);
    this.character.update(
      {
        x: it.px,
        z: it.pz,
        facing: p.facing,
        mode: p.mode,
        modeTime: p.modeTime,
        speed,
        carving: p.mode === 'carving',
        cutting: extra.playerCutting,
        scraperLevel: state.upgrades.scraper,
        seatY: this.cart.seatY,
        hasBlade: p.blades > 0 && p.bladeSwap <= 0,
      },
      dt,
      this.time,
      rm,
    );
    const pAng = Math.atan2(it.pz - WORLD.source.z, it.px - WORLD.source.x);
    const layer = Math.min(NUM_LAYERS - 1, c.activeLayer);
    const pb = state.peelers.player.buffer;
    const pColor = CONTRACTS[c.defId].layerColors[pb ? pb.layer : layer];
    this.ribbonPlayer.width = 0.28 + state.upgrades.scraper * 0.015;
    this.ribbonPlayer.update(
      {
        active: p.mode === 'carving' && p.carveContact && c.activeLayer < NUM_LAYERS,
        cx: WORLD.source.x,
        cz: WORLD.source.z,
        angle: pAng,
        radius: maxSurfaceRadiusInSpan(c, pAng, 0.05),
        height: this.candy.surfaceHeight(layer),
        color: pColor,
        fill: pb ? pb.mass : 0,
        streak: state.peelers.player.streak,
      },
      dt,
    );

    // Helper robot + its ribbon.
    const helperOn = state.upgrades.helper > 0;
    const hp = helperPosition(state);
    this.helper.update(helperOn, hp.x, hp.z, extra.helperCutting, dt, this.time, rm);
    const hAng = (WORLD.helperAngleDeg * Math.PI) / 180;
    const hb = state.peelers.helper.buffer;
    this.ribbonHelper.width = 0.2;
    this.ribbonHelper.update(
      {
        active: helperOn && extra.helperCutting,
        cx: WORLD.source.x,
        cz: WORLD.source.z,
        angle: hAng,
        radius: hp.surface,
        height: this.candy.surfaceHeight(layer),
        color: CONTRACTS[c.defId].layerColors[hb ? hb.layer : layer],
        fill: hb ? hb.mass : 0,
        streak: state.peelers.helper.streak,
      },
      dt,
    );

    // Cart.
    const cart = state.cart;
    this.cart.update(
      {
        x: it.cx,
        z: it.cz,
        heading: it.heading,
        speed: Math.hypot(cart.vx, cart.vz),
        odometer: cart.odometer,
        cargo: cart.cargo,
        capacity: cartCapacity(state),
        capacityLevel: state.upgrades.capacity,
        speedLevel: state.upgrades.cartSpeed,
        intakeLevel: state.upgrades.intake,
        collecting: cart.activity === 'collecting' || (cargoMass(state) < cartCapacity(state) && this.rollNearIntake(state)),
        unloading: cart.activity === 'unloading',
        autopilot: cart.control === 'autopilot',
        autopilotWaiting: cart.auto.phase === 'standby' || cart.auto.phase === 'idle',
        highlight: extra.highlightCart,
        boardProgress: extra.boardProgress,
      },
      dt,
      this.time,
      rm,
    );

    // Machine, conveyor, kiosk, products.
    this.machine.update(state.machine, state.upgrades.machine, dt, this.time, cart.activity === 'unloading', rm);
    this.conveyor.update(dt, state.conveyor.length > 0 || state.machine.status === 'processing', 1 / MACHINE.conveyorTravel);
    this.products.begin();
    for (const prod of state.conveyor) {
      const pt = this.conveyor.pointAt(prod.t, this.tmpV);
      const rot = -this.conveyor.headingAt(prod.t) + Math.PI / 2;
      const sc = prod.count > 1 ? 1.15 : 1;
      this.products.add(prod.defId, pt.x, pt.y, pt.z, rot, sc);
      if (prod.count > 1) this.products.add(prod.defId, pt.x + 0.05, pt.y + 0.08, pt.z - 0.05, rot + 0.5, 0.95);
    }
    if (state.machine.cycle && state.machine.cycle.progress > 0.25) {
      const o = this.machine.outlet;
      const f = (state.machine.cycle.progress - 0.25) / 0.75;
      this.products.add(state.machine.cycle.defId, o.x, o.y - 0.04, o.z - 0.1 + f * 0.1, Math.PI / 2, 0.9, f);
    }
    this.kiosk.update(dt, this.time, this.products, rm);
    this.products.end();

    this.collectibles.update(state.collectibles, dt, rm);
    this.effects.setCamera(this.camera);
    this.effects.update(dt);

    // Station badges ("!" when that group has an affordable upgrade) and the pad blade bobbing.
    for (const [id, sprite] of this.padBadges) {
      sprite.visible = !!extra.padBadges[id];
      if (sprite.visible) sprite.position.y = 0.75 + (rm ? 0 : Math.abs(Math.sin(this.time * 3)) * 0.12);
    }
    this.bladeOnPad.position.y = 0.08 + (rm ? 0 : Math.sin(this.time * 2.5) * 0.02);

    // Parking bay: glow while driving, ring fills while the cart stops inside.
    this.parkGlow.visible = extra.parkHighlight;
    if (extra.parkHighlight) (this.parkGlow.material as THREE.MeshBasicMaterial).opacity = 0.18 + (rm ? 0 : 0.12 * (0.5 + 0.5 * Math.sin(this.time * 4)));
    const pp = Math.min(1, extra.parkProgress);
    this.parkRing.visible = extra.parkHighlight && pp > 0.01;
    if (this.parkRing.visible) (this.parkRing.geometry as THREE.BufferGeometry).setDrawRange(0, Math.ceil(pp * 48) * 6);

    // Tutorial arrow.
    const at = extra.arrowTarget;
    this.arrow.visible = !!at;
    this.arrowRing.visible = !!at;
    if (at) {
      const bob = rm ? 0 : Math.abs(Math.sin(this.time * 4)) * 0.18;
      const base = at.y ?? 0;
      this.arrow.position.set(at.x, base + 1.25 + bob, at.z);
      this.arrowRing.position.set(at.x, base + 0.03, at.z);
      const s = 1 + (rm ? 0 : Math.sin(this.time * 5) * 0.08);
      this.arrowRing.scale.set(s, s, 1);
    }

    // Follow the chef (or the cart while driving).
    const driving = p.mode === 'driving' || p.mode === 'boarding';
    this.follow(driving ? it.cx : it.px, driving ? it.cz : it.pz, driving ? cart.vx : p.vx, driving ? cart.vz : p.vz, dt);
    this.updateDebug(state);
  }

  private rollNearIntake(state: GameState): boolean {
    const ip = intakePosition(state);
    const r = pickupRadius(state) + 0.2;
    for (const roll of state.collectibles) if ((roll.x - ip.x) ** 2 + (roll.z - ip.z) ** 2 < r * r) return true;
    return false;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  get triangles(): number {
    return this.renderer.info.render.triangles;
  }

  get currentQuality(): Quality {
    return this.quality;
  }
}
