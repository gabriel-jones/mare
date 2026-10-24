import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A grow bed is an open tray filling its 2 m cell. Each cell is cut into 3x3 blocks: the middle is always tray, a side
// block only where another bed joins on that side, and a corner block only where both its sides and the bed across
// the diagonal join too. Rims run wherever tray meets a gap, so joined beds read as one tray of any shape.
const EDGE = .84, RIM = .07;
const SPANS = [[-1, -EDGE], [-EDGE, EDGE], [EDGE, 1]];
const PARTS = ['base', 'body', 'soil', 'rim', 'stripe'];

/** Which blocks of a cell are tray, as [i][j] over x then z, given `joined(dx, dz)` for the eight neighbours. */
export function trayBlocks(joined) {
  const filled = (i, j) => {
    const sx = i - 1, sz = j - 1;
    if (!sx && !sz) return true;
    if (!sz) return joined(sx, 0);
    if (!sx) return joined(0, sz);
    return joined(sx, 0) && joined(0, sz) && joined(sx, sz);
  };
  return [0, 1, 2].map(i => [0, 1, 2].map(j => filled(i, j)));
}

const box = (x0, x1, y0, y1, z0, z1) => new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

/** One merged geometry per tray part for a cell with the given neighbours. */
export function trayGeometry(joined) {
  const blocks = trayBlocks(joined), parts = Object.fromEntries(PARTS.map(p => [p, []]));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    if (!blocks[i][j]) continue;
    const [x0, x1] = SPANS[i], [z0, z1] = SPANS[j];
    parts.base.push(box(x0, x1, 0, .06, z0, z1));
    parts.body.push(box(x0, x1, .06, .44, z0, z1));
    parts.soil.push(box(x0, x1, .44, .49, z0, z1));
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || ni > 2 || nj < 0 || nj > 2 || blocks[ni][nj]) continue;
      if (di) {
        const x = di > 0 ? x1 : x0, s = Math.sign(di);
        parts.rim.push(box(Math.min(x, x - s * RIM), Math.max(x, x - s * RIM), .38, .56, z0, z1));
        parts.stripe.push(box(Math.min(x, x + s * .012), Math.max(x, x + s * .012), .26, .32, z0, z1));
      } else {
        const z = dj > 0 ? z1 : z0, s = Math.sign(dj);
        parts.rim.push(box(x0, x1, .38, .56, Math.min(z, z - s * RIM), Math.max(z, z - s * RIM)));
        parts.stripe.push(box(x0, x1, .26, .32, Math.min(z, z + s * .012), Math.max(z, z + s * .012)));
      }
    }
  }
  return Object.fromEntries(PARTS.map(p => {
    const merged = parts[p].length ? mergeGeometries(parts[p]) : new THREE.BufferGeometry();
    parts[p].forEach(g => g.dispose());
    return [p, merged];
  }));
}

/**
 * A tray model wearing the grow bed asset's materials and plants. `setJoined(joined)` reshapes it for its neighbours,
 * given in the model's own (unrotated) frame.
 */
export function createTray(template) {
  const materials = {};
  template.traverse(n => { if (n.isMesh) for (const m of [n.material].flat()) materials[m.name] = m; });
  const pick = (pattern, fallback) => Object.entries(materials).find(([name]) => pattern.test(name))?.[1] ?? new THREE.MeshStandardMaterial({ color: fallback, roughness: .8 });
  const look = { base: pick(/graphite/, '#121a20'), body: pick(/ivory/, '#c7c9b5'), soil: pick(/substrate/, '#1c130d'), rim: pick(/graphite/, '#121a20'), stripe: pick(/orange/, '#cc360b') };
  const root = new THREE.Group(), tray = new THREE.Group(); tray.name = 'Tray'; root.add(tray);
  const meshes = PARTS.map(p => { const m = new THREE.Mesh(new THREE.BufferGeometry(), look[p]); m.name = `Tray ${p}`; tray.add(m); return m; });
  let key = null;
  const setJoined = joined => {
    const next = [-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dz => (dx || dz) && joined(dx, dz) ? 1 : 0)).join('');
    if (next === key) return;
    key = next;
    const geometry = trayGeometry(joined);
    meshes.forEach((m, i) => { m.geometry.dispose(); m.geometry = geometry[PARTS[i]]; });
  };
  setJoined(() => false);
  // The asset's plant clump is sized for its smaller tray; spread it to cover a whole cell.
  const spread = new THREE.Group(); spread.scale.set(1.3, 1, 1.6); root.add(spread);
  let plants = null;
  template.traverse(n => { if (!plants && n.name.replace(/\.?\d{3}$/, '') === 'Plants') plants = n.clone(true); });
  if (plants) { plants.position.set(0, 0, 0); spread.add(plants); }
  return { root, tray, plants, setJoined };
}
