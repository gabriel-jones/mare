import * as THREE from 'three';
import { pointCloud } from './fx-points.js';
import { FENCE, fenceRuns } from './defense.js';

const FENCE_DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const WIRE = 'Lunar • live fence wire';

/**
 * Turrets and fences, drawn. A turret's head follows its sim aim and its cradle pitches to the target; each round kicks
 * one barrel back (they take turns), flashes at its muzzle, throws a tracer at the target and a casing out of the
 * head. A fence shows a span of wire to each neighbour; live wire glows, a shock throws a crackling arc onto the
 * crawler, goo pools under a fouled segment, a short bangs and sputters, and a burning one flames.
 * `groundAt(x, z)` is the ground.
 */
export function createDefenseFx(scene, { groundAt = () => 0 } = {}) {
  const root = new THREE.Group(); root.name = 'defense-fx'; scene.add(root);
  const owned = [], keep = x => (owned.push(x), x), pixels = { value: 20 };
  const clouds = [], cloud = (n, opts) => { const c = pointCloud(root, pixels, n, opts); clouds.push(c); return c; };
  const sparks = cloud(360, { additive: true, color: '#ffc06a', size: .12 });
  const arcSparks = cloud(300, { additive: true, color: '#9fe8ff', size: .13 });
  const goo = cloud(260, { additive: false, color: '#050407', size: .2 });
  const dust = cloud(200, { additive: false, color: '#77736b', size: .6, grow: 1.2 });
  const smoke = cloud(240, { additive: false, color: '#55565b', size: .9, grow: .6 });
  const flame = cloud(220, { additive: true, color: '#ff7a2a', size: .45, grow: -.7 });
  const muzzleLight = new THREE.PointLight('#ffb766', 0, 10, 2), zapLight = new THREE.PointLight('#8fdcff', 0, 9, 2);
  root.add(muzzleLight, zapLight);
  const rand = (a, b) => a + (b - a) * Math.random();

  // Muzzle flashes: a hot core and a four-pointed star, billboarded.
  const flashTexture = keep((() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,240,1)'); r.addColorStop(.25, 'rgba(255,214,120,.95)'); r.addColorStop(.6, 'rgba(255,130,40,.35)'); r.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = r; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,230,160,.9)';
    for (const a of [0, Math.PI / 2]) { g.save(); g.translate(64, 64); g.rotate(a + Math.PI / 4); g.beginPath(); g.moveTo(-64, 0); g.lineTo(0, -6); g.lineTo(64, 0); g.lineTo(0, 6); g.closePath(); g.fill(); g.restore(); }
    return new THREE.CanvasTexture(c);
  })());
  const flashes = [...Array(8)].map(() => { const m = keep(new THREE.SpriteMaterial({ map: flashTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })), s = new THREE.Sprite(m); s.visible = false; root.add(s); return { s, life: 0 }; });
  let nextFlash = 0;

  // Tracers: short bright streaks that fly from the muzzle to where the round lands.
  const streakGeo = keep(new THREE.BoxGeometry(1, 1, 1)); streakGeo.translate(0, 0, -.5);
  const tracerMat = keep(new THREE.MeshBasicMaterial({ color: '#ffd98a', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
  const tracers = [...Array(16)].map(() => { const m = new THREE.Mesh(streakGeo, tracerMat); m.visible = false; m.frustumCulled = false; root.add(m); return { m, a: new THREE.Vector3(), b: new THREE.Vector3(), d: 0, t: 0, on: false, hit: false, size: 1, goo: true }; });
  let nextTracer = 0;

  // Spent casings, ejected out of the head's side.
  const CASES = 48, caseMesh = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(.035, .035, .16, 6)), keep(new THREE.MeshStandardMaterial({ color: '#c99a3e', metalness: .85, roughness: .3 })), CASES);
  caseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); caseMesh.frustumCulled = false; root.add(caseMesh);
  const cases = [...Array(CASES)].map(() => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), life: 0, floor: 0 }));
  let nextCase = 0;

  // Arcs: jagged chains of thin bright segments from the wire to the crawler, re-struck every few frames.
  const SEGS = 9, ARCS = 18, arcGeo = keep(new THREE.BoxGeometry(1, 1, 1)); arcGeo.translate(0, 0, .5);
  const arcMat = keep(new THREE.MeshBasicMaterial({ color: '#c9f3ff', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
  const arcGlowMat = keep(new THREE.MeshBasicMaterial({ color: '#3fb8ff', blending: THREE.AdditiveBlending, transparent: true, opacity: .45, depthWrite: false, fog: false }));
  const arcMesh = new THREE.InstancedMesh(arcGeo, arcMat, ARCS * SEGS), glowMesh = new THREE.InstancedMesh(arcGeo, arcGlowMat, ARCS * SEGS);
  for (const m of [arcMesh, glowMesh]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; root.add(m); }
  const arcs = [...Array(ARCS)].map(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), life: 0, restrike: 0, points: [...Array(SEGS + 1)].map(() => new THREE.Vector3()) }));
  let nextArc = 0;
  const dummy = new THREE.Object3D(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), right = new THREE.Vector3();
  for (let i = 0; i < CASES; i++) caseMesh.setMatrixAt(i, ZERO);
  for (let i = 0; i < ARCS * SEGS; i++) { arcMesh.setMatrixAt(i, ZERO); glowMesh.setMatrixAt(i, ZERO); }
  const pudGeo = keep(new THREE.CircleGeometry(1, 18)); pudGeo.rotateX(-Math.PI / 2);

  /** Finds a turret's or fence's moving parts in a fresh model and parents the turret's Head > Cradle > barrels. */
  function rig(o, type, part) {
    if (type === 'turret') {
      const head = part('Head'), cradle = part('Cradle'), barrels = [part('BarrelL'), part('BarrelR')];
      if (!head || !cradle || barrels.some(b => !b)) return;
      o.root.updateMatrixWorld(true);
      head.attach(cradle); for (const b of barrels) cradle.attach(b);
      o.root.updateMatrixWorld(true);
      // A muzzle marker at the front of each bore.
      o.tips = barrels.map(b => { const box = new THREE.Box3().setFromObject(b), tip = new THREE.Object3D(); tip.position.copy(b.worldToLocal(new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z))); b.add(tip); return tip; });
      Object.assign(o, { head, cradle, barrels, rest: barrels.map(b => b.position.z), kick: [0, 0], pitch: 0 });
    }
    if (type === 'fence') {
      o.spans = [0, 1, 2, 3].map(i => part(`Span${i}`));
      const pud = new THREE.Mesh(pudGeo, new THREE.MeshStandardMaterial({ color: '#060508', roughness: .12, metalness: .3, transparent: true, opacity: 0, depthWrite: false }));
      pud.position.y = .03; pud.visible = false; pud.renderOrder = 2; o.root.add(pud); o.puddle = pud;
    }
  }

  /** Every frame, per turret or fence model: aim, recoil, spans, wire glow, goo. */
  function pose(o, b, dt, state, cells, dead) {
    if (o.head) {
      o.head.rotation.y = (b.yaw ?? b.rotation * Math.PI / 2) - b.rotation * Math.PI / 2;
      let pitch = 0;
      if (b.target && b.built) {
        const at = o.root.position, ty = groundAt(b.target.x, b.target.z) + .45 * (b.target.size ?? 1), d = Math.hypot(b.target.x - at.x, b.target.z - at.z);
        pitch = Math.max(-.35, Math.min(.6, Math.atan2(ty - (at.y + 1.62), d)));
      }
      o.pitch += (pitch - o.pitch) * Math.min(1, dt * 8); o.cradle.rotation.x = -o.pitch;
      for (let i = 0; i < 2; i++) { o.kick[i] = Math.max(0, o.kick[i] - dt * 9); o.barrels[i].position.z = o.rest[i] - .32 * Math.sin(Math.min(1, o.kick[i]) * Math.PI / 2); }
    }
    if (o.spans) {
      for (let i = 0; i < 4; i++) if (o.spans[i]) o.spans[i].visible = cells.has(`${b.x + rotX(i, b.rotation)},${b.z + rotZ(i, b.rotation)}`);
      if (!b.built) { o.puddle.visible = false; return; }
      o.wires ??= [...new Set(o.spans.flatMap(s => { const list = []; s?.traverse(n => { if (n.isMesh) for (const m of [n.material].flat()) if (m.name === WIRE) list.push(m); }); return list; }))];
      const live = state.power.powered !== false && !dead, foul = Math.min(1, (b.foul ?? 0) / FENCE.short) + (b.short ? .3 : 0);
      for (const m of o.wires) {
        m.userData.wireColor ??= m.color.clone();
        m.emissiveIntensity = live ? (m.userData.baseEmission || 1.2) * (.55 + .45 * Math.sin(state.time * 13 + b.id * 1.7) ** 2) * (1 - .7 * Math.min(1, foul)) : 0;
        m.color.copy(m.userData.wireColor).multiplyScalar(1 - .85 * Math.min(1, foul));
      }
      const k = Math.min(1.2, (b.foul ?? 0) / FENCE.short + (b.short ? .4 : 0));
      o.puddle.visible = k > .05; o.puddle.material.opacity = Math.min(.92, .35 + k * .6); o.puddle.scale.setScalar(.35 + k * .75);
      o.puddle.position.y = groundAt(o.root.position.x, o.root.position.z) - o.root.position.y + .03;
    }
  }
  // The span toward local direction i, turned by the building's rotation into a world grid step.
  const rotX = (i, r) => FENCE_DIRS[(i + r) % 4][0], rotZ = (i, r) => FENCE_DIRS[(i + r) % 4][1];

  function flashAt(p, size) {
    const f = flashes[nextFlash]; nextFlash = (nextFlash + 1) % flashes.length;
    f.s.position.copy(p); f.s.scale.setScalar(size); f.s.material.rotation = Math.random() * Math.PI; f.s.material.opacity = 1; f.s.visible = true; f.life = .07;
  }
  function strike(a, b) {
    const arc = arcs[nextArc]; nextArc = (nextArc + 1) % ARCS;
    arc.a.copy(a); arc.b.copy(b); arc.life = .22; arc.restrike = 0;
  }

  /** Events from stepDefenses: turret, zap, short, splash, burnt. */
  function apply(events, state, structures) {
    for (const e of events) {
      const o = structures.get(e.building);
      if (!o) continue;
      if (e.type === 'turret' && o.tips) {
        const tip = o.tips[e.side] ?? o.tips[0];
        o.kick[e.side] = 1;
        tip.getWorldPosition(tmp);
        flashAt(tmp, rand(1, 1.4));
        muzzleLight.position.copy(tmp); muzzleLight.intensity = 40;
        for (let i = 0; i < 3; i++) smoke.emit(tmp.x, tmp.y, tmp.z, rand(-.3, .3), rand(.2, .6), rand(-.3, .3), rand(.6, 1.1), rand(.25, .45));
        const hitY = e.hit ? groundAt(e.x, e.z) + .45 * (e.size ?? 1) : groundAt(e.x, e.z) + .05, t = tracers[nextTracer]; nextTracer = (nextTracer + 1) % tracers.length;
        t.a.copy(tmp); t.b.set(e.x, hitY, e.z); t.d = t.a.distanceTo(t.b); t.t = 0; t.on = true; t.hit = e.hit; t.size = e.size ?? 1;
        // A casing out of the head's side, away from the firing barrel's twin.
        const c = cases[nextCase]; nextCase = (nextCase + 1) % CASES;
        o.head.getWorldPosition(c.p); c.p.y += .45;
        right.set(Math.cos(o.head.rotation.y + o.root.rotation.y), 0, -Math.sin(o.head.rotation.y + o.root.rotation.y)).multiplyScalar(e.side ? 1 : -1);
        c.p.addScaledVector(right, .7); c.v.copy(right).multiplyScalar(rand(1.8, 3.2)); c.v.y = rand(2, 3.4); c.v.x += rand(-.5, .5); c.v.z += rand(-.5, .5);
        c.r.set(rand(0, 6), rand(0, 6), rand(0, 6)); c.w.set(rand(-20, 20), rand(-20, 20), rand(-20, 20)); c.life = 2.2; c.floor = groundAt(c.p.x, c.p.z) + .03;
      }
      if (e.type === 'zap') {
        const at = o.root.position, dx = e.x - at.x, dz = e.z - at.z, d = Math.hypot(dx, dz) || 1;
        tmp.set(at.x + dx / d * .35, groundAt(at.x, at.z) + rand(.5, 1.4), at.z + dz / d * .35);
        tmp2.set(e.x, groundAt(e.x, e.z) + .3 + .3 * (e.size ?? 1), e.z);
        strike(tmp, tmp2); if (Math.random() < .5) strike(tmp, tmp2);
        zapLight.position.copy(tmp2).lerp(tmp, .5); zapLight.intensity = 55;
        for (let i = 0; i < 14; i++) { const a = Math.random() * Math.PI * 2, s = rand(1.5, 5); arcSparks.emit(tmp2.x, tmp2.y, tmp2.z, Math.cos(a) * s, rand(1, 4), Math.sin(a) * s, rand(.2, .5), rand(.6, 1.2)); }
        for (let i = 0; i < 4; i++) smoke.emit(tmp2.x, tmp2.y, tmp2.z, rand(-.3, .3), rand(.4, 1), rand(-.3, .3), rand(.8, 1.4), rand(.3, .5));
      }
      if (e.type === 'short' || e.type === 'burnt') {
        const at = o.root.position, y = groundAt(at.x, at.z) + 1.1;
        for (let i = 0; i < 50; i++) { const a = Math.random() * Math.PI * 2, s = rand(2, 8); arcSparks.emit(at.x, y, at.z, Math.cos(a) * s, rand(1, 6), Math.sin(a) * s, rand(.3, .8), rand(.7, 1.4)); }
        for (let i = 0; i < 24; i++) sparks.emit(at.x, y, at.z, rand(-4, 4), rand(1, 6), rand(-4, 4), rand(.3, .7), rand(.6, 1.1));
        for (let i = 0; i < 10; i++) smoke.emit(at.x + rand(-.4, .4), y, at.z + rand(-.4, .4), rand(-.4, .4), rand(.6, 1.5), rand(-.4, .4), rand(1.5, 3), rand(.6, 1));
        flashAt(tmp.set(at.x, y, at.z), 2.6);
        zapLight.position.set(at.x, y + .4, at.z); zapLight.intensity = 140;
        for (let i = 0; i < 3; i++) strike(tmp.set(at.x + rand(-1, 1), y + rand(-.5, .4), at.z + rand(-1, 1)), tmp2.set(at.x + rand(-1, 1), groundAt(at.x, at.z) + .05, at.z + rand(-1, 1)));
      }
      if (e.type === 'splash') {
        const at = o.root.position, y = groundAt(at.x, at.z) + .9;
        for (let i = 0; i < Math.min(30, 6 + e.amount * 10); i++) goo.emit(at.x + rand(-.6, .6), y + rand(-.3, .5), at.z + rand(-.6, .6), rand(-1, 1), rand(.5, 2.2), rand(-1, 1), rand(.6, 1.2), rand(.5, 1.2));
      }
    }
  }

  function update(state, structures, camera, height, dt) {
    if (camera.isOrthographicCamera) pixels.value = height / ((camera.top - camera.bottom) / camera.zoom);
    // Shorted fences sputter, burning ones flame, live ones crackle now and then.
    const dead = new Set(fenceRuns(state).filter(r => r.dead).flatMap(r => r.segments));
    for (const b of state.buildings) {
      if (b.type !== 'fence' || !b.built) continue;
      const o = structures.get(b.id); if (!o) continue;
      const at = o.root.position, y = groundAt(at.x, at.z);
      if (b.fire > 0) {
        for (let i = 0; i < 3; i++) if (Math.random() < dt * 26) flame.emit(at.x + rand(-.8, .8), y + rand(.3, 1.4), at.z + rand(-.8, .8), rand(-.2, .2), rand(.8, 2), rand(-.2, .2), rand(.35, .7), rand(.7, 1.2));
        if (Math.random() < dt * 10) smoke.emit(at.x + rand(-.5, .5), y + 1.6, at.z + rand(-.5, .5), rand(-.2, .2) + .2, rand(.8, 1.6), rand(-.2, .2), rand(2, 3.5), rand(.6, 1));
      }
      if (b.short && Math.random() < dt * 3) {
        const sy = y + [.5, .95, 1.4][Math.floor(Math.random() * 3)];
        for (let i = 0; i < 6; i++) arcSparks.emit(at.x + rand(-.3, .3), sy, at.z + rand(-.3, .3), rand(-2, 2), rand(0, 3), rand(-2, 2), rand(.15, .4), .8);
        zapLight.position.set(at.x, sy, at.z); zapLight.intensity = Math.max(zapLight.intensity, 18);
      } else if (!b.short && !dead.has(b) && state.power.powered !== false && Math.random() < dt * .25) {
        arcSparks.emit(at.x + rand(-.9, .9), y + [.5, .95, 1.4][Math.floor(Math.random() * 3)], at.z + rand(-.9, .9), rand(-.5, .5), rand(.2, 1), rand(-.5, .5), .25, .6);
      }
    }
    for (const f of flashes) { if (!f.s.visible) continue; f.life -= dt; f.s.material.opacity = Math.max(0, f.life / .07); if (f.life <= 0) f.s.visible = false; }
    for (const t of tracers) {
      if (!t.on) { t.m.visible = false; continue; }
      t.t += dt * 160;
      const head = Math.min(t.t, t.d), tail = Math.min(t.d, Math.max(0, t.t - 3.2));
      if (tail >= t.d - .01) {
        t.on = false; t.m.visible = false;
        const x = t.b.x, y = t.b.y, z = t.b.z;
        if (t.hit) { for (let i = 0; i < 9; i++) goo.emit(x, y, z, rand(-2, 2), rand(.5, 3), rand(-2, 2), rand(.5, 1), rand(.5, 1.1)); for (let i = 0; i < 6; i++) sparks.emit(x, y, z, rand(-3, 3), rand(.5, 3), rand(-3, 3), rand(.1, .3), .7); }
        else { for (let i = 0; i < 3; i++) dust.emit(x, y, z, rand(-.6, .6), rand(.3, 1.2), rand(-.6, .6), rand(.8, 1.4), rand(.4, .8)); for (let i = 0; i < 5; i++) sparks.emit(x, y, z, rand(-2.5, 2.5), rand(1, 3.5), rand(-2.5, 2.5), rand(.15, .35), .7); }
        continue;
      }
      tmp.copy(t.a).lerp(t.b, head / t.d); tmp2.copy(t.a).lerp(t.b, tail / t.d);
      t.m.visible = true; t.m.position.copy(tmp); t.m.lookAt(tmp2); t.m.rotateY(Math.PI); t.m.scale.set(.07, .07, Math.max(.05, head - tail));
    }
    for (let i = 0; i < CASES; i++) {
      const c = cases[i];
      if (c.life <= 0) { caseMesh.setMatrixAt(i, ZERO); continue; }
      c.life -= dt; c.v.y -= 9.8 * dt; c.p.addScaledVector(c.v, dt);
      if (c.p.y < c.floor) { c.p.y = c.floor; c.v.y *= -.35; c.v.x *= .5; c.v.z *= .5; c.w.multiplyScalar(.5); }
      c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
      dummy.position.copy(c.p); dummy.rotation.copy(c.r); dummy.scale.setScalar(Math.min(1, c.life / .4)); dummy.updateMatrix(); caseMesh.setMatrixAt(i, dummy.matrix);
    }
    caseMesh.instanceMatrix.needsUpdate = true;
    let slot = 0;
    for (const arc of arcs) {
      if (arc.life <= 0) continue;
      arc.life -= dt;
      if ((arc.restrike -= dt) <= 0) {
        arc.restrike = .035;
        const len = arc.a.distanceTo(arc.b);
        for (let k = 0; k <= SEGS; k++) {
          const t = k / SEGS, j = k && k < SEGS ? Math.sin(t * Math.PI) * len * .22 : 0;
          arc.points[k].copy(arc.a).lerp(arc.b, t).add(tmp.set(rand(-j, j), rand(-j, j) * .7, rand(-j, j)));
        }
      }
      const w = Math.max(.02, arc.life / .22);
      for (let k = 0; k < SEGS; k++, slot++) {
        const p = arc.points[k], q = arc.points[k + 1], d = p.distanceTo(q);
        dummy.position.copy(p); dummy.lookAt(q); dummy.scale.set(.05 * w, .05 * w, d); dummy.updateMatrix(); arcMesh.setMatrixAt(slot, dummy.matrix);
        dummy.scale.set(.2 * w, .2 * w, d); dummy.updateMatrix(); glowMesh.setMatrixAt(slot, dummy.matrix);
      }
    }
    for (; slot < ARCS * SEGS; slot++) { arcMesh.setMatrixAt(slot, ZERO); glowMesh.setMatrixAt(slot, ZERO); }
    arcMesh.instanceMatrix.needsUpdate = glowMesh.instanceMatrix.needsUpdate = true;
    sparks.update(dt, 9, 1.2, groundAt); arcSparks.update(dt, 6, 2, groundAt); goo.update(dt, 8, .8, groundAt); dust.update(dt, -.1, 1.6); smoke.update(dt, -.4, .6); flame.update(dt, -1.5, 1);
    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 600); zapLight.intensity = Math.max(0, zapLight.intensity - dt * 500);
  }

  return {
    rig, pose, apply, update,
    /** Fence cells (for spans) and the dead runs, once a frame before posing. */
    frame(state) { return { cells: new Set(state.buildings.filter(b => b.type === 'fence').map(b => `${b.x},${b.z}`)), dead: new Set(fenceRuns(state).filter(r => r.dead).flatMap(r => r.segments)) }; },
    dispose() { root.removeFromParent(); clouds.forEach(c => c.dispose()); owned.forEach(x => x.dispose()); caseMesh.dispose(); arcMesh.dispose(); glowMesh.dispose(); },
  };
}
