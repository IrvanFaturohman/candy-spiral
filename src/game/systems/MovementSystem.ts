import { CART, MOVE, WORLD } from '../config';
import type { SimContext } from '../context';
import { angleDiff, expSmooth, lerpAngle } from '../context';
import { isFree, resolveCircle } from '../collision';
import { cartSpeed, upgradeValue } from '../state';
import type { GameState } from '../types';
import { flushPeeler } from './PeelingSystem';

export function seatPosition(state: GameState): { x: number; z: number } {
  const c = state.cart;
  return { x: c.x + Math.cos(c.heading) * CART.seatOffset, z: c.z + Math.sin(c.heading) * CART.seatOffset };
}

export function intakePosition(state: GameState): { x: number; z: number } {
  const c = state.cart;
  return { x: c.x + Math.cos(c.heading) * CART.intakeOffset, z: c.z + Math.sin(c.heading) * CART.intakeOffset };
}

export function cartSpeedNow(state: GameState): number {
  return Math.hypot(state.cart.vx, state.cart.vz);
}

export function canBoard(state: GameState): boolean {
  const p = state.player;
  if (p.mode !== 'onFoot' && p.mode !== 'carving') return false;
  return Math.hypot(p.x - state.cart.x, p.z - state.cart.z) <= MOVE.boardDistance;
}

/** Find a free spot beside the cart to step out onto. Never inside candy or machines. */
export function findDisembarkSpot(state: GameState): { x: number; z: number } | null {
  const c = state.cart;
  const fx = Math.cos(c.heading);
  const fz = Math.sin(c.heading);
  const rx = -fz;
  const rz = fx;
  const d = MOVE.cartRadius + MOVE.playerRadius + 0.12;
  const candidates = [
    [rx, rz],
    [-rx, -rz],
    [-fx, -fz],
    [(rx - fx) * 0.72, (rz - fz) * 0.72],
    [(-rx - fx) * 0.72, (-rz - fz) * 0.72],
    [fx, fz],
    [(rx + fx) * 0.72, (rz + fz) * 0.72],
    [(-rx + fx) * 0.72, (-rz + fz) * 0.72],
  ];
  for (const scale of [1, 1.35, 1.8]) {
    for (const [ox, oz] of candidates) {
      const x = c.x + ox * d * scale;
      const z = c.z + oz * d * scale;
      if (isFree(x, z, MOVE.playerRadius + 0.02, state.contract)) return { x, z };
    }
  }
  return null;
}

export function inParkBay(state: GameState): boolean {
  const b = WORLD.parkBay;
  return Math.abs(state.cart.x - b.x) <= b.hw && Math.abs(state.cart.z - b.z) <= b.hd;
}

function startBoarding(ctx: SimContext): void {
  const { state, events } = ctx;
  const p = state.player;
  // Leaving carve mode: turn any partial buffer into a small roll.
  if (state.peelers.player.buffer) flushPeeler(ctx, state.peelers.player, undefined, undefined, true);
  const from = p.mode;
  p.mode = 'boarding';
  p.modeTime = 0;
  p.fromX = p.x;
  p.fromZ = p.z;
  p.vx = 0;
  p.vz = 0;
  p.carveContact = false;
  p.boardDwell = 0;
  p.parkDwell = -1; // hopping in inside the bay must not drop you straight back out
  state.cart.control = 'idle';
  events.push({ type: 'modeChanged', from, to: 'boarding' });
}

function startDisembark(ctx: SimContext): boolean {
  const { state, events } = ctx;
  const p = state.player;
  const spot = findDisembarkSpot(state);
  if (!spot) {
    events.push({ type: 'disembarkBlocked' });
    return false;
  }
  p.mode = 'disembarking';
  p.modeTime = 0;
  const seat = seatPosition(state);
  p.fromX = seat.x;
  p.fromZ = seat.z;
  p.toX = spot.x;
  p.toZ = spot.z;
  p.boardArmed = false; // must walk away before the next auto-board
  p.parkDwell = 0;
  state.cart.control = 'idle';
  state.tutorial.flags.park = true;
  events.push({ type: 'modeChanged', from: 'driving', to: 'disembarking' });
  return true;
}

/**
 * No buttons: staying next to a (nearly) stopped cart for MOVE.autoBoardTime
 * hops in; stopping the cart inside the parking bay hops out.
 */
