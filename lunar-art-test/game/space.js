import { CELL_SIZE, DEFS, PARTS, footprint } from './defs.js';
import { RECIPES, createRover } from './production.js';
import * as inv from './inventory.js';

/** Starship fuelling, launches, orbit and research. Pure and serializable, like the rest of the sim. */
export const SHIP_PAD = Object.freeze({ x: 0, z: -10, reach: 6.5 });
export const LAUNCH = Object.freeze({ fuel: 80, payload: 3, hold: 2, ascent: 9, descent: 10, pump: 4 });
// One water makes one unit of hydrolox; a drinking reserve is always left for the colony.
export const ELECTROLYSIS = Object.freeze({ time: 2, power: 3, waterFloor: 20 });
export const RESEARCH_PER_SATELLITE = 4; // points per minute
export const TECHS = Object.freeze({
  roverbay: { name: 'Rover bay', cost: 24, description: 'A bay that builds extra mining rovers.' },
});
export const ROBOT_COST = Object.freeze({ hauler: { metal: 25, silicon: 10 }, miner: { metal: 30, silicon: 12 } });
export const ROBOT_LIMIT = Object.freeze({ hauler: 3, miner: 4 });

export const createShip = () => ({ status: 'pad', t: 0, fuel: 0, payload: 0, hold: 0 });
export const createResearch = () => ({ bank: 0, selected: 'roverbay', progress: {}, done: [] });
export const techDone = (state, id) => state.research.done.includes(id);
/** Why a research-gated building can't be placed yet, or null. */
export function lockedReason(state, type) {
  const tech = DEFS[type]?.research;
  return tech && !techDone(state, tech) ? `Locked: research the ${TECHS[tech].name} in orbit first (O).` : null;
}

const padRing = c => c.x >= -5 && c.x <= 5 && c.z >= -9 && c.z <= -1;
/** Tanks only fuel the ship when part of their footprint touches the pad. */
export const touchesPad = b => footprint(b.type, b.x, b.z, b.rotation).some(padRing);
export const shipOnPad = state => state.ship.status === 'pad';
export const launchReady = state => shipOnPad(state) && state.ship.payload >= 1 && state.ship.fuel >= LAUNCH.fuel;
const tanks = state => state.buildings.filter(b => b.type === 'tank' && b.built);
export const electrolyserReady = (state, b) => b.built && state.reserves.water > ELECTROLYSIS.waterFloor && tanks(state).some(t => t.fuel < DEFS.tank.capacity);

export function spaceDemand(state) {
  return state.buildings.filter(b => b.type === 'electrolyser' && electrolyserReady(state, b)).length * ELECTROLYSIS.power;
}

export function stepSpace(state, dt, powered) {
  const ship = state.ship;
  for (const b of state.buildings) {
    if (b.type !== 'electrolyser' || !electrolyserReady(state, b) || !powered) continue;
    b.work = Math.min(1, b.work + dt / ELECTROLYSIS.time);
    if (b.work < 1) continue;
    const target = tanks(state).filter(t => t.fuel < DEFS.tank.capacity).sort((p, q) => dist(p, b) - dist(q, b))[0];
    b.work = 0; state.reserves.water -= 1; target.fuel = Math.min(DEFS.tank.capacity, target.fuel + 1);
  }
  if (shipOnPad(state)) {
    for (const t of tanks(state)) {
      if (!touchesPad(t) || ship.fuel >= LAUNCH.fuel) continue;
      const n = Math.min(t.fuel, LAUNCH.fuel - ship.fuel, LAUNCH.pump * dt);
      t.fuel -= n; ship.fuel += n;
    }
  } else if (ship.status === 'ascent' && (ship.t += dt) >= LAUNCH.ascent) {
    state.satellites += ship.payload;
    Object.assign(ship, { status: 'orbit', t: 0, payload: 0, fuel: 0 });
  } else if (ship.status === 'descent' && (ship.t += dt) >= LAUNCH.descent) Object.assign(ship, { status: 'pad', t: 0 });
  stepResearch(state, dt);
}
function stepResearch(state, dt) {
  const r = state.research;
  r.bank += state.satellites * RESEARCH_PER_SATELLITE * dt / 60;
  const id = r.selected;
  if (!id || r.done.includes(id)) return;
  const need = TECHS[id].cost - (r.progress[id] ?? 0), spend = Math.min(need, r.bank);
  r.progress[id] = (r.progress[id] ?? 0) + spend; r.bank -= spend;
  if (r.progress[id] >= TECHS[id].cost - 1e-9) { r.done.push(id); r.selected = null; }
}
const dist = (b, o) => Math.hypot(b.x - o.x, b.z - o.z);

