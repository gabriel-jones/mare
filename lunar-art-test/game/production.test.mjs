import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, placeBlueprint, tick, serialize, deserialize, deconstruct, collectStorage, setMiningArea, validatePlacement, DEFS } from './sim.js';
import { ports } from './defs.js';
import { ensureBuildingState, miningCells, remainingRegolith, ROVER, RECIPE, REGOLITH_PER_CELL, BELT_SPACING } from './production.js';
import { findPath } from './paths.js';

function build(state, type, x, z, rotation = 0) {
  const r = placeBlueprint(state, type, x, z, rotation);
  assert.equal(r.ok, true, `${type} at ${x},${z}: ${r.reason}`);
  const b = state.buildings.find(b => b.id === r.id);
  b.progress = 1; b.built = true; ensureBuildingState(b);
  return b;
}
function run(state, seconds, step = 1 / 30) { for (let t = 0; t < seconds; t += step) tick(state, step); }
/** Hopper -> belt -> processor -> belt -> crate, plus daytime power. */
function factory(seed = 1847) {
  const s = createState(seed);
  s.inventory = { metal: 1000, silicon: 1000 };
  const hopper = build(s, 'hopper', 2, 2);
  build(s, 'conveyor', 2, 4); build(s, 'conveyor', 2, 5);
  const processor = build(s, 'processor', 2, 6);
  build(s, 'conveyor', 2, 9);
  const crate = build(s, 'storage', 2, 10);
  for (const [x, z] of [[5, 2], [7, 2], [5, -1]]) build(s, 'solar', x, z);
  for (const x of [6, 7]) build(s, 'battery', x, 5);
  s.time = 205; tick(s, 0); s.power.stored = s.power.capacity;
  return { s, hopper, processor, crate };
}

test('machine ports rotate with their footprint and point outward', () => {
  const hopper = r => ({ type: 'hopper', x: 0, z: 0, rotation: r });
  assert.deepEqual(ports(hopper(0), 'outputs')[0], { cell: { x: 0, z: 1 }, dir: 0, neighbor: { x: 0, z: 2 } });
  assert.deepEqual(ports(hopper(1), 'outputs')[0], { cell: { x: 1, z: 1 }, dir: 1, neighbor: { x: 2, z: 1 } });
  assert.deepEqual(ports(hopper(2), 'outputs')[0], { cell: { x: 1, z: 0 }, dir: 2, neighbor: { x: 1, z: -1 } });
  assert.deepEqual(ports(hopper(3), 'outputs')[0], { cell: { x: 0, z: 0 }, dir: 3, neighbor: { x: -1, z: 0 } });
  const processor = { type: 'processor', x: 0, z: 0, rotation: 1 };
  assert.deepEqual(ports(processor, 'inputs')[0], { cell: { x: 0, z: 1 }, dir: 3, neighbor: { x: -1, z: 1 } });
  assert.deepEqual(ports(processor, 'outputs')[0], { cell: { x: 2, z: 1 }, dir: 1, neighbor: { x: 3, z: 1 } });
  assert.equal(ports({ type: 'storage', x: 4, z: 4, rotation: 0 }, 'inputs').length, 4);
});

test('belts keep item spacing, chain forward and refuse a belt pointing back', () => {
  const s = createState(); s.inventory.metal = 100;
  const a = build(s, 'conveyor', 0, 2, 1), b = build(s, 'conveyor', 1, 2, 1), back = build(s, 'conveyor', 2, 2, 3);
  a.items.push({ type: 'metal', p: 0 }, { type: 'silicon', p: 0 });
  assert.equal(validatePlacement(s, 'conveyor', 0, 2, 0).ok, false);
  run(s, 0.4);
  assert.equal(a.items.length + b.items.length, 2);
  for (const belt of [a, b]) for (let i = 1; i < belt.items.length; i++) assert.ok(belt.items[i - 1].p - belt.items[i].p >= BELT_SPACING - 1e-9);
  run(s, 3);
  assert.equal(back.items.length, 0, 'opposing belt receives nothing');
  assert.equal(b.items.length, 2, 'items queue at the blocked end');
  assert.equal(b.items[0].p, 1);
  // Turn the blocking belt so the line continues.
  deconstruct(s, back.id); const out = build(s, 'conveyor', 2, 2, 0);
  run(s, 2);
  assert.equal(b.items.length, 0); assert.ok(out.items.length >= 1);
});

test('a belt feeds a machine only through a designated input port', () => {
  const s = createState(); s.inventory = { metal: 500, silicon: 500 };
  const processor = build(s, 'processor', 2, 6);
  const side = build(s, 'conveyor', 4, 6, 3); side.items.push({ type: 'regolith', p: 0.9 });
  const port = build(s, 'conveyor', 2, 5, 0); port.items.push({ type: 'regolith', p: 0.9 });
  const wrongItem = build(s, 'conveyor', 3, 5, 0); wrongItem.items.push({ type: 'metal', p: 0.9 });
  run(s, 0.5);
  assert.equal(processor.inv.regolith, 1);
  assert.equal(side.items.length, 1, 'machine walls are not inputs');
  assert.equal(wrongItem.items.length, 1);
});

test('rover routes around solid machines rather than through them', () => {
  const s = createState(); s.inventory = { metal: 999, silicon: 999 };
  for (let z = 0; z <= 6; z += 2) build(s, 'battery', 0, z);
  const path = findPath(s, { x: -2, z: 3 }, { x: 2, z: 3 });
  assert.ok(path && path.length > 5);
  const solid = new Set(s.buildings.flatMap(b => [`${b.x},${b.z}`, `${b.x},${b.z + 1}`]));
  assert.ok(path.every(c => !solid.has(`${c.x},${c.z}`)));
  for (let i = 1; i < path.length; i++) assert.ok(Math.abs(path[i].x - path[i - 1].x) <= 1 && Math.abs(path[i].z - path[i - 1].z) <= 1);
});

