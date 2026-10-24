import * as THREE from 'three';

export const BELT_MATERIAL = 'Lunar • conveyor belt';

/**
 * Rubber tread with cleats and a faint travel chevron, one tile per belt cell. Belt UV v grows along
 * the travel direction; glTF stores it flipped, so with flipY off the canvas top is the leading end.
 */
export function createTreadTexture(renderer) {
  const w = 128, h = 256, canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = '#25292c'; g.fillRect(0, 0, w, h);
  let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rand() < .5 ? '255,255,255' : '0,0,0'},${.03 + rand() * .05})`; g.fillRect(rand() * w, rand() * h, 2, 2); }
  // Worn centre track where the load rides.
  const wear = g.createLinearGradient(0, 0, w, 0);
  wear.addColorStop(0, 'rgba(0,0,0,.25)'); wear.addColorStop(.2, 'rgba(255,255,255,0)'); wear.addColorStop(.5, 'rgba(255,255,255,.05)'); wear.addColorStop(.8, 'rgba(255,255,255,0)'); wear.addColorStop(1, 'rgba(0,0,0,.25)');
  g.fillStyle = wear; g.fillRect(0, 0, w, h);
  // Cleats: a raised lip catching light on the leading side and a shadow behind it.
  for (let y = 0; y < h; y += h / 8) {
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(6, y + 7, w - 12, 4);
    g.fillStyle = 'rgba(190,200,205,.22)'; g.fillRect(6, y + 4, w - 12, 3);
  }
  g.strokeStyle = 'rgba(255,128,52,.32)'; g.lineWidth = 9; g.lineJoin = 'miter'; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(w * .2, h * .62); g.lineTo(w * .5, h * .42); g.lineTo(w * .8, h * .62); g.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

/** Gives every belt material in a model template the shared tread. */
export function applyTread(model, texture) {
  model?.traverse(n => {
    if (!n.isMesh) return;
    for (const m of Array.isArray(n.material) ? n.material : [n.material]) if (m.name === BELT_MATERIAL) { m.map = texture; m.color.set(0xffffff); m.needsUpdate = true; }
  });
}

/** Per-belt copy so each belt can scroll or stop on its own; copies share one GPU upload. */
export function ownTread(material, texture) {
  if (material.map !== texture) return null;
  material.map = texture.clone();
  return material.map;
}
