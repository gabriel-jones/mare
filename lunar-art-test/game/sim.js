import { caveWalkable } from './caves.js';
import { terrainReason } from './terrain.js';
/** Pure, serializable simulation. Positions use 2m cells; building anchors are minimum cells. */
export const CELL_SIZE = 2;
export const DAY_DURATION = 240;
export const DEFS = Object.freeze({
  solar: { name: 'Solar array', w: 2, d: 2, cost: { metal: 18, silicon: 8 }, buildTime: 4, description: 'Generates up to 8 kW in sunlight.' },
  battery: { name: 'Battery bank', w: 1, d: 2, cost: { metal: 14, silicon: 5 }, buildTime: 3, description: 'Stores 180 kJ of surplus power for the lunar night.' },
  hopper: { name: 'Regolith hopper', w: 2, d: 2, cost: { metal: 20, silicon: 2 }, buildTime: 4, description: 'A storage foundation for future mining operations.' },
  habitat: { name: 'Habitat', w: 2, d: 2, cost: { metal: 32, silicon: 8 }, buildTime: 6, description: 'A four-square walkable shelter. Consumes 1 kW.' },
  lamp: { name: 'Work light', w: 1, d: 1, cost: { metal: 4, silicon: 1 }, buildTime: 1.5, description: 'Lights the base at night. Consumes 0.2 kW.' },
});

export function createState(seed = 1847) {
  if (!Number.isSafeInteger(seed)) throw new Error('Seed must be an integer.');
  return { version: 1, seed, time: 0, inventory: { metal: 240, silicon: 100 }, player: { x: 0, z: 8, y: 0 }, buildings: [], nextId: 1, power: { generation: 0, demand: 0, stored: 0, capacity: 0, supplied: 0, powered: true } };
}
const validRotation = r => r === 0 || r === 1;
const finite = n => typeof n === 'number' && Number.isFinite(n);
export function footprint(type, x, z, rotation = 0) {
  const def = DEFS[type];
  if (!def || !Number.isSafeInteger(x) || !Number.isSafeInteger(z) || !validRotation(rotation)) return [];
  const w = rotation ? def.d : def.w, d = rotation ? def.w : def.d;
  const cells = [];
  for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) cells.push({ x: x + dx, z: z + dz });
  return cells;
}
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
  if (b.type !== 'habitat') {
    const def = DEFS[b.type], w = b.rotation ? def.d : def.w, d = b.rotation ? def.w : def.d, radius = 0.32;
    if (state.player.x > b.x * CELL_SIZE - 1 - radius && state.player.x < (b.x + w - 1) * CELL_SIZE + 1 + radius && state.player.z > b.z * CELL_SIZE - 1 - radius && state.player.z < (b.z + d - 1) * CELL_SIZE + 1 + radius) {
      return { ok: false, reason: 'Step outside the footprint to construct this machine.' };
    }
  }
  b.progress = Math.min(1, b.progress + dt / DEFS[b.type].buildTime);
  b.built = b.progress >= 1;
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
export function daylightAt(time) { return Math.max(0,Math.sin(time / DAY_DURATION * Math.PI * 2 + Math.PI / 3)); }
export function tick(state, dt) {
  if (!finite(dt) || dt < 0) throw new Error('Simulation time must be nonnegative and finite.');
  state.time += dt;
  const daylight = daylightAt(state.time), night = daylight <= 0.05;
  let generation = 0, demand = 0, capacity = 0;
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
export function deserialize(text) {
  const raw = JSON.parse(text);
  if (!raw || raw.version !== 1 || !Number.isSafeInteger(raw.seed) || !finite(raw.time) || raw.time < 0 || !Array.isArray(raw.buildings) || raw.buildings.length > 1369) throw new Error('Invalid or unsupported save.');
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
    if (!b || !Number.isSafeInteger(b.id) || b.id < 1 || ids.has(b.id) || !finite(b.progress) || b.progress < 0 || b.progress > 1 || typeof b.built !== 'boolean' || b.built !== (b.progress === 1)) throw new Error('Invalid building.');
    const reason = geometryReason(state,b.type,b.x,b.z,b.rotation);
    if (reason) throw new Error(`Invalid building: ${reason}`);
    state.buildings.push({id:b.id,type:b.type,x:b.x,z:b.z,rotation:b.rotation,progress:b.progress,built:b.built});
    ids.add(b.id);
  }
  if (!Number.isSafeInteger(raw.nextId) || raw.nextId <= Math.max(0,...ids)) throw new Error('Invalid entity sequence.');
  state.nextId = raw.nextId;
  if (!finite(raw.power?.stored) || raw.power.stored < 0) throw new Error('Invalid battery charge.');
  state.power.stored = raw.power.stored;
  tick(state,0);
  return state;
}
