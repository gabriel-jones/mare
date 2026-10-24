import test from 'node:test';
import assert from 'node:assert/strict';
import { payInFull, createState, placeBlueprint, tick, serialize, deserialize, grantStarterAndroid, validatePlacement } from './sim.js';
import { createInventory, add, count } from './inventory.js';
import { ensureBuildingState } from './production.js';
import { GALLEY } from './farm.js';
import { STATIONS, ensureLifeState, startCraft } from './life.js';
import { ANDROID, clearShot, repairWreck, setStockTarget, threats } from './android.js';
import { robotRoom, spawnRobot, unlockResearch } from './space.js';
import { ledger } from './storage.js';
import { createCrawler } from './crawler.js';
import { stepBrood } from './goo.js';

function build(state, type, x, z, rotation = 0) {
  const r = placeBlueprint(state, type, x, z, rotation);
  assert.equal(r.ok, true, `${type} at ${x},${z}: ${r.reason}`);
  const b = state.buildings.find(b => b.id === r.id);
  assert.equal(payInFull(state, b), true, `${type}: materials`);
  b.progress = 1; b.built = true; ensureLifeState(ensureBuildingState(b));
  return b;
}
const run = (state, seconds, step = 1 / 20, each = null) => { for (let t = 0; t < seconds; t += step) { each?.(); tick(state, step); } };
/** Charged batteries; a habitat, greenhouse and airlock facing +Z; a crate outside; the player far off; the starter android. */
function colony() {
  const s = createState(); s.inventory = createInventory({ metal: 800, silicon: 800 }); s.player = { ...s.player, x: 40, z: 40 };
  for (const x of [-8, -7, -6]) build(s, 'battery', x, 0);
  for (const [x, z] of [[0, 0], [1, 0]]) build(s, 'habitat', x, z);
  build(s, 'greenhouse', 2, 0);
  build(s, 'airlock', 0, 1, 0);
  const crate = build(s, 'storage', 4, 5);
  tick(s, 0); s.power.stored = s.power.capacity;
  const android = grantStarterAndroid(s);
  return { s, crate, android };
}
const android = s => s.robots.find(r => r.kind === 'android');

test('an android has no shot through a building, only around it', () => {
  const { s } = colony();
  assert.equal(clearShot(s, { x: 1, z: -9 }, { x: 1, z: 9 }), false, 'the habitat is in the way');
  assert.equal(clearShot(s, { x: 1, z: -9 }, { x: 1, z: -3 }), true, 'nothing between');
});

test('every colony gets one test android and its pad, once, and keeps them through a save', () => {
  const { s, android: a } = colony();
  assert.ok(a, 'android granted');
  const pad = s.buildings.find(b => b.type === 'chargepad');
  assert.ok(pad?.built); assert.equal(a.home, pad.id);
  assert.equal(grantStarterAndroid(s), null, 'only once');
  const back = deserialize(serialize(s));
  assert.equal(back.starter, true); assert.equal(grantStarterAndroid(back), null);
  assert.equal(back.robots.filter(r => r.kind === 'android').length, 1);
});

test('an android fetches materials from the crates and builds a blueprint the player left', () => {
  const { s, crate } = colony();
  add(crate.slots, 'metal', 40); add(crate.slots, 'silicon', 20);
  const r = placeBlueprint(s, 'solar', -3, 6); assert.equal(r.ok, true, r.reason);
  run(s, 90);
  const solar = s.buildings.find(b => b.id === r.id);
  assert.equal(solar.built, true, 'built without the player');
  assert.equal(count(crate.slots, 'metal'), 40 - 18); assert.equal(count(crate.slots, 'silicon'), 20 - 8);
  assert.equal(android(s).carry, null, 'nothing left in hand');
});

test('an android walks in through the airlock, harvests a ripe bed (which replants) and stores the crop', () => {
  const { s, crate } = colony();
  const bed = build(s, 'growbed', 2, 0); bed.grow = 1; bed.crop = 'greens';
  run(s, 40);
  assert.equal(count(crate.slots, 'greens'), 3);
  assert.ok(bed.grow < 1, 'replanted and growing again');
  assert.equal(bed.crop, 'greens');
});

test('stock targets: androids queue galley meals from crate stock until the colony holds enough', () => {
  const { s, crate } = colony();
  const galley = build(s, 'galley', 1, 0);
  add(crate.slots, 'crop', 10);
  const meals = count(s.inventory, 'meal');
  assert.equal(setStockTarget(galley, 'meal', 2).ok, true);
  run(s, 30 + GALLEY.time * 3);
  assert.equal(count(crate.slots, 'meal'), 2, 'two meals stored');
  assert.equal(count(crate.slots, 'crop'), 6, 'only what the target needed');
  assert.equal(count(s.inventory, 'meal'), meals, "androids' cooking doesn't land in the pack");
  assert.equal(setStockTarget(galley, 'meal', 0).ok, true); assert.equal(galley.targets, undefined);
  galley.targets = { meal: 4 };
  assert.deepEqual(deserialize(serialize(s)).buildings.find(b => b.id === galley.id).targets, { meal: 4 });
});

