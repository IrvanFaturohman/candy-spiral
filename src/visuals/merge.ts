import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const KEEP_ATTRS = new Set(['position', 'normal', 'uv']);
const bakedMats = new Map<string, THREE.MeshStandardMaterial>();

/** Plain, untextured, opaque toy material whose colour can live in vertex colours. */
function bakeable(m: THREE.Material): m is THREE.MeshStandardMaterial {
  if (!(m instanceof THREE.MeshStandardMaterial) || m instanceof THREE.MeshPhysicalMaterial) return false;
  if (m.map || m.emissiveMap || m.transparent || m.vertexColors || m.side !== THREE.FrontSide) return false;
  return m.emissive.getHex() === 0 || m.emissiveIntensity === 0;
}

function bakedMaterial(roughness: number): THREE.MeshStandardMaterial {
  const key = roughness.toFixed(1);
  let m = bakedMats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: Number(key), metalness: 0 });
    bakedMats.set(key, m);
  }
  return m;
}

function prepared(m: THREE.Mesh, color?: THREE.Color): THREE.BufferGeometry {
  m.updateMatrix();
  let g = m.geometry.clone();
  if (g.index) {
    const ni = g.toNonIndexed();
    g.dispose();
    g = ni;
  }
  for (const name of Object.keys(g.attributes)) if (!KEEP_ATTRS.has(name)) g.deleteAttribute(name);
  g.clearGroups();
  g.applyMatrix4(m.matrix);
  if (color) {
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = color.r;
      arr[i * 3 + 1] = color.g;
      arr[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return g;
}

/**
 * Merge the direct, static Mesh children of `parent` to cut draw calls.
 * - Plain toy materials are baked into vertex colours and merged per roughness.
 * - Other meshes are merged only with meshes that share their exact material.
 * Animated parts are excluded via `keep`; groups and instanced meshes are left
 * alone. Source geometries are shared cache entries, so only temporary clones
 * are disposed.
 */
export function mergeStaticChildren(parent: THREE.Object3D, keep: (m: THREE.Mesh) => boolean = () => false): void {
  const buckets = new Map<string, { meshes: THREE.Mesh[]; bake: boolean; roughness: number }>();
  for (const c of parent.children) {
    if (!(c instanceof THREE.Mesh) || c instanceof THREE.InstancedMesh) continue;
    if (Array.isArray(c.material) || c.children.length > 0 || !c.visible || keep(c)) continue;
    if (!c.geometry.getAttribute('uv') || !c.geometry.getAttribute('normal')) continue;
    const mat = c.material as THREE.Material;
    const bake = bakeable(mat);
    // Two roughness buckets keep the look (glossy candy vs matte toy plastic) with fewer draws.
    const rough = bake ? ((mat as THREE.MeshStandardMaterial).roughness < 0.45 ? 0.35 : 0.6) : 0;
    const key = bake ? `bake|${rough}|${c.receiveShadow}|${c.renderOrder}` : `${mat.uuid}|${c.receiveShadow}|${c.renderOrder}`;
    const b = buckets.get(key) ?? { meshes: [], bake, roughness: rough };
    b.meshes.push(c);
    buckets.set(key, b);
  }
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    const geos = b.meshes.map((m) => prepared(m, b.bake ? (m.material as THREE.MeshStandardMaterial).color : undefined));
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const first = b.meshes[0];
    const mesh = new THREE.Mesh(merged, b.bake ? bakedMaterial(b.roughness) : first.material);
    mesh.castShadow = b.meshes.some((m) => m.castShadow);
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    parent.add(mesh);
    for (const m of b.meshes) parent.remove(m);
  }
}
