import * as THREE from 'three';
import { mergeStaticChildren } from '../visuals/merge';
import { PALETTE } from '../game/config';
import type { PlayerMode } from '../game/types';
import { angleDiff } from '../game/context';
import { capsule, cylinder, mesh, roundedBox, sphere, toy, torus } from '../visuals/materials';

export interface CharacterPose {
  x: number;
  z: number;
  facing: number;
  mode: PlayerMode;
  modeTime: number;
  speed: number;
  carving: boolean;
  cutting: boolean; // mass actually taken this frame
  scraperLevel: number;
  seatY: number;
  hasBlade: boolean;
}

/** Chunky little chef built from primitives; all motion is procedural. */
export class Character {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private hat = new THREE.Group();
  private footL: THREE.Mesh;
  private footR: THREE.Mesh;
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private tool = new THREE.Group();
  private blade: THREE.Mesh;
  private walkPhase = 0;
  private lean = 0;
  private headYaw = 0;
  private lastFacing = 0;
  private hopT = 1;
  private hatWobble = 0;
  private toolScale = 1;
  private toolPop = 0;
  expression = 0; // seconds left of a happy squint

  constructor() {
    this.root.add(this.body);
    this.body.add(this.torso);
    this.body.scale.setScalar(1.2);
    const white = toy(PALETTE.panel, 0.6);
    const skin = toy(PALETTE.skin, 0.6);
    const plum = toy(PALETTE.plum, 0.5);
    const teal = toy(PALETTE.teal, 0.5);

    // Shoes (big and round).
    this.footL = mesh(roundedBox(0.15, 0.1, 0.22, 0.045), toy('#6B4F7A', 0.55));
    this.footR = this.footL.clone();
    this.footL.position.set(-0.1, 0.05, 0.02);
    this.footR.position.set(0.1, 0.05, 0.02);
    this.body.add(this.footL, this.footR);

    // Torso: chef jacket + teal apron.
    const jacket = mesh(capsule(0.19, 0.14), white);
    jacket.position.y = 0.36;
    this.torso.add(jacket);
    const apron = mesh(roundedBox(0.28, 0.25, 0.07, 0.03), teal);
    apron.position.set(0, 0.3, 0.165);
    this.torso.add(apron);
    const pocket = mesh(roundedBox(0.12, 0.06, 0.02, 0.01), toy(PALETTE.cream, 0.6), false);
    pocket.position.set(0, 0.26, 0.205);
    this.torso.add(pocket);
    const tie = mesh(sphere(0.045, 10, 8), toy(PALETTE.strawberry, 0.5), false);
    tie.position.set(0, 0.49, 0.16);
    this.torso.add(tie);

    // Arms with little hands.
    for (const [arm, side] of [
      [this.armL, -1],
      [this.armR, 1],
    ] as const) {
      arm.position.set(side * 0.2, 0.46, 0);
      const sleeve = mesh(capsule(0.055, 0.1), white);
      sleeve.position.y = -0.08;
      const hand = mesh(sphere(0.055, 10, 8), skin);
      hand.position.y = -0.17;
      arm.add(sleeve, hand);
      mergeStaticChildren(arm);
      this.torso.add(arm);
    }

    // Scraper tool held in the right hand: wide spatula blade.
    const handle = mesh(cylinder(0.025, 0.025, 0.22, 8), toy(PALETTE.cream, 0.5));
    handle.rotation.x = Math.PI / 2;
    handle.position.z = 0.1;
    this.blade = mesh(roundedBox(0.3, 0.035, 0.13, 0.015), toy(PALETTE.coral, 0.35));
    this.blade.position.z = 0.26;
    const bladeEdge = mesh(roundedBox(0.3, 0.02, 0.03, 0.008), toy('#FFE9EC', 0.3), false);
    bladeEdge.position.z = 0.33;
    this.tool.add(handle, this.blade, bladeEdge);
    this.tool.position.set(0, -0.17, 0.02);
    this.armR.add(this.tool);

    // Big head.
    this.head.position.y = 0.66;
    const skull = mesh(sphere(0.235, 22, 16), skin);
    this.head.add(skull);
    const eyeGeo = sphere(0.03, 10, 8);
    const eyeL = mesh(eyeGeo, plum, false);
    eyeL.position.set(-0.08, 0.03, 0.21);
    eyeL.scale.set(1, 1.35, 1);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.075;
    const smile = mesh(torus(0.055, 0.012, Math.PI), plum, false);
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.05, 0.215);
    const blushGeo = sphere(0.035, 10, 8);
    const blushL = mesh(blushGeo, toy('#FF9AAE', 0.7), false);
    blushL.position.set(-0.14, -0.035, 0.175);
    blushL.scale.set(1, 0.6, 0.4);
    const blushR = blushL.clone();
    blushR.position.x = 0.14;
    this.head.add(eyeL, eyeR, smile, blushL, blushR);

    // Short puffy chef hat.
    const band = mesh(cylinder(0.17, 0.18, 0.08, 20), white);
    band.position.y = 0;
    const puffGeo = sphere(0.12, 14, 10);
    const p1 = mesh(puffGeo, white);
    p1.position.set(0, 0.1, 0);
    p1.scale.set(1.35, 0.9, 1.35);
    const p2 = mesh(puffGeo, white);
    p2.position.set(-0.07, 0.13, 0.03);
    p2.scale.setScalar(0.85);
    const p3 = mesh(puffGeo, white);
    p3.position.set(0.07, 0.14, -0.02);
    p3.scale.setScalar(0.8);
    this.hat.add(band, p1, p2, p3);
    this.hat.position.y = 0.2;
    this.head.add(this.hat);
    this.torso.add(this.head);
    mergeStaticChildren(this.head);
    mergeStaticChildren(this.hat);
    mergeStaticChildren(this.torso);

