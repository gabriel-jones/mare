import * as THREE from 'three';
import { pipeRuns, pipeSignature } from './pipes.js';

const STYLE = {
  water: { height: .42, lane: -.32, radius: .085, pipe: '#8f9ea6', band: '#3f7fae' },
  hydrolox: { height: .62, lane: .32, radius: .11, pipe: '#d8d2c4', band: '#c8501c' },
};
const STEP = .2, CORNER = .5, BRIDGE = 1.35, RAMP = 1.1, POST_EVERY = 2.4, BAND_EVERY = 3.2, END_INSET = .55, PAD_COUPLING = .5;
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

/** Offsets an orthogonal polyline sideways by `lane`, mitring the corners so parallel runs stay parallel. */
function offset(points, lane) {
  const normal = (a, b) => { const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: -(b.z - a.z) / l, z: (b.x - a.x) / l }; };
  return points.map((p, i) => {
    const n1 = normal(points[Math.max(0, i - 1)], points[Math.max(1, i)]), n2 = normal(points[Math.min(i, points.length - 2)], points[Math.min(i + 1, points.length - 1)]);
    const k = 1 + n1.x * n2.x + n1.z * n2.z || 1;
    return { ...p, x: p.x + (n1.x + n2.x) / k * lane, z: p.z + (n1.z + n2.z) / k * lane };
  });
}
/** Evenly spaced samples along the polyline with each corner swept round a short bend. */
function sweep(points) {
  const path = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], p = points[i], b = points[i + 1];
    const la = Math.hypot(p.x - a.x, p.z - a.z), lb = Math.hypot(b.x - p.x, b.z - p.z), r = Math.min(CORNER, la / 2, lb / 2);
    const s = { x: p.x + (a.x - p.x) / la * r, z: p.z + (a.z - p.z) / la * r }, e = { x: p.x + (b.x - p.x) / lb * r, z: p.z + (b.z - p.z) / lb * r };
    path.push(s);
    for (let t = .25; t < 1; t += .25) path.push({ x: (1 - t) ** 2 * s.x + 2 * (1 - t) * t * p.x + t * t * e.x, z: (1 - t) ** 2 * s.z + 2 * (1 - t) * t * p.z + t * t * e.z });
    path.push(e);
  }
  path.push(points[points.length - 1]);
  const out = [{ ...path[0], s: 0 }];
  let s = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], l = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(l / STEP));
    for (let j = 1; j <= n; j++) out.push({ x: a.x + (b.x - a.x) * j / n, z: a.z + (b.z - a.z) * j / n, s: s + l * j / n });
    s += l;
  }
  return out;
}

/**
 * Liquid lines between the buildings that trade water and propellant. Each run rides a row of low trestles a set
 * height above the graded ground, arches over any belt in its way, and ends in a flanged collar at each machine.
 */
