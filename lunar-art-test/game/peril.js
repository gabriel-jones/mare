import { caveLayout, caveWalkable, caveKey, CAVE_CELL, ZONE_NAMES } from './caves.js';
import { CELL_SIZE, ITEM_INFO } from './defs.js';
import * as inv from './inventory.js';

/** The player's health, what hurts it underground, what happens at zero, and the flares that push back the dark. */
export const HEALTH = Object.freeze({ max: 100, regen: 4, regenDelay: 5, vent: 14, toxic: 6 });
export const FLARE = Object.freeze({ life: 45, radius: 6, range: 7, cost: { metal: 2 }, makes: 3, limit: 6 });
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

/** Real-time step: hazards hurt, the surface heals after a pause, flares burn out. Returns what happened, if anything. */
export function stepPeril(state, dt) {
  const p = state.player;
  p.health ??= HEALTH.max;
  const hazard = hazardAt(state);
  if (hazard) { p.health = Math.max(0, p.health - HEALTH[hazard] * dt); p.calm = 0; }
  else {
    p.calm = (p.calm ?? HEALTH.regenDelay) + dt;
    if (p.cave == null && p.calm >= HEALTH.regenDelay) p.health = Math.min(HEALTH.max, p.health + HEALTH.regen * dt);
  }
  if (state.flares?.length) state.flares = state.flares.filter(f => (f.t -= dt) > 0);
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
  if (!inv.canAfford(state.inventory, FLARE.cost)) return { ok: false, reason: `Flares need ${FLARE.cost.metal} metal.` };
  if (!inv.canFit(state.inventory, { flare: FLARE.makes })) return { ok: false, reason: 'No free slot for flares.' };
  for (const [item, n] of Object.entries(FLARE.cost)) inv.remove(state.inventory, item, n);
  inv.add(state.inventory, 'flare', FLARE.makes);
  return { ok: true, reason: `${FLARE.makes} flares made.` };
}
/** Throws a flare ahead; it lands short of the first wall in the way. Only worth it in the dark. */
export function throwFlare(state) {
  const p = state.player;
  if (p.cave == null) return { ok: false, reason: 'Save flares for the dark.' };
  if (!inv.count(state.inventory, 'flare')) return { ok: false, reason: 'No flares. Press X to make some from metal.' };
  const zone = p.zone ?? 0, fx = Math.sin(p.facing ?? 0), fz = Math.cos(p.facing ?? 0);
  let reach = 0;
  for (let d = .25; d <= FLARE.range; d += .25) { if (!caveWalkable(state.seed, p.cave, p.x + fx * d, p.z + fz * d, .1, zone)) break; reach = d; }
  inv.remove(state.inventory, 'flare', 1);
  state.flares ??= [];
  state.flares.push({ cave: p.cave, zone, x: p.x + fx * reach, z: p.z + fz * reach, t: FLARE.life });
  while (state.flares.length > FLARE.limit) state.flares.shift();
  return { ok: true, reason: `Flare · ${inv.count(state.inventory, 'flare')} left` };
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
