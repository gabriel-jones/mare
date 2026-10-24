import * as THREE from 'three';

const GRAVITY = 4.5;
const SHADES = { regolith: ['#8f877b', '#a39a8c', '#6f685f', '#b7ae9f'], ice: ['#d6efff', '#b9dcf0', '#eef8ff'] };

/**
 * Loose regolith in flight: instanced chunks on ballistic arcs. With no air on the Moon, dust doesn't billow;
 * it sprays out in clean parabolas and drops straight back down.
 */
export function createRegolithFx(parent, max = 900) {
  const geometry = new THREE.IcosahedronGeometry(1, 0), material = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.name = 'Regolith in flight';
  mesh.setColorAt(0, new THREE.Color()); parent.add(mesh);
  const bits = [], dummy = new THREE.Object3D(), color = new THREE.Color();
  const shade = kind => { const list = SHADES[kind] ?? SHADES.regolith; return list[Math.floor(Math.random() * list.length)]; };

  function spawn(x, y, z, vx, vy, vz, size, kind, { floor = -Infinity, life = 3, sink = null } = {}) {
    if (bits.length >= max) bits.shift();
    bits.push({ x, y, z, vx, vy, vz, size, floor, life, sink, age: 0, rest: 0, spin: (Math.random() - .5) * 14, rx: Math.random() * 6, ry: Math.random() * 6, color: shade(kind) });
  }

  /** A chunk lobbed from `from` to land at `to` after `time` seconds. */
  function lob(from, to, size, kind, time = .65) {
    const vy = (to.y - from.y + .5 * GRAVITY * time * time) / time;
    spawn(from.x, from.y, from.z, (to.x - from.x) / time, vy, (to.z - from.z) / time, size, kind, { life: time, sink: to.y });
  }

  /** A fan of fine grains thrown up and outward around `dir` (x, z), landing on `floor`. */
  function spray(x, y, z, dirX, dirZ, count, kind, floor, speed = 2.2) {
    for (let i = 0; i < count; i++) {
      const a = Math.atan2(dirZ, dirX) + (Math.random() - .5) * 1.6, v = speed * (.5 + Math.random() * .7);
      spawn(x + (Math.random() - .5) * .2, y, z + (Math.random() - .5) * .2, Math.cos(a) * v, 1.2 + Math.random() * 2.2, Math.sin(a) * v, .025 + Math.random() * .045, kind, { floor, life: 2.5 });
    }
  }

  function update(dt) {
    let n = 0;
    for (let i = bits.length - 1; i >= 0; i--) {
      const b = bits[i]; b.age += dt;
      if (b.rest > 0) b.rest += dt;
      else {
        b.vy -= GRAVITY * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.rx += b.spin * dt; b.ry += b.spin * .7 * dt;
        if (b.y <= b.floor) { b.y = b.floor; b.rest = 1e-6; }
      }
      // Lobbed chunks vanish into the hopper mouth; grains settle on the ground and fade into it.
      const settled = b.rest > .6 || (b.sink != null && b.age >= b.life);
      if (settled || b.age > b.life + 1) { bits.splice(i, 1); continue; }
      const shrink = b.rest > 0 ? 1 - b.rest / .6 : 1;
      dummy.position.set(b.x, b.y + b.size * .5, b.z); dummy.rotation.set(b.rx, b.ry, 0); dummy.scale.set(b.size, b.size * .75 * shrink, b.size);
      dummy.updateMatrix(); mesh.setMatrixAt(n, dummy.matrix); mesh.setColorAt(n, color.set(b.color)); n++;
    }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function dispose() { mesh.removeFromParent(); mesh.dispose(); geometry.dispose(); material.dispose(); }
  return { lob, spray, update, dispose, get active() { return bits.length; } };
}
