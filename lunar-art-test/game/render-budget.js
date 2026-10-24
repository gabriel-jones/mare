import * as THREE from 'three';

// Every lit material pays for every point light in the scene on every pixel, whether or not the light is on.
// So the scene keeps only `size` real point lights. Every other point light the views create (flares, fire,
// muzzle flash, work lights, beacons...) is a stand-in: it sits on a layer the camera never draws, and each
// frame the real lights take the place, colour and strength of the stand-ins that matter most to the view.
// The real count never changes, so no shader ever recompiles as effects come and go.
const OFFSTAGE = 31;

export function createLightBudget(scene, size = 6) {
  const real = Array.from({ length: size }, () => { const l = new THREE.PointLight('#ffffff', 0, 1, 2); l.userData.budget = true; scene.add(l); return l; });
  const at = new THREE.Vector3(), lit = [];
  const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  function update(focus) {
    lit.length = 0;
    scene.traverse(o => {
      if (!o.isPointLight || o.userData.budget) return;
      o.layers.set(OFFSTAGE);
      if (o.intensity <= 0 || !shown(o)) return;
      o.updateWorldMatrix(true, false); at.setFromMatrixPosition(o.matrixWorld);
      const reach = o.distance || 60, d = at.distanceTo(focus);
      lit.push({ o, x: at.x, y: at.y, z: at.z, score: o.intensity * reach / (1 + (d / 14) ** 2) });
    });
    lit.sort((a, b) => b.score - a.score);
    real.forEach((l, i) => {
      const s = lit[i];
      if (!s) { l.intensity = 0; return; }
      l.position.set(s.x, s.y, s.z); l.color.copy(s.o.color); l.intensity = s.o.intensity; l.distance = s.o.distance; l.decay = s.o.decay;
    });
  }
  return { update, get lit() { return lit.length; } };
}

// Render sharp while the frame rate holds and give up pixels when it doesn't: drop a step at once under 50 fps,
// climb back a step after five steady seconds, and never climb again past a step that has already dropped.
export function createAdaptiveResolution(renderer, apply, max = Math.min(window.devicePixelRatio || 1, 1.75), min = 1) {
  let ratio = max, ceiling = max, time = 0, span = 0, frames = 0, steady = 0, raisedAt = -Infinity;
  const set = r => { ratio = r; renderer.setPixelRatio(r); apply(); };
  set(max);
  function update(dt) {
    time += dt; span += dt; frames++;
    if (span < 1) return;
    const fps = frames / span; span = 0; frames = 0;
    if (fps < 50 && ratio > min) {
      if (time - raisedAt < 4) ceiling = ratio - .25;
      set(Math.max(min, ratio - .25)); steady = 0;
    } else if (fps >= 57 && ratio < ceiling) {
      if (++steady >= 5) { set(Math.min(ceiling, ratio + .25)); raisedAt = time; steady = 0; }
    } else steady = 0;
  }
  return { update, get ratio() { return ratio; } };
}

// Small things (belt items, props, pebbles, hand-held bits) cost a shadow-pass draw each but their shadows are
// a few pixels at the game's zoom. Meshes are checked once, as they appear.
const sphere = new THREE.Sphere(), scale = new THREE.Vector3();
export function trimShadows(scene, minRadius = .45) {
  scene.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh || !o.castShadow || o.userData.shadowChecked) return;
    const g = o.geometry; if (!g) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    o.updateWorldMatrix(true, false); o.matrixWorld.decompose(sphere.center, new THREE.Quaternion(), scale);
    const s = Math.max(scale.x, scale.y, scale.z);
    // Collapsed to nothing means hidden for now, not small: look again once it shows.
    if (s < 1e-3) return;
    o.userData.shadowChecked = true;
    if (g.boundingSphere.radius * s < minRadius) o.castShadow = false;
  });
}
