import * as THREE from 'three';
import {SIGHT_PARS} from './cave-view.js';
import {CRAWLER} from './crawler.js';
import {HORROR} from './horror.js';

/**
 * What hunts on Mars (horror.js), drawn: a heap of green jelly that hauls itself along on its own arms like an octopus
 * out of water. Front arms reach ahead, grip and pull the body after them in surges; the arms behind slither after it.
 * One long whip-arm rides coiled over its back until it strikes, flies out, wraps the player and reels them in.
 * The body is a wobbling translucent blob with a sac of mantle behind, veins glowing through, colour rippling over the
 * skin when it is roused, a toothed mouth in front and eyes clustered round it. It grows worse with size: more arms,
 * more mouths (on the flanks, then one gaping on top), and from the drone up a beard of face tentacles.
 * Dead, it does not smoke: it slumps and melts into a bubbling pool of goo that soaks away.
 *
 * Tentacles are one mesh: each is a tube bent in the vertex shader along a cubic Bézier set per frame (uP), tapering
 * to the tip. Suckers ride their undersides, placed on the CPU with the same curve. Everything is in the parent's space;
 * callers scale a holder to the creature's size, as for the crawler.
 */
const MAXT=16,LASH=MAXT-1,SUCKERS=5,BODY_R=.52;
// View states (see update): coil/rear are the whip-arm's and the slam's tells, reel/feed the snare and the meal.
const REST_HEIGHT={emerge:.4,idle:.6,lurk:.6,stalk:.52,close:.46,flee:.45,recover:.5,slash:.34,recoil:.75,hit:.62,coil:.82,rear:1.2,lunge:.7,reel:.62,feed:1.15,thrown:1.1};
const OPEN={coil:.45,rear:.9,lunge:.6,feed:1,reel:.55,slash:.8,hit:.4,flee:.25};
const GREEN=new THREE.Color('#2f7a2a'),DEEP=new THREE.Color('#123d16');
const smooth=(a,b,x)=>{const k=Math.max(0,Math.min(1,(x-a)/(b-a)));return k*k*(3-2*k);};

const DEFORM=`uniform vec3 uP[${MAXT*4}];uniform float uR[${MAXT}];uniform float uTime;uniform float uPulse;uniform vec3 uSquash;attribute float aTent;varying vec3 vHz;
vec3 hzBez(vec3 a,vec3 b,vec3 c,vec3 d,float t){float u=1.-t;return u*u*u*a+3.*u*u*t*b+3.*u*t*t*c+t*t*t*d;}
vec3 hzTan(vec3 a,vec3 b,vec3 c,vec3 d,float t){float u=1.-t;return 3.*u*u*(b-a)+6.*u*t*(c-b)+3.*t*t*(d-c);}
void hzDeform(inout vec3 p,inout vec3 n){
 if(aTent<0.){
  float w=sin(p.x*7.+uTime*2.1)*sin(p.y*6.-uTime*1.7)*sin(p.z*8.+uTime*1.3);
  p=p*uSquash+n*(.04*w+.05*uPulse*sin(p.y*20.+uTime*30.));return;}
 int i=int(aTent+.5);vec3 a=uP[i*4],b=uP[i*4+1],c=uP[i*4+2],d=uP[i*4+3];float t=p.y;
 vec3 C=hzBez(a,b,c,d,t),T=normalize(hzTan(a,b,c,d,t)+vec3(0.,1e-4,0.));
 vec3 N=normalize(cross(T,abs(T.y)>.97?vec3(1.,0.,0.):vec3(0.,1.,0.))),B=cross(T,N);
 float r=uR[i]*(1.-.84*t)*(1.+.13*sin(t*34.-uTime*7.+float(i)*1.7)+.4*uPulse*sin(t*20.+uTime*25.));
 vec3 off=p.x*N+p.z*B;p=C+off*r;n=length(off)>.001?normalize(off):T;}`;
/** Veins of light under the skin, colour rippling over it like a cephalopod's, and the burn: charred crust cracking on heat. */
const SKIN=`uniform float uTime;uniform float uHeat;uniform float uChar;uniform float uVeins;uniform float uChroma;varying vec3 vHz;
float hzVein(){vec3 g=vHz*vec3(9.,7.,9.);float n=sin(g.x+sin(g.z*1.3+uTime*.4)*1.8)*sin(g.z+sin(g.y*1.7)*2.)*sin(g.y*1.4+sin(g.x*1.1)*1.6);
 return smoothstep(.94,.995,1.-abs(n))*(.55+.45*sin(uTime*1.7+vHz.y*5.+vHz.x*3.));}
float hzChroma(){float w=sin(vHz.z*13.+vHz.y*7.-uTime*3.4+sin(vHz.x*8.+uTime*.7)*1.6);return smoothstep(.45,1.,w)*uChroma;}
vec3 hzBurn(vec3 c){if(uChar+uHeat<.001)return c;vec3 g=vHz*vec3(38.,44.,40.);
 float n=sin(g.x+sin(g.z*.9+uTime*.3)*2.1)*sin(g.z+sin(g.y*1.1)*2.3)*sin(g.y*1.2+sin(g.x*.8)*1.7),crack=smoothstep(.82,.99,1.-abs(n));
 c=mix(c,vec3(.04,.036,.03)+c*.2,uChar*.85);return c+vec3(1.,.32,.05)*(crack*2.2+.18)*uHeat*(.65+.35*sin(uTime*11.+g.x*.4));}`;
const TO_CAVE='mat4 caveFrom=uToCave*modelMatrix;\n#ifdef USE_INSTANCING\ncaveFrom=caveFrom*instanceMatrix;\n#endif\n';

