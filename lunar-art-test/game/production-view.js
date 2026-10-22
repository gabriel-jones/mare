import * as THREE from 'three';
import { DIRS } from './defs.js';
import { surfaceHeightAt as heightAt } from './terrain.js';
import { ROVER, MINING_RADIUS, REGOLITH_PER_CELL, beltTurns } from './production.js';

// Presentation for the Phase B logistics layer: rovers, belt items and the mining area.
export function createProductionView(scene, models) {
  const root = new THREE.Group(); scene.add(root);
  const geometries = [], materials = [];
  const own = (list, item) => { list.push(item); return item; };

  // Belt items: one instanced batch per material type.
  const itemLooks = {
    regolith: [own(geometries, new THREE.IcosahedronGeometry(.2, 0)), own(materials, new THREE.MeshStandardMaterial({ color: '#8f877b', roughness: 1, flatShading: true }))],
    metal: [own(geometries, new THREE.BoxGeometry(.42, .16, .24)), own(materials, new THREE.MeshStandardMaterial({ color: '#d4dbe0', metalness: .8, roughness: .3 }))],
    silicon: [own(geometries, new THREE.BoxGeometry(.3, .08, .3)), own(materials, new THREE.MeshStandardMaterial({ color: '#25466a', metalness: .5, roughness: .2, emissive: '#0f2742', emissiveIntensity: .4 }))],
  };
  const batches = {}, dummy = new THREE.Object3D();
  for (const [type, [geo, mat]] of Object.entries(itemLooks)) {
    const mesh = new THREE.InstancedMesh(geo, mat, 4096); mesh.castShadow = true; mesh.count = 0; mesh.frustumCulled = false; root.add(mesh); batches[type] = mesh;
  }
  function updateItems(state, time) {
    const counts = { regolith: 0, metal: 0, silicon: 0 }, turns = beltTurns(state);
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
        dummy.position.set(x, heightAt(state.seed, cx, cz) + .5, z);
        dummy.rotation.set(0, heading + (item.type === 'regolith' ? item.p * 2 + time * .1 : 0), 0);
        dummy.updateMatrix(); mesh.setMatrixAt(counts[item.type]++, dummy.matrix);
      }
    }
    for (const [type, mesh] of Object.entries(batches)) { mesh.count = counts[type]; mesh.instanceMatrix.needsUpdate = true; }
  }

  // Rovers: wheels roll with distance travelled, the drill digs, and the cargo mound fills.
  const rovers = new Map();
  function createRoverView() {
    const template = models.get('rover');
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
    view.beacon = new THREE.PointLight('#ffb35c', 0, 7, 2); view.beacon.position.set(.36, 2.1, .45); view.root.add(view.beacon);
    view.display = null; view.digTime = 0;
    return view;
  }
  function updateRovers(state, dt, daylight) {
    const live = new Set();
    for (const r of state.robots ?? []) {
      live.add(r.id);
      let view = rovers.get(r.id);
      if (!view) { view = createRoverView(); rovers.set(r.id, view); }
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
      if (view.cargo) { const load = Math.max(0, Math.min(1, r.cargo / ROVER.capacity)); view.cargo.visible = load > .02; view.cargo.scale.set(.6 + .4 * load, Math.max(.05, load), .6 + .4 * load); }
      view.beacon.intensity = r.task === 'idle' ? 0 : (1 - daylight) * 5 + .6;
    }
    for (const [id, view] of rovers) if (!live.has(id)) { root.remove(view.root); rovers.delete(id); }
  }

  // Mining area: draped outline plus excavated cells that darken and widen as they deplete.
  const dashes = new THREE.InstancedMesh(own(geometries, new THREE.BoxGeometry(1, .06, .16)), own(materials, new THREE.MeshBasicMaterial({ color: '#f0a650', transparent: true, opacity: .9, depthWrite: false })), 256);
  dashes.count = 0; dashes.frustumCulled = false; root.add(dashes);
  const digMaterial = own(materials, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: .85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  let digMesh = null, areaKey = '', minedKey = '';
  const ground = new THREE.Color('#a49b8f'), pit = new THREE.Color('#4f4a44'), color = new THREE.Color();
  function updateMining(state) {
    const a = state.miningArea, key = a ? `${state.seed}:${a.x},${a.z}` : '';
    if (key !== areaKey) {
      areaKey = key; dashes.count = 0;
      if (a) {
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
        dashes.instanceMatrix.needsUpdate = true;
      }
    }
    const entries = Object.entries(state.mined ?? {}), signature = `${state.seed}:${entries.length}:${Math.round(entries.reduce((s, [, n]) => s + n, 0))}`;
    if (signature === minedKey) return;
    minedKey = signature;
    const positions = [], colors = [], indices = [];
    for (const [cell, amount] of entries) {
      const [cx, cz] = cell.split(',').map(Number), depletion = Math.min(1, amount / REGOLITH_PER_CELL), half = .45 + .5 * depletion, base = positions.length / 3;
      color.copy(ground).lerp(pit, .35 + .65 * depletion);
      for (let j = 0; j <= 2; j++) for (let i = 0; i <= 2; i++) {
        const x = cx * 2 + (i - 1) * half, z = cz * 2 + (j - 1) * half;
        positions.push(x, heightAt(state.seed, x, z) + .04, z); colors.push(color.r, color.g, color.b);
      }
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const p = base + j * 3 + i; indices.push(p, p + 3, p + 1, p + 1, p + 3, p + 4); }
    }
    if (digMesh) { root.remove(digMesh); digMesh.geometry.dispose(); digMesh = null; }
    if (!indices.length) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    digMesh = new THREE.Mesh(geo, digMaterial); digMesh.receiveShadow = true; root.add(digMesh);
  }

  let time = 0;
  return {
    rovers,
    update(state, dt, daylight) { time += dt; updateItems(state, time); updateRovers(state, dt, daylight); updateMining(state); },
    dispose() { scene.remove(root); digMesh?.geometry.dispose(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); },
  };
}
