import { restoreArms } from './arms.js';
import { caveWalkable, caveLayout, CAVE_ZONES } from './caves.js';
import { surfaceHeightAt, terrainReason } from './terrain.js';
import { CELL_SIZE, DEFS, DIRS, ITEMS, ITEM_INFO, dims, footprint } from './defs.js';
import { airlockApron, habitatLayout, isRoom, trapsPlayer } from './habitat.js';
import * as inv from './inventory.js';
import { LIFE, STARTING, ensureLifeState, hunger, lifeDemand, roomStatus, stepLife, useLife, STATIONS, isStation } from './life.js';
import { CROPS, RECIPES as DISHES, isGrower, restoreBuffs } from './farm.js';
import { createRover, ensureBuildingState, productionDemand, stepProduction, MINING_RADIUS, MAX_MINING_AREAS, REGOLITH_PER_CELL, ROVER, PROCESSOR_INPUT_CAP, PROCESSOR_OUTPUT_CAP, BELT_SPACING, MELT, FAB, ASSEMBLY, RECIPES, KIT, cycleRecipe, robotTopology } from './production.js';
import { createResearch, createShip, robotRoom, spawnRobot, ROBOT_LIMIT, ROBOT_NAME, lockedReason, restoreResearch, restoreShip, spaceDemand, stepSpace, studyFinds, touchesPad, REACTOR_POWER } from './space.js';
import { restoreDelve } from './delve.js';
import { restorePeril } from './peril.js';
import { restoreInfest } from './infest.js';
import { GOO, ensureVat, gooDemand, restoreGoo, stepGoo, useVat } from './goo.js';
import { BIO, THERMAL, ensurePower, steadyGeneration, stepFuelCells, thermalCapacity } from './power.js';
import { haulerDemand, restoreHauler, stepHaulers } from './hauler.js';
import { createMission, processorUnlocked, restoreMission, stepMission } from './mission.js';
import { available, baseCount, BASE_REACH, canReceive, crates, emptyCrate, inReach, pay, receive, stash, takeSlot } from './storage.js';
export { CELL_SIZE, DEFS, footprint } from './defs.js';
/** Pure, serializable simulation. Positions use 2m cells; building anchors are minimum cells. */
export const DAY_DURATION = 240;
export const SAVE_VERSION = 6;
export const PROCESSOR_LOCKED = "Locked: the ship's processor core is cracked. Recover a replacement from the crater.";
const PLAYER_RADIUS = 0.32;
const key = (x, z) => `${x},${z}`;

