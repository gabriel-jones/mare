import * as THREE from 'three';

// Machine status hardware authored in Blender: a `Lamp` bulb (material "Lunar • status lamp"),
// battery `Cell1`..`Cell5` and a `Level` sight glass. Every lamp in a state shares one material,
// so blinking costs nothing per machine and changing state never compiles a shader.
export const LAMP_COLORS = Object.freeze({ ok: '#58e0a0', low: '#f2b45a', fault: '#ff6a32', idle: '#56616a', off: '#1a1f22' });
const FLUIDS = { water: '#7fd6ff', regolith: '#d0a466' };
const base = name => name.replace(/\.?\d{3}$/, '');

/** Brightness 0–1 of a lamp level at time `t`: steady, slow pulse, hard blink or dark. */
export function lampBrightness(level, t) {
  if (level === 'ok') return 1;
  if (level === 'low') return .45 + .55 * (.5 + .5 * Math.sin(t * 2.4));
  if (level === 'fault') return (t * 1.6) % 1 < .55 ? 1 : .06;
  return 0;
}

export function createStatusLamps() {
  const glowTexture = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, '#fff'); r.addColorStop(.22, '#ffffffaa'); r.addColorStop(1, '#fff0');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  })();
  const bulbs = {}, glows = {};
  for (const [level, color] of Object.entries(LAMP_COLORS)) {
    bulbs[level] = new THREE.MeshStandardMaterial({ color: '#0d1012', emissive: color, emissiveIntensity: 0, roughness: .3 });
    glows[level] = new THREE.SpriteMaterial({ map: glowTexture, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
  }
  const cellOff = new THREE.MeshStandardMaterial({ color: '#121619', roughness: .4 });
  const fluids = Object.fromEntries(Object.entries(FLUIDS).map(([k, c]) => [k, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .7, roughness: .2 })]));
  const rebased = new WeakSet();

  /** Moves each Level node's pivot to its base so scaling fills it from the bottom. Call on templates. */
  function prepare(template) {
    template.traverse(node => {
      if (base(node.name) !== 'Level') return;
      node.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(node), inverse = node.matrixWorld.clone().invert();
      const bottom = new THREE.Vector3(0, box.min.y, 0).applyMatrix4(inverse).y;
      node.traverse(n => { if (n.isMesh && !rebased.has(n.geometry)) { n.geometry.translate(0, -bottom, 0); rebased.add(n.geometry); } });
      node.position.y += bottom;
    });
  }

  /** Takes over the status parts of one placed model; returns null when it has none. */
  function attach(root) {
    const lamp = [], cells = [];let level = null;
    root.traverse(n => {
      const name = base(n.name);
      if (/^Cell\d$/.test(name)) n.traverse(m => { if (m.isMesh) cells[Number(name[4]) - 1] = m; });
      if (name === 'Level') level = n;
    });
    root.traverse(n => {
      if (!n.isMesh || !/status lamp/.test(n.material?.name ?? '') || cells.includes(n)) return;
      n.geometry.computeBoundingBox();
      const glow = new THREE.Sprite(glows.ok); glow.scale.setScalar(1.5); n.geometry.boundingBox.getCenter(glow.position); glow.renderOrder = 4;
      n.add(glow); n.castShadow = false; lamp.push({ mesh: n, glow });
    });
    if (!lamp.length) return null;
    let current = null, visible = true, cellKey = '', fluidKind = null;
    return {
      set(levelName, shown = true) {
        if (current === levelName && visible === shown) return;
        current = levelName; visible = shown;
        for (const l of lamp) { l.mesh.material = bulbs[levelName]; l.glow.material = glows[levelName]; l.mesh.visible = shown; }
      },
      /** Lights `fraction` of the battery cells in the lamp's colour. */
      cells(fraction, levelName) {
        if (!cells.length) return;
        const lit = Math.ceil(Math.max(0, Math.min(1, fraction)) * cells.length - 1e-6), key = `${lit}:${levelName}`;
        if (key === cellKey) return; cellKey = key;
        cells.forEach((c, i) => { c.material = i < lit ? bulbs[levelName] : cellOff; });
      },
      /** Fills the sight glass; `kind` picks water or regolith colouring. */
      fill(fraction, kind = 'water') {
        if (!level) return;
        level.scale.y = Math.max(.001, Math.min(1, fraction)); level.visible = fraction > .001;
        if (kind !== fluidKind) { fluidKind = kind; level.traverse(n => { if (n.isMesh) n.material = fluids[kind]; }); }
      },
    };
  }

  /** Animates every lamp state; the glow is softer in daylight. */
  function update(t, daylight) {
    for (const level of Object.keys(bulbs)) {
      const k = lampBrightness(level, t);
      bulbs[level].emissiveIntensity = level === 'idle' ? .15 : k * 3.2;
      glows[level].opacity = level === 'idle' || level === 'off' ? 0 : k * (.9 - .55 * daylight);
    }
  }

  function dispose() {
    glowTexture.dispose(); cellOff.dispose();
    for (const m of [...Object.values(bulbs), ...Object.values(glows), ...Object.values(fluids)]) m.dispose();
  }
  return { prepare, attach, update, dispose };
}
