import test from 'node:test';
import assert from 'node:assert/strict';
import { CENTIPEDE, SHAPE, createCentipede, huntCentipede, stepCentipede } from './centipede.js';
import { CRAWLER, hurtCrawler, partsOf, shotTarget, walkable } from './crawler.js';
import { caveKey, caveLayout } from './caves.js';
import { createState, deserialize, payInFull, placeBlueprint, serialize, tick } from './sim.js';
import { createInventory } from './inventory.js';
import { ensureBuildingState } from './production.js';
import { ensureLifeState } from './life.js';
import { randomStream } from './terrain.js';
import { launchRaid, raiders, stepRaid, stepRaiders } from './raid.js';
import { createHunt, stepHunt } from './hunt.js';
import { threats } from './android.js';

function seeded(n = 7) { return () => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; }; }
const hunt = (c, env, seconds, dt = 1 / 30) => { const all = []; for (let t = 0; t < seconds; t += dt) all.push(...huntCentipede(c, dt, env)); return all; };
const make = (x = 0, z = -12, extra = {}) => createCentipede(x, z, { ...SHAPE, ...extra });

test('it closes on its prey, rears over it and comes down on it', () => {
  const c = make(), prey = { x: 0, z: 0, invulnerable: false };
  c.burrowCool = 99;
  const events = hunt(c, { prey, rng: seeded() }, 12);
  const strikes = events.filter(e => e.type === 'strike');
  assert.ok(events.some(e => e.type === 'slam'), 'it slammed');
  assert.ok(strikes.length >= 1, 'and a blow landed');
  assert.equal(strikes[0].damage, CENTIPEDE.slamDamage);
});

test('a roll or a jump carries the prey clear of the blow', () => {
  const c = make(), prey = { x: 0, z: 0, invulnerable: true };
  c.burrowCool = 99;
  const events = hunt(c, { prey, rng: seeded() }, 12);
  assert.ok(events.some(e => e.type === 'slam'));
  assert.equal(events.filter(e => e.type === 'strike').length, 0);
});

test('prey far off, it goes under, follows it through the ground and bursts up beside it', () => {
  const c = make(0, -30), prey = { x: 0, z: 0, invulnerable: false };
  c.burrowCool = 0;
  let hidden = false, rose = null;
  for (let t = 0; t < 10 && !rose; t += 1 / 30) {
    // The prey walks on while it tunnels.
    prey.x += 1.5 / 30;
    for (const e of huntCentipede(c, 1 / 30, { prey, rng: seeded(3) })) if (e.type === 'surface') rose = { ...e, prey: { ...prey } };
    if (c.state === 'under') { hidden ||= partsOf(c).length === 0; }
  }
  assert.ok(hidden, 'all of it underground at once');
  assert.ok(rose, 'it came up');
  assert.ok(Math.hypot(rose.x - rose.prey.x, rose.z - rose.prey.z) < 4, 'beside where the prey had got to');
});

test('underground nothing can hit it; above ground any part of it can be shot', () => {
  const c = make(0, 0, { facing: 0 });
  const tail = partsOf(c).at(-1);
  // Aim across the tail, well away from the head.
  const from = { x: tail.x - 6, z: tail.z }, hit = shotTarget(null, from, { x: 1, z: 0 }, [c], { range: 16, tolerance: .2 });
  assert.equal(hit?.crawler, c, 'a shot across the tail hits');
  const under = make(0, 0, { under: true, popAt: { x: 30, z: 30 } });
  assert.equal(partsOf(under).length, 0);
  assert.equal(shotTarget(null, { x: -6, z: 0 }, { x: 1, z: 0 }, [under], { range: 16, tolerance: .2 }), null);
});

