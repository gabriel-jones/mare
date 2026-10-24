// Throwaway colonies for playing raids on demand (raids.html). Pure sim: builds a save, never touches storage.
import { createState, placeBlueprint, payInFull, serialize, tick, DEFS } from '../sim.js';
import { createInventory, add } from '../inventory.js';
import { ensureBuildingState } from '../production.js';
import { ensureLifeState } from '../life.js';
import { ensureVat } from '../goo.js';
import { ensurePower } from '../power.js';
import { spawnRobot } from '../space.js';
import { CELL_SIZE } from '../defs.js';
import { asKind, createCrawler } from '../crawler.js';
import { launchRaid } from '../raid.js';

const DUSK = 81, DAWN = 200;
const TECHS = ['reactor', 'androids', 'containment', 'smg', 'rifle', 'railgun', 'katana'];

/** Places and finishes `type` at the nearest clear square to (x, z). */
function put(s, type, x, z, rotation = 0) {
  for (let ring = 0; ring < 6; ring++) for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
    const r = placeBlueprint(s, type, x + dx, z + dz, rotation);
    if (!r.ok) continue;
    const b = s.buildings.find(b => b.id === r.id);
    payInFull(s, b); b.progress = 1; b.built = true; delete b.paid;
    ensurePower(ensureVat(ensureLifeState(ensureBuildingState(b))));
    return b;
  }
  throw new Error(`No room for ${type} near ${x},${z}`);
}
function android(s, x, z, weapon) {
  put(s, 'chargepad', x, z);
  const r = spawnRobot(s, 'android', x * CELL_SIZE, z * CELL_SIZE);
  if (weapon) Object.assign(r, { weapon, mag: weapon === 'katana' ? 0 : weapon === 'railgun' ? 3 : 12, ammo: weapon === 'katana' ? 0 : weapon === 'railgun' ? 6 : 36 });
  return r;
}

/**
 * A mid-game colony: a pressurised habitat with an armory, a xeno lab, solar and batteries (and a reactor unless the
 * lights should fail), crates of materials and rounds.
 */
function colony({ reactor = true, crew = [] } = {}) {
  const s = createState(4242);
  s.inventory = createInventory({ metal: 2000, silicon: 1000, titanium: 200, rareearth: 40 });
  s.research.done.push(...TECHS); s.blueprints = ['reactor', 'containment'];
  for (const [x, z] of [[-5, 3], [-4, 3], [-3, 3], [-5, 4], [-4, 4], [-3, 4]]) put(s, 'habitat', x, z);
  put(s, 'airlock', -4, 5, 0);
  put(s, 'armory', -5, 3);
  put(s, 'xenolab', 3, 3);
  if (reactor) put(s, 'reactor', 6, 6);
  for (const [x, z] of [[-9, 0], [-9, 2], [-9, 4]]) put(s, 'solar', x, z);
  for (const x of [7, 8, 9]) put(s, 'battery', x, 1);
  const crate = put(s, 'storage', 1, 7), spare = put(s, 'storage', 2, 7);
  add(crate.slots, 'metal', 120); add(crate.slots, 'silicon', 60); add(spare.slots, 'rounds', 180); add(spare.slots, 'charge', 20);
  crew.forEach((w, i) => android(s, -1 + i, 9, w));
  s.inventory = createInventory({ smg: 1, rifle: 1, rounds: 120, flare: 4, meal: 4, pistol: 1 });
  s.player = { ...s.player, x: 2, z: 20, facing: Math.PI, health: 100 };
  s.starter = true;
  tick(s, 0); s.power.stored = reactor ? s.power.capacity : 0;
  return s;
}
/** Raiders already at the base, as if the pack had just arrived. */
function atBase(s, kinds) {
  kinds.forEach((kind, i) => {
    const a = i / kinds.length * Math.PI * 2, c = asKind(createCrawler(Math.sin(a) * 18, Math.cos(a) * 18 + 6), kind);
    Object.assign(c, { raider: true, state: 'march' });
    (s.brood ??= []).push(c);
  });
}

export const SCENARIOS = {
  first: { name: 'First raid', note: 'Dusk falls; one drone leaves a cave. Two armed androids.', make() { const s = colony({ crew: ['rifle', 'smg'] }); s.time = DUSK; launchRaid(s, 1, 4); return s; } },
  pack: { name: 'First brute', note: 'Fifth raid: three drones and a brute in two packs. Two armed androids.', make() { const s = colony({ crew: ['rifle', 'smg'] }); s.time = DUSK; launchRaid(s, 5, 3); return s; } },
  swarm: { name: 'Swarm', note: 'Ninth raid: four drones and two brutes in two packs, three androids.', make() { const s = colony({ crew: ['railgun', 'rifle', 'katana'] }); s.time = DUSK; launchRaid(s, 9, 3); return s; } },
  alone: { name: 'No defenders', note: 'Third raid, two drones, no androids. You and an SMG.', make() { const s = colony(); s.time = DUSK; launchRaid(s, 3, 3); return s; } },
  dark: { name: 'Lights out', note: 'No reactor and flat batteries: the base is dark, no alarm lights.', make() { const s = colony({ reactor: false, crew: ['rifle'] }); s.time = DUSK; launchRaid(s, 4, 3); return s; } },
  siege: { name: 'Holed up', note: 'You are inside the habitat, out of reach: the raiders tear at the base around you.', make() { const s = colony(); s.time = DUSK + 10; s.player = { ...s.player, x: -8, z: 7 }; atBase(s, ['drone', 'drone', 'brute']); s.raid = { wave: 4, night: 0, quiet: 0, spawns: [] }; return s; } },
  matron: { name: 'Matron', note: 'Tenth raid: a matron leads drones and brutes. Kill her and her brood pour out. Three androids.', make() { const s = colony({ crew: ['railgun', 'rifle', 'katana'] }); s.time = DUSK; launchRaid(s, 10, 3); return s; } },
  dawn: { name: 'Dawn breaks', note: 'Raiders at the base ten seconds before sunrise: they run for the caves.', make() { const s = colony({ crew: ['rifle'] }); s.time = DAWN - 10; atBase(s, ['drone', 'drone', 'brute', 'brood']); s.raid = { wave: 5, night: 0, quiet: 0, spawns: [] }; return s; } },
};
export const makeSave = id => serialize((SCENARIOS[id] ?? SCENARIOS.first).make());
export { DUSK, DAWN, DEFS };
