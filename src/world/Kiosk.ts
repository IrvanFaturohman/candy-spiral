import * as THREE from 'three';
import { mergeStaticChildren } from '../visuals/merge';
import { PALETTE, WORLD } from '../game/config';
import { awningTexture, signTexture } from '../visuals/textures';
import { cylinder, mesh, roundedBox, sphere, toy, torus } from '../visuals/materials';
import type { ProductRenderer } from '../visuals/ProductRenderer';

interface Display {
  defId: number;
  t: number;
  slot: number;
}

/** Little candy kiosk with a canopy, a shelf that shows sold items, and a waving blob customer. */
export class Kiosk {
  readonly root = new THREE.Group();
  private displays: Display[] = [];
  private customer = new THREE.Group();
  private hand: THREE.Mesh;
  private waveT = 0;
  private nextWave = 5;
  private hopT = 1;
  private sparkle = 0;
  readonly salePoint = new THREE.Vector3();

  constructor() {
    const k = WORLD.kiosk;
    this.root.position.set(k.x, 0, k.z);
    const cream = toy(PALETTE.cream, 0.5);
    const pink = toy(PALETTE.strawberry, 0.45);
    const teal = toy(PALETTE.teal, 0.45);
    const counter = mesh(roundedBox(1.5, 0.58, 1.1, 0.1), cream);
    counter.position.y = 0.29;
    const front = mesh(roundedBox(1.52, 0.3, 0.06, 0.03), pink, false);
    front.position.set(0, 0.3, 0.55);
    const top = mesh(roundedBox(1.6, 0.06, 1.2, 0.03), teal, false);
    top.position.y = 0.6;
    this.root.add(counter, front, top);
    // Canopy posts + striped awning.
    for (const x of [-0.72, 0.72]) {
      const post = mesh(cylinder(0.04, 0.04, 1.05, 8), toy(PALETTE.panel, 0.5), false);
      post.position.set(x, 1.1, -0.48);
      this.root.add(post);
    }
    const awnMat = new THREE.MeshStandardMaterial({ map: awningTexture(), roughness: 0.6, side: THREE.DoubleSide });
    const awning = mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.7, 16, 1, true, Math.PI * 0.5, Math.PI), awnMat, true);
    awning.rotation.z = Math.PI / 2;
    awning.scale.set(1, 1, 0.5);
    awning.position.set(0, 1.55, -0.2);
    this.root.add(awning);
    // Scalloped edge.
    for (let i = 0; i < 8; i++) {
      const s = mesh(sphere(0.1, 10, 8), i % 2 ? cream : pink, false);
      s.position.set(-0.75 + i * 0.214, 1.52, 0.12);
      s.scale.set(1, 0.7, 0.7);
      this.root.add(s);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('CANDY!', PALETTE.lemon, PALETTE.plum, 256, 70), transparent: true }));
    sign.position.set(0, 1.95, -0.3);
    sign.rotation.x = -0.35;
    this.root.add(sign);
    this.salePoint.set(WORLD.conveyorPath[WORLD.conveyorPath.length - 1].x, 0.4, WORLD.conveyorPath[WORLD.conveyorPath.length - 1].z);

    // Blob customer.
    const c = WORLD.customer;
    this.customer.position.set(c.x - k.x, 0, c.z - k.z);
    const blobMat = toy(PALETTE.mint, 0.5);
    const blob = mesh(sphere(0.3, 20, 14), blobMat);
    blob.scale.set(1, 0.85, 0.9);
    blob.position.y = 0.26;
    const eyeMat = toy(PALETTE.plum, 0.4);
    const e1 = mesh(sphere(0.035, 8, 6), eyeMat, false);
    e1.position.set(-0.09, 0.34, -0.25);
    const e2 = e1.clone();
    e2.position.x = 0.09;
    const mouth = mesh(torus(0.05, 0.012, Math.PI), eyeMat, false);
    mouth.position.set(0, 0.26, -0.265);
    mouth.rotation.set(0, Math.PI, Math.PI);
    this.hand = mesh(sphere(0.08, 10, 8), blobMat, false);
    this.hand.position.set(0.3, 0.3, -0.05);
    const bow = mesh(sphere(0.06, 8, 6), toy(PALETTE.strawberry, 0.4), false);
    bow.position.set(0.12, 0.5, -0.05);
    this.customer.add(blob, e1, e2, mouth, this.hand, bow);
    mergeStaticChildren(this.customer, (m) => m === this.hand);
    mergeStaticChildren(this.root);
    this.root.add(this.customer);
  }

  onSale(defId: number, bigBatch: boolean): void {
    const used = new Set(this.displays.map((d) => d.slot));
    let slot = 0;
    while (used.has(slot) && slot < 3) slot++;
    if (slot >= 3) {
      this.displays.shift();
      slot = 0;
    }
    this.displays.push({ defId, t: 0, slot });
    this.hopT = 0;
    if (bigBatch) {
      this.sparkle = 1;
      this.waveT = 0.001;
    }
  }

  update(dt: number, time: number, products: ProductRenderer, reducedMotion: boolean): void {
    const motion = reducedMotion ? 0.35 : 1;
    for (let i = this.displays.length - 1; i >= 0; i--) {
      const d = this.displays[i];
      d.t += dt;
      if (d.t > 0.9) this.displays.splice(i, 1);
    }
    for (const d of this.displays) {
      const pop = d.t < 0.2 ? d.t / 0.2 : d.t > 0.7 ? Math.max(0, 1 - (d.t - 0.7) / 0.2) : 1;
      const x = this.root.position.x - 0.45 + d.slot * 0.45;
      products.add(d.defId, x, 0.63 + Math.sin(Math.min(1, d.t / 0.2) * Math.PI) * 0.08 * motion, this.root.position.z + 0.15, 0.4, 0.9 * pop);
    }
    // Customer: idle bob, hop on sales, occasional wave.
    this.hopT = Math.min(1, this.hopT + dt / 0.35);
    const hop = Math.sin(this.hopT * Math.PI) * 0.12 * motion;
    this.customer.position.y = hop + Math.sin(time * 2.4) * 0.01 * motion;
    this.nextWave -= dt;
    if (this.nextWave <= 0) {
      this.nextWave = 7 + Math.random() * 6;
      this.waveT = 0.001;
    }
    if (this.waveT > 0) {
      this.waveT += dt;
      this.hand.position.y = 0.42 + Math.abs(Math.sin(this.waveT * 12)) * 0.08 * motion;
      if (this.waveT > 1.3) this.waveT = 0;
    } else {
      this.hand.position.y = 0.3;
    }
    this.sparkle = Math.max(0, this.sparkle - dt);
  }
}
