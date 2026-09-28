// Central tuning file. Every economy, movement, peeling, audio-density and FX
// number lives here so it can be tuned without touching systems or renderers.
// See TUNING.md for the reasoning behind values that moved away from the brief.

export const PALETTE = {
  vanilla: '#FFF2D7',
  strawberry: '#F46F8F',
  lemon: '#FFD260',
  mint: '#73D4B2',
  blueberry: '#78A9E3',
  grape: '#AE87D9',
  orange: '#FF9C65',
  teal: '#3CA5AD',
  plum: '#47364F',
  panel: '#FFFBF1',
  // Derived supporting tones (kept calmer than the candy colours).
  cream: '#FFF4E0',
  coral: '#FF7F7A',
  pinkLight: '#FFB3C4',
  floorA: '#F7E6C8',
  floorB: '#F1DBB6',
  wall: '#E9C9A6',
  wallTrim: '#C98F7A',
  outside: '#5E4A66',
  skin: '#FFD1B0',
  tealDark: '#2A7F87',
  wheel: '#4B3B55',
} as const;

export type Vec2 = { x: number; z: number };

export const WORLD = {
  // A roomy workshop: the follow camera shows a slice of it at a time.
  bounds: { minX: -7.5, maxX: 7.5, minZ: -10.5, maxZ: 10.8 },
  source: {
    x: 0,
    z: -3.4,
    radius: 4.2,
    hubRadius: 0.8,
    height: 0.8,
    platterRadius: 4.38,
    sectors: 128,
    // Radial widths of the 5 annuli, outer → inner. Sum = radius - hubRadius.
    layerWidths: [0.6, 0.64, 0.7, 0.72, 0.74],
  },
  playerStart: { x: -1.6, z: 3.8 },
  cartPark: { x: -4.7, z: 6.9, heading: -Math.PI / 2 },
  // Parking bay: stop the cart here and the chef hops out automatically.
  parkBay: { x: -4.7, z: 6.9, hw: 0.75, hd: 0.95 },
  cartStandby: { x: -3.0, z: 2.9 },
  // Stations you walk onto (no HUD buttons): take blades, open upgrade groups.
  bladePad: { x: 2.3, z: 2.5, r: 0.6 },
  bladeRack: { x: 3.3, z: 2.15 },
  upgradePads: [
    { id: 'blade', x: 3.6, z: 3.7, r: 0.5 },
    { id: 'cart', x: -3.2, z: 7.7, r: 0.5 },
    { id: 'machine', x: 6.3, z: 5.0, r: 0.5 },
  ],
  // Unload pad on the machine's left, facing open floor so the cart stays in view.
  unloadZone: { x: 2.4, z: 6.6, hw: 0.72, hd: 0.9 },
  machine: { x: 4.3, z: 6.55, hw: 1.0, hd: 0.8 },
  hopper: { x: 3.68, z: 6.4 },
  // Conveyor polyline from the machine outlet to the kiosk sale point.
  conveyorPath: [
    { x: 4.3, z: 7.4 },
    { x: 4.3, z: 9.0 },
    { x: 1.9, z: 9.0 },
  ],
  kiosk: { x: 1.0, z: 9.0, hw: 0.8, hd: 0.65 },
  customer: { x: 0.95, z: 10.1 },
  // Static rectangular obstacles (besides the source & hub).
  obstacles: [
    { id: 'machine', x: 4.3, z: 6.55, hw: 1.0, hd: 0.8 },
    { id: 'conveyorA', x: 4.3, z: 8.2, hw: 0.32, hd: 0.8 },
    { id: 'conveyorB', x: 3.1, z: 9.0, hw: 1.4, hd: 0.3 },
    { id: 'kiosk', x: 1.0, z: 9.0, hw: 0.8, hd: 0.65 },
    { id: 'customer', x: 0.95, z: 10.1, hw: 0.3, hd: 0.3 },
    { id: 'shelfL', x: -7.0, z: 9.9, hw: 0.4, hd: 0.6 },
    { id: 'plantR', x: 7.0, z: 10.3, hw: 0.35, hd: 0.35 },
    { id: 'bladeRack', x: 3.3, z: 2.15, hw: 0.28, hd: 0.24 },
  ],
  helperAngleDeg: -42, // world angle of the helper station (upper-right diagonal)
} as const;

