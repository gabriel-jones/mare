import * as THREE from 'three';

const STRIDE = .62, TRACK_STEP = .45;

function markTexture(draw, w, h) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

/**
 * Boot prints and wheel tracks pressed into the regolith, fading out behind whoever made them.
 */
export function createGroundMarks(scene, { heightAt, dust }) {
  const boot = markTexture((g, w, h) => {
    g.fillStyle = 'rgba(60,56,50,.55)';
    g.beginPath(); g.ellipse(w / 2, h * .3, w * .4, h * .26, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(w / 2, h * .76, w * .34, h * .2, 0, 0, Math.PI * 2); g.fill();
    // Sole lugs press darker ridges across the print.
    g.fillStyle = 'rgba(30,28,25,.5)';
    for (let y = h * .1; y < h * .92; y += h * .09) if (y < h * .54 || y > h * .6) g.fillRect(w * .2, y, w * .6, h * .035);
  }, 32, 64);
  const tread = markTexture((g, w, h) => {
    g.fillStyle = 'rgba(64,60,54,.22)'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(40,37,33,.26)';
    for (let y = 0; y < h; y += h / 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(w / 2, y + h / 10); g.lineTo(w, y); g.lineTo(w, y + h / 14); g.lineTo(w / 2, y + h / 10 + h / 14); g.lineTo(0, y + h / 14); g.fill(); }
  }, 32, 64);
  tread.wrapT = THREE.RepeatWrapping;
  const root = new THREE.Group(); root.name = 'Ground marks'; scene.add(root);
  const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const look = map => {
    const material = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float fade;\nvarying float vFade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = fade;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFade;').replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= vFade;');
    };
    return material;
  };
  // Boot prints linger a few seconds behind the walker; wheel tracks wear away over a minute.
  const sets = [[boot, 40, 2.5, 3], [tread, 1200, 40, 25]].map(([map, size, hold, fadeOut]) => {
    const geometry = plane.clone(), fade = new THREE.InstancedBufferAttribute(new Float32Array(size), 1);
    fade.setUsage(THREE.DynamicDrawUsage); geometry.setAttribute('fade', fade);
    const mesh = new THREE.InstancedMesh(geometry, look(map), size); mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; mesh.renderOrder = 1; root.add(mesh);
    return { mesh, geometry, fade, born: new Float32Array(size), size, next: 0, hold, fadeOut };
  });
  const clock = () => performance.now() / 1000;
  const [feet, tracks] = sets;
  const forward = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), basis = new THREE.Matrix4();

  function stamp(set, seed, x, z, yaw, width, length) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw), e = .25;
    const h = heightAt(seed, x, z);
    forward.set(fx, (heightAt(seed, x + fx * e, z + fz * e) - heightAt(seed, x - fx * e, z - fz * e)) / (2 * e), fz).normalize();
    right.set(fz, (heightAt(seed, x + fz * e, z - fx * e) - heightAt(seed, x - fz * e, z + fx * e)) / (2 * e), -fx).normalize();
    up.crossVectors(forward, right).normalize(); if (up.y < 0) up.negate();
    basis.makeBasis(right.multiplyScalar(width), up, forward.multiplyScalar(length)).setPosition(x, h + .02, z);
    set.mesh.setMatrixAt(set.next, basis); set.born[set.next] = clock(); set.next = (set.next + 1) % set.size;
    set.mesh.count = Math.min(set.size, set.mesh.count + 1); set.mesh.instanceMatrix.needsUpdate = true;
  }

  let walker = null;
  /** The astronaut on open ground: a print every stride, alternating feet, with a little puff of dust. */
  function walk(seed, x, z) {
    if (!walker || Math.hypot(x - walker.x, z - walker.z) > 3) { walker = { x, z, left: false }; return; }
    const moved = Math.hypot(x - walker.x, z - walker.z);
    if (moved < STRIDE) return;
    const yaw = Math.atan2(x - walker.x, z - walker.z), side = walker.left ? -.13 : .13;
    const px = x + Math.cos(yaw) * side, pz = z - Math.sin(yaw) * side;
    stamp(feet, seed, px, pz, yaw, .17, .32);
    dust?.(px, heightAt(seed, px, pz) + .03, pz, Math.sin(yaw), Math.cos(yaw));
    walker = { x, z, left: !walker.left };
  }
  walk.reset = () => { walker = null; };

  const vehicles = new Map();
  /** A wheeled robot: two tread strips laid behind it as it drives. */
  function drive(seed, id, x, z, gauge) {
    const last = vehicles.get(id);
    if (!last || Math.hypot(x - last.x, z - last.z) > 4) { vehicles.set(id, { x, z }); return; }
    const moved = Math.hypot(x - last.x, z - last.z);
    if (moved < TRACK_STEP) return;
    const yaw = Math.atan2(x - last.x, z - last.z), mx = (x + last.x) / 2, mz = (z + last.z) / 2;
    for (const side of [-gauge, gauge]) stamp(tracks, seed, mx + Math.cos(yaw) * side, mz - Math.sin(yaw) * side, yaw, .26, moved);
    vehicles.set(id, { x, z });
  }

  function update() {
    const now = clock();
    for (const set of sets) {
      for (let i = 0; i < set.mesh.count; i++) set.fade.array[i] = Math.max(0, Math.min(1, 1 - (now - set.born[i] - set.hold) / set.fadeOut));
      set.fade.needsUpdate = true;
    }
  }

  function dispose() { root.removeFromParent(); plane.dispose(); for (const s of sets) { s.mesh.dispose(); s.geometry.dispose(); s.mesh.material.dispose(); } boot.dispose(); tread.dispose(); }
  return { walk, drive, update, dispose };
}
