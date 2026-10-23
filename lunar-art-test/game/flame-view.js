import * as THREE from 'three';

/**
 * Fire, drawn in whatever space it is added to (a cave root, the surface's hunt group, the base floor).
 * Flames are noise-shaped tongues coloured by temperature: white-hot, yellow, orange, then deep red as they cool,
 * with soot rolling off the tips (lit warm from below while it is young), embers, a soft heat halo and scorch on the
 * floor. Particles are sized in world units, so they scale with the camera's zoom.
 *
 * `createFire(parent)` is the shared system: `blaze(key, opts)` lights (or keeps alight) a fire on something, and
 * `lick(at, size)` throws a single tongue. `createFlameJet(parent)` adds the flamethrower's stream on top:
 * `emit(from, dir, reach, dt, blocked)` feeds it for a frame. Burning fuel drips from the stream and splashes off
 * rock into puddles that burn on after the trigger is let go.
 */
const SPEED = 11, LIGHTS = 2, SCORCH = 48;

const NOISE = `
float fh(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float fn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fh(i),fh(i+vec2(1,0)),f.x),mix(fh(i+vec2(0,1)),fh(i+1.),f.x),f.y);}
float fbm(vec2 p){return fn(p)*.55+fn(p*2.07+3.1)*.3+fn(p*4.13+7.7)*.15;}`;

const VERTEX = `uniform float uScale;attribute float aT;attribute float aSize;attribute float aSeed;attribute float aHeat;
varying float vT;varying float vSeed;varying float vHeat;
void main(){vT=aT;vSeed=aSeed;vHeat=aHeat;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
 gl_PointSize=aT>1.0?0.0:max(1.5,aSize*projectionMatrix[1][1]*uScale);}`;

// Flame: a teardrop that narrows upward, torn by noise scrolling up through it. Heat sets the colour, and the
// densest middle is the hottest. Drawn premultiplied, so flame partly covers what is behind it and keeps its colour
// over lit rock. Tongues (fires burning on something) are taller and narrower than the jet's billows.
const fireFragment = tongue => `uniform float uTime;varying float vT;varying float vSeed;varying float vHeat;${NOISE}
vec3 ramp(float h){
 vec3 c=mix(vec3(.22,.015,0.),vec3(.9,.16,.015),smoothstep(0.,.3,h));
 c=mix(c,vec3(1.,.48,.08),smoothstep(.28,.55,h));
 c=mix(c,vec3(1.,.8,.4),smoothstep(.55,.82,h));
 c=mix(c,vec3(1.,.97,.9),smoothstep(.84,1.,h));
 return c*(.3+1.1*h*h);
}
void main(){
 vec2 q=(gl_PointCoord-.5)*2.;q.y=-q.y;
 float t=uTime*3.2+vSeed*31.;
 vec2 w=vec2(fbm(q*1.3+vec2(vSeed*9.,-t)),fbm(q*1.3+vec2(t*.6,vSeed*5.)))-.5;
 vec2 d=q+w*${tongue ? 'vec2(1.4,1.5)' : 'vec2(.9,1.2)'};
 ${tongue ? 'd.x*=1.4;d.y=d.y*.66+.26;' : 'd.y=d.y*.85+.12;'}d.x/=mix(1.05,.5,clamp(d.y*.5+.5,0.,1.));
 float shape=(1.-smoothstep(0.,1.,length(d)))*(1.-smoothstep(.6,.98,max(abs(q.x),abs(q.y))));
 float n=fbm(q*2.4+vec2(vSeed*3.,-t*1.7));
 float dens=clamp((shape*(.35+1.5*n)-.12)*1.6,0.,1.);dens*=dens*(3.-2.*dens);
 float a=dens*(1.-smoothstep(${tongue ? '.15' : '.6'},1.,vT))*smoothstep(0.,.04,vT);
 if(a<.004)discard;
 float h=clamp(vHeat*(.3+.9*dens),0.,1.);
 gl_FragColor=vec4(ramp(h)*a*.75,a*(.08+.3*(1.-h)));
}`;

