import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, tick, serialize, deserialize, placeBlueprint, setMiningArea, settle, MARS_KIT } from './sim.js';
import { LAUNCH, VOYAGE, TECHS, holdVoyage, loadGoo, shipAction, voyageBlock, unlockResearch } from './space.js';
import { DEPOSIT, terrainData, terrainReason, heightAt } from './terrain.js';
import { MARS_OFFSET, planetOf, seedOn } from './planets.js';
import { add, count } from './inventory.js';
import { objective } from './mission.js';

/** A Moon colony a step from the pad with every manoeuvre researched, full tanks and goo in hand. */
function ready(seed = 1847) {
  const s = createState(seed);
  s.research.done.push('containment', ...VOYAGE.techs);
  s.ship.fuel = LAUNCH.fuel;
  add(s.inventory, 'goo', 12);
  Object.assign(s.player, { x: 0, z: -4 });
  return s;
}
function fly(s) {
  for (let t = 0; t < LAUNCH.hold + .1 && s.ship.status === 'pad'; t += 1 / 30) holdVoyage(s, 1 / 30);
  assert.equal(s.ship.status, 'ascent');
  for (let t = 0; t < LAUNCH.ascent + VOYAGE.transfer + LAUNCH.descent + 2 && s.ship.status !== 'pad'; t += 1 / 30) tick(s, 1 / 30);
  assert.equal(s.ship.status, 'pad');
}

test('Mars is seeded from the home colony and has its own ground: mesas, deposits, no lander or ice craters', () => {
  assert.equal(planetOf(1847), 'moon');
  assert.equal(planetOf(seedOn(1847, 'mars')), 'mars');
  assert.equal(seedOn(seedOn(1847, 'mars'), 'moon'), 1847);
  const moon = terrainData(1847), mars = terrainData(1847 + MARS_OFFSET);
  assert.ok(moon.site && !moon.deposits.length);
  assert.equal(mars.site, null);
  for (const [kind, d] of Object.entries(DEPOSIT)) assert.equal(mars.deposits.filter(o => o.kind === kind).length, d.count, kind);
  // Every deposit is level enough to build a drill on its middle.
  for (const d of mars.deposits) {
    const x = Math.round(d.x / 2), z = Math.round(d.z / 2);
    assert.equal(terrainReason(1847 + MARS_OFFSET, [{ x, z }, { x: x + 1, z }, { x, z: z + 1 }, { x: x + 1, z: z + 1 }]), null, `${d.kind} at ${d.x.toFixed(1)},${d.z.toFixed(1)}`);
  }
  assert.ok(Number.isFinite(heightAt(1847 + MARS_OFFSET, 30, 40)));
});

test('the pad offers the flight only once the first manoeuvre is known, and says what is missing', () => {
  const s = createState();
  Object.assign(s.player, { x: 0, z: -4 });
  assert.equal(shipAction(s), null);
  s.research.done.push('containment');
  s.research.bank = 1000;
  assert.equal(unlockResearch(s, 'hohmann').ok, false);
  assert.equal(unlockResearch(s, 'escape').ok, true);
  assert.match(shipAction(s).verb, /Fly to Mars: Research Hohmann transfer, Aerocapture, Powered descent/);
  for (const t of ['hohmann', 'aerocapture', 'edl']) assert.equal(unlockResearch(s, t).ok, true, TECHS[t].name);
  assert.match(voyageBlock(s), /tanks must be full/);
  s.ship.fuel = LAUNCH.fuel;
  assert.match(voyageBlock(s), /goo drive needs 6/);
  add(s.inventory, 'goo', 20);
  assert.equal(shipAction(s).use, 'goo');
  assert.match(loadGoo(s).reason, /12\/12/);
  assert.equal(count(s.inventory, 'goo'), 8);
  assert.equal(shipAction(s).voyage, true);
});