export const MOVE = {
  walkSpeed: 2.7,
  walkAccelTau: 0.05, // ≈0.15 s to full speed
  walkStopTau: 0.04,
  facingTau: 0.06,
  playerRadius: 0.28,
  cartRadius: 0.62,
  cartAccelTau: 0.05,
  cartStopTau: 0.04, // ≈0.12 s to stop
  cartTurnTau: 0.1,
  boardDistance: 1.35,
  boardTime: 0.2,
  autoBoardTime: 2.5, // stay next to the parked cart this long to hop in
  autoBoardMaxCartSpeed: 0.4,
  rearmDistance: 1.8, // after hopping out, walk this far away before auto-boarding can trigger again
  parkDisembarkTime: 0.35, // cart stopped inside the parking bay this long → chef hops out
  parkMaxSpeed: 0.35,
  unloadMaxSpeed: 0.55,
} as const;

export const PEEL = {
  baseSpinDeg: 90,
  minSpinDeg: 90,
  maxSpinDeg: 270,
  spinEaseTime: 0.4,
  supplyMargin: 1.15, // motor keeps supply ≥ 115% of the configured carve rate while it can
  toolWidth: 0.55,
  toolWidthBonusPerStep: 0.12, // applied at scraper level 2 and 4 (player-facing numbering)
  reach: 0.34, // how far past the body circle the blade touches
  reachSlack: 0.08,
  facingCos: 0.35,
  inputCosStart: 0.38,
  inputCosKeep: 0.18,
  carveGraceTime: 0.12,
  rollMass: 1,
  flushAfterIdle: 0.35,
  minFlushMass: 0.04,
  sectorEps: 1e-5,
  layerEpsFraction: 0.004,
  layerEpsAbs: 0.025,
  helperStandoff: 0.33,
  helperToolWidth: 0.5,
} as const;

export const CART = {
  intakeOffset: 0.82,
  bodySweepRadius: 0.6, // rolls under the cart body are swept up too
  seatOffset: -0.05,
  binOffset: -0.52,
  basePickupRate: 6,
  baseUnloadRate: 10,
  settleTime: 0.32, // rolls can't be grabbed mid-air
  nearFullRatio: 0.8,
  deliverRatio: 0.8,
  partialWaitSeconds: 6,
  visualCoils: 12,
} as const;

export const MACHINE = {
  hopperCapacity: 72,
  unitsPerProduct: 2,
  conveyorTravel: 1.4,
  maxVisualProducts: 12,
  massEps: 1e-6,
  dustMass: 0.02,
} as const;

export const COLLECT = {
  maxActiveRolls: 80,
  // Rolls are tossed onto the floor around the candy (no trays).
  tossOutMin: 0.45, // distance past the candy's full footprint
  tossOutMax: 1.45,
  tossSideMin: 0.2, // along the spin direction, away from the peeler
  tossSideMax: 1.0,
  gridStep: 0.2,
  rollRadius: 0.2,
  crowdRadius: 0.3,
} as const;

export const BLADE = {
  refillOnPad: true, // stepping on the blade pad refills blades up to capacity
  swapPause: 0.25, // seconds before the next spare blade is in hand
} as const;

export const BONUS = {
  doubleCarveChance: 0.08, // per full piece carved by the player
} as const;

// Rewards along the "carved" bar of every contract instance (paid once each).
// Early ones come quickly because the candy is very hard. `mult` × product value.
export const MILESTONES: { at: number; kind: 'coin' | 'chest'; mult: number }[] = [
  { at: 0.02, kind: 'coin', mult: 15 },
  { at: 0.09, kind: 'chest', mult: 40 },
  { at: 0.2, kind: 'coin', mult: 30 },
  { at: 0.35, kind: 'chest', mult: 60 },
  { at: 0.5, kind: 'coin', mult: 50 },
  { at: 0.7, kind: 'chest', mult: 90 },
  { at: 0.9, kind: 'chest', mult: 140 },
];

