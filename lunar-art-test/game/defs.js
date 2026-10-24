/** Static building definitions and grid geometry shared by simulation, logistics and presentation. */
export const CELL_SIZE = 2;
// Facing index matches Three.js rotation.y = facing * PI/2 applied to a model whose front is +Z.
export const DIRS = Object.freeze([[0, 1], [1, 0], [0, -1], [-1, 0]]);
/** Items that travel on belts and fill machines. */
export const ITEMS = Object.freeze(['regolith', 'metal', 'silicon', 'ice', 'frame', 'wing', 'chip', 'satellite']);
/** Satellite parts a fabricator can make, and what each costs. */
export const PARTS = Object.freeze({
  frame: { name: 'Satellite frame', input: { metal: 4 } },
  wing: { name: 'Solar wing', input: { metal: 1, silicon: 3 } },
  chip: { name: 'Compute chip', input: { silicon: 4 } },
});
/** Items the player can carry. `food` is how much satiety eating one restores; `heal` is suit health. */
export const ITEM_INFO = Object.freeze({
  metal: { name: 'Metal', stack: 200 },
  silicon: { name: 'Silicon', stack: 200 },
  regolith: { name: 'Regolith', stack: 100 },
  ice: { name: 'Ice', stack: 50 },
  crop: { name: 'Potatoes', stack: 30, food: 15 },
  greens: { name: 'Greens', stack: 30, food: 8 },
  soy: { name: 'Soybeans', stack: 30, food: 6 },
  tomato: { name: 'Tomatoes', stack: 30, food: 10 },
  algae: { name: 'Algae', stack: 30, food: 5 },
  wheat: { name: 'Wheat', stack: 40 },
  mushroom: { name: 'Mushrooms', stack: 30, food: 8 },
  flour: { name: 'Flour', stack: 30 },
  protein: { name: 'Soy protein', stack: 30 },
  meal: { name: 'Hash browns', stack: 10, food: 40 },
  salad: { name: 'Salad', stack: 10, food: 30 },
  bread: { name: 'Bread', stack: 10, food: 45 },
  stew: { name: 'Soy stew', stack: 10, food: 50 },
  broth: { name: 'Mushroom broth', stack: 10, food: 30 },
  algaecake: { name: 'Algae cakes', stack: 10, food: 35 },
  pizza: { name: 'Pizza', stack: 10, food: 60 },
  medkit: { name: 'Medkit', stack: 5, heal: 50 },
  core: { name: 'Processor core', stack: 1 },
  frame: { name: 'Satellite frame', stack: 10 },
  wing: { name: 'Solar wing', stack: 10 },
  chip: { name: 'Compute chip', stack: 10 },
  satellite: { name: 'AI satellite', stack: 1 },
  titanium: { name: 'Titanium ore', stack: 40 },
  rareearth: { name: 'Rare-earth crystal', stack: 10 },
  artifact: { name: 'Alien artifact', stack: 5 },
  heart: { name: 'Heart of the Deep', stack: 1 },
  goo: { name: 'Black goo', stack: 20 },
  flare: { name: 'Flare', stack: 12 },
  rounds: { name: 'Rounds', stack: 60 },
  fuel: { name: 'Fuel cell', stack: 10 },
  charge: { name: 'Power cell', stack: 20 },
  pistol: { name: 'Pistol', stack: 1 },
  smg: { name: 'Submachine gun', stack: 1 },
  katana: { name: 'Electric katana', stack: 1 },
  rifle: { name: 'Semi-auto rifle', stack: 1 },
  flamethrower: { name: 'Flamethrower', stack: 1 },
  arc: { name: 'Arc projector', stack: 1 },
  railgun: { name: 'Railgun', stack: 1 },
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
  growbed: { name: 'Grow bed', w: 1, d: 1, inset: 0.15, cost: { metal: 6, silicon: 2 }, buildTime: 2, layer: 'interior', needs: 'greenhouse', description: 'An open tray for potatoes or greens in a pressurised greenhouse. Place beds side by side to join them into one bed. Uses water and 0.4 kW while growing.' },
  hydrorack: { name: 'Hydroponic rack', w: 1, d: 1, inset: 0.2, cost: { metal: 12, silicon: 6 }, buildTime: 3, layer: 'interior', needs: 'greenhouse', research: 'hydroponics', description: 'Grows soybeans, tomatoes or algae in a greenhouse, once each is researched.' },
  verticalfarm: { name: 'Vertical farm', w: 1, d: 2, inset: 0.15, cost: { metal: 24, silicon: 10 }, buildTime: 5, layer: 'interior', needs: 'greenhouse', research: 'vertical', description: 'A tower of trays for wheat, the hungriest crop for space. Uses 0.8 kW while growing.' },
  mushroomtray: { name: 'Mushroom tray', w: 1, d: 1, inset: 0.2, cost: { metal: 8, silicon: 2 }, buildTime: 2, layer: 'interior', needs: 'habitat', research: 'mycology', description: 'Grows mushrooms in the dark of a habitat room. No power, a little water.' },
  galley: { name: 'Galley', w: 1, d: 1, inset: 0.3, cost: { metal: 14, silicon: 4 }, buildTime: 3, layer: 'interior', needs: 'habitat', description: 'Cooks crops into meals; better recipes give lasting effects. Uses 1.5 kW while cooking.' },
  armory: { name: 'Armory', w: 1, d: 1, inset: 0.25, cost: { metal: 20, silicon: 6 }, buildTime: 4, layer: 'interior', needs: 'habitat', description: 'A workbench that crafts weapons, rounds and fuel cells from your pack.' },
  goovat: { name: 'Goo vat', w: 1, d: 1, inset: 0.25, cost: { metal: 24, silicon: 6, titanium: 4 }, buildTime: 5, layer: 'interior', needs: 'habitat', research: 'containment', description: 'Cultures black goo from a nest sample. Uses 2 kW once seeded; if the power fails it breaches.' },
  mill: { name: 'Mill', w: 1, d: 1, inset: 0.25, cost: { metal: 16, silicon: 4 }, buildTime: 3, layer: 'interior', needs: 'habitat', research: 'processing', description: 'Grinds wheat into flour and soybeans into protein. Uses 1 kW while milling.' },
  recycler: { name: 'Water recycler', w: 1, d: 1, inset: 0.25, cost: { metal: 10, silicon: 6 }, buildTime: 3, layer: 'interior', needs: 'habitat', description: 'Reclaims water inside a pressurised habitat. Uses 0.5 kW.' },
  conveyor: { name: 'Conveyor belt', key: 'c', w: 1, d: 1, cost: { metal: 1 }, buildTime: 0.25, walkable: true, description: 'Carries items forward. Drag a route; it can turn corners.' },
  processor: { name: 'Regolith processor', w: 2, d: 3, cost: { metal: 45, silicon: 15 }, buildTime: 7, inputs: [{ x: 0, z: 0, dir: 2 }], outputs: [{ x: 0, z: 2, dir: 0 }], description: 'Refines regolith into metal and silicon, venting oxygen to colony reserves. Uses 3 kW while running.' },
  melter: { name: 'Ice melter', w: 1, d: 2, cost: { metal: 24, silicon: 6 }, buildTime: 4, inputs: [{ x: 0, z: 0, dir: 2 }], description: 'Melts ice from a belt into the colony water reserve. Uses 1.5 kW while melting.' },
  storage: { name: 'Storage crate', w: 1, d: 1, cost: { metal: 10 }, buildTime: 2, slots: 12, inputs: allSides, description: 'Holds 12 stacks of anything. Belts and haulers fill it, and a belt leading away pulls items out; press E to move things in and out. Every crate adds to one base stock that building and crafting draw on.' },
  fabricator: { name: 'Fabricator', w: 2, d: 2, cost: { metal: 30, silicon: 10 }, buildTime: 5, inputs: [{ x: 0, z: 0, dir: 2 }], outputs: [{ x: 1, z: 1, dir: 0 }], description: 'Makes satellite frames, solar wings or compute chips from metal and silicon. Press E to change part. Uses 2 kW.' },
  assembler: { name: 'Satellite assembler', w: 2, d: 3, cost: { metal: 50, silicon: 20 }, buildTime: 8, inputs: [{ x: 0, z: 0, dir: 2 }], outputs: [{ x: 1, z: 2, dir: 0 }], description: 'Builds an AI satellite from 1 frame, 2 solar wings and 2 chips. Press E to take a finished one. Uses 4 kW.' },
  electrolyser: { name: 'Electrolyser', w: 1, d: 2, cost: { metal: 20, silicon: 8 }, buildTime: 4, description: 'Splits colony water into hydrogen and oxygen propellant for the nearest propellant tank. Uses 3 kW.' },
  tank: { name: 'Propellant tank', w: 2, d: 2, cost: { metal: 30, silicon: 4 }, buildTime: 5, capacity: 100, nearPad: true, description: 'Holds hydrolox propellant. Must touch the landing pad to fuel the Starship.' },
  dock: { name: 'Robot dock', w: 2, d: 2, cost: { metal: 30, silicon: 10 }, buildTime: 5, description: 'Recharges haulers between jobs. Every hauler needs one.' },
  roverbay: { name: 'Robot bay', w: 2, d: 2, cost: { metal: 40, silicon: 15 }, buildTime: 6, research: 'roverbay', description: 'Assembles haulers and rovers on its own from base stock. Click it to queue robots. Uses 1 kW while working.' },
  // Robots are put together like a blueprint; the finished one drives off and the pad is gone.
  hauler: { name: 'Hauler', w: 1, d: 1, cost: { metal: 25, silicon: 10 }, buildTime: 6, robot: 'hauler', description: 'Carries materials, parts and satellites between crates, machines and the Starship. Needs a robot dock to recharge.' },
  rover: { name: 'Mining rover', w: 1, d: 1, cost: { metal: 30, silicon: 12 }, buildTime: 8, robot: 'miner', description: 'Digs regolith or ice in mining zones and hauls it to hoppers and melters.' },
  xenolab: { name: 'Xeno lab', w: 2, d: 2, cost: { metal: 35, silicon: 12, titanium: 6 }, buildTime: 6, description: 'Studies alien artifacts from the caves (press E) and turns them into research points. Needs titanium ore from underground.' },
  reactor: { name: 'Resonance reactor', w: 2, d: 2, cost: { metal: 30, titanium: 12, rareearth: 4 }, buildTime: 8, research: 'reactor', description: 'An alien design: a rare-earth lattice that gives a steady 10 kW, day and night. Needs its schematic from the caves, then research.' },
  fuelcell: { name: 'Fuel cell stack', w: 2, d: 2, cost: { metal: 28, silicon: 10 }, buildTime: 5, description: 'Burns tank propellant for up to 6 kW once the batteries run low. Gets back two thirds of what the electrolyser spent; electrolysers stand down while it runs.' },
  thermal: { name: 'Thermal store', w: 2, d: 2, cost: { metal: 16, silicon: 2 }, buildTime: 4, inputs: [{ x: 0, z: 0, dir: 2 }], description: 'Packed regolith banks surplus heat by day and runs a Stirling engine at night. Rovers and belts fill it: 12 kJ of storage per load, up to 480 kJ.' },
  rtg: { name: 'RTG', w: 1, d: 1, cost: { metal: 10, titanium: 6, rareearth: 2 }, buildTime: 4, description: 'A radioisotope core: a steady 2 kW forever, nothing to feed, nothing to break. Needs cave titanium and rare earth.' },
  bioreactor: { name: 'Goo bioreactor', w: 2, d: 2, cost: { metal: 30, silicon: 8, titanium: 6 }, buildTime: 7, research: 'containment', description: 'Digests black goo for 12 kW, one goo every 40 s; press E to feed it. Starve a live culture for 30 s and it breaches.' },
});
/** Stencil codes for machine callouts: `MLT-02` is the second ice melter built. */
export const CODES = Object.freeze({ solar: 'SOL', battery: 'BAT', hopper: 'HOP', habitat: 'HAB', greenhouse: 'GRN', airlock: 'ALK', growbed: 'BED', hydrorack: 'HYD', verticalfarm: 'VRT', mushroomtray: 'MSH', mill: 'MIL', goovat: 'VAT', armory: 'ARM', galley: 'GAL', recycler: 'RCY', conveyor: 'BLT', processor: 'PRC', melter: 'MLT', storage: 'CRT', fabricator: 'FAB', assembler: 'ASM', electrolyser: 'ELY', tank: 'TNK', dock: 'DCK', roverbay: 'RVB', hauler: 'HLR', rover: 'RVR', xenolab: 'XEN', reactor: 'RCT', fuelcell: 'FCS', thermal: 'THS', rtg: 'RTG', bioreactor: 'BIO' });
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
