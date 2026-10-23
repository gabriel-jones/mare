import * as THREE from 'three';

/**
 * Procedural solar system for the orbital view. Surfaces are baked once on the GPU from 3D noise into
 * equirectangular maps (so there are no seams), then lit by a point light at the Sun.
 * Distances and sizes are compressed; the Moon has radius 1 and everything else is scaled around it.
 */
export const BODIES = [
  { id: 'sun', name: 'Sun', kicker: 'Star', radius: 26, orbit: 0, facts: [['Type', 'G2V main-sequence star'], ['Radius', '696,000 km'], ['Surface', '5,500 °C']] },
  { id: 'mercury', name: 'Mercury', kicker: 'Planet', radius: 1.4, orbit: 150, phase: 1.1, spin: .005, facts: [['Radius', '2,440 km'], ['From the Sun', '0.39 AU'], ['Day', '176 Earth days']] },
  { id: 'venus', name: 'Venus', kicker: 'Planet', radius: 3.4, orbit: 210, phase: 3.9, spin: -.004, facts: [['Radius', '6,052 km'], ['From the Sun', '0.72 AU'], ['Surface', '464 °C under CO₂ clouds']] },
  { id: 'earth', name: 'Earth', kicker: 'Planet', radius: 3.67, orbit: 295, phase: .4, maxScale: 1.9, spin: .05, tilt: .41, facts: [['Radius', '6,371 km'], ['From the Sun', '1 AU'], ['The Moon', '384,400 km away']] },
  { id: 'moon', name: 'Moon', kicker: 'Your colony', radius: 1, orbit: 14, parent: 'earth', maxScale: 3.5, phase: 2.2, facts: [['Radius', '1,737 km'], ['Gravity', '1.62 m/s²'], ['Day', '29.5 Earth days']] },
  { id: 'mars', name: 'Mars', kicker: 'Planet', radius: 1.95, orbit: 390, phase: 5.2, spin: .05, tilt: .44, facts: [['Radius', '3,390 km'], ['From the Sun', '1.52 AU'], ['Day', '24 h 37 min']] },
  { id: 'belt', name: 'Asteroid belt', kicker: 'Ceres and the main belt', radius: 1.2, orbit: 500, phase: 2.9, spin: .1, facts: [['Span', '2.2 – 3.2 AU'], ['Largest', 'Ceres, 473 km'], ['Asteroids', 'over a million above 1 km']] },
  { id: 'jupiter', name: 'Jupiter', kicker: 'Gas giant', radius: 16, orbit: 700, phase: 4.6, spin: .12, tilt: .05, facts: [['Radius', '69,911 km'], ['From the Sun', '5.2 AU'], ['Moons', '95 known']] },
  { id: 'saturn', name: 'Saturn', kicker: 'Gas giant', radius: 13.5, orbit: 920, phase: .9, spin: .11, tilt: .47, facts: [['Radius', '58,232 km'], ['From the Sun', '9.5 AU'], ['Rings', '282,000 km across']] },
  { id: 'uranus', name: 'Uranus', kicker: 'Ice giant', radius: 6.5, orbit: 1120, phase: 3.3, spin: -.07, tilt: 1.71, facts: [['Radius', '25,362 km'], ['From the Sun', '19.2 AU'], ['Axial tilt', '98°']] },
  { id: 'neptune', name: 'Neptune', kicker: 'Ice giant', radius: 6.3, orbit: 1300, phase: 5.8, spin: .08, tilt: .49, facts: [['Radius', '24,622 km'], ['From the Sun', '30.1 AU'], ['Winds', '2,100 km/h']] },
];
const EARTH_ORBIT = 295, EARTH_SPEED = .004, MOON_SPEED = .03;
/** Kepler's third law, compressed: inner planets lap the outer ones. */
const orbitSpeed = b => b.parent ? MOON_SPEED : EARTH_SPEED * Math.pow(EARTH_ORBIT / b.orbit, 1.5);

