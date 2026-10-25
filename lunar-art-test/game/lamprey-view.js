import * as THREE from 'three';
import { along } from './centipede.js';
import { jelly, flat } from './horror-view.js';

/**
 * The Martian centipede: a legless jelly worm, its front a round lamprey maw ringed with hooked teeth. Driven by the
 * centipede's sim (centipede.js): the body lies along the head's trail, so it pours into the ground behind the head
 * and uncoils out of the same hole. Same interface as centipede-view.js. `groundAt(x, z)` is the ground in the
 * parent's space; with `clip`, whatever is below the parent's y = 0 is cut away so it can burrow through a flat floor.
 */
export const LAMPREY = Object.freeze({ radius: .48, rings: 3, sides: 14, gills: 7, spots: 14 });

const UP = new THREE.Vector3(0, 1, 0), TEETH = [[16, .8, 1], [12, .58, .85], [8, .36, .7]], RASP = 7, CIRRI = 12;

export function createLampreyView(parent, { segments = 18, spacing = .55, mode = 'studio', sight = null, toCave = null, viewDir = null, groundAt = null, clip: clipped = true, castShadow = true } = {}) {
  const R = LAMPREY.radius, L = segments * spacing, RINGS = segments * LAMPREY.rings + 1, SIDES = LAMPREY.sides;
  const root = new THREE.Group(), owned = [], keep = x => (owned.push(x), x); parent.add(root);
  const look = { mode, sight, toCave, viewDir }, gy = groundAt ?? (() => 0);
  const time = { value: 0 }, pulse = { value: 0 }, heat = { value: 0 }, char = { value: 0 };
  const shared = { uTime: time, uPulse: pulse, uHeat: heat, uChar: char };
  const ground = new THREE.Plane(UP.clone(), .02), floorAt = new THREE.Vector3();
  const clip = m => { if (clipped) { m.clippingPlanes = [ground]; m.clipShadows = true; } return keep(m); };
  const skin = clip(jelly(look, shared, { tint: new THREE.Color('#174a1c'), glow: .8, deform: false, rest: true }));
  const lip = clip(jelly(look, shared, { tint: new THREE.Color('#5a2e28'), glow: .25, deform: false }));
  const bone = clip(flat(look, '#ddd6ad', { shine: 1.6 })), throat = clip(flat(look, '#030403', { shine: 0 })), gillMat = clip(flat(look, '#0b1a0c', { shine: .4 }));
  const glowMat = clip(new THREE.MeshBasicMaterial({ color: new THREE.Color(.45, 1, .55), fog: false })), eyeMat = clip(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .9, .3), fog: false }));
  if (mode !== 'studio') castShadow = false;
  const instanced = (geo, mat, n) => { const m = new THREE.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(m); return m; };

  // The body: one tube rebuilt every frame along the trail. aRest pins the veins to the flesh as it slides.
  const tube = new THREE.BufferGeometry(), pos = new Float32Array(RINGS * SIDES * 3), nrm = new Float32Array(RINGS * SIDES * 3), rest = new Float32Array(RINGS * SIDES * 3), index = [];
  for (let i = 0; i < RINGS; i++) for (let j = 0; j < SIDES; j++) {
    const a = j / SIDES * Math.PI * 2, k = (i * SIDES + j) * 3;
    rest[k] = Math.cos(a) * .5; rest[k + 1] = i / (RINGS - 1) * L * .35; rest[k + 2] = Math.sin(a) * .5;
    if (i < RINGS - 1) { const a0 = i * SIDES + j, a1 = i * SIDES + (j + 1) % SIDES, b0 = a0 + SIDES, b1 = a1 + SIDES; index.push(a0, b0, a1, a1, b0, b1); }
  }
  tube.setIndex(index); tube.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  tube.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage)); tube.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
  tube.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4); keep(tube);
  const body = new THREE.Mesh(tube, skin); body.castShadow = castShadow; body.frustumCulled = false; root.add(body);

  // The maw: a fleshy lip round a black throat, three rings of hooked teeth and a spinning rasp deep inside.
  const head = new THREE.Group(); root.add(head);
  const lipRing = new THREE.Mesh(keep(new THREE.TorusGeometry(R * .9, R * .2, 8, 24)), lip); lipRing.castShadow = castShadow; head.add(lipRing);
  const hole = new THREE.Mesh(keep(new THREE.CircleGeometry(R * .88, 24)), throat); hole.position.z = -.06; head.add(hole);
  const hook = keep(new THREE.ConeGeometry(.035, .16, 5).translate(0, .08, 0));
  const fangs = TEETH.flatMap(([n, at, size], ring) => [...Array(n)].map((_, k) => ({ a: k / n * Math.PI * 2 + ring * .3, at: at * R, size: size * (.8 + .4 * ((k * 7) % 5) / 5), ring })));
  const teeth = instanced(hook, bone, fangs.length); teeth.removeFromParent(); head.add(teeth);
  const rasp = instanced(hook, bone, RASP); rasp.removeFromParent(); head.add(rasp);
  const cirri = instanced(keep(new THREE.ConeGeometry(.03, .22, 5).translate(0, .11, 0)), lip, CIRRI); cirri.removeFromParent(); head.add(cirri);
  const eyeGeo = keep(new THREE.SphereGeometry(1, 8, 6)), eyes = [-1, 1].flatMap(side => [0, 1, 2].map(k => { const e = new THREE.Mesh(eyeGeo, eyeMat); e.position.set(side * R * (.86 - k * .04), R * (.28 + k * .12), -R * (.35 + k * .22)); e.scale.setScalar(.03 - k * .006); head.add(e); return e; }));
  // Down the body: gill slits behind the head and two rows of glowing spots along the back.
  const gills = instanced(keep(new THREE.CircleGeometry(1, 10)), gillMat, LAMPREY.gills * 2), spots = instanced(keep(new THREE.SphereGeometry(1, 6, 5)), glowMat, LAMPREY.spots * 2);

  // Slime dripping off it, and spraying when it is hit.
  const DROPS = 40, drops = instanced(keep(new THREE.SphereGeometry(1, 6, 5)), clip(flat(look, '#3d9a3a', { shine: 1.6 })), DROPS);
  const dropState = [...Array(DROPS)].map(() => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), alive: false, size: .02 }));
  let nextDrop = 0;
  const drip = (p, size = .02 + Math.random() * .02, v = null) => { const d = dropState[nextDrop]; nextDrop = (nextDrop + 1) % DROPS; d.p.copy(p); if (v) d.v.copy(v); else d.v.set((Math.random() - .5) * .3, -.3, (Math.random() - .5) * .3); d.alive = true; d.size = size; };

  const P = [...Array(RINGS)].map(() => new THREE.Vector3()), F = P.map(() => new THREE.Vector3()), Rt = P.map(() => new THREE.Vector3(1, 0, 0)), U = P.map(() => new THREE.Vector3()), radii = new Float32Array(RINGS);
  const point = { x: 0, y: 0, z: 0 }, tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), dummy = new THREE.Object3D(), m4 = new THREE.Matrix4(), lastHead = new THREE.Vector3(), vel = new THREE.Vector3();
  let clock = 0, open = 0, chomp = 0, chompT = 0, started = false, shudder = null;
  const taper = k => k < .07 ? .88 + k / .07 * .12 : 1 - .82 * Math.pow((k - .07) / .93, 1.5);

  /** `c`: the simulated centipede. Returns nothing to step on: it has no feet. */
  function update(c, dt) {
    clock += dt; time.value += dt; pulse.value *= Math.exp(-dt * 4);
    if (clipped) { parent.getWorldPosition(floorAt); ground.constant = .02 - floorAt.y; }
    const dead = c.state === 'dead', throes = dead ? Math.max(0, 1 - c.t / 3.5) : 0, slump = dead ? Math.min(1, c.t * .6) : 0, sink = dead ? Math.max(0, c.t - 4.5) * .6 : 0;
    const busy = c.state === 'rear' || c.state === 'rise' || c.state === 'slam';
    // Where each ring sits: on the trail, resting on its belly, swimming side to side and rippling with peristalsis.
    for (let i = 0; i < RINGS; i++) {
      const s = i / (RINGS - 1) * L, k = s / L;
      radii[i] = R * taper(k) * (1 + .07 * Math.cos(s / spacing * Math.PI * 2)) * (1 + .09 * Math.sin(s * 2.6 - clock * 5)) * (1 + pulse.value * .15 * Math.sin(s * 9 + clock * 40));
      along(c, s, point); P[i].set(point.x, point.y + radii[i] * .82 * (1 - .3 * slump) + gy(point.x, point.z) - sink, point.z);
    }
    if (!started) { started = true; lastHead.copy(P[0]); }
    vel.subVectors(P[0], lastHead).divideScalar(Math.max(dt, 1e-4)); lastHead.copy(P[0]);
    const speed = Math.min(1, Math.hypot(vel.x, vel.z) / 3);
    if (!shudder && Math.random() < dt * (.35 + throes * 3)) shudder = { at: 0, side: Math.random() < .5 ? -1 : 1, power: .5 + Math.random() * .5 };
    if (shudder) { shudder.at += dt * 9; if (shudder.at > L + 2) shudder = null; }
    for (let i = 0; i < RINGS; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(RINGS - 1, i + 1)];
      F[i].subVectors(a, b); if (F[i].lengthSq() < 1e-8) F[i].set(Math.sin(c.facing), 0, Math.cos(c.facing)); F[i].normalize();
      tmp.crossVectors(UP, F[i]); if (tmp.lengthSq() > 1e-4) Rt[i].copy(tmp.normalize()); else if (i) Rt[i].copy(Rt[i - 1]);
      U[i].crossVectors(F[i], Rt[i]).normalize();
    }
    for (let i = 0; i < RINGS; i++) {
      const s = i / (RINGS - 1) * L, k = s / L;
      const wave = shudder ? Math.exp(-((s - shudder.at) ** 2) / .8) * shudder.power * shudder.side : 0;
      const swim = Math.sin(s * 1.5 - clock * (4 + 4 * speed)) * (.05 + .12 * speed) * k * 1.6 + Math.sin(s * 2.4 + clock * 9) * .35 * throes + wave * .25;
      P[i].addScaledVector(Rt[i], swim);
    }
    // The tube: belly flattened, rolled over onto its side as it dies.
    for (let i = 0; i < RINGS; i++) {
      const roll = slump * (1.2 + .4 * Math.sin(i * .2)), cr = Math.cos(roll), sr = Math.sin(roll);
      for (let j = 0; j < SIDES; j++) {
        const a = j / SIDES * Math.PI * 2, x = Math.cos(a), y = Math.sin(a), rx = x * cr - y * sr, ry = x * sr + y * cr, flatten = ry < 0 ? .82 : 1, q = (i * SIDES + j) * 3;
        tmp.copy(Rt[i]).multiplyScalar(rx).addScaledVector(U[i], ry * flatten);
        pos[q] = P[i].x + tmp.x * radii[i]; pos[q + 1] = P[i].y + tmp.y * radii[i]; pos[q + 2] = P[i].z + tmp.z * radii[i];
        tmp.normalize(); nrm[q] = tmp.x; nrm[q + 1] = tmp.y; nrm[q + 2] = tmp.z;
      }
    }
    tube.attributes.position.needsUpdate = tube.attributes.normal.needsUpdate = true;

    // The maw on the front ring, facing forward: puckered as it crawls, flared wide to strike, chewing at nothing.
    head.position.copy(P[0]).addScaledVector(F[0], .02);
    m4.makeBasis(Rt[0], U[0], F[0]); head.quaternion.setFromRotationMatrix(m4); head.rotateZ(slump * 1.2);
    chompT -= dt; if (chompT <= 0) { chompT = .06 + Math.random() * .3; chomp = Math.random() < .45 ? .25 + Math.random() * .5 : 0; }
    const wantOpen = busy ? .92 + .08 * Math.sin(clock * 28) : c.state === 'under' || c.state === 'dive' ? 0 : dead ? .6 * throes + .35 : chomp;
    open += (wantOpen - open) * (1 - Math.exp(-dt * (wantOpen > open ? 22 : 9)));
    lipRing.scale.set(.7 + .5 * open, .7 + .5 * open, 1 + .3 * open); hole.scale.setScalar(.6 + .55 * open);
    fangs.forEach((f, n) => {
      const r = f.at * (.62 + .5 * open);
      dummy.position.set(Math.cos(f.a) * r, Math.sin(f.a) * r, .02 - f.ring * .05);
      // Closed they rake inward and forward like a pucker; open they splay out flat, hooks facing the prey.
      dummy.quaternion.setFromUnitVectors(UP, tmp.set(-Math.cos(f.a) * (1.3 - open), -Math.sin(f.a) * (1.3 - open), .45 + open * .9).normalize());
      dummy.scale.setScalar(f.size * (.8 + .35 * open)); dummy.updateMatrix(); teeth.setMatrixAt(n, dummy.matrix);
    });
    const spin = clock * (busy ? 14 : 3), push = busy ? .2 * open : 0;
    for (let n = 0; n < RASP; n++) {
      const a = n / RASP * Math.PI * 2 + spin;
      dummy.position.set(Math.cos(a) * R * .16, Math.sin(a) * R * .16, -.04 + push);
      dummy.quaternion.setFromUnitVectors(UP, tmp.set(Math.cos(a) * .4, Math.sin(a) * .4, 1).normalize()); dummy.scale.setScalar(.9); dummy.updateMatrix(); rasp.setMatrixAt(n, dummy.matrix);
    }
    for (let n = 0; n < CIRRI; n++) {
      const a = n / CIRRI * Math.PI * 2 + .13, r = R * (.9 + .25 * open) * (.7 + .5 * open), sway = Math.sin(clock * 7 + n * 1.7) * .5;
      dummy.position.set(Math.cos(a) * r, Math.sin(a) * r, .02);
      dummy.quaternion.setFromUnitVectors(UP, tmp.set(Math.cos(a) * (1 + open), Math.sin(a) * (1 + open), .7 - open * .4 + sway * .3).normalize());
      dummy.scale.set(1, 1 + .5 * Math.sin(clock * 5 + n), 1); dummy.updateMatrix(); cirri.setMatrixAt(n, dummy.matrix);
    }
    for (const e of eyes) e.visible = !dead || c.t < 2;
    // Gills behind the head, breathing; the spots along the back pulse in a slow wave toward the tail.
    const ringAt = s => Math.min(RINGS - 1, Math.round(s / L * (RINGS - 1)));
    for (let n = 0; n < LAMPREY.gills * 2; n++) {
      const side = n < LAMPREY.gills ? -1 : 1, g = n % LAMPREY.gills, i = ringAt(.45 + g * .2), r = radii[i] * .99;
      dummy.position.copy(P[i]).addScaledVector(Rt[i], side * r * .96).addScaledVector(U[i], r * .2);
      m4.makeBasis(tmp2.copy(F[i]).multiplyScalar(-side), U[i], tmp.copy(Rt[i]).multiplyScalar(side)); dummy.quaternion.setFromRotationMatrix(m4);
      const breathe = .5 + .5 * Math.sin(clock * 3 - g * .4);
      dummy.scale.set(.025 + .012 * breathe, .07 + .02 * breathe, 1); dummy.updateMatrix(); gills.setMatrixAt(n, dummy.matrix);
    }
    for (let n = 0; n < LAMPREY.spots * 2; n++) {
      const side = n < LAMPREY.spots ? -1 : 1, g = n % LAMPREY.spots, s = 1.6 + g * (L - 2.6) / LAMPREY.spots, i = ringAt(s), r = radii[i];
      dummy.position.copy(P[i]).addScaledVector(Rt[i], side * r * .45).addScaledVector(U[i], r * .86);
      const glow = (.55 + .45 * Math.sin(clock * 2.4 - s * 1.1)) * (dead ? Math.max(0, 1 - c.t / 4) : 1);
      dummy.quaternion.identity(); dummy.scale.setScalar((.045 + .035 * glow) * (r / R + .3)); dummy.updateMatrix(); spots.setMatrixAt(n, dummy.matrix);
    }
    // Slime: off the belly as it moves, out of the maw when it rears.
    for (let i = 4; i < RINGS; i += 6) if (Math.random() < dt * (.06 + speed * .25) && P[i].y > gy(P[i].x, P[i].z) + .05) drip(tmp.copy(P[i]).addScaledVector(U[i], -radii[i] * .8), .012 + Math.random() * .02);
    if (busy && Math.random() < dt * 12) drip(tmp.set((Math.random() - .5) * R, (Math.random() - .5) * R, .05).applyQuaternion(head.quaternion).add(head.position), .015 + Math.random() * .02);
    dropState.forEach((d, i) => {
      if (d.alive) { d.v.y -= 9 * dt; d.p.addScaledVector(d.v, dt); if (d.p.y <= gy(d.p.x, d.p.z)) d.alive = false; }
      if (d.alive) { dummy.position.copy(d.p); dummy.quaternion.identity(); dummy.scale.set(d.size, d.size * (1 + Math.min(2.5, -d.v.y * .35)), d.size); } else dummy.scale.setScalar(0);
      dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
    });
    for (const m of [teeth, rasp, cirri, gills, spots, drops]) m.instanceMatrix.needsUpdate = true;
    return [];
  }
  /** A strike at `point` travelling along `dir` (the parent's space): slime sprays and the jelly quivers. */
  function hit(point, dir) {
    pulse.value = 1;
    if (!point) return;
    for (let i = 0; i < 12; i++) drip(tmp2.set(point.x, point.y, point.z), .012 + Math.random() * .022, new THREE.Vector3((dir?.x ?? 0) * 2.5 + (Math.random() - .5) * 2.5, 1 + Math.random() * 2.2, (dir?.z ?? 0) * 2.5 + (Math.random() - .5) * 2.5));
  }
  const burnPoints = [];
  return {
    root, style: { segments, spacing, radius: R }, head, update, hit,
    burn(h, c) { heat.value = h; char.value = c; },
    /** Where flames take hold, in the parent's space: the maw and every ninth ring. */
    burning() { burnPoints.length = 0; burnPoints.push(head.position); for (let i = 9; i < RINGS; i += 9) burnPoints.push(P[i]); return burnPoints; },
    get position() { return head.position; },
    dispose() { parent.remove(root); owned.forEach(o => o.dispose()); [teeth, rasp, cirri, gills, spots, drops].forEach(m => m.dispose()); },
  };
}
