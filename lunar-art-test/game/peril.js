import { caveLayout, caveWalkable, caveKey, CAVE_CELL, ZONE_NAMES } from './caves.js';
import { CELL_SIZE, ITEM_INFO } from './defs.js';
import * as inv from './inventory.js';
import { canPay, pay } from './storage.js';
import { stepInfest, silkBlocks } from './infest.js';
import { BUFFS, buffed } from './farm.js';
import { burnGoo, infested } from './goo.js';

/** The player's health, what hurts it underground, what happens at zero, and the flares that push back the dark. */
export const HEALTH = Object.freeze({ max: 100, regen: 4, regenDelay: 5, vent: 14, toxic: 6 });
export const FLARE = Object.freeze({ life: 45, radius: 6, range: 9, cost: { metal: 2 }, makes: 3, limit: 6, strike: .42, release: .8, flight: .38 });
export const MAX_DROPS = 5;
export const DROP_REACH = 2;

export const HURT_TEXT = { vent: 'Scalding gas! Get off the vent.', toxic: 'Toxic seep. Your suit is failing.' };
export const BLACKOUT = "Suit emergency: you blacked out and the suit walked you home on autopilot. Your pack is still where you fell.";

/** What the floor under the player is doing to them, or null. */
export function hazardAt(state) {
  const p = state.player;
  if (p.cave == null) return null;
  const type = caveLayout(state.seed, p.cave, p.zone ?? 0).types.get(caveKey(Math.round(p.x / CAVE_CELL), Math.round(p.z / CAVE_CELL)));
  return type === 'vent' || type === 'toxic' ? type : null;
}

/**
 * Real-time step: hazards hurt, the surface heals after a pause, flares burn out (and burn the nests and silk they lie
 * by), burnt nests regrow. Returns what happened, if anything.
 */
export function stepPeril(state, dt) {
  const p = state.player;
  p.health ??= HEALTH.max;
  const hazard = hazardAt(state);
  if (hazard) { p.health = Math.max(0, p.health - HEALTH[hazard] * dt); p.calm = 0; }
  else {
    p.calm = (p.calm ?? HEALTH.regenDelay) + dt;
    if (p.cave == null && p.calm >= HEALTH.regenDelay) p.health = Math.min(HEALTH.max, p.health + HEALTH.regen * dt);
  }
  // A mending meal knits the suit back up anywhere, even under attack.
  if (buffed(p, 'regen') && p.health > 0) p.health = Math.min(HEALTH.max, p.health + BUFFS.regen.heal * dt);
  if (state.flares?.length) state.flares = state.flares.filter(f => {
    if (f.age != null && f.age < FLARE.release && f.age + dt >= FLARE.release) { f.fromX = p.x; f.fromZ = p.z; }
    if (f.age != null) f.age += dt;
    return (f.t -= dt) > 0;
  });
  const fires = (state.flares ?? []).filter(f => f.cave === p.cave && (f.zone ?? 0) === (p.zone ?? 0)).map(f => flareNow(f, p)).filter(n => n.stage === 'down' && n.lit > 0);
  stepInfest(state, dt, fires);
  if (p.cave == null) burnGoo(state, fires);
  if (p.health <= 0) return blackout(state);
  return hazard ? { hazard } : null;
}

/** Where the suit carries an unconscious player: the habitat square nearest the landing site, else beside the ship. */
export function respawnPoint(state) {
  const homes = state.buildings.filter(b => b.type === 'habitat' && b.built).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  return homes.length ? { x: homes[0].x * CELL_SIZE, z: homes[0].z * CELL_SIZE } : { x: 0, z: 8 };
}

/** Everything carried is left where the player fell; they wake at home with full health. */
export function blackout(state) {
  const p = state.player, items = state.inventory.filter(Boolean).map(s => ({ item: s.item, count: s.count }));
  if (items.length) {
    state.drops ??= [];
    const id = 1 + Math.max(0, ...state.drops.map(d => d.id));
    state.drops.push({ id, cave: p.cave ?? null, zone: p.zone ?? 0, x: p.x, z: p.z, items });
    while (state.drops.length > MAX_DROPS) state.drops.shift();
  }
  const where = p.cave == null ? 'on the surface' : `in cave ${p.cave + 1}, ${ZONE_NAMES[p.zone ?? 0]}`;
  state.inventory = inv.createInventory();
  state.flares = [];
  const home = respawnPoint(state);
  delete p.cave; delete p.zone;
  Object.assign(p, { x: home.x, z: home.z, y: 0, health: HEALTH.max, calm: HEALTH.regenDelay });
  return { blackout: true, items: items.length, where };
}

const samePlace = (d, p) => (d.cave ?? null) === (p.cave ?? null) && (d.cave == null || (d.zone ?? 0) === (p.zone ?? 0));
export function nearestDrop(state) {
  const p = state.player;
  let best = null, distance = DROP_REACH;
  for (const d of state.drops ?? []) {
    if (!samePlace(d, p)) continue;
    const r = Math.hypot(d.x - p.x, d.z - p.z);
    if (r < distance) { best = d; distance = r; }
  }
  return best;
}
export function dropAction(state) {
  const d = nearestDrop(state);
  return d && { verb: `Recover your pack · ${d.items.reduce((n, s) => n + s.count, 0)} items`, drop: d };
}
/** Takes back what fits; anything that doesn't stays in the pack. */
export function recoverDrop(state) {
  const d = nearestDrop(state);
  if (!d) return { ok: false, reason: 'Nothing here.' };
  d.items = d.items.map(s => ({ item: s.item, count: inv.add(state.inventory, s.item, s.count) })).filter(s => s.count > 0);
  if (!d.items.length) { state.drops = state.drops.filter(o => o !== d); return { ok: true, reason: 'Pack recovered.' }; }
  return { ok: true, reason: 'Recovered what fits. The rest is still in the pack.' };
}

