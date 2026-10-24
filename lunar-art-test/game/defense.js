import { CELL_SIZE, DEFS, footprint } from './defs.js';
import { hurtCrawler, partNear, partsOf, radiusOf, sizeOf } from './crawler.js';
import { damageBuilding, provoke } from './raid.js';
import { surfaceHeightAt } from './terrain.js';
import * as inv from './inventory.js';
import { available, pay } from './storage.js';

/**
 * Base defences. A sentry turret turns its head on the nearest crawler in sight and fires its two cannons in turn,
 * one round a shot, while the grid is up and its box holds rounds. Each hit may draw the raider off whatever it was
 * tearing at and onto the turret.
 *
 * An electric fence shocks every crawler that comes close, pulse after pulse, while the grid is up. It has three ways
 * to fail besides claws: it goes dark with the grid; the black goo of whatever dies by it (or is shot beside it)
 * splashes the wires and every shock cooks a little more on, until a segment shorts and the whole joined run goes dead;
 * and a short may catch fire, burning the segment down. A fouled segment is scraped clean with E, or by an android.
 *
 * Saved per building: turret `ammo`; fence `foul`, `short`, `fire`. Aim and cooldowns are runtime only.
 */
export const TURRET = Object.freeze({
  range: 18, cap: 120, restock: 80, power: .8, turn: 5, aimed: .14, rate: .17, damage: 7, height: 1.6,
  hit: .9, falloff: 70, sight: .25, provoke: .3,
});
export const FENCE = Object.freeze({
  reach: 1.9, pulse: .75, zap: 11, power: .06, most: 3,
  // Goo: a kill splashes its size onto segments within `splash` metres; every shock cooks `cook` more on. At `short` it shorts.
  splash: 2.8, cook: .12, short: 4, fireChance: .45, burn: 12, burnDamage: 5, scorch: 14, clean: 2.5,
});
/** What E at a defence does, or null. */
export function defenseAction(state, b) {
  if (!b.built) return null;
  if (b.type === 'turret') {
    const room = TURRET.cap - (b.ammo ?? 0), have = available(state, 'rounds');
    return room >= 1 && have >= 1 ? { verb: `Load ${Math.min(room, have)} rounds · ${b.ammo ?? 0}/${TURRET.cap}` } : null;
  }
  if (b.type === 'fence' && ((b.foul ?? 0) >= .5 || b.short || b.fire > 0)) return { verb: b.fire > 0 ? 'Beat out the fire and scrape off the goo' : b.short ? 'Scrape the goo off the shorted wires' : 'Scrape the goo off the wires' };
  return null;
}
export function useDefense(state, b) {
  if (b.type === 'turret') {
    const n = Math.min(TURRET.cap - (b.ammo ?? 0), available(state, 'rounds'));
    if (n < 1) return { ok: false, reason: (b.ammo ?? 0) >= TURRET.cap ? 'The turret is fully loaded.' : 'Bring rounds: an armory makes them.' };
    if (!pay(state, { rounds: n })) return { ok: false, reason: 'Bring rounds: an armory makes them.' };
    b.ammo = (b.ammo ?? 0) + n;
    return { ok: true, reason: `Loaded ${n} rounds into the turret (${b.ammo}/${TURRET.cap}).` };
  }
  if (b.type === 'fence') {
    if (!defenseAction(state, b)) return { ok: false, reason: 'The wires are clean.' };
    const was = b.short;
    scrape(b);
    return { ok: true, reason: was ? 'Wires scraped clean. The fence is live again.' : 'Wires scraped clean.' };
  }
  return { ok: false, reason: 'Nothing to do here.' };
}
/** Clears a fence segment of goo, its short and any fire. */
export function scrape(b) { delete b.foul; delete b.short; delete b.fire; }
export const fouled = b => b.type === 'fence' && b.built && ((b.foul ?? 0) >= 1 || !!b.short || b.fire > 0);
/** Kilowatts the defences draw. */
export const defenseDemand = state => state.buildings.reduce((kw, b) => kw + (!b.built ? 0 : b.type === 'turret' ? TURRET.power : b.type === 'fence' ? FENCE.power : 0), 0);

const key = (x, z) => `${x},${z}`;
const centre = b => { const f = footprint(b.type, b.x, b.z, b.rotation); return { x: f.reduce((s, c) => s + c.x, 0) / f.length * CELL_SIZE, z: f.reduce((s, c) => s + c.z, 0) / f.length * CELL_SIZE }; };
const live = c => c.state !== 'dead' && c.state !== 'emerge' && !c.gone && (!c.raider || c.near) && partsOf(c).length > 0;

