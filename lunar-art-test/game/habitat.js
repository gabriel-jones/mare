import { CELL_SIZE, DEFS, DIRS, footprint } from './defs.js';

/** Painted room squares (habitat, greenhouse, airlock) that touch form one building. Walls stand on
 * grid lines in one-metre segments wherever a room square meets open ground; an airlock square has a
 * door on its outward (`rotation`) edge. Everything here is derived, never saved. */
export const WALL_HALF = 0.12;
const key = (x, z) => `${x},${z}`;
export const isRoom = b => DEFS[b.type]?.layer === 'floor';

/** World-space door of an airlock square: centre of its outward edge and the outward direction. */
export function airlockOf(b) {
  const [dx, dz] = DIRS[b.rotation];
  return { x: b.x * CELL_SIZE + dx, z: b.z * CELL_SIZE + dz, dir: b.rotation };
}
/** The open-ground cell an airlock opens onto. */
export const airlockApron = b => ({ x: b.x + DIRS[b.rotation][0], z: b.z + DIRS[b.rotation][1] });

export function computeLayout(squares) {
  const owner = new Map();
  for (const b of squares) owner.set(key(b.x, b.z), b);
  const segments = [], airlocks = [];
  for (const b of squares) {
    const room = DEFS[b.type].room;
    DIRS.forEach(([dx, dz], dir) => {
      if (owner.has(key(b.x + dx, b.z + dz))) return;
      const mx = b.x * CELL_SIZE + dx, mz = b.z * CELL_SIZE + dz, [px, pz] = DIRS[(dir + 1) % 4];
      const along = dir % 2 ? b.z : b.x;
      const kind = room === 'greenhouse' ? 'glass' : room === 'airlock' ? (dir === b.rotation ? 'door' : 'wall') : ((along % 3) + 3) % 3 === 1 ? 'window' : 'wall';
      for (const s of [-0.5, 0.5]) segments.push({ x: mx + px * s, z: mz + pz * s, dir, id: b.id, cell: { x: b.x, z: b.z }, room, kind });
    });
    if (room === 'airlock') {
      const [dx, dz] = DIRS[b.rotation];
      airlocks.push({ ...airlockOf(b), id: b.id, exterior: !owner.has(key(b.x + dx, b.z + dz)), apron: airlockApron(b) });
    }
  }
  // Connected rooms by flood fill.
  const roomOf = new Map(), rooms = [];
  for (const start of owner.keys()) {
    if (roomOf.has(start)) continue;
    const room = { index: rooms.length, cells: [], modules: new Set() }, queue = [start];
    roomOf.set(start, room);
    while (queue.length) {
      const k = queue.pop(), b = owner.get(k);
      room.cells.push({ x: b.x, z: b.z, type: b.type }); room.modules.add(b.id);
      for (const [dx, dz] of DIRS) { const n = key(b.x + dx, b.z + dz); if (owner.has(n) && !roomOf.has(n)) { roomOf.set(n, room); queue.push(n); } }
    }
    rooms.push(room);
  }
  for (const a of airlocks) a.room = roomOf.get(key(Math.round((a.x - DIRS[a.dir][0]) / CELL_SIZE), Math.round((a.z - DIRS[a.dir][1]) / CELL_SIZE)));
  // Collision: every wall segment. An airlock's door edge is open wall to wall, so nobody snags on a jamb.
  const blockers = [];
  for (const s of segments) {
    if (s.kind === 'door') continue;
    const [px, pz] = DIRS[(s.dir + 1) % 4];
    blockers.push({ ax: s.x - px * .5, az: s.z - pz * .5, bx: s.x + px * .5, bz: s.z + pz * .5 });
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
const signature = list => list.map(b => `${b.id}:${b.type}:${b.x}:${b.z}:${b.rotation}`).join('|');
/** Memoised layout of finished room squares (collision) or of every room square including blueprints. */
export function habitatLayout(buildings, { blueprints = false } = {}) {
  const squares = buildings.filter(b => isRoom(b) && (blueprints || b.built)), sig = (blueprints ? 'all|' : 'built|') + signature(squares);
  let layout = cache.get(blueprints);
  if (layout?.sig !== sig) { layout = computeLayout(squares); layout.sig = sig; cache.set(blueprints, layout); }
  return layout;
}

function segmentDistance(w, x, z) {
  const vx = w.bx - w.ax, vz = w.bz - w.az, t = Math.max(0, Math.min(1, ((x - w.ax) * vx + (z - w.az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(x - (w.ax + vx * t), z - (w.az + vz * t));
}
/** True when a body of `radius` at (x, z) overlaps a room wall. */
export function wallBlocks(layout, x, z, radius) {
  const list = layout.grid.get(key(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE)));
  return !!list?.some(w => segmentDistance(w, x, z) < radius + WALL_HALF);
}
/** Room containing the world point, or null. */
export function roomAt(layout, x, z) {
  return layout.roomOf.get(key(Math.round(x / CELL_SIZE), Math.round(z / CELL_SIZE))) ?? null;
}
/** Cells occupied by anything that would stand in an airlock's way. */
export function solidCells(buildings) {
  const solid = new Set();
  for (const b of buildings) if (!DEFS[b.type]?.walkable) for (const c of footprint(b.type, b.x, b.z, b.rotation)) solid.add(key(c.x, c.z));
  return solid;
}
/** Rooms with an exterior airlock opening onto clear ground. */
export function openRooms(layout, buildings) {
  const solid = solidCells(buildings), open = new Set();
  for (const a of layout.airlocks) if (a.exterior && !solid.has(key(a.apron.x, a.apron.z))) open.add(a.room);
  return open;
}
/** Whether the player at (x, z) would be inside a wall or shut in a room with no usable airlock,
 * given the finished room squares in `buildings`. */
export function trapsPlayer(buildings, x, z, radius) {
  const layout = computeLayout(buildings.filter(b => isRoom(b) && b.built));
  if (wallBlocks(layout, x, z, radius)) return true;
  const room = roomAt(layout, x, z);
  return !!room && !openRooms(layout, buildings).has(room);
}
