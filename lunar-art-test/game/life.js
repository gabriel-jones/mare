import { DEFS, ITEM_INFO } from './defs.js';
import { habitatLayout, openRooms } from './habitat.js';
import * as inv from './inventory.js';

// Provisional tuning.
export const LIFE = Object.freeze({
  satietyDrain: 100 / 600, hungry: 35,
  oxygenPerSquare: 1,
  growTime: 90, growWater: 1, growPower: 0.4, harvest: 3,
  cookTime: 6, cookInput: 2, cookPower: 1.5, galleyMeals: 3,
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
  if (b.type === 'growbed') { b.grow ??= 0; b.watered ??= false; }
  if (b.type === 'galley') { b.crops ??= 0; b.work ??= 0; b.meals ??= 0; }
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
const growing = (state, b, status) => b.built && pressurisedAt(status, b) && b.grow < 1 && (b.watered || state.reserves.water >= LIFE.growWater);
const cooking = (b, status) => b.built && pressurisedAt(status, b) && b.crops >= LIFE.cookInput && b.meals < LIFE.galleyMeals;
const recycling = (state, b, status) => b.built && pressurisedAt(status, b) && state.reserves.water < LIFE.waterCap;

export function lifeDemand(state, status = roomStatus(state)) {
  let kw = 0;
  for (const b of state.buildings) {
    if (!b.built) continue;
    const def = DEFS[b.type];
    if (def.layer === 'floor') kw += def.power ?? 0;
    if (b.type === 'growbed' && growing(state, b, status)) kw += LIFE.growPower;
    if (b.type === 'galley' && cooking(b, status)) kw += LIFE.cookPower;
    if (b.type === 'recycler' && recycling(state, b, status)) kw += LIFE.recyclerPower;
  }
  return kw;
}

/** Advances hunger, room filling and interior machines. Machines use the previous tick's supply state. */
export function stepLife(state, dt, powered) {
  const p = state.player;
  p.satiety = Math.max(0, p.satiety - LIFE.satietyDrain * dt);
  for (const b of state.buildings) if (b.built && DEFS[b.type].layer === 'floor' && !b.air && state.reserves.oxygen >= LIFE.oxygenPerSquare) { state.reserves.oxygen -= LIFE.oxygenPerSquare; b.air = true; }
  if (!powered) return;
  const status = roomStatus(state);
  for (const b of state.buildings) {
    if (b.type === 'growbed' && growing(state, b, status)) {
      if (!b.watered) { state.reserves.water -= LIFE.growWater; b.watered = true; }
      b.grow = Math.min(1, b.grow + dt / LIFE.growTime);
    } else if (b.type === 'galley' && cooking(b, status)) {
      b.work += dt / LIFE.cookTime;
      if (b.work >= 1) { b.work = 0; b.crops -= LIFE.cookInput; b.meals += 1; }
    } else if (b.type === 'recycler' && recycling(state, b, status)) {
      b.work += dt / LIFE.recycleTime;
      if (b.work >= 1) { b.work = 0; state.reserves.water = Math.min(LIFE.waterCap, state.reserves.water + 1); }
    }
  }
}

/** Eats one of the item in the selected slot. */
export function eat(state, slot) {
  const held = state.inventory[slot], food = ITEM_INFO[held?.item]?.food;
  if (!food) return { ok: false, reason: held ? `${ITEM_INFO[held.item].name} isn't edible.` : 'That slot is empty.' };
  if (state.player.satiety >= 100) return { ok: false, reason: "You're full." };
  inv.remove(state.inventory, held.item, 1);
  state.player.satiety = Math.min(100, state.player.satiety + food);
  return { ok: true, reason: `Ate ${held.item === 'meal' ? 'a meal' : 'a raw potato'}.` };
}
/** What pressing E on an interior object would do, or null. */
export function lifeAction(state, b) {
  if (!b?.built) return null;
  if (b.type === 'growbed' && b.grow >= 1) return { verb: 'Harvest potatoes' };
  if (b.type === 'galley') {
    if (b.meals > 0) return { verb: `Take ${b.meals === 1 ? 'meal' : `${b.meals} meals`}` };
    if (b.crops < LIFE.cookInput * 2 && inv.count(state.inventory, 'crop') >= LIFE.cookInput) return { verb: 'Load 2 potatoes' };
  }
  return null;
}
export function useLife(state, b) {
  if (b.type === 'growbed') {
    if (!b.built || b.grow < 1) return { ok: false, reason: 'Nothing to harvest yet.' };
    if (inv.room(state.inventory, 'crop') < LIFE.harvest) return { ok: false, reason: 'No room in your inventory.' };
    inv.add(state.inventory, 'crop', LIFE.harvest); b.grow = 0; b.watered = false;
    return { ok: true, reason: `Harvested ${LIFE.harvest} potatoes.` };
  }
  if (b.type === 'galley' && b.built) {
    if (b.meals > 0) {
      const taken = Math.min(b.meals, inv.room(state.inventory, 'meal'));
      if (!taken) return { ok: false, reason: 'No room in your inventory.' };
      inv.add(state.inventory, 'meal', taken); b.meals -= taken;
      return { ok: true, reason: `Took ${taken} meal${taken > 1 ? 's' : ''}.` };
    }
    if (b.crops >= LIFE.cookInput * 2) return { ok: false, reason: 'The galley is full.' };
    if (!inv.remove(state.inventory, 'crop', LIFE.cookInput)) return { ok: false, reason: 'Needs 2 potatoes to cook a meal.' };
    b.crops += LIFE.cookInput;
    return { ok: true, reason: 'Loaded 2 potatoes.' };
  }
  return { ok: false, reason: 'Nothing to do here.' };
}