export function updateAutoBoarding(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  const p = state.player;
  const c = state.cart;
  const cartSpeed = Math.hypot(c.vx, c.vz);
  if (p.mode === 'onFoot' || p.mode === 'carving') {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d > MOVE.rearmDistance) p.boardArmed = true;
    if (p.boardArmed && p.mode === 'onFoot' && d <= MOVE.boardDistance && cartSpeed <= MOVE.autoBoardMaxCartSpeed) {
      p.boardDwell += dt;
      if (p.boardDwell >= MOVE.autoBoardTime) startBoarding(ctx);
    } else {
      p.boardDwell = 0;
    }
    return;
  }
  p.boardDwell = 0;
  if (p.mode === 'driving') {
    if (!inParkBay(state)) {
      p.parkDwell = 0;
      return;
    }
    if (p.parkDwell < 0) return; // a blocked attempt waits until the cart leaves the bay
    if (cartSpeed <= MOVE.parkMaxSpeed) {
      p.parkDwell += dt;
      if (p.parkDwell >= MOVE.parkDisembarkTime && !startDisembark(ctx)) p.parkDwell = -1;
    } else {
      p.parkDwell = 0;
    }
  }
}

/** Shared vehicle model for manual and autopilot driving. */
export function driveCart(state: GameState, dirX: number, dirZ: number, mag: number, dt: number, speedScale = 1): void {
  const c = state.cart;
  const maxSpeed = cartSpeed(state) * speedScale;
  let targetSpeed = 0;
  if (mag > 0.05) {
    const target = Math.atan2(dirZ, dirX);
    c.heading = lerpAngle(c.heading, target, expSmooth(dt, MOVE.cartTurnTau));
    const diff = Math.abs(angleDiff(c.heading, target));
    const forward = Math.max(0.3, Math.cos(Math.min(diff, Math.PI / 2)));
    targetSpeed = Math.min(1, mag) * maxSpeed * forward;
  }
  const hx = Math.cos(c.heading);
  const hz = Math.sin(c.heading);
  let speed = c.vx * hx + c.vz * hz;
  if (speed < 0) speed = 0;
  const tau = targetSpeed > speed ? MOVE.cartAccelTau : MOVE.cartStopTau;
  speed += (targetSpeed - speed) * expSmooth(dt, tau);
  if (speed < 0.01 && targetSpeed === 0) speed = 0;
  const v = { vx: hx * speed, vz: hz * speed };
  const pos = { x: c.x + v.vx * dt, z: c.z + v.vz * dt };
  resolveCircle(pos, v, MOVE.cartRadius, state.contract);
  const moved = Math.hypot(pos.x - c.x, pos.z - c.z);
  c.x = pos.x;
  c.z = pos.z;
  c.vx = dt > 0 ? v.vx : 0;
  c.vz = dt > 0 ? v.vz : 0;
  c.odometer += moved;
}

function pushPlayerOutOfCart(state: GameState): void {
  const p = state.player;
  const c = state.cart;
  const dx = p.x - c.x;
  const dz = p.z - c.z;
  const d = Math.hypot(dx, dz);
  const minD = MOVE.cartRadius + MOVE.playerRadius - 0.04;
  if (d >= minD) return;
  const nx = d > 1e-5 ? dx / d : 1;
  const nz = d > 1e-5 ? dz / d : 0;
  p.x = c.x + nx * minD;
  p.z = c.z + nz * minD;
  const v = { vx: p.vx, vz: p.vz };
  resolveCircle(p, v, MOVE.playerRadius, state.contract);
  p.vx = v.vx;
  p.vz = v.vz;
}

