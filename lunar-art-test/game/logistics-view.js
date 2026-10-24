import * as THREE from 'three';

// The logistics area round each storage crate: within it, building and crafting can draw on crate stock.
// A faint wash of ground with a bright rim, draped over the terrain, shown while placing or building.
const SEGMENTS = 128, RINGS = 14, RIM = .32, LIFT = .12;

export function createLogisticsView(scene, { heightAt, radius }) {
  const group = new THREE.Group(); group.visible = false; scene.add(group);
  const rimMat = new THREE.MeshBasicMaterial({ color: '#edbd79', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide });
  const washMat = new THREE.MeshBasicMaterial({ color: '#edbd79', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
  const areas = new Map();
  let fade = 0, key = '';

  function area(x, z) {
    const at = (r, a) => { const px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r; return [px, heightAt(px, pz) + LIFT, pz]; };
    const rim = [], wash = [], rimIndex = [], washIndex = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = i / SEGMENTS * Math.PI * 2;
      rim.push(...at(radius - RIM, a), ...at(radius + RIM, a));
      if (i < SEGMENTS) { const k = i * 2; rimIndex.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      for (let j = 0; j <= RINGS; j++) wash.push(...at(radius * j / RINGS, a));
      if (i < SEGMENTS) for (let j = 0; j < RINGS; j++) { const k = i * (RINGS + 1) + j, n = k + RINGS + 1; washIndex.push(k, n, k + 1, k + 1, n, n + 1); }
    }
    const mesh = (positions, index, material) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(index);
      const m = new THREE.Mesh(g, material); m.renderOrder = 3; m.raycast = () => {}; m.frustumCulled = false; return m;
    };
    const holder = new THREE.Group(); holder.add(mesh(wash, washIndex, washMat), mesh(rim, rimIndex, rimMat));
    return holder;
  }

  /** `centres` are crate centres in metres; `shown` fades the areas in or out. */
  function update(centres, shown, dt) {
    const next = centres.map(c => `${c.x.toFixed(1)},${c.z.toFixed(1)}`).join('|');
    if (next !== key) {
      key = next;
      for (const [k, holder] of areas) if (!next.split('|').includes(k)) { holder.traverse(o => o.geometry?.dispose()); holder.removeFromParent(); areas.delete(k); }
      for (const c of centres) { const k = `${c.x.toFixed(1)},${c.z.toFixed(1)}`; if (!areas.has(k)) { const holder = area(c.x, c.z); areas.set(k, holder); group.add(holder); } }
    }
    fade = THREE.MathUtils.clamp(fade + (shown ? dt * 4 : -dt * 4), 0, 1);
    group.visible = fade > 0 && areas.size > 0;
    rimMat.opacity = .55 * fade; washMat.opacity = .045 * fade;
  }

  function dispose() { for (const holder of areas.values()) holder.traverse(o => o.geometry?.dispose()); rimMat.dispose(); washMat.dispose(); group.removeFromParent(); }
  return { update, dispose };
}
