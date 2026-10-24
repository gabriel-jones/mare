import { THERMAL } from './power.js';
import { CELL_SIZE, DEFS, DIRS, ITEMS, PARTS, footprint, ports } from './defs.js';
import { findPath, robotBlockedCells, cellPassable } from './paths.js';
import * as inv from './inventory.js';
import { iceAt } from './terrain.js';

// Provisional tuning. One item is one abstract unit of bulk material.
export const BELT_SPEED = 1.5;
export const BELT_SPACING = 0.34;
export const REGOLITH_PER_CELL = 40;
export const MINING_RADIUS = 3;
export const MAX_MINING_AREAS = 4;
export const RECIPE = Object.freeze({ input: 4, time: 6, metal: 2, silicon: 1, oxygen: 1, power: 3 });
export const PROCESSOR_INPUT_CAP = 16, PROCESSOR_OUTPUT_CAP = 12;
export const MELT = Object.freeze({ time: 3, water: 1, power: 1.5, cap: 12, waterCap: 200 });
/** Fabricators hold up to `stock` of each material and `out` finished parts; assemblers `stock` of each part. */
export const FAB = Object.freeze({ time: 6, power: 2, stock: 20, out: 6 });
/** The default recipe makes one satellite's worth of parts in turn. */
export const KIT = Object.freeze(['frame', 'wing', 'wing', 'chip', 'chip']);
export const RECIPES = Object.freeze(['kit', 'frame', 'wing', 'chip']);
export const currentPart = b => b.recipe === 'kit' ? KIT[(b.step ?? 0) % KIT.length] : b.recipe;
const recipeInputs = b => b.recipe === 'kit' ? ['metal', 'silicon'] : Object.keys(PARTS[b.recipe].input);
export const ASSEMBLY = Object.freeze({ time: 20, power: 4, need: { frame: 1, wing: 2, chip: 2 }, stock: { frame: 2, wing: 4, chip: 4 }, out: 1 });
export const ROVER = Object.freeze({ speed: 3, capacity: 20, mineRate: 2, unloadRate: 10, drain: 1 / 300, chargeRate: 1 / 25, chargePower: 1.5, low: 0.25 });

export function createRover(id = 1) {
  return { id, kind: 'miner', x: 7, z: -5, facing: Math.PI, task: 'idle', cargo: 0, charge: 1, target: null };
}
/** Adds the storage fields a finished building needs; harmless for others. */
export function ensureBuildingState(b) {
  if (!b.built) return b;
  if (b.type === 'conveyor') b.items ??= [];
  if (b.type === 'hopper') { b.inv ??= { regolith: 0 }; b.inv.ice ??= 0; }
  if (b.type === 'storage') b.slots ??= Array(DEFS.storage.slots).fill(null);
  if (b.type === 'processor') { b.inv ??= { regolith: 0 }; b.out ??= { metal: 0, silicon: 0 }; b.work ??= 0; }
  if (b.type === 'melter') { b.inv ??= { ice: 0 }; b.work ??= 0; }
  if (b.type === 'fabricator') { b.inv ??= { metal: 0, silicon: 0 }; b.out ??= { frame: 0, wing: 0, chip: 0 }; b.recipe ??= 'kit'; b.step ??= 0; b.work ??= 0; }
  if (b.type === 'assembler') { b.inv ??= { frame: 0, wing: 0, chip: 0 }; b.out ??= { satellite: 0 }; b.work ??= 0; }
  if (b.type === 'electrolyser') b.work ??= 0;
  if (b.type === 'tank') b.fuel ??= 0;
  if (b.type === 'dock' || b.type === 'roverbay') b.work ??= 0;
  return b;
}
const key = (x, z) => `${x},${z}`;
export const total = inv => Object.values(inv ?? {}).reduce((s, n) => s + n, 0);
export const processorReady = b => b.built && b.inv.regolith >= RECIPE.input && total(b.out) + RECIPE.metal + RECIPE.silicon <= PROCESSOR_OUTPUT_CAP;
export const melterReady = (state, b) => b.built && b.inv.ice >= 1 && state.reserves.water < MELT.waterCap;
export const fabricatorReady = b => b.built && b.out[currentPart(b)] < FAB.out && Object.entries(PARTS[currentPart(b)].input).every(([item, n]) => b.inv[item] >= n);
export const assemblerReady = b => b.built && b.out.satellite < ASSEMBLY.out && Object.entries(ASSEMBLY.need).every(([part, n]) => b.inv[part] >= n);
/** How many more of `item` a machine will take, from a belt or a hauler. */
export function machineRoom(b, item) {
  if (!b.built) return 0;
  if (b.type === 'fabricator') return recipeInputs(b).includes(item) ? FAB.stock - b.inv[item] : 0;
  if (b.type === 'assembler') return item in ASSEMBLY.stock ? ASSEMBLY.stock[item] - b.inv[item] : 0;
  return 0;
}
const roverCharging = r => r.task === 'docked' && r.charge < 1;

