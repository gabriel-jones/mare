import * as THREE from 'three';
import { gooInk, legGeometry } from './crawler-view.js';
import { along } from './centipede.js';

/**
 * Looks under review in centipede-lab.html. Each sets the body (`segments`, `spacing`, `radius`), the legs (`leg`:
 * femur and tibia length; `limit`: how far the body moves on before a foot steps), the head and its extras.
 */
export const CENTIPEDE_STYLES = Object.freeze({
  needle: { name: 'Needle centipede', note: 'Long arched needle legs like the crawler\'s, stop-start scuttle, snapping pincers.', segments: 18, spacing: .55, radius: .3, leg: [.95, .85], limit: .55, gait: 'scuttle', pincers: true, antennae: true, plates: false, head: 1.25 },
  millipede: { name: 'Goo millipede', note: 'Many short legs rippling in waves, a smooth glide, the body dripping goo.', segments: 34, spacing: .34, radius: .26, leg: [.42, .38], limit: .2, gait: 'ripple', pincers: false, antennae: true, plates: false, head: 1.05 },
  plated: { name: 'Plated horror', note: 'Bone-black plates with back spikes, long holds broken by sudden surges.', segments: 22, spacing: .5, radius: .36, leg: [.8, .75], limit: .5, gait: 'lurch', pincers: true, antennae: false, plates: true, head: 1.45 },
});

const UP = new THREE.Vector3(0, 1, 0);
function lumpy(segments, seed, amount = .05) {
  const g = new THREE.SphereGeometry(1, segments, Math.round(segments * .7)), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + amount * (Math.sin(v.x * 6.1 + seed) * Math.sin(v.y * 5.3 + seed * 1.7) + .6 * Math.sin(v.z * 8.7 - seed * 2.3)); p.setXYZ(i, v.x * n, v.y * n, v.z * n); }
  g.computeVertexNormals(); return g;
}

/**
 * A centipede drawn from a simulated one (centipede.js). Legs are solved here: two-bone IK from hips on each segment
 * to feet planted on the ground, stepping in waves down the body. `freak` (0–1) sets how much it twitches, shudders
 * and flails. Anything below the ground (y = 0 in the parent's space) is clipped away, so it can burrow.
 */