export function createState(seed = 1847) {
  if (!Number.isSafeInteger(seed)) throw new Error('Seed must be an integer.');
  return { version: SAVE_VERSION, seed, time: 0, inventory: inv.createInventory({ metal: 240, silicon: 100, meal: STARTING.meals, pistol: 1, rounds: 24 }), reserves: { oxygen: STARTING.oxygen, water: STARTING.water }, player: { x: 0, z: 8, y: 0, satiety: 100, arms: { held: 'pistol', loaded: { pistol: 6, smg: 0, rifle: 0, flamethrower: 0, katana: 0 }, cooldown: 0, reloading: 0 } }, buildings: [], nextId: 1, robots: [createRover()], miningAreas: [], nextAreaId: 1, mined: {}, mission: createMission(), ship: createShip(), satellites: 0, research: createResearch(), power: { generation: 0, demand: 0, stored: 0, capacity: 0, supplied: 0, powered: true } };
}
const validRotation = r => Number.isInteger(r) && r >= 0 && r <= 3;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const ensureState = b => ensurePower(ensureVat(ensureLifeState(ensureBuildingState(b))));
/** Floor squares and everything standing on or beside them, by cell. */
function occupancy(buildings) {
  const floor = new Map(), top = new Map();
  for (const b of buildings) for (const c of footprint(b.type, b.x, b.z, b.rotation)) (isRoom(b) ? floor : top).set(key(c.x, c.z), b);
  return { floor, top };
}
function geometryReason(state, type, x, z, rotation, occupied = occupancy(state.buildings)) {
  const cells = footprint(type, x, z, rotation), def = DEFS[type];
  if (!cells.length) return 'Invalid building or grid position.';
  if (cells.some(c => c.x < -58 || c.x > 58 || c.z < -58 || c.z > 58)) return 'Outside the construction area.';
  if (cells.some(c => c.x >= -4 && c.x <= 4 && c.z >= -8 && c.z <= -2)) return 'Keep the Starship landing pad clear.';
  if (def.layer === 'interior') {
    if (cells.some(c => occupied.floor.get(key(c.x, c.z))?.type !== def.needs)) return `Place inside a ${DEFS[def.needs].name.toLowerCase()}.`;
    if (cells.some(c => occupied.top.has(key(c.x, c.z)))) return 'Something already stands here.';
    return null;
  }
  if (cells.some(c => occupied.floor.has(key(c.x, c.z)) || occupied.top.has(key(c.x, c.z)))) return 'Another building or blueprint occupies this space.';
  return null;
}
/** Airlocks attach to a room and open onto clear ground; nothing solid or roofed may cover an airlock's entrance. */
function roomReason(state, type, x, z, rotation) {
  const def = DEFS[type], { floor, top } = occupancy(state.buildings);
  if (def.airlock) {
    const [dx, dz] = DIRS[rotation], back = floor.get(key(x - dx, z - dz)), front = key(x + dx, z + dz);
    if (!back || back.type === 'airlock') return 'Place against a habitat or greenhouse, arrow facing out.';
    if (floor.has(front) || (top.has(front) && !DEFS[top.get(front).type].walkable)) return 'The way out is blocked. Rotate with R.';
  }
  if (def.layer !== 'interior' && (def.layer === 'floor' || !def.walkable)) {
    const aprons = new Set(state.buildings.filter(b => DEFS[b.type].airlock).map(b => { const a = airlockApron(b); return key(a.x, a.z); }));
    if (footprint(type, x, z, rotation).some(c => aprons.has(key(c.x, c.z)))) return 'Keep the airlock entrance clear.';
  }
  if (def.layer === 'floor') {
    // A room has one floor level, so the ground under all of its squares must be close to level.
    const layout = habitatLayout(state.buildings, { blueprints: true }), ground = (cx, cz) => surfaceHeightAt(state.seed, cx * CELL_SIZE, cz * CELL_SIZE);
    const joined = new Set(DIRS.map(([dx, dz]) => layout.roomOf.get(key(x + dx, z + dz))).filter(Boolean));
    const heights = [ground(x, z), ...[...joined].flatMap(room => room.cells.map(c => ground(c.x, c.z)))];
    if (Math.max(...heights) - Math.min(...heights) > 0.5) return 'Ground steps too much from the rest of this room.';
  }
  return null;
}
const trapped = (buildings, p) => p.cave == null && trapsPlayer(buildings, p.x, p.z, PLAYER_RADIUS);
function removalReason(state, b) {
  if (!isRoom(b)) return null;
  const others = state.buildings.filter(o => o !== b);
  const onTop = others.find(o => DEFS[o.type].layer === 'interior' && o.x === b.x && o.z === b.z);
  if (onTop) return `Remove the ${DEFS[onTop.type].name.toLowerCase()} on this square first.`;
  if (b.type !== 'airlock' && others.some(o => o.type === 'airlock' && o.x - DIRS[o.rotation][0] === b.x && o.z - DIRS[o.rotation][1] === b.z)) return 'Remove the airlock attached here first.';
  if (b.built && trapped(others, state.player) && !trapped(state.buildings, state.player)) return "You'd be shut inside. Leave through another airlock first.";
  return null;
}
/** Whether finishing `b` now would shut the player inside walls or a solid footprint. */
export function playerObstructs(state, b) {
  const p = state.player;
  if (p.cave != null || b.built) return false;
  if (isRoom(b)) return trapped([...state.buildings.filter(o => o !== b), { ...b, id: b.id ?? -1, built: true }], p) && !trapped(state.buildings, p);
  if (DEFS[b.type].walkable) return false;
  const { w, d } = dims(b.type, b.rotation), radius = PLAYER_RADIUS;
  return p.x > b.x * CELL_SIZE - 1 - radius && p.x < (b.x + w - 1) * CELL_SIZE + 1 + radius && p.z > b.z * CELL_SIZE - 1 - radius && p.z < (b.z + d - 1) * CELL_SIZE + 1 + radius;
}
export function validatePlacement(state, type, x, z, rotation = 0) {
  if (state.player.cave != null) return { ok: false, reason: 'Construction is unavailable underground.' };
  if (!DEFS[type]) return { ok: false, reason: 'Invalid building or grid position.' };
  if (type === 'processor' && !processorUnlocked(state)) return { ok: false, reason: PROCESSOR_LOCKED };
  const locked = lockedReason(state, type);
  if (locked) return { ok: false, reason: locked };
  if (DEFS[type].nearPad && !touchesPad({ type, x, z, rotation })) return { ok: false, reason: 'Place the tank right beside the landing pad.' };
  const robot = DEFS[type].robot;
  if (robot && robotRoom(state, robot) < 1) return { ok: false, reason: `The colony can run ${ROBOT_LIMIT[robot]} ${ROBOT_NAME[robot].toLowerCase()}s for now.` };
  if (robot === 'hauler' && !state.buildings.some(b => b.type === 'dock' && b.built)) return { ok: false, reason: 'Build a robot dock first: haulers recharge there.' };
  const reason = geometryReason(state, type, x, z, rotation);
  if (reason) return { ok: false, reason };
  if (DEFS[type].layer !== 'interior') {
    const groundReason = terrainReason(state.seed, footprint(type, x, z, rotation));
    if (groundReason) return { ok: false, reason: groundReason };
  }
  const placeReason = roomReason(state, type, x, z, rotation);
  if (placeReason) return { ok: false, reason: placeReason };
  return { ok: true, reason: 'Click to place blueprint.' };
}
/** Machines are numbered per type in build order; a number is only reused after the newest of its type is removed. */
const nextSerial = (buildings, type) => 1 + Math.max(0, ...buildings.filter(b => b.type === type).map(b => b.serial ?? 0));
export function placeBlueprint(state, type, x, z, rotation = 0) {
  const result = validatePlacement(state, type, x, z, rotation);
  if (!result.ok) return result;
  const id = state.nextId++;
  state.buildings.push({ id, type, x, z, rotation, progress: 0, built: false, paid: {}, serial: nextSerial(state.buildings, type) });
  return { ok: true, reason: 'Blueprint placed. Hold E beside it to build; materials go in as it rises.', id };
}
export function construct(state, id, dt) {
  if (state.player.cave != null) return { ok: false, reason: 'Construction is unavailable underground.' };
  const b = state.buildings.find(b => b.id === id);
  if (!b) return { ok: false, reason: 'Blueprint no longer exists.' };
  if (b.built) return { ok: false, reason: 'Already constructed.' };
  if (!finite(dt) || dt <= 0) return { ok: false, reason: 'Construction time must be positive.' };
  const cells = footprint(b.type, b.x, b.z, b.rotation);
  const cx = cells.reduce((sum, c) => sum + c.x * CELL_SIZE, 0) / cells.length;
  const cz = cells.reduce((sum, c) => sum + c.z * CELL_SIZE, 0) / cells.length;
  if (Math.hypot(state.player.x - cx, state.player.z - cz) > 5) return { ok: false, reason: 'Move within 5 metres to construct.' };
  if (DEFS[b.type].layer === 'interior') {
    const { floor } = occupancy(state.buildings);
    if (cells.some(c => !floor.get(key(c.x, c.z))?.built)) return { ok: false, reason: 'Finish the floor here first.' };
  }
  // Match controller collision padding: completing a structure around the player
  // would otherwise leave them unable to take even the first step out.
  if (playerObstructs(state, b)) return { ok: false, reason: isRoom(b) ? 'This would shut you in. Step out, or build an airlock first.' : 'Step outside the footprint to construct this machine.' };
  let next = Math.min(1, b.progress + dt * hunger(state.player.satiety).build / DEFS[b.type].buildTime);
  // Materials go in as the work does: every slice of progress takes its share of the cost, and the work stops
  // where the materials run out.
  if (b.paid) {
    const cost = DEFS[b.type].cost;
    for (const [item, n] of Object.entries(cost)) next = Math.min(next, ((b.paid[item] ?? 0) + available(state, item)) / n);
    if (next <= b.progress) {
      const short = Object.keys(cost).find(item => (b.paid[item] ?? 0) < cost[item] && available(state, item) < 1);
      const name = ITEM_INFO[short]?.name.toLowerCase() ?? short;
      if (!inReach(state) && baseCount(state, short) > 0) return { ok: false, reason: `Out of crate range: the crates holding ${name} are over ${BASE_REACH} m away. Carry it here, or build inside a crate's ring.` };
      return { ok: false, reason: `Need more ${ITEM_INFO[short]?.name.toLowerCase() ?? short}${crates(state).length ? ' in your pockets or base storage' : ''} to keep building.` };
    }
    const due = {};
    for (const [item, n] of Object.entries(cost)) { const d = Math.ceil(n * next - 1e-9) - (b.paid[item] ?? 0); if (d > 0) due[item] = d; }
    pay(state, due);
    for (const [item, d] of Object.entries(due)) b.paid[item] = (b.paid[item] ?? 0) + d;
  }
  b.progress = next;
  b.built = b.progress >= 1;
  if (b.built) delete b.paid;
  if (b.built && DEFS[b.type].robot) {
    state.buildings.splice(state.buildings.indexOf(b), 1);
    const robot = spawnRobot(state, DEFS[b.type].robot, cx, cz);
    return { ok: true, reason: `${ROBOT_NAME[robot.kind]} ${robot.id} is ready.` };
  }
  ensureState(b);
  return { ok: true, reason: b.built ? 'Construction complete.' : 'Constructing…' };
}
/** Pays whatever `b` still owes in one go, as if every remaining slice of construction were paid now. */
export function payInFull(state, b) {
  if (!b.paid) return true;
  const due = Object.fromEntries(Object.entries(DEFS[b.type].cost).map(([item, n]) => [item, n - (b.paid[item] ?? 0)]).filter(([, n]) => n > 0));
  if (!pay(state, due)) return false;
  delete b.paid;
  return true;
}
/** What taking `b` down gives back: the full cost once built, otherwise what construction has taken so far.
 * Blueprints saved before pay-as-you-build carry no `paid` and were paid in full when placed. */