/** Fence segments joined edge to edge, each run with its segments; a run is live only with no segment shorted. */
export function fenceRuns(state) {
  const fences = state.buildings.filter(b => b.type === 'fence' && b.built), at = new Map(fences.map(b => [key(b.x, b.z), b])), seen = new Set(), runs = [];
  for (const b of fences) {
    if (seen.has(b)) continue;
    const run = [], open = [b]; seen.add(b);
    while (open.length) {
      const f = open.pop(); run.push(f);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = at.get(key(f.x + dx, f.z + dz)); if (n && !seen.has(n)) { seen.add(n); open.push(n); } }
    }
    runs.push({ segments: run, dead: run.some(f => f.short) });
  }
  return runs;
}

// What blocks a turret's line of fire: standing structures other than fences and belts, and rooms.
let blockers = { sig: null, cells: null };
function sightBlockers(state) {
  const sig = state.buildings.map(b => `${b.id}:${b.built ? 1 : 0}`).join('|');
  if (blockers.sig === sig) return blockers.cells;
  const cells = new Map();
  for (const b of state.buildings) if (b.built && b.type !== 'fence' && b.type !== 'conveyor' && (!DEFS[b.type].walkable || DEFS[b.type].layer === 'floor')) for (const c of footprint(b.type, b.x, b.z, b.rotation)) cells.set(key(c.x, c.z), b.id);
  blockers = { sig, cells };
  return cells;
}
/** Whether turret `b` can see a point at (x, z): no structure but its own, and no rise of the ground, in the way. */
export function turretSees(state, b, x, z) {
  const from = centre(b), dx = x - from.x, dz = z - from.z, d = Math.hypot(dx, dz), solid = sightBlockers(state);
  const h0 = surfaceHeightAt(state.seed, from.x, from.z) + TURRET.height, h1 = surfaceHeightAt(state.seed, x, z) + .5, end = key(Math.round(x / CELL_SIZE), Math.round(z / CELL_SIZE));
  for (let s = 1; s < d - .5; s += .5) {
    const t = s / d, px = from.x + dx * t, pz = from.z + dz * t, k = key(Math.round(px / CELL_SIZE), Math.round(pz / CELL_SIZE)), id = solid.get(k);
    if (id != null && id !== b.id && k !== end) return false;
    if (surfaceHeightAt(state.seed, px, pz) > h0 + (h1 - h0) * t - .1) return false;
  }
  return true;
}
const sights = new WeakMap();

/**
 * Turrets and fences, once a frame on the surface. `powered` is the grid's state. Returns events for the view:
 * turret {building, side, x, z, hit, crawler}, zap {building, x, z, crawler}, short {building, fire}, and splash
 * {building, amount} where a body's goo lands on the wires.
 */
export function stepDefenses(state, dt, powered, rng = Math.random) {
  const events = [], brood = state.brood ?? [], threats = brood.filter(live);
  for (const b of state.buildings) if (b.type === 'turret' && b.built) turret(state, b, dt, powered, threats, rng, events);
  fences(state, dt, powered, brood, threats, rng, events);
  return events;
}

function turret(state, b, dt, powered, threats, rng, events) {
  b.cool = Math.max(0, (b.cool ?? 0) - dt);
  const at = centre(b);
  b.yaw ??= b.rotation * Math.PI / 2;
  if (!powered) { b.target = null; return; }
  // Keep on a target while it stays in reach and in sight; otherwise the nearest one that is.
  let look = sights.get(b);
  if (!look || (look.t -= dt) <= 0 || !threats.includes(look.target)) {
    const ranked = threats.map(c => ({ c, p: partNear(c, at.x, at.z) })).filter(o => o.p && o.p.d < TURRET.range).sort((p, q) => p.p.d - q.p.d);
    const keep = look?.target && ranked.find(o => o.c === look.target && turretSees(state, b, o.p.x, o.p.z));
    const pick = keep ?? ranked.slice(0, 4).find(o => turretSees(state, b, o.p.x, o.p.z));
    sights.set(b, look = { target: pick?.c ?? null, t: TURRET.sight });
  }
  const c = look.target;
  if (!c) {
    // Nothing in sight: the head sweeps slowly to and fro across the way it was built to face.
    b.target = null; b.scan = (b.scan ?? b.id) + dt;
    const want = b.rotation * Math.PI / 2 + Math.sin(b.scan * .4) * 1.1, turn = Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw));
    b.yaw += Math.sign(turn) * Math.min(Math.abs(turn), TURRET.turn * .2 * dt);
    return;
  }
  const p = partNear(c, at.x, at.z), want = Math.atan2(p.x - at.x, p.z - at.z);
  let turn = Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw));
  b.yaw += Math.sign(turn) * Math.min(Math.abs(turn), TURRET.turn * dt);
  b.target = { x: p.x, z: p.z, size: sizeOf(c) };
  turn = Math.atan2(Math.sin(want - b.yaw), Math.cos(want - b.yaw));
  if (Math.abs(turn) > TURRET.aimed || b.cool > 0 || (b.ammo ?? 0) < 1) return;
  b.ammo -= 1; b.cool = TURRET.rate; b.side = 1 - (b.side ?? 0);
  const odds = Math.max(.15, Math.min(.95, TURRET.hit - p.d / TURRET.falloff - (c.speed ?? 0) * .05 + (sizeOf(c) - 1) * .08));
  const hit = rng() < odds;
  let x = p.x, z = p.z;
  if (hit) {
    hurtCrawler(c, TURRET.damage, rng);
    // A raider stung by a turret tears at it instead, now and then; a defence's hits aren't the player's.
    c.burnt = true;
    if (c.raider && c.state !== 'dead' && rng() < TURRET.provoke) provoke(state, c, b);
  } else {
    const side = (rng() < .5 ? -1 : 1) * (.6 + rng() * 1.2), ux = (p.x - at.x) / (p.d || 1), uz = (p.z - at.z) / (p.d || 1);
    x = p.x + ux * 2.5 - uz * side; z = p.z + uz * 2.5 + ux * side;
  }
  events.push({ type: 'turret', building: b.id, side: b.side, x, z, hit, crawler: c, size: sizeOf(c) });
}

