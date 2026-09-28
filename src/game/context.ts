import type { EventQueue } from './events';
import type { GameState } from './types';

/** Movement intent in world space. (dirX, dirZ) is normalised; mag ∈ [0, 1]. */
export interface SimInput {
  dirX: number;
  dirZ: number;
  mag: number;
}

export interface SimContext {
  state: GameState;
  events: EventQueue;
  input: SimInput;
}

export function expSmooth(dt: number, tau: number): number {
  return tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
