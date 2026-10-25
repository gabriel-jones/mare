import { CELL_SIZE, DEFS, footprint } from './defs.js';
import { caveKey } from './caves.js';
import { terrainData } from './terrain.js';
import { KINDS, asKind, blocks, closeIn, createCrawler, hurtCrawler, scorchCrawler, spill, stepCrawler as stepOne } from './crawler.js';
import { SHAPE, burrow, createCentipede, huntCentipede, stepCentipede } from './centipede.js';
import { GOO } from './goo.js';
import { stepHorror, surge } from './horror.js';
import { planetOf } from './planets.js';
import { LADDER, ROSTER_KINDS, roster, rosterCount } from './roster.js';

/**
 * Raids. Once the colony has built something alien (a xeno lab, a resonance reactor or a goo vat) the crawlers come
 * for it at night: most nights a pack squeezes out of a cave mouth, gathers, and marches on the base together. Wave n
 * is level n of the roster (roster.js): a few brood and a crawler at first, then drones, brutes, centipedes and matrons
 * (see KINDS) as the raids go on; a big one killed bursts into a spill of fast, weak brood. In later raids a second pack
 * comes from another cave, and centipedes (centipede.js) tunnel out of the caves on their own and come up among the
 * defenders. Raiders go for the nearest structure, rear and tear at it blow after blow, but turn on the player or an
 * android that comes close, and on whoever shoots them. A structure torn to nothing collapses back to a half-built
 * blueprint: it stops working until it is rebuilt (no new materials), and a damaged one can be patched up with E or by
 * an android. At dawn the survivors run for the caves.
 *
 * `state.raid`: { wave: raids so far, night: the last night considered, quiet: quiet nights in a row,
 *   spawns: [{ t: seconds until it emerges, cave, kind, pack }] }. Raiders live in `state.brood` with `raider: true`.
 */
export const RAID = Object.freeze({
  alien: Object.freeze(['xenolab', 'reactor', 'goovat']),
  chance: .7, delay: [6, 22], stagger: .45, packGap: 5, live: 30, lead: 2.5,
  aggro: 10, grudge: 10, grudgeRange: 30, engage: 14, base: 22, retarget: 3,
  march: 3.6, charge: 6.5, bite: 12, mend: 20,
  // Tearing at a structure: a rear of `windup` (longer for the big ones), then a blow of `maul` times its might.
  maul: 10, windup: .5, blow: .4, slam: 1.5,
  // Most of one kind a raid built in the lab may send.
  most: 8,
});
export const MAX_RAIDERS = RAID.live;
const MAX_SPAWNS = Math.max(ROSTER_KINDS.reduce((n, k) => n + LADDER[k].most, 0), RAID.most * ROSTER_KINDS.length);
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
/** Raid make-up for wave `n` (1-based): level n of the roster. */
export const waveSize = n => roster(n);
const waveCount = rosterCount;
const mightOf = c => KINDS[c.kind]?.might ?? (c.small ? .6 : 1);
const alienBuilt = state => state.buildings.some(b => b.built && RAID.alien.includes(b.type));

