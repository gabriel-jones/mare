import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, placeBlueprint, validatePlacement, tick, serialize, deserialize, setMiningArea, DEFS } from './sim.js';
import { ensureBuildingState, miningCells } from './production.js';
import { count, createInventory, add } from './inventory.js';
import { STEPS, SHIP, objective, missionAction, salvage, installCore, processorUnlocked } from './mission.js';
import { createWatcher, stepWatcher } from './watcher.js';
import { missionSite, iceAt, terrainBlocked } from './terrain.js';
import { ports } from './defs.js';

function build(state, type, x, z, rotation = 0) {
  const r = placeBlueprint(state, type, x, z, rotation);
  assert.equal(r.ok, true, `${type} at ${x},${z}: ${r.reason}`);
  const b = state.buildings.find(b => b.id === r.id);
  b.progress = 1; b.built = true; ensureBuildingState(b);
  return b;
}
const run = (s, seconds, step = 1 / 30) => { for (let t = 0; t < seconds; t += step) tick(s, step); };
const at = (s, p) => { s.player.x = p.x; s.player.z = p.z; tick(s, 0); };
const site = missionSite();

test('the ship AI walks a new colony from first power to the crater, and the processor waits for the core', () => {
  const s = createState(); s.inventory = createInventory({ metal: 600, silicon: 400 });
  assert.equal(objective(s).id, 'power');
  assert.match(validatePlacement(s, 'processor', 6, 6).reason, /core is cracked/);
  build(s, 'solar', 6, 2); tick(s, 0);
  assert.equal(objective(s).id, 'shelter');
  s.player = { ...s.player, x: 20, z: 20 };
  build(s, 'habitat', 0, 0); build(s, 'habitat', 0, 1); build(s, 'airlock', 0, 2, 0); build(s, 'hopper', 2, 2); setMiningArea(s, 14, 10); tick(s, 0);
  const crater = objective(s);
  assert.equal(crater.id, 'crater'); assert.deepEqual(crater.target, { x: site.lander.x, z: site.lander.z });
  at(s, { x: site.lander.x - 6, z: site.lander.z - 6 });
  assert.equal(objective(s).id, 'salvage');
  // Too far away to reach the core; then a full pocket refuses it.
  assert.equal(salvage(s, 1).ok, false);
  at(s, { x: site.lander.x + site.lander.radius + 1, z: site.lander.z });
  assert.equal(missionAction(s).hold, true);
  const full = s.inventory.map(x => x); s.inventory = createInventory(); for (let i = 0; i < 10; i++) add(s.inventory, 'crop', 30);
  assert.match(salvage(s, 1).reason, /Free an inventory slot/);
  s.inventory = full;
  for (let t = 0; t < 2.9; t += 0.1) salvage(s, 0.1);
  assert.equal(count(s.inventory, 'core'), 0, 'salvage takes about three seconds');
  assert.equal(salvage(s, 0.2).done, true);
  assert.equal(count(s.inventory, 'core'), 1);
  tick(s, 0); assert.equal(objective(s).id, 'repair');
  assert.equal(installCore(s).ok, false, 'must be at the ship');
  const restored = deserialize(serialize(s));
  assert.deepEqual(restored.mission, s.mission, 'mission progress saves');
  at(s, { x: SHIP.x + 4, z: SHIP.z + 3 });
  assert.equal(missionAction(s).verb, 'Install the processor core');
  assert.equal(installCore(s).ok, true);
  assert.equal(processorUnlocked(s), true); assert.equal(count(s.inventory, 'core'), 0);
  tick(s, 0); assert.equal(objective(s).id, 'refine');
  assert.equal(validatePlacement(s, 'processor', 2, 6).reason, 'Click to place blueprint.');
});

