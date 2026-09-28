import * as THREE from 'three';
import { mergeStaticChildren } from '../visuals/merge';
import { CONTRACTS, PALETTE, WORLD } from '../game/config';
import { layerRadii, NUM_LAYERS, sectorRadius } from '../game/state';
import type { ContractInstance } from '../game/types';
import { stripeTexture } from '../visuals/textures';
import { candy, cylinder, mesh, sphere, toy } from '../visuals/materials';

const N = WORLD.source.sectors;
const J = N * 2; // two columns per sector: boundary + centre
const ROWS = 6;
const LAYER_HEIGHTS = [0.7, 0.75, 0.79, 0.83, 0.86];
const BEVEL = 0.08;
const HIDE_EPS = 0.012;
const CAP_Y = 1.22;
const CAP_SCALE = WORLD.source.hubRadius / 0.55;

/** One annulus of the candy. Only the active layer's vertices are rewritten. */
class LayerMesh {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private nor: Float32Array;
  private uv: Float32Array;
  private geo: THREE.BufferGeometry;
  private radii = new Float32Array(N);
  private cachedMass = new Float32Array(N).fill(-1);
  private material: THREE.MeshStandardMaterial;
  readonly inner: number;
  readonly outer: number;
  readonly height: number;
  private uRepeat: number;

  constructor(private layer: number) {
    const r = layerRadii()[layer];
    this.inner = r.inner;
    this.outer = r.outer;
    this.height = LAYER_HEIGHTS[layer];
    this.uRepeat = Math.max(4, Math.round((Math.PI * 2 * this.outer) / 0.85));
    const vcount = J * ROWS;
    this.pos = new Float32Array(vcount * 3);
    this.nor = new Float32Array(vcount * 3);
    this.uv = new Float32Array(vcount * 2);
    const idx: number[] = [];
    for (let j = 0; j < J; j++) {
      const j2 = (j + 1) % J;
      for (const [a, b] of [
        [0, 1],
        [2, 3],
        [4, 5],
      ]) {
        const v00 = j * ROWS + a;
        const v01 = j * ROWS + b;
        const v10 = j2 * ROWS + a;
        const v11 = j2 * ROWS + b;
        idx.push(v00, v10, v01, v01, v10, v11);
      }
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), this.outer + 0.1);
    this.material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.34,
      metalness: 0,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.16,
      emissiveMap: stripeTexture(),
    });
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  setColor(hex: string): void {
    this.material.color.set(hex);
  }

  /** Rebuild vertices if any sector mass changed. Returns true when rewritten. */
  sync(c: ContractInstance, force = false): boolean {
    const masses = c.sectors[this.layer];
    let dirty = force;
    if (!dirty) {
      for (let i = 0; i < N; i++) {
        if (this.cachedMass[i] !== Math.fround(masses[i])) {
          dirty = true;
          break;
        }
      }
    }
    if (!dirty) return false;
    for (let i = 0; i < N; i++) {
      this.cachedMass[i] = Math.fround(masses[i]);
      this.radii[i] = sectorRadius(c, this.layer, i);
    }
    this.write();
    return true;
  }

  private write(): void {
    const sa = (Math.PI * 2) / N;
    const H = this.height;
    const rIn = this.inner;
    const span = this.outer - this.inner;
    const P = this.pos;
    const Nn = this.nor;
    const U = this.uv;
    for (let j = 0; j < J; j++) {
      const i = j >> 1;
      const isBoundary = (j & 1) === 0;
      const ang = isBoundary ? i * sa : (i + 0.5) * sa;
      // Conservative: boundary vertices use the smaller neighbour, never showing extra mass.
      let r = isBoundary ? Math.min(this.radii[(i - 1 + N) % N], this.radii[i]) : this.radii[i];
      let top = H;
      if (r - rIn < HIDE_EPS) {
        r = rIn - 0.03; // tuck inside the (taller) inner layer
        top = H - 0.02;
      }
      const bev = Math.max(0, Math.min(BEVEL, (r - rIn) * 0.7));
      const rT = Math.max(rIn, r - bev);
      const cx = Math.cos(ang);
      const sz = Math.sin(ang);
      const u = (j / J) * this.uRepeat;
      const base = j * ROWS;
      const setV = (row: number, rad: number, y: number, nx: number, ny: number, nz: number, v: number) => {
        const k = (base + row) * 3;
        P[k] = cx * rad;
        P[k + 1] = y;
        P[k + 2] = sz * rad;
        Nn[k] = nx;
        Nn[k + 1] = ny;
        Nn[k + 2] = nz;
        const t = (base + row) * 2;
        U[t] = u;
        U[t + 1] = v;
      };
      const bn = 0.7071;
      setV(0, rIn, top, 0, 1, 0, 0);
      setV(1, rT, top, 0, 1, 0, ((rT - rIn) / span) * 0.9);
      setV(2, rT, top, cx * bn, bn, sz * bn, 0.95);
      setV(3, r, top - bev, cx * bn, bn, sz * bn, 1.0);
      setV(4, r, top - bev, cx, 0, sz, 1.0);
      setV(5, r, 0, cx, 0, sz, 1.0 + top * 1.4);
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.normal as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.uv as THREE.BufferAttribute).needsUpdate = true;
  }
}

