import { DEFS, footprint } from './defs.js';
import { terrainBlocked } from './terrain.js';

export const GRID_LIMIT = 58;
const terrainCache = new Map();
function terrainCell(seed, x, z) {
  let cache = terrainCache.get(seed);
  if (!cache) { cache = new Map(); terrainCache.set(seed, cache); }
  const key = x * 1000 + z;
  if (!cache.has(key)) cache.set(key, terrainBlocked(seed, x * 2, z * 2) || Math.hypot(x * 2, z * 2 + 10) < 3);
  return cache.get(key);
}
/** Robots drive over belts and blueprints; other finished structures, habitats included, are solid. */
export function robotBlockedCells(state) {
  const blocked = new Set();
  for (const b of state.buildings) {
    if (!b.built || (DEFS[b.type].walkable && !DEFS[b.type].enclosed)) continue;
    for (const c of footprint(b.type, b.x, b.z, b.rotation)) blocked.add(`${c.x},${c.z}`);
  }
  return blocked;
}
export function cellPassable(state, blocked, x, z) {
  return Math.abs(x) <= GRID_LIMIT && Math.abs(z) <= GRID_LIMIT && !blocked.has(`${x},${z}`) && !terrainCell(state.seed, x, z);
}
function push(heap, node) {
  heap.push(node);
  for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p].f <= heap[i].f) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
}
function pop(heap) {
  const top = heap[0], last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    for (let i = 0; ;) {
      const l = i * 2 + 1, r = l + 1; let m = i;
      if (l < heap.length && heap[l].f < heap[m].f) m = l;
      if (r < heap.length && heap[r].f < heap[m].f) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
    }
  }
  return top;
}
/** 8-connected A* over construction cells; diagonal moves never cut blocked corners. */
export function findPath(state, from, to, maxNodes = 16000) {
  const blocked = robotBlockedCells(state), key = (x, z) => `${x},${z}`;
  if (!cellPassable(state, blocked, to.x, to.z)) return null;
  const open = [{ x: from.x, z: from.z, g: 0, f: 0 }], came = new Map(), cost = new Map([[key(from.x, from.z), 0]]);
  const h = (x, z) => { const dx = Math.abs(x - to.x), dz = Math.abs(z - to.z); return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz); };
  let visited = 0;
  while (open.length && visited++ < maxNodes) {
    const node = pop(open);
    if (node.x === to.x && node.z === to.z) {
      const path = [{ x: node.x, z: node.z }];
      for (let k = key(node.x, node.z); came.has(k);) { const p = came.get(k); path.unshift({ x: p.x, z: p.z }); k = key(p.x, p.z); }
      return path;
    }
    if (node.g > cost.get(key(node.x, node.z))) continue;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const x = node.x + dx, z = node.z + dz;
      if (!cellPassable(state, blocked, x, z)) continue;
      if (dx && dz && (!cellPassable(state, blocked, node.x + dx, node.z) || !cellPassable(state, blocked, node.x, node.z + dz))) continue;
      const g = node.g + (dx && dz ? Math.SQRT2 : 1), k = key(x, z);
      if (g >= (cost.get(k) ?? Infinity)) continue;
      cost.set(k, g); came.set(k, { x: node.x, z: node.z });
      push(open, { x, z, g, f: g + h(x, z) });
    }
  }
  return null;
}