test('the rover digs crater ice into a hopper, and a belted melter fills the water reserve', () => {
  const s = createState(); s.inventory = createInventory({ metal: 1000, silicon: 1000 });
  s.player = { ...s.player, x: 0, z: 30 };
  // Hopper -> belt -> melter on the first flat ground west of the crater.
  let hopper, belt, melter;
  for (let x = 22; x > 8 && !melter; x--) for (let z = -12; z <= 0 && !melter; z++) {
    if (!validatePlacement(s, 'hopper', x, z, 3).ok) continue;
    const port = ports({ type: 'hopper', x, z, rotation: 3 }, 'outputs')[0], cell = port.neighbor;
    if (!validatePlacement(s, 'conveyor', cell.x, cell.z, port.dir).ok) continue;
    const anchor = [-2, -1, 0, 1, 2].flatMap(dx => [-2, -1, 0, 1, 2].map(dz => ({ x: cell.x + dx, z: cell.z + dz })))
      .find(a => { const input = ports({ type: 'melter', ...a, rotation: port.dir }, 'inputs')[0]; return input.neighbor.x === cell.x && input.neighbor.z === cell.z && validatePlacement(s, 'melter', a.x, a.z, port.dir).ok; });
    if (!anchor) continue;
    hopper = build(s, 'hopper', x, z, 3); belt = build(s, 'conveyor', cell.x, cell.z, port.dir); melter = build(s, 'melter', anchor.x, anchor.z, port.dir);
  }
  assert.ok(melter, 'found flat ground for the ice line');
  const solar = [];
  for (let x = 0; x < 30 && solar.length < 3; x += 2) for (let z = -2; z < 12 && solar.length < 3; z += 2) if (validatePlacement(s, 'solar', x, z).ok) solar.push(build(s, 'solar', x, z));
  assert.equal(solar.length, 3);
  s.time = 205; tick(s, 0);
  const centre = { x: Math.round(site.x / 2), z: Math.round(site.z / 2) };
  assert.equal(setMiningArea(s, centre.x, centre.z).ok, true);
  assert.ok(miningCells(s).some(c => c.kind === 'ice'), 'mining area covers ice');
  const water = s.reserves.water;
  s.robots[0].x = hopper.x * 2 - 4; s.robots[0].z = hopper.z * 2;
  run(s, 150);
  assert.ok(melter.inv.ice + s.mission.melted > 0, `ice reached the melter (melter ${melter.inv.ice})`);
  assert.equal(hopper.inv.ice, 0, 'the rover takes ice straight to the melter, never the hopper');
  assert.equal(hopper.inv.regolith, 0, 'only ice was dug');
  assert.ok(s.reserves.water > water, `water rose from ${water} to ${s.reserves.water}`);
  assert.ok(s.mission.melted > 0);
  const restored = deserialize(serialize(s));
  assert.deepEqual(restored.buildings.find(b => b.type === 'melter').inv, melter.inv);
});

test('ice sits in the shadowed middle of the crater and the lander blocks walking', () => {
  assert.equal(iceAt(Math.round(site.x / 2), Math.round(site.z / 2)), true);
  assert.equal(iceAt(0, 0), false);
  assert.equal(terrainBlocked(createState().seed, site.lander.x, site.lander.z), true);
  assert.match(validatePlacement(createState(), 'storage', Math.round(site.lander.x / 2), Math.round(site.lander.z / 2)).reason, /lander|steep|uneven/);
});

test('the watcher only shows on the rim once the crater mission starts, and slips away when approached', () => {
  const s = createState(), w = createWatcher();
  // Standing on the west rim, looking away from the crater.
  s.player = { ...s.player, x: site.x - site.radius - 2, z: site.z, facing: -Math.PI / 2, speed: 0 };
  for (let i = 0; i < 400; i++) stepWatcher(w, s, 0.1, () => 0.5);
  assert.equal(w.figure, null, 'nothing before the crater mission');
  s.mission.step = 3; w.cooldown = 0;
  let r = 0; const random = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 60 && !w.figure; i++) stepWatcher(w, s, 0.1, random);
  assert.ok(w.figure, 'appears');
  const f = w.figure, d = Math.hypot(f.x - s.player.x, f.z - s.player.z);
  assert.ok(d >= 15 && d <= 26, `at a distance (${d.toFixed(1)} m)`);
  s.player.x = f.x - 5; s.player.z = f.z;
  assert.equal(stepWatcher(w, s, 0.1, random), 'vanished');
  for (let i = 0; i < 10; i++) stepWatcher(w, s, 0.1, random);
  assert.equal(w.figure, null);
});

test('colonies saved before the crater mission keep building processors', () => {
  const s = createState(); s.inventory = createInventory({ metal: 500, silicon: 500 });
  const old = JSON.parse(serialize(s)); old.version = 3; delete old.mission;
  const migrated = deserialize(JSON.stringify(old));
  assert.equal(migrated.mission.legacy, true);
  assert.equal(validatePlacement(migrated, 'processor', 6, 3).ok, true);
  assert.match(objective(migrated).message, /./);
  assert.equal(STEPS.length, 8);
  assert.ok(DEFS.melter.inputs.length === 1);
});
