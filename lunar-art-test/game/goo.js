import { CELL_SIZE, footprint } from './defs.js';
import { caveKey, caveLayout } from './caves.js';
import * as inv from './inventory.js';
import { CRAWLER, createCrawler, stepCrawler, hurtCrawler } from './crawler.js';
import { INFEST, liveNests, nestMouth } from './infest.js';
import { techDone } from './space.js';
import { BIO } from './power.js';

/**
 * The crawlers' black goo, brought home. A sample scraped from a live nest (which wakes the brood) seeds a goo vat
 * that cultures more while it has power. Left dark too long the vat breaches: goo creeps across the base, choking any
 * grower it reaches, and hatchlings crawl out. Flares burn both.
 *
 * `state.goo`: { cells: [[x, z]] grid squares under goo, clock: seconds to the next spread, breaches: count }.
 * `state.brood`: hatchlings loose on the surface, as crawler.js crawlers in world metres.
 * `state.scraped`: { zoneKey: { nestKey: seconds until it can be sampled again } }.
 */
export const GOO = Object.freeze({
  grow: 90, cap: 8, power: 2, breachAfter: 15,
  spreadEvery: 20, maxCells: 16, hatch: 3, maxBrood: 6,
  burnReach: 2.4, burnDamage: 30, hatchlingHp: 30, biteDamage: 9,
  sampleReach: 2.2,
});
const RAIDERS = 10;

const zoneKey = (id, zone = 0) => zone ? `${id}:${zone}` : `${id}`;
export const gooCells = state => state.goo?.cells ?? [];
export const gooAt = (state, x, z) => gooCells(state).some(([cx, cz]) => cx === x && cz === z);
/** Whether goo covers any square of `b`. */
export const gooOn = (state, b) => gooCells(state).length > 0 && footprint(b.type, b.x, b.z, b.rotation).some(c => gooAt(state, c.x, c.z));
export const infested = state => gooCells(state).length > 0 || (state.brood?.length ?? 0) > 0;

export function ensureVat(b) {
  if (b.type === 'goovat' && b.built) { b.seeded ??= false; b.stock ??= 0; b.work ??= 0; b.dark ??= 0; }
  return b;
}
export const gooDemand = state => state.buildings.filter(b => b.type === 'goovat' && b.built && b.seeded).length * GOO.power;

/** What E at a vat or bioreactor would do, or null. */
export function vatAction(state, b) {
  if (b.type === 'bioreactor' && b.built) return b.stock < BIO.cap && inv.count(state.inventory, 'goo') ? { verb: b.fed ? 'Feed the bioreactor black goo' : 'Seed the bioreactor with black goo' } : null;
  if (b.type !== 'goovat' || !b.built) return null;
  if (b.stock >= 1) return { verb: `Take ${Math.floor(b.stock)} black goo` };
  if (!b.seeded && inv.count(state.inventory, 'goo')) return { verb: 'Seed the vat with black goo' };
  return null;
}
export function useVat(state, b) {
  if (b.type === 'bioreactor') {
    const n = Math.min(BIO.cap - b.stock, inv.count(state.inventory, 'goo'));
    if (n < 1) return { ok: false, reason: b.stock >= BIO.cap ? 'The bioreactor is full.' : 'Bring black goo: culture it in a vat.' };
    inv.remove(state.inventory, 'goo', n);
    Object.assign(b, { fed: true, stock: b.stock + n, starve: 0 });
    return { ok: true, reason: `Fed ${n} black goo. Keep it fed: a starving culture breaches.` };
  }
  if (b.stock >= 1) {
    const n = Math.min(Math.floor(b.stock), inv.room(state.inventory, 'goo'));
    if (!n) return { ok: false, reason: 'No room in your inventory.' };
    inv.add(state.inventory, 'goo', n); b.stock -= n;
    return { ok: true, reason: `Took ${n} black goo.` };
  }
  if (b.seeded) return { ok: false, reason: 'The culture is still growing.' };
  if (!inv.remove(state.inventory, 'goo', 1)) return { ok: false, reason: 'Seed it with a goo sample scraped from a live nest.' };
  Object.assign(b, { seeded: true, work: 0, dark: 0 });
  return { ok: true, reason: 'Vat seeded. Keep it powered: if it goes dark it breaches.' };
}

/** The live, unscraped nest whose mouth the player stands at, if goo containment or the flamethrower is known. */
function nestHere(state) {
  const p = state.player;
  if (p.cave == null || !(techDone(state, 'containment') || techDone(state, 'flamethrower'))) return null;
  const scraped = state.scraped?.[zoneKey(p.cave, p.zone ?? 0)] ?? {};
  return liveNests(state, p.cave, p.zone ?? 0).find(n => { const m = nestMouth(n); return !(scraped[n.key] > 0) && Math.hypot(m.x - p.x, m.z - p.z) < GOO.sampleReach; }) ?? null;
}
export function sampleAction(state) {
  return nestHere(state) && inv.room(state.inventory, 'goo') ? { verb: 'Scrape a goo sample from the nest' } : null;
}
/** Takes a sample; the nest wakes. Returns `wake`, the nest's key, for the hunt to answer. */
export function takeSample(state) {
  const n = nestHere(state), p = state.player;
  if (!n) return { ok: false, reason: 'No live nest here.' };
  if (!inv.room(state.inventory, 'goo')) return { ok: false, reason: 'No room in your inventory.' };
  inv.add(state.inventory, 'goo', 1);
  state.scraped ??= {};
  (state.scraped[zoneKey(p.cave, p.zone ?? 0)] ??= {})[n.key] = INFEST.regrow.nest;
  return { ok: true, reason: 'Black goo sample taken. Something in the nest stirs.', wake: n.key };
}

