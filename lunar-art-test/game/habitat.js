import { CELL_SIZE, DEFS, DIRS, footprint } from './defs.js';

/** Habitat modules merge into connected rooms. Walls stand on grid lines in one-metre segments;
 * each module's airlock is the two segments either side of its front-side centre. */
export const WALL_HALF = 0.12;
export const DOOR_HALF = 0.65;
const key = (x, z) => `${x},${z}`;

function moduleCenter(b) {
  const cells = footprint(b.type, b.x, b.z, b.rotation);
  return { x: cells.reduce((s, c) => s + c.x, 0) / cells.length * CELL_SIZE, z: cells.reduce((s, c) => s + c.z, 0) / cells.length * CELL_SIZE };
}
/** World-space airlock of a module: centre on the front wall line and outward direction. */
export function airlockOf(b) {
  const c = moduleCenter(b), dir = b.rotation, [dx, dz] = DIRS[dir], half = DEFS.habitat.d * CELL_SIZE / 2;
  return { x: c.x + dx * half, z: c.z + dz * half, dir };
}

/** Exterior wall segments, airlocks and connected rooms for the given habitat modules. */
export function computeLayout(modules) {
  const owner = new Map();
  for (const b of modules) for (const c of footprint(b.type, b.x, b.z, b.rotation)) owner.set(key(c.x, c.z), b);
  const doors = new Map(), airlocks = [];
  for (const b of modules) {
    const a = airlockOf(b), [px, pz] = DIRS[(a.dir + 1) % 4];
    const halves = [-0.5, 0.5].map(s => key(a.x + px * s, a.z + pz * s));
    airlocks.push({ ...a, id: b.id, halves, exterior: false });
  }
  const segments = [];
  for (const [k, b] of owner) {
    const [cx, cz] = k.split(',').map(Number);
    DIRS.forEach(([dx, dz], dir) => {
      if (owner.has(key(cx + dx, cz + dz))) return;
      const mx = cx * CELL_SIZE + dx, mz = cz * CELL_SIZE + dz, [px, pz] = DIRS[(dir + 1) % 4];
      for (const s of [-0.5, 0.5]) segments.push({ x: mx + px * s, z: mz + pz * s, dir, id: b.id, cell: { x: cx, z: cz }, kind: 'wall' });
    });
  }
  const byKey = new Map(segments.map(s => [key(s.x, s.z), s]));
  for (const a of airlocks) {
    const halves = a.halves.map(k => byKey.get(k));
    if (halves.every(s => s && s.dir === a.dir)) { a.exterior = true; for (const s of halves) s.kind = 'door'; }
  }
  for (const s of segments) {
    if (s.kind !== 'wall') continue;
    // Windows sit on the middle of each module side, as in the single-module design.
    const b = s.id != null ? modules.find(m => m.id === s.id) : null, c = moduleCenter(b);
    const side = s.dir === (b.rotation + 1) % 4 || s.dir === (b.rotation + 3) % 4;
    if (side && Math.abs((s.dir % 2 ? s.z - c.z : s.x - c.x)) < 1) s.kind = 'window';
  }
  // Connected rooms by flood fill over owned cells.
  const roomOf = new Map(), rooms = [];
  for (const start of owner.keys()) {
    if (roomOf.has(start)) continue;
    const room = { index: rooms.length, cells: [], modules: new Set() }, queue = [start];
    roomOf.set(start, room);
    while (queue.length) {
      const k = queue.pop(), [x, z] = k.split(',').map(Number);
      room.cells.push({ x, z }); room.modules.add(owner.get(k).id);
      for (const [dx, dz] of DIRS) { const n = key(x + dx, z + dz); if (owner.has(n) && !roomOf.has(n)) { roomOf.set(n, room); queue.push(n); } }
    }
    rooms.push(room);
  }
  for (const a of airlocks) a.room = roomOf.get(key(Math.round((a.x - DIRS[a.dir][0]) / CELL_SIZE), Math.round((a.z - DIRS[a.dir][1]) / CELL_SIZE)));
  // Collision: wall segments plus the jambs either side of each exterior door opening.
  const blockers = [];
  for (const s of segments) {
    if (s.kind === 'door') continue;
    const [px, pz] = DIRS[(s.dir + 1) % 4];
    blockers.push({ ax: s.x - px * .5, az: s.z - pz * .5, bx: s.x + px * .5, bz: s.z + pz * .5 });
  }
  for (const a of airlocks) {
    if (!a.exterior) continue;
    const [px, pz] = DIRS[(a.dir + 1) % 4];
    for (const s of [-1, 1]) blockers.push({ ax: a.x + px * s * DOOR_HALF, az: a.z + pz * s * DOOR_HALF, bx: a.x + px * s, bz: a.z + pz * s });
  }
  const grid = new Map();
  for (const w of blockers) {
    const x0 = Math.floor(Math.min(w.ax, w.bx) / CELL_SIZE) - 1, x1 = Math.floor(Math.max(w.ax, w.bx) / CELL_SIZE) + 1;
    const z0 = Math.floor(Math.min(w.az, w.bz) / CELL_SIZE) - 1, z1 = Math.floor(Math.max(w.az, w.bz) / CELL_SIZE) + 1;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = key(x, z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(w); }
  }
  return { owner, segments, airlocks, rooms, roomOf, blockers, grid };
}

