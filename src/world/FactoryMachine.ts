import * as THREE from 'three';
import { mergeStaticChildren } from '../visuals/merge';
import { CONTRACTS, MACHINE, PALETTE, WORLD } from '../game/config';
import type { MachineState } from '../game/types';
import { candyStripeTexture, signTexture, unloadPadTexture } from '../visuals/textures';
import { candy, cylinder, mesh, roundedBox, sphere, toy } from '../visuals/materials';

/** Rounded lollipop machine: wide funnel, visible rollers, progress lollipop and a wrapper hatch. */
export class FactoryMachine {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private rollers: THREE.Mesh[] = [];
  private rollerSpin = 0;
  private rollerSpeed = 0;
  private fill: THREE.Mesh;
  private fillMat: THREE.MeshStandardMaterial;
  private pie: THREE.Mesh;
  private pieMat: THREE.MeshStandardMaterial;
  private flapL: THREE.Mesh;
  private flapR: THREE.Mesh;
  private flapT = 1;
  private squash = 0;
  private hat: THREE.Group;
  private bulbs: THREE.Mesh[] = [];
  private level = -1;
  private upgradePopT = 0;
  private pad: THREE.Mesh;
  private padMat: THREE.MeshStandardMaterial;
  private chugT = 0;
  readonly outlet = new THREE.Vector3();
  readonly funnelTop = new THREE.Vector3();

  constructor() {
    const { x, z } = WORLD.machine;
    this.root.position.set(x, 0, z);
    this.root.add(this.body);
    const teal = toy(PALETTE.teal, 0.45);
    const tealDark = toy(PALETTE.tealDark, 0.5);
    const cream = toy(PALETTE.cream, 0.5);
    const coral = toy(PALETTE.coral, 0.45);

    const base = mesh(roundedBox(2.0, 0.16, 1.6, 0.07), tealDark);
    base.position.y = 0.08;
    const shell = mesh(roundedBox(1.9, 0.78, 1.5, 0.3), teal);
    shell.position.y = 0.52;
    const top = mesh(roundedBox(1.7, 0.08, 1.3, 0.04), cream, false);
    top.position.y = 0.92;
    const belly = mesh(roundedBox(1.92, 0.12, 1.52, 0.06), coral, false);
    belly.position.y = 0.24;
    this.body.add(base, shell, top, belly);

    // Porthole "eyes" on the front face with candy glimpsed inside.
    for (const px of [-0.55, 0.55]) {
      const ring = mesh(new THREE.TorusGeometry(0.16, 0.04, 8, 20), cream, false);
      ring.position.set(px, 0.56, 0.76);
      const glass = mesh(new THREE.CircleGeometry(0.15, 20), new THREE.MeshStandardMaterial({ color: '#FFDDE6', roughness: 0.2, emissive: '#FF9AB2', emissiveIntensity: 0.12 }), false);
      glass.position.set(px, 0.56, 0.755);
      this.body.add(ring, glass);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.18), new THREE.MeshBasicMaterial({ map: signTexture('LOLLIPOP', PALETTE.cream, PALETTE.plum, 256, 64), transparent: true }));
    sign.position.set(0, 0.78, 0.765);
    this.body.add(sign);

