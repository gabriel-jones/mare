import { caveWalkable } from './caves.js';
import { terrainReason } from './terrain.js';
import { CELL_SIZE, DEFS, ITEMS, dims, footprint } from './defs.js';
import { createRover, ensureBuildingState, productionDemand, stepProduction, MINING_RADIUS, REGOLITH_PER_CELL, ROVER, PROCESSOR_INPUT_CAP, PROCESSOR_OUTPUT_CAP, BELT_SPACING } from './production.js';
export { CELL_SIZE, DEFS, footprint } from './defs.js';
/** Pure, serializable simulation. Positions use 2m cells; building anchors are minimum cells. */
export const DAY_DURATION = 240;
export const SAVE_VERSION = 2;

export function createState(seed = 1847) {
  if (!Number.isSafeInteger(seed)) throw new Error('Seed must be an integer.');
  return { version: SAVE_VERSION, seed, time: 0, inventory: { metal: 240, silicon: 100 }, reserves: { oxygen: 0 }, player: { x: 0, z: 8, y: 0 }, buildings: [], nextId: 1, robots: [createRover()], miningArea: null, mined: {}, power: { generation: 0, demand: 0, stored: 0, capacity: 0, supplied: 0, powered: true } };
}
const validRotation = r => Number.isInteger(r) && r >= 0 && r <= 3;
const finite = n => typeof n === 'number' && Number.isFinite(n);
function geometryReason(state, type, x, z, rotation) {
  const cells = footprint(type, x, z, rotation);
  if (!cells.length) return 'Invalid building or grid position.';
  if (cells.some(c => c.x < -58 || c.x > 58 || c.z < -58 || c.z > 58)) return 'Outside the construction area.';
  if (cells.some(c => c.x >= -4 && c.x <= 4 && c.z >= -8 && c.z <= -2)) return 'Keep the Starship landing pad clear.';
  const occupied = new Set(state.buildings.flatMap(b => footprint(b.type, b.x, b.z, b.rotation).map(c => `${c.x},${c.z}`)));
  if (cells.some(c => occupied.has(`${c.x},${c.z}`))) return 'Another building or blueprint occupies this space.';
  return null;
}
export function validatePlacement(state, type, x, z, rotation = 0) {
  if(state.player.cave!=null)return {ok:false,reason:'Construction is unavailable underground.'};
  const reason = geometryReason(state, type, x, z, rotation);
  if (reason) return { ok: false, reason };
  const groundReason = terrainReason(state.seed, footprint(type,x,z,rotation));
  if (groundReason) return { ok:false, reason:groundReason };
  for (const [item, amount] of Object.entries(DEFS[type].cost)) {
    if (!finite(state.inventory[item]) || state.inventory[item] < amount) return { ok: false, reason: `Not enough ${item}.` };
  }
  return { ok: true, reason: 'Click to place blueprint.' };
}
export function placeBlueprint(state, type, x, z, rotation = 0) {
  const result = validatePlacement(state, type, x, z, rotation);
  if (!result.ok) return result;
  for (const [item, amount] of Object.entries(DEFS[type].cost)) state.inventory[item] -= amount;
  const id = state.nextId++;
  state.buildings.push({ id, type, x, z, rotation, progress: 0, built: false });
  return { ok: true, reason: 'Blueprint placed. Approach and hold E to construct.', id };
}
export function construct(state, id, dt) {
  if(state.player.cave!=null)return {ok:false,reason:'Construction is unavailable underground.'};
  const b = state.buildings.find(b => b.id === id);
  if (!b) return { ok: false, reason: 'Blueprint no longer exists.' };
  if (b.built) return { ok: false, reason: 'Already constructed.' };
  if (!finite(dt) || dt <= 0) return { ok: false, reason: 'Construction time must be positive.' };
  const cells = footprint(b.type, b.x, b.z, b.rotation);
  const cx = cells.reduce((sum,c) => sum+c.x*CELL_SIZE,0)/cells.length;
  const cz = cells.reduce((sum,c) => sum+c.z*CELL_SIZE,0)/cells.length;
  if (Math.hypot(state.player.x-cx,state.player.z-cz) > 5) return { ok: false, reason: 'Move within 5 metres to construct.' };
  // Match controller collision padding: completing a machine around the player
  // would otherwise leave them unable to take even the first step out.
  if (!DEFS[b.type].walkable) {
    const { w, d } = dims(b.type, b.rotation), radius = 0.32;
    if (state.player.x > b.x * CELL_SIZE - 1 - radius && state.player.x < (b.x + w - 1) * CELL_SIZE + 1 + radius && state.player.z > b.z * CELL_SIZE - 1 - radius && state.player.z < (b.z + d - 1) * CELL_SIZE + 1 + radius) {
      return { ok: false, reason: 'Step outside the footprint to construct this machine.' };
    }
  }
  b.progress = Math.min(1, b.progress + dt / DEFS[b.type].buildTime);
  b.built = b.progress >= 1;
  ensureBuildingState(b);
  return { ok: true, reason: b.built ? 'Construction complete.' : 'Constructing…' };
}
export function cancelBlueprint(state, id) {
  const index = state.buildings.findIndex(b => b.id === id);
  if (index < 0) return { ok: false, reason: 'Blueprint no longer exists.' };
  const b = state.buildings[index];
  if (b.built) return { ok: false, reason: 'Completed buildings cannot be cancelled.' };
  for (const [item, amount] of Object.entries(DEFS[b.type].cost)) state.inventory[item] += amount;
  state.buildings.splice(index,1);
  return { ok: true, reason: 'Blueprint cancelled; materials returned.' };
}
/** Dismantles a finished structure for a full refund. Carried metal and silicon are returned; regolith is spilled. */
export function deconstruct(state, id) {
  const index = state.buildings.findIndex(b => b.id === id);
  if (index < 0) return { ok: false, reason: 'Structure no longer exists.' };
  const b = state.buildings[index];
  if (!b.built) return cancelBlueprint(state, id);
  for (const [item, amount] of Object.entries(DEFS[b.type].cost)) state.inventory[item] += amount;
  for (const store of [b.inv, b.out]) for (const item of ['metal', 'silicon']) state.inventory[item] += Math.floor(store?.[item] ?? 0);
  for (const item of b.items ?? []) if (item.type !== 'regolith') state.inventory[item.type] += 1;
  state.buildings.splice(index, 1);
  return { ok: true, reason: `${DEFS[b.type].name} dismantled; materials returned.` };
}
/** Transfers usable materials from a storage crate into the player's inventory. */
export function collectStorage(state, id) {
  const b = state.buildings.find(b => b.id === id);
  if (!b || b.type !== 'storage' || !b.built) return { ok: false, reason: 'No storage crate here.' };
  const metal = b.inv.metal, silicon = b.inv.silicon;
  if (!metal && !silicon) return { ok: false, reason: b.inv.regolith ? 'This crate only holds raw regolith.' : 'Storage crate is empty.' };
  state.inventory.metal += metal; state.inventory.silicon += silicon;
  b.inv.metal = 0; b.inv.silicon = 0;
  return { ok: true, reason: `Collected ${[metal && `${metal} metal`, silicon && `${silicon} silicon`].filter(Boolean).join(' and ')}.`, metal, silicon };
}
export function setMiningArea(state, x, z) {
  if (state.player.cave != null) return { ok: false, reason: 'Mining areas are set on the surface.' };
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z) || Math.abs(x) > 58 - MINING_RADIUS || Math.abs(z) > 58 - MINING_RADIUS) return { ok: false, reason: 'Outside the mining range.' };
  state.miningArea = { x, z };
  return { ok: true, reason: 'Mining area set. The rover will dig here and unload at the nearest hopper.' };
}
export function daylightAt(time) { return Math.max(0,Math.sin(time / DAY_DURATION * Math.PI * 2 + Math.PI / 3)); }
export function tick(state, dt) {
  if (!finite(dt) || dt < 0) throw new Error('Simulation time must be nonnegative and finite.');
  state.time += dt;
  // Production runs on the previous tick's supply state, so derived power always matches the saved state.
  if (dt > 0) stepProduction(state, dt, state.power.powered !== false);
  const daylight = daylightAt(state.time), night = daylight <= 0.05;
  let generation = 0, demand = productionDemand(state), capacity = 0;
  for (const b of state.buildings) {
    if (!b.built) continue;
    if (b.type === 'solar') generation += 8 * daylight;
    if (b.type === 'battery') capacity += 180;
    if (b.type === 'habitat') demand += 1;
    if (b.type === 'lamp' && night) demand += 0.2;
  }
  const previous = Math.min(capacity, Math.max(0,state.power.stored));
  const net = generation - demand;
  const stored = Math.min(capacity,Math.max(0,previous+net*dt));
  const supplied = generation >= demand ? demand : Math.min(demand,generation + (dt > 0 ? previous/dt : (previous > 0 ? demand : 0)));
  state.power = { generation, demand, stored, capacity, supplied, powered: supplied + 1e-8 >= demand };
}
export function serialize(state) { return JSON.stringify(state); }