    // Soft blob shadow.
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), new THREE.MeshBasicMaterial({ color: PALETTE.plum, transparent: true, opacity: 0.18, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    shadow.renderOrder = 1;
    this.root.add(shadow);
  }

  pickupWobble(): void {
    this.hatWobble = 1;
  }

  upgradePop(): void {
    this.toolPop = 1;
  }

  hop(): void {
    this.hopT = 0;
  }

  update(p: CharacterPose, dt: number, time: number, reducedMotion: boolean): void {
    const motion = reducedMotion ? 0.35 : 1;
    this.root.position.set(p.x, 0, p.z);
    const targetYaw = Math.PI / 2 - p.facing;
    this.root.rotation.y = targetYaw;

    // Head lags slightly behind turns.
    const turn = angleDiff(this.lastFacing, p.facing);
    this.lastFacing = p.facing;
    this.headYaw += (Math.max(-0.5, Math.min(0.5, turn * 6)) - this.headYaw) * Math.min(1, dt * 10);
    this.head.rotation.y = this.headYaw * 0.6 * motion;

    const driving = p.mode === 'driving' || p.mode === 'boarding' || p.mode === 'disembarking';
    const walking = !driving && p.speed > 0.15;
    if (walking) this.walkPhase += dt * (6 + p.speed * 3.2);
    const s = Math.sin(this.walkPhase);
    const bob = walking ? Math.abs(s) * 0.035 * motion : 0;
    const breathe = Math.sin(time * 2.2) * 0.006 * motion;

    // Lean into the candy while carving; tool extends forward.
    const targetLean = p.carving ? 0.32 : walking ? 0.08 : 0;
    this.lean += (targetLean - this.lean) * Math.min(1, dt / 0.1);
    this.torso.rotation.x = this.lean * (reducedMotion ? 0.6 : 1);

    // Board/disembark hop.
    let hopY = 0;
    if (p.mode === 'boarding' || p.mode === 'disembarking') {
      const t = Math.min(1, p.modeTime / 0.2);
      hopY = Math.sin(t * Math.PI) * 0.25 * motion;
    }
    this.hopT = Math.min(1, this.hopT + dt * 3);

    if (driving && p.mode === 'driving') {
      // Seated: lower into the seat, feet tucked, both hands on the wheel.
      this.body.position.y = p.seatY - 0.18 + breathe;
      this.footL.visible = false;
      this.footR.visible = false;
      this.armL.rotation.set(-1.15, 0, 0.12);
      this.armR.rotation.set(-1.15, 0, -0.12);
      this.tool.visible = false;
    } else {
      this.body.position.y = bob + breathe + hopY + (p.mode === 'boarding' || p.mode === 'disembarking' ? p.seatY * Math.min(1, p.modeTime / 0.2) * (p.mode === 'boarding' ? 1 : 0) : 0);
      this.footL.visible = true;
      this.footR.visible = true;
      this.tool.visible = p.hasBlade;
      const stride = walking ? s * 0.07 * motion : 0;
      this.footL.position.z = 0.02 + stride;
      this.footR.position.z = 0.02 - stride;
      this.footL.position.y = 0.05 + (walking ? Math.max(0, s) * 0.035 * motion : 0);
      this.footR.position.y = 0.05 + (walking ? Math.max(0, -s) * 0.035 * motion : 0);
      if (p.carving) {
        const vib = p.cutting && !reducedMotion ? (Math.random() - 0.5) * 0.02 : 0;
        this.armR.rotation.set(-1.25 + vib * 4, 0, -0.35);
        this.armL.rotation.set(-1.1, 0, 0.35);
        this.tool.position.x = vib;
      } else {
        this.armL.rotation.set(walking ? -s * 0.5 * motion : 0.05, 0, 0.12);
        this.armR.rotation.set(walking ? s * 0.5 * motion : -0.35, 0, -0.12);
        this.tool.position.x = 0;
      }
    }

    // Wider blade on scraper level 2 and 4 (player-facing numbers).
    const widen = 1 + (p.scraperLevel >= 1 ? 0.14 : 0) + (p.scraperLevel >= 3 ? 0.14 : 0);
    this.toolScale += (widen - this.toolScale) * Math.min(1, dt * 8);
    let pop = 1;
    if (this.toolPop > 0) {
      this.toolPop = Math.max(0, this.toolPop - dt * 2.5);
      pop = 1 + Math.sin((1 - this.toolPop) * Math.PI) * 0.35 * motion;
    }
    this.tool.scale.set(this.toolScale * pop, pop, pop);

    // Hat follows the bob and wobbles on big pickups.
    if (this.hatWobble > 0) this.hatWobble = Math.max(0, this.hatWobble - dt * 2.2);
    this.hat.rotation.z = Math.sin(time * 18) * 0.18 * this.hatWobble * motion + (walking ? s * 0.04 * motion : 0);
    this.hat.position.y = 0.2 + bob * 0.3;
    if (this.expression > 0) this.expression -= dt;
  }
}
