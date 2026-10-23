import { DEFS, ITEM_INFO } from './defs.js';
import { habitatLayout, openRooms } from './habitat.js';
import * as inv from './inventory.js';
import { CROPS, GALLEY, MILL, RECIPES, AUTO, BUFFS, isGrower, cropsFor, defaultCrop, recipeUnlocked, addBuffs, buffed, stepBuffs } from './farm.js';

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
  if (b.type === 'galley' || b.type === 'mill') { b.queue ??= []; b.work ??= 0; b.ready ??= {}; }
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
const growing = (state, b, status) => b.built && pressurisedAt(status, b) && b.grow < 1 && (b.watered || state.reserves.water >= CROPS[b.crop].water);
export const readyCount = b => Object.values(b.ready ?? {}).reduce((a, n) => a + n, 0);
const cooking = (b, status) => b.built && pressurisedAt(status, b) && b.queue?.length > 0 && readyCount(b) < GALLEY.ready;
const milling = (b, status) => b.built && pressurisedAt(status, b) && b.queue?.length > 0 && readyCount(b) < MILL.cap;
const recycling = (state, b, status) => b.built && pressurisedAt(status, b) && state.reserves.water < LIFE.waterCap;

export function lifeDemand(state, status = roomStatus(state)) {
  let kw = 0;
  for (const b of state.buildings) {
    if (!b.built) continue;
    const def = DEFS[b.type];
    if (def.layer === 'floor') kw += def.power ?? 0;
    if (isGrower(b) && growing(state, b, status)) kw += CROPS[b.crop].power;
    if (b.type === 'galley' && cooking(b, status)) kw += GALLEY.power;
    if (b.type === 'mill' && milling(b, status)) kw += MILL.power;
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
  if (!powered) return;
  const status = roomStatus(state);
  for (const b of state.buildings) {
    if (isGrower(b) && growing(state, b, status)) {
      if (!b.watered) { state.reserves.water -= CROPS[b.crop].water; b.watered = true; }
      b.grow = Math.min(1, b.grow + dt / CROPS[b.crop].time);
    } else if (b.type === 'galley' && cooking(b, status)) {
      b.work += dt / GALLEY.time;
      if (b.work >= 1) { b.work = 0; const dish = b.queue.shift(); b.ready[dish] = (b.ready[dish] ?? 0) + 1; }
    } else if (b.type === 'mill' && milling(b, status)) {
      b.work += dt / MILL.time;
      if (b.work >= 1) { b.work = 0; const out = MILL.makes[b.queue.shift()]; b.ready[out] = (b.ready[out] ?? 0) + 1; }
    } else if (b.type === 'recycler' && recycling(state, b, status)) {
      b.work += dt / LIFE.recycleTime;
      if (b.work >= 1) { b.work = 0; state.reserves.water = Math.min(LIFE.waterCap, state.reserves.water + 1); }
    }
  }
}

const name = item => ITEM_INFO[item].name.toLowerCase();
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

/** The recipe the galley would cook next from what the player carries: its chosen one, or on auto the best it can. */
export function galleyRecipe(state, b) {
  const can = id => recipeUnlocked(state, id) && Object.entries(RECIPES[id].input).every(([item, n]) => inv.count(state.inventory, item) >= n);
  if (b.recipe) return can(b.recipe) ? b.recipe : null;
  return AUTO.find(can) ?? null;
}
/** The next crop a grower would switch to when E is pressed on it unripe, or null if it has no other. */
export function nextCrop(state, b) {
  const options = cropsFor(state, b.type);
  if (options.length < 2 && options.includes(b.crop)) return null;
  return options[(options.indexOf(b.crop) + 1) % options.length] ?? null;
}
const millInput = state => Object.keys(MILL.makes).filter(item => inv.count(state.inventory, item) > 0);

/** What pressing E on an interior object would do, or null. */
export function lifeAction(state, b) {
  if (!b?.built) return null;
  if (isGrower(b)) {
    if (b.grow >= 1) return { verb: `Harvest ${name(b.crop)}` };
    const next = nextCrop(state, b);
    return next ? { verb: `Plant ${name(next)} instead` } : null;
  }
  if (b.type === 'galley' || b.type === 'mill') {
    const ready = readyCount(b);
    if (ready) return { verb: `Take ${listing(b.ready)}` };
    if (b.type === 'galley') { const r = galleyRecipe(state, b); if (r && b.queue.length < GALLEY.queue) return { verb: `Cook ${name(r)}` }; }
    else if (b.queue.length < MILL.cap && millInput(state).length) return { verb: `Mill ${millInput(state).map(name).join(' and ')}` };
  }
  return null;
}
function takeReady(state, b) {
  let taken = 0, left = 0;
  for (const [item, n] of Object.entries(b.ready)) { const k = Math.min(n, inv.room(state.inventory, item)); inv.add(state.inventory, item, k); taken += k; left += n - k; if ((b.ready[item] = n - k) <= 0) delete b.ready[item]; }
  if (!taken) return { ok: false, reason: 'No room in your inventory.' };
  return { ok: true, reason: `Took ${taken} item${taken > 1 ? 's' : ''}${left ? '; your inventory is full' : ''}.` };
}
export function useLife(state, b) {
  if (!b.built) return { ok: false, reason: 'Finish building it first.' };
  if (isGrower(b)) {
    const crop = CROPS[b.crop];
    if (b.grow < 1) {
      const next = nextCrop(state, b);
      if (!next) return { ok: false, reason: 'Nothing to harvest yet.' };
      Object.assign(b, { crop: next, grow: 0, watered: false });
      return { ok: true, reason: `Planted ${name(next)}.` };
    }
    if (inv.room(state.inventory, b.crop) < crop.yield) return { ok: false, reason: 'No room in your inventory.' };
    inv.add(state.inventory, b.crop, crop.yield); b.grow = 0; b.watered = false;
    // A crop whose research was lost (never, today) or that no longer suits the grower falls back to the default.
    if (!cropsFor(state, b.type).includes(b.crop)) b.crop = defaultCrop(b.type);
    return { ok: true, reason: `Harvested ${crop.yield} ${name(b.crop)}.` };
  }
  if (b.type === 'galley') {
    if (readyCount(b)) return takeReady(state, b);
    if (b.queue.length >= GALLEY.queue) return { ok: false, reason: 'The galley is full.' };
    const r = galleyRecipe(state, b);
    if (!r) return { ok: false, reason: b.recipe ? `Needs ${listing(RECIPES[b.recipe].input)} for ${name(b.recipe)}.` : 'Needs ingredients: 2 potatoes make hash browns.' };
    for (const [item, n] of Object.entries(RECIPES[r].input)) inv.remove(state.inventory, item, n);
    b.queue.push(r);
    return { ok: true, reason: `Cooking ${name(r)}.` };
  }
  if (b.type === 'mill') {
    if (readyCount(b)) return takeReady(state, b);
    const loaded = {};
    for (const item of millInput(state)) while (b.queue.length < MILL.cap && inv.remove(state.inventory, item, 1)) { b.queue.push(item); loaded[item] = (loaded[item] ?? 0) + 1; }
    if (!Object.keys(loaded).length) return { ok: false, reason: b.queue.length >= MILL.cap ? 'The mill is full.' : 'Needs wheat or soybeans.' };
    return { ok: true, reason: `Loaded ${listing(loaded)}.` };
  }
  return { ok: false, reason: 'Nothing to do here.' };
}
