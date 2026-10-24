import { DEFS, ITEM_INFO } from './defs.js';
import { habitatLayout, openRooms } from './habitat.js';
import * as inv from './inventory.js';
import { missing, pay } from './storage.js';
import { gooOn } from './goo.js';
import { ARMORY, BENCH, armoryKnown } from './arms.js';
import { ROBOT_COST, ROBOT_NAME, robotRoom, spawnRobot, bayExit } from './space.js';
import { CROPS, GALLEY, MILL, RECIPES, BUFFS, isGrower, cropsFor, defaultCrop, recipeKnown, obtainable, addBuffs, buffed, stepBuffs } from './farm.js';

// Provisional tuning.
export const LIFE = Object.freeze({
  satietyDrain: 100 / 600, hungry: 35,
  oxygenPerSquare: 1,
  recycleTime: 30, recyclerPower: 0.5, waterCap: 200,
});
export const STARTING = Object.freeze({ water: 40, oxygen: 30, meals: 6 });

/** Movement and build-speed multipliers for the player's current satiety. Hunger never kills. */
export function hunger(satiety) {
  if (satiety <= 0) return { speed: 0.65, build: 0.5, label: 'Starving' };
  if (satiety < LIFE.hungry) return { speed: 0.85, build: 0.75, label: 'Hungry' };
  return { speed: 1, build: 1, label: null };
}
export function ensureLifeState(b) {
  if (!b.built) return b;
  if (DEFS[b.type]?.layer === 'floor') b.air ??= false;
  if (isGrower(b)) { b.crop ??= defaultCrop(b.type); b.grow ??= 0; b.watered ??= false; }
  if (isStation(b)) { b.queue ??= []; b.work ??= 0; b.ready ??= {}; }
  if (b.type === 'galley') b.recipe ??= null;
  if (b.type === 'recycler') b.work ??= 0;
  return b;
}

/** Per-room pressure: a room holds air once every square is filled, it is powered and an airlock opens
 * onto clear ground. Returns room index -> { pressurised, reason } plus a cell lookup. */
export function roomStatus(state) {
  const layout = habitatLayout(state.buildings), open = openRooms(layout, state.buildings), byId = new Map(state.buildings.map(b => [b.id, b]));
  const rooms = new Map();
  for (const room of layout.rooms) {
    const squares = [...room.modules].map(id => byId.get(id)), filled = squares.every(b => b?.air);
    const reason = !open.has(room) ? 'No airlock' : !filled ? 'Needs oxygen' : state.power.powered === false ? 'No power' : null;
    rooms.set(room.index, { pressurised: !reason, reason });
  }
  return { layout, rooms, at: (x, z) => { const room = layout.roomOf.get(`${x},${z}`); return room ? rooms.get(room.index) : null; } };
}
const pressurisedAt = (status, b) => !!status.at(b.x, b.z)?.pressurised;
const growing = (state, b, status) => b.built && pressurisedAt(status, b) && b.grow < 1 && !gooOn(state, b) && (b.watered || state.reserves.water >= CROPS[b.crop].water);
export const readyCount = b => Object.values(b.ready ?? {}).reduce((a, n) => a + n, 0);
const grainFor = item => Object.keys(MILL.makes).find(k => MILL.makes[k] === item);
/**
 * Workstations. Clicking a recipe pays for it from the pack and base storage and lines up a `job`; each takes `time`
 * seconds and its product goes straight to the pack, waiting in `ready` (up to that many) only when the pack is full.
 * `air` stations work only in a pressurised, powered room.
 */
