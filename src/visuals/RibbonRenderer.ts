import * as THREE from 'three';

const K = 24; // samples along the ribbon
const RING = 6; // cross-section points

export interface RibbonInput {
  active: boolean; // tool is at the surface
  cx: number; // candy centre
  cz: number;
  angle: number; // world angle of the contact
  radius: number; // current surface radius at the contact
  height: number; // candy height at the contact
  color: THREE.ColorRepresentation;
  fill: number; // 0..1 buffer toward the next roll
  streak: number; // seconds of continuous cutting (cosmetic)
}

/**
 * The peeled strip. It leaves the surface at the blade tangentially (in the
 * direction the candy spins), then curls outward into a coil that grows with
 * the peeler's buffer. It is purely visual — the buffer owns the mass.
 */
export class Ribbon {
  readonly mesh: THREE.Mesh;
  private geo = new THREE.BufferGeometry();
  private pos = new Float32Array(K * RING * 3);
  private col = new Float32Array(K * RING * 3);
  private len = 0;
  private color = new THREE.Color();
  private target = new THREE.Color();
  private snapT = 1;
  readonly curlCenter = new THREE.Vector3();
  width = 0.26;

  constructor() {
    const idx: number[] = [];
    for (let k = 0; k < K - 1; k++) {
      for (let r = 0; r < RING; r++) {
        const a = k * RING + r;
        const b = k * RING + ((r + 1) % RING);
        const c = (k + 1) * RING + r;
        const d = (k + 1) * RING + ((r + 1) % RING);
        idx.push(a, c, b, b, c, d);
      }
    }
    // End caps.
    for (const k of [0, K - 1]) {
      const o = k * RING;
      idx.push(o, o + 1, o + 2, o, o + 2, o + 5, o + 2, o + 3, o + 5, o + 3, o + 4, o + 5);
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.33, metalness: 0, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** The strip is cut: shrink back to a stub (the coil flies off as a roll). */
  snap(): void {
    this.snapT = 0;
    this.len = Math.min(this.len, 0.22);
  }

  update(inp: RibbonInput, dt: number): void {
    this.target.set(inp.color);
    if (!this.mesh.visible) this.color.copy(this.target);
    this.color.lerp(this.target, Math.min(1, dt / 0.25));
    const goal = inp.active ? 0.62 + 0.95 * Math.min(1, inp.fill) + Math.min(0.2, inp.streak * 0.04) : 0;
    const rate = goal > this.len ? 10 : 12;
    this.len += (goal - this.len) * Math.min(1, dt * rate);
    this.snapT = Math.min(1, this.snapT + dt / 0.12);
    if (this.len < 0.04) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.build(inp);
  }

  private build(inp: RibbonInput): void {
    const ca = Math.cos(inp.angle);
    const sa = Math.sin(inp.angle);
    // Frame at the contact: n = outward (toward the peeler), s = spin direction, up = +Y.
    const nx = ca;
    const nz = sa;
    const sx = -sa;
    const sz = ca;
    // The strip leaves the surface at the blade, runs along the candy wall far
    // enough to clear the peeler's body, then curls outward over the floor.
    // On the far side of the candy it is lifted above the rim so it stays visible.
    const baseX = inp.cx + ca * (inp.radius + 0.01) + sx * 0.06;
    const baseZ = inp.cz + sa * (inp.radius + 0.01) + sz * 0.06;
    const back = Math.max(0, Math.min(1, (-sa + 0.15) / 0.6));
    const yb = inp.height * 0.28 * (1 - back) + (inp.height + 0.03) * back;
    const L = this.len;
    const straight = Math.min(L * 0.5, 0.36);
    const rho0 = 0.15;
    const ds = L / (K - 1);
    let px = baseX;
    let pz = baseZ;
    let psi = 0; // heading measured from s toward +n (outward)
    const w = this.width;
    const t = 0.024;
    const accent = new THREE.Color(1, 0.97, 0.9);
    const edge = this.color;
    let cxSum = 0;
    let czSum = 0;
    let cn = 0;
    for (let k = 0; k < K; k++) {
      const u = k * ds;
      if (k > 0) {
        if (u > straight) {
          const curlU = (u - straight) / Math.max(0.2, L - straight);
          const rho = rho0 * (1 - 0.58 * curlU);
          psi += ds / rho;
        }
        const tx = sx * Math.cos(psi) + nx * Math.sin(psi);
        const tz = sz * Math.cos(psi) + nz * Math.sin(psi);
        px += tx * ds;
        pz += tz * ds;
      }
      const tx = sx * Math.cos(psi) + nx * Math.sin(psi);
      const tz = sz * Math.cos(psi) + nz * Math.sin(psi);
      // Horizontal normal of the strip (perpendicular to the tangent).
      const bx = -tz;
      const bz = tx;
      const lift = Math.max(0, u - straight) * 0.12; // gentle helix so it doesn't self-intersect
      if (u > straight) {
        cxSum += px;
        czSum += pz;
        cn++;
      }
      // Width is vertical: the strip stands on the candy top like a shaving.
      const pts: [number, number, number][] = [
        [-t, 0, 0],
        [-t, 0.5, 1],
        [-t, 1, 0],
        [t, 1, 0],
        [t, 0.5, 1],
        [t, 0, 0],
      ];
      const wave = 1 + 0.08 * Math.sin(u * 22);
      for (let r = 0; r < RING; r++) {
        const [off, dy, isMid] = pts[r];
        const o = (k * RING + r) * 3;
        this.pos[o] = px + bx * off;
        this.pos[o + 1] = yb + lift + dy * w * wave;
        this.pos[o + 2] = pz + bz * off;
        const mix = isMid ? 0.55 : 0;
        this.col[o] = edge.r * (1 - mix) + accent.r * mix;
        this.col[o + 1] = edge.g * (1 - mix) + accent.g * mix;
        this.col[o + 2] = edge.b * (1 - mix) + accent.b * mix;
      }
    }
    if (cn > 0) this.curlCenter.set(cxSum / cn, yb + w * 0.6, czSum / cn);
    else this.curlCenter.set(px, yb + w * 0.5, pz);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
