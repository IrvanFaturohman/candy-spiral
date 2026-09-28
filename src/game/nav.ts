import { MOVE, WORLD } from './config';
import { isFree, segmentClear } from './collision';
import type { ContractInstance } from './types';

export interface P2 {
  x: number;
  z: number;
}

let staticNodes: P2[] | null = null;

/** Waypoints: a ring around the candy plus a few floor nodes. */
export function navNodes(): P2[] {
  if (staticNodes) return staticNodes;
  const nodes: P2[] = [];
  const R = WORLD.source.radius + MOVE.cartRadius + 0.34;
  // The workshop is wide enough for the cart to circle the whole candy.
  for (let deg = 0; deg < 360; deg += 30) {
    const a = (deg * Math.PI) / 180;
    nodes.push({ x: WORLD.source.x + Math.cos(a) * R, z: WORLD.source.z + Math.sin(a) * R });
  }
  nodes.push(
    { x: WORLD.cartStandby.x, z: WORLD.cartStandby.z },
    { x: WORLD.unloadZone.x, z: WORLD.unloadZone.z },
    { x: WORLD.cartPark.x, z: WORLD.cartPark.z },
    { x: 0.3, z: 4.2 },
    { x: -2.2, z: 5.3 },
    { x: 1.0, z: 6.5 },
    { x: -4.0, z: 4.0 },
    { x: 6.2, z: 3.2 },
    { x: -1.2, z: 8.2 },
    { x: 6.3, z: 8.6 },
    { x: -6.0, z: 5.0 },
  );
  staticNodes = nodes;
  return nodes;
}

/** Dijkstra over the visibility graph. Returns waypoints after `from`, ending at `to`. */
export function findPath(c: ContractInstance, from: P2, to: P2): P2[] {
  const r = MOVE.cartRadius;
  if (segmentClear(from.x, from.z, to.x, to.z, r, c)) return [to];
  const nodes = navNodes().filter((n) => isFree(n.x, n.z, r, c));
  const all: P2[] = [from, ...nodes, to];
  const n = all.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[0] = 0;
  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u === -1 || dist[i] < dist[u])) u = i;
    if (u === -1 || dist[u] === Infinity) break;
    if (u === n - 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const a = all[u];
      const b = all[v];
      // The goal itself may hug an obstacle (e.g. a roll in a pocket): allow a slightly thinner test.
      const rr = v === n - 1 || u === 0 ? r * 0.8 : r;
      if (!segmentClear(a.x, a.z, b.x, b.z, rr, c)) continue;
      const d = dist[u] + Math.hypot(a.x - b.x, a.z - b.z);
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  if (prev[n - 1] === -1) return [to]; // no clean path; steering + sliding will do its best
  const path: P2[] = [];
  for (let v = n - 1; v > 0; v = prev[v]) path.unshift(all[v]);
  return path;
}