export const STATIONS = Object.freeze({
  galley: { verb: 'Cooking', time: GALLEY.time, queue: GALLEY.queue, ready: GALLEY.ready, power: GALLEY.power, air: true, recipes: Object.keys(RECIPES), known: recipeKnown, input: id => RECIPES[id].input, makes: () => 1, job: id => id, product: job => job },
  mill: { verb: 'Milling', time: MILL.time, queue: MILL.cap, ready: MILL.cap, power: MILL.power, air: true, recipes: Object.values(MILL.makes), known: obtainable, input: id => ({ [grainFor(id)]: 1 }), makes: () => 1, job: grainFor, product: job => MILL.makes[job] },
  // The robot bay's product rolls out beside it rather than into the pack.
  roverbay: { verb: 'Assembling', time: 20, queue: 2, ready: 0, power: 1, air: false, robots: true, recipes: Object.keys(ROBOT_COST), known: () => true, input: id => ROBOT_COST[id], makes: () => 1, job: id => id, product: job => job },
  armory: { verb: 'Crafting', time: BENCH.time, queue: BENCH.queue, ready: BENCH.ready, power: 0, air: false, recipes: Object.keys(ARMORY), known: armoryKnown, input: id => ARMORY[id].input, makes: id => ARMORY[id].makes, job: id => id, product: job => job },
});
export const isStation = b => !!STATIONS[b?.type];
const working = (b, status) => b.built && b.queue?.length > 0 && (STATIONS[b.type].robots || readyCount(b) < STATIONS[b.type].ready) && (!STATIONS[b.type].air || pressurisedAt(status, b));
function stepStation(state, b, dt) {
  const s = STATIONS[b.type];
  b.work += dt / s.time;
  if (b.work < 1) return;
  b.work = 0;
  if (s.robots) { const exit = bayExit(b); spawnRobot(state, b.queue.shift(), exit.x, exit.z); return; }
  const item = s.product(b.queue.shift()), n = s.makes(item), k = Math.min(n, inv.room(state.inventory, item));
  inv.add(state.inventory, item, k);
  if (n > k) b.ready[item] = (b.ready[item] ?? 0) + n - k;
}
/** Every set of grow beds joined side by side, by member id. Only finished beds join; other growers stand alone. */
export function growBeds(state) {
  const at = new Map(state.buildings.filter(b => b.type === 'growbed' && b.built).map(b => [`${b.x},${b.z}`, b])), beds = new Map();
  for (const start of at.values()) {
    if (beds.has(start.id)) continue;
    const bed = [start]; beds.set(start.id, bed);
    for (let i = 0; i < bed.length; i++) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = at.get(`${bed[i].x + dx},${bed[i].z + dz}`);
      if (n && !beds.has(n.id)) { beds.set(n.id, bed); bed.push(n); }
    }
  }
  return beds;
}
export const bedOf = (state, b) => growBeds(state).get(b?.id) ?? (b ? [b] : []);
const recycling = (state, b, status) => b.built && pressurisedAt(status, b) && state.reserves.water < LIFE.waterCap;

export function lifeDemand(state, status = roomStatus(state)) {
  let kw = 0;
  for (const b of state.buildings) {
    if (!b.built) continue;
    const def = DEFS[b.type];
    if (def.layer === 'floor') kw += def.power ?? 0;
    if (isGrower(b) && growing(state, b, status)) kw += CROPS[b.crop].power;
    if (isStation(b) && working(b, status)) kw += STATIONS[b.type].power;
    if (b.type === 'recycler' && recycling(state, b, status)) kw += LIFE.recyclerPower;
  }
  return kw;
}

/** Advances hunger, room filling and interior machines. Machines use the previous tick's supply state. */
export function stepLife(state, dt, powered) {
  const p = state.player;
  p.satiety = Math.max(0, p.satiety - LIFE.satietyDrain * (buffed(p, 'calm') ? BUFFS.calm.drain : 1) * dt);
  stepBuffs(p, dt);
  for (const b of state.buildings) if (b.built && DEFS[b.type].layer === 'floor' && !b.air && state.reserves.oxygen >= LIFE.oxygenPerSquare) { state.reserves.oxygen -= LIFE.oxygenPerSquare; b.air = true; }
  const status = roomStatus(state);
  for (const b of state.buildings) if (isStation(b) && !STATIONS[b.type].power && working(b, status)) stepStation(state, b, dt);
  if (!powered) return;
  for (const b of state.buildings) {
    if (isGrower(b) && growing(state, b, status)) {
      if (!b.watered) { state.reserves.water -= CROPS[b.crop].water; b.watered = true; }
      b.grow = Math.min(1, b.grow + dt / CROPS[b.crop].time);
    } else if (isStation(b) && STATIONS[b.type].power && working(b, status)) {
      stepStation(state, b, dt);
    } else if (b.type === 'recycler' && recycling(state, b, status)) {
      b.work += dt / LIFE.recycleTime;
      if (b.work >= 1) { b.work = 0; state.reserves.water = Math.min(LIFE.waterCap, state.reserves.water + 1); }
    }
  }
}

/** What a station job or crop is called, robots included. */
export const jobName = id => ITEM_INFO[id]?.name ?? ROBOT_NAME[id];
const name = item => jobName(item).toLowerCase();
const listing = counts => Object.entries(counts).filter(([, n]) => n).map(([item, n]) => `${n} ${name(item)}`).join(', ');

/** Eats (or, for a medkit, uses) one of the item in the selected slot. */
export function eat(state, slot) {
  const held = state.inventory[slot], info = ITEM_INFO[held?.item], p = state.player;
  if (info?.heal) {
    if ((p.health ?? 100) >= 100) return { ok: false, reason: 'Your suit is undamaged.' };
    inv.remove(state.inventory, held.item, 1);
    p.health = Math.min(100, (p.health ?? 100) + info.heal);
    return { ok: true, reason: 'Patched the suit with a medkit.' };
  }
  if (!info?.food) return { ok: false, reason: held ? `${info.name} isn't edible.` : 'That slot is empty.' };
  const buff = RECIPES[held.item]?.buff;
  if (p.satiety >= 100 && !buff) return { ok: false, reason: "You're full." };
  inv.remove(state.inventory, held.item, 1);
  p.satiety = Math.min(100, p.satiety + info.food);
  addBuffs(p, buff);
  return { ok: true, reason: `Ate ${RECIPES[held.item] ? name(held.item) : `raw ${name(held.item)}`}${buff ? `: ${Object.keys(buff).map(id => BUFFS[id].name).join(', ')}` : ''}.` };
}