const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float f=0.,a=.5;for(int i=0;i<6;i++){f+=a*snoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return f;}
float fbm3(vec3 p){float f=0.,a=.5;for(int i=0;i<3;i++){f+=a*snoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return f;}
vec3 hash33(vec3 p3){p3=fract(p3*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yxz+33.33);return fract((p3.xxy+p3.yxx)*p3.zyx);}
vec3 srgb(vec3 c){return pow(c,vec3(2.2));}
`;

const BAKE_VERT = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
// Maps a texel to the direction SphereGeometry gives that uv, so noise sampled on the sphere has no seam.
const BAKE_HEAD = NOISE + `
varying vec2 vUv;uniform int uMode;uniform float uSeed;
vec3 dirFromUv(vec2 uv){float phi=uv.x*6.28318530718;float th=(1.-uv.y)*3.14159265359;return vec3(-cos(phi)*sin(th),cos(th),sin(phi)*sin(th));}
`;

/** Moon, Mercury, Mars and Ceres: maria, layered craters with raised rims, optional dust and ice caps. */
const ROCKY = BAKE_HEAD + `
uniform vec3 uHi,uLo;uniform float uMaria,uCrater,uCaps,uDust;
float craterLayer(vec3 p){
  vec3 i=floor(p),f=fract(p);float h=0.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
    vec3 o=vec3(x,y,z),r=hash33(i+o);
    if(r.z>.5)continue;
    vec3 c=o+.15+.7*hash33(i+o+19.7);
    float rad=.16+.32*r.x*r.x;
    float t=length(f-c)/rad;
    if(t>2.)continue;
    float bowl=t<1.?max(t*t-1.,-.7):0.;
    float rim=.32*exp(-(t-1.)*(t-1.)*14.);
    h+=(bowl+rim)*rad;
  }
  return h;
}
void main(){
  vec3 d=dirFromUv(vUv),s=vec3(7.1,3.3,5.9)*uSeed;
  vec3 warp=vec3(fbm3(d*1.4+s),fbm3(d*1.4+s+4.1),fbm3(d*1.4+s+8.3));
  float mn=fbm3(d*.9+warp*.35+s)+fbm3(d*5.+s)*.06;
  float m=smoothstep(-.06,.12,mn-uMaria)*(.85+.15*fbm3(d*9.+s));
  float c1=craterLayer(d*2.5+s),c2=craterLayer(d*6.+s),c3=craterLayer(d*14.+s),c4=craterLayer(d*32.+s),c5=craterLayer(d*70.+s),c6=craterLayer(d*150.+s);
  float c=c1*1.2*(1.-.8*m)+c2*.6*(1.-.5*m)+c3*.3+c4*.14+c5*.06+c6*.025;
  float h=fbm(d*3.+s)*.12-m*.08+c*uCrater*.35;
  if(uMode==1){gl_FragColor=vec4(h,0.,0.,1.);return;}
  vec3 col=mix(uHi,uLo,m*.92);
  col*=1.+fbm(d*18.+s)*.16+fbm3(d*60.+s)*.06;
  // Fresh small craters are bright, older large floors are dark.
  col*=1.+clamp((c4*.9+c5*.7+c6*.5)*uCrater,-.15,.35)+clamp(c1*.5*uCrater,-.12,.06);
  col=mix(col,col*vec3(1.18,.92,.74),uDust*smoothstep(-.2,.4,fbm(d*4.+s.zxy)));
  float cap=uCaps*smoothstep(.84,.88,abs(d.y)+fbm(d*7.)*.05);
  col=mix(col,srgb(vec3(.9,.9,.92)),cap);
  gl_FragColor=vec4(col,1.);
}`;

/** Earth: warped continents with climate bands, ice caps, ocean roughness, clouds and city lights. */
const EARTH = BAKE_HEAD + `
void main(){
  vec3 d=dirFromUv(vUv),s=vec3(2.3,7.7,4.1)*uSeed;
  float lat=asin(clamp(d.y,-1.,1.));
  if(uMode==2){
    vec3 w=vec3(fbm3(d*2.+3.),fbm3(d*2.+7.),fbm3(d*2.+11.));
    float c=fbm(d*3.2+w*1.3)+.16*cos(lat*6.)-.08+fbm3(d*14.+w)*.12;
    float cl=smoothstep(.04,.38,c)*.92;
    gl_FragColor=vec4(vec3(cl),1.);return;
  }
  vec3 w=vec3(fbm3(d*1.3+1.7),fbm3(d*1.3+9.2),fbm3(d*1.3+4.4));
  float n=fbm(d*1.5+w*.7+s)+.18*fbm(d*5.+s);
  float land=smoothstep(.07,.09,n);
  float ice=smoothstep(.8,.84,abs(d.y)+.06*fbm(d*6.));
  float desert=exp(-pow((abs(lat)-.4)/.16,2.))*smoothstep(-.2,.3,fbm3(d*3.+s.yzx));
  float e=clamp((n-.08)*3.,0.,1.)+fbm(d*12.)*.12;
  if(uMode==3){
    float city=smoothstep(.6,.9,snoise(d*70.)*.5+.5)+smoothstep(.65,.95,snoise(d*160.)*.5+.5)*.7;
    city*=smoothstep(-.1,.35,fbm3(d*5.+s));
    city*=land*(1.-ice)*(1.-desert*.85)*(.5+.9*(1.-smoothstep(.09,.22,n)));
    gl_FragColor=vec4(srgb(vec3(1.,.74,.42))*city,1.);return;
  }
  if(uMode==1){gl_FragColor=vec4(land*e*.5+ice*.08,mix(mix(.32,.92,land),.55,ice),0.,1.);return;}
  vec3 forest=srgb(vec3(.17,.27,.12)),grass=srgb(vec3(.36,.43,.22)),sand=srgb(vec3(.76,.64,.44)),rock=srgb(vec3(.42,.36,.29)),tundra=srgb(vec3(.47,.46,.4));
  vec3 lc=mix(forest,grass,smoothstep(-.3,.3,fbm3(d*6.+s)));
  lc=mix(lc,sand,clamp(desert*1.3,0.,1.));
  lc=mix(lc,tundra,smoothstep(.95,1.15,abs(lat)));
  lc=mix(lc,rock,smoothstep(.45,.85,e));
  vec3 ocean=mix(srgb(vec3(.08,.32,.45)),srgb(vec3(.02,.09,.22)),smoothstep(0.,.12,.08-n));
  vec3 col=mix(ocean,lc,land);
  col=mix(col,srgb(vec3(.93,.95,.97)),ice);
  gl_FragColor=vec4(col,1.);
}`;

/** Venus and the giants: latitude bands bent by turbulence, plus an optional storm oval. */
const GAS = BAKE_HEAD + `
uniform vec3 uC1,uC2,uC3,uSpotCol;uniform float uBands,uTurb,uSpot;
void main(){
  vec3 d=dirFromUv(vUv),s=vec3(5.3,1.9,8.7)*uSeed;
  float lat=asin(clamp(d.y,-1.,1.)),lon=atan(d.z,-d.x);
  float w=fbm(d*vec3(2.,8.,2.)+s)*uTurb+fbm3(d*vec3(6.,26.,6.)+s)*uTurb*.35;
  float b=sin(lat*uBands+w*4.)*.5+.5,b2=sin(lat*uBands*2.7+w*7.+1.3)*.5+.5;
  vec3 col=mix(uC1,uC2,smoothstep(.2,.8,b));
  col=mix(col,uC3,smoothstep(.55,.95,b2)*.6);
  vec2 sp=vec2(lon-1.2,lat+.39);sp.x=mod(sp.x+3.14159,6.28318)-3.14159;
  float sd=length(sp*vec2(1.,2.2)/.16)+fbm3(d*20.)*.3;
  col=mix(col,uSpotCol,uSpot*(1.-smoothstep(.6,1.,sd)));
  col*=1.+fbm3(d*30.+s)*.05;
  col=mix(col,uC2*.9,smoothstep(1.05,1.4,abs(lat)+fbm3(d*8.+s)*.08));
  gl_FragColor=vec4(col,1.);
}`;

/** Milky Way band with dust lanes and a brighter bulge, for the background sphere. */
const SKY = BAKE_HEAD + `
void main(){
  vec3 d=dirFromUv(vUv),n=normalize(vec3(.3,.9,.3));
  float b=dot(d,n);
  float band=exp(-b*b*14.)*(.55+.45*fbm(d*3.+2.));
  float core=exp(-b*b*60.)*(.5+.5*fbm(d*6.));
  float dust=smoothstep(0.,.5,fbm(d*7.+5.))*exp(-b*b*120.);
  vec3 col=(srgb(vec3(.42,.46,.6))*band*.022+srgb(vec3(.85,.78,.65))*core*.035)*(1.-dust*.85);
  col*=1.+1.6*pow(max(dot(d,normalize(vec3(.8,-.2,.55))),0.),6.);
  gl_FragColor=vec4(col,1.);
}`;

const LIT_VERT = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vWN;varying vec3 vWP;varying vec2 vUv;varying vec3 vObj;
void main(){vUv=uv;vObj=position;vWN=normalize(mat3(modelMatrix)*normal);vec4 wp=modelMatrix*vec4(position,1.);vWP=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;
#include <logdepthbuf_vertex>
}`;
const FRAG_HEAD = '#include <common>\n#include <logdepthbuf_pars_fragment>\nvarying vec3 vWN;varying vec3 vWP;varying vec2 vUv;varying vec3 vObj;\n';