export class CandyRoll {
  readonly group = new THREE.Group();
  readonly spin = new THREE.Group();
  private layersGroup = new THREE.Group();
  private layers: LayerMesh[] = [];
  private cap = new THREE.Group();
  private hubBand: THREE.Mesh;
  private builtFor = -1;
  private dropT = 1;
  private capLift = 0;
  private capLifting = false;

  constructor() {
    this.group.position.set(WORLD.source.x, 0, WORLD.source.z);
    this.group.add(this.spin);
    // Platter: thin turntable at floor level, walkable once the candy is gone.
    const platter = new THREE.Mesh(cylinder(WORLD.source.platterRadius, WORLD.source.platterRadius + 0.06, 0.06, 72), toy('#E6F2EE', 0.7));
    platter.position.y = 0.03;
    platter.receiveShadow = true;
    this.spin.add(platter);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(WORLD.source.platterRadius + 0.02, 0.035, 6, 72), toy(PALETTE.teal, 0.5));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.06;
    this.spin.add(rim);
    // Rim dots make the rotation readable even when the candy is empty.
    const dotGeo = sphere(0.045, 8, 6);
    const dotMat = toy(PALETTE.cream, 0.5);
    const dots = new THREE.InstancedMesh(dotGeo, dotMat, 24);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * (WORLD.source.platterRadius - 0.07), 0.065, Math.sin(a) * (WORLD.source.platterRadius - 0.07));
      dots.setMatrixAt(i, m);
    }
    this.spin.add(dots);

    this.spin.add(this.layersGroup);
    for (let l = 0; l < NUM_LAYERS; l++) {
      const lm = new LayerMesh(l);
      this.layers.push(lm);
      this.layersGroup.add(lm.mesh);
    }

    // Hub with a clear marker so the spin is always readable.
    const hubR = WORLD.source.hubRadius;
    const hub = mesh(cylinder(hubR, hubR, 0.96, 32), candy(PALETTE.cream));
    hub.position.y = 0.48;
    this.spin.add(hub);
    this.hubBand = mesh(cylinder(hubR + 0.012, hubR + 0.012, 0.12, 32), candy(PALETTE.strawberry), false);
    this.hubBand.position.y = 0.8;
    this.spin.add(this.hubBand);
    const marker = mesh(new THREE.BoxGeometry(0.16, 0.1, 0.3), candy(PALETTE.teal), false);
    marker.position.set(hubR - 0.05, 1.0, 0);
    this.spin.add(marker);
    const marker2 = mesh(sphere(0.07, 10, 8), candy(PALETTE.lemon), false);
    marker2.position.set(-(hubR - 0.12), 1.01, 0);
    this.spin.add(marker2);

    mergeStaticChildren(this.spin, (m) => m === this.hubBand);

    // Bonbon cap sitting on the hub (lifts off when a contract completes).
    const body = mesh(sphere(0.3, 20, 14), candy(PALETTE.strawberry));
    body.scale.set(1.25, 0.8, 1);
    const wrapA = mesh(new THREE.ConeGeometry(0.18, 0.26, 12), candy(PALETTE.cream));
    wrapA.rotation.z = Math.PI / 2;
    wrapA.position.x = 0.46;
    const wrapB = wrapA.clone();
    wrapB.rotation.z = -Math.PI / 2;
    wrapB.position.x = -0.46;
    this.cap.add(body, wrapA, wrapB);
    mergeStaticChildren(this.cap);
    this.cap.position.y = CAP_Y;
    this.cap.scale.setScalar(CAP_SCALE);
    this.spin.add(this.cap);
  }

  /** Called every frame with the interpolated rotation. */
  update(c: ContractInstance, rotation: number, dt: number, reducedMotion: boolean): void {
    if (c.ciid !== this.builtFor) {
      const first = this.builtFor === -1;
      this.builtFor = c.ciid;
      const def = CONTRACTS[c.defId];
      this.layers.forEach((l, i) => {
        l.setColor(def.layerColors[i]);
        l.sync(c, true);
      });
      this.hubBand.material = candy(def.primary);
      this.dropT = first ? 1 : 0;
      this.capLifting = false;
      this.capLift = 0;
    }
    for (let l = 0; l < NUM_LAYERS; l++) {
      const lm = this.layers[l];
      const visible = l >= c.activeLayer;
      lm.mesh.visible = visible;
      if (visible && l === c.activeLayer) lm.sync(c);
    }
    this.spin.rotation.y = -rotation;

    // New candy drops in with a soft bounce.
    if (this.dropT < 1) {
      this.dropT = Math.min(1, this.dropT + dt / 0.85);
      const t = this.dropT;
      const y = reducedMotion ? 0 : dropCurve(t) * 2.4;
      this.layersGroup.position.y = y;
      this.cap.position.y = CAP_Y + y;
      const s = reducedMotion ? 1 : 0.92 + 0.08 * Math.min(1, t * 1.4);
      this.layersGroup.scale.set(s, 1, s);
      this.cap.visible = true;
      this.cap.scale.setScalar(CAP_SCALE);
    } else {
      this.layersGroup.position.y = 0;
      this.layersGroup.scale.set(1, 1, 1);
    }
    if (c.status === 'completed' && !this.capLifting && this.dropT >= 1) this.capLifting = true;
    if (this.capLifting) {
      this.capLift = Math.min(1, this.capLift + dt / 1.1);
      const t = this.capLift;
      this.cap.position.y = CAP_Y + (reducedMotion ? t * 0.6 : Math.sin(t * Math.PI * 0.5) * 2.2);
      this.cap.rotation.y += dt * 6 * (1 - t);
      this.cap.scale.setScalar(CAP_SCALE * (1 - Math.max(0, t - 0.7) / 0.3));
      if (t >= 1) this.cap.visible = false;
    } else if (this.dropT >= 1 && c.status !== 'completed') {
      this.cap.visible = true;
      this.cap.position.y = CAP_Y + Math.sin(performance.now() / 600) * (reducedMotion ? 0 : 0.02);
      this.cap.rotation.y = 0;
      this.cap.scale.setScalar(CAP_SCALE);
    }
  }

  surfaceHeight(layer: number): number {
    return LAYER_HEIGHTS[Math.min(NUM_LAYERS - 1, layer)] ?? 0.6;
  }
}

function dropCurve(t: number): number {
  // Falls from 1 → 0 with a small bounce at the end.
  if (t < 0.7) {
    const k = t / 0.7;
    return 1 - k * k;
  }
  const k = (t - 0.7) / 0.3;
  return Math.sin(k * Math.PI) * 0.06;
}

export { LAYER_HEIGHTS };
