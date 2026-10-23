import { missionSite, terrainData } from './terrain.js';
import { createCrawler } from './crawler.js';

/**
 * The first encounter at the crash site. A crawler is hunched in the derelict lander's open core bay, prying at it.
 * When the player comes close it freezes, turns and shrieks, then bolts out of the crater along its trail to the
 * nearest cave mouth and is gone. It never attacks and cannot be hurt; only `state.mission.met` is saved, so it
 * happens once. The trail it leaves (and has left before) is `encounterTrail(seed)`.
 */
export const ENCOUNTER = Object.freeze({ notice: 16, freeze: .55, shriek: 1.3, speed: 7.5, gone: 2.5, pry: 1.1 });
export const ENCOUNTER_SAY = "What was that? It was inside the lander, pulling at the core. And it ran for the hills, toward the caves. I'm not reading it at all: no heat, no signal. Stay sharp.";

const BAY = .6;
/** Where the lander's open core bay faces, and the point the crawler claws at. */
export function landerBay() {
  const l = missionSite().lander, dx = Math.sin(l.angle), dz = Math.cos(l.angle);
  return { x: l.x + dx * BAY, z: l.z + dz * BAY, y: 1.35, dx, dz };
}

const trails = new Map();
/** Lander bay → round the hull → out over the rim toward the nearest cave mouth → into it. World metres, [x, z]. */
export function encounterTrail(seed) {
  if (trails.has(seed)) return trails.get(seed);
  const site = missionSite(), l = site.lander, bay = landerBay();
  const cave = [...terrainData(seed).caves].sort((a, b) => Math.hypot(a.x - site.x, a.z - site.z) - Math.hypot(b.x - site.x, b.z - site.z))[0];
  const ox = cave.x - site.x, oz = cave.z - site.z, od = Math.hypot(ox, oz) || 1, ux = ox / od, uz = oz / od;
  const start = [bay.x + bay.dx * 1.6, bay.z + bay.dz * 1.6];
  // Round the side of the hull that faces the way out.
  const side = Math.sign(bay.dz * ux - bay.dx * uz) || 1, px = -bay.dz * side, pz = bay.dx * side;
  const round = [l.x + px * 2.8 + ux * .8, l.z + pz * 2.8 + uz * .8];
  const rim = [site.x + ux * (site.radius + 2), site.z + uz * (site.radius + 2)];
  const mouth = [cave.x, cave.z];
  const pts = [start, round, rim, mouth], out = [pts[0]];
  // A loose, slightly wandering line between the waypoints.
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(len / 2.5));
    for (let k = 1; k <= n; k++) {
      const t = k / n, w = k === n ? 0 : Math.sin(t * Math.PI) * Math.sin(i * 3.1 + k * 1.7) * .9;
      out.push([ax + (bx - ax) * t - (bz - az) / len * w, az + (bz - az) * t + (bx - ax) / len * w]);
    }
  }
  trails.set(seed, out);
  return out;
}

export function createEncounter() { return { crawler: null, phase: null, t: 0, leg: 0, seed: null }; }

const turnTo = (c, x, z) => { c.facing = Math.atan2(x - c.x, z - c.z); };

/**
 * Advances the encounter; returns 'shriek' when it is seen and turns, 'fled' when it has gone into the cave.
 * `e.crawler` is the creature to draw (or null); `e.pry` is where it claws while it works at the bay.
 */
export function stepEncounter(e, state, dt) {
  const m = state.mission, p = state.player;
  if (m.met || (m.salvage ?? 0) >= 1) { e.crawler = null; e.phase = null; return null; }
  if (!e.crawler || e.seed !== state.seed) {
    const [x, z] = encounterTrail(state.seed)[0], bay = landerBay();
    e.crawler = Object.assign(createCrawler(x, z), { state: 'slash', speed: 0 }); turnTo(e.crawler, bay.x, bay.z);
    e.phase = 'pry'; e.t = 0; e.leg = 1; e.seed = state.seed;
  }
  const c = e.crawler; e.t += dt; c.t += dt;
  const distance = Math.hypot(p.x - c.x, p.z - c.z), surface = p.cave == null;
  if (e.phase === 'pry') {
    // Clawing at the bay in bursts; a slash restarts each burst so the leg keeps raking.
    if (c.t > ENCOUNTER.pry) { c.t = 0; c.state = c.state === 'slash' ? 'lurk' : 'slash'; }
    if (surface && distance < ENCOUNTER.notice) { e.phase = 'freeze'; e.t = 0; c.state = 'lurk'; c.t = 0; }
    return null;
  }
  if (e.phase === 'freeze') {
    const want = Math.atan2(p.x - c.x, p.z - c.z), d = Math.atan2(Math.sin(want - c.facing), Math.cos(want - c.facing));
    c.facing += d * Math.min(1, dt * 7);
    if (e.t > ENCOUNTER.freeze) { e.phase = 'shriek'; e.t = 0; c.state = 'shriek'; c.t = 0; return 'shriek'; }
    return null;
  }
  if (e.phase === 'shriek') {
    turnTo(c, p.x, p.z);
    if (e.t > ENCOUNTER.shriek) { e.phase = 'flee'; e.t = 0; c.state = 'flee'; c.t = 0; }
    return null;
  }
  // Fleeing along the trail; it is gone once it reaches the cave mouth.
  const trail = encounterTrail(state.seed);
  let step = ENCOUNTER.speed * dt;
  while (step > 0 && e.leg < trail.length) {
    const [tx, tz] = trail[e.leg], dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    if (d <= step) { c.x = tx; c.z = tz; step -= d; e.leg++; continue; }
    c.x += dx / d * step; c.z += dz / d * step; c.facing = Math.atan2(dx, dz); step = 0;
  }
  c.speed = ENCOUNTER.speed;
  const [mx, mz] = trail.at(-1);
  if (Math.hypot(c.x - mx, c.z - mz) < ENCOUNTER.gone || e.leg >= trail.length) { m.met = true; e.crawler = null; e.phase = null; return 'fled'; }
  return null;
}