const SUN_FRAG = FRAG_HEAD + NOISE + `
uniform float uTime;
void main(){
  #include <logdepthbuf_fragment>
  vec3 p=normalize(vObj);
  float big=fbm3(p*3.+vec3(0.,uTime*.02,0.));
  float gran=(snoise(p*38.+uTime*.15)*.5+.5)*.6+(snoise(p*90.-uTime*.1)*.5+.5)*.4;
  float spots=smoothstep(.5,.65,fbm3(p*5.+11.));
  vec3 col=mix(vec3(1.,.24,.02),vec3(1.,.6,.24),clamp(big*.5+gran*.9-.2,0.,1.));
  col*=1.-spots*.7;
  float mu=max(dot(normalize(vWN),normalize(cameraPosition-vWP)),0.);
  // Limb darkening; the disc centre is bright enough to bloom, the edge is not.
  gl_FragColor=vec4(col*(.25+.75*pow(mu,.6))*2.6,1.);
}`;

/**
 * Atmosphere glow. The front shell hazes the limb; the larger back shell glows outside it and fades to zero
 * at its own silhouette, so there is no hard edge. Both are lit by the Sun at the point nearest the view ray.
 */
const ATMO_FRAG = FRAG_HEAD + `
uniform vec3 uColor,uCenter;uniform float uEdge,uPower,uIntensity,uBack;
void main(){
  #include <logdepthbuf_fragment>
  vec3 V=normalize(cameraPosition-vWP),N=normalize(vWN);
  float f=uBack>.5?pow(clamp(dot(-N,V)/uEdge,0.,1.),uPower):pow(1.-max(dot(N,V),0.),uPower);
  vec3 ray=-V,q=cameraPosition+ray*dot(uCenter-cameraPosition,ray);
  float lit=smoothstep(-.35,.45,dot(normalize(q-uCenter),normalize(-uCenter)));
  gl_FragColor=vec4(uColor*f*lit*uIntensity,1.);
}`;

