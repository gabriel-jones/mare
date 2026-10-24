import * as THREE from 'three';
import { footprint } from './defs.js';
import { surfaceHeightAt } from './terrain.js';

const STEP = .5, MARGIN = .5, SKIRT = 1.4;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/**
 * Every machine stands on ground the colony graded for it: a level pad of compacted regolith at the building's
 * base, with a skirt that blends back into the natural facets. Rooms, belts and the launch pad bring their own.
 */
export function createGroundPads(scene, { skip }) {
  const root = new THREE.Group(); root.name = 'Graded pads'; scene.add(root);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const packed = new THREE.Color('#c2bbad'), edge = new THREE.Color('#7a746a'), dust = new THREE.Color('#9c968a'), color = new THREE.Color();
  const pads = new Map();

  function build(seed, b, base) {
    const cells = footprint(b.type, b.x, b.z, b.rotation);
    const x0 = Math.min(...cells.map(c => c.x)) * 2 - 1 - MARGIN, x1 = Math.max(...cells.map(c => c.x)) * 2 + 1 + MARGIN;
    const z0 = Math.min(...cells.map(c => c.z)) * 2 - 1 - MARGIN, z1 = Math.max(...cells.map(c => c.z)) * 2 + 1 + MARGIN;
    const nx = Math.ceil((x1 - x0 + SKIRT * 2) / STEP), nz = Math.ceil((z1 - z0 + SKIRT * 2) / STEP);
    const positions = [], colors = [], indices = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 - SKIRT + (x1 - x0 + SKIRT * 2) * i / nx, z = z0 - SKIRT + (z1 - z0 + SKIRT * 2) * j / nz;
      const out = Math.max(x0 - x, x - x1, z0 - z, z - z1, 0) / SKIRT, ground = surfaceHeightAt(seed, x, z) + .025;
      const t = smooth(out), y = Math.max(ground, base + .025 + (ground - base - .025) * t);
      // A slightly darker compacted band traces the pad's edge, then the grading fades into the dust.
      const rim = Math.max(0, 1 - Math.abs(out * SKIRT - .12) / .22);
      color.copy(packed).lerp(edge, rim * .85).lerp(dust, t);
      positions.push(x, y, z); colors.push(color.r, color.g, color.b, (1 - t) * .95);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const p = j * (nx + 1) + i; indices.push(p, p + nx + 1, p + 1, p + 1, p + nx + 1, p + nx + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; mesh.renderOrder = -1; root.add(mesh);
    return mesh;
  }

  function update(state, baseOf) {
    const seen = new Set();
    for (const b of state.buildings) {
      if (skip(b)) continue;
      const key = `${b.id}:${b.type}:${b.x},${b.z}:${b.rotation}`; seen.add(key);
      if (!pads.has(key)) pads.set(key, build(state.seed, b, baseOf(b)));
    }
    for (const [key, mesh] of pads) if (!seen.has(key)) { root.remove(mesh); mesh.geometry.dispose(); pads.delete(key); }
  }

  function dispose() { root.removeFromParent(); for (const mesh of pads.values()) mesh.geometry.dispose(); material.dispose(); }
  return { update, dispose };
}