function fences(state, dt, powered, brood, threats, rng, events) {
  // A wrecked segment comes back clean when it is rebuilt.
  for (const b of state.buildings) if (b.type === 'fence' && !b.built && (b.foul != null || b.short || b.fire != null)) scrape(b);
  const runs = fenceRuns(state);
  if (!runs.length) return;
  const segments = runs.flatMap(r => r.segments);
  // Goo from every body that falls near the wires, whatever killed it.
  for (const c of brood) {
    if (c.state !== 'dead' || c.splashed) continue;
    c.splashed = true;
    for (const f of segments) {
      const o = centre(f), d = Math.hypot(o.x - c.x, o.z - c.z);
      if (d > FENCE.splash) continue;
      const amount = sizeOf(c) * (1 - d / (FENCE.splash + .6));
      f.foul = (f.foul ?? 0) + amount;
      events.push({ type: 'splash', building: f.id, amount });
    }
  }
  for (const run of runs) {
    for (const f of run.segments) {
      if (f.fire > 0) {
        f.fire = Math.max(0, f.fire - dt);
        // Burning goo scorches whatever stands in it.
        const o = centre(f);
        for (const c of threats) if (Math.hypot(c.x - o.x, c.z - o.z) < 1.2 + radiusOf(c)) { hurtCrawler(c, FENCE.scorch * dt, rng); c.burnt = true; }
        if (damageBuilding(state, f, FENCE.burnDamage * dt)) { scrape(f); events.push({ type: 'burnt', building: f.id }); continue; }
      }
      if (!f.short && (f.foul ?? 0) >= FENCE.short) {
        f.short = true;
        const fire = rng() < FENCE.fireChance + (f.foul - FENCE.short) * .1;
        if (fire) f.fire = FENCE.burn;
        events.push({ type: 'short', building: f.id, fire });
        run.dead = true;
      }
    }
    if (!powered || run.dead) continue;
    for (const f of run.segments) {
      f.cool = Math.max(0, (f.cool ?? 0) - dt);
      if (f.cool > 0 || !f.built) continue;
      const o = centre(f), near = threats.filter(c => { const p = partNear(c, o.x, o.z); return p && p.d < FENCE.reach + radiusOf(c) * .5; }).slice(0, FENCE.most);
      if (!near.length) continue;
      f.cool = FENCE.pulse;
      for (const c of near) {
        const p = partNear(c, o.x, o.z);
        hurtCrawler(c, FENCE.zap, rng); c.burnt = true;
        f.foul = (f.foul ?? 0) + FENCE.cook * Math.sqrt(sizeOf(c));
        events.push({ type: 'zap', building: f.id, x: p.x, z: p.z, crawler: c, size: sizeOf(c) });
      }
    }
  }
}

const finite = n => typeof n === 'number' && Number.isFinite(n);
/** Validated defence fields for a restored building, or throws. */
export function restoreDefense(b, raw) {
  const bad = () => { throw new Error(`Invalid ${DEFS[b.type].name.toLowerCase()} state.`); };
  if (b.type === 'turret' && raw.ammo != null) { if (!Number.isInteger(raw.ammo) || raw.ammo < 0 || raw.ammo > TURRET.cap) bad(); b.ammo = raw.ammo; }
  if (b.type === 'fence') {
    if (raw.foul != null) { if (!finite(raw.foul) || raw.foul < 0 || raw.foul > 50) bad(); if (raw.foul > 0) b.foul = raw.foul; }
    if (raw.short != null) { if (typeof raw.short !== 'boolean') bad(); if (raw.short) b.short = true; }
    if (raw.fire != null) { if (!finite(raw.fire) || raw.fire < 0 || raw.fire > FENCE.burn) bad(); if (raw.fire > 0) b.fire = raw.fire; }
  }
  return b;
}