export const CAMERA = {
  fov: 30,
  pitchDeg: 54,
  viewWidth: 7.4, // world units visible across a portrait screen at the player
  minViewHeight: 10, // for landscape screens
  followTau: 0.16,
  lookAhead: 0.28,
} as const;

// Candy hardness: each layer holds this many times the brief's base mass, so the
// disc barely wears down (like the reference) while rolls still pop out at the
// tool's rate. Contract 1 = 80 × massScale U.
export const CANDY = {
  massScale: 100,
} as const;

export type ProductShape = 'swirl' | 'twist' | 'heart';

export interface ContractDef {
  id: number;
  flavorId: string;
  name: string;
  shortName: string;
  layerMasses: number[];
  layerColors: string[];
  productValue: number;
  bonus: number;
  productShape: ProductShape;
  productName: string;
  primary: string;
  secondary: string;
  accent: string;
}

export const CONTRACTS: ContractDef[] = [
  {
    id: 0,
    flavorId: 'strawberry',
    name: 'Strawberry Swirl',
    shortName: 'Strawberry',
    layerMasses: [10, 14, 16, 20, 20],
    layerColors: ['#F46F8F', '#FFE7C9', '#FF8A73', '#F75F86', '#FFD9DF'],
    productValue: 4,
    bonus: 500,
    productShape: 'swirl',
    productName: 'Swirl Pops',
    primary: '#F46F8F',
    secondary: '#FFF4E0',
    accent: '#FF8A73',
  },
  {
    id: 1,
    flavorId: 'citrus',
    name: 'Citrus Twist',
    shortName: 'Citrus',
    layerMasses: [20, 28, 32, 40, 40],
    layerColors: ['#FFD260', '#FF9C65', '#FFF1D2', '#73D4B2', '#FFC24A'],
    productValue: 6,
    bonus: 1500,
    productShape: 'twist',
    productName: 'Twist Candies',
    primary: '#FFD260',
    secondary: '#FF9C65',
    accent: '#73D4B2',
  },
  {
    id: 2,
    flavorId: 'berry',
    name: 'Berry Carnival',
    shortName: 'Berry',
    layerMasses: [30, 42, 48, 60, 60],
    layerColors: ['#78A9E3', '#AE87D9', '#F46F8F', '#FFF0DA', '#8C9BEA'],
    productValue: 8,
    bonus: 3000,
    productShape: 'heart',
    productName: 'Heart Pops',
    primary: '#AE87D9',
    secondary: '#78A9E3',
    accent: '#F46F8F',
  },
];