test('boarding flies the player to a fresh Mars colony; the Moon colony waits, and both survive a save', () => {
  const s = ready();
  placeBlueprint(s, 'solar', 6, 3);
  const moonBuildings = s.buildings.length;
  loadGoo(s);
  fly(s);
  assert.equal(planetOf(s.seed), 'mars');
  assert.equal(s.player.aboard, undefined);
  assert.deepEqual([s.player.x, s.player.z], [0, -2.6]);
  assert.equal(s.ship.goo, VOYAGE.gooHold - VOYAGE.goo);
  assert.equal(s.ship.fuel, 0);
  // The landing kit: a crate of supplies and an android on its pad.
  const crate = s.buildings.find(b => b.type === 'storage');
  assert.equal(count(crate.slots, 'metal'), MARS_KIT.metal);
  assert.ok(s.buildings.some(b => b.type === 'chargepad'));
  assert.deepEqual(s.robots.map(r => r.kind), ['android']);
  assert.equal(s.away.moon.buildings.length, moonBuildings);
  assert.equal(s.away.moon.seed, 1847);
  assert.match(setMiningArea(s, 10, 10).reason, /No regolith/);
  assert.equal(objective(s).id, 'mars-drill');
  const back = deserialize(serialize(s));
  assert.equal(back.seed, s.seed);
  assert.equal(back.away.moon.buildings.length, moonBuildings);
  assert.deepEqual(back.buildings.map(b => b.id), s.buildings.map(b => b.id));
});

test('a save taken mid-transfer resumes in flight, with the player aboard', () => {
  const s = ready();
  loadGoo(s);
  for (let t = 0; t < LAUNCH.hold + .1; t += 1 / 30) holdVoyage(s, 1 / 30);
  for (let t = 0; t < LAUNCH.ascent + 5; t += 1 / 30) tick(s, 1 / 30);
  assert.equal(s.ship.status, 'transfer');
  const back = deserialize(serialize(s));
  assert.equal(back.ship.status, 'transfer');
  assert.equal(back.ship.dest, 'mars');
  assert.equal(back.player.aboard, true);
  for (let t = 0; t < VOYAGE.transfer + LAUNCH.descent + 1; t += 1 / 30) tick(back, 1 / 30);
  assert.equal(planetOf(back.seed), 'mars');
  assert.equal(back.ship.status, 'pad');
});

test('flying home brings back the Moon colony as it was left, and Mars waits in turn', () => {
  const s = ready();
  placeBlueprint(s, 'solar', 6, 3);
  const ids = s.buildings.map(b => b.id);
  loadGoo(s);
  fly(s);
  const marsIds = s.buildings.map(b => b.id);
  s.ship.fuel = LAUNCH.fuel;
  Object.assign(s.player, { x: 0, z: -4 });
  fly(s);
  assert.equal(s.seed, 1847);
  assert.deepEqual(s.buildings.map(b => b.id), ids);
  assert.deepEqual(s.away.mars.buildings.map(b => b.id), marsIds);
  assert.equal(s.ship.goo, 0);
  assert.equal(objective(s).id === undefined || !objective(s).id.startsWith('mars'), true);
  // A second visit lands on the same colony, without another kit.
  s.ship.fuel = LAUNCH.fuel; add(s.inventory, 'goo', 6); Object.assign(s.player, { x: 0, z: -4 }); loadGoo(s);
  fly(s);
  assert.deepEqual(s.buildings.map(b => b.id), marsIds);
});

test('a save whose away colony is tampered with is refused', () => {
  const s = ready();
  settle(s, 'mars');
  const raw = JSON.parse(serialize(s));
  raw.away.moon.seed = 99;
  assert.throws(() => deserialize(JSON.stringify(raw)), /Invalid colonies/);
  raw.away.moon.seed = 1847; raw.away.moon.buildings = [{ id: 'x' }];
  assert.throws(() => deserialize(JSON.stringify(raw)));
});

// --- Mining -----------------------------------------------------------------
import { validatePlacement } from './sim.js';
import { ensureBuildingState } from './production.js';
import { ORE, depositLeft, drillDeposit } from './ore.js';

function mars() {
  const s = ready();
  settle(s, 'mars');
  return s;
}
const ironDeposit = s => terrainData(s.seed).deposits.find(d => d.kind === 'iron');
const drillCell = d => ({ x: Math.round(d.x / 2 - .5), z: Math.round(d.z / 2 - .5) });
function put(s, type, x, z, extra = {}) {
  const b = ensureBuildingState({ id: s.nextId++, type, x, z, rotation: 0, progress: 1, built: true, serial: 1, ...extra });
  s.buildings.push(b);
  return b;
}

test('drills stand only on Martian deposits, once powered descent is researched', () => {
  const moon = ready(), s = mars(), d = ironDeposit(s), c = drillCell(d);
  assert.match(validatePlacement(moon, 'drill', 10, 10).reason, /Only on Mars/);
  assert.match(validatePlacement(moon, 'furnace', 10, 10).reason, /Only on Mars/);
  assert.equal(validatePlacement(s, 'drill', c.x, c.z).ok, true);
  assert.match(validatePlacement(s, 'drill', 6, 6).reason, /mineral deposit/);
  s.research.done = s.research.done.filter(t => t !== 'edl');
  assert.match(validatePlacement(s, 'drill', c.x, c.z).reason, /Powered descent/);
});

