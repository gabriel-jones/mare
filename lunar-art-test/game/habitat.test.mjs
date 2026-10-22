import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, placeBlueprint, construct, deconstruct, validatePlacement, playerObstructs, DEFS } from './sim.js';
import { movePlayer } from './controller.js';
import { computeLayout, habitatLayout, roomAt, sealedRooms, wallBlocks } from './habitat.js';
import { ensureBuildingState } from './production.js';
import { findPath } from './paths.js';

function build(state, type, x, z, rotation = 0) {
  const r = placeBlueprint(state, type, x, z, rotation);
  assert.equal(r.ok, true, `${type} at ${x},${z}: ${r.reason}`);
  const b = state.buildings.find(b => b.id === r.id);
  b.progress = 1; b.built = true; ensureBuildingState(b);
  return b;
}
const walk = (s, dx, dz, steps = 30) => { for (let i = 0; i < steps; i++) movePlayer(s, dx, dz, 0.05, DEFS); };

test('adjacent modules join into one room with no wall between them', () => {
  const s = createState(); s.inventory = { metal: 500, silicon: 500 };
  build(s, 'habitat', 0, 0); build(s, 'habitat', 2, 0);
  const layout = habitatLayout(s.buildings);
  assert.equal(layout.rooms.length, 1);
  assert.equal(layout.rooms[0].cells.length, 8);
  assert.equal(layout.segments.filter(w => w.x === 3).length, 0, 'no wall on the shared grid line');
  assert.equal(layout.airlocks.filter(a => a.exterior).length, 2);
  assert.equal(layout.segments.filter(w => w.kind === 'door').length, 4);
  // Walk from one module straight through into the other.
  s.player = { x: 1, z: 1, y: 0, vx: 0, vz: 0 };
  walk(s, 1, 1);
  assert.ok(s.player.x > 5 && s.player.x < 7, `crossed into the second module (x=${s.player.x.toFixed(2)})`);
  assert.equal(roomAt(layout, s.player.x, s.player.z), layout.rooms[0]);
  assert.ok(wallBlocks(layout, 7, 1, .32), 'the far end wall still stands');
});

test('an airlock facing another module becomes an internal opening, and every room keeps one exterior airlock', () => {
  const s = createState(); s.inventory = { metal: 500, silicon: 500 };
  build(s, 'habitat', 0, 0, 0);
  build(s, 'habitat', 0, 2, 0);
  const layout = habitatLayout(s.buildings), [first, second] = layout.airlocks;
  assert.equal(first.exterior, false);
  assert.equal(second.exterior, true);
  assert.equal(sealedRooms(s.buildings), 0);
  // A module turned to face the room would leave the joined pair with no way in or out.
  const t = createState(); t.inventory = { metal: 500, silicon: 500 };
  build(t, 'habitat', 0, 0, 0);
  assert.match(validatePlacement(t, 'habitat', 0, 2, 2).reason, /airlock/i);
  assert.equal(validatePlacement(t, 'habitat', 0, 2, 0).ok, true);
});

test('structures cannot block the last clear airlock, and the airlock module cannot be dismantled first', () => {
  const s = createState(); s.inventory = { metal: 500, silicon: 500 };
  build(s, 'habitat', 0, 0, 0);
  // The airlock opens onto cells (0,2) and (1,2).
  assert.match(validatePlacement(s, 'lamp', 1, 2).reason, /airlock/i);
  assert.equal(validatePlacement(s, 'conveyor', 1, 2).ok, true, 'belts are walkable and may pass the door');
  assert.equal(validatePlacement(s, 'lamp', 3, 2).ok, true);
  build(s, 'habitat', 0, 2, 0);
  assert.equal(deconstruct(s, s.buildings[0].id).ok, true, 'removing the inner module re-exposes nothing sealed');
  // Here the west module's own door faces a battery, so the east module's airlock is the room's only exit.
  const t = createState(); t.inventory = { metal: 500, silicon: 500 };
  const east = build(t, 'habitat', 2, 0, 0);
  build(t, 'battery', -1, 0);
  const west = build(t, 'habitat', 0, 0, 3);
  assert.equal(computeLayout([east, west]).airlocks.filter(l => l.exterior).length, 2);
  assert.match(deconstruct(t, east.id).reason, /only airlock/);
  assert.equal(deconstruct(t, west.id).ok, true);
});

test('a habitat blueprint cannot be finished with the player standing on its wall line', () => {
  const s = createState(), r = placeBlueprint(s, 'habitat', 0, 0);
  const b = s.buildings.find(b => b.id === r.id);
  s.player = { x: -1, z: 1, y: 0 };
  assert.equal(playerObstructs(s, b), true);
  assert.match(construct(s, b.id, 1).reason, /wall/);
  s.player = { x: 1, z: 1, y: 0 };
  assert.equal(playerObstructs(s, b), false, 'standing in the middle of the room is fine');
  assert.equal(construct(s, b.id, DEFS.habitat.buildTime).ok, true);
  assert.equal(b.built, true);
  // Placement previews use the same rule for solid machines.
  assert.equal(playerObstructs(s, { type: 'battery', x: 4, z: 0, rotation: 0, built: false }), false);
  s.player = { x: 8, z: 1, y: 0 };
  assert.equal(playerObstructs(s, { type: 'battery', x: 4, z: 0, rotation: 0, built: false }), true);
});

test('the rover routes around finished habitats', () => {
  const s = createState(); s.inventory = { metal: 500, silicon: 500 };
  build(s, 'habitat', 0, 0); build(s, 'habitat', 2, 0);
  const path = findPath(s, { x: -2, z: 1 }, { x: 5, z: 1 });
  assert.ok(path, 'a route exists');
  const cells = new Set(['0,0', '1,0', '2,0', '3,0', '0,1', '1,1', '2,1', '3,1']);
  assert.ok(path.every(c => !cells.has(`${c.x},${c.z}`)));
});
