import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL_SIZE, DIRS } from './defs.js';
import { habitatLayout, isRoom, roomAt } from './habitat.js';
import { surfaceHeightAt } from './terrain.js';

const DOOR_TRAVEL = .62, DOOR_REACH = 2.4, FLOOR_TOP = .13;
const key = (x, z) => `${x},${z}`;

/** Assembles connected rooms from the Blender kit, one painted square at a time. Rebuilds only when rooms change. */
export function createHabitatView(scene, kit) {
  const root = new THREE.Group(); scene.add(root);
  const owned = { geometries: [], materials: [] };
  const pieces = new Map();
  const materialClones = new Map();
  const shared = m => {
    if (!materialClones.has(m)) {
      const c = m.clone();
      if (/greenhouse glazing/i.test(c.name)) Object.assign(c, { transparent: true, opacity: .3, depthWrite: false });
      owned.materials.push(c); materialClones.set(m, c);
    }
    return materialClones.get(m);
  };
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
      // Blender suffixes names that collide with objects in the open file (Roof.002), and three.js drops the dot (Roof002).
      pieces.set(node.name.replace(/\.?\d{3}$/, ''), parts);
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
  for (const [missing, fallback] of [['GlassWall', 'Window'], ['GlassRoof', 'Roof'], ['GlassRoofEdge', 'RoofEdge']]) if (!pieces.has(missing) && pieces.has(fallback)) pieces.set(missing, pieces.get(fallback));
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
        const k = key(x, z); if (!axes.has(k)) axes.set(k, { x, z, axes: new Set() });
        axes.get(k).axes.add(s.dir % 2);
      }
    }
    return [...axes.values()].filter(v => v.axes.size > 1);
  }
  const wallPiece = { wall: 'Wall', window: 'Window', glass: 'GlassWall' };

  /** Floors, walls, roof and airlock frames for a set of squares. Returns the exterior airlocks for door leaves. */
  function layoutPieces(a, squares, segments, y, { roofs = true } = {}) {
    for (const b of squares) {
      const x = b.x * CELL_SIZE, z = b.z * CELL_SIZE, glass = b.type === 'greenhouse';
      a.add('Floor', x, y, z);
      if (b.type === 'airlock') a.add('AirlockFloor', x, y, z, b.rotation);
      if (roofs) a.add(glass ? 'GlassRoof' : 'Roof', x, y, z, 0, false, 'roof');
    }
    for (const s of segments) if (wallPiece[s.kind]) a.add(wallPiece[s.kind], s.x, y, s.z, s.dir);
    const edges = new Set(), doors = [];
    for (const s of segments) {
      const k = `${s.cell.x},${s.cell.z},${s.dir}`; if (edges.has(k)) continue; edges.add(k);
      const ex = s.cell.x * CELL_SIZE + DIRS[s.dir][0], ez = s.cell.z * CELL_SIZE + DIRS[s.dir][1];
      if (s.kind === 'door') { a.add('Airlock', ex, y, ez, s.dir); doors.push({ x: ex, z: ez, dir: s.dir }); }
      if (roofs) a.add(s.room === 'greenhouse' ? 'GlassRoofEdge' : 'RoofEdge', ex, y, ez, s.dir, false, 'roof');
    }
    for (const v of cornerPoints(segments)) { a.add('Corner', v.x, y, v.z); if (roofs) a.add('RoofCorner', v.x, y, v.z, 0, false, 'roof'); }
    if (roofs) {
      // Rooftop services on every whole 2x2 block of habitat squares.
      const habitat = new Set(squares.filter(b => b.type === 'habitat').map(b => key(b.x, b.z))), used = new Set();
      for (const b of [...squares].sort((p, q) => p.z - q.z || p.x - q.x)) {
        const block = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dz]) => key(b.x + dx, b.z + dz));
        if (block.every(k => habitat.has(k) && !used.has(k))) { block.forEach(k => used.add(k)); a.add('RoofModule', b.x * CELL_SIZE + 1, y, b.z * CELL_SIZE + 1, 0, false, 'roof'); }
      }
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
  const roomHeight = (squares, seed) => Math.max(...squares.map(b => surfaceHeightAt(seed, b.x * CELL_SIZE, b.z * CELL_SIZE)));
  function disposeObject(o) { o.traverse(n => { if (n.isMesh) n.geometry.dispose(); }); o.removeFromParent(); }

  function rebuildRooms(state, layout) {
    for (const r of rooms) disposeObject(r.group);
    rooms = [];
    for (const room of layout.rooms) {
      const squares = state.buildings.filter(b => room.modules.has(b.id)), y = roomHeight(squares, state.seed);
      const segments = layout.segments.filter(s => room.modules.has(s.id));
      const group = new THREE.Group(), a = assembler(), locks = layoutPieces(a, squares, segments, y);
      const body = a.build('static'), roof = a.build('roof');
      if (body) group.add(body); if (roof) group.add(roof);
      const doors = locks.map(l => doorLeaves(l, y, group));
      root.add(group);
      rooms.push({ room, group, roof, doors, y, squares });
    }
  }

  /** Each unfinished square is drawn alone; it only redraws when its own neighbours change. */
  function updateBlueprints(state, obstructs) {
    const all = habitatLayout(state.buildings, { blueprints: true }), live = new Set();
    let byId = null;
    for (const b of state.buildings) {
      if (!isRoom(b) || b.built) continue;
      live.add(b.id);
      const sig = `${b.type}:${b.x}:${b.z}:${b.rotation}:` + DIRS.map(([dx, dz]) => all.owner.has(key(b.x + dx, b.z + dz)) ? 1 : 0).join('');
      let view = blueprints.get(b.id);
      if (view?.sig !== sig) {
        if (view) disposeObject(view.group);
        if (!byId) { byId = new Map(); for (const s of all.segments) { if (!byId.has(s.id)) byId.set(s.id, []); byId.get(s.id).push(s); } }
        const group = new THREE.Group(), a = assembler(), locks = layoutPieces(a, [b], byId.get(b.id) ?? [], 0, { roofs: false });
        const body = a.build('static', blueprintGood); if (body) { body.castShadow = false; group.add(body); }
        for (const l of locks) doorLeaves(l, 0, group, blueprintGood);
        group.position.y = roomHeight([b], state.seed); root.add(group);
        view = { sig, group, blocked: false }; blueprints.set(b.id, view);
      }
      const blocked = obstructs(b);
      if (view.blocked !== blocked || !view.painted) { view.group.traverse(n => { if (n.isMesh) n.material = blocked ? blueprintBlocked : blueprintGood; }); view.blocked = blocked; view.painted = true; }
      view.group.scale.y = .35 + .65 * (b.progress || 0);
    }
    for (const [id, view] of blueprints) if (!live.has(id)) { disposeObject(view.group); blueprints.delete(id); }
  }

  return {
    /** `obstructs(b)` reports whether finishing blueprint `b` would shut the player in. */
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
    /** Ceiling light positions: one per 2x2 block of finished room squares. */
    lights() {
      const result = [];
      for (const r of rooms) for (const b of r.squares) if (b.x % 2 === 0 && b.z % 2 === 0 || r.squares.length === 1) result.push({ x: b.x * CELL_SIZE, y: r.y + 1.9, z: b.z * CELL_SIZE, greenhouse: b.type === 'greenhouse' });
      return result;
    },
    dispose() { for (const r of rooms) disposeObject(r.group); for (const v of blueprints.values()) disposeObject(v.group); scene.remove(root); owned.geometries.forEach(g => g.dispose()); owned.materials.forEach(m => m.dispose()); },
  };
}