function mouth(state, cave) {
  const c = terrainData(state.seed).caves[cave], dx = Math.sin(c.angle), dz = Math.cos(c.angle);
  return { c, dx, dz, inside: { x: c.x + dx * 2, z: c.z + dz * 2 }, outside: { x: c.x - dx * 5, z: c.z - dz * 5 } };
}
function launch(state, rng, start = between(rng, RAID.delay), make = null) {
  const raid = state.raid, size = make ?? waveSize(raid.wave + 1), caves = terrainData(state.seed).caves.length;
  raid.wave++;
  const first = Math.floor(rng() * caves), second = (first + 1 + Math.floor(rng() * (caves - 1))) % caves;
  // Biggest first, dealt between the packs so each has its share; each pack squeezes out in a quick run. Centipedes
  // keep to no pack: each tunnels out on its own, one from each cave in turn.
  const count = k => Math.max(0, Math.min(RAID.most, Math.floor(size[k] ?? 0)));
  const kinds = ROSTER_KINDS.filter(k => k !== 'centipede').flatMap(k => Array(count(k)).fill(k)), split = raid.wave >= 5 && kinds.length > 2;
  const packs = [[], []];
  kinds.forEach((kind, i) => packs[split ? i % 2 : 0].push(kind));
  raid.spawns = packs.flatMap((list, p) => list.map((kind, i) => ({ t: start + p * RAID.packGap + i * RAID.stagger, cave: p ? second : first, kind, pack: raid.wave * 2 + p })));
  for (let i = 0; i < count('centipede'); i++) raid.spawns.push({ t: start + RAID.packGap * (i + .5), cave: i % 2 ? second : first, kind: 'centipede', pack: null });
  raid.quiet = 0;
}
function emerge(state, s, rng) {
  const m = mouth(state, s.cave), side = (rng() - .5) * 2.4;
  // A centipede doesn't walk out: it tunnels from the cave and bursts up on the plain beyond the mouth.
  if (s.kind === 'centipede') {
    const popAt = { x: m.outside.x - m.dx * 4 + m.dz * side, z: m.outside.z - m.dz * 4 - m.dx * side };
    (state.brood ??= []).push(Object.assign(createCentipede(m.inside.x, m.inside.z, { ...SHAPE, facing: m.c.angle + Math.PI, under: true, popAt }), { raider: true }));
    return;
  }
  const c = asKind(createCrawler(m.inside.x + m.dz * side, m.inside.z - m.dx * side, rng), s.kind);
  Object.assign(c, { pack: s.pack, raider: true, state: 'emerge', t: 0, facing: m.c.angle + Math.PI, emergeTo: { x: m.outside.x + m.dz * side, z: m.outside.z - m.dx * side } });
  (state.brood ??= []).push(c);
}

/**
 * Sends raid `wave` out of the caves `delay` seconds from now, whatever the hour. `make` ({kind: count}, see roster.js)
 * overrides the wave's make-up. For the art-direction page.
 */
export function launchRaid(state, wave, delay = 0, rng = Math.random, make = null) {
  state.raid ??= { wave: 0, night: cycleOf(state.time), quiet: 0, spawns: [] };
  state.raid.wave = Math.max(0, wave - 1); state.raid.night = cycleOf(state.time);
  launch(state, rng, delay, make);
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
      const w = waveSize(raid.wave), big = w.matron ? ', a matron among them' : w.brute ? ', brutes among them' : w.drone ? ', drones among them' : '';
      const crawlers = waveCount(w) - w.centipede, under = w.centipede ? ` The ground is trembling: something long is tunnelling from the caves.` : '';
      raidNews.push(raid.wave === 1 ? 'Movement at a cave mouth. Something is coming.' : `Raid! ${crawlers} crawlers are gathering at the caves${big}.${under}`);
    } else raid.quiet++;
  }
  for (const s of raid.spawns) s.t -= dt;
  const out = raid.spawns.filter(s => s.t <= 0);
  if (!out.length) return;
  raid.spawns = raid.spawns.filter(s => s.t > 0);
  for (const s of out) if (raiders(state).length < MAX_RAIDERS) emerge(state, s, rng);
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
  for (const c of raiders(state)) if (c.state !== 'march' && c.state !== 'emerge' && c.kind !== 'centipede') around.push([cellOf(c.x), cellOf(c.z)]);
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