const LIGHTS_FRAG = FRAG_HEAD + `
uniform sampler2D uLights;
void main(){
  #include <logdepthbuf_fragment>
  float night=smoothstep(.08,-.22,dot(normalize(vWN),normalize(-vWP)));
  gl_FragColor=vec4(texture2D(uLights,vUv).rgb*night*2.4,1.);
}`;

/** Ring particles: lit from either face, and dark where the planet blocks the Sun. */
const RING_FRAG = FRAG_HEAD + `
uniform sampler2D uMap;uniform vec3 uCenter;uniform float uRadius;
void main(){
  #include <logdepthbuf_fragment>
  vec4 t=texture2D(uMap,vUv);
  vec3 L=normalize(-vWP),oc=vWP-uCenter;
  float b=dot(oc,L),h=b*b-dot(oc,oc)+uRadius*uRadius;
  float shadow=b<0.?smoothstep(-.02,.02,h/(uRadius*uRadius)):0.;
  float lit=(.45+.55*abs(dot(normalize(vWN),L)))*(1.-.94*shadow);
  gl_FragColor=vec4(t.rgb*lit*.85,t.a);
}`;

export function createSolarSystem(renderer) {
  const disposables = [];
  const keep = x => (disposables.push(x), x);
  const root = new THREE.Group();
  const anisotropy = renderer.capabilities.getMaxAnisotropy();

  const bakeScene = new THREE.Scene(), bakeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; bakeScene.add(quad);
  /** Renders a bake shader into an equirectangular map. Colours are written linear. */
  function bake(fragmentShader, uniforms, mode, width, half = false) {
    const rt = keep(new THREE.WebGLRenderTarget(width, width / 2, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: false }));
    Object.assign(rt.texture, { wrapS: THREE.RepeatWrapping, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true, anisotropy });
    const material = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader, uniforms: { uMode: { value: mode }, uSeed: { value: 0 }, ...uniforms } });
    quad.material = material;
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(rt); renderer.render(bakeScene, bakeCamera); renderer.setRenderTarget(previous);
    material.dispose();
    return rt.texture;
  }
  const u = values => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: typeof v === 'string' ? new THREE.Color(v) : v }]));
  const sphere = (r, w = 96) => keep(new THREE.SphereGeometry(r, w, w / 2));

  const bodies = new Map(), pickables = [], lines = [];
  const centers = [];
  function addBody(def, mesh, spinMesh = mesh) {
    const anchor = new THREE.Group(), tilt = new THREE.Group();
    tilt.rotation.z = def.tilt ?? 0; anchor.add(tilt); tilt.add(mesh);
    mesh.userData.body = def.id; pickables.push(mesh);
    const body = { def, anchor, tilt, mesh: spinMesh, center: new THREE.Vector3(), scale: 1, speed: def.orbit ? orbitSpeed(def) : 0 };
    bodies.set(def.id, body);
    return body;
  }
  function atmosphere(body, color, { inner = 2.6, outer = 3, intensity = 1, thickness = 1.06 } = {}) {
    const r = body.def.radius, edge = Math.sqrt(1 - 1 / (thickness * thickness));
    for (const back of [0, 1]) {
      const material = keep(new THREE.ShaderMaterial({
        vertexShader: LIT_VERT, fragmentShader: ATMO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: back ? THREE.BackSide : THREE.FrontSide,
        uniforms: { ...u({ uColor: color, uEdge: edge, uPower: back ? outer : inner, uIntensity: intensity * (back ? 1 : .8), uBack: back }), uCenter: { value: body.center } },
      }));
      body.anchor.add(new THREE.Mesh(sphere(r * (back ? thickness : 1.004), 64), material));
    }
  }
  const def = id => BODIES.find(b => b.id === id);

  // Sun: animated photosphere, a corona sprite and the only light in the system.
  const sunMaterial = keep(new THREE.ShaderMaterial({ vertexShader: LIT_VERT, fragmentShader: SUN_FRAG, uniforms: { uTime: { value: 0 } } }));
  const sun = addBody(def('sun'), new THREE.Mesh(sphere(26, 96), sunMaterial));
  const glow = document.createElement('canvas'); glow.width = glow.height = 256;
  const gg = glow.getContext('2d'), grad = gg.createRadialGradient(128, 128, 0, 128, 128, 128);
  [[0, 'rgba(255,240,215,1)'], [.18, 'rgba(255,214,150,.55)'], [.4, 'rgba(255,170,90,.16)'], [.7, 'rgba(255,140,60,.04)'], [1, 'rgba(255,120,40,0)']].forEach(([o, c]) => grad.addColorStop(o, c));
  gg.fillStyle = grad; gg.fillRect(0, 0, 256, 256);
  const corona = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: keep(new THREE.CanvasTexture(glow)), color: new THREE.Color(1.3, 1.1, .9), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })));
  corona.scale.setScalar(26 * 3.2); sun.anchor.add(corona);
  root.add(new THREE.PointLight('#fff4e6', 2.8, 0, 0), new THREE.AmbientLight('#8090b0', .025));

  function rocky(id, params, width, bump) {
    const uniforms = u({ uSeed: params.seed, uHi: params.hi, uLo: params.lo, uMaria: params.maria, uCrater: params.crater, uCaps: params.caps ?? 0, uDust: params.dust ?? 0 });
    const material = keep(new THREE.MeshStandardMaterial({ map: bake(ROCKY, uniforms, 0, width), bumpMap: bake(ROCKY, uniforms, 1, width, true), bumpScale: bump, roughness: 1, metalness: 0 }));
    return addBody(def(id), new THREE.Mesh(sphere(def(id).radius, width >= 2048 ? 160 : 96), material));
  }
  const moon = rocky('moon', { seed: 1, hi: '#a9a59d', lo: '#4f4f52', maria: .22, crater: 1 }, 2048, 7);
  rocky('mercury', { seed: 2, hi: '#968b80', lo: '#6a625a', maria: .55, crater: 1.2 }, 1024, 5);
  const mars = rocky('mars', { seed: 3, hi: '#c06a3e', lo: '#5e3424', maria: .05, crater: .4, caps: 1, dust: 1 }, 1024, 3);
  atmosphere(mars, '#e8a27a', { intensity: .35, thickness: 1.04, outer: 4 });
  const ceres = rocky('belt', { seed: 4, hi: '#77736d', lo: '#4c4946', maria: .6, crater: 1.1 }, 1024, 5);

  // Earth: surface with glossy oceans, city lights on the night side, drifting clouds and a blue limb.
  const earthMaterial = keep(new THREE.MeshStandardMaterial({ map: bake(EARTH, {}, 0, 2048), roughness: 1, metalness: 0, bumpScale: 1.2 }));
  earthMaterial.bumpMap = earthMaterial.roughnessMap = bake(EARTH, {}, 1, 2048, true);
  const earth = addBody(def('earth'), new THREE.Mesh(sphere(3.67, 160), earthMaterial));
  earth.mesh.add(new THREE.Mesh(sphere(3.67 * 1.001, 128), keep(new THREE.ShaderMaterial({
    vertexShader: LIT_VERT, fragmentShader: LIGHTS_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uLights: { value: bake(EARTH, {}, 3, 2048) } },
  }))));
  const clouds = new THREE.Mesh(sphere(3.67 * 1.008, 128), keep(new THREE.MeshStandardMaterial({ color: '#ffffff', alphaMap: bake(EARTH, {}, 2, 2048), transparent: true, depthWrite: false, roughness: 1 })));
  earth.tilt.add(clouds);
  atmosphere(earth, '#5d9cff', { intensity: 1.4 });

  function gas(id, params, width = 1024) {
    const uniforms = u({ uSeed: params.seed, uC1: params.c1, uC2: params.c2, uC3: params.c3, uSpotCol: params.spotColor ?? '#000000', uBands: params.bands, uTurb: params.turb, uSpot: params.spot ?? 0 });
    return addBody(def(id), new THREE.Mesh(sphere(def(id).radius, 128), keep(new THREE.MeshStandardMaterial({ map: bake(GAS, uniforms, 0, width), roughness: .9, metalness: 0 }))));
  }
  const venus = gas('venus', { seed: 5, c1: '#e6cf9c', c2: '#c69d62', c3: '#f2e3bf', bands: 6, turb: 1.4 });
  atmosphere(venus, '#ffd9a0', { intensity: .9, thickness: 1.05 });
  const jupiter = gas('jupiter', { seed: 6, c1: '#dcc9a8', c2: '#a8734b', c3: '#efe3cc', bands: 17, turb: .7, spot: 1, spotColor: '#b4553a' }, 2048);
  atmosphere(jupiter, '#e8d2b0', { intensity: .5, thickness: 1.03, outer: 4 });
  const saturn = gas('saturn', { seed: 7, c1: '#e0cc9c', c2: '#cdb07c', c3: '#ebdcb4', bands: 24, turb: .06 }, 2048);
  atmosphere(saturn, '#f0dcae', { intensity: .45, thickness: 1.03, outer: 4 });
  const uranus = gas('uranus', { seed: 8, c1: '#a7dbe0', c2: '#8fc7d2', c3: '#bfe6ea', bands: 9, turb: .2 });
  atmosphere(uranus, '#9fe3ff', { intensity: .8, thickness: 1.04 });
  const neptune = gas('neptune', { seed: 9, c1: '#4269cc', c2: '#2c47a0', c3: '#6a8de6', bands: 11, turb: .6, spot: .8, spotColor: '#1d2c6e' });
  atmosphere(neptune, '#6f9cff', { intensity: 1, thickness: 1.04 });

  // Saturn's rings: radial density profile with the Cassini division, mapped by distance from the planet.
  const ringCanvas = document.createElement('canvas'); ringCanvas.width = 1024; ringCanvas.height = 1;
  const rc = ringCanvas.getContext('2d'), ringData = rc.createImageData(1024, 1);
  // Radii in Saturn radii: C ring 1.24–1.53, B ring 1.53–1.95, Cassini division, A ring 2.03–2.27 with the Encke gap.
  for (let x = 0; x < 1024; x++) {
    const r = 1.24 + x / 1023 * 1.06;
    const fine = .78 + .1 * Math.sin(r * 410) * Math.sin(r * 133) + .06 * Math.sin(r * 1270) + .1 * Math.sin(r * 61 + 1) * Math.sin(r * 17);
    const [a, base] = r < 1.53 ? [.22 + .1 * (r - 1.24) / .29, [150, 136, 118]] : r < 1.95 ? [.88, [226, 208, 174]] : r < 2.03 ? [.06, [120, 110, 96]]
      : r < 2.27 ? [Math.abs(r - 2.214) < .005 ? .05 : .6, [196, 184, 162]] : [Math.max(0, .12 - (r - 2.27) * 4), [170, 160, 145]];
    ringData.data.set([...base.map(c => Math.min(255, c * (.9 + .1 * fine))), Math.max(0, Math.min(1, a * fine)) * 255], x * 4);
  }
  rc.putImageData(ringData, 0, 0);
  const ringTexture = keep(new THREE.CanvasTexture(ringCanvas)); ringTexture.colorSpace = THREE.SRGBColorSpace;
  const ringGeometry = keep(new THREE.RingGeometry(13.5 * 1.24, 13.5 * 2.3, 256, 1)), ringUv = ringGeometry.attributes.uv, v = new THREE.Vector3();
  for (let i = 0; i < ringUv.count; i++) { v.fromBufferAttribute(ringGeometry.attributes.position, i); ringUv.setXY(i, (v.length() - 13.5 * 1.24) / (13.5 * 1.06), .5); }
  const ringMaterial = keep(new THREE.ShaderMaterial({ vertexShader: LIT_VERT, fragmentShader: RING_FRAG, transparent: true, side: THREE.DoubleSide, depthWrite: false, uniforms: { uMap: { value: ringTexture }, uCenter: { value: saturn.center }, uRadius: { value: 13.5 } } }));
  const rings = new THREE.Mesh(ringGeometry, ringMaterial);
  rings.rotation.x = -Math.PI / 2; saturn.tilt.add(rings);

  // Main belt: instanced faceted rocks for close-ups, plus dust points so it reads from the system view.
  const belt = new THREE.Group(); root.add(belt);
  const rock = keep(new THREE.IcosahedronGeometry(1, 1)), rp = rock.attributes.position;
  for (let i = 0; i < rp.count; i++) { v.fromBufferAttribute(rp, i); v.multiplyScalar(1 + .28 * Math.sin(v.x * 3.1 + v.y * 1.7) * Math.cos(v.z * 2.3 - v.x)); rp.setXYZ(i, v.x, v.y, v.z); }
  rock.computeVertexNormals();
  let seed = 11; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ROCKS = 2600, rocks = new THREE.InstancedMesh(rock, keep(new THREE.MeshStandardMaterial({ color: '#8a8178', roughness: 1, flatShading: true })), ROCKS);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3();
  const ceresAngle = def('belt').phase;
  for (let i = 0; i < ROCKS; i++) {
    // Close to half of the rocks crowd around Ceres, which is where the belt view looks.
    const local = i % 2 === 0, a = local ? ceresAngle + (rand() - .5) * .14 : rand() * Math.PI * 2;
    const r = local ? 500 + (rand() - .5) * 60 : 455 + rand() * 90, size = .05 + Math.pow(rand(), 5) * .6;
    v.set(Math.cos(a) * r, (rand() + rand() - 1) * (local ? 7 : 9), Math.sin(a) * r);
    m4.compose(v, q.setFromEuler(e.set(rand() * 6, rand() * 6, rand() * 6)), sc.set(size * (.7 + rand() * .6), size * (.6 + rand() * .5), size * (.7 + rand() * .6)));
    rocks.setMatrixAt(i, m4);
  }
  belt.add(rocks);
  const dust = new Float32Array(30000 * 3);
  for (let i = 0; i < 30000; i++) { const a = rand() * Math.PI * 2, r = 450 + (rand() + rand()) * 50; dust.set([Math.cos(a) * r, (rand() + rand() - 1) * 10, Math.sin(a) * r], i * 3); }
  const dustGeometry = keep(new THREE.BufferGeometry()); dustGeometry.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  belt.add(new THREE.Points(dustGeometry, keep(new THREE.PointsMaterial({ color: '#a39684', size: 1.3, sizeAttenuation: false, transparent: true, opacity: .3, depthWrite: false }))));

  // Every body except the Sun and Ceres hangs off the root; Ceres rides with the belt.
  for (const body of bodies.values()) (body === ceres ? belt : root).add(body.anchor);
  ceres.anchor.position.set(Math.cos(ceresAngle) * 500, 0, Math.sin(ceresAngle) * 500);
  const beltSpeed = orbitSpeed(def('belt'));

  // Orbit lines in the ecliptic, plus the Moon's around Earth.
  const lineMaterial = keep(new THREE.LineBasicMaterial({ color: '#8fc4ff', transparent: true, opacity: .14, depthWrite: false }));
  const circle = radius => keep(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 256 }, (_, i) => { const a = i / 256 * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius); })));
  for (const b of BODIES) if (b.orbit && !b.parent && b.id !== 'belt') { const line = new THREE.LineLoop(circle(b.orbit), lineMaterial); root.add(line); lines.push(line); }
  const moonLine = new THREE.LineLoop(circle(14), lineMaterial); root.add(moonLine);

  // Sky: Milky Way sphere and two star layers, re-centred on the camera every frame.
  const sky = new THREE.Group();
  const skyMesh = new THREE.Mesh(sphere(15000, 64), keep(new THREE.MeshBasicMaterial({ map: bake(SKY, {}, 0, 2048, true), side: THREE.BackSide, depthWrite: false })));
  skyMesh.renderOrder = -2; sky.add(skyMesh);
  for (const [count, size, bright] of [[6000, 1.1, 1], [450, 2, 2.6]]) {
    const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      v.randomDirection().multiplyScalar(14000); positions.set([v.x, v.y, v.z], i * 3);
      const k = (.25 + .75 * Math.pow(rand(), 3)) * bright, warm = rand();
      colors.set([k * (warm > .7 ? 1 : .82), k * .9, k * (warm < .3 ? 1.1 : .78)], i * 3);
    }
    const geometry = keep(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(geometry, keep(new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, depthWrite: false })));
    stars.renderOrder = -1; sky.add(stars);
  }
  root.add(sky);

  // The Moon keeps one face to Earth; the colony and orbital network ride in a frame that does not spin.
  const moonFrame = new THREE.Group(); moon.anchor.add(moonFrame);
  const toEarth = new THREE.Vector3();

  return {
    root, bodies, pickables, moonFrame, moonMesh: moon.mesh,
    update(time) {
      sunMaterial.uniforms.uTime.value = time;
      for (const body of bodies.values()) {
        const d = body.def;
        if (d.orbit && body !== ceres) {
          const a = d.phase + time * body.speed;
          body.anchor.position.set(Math.cos(a) * d.orbit, d.parent ? Math.sin(a) * .09 * d.orbit : 0, Math.sin(a) * d.orbit);
          if (d.parent) body.anchor.position.add(bodies.get(d.parent).anchor.position);
        }
        if (d.spin) body.mesh.rotation.y = time * d.spin;
      }
      belt.rotation.y = -time * beltSpeed;
      clouds.rotation.y = time * .056;
      moonLine.position.copy(earth.anchor.position);
      // Tidal lock: the Moon's -Z face (where the colony sits) always looks at Earth.
      moon.mesh.lookAt(toEarth.copy(earth.anchor.position));
      moon.mesh.rotateY(Math.PI);
      root.updateMatrixWorld();
      for (const body of bodies.values()) body.anchor.getWorldPosition(body.center);
    },
    /**
     * Places the sky on the camera and keeps every body at least `minPx` pixels in radius, so the system view
     * reads like a map while close-ups stay true to scale.
     */
    followCamera(camera, viewportHeight, minPx = 2.5) {
      sky.position.copy(camera.position);
      const pxPerUnit = viewportHeight / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      for (const body of bodies.values()) {
        const d = camera.position.distanceTo(body.center);
        body.scale = Math.min(body.def.maxScale ?? Infinity, Math.max(1, minPx * d / (body.def.radius * pxPerUnit)));
        body.anchor.scale.setScalar(body.scale);
      }
      ringMaterial.uniforms.uRadius.value = 13.5 * saturn.scale;
    },
    /** Fades orbit lines as the camera closes in on a body. */
    setLineOpacity(opacity) { lineMaterial.opacity = opacity; },
    dispose() { quad.geometry.dispose(); disposables.forEach(d => d.dispose()); },
  };
}