/** E at a fabricator: kit, then each single part. Materials it no longer needs stay inside. */
export function cycleRecipe(b) {
  b.recipe = RECIPES[(RECIPES.indexOf(b.recipe) + 1) % RECIPES.length]; b.work = 0;
  return b.recipe === 'kit' ? 'Satellite kit' : PARTS[b.recipe].name;
}
export function productionDemand(state) {
  let kw = 0;
  for (const b of state.buildings) if (b.type === 'processor' && processorReady(b)) kw += RECIPE.power;
  for (const b of state.buildings) if (b.type === 'melter' && melterReady(state, b)) kw += MELT.power;
  for (const b of state.buildings) if (b.type === 'fabricator' && fabricatorReady(b)) kw += FAB.power;
  for (const b of state.buildings) if (b.type === 'assembler' && assemblerReady(b)) kw += ASSEMBLY.power;
  for (const r of state.robots ?? []) if (r.kind === 'miner' && roverCharging(r)) kw += ROVER.chargePower;
  return kw;
}

/** Whether something at `from` delivers into the cell `to` travelling in direction `dir`. */
function feedsInto(from, to, dir) {
  if (from.type === 'conveyor') return from.rotation === dir;
  return ports(from, 'outputs').some(p => p.dir === dir && p.neighbor.x === to.x && p.neighbor.z === to.z);
}
const turnCache = { sig: null, turns: new Map() };
/** Belt shape by id: 0 straight, 1 fed from its right-hand side (+X at rotation 0), -1 from the left.
 * A belt only curves when nothing feeds it from behind and exactly one side does. */
