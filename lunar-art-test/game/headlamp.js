import * as THREE from 'three';

/**
 * The helmet lamp as a real torch would light airless ground: a narrow throw beam with a soft, slightly uneven
 * hotspot pattern, a wide dim spill that reaches the ground at the astronaut's feet, and a faint bounce off the lit
 * regolith back onto the suit. Callers set `intensity` and `distance` once, as for a single light; `update()` shares
 * them out across the three.
 */
const BEAM = 2.8, SPILL = .24, BOUNCE = .035;

/** Torch pattern: a hot centre, a faint ring, and an edge that breaks up instead of ending on a crisp rim. */
function torchPattern(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
  const wobble = a => .04 * Math.sin(a * 5 + 1.3) + .025 * Math.sin(a * 11 + .4) + .015 * Math.sin(a * 23 + 2.1);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1, r = Math.hypot(u, v), a = Math.atan2(v, u);
    const edge = .92 + wobble(a), k = r / edge;
    let l = k >= 1 ? 0 : Math.pow(1 - k * k, 1.6);
    l = .7 * l + .3 * Math.exp(-((r / .3) ** 2));
    l += .08 * Math.exp(-(((r - .55) / .05) ** 2)) * (k < 1 ? 1 : 0);
    const i = (y * size + x) * 4, n = Math.min(255, Math.round(255 * l));
    d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createHeadlamp(parent) {
  const pattern = typeof document === 'undefined' ? null : torchPattern();
  const beam = new THREE.SpotLight('#d6eaff', 0, 26, .4, .85, 2); beam.position.set(0, 1.6, .25); beam.map = pattern;
  const beamAt = new THREE.Object3D(); beamAt.position.set(0, 0, 9.5); beam.target = beamAt;
  const spill = new THREE.SpotLight('#c4dcff', 0, 11, 1.05, 1, 2); spill.position.set(0, 1.6, .2);
  const spillAt = new THREE.Object3D(); spillAt.position.set(0, 0, 2.2); spill.target = spillAt;
  const bounce = new THREE.PointLight('#cfd6e2', 0, 6, 2); bounce.position.set(0, .45, 2.6);
  parent.add(beam, beamAt, spill, spillAt, bounce);
  const lamp = {
    intensity: 45, distance: 18,
    update() {
      beam.intensity = lamp.intensity * BEAM; spill.intensity = lamp.intensity * SPILL; bounce.intensity = lamp.intensity * BOUNCE;
      beam.distance = lamp.distance * 1.45; spill.distance = lamp.distance * .6;
    },
    dispose() { pattern?.dispose(); beam.removeFromParent(); beamAt.removeFromParent(); spill.removeFromParent(); spillAt.removeFromParent(); bounce.removeFromParent(); },
  };
  return lamp;
}
