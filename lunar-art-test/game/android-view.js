import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { surfaceHeightAt as heightAt } from './terrain.js';
import { ANDROID } from './android.js';

// Played once and held on the last frame.
const ONCE = new Set(['down', 'bladeslash']);
const FADE = { down: .1, bladeslash: .04, gunfire: 0, pistolfire: 0 };
// Which held mesh and clip set each weapon uses.
const GRIP = { pistol: 'pistol', katana: 'blade' };
const MESH = { Gun: 'gun', Pistol: 'pistol', Blade: 'blade' };
const MUZZLE = { gun: 'Muzzle', pistol: 'PistolMuzzle' };
const TRACER = { pistol: ['#ffd38a', .03], smg: ['#ffd38a', .025], rifle: ['#ffc46b', .045], railgun: ['#7fe3ff', .09], arc: ['#9fd8ff', .05], flamethrower: ['#ff9a3c', .06] };
// The face strip shows what the android is up to: blue at work, amber when low or charging, red fighting, dark when down.
const FACE = { work: '#4cc8ff', low: '#ffb347', fight: '#ff4b3a', down: '#1a0806' };
const WORK = new Set(['build', 'craft', 'collect', 'fetch', 'deliver', 'stow', 'disarm', 'arm', 'kit', 'repair']);

