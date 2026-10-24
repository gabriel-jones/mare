import test from 'node:test';
import assert from 'node:assert/strict';
import { payInFull, createState, placeBlueprint, tick, serialize, deserialize, deconstruct, collectStorage, interact, DEFS } from './sim.js';
import { movePlayer, RUN_SPEED } from './controller.js';
import { count, createInventory, add, room as space } from './inventory.js';
import { ensureBuildingState } from './production.js';
import { LIFE, ensureLifeState, eat, hunger, lifeAction, roomStatus, setCrop, setRecipe } from './life.js';
import { BUFFS, CROPS, GALLEY, MILL, RECIPES as DISHES, recipeKnown } from './farm.js';
import { TECHS, selectResearch } from './space.js';
import { buildingStatus } from './building-status.js';

function build(state, type, x, z, rotation = 0) {
  const r = placeBlueprint(state, type, x, z, rotation);
  assert.equal(r.ok, true, `${type} at ${x},${z}: ${r.reason}`);
  const b = state.buildings.find(b => b.id === r.id);
  assert.equal(payInFull(state, b), true, `${type}: materials`);
  b.progress = 1; b.built = true; ensureLifeState(ensureBuildingState(b));
  return b;
}
function run(state, seconds, step = 1 / 30) { for (let t = 0; t < seconds; t += step) tick(state, step); }
/** Charged batteries, a habitat with an airlock, and a greenhouse square beside it. */
function base() {
  const s = createState(); s.inventory = createInventory({ metal: 600, silicon: 600 }); s.player = { ...s.player, x: 20, z: 20 };
  for (const x of [-6, -5]) build(s, 'battery', x, 0);
  for (const [x, z] of [[0, 0], [1, 0]]) build(s, 'habitat', x, z);
  build(s, 'greenhouse', 2, 0);
  build(s, 'airlock', 0, 1, 0);
  tick(s, 0); s.power.stored = s.power.capacity;
  return s;
}

test('rooms fill from oxygen reserves and pressurise only with power and a clear airlock', () => {
  const s = base(), oxygen = s.reserves.oxygen;
  tick(s, 0.1);
  assert.equal(s.reserves.oxygen, oxygen - 4, 'one unit per square');
  assert.equal(roomStatus(s).at(0, 0).pressurised, true);
  assert.equal(s.power.demand, 3 * DEFS.habitat.power + DEFS.airlock.power);
  // Without power the room loses pressure; a lamp blocking the only exit does the same.
  s.power.stored = 0; s.time = 150; tick(s, 0.1); tick(s, 0.1);
  assert.equal(roomStatus(s).at(0, 0).reason, 'No power');
  const sealed = base(); sealed.buildings.push({ id: 99, type: 'storage', x: 0, z: 2, rotation: 0, progress: 1, built: true }); tick(sealed, 0.1);
  assert.equal(roomStatus(sealed).at(2, 0).reason, 'No airlock');
  const starved = base(); starved.reserves.oxygen = 2; tick(starved, 0.1);
  assert.equal(roomStatus(starved).at(0, 0).reason, 'Needs oxygen');
  assert.equal(buildingStatus(starved.buildings.find(b => b.type === 'greenhouse'), starved).text, 'Needs oxygen');
});

test('a grow bed uses water and power to ripen potatoes that the player harvests, or greens instead', () => {
  const s = base(), bed = build(s, 'growbed', 2, 0), water = s.reserves.water;
  assert.equal(bed.crop, 'crop');
  run(s, 1);
  assert.equal(s.reserves.water, water - CROPS.crop.water);
  assert.match(buildingStatus(bed, s).text, /Growing/);
  run(s, CROPS.crop.time);
  assert.equal(bed.grow, 1); assert.equal(buildingStatus(bed, s).text, 'Ripe');
  assert.equal(s.reserves.water, water - CROPS.crop.water, 'one cycle drinks once');
  assert.equal(interact(s, bed.id).ok, true);
  assert.equal(count(s.inventory, 'crop'), CROPS.crop.yield); assert.equal(bed.grow, 0);
  // Unripe, E plants the other crop the bed can grow.
  assert.equal(lifeAction(s, bed).verb, 'Plant greens instead');
  assert.equal(interact(s, bed.id).ok, true); assert.equal(bed.crop, 'greens');
  run(s, CROPS.greens.time + 1); assert.equal(interact(s, bed.id).ok, true);
  assert.equal(count(s.inventory, 'greens'), CROPS.greens.yield);
  // Nothing grows without water or outside a pressurised room.
  s.reserves.water = 0; run(s, 5); assert.equal(bed.grow, 0);
  assert.equal(buildingStatus(bed, s).text, 'Needs water');
});

