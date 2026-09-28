import * as THREE from 'three';
import { mergeStaticChildren } from '../visuals/merge';
import { CART, CONTRACTS, PALETTE } from '../game/config';
import { angleDiff } from '../game/context';
import type { CargoItem } from '../game/types';
import { candyStripeTexture } from '../visuals/textures';
import { coilGeometry, coilMaterial } from '../visuals/coilGeometry';
import { cylinder, mesh, roundedBox, sphere, toy, torus } from '../visuals/materials';

const SLOTS: [number, number, number][] = [];
for (let layer = 0; layer < 2; layer++)
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 3; col++) SLOTS.push([(col - 1) * 0.25, 0.1 + layer * 0.15, (row - 0.5) * 0.24 + (layer ? 0.04 : 0)]);

export interface CartPose {
  x: number;
  z: number;
  heading: number;
  speed: number;
  odometer: number;
  cargo: CargoItem[];
  capacity: number;
  capacityLevel: number;
  speedLevel: number;
  intakeLevel: number;
  collecting: boolean;
  unloading: boolean;
  autopilot: boolean;
  autopilotWaiting: boolean;
  highlight: boolean;
  boardProgress: number; // 0..1 while the chef waits next to the cart
}

/** Stubby cream-teal cart with a striped front drum and a see-through rear bin. */
export class CandyCart {
  readonly root = new THREE.Group();
  private chassis = new THREE.Group();
  private body = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private drum: THREE.Mesh;
  private drumSpin = 0;
  private drumSpeed = 0;
  private bin = new THREE.Group();
  private binRim: THREE.Mesh[] = [];
  private coils: THREE.InstancedMesh;
  private coilPop: number[] = new Array(12).fill(1);
  private shownCoils = 0;
  private susp = 0;
  private suspVel = 0;
  private roll = 0;
  private pitch = 0;
  private lastSpeed = 0;
  private lastHeading = 0;
  private beacon: THREE.Group;
  private beaconLight: THREE.Mesh;
  private fullPop = 0;
  private upgradePopT = 0;
  private intakeArms: THREE.Group;
  private ring: THREE.Mesh;
  private ringFill: THREE.Mesh;
  readonly seatY = 0.5;