export function beltTurns(state) {
  const sig = state.buildings.map(b => `${b.id}:${b.type}:${b.x}:${b.z}:${b.rotation}`).join('|');
  if (turnCache.sig === sig) return turnCache.turns;
  const index = cellIndex(state), turns = new Map();
  for (const b of state.buildings) {
    if (b.type !== 'conveyor') continue;
    const fed = side => { const dir = (b.rotation + side) % 4, [dx, dz] = DIRS[dir], n = index.get(key(b.x + dx, b.z + dz)); return !!n && n !== b && feedsInto(n, b, (dir + 2) % 4); };
    const right = fed(1), left = fed(3);
    turns.set(b.id, fed(2) || right === left ? 0 : right ? 1 : -1);
  }
  turnCache.sig = sig; turnCache.turns = turns;
  return turns;
}
function cellIndex(state) {
  const map = new Map();
  for (const b of state.buildings) for (const c of footprint(b.type, b.x, b.z, b.rotation)) map.set(key(c.x, c.z), b);
  return map;
}
const beltCanAccept = belt => belt.built && belt.type === 'conveyor' && (belt.items.length === 0 || belt.items[belt.items.length - 1].p >= BELT_SPACING);
function machineAccept(b, item) {
  if (b.type === 'storage') return inv.add(b.slots, item, 1) === 0;
  if (b.type === 'processor' && item === 'regolith' && b.inv.regolith < PROCESSOR_INPUT_CAP) { b.inv.regolith += 1; return true; }
  if (b.type === 'melter' && item === 'ice' && b.inv.ice < MELT.cap) { b.inv.ice += 1; return true; }
  if (b.type === 'thermal' && item === 'regolith' && b.inv.regolith < THERMAL.cap) { b.inv.regolith += 1; return true; }
  if ((b.type === 'fabricator' || b.type === 'assembler') && machineRoom(b, item) >= 1) { b.inv[item] += 1; return true; }
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
/** A crate feeds any belt that leads straight away from it, one item at a time, from its first stack a belt can carry. */
function pullFromCrate(b, index) {
  for (const port of ports(b, 'inputs')) {
    const belt = index.get(key(port.neighbor.x, port.neighbor.z));
    if (!belt || belt.type !== 'conveyor' || belt.rotation !== port.dir || !beltCanAccept(belt)) continue;
    const slot = b.slots.find(s => s && ITEMS.includes(s.item));
    if (!slot) return;
    const item = slot.item; inv.remove(b.slots, item, 1); belt.items.push({ type: item, p: 0 });
  }
}
function stepMachines(state, index, dt, powered) {
  for (const b of state.buildings) {
    if (!b.built) continue;
    if (b.type === 'storage') pullFromCrate(b, index);
    if (b.type === 'hopper') pushOutputs(b, index, () => { const item = b.inv.ice > b.inv.regolith ? 'ice' : 'regolith'; return b.inv[item] > 0 ? (b.inv[item]--, item) : null; });
    if (b.type === 'melter' && melterReady(state, b) && powered) {
      b.work = Math.min(1, b.work + dt / MELT.time);
      if (b.work >= 1) { b.work = 0; b.inv.ice -= 1; state.reserves.water = Math.min(MELT.waterCap, state.reserves.water + MELT.water); if (state.mission) state.mission.melted += MELT.water; }
    }
    if (b.type === 'fabricator') {
      if (fabricatorReady(b) && powered) {
        b.work = Math.min(1, b.work + dt / FAB.time);
        if (b.work >= 1) { const part = currentPart(b); b.work = 0; for (const [item, n] of Object.entries(PARTS[part].input)) b.inv[item] -= n; b.out[part] += 1; b.step = (b.step + 1) % KIT.length; }
      }
      pushOutputs(b, index, () => { const part = Object.keys(b.out).find(p => b.out[p] > 0); if (part) b.out[part]--; return part ?? null; });
    }
    if (b.type === 'assembler') {
      if (assemblerReady(b) && powered) {
        b.work = Math.min(1, b.work + dt / ASSEMBLY.time);
        if (b.work >= 1) { b.work = 0; for (const [part, n] of Object.entries(ASSEMBLY.need)) b.inv[part] -= n; b.out.satellite += 1; }
      }
      pushOutputs(b, index, () => b.out.satellite > 0 ? (b.out.satellite--, 'satellite') : null);
    }
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

/** Diggable cells of every mining zone, or of zone `areaId` alone. Each cell carries its zone's `area` id. */
export function miningCells(state, areaId = null) {
  const areas = (state.miningAreas ?? []).filter(a => areaId == null || a.id === areaId);
  if (!areas.length) return [];
  const occupied = new Set(state.buildings.flatMap(b => footprint(b.type, b.x, b.z, b.rotation).map(c => key(c.x, c.z))));
  const blocked = robotBlockedCells(state);
  return areas.flatMap(a => {
    const cells = [];
    for (let x = a.x - MINING_RADIUS; x <= a.x + MINING_RADIUS; x++) for (let z = a.z - MINING_RADIUS; z <= a.z + MINING_RADIUS; z++) {
      if (occupied.has(key(x, z)) || (x >= -4 && x <= 4 && z >= -8 && z <= -2) || !cellPassable(state, blocked, x, z)) continue;
      cells.push({ x, z, area: a.id, kind: iceAt(x, z) ? 'ice' : 'regolith', remaining: REGOLITH_PER_CELL - (state.mined[key(x, z)] ?? 0) });
    }
    // A zone touching ice is an ice mine; its regolith is left alone.
    return cells.some(c => c.kind === 'ice') ? cells.filter(c => c.kind === 'ice') : cells;
  });
}
/** What a zone yields: 'ice' or 'regolith', or null once nothing diggable is left in it. */
export function areaKind(state, areaId) { return miningCells(state, areaId)[0]?.kind ?? null; }
export const roverHasWork = (state, r) => !!nearestMiningCell(state, r);
export const remainingRegolith = (state, areaId = null) => miningCells(state, areaId).reduce((s, c) => s + Math.max(0, c.remaining), 0);
export const hasMelter = state => state.buildings.some(b => b.type === 'melter' && b.built);
const roverCell = r => ({ x: Math.round(r.x / CELL_SIZE), z: Math.round(r.z / CELL_SIZE) });
// Cells and docks a rover recently failed to reach, so it tries the next candidate instead of retrying forever.
const unreachable = new WeakMap();
const UNREACHABLE_MEMORY = 30;
export function isUnreachable(state, r, x, z) { const until = unreachable.get(r)?.get(key(x, z)); return until != null && until > state.time; }
export function markUnreachable(state, r, target) {
  if (!unreachable.has(r)) unreachable.set(r, new Map());
  unreachable.get(r).set(key(target.x, target.z), state.time + UNREACHABLE_MEMORY);
}
function nearestMiningCell(state, r) {
  let best = null, bestDistance = Infinity;
  // Ice only goes to a melter, so it is not dug until one stands.
  const melts = hasMelter(state);
  for (const c of miningCells(state, r.area ?? null)) {
    // A part-filled bucket only takes more of the same material; a leftover fraction is tipped out.
    if (c.remaining <= 0 || (c.kind === 'ice' && !melts) || isUnreachable(state, r, c.x, c.z) || (r.cargo >= 1 && c.kind !== (r.load ?? 'regolith'))) continue;
    const d = Math.hypot(c.x * CELL_SIZE - r.x, c.z * CELL_SIZE - r.z);
    if (d < bestDistance) { best = c; bestDistance = d; }
  }
  return best;
}
/** Free docking cells beside a building, off its belt ports unless every side is a port (a crate). */
export function dockingCells(state, hopper, occupied, blocked) {
  const cells = footprint(hopper.type, hopper.x, hopper.z, hopper.rotation), inside = new Set(cells.map(c => key(c.x, c.z)));
  const portCells = new Set([...ports(hopper, 'outputs'), ...ports(hopper, 'inputs')].map(p => key(p.neighbor.x, p.neighbor.z))), result = new Map(), ported = new Map();
  for (const c of cells) for (const [dx, dz] of DIRS) {
    const x = c.x + dx, z = c.z + dz, k = key(x, z);
    if (inside.has(k) || occupied.has(k) || !cellPassable(state, blocked, x, z)) continue;
    (portCells.has(k) ? ported : result).set(k, { x, z });
  }
  return [...(result.size ? result : ported).values()];
}
/** Room left in `dock` for the rover's load: regolith goes to hoppers, ice straight into melters. */
export function dockSpace(dock, load = 'regolith') {
  if (dock.type === 'thermal') return load === 'ice' ? 0 : THERMAL.cap - (dock.inv?.regolith ?? 0);
  if (dock.type === 'melter') return load === 'ice' ? MELT.cap - (dock.inv?.ice ?? 0) : 0;
  return load === 'ice' ? 0 : DEFS.hopper.capacity - total(dock.inv);
}
/** The closest free docking cell beside a building of one of `types` (or matching a predicate). */
export function nearestDock(state, r, types) {
  const match = typeof types === 'function' ? types : b => types.includes(b.type);
  const occupied = new Set(state.buildings.flatMap(b => footprint(b.type, b.x, b.z, b.rotation).map(c => key(c.x, c.z))));
  const blocked = robotBlockedCells(state);
  let best = null, bestDistance = Infinity;
  for (const b of state.buildings) {
    if (!b.built || !match(b)) continue;
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
export function drive(state, r, goal, dt, topology) {
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
  // A load nothing standing can take (regolith with no hopper left, say) is tipped out, or the rover
  // would sit on it forever, unable to start on a zone of the other material.
  const takes = (r.load ?? 'regolith') === 'ice' ? ['melter'] : ['hopper', 'thermal'];
  if (r.cargo > 0 && !state.buildings.some(b => b.built && takes.includes(b.type))) { r.cargo = 0; r.load = null; }
  const work = nearestMiningCell(state, r), loaded = r.cargo >= 1, types = loaded ? takes : ['hopper', 'melter', 'thermal'];
  // A loaded rover heads for the nearest dock with room, and only queues at a full one when none has any.
  const hopper = (loaded && nearestDock(state, r, b => types.includes(b.type) && dockSpace(b, r.load ?? 'regolith') >= 1)) || nearestDock(state, r, types);
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
    if (!cell || cell.remaining <= 0 || full(r) || (r.cargo >= 1 && cell.kind !== (r.load ?? 'regolith'))) { r.task = 'idle'; return chooseTask(state, r); }
    if (cell.kind !== (r.load ?? 'regolith')) r.cargo = 0;
    r.load = cell.kind;
    const amount = Math.min(ROVER.mineRate * (r.charge > 0 ? 1 : 0.3) * dt, cell.remaining, ROVER.capacity - r.cargo);
    r.cargo = Math.min(ROVER.capacity, r.cargo + amount);
    state.mined[key(cell.x, cell.z)] = Math.min(REGOLITH_PER_CELL, (state.mined[key(cell.x, cell.z)] ?? 0) + amount);
    return;
  }
  if (r.task === 'docked') {
    const dock = state.buildings.find(b => b.id === r.target?.id && b.built);
    if (!dock) { r.task = 'idle'; r.target = null; return; }
    const load = r.load ?? 'regolith';
    // Cargo this dock never takes (ice parked at a hopper in an old save) sends the rover on.
    if (r.cargo >= 1 && (dock.type === 'melter') !== (load === 'ice')) { r.task = 'idle'; r.target = null; return chooseTask(state, r); }
    // Whole units go in; any fractional remainder stays aboard. A melter takes ice as fast as it melts.
    const units = Math.min(Math.floor(r.cargo), dockSpace(dock, load), Math.ceil(ROVER.unloadRate * dt));
    if (units > 0) { dock.inv[load] += units; r.cargo -= units; }
    if (powered) r.charge = Math.min(1, r.charge + ROVER.chargeRate * dt);
    const unloaded = r.cargo < 1, charged = r.charge >= 0.95 || (!powered && r.charge > ROVER.low);
    if (unloaded && charged && nearestMiningCell(state, r)) { r.task = 'idle'; chooseTask(state, r); }
  }
}

/** Changes whenever robots must replan their routes. */
export const robotTopology = state => state.buildings.filter(b => b.built && (!DEFS[b.type].walkable || DEFS[b.type].enclosed)).map(b => b.id).join(',');
export function stepProduction(state, dt, powered) {
  const index = cellIndex(state);
  if (powered) stepBelts(state, index, dt);
  stepMachines(state, index, dt, powered);
  const topology = robotTopology(state);
  for (const r of state.robots) {
    if (r.kind !== 'miner') continue;
    if (r.area != null && !state.miningAreas?.some(a => a.id === r.area)) delete r.area;
    stepRover(state, r, dt, powered, topology);
  }
}