// Soot: billows that roll as they rise, warm underneath while the fire is still below them.
const SOOT = `uniform float uTime;varying float vT;varying float vSeed;varying float vHeat;${NOISE}
void main(){
 vec2 q=(gl_PointCoord-.5)*2.;q.y=-q.y;
 float t=uTime*.5+vSeed*17.,n=fbm(q*1.4+vec2(vSeed*7.,-t)),m=fbm(q*3.1+vec2(-t,vSeed));
 float dens=(1.-smoothstep(.15,1.,length(q)+(n-.5)*.9))*(1.-smoothstep(.7,.98,length(q)));
 float a=dens*smoothstep(0.,.2,vT)*(1.-vT)*(.55+.45*m)*.5;
 if(a<.004)discard;
 vec3 c=mix(vec3(.018,.016,.014),vec3(.085,.07,.06),m)+vec3(1.,.32,.06)*vHeat*smoothstep(.4,-.9,q.y)*dens*.6;
 gl_FragColor=vec4(c,a);
}`;

const EMBER = `uniform float uTime;varying float vT;varying float vSeed;varying float vHeat;
void main(){
 float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
 float a=(1.-r)*(1.-r)*(1.-vT)*(.6+.4*sin(uTime*31.+vSeed*60.));
 gl_FragColor=vec4(mix(vec3(1.,.62,.22),vec3(1.,.2,.03),vT)*(1.25-vT*.6)*a,a);
}`;

const HALO = `varying float vT;varying float vSeed;varying float vHeat;
void main(){
 float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
 float a=pow(1.-r,2.2)*vHeat*.16;
 gl_FragColor=vec4(vec3(1.,.42,.1)*a,a);
}`;

