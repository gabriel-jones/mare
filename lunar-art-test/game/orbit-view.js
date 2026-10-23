import * as THREE from 'three';
import { loadItemLibrary } from './item-models.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LAUNCH } from './space.js';
import { BODIES, createSolarSystem } from './celestial.js';

const PARKING = 1.32;
/** Orbit planes are spread by the golden angle so every new satellite gets its own ring. Units are Moon radii. */
const plane = i => ({ tilt: .25 + (i * .618 % 1) * .9, node: i * 2.39996, radius: 1.42 + (i % 4) * .09, speed: .16 - (i % 4) * .02 });
const SYSTEM = { id: 'system', name: 'Solar system', kicker: 'Overview', facts: [['Star', 'Sun'], ['Planets', '8'], ['Your colony', 'the Moon']] };
const TARGETS = [SYSTEM, ...BODIES];
/** Default camera distance for each view, in scene units. */
const viewDistance = id => id === 'system' ? 2900 : id === 'moon' ? 4.8 : id === 'belt' ? 11 : id === 'saturn' ? 13.5 * 6.2 : id === 'sun' ? 26 * 3.6 : BODIES.find(b => b.id === id).radius * 3.6;
const zoomRange = id => id === 'system' ? [500, 6000] : id === 'belt' ? [3, 60] : (r => [r * 1.4, r * 40])(BODIES.find(b => b.id === id).radius);
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Full-screen 3D view of the solar system and lunar orbit: satellites, the Starship and the Return order. */
export function createOrbitView(callbacks = {}) {
  const root = document.createElement('section');
  root.className = 'orbit-view'; root.hidden = true; root.setAttribute('aria-label', 'Orbital view');
  root.innerHTML = `<canvas class="orbit-canvas"></canvas><div class="orbit-labels"></div>
    <header class="orbit-head"><div><small data-orbit-field="kicker"></small><h2 data-orbit-field="title"></h2></div><button type="button" class="orbit-close" data-orbit="close" aria-label="Back to the surface" title="Back to the surface (O)">×</button></header>
    <nav class="orbit-nav" aria-label="Views">${TARGETS.map(t => `<button type="button" data-focus="${t.id}">${t.name}</button>`).join('')}</nav>
    <aside class="orbit-facts"><dl data-orbit-field="facts"></dl></aside>
    <aside class="orbit-panel">
      <div class="orbit-stat"><span>Satellites</span><strong data-orbit-field="satellites">0</strong></div>
      <div class="orbit-ship"><span data-orbit-field="ship"></span><button type="button" class="orbit-return" data-orbit="return">Return to the pad</button></div>
    </aside>`;
  document.body.append(root);
  const canvas = root.querySelector('canvas'), fields = Object.fromEntries([...root.querySelectorAll('[data-orbit-field]')].map(el => [el.dataset.orbitField, el]));
  const returnButton = root.querySelector('.orbit-return'), labelLayer = root.querySelector('.orbit-labels');
  const labels = new Map(BODIES.map(b => { const el = document.createElement('button'); el.type = 'button'; el.className = 'orbit-label'; el.dataset.focus = b.id; el.innerHTML = `<i></i>${b.name}`; labelLayer.append(el); return [b.id, el]; }));
  let renderer = null, composer, scene, camera, system, network, ringGroup, satGroup, ship, flame, satTemplate = null, colony, itemModels = null, disposed = false;
  let yaw = .6, pitch = .32, distance = viewDistance('moon'), focusId = 'moon', flight = null, drag = null, time = 0, ringKey = -1;
  const target = new THREE.Vector3(), goal = new THREE.Vector3();
  const disposables = [];
  const keep = x => (disposables.push(x), x);

  function init() {
    renderer = new THREE.WebGLRenderer({ canvas, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    scene = new THREE.Scene(); scene.background = new THREE.Color('#000000');
    camera = new THREE.PerspectiveCamera(40, 1, .002, 40000);
    system = createSolarSystem(renderer); scene.add(system.root);
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), .8, .6, 1.2));
    composer.addPass(new OutputPass());

    // The colony and its orbital network, in Moon radii around the Moon.
    network = system.moonFrame;
    colony = new THREE.Mesh(keep(new THREE.SphereGeometry(.008, 12, 8)), keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.9, .9) })));
    colony.position.set(0, .34, -.94).setLength(1.002); system.moonMesh.add(colony);
    ringGroup = new THREE.Group(); satGroup = new THREE.Group(); network.add(ringGroup, satGroup);
    const parking = ring(PARKING, '#ffb35c', .35); parking.rotation.x = Math.PI / 2; ringGroup.parent.add(parking); network.userData.parking = parking;
    ship = new THREE.Group(); network.add(ship);
    flame = new THREE.Mesh(keep(new THREE.ConeGeometry(.035, .16, 12)), keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, .6), transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false })));
    flame.rotation.x = Math.PI; flame.position.y = -.09; ship.add(flame);
    const loader = new GLTFLoader();
    loadItemLibrary(loader).then(library => { if(disposed){library?.dispose();return;}itemModels=library;satTemplate=library?.get('satellite')??null;ringKey=-1; });
    loader.loadAsync('./assets/starship.glb').then(g => { const model = g.scene.clone(true); model.scale.setScalar(.013); ship.add(model); }).catch(() => {});

    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      yaw -= dx * .006; pitch = THREE.MathUtils.clamp(pitch + dy * .004, -1.35, 1.35); drag.x = e.clientX; drag.y = e.clientY;
    });
    canvas.addEventListener('pointerup', e => { if (drag && drag.moved < 5) pick(e); drag = null; });
    canvas.addEventListener('wheel', e => { e.preventDefault(); const [lo, hi] = zoomRange(focusId); distance = THREE.MathUtils.clamp(distance * Math.exp(e.deltaY * .001), lo, hi); }, { passive: false });
  }
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(system.pickables, false)[0];
    if (hit) focus(hit.object.userData.body);
  }
  function ring(radius, color, opacity) {
    const points = Array.from({ length: 129 }, (_, i) => { const a = i / 128 * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0); });
    return new THREE.Line(keep(new THREE.BufferGeometry().setFromPoints(points)), keep(new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })));
  }
  /** Where satellite `i` is at time `t`, relative to the Moon. */
  function orbitPoint(i, t, out) {
    const p = plane(i), a = t * p.speed + i * 1.3;
    out.set(Math.cos(a) * p.radius, Math.sin(a) * p.radius, 0);
    return out.applyEuler(new THREE.Euler(p.tilt, p.node, 0, 'YXZ'));
  }
  function syncSatellites(count) {
    if (count === ringKey) return; ringKey = count;
    ringGroup.clear(); satGroup.clear();
    for (let i = 0; i < count; i++) {
      const p = plane(i), r = ring(p.radius, '#72d7ec', .3); r.rotation.copy(new THREE.Euler(p.tilt, p.node, 0, 'YXZ')); ringGroup.add(r);
      const sat = satTemplate ? satTemplate.clone(true) : new THREE.Mesh(keep(new THREE.BoxGeometry(.04, .04, .04)), keep(new THREE.MeshStandardMaterial({ color: '#d9a441' })));
      if (satTemplate) sat.scale.setScalar(.12);
      satGroup.add(sat);
    }
  }
  const centerOf = id => id === 'system' ? goal.set(0, 0, 0) : goal.copy(system.bodies.get(id).center);
  function focus(id, instant = false) {
    if (!TARGETS.some(t => t.id === id)) return;
    const from = target.clone(), fromDistance = cameraDistance();
    focusId = id; distance = viewDistance(id); faceSun = id !== 'system' && id !== 'sun';
    flight = instant || !renderer ? null : { from, fromDistance, t: 0 };
    const info = TARGETS.find(t => t.id === id);
    fields.kicker.textContent = info.kicker; fields.title.textContent = info.name;
    fields.facts.innerHTML = info.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    root.querySelectorAll('.orbit-nav button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.focus === id)));
    root.dataset.focus = id;
  }
  let currentDistance = distance, faceSun = false;
  const cameraDistance = () => currentDistance;
  /** Flights pull back on the way, scaled to how far apart the two targets are, then settle in. */
  function placeCamera(dt) {
    centerOf(focusId);
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 2.4);
      const k = ease(flight.t), travel = flight.from.distanceTo(goal);
      target.lerpVectors(flight.from, goal, k);
      const lift = Math.log(1 + travel / Math.max(flight.fromDistance, distance)) * Math.sin(Math.PI * k) * .9;
      currentDistance = Math.exp(THREE.MathUtils.lerp(Math.log(flight.fromDistance), Math.log(distance), k) + lift);
      if (flight.turn !== undefined && !drag) { yaw = flight.yaw0 + flight.turn * k; pitch = THREE.MathUtils.lerp(flight.pitch0, .25, k); }
      if (flight.t >= 1) flight = null;
    } else { target.copy(goal); currentDistance = distance; }
    // Narrow windows pull back so wide subjects (rings, orbits) stay in frame.
    const fit = currentDistance / Math.min(1, camera.aspect * 1.2);
    camera.position.setFromSphericalCoords(fit, Math.PI / 2 - pitch, yaw).add(target);
    camera.lookAt(target);
  }
  const projected = new THREE.Vector3(), toBody = new THREE.Vector3(), toSun = new THREE.Vector3();
  function behindSun(center, d) {
    const sunDistance = toSun.copy(camera.position).negate().length();
    if (d < sunDistance) return false;
    return toBody.subVectors(center, camera.position).normalize().angleTo(toSun.normalize()) < Math.asin(Math.min(1, 26 / sunDistance));
  }
  function placeLabels() {
    const w = canvas.clientWidth, h = canvas.clientHeight, scale = h / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    for (const [id, el] of labels) {
      const body = system.bodies.get(id), d = camera.position.distanceTo(body.center), px = body.def.radius * body.scale / d * scale;
      projected.copy(body.center).project(camera);
      const show = id !== focusId && projected.z < 1 && Math.abs(projected.x) < 1.05 && Math.abs(projected.y) < 1.05 && px < 50 && !behindSun(body.center, d);
      el.hidden = !show;
      if (show) el.style.transform = `translate(${(projected.x * .5 + .5) * w}px, ${(-projected.y * .5 + .5) * h + px + 4}px) translateX(-50%)`;
    }
  }
  const onClick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.orbit === 'close') api.close();
    else if (b.dataset.orbit === 'return') callbacks.onReturn?.();
    else if (b.dataset.focus) focus(b.dataset.focus);
    b.blur();
  };
  root.addEventListener('click', onClick);
  focus('moon', true);
  const point = new THREE.Vector3(), moonCenter = new THREE.Vector3();
  const api = {
    get open() { return !root.hidden; },
    get focus() { return focusId; },
    show() { if (!renderer) init(); root.hidden = false; document.body.dataset.orbit = 'open'; },
    close() { root.hidden = true; delete document.body.dataset.orbit; callbacks.onClose?.(); },
    toggle() { root.hidden ? api.show() : api.close(); },
    /** Flies to a body ('sun', 'earth', 'moon', 'belt', …) or 'system'. */
    goTo(id, instant = false) { focus(id, instant); },
    update(state, dt) {
      if (root.hidden) return;
      time += dt;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
      if (!drag) yaw += dt * .012;
      system.update(time);
      // Arrive on the day side, a little off the Sun line so the terminator shows relief.
      if (faceSun) {
        const c = system.bodies.get(focusId).center, to = Math.atan2(-c.x, -c.z) + .75;
        const turn = Math.atan2(Math.sin(to - yaw), Math.cos(to - yaw));
        if (flight) Object.assign(flight, { yaw0: yaw, turn, pitch0: pitch });
        else { yaw += turn; pitch = .25; }
        faceSun = false;
      }
      placeCamera(dt);
      system.followCamera(camera, h);
      moonCenter.copy(system.bodies.get('moon').center);
      // The network only shows up close; from afar it would be a smear of lines over the Moon.
      const near = THREE.MathUtils.clamp(1 - (camera.position.distanceTo(moonCenter) - 12) / 30, 0, 1);
      network.visible = near > 0;
      ringGroup.children.forEach(r => { r.material.opacity = .3 * near; });
      network.userData.parking.material.opacity = .35 * near;
      system.setLineOpacity(.14 * THREE.MathUtils.clamp((currentDistance - 3) / 60, .25, 1));
      syncSatellites(state.satellites);
      satGroup.children.forEach((sat, i) => { orbitPoint(i, time, point); sat.position.copy(point); sat.lookAt(moonCenter); });
      // The ship climbs from the colony to the parking orbit, waits there, then drops back.
      const s = state.ship;
      ship.visible = s.status !== 'pad';
      if (ship.visible) {
        const climb = s.status === 'ascent' ? Math.min(1, s.t / LAUNCH.ascent) : s.status === 'descent' ? 1 - Math.min(1, s.t / LAUNCH.descent) : 1;
        const a = time * .12, radius = 1.03 + (PARKING - 1.03) * Math.sin(climb * Math.PI / 2);
        ship.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
        ship.lookAt(moonCenter); ship.rotateX(-Math.PI / 2);
        flame.visible = s.status !== 'orbit'; flame.scale.setScalar(.8 + Math.random() * .3);
      }
      colony.scale.setScalar(1 + .25 * Math.sin(time * 3));
      fields.satellites.textContent = String(state.satellites);
      fields.ship.textContent = { pad: s.payload ? `Starship on the pad · ${s.payload} satellite${s.payload > 1 ? 's' : ''} aboard` : 'Starship on the pad', ascent: 'Starship climbing to orbit…', orbit: 'Starship in parking orbit', descent: 'Starship descending…' }[s.status];
      returnButton.hidden = s.status !== 'orbit';
      placeLabels();
      composer.render();
      root.dataset.drawn = String(Number(root.dataset.drawn ?? 0) + 1);
    },
    dispose() { disposed=true;root.removeEventListener('click', onClick); disposables.forEach(d => d.dispose()); itemModels?.dispose();system?.dispose(); composer?.dispose(); renderer?.dispose(); root.remove(); },
  };
  return api;
}