test('research is a tree; farm machines and crops wait for theirs', () => {
  const s = base();
  assert.match(selectResearch(s, 'soy').reason, /Hydroponics first/);
  assert.match(placeBlueprint(s, 'hydrorack', 2, 0).reason, /research Hydroponics/);
  s.research.done.push('hydroponics');
  assert.equal(selectResearch(s, 'soy').ok, true);
  const rack = build(s, 'hydrorack', 2, 0);
  assert.equal(rack.crop, 'soy', 'a rack defaults to its first crop');
  assert.equal(lifeAction(s, rack), null, 'with none researched it has nothing to switch to');
  s.research.done.push('tomato', 'algae');
  assert.equal(interact(s, rack.id).reason, 'Planted tomatoes.');
  assert.equal(interact(s, rack.id).reason, 'Planted algae.');
  // Algae drinks hard but needs no power.
  const demand = s.power.demand; run(s, .1); assert.equal(s.power.demand, demand);
  assert.equal(Object.keys(TECHS).filter(id => TECHS[id].branch === 'farming').length, 9);
  for (const t of Object.values(TECHS)) for (const r of t.requires ?? []) assert.ok(TECHS[r], `${t.name} needs a real tech`);
});

test('the galley cooks recipes, the mill grinds, and meals give effects that run together', () => {
  const s = base(), galley = build(s, 'galley', 1, 0), recycler = build(s, 'recycler', 0, 0);
  s.research.done.push('hydroponics', 'soy', 'processing');
  build(s, 'habitat', 0, -1); const mill = build(s, 'mill', 0, -1);
  add(s.inventory, 'crop', 3);
  assert.equal(lifeAction(s, galley).verb, 'Cook hash browns');
  assert.equal(interact(s, galley.id).ok, true);
  assert.equal(count(s.inventory, 'crop'), 1);
  assert.match(interact(s, galley.id).reason, /2 potatoes make hash browns/);
  const water = s.reserves.water;
  run(s, GALLEY.time + 0.2);
  assert.deepEqual(galley.ready, { meal: 1 }); assert.equal(buildingStatus(galley, s).text, 'Hash browns ready');
  const meals = count(s.inventory, 'meal');
  assert.equal(interact(s, galley.id).ok, true);
  assert.equal(count(s.inventory, 'meal'), meals + 1);
  run(s, LIFE.recycleTime);
  assert.equal(s.reserves.water, water + 1);
  assert.equal(buildingStatus(recycler, s).text, 'Recycling');
  // The mill turns soybeans into protein; soy stew gives stamina.
  add(s.inventory, 'soy', 2);
  assert.equal(interact(s, mill.id).reason, 'Loaded 2 soybeans.');
  run(s, MILL.time * 2 + .2);
  assert.equal(interact(s, mill.id).ok, true); assert.equal(count(s.inventory, 'protein'), 2);
  assert.equal(lifeAction(s, galley).verb, 'Cook soy stew', 'auto picks the best it can make');
  interact(s, galley.id); run(s, GALLEY.time + .2); interact(s, galley.id);
  // Eating stacks effects: each keeps its own clock, and the same one again adds time.
  s.player.satiety = 100;
  const stew = s.inventory.findIndex(slot => slot?.item === 'stew');
  assert.match(eat(s, stew).reason, /Vigour/, 'a meal with an effect can be eaten full');
  add(s.inventory, 'salad', 1); add(s.inventory, 'stew', 1);
  eat(s, s.inventory.findIndex(slot => slot?.item === 'salad')); eat(s, s.inventory.findIndex(slot => slot?.item === 'stew'));
  assert.deepEqual(s.player.buffs, { stamina: 600, regen: 300 });
  s.player.satiety = 50; run(s, 60, 1);
  assert.ok(Math.abs(s.player.satiety - (50 - LIFE.satietyDrain * 60)) < 1e-6, 'no calm, normal drain');
  add(s.inventory, 'bread', 1); eat(s, s.inventory.findIndex(slot => slot?.item === 'bread'));
  const fed = s.player.satiety; run(s, 60, 1);
  assert.ok(Math.abs(fed - s.player.satiety - LIFE.satietyDrain * 60 * BUFFS.calm.drain) < 1e-6, 'bread halves hunger');
  s.player.x = 20; s.player.z = 20; s.player.health = 40; s.player.speed = 0;
  for (let i = 0; i < 20; i++) movePlayer(s, 0, -1, 0.05, DEFS);
  assert.ok(Math.abs(s.player.speed - RUN_SPEED * BUFFS.stamina.speed) < 1e-6, 'stew quickens the step');
  // Medkits: only chosen, only once Field medicine is known, and they mend the suit.
  galley.recipe = 'medkit'; add(s.inventory, 'tomato', 2);
  assert.equal(lifeAction(s, galley), null);
  s.research.done.push('medicine');
  assert.equal(lifeAction(s, galley).verb, 'Cook medkit');
  interact(s, galley.id); run(s, GALLEY.time + .2); interact(s, galley.id);
  assert.equal(eat(s, s.inventory.findIndex(slot => slot?.item === 'medkit')).ok, true);
  assert.ok(s.player.health >= 90);
  // Dismantling hands back what is inside.
  add(s.inventory, 'wheat', 1); interact(s, mill.id);
  const wheat = count(s.inventory, 'wheat');
  assert.equal(deconstruct(s, mill.id).ok, true); assert.equal(count(s.inventory, 'wheat'), wheat + 1);
  const back = deserialize(serialize(s));
  assert.deepEqual(back.player.buffs, s.player.buffs); assert.deepEqual(back.buildings, s.buildings);
});