  constructor() {
    this.root.add(this.chassis);
    this.chassis.add(this.body);
    const teal = toy(PALETTE.teal, 0.45);
    const cream = toy(PALETTE.cream, 0.5);
    const coral = toy(PALETTE.coral, 0.45);
    const plum = toy(PALETTE.wheel, 0.6);

    // Wheels (big, chunky).
    for (const [x, z] of [
      [-0.54, 0.44],
      [0.54, 0.44],
      [-0.54, -0.46],
      [0.54, -0.46],
    ]) {
      const g = new THREE.Group();
      const tire = mesh(cylinder(0.21, 0.21, 0.17, 20), plum);
      tire.rotation.z = Math.PI / 2;
      const cap = mesh(cylinder(0.1, 0.1, 0.19, 14), toy(PALETTE.lemon, 0.4), false);
      cap.rotation.z = Math.PI / 2;
      const nub = mesh(roundedBox(0.2, 0.05, 0.05, 0.02), cream, false);
      g.add(tire, cap, nub);
      mergeStaticChildren(g);
      g.position.set(x, 0.21, z);
      this.root.add(g);
      this.wheels.push(g);
    }

    // Body shell.
    const lower = mesh(roundedBox(1.02, 0.24, 1.36, 0.1), teal);
    lower.position.y = 0.3;
    const hood = mesh(roundedBox(0.98, 0.18, 0.46, 0.09), cream);
    hood.position.set(0, 0.47, 0.38);
    const stripe = mesh(roundedBox(1.04, 0.05, 1.38, 0.025), cream, false);
    stripe.position.y = 0.33;
    const bumperF = mesh(roundedBox(1.12, 0.15, 0.16, 0.07), coral);
    bumperF.position.set(0, 0.24, 0.7);
    const bumperR = mesh(roundedBox(1.08, 0.14, 0.14, 0.06), coral);
    bumperR.position.set(0, 0.24, -0.72);
    this.body.add(lower, hood, stripe, bumperF, bumperR);
    // Headlights.
    for (const x of [-0.3, 0.3]) {
      const l = mesh(sphere(0.065, 12, 10), new THREE.MeshStandardMaterial({ color: '#FFF3B0', emissive: '#FFE27A', emissiveIntensity: 0.55, roughness: 0.3 }), false);
      l.position.set(x, 0.47, 0.61);
      l.scale.set(1, 1, 0.6);
      this.body.add(l);
    }
    // Seat + backrest + steering wheel.
    const seat = mesh(roundedBox(0.4, 0.1, 0.32, 0.05), coral);
    seat.position.set(0, 0.46, -0.04);
    const back = mesh(roundedBox(0.4, 0.3, 0.09, 0.045), coral);
    back.position.set(0, 0.6, -0.2);
    const column = mesh(cylinder(0.025, 0.025, 0.24, 8), plum, false);
    column.position.set(0, 0.6, 0.24);
    column.rotation.x = -0.6;
    const wheel = mesh(torus(0.1, 0.024), plum, false);
    wheel.position.set(0, 0.7, 0.18);
    wheel.rotation.x = -0.9;
    this.body.add(seat, back, column, wheel);

    // Front collection drum on two arms, striped like candy.
    this.intakeArms = new THREE.Group();
    this.intakeArms.position.set(0, 0.22, 0.84);
    const armGeo = roundedBox(0.07, 0.1, 0.34, 0.03);
    for (const x of [-0.52, 0.52]) {
      const arm = mesh(armGeo, teal, false);
      arm.position.set(x, 0.02, -0.1);
      this.intakeArms.add(arm);
    }
    const drumMat = new THREE.MeshStandardMaterial({ map: candyStripeTexture(PALETTE.strawberry, PALETTE.cream, 5), roughness: 0.4 });
    this.drum = mesh(cylinder(0.16, 0.16, 0.98, 20), drumMat);
    this.drum.rotation.z = Math.PI / 2;
    this.intakeArms.add(this.drum);
    const lip = mesh(roundedBox(0.98, 0.04, 0.2, 0.02), cream, false);
    lip.position.set(0, -0.16, -0.08);
    lip.rotation.x = 0.25;
    this.intakeArms.add(lip);
    this.body.add(this.intakeArms);

    // Rear bin: frame + limited transparency + visible coils.
    this.bin.position.set(0, 0.42, -0.44);
    this.body.add(this.bin);
    const binFloor = mesh(roundedBox(0.86, 0.05, 0.58, 0.02), cream, false);
    binFloor.position.y = 0.02;
    this.bin.add(binFloor);
    const post = roundedBox(0.07, 0.44, 0.07, 0.03);
    for (const [x, z] of [
      [-0.43, 0.29],
      [0.43, 0.29],
      [-0.43, -0.29],
      [0.43, -0.29],
    ]) {
      const p = mesh(post, teal, false);
      p.position.set(x, 0.22, z);
      this.bin.add(p);
    }
    const rimX = roundedBox(0.94, 0.06, 0.07, 0.03);
    const rimZ = roundedBox(0.07, 0.06, 0.64, 0.03);
    for (const [geo, x, z] of [
      [rimX, 0, 0.29],
      [rimX, 0, -0.29],
      [rimZ, -0.43, 0],
      [rimZ, 0.43, 0],
    ] as const) {
      const r = mesh(geo, toy(PALETTE.teal, 0.45), false);
      r.position.set(x, 0.44, z);
      this.bin.add(r);
      this.binRim.push(r);
    }
    const glass = new THREE.MeshStandardMaterial({ color: '#E8FBFF', transparent: true, opacity: 0.26, roughness: 0.15, depthWrite: false, side: THREE.DoubleSide });
    const panelX = new THREE.PlaneGeometry(0.82, 0.38);
    const panelZ = new THREE.PlaneGeometry(0.54, 0.38);
    for (const [geo, x, z, ry] of [
      [panelX, 0, 0.285, 0],
      [panelX, 0, -0.285, 0],
      [panelZ, -0.425, 0, Math.PI / 2],
      [panelZ, 0.425, 0, Math.PI / 2],
    ] as const) {
      const p = new THREE.Mesh(geo, glass);
      p.position.set(x, 0.23, z);
      p.rotation.y = ry;
      p.renderOrder = 3;
      this.bin.add(p);
    }
    this.coils = new THREE.InstancedMesh(coilGeometry(), coilMaterial(), SLOTS.length);
    this.coils.count = 0;
    this.coils.castShadow = false;
    this.coils.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SLOTS.length * 3), 3);
    this.bin.add(this.coils);

    mergeStaticChildren(this.body);
    mergeStaticChildren(this.intakeArms, (m) => m === this.drum);
    mergeStaticChildren(this.bin, (m) => this.binRim.includes(m as THREE.Mesh));

    // Autopilot beacon.
    this.beacon = new THREE.Group();
    const stick = mesh(cylinder(0.018, 0.018, 0.34, 6), plum, false);
    stick.position.y = 0.17;
    this.beaconLight = mesh(sphere(0.07, 12, 10), new THREE.MeshStandardMaterial({ color: '#8FF5C8', emissive: '#4BE3A4', emissiveIntensity: 0.9 }), false);
    this.beaconLight.position.y = 0.37;
    this.beacon.add(stick, this.beaconLight);
    this.beacon.position.set(0.36, 0.62, -0.2);
    this.body.add(this.beacon);

    // Hop-in ring: faint track + an arc that fills while the chef waits beside the cart.
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.1, 48), new THREE.MeshBasicMaterial({ color: PALETTE.lemon, transparent: true, opacity: 0.45, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    this.root.add(this.ring);
    this.ringFill = new THREE.Mesh(new THREE.RingGeometry(0.98, 1.14, 48, 1, Math.PI / 2, Math.PI * 2), new THREE.MeshBasicMaterial({ color: PALETTE.coral, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
    this.ringFill.rotation.x = -Math.PI / 2;
    this.ringFill.position.y = 0.025;
    this.ringFill.visible = false;
    this.root.add(this.ringFill);

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.75), new THREE.MeshBasicMaterial({ color: PALETTE.plum, transparent: true, opacity: 0.16, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.011;
    this.root.add(shadow);
  }

  /** Bin-space → world position for animations targeting the bin. */
  binWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.bin.getWorldPosition(out).add(new THREE.Vector3(0, 0.25, 0));
  }

  drumWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    return this.drum.getWorldPosition(out);
  }

  kick(amount: number): void {
    this.suspVel -= amount;
  }

  onFull(): void {
    this.fullPop = 1;
  }

  upgradePop(): void {
    this.upgradePopT = 1;
  }

  update(p: CartPose, dt: number, time: number, reducedMotion: boolean): void {
    const motion = reducedMotion ? 0.35 : 1;
    this.root.position.set(p.x, 0, p.z);
    this.root.rotation.y = Math.PI / 2 - p.heading;

    // Wheels spin with distance travelled.
    for (const w of this.wheels) w.rotation.x = p.odometer / 0.21;

    // Drum: fast while collecting, slow idle while autopilot waits, still otherwise.
    const target = p.collecting ? 22 : p.speed > 0.2 ? 6 + p.speed * 2 : p.autopilot && p.autopilotWaiting ? 1.6 : 0;
    this.drumSpeed += (target - this.drumSpeed) * Math.min(1, dt * 6);
    this.drumSpin += this.drumSpeed * dt;
    this.drum.rotation.x = this.drumSpin;

    // Suspension spring + lean from acceleration and turning.
    const accel = dt > 0 ? (p.speed - this.lastSpeed) / dt : 0;
    const turnRate = dt > 0 ? angleDiff(this.lastHeading, p.heading) / dt : 0;
    this.lastSpeed = p.speed;
    this.lastHeading = p.heading;
    const k = 180;
    const damp = 14;
    this.suspVel += (-k * this.susp - damp * this.suspVel) * dt;
    this.susp += this.suspVel * dt;
    const pitchT = THREE.MathUtils.clamp(-accel * 0.012, -0.06, 0.06) * motion;
    const rollT = THREE.MathUtils.clamp(-turnRate * p.speed * 0.01, -0.06, 0.06) * motion;
    this.pitch += (pitchT - this.pitch) * Math.min(1, dt * 8);
    this.roll += (rollT - this.roll) * Math.min(1, dt * 8);
    this.body.position.y = this.susp * motion + (p.speed > 0.2 ? Math.sin(time * 22) * 0.006 * motion : 0);
    this.body.rotation.x = this.pitch;
    this.body.rotation.z = this.roll;

    // Bin grows a little with capacity upgrades (kept inside the collider).
    const binScale = 1 + p.capacityLevel * 0.07;
    let pop = 1;
    if (this.upgradePopT > 0) {
      this.upgradePopT = Math.max(0, this.upgradePopT - dt * 2.4);
      pop = 1 + Math.sin((1 - this.upgradePopT) * Math.PI) * 0.08 * motion;
    }
    this.bin.scale.set(pop, binScale * pop, (1 + p.capacityLevel * 0.03) * pop);
    this.intakeArms.scale.set(1 + p.intakeLevel * 0.04, 1 + p.intakeLevel * 0.06, 1);

    // Coils fill the bin from the mass ratio; colours follow the cargo order.
    let mass = 0;
    for (const it of p.cargo) mass += it.mass;
    const ratio = p.capacity > 0 ? Math.min(1, mass / p.capacity) : 0;
    const count = mass > 1e-6 ? Math.max(1, Math.round(ratio * CART.visualCoils)) : 0;
    if (count > this.shownCoils) for (let i = this.shownCoils; i < count; i++) this.coilPop[i] = 0;
    this.shownCoils = count;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const [x, y, z] = SLOTS[i];
      this.coilPop[i] = Math.min(1, this.coilPop[i] + dt / 0.22);
      const sp = this.coilPop[i];
      const sc = 0.95 * (reducedMotion ? 1 : easeOutBack(sp));
      e.set(0.9 + (i % 3) * 0.3, i * 1.3, 0.2 * (i % 2));
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sc, sc, sc));
      this.coils.setMatrixAt(i, m);
      const item = p.cargo[Math.min(p.cargo.length - 1, Math.floor((i / Math.max(1, count)) * p.cargo.length))];
      col.set(item ? CONTRACTS[item.defId].layerColors[item.layer] : PALETTE.strawberry);
      this.coils.setColorAt(i, col);
    }
    this.coils.count = count;
    this.coils.instanceMatrix.needsUpdate = true;
    if (this.coils.instanceColor) this.coils.instanceColor.needsUpdate = true;

    // Rim turns coral when nearly full; pops once when full.
    const nearFull = ratio >= CART.nearFullRatio;
    const rimMat = nearFull ? toy(ratio >= 0.999 ? PALETTE.strawberry : PALETTE.orange, 0.45) : toy(PALETTE.teal, 0.45);
    for (const r of this.binRim) r.material = rimMat;
    if (this.fullPop > 0) {
      this.fullPop = Math.max(0, this.fullPop - dt / 0.15);
      const s = 1 + Math.sin((1 - this.fullPop) * Math.PI) * 0.12 * motion;
      this.bin.scale.multiplyScalar(s);
    }

    this.beacon.visible = p.autopilot;
    if (p.autopilot) {
      const blink = 0.5 + 0.5 * Math.sin(time * 5);
      (this.beaconLight.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + blink * 0.8;
    }
    this.ring.visible = p.highlight;
    if (p.highlight) {
      const s = 1 + Math.sin(time * 5) * 0.05 * motion;
      this.ring.scale.setScalar(s);
    }
    const bp = Math.min(1, Math.max(0, p.boardProgress));
    this.ringFill.visible = bp > 0.01;
    if (this.ringFill.visible) (this.ringFill.geometry as THREE.BufferGeometry).setDrawRange(0, Math.ceil(bp * 48) * 6);
  }
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
