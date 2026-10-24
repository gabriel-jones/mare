import { missionSite, terrainData } from './terrain.js';
import * as inv from './inventory.js';
import { LAUNCH } from './space.js';

/** The ship AI's objectives, in order. Each starts with a message; `done` is checked every tick, so
 * work finished early simply skips ahead. `target` names where the waypoint points; `parts` counts
 * progress on multi-part work as [have, need]. */
export const SHIP = Object.freeze({ x: 0, z: -10, reach: 6.5 });
export const SALVAGE_TIME = 3;
const has = (s, type) => s.buildings.some(b => b.type === type && b.built);
const launched = s => s.satellites > 0;
// A satellite counts once it exists anywhere: in the assembler, on a belt or hauler, carried, or aboard.
const satelliteMade = s => launched(s) || s.ship.payload > 0 || inv.count(s.inventory, 'satellite') > 0
  || s.buildings.some(b => (b.out?.satellite ?? 0) + (b.type === 'storage' ? inv.count(b.slots ?? [], 'satellite') : 0) > 0 || b.items?.some(i => i.type === 'satellite'))
  || s.robots.some(r => r.load === 'satellite' && r.cargo > 0);
export const STEPS = Object.freeze([
  { id: 'power', objective: 'Build a solar array', message: "Ship AI online. We're down in one piece, mostly. First, power: open the build menu (B) and place a solar array.", done: s => has(s, 'solar') },
  { id: 'shelter', objective: 'Paint a habitat and attach an airlock', message: "Power's flowing. You'll need somewhere to breathe and eat: paint a habitat (H) and fit an airlock to it.", parts: s => [has(s, 'habitat') + has(s, 'airlock'), 2], done: s => has(s, 'habitat') && has(s, 'airlock') },
  { id: 'mining', objective: 'Build a hopper and mark a mining zone', message: 'Good. Now give the rover a job. Build a regolith hopper, then mark a mining zone (M).', parts: s => [has(s, 'hopper') + (s.miningAreas.length > 0), 2], done: s => has(s, 'hopper') && s.miningAreas.length > 0 },
  { id: 'crater', objective: 'Investigate the crater to the east', message: "Bad news. The landing cracked our processor core, so we can't refine anything. There's an old robotic lander in the crater about 60 metres east. Its core should fit. Go and take a look.", legacy: "Our processor has been running on a bypass since landing, and it won't hold. There's an old robotic lander in the crater about 60 metres east with a compatible core. Go and take a look.", target: 'lander', done: s => s.mission.visited },
  { id: 'salvage', objective: 'Hold E at the lander to pull its core', message: "That's the lander. Its panels have been clawed open, and whatever did it was after the core. It's still seated. Hold E beside it.", target: 'lander', done: s => s.mission.salvage >= 1 },
  { id: 'repair', objective: 'Take the core to the Starship and press E', message: "Got it. Bring it back to the ship and I'll talk you through the install.", target: 'ship', done: s => s.mission.installed },
  { id: 'refine', objective: 'Build a regolith processor', message: 'Core installed. Refining is back online: build a regolith processor and belt the hopper into it.', done: s => has(s, 'processor') },
  { id: 'ice', objective: 'Mine crater ice and melt it into water', message: "That crater floor never sees the Sun, and it's full of water ice. Build an ice melter, then mark a mining zone on the ice. The rover carries ice straight into the melter.", target: 'ice', parts: s => [Math.min(5, Math.floor(s.mission.melted)), 5], done: s => s.mission.melted >= 5 },
  { id: 'fabricate', objective: 'Build a fabricator', message: "Water's flowing. One more thing: that creature at the lander left a trail of silk all the way to the caves. I can't see it on any sensor, so we need eyes in orbit. Build a fabricator from the Space menu and belt it metal and silicon. It makes satellite parts.", done: s => has(s, 'fabricator') || launched(s) },
  { id: 'hauler', objective: 'Build a robot dock and a hauler', message: 'Belts get tangled fast. Build a robot dock, then a hauler from the Robots section of the build menu (B). Haulers carry materials, parts and satellites to whatever needs them.', parts: s => [has(s, 'dock') + s.robots.some(r => r.kind === 'hauler'), 2], done: s => s.robots.some(r => r.kind === 'hauler') || launched(s) },
  { id: 'assemble', objective: 'Assemble a satellite', message: 'Now build a satellite assembler. It takes one frame, two solar wings and two compute chips per satellite.', done: satelliteMade },
  { id: 'fuel', objective: 'Fuel the Starship', message: "Our tanks are dry. Build an electrolyser to split water into hydrogen and oxygen, and a propellant tank beside the landing pad. The tank fills the ship.", target: 'ship', parts: s => [has(s, 'electrolyser') + has(s, 'tank') + (s.ship.fuel >= LAUNCH.fuel), 3], done: s => s.ship.fuel >= LAUNCH.fuel || launched(s) },
  { id: 'launch', objective: 'Load a satellite and launch', message: 'Fuelled. Haulers bring satellites to the pad, or carry one yourself. When one is aboard, hold E beside the Starship to launch.', target: 'ship', done: launched },
  { id: 'research', objective: 'Research the robot bay', message: "Satellite deployed. Open research (T) and choose what to study. Every satellite in orbit speeds it up. The robot bay comes first: it builds robots on its own.", done: s => s.research.done.includes('roverbay') },
  // From here the colony needs what only the caves hold.
  { id: 'caves', objective: 'Bring 6 titanium ore up from a cave', message: "Robot bay unlocked: build one and click it to queue rovers and haulers. Our next machines need titanium, and the surface regolith has none. Those hills have cave mouths. Chip ore from the seams and carry it back. Take it slow down there.", target: 'cave', parts: s => [Math.min(6, inv.count(s.inventory, 'titanium')), 6], done: s => has(s, 'xenolab') || inv.count(s.inventory, 'titanium') >= 6 },
  { id: 'xenolab', objective: 'Build a xeno lab', message: "Titanium. And carvings, you said? Build a xeno lab (Deep menu). Bring it anything strange you find down there and it turns it into research.", done: s => has(s, 'xenolab') },
  { id: 'schematic', objective: 'Find a schematic in the Hollows', message: "If whoever carved those walls left anything we can use, it'll be deeper. Find the pit with the ladder and climb down to the Hollows.", target: 'cave', done: s => (s.blueprints ?? []).includes('reactor') },
  { id: 'reactor', objective: 'Research and build the resonance reactor', message: "Research the reactor (T); artifacts studied at the xeno lab count too. It'll want titanium and rare-earth crystals from the Hollows.", done: s => has(s, 'reactor') },
]);
export const FINALE = "Reactor online: ten kilowatts straight through the lunar night. The Deep is still down there, and so is whatever carved those walls.";

