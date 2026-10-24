import test from 'node:test';
import assert from 'node:assert/strict';
import { payInFull, createState, placeBlueprint, tick, serialize, deserialize, construct } from './sim.js';
import { createInventory, add, count } from './inventory.js';
import { ensureBuildingState } from './production.js';
import { ensureLifeState } from './life.js';
import { createCrawler, hurtCrawler } from './crawler.js';
import { terrainData, randomStream } from './terrain.js';
import { CELL_SIZE, DEFS } from './defs.js';
import { RAID, buildingHp, damageBuilding, mend, raidAlert, stepRaiders, waveSize } from './raid.js';
import { WEAPONS } from './arms.js';
import { hitChance, threats } from './android.js';

function build(state, type, x, z, rotation = 0) {
  const r = placeBlueprint(state, type, x, z, rotation);
  assert.equal(r.ok, true, `${type} at ${x},${z}: ${r.reason}`);
  const b = state.buildings.find(b => b.id === r.id);
  assert.equal(payInFull(state, b), true, `${type}: materials`);
  b.progress = 1; b.built = true; ensureLifeState(ensureBuildingState(b));
  return b;
}
const NIGHT = 100;
/** A small powered colony with a xeno lab, the player well away from it. */
function colony() {
  const s = createState(); s.inventory = createInventory({ metal: 800, silicon: 800, titanium: 40 }); s.player = { ...s.player, x: 40, z: 40 };
  for (const x of [-8, -7]) build(s, 'battery', x, 0);
  const lab = build(s, 'xenolab', 3, 3), solar = build(s, 'solar', -3, 4);
  tick(s, 0); s.power.stored = s.power.capacity;
  return { s, lab, solar };
}
function raider(s, x, z, extra = {}) {
  const c = Object.assign(createCrawler(x, z), { raider: true, state: 'march' }, extra);
  (s.brood ??= []).push(c); return c;
}
const fight = (s, seconds, rng, each = null) => { for (let t = 0; t < seconds; t += 1 / 30) { each?.(); stepRaiders(s, 1 / 30, [], rng); } };

test('raids arm once alien work is built and the first comes out of a cave mouth after dark, alone', () => {
  const s = createState(); tick(s, 1);
  assert.equal(s.raid, undefined, 'no alien building, no raids');
  s.buildings.push({ id: 900, type: 'reactor', x: 6, z: 6, rotation: 0, progress: 1, built: true });
  tick(s, 1); assert.ok(s.raid, 'armed');
  for (let t = 2; t < 79; t += .5) tick(s, .5);
  assert.equal(s.brood?.length ?? 0, 0, 'nothing comes by day');
  for (let t = 79; t < 79 + RAID.delay[1] + 3; t += .25) tick(s, .25);
  assert.equal(s.brood.length, 1, 'one raider on the first night');
  const c = s.brood[0], caves = terrainData(s.seed).caves;
  assert.equal(c.raider, true);
  assert.ok(caves.some(m => Math.hypot(m.x - c.x, m.z - c.z) < 8), 'at a cave mouth');
  assert.equal(s.raid.wave, 1);
});

test('raids grow, and hatchlings join from the third', () => {
  assert.deepEqual(waveSize(1), { adults: 1, small: 0 });
  assert.deepEqual(waveSize(2), { adults: 1, small: 0 });
  assert.deepEqual(waveSize(3), { adults: 2, small: 1 });
  assert.ok(waveSize(9).adults + waveSize(9).small > 5);
  assert.ok(waveSize(99).adults <= RAID.maxAdults && waveSize(99).small <= RAID.maxSmall);
});

test('most nights bring a raid, and never two quiet nights running', () => {
  const s = createState(); s.buildings.push({ id: 900, type: 'xenolab', x: 6, z: 6, rotation: 0, progress: 1, built: true });
  let quiet = 0, worst = 0, raids = 0, last = 0;
  for (let t = 0; t < 240 * 20; t += 1) {
    tick(s, 1);
    if (s.brood?.length) s.brood = [];
    if (s.raid && s.raid.wave !== last) { raids++; last = s.raid.wave; quiet = 0; }
    else if (s.raid && s.raid.quiet > quiet) { quiet = s.raid.quiet; worst = Math.max(worst, quiet); }
  }
  assert.ok(raids >= 10 && raids <= 20, `${raids} raids in 20 nights`);
  assert.ok(worst <= 1, 'at most one quiet night in a row');
});

test('a raider marches on the base and claws the nearest structure', () => {
  const { s, solar } = colony(), rng = randomStream(7);
  const c = raider(s, -6, 40);
  fight(s, 40, rng);
  assert.ok(solar.hp < buildingHp('solar') || !solar.built, 'the solar panel took damage');
  assert.equal(threats(s).includes(c), true, 'at the base it is a threat to androids');
});

