/** Static building definitions and grid geometry shared by simulation, logistics and presentation. */
export const CELL_SIZE = 2;
// Facing index matches Three.js rotation.y = facing * PI/2 applied to a model whose front is +Z.
export const DIRS = Object.freeze([[0, 1], [1, 0], [0, -1], [-1, 0]]);
export const ITEMS = Object.freeze(['regolith', 'metal', 'silicon']);
const allSides = [0, 1, 2, 3].map(dir => ({ x: 0, z: 0, dir }));
export const DEFS = Object.freeze({
  solar: { name: 'Solar array', w: 2, d: 2, cost: { metal: 18, silicon: 8 }, buildTime: 4, description: 'Generates up to 8 kW in sunlight.' },
  battery: { name: 'Battery bank', w: 1, d: 2, cost: { metal: 14, silicon: 5 }, buildTime: 3, description: 'Stores 180 kJ of surplus power for the lunar night.' },
  hopper: { name: 'Regolith hopper', w: 2, d: 2, cost: { metal: 20, silicon: 2 }, buildTime: 4, capacity: 120, outputs: [{ x: 0, z: 1, dir: 0 }], description: 'The mining rover unloads and recharges here. Feeds regolith onto a belt at its marked output.' },
  habitat: { name: 'Habitat', w: 2, d: 2, cost: { metal: 32, silicon: 8 }, buildTime: 6, walkable: true, description: 'A four-square walkable shelter. Consumes 1 kW.' },
  lamp: { name: 'Work light', w: 1, d: 1, cost: { metal: 4, silicon: 1 }, buildTime: 1.5, description: 'Lights the base at night. Consumes 0.2 kW.' },
  conveyor: { name: 'Conveyor belt', w: 1, d: 1, cost: { metal: 1 }, buildTime: 0.25, walkable: true, description: 'Carries items forward. Drag to lay a line.' },
  processor: { name: 'Regolith processor', w: 2, d: 3, cost: { metal: 45, silicon: 15 }, buildTime: 7, inputs: [{ x: 0, z: 0, dir: 2 }], outputs: [{ x: 0, z: 2, dir: 0 }], description: 'Refines regolith into metal and silicon, venting oxygen to colony reserves. Uses 3 kW while running.' },
  storage: { name: 'Storage crate', w: 1, d: 1, cost: { metal: 10 }, buildTime: 2, capacity: 80, inputs: allSides, description: 'Accepts items from belts on any side. Press E nearby to collect.' },
});

export function dims(type, rotation = 0) {
  const def = DEFS[type];
  return rotation % 2 ? { w: def.d, d: def.w } : { w: def.w, d: def.d };
}
export function footprint(type, x, z, rotation = 0) {
  const def = DEFS[type];
  if (!def || !Number.isSafeInteger(x) || !Number.isSafeInteger(z) || !Number.isInteger(rotation) || rotation < 0 || rotation > 3) return [];
  const { w, d } = dims(type, rotation), cells = [];
  for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < d; dz++) cells.push({ x: x + dx, z: z + dz });
  return cells;
}
/** Rotates a rotation-0 local cell into the world grid around the footprint centre. */
export function localToCell(b, lx, lz) {
  const def = DEFS[b.type], { w, d } = dims(b.type, b.rotation);
  const ox = lx - (def.w - 1) / 2, oz = lz - (def.d - 1) / 2;
  const [rx, rz] = [[ox, oz], [oz, -ox], [-ox, -oz], [-oz, ox]][b.rotation];
  return { x: b.x + (w - 1) / 2 + rx, z: b.z + (d - 1) / 2 + rz };
}
/** World ports: `cell` is inside the machine, `neighbor` is the outside cell the belt occupies. */
export function ports(b, kind) {
  return (DEFS[b.type]?.[kind] ?? []).map(p => {
    const cell = localToCell(b, p.x, p.z), dir = (p.dir + b.rotation) % 4;
    return { cell, dir, neighbor: { x: cell.x + DIRS[dir][0], z: cell.z + DIRS[dir][1] } };
  });
}
