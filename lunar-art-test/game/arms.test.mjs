import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from './sim.js';
import { caveLayout } from './caves.js';
import { WEAPONS, ARMORY, armsOf, heldWeapon, holdWeapon, reload, stepArms, pullTrigger, craft } from './arms.js';
import { createHunt, stepHunt, fire, release, NEST } from './hunt.js';
import { nestMouth, liveNests } from './infest.js';
import { createCrawler } from './crawler.js';
import * as inv from './inventory.js';

const seeded = (seed = 7) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function underground(zone = 0) {
  const s = createState(1847), start = caveLayout(s.seed, 0, zone).start;
  Object.assign(s.player, { cave: 0, zone, x: start.x * 2, z: start.z * 2 + (zone ? 2 : 1), facing: 0 });
  return s;
}
const give = (s, items) => { for (const [k, n] of Object.entries(items)) inv.add(s.inventory, k, n); };
const clear = s => { s.inventory.fill(null); };

test('a new colonist carries a loaded pistol and rounds; reloads draw rounds from the pack', () => {
  const s = createState(1);
  assert.equal(heldWeapon(s), 'pistol');
  assert.equal(armsOf(s).loaded.pistol, WEAPONS.pistol.magazine);
  const rounds = inv.count(s.inventory, 'rounds');
  for (let i = 0; i < WEAPONS.pistol.magazine; i++) { assert.equal(pullTrigger(s).ok, true); stepArms(s, WEAPONS.pistol.cooldown); }
  assert.equal(armsOf(s).loaded.pistol, 0); assert.ok(armsOf(s).reloading > 0, 'an empty magazine reloads itself');
  assert.equal(pullTrigger(s).ok, false);
  stepArms(s, WEAPONS.pistol.reload + .01);
  assert.equal(armsOf(s).loaded.pistol, WEAPONS.pistol.magazine);
  assert.equal(inv.count(s.inventory, 'rounds'), rounds - WEAPONS.pistol.magazine);
  inv.remove(s.inventory, 'rounds', inv.count(s.inventory, 'rounds')); armsOf(s).loaded.pistol = 0;
  assert.match(reload(s).reason, /armory/);
});

test('the armory crafts rounds and fuel from the pack; the rifle and flamethrower wait on research', () => {
  const s = createState(1); clear(s); give(s, { metal: 100, silicon: 20, titanium: 20, goo: 3 });
  assert.equal(craft(s, 'rounds').ok, true); assert.equal(inv.count(s.inventory, 'rounds'), ARMORY.rounds.makes);
  assert.equal(craft(s, 'fuel').ok, true); assert.equal(inv.count(s.inventory, 'fuel'), ARMORY.fuel.makes);
  assert.equal(craft(s, 'rifle').ok, false, 'not researched');
  s.research.done.push('rifle');
  assert.equal(craft(s, 'rifle').ok, true); assert.equal(inv.count(s.inventory, 'rifle'), 1);
  assert.equal(craft(s, 'flamethrower').ok, false);
  s.research.done.push('flamethrower');
  assert.equal(craft(s, 'flamethrower').ok, true);
  assert.match(craft(s, 'flamethrower').reason, /goo/, 'out of goo');
  assert.equal(heldWeapon(s), 'rifle', 'with no pistol, the first weapon carried is held');
  assert.equal(holdWeapon(s, 'flamethrower'), true); assert.equal(heldWeapon(s), 'flamethrower');
});

test('the rifle hits harder and further than the pistol', () => {
  const s = underground(0), h = createHunt(), rng = seeded();
  stepHunt(h, s, 1 / 30, rng);
  give(s, { rifle: 1 }); holdWeapon(s, 'rifle'); armsOf(s).loaded.rifle = 12; armsOf(s).cooldown = 0;
  assert.ok(WEAPONS.rifle.damage > WEAPONS.pistol.damage && WEAPONS.rifle.range > WEAPONS.pistol.range);
  assert.ok(WEAPONS.rifle.magazine > WEAPONS.pistol.magazine);
  assert.equal(fire(h, s).weapon, 'rifle');
  assert.equal(h.shots.at(-1).damage, WEAPONS.rifle.damage);
});

