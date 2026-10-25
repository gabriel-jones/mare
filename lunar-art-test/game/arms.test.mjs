import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, serialize, deserialize } from './sim.js';
import { caveLayout } from './caves.js';
import { WEAPONS, ARMORY, BENCH, armsOf, heldWeapon, holdWeapon, reload, stepArms, pullTrigger } from './arms.js';
import { startCraft, stepLife } from './life.js';
import { createHunt, stepHunt, fire, release, parry, NEST } from './hunt.js';
import { nestMouth, liveNests } from './infest.js';
import { createCrawler, PARRY } from './crawler.js';
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

test('the armory crafts rounds and fuel from the pack in a few seconds; the rifle and flamethrower wait on research', () => {
  const s = createState(1); clear(s); give(s, { metal: 100, silicon: 20, titanium: 20, goo: 3 });
  const bench = { id: 900, type: 'armory', x: 30, z: 30, rotation: 0, progress: 1, built: true, queue: [], work: 0, ready: {} };
  s.buildings.push(bench);
  const make = id => startCraft(s, bench, id), wait = () => { const end = BENCH.time * bench.queue.length + .1; for (let t = 0; t < end; t += .1) stepLife(s, .1, false); };
  assert.equal(make('rounds').ok, true); assert.equal(make('fuel').ok, true);
  assert.equal(inv.count(s.inventory, 'rounds'), 0, 'paid now, made over time');
  wait();
  assert.equal(inv.count(s.inventory, 'rounds'), ARMORY.rounds.makes); assert.equal(inv.count(s.inventory, 'fuel'), ARMORY.fuel.makes);
  assert.equal(make('rifle').ok, false, 'not researched');
  s.research.done.push('rifle');
  assert.equal(make('rifle').ok, true); wait(); assert.equal(inv.count(s.inventory, 'rifle'), 1);
  assert.equal(make('flamethrower').ok, false);
  s.research.done.push('flamethrower');
  assert.equal(make('flamethrower').ok, true);
  assert.match(make('flamethrower').reason, /goo/, 'out of goo');
  wait();
  assert.equal(heldWeapon(s), 'rifle', 'with no pistol, the first weapon carried is held');
  assert.equal(holdWeapon(s, 'flamethrower'), true); assert.equal(heldWeapon(s), 'flamethrower');
  for (let i = 0; i < BENCH.queue; i++) make('rounds');
  assert.match(make('rounds').reason, /busy/);
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

test('the submachine gun fires a burst of lighter rounds per pull, between the pistol and rifle', () => {
  const s = underground(0), h = createHunt(), rng = seeded(), spec = WEAPONS.smg;
  stepHunt(h, s, 1 / 30, rng);
  assert.ok(spec.damage < WEAPONS.rifle.damage && spec.range > WEAPONS.pistol.range && spec.range < WEAPONS.rifle.range);
  give(s, { smg: 1 }); holdWeapon(s, 'smg'); armsOf(s).loaded.smg = spec.magazine; armsOf(s).cooldown = 0;
  assert.equal(fire(h, s, false, rng).weapon, 'smg');
  assert.equal(h.shots.length, 1, 'the first round leaves on the pull');
  assert.equal(fire(h, s, false, rng).ok, false, 'a second pull waits for the burst');
  for (let t = 0; t < spec.interval * spec.burst; t += 1 / 60) stepHunt(h, s, 1 / 60, rng);
  const shots = h.events.filter(e => e.type === 'shot' && e.weapon === 'smg');
  assert.equal(shots.length, spec.burst);
  assert.equal(armsOf(s).loaded.smg, spec.magazine - spec.burst);
  assert.equal(h.burst, null);
  armsOf(s).loaded.smg = 2; armsOf(s).cooldown = 0; h.events.length = 0;
  fire(h, s, false, rng); for (let t = 0; t < .5; t += 1 / 60) stepHunt(h, s, 1 / 60, rng);
  assert.equal(h.events.filter(e => e.type === 'shot').length, 2, 'a burst stops when the magazine runs dry');
  assert.ok(armsOf(s).reloading > 0);
});

test('the electric katana cuts everything in its arc and needs no ammunition', () => {
  const s = underground(0), h = createHunt(), rng = seeded(), spec = WEAPONS.katana;
  stepHunt(h, s, 1 / 30, rng);
  clear(s); give(s, { katana: 1 }); assert.equal(heldWeapon(s), 'katana');
  const p = s.player, at = (dx, dz) => { const c = createCrawler(p.x + dx, p.z + dz, rng); c.state = 'stalk'; return c; };
  h.crawlers = [at(-.6, 1.4), at(.6, 1.4), at(0, -1.5), at(0, spec.range + 2)];
  const hp = h.crawlers.map(c => c.hp);
  const r = fire(h, s, false, rng);
  assert.equal(r.ok, true); assert.equal(r.hits, 2, 'the two ahead are cut, not the one behind or out of reach');
  assert.deepEqual(h.crawlers.map((c, i) => c.hp < hp[i]), [true, true, false, false]);
  assert.ok(h.events.some(e => e.type === 'swing'));
  assert.equal(fire(h, s, false, rng).ok, false, 'one swing at a time');
  stepHunt(h, s, spec.cooldown + .01, rng);
  assert.equal(fire(h, s, false, rng).ok, true);
  assert.equal(reload(s).ok, false); assert.equal(inv.count(s.inventory, 'rounds'), 0);
});

test('a katana parry turns a lunge from the front: no harm, the crawler zapped and dazed; from behind it still lands', () => {
  const s = underground(0), h = createHunt(), rng = seeded();
  stepHunt(h, s, 1 / 30, rng);
  clear(s); give(s, { katana: 1 });
  const p = s.player, lunging = dz => { const c = createCrawler(p.x, p.z + dz, rng); Object.assign(c, { state: 'lunge', t: 0, hp: 500, lunge: { x: 0, z: -Math.sign(dz) } }); h.crawlers = [c]; return c; };
  const health = p.health, c = lunging(.5);
  assert.equal(parry(h, s).ok, true);
  assert.equal(parry(h, s).ok, false, 'no raising it again straight away');
  stepHunt(h, s, 1 / 60, rng);
  const e = h.events.find(e => e.type === 'parried');
  assert.ok(e?.perfect, 'caught at once, a perfect parry');
  assert.equal(p.health, health); assert.equal(c.hp, 500 - PARRY.perfectZap); assert.equal(c.state, 'recoil');
  for (let t = 0; t < 1; t += 1 / 30) stepHunt(h, s, 1 / 30, rng);
  assert.equal(c.state, 'recover', 'thrown back, then dazed');
  assert.equal(parry(h, s).ok, true, 'a parry that lands can be raised again soon');

  for (let t = 0; t < PARRY.window + PARRY.cooldown + .1; t += 1 / 30) stepHunt(h, s, 1 / 30, rng);
  assert.equal(p.guard, null, 'the guard drops after its window');
  const behind = lunging(-.5); h.events.length = 0;
  parry(h, s); stepHunt(h, s, 1 / 60, rng);
  assert.equal(behind.state, 'grab'); assert.ok(!h.events.some(e => e.type === 'parried'));
});

test('only the katana parries', () => {
  const s = underground(0), h = createHunt();
  stepHunt(h, s, 1 / 30, seeded());
  assert.equal(heldWeapon(s), 'pistol'); assert.equal(parry(h, s).ok, false);
});

test('every weapon but the pistol is researched, on a ballistics branch and an energy branch', async () => {
  const { TECHS } = await import('./space.js');
  for (const id of Object.keys(WEAPONS)) {
    if (id === 'pistol') { assert.equal(ARMORY.pistol.tech, undefined); continue; }
    assert.equal(ARMORY[id].tech, id); assert.ok(TECHS[id] && !TECHS[id].innate, `${id} is a tech`);
  }
  assert.deepEqual(['smg', 'rifle', 'flamethrower'].map(id => TECHS[id].branch), ['arms', 'arms', 'arms']);
  assert.deepEqual(TECHS.rifle.requires, ['smg']);
  assert.deepEqual(['katana', 'arc', 'railgun'].map(id => [TECHS[id].branch, TECHS[id].requires ?? []]), [['energy', []], ['energy', ['katana']], ['energy', ['arc']]]);
});

test('the railgun charges while held and its slug goes through every crawler in line', () => {
  const s = createState(3), h = createHunt(), rng = seeded(), spec = WEAPONS.railgun;
  s.player.facing = 0; stepHunt(h, s, 1 / 30, rng);
  clear(s); give(s, { railgun: 1, charge: 2 }); armsOf(s).loaded.railgun = 0;
  assert.match(fire(h, s, false, rng).reason, /Reloading/, 'empty, it loads cells first');
  stepHunt(h, s, spec.reload + .01, rng);
  assert.equal(armsOf(s).loaded.railgun, 2); assert.equal(inv.count(s.inventory, 'charge'), 0, 'one cell a slug');
  const p = s.player, at = (dx, dz) => { const c = createCrawler(p.x + dx, p.z + dz, rng); c.state = 'stalk'; c.hp = 200; return c; };
  s.brood = [at(0, 1.5), at(.2, 6), at(1.5, 2)];
  assert.equal(fire(h, s, false, rng).ok, true); assert.equal(armsOf(s).loaded.railgun, 2, 'nothing spent until it fires');
  for (let t = 0; t < spec.charge; t += 1 / 60) stepHunt(h, s, 1 / 60, rng);
  const hp = s.brood.map(c => c.hp), r = release(h, s, rng);
  assert.equal(r.ok, true); assert.ok(Math.abs(r.power - 1) < 1e-9); assert.equal(r.hits, 2);
  assert.deepEqual(s.brood.map((c, i) => hp[i] - c.hp), [spec.damage, spec.damage, 0], 'pierces the line, misses the one off it');
  assert.ok(h.events.some(e => e.type === 'rail'));
  stepHunt(h, s, spec.cooldown + .01, rng);
  fire(h, s, false, rng); const quick = release(h, s, rng);
  assert.ok(Math.abs(quick.power - spec.minPower) < 1e-9, 'an uncharged shot is weaker');
});

test('the arc projector chains between crawlers, stuns them and drains its cell', () => {
  const s = underground(0), h = createHunt(), rng = seeded(), spec = WEAPONS.arc;
  stepHunt(h, s, 1 / 30, rng);
  clear(s); give(s, { arc: 1, charge: 1 }); armsOf(s).loaded.arc = spec.magazine;
  const p = s.player, at = (dx, dz) => { const c = createCrawler(p.x + dx, p.z + dz, rng); c.state = 'stalk'; c.hp = 500; return c; };
  h.crawlers = [at(0, 2), at(1.5, 3.2), at(2.5, 5), at(0, -6)];
  assert.equal(fire(h, s, false, rng).ok, true);
  stepHunt(h, s, .5, rng);
  assert.deepEqual(h.arc.struck.map(c => h.crawlers.indexOf(c)), [0, 1, 2], 'leaps on from the first, not to the one behind');
  assert.ok(h.crawlers.slice(0, 3).every(c => c.hp < 500 && c.shocked > 0)); assert.equal(h.crawlers[3].hp, 500);
  assert.ok(Math.abs(armsOf(s).loaded.arc - (spec.magazine - spec.burn * .5)) < 1e-9);
  const x = h.crawlers[0].x; stepHunt(h, s, .1, rng); assert.equal(h.crawlers[0].x, x, 'stunned in the current');
  release(h); stepHunt(h, s, .1, rng); assert.equal(h.arc, null);
  armsOf(s).loaded.arc = 0; fire(h, s, false, rng); stepHunt(h, s, 1 / 30, rng);
  assert.ok(armsOf(s).reloading > 0); release(h); stepHunt(h, s, spec.reload + .01, rng);
  assert.equal(armsOf(s).loaded.arc, spec.magazine); assert.equal(inv.count(s.inventory, 'charge'), 0);
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
