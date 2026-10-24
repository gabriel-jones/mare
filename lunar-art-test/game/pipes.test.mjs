import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from './sim.js';
import { footprint } from './defs.js';
import { PAD_MANIFOLD, pipeLinks, pipeRuns } from './pipes.js';

function build(state, type, x, z, rotation = 0) {
  const b = { id: 1 + Math.max(0, ...state.buildings.map(b => b.id)), type, x, z, rotation, progress: 1, built: true };
  state.buildings.push(b);
  return b;
}
function base() {
  const s = createState(); s.buildings = [];
  return s;
}

test('melter, electrolyser, tank and pad are plumbed in a chain, with fuel cells drawing from the tank', () => {
  const s = base(), tank = build(s, 'tank', 5, -5), melter = build(s, 'melter', 11, -1), lyser = build(s, 'electrolyser', 9, 1), cell = build(s, 'fuelcell', 9, -9);
  const links = pipeLinks(s).map(l => `${l.fluid}:${l.from}>${l.to}`).sort();
  assert.deepEqual(links, [
    `hydrolox:${lyser.id}>${tank.id}`, `hydrolox:${tank.id}>${cell.id}`, `hydrolox:${tank.id}>pad`, `water:${melter.id}>${lyser.id}`,
  ].sort());
  const runs = pipeRuns(s);
  assert.equal(runs.length, 4);
  const solid = new Set(s.buildings.flatMap(b => footprint(b.type, b.x, b.z, b.rotation)).map(c => `${c.x * 2},${c.z * 2}`));
  for (const run of runs) {
    // Inner points never sit on a building, and each leg is a straight orthogonal run.
    for (const p of run.points.slice(1, -1)) assert.equal(solid.has(`${p.x},${p.z}`), false, `${run.id} crosses a building at ${p.x},${p.z}`);
    for (let i = 1; i < run.points.length - (run.to === 'pad' ? 1 : 0); i++) {
      const a = run.points[i - 1], b = run.points[i];
      assert.ok(a.x === b.x || a.z === b.z, `${run.id} leg ${i} is diagonal`);
    }
  }
  const pad = runs.find(r => r.to === 'pad');
  assert.deepEqual({ x: pad.points.at(-1).x, z: pad.points.at(-1).z }, PAD_MANIFOLD.end);
});

test('pipes only link built buildings, bridge over belts, and a melter feeds the nearest room', () => {
  const s = base(), melter = build(s, 'melter', 6, 4), lyser = build(s, 'electrolyser', 12, 4);
  for (const z of [3, 4, 5, 6]) build(s, 'conveyor', 9, z);
  lyser.built = false;
  assert.deepEqual(pipeLinks(s), []);
  lyser.built = true;
  const [run] = pipeRuns(s);
  assert.ok(run.points.some(p => p.bridge), 'the water line lifts over the belt');
  const room = build(s, 'habitat', 6, 9);
  assert.ok(pipeLinks(s).some(l => l.from === melter.id && l.to === room.id));
});