const cache = new Map();
const signature = list => list.map(b => `${b.id}:${b.x}:${b.z}:${b.rotation}`).join('|');
/** Memoised layout of finished habitats (collision) or of every habitat including blueprints. */
export function habitatLayout(buildings, { blueprints = false } = {}) {
  const modules = buildings.filter(b => b.type === 'habitat' && (blueprints || b.built)), sig = (blueprints ? 'all|' : 'built|') + signature(modules);
  let layout = cache.get(blueprints);
  if (layout?.sig !== sig) { layout = computeLayout(modules); layout.sig = sig; cache.set(blueprints, layout); }
  return layout;
}

function segmentDistance(w, x, z) {
  const vx = w.bx - w.ax, vz = w.bz - w.az, t = Math.max(0, Math.min(1, ((x - w.ax) * vx + (z - w.az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - (w.ax + vx * t), z - (w.az + vz * t));
}
/** True when a body of `radius` at (x, z) overlaps a habitat wall. */
export function wallBlocks(layout, x, z, radius) {
  const list = layout.grid.get(key(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE)));
  return !!list?.some(w => segmentDistance(w, x, z) < radius + WALL_HALF);
}
/** Room (connected modules) containing the world point, or null. */
export function roomAt(layout, x, z) {
  return layout.roomOf.get(key(Math.round(x / CELL_SIZE), Math.round(z / CELL_SIZE))) ?? null;
}

/** Cells directly outside an airlock that must stay walkable. */
export function airlockApron(a) {
  const [dx, dz] = DIRS[a.dir], [px, pz] = DIRS[(a.dir + 1) % 4];
  return [-0.5, 0.5].map(s => ({ x: Math.round((a.x + px * s + dx) / CELL_SIZE), z: Math.round((a.z + pz * s + dz) / CELL_SIZE) }));
}
/** Rooms that have no exterior airlock with clear ground in front of it. */
export function sealedRooms(buildings) {
  const layout = computeLayout(buildings.filter(b => b.type === 'habitat'));
  const solid = new Set();
  for (const b of buildings) if (!DEFS[b.type]?.walkable) for (const c of footprint(b.type, b.x, b.z, b.rotation)) solid.add(key(c.x, c.z));
  const open = new Set();
  for (const a of layout.airlocks) if (a.exterior && airlockApron(a).every(c => !solid.has(key(c.x, c.z)) && !layout.owner.has(key(c.x, c.z)))) open.add(a.room);
  return layout.rooms.filter(r => !open.has(r)).length;
}