/** Turns raider `c` on structure `b` (a defence that stung it), unless it is busy with a person or `b` is walled in. */
export function provoke(state, c, b) {
  if (c.prey != null || c.retreat != null || c.kind === 'centipede' || c.target?.id === b.id) return false;
  const point = strikePoint(raidGrid(state), b, c);
  if (!point) return false;
  c.target = { id: b.id, point }; c.retarget = RAID.retarget * 2; c.mauling = false;
  return true;
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

function march(c, goal, dt, grid, hold = 1) {
  const dx = goal.x - c.x, dz = goal.z - c.z, d = Math.hypot(dx, dz);
  if (d < .05) { c.speed = 0; return; }
  // A loping weave, so a pack crossing the plain doesn't read as a column. Under fire it charges, jinking hard.
  const angry = c.grudge > 0, weave = Math.sin(c.t * (angry ? 4.2 : 1.3) + (c.seed ??= Math.random() * 6.28)) * (angry ? .7 : .35), a = Math.atan2(dx, dz) + weave * Math.min(1, d / 6);
  const step = Math.min(d, (angry ? RAID.charge : RAID.march) * (c.pace ?? 1) * hold * (c.martian ? surge(c, dt) : 1) * dt), nx = c.x + Math.sin(a) * step, nz = c.z + Math.cos(a) * step;
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
  const p = state.player, surface = p.cave == null, grid = raidGrid(state), mars = planetOf(state.seed) === 'mars', stepCrawler = mars ? stepHorror : stepOne;
  const androids = (state.robots ?? []).filter(r => r.kind === 'android' && !r.down);
  const people = [...(surface ? [p] : []), ...androids].filter(o => openAt(grid, o.x, o.z));
  const built = state.buildings.filter(b => b.built);
  // A pack waits at the cave mouth until all of it is out, then keeps together: whoever gets ahead slows for the rest.
  const waiting = new Set([...(state.raid?.spawns ?? []).map(s => s.pack), ...list.filter(c => c.state === 'emerge').map(c => c.pack)]);
  const packs = new Map();
  for (const c of list) if (c.pack != null && c.state === 'march' && c.retreat == null) { const g = packs.get(c.pack) ?? { x: 0, z: 0, n: 0 }; g.x += c.x; g.z += c.z; g.n++; packs.set(c.pack, g); }
  for (const c of list) {
    if (mars) c.martian = true;
    if (c.state === 'dead') {
      if (!c.burst && KINDS[c.kind]?.burst) { c.burst = true; const n = burst(state, c, rng); if (n) events.push({ type: 'burst', crawler: c, count: n }); }
      if (c.kind === 'centipede') stepCentipede(c, dt, { rng }); else stepCrawler(c, { cave: grid, player: { x: c.x, z: c.z, facing: 0 } }, dt, rng);
      continue;
    }
    if (surface && fires.some(f => Math.hypot(c.x - f.x, c.z - f.z) < f.r * .6)) {
      c.burnt = true; if (hurtCrawler(c, GOO.burnDamage * dt, rng).killed) { events.push({ type: 'killed', crawler: c }); continue; }
    }
    // Shot, it goes for whoever is nearest of those who could have fired.
    if (c.lastHp != null && c.hp < c.lastHp && !c.burnt) c.grudge = RAID.grudge;
    c.lastHp = c.hp; c.burnt = false; c.grudge = Math.max(0, (c.grudge ?? 0) - dt);
    c.near = built.some(b => Math.hypot(b.x * CELL_SIZE - c.x, b.z * CELL_SIZE - c.z) < RAID.base);
    if (c.kind === 'centipede') { raidCentipede(state, c, grid, people, dt, rng, events); continue; }
    if (c.state === 'emerge') { stepCrawler(c, { cave: grid, player: c.emergeTo ?? c, flares: fires }, dt, rng); if (c.state !== 'emerge') enterMarch(c); continue; }
    if (c.retreat != null) {
      if (['hit', 'lunge', 'shriek', 'slash'].includes(c.state) && c.t < 1) { stepCrawler(c, { cave: grid, player: { x: c.x, z: c.z + 3, facing: 0, lamp: false }, flares: fires }, dt, rng); continue; }
      const m = mouth(state, c.retreat), goal = Math.hypot(m.outside.x - c.x, m.outside.z - c.z) > 1.2 && !c.inMouth ? m.outside : (c.inMouth = true, m.inside);
      c.state = 'march'; c.aimAt = null; march(c, goal, dt, { box: [1, 0, 1, 0], cells: new Set() });
      if (c.inMouth && Math.hypot(m.inside.x - c.x, m.inside.z - c.z) < .4) c.gone = true;
      continue;
    }
    const near = o => Math.hypot(o.x - c.x, o.z - c.z);
    const locked = !c.mauling && ['shriek', 'lunge', 'slash'].includes(c.state);
    let prey = locked && c.prey != null ? (c.prey === 'player' ? (surface ? p : null) : androids.find(r => r.id === c.prey)) : null;
    if (!prey && !(locked && c.target)) {
      const reach = c.grudge > 0 ? RAID.grudgeRange : RAID.aggro;
      prey = people.filter(o => near(o) < reach).sort((a, b) => near(a) - near(b))[0] ?? null;
    }
    c.prey = prey ? (prey === p ? 'player' : prey.id) : null;
    if (!prey) {
      const b = c.target && state.buildings.find(b => b.id === c.target.id);
      if (!b?.built || (c.retarget = (c.retarget ?? 0) - dt) <= 0 && !locked && !c.mauling) { c.target = pickTarget(state, grid, c); c.retarget = RAID.retarget; c.mauling = false; }
    }
    const goal = prey ? { x: prey.x, z: prey.z } : c.target?.point;
    if (!goal) { c.retreat = nearestCave(state, c); c.mauling = false; continue; }
    c.aimAt = prey ? goal : c.target.point.edge;
    const d = near(goal);
    if (prey && c.mauling) { c.mauling = false; enter(c, 'stalk'); }
    if (!prey && c.state !== 'march' && maul(state, c, grid, dt, rng, events)) continue;
    if (['lurk', 'stalk', 'close'].includes(c.state) && d > RAID.engage) enterMarch(c);
    if (c.state === 'march') {
      c.t += dt;
      if (c.pack != null && !c.mustered) {
        if (waiting.has(c.pack) && !prey && !c.grudge) { c.speed = 0; c.anim = 'stalk'; continue; }
        c.mustered = true;
      }
      const g = c.pack != null && packs.get(c.pack), ahead = g && g.n > 1 ? ((c.x - g.x / g.n) * (goal.x - c.x) + (c.z - g.z / g.n) * (goal.z - c.z)) / (d || 1) : 0;
      // In among the base it closes on a person to strike, or walks up to a structure to tear at it.
      if (d <= (prey ? RAID.engage : 2) && openAt(grid, c.x, c.z) && inBox(grid, c.x, c.z)) { c.state = prey ? 'stalk' : 'close'; c.t = 0; c.patience = 0; c.goal = null; }
      else if (!march(c, goal, dt, grid, ahead > RAID.lead && !prey ? .35 : 1) && inBox(grid, c.x, c.z)) { c.state = prey ? 'stalk' : 'close'; c.t = 0; c.goal = null; }
      c.anim = 'stalk';
      continue;
    }
    const target = prey ? null : state.buildings.find(b => b.id === c.target.id);
    const env = prey
      ? { cave: grid, player: prey === p ? { x: p.x, z: p.z, facing: p.facing ?? 0, lamp: true, invulnerable: (p.y ?? 0) > .6, guard: p.guard } : { x: prey.x, z: prey.z, facing: prey.facing, lamp: true, invulnerable: false }, flares: fires }
      : { cave: grid, player: { x: goal.x, z: goal.z, facing: Math.atan2(c.x - goal.x, c.z - goal.z), lamp: true, invulnerable: false }, flares: fires };
    for (const e of stepCrawler(c, env, dt, rng)) {
      if (e.type === 'parried') { const r = scorchCrawler(c, e.zap, rng); events.push({ type: 'parried', crawler: c, perfect: e.perfect, x: c.x, z: c.z, killed: r.killed }); continue; }
      if (e.type === 'grab' || e.type === 'slash') {
        const damage = (e.type === 'grab' ? RAID.bite : e.damage) * mightOf(c);
        if (e.type === 'grab') { c.state = 'flee'; c.t = 0; c.goal = null; }
        if (prey === p) { p.health = Math.max(0, (p.health ?? 100) - damage); p.calm = 0; events.push({ type: 'bite', crawler: c, android: null }); }
        else if (prey) { if ((prey.hp = Math.max(0, prey.hp - damage)) <= 0) Object.assign(prey, { down: true, task: 'down', job: null, next: null }); events.push({ type: 'bite', crawler: c, android: prey.id }); }
        else if (target) { const wrecked = damageBuilding(state, target, damage); events.push({ type: wrecked ? 'wreck' : 'strike', crawler: c, building: target.id, x: c.target.point.edge.x, z: c.target.point.edge.z, damage }); if (wrecked) c.target = null; }
      } else if (e.type !== 'drag' && e.type !== 'hurt') events.push({ ...e, crawler: c });
    }
  }
  const left = list.filter(c => c.gone).length;
  state.brood = state.brood.filter(c => !c.gone && !(c.raider && c.state === 'dead' && c.t > 6.5));
  if (left && !raidAlert(state)) raidNews.push(left > 1 ? 'The raiders have gone back to the caves.' : 'The raider has gone back to the caves.');
  return events;
}
/**
 * A centipede in a raid goes for whoever is near, or else the nearest structure, coming down on it from a rear; it
 * tunnels to anything far off. At dawn it digs back to the caves.
 */
function raidCentipede(state, c, grid, people, dt, rng, events) {
  const p = state.player, open = (x, z) => openAt(grid, x, z);
  if (c.retreat != null) {
    const m = mouth(state, c.retreat);
    if (c.state === 'crawl') burrow(c, m.inside);
    if (c.state === 'under' || c.state === 'dive') c.popAt = m.inside;
    stepCentipede(c, dt, { goal: m.inside, rng, open });
    if (c.state === 'under' && Math.hypot(m.inside.x - c.x, m.inside.z - c.z) < 2) c.gone = true;
    return;
  }
  const near = o => Math.hypot(o.x - c.x, o.z - c.z), reach = c.grudge > 0 ? RAID.grudgeRange : RAID.aggro + 4;
  const prey = people.filter(o => near(o) < reach).sort((a, b) => near(a) - near(b))[0] ?? null;
  c.prey = prey ? (prey === p ? 'player' : prey.id) : null;
  if (!prey) {
    const b = c.target && state.buildings.find(b => b.id === c.target.id);
    if (!b?.built || (c.retarget = (c.retarget ?? 0) - dt) <= 0) { c.target = pickTarget(state, grid, c); c.retarget = RAID.retarget; }
    if (!c.target) { c.retreat = nearestCave(state, c); return; }
  }
  const at = prey ?? c.target.point;
  c.aimAt = prey ? { x: prey.x, z: prey.z } : c.target.point.edge;
  for (const e of huntCentipede(c, dt, { prey: { x: at.x, z: at.z, invulnerable: prey === p && (p.y ?? 0) > .6 }, open, rng })) {
    if (e.type !== 'strike') { events.push({ ...e, crawler: c }); continue; }
    if (prey === p && blocks(p, c)) { events.push({ type: 'parried', crawler: c, perfect: p.guard === 'perfect', heavy: true, x: c.x, z: c.z }); continue; }
    if (prey === p) { p.health = Math.max(0, (p.health ?? 100) - e.damage); p.calm = 0; events.push({ type: 'bite', crawler: c, android: null }); }
    else if (prey) { if ((prey.hp = Math.max(0, prey.hp - e.damage)) <= 0) Object.assign(prey, { down: true, task: 'down', job: null, next: null }); events.push({ type: 'bite', crawler: c, android: prey.id }); }
    else {
      const target = state.buildings.find(b => b.id === c.target.id), damage = e.damage * RAID.slam, wrecked = damageBuilding(state, target, damage);
      events.push({ type: wrecked ? 'wreck' : 'strike', crawler: c, building: target?.id, x: c.target.point.edge.x, z: c.target.point.edge.z, damage, slam: true });
      if (wrecked) c.target = null;
    }
  }
}
/**
 * At a structure: it walks up to the structure's open side, then rears and tears at it, blow after blow, until it
 * falls. Returns false while the crawler is caught up in something of its own (a flinch, a flight from fire) for
 * stepCrawler to play out.
 */
function maul(state, c, grid, dt, rng, events) {
  if (!['close', 'shriek', 'slash', 'stalk', 'lurk', 'recover'].includes(c.state)) { c.mauling = false; return false; }
  const t = c.target, b = t && state.buildings.find(b => b.id === t.id);
  if (!b?.built) { c.mauling = false; return false; }
  const size = c.size ?? 1, goal = t.point, d = Math.hypot(goal.x - c.x, goal.z - c.z);
  if (c.mauling && d > .8 + .3 * size) c.mauling = false;
  if (!c.mauling) {
    if (d > .35) {
      if (c.state !== 'close') enter(c, 'close');
      c.t += dt;
      if (!march(c, goal, dt, grid)) closeIn(c, grid, goal, dt, rng);
      return true;
    }
    c.mauling = true; enter(c, 'shriek');
  }
  c.speed = 0; c.t += dt;
  let turn = Math.atan2(t.point.edge.x - c.x, t.point.edge.z - c.z) - c.facing; turn = Math.atan2(Math.sin(turn), Math.cos(turn)); c.facing += turn * Math.min(1, dt * 6);
  if (c.state === 'shriek' && c.t >= RAID.windup * Math.sqrt(Math.max(1, size))) {
    enter(c, 'slash');
    const damage = RAID.maul * mightOf(c), wrecked = damageBuilding(state, b, damage);
    events.push({ type: wrecked ? 'wreck' : 'strike', crawler: c, building: b.id, x: t.point.edge.x, z: t.point.edge.z, damage });
    if (wrecked) { c.target = null; c.mauling = false; }
  } else if (c.state === 'slash' && c.t >= RAID.blow) enter(c, 'shriek');
  else if (c.state !== 'shriek' && c.state !== 'slash') enter(c, 'shriek');
  return true;
}
/** A big raider's abdomen splits as it dies: its brood scatter out and go straight for whoever is nearest. */
function burst(state, c, rng) {
  const room = MAX_RAIDERS - raiders(state).filter(o => o.state !== 'dead').length, n = Math.min(KINDS[c.kind].burst, Math.max(0, room));
  for (const b of spill(c, n, rng)) state.brood.push(Object.assign(b, { raider: true, grudge: RAID.grudge }));
  return n;
}
function enter(c, state) { c.state = state; c.t = 0; c.goal = null; c.think = 0; }
function enterMarch(c) { c.state = 'march'; c.t = 0; c.goal = null; c.speed = 0; }

const finite = n => typeof n === 'number' && Number.isFinite(n);
export function restoreRaid(state, raw) {
  if (raw.raid == null) return;
  const r = raw.raid;
  if (!r || !Number.isInteger(r.wave) || r.wave < 0 || r.wave > 1e5 || !Number.isInteger(r.night) || !Number.isInteger(r.quiet) || r.quiet < 0 || !Array.isArray(r.spawns) || r.spawns.length > Math.max(MAX_SPAWNS, 10)
    || !r.spawns.every(s => finite(s?.t) && s.t >= -1 && s.t <= 120 && Number.isInteger(s.cave) && s.cave >= 0 && s.cave <= 2 && (KINDS[s.kind] || typeof s.small === 'boolean') && (s.pack == null || Number.isInteger(s.pack)))) throw new Error('Invalid raid.');
  // Saves from before raider sizes spawned plain adults and hatchlings: they come back as drones and brood.
  state.raid = { wave: r.wave, night: r.night, quiet: Math.min(r.quiet, 10), spawns: r.spawns.map(s => ({ t: s.t, cave: s.cave, kind: KINDS[s.kind] ? s.kind : s.small ? 'brood' : 'drone', pack: s.kind === 'centipede' ? null : s.pack ?? r.wave * 2 })) };
}
