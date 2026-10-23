import { CELL_SIZE, footprint } from './defs.js';
import { drive, isUnreachable, machineRoom, markUnreachable, nearestDock } from './production.js';
import { LAUNCH, createHauler, shipOnPad } from './space.js';

/** Haulers move goods from where they pile up to the machine (or Starship) that needs them. */
export const HAULER = Object.freeze({ capacity: 10, transfer: 10, drain: 1 / 400, chargeRate: 1 / 20, chargePower: 1, low: 0.25 });
const GOODS = ['metal', 'silicon', 'frame', 'wing', 'chip', 'satellite'];
const key = (x, z) => `${x},${z}`;

/** Finished goods a building will hand over. */
export function stockOf(b, item) {
  if (!b.built) return 0;
  if (b.type === 'storage') return Math.floor(b.inv[item] ?? 0);
  if (b.type === 'processor' || b.type === 'fabricator' || b.type === 'assembler') return Math.floor(b.out?.[item] ?? 0);
  return 0;
}
/** Units of `item` a destination will still take, minus what other haulers already carry there. */
function roomAt(state, dest, item, self) {
  const raw = dest === 'ship' ? (item === 'satellite' && shipOnPad(state) ? LAUNCH.payload - state.ship.payload : 0) : machineRoom(dest, item);
  const coming = state.robots.filter(h => h !== self && h.kind === 'hauler' && h.job?.item === item && h.job.to === (dest === 'ship' ? 'ship' : dest.id)).reduce((s, h) => s + (h.cargo || h.job.amount), 0);
  return Math.max(0, raw - coming);
}
const destinations = state => ['ship', ...['assembler', 'fabricator'].flatMap(type => state.buildings.filter(b => b.built && b.type === type))];
const distance = (r, b) => Math.hypot(b.x * CELL_SIZE - r.x, b.z * CELL_SIZE - r.z);

/** Free cells around the landing pad, nearest first. */
function shipCell(state, r) {
  const occupied = new Set(state.buildings.flatMap(b => footprint(b.type, b.x, b.z, b.rotation).map(c => key(c.x, c.z))));
  const ring = [];
  for (let z = -8; z <= -2; z++) ring.push({ x: 5, z }, { x: -5, z });
  for (let x = -4; x <= 4; x++) ring.push({ x, z: -1 }, { x, z: -9 });
  return ring.filter(c => !occupied.has(key(c.x, c.z)) && !isUnreachable(state, r, c.x, c.z)).sort((a, b) => distance(r, a) - distance(r, b))[0] ?? null;
}
function dockAt(state, r, id) {
  if (id === 'ship') { const c = shipCell(state, r); return c && { id: 'ship', x: c.x, z: c.z }; }
  const d = nearestDock(state, r, b => b.id === id);
  return d && { id, x: d.cell.x, z: d.cell.z };
}

/** The best pickup-and-delivery pair: satellites for the ship first, then parts, then raw materials. */
function chooseJob(state, r) {
  for (const dest of destinations(state)) {
    for (const item of GOODS) {
      const room = roomAt(state, dest, item, r);
      if (room < 1) continue;
      const sources = state.buildings.filter(b => b !== dest && stockOf(b, item) >= 1).sort((a, b) => distance(r, a) - distance(r, b));
      for (const source of sources) {
        const amount = Math.min(item === 'satellite' ? 1 : HAULER.capacity, room, stockOf(source, item));
        const target = dockAt(state, r, source.id);
        if (target) return { job: { item, amount, from: source.id, to: dest === 'ship' ? 'ship' : dest.id }, target };
      }
    }
  }
  return null;
}
/** Where leftover cargo goes: a machine that wants it, else the nearest crate with room. */
function dropTarget(state, r) {
  for (const dest of destinations(state)) if (roomAt(state, dest, r.load, r) >= 1) { const t = dockAt(state, r, dest === 'ship' ? 'ship' : dest.id); if (t) return t; }
  const crate = nearestDock(state, r, b => b.type === 'storage' && Object.values(b.inv).reduce((s, n) => s + n, 0) < 60);
  return crate && { id: crate.hopper.id, x: crate.cell.x, z: crate.cell.z };
}
const home = (state, r) => state.buildings.find(b => b.id === r.home && b.built) ?? state.buildings.find(b => b.type === 'dock' && b.built);