export function createPipeView(scene, { groundAt }) {
  const root = new THREE.Group(); root.name = 'Pipes'; scene.add(root);
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .45, ...o });
  const materials = Object.fromEntries(Object.entries(STYLE).map(([fluid, s]) => [fluid, { pipe: mat(s.pipe, fluid === 'hydrolox' ? { metalness: .1, roughness: .7 } : {}), band: mat(s.band, { metalness: .2 }) }]));
  const steel = mat('#3b4146', { metalness: .6, roughness: .45 });
  const unitBox = new THREE.BoxGeometry(1, 1, 1), unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 12).rotateX(Math.PI / 2);
  const up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), dir = new THREE.Vector3();
  let signature = null, owned = [];

  function instanced(geometry, material, matrices) {
    if (!matrices.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); owned.push(mesh);
  }

  function build(state) {
    for (const o of owned) { root.remove(o); if (o.isInstancedMesh) o.dispose(); else o.geometry.dispose(); }
    owned = [];
    const posts = [], collars = [], bands = { water: [], hydrolox: [] };
    for (const run of pipeRuns(state)) {
      const style = STYLE[run.fluid], toPad = run.to === 'pad', pts = offset(run.points, style.lane);
      // Ends stop just inside the machine's face rather than at its centre.
      const pull = (p, q, d) => { const l = Math.hypot(q.x - p.x, q.z - p.z) || 1; return { ...p, x: p.x + (q.x - p.x) / l * d, z: p.z + (q.z - p.z) / l * d }; };
      pts[0] = pull(pts[0], pts[1], END_INSET);
      if (!toPad) pts[pts.length - 1] = pull(pts[pts.length - 1], pts[pts.length - 2], END_INSET);
      const samples = sweep(pts), total = samples[samples.length - 1].s;
      const bridges = run.points.filter(p => p.bridge);
      const lift = p => bridges.reduce((m, c) => Math.max(m, smooth((RAMP + 1 - Math.max(Math.abs(p.x - c.x), Math.abs(p.z - c.z))) / RAMP)), 0);
      const ground = samples.map(p => groundAt(p.x, p.z));
      const points = samples.map((p, i) => {
        let g = ground[i];
        for (let j = Math.max(0, i - 3); j <= Math.min(samples.length - 1, i + 3); j++) g = Math.max(g, ground[j]);
        let y = g + style.height + lift(p) * (BRIDGE - style.height);
        if (toPad) y += (PAD_COUPLING - y) * smooth(1 - (total - p.s) / 1.5);
        return new THREE.Vector3(p.x, y, p.z);
      });
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, Math.ceil(total / .25)), style.radius, 10, false), materials[run.fluid].pipe);
      tube.castShadow = tube.receiveShadow = true; root.add(tube); owned.push(tube);
      const at = s => { const i = Math.min(points.length - 1, samples.findIndex(p => p.s >= s)); return { p: points[i < 0 ? points.length - 1 : i], i: i < 0 ? points.length - 1 : i }; };
      const along = i => dir.subVectors(points[Math.min(points.length - 1, i + 1)], points[Math.max(0, i - 1)]).normalize();
      // Trestles: a post to the ground and a saddle under the pipe.
      for (let s = 1.1; s < total - .9; s += POST_EVERY) {
        const { p, i } = at(s), base = ground[i], h = p.y - style.radius - base;
        if (h < .05) continue;
        posts.push(m4.compose(v.set(p.x, base + h / 2, p.z), q.identity(), sc.set(.07, h, .07)).clone());
        q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along(i).setY(0).normalize());
        posts.push(m4.compose(v.set(p.x, p.y - style.radius - .02, p.z), q, sc.set(style.radius * 3.2, .04, .1)).clone());
        posts.push(m4.compose(v.set(p.x, base + .02, p.z), q.identity(), sc.set(.22, .04, .22)).clone());
      }
      // Coloured bands mark the fluid; flanged collars finish each end.
      const ring = (p, i, r, len, list) => { q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along(i)); list.push(m4.compose(v.copy(p), q, sc.set(r, r, len)).clone()); };
      for (let s = BAND_EVERY / 2; s < total - .6; s += BAND_EVERY) { const { p, i } = at(s); ring(p, i, style.radius * 1.18, .14, bands[run.fluid]); }
      ring(points[0], 0, style.radius * 1.7, .07, collars);
      ring(points[points.length - 1], points.length - 1, style.radius * 1.7, .07, collars);
    }
    instanced(unitBox, steel, posts);
    instanced(unitCylinder, steel, collars);
    for (const fluid of Object.keys(bands)) instanced(unitCylinder, materials[fluid].band, bands[fluid]);
  }

  function update(state, visible = true) {
    root.visible = visible;
    const next = pipeSignature(state);
    if (next !== signature) { signature = next; build(state); }
  }

  function dispose() {
    root.removeFromParent();
    for (const o of owned) { if (o.isInstancedMesh) o.dispose(); else o.geometry.dispose(); }
    unitBox.dispose(); unitCylinder.dispose(); steel.dispose();
    for (const m of Object.values(materials)) { m.pipe.dispose(); m.band.dispose(); }
  }
  return { update, dispose };
}