/** Flares are bent from scrap metal on the spot. */
export function craftFlares(state) {
  if (inv.count(state.inventory, 'flare') + FLARE.makes > ITEM_INFO.flare.stack) return { ok: false, reason: `You can carry ${ITEM_INFO.flare.stack} flares.` };
  if (!canPay(state, FLARE.cost)) return { ok: false, reason: `Flares need ${FLARE.cost.metal} metal.` };
  if (!inv.canFit(state.inventory, { flare: FLARE.makes })) return { ok: false, reason: 'No free slot for flares.' };
  pay(state, FLARE.cost);
  inv.add(state.inventory, 'flare', FLARE.makes);
  return { ok: true, reason: `${FLARE.makes} flares made.` };
}
/**
 * Strikes a flare in hand and throws it at `target` (cave-local {x,z}, or world metres on the surface; straight ahead
 * without one), landing short of the first wall in the way. It burns from the strike: `age` runs from the throw, `t` is the burn left once it lands.
 */
export function throwFlare(state, target = null) {
  const p = state.player;
  if (!inv.count(state.inventory, 'flare')) return { ok: false, reason: 'No flares. Press X to make some from metal.' };
  if (state.flares?.some(f => (f.age ?? Infinity) < FLARE.release)) return { ok: false, reason: '' };
  const zone = p.zone ?? 0, aimed = target && Math.hypot(target.x - p.x, target.z - p.z) > .5;
  const angle = aimed ? Math.atan2(target.x - p.x, target.z - p.z) : p.facing ?? 0, fx = Math.sin(angle), fz = Math.cos(angle);
  const want = aimed ? Math.min(FLARE.range, Math.hypot(target.x - p.x, target.z - p.z)) : FLARE.range * .7;
  let reach = 0;
  for (let d = .25; d <= want; d += .25) { if (p.cave != null && (!caveWalkable(state.seed, p.cave, p.x + fx * d, p.z + fz * d, .1, zone) || silkBlocks(state, p.x + fx * d, p.z + fz * d, .1))) break; reach = d; }
  inv.remove(state.inventory, 'flare', 1);
  state.flares ??= [];
  const flight = FLARE.flight + reach * .05;
  state.flares.push({ cave: p.cave, zone, x: p.x + fx * reach, z: p.z + fz * reach, fromX: p.x, fromZ: p.z, age: 0, flight, t: FLARE.life + FLARE.release + flight });
  while (state.flares.length > FLARE.limit) state.flares.shift();
  return { ok: true, reason: `Flare · ${inv.count(state.inventory, 'flare')} left` };
}

/**
 * Where a flare is now and how bright: `stage` is 'hand' (being struck and wound up; it is wherever the player is),
 * 'flight' (`k` 0..1 along the arc) or 'down'. `lit` is 0 before the cap is struck and sputters out at the end.
 */
export function flareNow(f, player) {
  const age = f.age ?? Infinity, lit = age < FLARE.strike ? 0 : Math.min(1, (age - FLARE.strike) / .15, f.t / 4);
  if (age < FLARE.release) return { stage: 'hand', x: player?.x ?? f.fromX, z: player?.z ?? f.fromZ, lit, k: 0 };
  const k = (age - FLARE.release) / f.flight;
  if (k < 1) return { stage: 'flight', x: f.fromX + (f.x - f.fromX) * k, z: f.fromZ + (f.z - f.fromZ) * k, lit, k };
  return { stage: 'down', x: f.x, z: f.z, lit, k: 1 };
}

/** Health and dropped packs survive a reload; burning flares do not. */
export function restorePeril(state, raw) {
  const h = raw.player?.health;
  if (h != null) { if (typeof h !== 'number' || !(h > 0 && h <= HEALTH.max)) throw new Error('Invalid player.'); state.player.health = h; }
  if (raw.drops == null) return;
  if (!Array.isArray(raw.drops) || raw.drops.length > MAX_DROPS) throw new Error('Invalid dropped pack.');
  state.drops = raw.drops.map(d => {
    const ok = d && Number.isSafeInteger(d.id) && (d.cave === null || [0, 1, 2].includes(d.cave)) && [0, 1, 2].includes(d.zone ?? 0) && Number.isFinite(d.x) && Number.isFinite(d.z) && Math.abs(d.x) < 130 && Math.abs(d.z) < 130 && Array.isArray(d.items) && d.items.length <= inv.SLOT_COUNT
      && d.items.every(s => ITEM_INFO[s?.item] && Number.isInteger(s.count) && s.count > 0 && s.count <= ITEM_INFO[s.item].stack);
    if (!ok) throw new Error('Invalid dropped pack.');
    return { id: d.id, cave: d.cave, zone: d.zone ?? 0, x: d.x, z: d.z, items: d.items.map(s => ({ item: s.item, count: s.count })) };
  });
}
