import * as THREE from 'three';
import { FACET, facetFlip, iceAt, iceDeposits, latticeHeight, surfaceHeightAt } from './terrain.js';
import { REGOLITH_PER_CELL } from './production.js';

const hash = (x, z, k = 0) => Math.abs(Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453) % 1;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const SINK = .68;

/**
 * Crater ice in the terrain's own faceted language: a frost sheet laid exactly on the ground facets, pale where it
 * is thickest and breaking up toward the crater walls, with clusters of flat-shaded ice blocks and shards proud of
 * it. Frost scrapes away where a rover starts digging; the blocks shrink and sink as the cell is worked out.
 */
export function createIceView(scene) {
  const root = new THREE.Group(); root.name = 'Ice deposits'; scene.add(root);
  const frostMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, flatShading: true, roughness: .55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const blockMat = new THREE.MeshStandardMaterial({ color: '#c4dbe7', flatShading: true, roughness: .22, metalness: .05, emissive: '#3c6a82', emissiveIntensity: .25 });
  const shardMat = new THREE.MeshStandardMaterial({ color: '#8fbad0', flatShading: true, roughness: .18, metalness: .05, emissive: '#2f6684', emissiveIntensity: .35 });
  const blockGeo = new THREE.IcosahedronGeometry(1, 0), shardGeo = new THREE.OctahedronGeometry(1, 0);
  const frostColors = ['#dfe8ec', '#c3d3dc', '#aec3cf', '#d2dee4'].map(c => new THREE.Color(c));
  const dummy = new THREE.Object3D();
  let seed = null, minedKey = '', fields = [];

  function build(state) {
    for (const f of fields) { root.remove(f.frost, f.blocks, f.shards); f.frost.geometry.dispose(); f.blocks.dispose(); f.shards.dispose(); }
    seed = state.seed;
    fields = iceDeposits().map(d => {
      const reach = d.radius * .85, cells = [];
      for (let x = Math.floor((d.x - reach) / 2); x <= Math.ceil((d.x + reach) / 2); x++) for (let z = Math.floor((d.z - reach) / 2); z <= Math.ceil((d.z + reach) / 2); z++) if (iceAt(x, z) && Math.hypot(x * 2 - d.x, z * 2 - d.z) < d.radius) cells.push({ x, z, key: `${x},${z}` });
      // Frost: every lattice facet in reach, coloured per facet, its cover fading out with a ragged edge.
      const positions = [], facets = [];
      const i0 = Math.floor((d.x - reach) / FACET), i1 = Math.ceil((d.x + reach) / FACET), j0 = Math.floor((d.z - reach) / FACET), j1 = Math.ceil((d.z + reach) / FACET);
      for (let i = i0; i < i1; i++) for (let j = j0; j < j1; j++) {
        const v = (a, b) => [(i + a) * FACET, latticeHeight(seed, i + a, j + b) + .03, (j + b) * FACET];
        const tris = facetFlip(seed, i, j) ? [[v(0, 0), v(0, 1), v(1, 0)], [v(1, 1), v(1, 0), v(0, 1)]] : [[v(0, 0), v(1, 1), v(1, 0)], [v(0, 0), v(0, 1), v(1, 1)]];
        tris.forEach((t, k) => {
          const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cz = (t[0][2] + t[1][2] + t[2][2]) / 3;
          const edge = Math.hypot(cx - d.x, cz - d.z) / (d.radius * .78) + (hash(i, j, k) - .5) * .4;
          // Toward the rim the sheet breaks up into scattered facets rather than ending on a clean line.
          const cover = (1 - smooth((edge - .6) / .45)) * (.75 + hash(i, j, k + 7) * .25);
          if (cover <= .08 || hash(i, j, k + 9) < smooth((edge - .7) / .35) * .8) return;
          for (const p of t) positions.push(...p);
          facets.push({ cover, color: frostColors[Math.floor(hash(i, j, k + 3) * frostColors.length)], cell: `${Math.floor((cx + 1) / 2)},${Math.floor((cz + 1) / 2)}` });
        });
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(facets.length * 12), 4));
      geo.computeVertexNormals();
      const frost = new THREE.Mesh(geo, frostMat); frost.renderOrder = 1;
      // Each ice cell carries a cluster: one or two squat blocks, sometimes with a shard pushed up beside them.
      const pieces = [];
      for (const c of cells) {
        const n = 1 + Math.floor(hash(c.x, c.z, 1) * 2), m = hash(c.x, c.z, 2) < .4 ? 1 : 0;
        for (let k = 0; k < n + m; k++) {
          const a = hash(c.x, c.z, 10 + k) * 6.28, r = .25 + hash(c.x, c.z, 20 + k) * .6, x = c.x * 2 + Math.cos(a) * r, z = c.z * 2 + Math.sin(a) * r;
          const shard = k >= n, s = shard ? .14 + hash(c.x, c.z, 30 + k) * .1 : .3 + hash(c.x, c.z, 30 + k) * .3;
          pieces.push({ cell: c.key, shard, x, z, ground: surfaceHeightAt(seed, x, z), s, tall: shard ? 2.2 + hash(c.x, c.z, 40 + k) * 1.6 : .5 + hash(c.x, c.z, 40 + k) * .3, yaw: hash(c.x, c.z, 50 + k) * 6.28, lean: (hash(c.x, c.z, 60 + k) - .5) * (shard ? .7 : .3) });
        }
      }
      const blocks = new THREE.InstancedMesh(blockGeo, blockMat, Math.max(1, pieces.filter(p => !p.shard).length));
      const shards = new THREE.InstancedMesh(shardGeo, shardMat, Math.max(1, pieces.filter(p => p.shard).length));
      for (const mesh of [blocks, shards]) { mesh.castShadow = mesh.receiveShadow = true; }
      root.add(frost, blocks, shards);
      return { frost, facets, blocks, shards, pieces };
    });
    minedKey = '';
  }

  function paint(state) {
    const left = key => 1 - Math.min(1, (state.mined?.[key] ?? 0) / REGOLITH_PER_CELL);
    for (const f of fields) {
      const colors = f.frost.geometry.attributes.color.array;
      f.facets.forEach((facet, i) => {
        const a = state.mined?.[facet.cell] ? 0 : facet.cover * .9;
        for (let v = 0; v < 3; v++) colors.set([facet.color.r, facet.color.g, facet.color.b, a], i * 12 + v * 4);
      });
      f.frost.geometry.attributes.color.needsUpdate = true;
      let b = 0, s = 0;
      for (const p of f.pieces) {
        const l = left(p.cell), size = l > 0 ? p.s * (.35 + .65 * l) : 0;
        dummy.position.set(p.x, p.ground - (1 - l) * SINK + size * p.tall * (p.shard ? .35 : .3), p.z);
        dummy.rotation.set(p.lean, p.yaw, p.lean * .6); dummy.scale.set(size, size * p.tall, size * (p.shard ? 1 : 1.25));
        dummy.updateMatrix();
        (p.shard ? f.shards : f.blocks).setMatrixAt(p.shard ? s++ : b++, dummy.matrix);
      }
      f.blocks.count = b; f.shards.count = s;
      f.blocks.instanceMatrix.needsUpdate = f.shards.instanceMatrix.needsUpdate = true;
    }
  }

  function update(state) {
    if (seed !== state.seed) build(state);
    const entries = Object.entries(state.mined ?? {}), key = `${entries.length}:${Math.round(entries.reduce((s, [, n]) => s + n, 0) * 4)}`;
    if (key !== minedKey) { minedKey = key; paint(state); }
  }

  function dispose() {
    root.removeFromParent();
    for (const f of fields) { f.frost.geometry.dispose(); f.blocks.dispose(); f.shards.dispose(); }
    for (const o of [frostMat, blockMat, shardMat, blockGeo, shardGeo]) o.dispose();
  }
  return { update, dispose };
}
