import * as THREE from 'three';
import { buildingHp } from './raid.js';
import { pointCloud } from './fx-points.js';

/**
 * Raiders tearing at the base, drawn: every blow on a structure throws sparks, shrapnel and dust off it, flashes, and
 * shakes it on its footings; a damaged structure smokes, the worse the thicker, and near the end it burns; one torn
 * down goes up in a burst of wreckage. Each damaged structure carries a health bar. `groundAt(x, z)` is the ground.
 * `shake` (0–1) is how hard the camera should shake, for blows near the player.
 */
export function createRaidFx(scene, { groundAt = () => 0 } = {}) {
  const root = new THREE.Group(); root.name = 'raid-fx'; scene.add(root);
  const owned = [], keep = x => (owned.push(x), x);

  // Shrapnel: torn panels and bolts, tumbling, bouncing and settling before they fade.
  const SHARDS = 220, shardMesh = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 1, 1)), keep(new THREE.MeshStandardMaterial({ color: '#9aa0a6', metalness: .55, roughness: .45 })), SHARDS);
  shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shardMesh.frustumCulled = false; shardMesh.castShadow = true; root.add(shardMesh);
  shardMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SHARDS * 3), 3);
  const shards = [...Array(SHARDS)].map(() => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: new THREE.Vector3(), life: 0, max: 1, floor: 0 }));
  let nextShard = 0;
  const shardColors = ['#9aa0a6', '#c9ccd0', '#5b6168', '#d9a441', '#2b2f35'].map(c => new THREE.Color(c));

  // Points: sparks (additive), dust and smoke (soft, dark), embers and flame (additive). Sizes are in metres; `pixels`
  // is how many screen pixels a metre spans under the (orthographic) camera.
  const pixels = { value: 20 };
  const clouds = [], cloud = (n, opts) => { const c = pointCloud(root, pixels, n, opts); clouds.push(c); return c; };
  const sparks = cloud(420, { additive: true, color: '#ffb35c', size: .14 });
  const dust = cloud(260, { additive: false, color: '#6d6a64', size: .9, grow: 1.1 });
  const smoke = cloud(360, { additive: false, color: '#4a4b50', size: 1.2, grow: .55 });
  const flame = cloud(220, { additive: true, color: '#ff6a24', size: .6, grow: -.6 });
  const flash = new THREE.PointLight('#ff9a52', 0, 12, 2); root.add(flash);
  let shake = 0;

  const rand = (a, b) => a + (b - a) * Math.random();
  function shrapnel(x, y, z, n, power, out = null) {
    for (let i = 0; i < n; i++) {
      const index = nextShard, s = shards[index]; nextShard = (nextShard + 1) % SHARDS;
      const a = Math.random() * Math.PI * 2, up = rand(2.5, 6) * power, side = rand(1, 4) * power;
      s.p.set(x, y, z); s.v.set(Math.cos(a) * side + (out?.x ?? 0) * 3 * power, up, Math.sin(a) * side + (out?.z ?? 0) * 3 * power);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); s.w.set(rand(-14, 14), rand(-14, 14), rand(-14, 14));
      const big = Math.random() < .25, k = big ? rand(.18, .34) : rand(.05, .14);
      s.s.set(k * rand(.6, 1.6), k * rand(.15, .5), k * rand(.6, 1.4)); s.life = s.max = rand(2.4, 4.2); s.floor = groundAt(x, z) + s.s.y * .5;
      shardMesh.setColorAt(index, shardColors[Math.floor(Math.random() * shardColors.length)]);
    }
    shardMesh.instanceColor.needsUpdate = true;
  }
  function burst(x, y, z, { sparksN, dustN, shardsN, power, out }) {
    for (let i = 0; i < sparksN; i++) { const a = Math.random() * Math.PI * 2, s = rand(3, 11) * power; sparks.emit(x, y, z, Math.cos(a) * s * .7 + (out?.x ?? 0) * s, rand(1, 7) * power, Math.sin(a) * s * .7 + (out?.z ?? 0) * s, rand(.25, .7), rand(.6, 1.3)); }
    for (let i = 0; i < dustN; i++) { const a = Math.random() * Math.PI * 2, s = rand(.4, 2.2) * power; dust.emit(x + rand(-.4, .4), y + rand(-.5, .3), z + rand(-.4, .4), Math.cos(a) * s, rand(.2, 1.4), Math.sin(a) * s, rand(1.2, 2.4), rand(.5, 1)); }
    shrapnel(x, y, z, shardsN, power, out);
  }

  // Each blow shakes its structure on its footings; `jolt` holds how hard, per building id.
  const jolt = new Map(), shaken = new Map(), smokeClock = new Map();
  const bars = new Map(), barGeo = keep(new THREE.PlaneGeometry(1, 1)), barBack = keep(new THREE.MeshBasicMaterial({ color: '#120a09', transparent: true, opacity: .85, depthTest: false, fog: false, toneMapped: false })), right = new THREE.Vector3();
  function barFor(id) {
    let b = bars.get(id); if (b) return b;
    const g = new THREE.Group(), back = new THREE.Mesh(barGeo, barBack), fill = new THREE.Mesh(barGeo, keep(new THREE.MeshBasicMaterial({ color: '#ff5a3c', transparent: true, depthTest: false, fog: false, toneMapped: false })));
    back.renderOrder = 30; fill.renderOrder = 31; back.scale.set(2.7, .36, 1); fill.position.z = .001; g.add(back, fill); root.add(g);
    b = { g, fill, shown: 0 }; bars.set(id, b); return b;
  }

  /**
   * Raid events this step (raid.js stepRaiders): strike {building, x, z, damage, crawler} and wreck. `structures` maps
   * building ids to their drawn models; `player` is where the camera is, for the shake.
   */
  function apply(events, state, structures, player) {
    for (const e of events) {
      if (e.type !== 'strike' && e.type !== 'wreck') continue;
      const o = structures.get(e.building), c = e.crawler;
      const edge = { x: e.x ?? o?.root.position.x ?? c.x, z: e.z ?? o?.root.position.z ?? c.z };
      let ox = (c?.x ?? edge.x) - edge.x, oz = (c?.z ?? edge.z) - edge.z; const len = Math.hypot(ox, oz) || 1; ox /= len; oz /= len;
      const size = c?.size ?? 1, power = Math.min(1.8, .55 + .25 * size + (e.damage ?? 10) / 40) * (e.slam ? 1.3 : 1);
      const x = edge.x + ox * .9, z = edge.z + oz * .9, y = groundAt(x, z) + rand(.5, 1.2) * Math.min(1.6, .7 + .3 * size);
      const near = Math.hypot(x - player.x, z - player.z);
      if (e.type === 'strike') {
        burst(x, y, z, { sparksN: Math.round(26 * power), dustN: Math.round(6 * power), shardsN: Math.round(5 * power), power, out: { x: ox, z: oz } });
        flash.position.set(x + ox * .4, y + .3, z + oz * .4); flash.intensity = Math.max(flash.intensity, 30 * power);
        jolt.set(e.building, Math.min(1, (jolt.get(e.building) ?? 0) + .45 * power));
        shake = Math.max(shake, Math.max(0, 1 - near / 22) * .25 * power);
      } else {
        const at = o?.root.position ?? { x, y, z }, gy = groundAt(at.x, at.z);
        for (let i = 0; i < 4; i++) burst(at.x + rand(-1, 1), gy + rand(.4, 1.8), at.z + rand(-1, 1), { sparksN: 40, dustN: 22, shardsN: 14, power: 1.5 });
        for (let i = 0; i < 40; i++) smoke.emit(at.x + rand(-1.2, 1.2), gy + rand(.2, 1.5), at.z + rand(-1.2, 1.2), rand(-.6, .6), rand(.6, 2), rand(-.6, .6), rand(3, 6), rand(.8, 1.6));
        flash.position.set(at.x, gy + 1.5, at.z); flash.intensity = 160;
        shake = Math.max(shake, Math.max(0, 1 - near / 30) * .8);
      }
    }
  }

  function update(state, structures, camera, height, dt) {
    const raw = state.buildings;
    if (camera.isOrthographicCamera) pixels.value = height / ((camera.top - camera.bottom) / camera.zoom);
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    for (const [id, j] of jolt) {
      const o = structures.get(id), k = Math.max(0, j - dt * 3);
      if (!o || k <= 0) { jolt.delete(id); if (o && shaken.get(id)) { o.root.rotation.x = o.root.rotation.z = 0; } shaken.delete(id); continue; }
      jolt.set(id, k);
      if (o.type === 'conveyor') continue;
      const a = k * k;
      o.root.position.x += (Math.random() - .5) * .22 * a; o.root.position.z += (Math.random() - .5) * .22 * a; o.root.position.y += Math.random() * .06 * a;
      o.root.rotation.x = (Math.random() - .5) * .07 * a; o.root.rotation.z = (Math.random() - .5) * .07 * a; shaken.set(id, true);
    }
    const live = new Set();
    for (const b of raw) {
      if (!b.built || b.hp == null) continue;
      const o = structures.get(b.id); if (!o) continue;
      live.add(b.id);
      const k = Math.max(0, b.hp / buildingHp(b.type)), hurt = 1 - k, at = o.root.position, top = at.y + (o.statusHeight ?? 2) * .8;
      // Smoke thickens as it weakens; under a third it burns.
      let clock = (smokeClock.get(b.id) ?? Math.random()) + dt * (hurt > .25 ? 3 + 14 * hurt : 0);
      for (; clock > 1; clock--) smoke.emit(at.x + rand(-.7, .7), top + rand(-.3, .2), at.z + rand(-.7, .7), rand(-.15, .15) + .25, rand(.7, 1.5), rand(-.15, .15), rand(2.5, 4.5), rand(.5, .9) * (.6 + hurt));
      smokeClock.set(b.id, clock);
      if (k < .35) {
        for (let i = 0; i < 2; i++) if (Math.random() < dt * 30) flame.emit(at.x + rand(-.8, .8), top - rand(.2, .9), at.z + rand(-.8, .8), rand(-.2, .2), rand(.8, 2.2), rand(-.2, .2), rand(.35, .7), rand(.6, 1.1));
        if (Math.random() < dt * 6) sparks.emit(at.x + rand(-.8, .8), top - rand(0, .8), at.z + rand(-.8, .8), rand(-2, 2), rand(1, 4), rand(-2, 2), rand(.2, .5), .7);
      }
      const bar = barFor(b.id); bar.shown = Math.min(1, bar.shown + dt * 4);
      bar.g.visible = true; bar.g.position.set(at.x, at.y + (o.statusHeight ?? 2) + .55, at.z); bar.g.quaternion.copy(camera.quaternion);
      bar.fill.scale.set(2.5 * k, .2, 1); bar.fill.position.x = -1.25 * (1 - k);
      bar.fill.material.color.set(k < .35 ? '#ff3b2a' : k < .65 ? '#ff9a3c' : '#ffd36a');
      bar.g.scale.setScalar(bar.shown);
    }
    for (const [id, bar] of bars) if (!live.has(id)) { bar.g.removeFromParent(); bar.fill.material.dispose(); bars.delete(id); smokeClock.delete(id); }
    for (let i = 0; i < SHARDS; i++) {
      const s = shards[i];
      if (s.life <= 0) { shardMesh.setMatrixAt(i, ZERO); continue; }
      s.life -= dt; s.v.y -= 9.8 * dt;
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < s.floor) { s.p.y = s.floor; s.v.y *= -.35; s.v.x *= .55; s.v.z *= .55; s.w.multiplyScalar(.6); }
      s.r.x += s.w.x * dt; s.r.y += s.w.y * dt; s.r.z += s.w.z * dt;
      const fade = Math.min(1, s.life / .6);
      shardDummy.position.copy(s.p); shardDummy.rotation.copy(s.r); shardDummy.scale.copy(s.s).multiplyScalar(fade); shardDummy.updateMatrix();
      shardMesh.setMatrixAt(i, shardDummy.matrix);
    }
    shardMesh.instanceMatrix.needsUpdate = true;
    sparks.update(dt, 9, 1.2, groundAt); dust.update(dt, -.1, 1.6); smoke.update(dt, -.35, .6); flame.update(dt, -1.5, 1);
    flash.intensity = Math.max(0, flash.intensity - dt * 300);
    shake = Math.max(0, shake - dt * 2);
  }
  const shardDummy = new THREE.Object3D(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < SHARDS; i++) shardMesh.setMatrixAt(i, ZERO);

  return {
    apply, update,
    get shake() { return shake; },
    dispose() { root.removeFromParent(); for (const bar of bars.values()) bar.fill.material.dispose(); owned.forEach(x => x.dispose()); clouds.forEach(c => c.dispose()); shardMesh.dispose(); },
  };
}