/** The jelly, physically lit on the surface or lit by the cave's sight underground. `deform`: body wobble and tentacles. */
export function jelly({mode,sight,toCave,viewDir},shared,{tint,glow=1,deform=true,rest=false}){
 const uniforms={uChroma:{value:0},...shared,uVeins:{value:glow}};
 const vertex=s=>{
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\n'+(deform?DEFORM:'varying vec3 vHz;'+(rest?'attribute vec3 aRest;':'')))
   .replace('#include <begin_vertex>',deform?'vec3 hzN=normal;vec3 transformed=position;hzDeform(transformed,hzN);vHz=position;':`vec3 transformed=position;vec3 hzN=normal;vHz=${rest?'aRest':'position'};`);
  if(deform)s.vertexShader=s.vertexShader.replace('#include <beginnormal_vertex>','vec3 objectNormal=normal;{vec3 q=position;hzDeform(q,objectNormal);}\n#ifdef USE_TANGENT\nvec3 objectTangent=vec3(tangent.xyz);\n#endif');
 };
 if(mode==='studio'){
  const m=new THREE.MeshPhysicalMaterial({color:tint,roughness:.34,clearcoat:.7,clearcoatRoughness:.22,envMapIntensity:.4,sheen:.7,sheenColor:new THREE.Color('#9dff8a'),emissive:DEEP.clone().multiplyScalar(.35)});
  m.onBeforeCompile=s=>{Object.assign(s.uniforms,uniforms);vertex(s);
   s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\n'+SKIN).replace('#include <opaque_fragment>',`
    float rim=pow(1.-abs(dot(normal,normalize(vViewPosition))),2.6);
    outgoingLight*=1.-.5*hzChroma();
    outgoingLight+=vec3(.25,.8,.3)*rim*.55+vec3(.3,1.,.4)*hzVein()*uVeins*.9;outgoingLight=hzBurn(outgoingLight);
    #include <opaque_fragment>`);};
  m.customProgramCacheKey=()=>`horror-jelly:${deform}:${rest}`;return m;
 }
 const m=new THREE.MeshBasicMaterial({color:tint,fog:false});
 m.onBeforeCompile=s=>{Object.assign(s.uniforms,uniforms,sight,{uToCave:toCave,uViewDir:viewDir});vertex(s);
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 uToCave;varying vec3 vCave;varying vec3 vCaveN;')
   .replace('#include <project_vertex>','#include <project_vertex>\n'+TO_CAVE+'vCave=(caveFrom*vec4(transformed,1.0)).xyz;vCaveN=normalize(mat3(caveFrom)*hzN);');
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 uViewDir;varying vec3 vCave;varying vec3 vCaveN;\n'+SKIN+SIGHT_PARS.replace('varying vec2 vCaveLocal;varying float vSeen;',''))
   .replace('#include <opaque_fragment>',`
    vec3 n=normalize(vCaveN),toLamp=normalize(vec3(uPlayer.x,1.5,uPlayer.y)-vCave),lit=caveSight(vCave.xz),glowAt=caveGlow(vCave.xz);
    float lamp=dot(caveSightRaw(vCave.xz),vec3(.33)),rim=pow(1.-abs(dot(n,uViewDir)),2.4),seen=caveSeen(vCave.xz);
    float glint=smoothstep(.93,.985,dot(reflect(-toLamp,n),uViewDir));
    // Jelly: lit through, so the far side glows where the lamp is behind it, with a hard wet glint and a bright rim.
    // Its veins glow faintly in the dark, but only where the player could see, so they never give away what lurks in rock not yet reached.
    vec3 c=diffuseColor.rgb*(1.-.55*hzChroma())*lit*(.55+.6*max(0.,dot(n,toLamp)))+(diffuseColor.rgb*2.4+vec3(.06,.2,.06))*rim*(lamp*.9+.1*seen)
     +vec3(.75,1.,.75)*glint*lamp*.9+glowAt*(.2+rim*.6)+vec3(.25,1.,.4)*hzVein()*uVeins*.4*seen;
    outgoingLight=hzBurn(c);
    #include <opaque_fragment>`);};
 m.customProgramCacheKey=()=>`horror-jelly-sight:${deform}:${rest}`;return m;
}
/** Hard parts (teeth, sucker rims, the throat): plain colour, lit like the cave or the surface. */
export function flat({mode,sight,toCave},color,{rough=.4,shine=1.4}={}){
 if(mode==='studio')return new THREE.MeshStandardMaterial({color,roughness:rough});
 const m=new THREE.MeshBasicMaterial({color,fog:false});
 m.onBeforeCompile=s=>{Object.assign(s.uniforms,sight,{uToCave:toCave});
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 uToCave;varying vec3 vCave;').replace('#include <project_vertex>','#include <project_vertex>\n'+TO_CAVE+'vCave=(caveFrom*vec4(transformed,1.0)).xyz;');
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCave;\n'+SIGHT_PARS.replace('varying vec2 vCaveLocal;varying float vSeen;','')).replace('#include <opaque_fragment>',`outgoingLight=diffuseColor.rgb*(caveSight(vCave.xz)*${shine.toFixed(2)}+caveGlow(vCave.xz));\n#include <opaque_fragment>`);};
 m.customProgramCacheKey=()=>`horror-flat:${shine}`;return m;
}

/** How a creature of `size` is put together. Deterministic per size so a kind always looks the same. */
export function horrorPlan(size=1){
 const legs=size<.8?5:size<1.4?7:size<2.2?9:size<2.9?11:12,beard=size>=1.6?(size<2.4?2:3):0;
 const mouths=[{at:[0,.02,.95],dir:[0,-.15,1],r:.34}];
 if(size>=1.6)mouths.push({at:[.72,.12,.55],dir:[1,0,.6],r:.2},{at:[-.72,.12,.55],dir:[-1,0,.6],r:.2});
 if(size>=2.4)mouths.push({at:[0,.92,.05],dir:[0,1,.1],r:.3});
 const eyes=size<.8?3:size<1.4?5:size<2.4?8:12;
 return {legs,beard,mouths,eyes};
}

export function createHorrorView(parent,{mode='studio',sight=null,toCave=null,viewDir=null,size=1,lite=false}={}){
 const root=new THREE.Group(),owned=[],keep=x=>(owned.push(x),x);parent.add(root);
 const heavy=Math.sqrt(Math.max(1,size)),plan=horrorPlan(size),look={mode,sight,toCave,viewDir};
 const time={value:0},pulse={value:0},heat={value:0},char={value:0},chroma={value:.35},squash={value:new THREE.Vector3(1,1,1)};
 const P=Array.from({length:MAXT*4},()=>new THREE.Vector3()),R=new Array(MAXT).fill(0);
 const shared={uTime:time,uPulse:pulse,uHeat:heat,uChar:char,uChroma:chroma,uSquash:squash,uP:{value:P},uR:{value:R}};
 const skin=keep(jelly(look,shared,{tint:GREEN})),lip=keep(jelly(look,shared,{tint:new THREE.Color('#4a2a24'),glow:.3,deform:false}));
 const bone=keep(flat(look,'#d9d2a8',{rough:.25,shine:1.6})),throat=keep(flat(look,'#020302',{shine:0})),rimMat=keep(flat(look,'#b9c99a',{shine:1.2}));
 const eyeMat=keep(new THREE.MeshBasicMaterial({color:new THREE.Color(1,.92,.35),fog:false}));
 const shadows=mode==='studio'&&!lite;

 // Body: a wobbling blob (deformed in the shader; aTent -1), and the mantle, a sac slung behind it that breathes.
 const body=new THREE.Group();root.add(body);
 const blobGeo=keep(new THREE.IcosahedronGeometry(BODY_R,lite?3:4));
 {const p=blobGeo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const k=1+.12*Math.sin(x*9+z*4)*Math.sin(y*7)+.06*Math.sin(z*13+y*5);p.setXYZ(i,x*k*1.08,y*k*.9,z*k*1.12);}
  blobGeo.computeVertexNormals();blobGeo.setAttribute('aTent',new THREE.Float32BufferAttribute(new Array(p.count).fill(-1),1));}
 const blob=new THREE.Mesh(blobGeo,skin);blob.castShadow=shadows;blob.frustumCulled=false;body.add(blob);
 const mantleGeo=keep(new THREE.IcosahedronGeometry(BODY_R*.82,lite?2:3));
 {const p=mantleGeo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const k=1+.1*Math.sin(x*11+y*3)*Math.sin(z*8)+.05*Math.sin(y*15);p.setXYZ(i,x*k*.9,(y+.12*Math.max(0,y)/BODY_R)*k*1.25,z*k*.95);}
  mantleGeo.computeVertexNormals();mantleGeo.setAttribute('aTent',new THREE.Float32BufferAttribute(new Array(p.count).fill(-1),1));}
 const mantlePivot=new THREE.Group();mantlePivot.position.set(0,BODY_R*.35,-BODY_R*.45);body.add(mantlePivot);
 const mantle=new THREE.Mesh(mantleGeo,skin);mantle.position.set(0,BODY_R*.55,0);mantle.castShadow=shadows;mantle.frustumCulled=false;mantlePivot.add(mantle);

 // Mouths: a fleshy lip, a black throat and two rings of teeth raked inward; they gape with `open`.
 const toothGeo=keep(new THREE.ConeGeometry(.032,.15,5).translate(0,.075,0)),lipGeo=keep(new THREE.TorusGeometry(1,.22,7,18)),throatGeo=keep(new THREE.CircleGeometry(1,18));
 const mouths=plan.mouths.map(m=>{
  const g=new THREE.Group(),dir=new THREE.Vector3(...m.dir).normalize();g.position.set(m.at[0]*BODY_R,m.at[1]*BODY_R,m.at[2]*BODY_R);g.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir);body.add(g);
  const ring=new THREE.Mesh(lipGeo,lip);ring.scale.setScalar(m.r*.62);g.add(ring);
  const hole=new THREE.Mesh(throatGeo,throat);hole.position.z=-.02;hole.scale.setScalar(m.r*.6);g.add(hole);
  const teeth=new THREE.Group(),fangs=[];g.add(teeth);
  for(let row=0;row<2;row++)for(let k=0,n=row?9:12;k<n;k++){const a=k/n*Math.PI*2+row*.2;
   fangs.push({a,row,x:Math.cos(a)*m.r*.58*(row?.78:1),y:Math.sin(a)*m.r*.58*(row?.78:1),z:-.01-row*.03,s:m.r/.34*(row?.8:1)*(.75+.5*((k*7)%5)/5)});}
  const set=new THREE.InstancedMesh(toothGeo,bone,fangs.length);set.frustumCulled=false;teeth.add(set);
  return {g,ring,hole,teeth,set,fangs,r:m.r};
 });
 // Eyes in a cluster round and above the main mouth, blinking out of step.
 const eyeGeo=keep(new THREE.SphereGeometry(1,8,6));
 const eyes=Array.from({length:plan.eyes},(_,i)=>{const a=(i/plan.eyes-.5)*2.4+.15*Math.sin(i*5.1),up=.25+.35*((i*3)%4)/4;
  const v=new THREE.Vector3(Math.sin(a)*.95,up+.12*Math.sin(i*2.3),Math.cos(a)*.95).normalize().multiplyScalar(BODY_R*1.02);
  const e=new THREE.Mesh(eyeGeo,eyeMat);e.position.copy(v);e.scale.setScalar(.028+.025*((i*7)%3)/2);body.add(e);return {e,base:e.scale.x,t:Math.random()*4};});

 // Tentacles: arms that haul it along, the beard that only writhes, and the whip-arm (the last tube).
 const tubeParts=[];
 for(let i=0;i<MAXT;i++){const g=new THREE.CylinderGeometry(1,1,1,lite?6:8,lite?14:i===LASH?30:22,false).translate(0,.5,0);g.deleteAttribute('uv');g.setAttribute('aTent',new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(i),1));tubeParts.push(g.toNonIndexed());g.dispose();}
 const tubeGeo=keep(mergeAll(tubeParts));tubeGeo.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e4);
 const tubes=new THREE.Mesh(tubeGeo,skin);tubes.frustumCulled=false;tubes.castShadow=shadows;root.add(tubes);
 const LEGS=plan.legs,BEARD=plan.beard;
 const legs=Array.from({length:LEGS},(_,i)=>{
  // Spread round the body, a gap left at the mouth. Front arms reach and pull; the ones behind trail.
  const a=Math.PI*.22+(i+.5)/LEGS*Math.PI*1.56,side=Math.sin(a)>=0?1:-1,kind=Math.cos(a)>.35?'front':Math.cos(a)<-.35?'rear':'side';
  const reach=(kind==='front'?1.6:kind==='rear'?1.85:1.5)+.18*Math.sin(i*2.7);
  return {i,a,side,kind,lead:kind==='front'?.45:kind==='side'?.22:0,dir:new THREE.Vector3(Math.sin(a),0,Math.cos(a)),rest:new THREE.Vector3(Math.sin(a)*reach,0,Math.cos(a)*reach),r:.12+.025*Math.sin(i*1.9),lie:1,
   foot:new THREE.Vector3(),from:new THREE.Vector3(),to:new THREE.Vector3(),step:0,duration:.3,lift:.4,free:false,spasm:new THREE.Vector3(),spasmT:0,phase:i*1.37};
 });
 for(let i=LEGS+BEARD;i<MAXT;i++)R[i]=0;
 const beard=Array.from({length:BEARD},(_,k)=>({i:LEGS+k,x:(k/(Math.max(1,BEARD-1))-.5)*.5,len:.55+.25*((k*3)%4)/3,phase:k*2.1}));
 // Suckers on the underside of each arm and the whip-arm.
 const armed=[...legs.map(l=>l.i),LASH];
 const suckerGeo=keep(new THREE.TorusGeometry(1,.5,5,10)),suckers=new THREE.InstancedMesh(suckerGeo,rimMat,armed.length*SUCKERS);suckers.frustumCulled=false;root.add(suckers);
 if(lite)suckers.visible=false;

 // Slime: drops that fall when it is hit or rears, and splats where they land.
 const dropMat=keep(flat(look,'#3d9a3a',{shine:1.6})),splatMat=keep(mode==='studio'?new THREE.MeshPhysicalMaterial({color:'#2d6e2a',roughness:.1,clearcoat:1,transparent:true,opacity:.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})
  :new THREE.MeshBasicMaterial({color:'#123a12',transparent:true,opacity:.85,depthWrite:false,fog:false,polygonOffset:true,polygonOffsetFactor:-2}));
 const DROPS=40,SPLATS=30,drops=new THREE.InstancedMesh(keep(new THREE.SphereGeometry(1,7,5)),dropMat,DROPS),splats=new THREE.InstancedMesh(keep(new THREE.CircleGeometry(1,16).rotateX(-Math.PI/2)),splatMat,SPLATS);
 drops.frustumCulled=splats.frustumCulled=false;root.add(drops,splats);
 const dropState=[...Array(DROPS)].map(()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),alive:false,size:.02})),splatState=[...Array(SPLATS)].map(()=>({x:0,z:0,r:0,age:99,life:8}));
 let nextDrop=0,nextSplat=0;
 const splat=(x,z,r,life=8)=>{const s=splatState[nextSplat];nextSplat=(nextSplat+1)%SPLATS;Object.assign(s,{x,z,r,age:0,life});};
 const drip=(p,size=.02+Math.random()*.02,v=null)=>{const d=dropState[nextDrop];nextDrop=(nextDrop+1)%DROPS;d.p.copy(p);if(v)d.v.copy(v);else d.v.set((Math.random()-.5)*.3,-.2,(Math.random()-.5)*.3);d.alive=true;d.size=size;};

 // Ink: a dark cloud squirted at whatever it jets away from.
 const inkMat=keep(mode==='studio'?new THREE.MeshStandardMaterial({color:'#0b140c',roughness:1,transparent:true,opacity:.78,depthWrite:false})
  :new THREE.MeshBasicMaterial({color:'#020402',transparent:true,opacity:.82,depthWrite:false,fog:false}));
 const INK=28,ink=new THREE.InstancedMesh(keep(new THREE.IcosahedronGeometry(1,1)),inkMat,INK);ink.frustumCulled=false;root.add(ink);
 const inkState=[...Array(INK)].map(()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),age:99,life:2,r:.2}));let nextInk=0;
 // Dead, it melts into this: a glossy pool of its own jelly, bubbling, that soaks away.
 const puddleGeo=keep(new THREE.SphereGeometry(1,30,5,0,Math.PI*2,0,Math.PI/2));
 {const p=puddleGeo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),a=Math.atan2(z,x),k=1+.18*Math.sin(a*3+1)+.1*Math.sin(a*7+2)+.05*Math.sin(a*13);p.setXYZ(i,x*k,y*.14,z*k);}puddleGeo.computeVertexNormals();}
 const gooMat=keep(jelly(look,shared,{tint:new THREE.Color('#174a17'),glow:.25,deform:false}));
 const puddle=new THREE.Mesh(puddleGeo,gooMat);puddle.visible=false;puddle.frustumCulled=false;root.add(puddle);
 const BUBBLES=12,bubbles=new THREE.InstancedMesh(keep(new THREE.SphereGeometry(1,8,6)),gooMat,BUBBLES);bubbles.frustumCulled=false;root.add(bubbles);
 const bubbleState=[...Array(BUBBLES)].map(()=>({x:0,z:0,age:99,life:1,r:.05}));let nextBubble=0;

 const pos=new THREE.Vector3(),vel=new THREE.Vector3(),last=new THREE.Vector3(),pose={height:.6,pitch:0,roll:0,open:0,yaw:0,sx:1,sy:1,sz:1};
 const jerk={t:0,want:{yaw:0,pitch:0,roll:0,y:0,open:0},now:{yaw:0,pitch:0,roll:0,y:0,open:0}};
 let started=false,clock=0,lastState='idle',biteT=0,bite=1,tasteT=2,taster=-1,lag=0,lastSpeed=0;
 const up=new THREE.Vector3(0,1,0),tmp=new THREE.Vector3(),_v=new THREE.Vector3(),dummy=new THREE.Object3D();
 const toParent=(v,out)=>out.copy(v).applyMatrix4(body.matrix);
 const L=(x,y,z)=>toParent(_v.set(x,y,z),new THREE.Vector3());
 const home=(leg,out)=>{out.copy(leg.rest).applyAxisAngle(up,pose.yaw);out.x+=pos.x+vel.x*leg.lead;out.z+=pos.z+vel.z*leg.lead;out.y=0;return out;};
 const neighbours=i=>[(i+1)%LEGS,(i+LEGS-1)%LEGS];
 const bez=(a,b,c,d,t,out)=>{const u=1-t;return out.set(0,0,0).addScaledVector(a,u*u*u).addScaledVector(b,3*u*u*t).addScaledVector(c,3*u*t*t).addScaledVector(d,t*t*t);};
 const bezTan=(a,b,c,d,t,out)=>{const u=1-t;return out.set(0,0,0).addScaledVector(b.clone().sub(a),3*u*u).addScaledVector(c.clone().sub(b),6*u*t).addScaledVector(d.clone().sub(c),3*t*t).normalize();};

 /**
  * One arm's curve from the skin out along `out` to `tip`, writhing. Raised, it arches up and over and comes down on
  * the tip from beyond (`curl` hooks it); `lie` lays it along the ground instead, its end curled up off the floor.
  */
 const _b=new THREE.Vector3(),_c=new THREE.Vector3(),_d=new THREE.Vector3();
 function arm(i,root0,out,tip,{arch=.45,writhe=1,r,curl=0,lie=0}){
  const k=i*4,a=P[k],b=P[k+1],c=P[k+2],d=P[k+3],w=clock*(1.6+(i%3)*.35)+i*1.9;
  a.copy(root0);d.copy(tip);
  b.copy(root0).addScaledVector(out,.45).addScaledVector(up,arch);
  c.copy(tip).addScaledVector(up,arch*.9+.15+curl*.25).addScaledVector(out,curl*.45-.15);
  if(lie>0){
   const len=Math.hypot(tip.x-root0.x,tip.z-root0.z);
   _b.copy(root0).addScaledVector(out,Math.min(.5,len*.35));_b.y=Math.max(.04,root0.y*.2);
   _c.copy(tip).addScaledVector(out,.2+.15*curl);_c.y=.03;
   _d.copy(tip).addScaledVector(out,-.12*curl);_d.y=.04+.2*curl;
   b.lerp(_b,lie);c.lerp(_c,lie);d.lerp(_d,lie);
  }
  const loose=1-lie*.4;
  b.x+=Math.sin(w)*.12*writhe;b.z+=Math.cos(w*1.3)*.12*writhe;b.y+=Math.sin(w*.7)*.06*writhe*loose;
  c.x+=Math.sin(w*1.7+1)*.16*writhe;c.z+=Math.cos(w*1.1+2)*.16*writhe;c.y=Math.max(.03,c.y+Math.sin(w*1.2)*.08*writhe*loose);
  R[i]=r;
 }
 function squirt(){
  const fx=Math.sin(pose.yaw),fz=Math.cos(pose.yaw);
  for(let i=0;i<14;i++){const s=inkState[nextInk];nextInk=(nextInk+1)%INK;
   s.p.set(pos.x+fx*.4,pose.height*.8,pos.z+fz*.4);s.v.set(fx*(2+Math.random()*3.5)+(Math.random()-.5)*2,Math.random()*.9,fz*(2+Math.random()*3.5)+(Math.random()-.5)*2);
   s.age=-i*.012;s.life=1.8+Math.random()*1.4;s.r=.16+Math.random()*.2;}
 }

 /** `c`: the simulated horror (horror.js); `ctx.player`: {x,z}. Returns plant events, as crawler-view. */
 function update(c,dt,ctx={}){
  const events=[];time.value+=dt;clock+=dt;pulse.value*=Math.exp(-dt*5);
  const flung=c.state==='recoil'&&c.thrown?(c.t-CRAWLER.throwDelay)/(CRAWLER.throwTime+.15):-1;
  let state=c.state;
  if(state==='shriek')state=c.slam||c.mauling?'rear':'coil';
  else if(state==='grab')state=c.reel?'reel':'feed';
  else if(state==='recoil')state=flung>=0&&flung<1?'thrown':flung<0&&c.thrown?'feed':'recoil';
  else if(state==='lurk'&&c.speed<.2)state='idle';
  else if(state==='march'||state==='evade')state='stalk';
  const player=ctx.player??{x:c.x+Math.sin(c.facing)*2,z:c.z+Math.cos(c.facing)*2},dead=state==='dead',t=c.t??0,lash=c.lash;
  const toIt=new THREE.Vector2(c.x-player.x,c.z-player.z);if(toIt.lengthSq()<1e-4)toIt.set(-Math.sin(c.facing),-Math.cos(c.facing));toIt.normalize();
  let tx=c.x,tz=c.z;
  if(state==='feed'){tx=player.x+toIt.x*.5;tz=player.z+toIt.y*.5;}
  // Moved further than it can go in a frame (spawned, teleported): plant everything afresh.
  if(started&&Math.hypot(tx-pos.x,tz-pos.z)>4)started=false;
  if(!started){started=true;pos.set(tx,0,tz);last.copy(pos);pose.yaw=c.facing;body.position.set(tx,REST_HEIGHT.idle,tz);body.updateMatrix();legs.forEach(l=>home(l,l.foot));}
  if(state==='hit'&&lastState!=='hit'){jerk.t=.12;Object.assign(jerk.want,{yaw:(Math.random()-.5)*.6,pitch:-.4,roll:(Math.random()-.5)*.8,y:.12,open:.9});pulse.value=1;}
  if(state==='flee'&&lastState!=='flee')squirt();
  if(dead&&lastState!=='dead')pulse.value=1;
  lastState=state;
  // It follows the sim closely: the sim's surges are the haul of its arms.
  const k=1-Math.exp(-dt*(state==='thrown'||state==='flee'?30:16));pos.x+=(tx-pos.x)*k;pos.z+=(tz-pos.z)*k;
  vel.set((pos.x-last.x)/Math.max(dt,1e-4),0,(pos.z-last.z)/Math.max(dt,1e-4));last.copy(pos);
  const speed=Math.hypot(vel.x,vel.z),accel=dt>0?(speed-lastSpeed)/dt:0;lastSpeed=speed;
  let yawDiff=c.facing-pose.yaw;yawDiff=Math.atan2(Math.sin(yawDiff),Math.cos(yawDiff));pose.yaw+=yawDiff*(1-Math.exp(-dt*(state==='flee'?10:4)));
  const melt=dead?smooth(.4,2.4,t):0,seize=dead?Math.max(0,1-t/.9):0,thrown=state==='thrown',surgeK=Math.min(1,speed/3.2);
  // Its only jerks: a flinch, the feeding, the death throes. Everything else flows.
  jerk.t-=dt;
  if(jerk.t<=0){const r=()=>Math.random()*2-1,amount=seize>.05?seize:state==='feed'?1.2:0;
   jerk.t=amount?.04+Math.random()*.08:.2;
   Object.assign(jerk.want,amount?{yaw:r()*.3*amount,pitch:r()*.3*amount,roll:r()*.4*amount,y:Math.random()*.12*amount,open:Math.random()*amount}:{yaw:0,pitch:0,roll:0,y:0,open:0});}
  const snap=1-Math.exp(-dt*30);for(const key in jerk.want)jerk.now[key]+=(jerk.want[key]-jerk.now[key])*snap;
  // Roused, colour ripples over it faster and it breathes harder.
  const roused=['coil','rear','lunge','reel','feed','slash','flee'].includes(state)?1:0;
  chroma.value+=((dead?0:roused?.95:.3)-chroma.value)*(1-Math.exp(-dt*3));
  const breathe=Math.sin(clock*(1.3+roused*1.6))*.035*(1-melt);
  const wantHeight=thrown?1.1*(1-flung)+.6*flung+1*Math.sin(Math.PI*flung):dead?.24*(1-melt)+.03:(REST_HEIGHT[state]??.55)+breathe+surgeK*.06;
  pose.height+=(wantHeight-pose.height)*(1-Math.exp(-dt*(thrown?30:state==='slash'||state==='lunge'||state==='rear'?12:dead?4:5)));
  const pitchWant=dead?0:({rear:-.55,coil:-.1,lunge:.22,slash:.5,feed:.45,reel:-.15,flee:-.25,recover:.1})[state]??(Math.min(.22,speed*.06)+Math.max(-.1,Math.min(.1,accel*.02)));
  pose.pitch+=(pitchWant-pose.pitch)*(1-Math.exp(-dt*6));
  if(thrown)pose.roll+=dt*14;else{pose.roll=Math.atan2(Math.sin(pose.roll),Math.cos(pose.roll));pose.roll+=((state==='hit'?.3*Math.sin(t*20):0)-pose.roll)*(1-Math.exp(-dt*8));}
  // Stretched toward where it hauls, flattened into the slam, squeezed long into the jet; dead, it spreads and sinks.
  const shape=state==='flee'?[.72,.78,1.5]:state==='slash'?[1.25,.72,1.15]:state==='rear'?[.9,1.2,.95]:[1-.1*surgeK,1-.08*surgeK,1+.22*surgeK];
  const ks=1-Math.exp(-dt*8);pose.sx+=(shape[0]-pose.sx)*ks;pose.sy+=(shape[1]-pose.sy)*ks;pose.sz+=(shape[2]-pose.sz)*ks;
  biteT-=dt;if(biteT<=0){biteT=.03+Math.random()*.08;bite=Math.random()<.35?.4+Math.random()*.2:.95+Math.random()*.35;}
  const wantOpen=Math.max((OPEN[state]??.06+.06*Math.sin(clock*.9))*(state==='feed'?bite:1),jerk.now.open,dead?.5*seize:0)*(1-melt);
  pose.open+=(wantOpen-pose.open)*(1-Math.exp(-dt*(state==='feed'?40:wantOpen>pose.open?18:7)));
  squash.value.set(pose.sx*(1+.05*Math.sin(clock*1.5))*(1+melt*1.1)+pose.open*.08,pose.sy*(1-.05*Math.sin(clock*1.5))*(1-melt*.85),pose.sz*(1+melt*.9)+pose.open*.05);
  body.position.set(pos.x,pose.height+jerk.now.y,pos.z);
  body.rotation.set(0,0,0);body.rotateY(pose.yaw+jerk.now.yaw+.05*Math.sin(clock*.6));body.rotateX(THREE.MathUtils.clamp(pose.pitch+jerk.now.pitch,-1.2,1.2));body.rotateZ(pose.roll+jerk.now.roll);body.updateMatrix();
  // The mantle lags the body's surges, fills and empties with each breath, and empties hard to jet.
  lag+=(THREE.MathUtils.clamp(-accel*.04,-.45,.45)-lag)*(1-Math.exp(-dt*5));
  mantlePivot.rotation.set(-.5+lag+.06*Math.sin(clock*1.1)+(state==='rear'?-.4:0)+melt*.9,0,.07*Math.sin(clock*.8));
  const empty=state==='flee'?Math.min(1,.55+t*.9):1;
  mantle.scale.set((1+breathe*1.6)*(1+melt*.4),(1+breathe*2.4)*empty*(1-melt*.85),(1+breathe*1.6)*(1+melt*.4));
  for(const m of mouths){const o=pose.open;m.ring.scale.setScalar(m.r*.62*(1+o*.55));m.hole.scale.setScalar(m.r*.6*(1+o*.7));m.teeth.scale.setScalar(1+o*.6);m.fangs.forEach((f,j)=>{dummy.position.set(f.x,f.y,f.z);dummy.rotation.set(0,0,f.a-Math.PI/2);dummy.rotateX(-(.9+f.row*.3)+o*.75);dummy.scale.setScalar(f.s);dummy.updateMatrix();m.set.setMatrixAt(j,dummy.matrix);});m.set.instanceMatrix.needsUpdate=true;m.g.visible=melt<.6;}
  for(const e of eyes){e.t-=dt;if(e.t<0)e.t=2+Math.random()*5;const blink=e.t<.12?Math.abs(e.t-.06)/.06:1;e.e.scale.set(e.base,e.base*Math.max(.08,blink)*(dead?Math.max(0,1-t/1.5):1),e.base);}

  // Idle, one front arm at a time lifts and tastes the air.
  tasteT-=dt;if(state!=='idle')taster=-1;else if(tasteT<=0){const fronts=legs.filter(l=>l.kind!=='rear');taster=taster<0&&fronts.length?fronts[Math.floor(Math.random()*fronts.length)].i:-1;tasteT=taster>=0?1.2+Math.random()*.8:1.5+Math.random()*3;}
  // Where each arm reaches in this state; null leaves it to haul.
  const reach=leg=>{
   if(state==='rear')return L(leg.dir.x*.95,1.15+.35*Math.sin(clock*7+leg.phase),leg.dir.z*.95+.45);
   if(state==='coil'&&leg.kind==='front')return L(leg.dir.x*1.1,.3+.2*Math.sin(clock*9+leg.phase),leg.dir.z*.9+.55);
   if(state==='slash'&&leg.kind!=='rear')return L(leg.dir.x*.9,-pose.height+.02,1.25+leg.dir.z*.35);
   if(state==='feed'){
    // Wrapped round the player from helmet to knees, never still: each grip jabs to a new hold every few frames.
    leg.spasmT-=dt;if(leg.spasmT<=0){leg.spasmT=.03+Math.random()*.06;leg.spasm.set((Math.random()*2-1)*.35,(Math.random()*2-1)*.12,(Math.random()*2-1)*.05);}
    const back=Math.atan2(toIt.x,toIt.y),around=back+(leg.i/LEGS-.5)*5.6+leg.spasm.x,h=.5+1.4*((leg.i*5)%LEGS)/LEGS+leg.spasm.y;
    return new THREE.Vector3(player.x+Math.sin(around)*(.34+leg.spasm.z),h,player.z+Math.cos(around)*(.34+leg.spasm.z));
   }
   // Jetting: the arms stream after it in a bundle, toward what it flees.
   if(state==='flee')return L(leg.dir.x*.28+Math.sin(clock*9+leg.phase)*.08,-pose.height*.55+.08+Math.sin(clock*6+leg.phase)*.05,1.3+.6*((leg.i*7)%5)/5);
   if(thrown||(dead&&seize>0)){
    leg.spasmT-=dt;if(leg.spasmT<=0){leg.spasmT=.03+Math.random()*.1;leg.spasm.set(leg.dir.x*(.5+Math.random()*1.2)+(Math.random()-.5)*.6,-.5+Math.random()*1.2,leg.dir.z*(.5+Math.random()*1.2)+(Math.random()-.5)*.6);}
    return L(leg.spasm.x,leg.spasm.y,leg.spasm.z);
   }
   // Dead, the arms splay flat and slide out into the spreading pool.
   if(dead)return L(leg.dir.x*(1.2+melt*.6),-pose.height+.03,leg.dir.z*(1.2+melt*.6));
   if(taster===leg.i)return L(leg.dir.x*1.05,.55+.2*Math.sin(clock*2.3),leg.dir.z*1.05+.15);
   return null;
  };
  const airborne=legs.filter(l=>l.step>0).length,surface=new THREE.Vector3(),out=new THREE.Vector3(),moving=speed>.3;
  legs.forEach((leg,i)=>{
   const target=reach(leg);
   if(target){if(leg.step<=0)leg.free=true;
    if(leg.free){const rate=state==='feed'?40:state==='slash'||thrown||seize>0?28:state==='flee'?18:dead?3:7;leg.foot.lerp(target,1-Math.exp(-dt*rate));leg.foot.y=Math.max(.02,leg.foot.y);}}
   else if(leg.free){leg.free=false;leg.from.copy(leg.foot);home(leg,leg.to);leg.step=.001;leg.duration=.3*heavy;leg.lift=.35;}
   if(leg.step>0){
    // Reach, then grip: slow out, slow in, the tip held high and curled until it lands.
    leg.step+=dt/leg.duration;const s=Math.min(1,leg.step),e=s<.5?2*s*s:1-Math.pow(2-2*s,2)/2;
    leg.foot.lerpVectors(leg.from,leg.to,e);leg.foot.y=Math.max(leg.to.y,Math.sin(s*Math.PI)*leg.lift);
    if(s>=1){leg.step=0;leg.foot.copy(leg.to);events.push({type:'plant',x:leg.foot.x,z:leg.foot.z});if(Math.random()<.15)splat(leg.foot.x,leg.foot.z,.04+Math.random()*.05,5);}
   }else if(!leg.free&&!dead){
    const want=home(leg,tmp);
    // The arms behind don't step: they slither after the body along the ground.
    if(leg.kind==='rear'&&moving){const ks=1-Math.exp(-dt*2.4);leg.foot.x+=(want.x-leg.foot.x)*ks;leg.foot.z+=(want.z-leg.foot.z)*ks;}
    else{
     const gap=Math.hypot(want.x-leg.foot.x,want.z-leg.foot.z),limit=moving?.6:.95;
     const busy=neighbours(i).some(n=>legs[n].step>0)||airborne>=Math.ceil(LEGS/3),stir=!moving&&Math.random()<dt*.2;
     if((gap>limit||stir)&&!busy){leg.from.copy(leg.foot);leg.to.copy(want);if(moving)leg.to.addScaledVector(vel,.15);leg.step=.001;leg.duration=heavy*(.26+Math.random()*.12)/(1+surgeK*.4);leg.lift=.35+Math.random()*.25;}
    }
   }
   toParent(surface.set(leg.dir.x*BODY_R*.75,-BODY_R*.35,leg.dir.z*BODY_R*.75),surface);
   out.set(leg.foot.x-surface.x,0,leg.foot.z-surface.z);if(out.lengthSq()<1e-4)out.copy(leg.dir);out.normalize();
   const lifted=leg.step>0||leg.free;leg.lie+=((lifted||dead&&seize>0?0:1)-leg.lie)*(1-Math.exp(-dt*(lifted?14:6)));
   arm(leg.i,surface,out,leg.foot,{lie:leg.lie,arch:state==='feed'?.25:dead?.2*(1-melt)+.05:lifted?.75:.32+.1*Math.sin(clock*1.3+leg.phase),
    writhe:dead?seize*2+.25*(1-melt):state==='feed'?.6:lifted?1.3:.8,r:leg.r*(dead?1-melt*.8:1),
    curl:dead?0:lifted?.8+.4*Math.sin(clock*3+leg.phase):leg.kind==='rear'?.1:.35+.25*Math.sin(clock*.9+leg.phase)});
  });
  // The whip-arm: carried coiled over the back, drawn back to strike, out along its line, wrapped round its catch.
  {
   const a=L(0,BODY_R*.55,-BODY_R*.1),q=Math.sin(clock*38)*.05,sl=Math.sin(clock*1.1),wl=Math.sin(clock*.7+1);
   let b=L(.1*wl,1.15,-.75),cc=L(.15*sl,1.75,-.15+.1*wl),d=L(.1*sl,1.15+.1*wl,.45+.1*sl),writhe=0;
   if(state==='coil'){b=L(0,1.3,-.9);cc=L(q,2.1,-1.35);d=L(q,1.5,-.55+q);}
   else if(state==='rear'){b=L(0,1.4,.1);cc=L(0,2.6,.5);d=L(0,2.2,1.1);}
   else if(state==='slash'){b=L(0,1.5,.4);cc=L(0,.9,1.7);d=L(0,-pose.height+.03,1.65);}
   else if(state==='lunge'&&lash){
    const outK=Math.min(1,t*HORROR.lashSpeed/Math.max(.5,lash.len)),tip=new THREE.Vector3(lash.x,1,lash.z).sub(a);
    d=a.clone().addScaledVector(tip,outK);b=a.clone().addScaledVector(tip,outK*.3).addScaledVector(up,.7*(1-outK)+.25);cc=a.clone().addScaledVector(tip,outK*.7).addScaledVector(up,.35*(1-outK)+.1);
   }else if((state==='reel'||state==='feed')&&lash){
    const w=clock*(state==='feed'?7:4),chest=new THREE.Vector3(player.x,1.05,player.z);
    d=new THREE.Vector3(player.x+Math.sin(w)*.3,1.05+.1*Math.sin(w*.7),player.z+Math.cos(w)*.3);
    cc=chest.clone().add(new THREE.Vector3(toIt.x*.55,.15,toIt.y*.55));b=a.clone().lerp(cc,.4);b.y+=.3;writhe=.3;
   }else if(state==='recover'&&lash){
    // Missed: dragged back across the floor, still writhing.
    const k2=smooth(0,1,t/((c.dazed||HORROR.retractTime)*.9));d=new THREE.Vector3(lash.x,.06,lash.z).lerp(L(0,-pose.height+.06,1.1),k2);d.y=.06;
    b=a.clone().lerp(d,.3);b.y+=.35;cc=d.clone().lerp(a,.3);cc.y=.15+.1*Math.sin(clock*9);writhe=1.6;
   }else if(state==='flee'){b=L(0,.4,.5);cc=L(0,.1,1.4);d=L(Math.sin(clock*7)*.2,-pose.height*.5,2.1);writhe=1;}
   else if(dead){b=L(0,.3,-.6);cc=L(.2,0,-1.1);d=L(.5*(1+melt*.3),-pose.height+.03,-1.4*(1+melt*.3));writhe=seize*2;}
   if(writhe){const w=clock*2.6;b.x+=Math.sin(w)*.15*writhe;b.z+=Math.cos(w*1.3)*.15*writhe;cc.x+=Math.sin(w*1.7+1)*.2*writhe;cc.z+=Math.cos(w*1.1+2)*.2*writhe;}
   const k4=LASH*4;P[k4].copy(a);P[k4+1].copy(b);P[k4+2].copy(cc);P[k4+3].copy(d);R[LASH]=.105*(dead?1-melt*.8:1);
  }
  // The beard hangs from under the main mouth and never stops moving.
  for(const bb of beard){
   const from=L(bb.x*BODY_R,-.12,BODY_R*.85);
   const w=clock*(3+bb.phase*.3)+bb.phase,swing=state==='feed'?1.6:state==='rear'||state==='coil'?2:1;
   const tip=L(bb.x*BODY_R+Math.sin(w)*.25*swing,-.25-bb.len*.8+Math.sin(w*1.3)*.1,BODY_R*.95+bb.len*.5+Math.cos(w*.8)*.2*swing);
   tip.y=Math.max(.04,tip.y);
   out.set(tip.x-from.x,0,tip.z-from.z).normalize();
   arm(bb.i,from,out,tip,{arch:-.1,writhe:1.8*swing,r:.045*(1-melt)});
  }
  // Suckers on each arm's underside, from a third of the way along to near the tip.
  const a=new THREE.Vector3(),T=new THREE.Vector3(),N=new THREE.Vector3(),B=new THREE.Vector3();
  armed.forEach((ti,li)=>{const kk=ti*4;for(let s=0;s<SUCKERS;s++){const tt=.32+s*.12;
   bez(P[kk],P[kk+1],P[kk+2],P[kk+3],tt,a);bezTan(P[kk],P[kk+1],P[kk+2],P[kk+3],tt,T);
   N.crossVectors(T,Math.abs(T.y)>.97?new THREE.Vector3(1,0,0):up).normalize();B.crossVectors(T,N);
   const r=R[ti]*(1-.84*tt);dummy.position.copy(a).addScaledVector(B,r*.92);dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),B);
   dummy.scale.setScalar(melt>.5?0:r*.55);dummy.updateMatrix();suckers.setMatrixAt(li*SUCKERS+s,dummy.matrix);}});
  suckers.instanceMatrix.needsUpdate=true;
  // Slime: dripping when it rears, feeds or dies.
  if((state==='rear'||state==='coil'||state==='feed'||seize>.1)&&Math.random()<dt*14)drip(L((Math.random()-.5)*.6,-.3,(Math.random()-.2)*.6),.015+Math.random()*.02);
  dropState.forEach((d,i)=>{
   if(d.alive){d.v.y-=9*dt;d.p.addScaledVector(d.v,dt);if(d.p.y<=0){d.alive=false;splat(d.p.x,d.p.z,d.size*2.4+Math.random()*.02,5);}}
   if(d.alive){dummy.position.copy(d.p);const st=1+Math.min(2.5,-d.v.y*.35);dummy.scale.set(d.size,d.size*st,d.size);}else dummy.scale.setScalar(0);
   dummy.quaternion.identity();dummy.updateMatrix();drops.setMatrixAt(i,dummy.matrix);});
  splatState.forEach((s,i)=>{s.age+=dt;const kk=s.age/s.life,grow=Math.min(1,s.age*6)*(kk>.7?Math.max(0,(1-kk)/.3):1);
   dummy.position.set(s.x,.012+i*.00005,s.z);dummy.quaternion.identity();dummy.rotation.set(0,i*1.7,0);dummy.scale.set(s.r*grow,1,s.r*grow*(1+.15*Math.sin(i)));if(kk>=1)dummy.scale.setScalar(0);dummy.updateMatrix();splats.setMatrixAt(i,dummy.matrix);});
  drops.instanceMatrix.needsUpdate=splats.instanceMatrix.needsUpdate=true;
  // Ink billows out, slows and thins away.
  inkState.forEach((s,i)=>{s.age+=dt;
   if(s.age<0||s.age>=s.life){dummy.scale.setScalar(0);}
   else{const drag=Math.exp(-dt*2.6);s.v.multiplyScalar(drag);s.v.y-=dt*.3;s.p.addScaledVector(s.v,dt);s.p.y=Math.max(.12,s.p.y);
    const kk=s.age/s.life;dummy.position.copy(s.p);dummy.scale.setScalar(s.r*(1+s.age*1.3)*(kk>.55?Math.max(0,(1-kk)/.45):Math.min(1,s.age*12)));}
   dummy.quaternion.identity();dummy.updateMatrix();ink.setMatrixAt(i,dummy.matrix);});
  ink.instanceMatrix.needsUpdate=true;
  // The pool it melts into: spreads, bubbles, then soaks into the ground.
  if(dead){
   const grow=smooth(.3,2.4,t),soak=t>5.1?Math.max(0,1-(t-5.1)/1.3):1,r=(.35+1.05*grow)*soak;
   puddle.visible=r>.01;puddle.position.set(pos.x,.004,pos.z);puddle.rotation.y=pose.yaw;
   puddle.scale.set(r*(1+.03*Math.sin(clock*2)),Math.max(.25,grow)*(1+.2*Math.sin(clock*1.3)+.6*(1-grow))*soak,r*(1+.03*Math.cos(clock*1.7)));
   if(t>.8&&t<5.4&&Math.random()<dt*7){const bs=bubbleState[nextBubble];nextBubble=(nextBubble+1)%BUBBLES;const ang=Math.random()*Math.PI*2,rr=Math.sqrt(Math.random())*r*.7;Object.assign(bs,{x:pos.x+Math.cos(ang)*rr,z:pos.z+Math.sin(ang)*rr,age:0,life:.4+Math.random()*.6,r:.03+Math.random()*.06});}
  }else puddle.visible=false;
  bubbleState.forEach((bs,i)=>{bs.age+=dt;const kk=bs.age/bs.life;
   if(kk>=1&&kk<1.05)splat(bs.x,bs.z,bs.r*1.6,2);
   dummy.position.set(bs.x,.03,bs.z);dummy.quaternion.identity();dummy.scale.setScalar(kk<1?bs.r*Math.sqrt(kk):0);dummy.updateMatrix();bubbles.setMatrixAt(i,dummy.matrix);});
  bubbles.instanceMatrix.needsUpdate=true;
  blob.visible=mantle.visible=tubes.visible=suckers.visible=!(dead&&t>2.6);if(lite)suckers.visible=false;
  return events;
 }
 function hit(point,dir){
  pulse.value=1;
  for(let i=0;i<12;i++){const v=new THREE.Vector3(dir.x,0,dir.z).normalize().multiplyScalar(2+Math.random()*3).add(new THREE.Vector3((Math.random()-.5)*2.5,1+Math.random()*2,(Math.random()-.5)*2.5));
   drip(new THREE.Vector3(point.x+(Math.random()-.5)*.1,point.y+(Math.random()-.5)*.1,point.z+(Math.random()-.5)*.1),.015+Math.random()*.025,v);}
 }
 function reset(){started=false;legs.forEach(l=>{l.step=0;l.free=false;});inkState.forEach(s=>s.age=99);bubbleState.forEach(b=>b.age=99);}
 function burn(h,c){heat.value=h;char.value=c;}
 const burnPoints=Array.from({length:3+LEGS},()=>new THREE.Vector3());
 function burning(){
  [[0,.1,0],[.25,.15,.2],[-.25,.15,-.2]].forEach((o,i)=>burnPoints[i].set(o[0],o[1],o[2]).applyQuaternion(body.quaternion).add(body.position));
  legs.forEach((l,i)=>bez(P[l.i*4],P[l.i*4+1],P[l.i*4+2],P[l.i*4+3],.5,burnPoints[3+i]));return burnPoints;
 }
 return {root,body,legs,update,reset,hit,burn,burning,get position(){return body.position;},
  dispose(){parent.remove(root);owned.forEach(o=>o.dispose());mouths.forEach(m=>m.set.dispose());suckers.dispose();drops.dispose();splats.dispose();ink.dispose();bubbles.dispose();}};
}

function mergeAll(parts){
 const count=parts.reduce((n,g)=>n+g.attributes.position.count,0),out=new THREE.BufferGeometry();
 for(const name of ['position','normal','aTent']){const size=parts[0].attributes[name].itemSize,arr=new Float32Array(count*size);let o=0;for(const g of parts){arr.set(g.attributes[name].array,o);o+=g.attributes[name].array.length;}out.setAttribute(name,new THREE.BufferAttribute(arr,size));}
 parts.forEach(g=>g.dispose());return out;
}
