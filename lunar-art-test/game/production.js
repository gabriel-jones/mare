import { CELL_SIZE, DEFS, DIRS, footprint, ports } from './defs.js';
import { findPath, robotBlockedCells, cellPassable } from './paths.js';

// Provisional tuning. One item is one abstract unit of bulk material.
export const BELT_SPEED = 1.5;
export const BELT_SPACING = 0.34;
export const REGOLITH_PER_CELL = 40;
export const MINING_RADIUS = 3;
export const RECIPE = Object.freeze({ input: 4, time: 6, metal: 2, silicon: 1, oxygen: 1, power: 3 });
export const PROCESSOR_INPUT_CAP = 16, PROCESSOR_OUTPUT_CAP = 12;
export const ROVER = Object.freeze({ speed: 3, capacity: 20, mineRate: 2, unloadRate: 10, drain: 1 / 300, chargeRate: 1 / 25, chargePower: 1.5, low: 0.25 });

export function createRover(id = 1) {
  return { id, kind: 'miner', x: 7, z: -5, facing: Math.PI, task: 'idle', cargo: 0, charge: 1, target: null };
}
/** Adds the storage fields a finished building needs; harmless for others. */
export function ensureBuildingState(b) {
  if (!b.built) return b;
  if (b.type === 'conveyor') b.items ??= [];
  if (b.type === 'hopper') b.inv ??= { regolith: 0 };
  if (b.type === 'storage') b.inv ??= { regolith: 0, metal: 0, silicon: 0 };
  if (b.type === 'processor') { b.inv ??= { regolith: 0 }; b.out ??= { metal: 0, silicon: 0 }; b.work ??= 0; }
  return b;
}
const key = (x, z) => `${x},${z}`;
const total = inv => Object.values(inv ?? {}).reduce((s, n) => s + n, 0);
export const processorReady = b => b.built && b.inv.regolith >= RECIPE.input && total(b.out) + RECIPE.metal + RECIPE.silicon <= PROCESSOR_OUTPUT_CAP;
const roverCharging = r => r.task === 'docked' && r.charge < 1;

export function productionDemand(state) {
  let kw = 0;
  for (const b of state.buildings) if (b.type === 'processor' && processorReady(b)) kw += RECIPE.power;
  for (const r of state.robots ?? []) if (roverCharging(r)) kw += ROVER.chargePower;
  return kw;
}

function cellIndex(state) {
  const map = new Map();
  for (const b of state.buildings) for (const c of footprint(b.type, b.x, b.z, b.rotation)) map.set(key(c.x, c.z), b);
  return map;
}
const beltCanAccept = belt => belt.built && belt.type === 'conveyor' && (belt.items.length === 0 || belt.items[belt.items.length - 1].p >= BELT_SPACING);
function machineAccept(b, item) {
  if (b.type === 'storage' && total(b.inv) < DEFS.storage.capacity) { b.inv[item] += 1; return true; }
  if (b.type === 'processor' && item === 'regolith' && b.inv.regolith < PROCESSOR_INPUT_CAP) { b.inv.regolith += 1; return true; }
  return false;
}
/** Where the item at the front of `belt` would go, or null. */
function handoff(belt, index, item) {
  const [dx, dz] = DIRS[belt.rotation], target = index.get(key(belt.x + dx, belt.z + dz));
  if (!target?.built) return false;
  if (target.type === 'conveyor') {
    if (target.rotation === (belt.rotation + 2) % 4 || !beltCanAccept(target)) return false;
    target.items.push({ type: item.type, p: 0 });
    return true;
  }
  const facing = (belt.rotation + 2) % 4;
  const port = ports(target, 'inputs').find(p => p.dir === facing && p.neighbor.x === belt.x && p.neighbor.z === belt.z);
  return !!port && machineAccept(target, item.type);
}
function stepBelts(state, index, dt) {
  for (const b of state.buildings) {
    if (b.type !== 'conveyor' || !b.built) continue;
    for (let i = 0; i < b.items.length; i++) {
      const item = b.items[i], limit = i === 0 ? Infinity : b.items[i - 1].p - BELT_SPACING;
      item.p = Math.max(item.p, Math.min(item.p + BELT_SPEED * dt, limit));
    }
    if (b.items.length && b.items[0].p >= 1) {
      if (handoff(b, index, b.items[0])) b.items.shift();
      else b.items[0].p = 1;
    }
  }
}
/** Machines push one item per tick through each output port onto an outward-facing belt. */
function pushOutputs(b, index, take) {
  for (const port of ports(b, 'outputs')) {
    const belt = index.get(key(port.neighbor.x, port.neighbor.z));
    if (!belt || belt.type !== 'conveyor' || belt.rotation === (port.dir + 2) % 4 || !beltCanAccept(belt)) continue;
    const item = take();
    if (item) belt.items.push({ type: item, p: 0 });
  }
}
function stepMachines(state, index, dt, powered) {
  for (const b of state.buildings) {
    if (!b.built) continue;
    if (b.type === 'hopper') pushOutputs(b, index, () => b.inv.regolith > 0 ? (b.inv.regolith--, 'regolith') : null);
    if (b.type !== 'processor') continue;
    if (processorReady(b) && powered) {
      b.work = Math.min(1, b.work + dt / RECIPE.time);
      if (b.work >= 1) {
        b.work = 0; b.inv.regolith -= RECIPE.input;
        b.out.metal += RECIPE.metal; b.out.silicon += RECIPE.silicon;
        state.reserves.oxygen += RECIPE.oxygen;
      }
    }
    // Alternate products so one output cannot starve the other on a shared belt.
    pushOutputs(b, index, () => {
      const first = b.out.metal >= b.out.silicon * 2 ? 'metal' : 'silicon', order = [first, first === 'metal' ? 'silicon' : 'metal'];
      const item = order.find(type => b.out[type] > 0);
      if (item) b.out[item]--;
      return item ?? null;
    });
  }
}

