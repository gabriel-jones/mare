import { CELL_SIZE, DEFS, footprint } from './defs.js';
import { caveKey } from './caves.js';
import { terrainData } from './terrain.js';
import { CRAWLER, createCrawler, hurtCrawler, stepCrawler } from './crawler.js';
import { GOO } from './goo.js';

/**
 * Raids. Once the colony has built something alien (a xeno lab, a resonance reactor or a goo vat) the crawlers come
 * for it at night: most nights a pack squeezes out of a cave mouth and marches on the base, one at first and more as
 * the raids go on, hatchlings among them in later waves. Raiders claw at the nearest structure, but turn on the
 * player or an android that comes close, and on whoever shoots them. A structure clawed to nothing collapses back to
 * a half-built blueprint: it stops working until it is rebuilt (no new materials), and a damaged one can be patched
 * up with E or by an android. At dawn the survivors run for the caves.
 *
 * `state.raid`: { wave: raids so far, night: the last night considered, quiet: quiet nights in a row,
 *   spawns: [{ t: seconds until it emerges, cave, small }] }. Raiders live in `state.brood` with `raider: true`.
 */
export const RAID = Object.freeze({
  alien: Object.freeze(['xenolab', 'reactor', 'goovat']),
  chance: .7, delay: [6, 22], stagger: 2.2, maxAdults: 6, maxSmall: 4,
  aggro: 10, grudge: 10, grudgeRange: 30, engage: 14, base: 22, retarget: 3,
  march: 3.6, charge: 6.5, bite: 12, claw: .6, mend: 20,
});
export const MAX_RAIDERS = RAID.maxAdults + RAID.maxSmall;
/** News for the player: raids sighted, structures wrecked, raiders gone. Drained by the game each frame. */
export const raidNews = [];

const DAY = 240;
const daylight = t => Math.max(0, Math.sin(t / DAY * Math.PI * 2 + Math.PI / 3));
const cycleOf = t => Math.floor((t - DAY / 3) / DAY);
const between = (rng, [a, b]) => a + (b - a) * rng();
const cellOf = v => Math.round(v / CELL_SIZE);

/** Most a structure can take before it collapses: bigger ones last longer. */
export const buildingHp = type => Math.min(300, 60 + 40 * footprint(type, 0, 0, 0).length);
export const raiders = state => (state.brood ?? []).filter(c => c.raider);
/** Raiders still up and on the move: what the alarm lights answer. */
export const raidAlert = state => raiders(state).some(c => c.state !== 'dead' && !c.gone);
/** Raid size for wave `n` (1-based): adults, then hatchlings from the third raid. */
export function waveSize(n) {
  return { adults: Math.min(RAID.maxAdults, 1 + Math.floor((n - 1) / 2)), small: n >= 3 ? Math.min(RAID.maxSmall, Math.floor((n - 1) / 2)) : 0 };
}
const alienBuilt = state => state.buildings.some(b => b.built && RAID.alien.includes(b.type));

function mouth(state, cave) {
  const c = terrainData(state.seed).caves[cave], dx = Math.sin(c.angle), dz = Math.cos(c.angle);
  return { c, dx, dz, inside: { x: c.x + dx * 2, z: c.z + dz * 2 }, outside: { x: c.x - dx * 5, z: c.z - dz * 5 } };
}
function launch(state, rng, start = between(rng, RAID.delay)) {
  const raid = state.raid, size = waveSize(++raid.wave), caves = terrainData(state.seed).caves.length;
  const first = Math.floor(rng() * caves), second = (first + 1 + Math.floor(rng() * (caves - 1))) % caves;
  const pack = [...Array(size.adults).fill(false), ...Array(size.small).fill(true)];
  raid.spawns = pack.map((small, i) => ({ t: start + i * RAID.stagger, cave: raid.wave >= 5 && i % 2 ? second : first, small }));
  raid.quiet = 0;
}
function emerge(state, s, rng) {
  const m = mouth(state, s.cave), side = (rng() - .5) * 2.4;
  const c = createCrawler(m.inside.x + m.dz * side, m.inside.z - m.dx * side, rng);
  Object.assign(c, { raider: true, state: 'emerge', t: 0, facing: m.c.angle + Math.PI, emergeTo: { x: m.outside.x + m.dz * side, z: m.outside.z - m.dx * side } });
  if (s.small) { c.small = true; c.hp = GOO.hatchlingHp; }
  (state.brood ??= []).push(c);
}

