import * as THREE from 'three';
import {SIGHT_PARS} from './cave-view.js';
import {CRAWLER} from './crawler.js';

/**
 * What hunts on Mars: a heap of green jelly walking on its own tentacles. It takes the crawler's place in every sim
 * (crawler.js, raids, caves) and draws itself here, behind the same view interface as crawler-view.js, so it walks the
 * same stop-start, twitching gait: tentacle tips plant like feet and snap to a new hold when left behind.
 *
 * The body is a wobbling translucent-looking blob with veins glowing through it, a toothed mouth in front and eyes
 * clustered round it. It grows worse with size: more tentacles, more mouths (on the flanks, then one gaping on top),
 * and from the drone up a beard of face tentacles writhing under the main mouth.
 *
 * Tentacles are one mesh: each is a tube bent in the vertex shader along a cubic Bézier set per frame (uP), tapering
 * to the tip. Suckers ride their undersides, placed on the CPU with the same curve. Everything is in the parent's space;
 * callers scale a holder to the creature's size, as for the crawler.
 */
const MAXT=16,SUCKERS=5,BODY_R=.52;
const REST_HEIGHT={emerge:.4,idle:.82,lurk:.82,stalk:.7,close:.66,skitter:.78,evade:.66,flee:.84,recover:.76,slash:.95,recoil:1.1,hit:.85,shriek:1.6,lunge:.55,grab:1.75,dead:.22,thrown:1.2};
const OPEN={shriek:1,lunge:.9,grab:1,slash:.6,hit:.4};
const GREEN=new THREE.Color('#2f7a2a'),DEEP=new THREE.Color('#123d16');

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
/** Veins of light under the skin, slowly pulsing, and the burn: charred crust cracking on heat. */
const SKIN=`uniform float uTime;uniform float uHeat;uniform float uChar;uniform float uVeins;varying vec3 vHz;
float hzVein(){vec3 g=vHz*vec3(9.,7.,9.);float n=sin(g.x+sin(g.z*1.3+uTime*.4)*1.8)*sin(g.z+sin(g.y*1.7)*2.)*sin(g.y*1.4+sin(g.x*1.1)*1.6);
 return smoothstep(.94,.995,1.-abs(n))*(.55+.45*sin(uTime*1.7+vHz.y*5.+vHz.x*3.));}
vec3 hzBurn(vec3 c){if(uChar+uHeat<.001)return c;vec3 g=vHz*vec3(38.,44.,40.);
 float n=sin(g.x+sin(g.z*.9+uTime*.3)*2.1)*sin(g.z+sin(g.y*1.1)*2.3)*sin(g.y*1.2+sin(g.x*.8)*1.7),crack=smoothstep(.82,.99,1.-abs(n));
 c=mix(c,vec3(.04,.036,.03)+c*.2,uChar*.85);return c+vec3(1.,.32,.05)*(crack*2.2+.18)*uHeat*(.65+.35*sin(uTime*11.+g.x*.4));}`;
const TO_CAVE='mat4 caveFrom=uToCave*modelMatrix;\n#ifdef USE_INSTANCING\ncaveFrom=caveFrom*instanceMatrix;\n#endif\n';

