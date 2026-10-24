import test from 'node:test';
import assert from 'node:assert/strict';
import { payInFull, createState, placeBlueprint, tick, serialize, deserialize, interact, deconstruct, DAY_DURATION, daylightAt } from './sim.js';
import { count, createInventory, add } from './inventory.js';
import { ensureBuildingState, dockSpace } from './production.js';
import { ensureVat } from './goo.js';
import { BIO, FUELCELL, RTG_POWER, THERMAL, ensurePower, fuelBurning } from './power.js';
import { ELECTROLYSIS } from './space.js';
import { buildingStatus } from './building-status.js';

function build(state, type, x, z) {
  const r = placeBlueprint(state, type, x, z, 0);
  assert.equal(r.ok, true, `${type} at ${x},${z}: ${r.reason}`);
  const b = state.buildings.find(b => b.id === r.id);
  assert.equal(payInFull(state, b), true, `${type}: materials`);
  b.progress = 1; b.built = true; ensurePower(ensureVat(ensureBuildingState(b)));
  return b;
}
const run = (state, seconds, step = 1 / 30) => { for (let t = 0; t < seconds; t += step) tick(state, step); };
const MIDNIGHT = DAY_DURATION * 7 / 12;
function night() {
  const s = createState(); s.inventory = createInventory({ metal: 600, silicon: 600, titanium: 40, rareearth: 10 }); s.player = { ...s.player, x: 30, z: 30 };
  s.time = MIDNIGHT; assert.equal(daylightAt(s.time), 0);
  return s;
}

test('an RTG gives its 2 kW in the dark, and a thermal store is a battery as big as its regolith', () => {
  const s = night(), rtg = build(s, 'rtg', -6, 4), store = build(s, 'thermal', -4, 4);
  tick(s, 0);
  assert.equal(s.power.generation, RTG_POWER);
  assert.equal(s.power.capacity, 0);
  assert.equal(dockSpace(store, 'regolith'), THERMAL.cap); assert.equal(dockSpace(store, 'ice'), 0);
  store.inv.regolith = 10; tick(s, 0);
  assert.equal(s.power.capacity, 10 * THERMAL.perLoad);
  assert.match(buildingStatus(store, s).text, /120 kJ/);
  assert.equal(buildingStatus(rtg, s).tone, 'charge');
  const back = deserialize(serialize(s));
  assert.equal(back.buildings.find(b => b.type === 'thermal').inv.regolith, 10);
});

test('a loaded rover passes a full hopper to pack regolith into a thermal store', () => {
  const s = night();
  const hopper = build(s, 'hopper', -2, 4), store = build(s, 'thermal', -6, 4);
  hopper.inv.regolith = 120;
  const rover = s.robots.find(r => r.kind !== 'hauler');
  Object.assign(rover, { cargo: 4, load: 'regolith', task: 'idle', charge: 1 });
  run(s, 30);
  assert.equal(store.inv.regolith, 4, `rover ${rover.task} with ${rover.cargo}`);
});

test('fuel cells wait for the batteries to run low, then burn propellant at a loss while electrolysers stand down', () => {
  const s = night();
  build(s, 'battery', -6, 4); build(s, 'fuelcell', -3, 4); build(s, 'electrolyser', 0, 4);
  s.buildings.push({ id: 900, type: 'tank', x: 6, z: 4, rotation: 0, progress: 1, built: true, fuel: 40 });
  s.buildings.push({ id: 901, type: 'goovat', x: 9, z: 4, rotation: 0, progress: 1, built: true, seeded: true, stock: 0, work: 0, dark: 0 });
  s.reserves.water = 100;
  tick(s, 0); s.power.stored = 60;
  // Battery first: 5 kW of load drains 60 kJ toward the 18 kJ reserve without touching the tank.
  run(s, 4);
  assert.equal(fuelBurning(s), false); assert.ok(s.buildings.find(b => b.id === 900).fuel >= 40, 'the electrolyser still tops the tank up');
  run(s, 12);
  assert.equal(fuelBurning(s), true);
  assert.equal(s.power.powered, true);
  // With the electrolyser stood down only the vat's 2 kW is left to cover.
  assert.ok(Math.abs(s.power.fuel - 2) < 1e-6, `fuel cell gives ${s.power.fuel} kW`);
  const tank = s.buildings.find(b => b.id === 900), before = tank.fuel;
  run(s, 4);
  assert.ok(Math.abs((before - tank.fuel) - 4 * 2 / FUELCELL.yield) < .05, 'burns a unit per 4 kJ');
  assert.ok(FUELCELL.yield < ELECTROLYSIS.power * ELECTROLYSIS.time, 'propellant returns less than it cost');
  // Dry tanks: the stack stops and the battery is all that is left.
  tank.fuel = .2; run(s, 1);
  assert.equal(fuelBurning(s), false);
  assert.match(buildingStatus(s.buildings.find(b => b.type === 'fuelcell'), s).text, /No propellant/);
});

test('a fed bioreactor gives 12 kW and eats its goo; starved, it breaches', () => {
  const s = night(); s.blueprints = ['containment']; s.research.done.push('containment');
  const bio = build(s, 'bioreactor', -4, 4);
  tick(s, 0); assert.equal(s.power.generation, 0);
  add(s.inventory, 'goo', 2);
  assert.equal(interact(s, bio.id).ok, true);
  assert.equal(count(s.inventory, 'goo'), 0); assert.equal(bio.stock, 2); assert.equal(bio.fed, true);
  tick(s, 0); assert.equal(s.power.generation, BIO.power);
  run(s, BIO.burn + 1, .5); assert.equal(bio.stock, 1);
  const back = deserialize(serialize(s)).buildings.find(b => b.type === 'bioreactor');
  assert.deepEqual([back.fed, back.stock], [true, 1]);
  run(s, BIO.burn, .5); assert.equal(bio.stock, 0);
  tick(s, 0); assert.equal(s.power.generation, 0);
  assert.match(buildingStatus(bio, s).text, /Breach in/);
  run(s, BIO.starveAfter, .5);
  assert.equal(bio.fed, false); assert.equal(s.goo.breaches, 1); assert.ok(s.goo.cells.length >= 4);
  // An unfed reactor is safe to take down and hands back what it held.
  add(s.inventory, 'goo', 3); interact(s, bio.id); bio.fed = false;
  assert.equal(deconstruct(s, bio.id).ok, true); assert.equal(count(s.inventory, 'goo'), 3);
});
