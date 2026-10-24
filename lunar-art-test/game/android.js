import { CELL_SIZE, DEFS, DIRS, ITEM_INFO, footprint } from './defs.js';
import * as inv from './inventory.js';
import { baseCount, crateCentre, crates, draw, pay, stash } from './storage.js';
import { STATIONS, isStation, jobProduct, readyCount, roomStatus } from './life.js';
import { CROPS, cropsFor, defaultCrop, isGrower } from './farm.js';
import { BIO } from './power.js';
import { WEAPONS } from './arms.js';
import { CRAWLER, hurtCrawler, partNear, partsOf, radiusOf, sizeOf } from './crawler.js';
import { cellPassable } from './paths.js';
import { habitatLayout } from './habitat.js';
import { createAndroid, freePad } from './space.js';
import { mend } from './raid.js';
import { surfaceHeightAt } from './terrain.js';

/**
 * Androids: humanoid workers that do the colony's chores in a fixed order of priority. They take up arms from the
 * armory (or a crate) while hatchlings are loose, then put them back; get a downed android back on its feet;
 * build blueprints, carrying the materials over from the crates; patch up raid damage; feed bioreactors; carry finished goods from stations
 * to the crates; harvest ripe crops (the plot replants itself); and keep stations crafting up to each recipe's stock
 * target. Each docks at its own charging pad. Unlike the wheeled robots they walk into rooms, through the airlocks.
 *
 * Saved: position, charge, health, `down`, what it carries (`carry`, `weapon`, `mag`, `ammo`, `kit`) and its pad.
 * Jobs and routes are replanned after a load.
 */
export const ANDROID = Object.freeze({
  speed: 2.6, drain: 1 / 480, chargeRate: 1 / 40, chargePower: 1.2, low: .22, hp: 60,
  harvest: 1.4, craft: 1.5, collect: .6, repair: 5, repairCost: Object.freeze({ metal: 10, silicon: 4 }),
  calm: 6, hit: .85, mend: 15, damage: .55,
});
/** A test android and its pad are handed to every colony once, new or loaded. Turn off to make them a mid-game unlock only. */
export const STARTER_ANDROID = true;
/** Weapons an android will take up, best first, and how many rounds or cells it carries for each. */
const ARSENAL = ['railgun', 'rifle', 'smg', 'pistol', 'katana'];
const AMMO_TAKE = { rounds: 36, charge: 6 };
/** News for the player: finished buildings, downed androids. Drained by the game each frame. */
export const androidNews = [];

const key = (x, z) => `${x},${z}`;
const cellOf = r => ({ x: Math.round(r.x / CELL_SIZE), z: Math.round(r.z / CELL_SIZE) });
const androids = state => state.robots.filter(r => r.kind === 'android');
/** Loose hatchlings, and raiders once they reach the base. */
export const threats = state => (state.brood ?? []).filter(c => c.state !== 'dead' && c.state !== 'emerge' && !c.gone && (!c.raider || c.near) && partsOf(c).length);
/**
 * Whether `r` can see `target` across open ground: no standing structure (rooms included) and no rise of the terrain
 * in the way of a line from its eyes to the target's body. The squares at either end don't count.
 */
export function clearShot(state, r, target) {
  const dx = target.x - r.x, dz = target.z - r.z, d = Math.hypot(dx, dz);
  if (d < 1.2) return true;
  const solid = sightBlockers(state), h0 = surfaceHeightAt(state.seed, r.x, r.z) + 1.5, h1 = surfaceHeightAt(state.seed, target.x, target.z) + .5;
  const ends = [cellOf(r), cellOf(target)].map(c => key(c.x, c.z));
  for (let s = .5; s < d - .5; s += .5) {
    const t = s / d, x = r.x + dx * t, z = r.z + dz * t, k = key(Math.round(x / CELL_SIZE), Math.round(z / CELL_SIZE));
    if (!ends.includes(k) && solid.has(k)) return false;
    if (surfaceHeightAt(state.seed, x, z) > h0 + (h1 - h0) * t - .15) return false;
  }
  return true;
}
let blockers = { sig: null, cells: null };
function sightBlockers(state) {
  const n = nav(state);
  if (blockers.sig === n.sig) return blockers.cells;
  const cells = new Set(n.blocked);
  for (const b of state.buildings) if (b.built && DEFS[b.type].layer === 'floor') for (const c of footprint(b.type, b.x, b.z, b.rotation)) cells.add(key(c.x, c.z));
  blockers = { sig: n.sig, cells };
  return cells;
}
/** The odds a shot lands: worse with range, and much worse at something on the move. A blade swing is surer. */
export function hitChance(spec, distance, speed = 0, size = 1) {
  const odds = spec.melee ? .92 - speed * .05 : ANDROID.hit - distance / 45 - speed * .075 + (size - 1) * .08;
  return Math.max(.12, Math.min(.92, odds));
}

