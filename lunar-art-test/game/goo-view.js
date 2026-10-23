import * as THREE from 'three';

const hash = (x, z, i) => { const s = Math.sin(x * 127.1 + z * 311.7 + i * 74.7) * 43758.5453; return s - Math.floor(s); };

/**
 * Breached goo on the base floor: each square a spill of glossy black mounds with a few red pustules lit from
 * inside. Squares swell in as the goo spreads and shrink away when a flare burns them. `heightAt(x, z)` gives the
 * floor under a world point.
 */
export function createGooView(scene, heightAt) {
  const group = new THREE.Group(); group.name = 'base-goo'; scene.add(group);
  const ink = new THREE.MeshPhysicalMaterial({ color: '#030304', roughness: .22, specularIntensity: .12, envMapIntensity: .3 });
  const pustule = new THREE.MeshStandardMaterial({ color: '#5a0505', emissive: '#ff1a0a', emissiveIntensity: 1.6, roughness: .3 });
  const blob = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), bead = new THREE.SphereGeometry(1, 10, 8);
  const squares = new Map();
  let time = 0;

  function makeSquare(x, z) {
    const g = new THREE.Group(), cx = x * 2, cz = z * 2, top = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(blob, ink), r = .3 + hash(x, z, i) * .4, h = .025 + hash(x, z, i + 29) * .045;
      m.position.set((hash(x, z, i + 9) - .5) * 1.5, 0, (hash(x, z, i + 19) - .5) * 1.5);
      m.scale.set(r, h, r * (.7 + hash(x, z, i + 39) * .6)); top.push([m.position.x, m.position.z, r, h]); m.rotation.y = hash(x, z, i + 49) * 6;
      m.receiveShadow = true; g.add(m);
    }
    for (let i = 0; i < 5; i++) {
      const [bx, bz, br, bh] = top[i * 2 % top.length], a = hash(x, z, i + 69) * 6.3, d = hash(x, z, i + 79) * br * .5, r = .04 + hash(x, z, i + 59) * .05;
      const m = new THREE.Mesh(bead, pustule);
      m.position.set(bx + Math.cos(a) * d, bh * .8 + r * .3, bz + Math.sin(a) * d); m.scale.setScalar(r);
      m.userData.phase = hash(x, z, i + 89) * 6; m.userData.r = r; g.add(m);
    }
    g.position.set(cx, heightAt(cx, cz) + .02, cz); g.scale.setScalar(.01);
    group.add(g);
    return { g, grow: 0, gone: false };
  }

  function update(state, dt) {
    time += dt;
    const live = new Set((state.goo?.cells ?? []).map(([x, z]) => `${x},${z}`));
    for (const key of live) if (!squares.has(key) || squares.get(key).gone) { squares.get(key)?.g.removeFromParent(); const [x, z] = key.split(',').map(Number); squares.set(key, makeSquare(x, z)); }
    for (const [key, s] of squares) {
      if (!live.has(key)) s.gone = true;
      s.grow = THREE.MathUtils.clamp(s.grow + (s.gone ? -1.2 : .5) * dt, 0, 1);
      if (s.gone && s.grow <= 0) { s.g.removeFromParent(); squares.delete(key); continue; }
      s.g.scale.set(Math.max(.01, s.grow), Math.max(.01, s.grow * (1 + .04 * Math.sin(time * 1.3 + s.g.position.x))), Math.max(.01, s.grow));
      for (const m of s.g.children) if (m.material === pustule) m.scale.setScalar(m.userData.r * (1 + .25 * Math.sin(time * 2 + m.userData.phase)));
    }
    pustule.emissiveIntensity = 1.3 + .5 * Math.sin(time * 1.7);
  }
  return {
    update,
    dispose() { group.removeFromParent(); ink.dispose(); pustule.dispose(); blob.dispose(); bead.dispose(); },
  };
}