export function updatePlayerMovement(ctx: SimContext, dt: number): void {
  const { state, input, events } = ctx;
  const p = state.player;
  switch (p.mode) {
    case 'onFoot':
    case 'carving': {
      const mag = Math.min(1, input.mag);
      const tx = input.dirX * mag * MOVE.walkSpeed;
      const tz = input.dirZ * mag * MOVE.walkSpeed;
      const tau = mag > 0.01 ? MOVE.walkAccelTau : MOVE.walkStopTau;
      const k = expSmooth(dt, tau);
      p.vx += (tx - p.vx) * k;
      p.vz += (tz - p.vz) * k;
      if (mag < 0.01 && Math.hypot(p.vx, p.vz) < 0.02) {
        p.vx = 0;
        p.vz = 0;
      }
      if (mag > 0.1) p.facing = lerpAngle(p.facing, Math.atan2(input.dirZ, input.dirX), expSmooth(dt, MOVE.facingTau));
      const pos = { x: p.x + p.vx * dt, z: p.z + p.vz * dt };
      const v = { vx: p.vx, vz: p.vz };
      resolveCircle(pos, v, MOVE.playerRadius, state.contract);
      const moved = Math.hypot(pos.x - p.x, pos.z - p.z);
      p.x = pos.x;
      p.z = pos.z;
      p.vx = v.vx;
      p.vz = v.vz;
      p.distanceWalked += moved;
      break;
    }
    case 'boarding': {
      p.modeTime += dt;
      const t = Math.min(1, p.modeTime / MOVE.boardTime);
      const seat = seatPosition(state);
      p.x = p.fromX + (seat.x - p.fromX) * t;
      p.z = p.fromZ + (seat.z - p.fromZ) * t;
      p.facing = lerpAngle(p.facing, state.cart.heading, t);
      if (t >= 1) {
        p.mode = 'driving';
        p.modeTime = 0;
        state.cart.control = 'manual';
        state.tutorial.flags.board = true;
        events.push({ type: 'modeChanged', from: 'boarding', to: 'driving' });
      }
      break;
    }
    case 'driving': {
      const seat = seatPosition(state);
      p.x = seat.x;
      p.z = seat.z;
      p.facing = state.cart.heading;
      p.vx = state.cart.vx;
      p.vz = state.cart.vz;
      break;
    }
    case 'disembarking': {
      p.modeTime += dt;
      const t = Math.min(1, p.modeTime / MOVE.boardTime);
      p.x = p.fromX + (p.toX - p.fromX) * t;
      p.z = p.fromZ + (p.toZ - p.fromZ) * t;
      if (t >= 1) {
        p.mode = 'onFoot';
        p.modeTime = 0;
        p.vx = 0;
        p.vz = 0;
        const owned = upgradeValue(state, 'autopilot') > 0;
        state.cart.control = owned && state.autopilotEnabled ? 'autopilot' : 'idle';
        if (state.cart.control === 'autopilot') state.cart.auto.phase = 'idle';
        events.push({ type: 'modeChanged', from: 'disembarking', to: 'onFoot' });
      }
      break;
    }
  }
}

export function updateCartManual(ctx: SimContext, dt: number): void {
  const { state, input } = ctx;
  const c = state.cart;
  if (c.control === 'manual' && state.player.mode === 'driving') {
    driveCart(state, input.dirX, input.dirZ, input.mag, dt);
  } else if (c.control !== 'autopilot') {
    driveCart(state, 0, 0, 0, dt);
  }
}

export function resolvePlayerVsCart(state: GameState): void {
  const p = state.player;
  if (p.mode === 'onFoot' || p.mode === 'carving') pushPlayerOutOfCart(state);
}

/** After the source is reset, move anyone standing inside the new candy to a safe spot. */
export function relocateIfCovered(ctx: SimContext): void {
  const { state, events } = ctx;
  const R = WORLD.source.radius;
  const p = state.player;
  const c = state.cart;
  const covered = (x: number, z: number, r: number) => Math.hypot(x - WORLD.source.x, z - WORLD.source.z) < R + r + 0.02;
  if (covered(c.x, c.z, MOVE.cartRadius)) {
    c.x = WORLD.cartPark.x;
    c.z = WORLD.cartPark.z;
    c.heading = WORLD.cartPark.heading;
    c.vx = 0;
    c.vz = 0;
    events.push({ type: 'relocated', who: 'cart' });
  }
  if (p.mode === 'driving' || p.mode === 'boarding') {
    const seat = seatPosition(state);
    p.x = seat.x;
    p.z = seat.z;
  } else if (covered(p.x, p.z, MOVE.playerRadius)) {
    p.mode = 'onFoot';
    let spot: { x: number; z: number } = { x: WORLD.playerStart.x, z: WORLD.playerStart.z };
    for (let i = 0; i < 12 && !isFree(spot.x, spot.z, MOVE.playerRadius, state.contract); i++) spot = { x: WORLD.playerStart.x + (i % 4) * 0.6, z: WORLD.playerStart.z + Math.floor(i / 4) * 0.6 };
    p.x = spot.x;
    p.z = spot.z;
    p.vx = 0;
    p.vz = 0;
    events.push({ type: 'relocated', who: 'player' });
  }
}