export const refundOf = b => b.built || !b.paid ? DEFS[b.type].cost : b.paid;
/** Returns the materials in `b` to pockets, overflowing into base storage; refused when they will not fit. */
function refund(state, b) {
  if (!canReceive(state, refundOf(b), b)) return false;
  receive(state, refundOf(b), b);
  return true;
}
const crateContents = b => { const held = {}; for (const s of b.slots ?? []) if (s) held[s.item] = (held[s.item] ?? 0) + s.count; return held; };
/** Whether a crate's contents fit in the other crates and pockets alongside its own refund. */
function crateFits(state, b) {
  const goods = crateContents(b);
  for (const [item, n] of Object.entries(DEFS.storage.cost)) goods[item] = (goods[item] ?? 0) + n;
  const pockets = state.inventory.map(s => s && { ...s }), others = crates(state).filter(o => o !== b).map(o => o.slots.map(s => s && { ...s }));
  return Object.entries(goods).every(([item, n]) => { for (const slots of others) n = inv.add(slots, item, n); return inv.add(pockets, item, n) === 0; });
}
const NO_ROOM = 'No room in your pockets or base storage for the materials.';
const CRATE_FULL = 'Nowhere to put what this crate holds. Empty it or build another crate first.';
export function cancelBlueprint(state, id) {
  const index = state.buildings.findIndex(b => b.id === id);
  if (index < 0) return { ok: false, reason: 'Blueprint no longer exists.' };
  const b = state.buildings[index];
  if (b.built) return { ok: false, reason: 'Completed buildings cannot be cancelled.' };
  const blocked = removalReason(state, b);
  if (blocked) return { ok: false, reason: blocked };
  if (!refund(state, b)) return { ok: false, reason: NO_ROOM };
  state.buildings.splice(index, 1);
  return { ok: true, reason: 'Blueprint cancelled; materials returned.' };
}
/** Why `id` cannot be cancelled or dismantled right now, or null when it can. */
export function removalCheck(state, id) {
  const b = state.buildings.find(b => b.id === id);
  if (!b) return 'Nothing to dismantle here.';
  return removalReason(state, b) ?? (b.type === 'storage' && b.built ? (crateFits(state, b) ? null : CRATE_FULL) : canReceive(state, refundOf(b), b) ? null : NO_ROOM);
}
/** Dismantles a finished structure for a full refund. Carried goods inside are returned if they fit; regolith is spilled. */
export function deconstruct(state, id) {
  const index = state.buildings.findIndex(b => b.id === id);
  if (index < 0) return { ok: false, reason: 'Structure no longer exists.' };
  const b = state.buildings[index];
  if (!b.built) return cancelBlueprint(state, id);
  const blocked = removalReason(state, b);
  if (blocked) return { ok: false, reason: blocked };
  if (b.type === 'storage') {
    if (!crateFits(state, b)) return { ok: false, reason: CRATE_FULL };
    const held = crateContents(b); b.slots = emptyCrate();
    for (const [item, n] of Object.entries(held)) inv.add(state.inventory, item, stash(state, item, n, null, b));
  }
  if (!refund(state, b)) return { ok: false, reason: NO_ROOM };
  const contents = {}, give = (item, n) => { if (n > 0 && ITEM_INFO[item]) contents[item] = (contents[item] ?? 0) + n; };
  for (const store of [b.inv, b.out]) for (const item of ['metal', 'silicon', 'frame', 'wing', 'chip', 'satellite']) give(item, Math.floor(store?.[item] ?? 0));
  for (const item of b.items ?? []) if (['metal', 'silicon', 'frame', 'wing', 'chip', 'satellite'].includes(item.type)) give(item.type, 1);
  // Farm machines hand back what they hold: finished goods, and the ingredients of anything not yet made.
  for (const [item, n] of Object.entries(b.ready ?? {})) give(item, n);
  if (isStation(b)) { const st = STATIONS[b.type]; for (const q of b.queue ?? []) for (const [item, n] of Object.entries(st.input(st.product(q)))) give(item, n); }
  if (isGrower(b) && b.grow >= 1) give(b.crop, CROPS[b.crop].yield);
  if (b.type === 'goovat') give('goo', Math.floor(b.stock ?? 0) + (b.seeded ? 1 : 0));
  if (b.type === 'bioreactor') give('goo', Math.floor(b.stock ?? 0));
  const lost = receive(state, contents, b);
  state.buildings.splice(index, 1);
  return { ok: true, reason: `${DEFS[b.type].name} dismantled; materials returned${lost ? `, but ${lost} item${lost > 1 ? 's' : ''} didn't fit and were lost` : ''}.` };
}
/** Takes everything that fits out of one crate into pockets. */
export function collectStorage(state, id) {
  const b = state.buildings.find(b => b.id === id);
  if (!b || b.type !== 'storage' || !b.built) return { ok: false, reason: 'No storage crate here.' };
  if (!b.slots.some(Boolean)) return { ok: false, reason: 'Storage crate is empty.' };
  const taken = {};
  b.slots.forEach((s, i) => { if (!s) return; const item = s.item, r = takeSlot(state, b, i); if (r.ok) taken[item] = (taken[item] ?? 0) + r.moved; });
  if (!Object.keys(taken).length) return { ok: false, reason: 'No room in your pockets.' };
  const left = b.slots.some(Boolean);
  return { ok: true, reason: `Took ${Object.entries(taken).map(([item, n]) => `${n} ${ITEM_INFO[item].name.toLowerCase()}`).join(', ')}${left ? '; your pockets are full' : ''}.`, taken };
}
/** E on a grow bed or galley. */
export function interact(state, id) {
  const b = state.buildings.find(b => b.id === id);
  if (!b) return { ok: false, reason: 'Nothing here.' };
  if (b.type === 'storage') return b.built ? { ok: true, open: 'crate', reason: '' } : { ok: false, reason: 'Finish building it first.' };
  if (!b.built) return { ok: false, reason: 'Finish building it first.' };
  if (b.type === 'fabricator') return { ok: true, reason: `Fabricator now makes: ${cycleRecipe(b)}.` };
  if (b.type === 'assembler') {
    if (b.out.satellite < 1) return { ok: false, reason: 'No finished satellite yet.' };
    if (inv.room(state.inventory, 'satellite') < 1) return { ok: false, reason: 'No free slot for the satellite.' };
    inv.add(state.inventory, 'satellite', 1); b.out.satellite -= 1;
    return { ok: true, reason: 'Satellite collected. Carry it to the Starship.' };
  }
  if (b.type === 'xenolab') return studyFinds(state, id);
  if (b.type === 'goovat' || b.type === 'bioreactor') return useVat(state, b);
  return useLife(state, b);
}
/** Turns an existing belt (blueprint or finished) to face `rotation`; items on it are kept. */
export function rotateBelt(state, id, rotation) {
  const b = state.buildings.find(b => b.id === id);
  if (!b || b.type !== 'conveyor') return { ok: false, reason: 'Only belts can be redirected.' };
  if (!validRotation(rotation)) return { ok: false, reason: 'Invalid direction.' };
  b.rotation = rotation;
  return { ok: true, reason: 'Belt redirected.' };
}
/** Why a mining zone can't be centred on cell x,z, or null. */
export function miningAreaReason(state, x, z) {
  if (state.player.cave != null) return 'Mining zones are set on the surface.';
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z) || Math.abs(x) > 58 - MINING_RADIUS || Math.abs(z) > 58 - MINING_RADIUS) return 'Outside the mining range.';
  if (state.miningAreas.length >= MAX_MINING_AREAS) return `At most ${MAX_MINING_AREAS} mining zones. Remove one in the Robots panel.`;
  const clash = state.miningAreas.find(a => Math.abs(a.x - x) <= MINING_RADIUS * 2 && Math.abs(a.z - z) <= MINING_RADIUS * 2);
  return clash ? `Overlaps zone ${clash.id}.` : null;
}
export function setMiningArea(state, x, z) {
  const reason = miningAreaReason(state, x, z);
  if (reason) return { ok: false, reason };
  const id = state.nextAreaId++;
  state.miningAreas.push({ id, x, z });
  return { ok: true, id, reason: `Zone ${id} marked. Rovers on Auto dig the nearest zone; ice goes straight into a melter.` };
}
export function removeMiningArea(state, id) {
  const before = state.miningAreas.length;
  state.miningAreas = state.miningAreas.filter(a => a.id !== id);
  if (state.miningAreas.length === before) return { ok: false, reason: 'No such zone.' };
  for (const r of state.robots) if (r.area === id) delete r.area;
  return { ok: true, reason: `Zone ${id} removed.` };
}
/** Ties a rover to one zone, or back to Auto (nearest zone with work) with `areaId` null. */
export function assignRover(state, robotId, areaId) {
  const r = state.robots.find(r => r.id === robotId);
  if (!r) return { ok: false, reason: 'No such rover.' };
  if (areaId != null && !state.miningAreas.some(a => a.id === areaId)) return { ok: false, reason: 'No such zone.' };
  if (areaId == null) delete r.area; else r.area = areaId;
  if (r.task === 'toMine' || r.task === 'mining') { r.task = 'idle'; r.target = null; }
  return { ok: true, reason: areaId == null ? 'Rover set to Auto.' : `Rover assigned to zone ${areaId}.` };
}
export function daylightAt(time) { return Math.max(0, Math.sin(time / DAY_DURATION * Math.PI * 2 + Math.PI / 3)); }
export function tick(state, dt) {
  if (!finite(dt) || dt < 0) throw new Error('Simulation time must be nonnegative and finite.');
  state.time += dt;
  // Machines run on the previous tick's supply state, so derived power always matches the saved state.
  const powered = state.power.powered !== false;
  if (dt > 0) { stepProduction(state, dt, powered); stepHaulers(state, dt, powered, robotTopology(state)); stepSpace(state, dt, powered); stepLife(state, dt, powered); stepGoo(state, dt, powered); }
  stepMission(state);
  const daylight = daylightAt(state.time);
  let generation = steadyGeneration(state), demand = productionDemand(state) + spaceDemand(state) + haulerDemand(state) + lifeDemand(state, roomStatus(state)) + gooDemand(state), capacity = thermalCapacity(state);
  for (const b of state.buildings) {
    if (!b.built) continue;
    if (b.type === 'solar') generation += 8 * daylight;
    if (b.type === 'reactor') generation += REACTOR_POWER;
    if (b.type === 'battery') capacity += 180;
  }
  const previous = Math.min(capacity, Math.max(0, state.power.stored));
  const fuel = stepFuelCells(state, dt, { generation, demand, stored: previous, capacity });
  generation += fuel;
  const net = generation - demand;
  const stored = Math.min(capacity, Math.max(0, previous + net * dt));
  const supplied = generation >= demand ? demand : Math.min(demand, generation + (dt > 0 ? previous / dt : (previous > 0 ? demand : 0)));
  state.power = { generation, demand, stored, capacity, supplied, ...(fuel ? { fuel } : {}), powered: supplied + 1e-8 >= demand };
}
export function serialize(state) { return JSON.stringify(state); }