function breach(state, b, rng) {
  Object.assign(b, b.type === 'bioreactor' ? { fed: false, stock: 0, burn: 0, starve: 0 } : { seeded: false, stock: 0, work: 0, dark: 0 });
  state.goo ??= { cells: [], clock: GOO.spreadEvery, breaches: 0 };
  state.goo.breaches++;
  for (const c of footprint(b.type, b.x, b.z, b.rotation)) if (!gooAt(state, c.x, c.z)) state.goo.cells.push([c.x, c.z]);
  state.brood ??= [];
  for (let i = 0; i < GOO.hatch && state.brood.length < GOO.maxBrood; i++) {
    const a = rng() * Math.PI * 2, c = createCrawler(b.x * CELL_SIZE + Math.sin(a) * .8, b.z * CELL_SIZE + Math.cos(a) * .8, rng);
    c.hp = GOO.hatchlingHp; c.facing = a; state.brood.push(c);
  }
}
/** Goo creeps into a neighbouring square of the base: anywhere a structure stands. */
function spread(state, rng) {
  const cells = gooCells(state);
  if (!cells.length || cells.length >= GOO.maxCells) return;
  const base = new Set(state.buildings.filter(b => b.built).flatMap(b => footprint(b.type, b.x, b.z, b.rotation).map(c => `${c.x},${c.z}`)));
  const options = cells.flatMap(([x, z]) => [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]).filter(([x, z]) => base.has(`${x},${z}`) && !gooAt(state, x, z));
  if (options.length) cells.push(options[Math.floor(rng() * options.length)]);
}

/** Vats culture or breach; bioreactors digest or starve; goo spreads; scraped nests heal. Runs inside the sim tick. */
export function stepGoo(state, dt, powered, rng = Math.random) {
  for (const b of state.buildings) {
    if (b.type === 'bioreactor' && b.built && b.fed) {
      if (b.stock > 0) { b.starve = 0; if ((b.burn += dt / BIO.burn) >= 1) { b.burn = 0; b.stock -= 1; } }
      else if ((b.starve += dt) >= BIO.starveAfter) breach(state, b, rng);
      continue;
    }
    if (b.type !== 'goovat' || !b.built || !b.seeded) continue;
    if (powered) {
      b.dark = 0;
      if (b.stock < GOO.cap && (b.work += dt / GOO.grow) >= 1) { b.work = 0; b.stock = Math.min(GOO.cap, b.stock + 1); }
    } else if ((b.dark += dt) >= GOO.breachAfter) breach(state, b, rng);
  }
  if (gooCells(state).length && (state.goo.clock -= dt) <= 0) { state.goo.clock = GOO.spreadEvery; spread(state, rng); }
  for (const [zk, entries] of Object.entries(state.scraped ?? {})) {
    for (const key of Object.keys(entries)) if ((entries[key] -= dt) <= 0) delete entries[key];
    if (!Object.keys(entries).length) delete state.scraped[zk];
  }
}

/** Burning flares on the surface clear goo within reach. Returns how many squares burnt. */
export function burnGoo(state, fires) {
  if (!gooCells(state).length || !fires.length) return 0;
  const before = state.goo.cells.length;
  state.goo.cells = state.goo.cells.filter(([x, z]) => !fires.some(f => Math.hypot(f.x - x * CELL_SIZE, f.z - z * CELL_SIZE) < GOO.burnReach));
  return before - state.goo.cells.length;
}

// The open ground the hatchlings roam, as the cave-shaped grid crawler.js walks: every square near the infestation.
let field = { key: '', cave: null };
function surfaceGrid(state) {
  const p = state.player, around = [...gooCells(state), ...(state.brood ?? []).map(c => [Math.round(c.x / CELL_SIZE), Math.round(c.z / CELL_SIZE)]), [Math.round(p.x / CELL_SIZE), Math.round(p.z / CELL_SIZE)]];
  const xs = around.map(c => c[0]), zs = around.map(c => c[1]), pad = 8;
  const box = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...zs) - pad, Math.max(...zs) + pad];
  const key = box.join();
  if (field.key === key) return field.cave;
  const cells = new Set();
  for (let x = box[0]; x <= box[1]; x++) for (let z = box[2]; z <= box[3]; z++) cells.add(caveKey(x, z));
  field = { key, cave: { cells, zone: 0 } };
  return field.cave;
}

