import * as THREE from 'three';
import { FX, PALETTE } from '../game/config';

interface Particle {
  alive: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  rot: THREE.Euler;
  rv: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  color: THREE.Color;
  bounced: boolean;
}

interface Pulse {
  mesh: THREE.Mesh;
  t: number;
  dur: number;
  r0: number;
  r1: number;
}

interface Star {
  alive: boolean;
  p: THREE.Vector3;
  t: number;
  dur: number;
  size: number;
  vy: number;
}

const CANDY = [PALETTE.strawberry, PALETTE.lemon, PALETTE.mint, PALETTE.blueberry, PALETTE.grape, PALETTE.orange, '#FFFFFF'];

function starGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 1 : 0.45;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return new THREE.ShapeGeometry(s);
}

/** Pooled sprinkles, ring pulses and star sparkles. Everything is capped. */
export class Effects {
  readonly group = new THREE.Group();
  private sprinkles: THREE.InstancedMesh;
  private parts: Particle[] = [];
  private pulses: Pulse[] = [];
  private stars: THREE.InstancedMesh;
  private starPool: Star[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private camQuat = new THREE.Quaternion();
  scale = 1; // reduced by quality/reduced motion

  constructor() {
    const geo = new THREE.CapsuleGeometry(0.018, 0.06, 2, 6);
    this.sprinkles = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.4 }), FX.maxSprinkles);
    this.sprinkles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(FX.maxSprinkles * 3), 3);
    this.sprinkles.frustumCulled = false;
    this.sprinkles.count = 0;
    this.group.add(this.sprinkles);
    for (let i = 0; i < FX.maxSprinkles; i++)
      this.parts.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), rv: new THREE.Vector3(), life: 0, max: 1, size: 1, color: new THREE.Color(), bounced: false });
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.group.add(mesh);
      this.pulses.push({ mesh, t: 1, dur: 0.45, r0: 1, r1: 1 });
    }
    this.stars = new THREE.InstancedMesh(starGeometry(), new THREE.MeshBasicMaterial({ color: '#FFE68A', transparent: true, depthWrite: false, side: THREE.DoubleSide }), 40);
    this.stars.frustumCulled = false;
    this.stars.count = 0;
    this.group.add(this.stars);
    for (let i = 0; i < 40; i++) this.starPool.push({ alive: false, p: new THREE.Vector3(), t: 0, dur: 0.5, size: 0.1, vy: 0.5 });
  }

  get particleCount(): number {
    return this.sprinkles.count;
  }

  setCamera(cam: THREE.Camera): void {
    this.camQuat.copy(cam.quaternion);
  }

  burst(x: number, y: number, z: number, count: number, opts: { colors?: string[]; speed?: number; up?: number; size?: number; life?: number } = {}): void {
    const n = Math.max(1, Math.round(count * this.scale));
    const colors = opts.colors ?? CANDY;
    for (let i = 0; i < n; i++) {
      const pt = this.parts.find((pp) => !pp.alive);
      if (!pt) return;
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed ?? 1.6) * (0.5 + Math.random() * 0.7);
      pt.alive = true;
      pt.p.set(x, y, z);
      pt.v.set(Math.cos(a) * sp, (opts.up ?? 2.4) * (0.6 + Math.random() * 0.6), Math.sin(a) * sp);
      pt.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      pt.rv.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
      pt.max = (opts.life ?? 0.8) * (0.7 + Math.random() * 0.5);
      pt.life = pt.max;
      pt.size = (opts.size ?? 1) * (0.8 + Math.random() * 0.5);
      pt.color.set(colors[Math.floor(Math.random() * colors.length)]);
      pt.bounced = false;
    }
  }

  pulse(x: number, y: number, z: number, r0: number, r1: number, color: THREE.ColorRepresentation, dur = 0.45): void {
    const p = this.pulses.find((pp) => pp.t >= 1) ?? this.pulses[0];
    p.t = 0;
    p.dur = dur;
    p.r0 = r0;
    p.r1 = r1;
    p.mesh.position.set(x, y, z);
    (p.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    p.mesh.visible = true;
  }

  sparkle(x: number, y: number, z: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const s = this.starPool.find((st) => !st.alive);
      if (!s) return;
      s.alive = true;
      s.p.set(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.4);
      s.t = 0;
      s.dur = 0.35 + Math.random() * 0.15;
      s.size = 0.07 + Math.random() * 0.06;
      s.vy = 0.6 + Math.random() * 0.5;
    }
  }

  update(dt: number): void {
    let n = 0;
    for (const pt of this.parts) {
      if (!pt.alive) continue;
      pt.life -= dt;
      if (pt.life <= 0) {
        pt.alive = false;
        continue;
      }
      pt.v.y -= 9 * dt;
      pt.p.addScaledVector(pt.v, dt);
      if (pt.p.y < 0.02) {
        pt.p.y = 0.02;
        if (!pt.bounced) {
          pt.v.y = -pt.v.y * 0.35;
          pt.v.x *= 0.5;
          pt.v.z *= 0.5;
          pt.bounced = true;
        } else {
          pt.v.set(0, 0, 0);
          pt.rv.multiplyScalar(0.9);
        }
      }
      pt.rot.x += pt.rv.x * dt;
      pt.rot.y += pt.rv.y * dt;
      pt.rot.z += pt.rv.z * dt;
      const fade = Math.min(1, pt.life / (pt.max * 0.3));
      this.q.setFromEuler(pt.rot);
      this.m.compose(pt.p, this.q, this.s.setScalar(pt.size * fade));
      this.sprinkles.setMatrixAt(n, this.m);
      this.sprinkles.setColorAt(n, pt.color);
      n++;
    }
    this.sprinkles.count = n;
    this.sprinkles.instanceMatrix.needsUpdate = true;
    if (this.sprinkles.instanceColor) this.sprinkles.instanceColor.needsUpdate = true;

    for (const p of this.pulses) {
      if (p.t >= 1) continue;
      p.t = Math.min(1, p.t + dt / p.dur);
      const e = 1 - Math.pow(1 - p.t, 3);
      const r = p.r0 + (p.r1 - p.r0) * e;
      p.mesh.scale.set(r, r, 1);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - p.t);
      if (p.t >= 1) p.mesh.visible = false;
    }

    let sn = 0;
    for (const s of this.starPool) {
      if (!s.alive) continue;
      s.t += dt / s.dur;
      if (s.t >= 1) {
        s.alive = false;
        continue;
      }
      s.p.y += s.vy * dt;
      const k = Math.sin(s.t * Math.PI);
      this.m.compose(s.p, this.camQuat, this.s.setScalar(s.size * k));
      this.stars.setMatrixAt(sn++, this.m);
    }
    this.stars.count = sn;
    this.stars.instanceMatrix.needsUpdate = true;
  }
}