const count = (n, max) => finite(n) && n >= 0 && n <= max;
const wholeCount = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
function restoreBuilding(raw) {
  const b = { id: raw.id, type: raw.type, x: raw.x, z: raw.z, rotation: raw.rotation, progress: raw.progress, built: raw.built };
  if (raw.serial != null) {
    if (!Number.isSafeInteger(raw.serial) || raw.serial < 1) throw new Error('Invalid building number.');
    b.serial = raw.serial;
  }
  if (!b.built && raw.paid != null) {
    const cost = DEFS[b.type]?.cost ?? {};
    if (typeof raw.paid !== 'object' || Object.entries(raw.paid).some(([item, n]) => !(item in cost) || !wholeCount(n, cost[item]))) throw new Error('Invalid construction materials.');
    b.paid = { ...raw.paid };
  }
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
  const limits = { hopper: [DEFS.hopper.capacity, ['regolith', 'ice']], processor: [PROCESSOR_INPUT_CAP, ['regolith']], melter: [MELT.cap, ['ice']], thermal: [THERMAL.cap, ['regolith']] }[b.type];
  if (limits && raw.inv != null) {
    b.inv = {};
    // Ice arrived with save version 4 and satellite parts with 6; older stores simply hold none.
    for (const item of limits[1]) { const n = raw.inv[item] ?? (['regolith', 'metal', 'silicon'].includes(item) ? undefined : 0); if (!count(n, limits[0])) throw new Error('Invalid storage contents.'); b.inv[item] = n; }
  }
  if (b.type === 'storage') {
    if (raw.slots != null) b.slots = inv.restore(raw.slots, DEFS.storage.slots);
    // Crates used to hold up to 80 loose units of the belt items.
    else if (raw.inv != null) { b.slots = emptyCrate(); for (const item of ITEMS) { const n = raw.inv[item] ?? 0; if (!count(n, 80)) throw new Error('Invalid storage contents.'); inv.add(b.slots, item, Math.floor(n)); } }
  }
  if (b.type === 'melter' && raw.work != null) { if (!count(raw.work, 1)) throw new Error('Invalid melter progress.'); b.work = raw.work; }
  if (b.type === 'processor') {
    if (raw.out != null) { b.out = {}; for (const item of ['metal', 'silicon']) { if (!count(raw.out?.[item], PROCESSOR_OUTPUT_CAP)) throw new Error('Invalid processor output.'); b.out[item] = raw.out[item]; } }
    if (raw.work != null) { if (!count(raw.work, 1)) throw new Error('Invalid processor progress.'); b.work = raw.work; }
  }
  const check = (field, valid) => { if (raw[field] == null) return; if (!valid(raw[field])) throw new Error(`Invalid ${DEFS[b.type].name.toLowerCase()} state.`); b[field] = raw[field]; };
  if (isRoom(b)) check('air', v => typeof v === 'boolean');
  if (isGrower(b)) { check('crop', v => CROPS[v]?.grower === b.type); check('grow', v => count(v, 1)); check('watered', v => typeof v === 'boolean'); }
  if (isStation(b)) {
    const st = STATIONS[b.type], ok = q => st.recipes.includes(st.product(q));
    check('queue', v => Array.isArray(v) && v.length <= st.queue && v.every(q => typeof q === 'string' && ok(q)));
    check('work', v => count(v, 1));
    check('ready', v => v && typeof v === 'object' && !Array.isArray(v) && Object.entries(v).every(([item, n]) => ITEM_INFO[item] && wholeCount(n, st.ready)));
    if (b.type === 'galley') {
      check('recipe', v => v === null || !!DISHES[v]);
      // Before recipes a galley held loose potatoes and plain meals.
      if (raw.crops != null && b.queue == null) { if (!wholeCount(raw.crops, 4)) throw new Error('Invalid galley state.'); b.queue = Array(Math.floor(raw.crops / 2)).fill('meal'); }
      if (raw.meals != null && b.ready == null) { if (!wholeCount(raw.meals, 3)) throw new Error('Invalid galley state.'); b.ready = raw.meals ? { meal: raw.meals } : {}; }
    }
    if (b.queue) b.queue = [...b.queue]; if (b.ready) b.ready = { ...b.ready };
  }
  if (b.type === 'recycler') check('work', v => count(v, 1));
  if (b.type === 'goovat') { check('seeded', v => typeof v === 'boolean'); check('stock', v => count(v, GOO.cap)); check('work', v => count(v, 1)); check('dark', v => count(v, GOO.breachAfter)); }
  if (b.type === 'fuelcell') check('on', v => typeof v === 'boolean');
  if (b.type === 'bioreactor') { check('fed', v => typeof v === 'boolean'); check('stock', v => wholeCount(v, BIO.cap)); check('burn', v => count(v, 1)); check('starve', v => count(v, BIO.starveAfter)); }
  if (b.type === 'fabricator' || b.type === 'assembler') {
    const [stock, out] = b.type === 'fabricator' ? [{ metal: FAB.stock, silicon: FAB.stock }, { frame: FAB.out, wing: FAB.out, chip: FAB.out }] : [ASSEMBLY.stock, { satellite: ASSEMBLY.out }];
    for (const [field, caps] of [['inv', stock], ['out', out]]) {
      if (raw[field] == null) continue;
      b[field] = {};
      for (const [item, cap] of Object.entries(caps)) { if (!count(raw[field][item], cap)) throw new Error(`Invalid ${DEFS[b.type].name.toLowerCase()} state.`); b[field][item] = raw[field][item]; }
    }
    check('work', v => count(v, 1));
    if (b.type === 'fabricator') { check('recipe', v => RECIPES.includes(v)); check('step', v => wholeCount(v, KIT.length - 1)); }
  }
  if (b.type === 'electrolyser') check('work', v => count(v, 1));
  if (b.type === 'tank') check('fuel', v => count(v, DEFS.tank.capacity));
  return ensureState(b);
}
function restoreRobot(raw, index) {
  if (raw?.kind === 'hauler') return restoreHauler(raw);
  const tasks = ['idle', 'toMine', 'mining', 'toHopper', 'docked', 'blocked'];
  if (!raw || raw.kind !== 'miner' || !Number.isSafeInteger(raw.id) || !finite(raw.x) || !finite(raw.z) || Math.abs(raw.x) > 125 || Math.abs(raw.z) > 125 || !tasks.includes(raw.task) || !count(raw.cargo, ROVER.capacity) || !count(raw.charge, 1) || !finite(raw.facing)) throw new Error('Invalid robot.');
  const r = { ...createRover(raw.id), x: raw.x, z: raw.z, facing: raw.facing, task: raw.task, cargo: raw.cargo, charge: raw.charge, target: null };
  if (raw.target != null) {
    if (!Number.isSafeInteger(raw.target.x) || !Number.isSafeInteger(raw.target.z) || (raw.target.id != null && !Number.isSafeInteger(raw.target.id))) throw new Error('Invalid robot target.');
    r.target = raw.target.id != null ? { id: raw.target.id, x: raw.target.x, z: raw.target.z } : { x: raw.target.x, z: raw.target.z };
  } else if (r.task !== 'idle') r.task = 'idle';
  if (raw.wait != null) { if (!count(raw.wait, 10)) throw new Error('Invalid robot.'); r.wait = raw.wait; }
  if (raw.load != null) { if (!['regolith', 'ice'].includes(raw.load)) throw new Error('Invalid robot.'); r.load = raw.load; }
  if (raw.area != null) { if (!Number.isSafeInteger(raw.area)) throw new Error('Invalid robot.'); r.area = raw.area; }
  return r;
}
/** Before version 3 a habitat was a 2x2 module with its airlock on the `rotation` side. It becomes four
 * painted squares; the front-left square becomes an airlock unless the module faced another module. */