test('a hit doesn\'t make it flinch; reared up it takes double; it takes a lot of killing', () => {
  const c = make();
  hurtCrawler(c, 10); assert.equal(c.state, 'crawl'); assert.equal(c.hp, CENTIPEDE.hp - 10);
  c.state = 'rear'; const r = hurtCrawler(c, 10); assert.equal(r.dealt, 10 * CRAWLER.vulnerable);
  assert.ok(CENTIPEDE.hp > 300, 'tougher than a matron');
  c.y = 2; assert.equal(hurtCrawler(c, 1e4).killed, true);
  for (let i = 0; i < 30; i++) stepCentipede(c, 1 / 30);
  assert.equal(c.y, 0, 'a dead one drops to the ground');
});

test('in a cave it feels its way round the rock instead of going through it', () => {
  const cells = new Set(); for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) if (!(z === 2 && Math.abs(x) <= 3)) cells.add(caveKey(x, z));
  const cave = { cells, open: new Set(cells) }, open = (x, z) => walkable(cave, x, z, .4);
  const c = make(0, -10, { facing: 0 });
  c.burrowCool = 99;
  for (let t = 0; t < 8; t += 1 / 30) { huntCentipede(c, 1 / 30, { prey: { x: 0, z: 10, invulnerable: true }, open, rng: seeded() }); if (c.state === 'crawl') assert.ok(open(c.x, c.z), `in rock at ${c.x.toFixed(1)},${c.z.toFixed(1)}`); }
});

function colony() {
  const s = createState(); s.inventory = createInventory({ metal: 800, silicon: 800, titanium: 40 }); s.player = { ...s.player, x: 40, z: 40 };
  const r = placeBlueprint(s, 'xenolab', 3, 3, 0), b = s.buildings.find(b => b.id === r.id);
  payInFull(s, b); b.progress = 1; b.built = true; ensureLifeState(ensureBuildingState(b));
  tick(s, 0);
  return { s, lab: b };
}

test('from the seventh raid a centipede tunnels out of the caves and comes up for the base', () => {
  const { s, lab } = colony(), rng = randomStream(4);
  s.time = 100; launchRaid(s, 7, 0, rng);
  let c = null;
  for (let t = 0; t < 12 && !c; t += 1 / 30) { stepRaid(s, 1 / 30, rng); stepRaiders(s, 1 / 30, [], rng); c = raiders(s).find(c => c.kind === 'centipede'); }
  assert.ok(c, 'one came');
  assert.equal(c.state === 'under' || c.state === 'rise' || c.state === 'rear', true, 'it comes up out of the ground');
  let struck = false;
  for (let t = 0; t < 90 && !struck; t += 1 / 30) { stepRaid(s, 1 / 30, rng); struck = stepRaiders(s, 1 / 30, [], rng).some(e => e.crawler === c && (e.type === 'strike' || e.type === 'wreck')); }
  assert.ok(struck, 'it reached the base and struck a structure');
  assert.ok(lab.hp < 300 || !lab.built || s.buildings.some(b => b.hp != null));
  assert.ok(threats(s).includes(c) || partsOf(c).length === 0, 'the androids answer it when it is above ground');
});

test('a centipede raider survives a save, stretched out where it was', () => {
  const { s } = colony();
  const c = Object.assign(make(10, 12, { facing: 1 }), { raider: true });
  c.hp = 200; (s.brood ??= []).push(c);
  const back = deserialize(serialize(s)).brood[0];
  assert.equal(back.kind, 'centipede'); assert.equal(back.raider, true); assert.equal(back.hp, 200);
  assert.ok(Math.abs(back.x - 10) < 1e-9 && Math.abs(back.z - 12) < 1e-9);
  assert.equal(back.trail.length, c.trail.length);
});

test('the deepest cave zones are always hunted by a centipede, and the player\'s rounds find it', () => {
  const s = createState(1847), start = caveLayout(s.seed, 0, 2).start;
  Object.assign(s.player, { cave: 0, zone: 2, x: start.x * 2, z: start.z * 2 + 2, facing: 0 });
  const h = createHunt(); stepHunt(h, s, 1 / 30, seeded(5));
  const c = h.crawlers.find(c => c.kind === 'centipede');
  assert.ok(c, 'a centipede in zone 2');
  assert.ok(Math.hypot(c.x - s.player.x, c.z - s.player.z) >= 6, 'not on top of the player');
});
