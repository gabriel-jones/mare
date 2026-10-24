import * as THREE from 'three';

// How structures appear and go up.
// Placing: a frame draws itself round the footprint from each corner, a ripple runs out over the ground, and the
// hologram extrudes upward. Building: the finished model rises inside the hologram behind a glowing scan line, with
// sparks flying off the line while work is going on. Done: the line vanishes in a flash and a ring of dust.
// Every cut is a clipping plane, so moving it never changes a shader; only the plane's height changes each frame.
const FAR = 1e4, CYAN = new THREE.Color('#8fe6ff'), SPARK = new THREE.Color('#ffc46b'), DUST = new THREE.Color('#b9b1a3');
const ease = t => 1 - (1 - t) ** 3;

export function createConstructionFx(scene, { make }) {
  const root = new THREE.Group(); root.name = 'construction-fx'; scene.add(root);
  const edgeGeo = new THREE.BoxGeometry(1, .05, .07).translate(.5, 0, 0);
  const lineMat = new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false });
  const ringGeo = new THREE.RingGeometry(.86, 1, 64).rotateX(-Math.PI / 2);

  // One pool of points serves sparks and dust; each fades by dimming its colour under additive blending.
  const N = 400, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), span = new Float32Array(N), tint = [];
  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pointsGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(pointsGeo, new THREE.PointsMaterial({ size: 4.5, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  points.frustumCulled = false; root.add(points);
  let next = 0;
  function emit(x, y, z, vx, vy, vz, seconds, colour) {
    const i = next; next = (next + 1) % N;
    pos.set([x, y, z], i * 3); vel.set([vx, vy, vz], i * 3); life[i] = span[i] = seconds; tint[i] = colour;
  }

  // Short flashes borrow the shared light budget like every other effect light.
  const flashes = Array.from({ length: 3 }, () => { const l = new THREE.PointLight('#cfeeff', 0, 14, 2); root.add(l); return { light: l, t: 0 }; });
  const puffs = [];

  function frame() {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) g.add(new THREE.Mesh(edgeGeo, lineMat));
    root.add(g); return g;
  }
  /** Lays the four edges round the box at height `y`, each grown `grow` of the way from its own corner. */
  function shape(g, box, y, grow, pad = .06) {
    const x0 = box.min.x - pad, x1 = box.max.x + pad, z0 = box.min.z - pad, z1 = box.max.z + pad;
    const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    g.children.forEach((e, i) => {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
      e.position.set(ax, y, az); e.rotation.y = -Math.atan2(bz - az, bx - ax);
      e.scale.x = Math.max(.001, Math.hypot(bx - ax, bz - az) * grow);
    });
  }
  const perimeterPoint = (box, y) => {
    const w = box.max.x - box.min.x, d = box.max.z - box.min.z, s = Math.random() * 2 * (w + d);
    if (s < w) return [box.min.x + s, y, box.min.z];
    if (s < w + d) return [box.max.x, y, box.min.z + s - w];
    if (s < 2 * w + d) return [box.max.x - (s - w - d), y, box.max.z];
    return [box.min.x, y, box.max.z - (s - 2 * w - d)];
  };

  /** Called every frame for every structure. `fresh` is true when this blueprint was placed just now. */
  function track(o, b, dt, fresh) {
    if (b.built && !o.fx) return;
    if (!o.fx) {
      const box = new THREE.Box3().setFromObject(o.root);
      if (box.isEmpty()) { o.fx = { none: true }; return; }
      // The scan line climbs to the top of the bulk, not to the tip of a lamp post or antenna.
      const area = (box.max.x - box.min.x) * (box.max.z - box.min.z), part = new THREE.Box3();
      let bulk = box.min.y; const full = box.max.y;
      o.root.traverse(n => { if (n.isMesh) { part.setFromObject(n); if ((part.max.x - part.min.x) * (part.max.z - part.min.z) >= area * .12) bulk = Math.max(bulk, part.max.y); } });
      box.max.y = bulk > box.min.y + .1 ? bulk : box.max.y;
      const above = new THREE.Plane(new THREE.Vector3(0, 1, 0), FAR), below = new THREE.Plane(new THREE.Vector3(0, -1, 0), FAR);
      o.ownedMaterials.forEach(m => { m.clippingPlanes = [above, below]; });
      o.fx = { box, full, above, below, cut: new THREE.Plane(new THREE.Vector3(0, -1, 0), FAR), shown: b.progress, last: b.progress, active: 0, reveal: fresh ? 0 : 1, line: frame(), solid: null, solidMats: [] };
      if (fresh) {
        const c = box.getCenter(new THREE.Vector3()), r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * .55;
        puffs.push({ mesh: ring(c.x, box.min.y + .06, c.z, CYAN), t: 0, from: r * .6, to: r * 2.2, seconds: .9, opacity: .6 });
      }
    }
    const f = o.fx; if (f.none || b.built) return;
    if (b.progress > f.last + 1e-6) f.active = .3;
    f.last = b.progress; f.active = Math.max(0, f.active - dt);
    f.shown += (b.progress - f.shown) * (1 - Math.exp(-dt * 6));
    f.reveal = Math.min(1, f.reveal + dt / .9);
    const { box } = f, h = box.max.y - box.min.y;
    // The outline draws in over the first third of the reveal, then the hologram climbs out of it.
    const draw = Math.min(1, f.reveal * 3), climb = ease(Math.max(0, (f.reveal - .3) / .7));
    const cut = box.min.y + h * f.shown, top = f.reveal >= 1 ? FAR : box.min.y + .02 + (f.full - box.min.y) * climb;
    f.above.constant = -cut + .001; f.below.constant = top;
    if (f.shown > .002 && !f.solid) {
      f.solid = make(o);
      f.solid.position.copy(o.root.position); f.solid.rotation.copy(o.root.rotation); f.solid.scale.copy(o.root.scale);
      const clones = new Map();
      f.solid.traverse(n => {
        if (!n.isMesh) return;
        n.castShadow = n.receiveShadow = true;
        n.material = [n.material].flat().map(m => { if (!clones.has(m)) { const c = m.clone(); c.clippingPlanes = [f.cut]; c.clipShadows = true; clones.set(m, c); f.solidMats.push(c); } return clones.get(m); });
        if (n.material.length === 1) n.material = n.material[0];
      });
      scene.add(f.solid);
    }
    f.cut.constant = cut;
    const building = f.reveal >= 1;
    shape(f.line, box, building ? cut : box.min.y + .05, building ? 1 : draw);
    f.line.visible = !building || (f.shown > .001 && f.shown < .999) || f.active > 0;
    const due = f.active > 0 ? dt * 70 : 0;
    for (let k = Math.floor(due) + (Math.random() < due % 1 ? 1 : 0); k > 0; k--) {
      const [x, y, z] = perimeterPoint(box, cut), a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.2;
      emit(x, y, z, Math.cos(a) * s, 1.2 + Math.random() * 2.4, Math.sin(a) * s, .35 + Math.random() * .4, SPARK);
    }
  }

  function ring(x, y, z, colour) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(x, y, z); root.add(m); return m;
  }

  /** The structure is finished: drop the stand-in, open the hologram's clip, and go off with a flash and a puff of dust. */
  function finish(o) {
    const f = o.fx; if (!f || f.none) return;
    clear(o);
    o.ownedMaterials.forEach(m => { m.clippingPlanes = [f.above, f.below]; });
    f.above.constant = FAR; f.below.constant = FAR;
    const { box } = f, c = box.getCenter(new THREE.Vector3()), r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * .55;
    const fl = flashes.find(x => x.t <= 0) ?? flashes[0];
    fl.light.position.set(c.x, box.max.y + .8, c.z); fl.t = .6;
    puffs.push({ mesh: ring(c.x, box.min.y + .05, c.z, DUST), t: 0, from: r, to: r * 1.9, seconds: 1.1, opacity: .45 });
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, s = 1.4 + Math.random() * 2.4;
      emit(c.x + Math.cos(a) * r, box.min.y + .1, c.z + Math.sin(a) * r, Math.cos(a) * s, .3 + Math.random() * .9, Math.sin(a) * s, .8 + Math.random() * .6, DUST);
    }
    for (let i = 0; i < 30; i++) {
      const [x, y, z] = perimeterPoint(box, box.max.y), a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 2;
      emit(x, y, z, Math.cos(a) * s, 2 + Math.random() * 2, Math.sin(a) * s, .5 + Math.random() * .3, CYAN);
    }
    o.fx = { none: true };
  }
  /** Removes the build stand-in and the outline of a structure that is finished or gone. */
  function clear(o) {
    const f = o.fx; if (!f || f.none) return;
    if (f.solid) { scene.remove(f.solid); f.solidMats.forEach(m => m.dispose()); f.solid = null; }
    f.line.removeFromParent();
  }

  function update(dt) {
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) { if (col[i * 3] || col[i * 3 + 1] || col[i * 3 + 2]) col.fill(0, i * 3, i * 3 + 3); continue; }
      life[i] -= dt;
      const dust = tint[i] === DUST, drag = dust ? Math.exp(-dt * 2.5) : 1;
      vel[i * 3] *= drag; vel[i * 3 + 2] *= drag; vel[i * 3 + 1] -= (dust ? .6 : 7.5) * dt;
      for (let k = 0; k < 3; k++) pos[i * 3 + k] += vel[i * 3 + k] * dt;
      const k = Math.max(0, life[i] / span[i]) * (dust ? .5 : 1), c = tint[i];
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
    }
    pointsGeo.attributes.position.needsUpdate = pointsGeo.attributes.color.needsUpdate = true;
    for (const fl of flashes) { fl.t = Math.max(0, fl.t - dt); fl.light.intensity = fl.t > 0 ? 40 * (fl.t / .6) ** 2 : 0; }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.t += dt; const k = Math.min(1, p.t / p.seconds);
      p.mesh.scale.setScalar(p.from + (p.to - p.from) * ease(k)); p.mesh.material.opacity = p.opacity * (1 - k);
      if (k >= 1) { p.mesh.removeFromParent(); p.mesh.material.dispose(); puffs.splice(i, 1); }
    }
  }
  function dispose() {
    puffs.forEach(p => p.mesh.material.dispose());
    root.removeFromParent(); edgeGeo.dispose(); ringGeo.dispose(); lineMat.dispose(); pointsGeo.dispose(); points.material.dispose();
  }
  return { track, finish, clear, update, dispose };
}
