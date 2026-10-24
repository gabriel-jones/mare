import { DEFS, DIRS, footprint } from './defs.js';

/**
 * Belts tilt so their ends meet what they join on uneven ground: a belt meets the next belt halfway between
 * their two ground heights, and a machine at the machine's own height. Each belt becomes a plane through its
 * centre: `y` there, rising `gx` per metre of x and `gz` per metre of z. Corners tilt to meet both ends.
 * View-only; derived from the layout and cached until it changes.
 */
let cache = { sig: null, slopes: null };
const centre = b => {
  const d = DEFS[b.type], w = b.rotation % 2 ? d.d : d.w, depth = b.rotation % 2 ? d.w : d.d;
  return [(b.x + (w - 1) / 2) * 2, (b.z + (depth - 1) / 2) * 2];
};
export function beltSlopes(state, turns, heightAt) {
  const sig = `${state.seed}|` + state.buildings.map(b => `${b.id}:${b.type}:${b.x}:${b.z}:${b.rotation}`).join('|');
  if (cache.sig === sig) return cache.slopes;
  const cells = new Map();
  for (const b of state.buildings) for (const c of footprint(b.type, b.x, b.z, b.rotation)) cells.set(`${c.x},${c.z}`, b);
  const ground = b => heightAt(...centre(b)), slopes = new Map();
  for (const b of state.buildings) {
    if (b.type !== 'conveyor') continue;
    const own = ground(b), turn = turns.get(b.id) ?? 0, f = DIRS[b.rotation];
    const e = turn ? DIRS[(b.rotation + (turn > 0 ? 1 : 3)) % 4] : [-f[0], -f[1]];
    const edge = ([dx, dz]) => {
      const n = cells.get(`${b.x + dx},${b.z + dz}`);
      if (!n || n === b || DEFS[n.type].layer) return own;
      return n.type === 'conveyor' ? (own + ground(n)) / 2 : ground(n);
    };
    const out = edge(f), into = edge(e), y = (out + into) / 2;
    // Edges sit one metre from the centre, so the rise to each is the gradient along that direction.
    const gx = turn ? f[0] * (out - y) + e[0] * (into - y) : f[0] * (out - y);
    const gz = turn ? f[1] * (out - y) + e[1] * (into - y) : f[1] * (out - y);
    slopes.set(b.id, { y, gx, gz });
  }
  cache = { sig, slopes };
  return slopes;
}
/** Height of the belt surface plane at world (x, z), measured from the belt's ground origin. */
export const beltHeight = (b, slope, x, z) => slope.y + slope.gx * (x - b.x * 2) + slope.gz * (z - b.z * 2);