const count = (n, max) => finite(n) && n >= 0 && n <= max;
function restoreBuilding(raw) {
  const b = { id: raw.id, type: raw.type, x: raw.x, z: raw.z, rotation: raw.rotation, progress: raw.progress, built: raw.built };
  if (!b.built) return b;
  if (b.type === 'conveyor' && raw.items != null) {
    if (!Array.isArray(raw.items) || raw.items.length > Math.ceil(1 / BELT_SPACING) + 1) throw new Error('Invalid belt contents.');
    let previous = Infinity;
    b.items = raw.items.map(item => {
      if (!ITEMS.includes(item?.type) || !count(item.p, 1) || item.p > previous) throw new Error('Invalid belt contents.');
      previous = item.p;
      return { type: item.type, p: item.p };
    });
  }
  const limits = { hopper: [DEFS.hopper.capacity, ['regolith']], storage: [DEFS.storage.capacity, ITEMS], processor: [PROCESSOR_INPUT_CAP, ['regolith']] }[b.type];
  if (limits && raw.inv != null) {
    b.inv = {};
    for (const item of limits[1]) { if (!count(raw.inv[item], limits[0])) throw new Error('Invalid storage contents.'); b.inv[item] = raw.inv[item]; }
  }
  if (b.type === 'processor') {
    if (raw.out != null) { b.out = {}; for (const item of ['metal', 'silicon']) { if (!count(raw.out?.[item], PROCESSOR_OUTPUT_CAP)) throw new Error('Invalid processor output.'); b.out[item] = raw.out[item]; } }
    if (raw.work != null) { if (!count(raw.work, 1)) throw new Error('Invalid processor progress.'); b.work = raw.work; }
  }
  return ensureBuildingState(b);
}
function restoreRobot(raw, index) {
  const tasks = ['idle', 'toMine', 'mining', 'toHopper', 'docked', 'blocked'];
  if (!raw || raw.kind !== 'miner' || !Number.isSafeInteger(raw.id) || !finite(raw.x) || !finite(raw.z) || Math.abs(raw.x) > 125 || Math.abs(raw.z) > 125 || !tasks.includes(raw.task) || !count(raw.cargo, ROVER.capacity) || !count(raw.charge, 1) || !finite(raw.facing)) throw new Error('Invalid robot.');
  const r = { ...createRover(raw.id), x: raw.x, z: raw.z, facing: raw.facing, task: raw.task, cargo: raw.cargo, charge: raw.charge, target: null };
  if (raw.target != null) {
    if (!Number.isSafeInteger(raw.target.x) || !Number.isSafeInteger(raw.target.z) || (raw.target.id != null && !Number.isSafeInteger(raw.target.id))) throw new Error('Invalid robot target.');
    r.target = raw.target.id != null ? { id: raw.target.id, x: raw.target.x, z: raw.target.z } : { x: raw.target.x, z: raw.target.z };
  } else if (r.task !== 'idle') r.task = 'idle';
  if (raw.wait != null) { if (!count(raw.wait, 10)) throw new Error('Invalid robot.'); r.wait = raw.wait; }
  return r;
}
export function deserialize(text) {
  const raw = JSON.parse(text);
  if (!raw || (raw.version !== 1 && raw.version !== SAVE_VERSION) || !Number.isSafeInteger(raw.seed) || !finite(raw.time) || raw.time < 0 || !Array.isArray(raw.buildings) || raw.buildings.length > 13689) throw new Error('Invalid or unsupported save.');
  const state = createState(raw.seed);
  state.time = raw.time;
  for (const item of ['metal','silicon']) {
    if (!finite(raw.inventory?.[item]) || raw.inventory[item] < 0) throw new Error('Invalid inventory.');
    state.inventory[item] = raw.inventory[item];
  }
  for (const axis of ['x','y','z']) {
    const coordinate = raw.player?.[axis];
    if (!finite(coordinate) || (axis === 'y' ? coordinate < 0 || coordinate > 10 : Math.abs(coordinate) > 125)) throw new Error('Invalid player position.');
    state.player[axis] = raw.player[axis];
  }
  if(raw.player.cave!=null){if(!Number.isInteger(raw.player.cave)||raw.player.cave<0||raw.player.cave>2||!caveWalkable(raw.seed,raw.player.cave,state.player.x,state.player.z))throw new Error('Invalid cave position.');state.player.cave=raw.player.cave;}
  if(raw.exploredCaves)state.exploredCaves={};
  if(raw.exploredCaves&&typeof raw.exploredCaves==='object')for(const [id,cells] of Object.entries(raw.exploredCaves)){if(/^[0-2]$/.test(id)&&Array.isArray(cells))state.exploredCaves[id]=cells.filter(k=>typeof k==='string'&&/^-?\d{1,2},-?\d{1,2}$/.test(k)).slice(0,6000);}
  const ids = new Set();
  for (const b of raw.buildings) {
    if (!b || !Number.isSafeInteger(b.id) || b.id < 1 || ids.has(b.id) || !finite(b.progress) || b.progress < 0 || b.progress > 1 || typeof b.built !== 'boolean' || b.built !== (b.progress === 1) || !validRotation(b.rotation)) throw new Error('Invalid building.');
    const reason = geometryReason(state,b.type,b.x,b.z,b.rotation);
    if (reason) throw new Error(`Invalid building: ${reason}`);
    state.buildings.push(restoreBuilding(b));
    ids.add(b.id);
  }
  if (!Number.isSafeInteger(raw.nextId) || raw.nextId <= Math.max(0,...ids)) throw new Error('Invalid entity sequence.');
  state.nextId = raw.nextId;
  if (!finite(raw.power?.stored) || raw.power.stored < 0) throw new Error('Invalid battery charge.');
  state.power.stored = raw.power.stored;
  // Version 1 colonies predate mining: they receive the starting rover and empty reserves.
  if (raw.version === SAVE_VERSION) {
    if (!count(raw.reserves?.oxygen, 1e9)) throw new Error('Invalid reserves.');
    state.reserves.oxygen = raw.reserves.oxygen;
    if (!Array.isArray(raw.robots) || raw.robots.length > 64) throw new Error('Invalid robots.');
    state.robots = raw.robots.map(restoreRobot);
    if (raw.miningArea != null) {
      if (!Number.isSafeInteger(raw.miningArea.x) || !Number.isSafeInteger(raw.miningArea.z) || Math.abs(raw.miningArea.x) > 58 || Math.abs(raw.miningArea.z) > 58) throw new Error('Invalid mining area.');
      state.miningArea = { x: raw.miningArea.x, z: raw.miningArea.z };
    }
    if (!raw.mined || typeof raw.mined !== 'object' || Array.isArray(raw.mined)) throw new Error('Invalid mining record.');
    const mined = Object.entries(raw.mined);
    if (mined.length > 13689) throw new Error('Invalid mining record.');
    for (const [cell, amount] of mined) {
      if (!/^-?\d{1,2},-?\d{1,2}$/.test(cell) || !count(amount, REGOLITH_PER_CELL)) throw new Error('Invalid mining record.');
      state.mined[cell] = amount;
    }
  }
  tick(state,0);
  return state;
}
