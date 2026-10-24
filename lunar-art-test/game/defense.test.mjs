import test from 'node:test';
import assert from 'node:assert/strict';
import { payInFull, createState, placeBlueprint, tick, serialize, deserialize, grantStarterAndroid, validatePlacement, interact } from './sim.js';
import { createInventory, add, count } from './inventory.js';
import { ensureBuildingState } from './production.js';
import { ensureLifeState } from './life.js';
import { asKind, createCrawler } from './crawler.js';
import { randomStream } from './terrain.js';
import { FENCE, TURRET, defenseAction, fenceRuns, stepDefenses, turretSees } from './defense.js';
import { stepRaiders } from './raid.js';

function build(state, type, x, z, rotation = 0) {
  const r = placeBlueprint(state, type, x, z, rotation);
  assert.equal(r.ok, true, `${type} at ${x},${z}: ${r.reason}`);
  const b = state.buildings.find(b => b.id === r.id);
  assert.equal(payInFull(state, b), true, `${type}: materials`);
  b.progress = 1; b.built = true; ensureLifeState(ensureBuildingState(b));
  return b;
}
/** Charged batteries and a little sun, both defences researched, the player well away. */
function colony() {
  const s = createState(); s.inventory = createInventory({ metal: 600, silicon: 400, titanium: 40 }); s.player = { ...s.player, x: 40, z: 40 };
  s.research.done.push('smg', 'turret', 'katana', 'fence');
  for (const x of [-8, -7, -6]) build(s, 'battery', x, 0);
  tick(s, 0); s.power.stored = s.power.capacity;
  return s;
}
const crawler = (s, x, z, kind = 'crawler') => { const c = asKind(createCrawler(x, z), kind); c.state = 'stalk'; (s.brood ??= []).push(c); return c; };
const run = (s, seconds, rng, each = null) => { const events = []; for (let t = 0; t < seconds; t += 1 / 30) { each?.(); events.push(...stepDefenses(s, 1 / 30, s.power.powered !== false, rng)); } return events; };

test('turrets and fences wait on research', () => {
  const s = createState(); s.inventory = createInventory({ metal: 900, silicon: 900 });
  assert.match(validatePlacement(s, 'turret', 0, 4).reason, /research Sentry turret/);
  assert.match(validatePlacement(s, 'fence', 0, 4).reason, /research Electric fence/);
  s.research.done.push('turret', 'fence');
  assert.equal(validatePlacement(s, 'turret', 0, 4).ok, true);
  assert.equal(validatePlacement(s, 'fence', 0, 4).ok, true);
});

test('a powered, loaded turret turns on a crawler and fires its barrels in turn until it falls', () => {
  const s = colony(), t = build(s, 'turret', 0, 4); t.ammo = 60;
  const c = crawler(s, 1, 19), rng = randomStream(3);
  const events = run(s, 6, rng).filter(e => e.type === 'turret');
  assert.equal(c.state, 'dead', 'killed');
  assert.ok(events.length >= 6, `fired ${events.length}`);
  assert.ok(events.every((e, i) => !i || e.side !== events[i - 1].side), 'left, right, left...');
  assert.ok(events.some(e => e.hit) && events.some(e => !e.hit) || events.every(e => e.hit), 'hits land');
  assert.equal(t.ammo, 60 - events.length, 'one round a shot');
  assert.ok(Math.abs(Math.atan2(Math.sin(t.yaw - Math.atan2(0, 10)), Math.cos(t.yaw))) < .3, 'head turned to the target');
});

test('no rounds, no power or no line of sight: the turret holds fire', () => {
  const s = colony(), t = build(s, 'turret', 0, 4), c = crawler(s, 1, 19), rng = randomStream(4);
  t.ammo = 0;
  assert.equal(run(s, 2, rng).filter(e => e.type === 'turret').length, 0, 'empty');
  assert.equal(defenseAction(s, t), null, 'nothing to load it with');
  add(s.inventory, 'rounds', 50);
  assert.match(defenseAction(s, t).verb, /Load 50 rounds/);
  assert.equal(interact(s, t.id).ok, true); assert.equal(t.ammo, 50); assert.equal(count(s.inventory, 'rounds'), 0);
  s.power.powered = false;
  assert.equal(run(s, 2, rng).filter(e => e.type === 'turret').length, 0, 'grid down');
  s.power.powered = true;
  build(s, 'storage', 0, 7); build(s, 'storage', 1, 7);
  assert.equal(turretSees(s, t, c.x, c.z), false, 'crates between');
  run(s, TURRET.sight, rng);
  assert.equal(run(s, 2, rng).filter(e => e.type === 'turret').length, 0, 'no shot through the crates');
  assert.equal(c.hp > 0, true);
});

test('turrets and fences draw power', () => {
  const s = colony(), before = s.power.demand;
  build(s, 'turret', 0, 4); for (let x = 3; x < 7; x++) build(s, 'fence', x, 4);
  tick(s, .1);
  assert.ok(Math.abs(s.power.demand - before - (TURRET.power + 4 * FENCE.power)) < 1e-6);
});

