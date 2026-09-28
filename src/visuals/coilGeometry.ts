import * as THREE from 'three';

let cached: THREE.BufferGeometry | null = null;

/**
 * A rolled ribbon: an Archimedean spiral strip with visible width and
 * thickness. Axis is +Y. Vertex colours shade the spiral faces lighter than
 * the wrapped surfaces so the curl reads clearly from a top-down camera.
 */
export function coilGeometry(): THREE.BufferGeometry {
  if (cached) return cached;
  const turns = 2.35;
  const samples = Math.round(turns * 26);
  const r0 = 0.028;
  const r1 = 0.165;
  const halfW = 0.085; // ribbon width along the axis
  const th = 0.03; // ribbon thickness
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const rings: number[][] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const a = t * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * t;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const ri = r - th / 2;
    const ro = r + th / 2;
    // Slight waviness along the width makes it feel like a soft candy ribbon.
    const wob = Math.sin(a * 1.5) * 0.006;
    const ring: number[] = [];
    const pts: [number, number, number, number][] = [
      [ro, halfW + wob, 0.86, 0], // outer-top
      [ro, -halfW + wob, 0.86, 0], // outer-bottom
      [ri, -halfW + wob, 0.8, 0], // inner-bottom
      [ri, halfW + wob, 0.8, 0], // inner-top
    ];
    for (const [rad, y, shade] of pts) {
      ring.push(pos.length / 3);
      pos.push(ca * rad, y, sa * rad);
      col.push(shade, shade, shade);
    }
    rings.push(ring);
  }
  // Wrapped surfaces (outer and inner walls).
  for (let i = 0; i < samples; i++) {
    const a = rings[i];
    const b = rings[i + 1];
    idx.push(a[0], b[0], a[1], a[1], b[0], b[1]); // outer wall
    idx.push(a[2], b[2], a[3], a[3], b[2], b[3]); // inner wall
  }
  // Spiral faces (top and bottom) get their own lighter vertices.
  const face = (k0: number, k1: number, shade: number) => {
    const base = pos.length / 3;
    for (let i = 0; i <= samples; i++) {
      for (const k of [k0, k1]) {
        const v = rings[i][k];
        pos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        col.push(shade, shade, shade);
      }
    }
    for (let i = 0; i < samples; i++) {
      const a0 = base + i * 2;
      const b0 = base + (i + 1) * 2;
      idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
    }
  };
  face(3, 0, 1.08); // top spiral face
  face(1, 2, 0.95); // bottom spiral face
  // End caps.
  const cap = (ring: number[]) => idx.push(ring[0], ring[1], ring[2], ring[0], ring[2], ring[3]);
  cap(rings[0]);
  cap(rings[samples]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  cached = g;
  return g;
}

let coilMat: THREE.MeshStandardMaterial | null = null;
export function coilMaterial(): THREE.MeshStandardMaterial {
  if (!coilMat) coilMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0, side: THREE.DoubleSide });
  return coilMat;
}