/** The jelly, physically lit on the surface or lit by the cave's sight underground. `deform`: body wobble and tentacles. */
function jelly({mode,sight,toCave,viewDir},shared,{tint,glow=1,deform=true}){
 const uniforms={...shared,uVeins:{value:glow}};
 const vertex=s=>{
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\n'+(deform?DEFORM:'varying vec3 vHz;'))
   .replace('#include <begin_vertex>',deform?'vec3 hzN=normal;vec3 transformed=position;hzDeform(transformed,hzN);vHz=position;':'vec3 transformed=position;vec3 hzN=normal;vHz=position;');
  if(deform)s.vertexShader=s.vertexShader.replace('#include <beginnormal_vertex>','vec3 objectNormal=normal;{vec3 q=position;hzDeform(q,objectNormal);}\n#ifdef USE_TANGENT\nvec3 objectTangent=vec3(tangent.xyz);\n#endif');
 };
 if(mode==='studio'){
  const m=new THREE.MeshPhysicalMaterial({color:tint,roughness:.28,clearcoat:.9,clearcoatRoughness:.18,sheen:.7,sheenColor:new THREE.Color('#9dff8a'),emissive:DEEP.clone().multiplyScalar(.35)});
  m.onBeforeCompile=s=>{Object.assign(s.uniforms,uniforms);vertex(s);
   s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\n'+SKIN).replace('#include <opaque_fragment>',`
    float rim=pow(1.-abs(dot(normal,normalize(vViewPosition))),2.6);
    outgoingLight+=vec3(.25,.8,.3)*rim*.55+vec3(.3,1.,.4)*hzVein()*uVeins*.9;outgoingLight=hzBurn(outgoingLight);
    #include <opaque_fragment>`);};
  m.customProgramCacheKey=()=>`horror-jelly:${deform}`;return m;
 }
 const m=new THREE.MeshBasicMaterial({color:tint,fog:false});
 m.onBeforeCompile=s=>{Object.assign(s.uniforms,uniforms,sight,{uToCave:toCave,uViewDir:viewDir});vertex(s);
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 uToCave;varying vec3 vCave;varying vec3 vCaveN;')
   .replace('#include <project_vertex>','#include <project_vertex>\n'+TO_CAVE+'vCave=(caveFrom*vec4(transformed,1.0)).xyz;vCaveN=normalize(mat3(caveFrom)*hzN);');
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 uViewDir;varying vec3 vCave;varying vec3 vCaveN;\n'+SKIN+SIGHT_PARS.replace('varying vec2 vCaveLocal;varying float vSeen;',''))
   .replace('#include <opaque_fragment>',`
    vec3 n=normalize(vCaveN),toLamp=normalize(vec3(uPlayer.x,1.5,uPlayer.y)-vCave),lit=caveSight(vCave.xz),glowAt=caveGlow(vCave.xz);
    float lamp=dot(caveSightRaw(vCave.xz),vec3(.33)),rim=pow(1.-abs(dot(n,uViewDir)),2.4);
    float glint=smoothstep(.93,.985,dot(reflect(-toLamp,n),uViewDir));
    // Jelly: lit through, so the far side glows where the lamp is behind it, with a hard wet glint and a bright rim.
    vec3 c=diffuseColor.rgb*lit*(.55+.6*max(0.,dot(n,toLamp)))+(diffuseColor.rgb*2.4+vec3(.06,.2,.06))*rim*(lamp*.9+.1)
     +vec3(.75,1.,.75)*glint*lamp*.9+glowAt*(.2+rim*.6)+vec3(.25,1.,.4)*hzVein()*uVeins*.4;
    outgoingLight=hzBurn(c);
    #include <opaque_fragment>`);};
 m.customProgramCacheKey=()=>`horror-jelly-sight:${deform}`;return m;
}
/** Hard parts (teeth, sucker rims, the throat): plain colour, lit like the cave or the surface. */
function flat({mode,sight,toCave},color,{rough=.4,shine=1.4}={}){
 if(mode==='studio')return new THREE.MeshStandardMaterial({color,roughness:rough});
 const m=new THREE.MeshBasicMaterial({color,fog:false});
 m.onBeforeCompile=s=>{Object.assign(s.uniforms,sight,{uToCave:toCave});
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 uToCave;varying vec3 vCave;').replace('#include <project_vertex>','#include <project_vertex>\n'+TO_CAVE+'vCave=(caveFrom*vec4(transformed,1.0)).xyz;');
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCave;\n'+SIGHT_PARS.replace('varying vec2 vCaveLocal;varying float vSeen;','')).replace('#include <opaque_fragment>',`outgoingLight=diffuseColor.rgb*(caveSight(vCave.xz)*${shine.toFixed(2)}+caveGlow(vCave.xz));\n#include <opaque_fragment>`);};
 m.customProgramCacheKey=()=>`horror-flat:${shine}`;return m;
}

/** How a creature of `size` is put together. Deterministic per size so a kind always looks the same. */
export function horrorPlan(size=1){
 const legs=size<.8?5:size<1.4?7:size<2.2?9:size<2.9?11:12,beard=size>=1.6?Math.min(MAXT-legs,size<2.4?3:4+Math.round(size-2.4)*1):0;
 const mouths=[{at:[0,.02,.95],dir:[0,-.15,1],r:.34}];
 if(size>=1.6)mouths.push({at:[.72,.12,.55],dir:[1,0,.6],r:.2},{at:[-.72,.12,.55],dir:[-1,0,.6],r:.2});
 if(size>=2.4)mouths.push({at:[0,.92,.05],dir:[0,1,.1],r:.3});
 const eyes=size<.8?3:size<1.4?5:size<2.4?8:12;
 return {legs,beard,mouths,eyes};
}

export function createHorrorView(parent,{mode='studio',sight=null,toCave=null,viewDir=null,size=1,lite=false}={}){
 const root=new THREE.Group(),owned=[],keep=x=>(owned.push(x),x);parent.add(root);
 const heavy=Math.sqrt(Math.max(1,size)),plan=horrorPlan(size),look={mode,sight,toCave,viewDir};
 const time={value:0},pulse={value:0},heat={value:0},char={value:0},squash={value:new THREE.Vector3(1,1,1)};
 const P=Array.from({length:MAXT*4},()=>new THREE.Vector3()),R=new Array(MAXT).fill(0);
 const shared={uTime:time,uPulse:pulse,uHeat:heat,uChar:char,uSquash:squash,uP:{value:P},uR:{value:R}};
 const skin=keep(jelly(look,shared,{tint:GREEN})),lip=keep(jelly(look,shared,{tint:new THREE.Color('#4a2a24'),glow:.3,deform:false}));
 const bone=keep(flat(look,'#d9d2a8',{rough:.25,shine:1.6})),throat=keep(flat(look,'#020302',{shine:0})),rimMat=keep(flat(look,'#b9c99a',{shine:1.2}));
 const eyeMat=keep(new THREE.MeshBasicMaterial({color:new THREE.Color(1,.92,.35),fog:false}));
 const shadows=mode==='studio'&&!lite;

 // Body: a wobbling blob (deformed in the shader; aTent -1).
 const body=new THREE.Group();root.add(body);
 const blobGeo=keep(new THREE.IcosahedronGeometry(BODY_R,lite?3:4));
 {const p=blobGeo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const k=1+.12*Math.sin(x*9+z*4)*Math.sin(y*7)+.06*Math.sin(z*13+y*5);p.setXYZ(i,x*k*1.08,y*k*.9,z*k*1.12);}
  blobGeo.computeVertexNormals();blobGeo.setAttribute('aTent',new THREE.Float32BufferAttribute(new Array(p.count).fill(-1),1));}
 const blob=new THREE.Mesh(blobGeo,skin);blob.castShadow=shadows;blob.frustumCulled=false;body.add(blob);

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

 // Tentacles: legs that plant like feet, and the beard that only writhes.
 const tubeParts=[];
 for(let i=0;i<MAXT;i++){const g=new THREE.CylinderGeometry(1,1,1,lite?6:8,lite?14:22,false).translate(0,.5,0);g.deleteAttribute('uv');g.setAttribute('aTent',new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(i),1));tubeParts.push(g.toNonIndexed());g.dispose();}
 const tubeGeo=keep(mergeAll(tubeParts));tubeGeo.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e4);
 const tubes=new THREE.Mesh(tubeGeo,skin);tubes.frustumCulled=false;root.add(tubes);
 const LEGS=plan.legs,BEARD=plan.beard,used=LEGS+BEARD;
 const legs=Array.from({length:LEGS},(_,i)=>{
  // Spread round the body, a gap left at the mouth.
  const a=Math.PI*.22+(i+.5)/LEGS*Math.PI*1.56,side=Math.sin(a)>=0?1:-1,reach=1.25+.2*Math.sin(i*2.7);
  return {i,a,side,dir:new THREE.Vector3(Math.sin(a),0,Math.cos(a)),rest:new THREE.Vector3(Math.sin(a)*reach,0,Math.cos(a)*reach),r:.085+.02*Math.sin(i*1.9),
   foot:new THREE.Vector3(),from:new THREE.Vector3(),to:new THREE.Vector3(),step:0,duration:.1,lift:.3,free:false,spasm:new THREE.Vector3(),spasmT:0,phase:i*1.37};
 });
 for(let i=used;i<MAXT;i++)R[i]=0;
 const beard=Array.from({length:BEARD},(_,k)=>({i:LEGS+k,x:(k/(Math.max(1,BEARD-1))-.5)*.5,len:.55+.25*((k*3)%4)/3,phase:k*2.1}));
 // Suckers on each leg's underside.
 const suckerGeo=keep(new THREE.TorusGeometry(1,.5,5,10)),suckers=new THREE.InstancedMesh(suckerGeo,rimMat,Math.max(1,LEGS*SUCKERS));suckers.frustumCulled=false;root.add(suckers);
 if(lite)suckers.visible=false;

 // Slime: drops that fall when it is hit or moves fast, and splats where they land.
 const dropMat=keep(flat(look,'#3d9a3a',{shine:1.6})),splatMat=keep(mode==='studio'?new THREE.MeshPhysicalMaterial({color:'#2d6e2a',roughness:.1,clearcoat:1,transparent:true,opacity:.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})
  :new THREE.MeshBasicMaterial({color:'#123a12',transparent:true,opacity:.85,depthWrite:false,fog:false,polygonOffset:true,polygonOffsetFactor:-2}));
 const DROPS=40,SPLATS=40,drops=new THREE.InstancedMesh(keep(new THREE.SphereGeometry(1,7,5)),dropMat,DROPS),splats=new THREE.InstancedMesh(keep(new THREE.CircleGeometry(1,16).rotateX(-Math.PI/2)),splatMat,SPLATS);
 drops.frustumCulled=splats.frustumCulled=false;root.add(drops,splats);
 const dropState=[...Array(DROPS)].map(()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),alive:false,size:.02})),splatState=[...Array(SPLATS)].map(()=>({x:0,z:0,r:0,age:99,life:8}));
 let nextDrop=0,nextSplat=0;
 const splat=(x,z,r,life=8)=>{const s=splatState[nextSplat];nextSplat=(nextSplat+1)%SPLATS;Object.assign(s,{x,z,r,age:0,life});};
 const drip=(p,size=.02+Math.random()*.02,v=null)=>{const d=dropState[nextDrop];nextDrop=(nextDrop+1)%DROPS;d.p.copy(p);if(v)d.v.copy(v);else d.v.set((Math.random()-.5)*.3,-.2,(Math.random()-.5)*.3);d.alive=true;d.size=size;};

 const pos=new THREE.Vector3(),vel=new THREE.Vector3(),last=new THREE.Vector3(),pose={height:.82,pitch:0,roll:0,open:0,yaw:0};
 const jerk={t:0,want:{yaw:0,pitch:0,roll:0,y:0,open:0},now:{yaw:0,pitch:0,roll:0,y:0,open:0}};
 let started=false,clock=0,go=true,goT=0,lastState='idle',aftershock=0,biteT=0,bite=1;
 const up=new THREE.Vector3(0,1,0),tmp=new THREE.Vector3(),dummy=new THREE.Object3D();
 const toParent=(local,out)=>out.copy(local).applyMatrix4(body.matrix);
 const home=(leg,out)=>{out.copy(leg.rest).applyAxisAngle(up,pose.yaw);out.x+=pos.x+vel.x*.25;out.z+=pos.z+vel.z*.25;out.y=0;return out;};
 const neighbours=i=>[(i+1)%LEGS,(i+LEGS-1)%LEGS];
 const bez=(a,b,c,d,t,out)=>{const u=1-t;return out.set(0,0,0).addScaledVector(a,u*u*u).addScaledVector(b,3*u*u*t).addScaledVector(c,3*u*t*t).addScaledVector(d,t*t*t);};
 const bezTan=(a,b,c,d,t,out)=>{const u=1-t;return out.set(0,0,0).addScaledVector(b.clone().sub(a),3*u*u).addScaledVector(c.clone().sub(b),6*u*t).addScaledVector(d.clone().sub(c),3*t*t).normalize();};

 /** One tentacle's curve: from the body's skin out along `dir`, arching up and over to `tip`, writhing as it goes. */
 function curve(i,root0,out,tip,{arch=.45,writhe=1,r}){
  const k=i*4,a=P[k],b=P[k+1],c=P[k+2],d=P[k+3],w=clock*(2.2+(i%3)*.4)+i*1.9;
  a.copy(root0);d.copy(tip);
  b.copy(root0).addScaledVector(out,.45).addScaledVector(up,arch);
  c.copy(tip).addScaledVector(up,arch*.9+.15).addScaledVector(out,-.15);
  b.x+=Math.sin(w)*.12*writhe;b.z+=Math.cos(w*1.3)*.12*writhe;b.y+=Math.sin(w*.7)*.06*writhe;
  c.x+=Math.sin(w*1.7+1)*.16*writhe;c.z+=Math.cos(w*1.1+2)*.16*writhe;
  R[i]=r;
 }

 /** `c`: the simulated creature {x,z,facing,state,t,speed}; `ctx.player`: {x,z}. Returns plant events, as crawler-view. */
 function update(c,dt,ctx={}){
  const events=[];time.value+=dt;clock+=dt;pulse.value*=Math.exp(-dt*5);
  const flung=c.state==='recoil'&&c.thrown?(c.t-CRAWLER.throwDelay)/(CRAWLER.throwTime+.15):-1;
  const state=flung>=0&&flung<1?'thrown':c.state==='recoil'&&c.thrown&&flung<0?'grab':c.state==='lurk'&&c.speed<.2?'idle':c.state==='march'?'stalk':c.state;
  const player=ctx.player??{x:c.x,z:c.z+2},dead=state==='dead';
  if(dead){if(c.t>3&&c.t<4.6&&aftershock<=0&&Math.random()<dt*1.6)aftershock=.2+Math.random()*.2;aftershock-=dt;}else aftershock=0;
  const seize=dead?Math.max(c.t<1.9?1:Math.max(0,1-(c.t-1.9)/1.1),aftershock>0?.55:0):0;
  const toIt=new THREE.Vector2(c.x-player.x,c.z-player.z);if(toIt.lengthSq()<1e-4)toIt.set(-Math.sin(c.facing),-Math.cos(c.facing));toIt.normalize();
  let tx=c.x,tz=c.z;
  if(state==='grab'){tx=player.x+toIt.x*.42;tz=player.z+toIt.y*.42;}
  // Moved further than it can go in a frame (spawned, teleported): plant everything afresh.
  if(started&&Math.hypot(tx-pos.x,tz-pos.z)>4)started=false;
  if(!started){started=true;pos.set(tx,0,tz);last.copy(pos);pose.yaw=c.facing;body.position.set(tx,REST_HEIGHT.idle,tz);body.updateMatrix();legs.forEach(l=>home(l,l.foot));}
  if(state==='hit'&&lastState!=='hit'){pos.x+=toIt.x*.4;pos.z+=toIt.y*.4;jerk.t=.12;Object.assign(jerk.want,{yaw:(Math.random()-.5)*.9,pitch:-.5,roll:(Math.random()-.5)*1.1,y:.15,open:.9});pulse.value=1;}
  lastState=state;
  // Stop-start, like the spiders: frozen, then a dart to catch up.
  const fast=state==='skitter'||state==='flee'||state==='evade'||state==='emerge';
  goT-=dt;if(goT<=0){go=!go;goT=heavy*(go?(fast?.05+Math.random()*.09:.08+Math.random()*.16):(fast?.03+Math.random()*.06:.08+Math.random()*.34));}
  const glide=state==='lunge'||state==='thrown'?28:state==='grab'?14:dead?6:go?22/heavy:.6*heavy;
  const k=1-Math.exp(-dt*glide);pos.x+=(tx-pos.x)*k;pos.z+=(tz-pos.z)*k;
  vel.set((pos.x-last.x)/Math.max(dt,1e-4),0,(pos.z-last.z)/Math.max(dt,1e-4));last.copy(pos);
  let yawDiff=c.facing-pose.yaw;yawDiff=Math.atan2(Math.sin(yawDiff),Math.cos(yawDiff));pose.yaw+=yawDiff*(1-Math.exp(-dt*(go?12:3)));
  jerk.t-=dt;
  if(jerk.t<=0){const r=()=>Math.random()*2-1,big=seize>.05,amount=big?seize:state==='grab'?1.5:state==='shriek'?.7:1;
   jerk.t=big?.035+Math.random()*.09:state==='grab'?.03+Math.random()*.07:heavy*(.1+Math.random()*.5);
   Object.assign(jerk.want,big?{yaw:r()*.5*amount,pitch:r()*.5*amount,roll:r()*.7*amount,y:Math.random()*.2*amount,open:Math.random()*amount}
    :{yaw:r()*.18*amount,pitch:r()*.12*amount,roll:r()*.1*amount,y:r()*.04*amount,open:Math.random()<.15?.2+Math.random()*.3:0});}
  const snap=1-Math.exp(-dt*(seize>.05?60:40));for(const key in jerk.want)jerk.now[key]+=(jerk.want[key]-jerk.now[key])*snap;
  const breathe=Math.sin(clock*1.4)*.04,thrown=state==='thrown';
  const wantHeight=thrown?1.75*(1-flung)+.8*flung+1.1*Math.sin(Math.PI*flung):dead?.22+.15*seize:(REST_HEIGHT[state]??.82)+breathe;
  pose.height+=(wantHeight-pose.height)*(1-Math.exp(-dt*(thrown?30:dead||state==='shriek'||state==='lunge'?10:5)));
  const pitchWant=({shriek:-.6,recoil:-.4,lunge:.3,grab:.5,slash:-.15})[state]??0;
  pose.pitch+=(pitchWant-pose.pitch)*(1-Math.exp(-dt*8));
  if(thrown)pose.roll+=dt*14;else{pose.roll=Math.atan2(Math.sin(pose.roll),Math.cos(pose.roll));pose.roll+=((state==='hit'?.3*Math.sin(c.t*20):0)-pose.roll)*(1-Math.exp(-dt*8));}
  biteT-=dt;if(biteT<=0){biteT=.03+Math.random()*.08;bite=Math.random()<.35?.4+Math.random()*.2:.95+Math.random()*.35;}
  const wantOpen=Math.max((OPEN[state]??.08+.08*Math.sin(clock*.9))*(state==='grab'?bite:state==='shriek'?.85+.15*Math.sin(clock*30):1),jerk.now.open,dead?.6*seize:0);
  pose.open+=(wantOpen-pose.open)*(1-Math.exp(-dt*(state==='grab'?40:wantOpen>pose.open?18:7)));
  body.position.set(pos.x,pose.height+jerk.now.y,pos.z);
  body.rotation.set(0,0,0);body.rotateY(pose.yaw+jerk.now.yaw);body.rotateX(THREE.MathUtils.clamp(pose.pitch+jerk.now.pitch,-1.2,1.2));body.rotateZ(pose.roll+jerk.now.roll);body.updateMatrix();
  // Jelly: squashes as it lands from a dart, swells to bite, slumps and melts dead.
  const melt=dead?Math.max(0,Math.min(1,(c.t-3.8)/1.8)):0,speed=vel.length();
  squash.value.set(1+.08*Math.sin(clock*3)+melt*.6+pose.open*.12,(1-.08*Math.sin(clock*3))*(1-melt*.7)*(dead?.7:1)*(1+Math.min(.15,speed*.02)),1+melt*.4+pose.open*.08);
  for(const m of mouths){const o=pose.open;m.ring.scale.setScalar(m.r*.62*(1+o*.55));m.hole.scale.setScalar(m.r*.6*(1+o*.7));m.teeth.scale.setScalar(1+o*.6);m.fangs.forEach((f,j)=>{dummy.position.set(f.x,f.y,f.z);dummy.rotation.set(0,0,f.a-Math.PI/2);dummy.rotateX(-(.9+f.row*.3)+o*.75);dummy.scale.setScalar(f.s);dummy.updateMatrix();m.set.setMatrixAt(j,dummy.matrix);});m.set.instanceMatrix.needsUpdate=true;m.g.visible=melt<.9;}
  for(const e of eyes){e.t-=dt;if(e.t<0)e.t=2+Math.random()*5;const blink=e.t<.12?Math.abs(e.t-.06)/.06:1;e.e.scale.set(e.base,e.base*Math.max(.08,blink)*(dead?Math.max(0,1-c.t/2):1),e.base);}

  // Where tentacles reach for each state; null leaves the leg to walk.
  const reach=(leg)=>{
   const s=leg.side,front=Math.cos(leg.a)>.2,local=v=>toParent(v,new THREE.Vector3());
   if(state==='shriek')return local(new THREE.Vector3(leg.dir.x*1.1,.6+.5*Math.sin(clock*9+leg.phase),leg.dir.z*1.1+.3));
   if(state==='lunge'&&front&&c.t<.45)return local(new THREE.Vector3(leg.dir.x*.6,-.3,1.6));
   if(state==='slash'&&leg.i===Math.floor(LEGS/2))return new THREE.Vector3(player.x,c.t<.2?1.9:1.3,player.z);
   if(state==='grab'){
    // Wrapped round the player from helmet to knees, never still: each grip jabs to a new hold every few frames.
    leg.spasmT-=dt;if(leg.spasmT<=0){leg.spasmT=.03+Math.random()*.06;leg.spasm.set((Math.random()*2-1)*.35,(Math.random()*2-1)*.12,(Math.random()*2-1)*.05);}
    const back=Math.atan2(toIt.x,toIt.y),around=back+(leg.i/LEGS-.5)*5.6+leg.spasm.x,h=.5+1.4*((leg.i*5)%LEGS)/LEGS+leg.spasm.y;
    return new THREE.Vector3(player.x+Math.sin(around)*(.34+leg.spasm.z),h,player.z+Math.cos(around)*(.34+leg.spasm.z));
   }
   if(thrown||dead){
    leg.spasmT-=dt;if(leg.spasmT<=0){leg.spasmT=.03+Math.random()*.1;leg.spasm.set(leg.dir.x*(.5+Math.random()*1.2)+(Math.random()-.5)*.6,dead?-.2+Math.random()*.9:-.5+Math.random()*1.2,leg.dir.z*(.5+Math.random()*1.2)+(Math.random()-.5)*.6);}
    const limp=local(new THREE.Vector3(leg.dir.x*(1.1+melt*.5),-pose.height+.03,leg.dir.z*(1.1+melt*.5)));
    return dead?limp.lerp(local(leg.spasm.clone()),seize):local(leg.spasm.clone());
   }
   return null;
  };
  const airborne=legs.filter(l=>l.step>0).length,surface=new THREE.Vector3(),out=new THREE.Vector3();
  legs.forEach((leg,i)=>{
   const target=reach(leg);
   if(target){if(leg.step<=0)leg.free=true;
    if(leg.free){const rate=state==='grab'?45:state==='slash'||state==='lunge'||thrown||dead?30:14;leg.foot.lerp(target,1-Math.exp(-dt*rate));leg.foot.y=Math.max(.02,leg.foot.y);}}
   else if(leg.free){leg.free=false;leg.from.copy(leg.foot);home(leg,leg.to);leg.step=.001;leg.duration=.12;leg.lift=.2;}
   if(leg.step>0){
    leg.step+=dt/leg.duration;const s=Math.min(1,leg.step),e=1-Math.pow(1-s,3);
    leg.foot.lerpVectors(leg.from,leg.to,e);leg.foot.y=Math.max(leg.to.y,Math.sin(s*Math.PI)*leg.lift);
    if(s>=1){leg.step=0;leg.foot.copy(leg.to);events.push({type:'plant',x:leg.foot.x,z:leg.foot.z});if(Math.random()<.2)splat(leg.foot.x,leg.foot.z,.04+Math.random()*.05,5);}
   }else if(!leg.free&&!dead){
    const want=home(leg,tmp.clone()),gap=Math.hypot(want.x-leg.foot.x,want.z-leg.foot.z),moving=vel.length()>.3,limit=moving?.4:.85;
    const busy=neighbours(i).some(n=>legs[n].step>0)||airborne>=Math.ceil(LEGS/2.5),twitch=Math.random()<dt*(moving?.8:2.4);
    if((gap>limit||twitch)&&!busy){const tap=twitch&&gap<limit&&Math.random()<.45;
     leg.from.copy(leg.foot);leg.to.copy(tap?leg.foot:want);if(twitch&&gap<limit&&!tap)leg.to.add(new THREE.Vector3((Math.random()-.5)*.4,0,(Math.random()-.5)*.4));
     if(!tap)leg.to.addScaledVector(vel,.1);leg.step=.001;leg.duration=heavy*(tap?.06+Math.random()*.03:fast?.06+Math.random()*.03:.08+Math.random()*.06);leg.lift=tap?.12+Math.random()*.15:.3+Math.random()*.2;}
   }
   // From the skin, curling up and over to the tip; a lifted tentacle arches higher and curls more.
   toParent(surface.set(leg.dir.x*BODY_R*.75,-BODY_R*.35,leg.dir.z*BODY_R*.75),surface);
   out.set(leg.foot.x-surface.x,0,leg.foot.z-surface.z);if(out.lengthSq()<1e-4)out.copy(leg.dir);out.normalize();
   const lifted=leg.step>0||leg.free;
   curve(leg.i,surface,out,leg.foot,{arch:state==='grab'?.25:lifted?.65:.4+.1*Math.sin(clock*2+leg.phase),writhe:dead?seize*2+.2:state==='grab'?.6:lifted?1.6:1,r:leg.r*(1+(dead?melt*.4:0))});
  });
  // The beard hangs from under the main mouth and never stops moving.
  for(const b of beard){
   const from=toParent(new THREE.Vector3(b.x*BODY_R,-.12,BODY_R*.85),new THREE.Vector3());
   const w=clock*(3+b.phase*.3)+b.phase,swing=state==='grab'?1.6:state==='shriek'?2:1;
   const tip=toParent(new THREE.Vector3(b.x*BODY_R+Math.sin(w)*.25*swing,-.25-b.len*.8+Math.sin(w*1.3)*.1,BODY_R*.95+b.len*.5+Math.cos(w*.8)*.2*swing),new THREE.Vector3());
   tip.y=Math.max(.04,tip.y);
   out.set(tip.x-from.x,0,tip.z-from.z).normalize();
   curve(b.i,from,out,tip,{arch:-.1,writhe:1.8*swing,r:.045});
  }
  // Suckers on each leg's underside, from a third of the way along to near the tip.
  const a=new THREE.Vector3(),T=new THREE.Vector3(),N=new THREE.Vector3(),B=new THREE.Vector3();
  legs.forEach((leg,li)=>{const kk=leg.i*4;for(let s=0;s<SUCKERS;s++){const t=.32+s*.12;
   bez(P[kk],P[kk+1],P[kk+2],P[kk+3],t,a);bezTan(P[kk],P[kk+1],P[kk+2],P[kk+3],t,T);
   N.crossVectors(T,Math.abs(T.y)>.97?new THREE.Vector3(1,0,0):up).normalize();B.crossVectors(T,N);
   const r=R[leg.i]*(1-.84*t);dummy.position.copy(a).addScaledVector(B,r*.92);dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),B);
   dummy.scale.setScalar(dead&&melt>.8?0:r*.55);dummy.updateMatrix();suckers.setMatrixAt(li*SUCKERS+s,dummy.matrix);}});
  suckers.instanceMatrix.needsUpdate=true;
  // Slime: dripping when it rears, bites or dies.
  if((state==='shriek'||state==='grab'||seize>.1)&&Math.random()<dt*14)drip(toParent(new THREE.Vector3((Math.random()-.5)*.6,-.3,(Math.random()-.2)*.6),new THREE.Vector3()),.015+Math.random()*.02);
  dropState.forEach((d,i)=>{
   if(d.alive){d.v.y-=9*dt;d.p.addScaledVector(d.v,dt);if(d.p.y<=0){d.alive=false;splat(d.p.x,d.p.z,d.size*2.4+Math.random()*.02,5);}}
   if(d.alive){dummy.position.copy(d.p);const st=1+Math.min(2.5,-d.v.y*.35);dummy.scale.set(d.size,d.size*st,d.size);}else dummy.scale.setScalar(0);
   dummy.quaternion.identity();dummy.updateMatrix();drops.setMatrixAt(i,dummy.matrix);});
  if(dead&&c.t>3.8&&c.t<5.6&&Math.random()<dt*10)splat(pos.x+(Math.random()-.5)*.8,pos.z+(Math.random()-.5)*.9,.3+Math.random()*.35,14);
  splatState.forEach((s,i)=>{s.age+=dt;const kk=s.age/s.life,grow=Math.min(1,s.age*6)*(kk>.7?Math.max(0,(1-kk)/.3):1);
   dummy.position.set(s.x,.012+i*.00005,s.z);dummy.quaternion.identity();dummy.rotation.set(0,i*1.7,0);dummy.scale.set(s.r*grow,1,s.r*grow*(1+.15*Math.sin(i)));if(kk>=1)dummy.scale.setScalar(0);dummy.updateMatrix();splats.setMatrixAt(i,dummy.matrix);});
  drops.instanceMatrix.needsUpdate=splats.instanceMatrix.needsUpdate=true;
  blob.visible=tubes.visible=!(dead&&c.t>5.8);
  return events;
 }
 function hit(point,dir){
  pulse.value=1;
  for(let i=0;i<12;i++){const v=new THREE.Vector3(dir.x,0,dir.z).normalize().multiplyScalar(2+Math.random()*3).add(new THREE.Vector3((Math.random()-.5)*2.5,1+Math.random()*2,(Math.random()-.5)*2.5));
   drip(new THREE.Vector3(point.x+(Math.random()-.5)*.1,point.y+(Math.random()-.5)*.1,point.z+(Math.random()-.5)*.1),.015+Math.random()*.025,v);}
 }
 function reset(){started=false;legs.forEach(l=>{l.step=0;l.free=false;});}
 function burn(h,c){heat.value=h;char.value=c;}
 const burnPoints=Array.from({length:3+LEGS},()=>new THREE.Vector3());
 function burning(){
  [[0,.1,0],[.25,.15,.2],[-.25,.15,-.2]].forEach((o,i)=>burnPoints[i].set(o[0],o[1],o[2]).applyQuaternion(body.quaternion).add(body.position));
  legs.forEach((l,i)=>bez(P[l.i*4],P[l.i*4+1],P[l.i*4+2],P[l.i*4+3],.5,burnPoints[3+i]));return burnPoints;
 }
 return {root,body,legs,update,reset,hit,burn,burning,get position(){return body.position;},
  dispose(){parent.remove(root);owned.forEach(o=>o.dispose());mouths.forEach(m=>m.set.dispose());suckers.dispose();drops.dispose();splats.dispose();}};
}

function mergeAll(parts){
 const count=parts.reduce((n,g)=>n+g.attributes.position.count,0),out=new THREE.BufferGeometry();
 for(const name of ['position','normal','aTent']){const size=parts[0].attributes[name].itemSize,arr=new Float32Array(count*size);let o=0;for(const g of parts){arr.set(g.attributes[name].array,o);o+=g.attributes[name].array.length;}out.setAttribute(name,new THREE.BufferAttribute(arr,size));}
 parts.forEach(g=>g.dispose());return out;
}