test('pickers replant growers and set the galley dish, offering only what research makes possible', () => {
  const s = base(), bed = build(s, 'growbed', 2, 0), galley = build(s, 'galley', 1, 0);
  assert.equal(setCrop(s, bed, 'soy').ok, false, 'a bed cannot grow rack crops');
  run(s, 10); assert.ok(bed.grow > 0);
  assert.equal(setCrop(s, bed, 'greens').reason, 'Planted greens.'); assert.equal(bed.grow, 0);
  bed.grow = 1; assert.match(setCrop(s, bed, 'crop').reason, /Harvest the greens first/);
  const known = () => Object.keys(DISHES).filter(id => recipeKnown(s, id));
  assert.deepEqual(known(), ['meal'], 'salad waits for tomatoes, bread for the mill');
  assert.equal(setRecipe(s, galley, 'bread').ok, false);
  s.research.done.push('hydroponics', 'tomato', 'medicine');
  assert.deepEqual(known(), ['meal', 'salad', 'medkit']);
  assert.equal(setRecipe(s, galley, 'medkit').ok, true); assert.equal(galley.recipe, 'medkit');
  assert.equal(setRecipe(s, galley, null).ok, true); assert.equal(galley.recipe, null);
});

test('a galley from before recipes keeps its potatoes and meals', () => {
  const s = base(), galley = build(s, 'galley', 1, 0);
  const raw = JSON.parse(serialize(s)), g = raw.buildings.find(b => b.type === 'galley');
  delete g.queue; delete g.ready; delete g.recipe; Object.assign(g, { crops: 4, meals: 2 });
  const back = deserialize(JSON.stringify(raw)).buildings.find(b => b.type === 'galley');
  assert.deepEqual([back.queue, back.ready, back.recipe], [['meal', 'meal'], { meal: 2 }, null]);
  assert.ok(galley);
});

