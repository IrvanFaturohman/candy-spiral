import * as THREE from 'three';
import { mergeStaticChildren } from '../visuals/merge';
import { PALETTE, WORLD } from '../game/config';
import { faceTexture } from '../visuals/textures';
import { capsule, cylinder, mesh, roundedBox, sphere, toy } from '../visuals/materials';

/** Tiny sugar robot that scrapes from a fixed station on the far side of the candy. */
export class HelperBot {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private arm = new THREE.Group();
  private antennaBall: THREE.Mesh;
  private station: THREE.Group;
  private x = 0;
  private z = 0;
  private placed = false;
  private appearT = 0;

  constructor() {
    const pink = toy(PALETTE.pinkLight, 0.45);
    const white = toy(PALETTE.panel, 0.5);
    this.root.add(this.body);
    const base = mesh(cylinder(0.2, 0.24, 0.12, 16), toy(PALETTE.teal, 0.45));
    base.position.y = 0.08;
    const torso = mesh(capsule(0.18, 0.12), white);
    torso.position.y = 0.36;
    const belly = mesh(sphere(0.12, 12, 10), pink, false);
    belly.position.set(0, 0.34, 0.12);
    belly.scale.set(1, 1, 0.5);
    const head = mesh(roundedBox(0.36, 0.26, 0.28, 0.1), pink);
    head.position.y = 0.68;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.18), new THREE.MeshBasicMaterial({ map: faceTexture() }));
    face.position.set(0, 0.68, 0.145);
    const stalk = mesh(cylinder(0.015, 0.015, 0.16, 6), toy(PALETTE.plum, 0.5), false);
    stalk.position.y = 0.88;
    this.antennaBall = mesh(sphere(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: PALETTE.lemon, emissive: '#FFD260', emissiveIntensity: 0.5 }), false);
    this.antennaBall.position.y = 0.98;
    this.body.add(base, torso, belly, head, face, stalk, this.antennaBall);
    mergeStaticChildren(this.body, (m) => m === this.antennaBall);
    // Arm holding a small scraper.
    this.arm.position.set(0.18, 0.42, 0.05);
    const a = mesh(capsule(0.04, 0.14), white, false);
    a.rotation.x = Math.PI / 2;
    a.position.z = 0.1;
    const blade = mesh(roundedBox(0.24, 0.03, 0.1, 0.012), toy(PALETTE.coral, 0.35), false);
    blade.position.set(-0.12, -0.02, 0.24);
    this.arm.add(a, blade);
    this.body.add(this.arm);

    // Station pad + radial rail on the platter.
    this.station = new THREE.Group();
    const ang = (WORLD.helperAngleDeg * Math.PI) / 180;
    const rail = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.source.radius - WORLD.source.hubRadius + 0.6, 0.12), new THREE.MeshBasicMaterial({ color: PALETTE.teal, transparent: true, opacity: 0.45, depthWrite: false }));
    rail.rotation.x = -Math.PI / 2;
    rail.rotation.z = -ang;
    const mid = (WORLD.source.radius + WORLD.source.hubRadius) / 2 + 0.3;
    rail.position.set(WORLD.source.x + Math.cos(ang) * mid, 0.07, WORLD.source.z + Math.sin(ang) * mid);
    this.station.add(rail);
    this.root.visible = false;
    this.station.visible = false;
  }

  get stationObject(): THREE.Object3D {
    return this.station;
  }

  update(active: boolean, x: number, z: number, cutting: boolean, dt: number, time: number, reducedMotion: boolean): void {
    this.root.visible = active;
    this.station.visible = active;
    if (!active) {
      this.placed = false;
      this.appearT = 0;
      return;
    }
    if (!this.placed) {
      this.x = x;
      this.z = z;
      this.placed = true;
    }
    // Glide along the rail as the surface shrinks.
    const k = Math.min(1, dt * 4);
    this.x += (x - this.x) * k;
    this.z += (z - this.z) * k;
    this.root.position.set(this.x, 0, this.z);
    const faceAng = Math.atan2(WORLD.source.z - this.z, WORLD.source.x - this.x);
    this.root.rotation.y = Math.PI / 2 - faceAng;
    this.appearT = Math.min(1, this.appearT + dt / 0.5);
    const s = reducedMotion ? 1 : 1 - Math.pow(1 - this.appearT, 3) * 0.9;
    this.root.scale.setScalar(s);
    const motion = reducedMotion ? 0.3 : 1;
    const vib = cutting && !reducedMotion ? (Math.random() - 0.5) * 0.02 : 0;
    this.body.position.y = Math.sin(time * 3) * 0.01 * motion;
    this.body.rotation.x = cutting ? 0.18 : 0;
    this.arm.rotation.x = cutting ? -0.5 + vib * 6 : -0.2;
    (this.antennaBall.material as THREE.MeshStandardMaterial).emissiveIntensity = cutting ? 0.6 + 0.4 * Math.sin(time * 12) : 0.4;
  }
}
