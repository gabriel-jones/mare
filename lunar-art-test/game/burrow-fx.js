import * as THREE from 'three';

/**
 * The ground giving way round a burrowing centipede: a crater where it dives in and a bigger one where it bursts out,
 * dirt thrown up, a line of cracking ground over the tunnel, and the earth bubbling where it is about to come up.
 * Watches each centipede's state (centipede.js) to know when. `groundAt(x, z)` is the ground in the parent's space;
 * `dim` darkens the dirt for the caves. `shake` (0–1) is how hard the camera should shake right now.
 */
export function createBurrowFx(parent, { groundAt = () => 0, dim = false } = {}) {
  const root = new THREE.Group(); root.name = 'burrow-fx'; parent.add(root);
  const craterGeo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
  { const p = craterGeo.attributes.position; for (let i = 1; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), r = .8 + .12 * Math.sin(a * 5 + 1) + .08 * Math.sin(a * 9); p.setX(i, Math.cos(a) * r); p.setZ(i, Math.sin(a) * r); } }
  const craterMat = new THREE.MeshBasicMaterial({ color: '#050506', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false });
  const CRATERS = 32, craters = new THREE.InstancedMesh(craterGeo, craterMat, CRATERS); craters.frustumCulled = false; root.add(craters);
  const holes = [...Array(CRATERS)].map(() => ({ x: 0, y: 0, z: 0, r: 1, age: 99, life: 8, spin: 0 }));
  let nextHole = 0;
  const DIRT = 500, dirtPos = new Float32Array(DIRT * 3), dirtVel = new Float32Array(DIRT * 3), dirtLife = new Float32Array(DIRT), dirtAlpha = new Float32Array(DIRT), dirtFloor = new Float32Array(DIRT);
  const dirtGeo = new THREE.BufferGeometry(); dirtGeo.setAttribute('position', new THREE.BufferAttribute(dirtPos, 3)); dirtGeo.setAttribute('aAlpha', new THREE.BufferAttribute(dirtAlpha, 1));
  const dirtMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uColor: { value: new THREE.Color(dim ? '#2c2a27' : '#77736b') }, uSize: { value: 6 * Math.min(2, devicePixelRatio || 1) } },
    vertexShader: 'uniform float uSize;attribute float aAlpha;varying float vA;void main(){vA=aAlpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=uSize*(.5+aAlpha);}',
    fragmentShader: 'uniform vec3 uColor;varying float vA;void main(){float a=smoothstep(.5,.15,length(gl_PointCoord-.5))*vA;if(a<.01)discard;gl_FragColor=vec4(uColor,a);}',
  });
  const dirt = new THREE.Points(dirtGeo, dirtMat); dirt.frustumCulled = false; root.add(dirt);
  let nextDirt = 0, shake = 0;
  const dummy = new THREE.Object3D(), seen = new Map();

  function crater(x, z, r, life = 9) { const h = holes[nextHole]; nextHole = (nextHole + 1) % CRATERS; Object.assign(h, { x, z, y: groundAt(x, z), r, age: 0, life, spin: Math.random() * 6 }); }
  function kick(x, z, n, power = 1, spread = .6) {
    const y = groundAt(x, z);
    for (let i = 0; i < n; i++) {
      const k = nextDirt; nextDirt = (nextDirt + 1) % DIRT;
      const a = Math.random() * Math.PI * 2, r = Math.random() * spread, s = (1 + Math.random() * 3) * power;
      dirtPos.set([x + Math.cos(a) * r, y + .05, z + Math.sin(a) * r], k * 3); dirtVel.set([Math.cos(a) * s * .6, (2 + Math.random() * 4) * power, Math.sin(a) * s * .6], k * 3);
      dirtLife[k] = .7 + Math.random() * .9; dirtFloor[k] = y + .02;
    }
  }

  /** `centipedes`: the simulated ones in this space. */
  function update(centipedes, dt) {
    for (const c of centipedes) {
      const was = seen.get(c) ?? { state: c.state, broke: c.broke, tunnel: 0, rumble: 0 };
      const ahead = { x: c.x + Math.sin(c.facing) * 1.2, z: c.z + Math.cos(c.facing) * 1.2 };
      if (c.state === 'dive' && was.state !== 'dive') { crater(ahead.x, ahead.z, 1.1); kick(ahead.x, ahead.z, 70, 1); shake = Math.max(shake, .25); }
      if (c.state === 'rise' && c.broke && !was.broke) { crater(c.x, c.z, 1.5, 11); kick(c.x, c.z, 160, 1.6, .9); shake = Math.max(shake, .6); }
      if (was.state === 'slam' && c.state !== 'slam') { kick(ahead.x, ahead.z, 60, .8, 1); shake = Math.max(shake, .45); }
      if (c.state === 'under') {
        // A cracking line over the tunnel, and once it has picked its spot, the ground there starts to heave.
        if ((was.tunnel -= dt) <= 0) { was.tunnel = .05; kick(c.x, c.z, 4, .35, .3); if (Math.random() < .5) crater(c.x + (Math.random() - .5) * .4, c.z + (Math.random() - .5) * .4, .35 + Math.random() * .2, 4); shake = Math.max(shake, .06); }
        const p = c.popAt;
        if (p && Math.hypot(p.x - c.x, p.z - c.z) < 5 && (was.rumble -= dt) <= 0) { was.rumble = .04; kick(p.x, p.z, 3, .3, .7); }
      }
      was.state = c.state; was.broke = c.broke; seen.set(c, was);
    }
    for (const c of seen.keys()) if (!centipedes.includes(c)) seen.delete(c);
    for (let i = 0; i < DIRT; i++) {
      if (dirtLife[i] <= 0) { dirtAlpha[i] = 0; continue; }
      dirtLife[i] -= dt; const o = i * 3; dirtVel[o + 1] -= 9 * dt;
      dirtPos[o] += dirtVel[o] * dt; dirtPos[o + 1] = Math.max(dirtFloor[i], dirtPos[o + 1] + dirtVel[o + 1] * dt); dirtPos[o + 2] += dirtVel[o + 2] * dt;
      if (dirtPos[o + 1] <= dirtFloor[i]) { dirtVel[o] *= .6; dirtVel[o + 2] *= .6; }
      dirtAlpha[i] = Math.min(1, dirtLife[i] * 2) * .85;
    }
    dirtGeo.attributes.position.needsUpdate = dirtGeo.attributes.aAlpha.needsUpdate = true;
    holes.forEach((h, i) => {
      h.age += dt; const k = h.age / h.life;
      if (k >= 1) dummy.scale.setScalar(0);
      else { const fade = k > .6 ? (1 - k) / .4 : 1; dummy.position.set(h.x, h.y + .02 + i * .0004, h.z); dummy.rotation.set(0, h.spin, 0); dummy.scale.setScalar(h.r * Math.min(1, h.age * 8) * Math.max(.05, fade)); }
      dummy.updateMatrix(); craters.setMatrixAt(i, dummy.matrix);
    });
    craters.instanceMatrix.needsUpdate = true;
    shake = Math.max(0, shake - dt * 1.5);
  }
  return {
    update,
    get shake() { return shake; },
    dispose() { root.removeFromParent(); craterGeo.dispose(); craterMat.dispose(); craters.dispose(); dirtGeo.dispose(); dirtMat.dispose(); },
  };
}
