import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { LAUNCH, RESEARCH_PER_SATELLITE, TECHS } from './space.js';

const MOON = 10, PARKING = 13.2;
/** Orbit planes are spread by the golden angle so every new satellite gets its own ring. */
const plane = i => ({ tilt: .25 + (i * .618 % 1) * .9, node: i * 2.39996, radius: 14.2 + (i % 4) * .9, speed: .16 - (i % 4) * .02 });

/** Full-screen 3D view of lunar orbit: the Moon, satellite rings, the Starship, research and the Return order. */
export function createOrbitView(callbacks = {}) {
  const root = document.createElement('section');
  root.className = 'orbit-view'; root.hidden = true; root.setAttribute('aria-label', 'Lunar orbit');
  root.innerHTML = `<canvas class="orbit-canvas"></canvas>
    <header class="orbit-head"><div><small>Lunar orbit</small><h2>Orbital network</h2></div><button type="button" class="orbit-close" data-orbit="close" aria-label="Back to the surface" title="Back to the surface (O)">×</button></header>
    <aside class="orbit-panel">
      <div class="orbit-stat"><span>Satellites</span><strong data-orbit-field="satellites">0</strong></div>
      <div class="orbit-stat"><span>Research</span><strong data-orbit-field="rate">0</strong><small>pts / min</small></div>
      <div class="orbit-ship"><span data-orbit-field="ship"></span><button type="button" class="orbit-return" data-orbit="return">Return to the pad</button></div>
      <h3>Research</h3><div class="orbit-techs"></div>
    </aside>`;
  document.body.append(root);
  const canvas = root.querySelector('canvas'), fields = Object.fromEntries([...root.querySelectorAll('[data-orbit-field]')].map(el => [el.dataset.orbitField, el]));
  const returnButton = root.querySelector('.orbit-return'), techs = root.querySelector('.orbit-techs');
  let renderer = null, scene, camera, moon, ringGroup, satGroup, ship, flame, satTemplate = null, shipTemplate = null, colony;
  let yaw = .6, pitch = .32, distance = 46, drag = null, time = 0, ringKey = -1;
  const disposables = [];
  const keep = x => (disposables.push(x), x);

  function moonTexture() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const g = c.getContext('2d'); g.fillStyle = '#8d8b86'; g.fillRect(0, 0, 1024, 512);
    let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    // Maria, then craters with bright rims.
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(52,54,58,${.25 + rand() * .3})`; g.beginPath(); g.ellipse(rand() * 1024, 120 + rand() * 280, 40 + rand() * 120, 30 + rand() * 70, rand() * 3, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 420; i++) {
      const x = rand() * 1024, y = rand() * 512, r = Math.pow(rand(), 3) * 26 + 1.5;
      g.fillStyle = 'rgba(40,40,44,.35)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(220,218,210,.35)'; g.lineWidth = Math.max(1, r * .18); g.beginPath(); g.arc(x - r * .12, y - r * .12, r, Math.PI * .9, Math.PI * 1.9); g.stroke();
    }
    const t = keep(new THREE.CanvasTexture(c)); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function init() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75)); renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene = new THREE.Scene(); scene.background = new THREE.Color('#03050a');
    camera = new THREE.PerspectiveCamera(40, 1, .1, 800);
    const sun = new THREE.DirectionalLight('#fff3e0', 3.2); sun.position.set(-30, 12, 20); scene.add(sun, new THREE.AmbientLight('#4a5a78', .35));
    moon = new THREE.Mesh(keep(new THREE.SphereGeometry(MOON, 64, 32)), keep(new THREE.MeshStandardMaterial({ map: moonTexture(), roughness: 1 }))); scene.add(moon);
    const halo = new THREE.Mesh(keep(new THREE.SphereGeometry(MOON * 1.03, 48, 24)), keep(new THREE.MeshBasicMaterial({ color: '#7fa6d8', transparent: true, opacity: .07, side: THREE.BackSide }))); scene.add(halo);
    // The colony: a warm beacon on the near side.
    colony = new THREE.Mesh(keep(new THREE.SphereGeometry(.18, 12, 8)), keep(new THREE.MeshBasicMaterial({ color: '#ffb35c' })));
    colony.position.setFromSphericalCoords(MOON + .02, Math.PI * .42, .3); moon.add(colony);
    const stars = new Float32Array(3000 * 3);
    for (let i = 0; i < 3000; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(300 + Math.random() * 200); stars.set([v.x, v.y, v.z], i * 3); }
    const starGeo = keep(new THREE.BufferGeometry()); starGeo.setAttribute('position', new THREE.BufferAttribute(stars, 3));
    scene.add(new THREE.Points(starGeo, keep(new THREE.PointsMaterial({ color: '#cfd8ff', size: 1.2, sizeAttenuation: false }))));
    ringGroup = new THREE.Group(); satGroup = new THREE.Group(); scene.add(ringGroup, satGroup);
    const parking = ring(PARKING, '#ffb35c', .35); parking.rotation.x = Math.PI / 2; scene.add(parking);
    ship = new THREE.Group(); scene.add(ship);
    flame = new THREE.Mesh(keep(new THREE.ConeGeometry(.35, 1.6, 12)), keep(new THREE.MeshBasicMaterial({ color: '#ffb35c', transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false })));
    flame.rotation.x = Math.PI; flame.position.y = -.9; ship.add(flame);
    const loader = new GLTFLoader();
    loader.loadAsync('./assets/satellite.glb').then(g => { satTemplate = g.scene; ringKey = -1; }).catch(() => {});
    loader.loadAsync('./assets/starship.glb').then(g => { shipTemplate = g.scene.clone(true); shipTemplate.scale.setScalar(.13); ship.add(shipTemplate); }).catch(() => {});
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (!drag) return; yaw -= (e.clientX - drag.x) * .006; pitch = THREE.MathUtils.clamp(pitch + (e.clientY - drag.y) * .004, -1.2, 1.2); drag = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', () => { drag = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); distance = THREE.MathUtils.clamp(distance * Math.exp(e.deltaY * .001), 24, 90); }, { passive: false });
  }
  function ring(radius, color, opacity) {
    const points = Array.from({ length: 129 }, (_, i) => { const a = i / 128 * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0); });
    return new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(points)), keep(new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
  }
  /** Where satellite `i` is at time `t`. */
  function orbitPoint(i, t, target) {
    const p = plane(i), a = t * p.speed + i * 1.3;
    target.set(Math.cos(a) * p.radius, Math.sin(a) * p.radius, 0);
    return target.applyEuler(new THREE.Euler(p.tilt, p.node, 0, 'YXZ'));
  }
  function syncSatellites(count) {
    if (count === ringKey) return; ringKey = count;
    ringGroup.clear(); satGroup.clear();
    for (let i = 0; i < count; i++) {
      const p = plane(i), r = ring(p.radius, '#72d7ec', .28); r.rotation.copy(new THREE.Euler(p.tilt, p.node, 0, 'YXZ')); ringGroup.add(r);
      const sat = satTemplate ? satTemplate.clone(true) : new THREE.Mesh(keep(new THREE.BoxGeometry(.4, .4, .4)), keep(new THREE.MeshStandardMaterial({ color: '#d9a441' })));
      sat.scale.setScalar(.5); satGroup.add(sat);
    }
  }
  let techKey = '';
  function renderTechs(state) {
    const r = state.research, key = JSON.stringify([r.selected, r.done]);
    if (key !== techKey) {
      techKey = key;
      techs.innerHTML = Object.entries(TECHS).map(([id, t]) => {
        const done = r.done.includes(id), active = r.selected === id;
        return `<button type="button" class="orbit-tech" data-tech="${id}" data-state="${done ? 'done' : active ? 'active' : 'idle'}" ${done ? 'disabled' : ''}><strong>${t.name}</strong><small>${done ? 'Researched · build it from the Space menu' : t.description}</small><span class="orbit-bar"><i></i></span><em data-tech-field="${id}"></em></button>`;
      }).join('');
    }
    for (const [id, t] of Object.entries(TECHS)) {
      const progress = Math.min(1, (r.progress[id] ?? 0) / t.cost), el = techs.querySelector(`[data-tech="${id}"]`);
      el.querySelector('.orbit-bar i').style.transform = `scaleX(${r.done.includes(id) ? 1 : progress})`;
      el.querySelector('em').textContent = r.done.includes(id) ? 'Done' : `${Math.floor(r.progress[id] ?? 0)} / ${t.cost}`;
    }
  }
  const onClick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.orbit === 'close') api.close();
    else if (b.dataset.orbit === 'return') callbacks.onReturn?.();
    else if (b.dataset.tech) callbacks.onResearch?.(b.dataset.tech);
    b.blur();
  };
  root.addEventListener('click', onClick);
  const point = new THREE.Vector3();
  const api = {
    get open() { return !root.hidden; },
    show() { if (!renderer) init(); root.hidden = false; document.body.dataset.orbit = 'open'; },
    close() { root.hidden = true; delete document.body.dataset.orbit; callbacks.onClose?.(); },
    toggle() { root.hidden ? api.show() : api.close(); },
    update(state, dt) {
      if (root.hidden) return;
      time += dt;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
      syncSatellites(state.satellites);
      satGroup.children.forEach((sat, i) => { orbitPoint(i, time, point); sat.position.copy(point); sat.lookAt(0, 0, 0); });
      moon.rotation.y += dt * .02;
      // The ship climbs from the colony to the parking orbit, waits there, then drops back.
      const s = state.ship;
      ship.visible = s.status !== 'pad';
      if (ship.visible) {
        const climb = s.status === 'ascent' ? Math.min(1, s.t / LAUNCH.ascent) : s.status === 'descent' ? 1 - Math.min(1, s.t / LAUNCH.descent) : 1;
        const a = time * .12, radius = MOON + .3 + (PARKING - MOON - .3) * Math.sin(climb * Math.PI / 2);
        ship.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
        ship.lookAt(0, 0, 0); ship.rotateX(-Math.PI / 2);
        flame.visible = s.status !== 'orbit'; flame.scale.setScalar(.8 + Math.random() * .3);
      }
      fields.satellites.textContent = String(state.satellites);
      fields.rate.textContent = String(state.satellites * RESEARCH_PER_SATELLITE);
      fields.ship.textContent = { pad: s.payload ? `Starship on the pad · ${s.payload} satellite${s.payload > 1 ? 's' : ''} aboard` : 'Starship on the pad', ascent: 'Starship climbing to orbit…', orbit: 'Starship in parking orbit', descent: 'Starship descending…' }[s.status];
      returnButton.hidden = s.status !== 'orbit';
      renderTechs(state);
      // Narrow windows pull back so the outer rings stay in frame.
      camera.position.setFromSphericalCoords(distance / Math.min(1, camera.aspect * 1.2), Math.PI / 2 - pitch, yaw + time * .015); camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      root.dataset.drawn = String(Number(root.dataset.drawn ?? 0) + 1);
    },
    dispose() { root.removeEventListener('click', onClick); disposables.forEach(d => d.dispose()); renderer?.dispose(); root.remove(); },
  };
  return api;
}
