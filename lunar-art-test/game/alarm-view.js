import * as THREE from 'three';

export const ALARM_RED = '#ff2a16';

/**
 * Raid mode for the colony's lights: rotating red beacon sweeps across the ground at each lit cluster. They are
 * additive decals rather than lights, so a raid costs no shader changes and nothing against the light budget.
 */
export function createAlarmView(scene, groundAt, count = 6) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d'), grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, '#ffffffff'); grad.addColorStop(.35, '#ffffff88'); grad.addColorStop(1, '#ffffff00');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  const geometry = new THREE.CircleGeometry(1, 20, -.32, .64).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ map: texture, color: ALARM_RED, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -3 });
  const sweeps = Array.from({ length: count }, (_, i) => {
    const root = new THREE.Group(), beams = [0, Math.PI].map(a => { const m = new THREE.Mesh(geometry, material); m.rotation.y = a; m.renderOrder = 3; m.raycast = () => {}; root.add(m); return m; });
    root.visible = false; scene.add(root);
    return { root, beams, spin: i * 1.9 };
  });
  let level = 0, clock = 0;
  /** `want` 0..1 eases the alarm in and out; `spots` are [{x, z, reach}] in world metres, nearest first. */
  function update(dt, want, spots, seed) {
    clock += dt; level += (want - level) * Math.min(1, dt * (want > level ? 2.5 : 1.2));
    material.opacity = .55 * level;
    sweeps.forEach((s, i) => {
      const spot = spots[i];
      s.root.visible = level > .01 && !!spot;
      if (!s.root.visible) return;
      s.root.position.set(spot.x, groundAt(seed, spot.x, spot.z) + .09, spot.z);
      s.root.scale.setScalar(spot.reach);
      s.root.rotation.y = clock * 2.6 + s.spin;
    });
    return level;
  }
  return { update, get level() { return level; }, dispose() { sweeps.forEach(s => s.root.removeFromParent()); geometry.dispose(); material.dispose(); texture.dispose(); } };
}
