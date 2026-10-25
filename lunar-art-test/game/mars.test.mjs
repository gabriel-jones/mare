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
