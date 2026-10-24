import { footprint } from './defs.js';
import { GRID_LIMIT } from './paths.js';
import { terrainBlocked } from './terrain.js';
import { touchesPad } from './space.js';

/** The fuel manifold on the launch pad's east edge: the cell a line arrives in and the coupling it ends at. */
export const PAD_MANIFOLD = Object.freeze({ cell: { x: 5, z: -6 }, end: { x: 8.45, z: -11.5 } });
const onPad = (x, z) => x >= -4 && x <= 4 && z >= -8 && z <= -2;
const key = (x, z) => `${x},${z}`;
const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ROOMS = new Set(['habitat', 'greenhouse']);

const centre = b => {
  const cells = footprint(b.type, b.x, b.z, b.rotation);
  return { x: cells.reduce((s, c) => s + c.x, 0) / cells.length, z: cells.reduce((s, c) => s + c.z, 0) / cells.length };
};
const nearest = (from, list) => {
  const c = centre(from);
  return list.reduce((best, b) => { const o = centre(b), d = Math.hypot(o.x - c.x, o.z - c.z); return !best || d < best.d ? { b, d } : best; }, null)?.b ?? null;
};

/**
 * Which buildings are plumbed together, mirroring how the sim moves liquids: melters feed electrolysers and the
 * nearest room, electrolysers fill the nearest tank, fuel cells draw from the nearest tank, and tanks touching the
 * pad feed the Starship.
 */
export function pipeLinks(state) {
  const built = type => state.buildings.filter(b => b.built && b.type === type);
  const melters = built('melter'), electrolysers = built('electrolyser'), tanks = built('tank');
  const rooms = state.buildings.filter(b => b.built && ROOMS.has(b.type)), links = [];
  for (const e of electrolysers) {
    const m = nearest(e, melters); if (m) links.push({ fluid: 'water', from: m.id, to: e.id });
    const t = nearest(e, tanks); if (t) links.push({ fluid: 'hydrolox', from: e.id, to: t.id });
  }
  for (const m of melters) { const r = nearest(m, rooms); if (r) links.push({ fluid: 'water', from: m.id, to: r.id }); }
  for (const f of built('fuelcell')) { const t = nearest(f, tanks); if (t) links.push({ fluid: 'hydrolox', from: t.id, to: f.id }); }
  for (const t of tanks) if (touchesPad(t)) links.push({ fluid: 'hydrolox', from: t.id, to: 'pad' });
  return links;
}

/** Cells a pipe may not cross. Belts are crossable: the line bridges over them. */
function solidCells(state) {
  const solid = new Set();
  for (const b of state.buildings) {
    if (b.type === 'conveyor') continue;
    for (const c of footprint(b.type, b.x, b.z, b.rotation)) solid.add(key(c.x, c.z));
  }
  return solid;
}

/**
 * Orthogonal A* from any cell beside `from` to any cell beside `to`, preferring long straight runs. Returns the
 * cells walked plus the footprint cells either end touches, or null when walled off.
 */
