import * as THREE from 'three';
import { DIRS, DEFS } from './defs.js';
import { createRegolithFx } from './regolith-fx.js';
import { surfaceHeightAt as heightAt } from './terrain.js';
import { ROVER, MINING_RADIUS, REGOLITH_PER_CELL, beltTurns } from './production.js';
import { BELT_ITEM_SIZES } from './item-models.js';

// Presentation for the Phase B logistics layer: rovers, belt items and the mining zones.
export function createProductionView(scene, models, itemModels = null) {
  const root = new THREE.Group(); scene.add(root);
  const regolith = createRegolithFx(root), at = new THREE.Vector3();
  const geometries = [], materials = [];
  const own = (list, item) => { list.push(item); return item; };

  // Fallbacks keep a failed asset request from hiding the production simulation.
  const itemLooks = {
    regolith: [own(geometries, new THREE.IcosahedronGeometry(.2, 0)), own(materials, new THREE.MeshStandardMaterial({ color: '#8f877b', roughness: 1, flatShading: true }))],
    metal: [own(geometries, new THREE.BoxGeometry(.42, .16, .24)), own(materials, new THREE.MeshStandardMaterial({ color: '#d4dbe0', metalness: .8, roughness: .3 }))],
    silicon: [own(geometries, new THREE.BoxGeometry(.3, .08, .3)), own(materials, new THREE.MeshStandardMaterial({ color: '#25466a', metalness: .5, roughness: .2, emissive: '#0f2742', emissiveIntensity: .4 }))],
    frame: [own(geometries, new THREE.BoxGeometry(.5, .32, .5)), own(materials, new THREE.MeshStandardMaterial({ color: '#c7ced4', metalness: .7, roughness: .35, wireframe: true }))],
    wing: [own(geometries, new THREE.BoxGeometry(.7, .05, .36)), own(materials, new THREE.MeshStandardMaterial({ color: '#16294a', metalness: .5, roughness: .25, emissive: '#0c2240', emissiveIntensity: .35 }))],
    chip: [own(geometries, new THREE.BoxGeometry(.28, .07, .28)), own(materials, new THREE.MeshStandardMaterial({ color: '#2f6b4a', metalness: .4, roughness: .3, emissive: '#1c5a3c', emissiveIntensity: .3 }))],
    satellite: [own(geometries, new THREE.BoxGeometry(.5, .5, .5)), own(materials, new THREE.MeshStandardMaterial({ color: '#d9a441', metalness: .85, roughness: .3 }))],
    ice: [own(geometries, new THREE.OctahedronGeometry(.2, 0)), own(materials, new THREE.MeshStandardMaterial({ color: '#d6efff', roughness: .15, metalness: .1, emissive: '#4c86a8', emissiveIntensity: .45, flatShading: true }))],
  };
  const batches = {}, dummy = new THREE.Object3D();
  for (const [type, [geo, mat]] of Object.entries(itemLooks)) {
    const authored = itemModels?.batch(type, 4096, BELT_ITEM_SIZES[type]);
    if (authored) { root.add(authored.root); batches[type] = authored; continue; }
    // Old primitives were centred; give the fallback the same ground origin as the GLB.
    geo.computeBoundingBox(); geo.translate(0, -geo.boundingBox.min.y, 0);
    const mesh = new THREE.InstancedMesh(geo, mat, 4096); mesh.castShadow = true; mesh.count = 0; mesh.frustumCulled = false; root.add(mesh);
    batches[type] = { set: (i, matrix) => mesh.setMatrixAt(i, matrix), finish: n => { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; }, dispose: () => mesh.dispose() };
  }
  function updateItems(state, time) {
    const counts = Object.fromEntries(Object.keys(batches).map(type => [type, 0])), turns = beltTurns(state);
    for (const b of state.buildings) {
      if (b.type !== 'conveyor' || !b.items?.length) continue;
      const [fx, fz] = DIRS[b.rotation], cx = b.x * 2, cz = b.z * 2, turn = turns.get(b.id) ?? 0;
      const [sx, sz] = DIRS[(b.rotation + (turn > 0 ? 1 : 3)) % 4];
      for (const item of b.items) {
        const mesh = batches[item.type]; if (!mesh || counts[item.type] >= 4096) continue;
        let x, z, heading = b.rotation * Math.PI / 2;
        if (turn) {
          // Quarter arc about the corner shared by the feeding side and the front edge.
          const a = item.p * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
          x = cx + sx + fx - fx * c - sx * s; z = cz + sz + fz - fz * c - sz * s;
          heading = Math.atan2(fx * s - sx * c, fz * s - sz * c);
        } else { const offset = (item.p - .5) * 2; x = cx + fx * offset; z = cz + fz * offset; }
        dummy.position.set(x, heightAt(state.seed, cx, cz) + .38, z);
        dummy.rotation.set(0, heading + (item.type === 'regolith' ? item.p * 2 + time * .1 : 0), 0);
        dummy.scale.setScalar(1); dummy.updateMatrix(); mesh.set(counts[item.type]++, dummy.matrix);
      }
    }
    for (const [type, batch] of Object.entries(batches)) batch.finish(counts[type]);
  }

  // Rovers: wheels roll with distance travelled, the drill digs, and the cargo mound fills.
  const rovers = new Map();
  function createRoverView(kind) {
    const template = models.get(kind === 'hauler' ? 'hauler' : 'rover');
    let view;
    if (template) {
      const model = template.clone(true), wheels = [];let drill = null, cargo = null;
      model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } if (o.name.startsWith('Wheel_')) wheels.push(o); if (o.name === 'Drill') drill = o; if (o.name === 'Cargo') cargo = o; });
      view = { model, wheels, drill, cargo };
    } else {
      const model = new THREE.Group(), body = new THREE.Mesh(own(geometries, new THREE.BoxGeometry(1.2, .7, 2.2)), own(materials, new THREE.MeshStandardMaterial({ color: '#d6dcd8' })));
      body.position.y = .6; body.castShadow = true; model.add(body); view = { model, wheels: [], drill: null, cargo: null };
    }
    view.root = new THREE.Group(); view.root.add(view.model); root.add(view.root);
    view.loadRoot = new THREE.Group(); view.loadRoot.name = 'Carried item'; view.model.add(view.loadRoot);
    if (view.cargo) {
      view.model.updateMatrixWorld(true);
      view.cargo.getWorldPosition(view.loadRoot.position); view.model.worldToLocal(view.loadRoot.position);
    } else view.loadRoot.position.set(0, .8, -.3);
    view.loadItem = null;
    view.beacon = new THREE.PointLight('#ffb35c', 0, 7, 2); view.beacon.position.set(.36, 2.1, .45); view.root.add(view.beacon);
    view.display = null; view.digTime = 0;
    return view;
  }
  function updateRovers(state, dt, daylight) {
    const live = new Set();
    for (const r of state.robots ?? []) {
      live.add(r.id);
      let view = rovers.get(r.id);
      if (!view) { view = createRoverView(r.kind); rovers.set(r.id, view); }
      // The simulation moves in fixed ticks; ease the presentation between them.
      if (!view.display || Math.hypot(view.display.x - r.x, view.display.z - r.z) > 6) view.display = { x: r.x, z: r.z, facing: r.facing };
      const blend = 1 - Math.exp(-dt * 14), d = view.display, px = d.x, pz = d.z;
      d.x += (r.x - d.x) * blend; d.z += (r.z - d.z) * blend;
      d.facing += Math.atan2(Math.sin(r.facing - d.facing), Math.cos(r.facing - d.facing)) * blend;
      const travelled = Math.hypot(d.x - px, d.z - pz);
      view.root.position.set(d.x, heightAt(state.seed, d.x, d.z), d.z); view.root.rotation.y = d.facing;
      for (const wheel of view.wheels) wheel.rotation.x += travelled / .32;
      const mining = r.task === 'mining';
      view.digTime += dt;
      if (view.drill) view.drill.rotation.x += ((mining ? .32 + Math.sin(view.digTime * 7) * .1 : 0) - view.drill.rotation.x) * Math.min(1, dt * 8);
      view.model.position.y = mining ? Math.abs(Math.sin(view.digTime * 14)) * .025 : 0;
      const item = r.cargo >= 1 ? r.load ?? 'regolith' : null;
      if (item !== view.loadItem) {
        view.loadRoot.clear(); view.loadItem = item;
        const prop = item && itemModels?.create(item, r.kind === 'hauler' ? .9 : .7);
        if (prop) view.loadRoot.add(prop);
      }
      const modeled = view.loadRoot.children.length > 0;
      view.loadRoot.visible = modeled && r.cargo >= 1;
      if (modeled && r.kind !== 'hauler') view.loadRoot.scale.setScalar(.65 + .35 * Math.min(1, r.cargo / ROVER.capacity));
      if (view.cargo && r.kind === 'hauler') view.cargo.visible = !modeled && r.cargo >= 1;
      else if (view.cargo) { const load = Math.max(0, Math.min(1, r.cargo / ROVER.capacity)); view.cargo.visible = !modeled && load > .02; view.cargo.scale.set(.6 + .4 * load, Math.max(.05, load), .6 + .4 * load); }
      view.beacon.intensity = r.task === 'idle' || r.task === 'charging' ? 0 : (1 - daylight) * 5 + .6;
      if (r.kind !== 'hauler') kickUp(state, r, view, dt, travelled);
    }
    for (const [id, view] of rovers) if (!live.has(id)) { root.remove(view.root); rovers.delete(id); }
  }

  // Miners throw regolith about: the auger sprays it while digging, rear wheels kick it up on the move, and
  // unloading lobs the load out of the bin into the dock's open top.
  const DOCK_MOUTH = { hopper: 1.95, melter: 1.45 };
  function kickUp(state, r, view, dt, travelled) {
    const kind = r.load ?? 'regolith', f = view.root.rotation.y, fx = Math.sin(f), fz = Math.cos(f);
    view.sprayClock = (view.sprayClock ?? 0) + dt;
    if (r.task === 'mining' && view.drill) {
      const n = Math.floor(view.sprayClock * 36); view.sprayClock -= n / 36;
      if (n) {
        at.set(0, .12, 1.62); view.model.localToWorld(at);
        const side = Math.random() < .5 ? 1 : -1;
        regolith.spray(at.x, at.y, at.z, fx + fz * side * 1.4, fz - fx * side * 1.4, n, kind, heightAt(state.seed, at.x, at.z));
      }
    } else if (travelled / Math.max(dt, 1e-3) > 1.2) {
      const n = Math.floor(view.sprayClock * 26); view.sprayClock -= n / 26;
      for (let i = 0; i < n; i++) {
        at.set(Math.random() < .5 ? -.73 : .73, .05, -.78); view.model.localToWorld(at);
        regolith.spray(at.x, at.y, at.z, -fx, -fz, 1, 'regolith', heightAt(state.seed, at.x, at.z), 1.4);
      }
    } else view.sprayClock = 0;
    const dock = r.task === 'docked' && state.buildings.find(b => b.id === r.target?.id);
    if (dock && view.lastCargo != null && r.cargo < view.lastCargo - .01) view.dumpQueue = Math.min(40, (view.dumpQueue ?? 0) + (view.lastCargo - r.cargo) * 1.6);
    view.lastCargo = r.cargo;
    view.tip = (view.tip ?? 0) + ((dock && view.dumpQueue > 0 ? 1 : 0) - (view.tip ?? 0)) * Math.min(1, dt * 5);
    if (!dock) { view.dumpQueue = 0; view.loadRoot.rotation.set(0, 0, 0); return; }
    view.dumpClock = (view.dumpClock ?? 0) + dt;
    const def = DEFS[dock.type], w = dock.rotation % 2 ? def.d : def.w, d = dock.rotation % 2 ? def.w : def.d;
    const cx = (dock.x + (w - 1) / 2) * 2, cz = (dock.z + (d - 1) / 2) * 2, top = heightAt(state.seed, cx, cz) + (DOCK_MOUTH[dock.type] ?? 1.6);
    // The load slumps toward the dock while it pours out.
    at.set(cx, 0, cz); view.model.worldToLocal(at);
    const lean = Math.atan2(at.x, at.z); view.loadRoot.rotation.set(Math.cos(lean) * .55 * view.tip, 0, -Math.sin(lean) * .55 * view.tip);
    if (!(view.dumpQueue > 0)) return;
    view.loadRoot.getWorldPosition(at);
    while (view.dumpClock > .04 && view.dumpQueue > 0) {
      view.dumpClock -= .04; view.dumpQueue -= 1;
      const a = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * .55;
      regolith.lob({ x: at.x + (Math.random() - .5) * .5, y: at.y + .1, z: at.z + (Math.random() - .5) * .5 }, { x: cx + Math.cos(a) * rad, y: top - .3, z: cz + Math.sin(a) * rad }, .1 + Math.random() * .1, kind, .6 + Math.random() * .2);
    }
  }

  // Mining zones: draped outlines with a number plate, plus excavated cells that darken and widen as they deplete.
  const dashes = new THREE.InstancedMesh(own(geometries, new THREE.BoxGeometry(1, .06, .16)), own(materials, new THREE.MeshBasicMaterial({ color: '#f0a650', transparent: true, opacity: .9, depthWrite: false })), 256 * 4);
  const plates = new Map();
  function plate(id) {
    if (plates.has(id)) return plates.get(id);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const g = canvas.getContext('2d');
    g.fillStyle = '#13171bdd'; g.fillRect(4, 4, 56, 56); g.strokeStyle = '#f0a650'; g.lineWidth = 4; g.strokeRect(4, 4, 56, 56);
    g.fillStyle = '#f0a650'; g.font = '700 38px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(id), 32, 35);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
    sprite.scale.setScalar(1.1); sprite.renderOrder = 4; root.add(sprite); plates.set(id, sprite);
    return sprite;
  }
  dashes.count = 0; dashes.frustumCulled = false; root.add(dashes);
  // Dug ground is a smooth basin rather than per-cell squares: a draped sheet whose normals follow a virtual dip
  // (the voxel ground can't actually be lowered), darker freshly-turned regolith, and a real spoil berm on the rim.
  const digMaterial = own(materials, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  let digMesh = null, areaKey = '', minedKey = '';
  const ground = new THREE.Color('#a49b8f'), pit = new THREE.Color('#5d574f'), spoil = new THREE.Color('#968d80'), color = new THREE.Color();
  const DIP = .45, BERM = .16, STEP = .25, TILE = 16;
  const bump = (d2, r) => { const t = 1 - d2 / (r * r); return t > 0 ? t * t : 0; };
  function digField(mined, x, z) {
    let f = 0, wide = 0;
    const cx = Math.round(x / 2), cz = Math.round(z / 2);
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
      const amount = mined.get((cx + i) * 100003 + cz + j); if (!amount) continue;
      const dx = x - (cx + i) * 2, dz = z - (cz + j) * 2, d2 = dx * dx + dz * dz;
      f += amount * bump(d2, 1.7); wide += amount * bump(d2, 2.9);
    }
    // Flat floor and definite walls rather than a soft smudge; the berm hugs the outside of the wall.
    const dip = THREE.MathUtils.smoothstep(f * 1.45, .12, .8), rim = THREE.MathUtils.smoothstep(wide * .9, .05, .45) * (1 - THREE.MathUtils.smoothstep(f * 1.45, .05, .3));
    return [dip, rim];
  }
  function trench(state, entries) {
    const mined = new Map(), tiles = new Set();
    for (const [cell, amount] of entries) {
      const [cx, cz] = cell.split(',').map(Number); mined.set(cx * 100003 + cz, Math.min(1, amount / REGOLITH_PER_CELL));
      for (const ox of [-3, 3]) for (const oz of [-3, 3]) tiles.add(`${Math.floor((cx * 2 + ox) / TILE)},${Math.floor((cz * 2 + oz) / TILE)}`);
    }
    const positions = [], colors = [], normals = [], indices = [], n = TILE / STEP + 1, dips = new Float32Array(n * n), rims = new Float32Array(n * n), h = new Float32Array(n * n);
    for (const tile of tiles) {
      const [tx, tz] = tile.split(',').map(Number), base = positions.length / 3, alpha = [];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, [dip, rim] = digField(mined, tx * TILE + i * STEP, tz * TILE + j * STEP);
        dips[k] = dip; rims[k] = rim; h[k] = (-dip * DIP + rim * BERM) * 2.6;
      }
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = j * n + i, x = tx * TILE + i * STEP, z = tz * TILE + j * STEP, dip = dips[k], rim = rims[k];
        positions.push(x, heightAt(state.seed, x, z) + .035 + rim * BERM, z);
        const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
        const gx = (h[j * n + i1] - h[j * n + i0]) / ((i1 - i0) * STEP), gz = (h[j1 * n + i] - h[j0 * n + i]) / ((j1 - j0) * STEP), len = Math.hypot(gx, 1, gz);
        normals.push(-gx / len, 1 / len, -gz / len);
        color.copy(ground).lerp(spoil, rim * .8).lerp(pit, dip);
        const a = Math.min(.95, Math.max(dip * 1.8, rim * 1.1)); alpha.push(a);
        colors.push(color.r, color.g, color.b, a);
      }
      for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
        const k = j * n + i; if (!alpha[k] && !alpha[k + 1] && !alpha[k + n] && !alpha[k + n + 1]) continue;
        const p = base + k; indices.push(p, p + n, p + 1, p + 1, p + n, p + n + 1);
      }
    }
    if (digMesh) { root.remove(digMesh); digMesh.geometry.dispose(); digMesh = null; }
    if (!indices.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4)); geo.setIndex(indices);
    digMesh = new THREE.Mesh(geo, digMaterial); digMesh.receiveShadow = true; digMesh.frustumCulled = false; root.add(digMesh);
  }
  function updateMining(state) {
    const areas = state.miningAreas ?? [], key = `${state.seed}:` + areas.map(a => `${a.id}@${a.x},${a.z}`).join('|');
    if (key !== areaKey) {
      areaKey = key; dashes.count = 0;
      for (const [id, sprite] of plates) if (!areas.some(a => a.id === id)) { root.remove(sprite); sprite.material.map.dispose(); sprite.material.dispose(); plates.delete(id); }
      for (const a of areas) {
        const x0 = (a.x - MINING_RADIUS) * 2 - 1, x1 = (a.x + MINING_RADIUS) * 2 + 1, z0 = (a.z - MINING_RADIUS) * 2 - 1, z1 = (a.z + MINING_RADIUS) * 2 + 1;
        const edge = (ax, az, bx, bz) => {
          const length = Math.hypot(bx - ax, bz - az), steps = Math.round(length / 1.4);
          for (let i = 0; i < steps; i++) {
            const t = (i + .5) / steps, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
            dummy.position.set(x, heightAt(state.seed, x, z) + .08, z); dummy.rotation.set(0, Math.atan2(bz - az, bx - ax) * -1, 0); dummy.scale.set(.8, 1, 1);
            dummy.updateMatrix(); dashes.setMatrixAt(dashes.count++, dummy.matrix);
          }
        };
        edge(x0, z0, x1, z0); edge(x1, z0, x1, z1); edge(x1, z1, x0, z1); edge(x0, z1, x0, z0);
        plate(a.id).position.set(x0, heightAt(state.seed, x0, z0) + .7, z0);
      }
      dashes.instanceMatrix.needsUpdate = true;
    }
    const entries = Object.entries(state.mined ?? {}), signature = `${state.seed}:${entries.length}:${Math.round(entries.reduce((s, [, n]) => s + n, 0))}`;
    if (signature === minedKey) return;
    minedKey = signature;
    trench(state, entries);
  }

  let time = 0;
  return {
    rovers,
    regolith,
    update(state, dt, daylight) { time += dt; updateItems(state, time); updateRovers(state, dt, daylight); updateMining(state); regolith.update(dt); },
    dispose() { regolith.dispose(); scene.remove(root); Object.values(batches).forEach(b => b.dispose()); dashes.dispose(); digMesh?.geometry.dispose(); for (const p of plates.values()) { p.material.map.dispose(); p.material.dispose(); } geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