    // Funnel/hopper on the side facing the unload pad.
    const hx = WORLD.hopper.x - x;
    const hz = WORLD.hopper.z - z;
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      prof.push(new THREE.Vector2(0.18 + t * t * 0.34 + t * 0.05, t * 0.5));
    }
    const funnelGeo = new THREE.LatheGeometry(prof, 28);
    const funnelMat = new THREE.MeshStandardMaterial({ map: candyStripeTexture(PALETTE.strawberry, PALETTE.cream, 8, 'funnel'), roughness: 0.4, side: THREE.DoubleSide });
    const funnel = mesh(funnelGeo, funnelMat);
    funnel.position.set(hx, 0.9, hz);
    const lipRing = mesh(new THREE.TorusGeometry(0.57, 0.05, 8, 28), coral, false);
    lipRing.rotation.x = Math.PI / 2;
    lipRing.position.set(hx, 1.4, hz);
    this.fillMat = new THREE.MeshStandardMaterial({ color: PALETTE.strawberry, roughness: 0.35 });
    this.fill = mesh(new THREE.CircleGeometry(1, 28), this.fillMat, false);
    this.fill.rotation.x = -Math.PI / 2;
    this.fill.position.set(hx, 0.95, hz);
    this.body.add(funnel, lipRing, this.fill);
    this.funnelTop.set(x + hx, 1.45, z + hz);

    // Two big striped rollers in an open window on top.
    const win = mesh(roundedBox(0.9, 0.06, 0.62, 0.03), toy(PALETTE.plum, 0.6), false);
    win.position.set(0.45, 0.95, 0.25);
    this.body.add(win);
    const rollerMat = new THREE.MeshStandardMaterial({ map: candyStripeTexture(PALETTE.lemon, PALETTE.cream, 6, 'roller'), roughness: 0.4 });
    for (const rz of [0.12, 0.38]) {
      const r = mesh(cylinder(0.12, 0.12, 0.78, 18), rollerMat);
      r.rotation.z = Math.PI / 2;
      r.position.set(0.45, 1.0, rz);
      this.rollers.push(r);
      this.body.add(r);
    }

    // Progress lollipop on a stick.
    const stick = mesh(cylinder(0.03, 0.03, 0.55, 8), cream);
    stick.position.set(0.72, 1.2, -0.45);
    const disc = mesh(cylinder(0.3, 0.3, 0.06, 28), toy('#FFE3EA', 0.45));
    const discRing = mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 32), toy(PALETTE.coral, 0.4), false);
    discRing.rotation.x = Math.PI / 2;
    disc.add(discRing);
    disc.rotation.x = Math.PI / 2 - 0.55;
    disc.position.set(0.72, 1.6, -0.45);
    this.pieMat = new THREE.MeshStandardMaterial({ color: PALETTE.strawberry, roughness: 0.35, side: THREE.DoubleSide });
    this.pie = new THREE.Mesh(new THREE.CircleGeometry(0.25, 32, Math.PI / 2, Math.PI * 2), this.pieMat);
    this.pie.position.set(0, 0.035, 0);
    this.pie.rotation.x = -Math.PI / 2;
    disc.add(this.pie);
    this.body.add(stick, disc);

    // Wrapper hatch at the outlet (+z face, towards the conveyor).
    const frame = mesh(roundedBox(0.5, 0.36, 0.1, 0.04), cream, false);
    frame.position.set(0, 0.42, 0.78);
    this.flapL = mesh(roundedBox(0.2, 0.28, 0.04, 0.02), coral, false);
    this.flapR = this.flapL.clone();
    this.flapL.geometry = this.flapL.geometry.clone().translate(0.1, 0, 0);
    this.flapR.geometry = this.flapR.geometry.clone().translate(-0.1, 0, 0);
    this.flapL.position.set(-0.2, 0.42, 0.84);
    this.flapR.position.set(0.2, 0.42, 0.84);
    this.body.add(frame, this.flapL, this.flapR);
    this.outlet.set(x, 0.38, z + 0.85);

    // Upgrade visuals: a striped hat (level 3) and lights (level 4).
    this.hat = new THREE.Group();
    const brim = mesh(cylinder(0.3, 0.3, 0.05, 20), toy(PALETTE.plum, 0.5));
    const crown = mesh(cylinder(0.2, 0.22, 0.3, 20), new THREE.MeshStandardMaterial({ map: candyStripeTexture(PALETTE.plum, PALETTE.strawberry, 4, 'hat'), roughness: 0.45 }));
    crown.position.y = 0.17;
    const pom = mesh(sphere(0.07, 10, 8), candy(PALETTE.lemon));
    pom.position.y = 0.36;
    this.hat.add(brim, crown, pom);
    this.hat.position.set(0.1, 0.96, -0.5);
    this.hat.rotation.z = 0.15;
    this.body.add(this.hat);
    for (let i = 0; i < 4; i++) {
      const b = mesh(sphere(0.055, 10, 8), new THREE.MeshStandardMaterial({ color: '#FFF2B8', emissive: '#FFD260', emissiveIntensity: 0, roughness: 0.3 }), false);
      b.position.set(-0.72 + i * 0.48, 0.92, 0.72);
      this.bulbs.push(b);
      this.body.add(b);
    }

    mergeStaticChildren(this.body, (m) => this.rollers.includes(m) || m === this.fill || m === this.flapL || m === this.flapR || this.bulbs.includes(m));

    // Unload pad on the floor (separate from the machine body).
    this.padMat = new THREE.MeshStandardMaterial({ map: unloadPadTexture(), roughness: 0.7, transparent: true });
    const uz = WORLD.unloadZone;
    this.pad = new THREE.Mesh(new THREE.PlaneGeometry(uz.hw * 2 + 0.1, uz.hd * 2 + 0.1), this.padMat);
    this.pad.rotation.x = -Math.PI / 2;
    this.pad.position.set(uz.x - x, 0.012, uz.z - z);
    this.pad.receiveShadow = true;
    this.root.add(this.pad);
  }

  onProduct(): void {
    this.squash = 1;
    this.flapT = 0;
  }

  upgradePop(): void {
    this.upgradePopT = 1;
  }

  update(m: MachineState, level: number, dt: number, time: number, unloading: boolean, reducedMotion: boolean): void {
    const motion = reducedMotion ? 0.35 : 1;
    if (level !== this.level) {
      this.level = level;
      const rs = 1 + level * 0.12;
      for (const r of this.rollers) r.scale.set(rs, 1, rs);
      this.hat.visible = level >= 2;
      for (const b of this.bulbs) b.visible = level >= 3;
    }
    const processing = m.status === 'processing';
    const target = processing ? 10 + level * 4 : m.status === 'blocked' ? 1 : 0;
    this.rollerSpeed += (target - this.rollerSpeed) * Math.min(1, dt * 5);
    this.rollerSpin += this.rollerSpeed * dt;
    this.rollers[0].rotation.x = this.rollerSpin;
    this.rollers[1].rotation.x = -this.rollerSpin;

    // Hopper fill level and colour follow the real hopper contents.
    let mass = 0;
    for (const b of m.hopper) mass += b.mass;
    const ratio = Math.min(1, mass / MACHINE.hopperCapacity);
    this.fill.visible = mass > 0.01;
    const y = 0.93 + ratio * 0.45;
    const rad = 0.18 + ratio * ratio * 0.34 + ratio * 0.05;
    this.fill.position.y = y;
    this.fill.scale.setScalar(rad);
    const head = m.hopper[0];
    if (head) this.fillMat.color.set(CONTRACTS[head.defId].layerColors[head.layer]);

    // Progress pie = production timer.
    const prog = m.cycle ? m.cycle.progress : 0;
    const segs = Math.floor(prog * 32);
    (this.pie.geometry as THREE.BufferGeometry).setDrawRange(0, segs * 3);
    if (m.cycle) this.pieMat.color.set(CONTRACTS[m.cycle.defId].primary);

    // Breathing when idle, squash on output, chug while processing.
    this.squash = Math.max(0, this.squash - dt / 0.2);
    this.chugT += dt * (processing ? 14 : 2);
    const breathe = processing ? Math.sin(this.chugT) * 0.015 : Math.sin(time * 1.6) * 0.012;
    const sq = Math.sin(this.squash * Math.PI) * 0.07;
    let pop = 1;
    if (this.upgradePopT > 0) {
      this.upgradePopT = Math.max(0, this.upgradePopT - dt * 2.4);
      pop = 1 + Math.sin((1 - this.upgradePopT) * Math.PI) * 0.08;
    }
    this.body.scale.set((1 + sq * 0.6) * pop, (1 + breathe * motion - sq) * pop, (1 + sq * 0.6) * pop);

    this.flapT = Math.min(1, this.flapT + dt / 0.25);
    const open = Math.sin(this.flapT * Math.PI) * 1.1;
    this.flapL.rotation.y = -open;
    this.flapR.rotation.y = open;

    for (let i = 0; i < this.bulbs.length; i++) {
      const mat = this.bulbs[i].material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = level >= 3 ? 0.5 + 0.5 * Math.max(0, Math.sin(time * 4 - i * 0.9)) : 0;
    }
    this.padMat.emissive = this.padMat.emissive ?? new THREE.Color();
    this.padMat.emissive.set(unloading ? '#FFD260' : '#000000');
    this.padMat.emissiveIntensity = unloading ? 0.25 + 0.15 * Math.sin(time * 10) : 0;
  }
}