// --- Mining rover ---------------------------------------------------------

export function miningCells(state) {
  const a = state.miningArea;
  if (!a) return [];
  const occupied = new Set(state.buildings.flatMap(b => footprint(b.type, b.x, b.z, b.rotation).map(c => key(c.x, c.z))));
  const blocked = robotBlockedCells(state), cells = [];
  for (let x = a.x - MINING_RADIUS; x <= a.x + MINING_RADIUS; x++) for (let z = a.z - MINING_RADIUS; z <= a.z + MINING_RADIUS; z++) {
    if (occupied.has(key(x, z)) || (x >= -4 && x <= 4 && z >= -8 && z <= -2) || !cellPassable(state, blocked, x, z)) continue;
    cells.push({ x, z, remaining: REGOLITH_PER_CELL - (state.mined[key(x, z)] ?? 0) });
  }
  return cells;
}
export const roverHasWork = (state, r) => !!nearestMiningCell(state, r);
export const remainingRegolith = state => miningCells(state).reduce((s, c) => s + Math.max(0, c.remaining), 0);
const roverCell = r => ({ x: Math.round(r.x / CELL_SIZE), z: Math.round(r.z / CELL_SIZE) });
// Cells and docks a rover recently failed to reach, so it tries the next candidate instead of retrying forever.
const unreachable = new WeakMap();
const UNREACHABLE_MEMORY = 30;
function isUnreachable(state, r, x, z) { const until = unreachable.get(r)?.get(key(x, z)); return until != null && until > state.time; }
function markUnreachable(state, r, target) {
  if (!unreachable.has(r)) unreachable.set(r, new Map());
  unreachable.get(r).set(key(target.x, target.z), state.time + UNREACHABLE_MEMORY);
}
function nearestMiningCell(state, r) {
  let best = null, bestDistance = Infinity;
  for (const c of miningCells(state)) {
    if (c.remaining <= 0 || isUnreachable(state, r, c.x, c.z)) continue;
    const d = Math.hypot(c.x * CELL_SIZE - r.x, c.z * CELL_SIZE - r.z);
    if (d < bestDistance) { best = c; bestDistance = d; }
  }
  return best;
}
/** Free docking cells beside a hopper, never on its belt output or another structure. */
export function dockingCells(state, hopper, occupied, blocked) {
  const cells = footprint(hopper.type, hopper.x, hopper.z, hopper.rotation), inside = new Set(cells.map(c => key(c.x, c.z)));
  const outputs = new Set(ports(hopper, 'outputs').map(p => key(p.neighbor.x, p.neighbor.z))), result = new Map();
  for (const c of cells) for (const [dx, dz] of DIRS) {
    const x = c.x + dx, z = c.z + dz, k = key(x, z);
    if (inside.has(k) || outputs.has(k) || occupied.has(k) || !cellPassable(state, blocked, x, z)) continue;
    result.set(k, { x, z });
  }
  return [...result.values()];
}
function nearestHopper(state, r) {
  const occupied = new Set(state.buildings.flatMap(b => footprint(b.type, b.x, b.z, b.rotation).map(c => key(c.x, c.z))));
  const blocked = robotBlockedCells(state);
  let best = null, bestDistance = Infinity;
  for (const b of state.buildings) {
    if (b.type !== 'hopper' || !b.built) continue;
    for (const c of dockingCells(state, b, occupied, blocked)) {
      if (isUnreachable(state, r, c.x, c.z)) continue;
      const d = Math.hypot(c.x * CELL_SIZE - r.x, c.z * CELL_SIZE - r.z);
      if (d < bestDistance) { best = { hopper: b, cell: c }; bestDistance = d; }
    }
  }
  return best;
}
// Paths are derived navigation data, intentionally kept out of saves.
const routes = new WeakMap();
function drive(state, r, goal, dt, topology) {
  let route = routes.get(r);
  const goalKey = key(goal.x, goal.z);
  if (!route || route.goal !== goalKey || route.topology !== topology) {
    const cells = findPath(state, roverCell(r), goal);
    route = { goal: goalKey, topology, cells, i: 1 };
    routes.set(r, route);
  }
  if (!route.cells) return 'unreachable';
  let budget = ROVER.speed * (r.charge > 0 ? 1 : 0.3) * dt;
  while (budget > 0) {
    const c = route.cells[Math.min(route.i, route.cells.length - 1)], tx = c.x * CELL_SIZE, tz = c.z * CELL_SIZE;
    const dx = tx - r.x, dz = tz - r.z, distance = Math.hypot(dx, dz);
    if (distance > 1e-6) {
      const target = Math.atan2(dx, dz), delta = Math.atan2(Math.sin(target - r.facing), Math.cos(target - r.facing));
      r.facing += delta * Math.min(1, dt * 8);
    }
    if (distance <= budget) {
      r.x = tx; r.z = tz; budget -= distance;
      if (route.i >= route.cells.length - 1) { routes.delete(r); return 'arrived'; }
      route.i++;
    } else { r.x += dx / distance * budget; r.z += dz / distance * budget; budget = 0; }
  }
  return 'moving';
}
// A nearly full bucket is not worth another trip to a fresh cell.
const full = r => r.cargo > ROVER.capacity - 1;
function chooseTask(state, r) {
  const hopper = nearestHopper(state, r), work = nearestMiningCell(state, r);
  if (hopper && (full(r) || r.charge < ROVER.low || (r.cargo > 0 && !work) || (!work && r.charge < 1))) {
    r.task = 'toHopper'; r.target = { id: hopper.hopper.id, x: hopper.cell.x, z: hopper.cell.z };
  } else if (work && !full(r)) {
    r.task = 'toMine'; r.target = { x: work.x, z: work.z };
  } else { r.task = 'idle'; r.target = null; }
}
function stepRover(state, r, dt, powered, topology) {
  if (r.task === 'idle' || r.task === 'blocked') {
    if (r.task === 'blocked' && (r.wait = (r.wait ?? 0) - dt) > 0) return;
    delete r.wait;
    chooseTask(state, r);
    if (r.task === 'idle') return;
  }
  const active = r.task === 'toMine' || r.task === 'toHopper' || r.task === 'mining';
  if (active) r.charge = Math.max(0, r.charge - ROVER.drain * dt);
  if (r.task === 'toMine' || r.task === 'toHopper') {
    const hopper = r.task === 'toHopper' && state.buildings.find(b => b.id === r.target?.id && b.built);
    if (r.task === 'toHopper' && !hopper) { r.task = 'idle'; r.target = null; return; }
    const result = drive(state, r, r.target, dt, topology);
    if (result === 'unreachable') { markUnreachable(state, r, r.target); r.task = 'blocked'; r.wait = 0.5; return; }
    if (result === 'arrived') r.task = r.task === 'toMine' ? 'mining' : 'docked';
    return;
  }
  if (r.task === 'mining') {
    const cell = miningCells(state).find(c => c.x === r.target?.x && c.z === r.target?.z);
    if (!cell || cell.remaining <= 0 || full(r)) { r.task = 'idle'; return chooseTask(state, r); }
    const amount = Math.min(ROVER.mineRate * (r.charge > 0 ? 1 : 0.3) * dt, cell.remaining, ROVER.capacity - r.cargo);
    r.cargo = Math.min(ROVER.capacity, r.cargo + amount);
    state.mined[key(cell.x, cell.z)] = Math.min(REGOLITH_PER_CELL, (state.mined[key(cell.x, cell.z)] ?? 0) + amount);
    return;
  }
  if (r.task === 'docked') {
    const hopper = state.buildings.find(b => b.id === r.target?.id && b.built);
    if (!hopper) { r.task = 'idle'; r.target = null; return; }
    // Whole units enter the hopper; any fractional remainder stays aboard.
    const space = DEFS.hopper.capacity - hopper.inv.regolith, units = Math.min(Math.floor(r.cargo), space, Math.ceil(ROVER.unloadRate * dt));
    if (units > 0) { hopper.inv.regolith += units; r.cargo -= units; }
    if (powered) r.charge = Math.min(1, r.charge + ROVER.chargeRate * dt);
    const unloaded = r.cargo < 1, charged = r.charge >= 0.95 || (!powered && r.charge > ROVER.low);
    if (unloaded && charged && nearestMiningCell(state, r)) { r.task = 'idle'; chooseTask(state, r); }
  }
}

export function stepProduction(state, dt, powered) {
  const index = cellIndex(state);
  stepBelts(state, index, dt);
  stepMachines(state, index, dt, powered);
  const topology = state.buildings.filter(b => b.built && !DEFS[b.type].walkable).map(b => b.id).join(',');
  for (const r of state.robots) stepRover(state, r, dt, powered, topology);
}
