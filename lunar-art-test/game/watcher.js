import { missionSite, terrainBlocked } from './terrain.js';

/** Something on the crater rim. Presentation only and never saved: it appears at the edge of the
 * player's view, and is gone as soon as they get close or head toward it. It never acts. */
export const WATCHER = Object.freeze({ near: 11, glance: 0.45, lifetime: 9, rangeMin: 15, rangeMax: 26 });

export function createWatcher() { return { figure: null, cooldown: 12 }; }
const turn = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Advances the watcher; returns 'vanished' on the step it starts to slip away. */
export function stepWatcher(w, state, dt, random = Math.random) {
  const p = state.player, site = missionSite();
  const near = p.cave == null && state.mission?.step >= 3 && Math.hypot(p.x - site.x, p.z - site.z) < site.radius + 14;
  w.cooldown -= dt;
  const f = w.figure;
  if (f) {
    f.age += dt;
    const dx = f.x - p.x, dz = f.z - p.z, distance = Math.hypot(dx, dz);
    const facing = (p.speed ?? 0) > 0.5 && turn(Math.atan2(dx, dz), p.facing ?? 0) < WATCHER.glance;
    let event = null;
    if (!f.leaving && (distance < WATCHER.near || facing || f.age > WATCHER.lifetime || !near)) { f.leaving = true; event = 'vanished'; }
    if (f.leaving) { f.fade -= dt * 3; if (f.fade <= 0) { w.figure = null; w.cooldown = 35 + random() * 40; } }
    else f.fade = Math.min(1, f.fade + dt * 0.6);
    return event;
  }
  if (!near || w.cooldown > 0) return null;
  // Somewhere on the rim, at a distance, and well away from where the player is heading.
  for (let i = 0; i < 24; i++) {
    const a = random() * Math.PI * 2, r = site.radius + 1.5 + random() * 3;
    const x = site.x + Math.sin(a) * r, z = site.z + Math.cos(a) * r, distance = Math.hypot(x - p.x, z - p.z);
    if (distance < WATCHER.rangeMin || distance > WATCHER.rangeMax || turn(Math.atan2(x - p.x, z - p.z), p.facing ?? 0) < 1.4 || terrainBlocked(state.seed, x, z)) continue;
    w.figure = { x, z, facing: Math.atan2(p.x - x, p.z - z), age: 0, fade: 0, leaving: false };
    return null;
  }
  w.cooldown = 2;
  return null;
}