export type UpgradeId = 'scraper' | 'precision' | 'durability' | 'bladeCap' | 'capacity' | 'machine' | 'intake' | 'cartSpeed' | 'autopilot' | 'helper';
export type StationId = 'blade' | 'cart' | 'machine';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  desc: string;
  values: number[];
  costs: number[];
  unit: string;
  requiresContracts: number;
  kind: 'stat' | 'unlock';
  station: StationId;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  scraper: {
    id: 'scraper',
    name: 'Sharpness',
    desc: 'Carve faster',
    values: [2.0, 2.6, 3.3, 4.1, 5.0],
    costs: [20, 45, 90, 160],
    unit: 'U/s',
    requiresContracts: 0,
    kind: 'stat',
    station: 'blade',
  },
  precision: {
    id: 'precision',
    name: 'Precision',
    desc: 'Longer pieces',
    values: [1, 1.25, 1.5, 1.75, 2],
    costs: [30, 70, 140, 250],
    unit: 'U/piece',
    requiresContracts: 0,
    kind: 'stat',
    station: 'blade',
  },
  durability: {
    id: 'durability',
    name: 'Durability',
    desc: 'Tougher blades',
    values: [8, 11, 15, 20, 26],
    costs: [15, 40, 90, 180],
    unit: 'pieces',
    requiresContracts: 0,
    kind: 'stat',
    station: 'blade',
  },
  bladeCap: {
    id: 'bladeCap',
    name: 'Blade Capacity',
    desc: 'Carry spare blades',
    values: [1, 2, 3, 4],
    costs: [40, 100, 200],
    unit: 'blades',
    requiresContracts: 0,
    kind: 'stat',
    station: 'blade',
  },
  capacity: {
    id: 'capacity',
    name: 'Cart Bin',
    desc: 'Haul more',
    values: [12, 18, 26, 36, 48],
    costs: [24, 60, 120, 220],
    unit: 'U',
    requiresContracts: 0,
    kind: 'stat',
    station: 'cart',
  },
  machine: {
    id: 'machine',
    name: 'Lollipop Machine',
    desc: 'Process faster',
    values: [2, 3, 4.5, 6],
    costs: [30, 70, 150],
    unit: 'U/s',
    requiresContracts: 0,
    kind: 'stat',
    station: 'machine',
  },
  intake: {
    id: 'intake',
    name: 'Sweeper Drum',
    desc: 'Wider pickup',
    values: [0.85, 1.05, 1.25, 1.45],
    costs: [25, 60, 130],
    unit: 'm',
    requiresContracts: 0,
    kind: 'stat',
    station: 'cart',
  },
  cartSpeed: {
    id: 'cartSpeed',
    name: 'Cart Engine',
    desc: 'Faster cart',
    values: [3.8, 4.3, 4.8, 5.3],
    costs: [35, 90, 180],
    unit: 'm/s',
    requiresContracts: 0,
    kind: 'stat',
    station: 'cart',
  },
  autopilot: {
    id: 'autopilot',
    name: 'Cart Autopilot',
    desc: 'The cart hauls by itself',
    values: [0, 1],
    costs: [300],
    unit: '',
    requiresContracts: 0,
    kind: 'unlock',
    station: 'cart',
  },
  helper: {
    id: 'helper',
    name: 'Carving Robot',
    desc: 'A helper carves 0.75 U/s',
    values: [0, 0.75],
    costs: [800],
    unit: 'U/s',
    requiresContracts: 0,
    kind: 'unlock',
    station: 'machine',
  },
};

export const UPGRADE_ORDER: UpgradeId[] = ['scraper', 'precision', 'durability', 'bladeCap', 'capacity', 'intake', 'cartSpeed', 'autopilot', 'machine', 'helper'];

export const STATION_NAMES: Record<StationId, string> = { blade: 'Blade Upgrades', cart: 'Cart Upgrades', machine: 'Machine Upgrades' };

export const SIM = {
  tickRate: 60,
  maxCatchUpSteps: 6,
  maxFrameDt: 0.1,
} as const;

export const TUTORIAL_STEPS = [
  { id: 'move', text: 'Swipe to move' },
  { id: 'blade', text: 'Grab a blade' },
  { id: 'carve', text: 'Hold to carve' },
  { id: 'board', text: 'Wait next to the Candy Cart' },
  { id: 'collect', text: 'Collect the rolls' },
  { id: 'deliver', text: 'Deliver to the machine' },
  { id: 'sell', text: 'Your candy is on sale!' },
  { id: 'park', text: 'Park the cart at P to hop out' },
  { id: 'upgrade', text: 'Upgrade your blades!' },
] as const;

export type TutorialStepId = (typeof TUTORIAL_STEPS)[number]['id'];

export const AUDIO = {
  defaultSfx: 0.65,
  defaultMusic: 0.18,
  maxVoices: 22,
  pickupPerSec: 8,
  coinPerSec: 4,
  unloadPerSec: 6,
  bpm: 96,
} as const;

export const FX = {
  maxSprinkles: 170,
  maxFloaty: 10,
  shakePx: 2,
  shakeTime: 0.12,
  hapticMs: 10,
} as const;

export const SAVE = {
  key: 'candy-spiral-save',
  settingsKey: 'candy-spiral-settings',
  version: 2,
  autosaveInterval: 5,
} as const;