export function createMission(legacy = false) {
  return { step: 0, visited: false, salvage: 0, installed: false, legacy, melted: 0, met: false };
}
/** Colonies from before the crater mission keep their processors; new ones must repair the ship first. */
export const processorUnlocked = state => !!(state.mission?.installed || state.mission?.legacy);

const distance = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
const onSurface = state => state.player.cave == null;
export const nearLander = state => { const l = missionSite().lander; return onSurface(state) && distance(state.player, l) < l.radius + 1.6; };
export const nearShip = state => onSurface(state) && distance(state.player, SHIP) < SHIP.reach;

export function stepMission(state) {
  const m = state.mission, site = missionSite();
  if (onSurface(state) && distance(state.player, site.lander) < 12) m.visited = true;
  while (m.step < STEPS.length && STEPS[m.step].done(state)) m.step++;
}
/** The current objective for the HUD, or the closing message once every step is done. */
export function objective(state) {
  const m = state.mission, step = STEPS[m.step];
  if (!step) return { done: true, message: FINALE, step: m.step, count: STEPS.length };
  const site = missionSite();
  const cave = step.target === 'cave' && [...terrainData(state.seed).caves].sort((a, b) => distance(a, state.player) - distance(b, state.player))[0];
  const target = { lander: site.lander, ship: SHIP, ice: site, cave }[step.target] || null;
  return { id: step.id, objective: step.objective, message: (m.legacy && step.legacy) || step.message, step: m.step, count: STEPS.length, parts: step.parts?.(state) ?? [0, 1], target: target && { x: target.x, z: target.z } };
}
/** What pressing or holding E would do at the lander or the ship, or null. */
export function missionAction(state) {
  const m = state.mission;
  if (m.salvage < 1 && nearLander(state)) return { verb: 'Hold to pull the processor core', hold: true, progress: m.salvage };
  if (!m.installed && nearShip(state) && inv.count(state.inventory, 'core') > 0) return { verb: 'Install the processor core' };
  return null;
}
/** Holding E beside the lander works the core loose over a few seconds. */
export function salvage(state, dt) {
  const m = state.mission;
  if (m.salvage >= 1) return { ok: false, reason: 'The lander has nothing left worth taking.' };
  if (!nearLander(state)) return { ok: false, reason: 'Move next to the lander.' };
  if (inv.room(state.inventory, 'core') < 1) return { ok: false, reason: 'Free an inventory slot for the core.' };
  m.salvage = Math.min(1, m.salvage + dt / SALVAGE_TIME);
  if (m.salvage < 1) return { ok: true, reason: 'Working the core loose…' };
  inv.add(state.inventory, 'core', 1);
  return { ok: true, done: true, reason: 'Processor core recovered.' };
}
export function installCore(state) {
  const m = state.mission;
  if (m.installed) return { ok: false, reason: 'The core is already installed.' };
  if (!nearShip(state)) return { ok: false, reason: 'Move closer to the Starship.' };
  if (!inv.remove(state.inventory, 'core', 1)) return { ok: false, reason: "You aren't carrying the core." };
  m.installed = true;
  return { ok: true, reason: 'Processor core installed. Regolith processors can be built.' };
}
export function restoreMission(raw) {
  const m = createMission();
  const bool = v => typeof v === 'boolean';
  if (!raw || !Number.isInteger(raw.step) || raw.step < 0 || raw.step > STEPS.length || !bool(raw.visited) || !bool(raw.installed) || !bool(raw.legacy)
    || typeof raw.salvage !== 'number' || !(raw.salvage >= 0 && raw.salvage <= 1) || typeof raw.melted !== 'number' || !(raw.melted >= 0 && raw.melted < 1e9) || (raw.met != null && !bool(raw.met))) throw new Error('Invalid mission.');
  for (const k of Object.keys(m)) if (k !== 'met') m[k] = raw[k];
  // Saves from before the encounter: anyone who has already been to the lander has missed it.
  m.met = raw.met ?? (raw.visited || raw.salvage > 0);
  return m;
}