test('hunger drains over ten minutes, slows the player, and eating restores it', () => {
  const s = createState(); s.player = { x: 0, z: 0, y: 0, satiety: 100 };
  run(s, 300, 1);
  assert.ok(Math.abs(s.player.satiety - 50) < 1e-9);
  run(s, 400, 1); assert.equal(s.player.satiety, 0);
  assert.deepEqual(hunger(0), { speed: 0.65, build: 0.5, label: 'Starving' });
  assert.equal(hunger(30).label, 'Hungry'); assert.equal(hunger(80).label, null);
  for (let i = 0; i < 20; i++) movePlayer(s, 0, -1, 0.05, DEFS);
  assert.ok(Math.abs(s.player.speed - RUN_SPEED * 0.65) < 1e-6);
  const mealSlot = s.inventory.findIndex(slot => slot?.item === 'meal');
  assert.equal(eat(s, mealSlot).ok, true); assert.equal(s.player.satiety, 40);
  add(s.inventory, 'crop', 1);
  assert.equal(eat(s, s.inventory.findIndex(slot => slot?.item === 'crop')).ok, true); assert.equal(s.player.satiety, 55);
  assert.match(eat(s, 0).reason, /edible/);
  assert.match(eat(s, 9).reason, /empty/);
  s.player.satiety = 100; assert.match(eat(s, mealSlot).reason, /full/);
});

test('ten slots stack items, and full pockets refuse refunds and leave goods in crates', () => {
  const s = createState(); s.inventory = createInventory({ metal: 1800, silicon: 200 });
  assert.equal(s.inventory.length, 10); assert.equal(space(s.inventory, 'metal'), 0);
  assert.equal(add(s.inventory, 'meal', 2), 2, 'nothing fits');
  s.player = { ...s.player, x: 0, z: 0 };
  const crate = build(s, 'storage', 0, 2);
  crate.slots = createInventory({ metal: 30 }, crate.slots.length);
  const result = collectStorage(s, crate.id);
  assert.equal(result.taken.metal, 10); assert.equal(count(crate.slots, 'metal'), 20);
  assert.match(deconstruct(s, crate.id).reason, /Nowhere to put/);
});

test('saves keep life support, and version 2 habitat modules become painted squares with an airlock', () => {
  const s = base(); build(s, 'growbed', 2, 0); run(s, 3); s.player.satiety = 61.5;
  assert.deepEqual(deserialize(serialize(s)), s);
  const bad = JSON.parse(serialize(s)); bad.buildings.find(b => b.type === 'growbed').grow = 4;
  assert.throws(() => deserialize(JSON.stringify(bad)), /grow bed/);
  const legacy = JSON.parse(serialize(createState(7)));
  Object.assign(legacy, { version: 2, inventory: { metal: 140, silicon: 30 }, reserves: { oxygen: 5 }, nextId: 4 });
  legacy.player = { x: 0, z: 8, y: 0 };
  legacy.buildings = [
    { id: 1, type: 'habitat', x: 5, z: 5, rotation: 0, progress: 1, built: true },
    { id: 2, type: 'habitat', x: 7, z: 5, rotation: 0, progress: 1, built: true },
    { id: 3, type: 'habitat', x: 5, z: 3, rotation: 0, progress: 0.5, built: false },
  ];
  const migrated = deserialize(JSON.stringify(legacy));
  assert.equal(migrated.buildings.length, 12);
  assert.deepEqual(migrated.buildings.filter(b => b.type === 'airlock').map(b => [b.x, b.z, b.rotation]), [[5, 6, 0], [7, 6, 0]], 'a module facing another module keeps no airlock');
  assert.equal(new Set(migrated.buildings.map(b => b.id)).size, 12);
  assert.ok(migrated.nextId > Math.max(...migrated.buildings.map(b => b.id)));
  assert.equal(migrated.buildings.filter(b => !b.built).length, 4);
  assert.equal(count(migrated.inventory, 'metal'), 140); assert.equal(count(migrated.inventory, 'meal'), 6);
  assert.equal(migrated.reserves.water, 40); assert.equal(migrated.player.satiety, 100);
  assert.deepEqual(deserialize(serialize(migrated)), migrated);
});