export function selectResearch(state, id) {
  if (id != null && !TECHS[id]) return { ok: false, reason: 'Unknown technology.' };
  if (id != null && techDone(state, id)) return { ok: false, reason: `${TECHS[id].name} is already researched.` };
  state.research.selected = id;
  return { ok: true, reason: id ? `Researching ${TECHS[id].name}.` : 'Research paused.' };
}

const nearShip = state => state.player.cave == null && Math.hypot(state.player.x - SHIP_PAD.x, state.player.z - SHIP_PAD.z) < SHIP_PAD.reach;
/** What E does at the pad terminal, or null. */
export function shipAction(state) {
  if (!nearShip(state) || !shipOnPad(state)) return null;
  if (inv.count(state.inventory, 'satellite') > 0 && state.ship.payload < LAUNCH.payload) return { verb: 'Load the satellite aboard' };
  if (launchReady(state)) return { verb: `Hold to launch (${state.ship.payload} satellite${state.ship.payload > 1 ? 's' : ''})`, hold: true, progress: state.ship.hold / LAUNCH.hold };
  return null;
}
export function loadSatellite(state) {
  if (!nearShip(state) || !shipOnPad(state)) return { ok: false, reason: 'Move to the Starship on its pad.' };
  if (state.ship.payload >= LAUNCH.payload) return { ok: false, reason: `The bay holds ${LAUNCH.payload} satellites.` };
  if (!inv.remove(state.inventory, 'satellite', 1)) return { ok: false, reason: "You aren't carrying a satellite." };
  state.ship.payload += 1;
  return { ok: true, reason: `Satellite loaded (${state.ship.payload}/${LAUNCH.payload}).` };
}
/** Holding E at the pad terminal counts down, then the ship lifts off. Releasing resets the count. */
export function holdLaunch(state, dt) {
  if (!launchReady(state) || !nearShip(state)) { state.ship.hold = 0; return { ok: false, reason: 'The Starship needs a satellite and full tanks.' }; }
  state.ship.hold = Math.min(LAUNCH.hold, state.ship.hold + dt);
  if (state.ship.hold < LAUNCH.hold) return { ok: true, reason: 'Launch sequence…' };
  Object.assign(state.ship, { status: 'ascent', t: 0, hold: 0 });
  return { ok: true, done: true, reason: 'Liftoff!' };
}
export function releaseLaunch(state) { state.ship.hold = 0; }
export function recallShip(state) {
  if (state.ship.status !== 'orbit') return { ok: false, reason: 'The Starship is not in orbit.' };
  Object.assign(state.ship, { status: 'descent', t: 0 });
  return { ok: true, reason: 'Starship returning to the pad.' };
}