/**
 * Hatchlings on the surface: they hunt like their elders but are too small to hold on, so a grab is a bite and
 * they scuttle off. Burning flares (`fires`, [{x, z, r}]) scorch them to death. Returns events for the view.
 */
export function stepBrood(state, dt, fires = [], rng = Math.random) {
  const p = state.player, events = [];
  if (!state.brood?.length) return events;
  if (p.cave != null) return events;
  const cave = surfaceGrid(state);
  const androids = (state.robots ?? []).filter(r => r.kind === 'android' && !r.down);
  for (const c of state.brood) {
    if (c.raider) continue;
    if (c.state !== 'dead' && fires.some(f => Math.hypot(c.x - f.x, c.z - f.z) < f.r * .6)) {
      const r = hurtCrawler(c, GOO.burnDamage * dt, rng);
      if (r.killed) events.push({ type: 'killed', crawler: c });
    }
    // Each hatchling goes for whoever is nearest: the player or a standing android. A target is kept through a lunge.
    const near = o => Math.hypot(o.x - c.x, o.z - c.z);
    let prey = androids.find(r => r.id === c.prey && ['shriek', 'lunge', 'slash'].includes(c.state)) ?? [p, ...androids].sort((a, b) => near(a) - near(b))[0];
    c.prey = prey === p ? null : prey.id;
    const env = { cave, player: prey === p ? { x: p.x, z: p.z, facing: p.facing ?? 0, lamp: true, invulnerable: (p.y ?? 0) > .6 } : { x: prey.x, z: prey.z, facing: prey.facing, lamp: true, invulnerable: false }, flares: fires };
    for (const e of stepCrawler(c, env, dt, rng)) {
      if (e.type === 'grab' || e.type === 'slash') {
        const damage = e.type === 'grab' ? GOO.biteDamage : e.damage * .6;
        if (prey === p) { p.health = Math.max(0, (p.health ?? 100) - damage); p.calm = 0; }
        else if ((prey.hp = Math.max(0, prey.hp - damage)) <= 0) Object.assign(prey, { down: true, task: 'down', job: null, next: null });
        if (e.type === 'grab') { c.state = 'flee'; c.t = 0; c.goal = null; }
        events.push({ type: 'bite', crawler: c, android: prey === p ? null : prey.id });
      } else if (e.type !== 'drag' && e.type !== 'hurt') events.push({ ...e, crawler: c });
    }
  }
  state.brood = state.brood.filter(c => !(c.state === 'dead' && c.t > 6.5));
  return events;
}

const finite = n => typeof n === 'number' && Number.isFinite(n);
/** Goo squares, loose hatchlings (position and health only) and nest scrapes survive a reload. */
export function restoreGoo(state, raw) {
  if (raw.goo != null) {
    const g = raw.goo;
    if (!g || !Array.isArray(g.cells) || g.cells.length > GOO.maxCells || !g.cells.every(c => Array.isArray(c) && c.length === 2 && c.every(n => Number.isInteger(n) && Math.abs(n) < 70)) || !finite(g.clock) || !Number.isInteger(g.breaches) || g.breaches < 0) throw new Error('Invalid goo.');
    state.goo = { cells: g.cells.map(c => [...c]), clock: Math.min(GOO.spreadEvery, Math.max(0, g.clock)), breaches: g.breaches };
  }
  if (raw.brood != null) {
    // Raiders (raid.js) share the brood, so it can hold a raid as well as a breach.
    if (!Array.isArray(raw.brood) || raw.brood.length > GOO.maxBrood + RAIDERS || !raw.brood.every(c => finite(c?.x) && finite(c?.z) && Math.abs(c.x) < 140 && Math.abs(c.z) < 140 && finite(c.hp) && c.hp > 0 && c.hp <= CRAWLER.hp)) throw new Error('Invalid hatchlings.');
    state.brood = raw.brood.filter(c => c.state !== 'dead' && !c.gone).map(c => Object.assign(createCrawler(c.x, c.z), { hp: c.hp, facing: finite(c.facing) ? c.facing : 0 },
      c.raider === true ? { raider: true, small: c.small === true, ...(Number.isInteger(c.retreat) && c.retreat >= 0 && c.retreat <= 2 ? { retreat: c.retreat } : {}) } : {}));
  }
  if (raw.scraped != null && typeof raw.scraped === 'object' && !Array.isArray(raw.scraped)) {
    state.scraped = {};
    for (const [zk, entries] of Object.entries(raw.scraped)) {
      if (!/^[0-2](:[12])?$/.test(zk) || !entries || typeof entries !== 'object') continue;
      const [id, zone = 0] = zk.split(':').map(Number), nests = new Set(caveLayout(state.seed, id, zone).nests.map(n => n.key));
      const kept = Object.fromEntries(Object.entries(entries).filter(([k, t]) => nests.has(k) && finite(t) && t > 0 && t <= INFEST.regrow.nest));
      if (Object.keys(kept).length) state.scraped[zk] = kept;
    }
  }
}
