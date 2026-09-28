import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Shared, cached materials/geometries. Nothing here is disposed per-object:
// these are long-lived and reused across the whole session.

const mats = new Map<string, THREE.Material>();

/** Soft plastic toy material (matte-ish, gentle highlight). */
export function toy(color: THREE.ColorRepresentation, rough = 0.55): THREE.MeshStandardMaterial {
  const key = `toy-${new THREE.Color(color).getHexString()}-${rough}`;
  let m = mats.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
    mats.set(key, m);
  }
  return m;
}

/** Glossy candy: lower roughness for a soft sugar highlight, never metallic. */
export function candy(color: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  return toy(color, 0.32);
}

export function unlit(color: THREE.ColorRepresentation, opacity = 1): THREE.MeshBasicMaterial {
  const key = `unlit-${new THREE.Color(color).getHexString()}-${opacity}`;
  let m = mats.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
    mats.set(key, m);
  }
  return m;
}

const geos = new Map<string, THREE.BufferGeometry>();

export function roundedBox(w: number, h: number, d: number, r = 0.08, seg = 3): THREE.BufferGeometry {
  const key = `rb-${w}-${h}-${d}-${r}-${seg}`;
  let g = geos.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 1e-3));
    geos.set(key, g);
  }
  return g;
}

export function sphere(r: number, w = 20, h = 14): THREE.BufferGeometry {
  const key = `sp-${r}-${w}-${h}`;
  let g = geos.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(r, w, h);
    geos.set(key, g);
  }
  return g;
}

export function cylinder(rt: number, rb: number, h: number, seg = 20): THREE.BufferGeometry {
  const key = `cy-${rt}-${rb}-${h}-${seg}`;
  let g = geos.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rt, rb, h, seg);
    geos.set(key, g);
  }
  return g;
}

export function capsule(r: number, len: number): THREE.BufferGeometry {
  const key = `ca-${r}-${len}`;
  let g = geos.get(key);
  if (!g) {
    g = new THREE.CapsuleGeometry(r, len, 6, 12);
    geos.set(key, g);
  }
  return g;
}

export function torus(r: number, tube: number, arc = Math.PI * 2): THREE.BufferGeometry {
  const key = `to-${r}-${tube}-${arc}`;
  let g = geos.get(key);
  if (!g) {
    g = new THREE.TorusGeometry(r, tube, 8, 28, arc);
    geos.set(key, g);
  }
  return g;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = false;
  return m;
}

export function place<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, parent?: THREE.Object3D): T {
  o.position.set(x, y, z);
  parent?.add(o);
  return o;
}