/** Replants a whole grow bed (or a lone grower) with `crop`; unripe crops in it are lost, ripe ones must be harvested first. */
export function setCrop(state, b, crop) {
  if (!isGrower(b) || !b.built) return { ok: false, reason: 'Not a grower.' };
  if (!cropsFor(state, b.type).includes(crop)) return { ok: false, reason: `${DEFS[b.type].name} can't grow that yet.` };
  const bed = bedOf(state, b), change = bed.filter(o => o.crop !== crop);
  if (!change.length) return { ok: true, reason: `Already growing ${name(crop)}.` };
  const ripe = change.find(o => o.grow >= 1);
  if (ripe) return { ok: false, reason: `Harvest the ${name(ripe.crop)} first.` };
  for (const o of change) Object.assign(o, { crop, grow: 0, watered: false });
  return { ok: true, reason: `Planted ${name(crop)}${bed.length > 1 ? ` across ${bed.length} plots` : ''}.` };
}
/** Lines up one recipe at a workstation, paying for it now. */
export function startCraft(state, b, id) {
  const s = STATIONS[b?.type];
  if (!s || !b.built) return { ok: false, reason: 'Nothing to make here.' };
  if (!s.recipes.includes(id) || !s.known(state, id)) return { ok: false, reason: b.type === 'armory' ? 'Research it first (T).' : 'Unknown recipe.' };
  if (b.queue.length >= s.queue) return { ok: false, reason: `The ${DEFS[b.type].name.toLowerCase()} is busy.` };
  if (s.robots && robotRoom(state, id) < 1) return { ok: false, reason: `The colony can't run more ${ROBOT_NAME[id].toLowerCase()}s yet.` };
  const input = s.input(id), short = missing(state, input);
  if (short.length) return { ok: false, reason: `Needs ${short.map(([item, n]) => `${n} ${name(item)}`).join(', ')}.` };
  pay(state, input);
  b.queue.push(s.job(id));
  return { ok: true, reason: `${s.verb} ${name(id)}.` };
}
/** What each queued job at a station will make, in order. */
export const stationJobs = b => (b.queue ?? []).map(job => STATIONS[b.type].product(job));

/** What pressing E on an interior object would do, or null. */
export function lifeAction(state, b) {
  if (!b?.built) return null;
  if (isGrower(b)) return b.grow >= 1 ? { verb: `Harvest ${name(b.crop)}` } : null;
  if (isStation(b) && readyCount(b)) return { verb: `Take ${listing(b.ready)}` };
  return null;
}
function takeReady(state, b) {
  let taken = 0, left = 0;
  for (const [item, n] of Object.entries(b.ready)) { const k = Math.min(n, inv.room(state.inventory, item)); inv.add(state.inventory, item, k); taken += k; left += n - k; if ((b.ready[item] = n - k) <= 0) delete b.ready[item]; }
  if (!taken) return { ok: false, reason: 'No room in your inventory.' };
  return { ok: true, reason: `Took ${taken} item${taken > 1 ? 's' : ''}${left ? '; your inventory is full' : ''}.` };
}
/** Picks one ripe plot. */
function harvest(state, b) {
  if (b.grow < 1) return { ok: false, reason: 'Nothing to harvest yet.' };
  const crop = CROPS[b.crop];
  if (inv.room(state.inventory, b.crop) < crop.yield) return { ok: false, reason: 'No room in your inventory.' };
  inv.add(state.inventory, b.crop, crop.yield); b.grow = 0; b.watered = false;
  const got = b.crop;
  // A crop whose research was lost (never, today) or that no longer suits the grower falls back to the default.
  if (!cropsFor(state, b.type).includes(b.crop)) b.crop = defaultCrop(b.type);
  return { ok: true, reason: `Harvested ${crop.yield} ${name(got)}.` };
}
export function useLife(state, b) {
  if (!b.built) return { ok: false, reason: 'Finish building it first.' };
  if (isGrower(b)) return harvest(state, b);
  if (isStation(b)) return readyCount(b) ? takeReady(state, b) : { ok: false, reason: `Click the ${DEFS[b.type].name.toLowerCase()} to choose what to make.` };
  return { ok: false, reason: 'Nothing to do here.' };
}
