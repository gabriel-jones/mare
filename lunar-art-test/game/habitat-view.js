import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL_SIZE, DIRS, footprint } from './defs.js';
import { habitatLayout, roomAt } from './habitat.js';
import { surfaceHeightAt } from './terrain.js';

const DOOR_TRAVEL = .62, DOOR_REACH = 2.4, FLOOR_TOP = .13;

/** Assembles connected habitat rooms from the Blender kit. Rebuilds only when habitats change. */
export function createHabitatView(scene, kit) {
  const root = new THREE.Group(); scene.add(root);
  const owned = { geometries: [], materials: [] };
  const pieces = new Map();
  const materialClones = new Map();
  const shared = m => { if (!materialClones.has(m)) { const c = m.clone(); owned.materials.push(c); materialClones.set(m, c); } return materialClones.get(m); };
  if (kit) {
    kit.updateMatrixWorld(true);
    for (const node of kit.children) {
      const inverse = node.matrixWorld.clone().invert(), parts = [];
      node.traverse(o => {
        if (!o.isMesh) return;
        const geometry = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
        for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
        parts.push({ geometry, material: shared(o.material) });
        owned.geometries.push(geometry);
      });
      // Blender suffixes names that collide with objects in the open file (Roof.002).
      pieces.set(node.name.replace(/\.\d+$/, ''), parts);
    }
  }
  if (!pieces.size) {
    // Plain fallback so a missing kit never breaks gameplay.
    const ivory = new THREE.MeshStandardMaterial({ color: '#d6dcd8', roughness: .8 }), dark = new THREE.MeshStandardMaterial({ color: '#293544' });
    owned.materials.push(ivory, dark);
    const block = (w, h, d, y, z = 0, m = ivory) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, y, z); g.deleteAttribute('uv'); owned.geometries.push(g); return { geometry: g, material: m }; };
    pieces.set('Floor', [block(2, .2, 2, .03, 0, dark)]); pieces.set('Wall', [block(1, 2, .23, 1.12)]); pieces.set('Window', [block(1, 2, .23, 1.12)]);
    pieces.set('Airlock', [block(.35, 2, .23, 1.12, 0), block(1.3, .28, .23, 1.98)]); pieces.set('Roof', [block(2, .2, 2, 2.22)]);
  }
  const lightMaterials = [...materialClones.values()].filter(m => m.emissiveIntensity > 0 && m.emissive?.getHex());
  lightMaterials.forEach(m => { m.userData.base = m.emissiveIntensity; });

  const blueprintGood = new THREE.MeshStandardMaterial({ color: '#79d5ed', emissive: '#2c8ca9', emissiveIntensity: .85, transparent: true, opacity: .5, depthWrite: false });
  const blueprintBlocked = new THREE.MeshStandardMaterial({ color: '#ff715d', emissive: '#a3301f', emissiveIntensity: .9, transparent: true, opacity: .55, depthWrite: false });
  owned.materials.push(blueprintGood, blueprintBlocked);

  /** Collects transformed piece geometry into per-material buckets and merges each bucket into one mesh. */
  function assembler() {
    const buckets = new Map(), matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    return {
      add(name, x, y, z, dir = 0, mirror = false, bucket = 'static') {
        const list = pieces.get(name); if (!list) return;
        matrix.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, dir * Math.PI / 2), mirror ? new THREE.Vector3(-1, 1, 1) : one);
        if (!buckets.has(bucket)) buckets.set(bucket, []);
        for (const p of list) buckets.get(bucket).push({ geometry: p.geometry.clone().applyMatrix4(matrix), material: p.material });
      },
      build(bucket, override) {
        const list = buckets.get(bucket); if (!list?.length) return null;
        const byMaterial = new Map();
        for (const p of list) { if (!byMaterial.has(p.material)) byMaterial.set(p.material, []); byMaterial.get(p.material).push(p.geometry); }
        const mats = [...byMaterial.keys()], geometry = mergeGeometries(mats.map(m => mergeGeometries(byMaterial.get(m))), true);
        list.forEach(p => p.geometry.dispose());
        const mesh = new THREE.Mesh(geometry, override ?? mats); mesh.castShadow = true; mesh.receiveShadow = true;
        return mesh;
      },
    };
  }

  function cornerPoints(segments) {
    const axes = new Map();
    for (const s of segments) {
      const [px, pz] = DIRS[(s.dir + 1) % 4];
      for (const e of [-.5, .5]) {
        const x = s.x + px * e, z = s.z + pz * e;
        if (Math.abs(x % 2) !== 1 || Math.abs(z % 2) !== 1) continue;
        const k = `${x},${z}`; if (!axes.has(k)) axes.set(k, { x, z, axes: new Set() });
        axes.get(k).axes.add(s.dir % 2);
      }
    }
    return [...axes.values()].filter(v => v.axes.size > 1);
  }

  /** Places walls, windows, airlocks, floors and roof for one set of cells and segments. */
  function layoutPieces(a, layout, cells, segments, modules, y) {
    for (const c of cells) { a.add('Floor', c.x * CELL_SIZE, y, c.z * CELL_SIZE); a.add('Roof', c.x * CELL_SIZE, y, c.z * CELL_SIZE, 0, false, 'roof'); }
    for (const s of segments) if (s.kind !== 'door') a.add(s.kind === 'window' ? 'Window' : 'Wall', s.x, y, s.z, s.dir);
    const edges = new Set();
    for (const s of segments) {
      const k = `${s.cell.x},${s.cell.z},${s.dir}`; if (edges.has(k)) continue; edges.add(k);
      a.add('RoofEdge', s.cell.x * CELL_SIZE + DIRS[s.dir][0], y, s.cell.z * CELL_SIZE + DIRS[s.dir][1], s.dir, false, 'roof');
    }
    for (const v of cornerPoints(segments)) { a.add('Corner', v.x, y, v.z); a.add('RoofCorner', v.x, y, v.z, 0, false, 'roof'); }
    const doors = [];
    for (const m of modules) {
      const cells = footprint(m.type, m.x, m.z, m.rotation), cx = cells.reduce((s, c) => s + c.x, 0) / cells.length * CELL_SIZE, cz = cells.reduce((s, c) => s + c.z, 0) / cells.length * CELL_SIZE;
      a.add('RoofModule', cx, y, cz, m.rotation, false, 'roof');
      const back = (m.rotation + 2) % 4, bx = cx + DIRS[back][0] * 2, bz = cz + DIRS[back][1] * 2, [px, pz] = DIRS[(back + 1) % 4];
      const wallAt = e => segments.some(s => s.kind === 'wall' && s.dir === back && Math.abs(s.x - (bx + px * e)) < .01 && Math.abs(s.z - (bz + pz * e)) < .01);
      if (wallAt(-.5) && wallAt(.5)) a.add('Cabinet', bx, y, bz, back);
      const lock = layout.airlocks.find(l => l.id === m.id);
      if (lock?.exterior) { a.add('Airlock', lock.x, y, lock.z, lock.dir); doors.push(lock); }
    }
    return doors;
  }

  function doorLeaves(lock, y, parent, material) {
    const group = new THREE.Group(); group.position.set(lock.x, y, lock.z); group.rotation.y = lock.dir * Math.PI / 2; parent.add(group);
    const leaves = [-1, 1].map(side => {
      const a = assembler(); a.add('AirlockDoor', 0, 0, 0, 0, side > 0, 'door');
      const mesh = a.build('door', material); if (!mesh) return null;
      mesh.position.x = side * .33; group.add(mesh); return { mesh, side };
    }).filter(Boolean);
    return { lock, leaves, open: 0 };
  }

  let roomsKey = '', rooms = [];
  const blueprints = new Map();
  const roomHeight = (modules, seed) => Math.max(...modules.map(m => { const c = footprint(m.type, m.x, m.z, m.rotation); return surfaceHeightAt(seed, c.reduce((s, q) => s + q.x, 0) / c.length * CELL_SIZE, c.reduce((s, q) => s + q.z, 0) / c.length * CELL_SIZE); }));
  function disposeObject(o) { o.traverse(n => { if (n.isMesh) n.geometry.dispose(); }); o.removeFromParent(); }

  function rebuildRooms(state, layout) {
    for (const r of rooms) disposeObject(r.group);
    rooms = [];
    for (const room of layout.rooms) {
      const modules = state.buildings.filter(b => room.modules.has(b.id)), y = roomHeight(modules, state.seed);
      const cells = new Set(room.cells.map(c => `${c.x},${c.z}`)), segments = layout.segments.filter(s => cells.has(`${s.cell.x},${s.cell.z}`));
      const group = new THREE.Group(), a = assembler(), locks = layoutPieces(a, layout, room.cells, segments, modules, y);
      const body = a.build('static'), roof = a.build('roof');
      if (body) group.add(body); if (roof) group.add(roof);
      const doors = locks.map(l => doorLeaves(l, y, group));
      root.add(group);
      rooms.push({ room, group, roof, doors, y });
    }
  }

  function updateBlueprints(state, obstructs) {
    const all = habitatLayout(state.buildings, { blueprints: true }), live = new Set();
    for (const b of state.buildings) {
      if (b.type !== 'habitat' || b.built) continue;
      live.add(b.id);
      const sig = `${all.sig}#${b.id}`;
      let view = blueprints.get(b.id);
      if (view?.sig !== sig) {
        if (view) disposeObject(view.group);
        const cells = footprint(b.type, b.x, b.z, b.rotation), segments = all.segments.filter(s => s.id === b.id), y = roomHeight([b], state.seed);
        const group = new THREE.Group(), a = assembler(), locks = layoutPieces(a, all, cells, segments, [b], 0);
        const body = a.build('static', blueprintGood); if (body) { body.castShadow = false; group.add(body); }
        for (const l of locks) doorLeaves(l, 0, group, blueprintGood);
        group.position.y = y; root.add(group);
        view = { sig, group }; blueprints.set(b.id, view);
      }
      const blocked = obstructs(b), material = blocked ? blueprintBlocked : blueprintGood;
      view.group.traverse(n => { if (n.isMesh) n.material = material; });
      view.group.scale.y = .35 + .65 * (b.progress || 0);
    }
    for (const [id, view] of blueprints) if (!live.has(id)) { disposeObject(view.group); blueprints.delete(id); }
  }

  return {
    /** `obstructs(b)` reports whether finishing blueprint `b` would trap the player in a wall. */
    update(state, dt, { player, powered, obstructs }) {
      const layout = habitatLayout(state.buildings);
      if (layout.sig !== roomsKey) { roomsKey = layout.sig; rebuildRooms(state, layout); }
      const inside = player && state.player.cave == null ? roomAt(layout, player.x, player.z) : null;
      for (const r of rooms) {
        if (r.roof) r.roof.visible = r.room !== inside;
        for (const d of r.doors) {
          const near = player && Math.hypot(player.x - d.lock.x, player.z - d.lock.z) < DOOR_REACH;
          d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 7);
          for (const l of d.leaves) l.mesh.position.x = l.side * (.33 + d.open * DOOR_TRAVEL);
        }
      }
      for (const m of lightMaterials) m.emissiveIntensity = powered ? m.userData.base : 0;
      updateBlueprints(state, obstructs);
    },
    /** Floor height of the finished room under the world point, or null outdoors. */
    floorAt(state, x, z) { const room = roomAt(habitatLayout(state.buildings), x, z), r = room && rooms.find(r => r.room === room); return r ? r.y + FLOOR_TOP : null; },
    dispose() { for (const r of rooms) disposeObject(r.group); for (const v of blueprints.values()) disposeObject(v.group); scene.remove(root); owned.geometries.forEach(g => g.dispose()); owned.materials.forEach(m => m.dispose()); },
  };
}
