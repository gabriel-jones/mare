import test from 'node:test';
import assert from 'node:assert/strict';
import { payInFull, createState, placeBlueprint, tick, serialize, deserialize, interact, validatePlacement } from './sim.js';
import { ensureBuildingState, FAB, KIT } from './production.js';
import { LAUNCH, TECHS, holdLaunch, loadSatellite, recallShip, selectResearch, shipAction } from './space.js';
import { count, createInventory } from './inventory.js';

function build(state, type, x, z, rotation = 0) {
  const r = placeBlueprint(state, type, x, z, rotation);
  assert.equal(r.ok, true, `${type} at ${x},${z}: ${r.reason}`);
  const b = state.buildings.find(b => b.id === r.id);
  assert.equal(payInFull(state, b), true, `${type}: materials`);
  b.progress = 1; b.built = true; ensureBuildingState(b);
  return b;
}
function run(state, seconds, step = 1 / 30) { for (let t = 0; t < seconds; t += step) tick(state, step); }
function colony() {
  const s = createState();
  s.inventory = createInventory({ metal: 1000, silicon: 1000 });
  for (const [x, z] of [[5, 2], [7, 2], [5, -1]]) build(s, 'solar', x, z);
  for (const x of [6, 7]) build(s, 'battery', x, 5);
  s.time = 205; tick(s, 0); s.power.stored = s.power.capacity;
  return s;
}

test('a fabricator on the kit recipe makes one satellite of parts in turn', () => {
  const s = colony(), fab = build(s, 'fabricator', -4, 1);
  fab.inv = { metal: 20, silicon: 20 };
  run(s, FAB.time * KIT.length + 1);
  assert.deepEqual(fab.out, { frame: 1, wing: 2, chip: 2 });
  assert.deepEqual(fab.inv, { metal: 20 - 4 - 2, silicon: 20 - 6 - 8 });
  assert.equal(interact(s, fab.id).reason, 'Fabricator now makes: Satellite frame.');
});

test('research-locked and pad-side buildings refuse bad placements', () => {
  const s = colony();
  assert.match(validatePlacement(s, 'roverbay', -4, 1).reason, /Locked/);
  assert.match(validatePlacement(s, 'tank', 20, 20).reason, /landing pad/);
  assert.equal(validatePlacement(s, 'tank', 5, -6).ok, true);
});

test('haulers bring parts to the assembler and the finished satellite to the ship', () => {
  const s = colony();
  const crate = build(s, 'storage', -7, 2), asm = build(s, 'assembler', -4, 1), dock = build(s, 'dock', 0, 2);
  crate.slots = createInventory({ frame: 1, wing: 2, chip: 2 }, crate.slots.length);
  assert.equal(interact(s, dock.id).ok, true);
  assert.equal(s.robots.filter(r => r.kind === 'hauler').length, 1);
  run(s, 25);
  assert.equal(crate.slots.filter(Boolean).length, 0, 'parts collected');
  run(s, 60);
  assert.equal(asm.out.satellite + s.ship.payload, 1, 'satellite built');
  run(s, 40);
  assert.equal(s.ship.payload, 1, 'satellite delivered to the ship');
  const restored = deserialize(serialize(s));
  assert.equal(restored.robots.find(r => r.kind === 'hauler').home, dock.id);
});

test('electrolysers fuel the ship through a pad-side tank, then it launches, orbits and returns', () => {
  const s = colony();
  build(s, 'electrolyser', -2, 1); const tank = build(s, 'tank', 5, -6);
  s.reserves.water = 200;
  run(s, 200, 1 / 10);
  assert.ok(s.ship.fuel >= LAUNCH.fuel - 1e-6, `ship fuel ${s.ship.fuel}`);
  assert.ok(tank.fuel > 0 && s.reserves.water < 200);
  s.inventory = createInventory({ satellite: 1 });
  s.player.x = 0; s.player.z = -5;
  assert.equal(shipAction(s).verb, 'Load the satellite aboard');
  assert.equal(loadSatellite(s).ok, true);
  assert.equal(count(s.inventory, 'satellite'), 0);
  assert.equal(shipAction(s).hold, true);
  for (let t = 0; t < LAUNCH.hold + 0.1; t += 0.1) holdLaunch(s, 0.1);
  assert.equal(s.ship.status, 'ascent');
  run(s, LAUNCH.ascent + 0.5, 1 / 10);
  assert.equal(s.ship.status, 'orbit'); assert.equal(s.satellites, 1); assert.equal(s.ship.fuel, 0);
  assert.equal(recallShip(s).ok, true);
  run(s, LAUNCH.descent + 0.5, 1 / 10);
  assert.equal(s.ship.status, 'pad');
});

test('satellites earn research that unlocks the rover bay, which builds more rovers', () => {
  const s = colony();
  s.satellites = 2;
  run(s, TECHS.roverbay.cost / 8 * 60 + 2, 1 / 4);
  assert.deepEqual(s.research.done, ['roverbay']);
  assert.equal(selectResearch(s, 'roverbay').ok, false);
  const bay = build(s, 'roverbay', -4, 1);
  assert.equal(interact(s, bay.id).ok, true);
  assert.equal(s.robots.filter(r => r.kind === 'miner').length, 2);
  const restored = deserialize(serialize(s));
  assert.deepEqual(restored.research, s.research);
  assert.equal(restored.satellites, 2);
});
