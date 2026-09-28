import * as THREE from 'three';
import { CONTRACTS } from '../game/config';
import type { Collectible } from '../game/types';
import { coilGeometry, coilMaterial } from './coilGeometry';

const MAX_ROLLS = 110;
const MAX_FLYERS = 48;

interface RollVis {
  born: number; // presentation clock when it started flying (-1 = already settled at load)
  fromX: number;
  fromY: number;
  fromZ: number;
}

interface Flyer {
  active: boolean;
  t: number;
  dur: number;
  from: THREE.Vector3;
  to: () => THREE.Vector3;
  color: THREE.Color;
  scale: number;
  arc: number;
  spin: number;
  onDone?: () => void;
}

function hash(n: number): number {
  let x = (n * 2654435761) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 2246822507) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

/**
 * World rolls are drawn from the authoritative collectible list every frame
 * (so load/aggregation just works). Flyers are pure presentation for
 * pickup/unload arcs — they never own resources.
 */
export class CollectibleRenderer {
  readonly group = new THREE.Group();
  private rolls: THREE.InstancedMesh;
  private flyersMesh: THREE.InstancedMesh;
  private vis = new Map<number, RollVis>();
  private flyers: Flyer[] = [];
  private clock = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  private axis = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  onLand: ((x: number, z: number) => void) | null = null;

  constructor() {
    this.rolls = new THREE.InstancedMesh(coilGeometry(), coilMaterial(), MAX_ROLLS);
    this.rolls.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_ROLLS * 3), 3);
    this.rolls.castShadow = true;
    this.rolls.frustumCulled = false;
    this.rolls.count = 0;
    this.flyersMesh = new THREE.InstancedMesh(coilGeometry(), coilMaterial(), MAX_FLYERS);
    this.flyersMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLYERS * 3), 3);
    this.flyersMesh.frustumCulled = false;
    this.flyersMesh.count = 0;
    this.group.add(this.rolls, this.flyersMesh);
    for (let i = 0; i < MAX_FLYERS; i++)
      this.flyers.push({ active: false, t: 0, dur: 0.25, from: new THREE.Vector3(), to: () => new THREE.Vector3(), color: new THREE.Color(), scale: 1, arc: 0.5, spin: 0 });
  }

  get activeCount(): number {
    return this.rolls.count;
  }

  /** A roll was committed to the world; animate it from the ribbon to its pocket slot. */
  spawnFrom(id: number, x: number, y: number, z: number): void {
    this.vis.set(id, { born: this.clock, fromX: x, fromY: y, fromZ: z });
  }

  fly(from: THREE.Vector3, to: () => THREE.Vector3, color: THREE.ColorRepresentation, scale: number, dur: number, arc: number, onDone?: () => void): void {
    const f = this.flyers.find((fl) => !fl.active);
    if (!f) {
      onDone?.();
      return;
    }
    f.active = true;
    f.t = 0;
    f.dur = dur;
    f.from.copy(from);
    f.to = to;
    f.color.set(color);
    f.scale = scale;
    f.arc = arc;
    f.spin = hash(Math.floor(this.clock * 1000)) * 6;
    f.onDone = onDone;
  }

  update(collectibles: Collectible[], dt: number, reducedMotion: boolean): void {
    this.clock += dt;
    const SPAWN = 0.32;
    let n = 0;
    const seen = new Set<number>();
    for (const r of collectibles) {
      if (n >= MAX_ROLLS) break;
      seen.add(r.id);
      const h1 = hash(r.id);
      const h2 = hash(r.id + 7919);
      const tilt = 0.45 + h1 * 0.5;
      this.axis.set(Math.cos(h2 * 6.283), 0, Math.sin(h2 * 6.283));
      this.q.setFromAxisAngle(this.axis, tilt);
      this.q2.setFromAxisAngle(this.up, h1 * 6.283);
      this.q.multiply(this.q2);
      const sc = (0.88 + h2 * 0.2) * Math.cbrt(Math.max(0.05, r.mass));
      const restY = r.y + 0.15 * sc;
      let x = r.x;
      let y = restY;
      let z = r.z;
      let sy = sc;
      let sxz = sc;
      const v = this.vis.get(r.id);
      if (v && v.born >= 0) {
        const age = this.clock - v.born;
        if (age < SPAWN) {
          const t = age / SPAWN;
          x = v.fromX + (r.x - v.fromX) * t;
          z = v.fromZ + (r.z - v.fromZ) * t;
          y = v.fromY + (restY - v.fromY) * t + Math.sin(t * Math.PI) * (reducedMotion ? 0.2 : 0.55);
          this.q2.setFromAxisAngle(this.up, t * 8);
          this.q.multiply(this.q2);
        } else if (age < SPAWN + 0.2) {
          // One soft bounce with a little squash.
          const b = (age - SPAWN) / 0.2;
          const k = reducedMotion ? 0.3 : 1;
          y = restY + Math.sin(b * Math.PI) * 0.07 * k;
          const squash = Math.sin(Math.min(1, b * 2) * Math.PI) * 0.2 * k;
          sy = sc * (1 - squash);
          sxz = sc * (1 + squash * 0.5);
        } else {
          v.born = -1;
          this.onLand?.(r.x, r.z);
        }
      }
      this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sxz, sy, sxz));
      this.rolls.setMatrixAt(n, this.m);
      this.c.set(CONTRACTS[r.defId].layerColors[r.layer]);
      this.rolls.setColorAt(n, this.c);
      n++;
    }
    this.rolls.count = n;
    this.rolls.instanceMatrix.needsUpdate = true;
    if (this.rolls.instanceColor) this.rolls.instanceColor.needsUpdate = true;
    // Forget visual state for rolls that no longer exist.
    if (this.vis.size > seen.size + 20) for (const id of this.vis.keys()) if (!seen.has(id)) this.vis.delete(id);

    let fn = 0;
    for (const f of this.flyers) {
      if (!f.active) continue;
      f.t += dt / f.dur;
      if (f.t >= 1) {
        f.active = false;
        f.onDone?.();
        continue;
      }
      const t = f.t;
      const to = f.to();
      const e = t * t * (3 - 2 * t);
      this.p.lerpVectors(f.from, to, e);
      this.p.y += Math.sin(t * Math.PI) * f.arc;
      this.q.setFromAxisAngle(this.up, f.spin + t * 9);
      const sc = f.scale * (1 - 0.35 * t);
      this.m.compose(this.p, this.q, this.s.set(sc, sc, sc));
      this.flyersMesh.setMatrixAt(fn, this.m);
      this.flyersMesh.setColorAt(fn, f.color);
      fn++;
    }
    this.flyersMesh.count = fn;
    this.flyersMesh.instanceMatrix.needsUpdate = true;
    if (this.flyersMesh.instanceColor) this.flyersMesh.instanceColor.needsUpdate = true;
  }
}