/** Sends raid `wave` out of the caves `delay` seconds from now, whatever the hour. For the art-direction page. */
export function launchRaid(state, wave, delay = 0, rng = Math.random) {
  state.raid ??= { wave: 0, night: cycleOf(state.time), quiet: 0, spawns: [] };
  state.raid.wave = Math.max(0, wave - 1); state.raid.night = cycleOf(state.time);
  launch(state, rng, delay);
  return state.raid;
}

/** Raid scheduling, in the sim tick: arms once alien work is built, picks raid nights, lets the pack out. */
export function stepRaid(state, dt, rng = Math.random) {
  const dark = daylight(state.time) === 0, cycle = cycleOf(state.time);
  if (!state.raid) {
    if (!alienBuilt(state)) return;
    // Armed in the middle of a night, the first raid waits for the next one.
    state.raid = { wave: 0, night: cycle, quiet: 0, spawns: [] };
    raidNews.push('Something in the caves has noticed the alien work. Expect visitors after dark.');
    return;
  }
  const raid = state.raid;
  if (!dark) {
    if (raid.spawns.length) raid.spawns = [];
    for (const c of raiders(state)) if (c.state !== 'dead' && c.retreat == null) c.retreat = nearestCave(state, c);
    return;
  }
  if (raid.night !== cycle) {
    raid.night = cycle;
    if (!raid.wave || raid.quiet >= 1 || rng() < RAID.chance) {
      launch(state, rng);
      const { adults, small } = waveSize(raid.wave);
      raidNews.push(raid.wave === 1 ? 'Movement at a cave mouth. Something is coming.' : `Raid! ${adults + small} crawlers are coming out of the caves.`);
    } else raid.quiet++;
  }
  for (const s of raid.spawns) s.t -= dt;
  const out = raid.spawns.filter(s => s.t <= 0);
  if (!out.length) return;
  raid.spawns = raid.spawns.filter(s => s.t > 0);
  for (const s of out) if ((state.brood?.length ?? 0) < GOO.maxBrood + MAX_RAIDERS) emerge(state, s, rng);
}
function nearestCave(state, c) {
  const caves = terrainData(state.seed).caves;
  return caves.reduce((best, m, i) => Math.hypot(m.x - c.x, m.z - c.z) < Math.hypot(caves[best].x - c.x, caves[best].z - c.z) ? i : best, 0);
}

// The ground the raiders fight over, as the cave-shaped grid crawler.js walks: open squares around the base, with
// every standing structure (and every room) solid. A wrecked one opens up.
let field = { key: '', cave: null };
const solid = b => b.built && (!DEFS[b.type].walkable || !!DEFS[b.type].layer);
function raidGrid(state) {
  const p = state.player, around = state.buildings.filter(b => b.built).map(b => [b.x, b.z]);
  for (const c of raiders(state)) if (c.state !== 'march' && c.state !== 'emerge') around.push([cellOf(c.x), cellOf(c.z)]);
  if (p.cave == null) around.push([cellOf(p.x), cellOf(p.z)]);
  for (const r of state.robots ?? []) if (r.kind === 'android') around.push([cellOf(r.x), cellOf(r.z)]);
  if (!around.length) around.push([0, 0]);
  const xs = around.map(c => c[0]), zs = around.map(c => c[1]), q = 8, pad = 10;
  const box = [Math.floor((Math.min(...xs) - pad) / q) * q, Math.ceil((Math.max(...xs) + pad) / q) * q, Math.floor((Math.min(...zs) - pad) / q) * q, Math.ceil((Math.max(...zs) + pad) / q) * q];
  const sig = state.buildings.filter(solid).map(b => `${b.id}:${b.x}:${b.z}:${b.rotation}`).join('|');
  const key = `${box.join()}#${sig}`;
  if (field.key === key) return field.cave;
  const blocked = new Set(state.buildings.filter(solid).flatMap(b => footprint(b.type, b.x, b.z, b.rotation).map(c => caveKey(c.x, c.z))));
  const cells = new Set();
  for (let x = box[0]; x <= box[1]; x++) for (let z = box[2]; z <= box[3]; z++) { const k = caveKey(x, z); if (!blocked.has(k)) cells.add(k); }
  field = { key, cave: { cells, zone: 0, box } };
  return field.cave;
}
const inBox = (grid, x, z) => { const cx = cellOf(x), cz = cellOf(z), b = grid.box; return cx >= b[0] && cx <= b[1] && cz >= b[2] && cz <= b[3]; };
const openAt = (grid, x, z) => !inBox(grid, x, z) || grid.cells.has(caveKey(cellOf(x), cellOf(z)));