test('a structure clawed to nothing collapses to a paid-for blueprint, rebuilt without materials', () => {
  const { s, solar } = colony();
  assert.equal(damageBuilding(s, solar, buildingHp('solar') - 1), false);
  assert.equal(solar.hp, 1);
  assert.equal(damageBuilding(s, solar, 5), true);
  assert.equal(solar.built, false); assert.equal(solar.wreck, true); assert.equal(solar.progress, .5);
  assert.deepEqual(solar.paid, DEFS.solar.cost);
  s.inventory = createInventory({});
  s.player = { ...s.player, x: -9, z: 9 };
  for (let i = 0; i < 200 && !solar.built; i++) construct(s, solar.id, .1);
  assert.equal(solar.built, true, 'rebuilt from nothing');
  assert.equal(solar.wreck, undefined);
});

test('patching up mends a damaged structure for free', () => {
  const { s, lab } = colony();
  damageBuilding(s, lab, 100);
  assert.equal(mend(lab, 1), false);
  assert.ok(lab.hp > buildingHp('xenolab') - 100);
  while (!mend(lab, 1));
  assert.equal(lab.hp, undefined);
});

test('a raider turns on the player who comes near, and on one who shoots it from afar', () => {
  const { s } = colony(), rng = randomStream(3);
  const c = raider(s, -6, 30);
  s.player = { ...s.player, x: -6, z: 23, health: 100 };
  fight(s, .2, rng);
  assert.equal(c.prey, 'player', 'close by, it goes for the player');
  fight(s, 20, rng);
  assert.ok(s.player.health < 100, 'and bites');

  const t = colony(), far = raider(t.s, 20, 30);
  t.s.player = { ...t.s.player, x: 20, z: 52 };
  fight(t.s, .2, rng); assert.equal(far.prey, null, 'too far to notice');
  hurtCrawler(far, 5, rng); fight(t.s, .2, rng);
  assert.equal(far.prey, 'player', 'shot, it comes for the shooter');
});

test('the player inside a room is out of reach: raiders claw at the walls instead', () => {
  const { s } = colony(), rng = randomStream(5);
  for (const [x, z] of [[8, 0], [9, 0]]) build(s, 'habitat', x, z);
  build(s, 'airlock', 8, 1, 0);
  s.player = { ...s.player, x: 18, z: 0 };
  const c = raider(s, 18, 6);
  fight(s, .2, rng);
  assert.equal(c.prey, null);
  assert.ok(c.target, 'a structure to claw');
});

test('at dawn raiders run for the caves and are gone', () => {
  const { s } = colony(), rng = randomStream(9);
  s.time = NIGHT; tick(s, 0); s.raid = { wave: 1, night: 0, quiet: 0, spawns: [] };
  const c = raider(s, 4, 20);
  assert.equal(raidAlert(s), true);
  s.time = 200; tick(s, .1);
  assert.ok(Number.isInteger(c.retreat));
  fight(s, 60, rng);
  assert.equal(s.brood.length, 0, 'back underground');
  assert.equal(raidAlert(s), false);
});

test('raids, raiders, damage and wrecks survive a save', () => {
  const { s, lab, solar } = colony();
  const crate = build(s, 'storage', 0, 4); add(crate.slots, 'metal', 30);
  s.raid = { wave: 3, night: 4, quiet: 0, spawns: [{ t: 4, cave: 1, small: true }] };
  raider(s, 10, 10, { small: true, hp: 20 });
  damageBuilding(s, lab, 30); damageBuilding(s, solar, 999); damageBuilding(s, crate, 999);
  const back = deserialize(serialize(s));
  assert.deepEqual(back.raid, s.raid);
  assert.equal(back.brood[0].raider, true); assert.equal(back.brood[0].small, true); assert.equal(back.brood[0].hp, 20);
  assert.equal(back.buildings.find(b => b.id === lab.id).hp, buildingHp('xenolab') - 30);
  const wreck = back.buildings.find(b => b.id === solar.id);
  assert.equal(wreck.wreck, true); assert.equal(wreck.built, false);
  assert.equal(count(back.buildings.find(b => b.id === crate.id).slots, 'metal'), 30, 'a wrecked crate keeps its contents');
});

test('androids only answer raiders that reach the base', () => {
  const { s } = colony();
  const far = raider(s, 60, 60), close = raider(s, 2, 12);
  stepRaiders(s, 1 / 30, [], randomStream(1));
  assert.equal(threats(s).includes(far), false);
  assert.equal(threats(s).includes(close), true);
});

test('android shots miss more at range and far more at a moving target', () => {
  const rifle = WEAPONS.rifle;
  assert.ok(hitChance(rifle, 4, 0) > hitChance(rifle, 14, 0));
  assert.ok(hitChance(rifle, 8, 0) - hitChance(rifle, 8, 4.4) > .25, 'a closing crawler is hard to hit');
  assert.ok(hitChance(rifle, 8, 14) <= .15, 'a lunge is nearly impossible');
  assert.ok(hitChance(rifle, 2, 0) < 1, 'never perfect');
});
