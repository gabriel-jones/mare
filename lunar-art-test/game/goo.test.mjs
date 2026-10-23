import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, placeBlueprint, tick, serialize, deserialize, interact, deconstruct } from './sim.js';
import { count, createInventory, add } from './inventory.js';
import { ensureBuildingState } from './production.js';
import { ensureLifeState } from './life.js';
import { caveLayout } from './caves.js';
import { nestMouth } from './infest.js';
import { FLARE, stepPeril, throwFlare } from './peril.js';
import { lockedReason, studyFinds } from './space.js';
import { buildingStatus } from './building-status.js';
import { GOO, ensureVat, gooAt, sampleAction, stepBrood, takeSample } from './goo.js';

function build(state, type, x, z) {
  const r = placeBlueprint(state, type, x, z, 0);
  assert.equal(r.ok, true, `${type} at ${x},${z}: ${r.reason}`);
  const b = state.buildings.find(b => b.id === r.id);
  b.progress = 1; b.built = true; ensureVat(ensureLifeState(ensureBuildingState(b)));
  return b;
}
const run = (state, seconds, step = 1 / 30) => { for (let t = 0; t < seconds; t += step) tick(state, step); };
/** A powered habitat with a greenhouse beside it, goo containment researched. */
function base() {
  const s = createState(); s.inventory = createInventory({ metal: 600, silicon: 600, titanium: 40 }); s.player = { ...s.player, x: 20, z: 20 };
  for (const x of [-6, -5]) build(s, 'battery', x, 0);
  for (const [x, z] of [[0, 0], [1, 0]]) build(s, 'habitat', x, z);
  build(s, 'greenhouse', 2, 0); build(s, 'airlock', 0, 1, 0);
  s.blueprints = ['containment']; s.research.done.push('containment');
  tick(s, 0); s.power.stored = s.power.capacity;
  return s;
}

test('studying the Heart reveals goo containment, which unlocks the vat', () => {
  const s = createState(); s.inventory = createInventory({ metal: 200, silicon: 100, titanium: 20 });
  assert.match(lockedReason(s, 'goovat'), /study the heart of the deep/);
  s.buildings.push({ id: 900, type: 'xenolab', x: 8, z: 8, rotation: 0, progress: 1, built: true });
  add(s.inventory, 'heart', 1); assert.equal(studyFinds(s, 900).ok, true);
  assert.deepEqual(s.blueprints, ['containment']);
  assert.match(lockedReason(s, 'goovat'), /research Goo containment/);
  s.research.done.push('containment'); assert.equal(lockedReason(s, 'goovat'), null);
});

test('a nest gives one sample until it heals, and scraping it wakes the brood', () => {
  const s = createState(); s.research.done.push('containment');
  let found = null;
  for (const cave of [0, 1, 2]) for (const zone of [0, 1, 2]) { const n = caveLayout(s.seed, cave, zone).nests[0]; if (n && !found) found = { cave, zone, n }; }
  assert.ok(found, 'some cave has a nest');
  const m = nestMouth(found.n);
  Object.assign(s.player, { cave: found.cave, zone: found.zone, x: m.x, z: m.z });
  assert.match(sampleAction(s).verb, /goo sample/);
  const r = takeSample(s);
  assert.equal(r.ok, true); assert.equal(r.wake, found.n.key); assert.equal(count(s.inventory, 'goo'), 1);
  assert.equal(sampleAction(s), null, 'scraped nests need time');
  const back = deserialize(serialize(s));
  assert.deepEqual(back.scraped, s.scraped);
});