/** The open square beside `b` nearest to `c`, in metres, or null when it is walled in. */
function strikePoint(grid, b, c) {
  const cells = footprint(b.type, b.x, b.z, b.rotation), inside = new Set(cells.map(s => caveKey(s.x, s.z)));
  let best = null, bestD = Infinity;
  for (const s of cells) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const k = caveKey(s.x + dx, s.z + dz);
    if (inside.has(k) || !grid.cells.has(k)) continue;
    const x = (s.x + dx) * CELL_SIZE, z = (s.z + dz) * CELL_SIZE, d = Math.hypot(x - c.x, z - c.z);
    if (d < bestD) { bestD = d; best = { x, z, edge: { x: s.x * CELL_SIZE, z: s.z * CELL_SIZE } }; }
  }
  return best;
}
function pickTarget(state, grid, c) {
  const centre = b => { const f = footprint(b.type, b.x, b.z, b.rotation); return { x: f.reduce((s, q) => s + q.x, 0) / f.length * CELL_SIZE, z: f.reduce((s, q) => s + q.z, 0) / f.length * CELL_SIZE }; };
  const options = state.buildings.filter(b => b.built && b.type !== 'conveyor').map(b => ({ b, at: centre(b) })).sort((a, b) => Math.hypot(a.at.x - c.x, a.at.z - c.z) - Math.hypot(b.at.x - c.x, b.at.z - c.z));
  for (const { b } of options) { const point = strikePoint(grid, b, c); if (point) return { id: b.id, point }; }
  return null;
}

/** Claws land on a structure. At nothing left it collapses to a half-built blueprint, already paid for. */
export function damageBuilding(state, b, n) {
  if (!b?.built) return false;
  b.hp = Math.max(0, (b.hp ?? buildingHp(b.type)) - n);
  if (b.hp > 0) return false;
  delete b.hp;
  Object.assign(b, { built: false, progress: .5, paid: { ...DEFS[b.type].cost }, wreck: true });
  raidNews.push(`${DEFS[b.type].name} wrecked! Rebuild it (hold E) to get it working again.`);
  return true;
}
/** A standing structure the player could patch up from where they stand. */
export function damagedNear(state, range = 5) {
  const p = state.player;
  if (p.cave != null) return null;
  let found = null, best = range;
  for (const b of state.buildings) {
    if (!b.built || b.hp == null) continue;
    const f = footprint(b.type, b.x, b.z, b.rotation), d = Math.min(...f.map(s => Math.hypot(s.x * CELL_SIZE - p.x, s.z * CELL_SIZE - p.z)));
    if (d < best) { best = d; found = b; }
  }
  return found;
}
/** Patches a damaged structure up a little; returns true once it is whole. */
export function mend(b, dt, rate = RAID.mend) {
  if (!b?.built || b.hp == null) return true;
  b.hp += rate * dt;
  if (b.hp < buildingHp(b.type)) return false;
  delete b.hp; return true;
}