test('an android works the drill, hauls the ore to the furnace, and the bars reach the crate', () => {
  const s = mars(), d = ironDeposit(s), c = drillCell(d);
  put(s, 'reactor', -6, 4);
  const drill = put(s, 'drill', c.x, c.z), furnace = put(s, 'furnace', c.x + 4, c.z);
  assert.equal(drillDeposit(s, drill), d);
  const crate = s.buildings.find(b => b.type === 'storage'), start = depositLeft(s, d);
  for (let t = 0; t < 600; t += .1) tick(s, .1);
  assert.ok(depositLeft(s, d) < start - 20, `drilled ${start - depositLeft(s, d)}`);
  const bars = count(crate.slots, 'ironbar') + furnace.out.ironbar + (s.robots[0].carry?.item === 'ironbar' ? s.robots[0].carry.n : 0);
  assert.ok(bars >= 5, `bars ${bars}`);
  assert.ok(furnace.out.silicon + count(crate.slots, 'silicon') > MARS_KIT.silicon - 1, 'slag silicon');
  // Drill, furnace and the deposit all survive a save.
  const back = deserialize(serialize(s));
  assert.equal(depositLeft(back, d), depositLeft(s, d));
  const f2 = back.buildings.find(b => b.type === 'furnace');
  assert.deepEqual(f2.inv, furnace.inv);
  assert.equal(f2.mode, 'bars');
  const raw = JSON.parse(serialize(s));
  raw.buildings.find(b => b.type === 'drill').out = ORE.drill.cap + 1;
  assert.throws(() => deserialize(JSON.stringify(raw)), /drill or furnace/);
});

test('a furnace on plate rolls iron bars into metal, and E loads, takes and switches it', async () => {
  const { interact } = await import('./sim.js');
  const s = mars();
  put(s, 'reactor', -6, 4);
  const furnace = put(s, 'furnace', 6, 2);
  s.robots.length = 0;
  Object.assign(s.player, { x: 13, z: 5 });
  add(s.inventory, 'ironore', 10);
  assert.match(interact(s, furnace.id).reason, /Loaded 10 iron ore/);
  for (let t = 0; t < ORE.furnace.time * 5 + 1; t += .1) tick(s, .1);
  assert.equal(furnace.out.ironbar, 5);
  assert.match(interact(s, furnace.id).reason, /Took 5 iron bars, 1 silicon/);
  assert.match(interact(s, furnace.id).reason, /rolling metal plate/);
  assert.match(interact(s, furnace.id).reason, /Loaded 5 iron bars/);
  for (let t = 0; t < ORE.furnace.plateTime * 5 + 1; t += .1) tick(s, .1);
  // It stops once its output is full, with the last bar still waiting.
  assert.equal(furnace.out.metal, ORE.furnace.cap);
  assert.equal(furnace.inv.ironbar, 5 - ORE.furnace.cap / ORE.furnace.plate);
});

test('a belt carries ore from the drill output straight into the furnace', () => {
  const s = mars(), d = ironDeposit(s), c = drillCell(d);
  put(s, 'reactor', -6, 4);
  const drill = put(s, 'drill', c.x, c.z);
  // Drill output: local (1,1) facing +Z, so the belt starts at (x+1, z+2) and runs on into a furnace's input at local (0,0) facing -Z.
  put(s, 'conveyor', c.x + 1, c.z + 2, { items: [] });
  const furnace = put(s, 'furnace', c.x + 1, c.z + 3);
  s.robots[0].x = c.x * 2 - 2; s.robots[0].z = c.z * 2;
  const start = depositLeft(s, d);
  for (let t = 0; t < 120; t += .1) tick(s, .1);
  // The belt drains the drill faster than a load piles up, so every smelt was belt-fed.
  assert.ok(start - depositLeft(s, d) >= 6);
  assert.ok(drill.out < ORE.drill.haul);
  const crate = s.buildings.find(b => b.type === 'storage'), carry = s.robots[0].carry;
  const bars = furnace.out.ironbar + count(crate.slots, 'ironbar') + (carry?.item === 'ironbar' ? carry.n : 0);
  assert.ok(bars >= 2, JSON.stringify(furnace));
});