test('mined regolith flows from the rover through the processor into a crate', () => {
  const { s, hopper, processor, crate } = factory();
  assert.equal(s.robots.length, 1);
  assert.equal(setMiningArea(s, -5, 5).ok, true);
  const before = remainingRegolith(s);
  run(s, 110);
  assert.ok(remainingRegolith(s) < before - 40, 'mining depletes the designated area');
  assert.ok(crate.inv.metal >= 10, `crate metal ${crate.inv.metal}`);
  assert.ok(crate.inv.silicon >= 5, `crate silicon ${crate.inv.silicon}`);
  assert.ok(Math.abs(crate.inv.metal - 2 * crate.inv.silicon) <= 4, 'products keep the recipe ratio');
  assert.ok(s.reserves.oxygen >= 5);
  const inventory = { ...s.inventory }, result = collectStorage(s, crate.id);
  assert.equal(result.ok, true);
  assert.equal(s.inventory.metal, inventory.metal + result.metal);
  assert.equal(crate.inv.metal + crate.inv.silicon, 0);
  assert.equal(collectStorage(s, crate.id).ok, false);
  assert.ok(hopper.inv.regolith <= DEFS.hopper.capacity && processor.inv.regolith <= 16);
});

test('processors stop without power and report demand only while ready', () => {
  const s = createState(); s.inventory = { metal: 500, silicon: 500 };
  const p = build(s, 'processor', 2, 6);
  tick(s, 0); assert.equal(s.power.demand, 0);
  p.inv.regolith = 8; tick(s, 0);
  assert.equal(s.power.demand, RECIPE.power); assert.equal(s.power.powered, false);
  run(s, 10);
  assert.equal(p.out.metal, 0, 'no output without electricity');
  assert.ok(p.work < 0.02);
});

test('rover waits at a full hopper without losing cargo, and parks when the area is exhausted', () => {
  const s = createState(); s.inventory = { metal: 500, silicon: 500 };
  const hopper = build(s, 'hopper', 2, 2); hopper.inv.regolith = DEFS.hopper.capacity;
  build(s, 'solar', 6, 2); s.time = 210;
  setMiningArea(s, -5, 5);
  run(s, 40);
  const r = s.robots[0];
  assert.equal(r.task, 'docked'); assert.ok(r.cargo > ROVER.capacity - 1);
  assert.equal(hopper.inv.regolith, DEFS.hopper.capacity);
  // Exhaust everything but one unit of the area.
  for (const c of miningCells(s)) s.mined[`${c.x},${c.z}`] = REGOLITH_PER_CELL;
  hopper.inv.regolith = 0; run(s, 5);
  assert.equal(r.cargo < 1, true);
  run(s, 5);
  assert.equal(r.task, 'docked', 'rover stays docked when nothing remains');
});

test('an unreachable mining cell is skipped instead of stalling the rover', () => {
  const s = createState(); s.inventory = { metal: 500, silicon: 500 };
  build(s, 'hopper', 2, 2);
  // Wall off the area corner nearest the rover; diagonal moves cannot squeeze past blocked corners.
  for (const [x, z] of [[-1, 2], [-3, 2], [-2, 1], [-2, 3]]) build(s, 'lamp', x, z);
  setMiningArea(s, -5, 5);
  run(s, 30);
  assert.equal(s.mined['-2,2'], undefined, 'enclosed cell is never mined');
  const mined = Object.values(s.mined).reduce((a, n) => a + n, 0);
  assert.ok(mined >= 15, `rover kept working elsewhere (${mined})`);
});

test('production saves round-trip exactly and version 1 colonies gain the starter rover', () => {
  const { s } = factory(42);
  setMiningArea(s, -5, 5); run(s, 30);
  const restored = deserialize(serialize(s));
  assert.deepEqual(restored, s);
  run(restored, 5); run(s, 5);
  assert.deepEqual(restored.robots[0].x, s.robots[0].x, 'restored rover replans to the same route');
  const legacy = JSON.parse(serialize(createState(7)));
  legacy.version = 1; delete legacy.robots; delete legacy.reserves; delete legacy.miningArea; delete legacy.mined;
  legacy.buildings = [{ id: 1, type: 'hopper', x: 2, z: 2, rotation: 1, progress: 1, built: true }]; legacy.nextId = 2;
  const migrated = deserialize(JSON.stringify(legacy));
  assert.equal(migrated.version, 2); assert.equal(migrated.robots.length, 1);
  assert.deepEqual(migrated.buildings[0].inv, { regolith: 0 });
  const corrupt = JSON.parse(serialize(s));
  corrupt.buildings.find(b => b.type === 'conveyor').items = [{ type: 'gold', p: 0.2 }];
  assert.throws(() => deserialize(JSON.stringify(corrupt)), /belt/);
  const overfull = JSON.parse(serialize(s)); overfull.robots[0].cargo = 999;
  assert.throws(() => deserialize(JSON.stringify(overfull)), /robot/);
});

test('dismantling refunds the structure and any refined contents', () => {
  const s = createState(); s.inventory = { metal: 100, silicon: 100 };
  const crate = build(s, 'storage', 0, 2); crate.inv.metal = 7; crate.inv.regolith = 5;
  assert.equal(s.inventory.metal, 90);
  assert.equal(deconstruct(s, crate.id).ok, true);
  assert.equal(s.inventory.metal, 107); assert.equal(s.buildings.length, 0);
});