export function createCentipedeView(crawlerGLTF, parent, { style = 'needle', segments = null, freak = .6, castShadow = true, ground = new THREE.Plane(UP.clone(), .02) } = {}) {
  const S = { ...CENTIPEDE_STYLES[style] }; if (segments) S.segments = segments;
  const root = new THREE.Group(), owned = [], keep = x => (owned.push(x), x); parent.add(root);
  const time = { value: 0 }, sag = { value: new THREE.Vector3() }, pulse = { value: 0 }, heat = { value: 0 }, char = { value: 0 };
  const shared = { uTime: time, uSag: sag, uPulse: pulse, uHeat: heat, uChar: char };
  const clip = m => { m.clippingPlanes = [ground]; m.clipShadows = true; return m; };
  const ink = (amount, body = false) => clip(keep(gooInk({ mode: 'studio', shared }, amount, body)));
  const bone = clip(keep(new THREE.MeshStandardMaterial({ color: '#070708', roughness: .14, envMapIntensity: 1.6 })));
  const maw = clip(keep(new THREE.MeshStandardMaterial({ color: '#0a0404', roughness: .25 })));
  const skin = ink(.016), legInk = ink(.004), headInk = ink(.022, true);
  const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = castShadow; m.frustumCulled = false; return m; };

  // Head: the crawler's split goo body, its jaws opening sideways.
  const head = new THREE.Group(); root.add(head);
  const model = crawlerGLTF.scene.clone(true); model.scale.setScalar(S.head * S.radius / .21); head.add(model);
  const shells = {};
  model.traverse(o => {
    if (o.name === 'ShellL' || o.name === 'ShellR') shells[o.name] = o;
    if (o.name === 'Core') o.visible = false;
    if (!o.isMesh) return; o.castShadow = castShadow; o.frustumCulled = false;
    const n = o.material.name; o.material = n.includes('bone') ? bone : n.includes('maw') ? maw : headInk;
  });
  // Pincers: two curved bone hooks under the jaw that snap shut.
  const pincers = [];
  if (S.pincers) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(.12, -.02, .16), new THREE.Vector3(.1, -.04, .34), new THREE.Vector3(-.02, -.05, .46)]);
    for (const side of [-1, 1]) {
      const g = keep(new THREE.TubeGeometry(curve, 16, .022, 6)); const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const t = Math.min(1, Math.max(0, p.getZ(i) / .46)); const k = 1 - .85 * t; const c = curve.getPoint(t); p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, p.getZ(i)); }
      g.scale(side * S.head * 1.3, S.head * 1.3, S.head * 1.3); g.computeVertexNormals();
      const pivot = new THREE.Group(); pivot.position.set(side * S.radius * .45, -S.radius * .35, S.radius * .55); head.add(pivot);
      const m = mesh(g, bone); pivot.add(m); pincers.push({ pivot, side });
    }
  }
  // Antennae: whips that trail behind the head's motion and lash about.
  const antennae = [];
  if (S.antennae) {
    const thread = keep(new THREE.CylinderGeometry(.006, .012, 1, 5).translate(0, .5, 0));
    for (const side of [-1, 1]) {
      const n = 9, pts = [...Array(n)].map(() => new THREE.Vector3()), prev = pts.map(p => p.clone()), parts = [...Array(n - 1)].map(() => { const m = mesh(thread, legInk); root.add(m); return m; });
      antennae.push({ side, pts, prev, parts, length: S.radius * 4.2 / (n - 1), started: false });
    }
  }

  // Body segments, tapering toward the tail, each with a pair of legs.
  const segGeo = keep(lumpy(20, 3.1, .04)), plateGeo = S.plates ? keep(lumpy(18, 8.2, .06)) : null, spike = S.plates ? keep(new THREE.ConeGeometry(.05, .3, 6).rotateX(-1.1)) : null;
  const geo = legGeometry(keep);
  const segs = [];
  for (let i = 0; i < S.segments; i++) {
    const k = i / (S.segments - 1), r = S.radius * (1 - .45 * k * k) * (i === 0 ? .95 : 1), g = new THREE.Group(); root.add(g);
    const body = mesh(segGeo, skin); body.scale.set(r * 1.05, r * .78, S.spacing * .72); g.add(body);
    if (S.plates) {
      const plate = mesh(plateGeo, bone); plate.scale.set(r * 1.2, r * .5, S.spacing * .62); plate.position.set(0, r * .38, -S.spacing * .08); g.add(plate);
      const s = mesh(spike, bone); s.position.set(0, r * .78, -S.spacing * .1); s.scale.setScalar(r / S.radius * (1 + .4 * Math.sin(i * 1.7))); g.add(s);
    }
    const legs = [-1, 1].map(side => {
      const parts = { femur: mesh(geo.femur, legInk), tibia: mesh(geo.tibia, legInk), meta: mesh(geo.meta, legInk), needle: mesh(geo.needle, legInk) };
      Object.values(parts).forEach(m => root.add(m));
      const scale = 1 - .3 * k;
      return { side, parts, foot: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), step: 0, duration: .1, lift: .2, free: false, flail: new THREE.Vector3(), flailT: 0, F: S.leg[0] * scale, T: S.leg[1] * scale, knee: new THREE.Vector3(), started: false };
    });
    segs.push({ g, r, legs, pos: new THREE.Vector3(), fwd: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(1, 0, 0), jerk: new THREE.Vector3(), jerkWant: new THREE.Vector3(), jerkT: 0 });
  }
  // Tail cerci.
  const last = segs.at(-1);
  for (const side of [-1, 1]) { const n = mesh(geo.needle, bone); n.scale.set(1.2, 2.6, 1.2); n.rotation.set(-Math.PI / 2 - .25, 0, side * .35); n.position.set(side * last.r * .4, 0, -S.spacing * .3); last.g.add(n); }

  // Goo drips off the body as it moves.
  const DROPS = 40, dropGeo = keep(new THREE.SphereGeometry(1, 6, 5)), drops = new THREE.InstancedMesh(dropGeo, skin, DROPS); drops.frustumCulled = false; root.add(drops);
  const dropState = [...Array(DROPS)].map(() => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), alive: false, size: .02 }));
  let nextDrop = 0;
  const drip = (p, size = .02 + Math.random() * .02) => { const d = dropState[nextDrop]; nextDrop = (nextDrop + 1) % DROPS; d.p.copy(p); d.v.set((Math.random() - .5) * .3, -.3, (Math.random() - .5) * .3); d.alive = true; d.size = size; };

  const H = Math.max(.3, (S.leg[0] + S.leg[1]) * .42), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), dummy = new THREE.Object3D();
  const pts = [], point = { x: 0, y: 0, z: 0 };
  let clock = 0, shudder = null, open = 0, chomp = 0, chompT = 0, headJerk = new THREE.Vector3(), headJerkWant = new THREE.Vector3(), headJerkT = 0, lastPos = new THREE.Vector3(), started = false;
  const vel = new THREE.Vector3();
  function place(m, from, to) { const d = tmp2.subVectors(to, from), l = d.length(); m.position.copy(from); m.quaternion.setFromUnitVectors(UP, d.divideScalar(l || 1)); m.scale.set(1, l, 1); }
  function solve(leg, hip, out) {
    const ankle = tmp.copy(leg.foot); if (!leg.free) ankle.addScaledVector(out, -.08).setY(leg.foot.y + leg.T * .38);
    const F = leg.F, T = leg.T * .7, d = new THREE.Vector3().subVectors(ankle, hip), dist = Math.min(F + T - .01, Math.max(.08, d.length())), u = d.normalize();
    const a = (F * F + dist * dist - T * T) / (2 * dist), h = Math.sqrt(Math.max(0, F * F - a * a));
    const pole = new THREE.Vector3(out.x * .3, 1, out.z * .3); pole.addScaledVector(u, -pole.dot(u)).normalize();
    leg.knee.copy(hip).addScaledVector(u, a).addScaledVector(pole, h);
    const reached = new THREE.Vector3().copy(hip).addScaledVector(u, dist), tip = leg.free ? reached.clone().addScaledVector(new THREE.Vector3().subVectors(reached, leg.knee).normalize(), leg.T * .38) : leg.foot.clone();
    place(leg.parts.femur, hip, leg.knee); place(leg.parts.tibia, leg.knee, reached);
    const needleStart = new THREE.Vector3().lerpVectors(reached, tip, .65); place(leg.parts.meta, reached, needleStart); place(leg.parts.needle, needleStart, tip);
    leg.parts.needle.scale.set(1, tip.distanceTo(needleStart) / .2, 1);
  }

  /** `c`: the simulated centipede. Returns step events ({type:'plant', x, z}) for sound. */
  function update(c, dt, { freak: f = freak } = {}) {
    const events = []; clock += dt; time.value += dt; pulse.value *= Math.exp(-dt * 4);
    // Where each segment sits, and which way it faces, from the head's trail.
    for (let i = 0; i <= S.segments; i++) { along(c, i * S.spacing, point); (pts[i] ??= new THREE.Vector3()).set(point.x, point.y + H, point.z); }
    // Now and then a shudder runs down the body from head to tail.
    if (!shudder && Math.random() < dt * f * .35) shudder = { at: 0, side: Math.random() < .5 ? -1 : 1, power: .5 + Math.random() * .5 };
    if (shudder) { shudder.at += dt * 26; if (shudder.at > S.segments + 6) shudder = null; }
    const busy = c.state === 'rear' || c.state === 'rise' || c.state === 'slam';
    for (let i = 0; i < S.segments; i++) {
      const s = segs[i], p = pts[i], ahead = pts[Math.max(0, i - 1)], behind = pts[i + 1];
      s.fwd.subVectors(i === 0 ? p.clone().sub(behind).add(p) : ahead, behind); if (s.fwd.lengthSq() < 1e-8) s.fwd.set(Math.sin(c.facing), 0, Math.cos(c.facing)); s.fwd.normalize();
      const r = tmp.crossVectors(UP, s.fwd); if (r.lengthSq() > 1e-4) s.right.copy(r.normalize());
      const up = tmp2.crossVectors(s.fwd, s.right).normalize();
      // Twitches: each segment snaps between small held offsets; the shudder throws it sideways as it passes.
      s.jerkT -= dt; if (s.jerkT <= 0) { s.jerkT = .05 + Math.random() * (.5 - .35 * f); s.jerkWant.set((Math.random() - .5) * .5 * f, (Math.random() - .5) * .08 * f, (Math.random() - .5) * .6 * f); }
      s.jerk.lerp(s.jerkWant, 1 - Math.exp(-dt * 40));
      const wave = shudder ? Math.exp(-((i - shudder.at) ** 2) / 3) * shudder.power * f : 0;
      s.pos.copy(p).addScaledVector(s.right, (s.jerk.x * .12 + wave * .35 * (shudder?.side ?? 0)) * s.r / .3).addScaledVector(up, s.jerk.y * .3 + Math.sin(clock * 3 + i * .5) * .015);
      m4.makeBasis(s.right, up, s.fwd); q.setFromRotationMatrix(m4);
      s.g.position.copy(s.pos); s.g.quaternion.copy(q); s.g.rotateZ(s.jerk.z * .5 + wave * .8); s.g.rotateY(s.jerk.x);
    }
    // Head on the first segment's line, jaws chomping, jerking about.
    const s0 = segs[0];
    headJerkT -= dt; if (headJerkT <= 0) { headJerkT = .04 + Math.random() * (.4 - .3 * f); headJerkWant.set((Math.random() - .5) * .7 * f, (Math.random() - .5) * .5 * f, (Math.random() - .5) * .6 * f); }
    headJerk.lerp(headJerkWant, 1 - Math.exp(-dt * 45));
    head.position.copy(s0.pos).addScaledVector(s0.fwd, S.spacing * .55 + S.radius * .5);
    head.quaternion.copy(s0.g.quaternion); head.rotateY(headJerk.x); head.rotateX(headJerk.y - (c.state === 'rear' ? .5 : 0)); head.rotateZ(headJerk.z);
    chompT -= dt; if (chompT <= 0) { chompT = .05 + Math.random() * .25; chomp = Math.random() < .2 + .5 * f ? .3 + Math.random() * .7 : 0; }
    const wantOpen = c.state === 'rear' ? .9 + .1 * Math.sin(clock * 30) : c.state === 'rise' || c.state === 'slam' ? 1 : chomp * f;
    open += (wantOpen - open) * (1 - Math.exp(-dt * 30));
    root.updateMatrixWorld(true);
    if (shells.ShellL) shells.ShellL.rotation.y = -open * .55; if (shells.ShellR) shells.ShellR.rotation.y = open * .55;
    for (const p of pincers) p.pivot.rotation.y = p.side * (-.15 + .75 * Math.max(open, .5 + .5 * Math.sin(clock * (9 + 8 * f) + p.side)) * (.4 + .6 * f));
    // Antennae: verlet whips rooted on the head.
    for (const a of antennae) {
      const rootAt = head.localToWorld(tmp.set(a.side * S.radius * .35, S.radius * .35, S.radius * .9)); root.worldToLocal(rootAt);
      if (!a.started) { a.started = true; a.pts.forEach((p, i) => p.copy(rootAt).addScaledVector(s0.fwd, i * a.length)); a.prev.forEach((p, i) => p.copy(a.pts[i])); }
      a.pts[0].copy(rootAt);
      for (let i = 1; i < a.pts.length; i++) {
        const p = a.pts[i], v = tmp2.subVectors(p, a.prev[i]).multiplyScalar(.86); a.prev[i].copy(p); p.add(v);
        p.addScaledVector(s0.fwd, dt * 2.2); p.y += dt * .4 + Math.sin(clock * 13 + i + a.side) * dt * 1.5 * f;
        const d = new THREE.Vector3().subVectors(p, a.pts[i - 1]), l = d.length() || 1; p.copy(a.pts[i - 1]).addScaledVector(d, a.length / l);
      }
      a.parts.forEach((m, i) => place(m, a.pts[i], a.pts[i + 1]));
    }
    // Legs: planted on the ground, stepping when the body has moved on, never alongside a neighbour; legs that can't
    // reach the ground (reared, burrowing) thrash in the air.
    if (!started) { started = true; lastPos.copy(pts[0]); }
    vel.subVectors(pts[0], lastPos).divideScalar(Math.max(dt, 1e-4)); lastPos.copy(pts[0]);
    for (let i = 0; i < S.segments; i++) {
      const s = segs[i];
      for (const leg of s.legs) {
        const hip = s.g.localToWorld(new THREE.Vector3(leg.side * s.r * .8, -s.r * .25, 0)); root.worldToLocal(hip);
        const out = new THREE.Vector3().copy(s.right).multiplyScalar(leg.side).setY(0).normalize();
        const home = new THREE.Vector3().copy(s.pos).addScaledVector(out, (leg.F + leg.T) * .78).addScaledVector(s.fwd, (i % 2 ? .1 : -.05) * S.spacing).setY(0);
        const reach = leg.F + leg.T * .7 + leg.T * .38, canStand = hip.y > -.05 && hip.y < reach * .95 && Math.abs(s.fwd.y) < .55;
        if (!leg.started) { leg.started = true; leg.foot.copy(home); }
        if (!canStand) {
          // Thrash: the feet snap between random holds around the hip, faster the freakier.
          leg.free = true; leg.step = 0; leg.flailT -= dt;
          if (leg.flailT <= 0) { leg.flailT = .04 + Math.random() * (.2 - .12 * f); leg.flail.copy(out).multiplyScalar(reach * (.4 + .5 * Math.random())).add(new THREE.Vector3((Math.random() - .5) * .6, (Math.random() - .3) * .8, (Math.random() - .5) * .6).multiplyScalar(reach)); }
          leg.foot.lerp(tmp.copy(hip).add(leg.flail), 1 - Math.exp(-dt * 30));
        } else if (leg.free) { leg.free = false; leg.from.copy(leg.foot); leg.to.copy(home); leg.step = .001; leg.duration = .1; leg.lift = .2; }
        if (!leg.free) {
          if (leg.step > 0) {
            leg.step += dt / leg.duration; const t = Math.min(1, leg.step), e = 1 - Math.pow(1 - t, 3);
            leg.foot.lerpVectors(leg.from, leg.to, e); leg.foot.y = Math.max(0, Math.sin(t * Math.PI) * leg.lift + leg.from.y * (1 - e));
            if (t >= 1) { leg.step = 0; leg.foot.copy(leg.to); events.push({ type: 'plant', x: leg.foot.x, z: leg.foot.z }); }
          } else {
            const gap = Math.hypot(home.x - leg.foot.x, home.z - leg.foot.z), neighbours = [segs[i - 1], segs[i + 1]].filter(Boolean).map(n => n.legs.find(l => l.side === leg.side));
            const blocked = neighbours.some(n => n.step > 0) || s.legs.some(l => l !== leg && l.step > 0);
            const twitch = Math.random() < dt * (.15 + 1.2 * f) && !busy;
            if ((gap > S.limit || twitch) && !blocked) {
              leg.from.copy(leg.foot); leg.to.copy(gap > S.limit ? home : leg.foot).addScaledVector(vel.setY(0), .08);
              if (twitch && gap <= S.limit) leg.to.add(new THREE.Vector3((Math.random() - .5) * .3, 0, (Math.random() - .5) * .3));
              leg.step = .001; leg.duration = S.gait === 'ripple' ? .07 : .05 + Math.random() * .05; leg.lift = (S.gait === 'ripple' ? .08 : .16 + Math.random() * .12) * (leg.F / .9 + .3);
            }
          }
        }
        solve(leg, hip, out);
      }
      // Goo drips from the belly, more as it moves.
      if (Math.random() < dt * (.08 + vel.length() * .05) && s.pos.y > .1) drip(tmp.copy(s.pos).addScaledVector(UP, -s.r * .6), .012 + Math.random() * .02);
    }
    dropState.forEach((d, i) => {
      if (d.alive) { d.v.y -= 9 * dt; d.p.addScaledVector(d.v, dt); if (d.p.y <= 0) d.alive = false; }
      if (d.alive) { dummy.position.copy(d.p); dummy.scale.set(d.size, d.size * (1 + Math.min(2.5, -d.v.y * .35)), d.size); } else dummy.scale.setScalar(0);
      dummy.updateMatrix(); drops.setMatrixAt(i, dummy.matrix);
    });
    drops.instanceMatrix.needsUpdate = true;
    return events;
  }
  return {
    root, style: S, head, update, hit() { pulse.value = 1; },
    get position() { return head.position; },
    dispose() { parent.remove(root); owned.forEach(o => o.dispose()); drops.dispose(); },
  };
}
