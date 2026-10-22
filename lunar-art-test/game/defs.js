/** Static building definitions and grid geometry shared by simulation, logistics and presentation. */
export const CELL_SIZE = 2;
// Facing index matches Three.js rotation.y = facing * PI/2 applied to a model whose front is +Z.
export const DIRS = Object.freeze([[0, 1], [1, 0], [0, -1], [-1, 0]]);
/** Items that travel on belts and fill machines. */
export const ITEMS = Object.freeze(['regolith', 'metal', 'silicon', 'ice']);
/** Items the player can carry. `food` is how much satiety eating one restores. */
export const ITEM_INFO = Object.freeze({
  metal: { name: 'Metal', stack: 200 },
  silicon: { name: 'Silicon', stack: 200 },
  crop: { name: 'Potatoes', stack: 30, food: 15 },
  meal: { name: 'Meal', stack: 10, food: 40 },
  core: { name: 'Processor core', stack: 1 },
});
const allSides = [0, 1, 2, 3].map(dir => ({ x: 0, z: 0, dir }));
// `layer`: 'floor' squares form rooms, 'interior' objects stand on finished floor of the `needs` room type,
// everything else occupies open ground. `key` is the build shortcut, kept only for things placed constantly. `inset` shrinks a fitting's collision
// box (metres per side) so the player can step up to it.
export const DEFS = Object.freeze({
  solar: { name: 'Solar array', w: 2, d: 2, cost: { metal: 18, silicon: 8 }, buildTime: 4, description: 'Generates up to 8 kW in sunlight.' },
  battery: { name: 'Battery bank', w: 1, d: 2, cost: { metal: 14, silicon: 5 }, buildTime: 3, description: 'Stores 180 kJ of surplus power for the lunar night.' },
  hopper: { name: 'Regolith hopper', w: 2, d: 2, cost: { metal: 20, silicon: 2 }, buildTime: 4, capacity: 120, outputs: [{ x: 0, z: 1, dir: 0 }], description: 'The mining rover unloads and recharges here. Feeds regolith onto a belt at its marked output.' },
  habitat: { name: 'Habitat', key: 'h', w: 1, d: 1, cost: { metal: 8, silicon: 2 }, buildTime: 1.5, layer: 'floor', room: 'habitat', paint: true, walkable: true, enclosed: true, power: 0.25, description: 'Drag to paint living space. Walls and roof form around the shape. 0.25 kW per square.' },
  greenhouse: { name: 'Greenhouse', w: 1, d: 1, cost: { metal: 4, silicon: 6 }, buildTime: 1.5, layer: 'floor', room: 'greenhouse', paint: true, walkable: true, enclosed: true, power: 0.25, description: 'Drag to paint glazed growing space. Joins habitats into one building.' },
  airlock: { name: 'Airlock', w: 1, d: 1, cost: { metal: 12, silicon: 4 }, buildTime: 3, layer: 'floor', room: 'airlock', airlock: true, walkable: true, enclosed: true, power: 0.2, description: 'Place against a room with its arrow facing out. The only way in or out.' },
  growbed: { name: 'Grow bed', w: 1, d: 1, inset: 0.15, cost: { metal: 6, silicon: 2 }, buildTime: 2, layer: 'interior', needs: 'greenhouse', description: 'Grows potatoes in a pressurised greenhouse. Uses water and 0.4 kW while growing.' },
  galley: { name: 'Galley', w: 1, d: 1, inset: 0.3, cost: { metal: 14, silicon: 4 }, buildTime: 3, layer: 'interior', needs: 'habitat', description: 'Cooks 2 potatoes into a filling meal. Uses 1.5 kW while cooking.' },
  recycler: { name: 'Water recycler', w: 1, d: 1, inset: 0.25, cost: { metal: 10, silicon: 6 }, buildTime: 3, layer: 'interior', needs: 'habitat', description: 'Reclaims water inside a pressurised habitat. Uses 0.5 kW.' },
  conveyor: { name: 'Conveyor belt', key: 'c', w: 1, d: 1, cost: { metal: 1 }, buildTime: 0.25, walkable: true, description: 'Carries items forward. Drag a route; it can turn corners.' },
  processor: { name: 'Regolith processor', w: 2, d: 3, cost: { metal: 45, silicon: 15 }, buildTime: 7, inputs: [{ x: 0, z: 0, dir: 2 }], outputs: [{ x: 0, z: 2, dir: 0 }], description: 'Refines regolith into metal and silicon, venting oxygen to colony reserves. Uses 3 kW while running.' },
  melter: { name: 'Ice melter', w: 1, d: 2, cost: { metal: 24, silicon: 6 }, buildTime: 4, inputs: [{ x: 0, z: 0, dir: 2 }], description: 'Melts ice from a belt into the colony water reserve. Uses 1.5 kW while melting.' },
  storage: { name: 'Storage crate', w: 1, d: 1, cost: { metal: 10 }, buildTime: 2, capacity: 80, inputs: allSides, description: 'Accepts items from belts on any side. Press E nearby to collect.' },
});
/** Stencil codes for machine callouts: `MLT-02` is the second ice melter built. */
export const CODES = Object.freeze({ solar: 'SOL', battery: 'BAT', hopper: 'HOP', habitat: 'HAB', greenhouse: 'GRN', airlock: 'ALK', growbed: 'BED', galley: 'GAL', recycler: 'RCY', conveyor: 'BLT', processor: 'PRC', melter: 'MLT', storage: 'CRT' });
export const tagOf = b => `${CODES[b.type] ?? 'UNT'}-${String(b.serial ?? 0).padStart(2, '0')}`;
export const ROOM_TYPES = Object.freeze(Object.keys(DEFS).filter(type => DEFS[type].layer === 'floor'));

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