// --- Walking ------------------------------------------------------------
// Machines are solid; room squares are open inside, and the only way between a room and open ground is an airlock's
// door. Fittings can be squeezed past, at a cost, so a crowded greenhouse never shuts an android in.
let grid = { sig: null };
function nav(state) {
  const sig = state.buildings.map(b => `${b.id}:${b.type}:${b.x}:${b.z}:${b.rotation}:${b.built ? 1 : 0}`).join('|');
  if (grid.sig === sig) return grid;
  const blocked = new Set(), fittings = new Set(), room = new Map(), doors = new Set(), layout = habitatLayout(state.buildings);
  for (const b of state.buildings) {
    const def = DEFS[b.type];
    if (!b.built || def.layer === 'floor') continue;
    if (def.layer === 'interior') { for (const c of footprint(b.type, b.x, b.z, b.rotation)) fittings.add(key(c.x, c.z)); continue; }
    if (!def.walkable) for (const c of footprint(b.type, b.x, b.z, b.rotation)) blocked.add(key(c.x, c.z));
  }
  for (const [k, r] of layout.roomOf) room.set(k, r.index);
  for (const a of layout.airlocks) {
    if (!a.exterior) continue;
    const inside = key(Math.round((a.x - DIRS[a.dir][0]) / CELL_SIZE), Math.round((a.z - DIRS[a.dir][1]) / CELL_SIZE)), apron = key(a.apron.x, a.apron.z);
    doors.add(`${inside}|${apron}`); doors.add(`${apron}|${inside}`);
  }
  grid = { sig, blocked, fittings, room, doors };
  return grid;
}
const open = (state, n, x, z) => cellPassable(state, n.blocked, x, z);
const step = (n, a, b) => n.room.get(a) === n.room.get(b) || n.doors.has(`${a}|${b}`);
/** A* from `from` to the nearest of `goals`; null when none can be reached. */
function findRoute(state, from, goals, maxNodes = 9000) {
  const n = nav(state), wanted = new Set(goals.map(g => key(g.x, g.z)));
  if (!wanted.size) return null;
  const h = (x, z) => Math.min(...goals.map(g => { const dx = Math.abs(x - g.x), dz = Math.abs(z - g.z); return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz); }));
  const heap = [{ x: from.x, z: from.z, g: 0, f: 0 }], came = new Map(), cost = new Map([[key(from.x, from.z), 0]]);
  let visited = 0;
  while (heap.length && visited++ < maxNodes) {
    let best = 0; for (let i = 1; i < heap.length; i++) if (heap[i].f < heap[best].f) best = i;
    const node = heap[best]; heap[best] = heap[heap.length - 1]; heap.pop();
    const k = key(node.x, node.z);
    if (wanted.has(k)) {
      const path = [{ x: node.x, z: node.z }];
      for (let c = k; came.has(c);) { const p = came.get(c); path.unshift({ x: p.x, z: p.z }); c = key(p.x, p.z); }
      return path;
    }
    if (node.g > cost.get(k)) continue;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const x = node.x + dx, z = node.z + dz, nk = key(x, z);
      if (!open(state, n, x, z) || !step(n, k, nk)) continue;
      if (dx && dz) {
        const a = key(node.x + dx, node.z), b = key(node.x, node.z + dz);
        if (!open(state, n, node.x + dx, node.z) || !open(state, n, node.x, node.z + dz) || n.room.get(a) !== n.room.get(k) || n.room.get(b) !== n.room.get(k) || n.room.get(nk) !== n.room.get(k)) continue;
      }
      const g = node.g + (dx && dz ? Math.SQRT2 : 1) + (n.fittings.has(nk) ? 3 : 0);
      if (g >= (cost.get(nk) ?? Infinity)) continue;
      cost.set(nk, g); came.set(nk, { x: node.x, z: node.z });
      heap.push({ x, z, g, f: g + h(x, z) });
    }
  }
  return null;
}
/** Cells an android can stand on to work at `b`: beside it, on the same side of any wall. A pad is stood on. */
function standCells(state, b) {
  const n = nav(state), cells = footprint(b.type, b.x, b.z, b.rotation);
  if (b.type === 'chargepad') return cells;
  const inside = new Set(cells.map(c => key(c.x, c.z))), out = new Map(), interior = DEFS[b.type].layer === 'interior';
  for (const c of cells) for (const [dx, dz] of [...DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const x = c.x + dx, z = c.z + dz, k = key(x, z);
    if (inside.has(k) || n.fittings.has(k) || !open(state, n, x, z)) continue;
    if (interior ? n.room.get(k) !== n.room.get(key(c.x, c.z)) : (dx && dz) || (DEFS[b.type].layer !== 'floor' && n.room.has(k))) continue;
    out.set(k, { x, z });
  }
  // A fitting boxed in by others is reached by squeezing in beside it.
  if (!out.size && interior) for (const c of cells) for (const [dx, dz] of DIRS) { const x = c.x + dx, z = c.z + dz, k = key(x, z); if (!inside.has(k) && open(state, n, x, z) && n.room.get(k) === n.room.get(key(c.x, c.z))) out.set(k, { x, z }); }
  return [...out.values()];
}
const routes = new WeakMap();
/** Walks toward the nearest of `goals`. Returns 'arrived', 'moving' or 'unreachable'. */
function walk(state, r, goals, dt) {
  const here = cellOf(r), goalKey = goals.map(g => key(g.x, g.z)).join(';'), sig = nav(state).sig;
  let route = routes.get(r);
  if (!route || route.goal !== goalKey || route.sig !== sig) {
    if (goals.some(g => g.x === here.x && g.z === here.z) && Math.hypot(here.x * CELL_SIZE - r.x, here.z * CELL_SIZE - r.z) < .05) return 'arrived';
    route = { goal: goalKey, sig, cells: findRoute(state, here, goals), i: 1 };
    routes.set(r, route);
  }
  if (!route.cells) return 'unreachable';
  let budget = ANDROID.speed * (r.charge > 0 ? 1 : .4) * dt;
  r.moving = true;
  while (budget > 0) {
    const c = route.cells[Math.min(route.i, route.cells.length - 1)], tx = c.x * CELL_SIZE, tz = c.z * CELL_SIZE;
    const dx = tx - r.x, dz = tz - r.z, d = Math.hypot(dx, dz);
    if (d > 1e-6) face(r, Math.atan2(dx, dz), dt * 10);
    if (d <= budget) {
      r.x = tx; r.z = tz; budget -= d;
      if (route.i >= route.cells.length - 1) { routes.delete(r); r.moving = false; return 'arrived'; }
      route.i++;
    } else { r.x += dx / d * budget; r.z += dz / d * budget; budget = 0; }
  }
  return 'moving';
}
const face = (r, target, k) => { r.facing += Math.atan2(Math.sin(target - r.facing), Math.cos(target - r.facing)) * Math.min(1, k); };
const faceBuilding = (r, b, dt) => {
  if (b.type === 'chargepad') return;
  const cells = footprint(b.type, b.x, b.z, b.rotation), cx = cells.reduce((s, c) => s + c.x, 0) / cells.length * CELL_SIZE, cz = cells.reduce((s, c) => s + c.z, 0) / cells.length * CELL_SIZE;
  face(r, Math.atan2(cx - r.x, cz - r.z), dt * 8);
};
// Targets an android failed to reach, so it tries something else for a while instead of retrying forever.
const stuck = new WeakMap();
const isStuck = (state, r, id) => (stuck.get(r)?.get(id) ?? -1) > state.time;
const markStuck = (state, r, id) => { if (!stuck.has(r)) stuck.set(r, new Map()); stuck.get(r).set(id, state.time + 20); };

// --- Choosing work ------------------------------------------------------
const byId = (state, id) => state.buildings.find(b => b.id === id);
const distanceTo = (r, b) => { const c = crateCentre(b); return Math.hypot(c.x - r.x, c.z - r.z); };
const nearest = (r, list) => list.sort((a, b) => distanceTo(r, a) - distanceTo(r, b))[0] ?? null;
/** What another android has already taken on, so two never chase the same chore. */
const claimed = (state, r, tag) => androids(state).some(o => o !== r && !o.down && (o.job?.tag === tag || o.next?.tag === tag));
const crateWith = (state, r, item) => nearest(r, crates(state).filter(b => inv.count(b.slots, item) > 0 && !isStuck(state, r, b.id)));
const crateFor = (state, r, item) => nearest(r, crates(state).filter(b => inv.room(b.slots, item) > 0 && !isStuck(state, r, b.id)));
const owed = b => b.paid ? Object.entries(DEFS[b.type].cost).map(([item, n]) => [item, n - (b.paid[item] ?? 0)]).filter(([, n]) => n > 0) : [];
const buildCap = b => b.paid ? Math.min(1, ...Object.entries(DEFS[b.type].cost).map(([item, n]) => (b.paid[item] ?? 0) / n)) : 1;
const job = (type, b, extra = {}) => ({ type, id: b.id, t: 0, ...extra, tag: extra.tag ?? `${type}:${b.id}` });
const armed = r => !!r.weapon && (r.mag > 0 || r.ammo > 0 || !WEAPONS[r.weapon].ammo);

function armSource(state, r) {
  for (const w of ARSENAL) {
    const ammo = WEAPONS[w].ammo;
    if (ammo && baseCount(state, ammo) < 1) continue;
    const armory = nearest(r, state.buildings.filter(b => b.type === 'armory' && b.built && (b.ready?.[w] ?? 0) > 0 && !isStuck(state, r, b.id)));
    const crate = crateWith(state, r, w), from = armory && (!crate || distanceTo(r, armory) <= distanceTo(r, crate)) ? armory : crate;
    if (from) return job('arm', from, { item: w, tag: `arm:${w}:${from.id}` });
  }
  return null;
}
function buildJob(state, r) {
  const floor = new Map(state.buildings.filter(b => DEFS[b.type].layer === 'floor').map(b => [key(b.x, b.z), b]));
  for (const b of state.buildings.filter(b => !b.built).sort((a, c) => a.id - c.id)) {
    if (claimed(state, r, `build:${b.id}`) || isStuck(state, r, b.id)) continue;
    if (DEFS[b.type].layer === 'interior' && footprint(b.type, b.x, b.z, b.rotation).some(c => !floor.get(key(c.x, c.z))?.built)) continue;
    for (const [item, n] of owed(b)) {
      const crate = crateWith(state, r, item);
      if (crate) return { ...job('fetch', crate, { item, n: Math.min(n, ITEM_INFO[item].stack), tag: `build:${b.id}` }), next: job('deliver', b, { item, tag: `build:${b.id}` }) };
    }
    if (buildCap(b) > b.progress + 1e-6) return job('build', b);
  }
  return null;
}
/** Raid damage on a standing structure: patched up for free, nearest first. Wrecks are rebuilt as blueprints. */
function mendJob(state, r) {
  const b = nearest(r, state.buildings.filter(b => b.built && b.hp != null && !claimed(state, r, `mend:${b.id}`) && !isStuck(state, r, b.id)));
  return b && job('mend', b);
}
function feedJob(state, r) {
  for (const b of state.buildings) {
    if (b.type !== 'bioreactor' || !b.built || !b.fed || b.stock > BIO.cap - 2 || claimed(state, r, `feed:${b.id}`) || isStuck(state, r, b.id)) continue;
    const crate = crateWith(state, r, 'goo');
    if (crate) return { ...job('fetch', crate, { item: 'goo', n: BIO.cap - b.stock, tag: `feed:${b.id}` }), next: job('deliver', b, { item: 'goo', tag: `feed:${b.id}` }) };
  }
  return null;
}
function collectJob(state, r) {
  for (const b of state.buildings) {
    if (!b.built || claimed(state, r, `collect:${b.id}`) || isStuck(state, r, b.id)) continue;
    const item = b.type === 'goovat' ? (b.stock >= 1 ? 'goo' : null) : isStation(b) && !STATIONS[b.type].robots && readyCount(b) ? Object.keys(b.ready).find(i => b.ready[i] > 0) : null;
    if (item && crateFor(state, r, item)) return job('collect', b, { item });
  }
  return null;
}
function harvestJob(state, r) {
  const ripe = state.buildings.filter(b => isGrower(b) && b.built && b.grow >= 1 && !claimed(state, r, `harvest:${b.id}`) && !isStuck(state, r, b.id) && crateFor(state, r, b.crop));
  const b = nearest(r, ripe);
  return b && job('harvest', b);
}
/** How many of `item` the colony holds or has on the way, for stock targets. */
function onHand(state, item) {
  let n = baseCount(state, item);
  for (const b of state.buildings) if (isStation(b)) { n += b.ready?.[item] ?? 0; for (const q of b.queue ?? []) if (jobProduct(b, q) === item) n += STATIONS[b.type].makes(item); }
  for (const o of androids(state)) if (o.carry?.item === item) n += o.carry.n;
  return n;
}
function craftJob(state, r) {
  const status = roomStatus(state);
  for (const b of state.buildings) {
    const st = STATIONS[b.type];
    if (!st || st.robots || !b.built || !b.targets || b.queue.length >= st.queue || claimed(state, r, `craft:${b.id}`) || isStuck(state, r, b.id)) continue;
    if (st.air && !status.at(b.x, b.z)?.pressurised) continue;
    for (const [item, want] of Object.entries(b.targets)) {
      if (!want || !st.known(state, item) || onHand(state, item) >= want) continue;
      if (Object.entries(st.input(item)).every(([i, n]) => baseCount(state, i) >= n)) return job('craft', b, { item });
    }
  }
  return null;
}
function rescueJob(state, r) {
  const wreck = androids(state).filter(o => o.down && o !== r && !claimed(state, r, `rescue:${o.id}`)).sort((a, b) => Math.hypot(a.x - r.x, a.z - r.z) - Math.hypot(b.x - r.x, b.z - r.z))[0];
  if (!wreck) return null;
  const rescue = { type: 'repair', robot: wreck.id, tag: `rescue:${wreck.id}`, t: 0 };
  if (r.kit) return rescue;
  if (!Object.entries(ANDROID.repairCost).every(([i, n]) => baseCount(state, i) >= n)) return null;
  const crate = crateWith(state, r, 'metal');
  return crate && { ...job('kit', crate, { tag: `rescue:${wreck.id}` }), next: rescue };
}
function homePad(state, r) {
  const pad = byId(state, r.home);
  if (pad?.built && pad.type === 'chargepad') return pad;
  const free = freePad(state, r.x, r.z);
  if (free) r.home = free.id;
  return free;
}

function plan(state, r) {
  r.job = null; r.next = null; r.task = 'idle';
  const loose = threats(state).length > 0;
  const pad = homePad(state, r);
  const choose = () => {
    if (r.charge < ANDROID.low && pad && !(loose && r.weapon && r.charge > .08)) return job('charge', pad);
    if (loose) {
      if (armed(r)) return { type: 'fight', tag: `fight:${r.id}`, t: 0 };
      if (!r.weapon && !r.carry) { const arm = armSource(state, r); if (arm) return arm; }
    }
    if (r.weapon && !loose && (r.calm ?? 0) >= ANDROID.calm) { const crate = crateFor(state, r, r.weapon); if (crate) return job('disarm', crate, { tag: `disarm:${r.id}` }); }
    if (r.carry) { const crate = crateFor(state, r, r.carry.item); return crate ? job('stow', crate, { tag: `stow:${r.id}` }) : null; }
    return rescueJob(state, r) ?? buildJob(state, r) ?? mendJob(state, r) ?? feedJob(state, r) ?? collectJob(state, r) ?? harvestJob(state, r) ?? craftJob(state, r) ?? (pad ? job('charge', pad) : null);
  };
  const next = choose();
  if (!next) return;
  if (next.next) { r.next = next.next; delete next.next; }
  r.job = next; r.task = next.type;
}

// --- Doing it -------------------------------------------------------------
const goalsFor = (state, r, j) => {
  if (j.type === 'repair') { const o = state.robots.find(o => o.id === j.robot); return o ? [cellOf(o), ...DIRS.map(([dx, dz]) => ({ x: cellOf(o).x + dx, z: cellOf(o).z + dz }))].filter(c => open(state, nav(state), c.x, c.z)) : []; }
  const b = byId(state, j.id);
  return b ? standCells(state, b) : [];
};
function act(state, r, dt, powered, hooks) {
  const j = r.job;
  if (j.type === 'fight') return fight(state, r, dt, hooks.rng ?? Math.random);
  const b = j.id != null ? byId(state, j.id) : null;
  if (j.id != null && !b) return 'done';
  if (j.type === 'repair' && !state.robots.some(o => o.id === j.robot && o.down)) return 'done';
  if (!j.here) {
    const goals = goalsFor(state, r, j);
    const result = goals.length ? walk(state, r, goals, dt) : 'unreachable';
    if (result === 'unreachable') { if (j.id != null) markStuck(state, r, j.id); return 'done'; }
    if (result !== 'arrived') return 'working';
    j.here = true;
  }
  r.moving = false;
  if (b) faceBuilding(r, b, dt);
  switch (j.type) {
    case 'charge':
      if (powered) r.charge = Math.min(1, r.charge + ANDROID.chargeRate * dt);
      // A charged android looks for work now and then; with nothing to do it stays on its pad.
      if ((j.t += dt) > 1 && (r.charge >= .95 || (!powered && r.charge > ANDROID.low))) return 'done';
      return 'working';
    case 'fetch': {
      const n = Math.min(j.n, inv.count(b.slots, j.item));
      if (n < 1) { r.next = null; return 'done'; }
      inv.remove(b.slots, j.item, n); r.carry = { item: j.item, n };
      return 'done';
    }
    case 'deliver': {
      if (!r.carry || r.carry.item !== j.item) return 'done';
      if (b.type === 'bioreactor') { const n = Math.min(r.carry.n, BIO.cap - b.stock); if (n > 0) { Object.assign(b, { stock: b.stock + n, fed: true, starve: 0 }); r.carry.n -= n; } }
      else if (!b.built && b.paid) { const n = Math.min(r.carry.n, (DEFS[b.type].cost[j.item] ?? 0) - (b.paid[j.item] ?? 0)); if (n > 0) { b.paid[j.item] = (b.paid[j.item] ?? 0) + n; r.carry.n -= n; } }
      if (r.carry.n <= 0) r.carry = null;
      return 'done';
    }
    case 'build': {
      if (b.built) return 'done';
      if (hooks.obstructed?.(b)) return 'done';
      const next = Math.min(buildCap(b), b.progress + dt / DEFS[b.type].buildTime);
      if (next <= b.progress) return 'done';
      b.progress = next;
      if (b.progress >= 1) { const reason = hooks.complete?.(b); androidNews.push(`A${r.id}: ${reason ?? `${DEFS[b.type].name} complete.`}`); return 'done'; }
      return 'working';
    }
    case 'collect': {
      if ((j.t += dt) < ANDROID.collect) return 'working';
      if (b.type === 'goovat') { const n = Math.min(Math.floor(b.stock), ITEM_INFO.goo.stack); if (n >= 1) { b.stock -= n; r.carry = { item: 'goo', n }; } return 'done'; }
      const n = Math.min(b.ready?.[j.item] ?? 0, ITEM_INFO[j.item].stack);
      if (n >= 1) { r.carry = { item: j.item, n }; if ((b.ready[j.item] -= n) <= 0) delete b.ready[j.item]; }
      return 'done';
    }
    case 'harvest': {
      if (b.grow < 1) return 'done';
      if ((j.t += dt) < ANDROID.harvest) return 'working';
      r.carry = { item: b.crop, n: CROPS[b.crop].yield }; b.grow = 0; b.watered = false;
      if (!cropsFor(state, b.type).includes(b.crop)) b.crop = defaultCrop(b.type);
      return 'done';
    }
    case 'craft': {
      if ((j.t += dt) < ANDROID.craft) return 'working';
      const st = STATIONS[b.type], input = st.input(j.item);
      if (b.queue.length >= st.queue || !Object.entries(input).every(([i, n]) => baseCount(state, i) >= n)) return 'done';
      for (const [i, n] of Object.entries(input)) draw(state, i, n);
      b.queue.push(`@${st.job(j.item)}`);
      return 'done';
    }
    case 'stow': case 'disarm': {
      if (r.carry) { const left = inv.add(b.slots, r.carry.item, r.carry.n); r.carry = left ? { ...r.carry, n: left } : null; }
      if (j.type === 'disarm' && r.weapon) {
        if (inv.add(b.slots, r.weapon, 1) === 0) {
          const ammo = WEAPONS[r.weapon].ammo, rounds = r.mag + r.ammo;
          if (ammo && rounds) stash(state, ammo, rounds, b);
          Object.assign(r, { weapon: null, mag: 0, ammo: 0 });
        }
      }
      return 'done';
    }
    case 'arm': {
      const w = j.item, from = b.type === 'armory' ? (b.ready?.[w] ?? 0) : inv.count(b.slots, w);
      if (from < 1 || r.weapon) return 'done';
      if (b.type === 'armory') { if ((b.ready[w] -= 1) <= 0) delete b.ready[w]; } else inv.remove(b.slots, w, 1);
      const spec = WEAPONS[w], taken = spec.ammo ? draw(state, spec.ammo, AMMO_TAKE[spec.ammo] ?? spec.magazine) : 0, mag = Math.min(spec.magazine, taken);
      Object.assign(r, { weapon: w, mag, ammo: taken - mag, calm: 0 });
      return 'done';
    }
    case 'kit': {
      if (r.kit || !Object.entries(ANDROID.repairCost).every(([i, n]) => baseCount(state, i) >= n)) return 'done';
      for (const [i, n] of Object.entries(ANDROID.repairCost)) draw(state, i, n, b);
      r.kit = true;
      return 'done';
    }
    case 'mend':
      if (!b.built) return 'done';
      return mend(b, dt, ANDROID.mend) ? 'done' : 'working';
    case 'repair': {
      const o = state.robots.find(o => o.id === j.robot);
      face(r, Math.atan2(o.x - r.x, o.z - r.z), dt * 8);
      if (!r.kit) return 'done';
      if ((j.t += dt) < ANDROID.repair) return 'working';
      Object.assign(o, { down: false, reported: false, hp: ANDROID.hp, charge: Math.max(o.charge, .35), task: 'idle', job: null, next: null });
      r.kit = false;
      androidNews.push(`A${r.id} got A${o.id} back on its feet.`);
      return 'done';
    }
  }
  return 'done';
}
const sights = new WeakMap();
/** Closes to its weapon's reach of the nearest loose hatchling and fires. `shot` counts shots for the view. */
function fight(state, r, dt, rng) {
  const spec = WEAPONS[r.weapon], list = threats(state);
  if (!list.length || !spec) return 'done';
  // A centipede is fought wherever its body is nearest.
  const near = c => partNear(c, r.x, r.z);
  const target = list.sort((a, b) => near(a).d - near(b).d)[0], at = near(target);
  const d = at.d - Math.max(0, radiusOf(target) - CRAWLER.radius), reach = spec.melee ? spec.range * .75 : Math.min(spec.range * .7, 14);
  r.cool = Math.max(0, (r.cool ?? 0) - dt);
  r.aim = { x: at.x, z: at.z };
  // Out of sight (round a building, over a rise) it closes in rather than firing blind.
  let look = sights.get(r);
  if (!look || look.target !== target || (look.t -= dt) <= 0) sights.set(r, look = { target, t: .25, clear: d <= reach && clearShot(state, r, at) });
  if (d > reach || !look.clear) {
    const c = cellOf(at), n = nav(state), goals = [c, ...DIRS.map(([dx, dz]) => ({ x: c.x + dx, z: c.z + dz }))].filter(g => open(state, n, g.x, g.z));
    // Re-aim the route at the target's square as it moves.
    if (walk(state, r, goals.length ? goals : [cellOf(r)], dt) === 'unreachable') return 'done';
    return 'working';
  }
  r.moving = false; routes.delete(r);
  face(r, Math.atan2(at.x - r.x, at.z - r.z), dt * 12);
  if (r.cool > 0) return 'working';
  const odds = hitChance(spec, d, target.speed ?? 0, sizeOf(target));
  if (spec.melee) { if (rng() < odds) hurtCrawler(target, spec.damage * ANDROID.damage); r.cool = spec.cooldown + .25; r.shot = (r.shot ?? 0) + 1; return 'working'; }
  if (r.mag <= 0) {
    if (r.ammo <= 0) return 'done';
    const n = Math.min(spec.magazine, r.ammo); r.mag = n; r.ammo -= n; r.cool = spec.reload;
    return 'working';
  }
  const shots = Math.min(spec.burst ?? 1, r.mag);
  let landed = 0;
  for (let i = 0; i < shots; i++) if (rng() < odds) { hurtCrawler(target, spec.damage * ANDROID.damage); landed++; }
  // A miss goes wide, past the target, so the tracer shows it.
  if (!landed) { const side = (rng() < .5 ? -1 : 1) * (.8 + rng()), ux = (at.x - r.x) / (d || 1), uz = (at.z - r.z) / (d || 1); r.aim = { x: at.x + ux * 2 - uz * side, z: at.z + uz * 2 + ux * side }; }
  r.hits = (r.hits ?? 0) + landed; r.misses = (r.misses ?? 0) + shots - landed;
  r.mag -= shots; r.cool = (spec.cooldown ?? .3) + (spec.charge ?? 0) + .2; r.shot = (r.shot ?? 0) + 1;
  return 'working';
}

/** Advances every android: battery, combat calm, the job in hand. `hooks.complete(b)` finishes a building and
 * returns its message; `hooks.obstructed(b)` says when finishing it now would shut the player in. */
export function stepAndroids(state, dt, powered, hooks = {}) {
  const loose = threats(state).length > 0;
  for (const r of state.robots) {
    if (r.kind !== 'android') continue;
    r.moving = false;
    if (r.down) { if (!r.reported) knockDown(r, 'hurt'); r.task = 'down'; continue; }
    r.calm = loose ? 0 : (r.calm ?? 0) + dt;
    if (r.job?.type !== 'charge' || !r.job.here) r.charge = Math.max(0, r.charge - ANDROID.drain * dt);
    if (r.charge <= 0 && !(r.job?.type === 'charge' && r.job.here)) { knockDown(r, 'battery'); continue; }
    // Hatchlings break into whatever it was doing, and a quiet spell ends the fight.
    const resting = r.job?.type === 'charge' && (r.charge <= .08 || (r.charge < ANDROID.low && !r.weapon));
    if (loose && r.job && !resting && !['fight', 'arm'].includes(r.job.type) && (armed(r) || (!r.weapon && !r.carry && armSource(state, r)))) { r.job = null; r.next = null; }
    if (!loose && r.job?.type === 'fight') r.job = null;
    if (!r.job) { plan(state, r); if (!r.job) continue; }
    if (act(state, r, dt, powered, hooks) === 'done') {
      if (r.next && r.job.type !== 'fight') { r.job = r.next; r.next = null; r.task = r.job.type; }
      else r.job = null;
    }
  }
}
/** Hatchlings knock androids down in goo.js by setting `down`; the news goes out here. */
export function knockDown(r, why) {
  if (r.reported) return;
  Object.assign(r, { down: true, reported: true, task: 'down', job: null, next: null, moving: false });
  androidNews.push(why === 'battery' ? `Android A${r.id} ran flat and is down. Another android or you (E) can get it going again.` : `Android A${r.id} is down! Repair it with E, or another android will.`);
}
/** Charging androids draw colony power. */
export const androidDemand = state => androids(state).filter(r => r.job?.type === 'charge' && r.job.here && r.charge < 1).length * ANDROID.chargePower;

/** A downed android within reach of the player, for E. */
export function nearbyWreck(state) {
  const p = state.player;
  if (p.cave != null) return null;
  return androids(state).find(r => r.down && Math.hypot(r.x - p.x, r.z - p.z) < 2.4) ?? null;
}
const repairText = () => Object.entries(ANDROID.repairCost).map(([i, n]) => `${n} ${ITEM_INFO[i].name.toLowerCase()}`).join(', ');
export const wreckAction = state => nearbyWreck(state) ? { verb: `Repair android · ${repairText()}` } : null;
/** The player mends a downed android from pockets and base stock. */
export function repairWreck(state) {
  const r = nearbyWreck(state);
  if (!r) return { ok: false, reason: 'No downed android here.' };
  if (!pay(state, ANDROID.repairCost)) return { ok: false, reason: `Repairs need ${repairText()}.` };
  Object.assign(r, { down: false, reported: false, hp: ANDROID.hp, charge: Math.max(r.charge, .35), task: 'idle', job: null, next: null });
  return { ok: true, reason: `Android A${r.id} is back on its feet.` };
}

/** The most a station's stock target can be set to. */
export const STOCK_TARGET_MAX = 99;
/** Androids keep `item` crafted at station `b` until the colony holds `n`; 0 clears the target. */
export function setStockTarget(b, item, n) {
  const st = STATIONS[b?.type];
  if (!st || st.robots || !b.built || !st.recipes.includes(item)) return { ok: false, reason: 'Nothing to stock here.' };
  n = Math.max(0, Math.min(STOCK_TARGET_MAX, Math.round(n)));
  b.targets ??= {};
  if (n) b.targets[item] = n; else delete b.targets[item];
  if (!Object.keys(b.targets).length) delete b.targets;
  return { ok: true, reason: n ? `Androids keep ${n} ${ITEM_INFO[item].name.toLowerCase()} in stock.` : `No stock kept of ${ITEM_INFO[item].name.toLowerCase()}.` };
}

const finite = n => typeof n === 'number' && Number.isFinite(n);
export function restoreAndroid(raw) {
  if (!Number.isSafeInteger(raw.id) || !Number.isSafeInteger(raw.home) || !finite(raw.x) || !finite(raw.z) || Math.abs(raw.x) > 125 || Math.abs(raw.z) > 125 || !finite(raw.facing)
    || !(finite(raw.charge) && raw.charge >= 0 && raw.charge <= 1) || !(finite(raw.hp) && raw.hp >= 0 && raw.hp <= ANDROID.hp) || typeof raw.down !== 'boolean') throw new Error('Invalid robot.');
  const r = Object.assign(createAndroid(raw.id, raw.home), { x: raw.x, z: raw.z, facing: raw.facing, charge: raw.charge, hp: raw.hp, down: raw.down, reported: raw.down, task: raw.down ? 'down' : 'idle', kit: raw.kit === true });
  if (raw.carry != null) {
    if (!ITEM_INFO[raw.carry.item] || !Number.isInteger(raw.carry.n) || raw.carry.n < 1 || raw.carry.n > ITEM_INFO[raw.carry.item].stack) throw new Error('Invalid robot.');
    r.carry = { item: raw.carry.item, n: raw.carry.n };
  }
  if (raw.weapon != null) {
    const spec = WEAPONS[raw.weapon];
    if (!ARSENAL.includes(raw.weapon) || !Number.isInteger(raw.mag) || raw.mag < 0 || raw.mag > spec.magazine || !Number.isInteger(raw.ammo) || raw.ammo < 0 || raw.ammo > 200) throw new Error('Invalid robot.');
    Object.assign(r, { weapon: raw.weapon, mag: raw.mag, ammo: raw.ammo });
  }
  return r;
}
