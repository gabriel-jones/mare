import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, placeBlueprint, tick, serialize, deserialize, deconstruct, validatePlacement, interact, DEFS } from './sim.js';
import { count, createInventory } from './inventory.js';
import { BASE_REACH, CRATE_SLOTS, baseCount, inReach, ledger, storeAll, storeSlot, takeSlot } from './storage.js';
import { craftFlares } from './peril.js';
import { ensureBuildingState } from './production.js';

function build(state, type, x, z, rotation = 0) {
  const r = placeBlueprint(state, type, x, z, rotation);
  assert.equal(r.ok, true, `${type} at ${x},${z}: ${r.reason}`);
  const b = state.buildings.find(b => b.id === r.id);
  b.progress = 1; b.built = true; ensureBuildingState(b);
  return b;
}
const base = () => { const s = createState(); s.inventory = createInventory({ metal: 100, silicon: 40, pistol: 1, rounds: 24, meal: 3 }); s.player.x = 0; s.player.z = 0; return s; };

test('crates have slots, take any item, and open a transfer panel', () => {
  const s = base(), crate = build(s, 'storage', 0, 2);
  assert.equal(crate.slots.length, CRATE_SLOTS);
  assert.equal(interact(s, crate.id).open, 'crate');
  const metal = count(s.inventory, 'metal'), slot = s.inventory.findIndex(x => x?.item === 'metal');
  assert.equal(storeSlot(s, slot, crate, 30).moved, 30);
  assert.equal(count(s.inventory, 'metal'), metal - 30); assert.equal(count(crate.slots, 'metal'), 30);
  const back = crate.slots.findIndex(x => x?.item === 'metal');
  assert.equal(takeSlot(s, crate, back).moved, 30); assert.equal(count(crate.slots, 'metal'), 0);
  const r = storeAll(s, crate);
  assert.equal(r.ok, true);
  assert.equal(count(s.inventory, 'pistol') + count(s.inventory, 'rounds') + count(s.inventory, 'meal'), 1 + 24 + 3, 'weapons, ammo and food stay carried');
  assert.equal(count(s.inventory, 'metal') + count(s.inventory, 'silicon'), 0);
  assert.equal(baseCount(s, 'metal'), metal);
});

test('building and crafting draw on pockets first, then the base stock while at the base', () => {
  const s = base(), crate = build(s, 'storage', 0, 2);
  storeAll(s, crate);
  assert.equal(count(s.inventory, 'metal'), 0);
  assert.equal(validatePlacement(s, 'solar', 3, 3).ok, true, 'paid from storage');
  const before = baseCount(s, 'metal');
  build(s, 'solar', 3, 3);
  assert.equal(baseCount(s, 'metal'), before - DEFS.solar.cost.metal);
  assert.equal(craftFlares(s).ok, true); assert.equal(count(s.inventory, 'flare'), 3);
  s.player.x = BASE_REACH + 10;
  assert.equal(inReach(s), false);
  assert.match(validatePlacement(s, 'solar', 20, 0).reason, /Not enough metal/);
});

test('refunds overflow into storage, and dismantling a crate moves its goods into the others', () => {
  const s = base(), a = build(s, 'storage', 0, 2), b = build(s, 'storage', 2, 2);
  a.slots = createInventory({ titanium: 30, metal: 50, ice: 20 }, CRATE_SLOTS);
  assert.equal(deconstruct(s, a.id).ok, true);
  assert.equal(count(b.slots, 'titanium'), 30); assert.equal(count(b.slots, 'ice'), 20); assert.equal(count(b.slots, 'metal'), 50);
  s.inventory = createInventory({ silicon: 2000 });
  const spare = build(s, 'storage', 4, 4);
  assert.equal(count(b.slots, 'metal'), 40, 'paid from storage with empty pockets');
  assert.equal(deconstruct(s, spare.id).ok, true, 'refund lands in the remaining crate');
  assert.equal(count(b.slots, 'metal'), 50);
});

test('the ledger says where each item is: crates, pockets, machines, belts and robots', () => {
  const s = base(), crate = build(s, 'storage', 0, 2);
  crate.slots = createInventory({ metal: 12, frame: 2 }, CRATE_SLOTS);
  s.robots.push({ id: 9, kind: 'hauler', cargo: 4, load: 'frame', job: { to: 'ship' }, x: 0, z: 0 });
  const rows = Object.fromEntries(ledger(s).map(r => [r.item, r]));
  assert.equal(rows.metal.stored, 12); assert.equal(rows.metal.crates[0].tag, 'CRT-01');
  assert.equal(rows.metal.pockets, count(s.inventory, 'metal'));
  assert.equal(rows.frame.total, 6); assert.deepEqual(rows.frame.robots[0], { id: 9, kind: 'hauler', n: 4, to: 'Starship' });
});

test('old loose-unit crates become slots and round-trip through a save', () => {
  const s = base(), crate = build(s, 'storage', 0, 2);
  crate.slots = createInventory({ metal: 40, wing: 3 }, CRATE_SLOTS);
  assert.deepEqual(deserialize(serialize(s)).buildings.find(b => b.id === crate.id).slots, crate.slots);
  const old = JSON.parse(serialize(s)), raw = old.buildings.find(b => b.id === crate.id);
  delete raw.slots; raw.inv = { regolith: 5, metal: 30, silicon: 9, ice: 0, frame: 0, wing: 2, chip: 0, satellite: 0 };
  const slots = deserialize(JSON.stringify(old)).buildings.find(b => b.id === crate.id).slots;
  assert.equal(count(slots, 'metal'), 30); assert.equal(count(slots, 'regolith'), 5); assert.equal(count(slots, 'wing'), 2);
  tick(s, 1);
});