function plan(state, r) {
  r.job = null; r.target = null; r.task = 'idle';
  const base = home(state, r);
  if (r.charge < HAULER.low && base) {
    const d = dockAt(state, r, base.id);
    if (d) { r.home = base.id; r.task = 'toHome'; r.target = d; return; }
  }
  if (r.cargo >= 1) { const t = dropTarget(state, r); if (t) { r.task = 'toDrop'; r.target = t; r.job = { item: r.load, amount: r.cargo, from: null, to: t.id }; } return; }
  const pick = chooseJob(state, r);
  if (pick) { r.task = 'toPickup'; r.job = pick.job; r.target = pick.target; return; }
  if (r.charge < 1 && base) { const d = dockAt(state, r, base.id); if (d) { r.home = base.id; r.task = 'toHome'; r.target = d; } }
}

function deliver(state, r) {
  const id = r.target.id;
  let room;
  if (id === 'ship') room = shipOnPad(state) && r.load === 'satellite' ? LAUNCH.payload - state.ship.payload : 0;
  else {
    const b = state.buildings.find(b => b.id === id && b.built);
    if (!b) return;
    room = b.type === 'storage' ? 60 - Object.values(b.inv).reduce((s, n) => s + n, 0) : machineRoom(b, r.load);
    room = Math.min(room, r.cargo);
    if (room > 0) { b.inv[r.load] += room; r.cargo -= room; }
    return;
  }
  const n = Math.min(room, r.cargo);
  state.ship.payload += n; r.cargo -= n;
}

export function stepHaulers(state, dt, powered, topology) {
  for (const r of state.robots) if (r.kind === 'hauler') stepHauler(state, r, dt, powered, topology);
}
function stepHauler(state, r, dt, powered, topology) {
  if (r.task === 'blocked' && (r.wait = (r.wait ?? 0) - dt) > 0) return;
  delete r.wait;
  if (r.task === 'idle' || r.task === 'blocked') { plan(state, r); if (r.task === 'idle') return; }
  if (r.task === 'charging') {
    if (powered) r.charge = Math.min(1, r.charge + HAULER.chargeRate * dt);
    // A charged hauler checks for work; with nothing to do it stays docked and tops up.
    if (r.charge >= 0.95 || (!powered && r.charge > HAULER.low)) { plan(state, r); if (r.task === 'toHome') r.task = 'charging'; }
    return;
  }
  r.charge = Math.max(0, r.charge - HAULER.drain * dt);
  const goal = r.target;
  if (goal.id !== 'ship' && !state.buildings.some(b => b.id === goal.id && b.built)) return plan(state, r);
  const result = drive(state, r, goal, dt, topology);
  if (result === 'unreachable') { markUnreachable(state, r, goal); r.task = 'blocked'; r.wait = 0.5; r.job = null; return; }
  if (result !== 'arrived') return;
  if (r.task === 'toHome') { r.task = 'charging'; return; }
  if (r.task === 'toPickup') {
    const source = state.buildings.find(b => b.id === goal.id), item = r.job.item;
    const n = Math.min(r.job.amount, stockOf(source, item), item === 'satellite' ? 1 : HAULER.capacity);
    if (n >= 1) { (source.type === 'storage' ? source.inv : source.out)[item] -= n; r.cargo = n; r.load = item; }
    r.job = null; r.task = 'idle';
    return plan(state, r);
  }
  if (r.task === 'toDrop') { deliver(state, r); if (r.cargo < 1) { r.cargo = 0; r.load = null; } r.job = null; r.task = 'idle'; return plan(state, r); }
}

export const haulerCharging = r => r.kind === 'hauler' && r.task === 'charging' && r.charge < 1;
export const haulerDemand = state => state.robots.filter(haulerCharging).length * HAULER.chargePower;

const finite = n => typeof n === 'number' && Number.isFinite(n);
export function restoreHauler(raw) {
  const tasks = ['idle', 'toPickup', 'toDrop', 'toHome', 'charging', 'blocked'];
  if (!Number.isSafeInteger(raw.id) || !Number.isSafeInteger(raw.home) || !finite(raw.x) || !finite(raw.z) || Math.abs(raw.x) > 125 || Math.abs(raw.z) > 125 || !finite(raw.facing)
    || !tasks.includes(raw.task) || !(finite(raw.charge) && raw.charge >= 0 && raw.charge <= 1) || !(Number.isInteger(raw.cargo) && raw.cargo >= 0 && raw.cargo <= HAULER.capacity)
    || (raw.load != null && !GOODS.includes(raw.load))) throw new Error('Invalid robot.');
  // Routes and jobs are replanned after loading.
  return Object.assign(createHauler(raw.id, raw.home), { x: raw.x, z: raw.z, facing: raw.facing, charge: raw.charge, cargo: raw.load ? raw.cargo : 0, load: raw.load ?? null, task: raw.task === 'charging' ? 'charging' : 'idle' });
}
