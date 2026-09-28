import * as THREE from 'three';
import { mergeStaticChildren } from '../visuals/merge';
import { PALETTE, WORLD } from '../game/config';
import { beltTexture } from '../visuals/textures';
import { cylinder, mesh, roundedBox, toy } from '../visuals/materials';

const BELT_Y = 0.34;

/** L-shaped belt from the machine outlet to the kiosk sale point. */
export class Conveyor {
  readonly root = new THREE.Group();
  private belts: THREE.Texture[] = [];
  private rollers: THREE.Mesh[] = [];
  private lengths: number[] = [];
  private total = 0;
  private scroll = 0;

  constructor() {
    const path = WORLD.conveyorPath;
    const teal = toy(PALETTE.teal, 0.45);
    const cream = toy(PALETTE.cream, 0.5);
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      this.lengths.push(len);
      this.total += len;
      const ang = Math.atan2(b.z - a.z, b.x - a.x);
      const seg = new THREE.Group();
      seg.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
      seg.rotation.y = -ang;
      const tex = beltTexture().clone();
      tex.needsUpdate = true;
      tex.repeat.set(len / 0.5, 1);
      this.belts.push(tex);
      const belt = new THREE.Mesh(new THREE.BoxGeometry(len + 0.36, 0.06, 0.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
      belt.position.y = BELT_Y - 0.03;
      belt.receiveShadow = true;
      seg.add(belt);
      for (const side of [-1, 1]) {
        const rail = mesh(roundedBox(len + 0.4, 0.12, 0.08, 0.035), teal, false);
        rail.position.set(0, BELT_Y + 0.01, side * 0.29);
        seg.add(rail);
      }
      const body = mesh(roundedBox(len + 0.3, 0.2, 0.46, 0.06), cream, false);
      body.position.y = BELT_Y - 0.16;
      seg.add(body);
      for (let k = 0; k <= Math.max(1, Math.floor(len / 0.9)); k++) {
        const lx = -len / 2 + (k / Math.max(1, Math.floor(len / 0.9))) * len;
        for (const side of [-1, 1]) {
          const leg = mesh(cylinder(0.035, 0.035, BELT_Y - 0.2, 6), toy(PALETTE.tealDark, 0.5), false);
          leg.position.set(lx, (BELT_Y - 0.2) / 2, side * 0.2);
          seg.add(leg);
        }
      }
      for (const end of [-1, 1]) {
        const r = mesh(cylinder(0.07, 0.07, 0.52, 12), toy(PALETTE.lemon, 0.4), false);
        r.rotation.x = Math.PI / 2;
        r.position.set((end * (len + 0.3)) / 2, BELT_Y - 0.03, 0);
        seg.add(r);
        this.rollers.push(r);
      }
      mergeStaticChildren(seg, (m) => this.rollers.includes(m));
      this.root.add(seg);
    }
  }

  /** Point on the belt for a product at t ∈ [0, 1]. */
  pointAt(t: number, out: THREE.Vector3): THREE.Vector3 {
    const path = WORLD.conveyorPath;
    let d = Math.max(0, Math.min(1, t)) * this.total;
    for (let i = 0; i < this.lengths.length; i++) {
      const L = this.lengths[i];
      if (d <= L || i === this.lengths.length - 1) {
        const k = L > 0 ? Math.min(1, d / L) : 0;
        const a = path[i];
        const b = path[i + 1];
        return out.set(a.x + (b.x - a.x) * k, BELT_Y + 0.01, a.z + (b.z - a.z) * k);
      }
      d -= L;
    }
    return out;
  }

  headingAt(t: number): number {
    const path = WORLD.conveyorPath;
    let d = t * this.total;
    for (let i = 0; i < this.lengths.length; i++) {
      if (d <= this.lengths[i] || i === this.lengths.length - 1) return Math.atan2(path[i + 1].z - path[i].z, path[i + 1].x - path[i].x);
      d -= this.lengths[i];
    }
    return 0;
  }

  update(dt: number, running: boolean, speedT: number): void {
    // Belt scroll speed matches product travel speed.
    if (running) this.scroll += (dt * this.total * speedT) / 0.5;
    for (const tex of this.belts) tex.offset.x = -this.scroll;
    for (const r of this.rollers) r.rotation.y = this.scroll * 3;
  }
}