/** E at a robot dock or rover bay builds one robot from carried materials, beside the building. */
export function buildRobot(state, id) {
  const b = state.buildings.find(b => b.id === id && b.built);
  const kind = b?.type === 'dock' ? 'hauler' : b?.type === 'roverbay' ? 'miner' : null;
  if (!kind) return { ok: false, reason: 'Nothing to build here.' };
  const name = kind === 'hauler' ? 'hauler' : 'mining rover';
  if (state.robots.filter(r => r.kind === kind).length >= ROBOT_LIMIT[kind]) return { ok: false, reason: `The colony can run ${ROBOT_LIMIT[kind]} ${name}s for now.` };
  for (const [item, n] of Object.entries(ROBOT_COST[kind])) if (inv.count(state.inventory, item) < n) return { ok: false, reason: `A ${name} needs ${costText(ROBOT_COST[kind])}.` };
  for (const [item, n] of Object.entries(ROBOT_COST[kind])) inv.remove(state.inventory, item, n);
  const robotId = 1 + Math.max(0, ...state.robots.map(r => r.id));
  const cells = footprint(b.type, b.x, b.z, b.rotation), x = Math.max(...cells.map(c => c.x)) + 1, z = Math.min(...cells.map(c => c.z));
  const robot = kind === 'hauler' ? createHauler(robotId, b.id) : createRover(robotId);
  Object.assign(robot, { x: x * CELL_SIZE, z: z * CELL_SIZE });
  state.robots.push(robot);
  return { ok: true, reason: `${kind === 'hauler' ? 'Hauler' : 'Mining rover'} ${robotId} is ready.` };
}
/** What E does at a finished Phase E machine, for the on-screen hint; null when nothing. */
export function machineAction(state, b) {
  if (b.type === 'fabricator') { const next = RECIPES[(RECIPES.indexOf(b.recipe) + 1) % RECIPES.length]; return { verb: `Switch to ${next === 'kit' ? 'satellite kit' : PARTS[next].name.toLowerCase()}` }; }
  if (b.type === 'assembler' && b.out.satellite >= 1) return { verb: 'Take the satellite' };
  if (b.type === 'dock') return { verb: `Build a hauler · ${costText(ROBOT_COST.hauler)}` };
  if (b.type === 'roverbay') return { verb: `Build a mining rover · ${costText(ROBOT_COST.miner)}` };
  return null;
}
export const costText = cost => Object.entries(cost).map(([item, n]) => `${n} ${item}`).join(' and ');
export function createHauler(id, home) {
  return { id, kind: 'hauler', home, x: 0, z: 0, facing: 0, task: 'idle', charge: 1, cargo: 0, load: null, target: null, job: null };
}

const finite = n => typeof n === 'number' && Number.isFinite(n);
export function restoreShip(raw) {
  const ship = createShip();
  if (raw == null) return ship;
  if (!['pad', 'ascent', 'orbit', 'descent'].includes(raw.status) || !(finite(raw.t) && raw.t >= 0 && raw.t <= 60) || !(finite(raw.fuel) && raw.fuel >= 0 && raw.fuel <= LAUNCH.fuel)
    || !(Number.isInteger(raw.payload) && raw.payload >= 0 && raw.payload <= LAUNCH.payload) || !(finite(raw.hold) && raw.hold >= 0 && raw.hold <= LAUNCH.hold)) throw new Error('Invalid ship.');
  return Object.assign(ship, { status: raw.status, t: raw.t, fuel: raw.fuel, payload: raw.payload, hold: raw.hold });
}
export function restoreResearch(raw) {
  const r = createResearch();
  if (raw == null) return r;
  if (!(finite(raw.bank) && raw.bank >= 0 && raw.bank < 1e9) || (raw.selected != null && !TECHS[raw.selected]) || !Array.isArray(raw.done) || raw.done.some(id => !TECHS[id]) || !raw.progress || typeof raw.progress !== 'object') throw new Error('Invalid research.');
  for (const [id, n] of Object.entries(raw.progress)) { if (!TECHS[id] || !(finite(n) && n >= 0 && n <= TECHS[id].cost)) throw new Error('Invalid research.'); r.progress[id] = n; }
  return Object.assign(r, { bank: raw.bank, selected: raw.selected ?? null, done: [...new Set(raw.done)] });
}