function march(c, goal, dt, grid) {
  const dx = goal.x - c.x, dz = goal.z - c.z, d = Math.hypot(dx, dz);
  if (d < .05) { c.speed = 0; return; }
  // A loping weave, so a pack crossing the plain doesn't read as a column. Under fire it charges, jinking hard.
  const angry = c.grudge > 0, weave = Math.sin(c.t * (angry ? 4.2 : 1.3) + (c.seed ??= Math.random() * 6.28)) * (angry ? .7 : .35), a = Math.atan2(dx, dz) + weave * Math.min(1, d / 6);
  const step = Math.min(d, (angry ? RAID.charge : RAID.march) * dt), nx = c.x + Math.sin(a) * step, nz = c.z + Math.cos(a) * step;
  if (openAt(grid, nx, nz)) { c.x = nx; c.z = nz; c.speed = step / dt; } else c.speed = 0;
  let turn = a - c.facing; turn = Math.atan2(Math.sin(turn), Math.cos(turn)); c.facing += turn * Math.min(1, dt * 8);
  return c.speed > 0;
}

/**
 * Raiders on the surface. They march on the base, claw at its structures and turn on whoever comes near. They act
 * whether or not the player is down a cave. `fires` are burning flares and flame on the surface, [{x, z, r}].
 * Returns events: strike {building}, wreck {building}, bite {android}, killed, and crawler.js's.
 */
