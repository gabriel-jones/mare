import * as THREE from 'three';

// Machine status hardware authored in Blender: a `Lamp` bulb (material "Lunar • status lamp"),
// battery `Cell1`..`Cell5` and a `Level` sight glass. Lamps sharing a state and tint share one material,
// so blinking costs nothing per machine and changing state never compiles a shader.
// A working machine shows its own work light rather than a status colour, and spills it on the ground
// around it after dark; only trouble (low, fault) switches the bulb to a warning colour.
export const LAMP_COLORS = Object.freeze({ low: '#f2b45a', fault: '#ff6a32', idle: '#56616a', off: '#1a1f22' });
// Saturated on purpose: added onto pale regolith, anything softer washes out to the same white.
const WORK = '#ffb866';
export const WORK_LIGHTS = Object.freeze({
  habitat: '#ffb45c', airlock: '#ffb45c', galley: '#ff9440', armory: '#ff6a4a',
  greenhouse: '#ff4fb8', growbed: '#ff4fb8', hydrorack: '#e04dff', verticalfarm: '#ff4fb8', mushroomtray: '#8f6bff',
  goovat: '#b45cff', xenolab: '#9a5cff', reactor: '#21e6ff', electrolyser: '#38c6ff', melter: '#3fa8ff', recycler: '#4fd0e8',
  tank: '#6fb8ff', solar: '#4b74ff', battery: '#5d63ff', fuelcell: '#7ff0ff', rtg: '#c8ff4a', thermal: '#ff6a2a', bioreactor: '#c04dff',
  mill: '#ff8a1e', processor: '#ff7a1a', hopper: '#ff9a3a', roverbay: '#ff8c3a',
  fabricator: '#ffc04a', assembler: '#ffd66a', storage: '#d9a45a', dock: '#ff5a3a',
});
const FLUIDS = { water: '#7fd6ff', regolith: '#d0a466', fuel: '#c9f2ff', goo: '#7b3cff' };
const base = name => name.replace(/\.?\d{3}$/, '');

/** Brightness 0–1 of a lamp level at time `t`: steady, slow pulse, hard blink or dark. */
export function lampBrightness(level, t) {
  if (level === 'ok') return 1;
  if (level === 'low') return .45 + .55 * (.5 + .5 * Math.sin(t * 2.4));
  if (level === 'fault') return (t * 1.6) % 1 < .55 ? 1 : .06;
  return 0;
}

const radial = stops => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [at, color] of stops) r.addColorStop(at, color);
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
};

export function createStatusLamps() {
  const glowTexture = radial([[0, '#fff'], [.22, '#ffffffaa'], [1, '#fff0']]);
  const poolTexture = radial([[0, '#ffffff99'], [.4, '#ffffff44'], [1, '#fff0']]);
  const looks = new Map();
  /** Bulb, halo and ground pool materials for one level in one tint. */
  function look(level, tint) {
    const key = level === 'ok' ? `ok:${tint}` : level;
    let l = looks.get(key);
    if (!l) {
      const color = level === 'ok' ? tint : LAMP_COLORS[level];
      l = {
        level,
        bulb: new THREE.MeshStandardMaterial({ color: '#0d1012', emissive: color, emissiveIntensity: 0, roughness: .3 }),
        glow: new THREE.SpriteMaterial({ map: glowTexture, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }),
        pool: level === 'ok' ? new THREE.MeshBasicMaterial({ map: poolTexture, color: tint, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 }) : null,
      };
      looks.set(key, l);
    }
    return l;
  }
  const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
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

  /** Takes over the status parts of one placed model; returns null when it has none. A `type` gives the
   * machine its work light and a pool of it on the ground. */
  function attach(root, type = null) {
    const lamp = [], cells = [];let level = null;
    const tint = (type && WORK_LIGHTS[type]) || WORK;
    root.traverse(n => {
      const name = base(n.name);
      if (/^Cell\d$/.test(name)) n.traverse(m => { if (m.isMesh) cells[Number(name[4]) - 1] = m; });
      if (name === 'Level') level = n;
    });
    root.traverse(n => {
      if (!n.isMesh || !/status lamp/.test(n.material?.name ?? '') || cells.includes(n)) return;
      n.geometry.computeBoundingBox();
      const glow = new THREE.Sprite(look('ok', tint).glow); glow.scale.setScalar(1.1); n.geometry.boundingBox.getCenter(glow.position); glow.renderOrder = 4;
      n.add(glow); n.castShadow = false; lamp.push({ mesh: n, glow });
    });
    if (!lamp.length) return null;
    let pool = null;
    if (type) {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      pool = new THREE.Mesh(poolGeo, look('ok', tint).pool); pool.renderOrder = 2; pool.raycast = () => {};
      pool.position.copy(root.worldToLocal(center.setY(box.min.y + .07)));
      const world = root.getWorldScale(new THREE.Vector3()), reach = Math.max(size.x, size.z) * 1.9 + 3;
      pool.scale.set(reach / world.x, 1, reach / world.z); root.add(pool);
    }
    let current = null, visible = true, cellKey = '', fluidKind = null;
    return {
      set(levelName, shown = true) {
        if (current === levelName && visible === shown) return;
        current = levelName; visible = shown;
        const l = look(levelName, tint);
        for (const p of lamp) { p.mesh.material = l.bulb; p.glow.material = l.glow; p.mesh.visible = shown; }
        // Trouble keeps the work light on the ground, so the colony's light stays the colony's.
        if (pool) pool.visible = shown && levelName !== 'off' && levelName !== 'idle';
      },
      /** Lights `fraction` of the battery cells in the lamp's colour. */
      cells(fraction, levelName) {
        if (!cells.length) return;
        const lit = Math.ceil(Math.max(0, Math.min(1, fraction)) * cells.length - 1e-6), key = `${lit}:${levelName}`;
        if (key === cellKey) return; cellKey = key;
        const on = look(levelName, tint).bulb;
        cells.forEach((c, i) => { c.material = i < lit ? on : cellOff; });
      },
      /** Fills the sight glass; `kind` picks water or regolith colouring. */
      fill(fraction, kind = 'water') {
        if (!level) return;
        level.scale.y = Math.max(.001, Math.min(1, fraction)); level.visible = fraction > .001;
        if (kind !== fluidKind) { fluidKind = kind; level.traverse(n => { if (n.isMesh) n.material = fluids[kind]; }); }
      },
    };
  }

  /** Animates every lamp state; halos and ground pools come up as the sun goes down. */
  function update(t, daylight) {
    const night = (1 - daylight) ** 1.5;
    for (const l of looks.values()) {
      const k = lampBrightness(l.level, t);
      l.bulb.emissiveIntensity = l.level === 'idle' ? .15 : l.level === 'ok' ? 1.7 : k * 3.2;
      l.glow.opacity = l.level === 'idle' || l.level === 'off' ? 0 : l.level === 'ok' ? .12 + .38 * night : k * (.9 - .55 * daylight);
      if (l.pool) l.pool.opacity = .04 + .72 * night;
    }
  }

  function dispose() {
    glowTexture.dispose(); poolTexture.dispose(); poolGeo.dispose(); cellOff.dispose();
    for (const l of looks.values()) { l.bulb.dispose(); l.glow.dispose(); l.pool?.dispose(); }
    for (const m of Object.values(fluids)) m.dispose();
  }
  return { prepare, attach, update, dispose };
}