function route(state, solid, belts, fromCells, toCells, maxNodes = 8000) {
  const goal = new Map(), free = (x, z) => Math.abs(x) <= GRID_LIMIT && Math.abs(z) <= GRID_LIMIT && !solid.has(key(x, z)) && !onPad(x, z) && !terrainBlocked(state.seed, x * 2, z * 2);
  for (const c of toCells) for (const [dx, dz] of STEPS) if (free(c.x + dx, c.z + dz)) goal.set(key(c.x + dx, c.z + dz), c);
  if (!goal.size) return null;
  const gx = toCells.reduce((s, c) => s + c.x, 0) / toCells.length, gz = toCells.reduce((s, c) => s + c.z, 0) / toCells.length;
  const h = (x, z) => Math.max(0, Math.abs(x - gx) + Math.abs(z - gz) - 2);
  const open = [], came = new Map(), cost = new Map();
  for (const c of fromCells) for (const [dx, dz] of STEPS) {
    const x = c.x + dx, z = c.z + dz, k = `${key(x, z)}:${dx},${dz}`;
    if (!free(x, z) || (cost.get(k) ?? Infinity) <= 0) continue;
    cost.set(k, 0); came.set(k, { start: c }); open.push({ x, z, dx, dz, g: 0, f: h(x, z) });
  }
  let visited = 0;
  while (open.length && visited++ < maxNodes) {
    let best = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const n = open[best]; open[best] = open[open.length - 1]; open.pop();
    const k = `${key(n.x, n.z)}:${n.dx},${n.dz}`;
    if (n.g > cost.get(k)) continue;
    if (goal.has(key(n.x, n.z))) {
      const cells = []; let at = k, start;
      for (;;) { const [xz] = at.split(':'), [x, z] = xz.split(',').map(Number); cells.unshift({ x, z }); const p = came.get(at); if (p.start) { start = p.start; break; } at = p.key; }
      return [start, ...cells, goal.get(key(n.x, n.z))];
    }
    for (const [dx, dz] of STEPS) {
      if (dx === -n.dx && dz === -n.dz) continue;
      const x = n.x + dx, z = n.z + dz; if (!free(x, z)) continue;
      const g = n.g + 1 + (dx !== n.dx || dz !== n.dz ? .6 : 0) + (belts.has(key(x, z)) ? 1.5 : 0), nk = `${key(x, z)}:${dx},${dz}`;
      if (g >= (cost.get(nk) ?? Infinity)) continue;
      cost.set(nk, g); came.set(nk, { key: k }); open.push({ x, z, dx, dz, g, f: g + h(x, z) });
    }
  }
  return null;
}

/**
 * Every pipe run in world metres: `points` start and end inside the two buildings' footprints (the launch pad end
 * stops at its manifold coupling); `bridge` marks the cells where the run lifts over a belt.
 */
export function pipeRuns(state) {
  const byId = new Map(state.buildings.map(b => [b.id, b])), solid = solidCells(state), belts = new Set();
  for (const b of state.buildings) if (b.type === 'conveyor' && b.built) belts.add(key(b.x, b.z));
  const runs = [];
  for (const link of pipeLinks(state)) {
    const from = byId.get(link.from), to = link.to === 'pad' ? null : byId.get(link.to);
    const fromCells = footprint(from.type, from.x, from.z, from.rotation);
    const toCells = to ? footprint(to.type, to.x, to.z, to.rotation) : [{ x: PAD_MANIFOLD.cell.x - 1, z: PAD_MANIFOLD.cell.z }];
    // A tank parked right against the manifold couples straight on.
    const beside = !to && fromCells.find(c => c.x === PAD_MANIFOLD.cell.x && Math.abs(c.z - PAD_MANIFOLD.cell.z) <= 1);
    const cells = beside ? [beside, PAD_MANIFOLD.end] : route(state, solid, belts, fromCells, toCells);
    if (!cells) continue;
    const points = cells.map(c => ({ x: c.x * 2, z: c.z * 2, bridge: belts.has(key(c.x, c.z)) }));
    if (!to) points[points.length - 1] = { ...PAD_MANIFOLD.end, bridge: false };
    runs.push({ ...link, id: `${link.fluid}:${link.from}>${link.to}`, points: simplify(points) });
  }
  return runs;
}
/** Drops points in the middle of straight runs unless a belt bridge needs them. */
function simplify(points) {
  return points.filter((p, i) => {
    if (i === 0 || i === points.length - 1 || p.bridge) return true;
    const a = points[i - 1], b = points[i + 1];
    return (p.x - a.x) * (b.z - p.z) !== (p.z - a.z) * (b.x - p.x) || a.bridge || b.bridge;
  });
}
/** A cheap signature of everything a run depends on, so the view only re-routes when the base changes. */
export const pipeSignature = state => state.buildings.filter(b => b.built || b.type !== 'conveyor').map(b => `${b.id}${b.type[0]}${b.x},${b.z},${b.rotation}${b.built ? 1 : 0}`).join('|');