function layer(parent, count, { fragment, blend, order, uniforms }) {
  const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3), from = new Float32Array(count * 3), dir = new Float32Array(count * 3);
  const age = new Float32Array(count), life = new Float32Array(count), base = new Float32Array(count), swell = new Float32Array(count);
  const heat0 = new Float32Array(count), cool = new Float32Array(count), drag = new Float32Array(count), buoy = new Float32Array(count), grav = new Float32Array(count), churn = new Float32Array(count), stop = new Float32Array(count);
  const t = new Float32Array(count).fill(2), size = new Float32Array(count), seed = new Float32Array(count), heat = new Float32Array(count);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(t, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aHeat', new THREE.BufferAttribute(heat, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, premultipliedAlpha: blend === 'premultiplied',
    blending: blend === 'additive' ? THREE.AdditiveBlending : blend === 'premultiplied' ? THREE.CustomBlending : THREE.NormalBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms, vertexShader: VERTEX, fragmentShader: fragment,
  });
  const mesh = new THREE.Points(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = order; parent.add(mesh);
  let next = 0, live = 0;
  return {
    /** `o`: life, size, swell (growth over life; negative tapers), heat, cool (how fast heat falls), drag, buoy
     * (lift gained as it ages), grav (fall while young), churn, and for the jet `stop`/`dir`: where rock turns it. */
    spawn(x, y, z, vx, vy, vz, o) {
      const i = next; next = (next + 1) % count;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
      age[i] = 0; life[i] = o.life; base[i] = o.size; size[i] = o.size; swell[i] = o.swell ?? 0; heat0[i] = o.heat ?? 1; heat[i] = heat0[i]; cool[i] = o.cool ?? 1;
      drag[i] = o.drag ?? 1; buoy[i] = o.buoy ?? 0; grav[i] = o.grav ?? 0; churn[i] = o.churn ?? 0; seed[i] = Math.random(); t[i] = 0;
      stop[i] = o.stop ?? 0;
      if (o.stop) { from[i * 3] = o.from.x; from[i * 3 + 1] = o.from.y; from[i * 3 + 2] = o.from.z; dir[i * 3] = o.dir.x; dir[i * 3 + 1] = o.dir.y; dir[i * 3 + 2] = o.dir.z; }
    },
    update(dt, floor) {
      live = 0;
      for (let i = 0; i < count; i++) {
        if (t[i] > 1) continue;
        age[i] += dt; const k = age[i] / life[i];
        if (k >= 1) { t[i] = 2; continue; }
        live++;
        const o = i * 3, d = Math.exp(-drag[i] * dt);
        vel[o] *= d; vel[o + 2] *= d; vel[o + 1] = vel[o + 1] * d + (buoy[i] * k - grav[i] * (1 - k)) * dt;
        if (churn[i]) { const c = churn[i] * k * dt; vel[o] += (Math.random() - .5) * c; vel[o + 1] += (Math.random() - .35) * c; vel[o + 2] += (Math.random() - .5) * c; }
        pos[o] += vel[o] * dt; pos[o + 1] += vel[o + 1] * dt; pos[o + 2] += vel[o + 2] * dt;
        // Fire that reaches rock splashes out across it and climbs, rather than vanishing into it.
        if (stop[i] > 0 && (pos[o] - from[o]) * dir[o] + (pos[o + 2] - from[o + 2]) * dir[o + 2] > stop[i]) {
          stop[i] = 0; const s = Math.hypot(vel[o], vel[o + 2]), a = Math.random() * Math.PI * 2;
          vel[o] = -dir[o] * s * .15 + Math.cos(a) * s * .45; vel[o + 2] = -dir[o + 2] * s * .15 + Math.sin(a) * s * .45; vel[o + 1] = Math.abs(vel[o + 1]) + s * (.2 + Math.random() * .35);
          base[i] *= 1.3;
        }
        if (pos[o + 1] < floor) { pos[o + 1] = floor; vel[o + 1] = Math.abs(vel[o + 1]) * .2; vel[o] *= 1.05; vel[o + 2] *= 1.05; }
        const sw = swell[i];
        size[i] = base[i] * (sw >= 0 ? 1 + sw * Math.pow(k, 1.4) : 1 + sw * k);
        heat[i] = heat0[i] * Math.pow(1 - k, cool[i]); t[i] = k;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.aT.needsUpdate = true; geo.attributes.aSize.needsUpdate = true; geo.attributes.aHeat.needsUpdate = true;
    },
    get live() { return live; },
    clear() { t.fill(2); live = 0; geo.attributes.aT.needsUpdate = true; },
    dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}

/** Scorch left on the floor where fuel burnt or something burnt out: a ragged dark stain that fades over a minute. */
function scorches(parent) {
  const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const offset = new Float32Array(SCORCH * 4), fade = new Float32Array(SCORCH);
  geo.setAttribute('aSpot', new THREE.InstancedBufferAttribute(offset, 4));
  geo.setAttribute('aFade', new THREE.InstancedBufferAttribute(fade, 1));
  geo.instanceCount = SCORCH;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `attribute vec4 aSpot;attribute float aFade;varying vec2 vUv;varying float vFade;varying float vSeed;
      void main(){vUv=uv;vFade=aFade;vSeed=aSpot.w;vec3 p=position*aSpot.z+vec3(aSpot.x,0.,aSpot.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv;varying float vFade;varying float vSeed;${NOISE}
      void main(){vec2 q=(vUv-.5)*2.;float n=fbm(q*2.2+vSeed*40.);float r=length(q)+(n-.5)*.7;
       float a=(1.-smoothstep(.2,.95,r))*vFade*(.55+.45*fbm(q*6.+vSeed*9.));if(a<.01)discard;
       gl_FragColor=vec4(vec3(.012,.01,.009),a*.75);}`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 1; parent.add(mesh);
  const born = new Float32Array(SCORCH).fill(-1e9), full = new Float32Array(SCORCH);
  let next = 0, clock = 0;
  return {
    mark(x, y, z, r) {
      // A fresh mark close to an old one just darkens and spreads that one.
      for (let i = 0; i < SCORCH; i++) if (fade[i] > 0 && Math.hypot(offset[i * 4] - x, offset[i * 4 + 1] - z) < r * .5) { full[i] = Math.min(1, full[i] + .15); offset[i * 4 + 2] = Math.min(r * 2.4, offset[i * 4 + 2] + r * .08); born[i] = clock; return; }
      const i = next; next = (next + 1) % SCORCH;
      offset.set([x, z, r * 2, Math.random()], i * 4); full[i] = .35; born[i] = clock; mesh.position.y = y;
      geo.attributes.aSpot.needsUpdate = true;
    },
    update(dt) {
      clock += dt;
      for (let i = 0; i < SCORCH; i++) fade[i] = Math.max(0, full[i] * (1 - Math.max(0, clock - born[i] - 40) / 20));
      geo.attributes.aFade.needsUpdate = true; geo.attributes.aSpot.needsUpdate = true;
    },
    clear() { fade.fill(0); full.fill(0); geo.attributes.aFade.needsUpdate = true; },
    dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); },
  };
}