test('a powered vat cultures goo; dark too long it breaches, choking growers and hatching crawlers', () => {
  const s = base(), vat = build(s, 'goovat', 0, 0), bed = build(s, 'growbed', 2, 0);
  assert.equal(interact(s, vat.id).ok, false, 'needs a sample');
  add(s.inventory, 'goo', 1); assert.equal(interact(s, vat.id).ok, true); assert.equal(vat.seeded, true);
  const demand = s.power.demand; tick(s, .1); assert.equal(s.power.demand, demand + GOO.power);
  run(s, GOO.grow + .5, .5);
  assert.equal(vat.stock, 1); assert.equal(buildingStatus(vat, s).text, 'Culturing');
  assert.equal(interact(s, vat.id).reason, 'Took 1 black goo.'); assert.equal(count(s.inventory, 'goo'), 1);
  // Power fails: a warning counts down, then it breaches.
  s.power.stored = 0; s.time = 150; tick(s, .1); tick(s, .1);
  assert.match(buildingStatus(vat, s).text, /Breach in/);
  run(s, GOO.breachAfter, .5);
  assert.equal(vat.seeded, false); assert.equal(s.goo.breaches, 1);
  assert.ok(gooAt(s, 0, 0)); assert.equal(s.brood.length, GOO.hatch);
  // It creeps through the base, and a grower under it stops.
  s.goo.cells.push([2, 0]); s.time = 25; s.power.stored = s.power.capacity; tick(s, .1);
  const grow = bed.grow; run(s, 5, .5);
  assert.equal(bed.grow, grow); assert.equal(buildingStatus(bed, s).text, 'Choked by goo');
  const cells = s.goo.cells.length; run(s, GOO.spreadEvery * 3, 1);
  assert.ok(s.goo.cells.length > cells, 'goo spreads'); assert.ok(s.goo.cells.length <= GOO.maxCells);
  assert.ok(s.goo.cells.every(([x, z]) => s.buildings.some(b => b.x === x && b.z === z) || (x === 0 && z === 0)), 'only within the base');
  // Saves keep the vat, the goo and the hatchlings.
  const back = deserialize(serialize(s));
  assert.deepEqual(back.goo.cells, s.goo.cells); assert.equal(back.brood.length, s.brood.length);
  assert.deepEqual(back.buildings.find(b => b.id === vat.id), s.buildings.find(b => b.id === vat.id));
  // Dismantling an unbreached vat hands back its seed and stock.
  add(s.inventory, 'goo', 1); interact(s, vat.id); vat.stock = 3;
  const goo = count(s.inventory, 'goo'); deconstruct(s, vat.id); assert.equal(count(s.inventory, 'goo'), goo + 4);
});

test('on an infested surface flares burn the goo and the hatchlings; hatchlings bite', () => {
  const s = base(), vat = build(s, 'goovat', 0, 0);
  add(s.inventory, 'flare', 4);
  assert.equal(throwFlare(s, { x: 0, z: 0 }).ok, true, 'flares can be thrown anywhere'); s.flares = [];
  add(s.inventory, 'goo', 1); interact(s, vat.id); s.power.stored = 0; s.time = 150;
  run(s, GOO.breachAfter + 1, .5); assert.ok(s.brood.length);
  // A hatchling reaches the player and bites.
  Object.assign(s.player, { x: 0, z: 4, facing: 0, health: 100 });
  let bitten = false;
  for (let t = 0; t < 30 && !bitten; t += 1 / 30) bitten = stepBrood(s, 1 / 30, []).some(e => e.type === 'bite');
  assert.ok(bitten); assert.ok(s.player.health < 100);
  // A flare thrown onto the vat square burns its goo and the hatchlings in its glow.
  for (const c of s.brood) { c.x = 0.3; c.z = 0.2; c.state = 'stalk'; }
  assert.equal(throwFlare(s, { x: 0, z: 0 }).ok, true);
  let killed = 0;
  for (let t = 0; t < 6; t += 1 / 30) {
    stepPeril(s, 1 / 30);
    const fires = s.flares.map(f => ({ x: f.x, z: f.z, r: FLARE.radius })).filter(() => s.flares[0].age > FLARE.release + s.flares[0].flight);
    killed += stepBrood(s, 1 / 30, fires).filter(e => e.type === 'killed').length;
  }
  assert.equal(gooAt(s, 0, 0), false, 'burnt off');
  assert.ok(killed >= 1, 'the brood burns');
});
