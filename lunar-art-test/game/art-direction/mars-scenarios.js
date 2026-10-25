// Throwaway colonies for trying Mars on demand (mars.html). Pure sim: builds a save, never touches storage.
import { createState, placeBlueprint, payInFull, serialize, tick, settle } from '../sim.js';
import { createInventory, add } from '../inventory.js';
import { ensureBuildingState } from '../production.js';
import { ensureLifeState } from '../life.js';
import { ensureVat } from '../goo.js';
import { ensurePower } from '../power.js';
import { LAUNCH, VOYAGE } from '../space.js';
import { caveLayout, CAVE_CELL } from '../caves.js';
import { terrainData } from '../terrain.js';

export const NOON = 60, DUSK = 81;
const TECHS = ['reactor', 'androids', 'containment', 'smg', 'rifle', 'railgun', 'katana', 'turret', 'fence', 'flamethrower', 'escape', 'hohmann', 'aerocapture', 'edl'];

/** Places and finishes `type` at the nearest clear square to (x, z), or returns null. */
export function put(s, type, x, z, rotation = 0) {
  for (let ring = 0; ring < 6; ring++) for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
    const r = placeBlueprint(s, type, x + dx, z + dz, rotation);
    if (!r.ok) continue;
    const b = s.buildings.find(b => b.id === r.id);
    payInFull(s, b); b.progress = 1; b.built = true; delete b.paid;
    ensurePower(ensureVat(ensureLifeState(ensureBuildingState(b))));
    return b;
  }
  return null;
}
/** A small Moon base with everything researched, the tanks full and goo in the drive. */
function moon() {
  const s = createState(4242);
  s.inventory = createInventory({ metal: 2000, silicon: 1000, titanium: 200 });
  s.research.done.push(...TECHS); s.blueprints = ['reactor', 'containment'];
  for (const [x, z] of [[-9, 0], [-9, 2], [-9, 4]]) put(s, 'solar', x, z);
  put(s, 'reactor', 6, 6);
  for (const x of [7, 8, 9]) put(s, 'battery', x, 1);
  s.ship.fuel = LAUNCH.fuel; s.ship.goo = VOYAGE.gooHold;
  s.inventory = createInventory({ rifle: 1, flamethrower: 1, rounds: 120, flare: 6, meal: 4, pistol: 1, goo: 4 });
  s.player = { ...s.player, x: 1.5, z: -3.5, facing: Math.PI, health: 100 };
  s.starter = true; s.time = NOON;
  tick(s, 0); s.power.stored = s.power.capacity;
  return s;
}
/** Just landed on Mars: the kit crate and the android by the pad, the Moon base waiting at home. */
function landed() {
  const s = moon();
  settle(s, 'mars');
  s.ship.goo = VOYAGE.gooHold - VOYAGE.goo;
  Object.assign(s.player, { x: 0, z: -2.6, facing: 0 });
  s.time = NOON; tick(s, 0);
  return s;
}
/** A drill on the nearest iron deposit belting ore into a furnace, a reactor to run them and the android at the controls. */
function mining() {
  const s = landed(), d = depositOf(s, 'iron'), x = Math.round(d.x / 2 - .5), z = Math.round(d.z / 2 - .5);
  s.inventory = createInventory({ metal: 400, silicon: 200 });
  put(s, 'reactor', x - 4, z - 1);
  const drill = put(s, 'drill', x, z);
  put(s, 'conveyor', x + 1, z + 2);
  const furnace = put(s, 'furnace', x + 1, z + 3);
  s.inventory = createInventory({ rifle: 1, flamethrower: 1, rounds: 120, flare: 6, meal: 4, ironore: 20, goldore: 8 });
  if (drill) drill.out = 6;
  if (furnace) furnace.inv.ironore = 8;
  const android = s.robots.find(r => r.kind === 'android');
  if (android && drill) Object.assign(android, { x: (x - 1) * 2, z: z * 2 });
  Object.assign(s.player, { x: x * 2 - 5, z: z * 2 + 6, facing: Math.PI * .75 });
  tick(s, 0);
  return s;
}
/** On Mars, `zone` levels down cave `id`, at the zone's start. */
function cave(id, zone) {
  const s = landed(), c = caveLayout(s.seed, id, zone);
  Object.assign(s.player, { cave: id, zone: zone || undefined, x: c.start.x * CAVE_CELL, z: c.start.z * CAVE_CELL + (zone ? 2 : 1), facing: 0 });
  if (!zone) delete s.player.zone;
  s.exploredCaves = {};
  return s;
}
/** Beside the ford with the most fungus round it in cave `id`, zone `zone`, the whole zone already mapped. */
function grotto(id, zone) {
  const s = cave(id, zone), c = caveLayout(s.seed, id, zone);
  const fords = c.tiles.filter(t => t.type === 'ford'), near = t => c.fungi.filter(f => Math.hypot(f.x - t.x, f.z - t.z) < 7).length;
  const at = fords.sort((a, b) => near(b) - near(a))[0] ?? c.start;
  Object.assign(s.player, { x: at.x * CAVE_CELL, z: (at.z - 1) * CAVE_CELL, facing: 0 });
  const key = zone ? `${id}:${zone}` : String(id);
  s.exploredCaves = { [key]: c.tiles.map(t => t.key) };
  // Quiet, for looking round: every nest in the zone burnt out for the next hour.
  s.burnt = { [key]: Object.fromEntries(c.nests.map(n => [n.key, 3600])) };
  return s;
}
export const SCENARIOS = {
  pad: { name: 'Ready to fly', note: 'Moon base, every manoeuvre researched, tanks full, goo drive loaded. Hold E at the Starship to board.', make: moon },
  transfer: { name: 'In transfer', note: 'Mid-way along the Hohmann transfer to Mars. Opens the orbital view.', make() { const s = moon(); Object.assign(s.ship, { status: 'transfer', t: 9, crew: true, dest: 'mars', fuel: 0, goo: VOYAGE.gooHold - VOYAGE.goo }); s.player.aboard = true; return s; } },
  landed: { name: 'Landed', note: 'Fresh Martian colony: the landing kit crate and an android beside the pad. Deposits marked on the ground.', make: landed },
  mining: { name: 'Drill & furnace', note: 'A drill on the nearest iron deposit belting ore into a furnace; the android works the controls. E at the furnace loads, takes or switches it.', make: mining },
  dusk: { name: 'Martian dusk', note: 'The landing site as the Sun goes down.', make() { const s = landed(); s.time = DUSK - 6; return s; } },
  upper: { name: 'Cave · upper', note: 'Inside the first Martian cave, upper zone.', make: () => cave(0, 0) },
  hollows: { name: 'Cave · hollows', note: 'Inside the first Martian cave, the Hollows.', make: () => cave(0, 1) },
  deep: { name: 'Cave · deep', note: 'Inside the first Martian cave, the Deep.', make: () => cave(0, 2) },
  grotto: { name: 'Cave · river', note: 'At a ford in the Hollows with fungus nearby, the zone mapped: water, moss, fungus, fireflies, blue crystals.', make: () => grotto(0, 1) },
};
export const makeSave = id => serialize((SCENARIOS[id] ?? SCENARIOS.landed).make());
/** The nearest deposit of `kind` to the pad, for teleporting to. */
export const depositOf = (s, kind) => terrainData(s.seed).deposits.filter(d => d.kind === kind).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
