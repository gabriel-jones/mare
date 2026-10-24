import test from 'node:test';
import assert from 'node:assert/strict';
import { payInFull, createState, placeBlueprint, construct, deconstruct, validatePlacement, playerObstructs, removalCheck, DEFS } from './sim.js';
import { movePlayer } from './controller.js';
import { habitatLayout, roomAt, wallBlocks } from './habitat.js';
import { createInventory } from './inventory.js';
import { ensureBuildingState } from './production.js';
import { ensureLifeState } from './life.js';
import { findPath } from './paths.js';

function build(state, type, x, z, rotation = 0) {
  const r = placeBlueprint(state, type, x, z, rotation);
  assert.equal(r.ok, true, `${type} at ${x},${z}: ${r.reason}`);
  const b = state.buildings.find(b => b.id === r.id);
  assert.equal(payInFull(state, b), true, `${type}: materials`);
  b.progress = 1; b.built = true; ensureLifeState(ensureBuildingState(b));
  return b;
}
const colony = () => { const s = createState(); s.inventory = createInventory({ metal: 1000, silicon: 1000 }); s.player = { ...s.player, x: 20, z: 20 }; return s; };
const walk = (s, dx, dz, steps = 30) => { for (let i = 0; i < steps; i++) movePlayer(s, dx, dz, 0.05, DEFS); };
/** A 2x2 habitat, a greenhouse square on its east side and an airlock on its south (+Z) edge. */
function room(s) {
  for (const [x, z] of [[0, 0], [1, 0], [0, 1], [1, 1]]) build(s, 'habitat', x, z);
  build(s, 'greenhouse', 2, 0);
  return build(s, 'airlock', 0, 2, 0);
}

test('painted habitat and greenhouse squares join into one room walled only on the outside', () => {
  const s = colony(); room(s);
  const layout = habitatLayout(s.buildings);
  assert.equal(layout.rooms.length, 1);
  assert.equal(layout.rooms[0].cells.length, 6);
  assert.equal(layout.segments.filter(w => w.x === 3 && w.z <= 1).length, 0, 'no wall between habitat and greenhouse');
  assert.ok(layout.segments.filter(w => w.room === 'greenhouse').every(w => w.kind === 'glass'));
  assert.equal(layout.segments.filter(w => w.kind === 'door').length, 2);
  assert.equal(layout.airlocks.length, 1); assert.equal(layout.airlocks[0].exterior, true);
  // In through the airlock door, then across into the greenhouse until its far glass wall.
  s.player = { x: 0, z: 6, y: 0, vx: 0, vz: 0 };
  walk(s, 1, -1, 40);
  assert.ok(s.player.z < 1, `entered through the airlock (z=${s.player.z.toFixed(2)})`);
  s.player = { x: 0, z: 0, y: 0, vx: 0, vz: 0 };
  walk(s, 1, 1, 40);
  assert.ok(s.player.x > 3 && s.player.x < 5, `crossed into the greenhouse (x=${s.player.x.toFixed(2)})`);
  assert.equal(roomAt(layout, s.player.x, s.player.z), layout.rooms[0]);
  assert.equal(wallBlocks(layout, 0, 5, .32), false, 'the airlock door is open');
  assert.equal(wallBlocks(layout, 1.2, 4, .32), true, 'the airlock side wall blocks');
});

test('airlocks attach to a room, open onto clear ground, and keep their entrance clear', () => {
  const s = colony();
  assert.match(validatePlacement(s, 'airlock', 0, 2, 0).reason, /against/);
  build(s, 'habitat', 0, 0); build(s, 'habitat', 0, 1);
  build(s, 'storage', 2, 0);
  assert.match(validatePlacement(s, 'airlock', 1, 0, 1).reason, /way out/, 'door opening onto a lamp');
  assert.match(validatePlacement(s, 'airlock', 1, 1, 3).reason, /against/, 'arrow pointing back into the room');
  build(s, 'airlock', 0, 2, 0);
  assert.match(validatePlacement(s, 'storage', 0, 3).reason, /airlock/);
  assert.match(validatePlacement(s, 'habitat', 0, 3).reason, /airlock/);
  assert.equal(validatePlacement(s, 'conveyor', 0, 3).ok, true, 'belts are walkable and may pass the door');
});

test('room squares cannot be finished around the player until an airlock gives a way out', () => {
  const s = colony(), r = placeBlueprint(s, 'habitat', 0, 0), b = s.buildings.find(b => b.id === r.id);
  s.player = { x: 0, z: 0, y: 0 };
  assert.equal(playerObstructs(s, b), true);
  assert.match(construct(s, b.id, 1).reason, /shut you in/);
  s.player = { x: 2.6, z: 0, y: 0 };
  assert.equal(playerObstructs(s, b), false);
  assert.equal(construct(s, b.id, DEFS.habitat.buildTime).ok, true);
  const lock = build(s, 'airlock', 0, 1, 0);
  s.player = { x: 0, z: 0, y: 0 };
  assert.match(deconstruct(s, b.id).reason, /airlock attached/);
  assert.match(deconstruct(s, lock.id).reason, /shut inside/);
  s.player = { x: 0, z: 5, y: 0 };
  assert.equal(deconstruct(s, lock.id).ok, true);
  // Placement previews use the same rule for solid machines.
  assert.equal(playerObstructs(s, { type: 'battery', x: 4, z: 0, rotation: 0, built: false }), false);
  s.player = { x: 8, z: 1, y: 0 };
  assert.equal(playerObstructs(s, { type: 'battery', x: 4, z: 0, rotation: 0, built: false }), true);
});

test('interior objects stand on finished floor of the right room type', () => {
  const s = colony(); room(s);
  assert.match(validatePlacement(s, 'growbed', 0, 0).reason, /greenhouse/);
  assert.match(validatePlacement(s, 'galley', 5, 5).reason, /habitat/);
  assert.equal(validatePlacement(s, 'galley', 0, 0).ok, true);
  build(s, 'growbed', 2, 0);
  assert.match(validatePlacement(s, 'growbed', 2, 0).reason, /already/);
  const greenhouse = s.buildings.find(b => b.type === 'greenhouse');
  assert.match(removalCheck(s, greenhouse.id), /grow bed/, 'the dismantle preview refuses without removing anything');
  assert.ok(s.buildings.includes(greenhouse));
  assert.match(deconstruct(s, greenhouse.id).reason, /grow bed/);
  assert.equal(removalCheck(s, s.buildings.find(b => b.type === 'growbed').id), null);
  const floor = placeBlueprint(s, 'habitat', 1, 2), bench = placeBlueprint(s, 'galley', 1, 2);
  s.player = { ...s.player, x: 2, z: 7 };
  assert.match(construct(s, bench.id, 5).reason, /floor/);
  assert.ok(floor.ok);
});

test('the rover routes around finished rooms', () => {
  const s = colony(); room(s);
  const path = findPath(s, { x: -2, z: 1 }, { x: 5, z: 1 });
  assert.ok(path, 'a route exists');
  const cells = new Set(['0,0', '1,0', '0,1', '1,1', '2,0', '0,2']);
  assert.ok(path.every(c => !cells.has(`${c.x},${c.z}`)));
});