export function createFire(parent, { lights = LIGHTS, floor: ground = .04 } = {}) {
  let floor = ground;
  const group = new THREE.Group(); group.name = 'fire'; parent.add(group);
  const uTime = { value: 0 }, uScale = { value: 400 }, shared = { uTime, uScale };
  const flames = layer(group, 1800, { fragment: fireFragment(false), blend: 'premultiplied', order: 6, uniforms: shared });
  const tongues = layer(group, 1400, { fragment: fireFragment(true), blend: 'premultiplied', order: 6, uniforms: shared });
  const soot = layer(group, 420, { fragment: SOOT, blend: 'normal', order: 4, uniforms: shared });
  const embers = layer(group, 500, { fragment: EMBER, blend: 'additive', order: 8, uniforms: shared });
  const halos = layer(group, 90, { fragment: HALO, blend: 'additive', order: 5, uniforms: shared });
  const scorch = scorches(group);
  const pool = Array.from({ length: lights }, () => { const l = new THREE.PointLight('#ff7a2a', 0, 9, 1.6); group.add(l); return l; });
  const blazes = new Map(), glows = [], at = new THREE.Vector3();

  /** A single flame tongue at `p`, `size` metres across, licking upward. */
  function lick(p, size = .25, heat = .95, rise = 1.6) {
    tongues.spawn(p.x + (Math.random() - .5) * size * .4, p.y, p.z + (Math.random() - .5) * size * .4, (Math.random() - .5) * .5, rise * (.7 + Math.random() * .6), (Math.random() - .5) * .5,
      { life: .35 + Math.random() * .35, size: size * (.8 + Math.random() * .6), swell: -.2, heat, cool: 1.3, drag: 2.2, buoy: 3, churn: 14 });
  }
  function ember(p, spread = .3, up = 2.5) {
    embers.spawn(p.x + (Math.random() - .5) * spread, p.y, p.z + (Math.random() - .5) * spread, (Math.random() - .5) * 2.4, up * (.4 + Math.random()), (Math.random() - .5) * 2.4,
      { life: .6 + Math.random() * 1.1, size: .025 + Math.random() * .025, drag: 1.2, grav: 4, buoy: -1, churn: 18 });
  }
  function puff(p, size = .35, warm = .8, rise = 1) {
    soot.spawn(p.x + (Math.random() - .5) * size, p.y, p.z + (Math.random() - .5) * size, (Math.random() - .5) * .5, rise * (.6 + Math.random() * .7), (Math.random() - .5) * .5,
      { life: 1.6 + Math.random() * 1.2, size: size * (.7 + Math.random() * .6), swell: 2.6, heat: warm, cool: 2.5, drag: .9, buoy: .5, churn: 5 });
  }
  function halo(p, size, heat) { halos.spawn(p.x, p.y, p.z, 0, 0, 0, { life: .07, size, heat }); }

  /**
   * Light or keep alight a fire keyed by `key`. Calling again with the same key keeps it burning (its life restarts).
   * `points`: where it burns (Vector3s, or a function giving them each frame, null once the thing is gone);
   * `radius` spreads it around each point, `height` is how tall it licks, `strength` how fierce, `life` seconds.
   */
  function blaze(key, o) {
    let b = blazes.get(key);
    if (!b) { b = { age: 0, clock: [0, 0, 0], radius: .3, height: 1, strength: 1, life: 1, smoke: 1, scorch: 0 }; blazes.set(key, b); }
    else b.age = Math.min(b.age, .15);
    Object.assign(b, o);
    return b;
  }

  function update(dt, extra = []) {
    uTime.value += dt;
    uScale.value = (innerHeight * Math.min(2, devicePixelRatio || 1)) / 2;
    glows.length = 0; glows.push(...extra);
    for (const [key, b] of blazes) {
      b.age += dt;
      const pts = typeof b.points === 'function' ? b.points() : b.points;
      if (!pts?.length || b.age >= b.life) { if (pts?.length && b.scorch) for (const p of pts) scorch.mark(p.x, floor - .03, p.z, b.radius * b.scorch); blazes.delete(key); continue; }
      const env = b.strength * Math.min(1, b.age / .15) * (1 - THREE.MathUtils.smoothstep(b.age, b.life * .55, b.life));
      const tongues = dt * env * 60 * (.5 + b.radius * 1.6) * Math.min(3, Math.sqrt(pts.length)), r = b.radius;
      for (b.clock[0] += tongues; b.clock[0] >= 1; b.clock[0]--) {
        const p = pts[Math.floor(Math.random() * pts.length)], a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
        at.set(p.x + Math.cos(a) * d, p.y + Math.random() * .08, p.z + Math.sin(a) * d);
        lick(at, (.24 + r * .8) * (.7 + .5 * Math.min(1.5, env)), .5 + .25 * Math.min(1, env), b.height * 1.8);
      }
      // Big fires roll: fireballs boil up out of the tongues and climb, cooling to soot.
      if (b.billow) for (b.clock[3] = (b.clock[3] ?? 0) + dt * env * b.billow * 18; b.clock[3] >= 1; b.clock[3]--) {
        const p = pts[Math.floor(Math.random() * pts.length)];
        flames.spawn(p.x + (Math.random() - .5) * r, p.y + b.height * .2, p.z + (Math.random() - .5) * r, (Math.random() - .5) * .6, b.height * (1.2 + Math.random()), (Math.random() - .5) * .6,
          { life: .7 + Math.random() * .6, size: (.25 + r * .6) * (.8 + Math.random() * .5), swell: 2.2, heat: .85 + Math.random() * .15, cool: 1.5, drag: 1.4, buoy: 2.5, churn: 10 });
      }
      for (b.clock[1] += dt * env * 16 * Math.min(2, pts.length / 3 + .5); b.clock[1] >= 1; b.clock[1]--) ember(pts[Math.floor(Math.random() * pts.length)], r, 1.5 + b.height * 1.5);
      for (b.clock[2] += dt * env * 7 * b.smoke * (.6 + r); b.clock[2] >= 1; b.clock[2]--) {
        const p = pts[Math.floor(Math.random() * pts.length)]; at.set(p.x, p.y + b.height * .75, p.z); puff(at, .3 + r * .8, .9, .8 + b.height * .6);
      }
      // The heat bloom and the light: from the middle of what burns.
      at.set(0, 0, 0); for (const p of pts) at.add(p); at.divideScalar(pts.length); at.y += b.height * .35;
      if (env > .05) halo(at, (1 + r * 2.5 + b.height * .6) * Math.sqrt(Math.min(2, env)), Math.min(1.2, env));
      if (b.scorch && Math.random() < dt * 2) scorch.mark(at.x, floor - .03, at.z, r * b.scorch);
      glows.push({ x: at.x, y: at.y, z: at.z, strength: env * (.5 + r + b.height * .3) });
    }
    flames.update(dt, floor); tongues.update(dt, floor); soot.update(dt, floor); embers.update(dt, floor); halos.update(dt, floor); scorch.update(dt);
    // The brightest fires get the lights, flickering.
    glows.sort((a, b) => b.strength - a.strength);
    pool.forEach((l, i) => {
      const g = glows[i], target = g ? 16 * Math.min(3, g.strength) * (.8 + Math.random() * .35) : 0;
      if (g) l.position.set(g.x, g.y + .3, g.z);
      l.intensity += (target - l.intensity) * Math.min(1, dt * 25);
    });
  }

  return {
    group, blaze, lick, ember, puff, halo, update, scorch: (x, z, r) => scorch.mark(x, floor - .03, z, r), flames,
    /** The fires lighting their surroundings this frame, brightest first: { x, y, z, strength }. */
    get glows() { return glows; },
    set floor(y) { floor = y; },
    get burning() { return blazes.size > 0 || flames.live > 0 || tongues.live > 0 || soot.live > 0; },
    clear() { blazes.clear(); flames.clear(); tongues.clear(); soot.clear(); embers.clear(); halos.clear(); scorch.clear(); pool.forEach(l => { l.intensity = 0; }); },
    dispose() { flames.dispose(); tongues.dispose(); soot.dispose(); embers.dispose(); halos.dispose(); scorch.dispose(); group.removeFromParent(); },
  };
}