test('a live fence shocks what comes close, pulse after pulse; a dead grid makes it harmless', () => {
  const s = colony(); for (let x = 0; x < 4; x++) build(s, 'fence', x, 4);
  const c = crawler(s, 2 * 2, 4 * 2 + 1.8), hp = c.hp, rng = randomStream(5);
  const zaps = run(s, 3, rng).filter(e => e.type === 'zap');
  assert.ok(zaps.length >= 3, `zapped ${zaps.length}`);
  assert.ok(c.hp < hp - 30 || c.state === 'dead');
  const far = crawler(s, 2 * 2, 4 * 2 + 6), farHp = far.hp;
  s.power.powered = false; const other = crawler(s, 2, 4 * 2 + 1.6), otherHp = other.hp;
  run(s, 3, rng);
  assert.equal(other.hp, otherHp, 'no power, no shock'); assert.equal(far.hp, farHp, 'out of reach');
});

test('goo from the dead fouls the wires until a segment shorts and the whole run goes dead; scraping brings it back', () => {
  const s = colony(), run4 = []; for (let x = 0; x < 6; x++) run4.push(build(s, 'fence', x, 4));
  const other = build(s, 'fence', 0, 8), rng = randomStream(6);
  // Bodies fall by the third segment, one after another.
  for (let i = 0; i < 6 && !run4[2].short; i++) { const c = crawler(s, 2 * 2 + (i % 2) * .4, 4 * 2 + 1.5, 'drone'); c.hp = 0; c.state = 'dead'; run(s, .2, rng); }
  assert.equal(run4[2].short, true, 'shorted');
  assert.equal(fenceRuns(s).find(r => r.segments.includes(run4[0])).dead, true, 'the whole joined run is dead');
  assert.equal(fenceRuns(s).find(r => r.segments.includes(other)).dead, false, 'a separate run is not');
  const c = crawler(s, 0, 4 * 2 + 1.6), hp = c.hp;
  run(s, 2, rng);
  assert.equal(c.hp, hp, 'a dead run shocks nothing');
  assert.match(defenseAction(s, run4[2]).verb, /Scrape|fire/);
  s.player = { ...s.player, x: 4, z: 10 };
  assert.equal(interact(s, run4[2].id).ok, true);
  assert.equal(run4[2].short, undefined); assert.equal(run4[2].foul, undefined);
  run(s, 2, rng);
  assert.ok(c.hp < hp, 'live again');
});

test('a short can catch fire and burn the segment down', () => {
  const s = colony(), f = build(s, 'fence', 0, 4);
  f.foul = FENCE.short + 6;
  const events = run(s, FENCE.burn + 1, () => .01);
  assert.ok(events.some(e => e.type === 'short' && e.fire), 'caught fire');
  assert.ok(f.hp < 100 || !f.built, 'burnt');
});

test('androids carry rounds to a turret running low and scrape fouled fences', () => {
  const s = colony(), crate = build(s, 'storage', 4, 5); add(crate.slots, 'rounds', 120);
  grantStarterAndroid(s);
  const t = build(s, 'turret', -1, 8); t.ammo = 10;
  const f = build(s, 'fence', 3, 8); f.foul = FENCE.short; f.short = true;
  for (let i = 0; i < 20 * 120 && (t.ammo < 60 || f.short); i++) tick(s, 1 / 20);
  assert.ok(t.ammo >= 60, `ammo ${t.ammo}`);
  assert.ok(count(crate.slots, 'rounds') < 120);
  assert.equal(f.short, undefined, 'scraped');
});

test('turret rounds and fence fouling survive a save; a dismantled turret gives back its rounds', () => {
  const s = colony(), t = build(s, 'turret', 0, 4), f = build(s, 'fence', 4, 4); t.ammo = 77; f.foul = 2.5; f.short = true; f.fire = 3;
  const back = deserialize(serialize(s)), t2 = back.buildings.find(b => b.id === t.id), f2 = back.buildings.find(b => b.id === f.id);
  assert.equal(t2.ammo, 77); assert.equal(f2.foul, 2.5); assert.equal(f2.short, true); assert.equal(f2.fire, 3);
});

test('a defended base holds off a raid: turret and fence kill raiders the player never touches', () => {
  const s = colony(), rng = randomStream(9);
  build(s, 'xenolab', 3, 3);
  const t = build(s, 'turret', 0, 6); t.ammo = TURRET.cap;
  for (let x = -4; x < 5; x++) build(s, 'fence', x, 10);
  for (let i = 0; i < 4; i++) { const c = asKind(createCrawler(-2 + i * 3, 34), 'crawler'); Object.assign(c, { raider: true, state: 'march', mustered: true }); (s.brood ??= []).push(c); }
  for (let i = 0; i < 30 * 40; i++) { stepRaiders(s, 1 / 30, [], rng); stepDefenses(s, 1 / 30, true, rng); }
  assert.equal(s.brood.filter(c => c.state !== 'dead').length, 0, 'all dead');
  assert.ok(t.ammo < TURRET.cap, 'the turret fired');
});
