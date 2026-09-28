import type { UpgradeId, TutorialStepId } from './config';

export type PlayerMode = 'onFoot' | 'carving' | 'boarding' | 'driving' | 'disembarking';
export type CartControl = 'idle' | 'manual' | 'autopilot';
export type CartActivity = 'none' | 'collecting' | 'unloading';
export type AutopilotPhase = 'idle' | 'toRolls' | 'collecting' | 'toMachine' | 'unloading' | 'waiting' | 'standby';
export type MachineStatus = 'idle' | 'processing' | 'blocked';
export type ContractStatus = 'active' | 'sourceEmpty' | 'settling' | 'completed';

export interface RawTag {
  ciid: number; // contract instance id
  defId: number; // contract definition index
  layer: number; // 0 = outermost
}

export interface PeelerBuffer extends RawTag {
  mass: number;
}

export interface Peeler {
  id: 'player' | 'helper';
  buffer: PeelerBuffer | null;
  idleTime: number; // seconds since the last gram was actually taken
  outputRate: number; // smoothed actual U/s, for audio/visual only
  streak: number; // seconds of continuous cutting (cosmetic only)
}

export interface Collectible extends RawTag {
  id: number;
  mass: number;
  x: number;
  z: number;
  y: number; // resting height (visual, saved so the floor rebuilds identically)
  age: number;
}

export interface CargoItem extends RawTag {
  id: number;
  mass: number;
}

export interface HopperBatch extends RawTag {
  mass: number;
}

export interface ProductionCycle {
  ciid: number;
  defId: number;
  mass: number;
  progress: number; // 0..1
  productId: number;
}

export interface Product {
  id: number;
  ciid: number;
  defId: number;
  count: number; // >1 means a visual package
  mass: number;
  value: number;
  t: number; // 0..1 along the conveyor
}

export interface ContractInstance {
  ciid: number;
  defId: number;
  status: ContractStatus;
  activeLayer: number; // 5 when the source is empty
  sectors: number[][]; // [layer][sector] remaining mass
  initialSectorMass: number[]; // per layer, mass of one full sector
  initialRaw: number;
  rotation: number; // radians
  spinRate: number; // current (eased) rad/s
  soldCount: number;
  soldMass: number;
  revenue: number;
  bonusPaid: boolean;
  dustMass: number; // floating-point residue retired at completion (tracked for the ledger)
  milestones: number; // bitmask of MILESTONES already paid for this instance
  startedAt: number;
}

export interface PlayerState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  facing: number; // radians, world angle of the forward direction (atan2(z, x))
  mode: PlayerMode;
  modeTime: number;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  distanceWalked: number;
  carveContact: boolean;
  boardDwell: number; // seconds spent next to the parked cart (auto-board at MOVE.autoBoardTime)
  boardArmed: boolean; // false right after hopping out, until the chef walks away
  parkDwell: number; // seconds the driven cart has been stopped in the parking bay
  blades: number; // intact blades carried (the one in hand counts)
  bladeWear: number; // pieces left on the blade in hand
  bladeSwap: number; // seconds until the next spare is in hand (0 = ready)
  station: string | null; // upgrade pad the chef is standing on
  stationDwell: number; // seconds stopped on an upgrade pad (opens at ~0.45 s)
}

export interface CartState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  control: CartControl;
  activity: CartActivity;
  cargo: CargoItem[];
  pickupBudget: number;
  fullNotified: boolean;
  hopperFullNotified: boolean;
  odometer: number;
  auto: {
    phase: AutopilotPhase;
    targetRoll: number; // collectible id, -1 when none
    path: { x: number; z: number }[];
    pathGoal: { x: number; z: number } | null;
    phaseTime: number;
    stuckTime: number;
    lastProgressDist: number;
    waitWithCargo: number;
  };
}

export interface MachineState {
  hopper: HopperBatch[];
  cycle: ProductionCycle | null;
  status: MachineStatus;
  producedTotal: number;
}

export interface TutorialState {
  done: boolean;
  skipped: boolean;
  flags: Record<TutorialStepId, boolean>;
}

export interface Stats {
  carved: number;
  collected: number;
  unloaded: number;
  produced: number;
  sold: number;
  coinsEarned: number;
  playTime: number;
}

export interface GameState {
  version: number;
  nextId: number;
  time: number;
  coins: number;
  upgrades: Record<UpgradeId, number>; // level index into UPGRADES[id].values
  autopilotEnabled: boolean;
  autoContinue: boolean;
  contract: ContractInstance;
  contractsCompleted: number[]; // def ids completed at least once (sorted unique)
  completedInstances: number[]; // ciids whose completion bonus has been paid
  totalContractsCompleted: number;
  player: PlayerState;
  cart: CartState;
  collectibles: Collectible[];
  peelers: { player: Peeler; helper: Peeler };
  machine: MachineState;
  conveyor: Product[];
  tutorial: TutorialState;
  stats: Stats;
}

export interface Ledger {
  source: number;
  buffers: number;
  world: number;
  cart: number;
  hopper: number;
  conveyor: number;
  sold: number;
  dust: number;
  total: number;
  initial: number;
  mismatch: number;
}