test('when hatchlings are loose an android arms itself from the crates, fights, and puts the gun back', () => {
  const { s, crate } = colony();
  add(crate.slots, 'rifle', 1); add(crate.slots, 'rounds', 40);
  const a = android(s);
  const c = createCrawler(a.x + 7, a.z + 7, () => .5); c.hp = 30; s.brood = [c];
  run(s, 40, 1 / 20, () => stepBrood(s, 1 / 20, [], () => .5));
  assert.equal(threats(s).length, 0, 'the hatchling is dead');
  run(s, ANDROID.calm + 20, 1 / 20, () => stepBrood(s, 1 / 20, [], () => .5));
  assert.equal(a.weapon, null, 'gun put away');
  assert.equal(count(crate.slots, 'rifle'), 1);
  assert.ok(count(crate.slots, 'rounds') < 40 && count(crate.slots, 'rounds') > 20, 'spent rounds are gone, the rest returned');
});

test('an armed android on its pad leaves the charger to fight', () => {
  const { s, crate } = colony();
  add(crate.slots, 'rounds', 40);
  const a = android(s);
  Object.assign(a, { weapon: 'rifle', mag: 10, ammo: 20, charge: .6 });
  run(s, 3);
  assert.equal(a.job?.type, 'charge');
  const c = createCrawler(a.x + 7, a.z + 7, () => .5); c.hp = 500; s.brood = [c];
  run(s, .5, 1 / 20, () => stepBrood(s, 1 / 20, [], () => .5));
  assert.equal(a.job?.type, 'fight'); assert.ok(a.shot > 0, 'opened fire');
});

test('a downed android is repaired by another from crate stock, or by the player with E', () => {
  const { s, crate } = colony();
  add(crate.slots, 'metal', 30); add(crate.slots, 'silicon', 10);
  s.research.done.push('roverbay', 'androids');
  const pad = build(s, 'chargepad', 6, 6); assert.ok(pad);
  const helper = spawnRobot(s, 'android', 12, 12), a = android(s);
  Object.assign(a, { down: true, hp: 0 });
  run(s, 60);
  assert.equal(a.down, false, 'back up'); assert.equal(a.hp, ANDROID.hp);
  assert.equal(count(crate.slots, 'metal'), 30 - ANDROID.repairCost.metal);
  assert.equal(helper.kit, false);
  Object.assign(a, { down: true, hp: 0 }); s.player.x = a.x + 1; s.player.z = a.z;
  assert.equal(repairWreck(s).ok, true); assert.equal(a.down, false);
});

test('a researched foundry assembles androids, one per charging pad', () => {
  const { s } = colony();
  assert.match(validatePlacement(s, 'foundry', 7, 1).reason, /Locked/);
  s.research.bank = 200; s.research.done.push('roverbay');
  assert.equal(unlockResearch(s, 'androids').ok, true);
  const foundry = build(s, 'foundry', 7, 1);
  add(s.inventory, 'chip', 4);
  assert.equal(robotRoom(s, 'android'), 0, 'the starter fills the only pad');
  assert.equal(startCraft(s, foundry, 'android').ok, false);
  build(s, 'chargepad', 7, 4);
  assert.equal(startCraft(s, foundry, 'android').ok, true);
  run(s, STATIONS.foundry.time + 1, 1 / 10);
  const made = s.robots.filter(r => r.kind === 'android');
  assert.equal(made.length, 2);
  assert.notEqual(made[0].home, made[1].home, 'each has its own pad');
});

test('what an android carries shows in the ledger and survives a save', () => {
  const { s } = colony();
  const a = android(s);
  Object.assign(a, { carry: { item: 'metal', n: 12 }, weapon: 'smg', mag: 10, ammo: 20, charge: .5 });
  const row = ledger(s).find(r => r.item === 'metal');
  assert.deepEqual(row.robots, [{ id: a.id, kind: 'android', n: 12, to: null }]);
  const back = deserialize(serialize(s)).robots.find(r => r.id === a.id);
  assert.deepEqual([back.carry, back.weapon, back.mag, back.ammo, back.charge], [{ item: 'metal', n: 12 }, 'smg', 10, 20, .5]);
  const bad = JSON.parse(serialize(s)); bad.robots.find(r => r.id === a.id).carry.n = 9999;
  assert.throws(() => deserialize(JSON.stringify(bad)));
});