export function stepRaiders(state, dt, fires = [], rng = Math.random) {
  const list = raiders(state), events = [];
  if (!list.length) return events;
  const p = state.player, surface = p.cave == null, grid = raidGrid(state);
  const androids = (state.robots ?? []).filter(r => r.kind === 'android' && !r.down);
  const people = [...(surface ? [p] : []), ...androids].filter(o => openAt(grid, o.x, o.z));
  const built = state.buildings.filter(b => b.built);
  for (const c of list) {
    if (c.state === 'dead') { stepCrawler(c, { cave: grid, player: { x: c.x, z: c.z, facing: 0 } }, dt, rng); continue; }
    if (surface && fires.some(f => Math.hypot(c.x - f.x, c.z - f.z) < f.r * .6)) {
      c.burnt = true; if (hurtCrawler(c, GOO.burnDamage * dt, rng).killed) { events.push({ type: 'killed', crawler: c }); continue; }
    }
    // Shot, it goes for whoever is nearest of those who could have fired.
    if (c.lastHp != null && c.hp < c.lastHp && !c.burnt) c.grudge = RAID.grudge;
    c.lastHp = c.hp; c.burnt = false; c.grudge = Math.max(0, (c.grudge ?? 0) - dt);
    c.near = built.some(b => Math.hypot(b.x * CELL_SIZE - c.x, b.z * CELL_SIZE - c.z) < RAID.base);
    if (c.state === 'emerge') { stepCrawler(c, { cave: grid, player: c.emergeTo ?? c, flares: fires }, dt, rng); if (c.state !== 'emerge') enterMarch(c); continue; }
    if (c.retreat != null) {
      if (['hit', 'lunge', 'shriek', 'slash'].includes(c.state) && c.t < 1) { stepCrawler(c, { cave: grid, player: { x: c.x, z: c.z + 3, facing: 0, lamp: false }, flares: fires }, dt, rng); continue; }
      const m = mouth(state, c.retreat), goal = Math.hypot(m.outside.x - c.x, m.outside.z - c.z) > 1.2 && !c.inMouth ? m.outside : (c.inMouth = true, m.inside);
      c.state = 'march'; c.aimAt = null; march(c, goal, dt, { box: [1, 0, 1, 0], cells: new Set() });
      if (c.inMouth && Math.hypot(m.inside.x - c.x, m.inside.z - c.z) < .4) c.gone = true;
      continue;
    }
    const near = o => Math.hypot(o.x - c.x, o.z - c.z);
    const locked = ['shriek', 'lunge', 'slash'].includes(c.state);
    let prey = locked && c.prey != null ? (c.prey === 'player' ? (surface ? p : null) : androids.find(r => r.id === c.prey)) : null;
    if (!prey && !(locked && c.target)) {
      const reach = c.grudge > 0 ? RAID.grudgeRange : RAID.aggro;
      prey = people.filter(o => near(o) < reach).sort((a, b) => near(a) - near(b))[0] ?? null;
    }
    c.prey = prey ? (prey === p ? 'player' : prey.id) : null;
    if (!prey) {
      const b = c.target && state.buildings.find(b => b.id === c.target.id);
      if (!b?.built || (c.retarget = (c.retarget ?? 0) - dt) <= 0 && !locked) { c.target = pickTarget(state, grid, c); c.retarget = RAID.retarget; }
    }
    const goal = prey ? { x: prey.x, z: prey.z } : c.target?.point;
    if (!goal) { c.retreat = nearestCave(state, c); continue; }
    c.aimAt = prey ? goal : c.target.edge;
    const d = near(goal);
    if (['lurk', 'stalk', 'close'].includes(c.state) && d > RAID.engage) enterMarch(c);
    if (c.state === 'march') {
      c.t += dt;
      if (d <= RAID.engage && openAt(grid, c.x, c.z) && inBox(grid, c.x, c.z)) { c.state = 'stalk'; c.t = 0; c.patience = 0; c.goal = null; }
      else if (!march(c, goal, dt, grid) && inBox(grid, c.x, c.z)) { c.state = 'stalk'; c.t = 0; c.goal = null; }
      c.anim = 'stalk';
      continue;
    }
    const target = prey ? null : state.buildings.find(b => b.id === c.target.id);
    const env = prey
      ? { cave: grid, player: prey === p ? { x: p.x, z: p.z, facing: p.facing ?? 0, lamp: true, invulnerable: (p.y ?? 0) > .6 } : { x: prey.x, z: prey.z, facing: prey.facing, lamp: true, invulnerable: false }, flares: fires }
      : { cave: grid, player: { x: goal.x, z: goal.z, facing: Math.atan2(c.x - goal.x, c.z - goal.z), lamp: true, invulnerable: false }, flares: fires };
    for (const e of stepCrawler(c, env, dt, rng)) {
      if (e.type === 'grab' || e.type === 'slash') {
        const damage = e.type === 'grab' ? RAID.bite : e.damage * (c.small ? .6 : 1);
        if (e.type === 'grab') { c.state = 'flee'; c.t = 0; c.goal = null; }
        if (prey === p) { p.health = Math.max(0, (p.health ?? 100) - damage); p.calm = 0; events.push({ type: 'bite', crawler: c, android: null }); }
        else if (prey) { if ((prey.hp = Math.max(0, prey.hp - damage)) <= 0) Object.assign(prey, { down: true, task: 'down', job: null, next: null }); events.push({ type: 'bite', crawler: c, android: prey.id }); }
        else if (target) { const wrecked = damageBuilding(state, target, damage * RAID.claw); events.push({ type: wrecked ? 'wreck' : 'strike', crawler: c, building: target.id }); if (wrecked) c.target = null; }
      } else if (e.type !== 'drag' && e.type !== 'hurt') events.push({ ...e, crawler: c });
    }
  }
  const left = list.filter(c => c.gone).length;
  state.brood = state.brood.filter(c => !c.gone && !(c.raider && c.state === 'dead' && c.t > 6.5));
  if (left && !raidAlert(state)) raidNews.push(left > 1 ? 'The raiders have gone back to the caves.' : 'The raider has gone back to the caves.');
  return events;
}
function enterMarch(c) { c.state = 'march'; c.t = 0; c.goal = null; c.speed = 0; }

const finite = n => typeof n === 'number' && Number.isFinite(n);
export function restoreRaid(state, raw) {
  if (raw.raid == null) return;
  const r = raw.raid;
  if (!r || !Number.isInteger(r.wave) || r.wave < 0 || r.wave > 1e5 || !Number.isInteger(r.night) || !Number.isInteger(r.quiet) || r.quiet < 0 || !Array.isArray(r.spawns) || r.spawns.length > MAX_RAIDERS
    || !r.spawns.every(s => finite(s?.t) && s.t >= -1 && s.t <= 120 && Number.isInteger(s.cave) && s.cave >= 0 && s.cave <= 2 && typeof s.small === 'boolean')) throw new Error('Invalid raid.');
  state.raid = { wave: r.wave, night: r.night, quiet: Math.min(r.quiet, 10), spawns: r.spawns.map(s => ({ t: s.t, cave: s.cave, small: s.small })) };
}
