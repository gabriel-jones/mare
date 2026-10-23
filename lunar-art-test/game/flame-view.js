import * as THREE from 'three';

/**
 * The flamethrower's jet, drawn in whatever space it is added to (a cave root or the surface). Fuel leaves the nozzle
 * as a fast, tight stream that slows, swells and rolls upward as it burns: white-hot at the nozzle, orange through the
 * body, red and then soot at the tips. Particles are sized in world units, so they scale with the camera's zoom.
 * `emit(from, dir, reach, dt)` feeds the stream for a frame; `ignite(at, strength, dt)` lights a patch of fire on
 * something burning (a crawler in the jet, a nest catching); `update(dt)` moves everything.
 */
const FIRE = 900, SOOT = 200, SPEED = 11;

function points(parent, count, { additive, fragment, swell = 0 }) {
  const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3), age = new Float32Array(count), life = new Float32Array(count), size = new Float32Array(count), seed = new Float32Array(count), swells = new Float32Array(count);
  const t = new Float32Array(count).fill(2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(t, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aSwell', new THREE.BufferAttribute(swells, 1));
  const uniforms = { uScale: { value: 400 }, uSwell: { value: swell } };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms,
    vertexShader: `uniform float uScale;uniform float uSwell;attribute float aT;attribute float aSize;attribute float aSeed;attribute float aSwell;varying float vT;varying float vSeed;
      void main(){vT=aT;vSeed=aSeed;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;
      gl_PointSize=aT>1.0?0.0:aSize*(1.0+uSwell*aSwell*aT*aT)*projectionMatrix[1][1]*uScale;}`,
    fragmentShader: fragment,
  });
  const mesh = new THREE.Points(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = additive ? 6 : 5; parent.add(mesh);
  let next = 0;
  return {
    mat, uniforms,
    spawn(x, y, z, vx, vy, vz, seconds, s, swell = 1) {
      const i = next; next = (next + 1) % count;
      pos.set([x, y, z], i * 3); vel.set([vx, vy, vz], i * 3); age[i] = 0; life[i] = seconds; size[i] = s; seed[i] = Math.random(); swells[i] = swell; t[i] = 0;
      geo.attributes.aSwell.needsUpdate = true;
    },
    update(dt, { drag, lift, grow, churn = 0 }) {
      for (let i = 0; i < count; i++) {
        if (t[i] > 1) continue;
        age[i] += dt; const k = age[i] / life[i];
        if (k >= 1) { t[i] = 2; continue; }
        const o = i * 3, d = Math.exp(-drag * dt);
        vel[o] *= d; vel[o + 2] *= d; vel[o + 1] = vel[o + 1] * d + lift * dt;
        if (churn) { const c = churn * k * dt; vel[o] += (Math.random() - .5) * c; vel[o + 1] += (Math.random() - .3) * c; vel[o + 2] += (Math.random() - .5) * c; }
        pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
        // Fire that reaches the floor splashes out across it rather than sinking through.
        if (pos[o + 1] < .06) { pos[o + 1] = .06; vel[o + 1] = Math.abs(vel[o + 1]) * .2; vel[o] *= 1.04; vel[o + 2] *= 1.04; }
        size[i] *= 1 + grow * dt; t[i] = k;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aT.needsUpdate = true; geo.attributes.aSize.needsUpdate = true;
    },
    live() { let n = 0; for (let i = 0; i < count; i++) if (t[i] <= 1) n++; return n; },
    clear() { t.fill(2); geo.attributes.aT.needsUpdate = true; },
    dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}

export function createFlameJet(parent) {
  const group = new THREE.Group(); group.name = 'flame-jet'; parent.add(group);
  const fire = points(group, FIRE, {
    additive: true, swell: 6,
    fragment: `varying float vT;varying float vSeed;
      void main(){vec2 c=gl_PointCoord-.5;float r=length(c)*2.0;if(r>1.0)discard;
      float soft=1.0-r*r;soft*=soft;
      vec3 hot=vec3(1.0,.93,.7),body=vec3(1.0,.5,.12),tip=vec3(.75,.12,.03);
      vec3 col=vT<.18?mix(hot,body,vT/.18):mix(body,tip,clamp((vT-.18)/.6,0.0,1.0));
      float a=soft*(1.0-smoothstep(.55,1.0,vT))*(.8+.2*vSeed);
      gl_FragColor=vec4(col*a*1.5,a);}`,
  });
  const soot = points(group, SOOT, {
    additive: false, swell: 2,
    fragment: `varying float vT;varying float vSeed;
      void main(){vec2 c=gl_PointCoord-.5;float r=length(c)*2.0;if(r>1.0)discard;
      float a=(1.0-r)*(1.0-r)*smoothstep(0.0,.2,vT)*(1.0-vT)*.8;
      gl_FragColor=vec4(vec3(.07,.06,.055)+vSeed*.03,a);}`,
  });
  const light = new THREE.PointLight('#ff8a3a', 0, 9, 1.6); group.add(light);
  const pilot = new THREE.PointLight('#7ab8ff', 0, 1.2, 2); group.add(pilot);
  const _side = new THREE.Vector3(), _up = new THREE.Vector3(), _v = new THREE.Vector3();
  let emitClock = 0, spraying = 0, flicker = 0;

  function emit(from, dir, reach, dt) {
    spraying = .08;
    // The stream lives just long enough to reach where the jet stops (rock, or its full range).
    const life = Math.max(.12, reach / SPEED * 1.25);
    _side.set(-dir.z, 0, dir.x).normalize(); _up.crossVectors(_side, dir).normalize();
    for (emitClock += dt * 560; emitClock >= 1; emitClock--) {
      const a = Math.random() * Math.PI * 2, spread = Math.random() * .13, s = SPEED * (.85 + Math.random() * .3);
      _v.copy(dir).addScaledVector(_side, Math.cos(a) * spread).addScaledVector(_up, Math.sin(a) * spread).normalize().multiplyScalar(s);
      // Spread over the frame's travel, ending at the nozzle once this frame's update has moved them.
      const back = Math.random() * s * dt - s * dt;
      fire.spawn(from.x + _v.x / s * back, from.y + _v.y / s * back, from.z + _v.z / s * back, _v.x, _v.y, _v.z, life * (.7 + Math.random() * .5), .1 + Math.random() * .07);
      if (Math.random() < .12) soot.spawn(from.x + dir.x * reach * .6, from.y + .2, from.z + dir.z * reach * .6, dir.x * 2 + (Math.random() - .5), .8 + Math.random() * .8, dir.z * 2 + (Math.random() - .5), 1.1 + Math.random() * .7, .25 + Math.random() * .2);
    }
    light.position.copy(from).addScaledVector(dir, Math.min(reach, 5) * .55); light.position.y += .3;
  }
  function ignite(at, strength, dt) {
    for (let n = dt * 70 * strength; n > 0; n--) {
      if (n < 1 && Math.random() > n) break;
      fire.spawn(at.x + (Math.random() - .5) * .5, at.y + Math.random() * .3, at.z + (Math.random() - .5) * .5, (Math.random() - .5) * .5, 1.2 + Math.random() * 1.4, (Math.random() - .5) * .5, .35 + Math.random() * .35, .1 + Math.random() * .08, .3);
      if (Math.random() < .1) soot.spawn(at.x, at.y + .6, at.z, (Math.random() - .5) * .4, .9, (Math.random() - .5) * .4, 1.2, .3);
    }
  }
  function update(dt, { pilotAt = null } = {}) {
    const scale = (innerHeight * Math.min(2, devicePixelRatio || 1)) / 2;
    fire.uniforms.uScale.value = scale; soot.uniforms.uScale.value = scale;
    fire.update(dt, { drag: 1.6, lift: 3.2, grow: .8, churn: 40 });
    soot.update(dt, { drag: .8, lift: .9, grow: .9 });
    spraying = Math.max(0, spraying - dt); flicker += dt;
    const target = spraying > 0 ? 34 + Math.sin(flicker * 37) * 6 + Math.random() * 8 : 0;
    light.intensity += (target - light.intensity) * Math.min(1, dt * (spraying > 0 ? 30 : 9));
    // The pilot light: a small blue flame under the nozzle whenever the flamethrower is out.
    pilot.intensity = pilotAt ? 1.2 + Math.random() * .5 : 0;
    if (pilotAt) {
      pilot.position.copy(pilotAt);
      if (Math.random() < dt * 40) fire.spawn(pilotAt.x, pilotAt.y, pilotAt.z, (Math.random() - .5) * .1, .25, (Math.random() - .5) * .1, .12, .035, 0);
    }
  }
  return {
    emit, ignite, update,
    get busy() { return light.intensity > .5 || fire.live() > 0; },
    clear() { fire.clear(); soot.clear(); light.intensity = 0; spraying = 0; },
    dispose() { fire.dispose(); soot.dispose(); group.removeFromParent(); },
  };
}