/** Draws `state.robots` of kind 'android' from android.glb. `views` maps robot id to {root} for status labels. */
export function createAndroidView(scene, gltf, itemModels = null) {
  const root = new THREE.Group(); root.name = 'androids'; scene.add(root);
  const views = new Map();
  const tracerGeo = new THREE.BoxGeometry(1, 1, 1); tracerGeo.translate(0, 0, .5);
  const tracers = [], at = new THREE.Vector3(), to = new THREE.Vector3();

  function create() {
    const model = cloneSkinned(gltf.scene), mixer = new THREE.AnimationMixer(model), actions = new Map(), additive = new Map();
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    for (const clip of gltf.animations) {
      const key = clip.name.toLowerCase().split('.')[0];
      if (key.endsWith('fire')) {
        const a = mixer.clipAction(THREE.AnimationUtils.makeClipAdditive(clip.clone()));
        a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = false; additive.set(key, a); continue;
      }
      const a = mixer.clipAction(clip);
      if (ONCE.has(key)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      actions.set(key, a);
    }
    const held = { gun: [], pistol: [], blade: [] }, markers = new Map();
    let face = null, carry = null;
    model.traverse(o => {
      if (MESH[o.name]) held[MESH[o.name]].push(o);
      if (o.name === 'Face' && o.isMesh) { o.material = o.material.clone(); face = o.material; }
      if (o.name === 'Carry') carry = o;
      if (o.name === 'Muzzle' || o.name === 'PistolMuzzle') markers.set(o.name, o);
    });
    // Bones are scaled with the armature; the carried stack rides a holder that cancels it.
    const load = new THREE.Group(); load.name = 'Carried stack'; (carry ?? model).add(load);
    const view = { root: new THREE.Group(), model, mixer, actions, additive, held, markers, face, load, loadItem: null, current: '', active: null, display: null, shot: 0, faceColor: new THREE.Color(FACE.work) };
    view.root.add(model); root.add(view.root);
    return view;
  }

  function play(view, key) {
    if (key === view.current) return;
    const next = view.actions.get(key) ?? view.actions.get('idle'), fade = FADE[key] ?? .18;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (view.active && view.active !== next) view.active.fadeOut(fade);
    view.active = next; view.current = key;
  }

  function clipFor(r, view) {
    if (r.down) return 'down';
    const grip = r.weapon ? GRIP[r.weapon] ?? 'gun' : null, moving = r.moving;
    if (grip) {
      if (grip === 'blade' && view.current === 'bladeslash' && view.active?.isRunning()) return 'bladeslash';
      return grip + (moving ? 'walk' : 'aim');
    }
    if (r.carry) return moving ? 'carry' : 'carryidle';
    if (moving) return 'walk';
    const j = r.job;
    if (j?.here) {
      if (j.type === 'charge') return 'charge';
      if (j.type === 'harvest') return 'harvest';
      if (WORK.has(j.type)) return 'work';
    }
    return 'idle';
  }

  function shoot(state, view, r) {
    const grip = GRIP[r.weapon] ?? 'gun';
    if (grip === 'blade') { view.current = ''; play(view, 'bladeslash'); return; }
    view.additive.get(`${grip}fire`)?.reset().setEffectiveWeight(1).play();
    const muzzle = view.markers.get(MUZZLE[grip]); if (!muzzle || !r.aim) return;
    view.model.updateMatrixWorld(true); muzzle.getWorldPosition(at);
    to.set(r.aim.x, heightAt(state.seed, r.aim.x, r.aim.z) + .35, r.aim.z);
    const [color, thick] = TRACER[r.weapon] ?? TRACER.pistol;
    let t = tracers.find(t => !t.mesh.visible);
    if (!t) { t = { mesh: new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })), life: 0 }; t.mesh.frustumCulled = false; root.add(t.mesh); tracers.push(t); }
    t.mesh.material.color.set(color); t.mesh.position.copy(at); t.mesh.lookAt(to);
    t.mesh.scale.set(thick, thick, at.distanceTo(to)); t.mesh.visible = true; t.life = t.max = r.weapon === 'railgun' ? .22 : .07;
  }

  function update(state, dt) {
    const live = new Set();
    root.visible = state.player.cave == null;
    for (const r of state.robots ?? []) {
      if (r.kind !== 'android') continue;
      live.add(r.id);
      let view = views.get(r.id);
      if (!view) { view = create(); views.set(r.id, view); view.shot = r.shot ?? 0; }
      if (!view.display || Math.hypot(view.display.x - r.x, view.display.z - r.z) > 6) view.display = { x: r.x, z: r.z, facing: r.facing };
      const d = view.display, blend = 1 - Math.exp(-dt * 14), px = d.x, pz = d.z;
      d.x += (r.x - d.x) * blend; d.z += (r.z - d.z) * blend;
      d.facing += Math.atan2(Math.sin(r.facing - d.facing), Math.cos(r.facing - d.facing)) * blend;
      view.root.position.set(d.x, heightAt(state.seed, d.x, d.z) + (r.job?.type === 'charge' && r.job.here ? .14 : 0), d.z); view.root.rotation.y = d.facing;

      const clip = clipFor(r, view); play(view, clip);
      const speed = Math.hypot(d.x - px, d.z - pz) / Math.max(dt, 1e-3);
      if (view.active) view.active.timeScale = /walk|carry$/.test(clip) ? Math.max(.4, speed / ANDROID.speed) : 1;
      if ((r.shot ?? 0) !== view.shot) { view.shot = r.shot ?? 0; if (r.weapon) shoot(state, view, r); }

      const grip = r.weapon && !r.down ? GRIP[r.weapon] ?? 'gun' : null;
      for (const [k, list] of Object.entries(view.held)) for (const o of list) o.visible = k === grip;
      const item = r.carry && !r.down ? r.carry.item : null;
      if (item !== view.loadItem) {
        view.load.clear(); view.loadItem = item;
        const prop = item && itemModels?.create(item, .5);
        if (prop) view.load.add(prop);
      }

      if (view.face) {
        const low = r.charge < ANDROID.low || (r.job?.type === 'charge' && r.job.here);
        const tone = r.down ? FACE.down : r.job?.type === 'fight' ? FACE.fight : low ? FACE.low : FACE.work;
        view.faceColor.set(tone);
        // A slow pulse while charging, a flicker when the battery is nearly flat.
        const pulse = r.down ? .15 : r.job?.type === 'charge' && r.job.here ? .6 + .4 * Math.sin(state.time * 3) : r.charge < .1 ? (Math.sin(state.time * 23) > 0 ? 1 : .2) : 1;
        view.face.color.copy(view.faceColor); view.face.emissive.copy(view.faceColor); view.face.emissiveIntensity = 4 * pulse;
      }
      view.mixer.update(Math.min(dt, .1));
    }
    for (const [id, view] of views) if (!live.has(id)) { view.mixer.stopAllAction(); root.remove(view.root); views.delete(id); }
    for (const t of tracers) {
      if (!t.mesh.visible) continue;
      t.life -= dt; if (t.life <= 0) { t.mesh.visible = false; continue; }
      t.mesh.material.opacity = t.life / t.max;
    }
  }

  return {
    views,
    update,
    dispose() { for (const v of views.values()) v.mixer.stopAllAction(); scene.remove(root); tracerGeo.dispose(); tracers.forEach(t => t.mesh.material.dispose()); },
  };
}