function migrateModules(buildings, nextId) {
  const offsets = [[0, 0], [1, 0], [0, 1], [1, 1]], cells = new Set();
  for (const b of buildings) if (b.type === 'habitat') for (const [ox, oz] of offsets) cells.add(key(b.x + ox, b.z + oz));
  const result = [];
  for (const b of buildings) {
    if (b.type !== 'habitat') { result.push(b); continue; }
    const [dx, dz] = DIRS[b.rotation], squares = offsets.map(([ox, oz]) => ({ x: b.x + ox, z: b.z + oz }));
    const front = squares.filter(c => !squares.some(o => o.x === c.x + dx && o.z === c.z + dz)).sort((a, c) => a.x - c.x || a.z - c.z)[0];
    const lock = !cells.has(key(front.x + dx, front.z + dz)) && front;
    squares.forEach((c, i) => result.push({ id: i ? nextId++ : b.id, type: c === lock ? 'airlock' : 'habitat', x: c.x, z: c.z, rotation: c === lock ? b.rotation : 0, progress: b.progress, built: b.built }));
  }
  return { buildings: result, nextId };
}
export function deserialize(text) {
  const raw = JSON.parse(text);
  if (!raw || ![1, 2, 3, 4, 5, SAVE_VERSION].includes(raw.version) || !Number.isSafeInteger(raw.seed) || !finite(raw.time) || raw.time < 0 || !Array.isArray(raw.buildings) || raw.buildings.length > 13689) throw new Error('Invalid or unsupported save.');
  const state = createState(raw.seed);
  state.time = raw.time;
  if (raw.version >= 3) state.inventory = inv.restore(raw.inventory);
  else {
    // Older saves carried unlimited metal and silicon counters; whatever exceeds ten slots is lost.
    state.inventory = inv.createInventory();
    for (const item of ['metal', 'silicon']) {
      if (!finite(raw.inventory?.[item]) || raw.inventory[item] < 0) throw new Error('Invalid inventory.');
      inv.add(state.inventory, item, Math.floor(raw.inventory[item]));
    }
    inv.add(state.inventory, 'meal', STARTING.meals);
  }
  for (const axis of ['x', 'y', 'z']) {
    const coordinate = raw.player?.[axis];
    if (!finite(coordinate) || (axis === 'y' ? coordinate < 0 || coordinate > 10 : Math.abs(coordinate) > 125)) throw new Error('Invalid player position.');
    state.player[axis] = raw.player[axis];
  }
  if (raw.player.satiety != null) { if (!count(raw.player.satiety, 100)) throw new Error('Invalid player.'); state.player.satiety = raw.player.satiety; }
  restoreArms(state, raw.player);
  if (raw.player.cave != null) {
    const zone = raw.player.zone ?? 0;
    if (!Number.isInteger(raw.player.cave) || raw.player.cave < 0 || raw.player.cave > 2 || !Number.isInteger(zone) || zone < 0 || zone >= CAVE_ZONES) throw new Error('Invalid cave position.');
    state.player.cave = raw.player.cave; if (zone) state.player.zone = zone;
    // Caves gained features over time; a player saved where a spire now stands is moved to the zone's start.
    if (!caveWalkable(raw.seed, raw.player.cave, state.player.x, state.player.z, .3, zone)) { const start = caveLayout(raw.seed, raw.player.cave, zone).start; state.player.x = start.x * 2; state.player.z = start.z * 2 + (zone ? 2 : 1); }
  }
  if (raw.exploredCaves) state.exploredCaves = {};
  if (raw.exploredCaves && typeof raw.exploredCaves === 'object') for (const [id, cells] of Object.entries(raw.exploredCaves)) { if (/^[0-2](:[12])?$/.test(id) && Array.isArray(cells)) state.exploredCaves[id] = cells.filter(k => typeof k === 'string' && /^-?\d{1,2},-?\d{1,2}$/.test(k)).slice(0, 6000); }
  // Work lights were retired once every machine carried its own lamp; old saves just lose them.
  raw.buildings = raw.buildings.filter(b => b?.type !== 'lamp');
  const ids = new Set();
  for (const b of raw.buildings) {
    if (!b || !Number.isSafeInteger(b.id) || b.id < 1 || ids.has(b.id) || !DEFS[b.type] || !finite(b.progress) || b.progress < 0 || b.progress > 1 || typeof b.built !== 'boolean' || b.built !== (b.progress === 1) || !validRotation(b.rotation)) throw new Error('Invalid building.');
    if (raw.version < 3 && DEFS[b.type].layer && b.type !== 'habitat') throw new Error('Invalid building.');
    if (raw.version < 4 && b.type === 'melter') throw new Error('Invalid building.');
    ids.add(b.id);
  }
  if (!Number.isSafeInteger(raw.nextId) || raw.nextId <= Math.max(0, ...ids)) throw new Error('Invalid entity sequence.');
  let buildings = raw.buildings;
  state.nextId = raw.nextId;
  if (raw.version < 3) ({ buildings, nextId: state.nextId } = migrateModules(raw.buildings, raw.nextId));
  for (const b of buildings) {
    const reason = geometryReason(state, b.type, b.x, b.z, b.rotation);
    if (reason) throw new Error(`Invalid building: ${reason}`);
    state.buildings.push(restoreBuilding(b));
  }
  for (const b of [...state.buildings].sort((a, c) => a.id - c.id)) if (b.serial == null) b.serial = nextSerial(state.buildings, b.type);
  if (!finite(raw.power?.stored) || raw.power.stored < 0) throw new Error('Invalid battery charge.');
  state.power.stored = raw.power.stored;
  // Version 1 colonies predate mining: they keep the starting rover and reserves.
  if (raw.version >= 2) {
    if (!count(raw.reserves?.oxygen, 1e9)) throw new Error('Invalid reserves.');
    state.reserves.oxygen = raw.reserves.oxygen + (raw.version < 3 ? STARTING.oxygen : 0);
    if (raw.version >= 3) { if (!count(raw.reserves.water, 1e9)) throw new Error('Invalid reserves.'); state.reserves.water = raw.reserves.water; }
    if (!Array.isArray(raw.robots) || raw.robots.length > 64) throw new Error('Invalid robots.');
    state.robots = raw.robots.map(restoreRobot);
    // Before version 5 there was one unnamed mining area; it becomes zone 1.
    const areas = raw.version >= 5 ? raw.miningAreas : raw.miningArea != null ? [{ id: 1, ...raw.miningArea }] : [];
    if (!Array.isArray(areas) || areas.length > MAX_MINING_AREAS) throw new Error('Invalid mining area.');
    for (const a of areas) {
      if (!a || !Number.isSafeInteger(a.id) || a.id < 1 || state.miningAreas.some(b => b.id === a.id) || !Number.isSafeInteger(a.x) || !Number.isSafeInteger(a.z) || Math.abs(a.x) > 58 || Math.abs(a.z) > 58) throw new Error('Invalid mining area.');
      state.miningAreas.push({ id: a.id, x: a.x, z: a.z });
    }
    state.nextAreaId = Math.max(raw.version >= 5 && Number.isSafeInteger(raw.nextAreaId) ? raw.nextAreaId : 1, ...state.miningAreas.map(a => a.id + 1));
    for (const r of state.robots) if (r.area != null && !state.miningAreas.some(a => a.id === r.area)) throw new Error('Invalid robot.');
    if (!raw.mined || typeof raw.mined !== 'object' || Array.isArray(raw.mined)) throw new Error('Invalid mining record.');
    const mined = Object.entries(raw.mined);
    if (mined.length > 13689) throw new Error('Invalid mining record.');
    for (const [cell, amount] of mined) {
      if (!/^-?\d{1,2},-?\d{1,2}$/.test(cell) || !count(amount, REGOLITH_PER_CELL)) throw new Error('Invalid mining record.');
      state.mined[cell] = amount;
    }
  }
  // Colonies from before the crater mission keep their working processors.
  state.mission = raw.version >= 4 ? restoreMission(raw.mission) : createMission(true);
  if (raw.version >= 6) {
    state.ship = restoreShip(raw.ship);
    state.research = restoreResearch(raw.research);
    if (!wholeCount(raw.satellites, 1000)) throw new Error('Invalid satellites.');
    state.satellites = raw.satellites;
  }
  restoreDelve(state, raw);
  restorePeril(state, raw);
  restoreBuffs(state, raw);
  restoreInfest(state, raw);
  restoreGoo(state, raw);
  if (new Set(state.robots.map(r => r.id)).size !== state.robots.length) throw new Error('Invalid robots.');
  tick(state, 0);
  return state;
}
