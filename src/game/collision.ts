import { WORLD } from './config';
import type { ContractInstance } from './types';
import { maxSurfaceRadiusInSpan, maxSurfaceRadius } from './state';

export interface Rect {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

export interface Contact {
  nx: number;
  nz: number;
}

/** Push a circle out of an axis-aligned rectangle. Returns the push normal or null. */
export function pushOutOfRect(p: { x: number; z: number }, radius: number, r: Rect): Contact | null {
  const cx = Math.max(r.x - r.hw, Math.min(p.x, r.x + r.hw));
  const cz = Math.max(r.z - r.hd, Math.min(p.z, r.z + r.hd));
  let dx = p.x - cx;
  let dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return null;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    const push = radius - d;
    dx /= d;
    dz /= d;
    p.x += dx * push;
    p.z += dz * push;
    return { nx: dx, nz: dz };
  }
  // Centre is inside the rectangle: exit through the nearest face.
  const left = p.x - (r.x - r.hw);
  const right = r.x + r.hw - p.x;
  const top = p.z - (r.z - r.hd);
  const bottom = r.z + r.hd - p.z;
  const m = Math.min(left, right, top, bottom);
  if (m === left) {
    p.x = r.x - r.hw - radius;
    return { nx: -1, nz: 0 };
  }
  if (m === right) {
    p.x = r.x + r.hw + radius;
    return { nx: 1, nz: 0 };
  }
  if (m === top) {
    p.z = r.z - r.hd - radius;
    return { nx: 0, nz: -1 };
  }
  p.z = r.z + r.hd + radius;
  return { nx: 0, nz: 1 };
}

/** Push a circle out of the candy source using the real radius around the contact angle. */
export function pushOutOfSource(p: { x: number; z: number }, radius: number, c: ContractInstance): Contact | null {
  const sx = WORLD.source.x;
  const sz = WORLD.source.z;
  let dx = p.x - sx;
  let dz = p.z - sz;
  let d = Math.hypot(dx, dz);
  if (d < 1e-6) {
    dx = 0;
    dz = 1;
    d = 1e-6;
  }
  const ang = Math.atan2(dz, dx);
  const half = Math.asin(Math.min(1, radius / Math.max(d, radius)));
  const R = maxSurfaceRadiusInSpan(c, ang, half);
  const minD = R + radius;
  if (d >= minD) return null;
  const nx = dx / d;
  const nz = dz / d;
  p.x = sx + nx * minD;
  p.z = sz + nz * minD;
  return { nx, nz };
}

export function clampToBounds(p: { x: number; z: number }, radius: number): Contact | null {
  const b = WORLD.bounds;
  let hit: Contact | null = null;
  if (p.x < b.minX + radius) {
    p.x = b.minX + radius;
    hit = { nx: 1, nz: 0 };
  } else if (p.x > b.maxX - radius) {
    p.x = b.maxX - radius;
    hit = { nx: -1, nz: 0 };
  }
  if (p.z < b.minZ + radius) {
    p.z = b.minZ + radius;
    hit = { nx: 0, nz: 1 };
  } else if (p.z > b.maxZ - radius) {
    p.z = b.maxZ - radius;
    hit = { nx: 0, nz: -1 };
  }
  return hit;
}

export function staticObstacles(): readonly Rect[] {
  return WORLD.obstacles;
}

/** Full collision resolution; removes velocity into every surface touched (slide). */
export function resolveCircle(
  p: { x: number; z: number },
  v: { vx: number; vz: number } | null,
  radius: number,
  c: ContractInstance,
): boolean {
  let touched = false;
  for (let iter = 0; iter < 3; iter++) {
    let any = false;
    const contacts: Contact[] = [];
    const s = pushOutOfSource(p, radius, c);
    if (s) contacts.push(s);
    for (const o of WORLD.obstacles) {
      const h = pushOutOfRect(p, radius, o);
      if (h) contacts.push(h);
    }
    const b = clampToBounds(p, radius);
    if (b) contacts.push(b);
    if (contacts.length) {
      any = true;
      touched = true;
      if (v) {
        for (const n of contacts) {
          const dot = v.vx * n.nx + v.vz * n.nz;
          if (dot < 0) {
            v.vx -= dot * n.nx;
            v.vz -= dot * n.nz;
          }
        }
      }
    }
    if (!any) break;
  }
  return touched;
}

/** Is a circle at (x, z) completely free of candy, obstacles and walls? */
export function isFree(x: number, z: number, radius: number, c: ContractInstance, sourceRadiusOverride?: number): boolean {
  const b = WORLD.bounds;
  if (x < b.minX + radius || x > b.maxX - radius || z < b.minZ + radius || z > b.maxZ - radius) return false;
  const d = Math.hypot(x - WORLD.source.x, z - WORLD.source.z);
  const R = sourceRadiusOverride ?? maxSurfaceRadiusInSpan(c, Math.atan2(z - WORLD.source.z, x - WORLD.source.x), Math.asin(Math.min(1, radius / Math.max(d, radius))));
  if (d < R + radius) return false;
  for (const o of WORLD.obstacles) {
    const cx = Math.max(o.x - o.hw, Math.min(x, o.x + o.hw));
    const cz = Math.max(o.z - o.hd, Math.min(z, o.z + o.hd));
    if ((x - cx) ** 2 + (z - cz) ** 2 < radius * radius) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Segment tests for the autopilot visibility graph.

export function segmentHitsCircle(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, r: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((cx - ax) * dx + (cz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + dx * t - cx;
  const pz = az + dz * t - cz;
  return px * px + pz * pz < r * r;
}

export function segmentHitsRect(ax: number, az: number, bx: number, bz: number, r: Rect, inflate: number): boolean {
  const minX = r.x - r.hw - inflate;
  const maxX = r.x + r.hw + inflate;
  const minZ = r.z - r.hd - inflate;
  const maxZ = r.z + r.hd + inflate;
  // Liang–Barsky clip.
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (!clip(-dx, ax - minX)) return false;
  if (!clip(dx, maxX - ax)) return false;
  if (!clip(-dz, az - minZ)) return false;
  if (!clip(dz, maxZ - az)) return false;
  return t0 <= t1;
}

export function segmentClear(ax: number, az: number, bx: number, bz: number, radius: number, c: ContractInstance): boolean {
  const R = maxSurfaceRadius(c) + radius + 0.04;
  if (segmentHitsCircle(ax, az, bx, bz, WORLD.source.x, WORLD.source.z, R)) return false;
  for (const o of WORLD.obstacles) if (segmentHitsRect(ax, az, bx, bz, o, radius + 0.04)) return false;
  return true;
}
