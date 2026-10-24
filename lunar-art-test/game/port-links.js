import * as THREE from 'three';
import { DIRS, ports } from './defs.js';

const key = (x, z) => `${x},${z}`;

/**
 * Where a built belt meets a machine port, an opening appears in the machine's face: framed mouth, rubber
 * flaps that swing as items pass, and a short tray bridging to the belt. Unconnected ports stay closed.
 */
export function createPortLinks(scene, { heightAt }) {
  const root = new THREE.Group(); root.name = 'Port links'; scene.add(root);
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .4, ...o });
  const steel = mat('#8d9ba3', { metalness: .75, roughness: .32 }), dark = mat('#1a2024'), orange = mat('#c8501c', { metalness: .15 });
  const rubber = mat('#15181a', { metalness: 0, roughness: .85 }), mouth = new THREE.MeshBasicMaterial({ color: '#050607' });
  const unit = new THREE.BoxGeometry(1, 1, 1), raycaster = new THREE.Raycaster(), from = new THREE.Vector3(), toward = new THREE.Vector3();
  const links = new Map();
  const box = (parent, material, x, y, z, w, h, d) => {
    const m = new THREE.Mesh(unit, material); m.position.set(x, y, z); m.scale.set(w, h, d); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };

  function faceDepth(target, x, y, z, dx, dz) {
    from.set(x + dx * .05, y, z + dz * .05); toward.set(-dx, 0, -dz);
    raycaster.set(from, toward); raycaster.far = 1.3;
    const meshes = []; target.traverseVisible(n => { if (n.isMesh) meshes.push(n); });
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return hit ? Math.max(0, hit.distance - .05) : .35;
  }

  function build(state, target, port, input) {
    const [dx, dz] = DIRS[port.dir], x = (port.cell.x + dx * .5) * 2, z = (port.cell.z + dz * .5) * 2;
    const ground = heightAt(state.seed, port.neighbor.x * 2, port.neighbor.z * 2), group = new THREE.Group();
    group.position.set(x, ground, z); group.rotation.y = Math.atan2(dx, dz);
    target.updateMatrixWorld(true);
    const depth = faceDepth(target, x, ground + .52, z, dx, dz), face = -depth, length = depth + .12;
    box(group, mouth, 0, .54, face + .012, .82, .36, .02);
    for (const side of [-1, 1]) {
      box(group, steel, side * .46, .54, face + .05, .08, .46, .1);
      box(group, dark, side * .48, .42, face + length / 2, .04, .14, length);
    }
    box(group, input ? steel : orange, 0, .79, face + .05, 1.0, .08, .12);
    box(group, dark, 0, .355, face + length / 2, .92, .05, length);
    const flaps = [];
    for (let i = 0; i < 5; i++) {
      const hinge = new THREE.Group(); hinge.position.set(-.32 + i * .16, .74, face + .07); group.add(hinge);
      box(hinge, rubber, 0, -.17, 0, .145, .34, .015); flaps.push(hinge);
    }
    root.add(group);
    return { group, flaps, swing: 0, input };
  }

  function update(state, structures, dt, time) {
    const belts = new Map();
    for (const b of state.buildings) if (b.type === 'conveyor' && b.built) belts.set(key(b.x, b.z), b);
    const seen = new Set();
    for (const b of state.buildings) {
      const o = structures.get(b.id);
      if (!b.built || !o || b.type === 'conveyor') continue;
      for (const kind of ['inputs', 'outputs']) {
        const list = ports(b, kind); if (!list.length) continue;
        list.forEach((port, i) => {
          const belt = belts.get(key(port.neighbor.x, port.neighbor.z)), input = kind === 'inputs';
          const joined = belt && (input ? belt.rotation === (port.dir + 2) % 4 : belt.rotation !== (port.dir + 2) % 4);
          if (!joined) return;
          const id = `${b.id}:${kind}:${i}:${b.rotation}:${b.x},${b.z}`; seen.add(id);
          let link = links.get(id); if (!link) { link = build(state, o.root, port, input); links.set(id, link); }
          // Flaps part for the item crossing the threshold, then settle back with a little wobble.
          const items = belt.items ?? [], busy = input ? items.length && items[0].p > .7 : items.length && items[items.length - 1].p < .3;
          link.swing += ((busy ? 1 : 0) - link.swing) * Math.min(1, dt * (busy ? 14 : 4));
          link.flaps.forEach((f, j) => { f.rotation.x = (input ? 1 : -1) * (link.swing * .9 + Math.sin(time * 9 + j) * .05 * link.swing); });
        });
      }
    }
    for (const [id, link] of links) if (!seen.has(id)) { root.remove(link.group); links.delete(id); }
  }

  function dispose() { root.removeFromParent(); unit.dispose(); for (const m of [steel, dark, orange, rubber, mouth]) m.dispose(); }
  return { update, dispose };
}
