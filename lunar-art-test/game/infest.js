import { caveLayout, caveKey, CAVE_CELL } from './caves.js';

/**
 * The infestation's state: which nests and silk walls a flare has burnt out, and how long until they grow back.
 * The layout of both is seeded (caves.js); `state.burnt` holds { zoneKey: { key: seconds until regrown } } and is
 * saved. A flare lying burning within reach of a nest's mouth or a silk wall sets it alight.
 */
export const INFEST = Object.freeze({ regrow: { nest: 480, silk: 900 }, reach: { nest: 2.2, silk: 1.9 } });

const zoneKey = (id, zone = 0) => zone ? `${id}:${zone}` : `${id}`;
const burntIn = (state, id, zone) => state.burnt?.[zoneKey(id, zone)] ?? {};

export const nestMouth = n => ({ x: n.x * CAVE_CELL + n.dx * .45, z: n.z * CAVE_CELL + n.dz * .45 });
export function isBurnt(state, id, zone, key) { return (burntIn(state, id, zone)[key] ?? 0) > 0; }
/** Nests still alive in a zone. */
export function liveNests(state, id, zone = 0) { const burnt = burntIn(state, id, zone); return caveLayout(state.seed, id, zone).nests.filter(n => !(burnt[n.key] > 0)); }

/** Whether standing silk in the player's zone stops a body of `radius` at (x, z). Crawlers spin it and pass. */
export function silkBlocks(state, x, z, radius = .3) {
  const p = state.player;
  if (p.cave == null) return false;
  const zone = p.zone ?? 0, silk = caveLayout(state.seed, p.cave, zone).silk;
  if (!silk.length) return false;
  const burnt = burntIn(state, p.cave, zone);
  for (const [dx, dz] of [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]]) {
    const k = caveKey(Math.round((x + dx) / CAVE_CELL), Math.round((z + dz) / CAVE_CELL));
    if (silk.some(s => s.key === `silk@${k}` && !(burnt[s.key] > 0))) return true;
  }
  return false;
}

/**
 * Regrowth everywhere, and burning in the player's zone. `fires` are the burning flares lying on the floor there,
 * [{x, z}]. Returns what caught: [{kind: 'nest'|'silk', key}].
 */
export function stepInfest(state, dt, fires = []) {
  for (const [zk, entries] of Object.entries(state.burnt ?? {})) {
    for (const key of Object.keys(entries)) if ((entries[key] -= dt) <= 0) delete entries[key];
    if (!Object.keys(entries).length) delete state.burnt[zk];
  }
  const p = state.player, caught = [];
  if (p.cave == null || !fires.length) return caught;
  const zone = p.zone ?? 0, cave = caveLayout(state.seed, p.cave, zone), burnt = burntIn(state, p.cave, zone);
  const near = (x, z, r) => fires.some(f => Math.hypot(f.x - x, f.z - z) < r);
  const light = (kind, key) => { state.burnt ??= {}; (state.burnt[zoneKey(p.cave, zone)] ??= {})[key] = INFEST.regrow[kind]; caught.push({ kind, key }); };
  for (const n of cave.nests) { const m = nestMouth(n); if (!(burnt[n.key] > 0) && near(m.x, m.z, INFEST.reach.nest)) light('nest', n.key); }
  for (const s of cave.silk) if (!(burnt[s.key] > 0) && near(s.x * CAVE_CELL, s.z * CAVE_CELL, INFEST.reach.silk)) light('silk', s.key);
  return caught;
}

/** Keeps only entries that still name a nest or silk wall in their zone, with a sane time left. */
export function restoreInfest(state, raw) {
  if (!raw.burnt || typeof raw.burnt !== 'object' || Array.isArray(raw.burnt)) return;
  state.burnt = {};
  for (const [zk, entries] of Object.entries(raw.burnt)) {
    if (!/^[0-2](:[12])?$/.test(zk) || !entries || typeof entries !== 'object') continue;
    const [id, zone = 0] = zk.split(':').map(Number), cave = caveLayout(state.seed, id, zone);
    const known = new Map([...cave.nests.map(n => [n.key, 'nest']), ...cave.silk.map(s => [s.key, 'silk'])]);
    const kept = Object.fromEntries(Object.entries(entries).filter(([k, t]) => known.has(k) && Number.isFinite(t) && t > 0 && t <= INFEST.regrow[known.get(k)]));
    if (Object.keys(kept).length) state.burnt[zk] = kept;
  }
}