export function createFlameJet(parent) {
  const fire = createFire(parent), group = fire.group;
  const pilot = new THREE.PointLight('#7ab8ff', 0, 1.2, 2); group.add(pilot);
  const _side = new THREE.Vector3(), _up = new THREE.Vector3(), _v = new THREE.Vector3(), _p = new THREE.Vector3(), mid = new THREE.Vector3();
  let clocks = [0, 0, 0, 0], spraying = 0, drip = 0, drips = 0;

  /** Feed the stream for a frame from the nozzle along `dir`. `reach` is where it stops; `blocked` when rock stops it. */
  function emit(from, dir, reach, dt, blocked = false) {
    spraying = .1;
    const life = Math.max(.12, reach / SPEED * 1.15), stop = blocked ? Math.max(.3, reach - .35) : 0;
    _side.set(-dir.z, 0, dir.x).normalize(); _up.crossVectors(_side, dir).normalize();
    // The stream: lit fuel leaving the nozzle as a tight rod that slows, swells, rolls upward and tears into tongues.
    for (clocks[0] += dt * 400; clocks[0] >= 1; clocks[0]--) {
      const a = Math.random() * Math.PI * 2, spread = Math.random() * .1, s = SPEED * (.85 + Math.random() * .3);
      _v.copy(dir).addScaledVector(_side, Math.cos(a) * spread).addScaledVector(_up, Math.sin(a) * spread).normalize().multiplyScalar(s);
      const back = Math.random() * s * dt - s * dt;
      fire.flames.spawn(from.x + _v.x / s * back, from.y + _v.y / s * back, from.z + _v.z / s * back, _v.x, _v.y, _v.z,
        { life: life * (.75 + Math.random() * .5), size: .05 + Math.random() * .05, swell: 15 + Math.random() * 10, heat: .9 + Math.random() * .1, cool: 1.3, drag: .95, buoy: 5, grav: 2, churn: 40, stop, from, dir });
    }
    // The rod itself: a white-hot thread for the first metre.
    for (clocks[1] += dt * 700; clocks[1] >= 1; clocks[1]--) {
      const s = SPEED * (.95 + Math.random() * .1), back = Math.random() * s * dt - s * dt;
      fire.flames.spawn(from.x + dir.x * back, from.y + dir.y * back, from.z + dir.z * back, dir.x * s, dir.y * s, dir.z * s,
        { life: .07 + Math.random() * .07, size: .05 + Math.random() * .03, swell: 3, heat: 1, cool: .3, drag: .5 });
    }
    // Soot rolling off the burning body, and embers flung out of it.
    for (clocks[2] += dt * 16; clocks[2] >= 1; clocks[2]--) { const k = .7 + Math.random() * .3; _p.copy(from).addScaledVector(dir, reach * k); _p.y += .25 + k * .4; fire.puff(_p, .35 + k * .3, .9, 1.4); }
    for (clocks[3] += dt * 50; clocks[3] >= 1; clocks[3]--) { _p.copy(from).addScaledVector(dir, reach * (.3 + Math.random() * .7)); fire.ember(_p, .5, 2.5); }
    // Heat bloom along the stream.
    for (const k of [.25, .55, .85]) { _p.copy(from).addScaledVector(dir, reach * k); _p.y += k * .35; fire.halo(_p, 1.4 + k * 2.4, 1); }
    // Burning fuel falls out of the stream and splashes against rock, burning on where it lands.
    drip += dt;
    if (drip > (blocked ? .09 : .16)) {
      drip = 0; const k = blocked ? 1 : .55 + Math.random() * .45;
      _p.copy(from).addScaledVector(dir, reach * k - (blocked ? .25 : 0)).addScaledVector(_side, (Math.random() - .5) * .6 * k);
      const r = .22 + Math.random() * .16;
      fire.blaze(`drip${drips++ % 14}`, { points: [new THREE.Vector3(_p.x, .04, _p.z)], radius: r, height: .45 + Math.random() * .3, strength: .55 + Math.random() * .35, life: 2 + Math.random() * 1.6, smoke: .6, scorch: 1.1 });
    }
    mid.copy(from).addScaledVector(dir, Math.min(reach, 5) * .55); mid.y += .3;
  }

  function update(dt, { pilotAt = null } = {}) {
    spraying = Math.max(0, spraying - dt);
    fire.update(dt, spraying > 0 ? [{ x: mid.x, y: mid.y, z: mid.z, strength: 1.6 }] : []);
    // The pilot light: a small blue flame under the nozzle whenever the flamethrower is out.
    pilot.intensity = pilotAt ? 1.2 + Math.random() * .5 : 0;
    if (pilotAt) {
      pilot.position.copy(pilotAt);
      if (Math.random() < dt * 40) fire.flames.spawn(pilotAt.x, pilotAt.y, pilotAt.z, (Math.random() - .5) * .1, .25, (Math.random() - .5) * .1, { life: .12, size: .035, heat: .7, cool: 1.5 });
    }
  }
  return {
    emit, update, blaze: fire.blaze, lick: fire.lick, ember: fire.ember, puff: fire.puff, fire,
    get glows() { return fire.glows; },
    get busy() { return spraying > 0 || fire.burning; },
    clear() { fire.clear(); spraying = 0; },
    dispose() { fire.dispose(); },
  };
}