test('the flamethrower burns its tank while held, scorches crawlers and burns nests down as broods boil out', () => {
  const s = underground(1), h = createHunt(), rng = seeded();
  stepHunt(h, s, 1 / 30, rng);
  const cave = caveLayout(s.seed, 0, 1), n = cave.nests[0], m = nestMouth(n);
  Object.assign(s.player, { x: m.x + n.dx * 1.4, z: m.z + n.dz * 1.4, facing: Math.atan2(-n.dx, -n.dz) });
  give(s, { flamethrower: 1, fuel: 1 }); holdWeapon(s, 'flamethrower'); armsOf(s).cooldown = 0;
  assert.equal(fire(h, s).ok, true, 'an empty tank still takes the trigger');
  stepHunt(h, s, 1 / 30, rng); assert.ok(armsOf(s).reloading > 0, 'and starts filling from a fuel cell');
  release(h); stepHunt(h, s, WEAPONS.flamethrower.reload + .05, rng);
  assert.equal(armsOf(s).loaded.flamethrower, WEAPONS.flamethrower.magazine); assert.equal(inv.count(s.inventory, 'fuel'), 0);
  h.crawlers.forEach(c => { c.state = 'dead'; c.t = 0; });
  const c = createCrawler(s.player.x + Math.sin(s.player.facing) * 1.5, s.player.z + Math.cos(s.player.facing) * 1.5); h.crawlers.push(c);
  const hp = c.hp;
  fire(h, s);
  stepHunt(h, s, .5, rng);
  assert.ok(h.flame?.points.length, 'spraying');
  assert.ok(c.hp < hp, 'the crawler in the jet burns');
  assert.ok(armsOf(s).loaded.flamethrower < WEAPONS.flamethrower.magazine, 'the tank drains');
  assert.ok(liveNests(s, 0, 1).some(l => l.key === n.key), 'a nest takes a beating before it burns');
  for (let t = 0; t < 3 && liveNests(s, 0, 1).some(l => l.key === n.key); t += .1) stepHunt(h, s, .1, rng);
  assert.ok(!liveNests(s, 0, 1).some(l => l.key === n.key), 'the nest burns out');
  const brood = h.crawlers.filter(c => c.nest === n.key);
  assert.ok(brood.length >= NEST.final + 4, `broods crawl out as it burns: ${brood.length}`);
  assert.ok(h.events.some(e => e.type === 'spawned' && e.emerge && e.nest === n.key));
  release(h); stepHunt(h, s, 1 / 30, rng); assert.equal(h.flame, null);
});

test('rounds that hit a nest wound it, and each wound squeezes more crawlers out of it', () => {
  const s = underground(1), h = createHunt(), rng = seeded();
  stepHunt(h, s, 1 / 30, rng);
  const cave = caveLayout(s.seed, 0, 1), n = cave.nests[0], m = nestMouth(n);
  Object.assign(s.player, { x: m.x - n.dx * 4, z: m.z - n.dz * 4, facing: Math.atan2(n.dx, n.dz) });
  h.crawlers = [];
  give(s, { rifle: 1, rounds: 60 }); holdWeapon(s, 'rifle'); armsOf(s).loaded.rifle = WEAPONS.rifle.magazine;
  armsOf(s).cooldown = 0; assert.equal(fire(h, s).ok, true);
  assert.equal(h.shots[0].nest, n.key, 'the nest takes the round');
  stepHunt(h, s, .2, rng);
  assert.ok(h.wounds[n.key].hp < NEST.hp);
  for (let i = 0; i < 40 && !h.crawlers.length; i++) { armsOf(s).cooldown = 0; armsOf(s).loaded.rifle = WEAPONS.rifle.magazine; fire(h, s); stepHunt(h, s, .2, rng); }
  const c = h.crawlers.find(c => c.nest === n.key);
  assert.ok(c, 'a crawler squeezes out');
  assert.equal(c.state, 'emerge');
  for (let i = 0; i < 60 && c.state === 'emerge'; i++) stepHunt(h, s, 1 / 30, rng);
  assert.notEqual(c.state, 'emerge', 'and joins the hunt');
});

test('on the surface the weapons fire at hatchlings and the flames clear goo', () => {
  const s = createState(1), h = createHunt(), rng = seeded();
  Object.assign(s.player, { x: 0, z: 0, facing: 0 });
  s.brood = [createCrawler(0, 6)];
  stepHunt(h, s, 1 / 30, rng);
  assert.equal(fire(h, s).ok, true);
  assert.equal(h.shots[0].target, s.brood[0], 'no rock on the surface; the round finds the hatchling');
  stepHunt(h, s, 1, rng);
  assert.ok(s.brood[0].hp < 60);
  s.goo = { cells: [[0, 1]], clock: 20, breaches: 1 };
  give(s, { flamethrower: 1 }); holdWeapon(s, 'flamethrower'); armsOf(s).loaded.flamethrower = 50; armsOf(s).cooldown = 0;
  fire(h, s); stepHunt(h, s, 1 / 30, rng);
  assert.equal(s.goo.cells.length, 0);
});

test('loaded weapons survive a save, and an old save gets its pistol and rounds as items', () => {
  const s = createState(1); give(s, { rifle: 1 }); holdWeapon(s, 'rifle'); armsOf(s).loaded.rifle = 5;
  const back = deserialize(serialize(s));
  assert.equal(heldWeapon(back), 'rifle'); assert.equal(armsOf(back).loaded.rifle, 5);
  const old = JSON.parse(serialize(createState(1)));
  delete old.player.arms; old.player.gun = { mag: 2, reserve: 9 };
  old.inventory = old.inventory.map(x => x && ['pistol', 'rounds'].includes(x.item) ? null : x);
  const migrated = deserialize(JSON.stringify(old));
  assert.equal(inv.count(migrated.inventory, 'pistol'), 1); assert.equal(inv.count(migrated.inventory, 'rounds'), 9);
  assert.equal(armsOf(migrated).loaded.pistol, 2);
});
