import * as THREE from 'three';

// The Starship's three bell exits, in its own frame.
export const ENGINE_EXITS = [0, Math.PI * 2 / 3, Math.PI * 4 / 3].map(a => new THREE.Vector3(.7 * Math.cos(a), .48, -.7 * Math.sin(a)));
const DUST = 2600, DUST_REACH = 30, GRAVITY = 1.62;

const noise = /* glsl */`
  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
`;

/**
 * Engine plumes, the glare where they meet the ground, and the dust they throw. Each plume is an open cone whose
 * shader scrolls turbulence down its length and burns from white at the nozzle through amber to nothing. Dust is
 * billboarded puffs: on the Moon it flies out flat and fast, in sheets, with no air to hold it up.
 */
export function createLaunchFx(scene, { heightAt }) {
  const disposables = [];
  const keep = x => (disposables.push(x), x);
  const time = { value: 0 }, throttle = { value: 0 };

  const plumeGeo = keep(new THREE.CylinderGeometry(.24, 1.15, 1, 18, 12, true).translate(0, -.5, 0));
  const plumeMat = (core) => keep(new THREE.ShaderMaterial({
    uniforms: { uTime: time, uThrottle: throttle, uCore: { value: core } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `${noise}
      uniform float uTime,uThrottle;varying float vAlong;varying vec3 vNormal;varying vec3 vView;varying float vAngle;
      void main(){
        vAlong=-position.y;vAngle=atan(position.z,position.x);
        vec3 p=position;
        float wobble=noise(vec2(vAngle*2.,vAlong*6.-uTime*18.))-.5;
        p.xz*=1.+wobble*.35*vAlong;
        vec4 mv=modelViewMatrix*vec4(p,1.);vView=-mv.xyz;vNormal=normalMatrix*normal;
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: `${noise}
      uniform float uTime,uThrottle,uCore;varying float vAlong;varying vec3 vNormal;varying vec3 vView;varying float vAngle;
      void main(){
        float facing=abs(dot(normalize(vNormal),normalize(vView)));
        float streak=noise(vec2(vAngle*3.,vAlong*9.-uTime*26.));
        float fade=pow(1.-vAlong,1.6)*smoothstep(0.,.06,vAlong+.02);
        vec3 hot=mix(vec3(1.,.97,.86),vec3(1.,.72,.32),smoothstep(.0,.35,vAlong));
        vec3 col=mix(hot,vec3(.95,.36,.08),smoothstep(.3,.9,vAlong));
        float a=clamp(fade*(.45+.55*streak)*mix(facing,1.,uCore)*uThrottle*1.5,0.,1.);
        gl_FragColor=vec4(col*(1.2+uCore*.8),a);
      }`,
  }));
  const outer = plumeMat(0), core = plumeMat(1);
  const glowTex = keep(radial([[0, 'rgba(255,248,225,1)'], [.25, 'rgba(255,196,110,.75)'], [.6, 'rgba(255,120,40,.18)'], [1, 'rgba(255,90,20,0)']]));
  const splashMat = keep(new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  const splash = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), splashMat);
  splash.renderOrder = 3; scene.add(splash);
  // A soft burn mark where the engines fire: streaks fanning out over the regolith, darkest underneath.
  const scorchMat = keep(new THREE.MeshBasicMaterial({ map: keep(scorchTexture()), color: '#1b1714', transparent: true, depthWrite: false, opacity: .7, polygonOffset: true, polygonOffsetFactor: -2 }));
  const scorch = new THREE.Mesh(keep(new THREE.PlaneGeometry(16, 16).rotateX(-Math.PI / 2)), scorchMat);
  scorch.renderOrder = 1; scene.add(scorch);

  let rig = null;
  /** Hangs the plumes and glare under a ship model, at its bell exits. */
  function attach(ship, exits = ENGINE_EXITS) {
    rig = { ship, plumes: [], glows: [], light: new THREE.PointLight('#ffa04a', 0, 60, 1.6) };
    for (const exit of exits) {
      const outerMesh = new THREE.Mesh(plumeGeo, outer), coreMesh = new THREE.Mesh(plumeGeo, core);
      outerMesh.position.copy(exit); coreMesh.position.copy(exit); coreMesh.renderOrder = outerMesh.renderOrder = 4;
      const glow = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      glow.position.copy(exit).add(new THREE.Vector3(0, -.25, 0)); glow.renderOrder = 5;
      ship.add(outerMesh, coreMesh, glow); rig.plumes.push(outerMesh, coreMesh); rig.glows.push(glow);
    }
    rig.light.position.set(0, -1.5, 0); ship.add(rig.light);
  }

  // Dust puffs: billboards from one instanced quad, each with its own position, size, alpha and tint.
  const dustGeo = new THREE.InstancedBufferGeometry();
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0], 3));
  dustGeo.setIndex([0, 1, 2, 0, 2, 3]);
  const offset = new THREE.InstancedBufferAttribute(new Float32Array(DUST * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const look = new THREE.InstancedBufferAttribute(new Float32Array(DUST * 3), 3).setUsage(THREE.DynamicDrawUsage); // size, alpha, glow
  dustGeo.setAttribute('offset', offset); dustGeo.setAttribute('look', look); dustGeo.instanceCount = 0; keep(dustGeo);
  const dustColor = { value: new THREE.Color('#b8afa2') };
  const dustMat = keep(new THREE.ShaderMaterial({
    uniforms: { uColor: dustColor, uTime: time },
    transparent: true, depthWrite: false,
    vertexShader: `attribute vec3 offset,look;varying vec2 vUv;varying float vAlpha,vGlow;
      void main(){vUv=position.xy+.5;vAlpha=look.y;vGlow=look.z;vec4 mv=modelViewMatrix*vec4(offset,1.);mv.xy+=position.xy*look.x;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `${noise}uniform vec3 uColor;varying vec2 vUv;varying float vAlpha,vGlow;
      void main(){vec2 d=vUv-.5;float r=length(d)*2.;float puff=smoothstep(1.,.2,r)*(.75+.25*noise(vUv*5.+vAlpha*9.));
      vec3 col=mix(uColor*mix(.62,1.12,vUv.y+d.x*.3),vec3(1.,.62,.3),vGlow);gl_FragColor=vec4(col,puff*vAlpha);if(gl_FragColor.a<.01)discard;}`,
  }));
  const dust = new THREE.Mesh(dustGeo, dustMat); dust.frustumCulled = false; dust.renderOrder = 2; scene.add(dust);
  const P = { x: new Float32Array(DUST), y: new Float32Array(DUST), z: new Float32Array(DUST), vx: new Float32Array(DUST), vy: new Float32Array(DUST), vz: new Float32Array(DUST), age: new Float32Array(DUST), life: new Float32Array(DUST), size: new Float32Array(DUST), grow: new Float32Array(DUST) };
  let live = 0, owed = 0;
  function spawn(cx, cz, ground, strength) {
    if (live >= DUST) return;
    const i = live++, a = Math.random() * Math.PI * 2, r = .6 + Math.random() * 2.2;
    const lofted = Math.random() < .25, speed = (5 + Math.random() * 13) * (.5 + .5 * strength);
    P.x[i] = cx + Math.cos(a) * r; P.z[i] = cz + Math.sin(a) * r; P.y[i] = ground + .1 + Math.random() * .3;
    P.vx[i] = Math.cos(a) * speed; P.vz[i] = Math.sin(a) * speed;
    // Most of it skims out in a low sheet; some is thrown up off the plates and rocks.
    P.vy[i] = lofted ? 2.5 + Math.random() * 5 : .2 + Math.random() * 1.6;
    P.age[i] = 0; P.life[i] = lofted ? 2.5 + Math.random() * 2 : 1.8 + Math.random() * 2.2;
    P.size[i] = .9 + Math.random() * .9; P.grow[i] = lofted ? 1.6 : 2.4 + Math.random() * 1.8;
  }

  /**
   * `ship` is the ship's world position (its feet), `altitude` above the pad, `thrust` 0..1, `light` the daylight
   * level for the dust's own shade, and `ground` the pad's height.
   */
  function update(dt, { ship, altitude, thrust, daylight = 1, ground = 0 }) {
    time.value += dt;
    throttle.value = thrust > 0 ? thrust * (.92 + Math.random() * .16) : 0;
    const firing = thrust > .01;
    if (rig) {
      // A plume reaches 7–9 m in free flight; near the ground it flattens out where it hits.
      const reach = (6.5 + 2.5 * thrust) * (.95 + Math.random() * .1), room = Math.max(.6, altitude + .35);
      const length = Math.min(reach, room), spread = 1 + Math.max(0, 1 - room / reach) * 1.6;
      rig.plumes.forEach((m, i) => { m.visible = firing; const core = i % 2; m.scale.set(spread * (core ? .45 : 1), length * (core ? .55 : 1), spread * (core ? .45 : 1)); });
      rig.glows.forEach(g => { g.visible = firing; g.scale.setScalar(2.2 + thrust * 1.6 + Math.random() * .4); g.material.opacity = thrust; });
      rig.light.intensity = firing ? (90 + Math.random() * 40) * thrust : 0;
    }
    // Where the plume meets the ground it spreads into a flat glare.
    const near = firing ? Math.max(0, 1 - altitude / 14) : 0;
    splash.visible = near > 0; splashMat.opacity = near * thrust * (.75 + Math.random() * .25);
    scorch.position.set(ship.x, ground + .03, ship.z);
    splash.position.set(ship.x, ground + .06, ship.z); splash.scale.setScalar(5 + near * 7);
    // Dust leaves the ground while the plume can reach it, harder the lower the ship.
    const blast = firing ? Math.max(0, 1 - altitude / DUST_REACH) : 0;
    owed += blast ** 1.2 * thrust * 1300 * dt;
    for (; owed >= 1; owed--) spawn(ship.x, ship.z, ground, blast);
    dustColor.value.setRGB(.24 + .66 * daylight, .23 + .64 * daylight, .22 + .6 * daylight);
    for (let i = 0; i < live; i++) {
      P.age[i] += dt;
      if (P.age[i] >= P.life[i]) {
        live--; for (const k in P) P[k][i] = P[k][live]; i--; continue;
      }
      P.vy[i] -= GRAVITY * dt;
      const drag = Math.exp(-.8 * dt); P.vx[i] *= drag; P.vz[i] *= drag;
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
      const floor = heightAt(P.x[i], P.z[i]) + .15;
      if (P.y[i] < floor) { P.y[i] = floor; P.vy[i] = 0; const scrub = Math.exp(-1.8 * dt); P.vx[i] *= scrub; P.vz[i] *= scrub; }
      const t = P.age[i] / P.life[i], hot = Math.max(0, 1 - Math.hypot(P.x[i] - ship.x, P.z[i] - ship.z) / 6) * near;
      offset.array[i * 3] = P.x[i]; offset.array[i * 3 + 1] = P.y[i]; offset.array[i * 3 + 2] = P.z[i];
      look.array[i * 3] = P.size[i] * (1 + t * P.grow[i]); look.array[i * 3 + 1] = Math.min(1, P.age[i] * 6) * (1 - t) ** 1.3 * .8; look.array[i * 3 + 2] = hot * .8;
    }
    dustGeo.instanceCount = live; offset.needsUpdate = true; look.needsUpdate = true;
  }

  function dispose() {
    scene.remove(dust, splash, scorch);
    if (rig) { for (const m of [...rig.plumes, ...rig.glows, rig.light]) m.removeFromParent(); }
    disposables.forEach(d => d.dispose());
  }
  return { attach, update, dispose, get particles() { return live; } };
}

function scorchTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), mid = 256;
  const core = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
  core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(.22, 'rgba(255,255,255,.75)'); core.addColorStop(.5, 'rgba(255,255,255,.22)'); core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core; g.fillRect(0, 0, 512, 512);
  let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, reach = mid * (.35 + rand() * .6), width = .015 + rand() * .035;
    const streak = g.createRadialGradient(mid, mid, mid * .08, mid, mid, reach);
    streak.addColorStop(0, `rgba(255,255,255,${.16 + rand() * .2})`); streak.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = streak; g.beginPath(); g.moveTo(mid, mid); g.arc(mid, mid, reach, a - width, a + width); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function radial(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
