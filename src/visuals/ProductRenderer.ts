import * as THREE from 'three';
import { CONTRACTS, PALETTE, type ContractDef } from '../game/config';
import { candyStripeTexture, swirlTexture } from './textures';

interface Part {
  mesh: THREE.InstancedMesh;
  local: THREE.Matrix4;
  wrapper?: boolean; // appears late in the forming animation
}

const CAP = 28;

function heartShape(): THREE.Shape {
  const s = new THREE.Shape();
  const k = 0.012;
  s.moveTo(0, -9 * k);
  s.bezierCurveTo(-2 * k, -6 * k, -11 * k, -2 * k, -10 * k, 4 * k);
  s.bezierCurveTo(-9 * k, 10 * k, -2 * k, 11 * k, 0, 6 * k);
  s.bezierCurveTo(2 * k, 11 * k, 9 * k, 10 * k, 10 * k, 4 * k);
  s.bezierCurveTo(11 * k, -2 * k, 2 * k, -6 * k, 0, -9 * k);
  return s;
}

/**
 * Instanced lollipops for the conveyor, the kiosk shelf and the machine outlet.
 * Each contract has its own product shape and colours.
 */
export class ProductRenderer {
  readonly group = new THREE.Group();
  private parts: Part[][] = [];
  private counts: number[] = [];
  private tmp = new THREE.Matrix4();
  private tmp2 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor() {
    for (const def of CONTRACTS) this.parts.push(this.buildDef(def));
    this.counts = CONTRACTS.map(() => 0);
  }

  private inst(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], local: THREE.Matrix4, wrapper = false): Part {
    const mesh = new THREE.InstancedMesh(geo, mat, CAP);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return { mesh, local, wrapper };
  }

  private buildDef(def: ContractDef): Part[] {
    const stickMat = new THREE.MeshStandardMaterial({ color: '#FFFDF6', roughness: 0.5 });
    const stickGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.26, 8);
    const stickLocal = new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0.24, 0.045, 0));
    if (def.productShape === 'swirl') {
      const top = new THREE.MeshStandardMaterial({ map: swirlTexture(def.primary, def.secondary, def.accent), roughness: 0.3 });
      const side = new THREE.MeshStandardMaterial({ color: def.primary, roughness: 0.3 });
      const head = new THREE.CylinderGeometry(0.17, 0.17, 0.07, 28);
      return [this.inst(head, [side, top, side], new THREE.Matrix4().makeTranslation(0, 0.05, 0)), this.inst(stickGeo, stickMat, stickLocal, true)];
    }
    if (def.productShape === 'twist') {
      const bodyMat = new THREE.MeshStandardMaterial({ map: candyStripeTexture(def.primary, def.secondary, 4, `twist-${def.id}`), roughness: 0.3 });
      const body = new THREE.SphereGeometry(0.12, 20, 14);
      const bodyLocal = new THREE.Matrix4().makeScale(1.45, 0.95, 1).premultiply(new THREE.Matrix4().makeTranslation(0, 0.11, 0));
      const wrapMat = new THREE.MeshStandardMaterial({ color: def.accent, roughness: 0.25, transparent: true, opacity: 0.85 });
      const cone = new THREE.ConeGeometry(0.09, 0.14, 12);
      const wl = new THREE.Matrix4().makeRotationZ(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0.24, 0.11, 0));
      const wr = new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(-0.24, 0.11, 0));
      return [this.inst(body, bodyMat, bodyLocal), this.inst(cone, wrapMat, wl, true), this.inst(cone, wrapMat, wr, true)];
    }
    // Heart lollipop.
    const heart = new THREE.ExtrudeGeometry(heartShape(), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 3, curveSegments: 16 });
    heart.center();
    const heartMat = new THREE.MeshStandardMaterial({ color: def.primary, roughness: 0.3, emissive: new THREE.Color(PALETTE.strawberry), emissiveIntensity: 0.06 });
    const heartLocal = new THREE.Matrix4().makeRotationX(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, 0.06, 0));
    const dot = new THREE.SphereGeometry(0.045, 12, 8);
    const dotMat = new THREE.MeshStandardMaterial({ color: def.secondary, roughness: 0.3 });
    const dotLocal = new THREE.Matrix4().makeScale(1, 0.5, 1).premultiply(new THREE.Matrix4().makeTranslation(-0.03, 0.1, -0.03));
    return [this.inst(heart, heartMat, heartLocal), this.inst(dot, dotMat, dotLocal), this.inst(stickGeo, stickMat, stickLocal, true)];
  }

  begin(): void {
    for (let i = 0; i < this.counts.length; i++) this.counts[i] = 0;
  }

  /** Add one product. `form` 0..1 animates the blank → product → wrapper sequence. */
  add(defId: number, x: number, y: number, z: number, rotY: number, scale: number, form = 1): void {
    const parts = this.parts[defId];
    const n = this.counts[defId];
    if (n >= CAP) return;
    this.counts[defId] = n + 1;
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), rotY);
    this.s.setScalar(scale);
    this.tmp.compose(this.v.set(x, y, z), this.q, this.s);
    for (const part of parts) {
      let k = 1;
      if (form < 1) k = part.wrapper ? smooth((form - 0.65) / 0.3) : 0.55 + 0.45 * smooth(form / 0.6);
      this.tmp2.copy(this.tmp).multiply(part.local);
      if (k < 1) this.tmp2.multiply(new THREE.Matrix4().makeScale(Math.max(0.001, k), Math.max(0.001, k), Math.max(0.001, k)));
      part.mesh.setMatrixAt(n, this.tmp2);
    }
  }

  end(): void {
    this.parts.forEach((parts, d) => {
      for (const p of parts) {
        p.mesh.count = this.counts[d];
        p.mesh.instanceMatrix.needsUpdate = true;
      }
    });
  }
}

function smooth(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
