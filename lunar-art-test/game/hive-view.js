import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {SIGHT_PARS} from './cave-view.js';
import {gooInk} from './crawler-view.js';
import {createNestView} from './nest-view.js';
import {isBurnt} from './infest.js';
import {flareNow} from './peril.js';

/**
 * The infestation drawn underground, all of it one living goo: nests in the walls, pools of black tar with red veins
 * and pustules that beat together, tendrils creeping out over bare rock, coral grown from the same stuff, relics half
 * swallowed, and silk: walls of it sealing passages and webs strung across corners. Silk burns away from a front of
 * embers; webs a flare lands under burn too, but only for as long as the player stays in the cave.
 *
 * Everything is built in the cave root's space, from the layout (caves.js) and the burn state (infest.js).
 */
const C=2,BEAT=2.4;
const rng=seed=>{let s=Math.floor(seed*2147483646)+1;return ()=>(s=s*16807%2147483647)/2147483647;};

/** The crawler's goo, with red veins running through it and, for pustules, a red core lit from inside. */
function hiveGoo(opts,amount,beat,{veins=0,core=0}={}){
 const m=gooInk(opts,amount),base=m.onBeforeCompile;
 m.onBeforeCompile=(shader,renderer)=>{
  base(shader,renderer);
  shader.uniforms.uBeat=beat;
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uBeat;').replace('#include <opaque_fragment>',`
   float seen=caveSeen(vCave.xz);
   if(seen<.02)discard;
   // Tar: a broad wet sheen of the lamp and any flare across it, so a pool reads as a glossy skin, not a hole.
   float sheen=pow(max(0.0,dot(reflect(-toLamp,n),uViewDir)),10.0)*(.4+.6*wet);
   outgoingLight+=vec3(.6,.64,.72)*lampLevel*sheen*.55+caveGlow(vCave.xz)*(.05+sheen*.5)+caveSight(vCave.xz)*.035*max(0.0,n.y);
   ${veins?`vec2 q=vCave.xz*1.6+vCave.y*.8+vec2(caveNoise(vCave.xz*.8),caveNoise(vCave.xz*.8+7.1))*1.8;
   float vein=smoothstep(.955,.99,1.0-abs(caveNoise(q)*2.0-1.0))*smoothstep(.35,.6,caveNoise(q*.37+9.0))+.5*smoothstep(.965,.995,1.0-abs(caveNoise(q*2.3+3.7)*2.0-1.0));
   float flow=.5+.5*sin(dot(vCave.xz,vec2(.7,.5))*3.0-uTime*1.3);
   outgoingLight+=vec3(1.0,.07,.02)*vein*${veins.toFixed(2)}*(.2+.8*uBeat)*(.4+.6*flow)*seen;`:''}
   ${core?`float face=abs(dot(n,uViewDir));
   outgoingLight+=vec3(1.0,.09,.03)*pow(face,2.5)*${core.toFixed(2)}*(.3+.7*uBeat)*seen;`:''}
   #include <opaque_fragment>`);
 };
 m.customProgramCacheKey=()=>`hive-goo:${amount}:${veins}:${core}`;
 return m;
}

const SIGHT_VERT='varying vec2 vCaveLocal;varying float vSeen;';
/** Red light under a black skin: tendrils (pulses run along them) and the throats of coral tubes. */
function emberMaterial(sight,shared,{tube}){
 return new THREE.ShaderMaterial({uniforms:{...sight,...shared},fog:false,
  vertexShader:`${SIGHT_VERT}varying vec2 vUv;varying vec3 vPos;void main(){vUv=uv;vPos=position;vCaveLocal=position.xz;vSeen=1.0;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`${SIGHT_PARS}uniform float uTime;uniform float uBeat;varying vec2 vUv;varying vec3 vPos;
  void main(){
   float seen=caveSeen(vPos.xz);
   if(seen<.02)discard;
   ${tube?`float run=pow(.5+.5*sin(vUv.x*40.0-uTime*2.6),6.0),core=pow(1.0-abs(vUv.y-.5)*2.0,3.0);
   vec3 skin=vec3(.02,.015,.017)*caveSight(vPos.xz)*3.0+caveGlow(vPos.xz)*.04;
   vec3 c=skin+vec3(1.0,.07,.02)*core*(.12+.7*run)*(.35+.65*uBeat)*seen;`
   :`float r=length(vUv-.5)*2.0;vec3 c=vec3(1.0,.1,.03)*(1.0-r*r)*(.35+.9*uBeat)*seen;`}
   gl_FragColor=vec4(c,1.0);
  }`});
}

/** Silk: a film with threads through it, lit only by the lamp and flares. A web is (θ, ρ) from its corner; a wall is (u, v). */
function silkMaterial(sight,shared,{web,size,seed,toCam}){
 return new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false,
  uniforms:{...sight,...shared,uBurn:{value:-1},uGrow:{value:1},uIgnite:{value:new THREE.Vector2(.5,.1)},uSize:{value:size},uSeed:{value:seed},uToCam:toCam},
  vertexShader:`${SIGHT_VERT}varying vec2 vUv;varying vec3 vPos;void main(){vUv=uv;vPos=position;vCaveLocal=position.xz;vSeen=1.0;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader:`${SIGHT_PARS}uniform float uTime;uniform float uBurn;uniform float uGrow;uniform vec2 uIgnite;uniform vec2 uSize;uniform float uSeed;uniform vec2 uToCam;
  varying vec2 vUv;varying vec3 vPos;
  float thread(float x,float px){return 1.0-clamp(abs(fract(x+.5)-.5)/max(fwidth(x),1e-4)-px,0.0,1.0);}
  void main(){
   vec2 p=vUv*uSize;float threads,film;
   ${web?`float th=vUv.x+(caveNoise(vec2(vUv.y*4.0,uSeed*9.0))-.5)*.06,rho=vUv.y;
   float spokes=thread(th*9.0,.6),rings=thread(rho*11.0+caveNoise(vec2(th*5.0,uSeed))*.6,.3)*smoothstep(.04,.12,rho);
   float torn=step(caveNoise(vec2(th*7.0,rho*5.0)+uSeed*13.0),.22+.35*rho*rho);
   threads=max(spokes*.8,rings*.7)*(1.0-torn);
   film=(.22*(1.0-rho)+.06)*(.5+caveNoise(p*3.0+uSeed*5.0))*(1.0-torn*.7);
   if(rho>.97-.2*caveNoise(vec2(th*6.0,uSeed*3.0)))discard;`
   :`threads=0.0;
   for(int i=0;i<4;i++){float a=float(i)*1.9+uSeed*6.0;vec2 d=vec2(cos(a),sin(a));
    float warp=caveNoise(p*.7+float(i)*4.1)*3.2+caveNoise(p*2.6+float(i)*2.3)*.9;
    threads+=thread(dot(p,d)*(2.6+float(i)*.9)+warp,.25)*smoothstep(.45,.75,caveNoise(p*.9+float(i)*5.3+uSeed*3.0));}
   threads=min(1.0,threads)*.7;
   float cloud=caveNoise(p*1.3+uSeed*4.0)*.6+caveNoise(p*3.7)*.3+caveNoise(p*9.0)*.1;
   film=.42+.38*smoothstep(.25,.8,cloud);
   float end=min(vUv.y,1.0-vUv.y)-.03*caveNoise(vec2(p.x*3.0,uSeed*7.0));
   if(end<0.0)discard;
   film*=smoothstep(0.0,.05,end);`}
   // Grows back in from scattered knots.
   if(caveNoise(p*2.3+uSeed*11.0)*.999>uGrow)discard;
   vec3 light=caveSight(vPos.xz)*1.15+caveGlow(vPos.xz)*.9;
   float seen=caveSeen(vPos.xz);
   vec3 c=vec3(.8,.82,.88)*light*(threads*1.3+film*.8);
   float a=clamp(threads*.85+film,0.0,1.0)*seen;
   if(uBurn>=0.0){
    float d=length(p-uIgnite*uSize)+(caveNoise(p*3.0)-.5)*.5,front=uBurn*1.3;
    ${web?'float keep=0.0;':'float keep=1.0-smoothstep(.03,.07,min(vUv.x,1.0-vUv.x));'}
    if(d<front-.14&&keep<.5)discard;
    float band=(1.0-smoothstep(0.0,.12,abs(d-front+.05)))*(1.0-keep),scorch=1.0-smoothstep(front,front+.4,d);
    c*=1.0-.85*scorch;
    c+=vec3(1.0,.36,.08)*2.6*band*(.5+.5*caveNoise(p*9.0+uTime*4.0))*(threads+.35);
    a=max(a*(1.0-.3*scorch),band*.85);
   }
   // Fades where it hangs between the camera and the player, as the walls are cut there.
   vec2 rel=vPos.xz-uPlayer;float ahead=dot(rel,uToCam);
   a*=1.0-.88*smoothstep(.6,2.2,ahead)*(1.0-smoothstep(10.0,12.0,length(rel)))*smoothstep(.5,1.1,vPos.y);
   if(a<.01)discard;
   gl_FragColor=vec4(c,a);
  }`});
}

/** A grid of (u, v) in [0,1]² mapped through `at`. */
function sheet(nu,nv,at){
 const pos=[],uv=[],index=[],v=new THREE.Vector3();
 for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){at(i/nu,j/nv,v);pos.push(v.x,v.y,v.z);uv.push(i/nu,j/nv);}
 for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const a=j*(nu+1)+i,b=a+nu+1;index.push(a,a+1,b,a+1,b+1,b);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);return g;
}
/** A low lumpy dome of goo of radius r and height h, its rim wandering. */
function blob(x,z,r,h,seed,y0=0){
 const s=rng(seed),k=[s()*6,s()*6,s()*6];
 const g=sheet(36,8,(u,v,out)=>{const a=u*Math.PI*2,rim=.84+.1*Math.sin(2*a+k[0])+.09*Math.sin(3*a+k[2]*1.7)+.08*Math.sin(5*a+k[1])+.05*Math.sin(9*a+k[2])+.03*Math.sin(17*a+k[0]);
  const rr=(1-v)*r*rim,lift=Math.pow(1-(1-v)*(1-v),.6)*h*(1+.15*Math.sin(a*4+k[1]+v*3));out.set(x+Math.cos(a)*rr,y0+.012+lift,z+Math.sin(a)*rr);});
 const ix=g.index.array;for(let i=0;i<ix.length;i+=3){const t=ix[i+1];ix[i+1]=ix[i+2];ix[i+2]=t;}
 g.deleteAttribute('uv');g.computeVertexNormals();return g;
}
/** A tendril lying along `points`. */
const tendril=(points,radius,seg=24)=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),seg,radius,5,false);
/** A goo stalk from a to b, thinning toward b. */
function stalk(a,b,r0,r1){
 const d=new THREE.Vector3().subVectors(b,a),l=d.length();
 const g=new THREE.CylinderGeometry(r1,r0,l,6,1,true).translate(0,l/2,0);
 g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize())).translate(a.x,a.y,a.z);return g;
}
const bead=(at,r)=>new THREE.SphereGeometry(r,8,6).translate(at.x,at.y,at.z);
const merged=(parts,uv)=>{if(!parts.length)return null;const g=mergeGeometries(parts.map(p=>{const q=p.index?p.toNonIndexed():p;if(!uv)q.deleteAttribute('uv');q.deleteAttribute('uv1');return q;}));parts.forEach(p=>p.dispose());return g;};

export function createHiveView(caveView,cave,{zone,toCave,viewDir,smoke,fire=null}){
 const root=new THREE.Group();root.name='hive';caveView.root.add(root);
 const sight=caveView.sight,owned=[],keep=x=>(x&&owned.push(x),x);
 const time={value:0},beat={value:0},shared={uTime:time,uSag:{value:new THREE.Vector3()},uPulse:{value:0}};
 const opts={mode:'sight',shared,sight,toCave,viewDir},emberShared={uTime:time,uBeat:beat};
 const toCam={value:new THREE.Vector2(viewDir.value.x,viewDir.value.z).normalize()};
 const gooMat=keep(hiveGoo(opts,.006,beat,{veins:.8})),growMat=keep(hiveGoo(opts,.004,beat)),pusMat=keep(hiveGoo(opts,.002,beat,{core:1.4}));
 const veinMat=keep(emberMaterial(sight,emberShared,{tube:true})),throatMat=keep(emberMaterial(sight,emberShared,{tube:false}));
 const goo=[],grown=[],pus=[],veins=[],throats=[];
 const add=(parts,mat,uv=false)=>{const g=keep(merged(parts,uv));if(!g)return;const m=new THREE.Mesh(g,mat);m.frustumCulled=false;root.add(m);};

 // Pools, each with pustules swelling out of it and tendrils creeping off over the rock.
 for(const p of cave.goo){
  const s=rng(p.seed);goo.push(blob(p.x,p.z,p.r,.05+.04*p.r,p.seed));
  for(let k=0,n=3+Math.floor(s()*5);k<n;k++){const a=s()*Math.PI*2,d=Math.sqrt(s())*p.r*.65,r=.04+s()*.08;pus.push(bead(new THREE.Vector3(p.x+Math.cos(a)*d,.05+.03*p.r-r*.35,p.z+Math.sin(a)*d),r));}
  for(let k=0,n=3+Math.floor(s()*3);k<n;k++){
   let a=s()*Math.PI*2,x=p.x+Math.cos(a)*p.r*.6,z=p.z+Math.sin(a)*p.r*.6;const pts=[new THREE.Vector3(x,.03,z)];
   for(let i=0,len=4+Math.floor(s()*4);i<len;i++){a+=(s()-.5)*1.1;x+=Math.cos(a)*.32;z+=Math.sin(a)*.32;pts.push(new THREE.Vector3(x,.012,z));}
   veins.push(tendril(pts,.026-.006*(k%2)));
  }
 }

 // Coral: clusters of open tubes with a red throat, or fans branching up the wall with a pustule at every tip.
 for(const g of cave.growths){
  const s=rng(g.seed),bx=g.x*C+g.dx*.72,bz=g.z*C+g.dz*.72,tx=-g.dz,tz=g.dx,out=new THREE.Vector3(-g.dx,0,-g.dz);
  if(g.seed<.5){
   for(let k=0,n=3+Math.floor(s()*4);k<n;k++){
    const h=(.3+s()*.9)*g.size,r=(.06+s()*.04)*g.size,lip=r*(1.5+s()*.5);
    const prof=[];for(let i=0;i<=10;i++){const y=i/10;prof.push(new THREE.Vector2(r*(1+.5*Math.pow(y,3))+(i===0?r*.6:0),y*h));}
    prof.push(new THREE.Vector2(lip,h*1.01),new THREE.Vector2(lip*.8,h*.98),new THREE.Vector2(r*.7,h*.85));
    const lean=new THREE.Quaternion().setFromEuler(new THREE.Euler((s()-.5)*.5+out.z*.3,0,(s()-.5)*.5-out.x*.3));
    const at=new THREE.Vector3(bx+tx*(s()-.5)*.8+out.x*s()*.3,0,bz+tz*(s()-.5)*.8+out.z*s()*.3);
    grown.push(new THREE.LatheGeometry(prof,9).applyQuaternion(lean).translate(at.x,at.y,at.z));
    throats.push(new THREE.CircleGeometry(r*.75,10).rotateX(-Math.PI/2).translate(0,h*.9,0).applyQuaternion(lean).translate(at.x,at.y,at.z));
   }
   goo.push(blob(bx,bz,.45*g.size,.08,g.seed*7.1));
  }else{
   const up=new THREE.Vector3(0,1,0),side=new THREE.Vector3(tx,0,tz);
   const grow=(from,dir,len,r,depth)=>{
    const to=from.clone().addScaledVector(dir,len);grown.push(stalk(from,to,r,r*.7),bead(to,r*.75));
    if(depth>=3){pus.push(bead(to,r*1.9+.012));return;}
    for(const sign of [-1,1]){const d=dir.clone().applyAxisAngle(out,sign*(.35+s()*.35)).addScaledVector(out,.12).normalize();grow(to,d,len*(.68+s()*.15),r*.72,depth+1);}
   };
   const base=new THREE.Vector3(bx,0,bz);
   grow(base,up.clone().addScaledVector(side,(s()-.5)*.4).addScaledVector(out,.15).normalize(),.45*g.size,.05*g.size,0);
   goo.push(blob(bx,bz,.35*g.size,.07,g.seed*5.3));
  }
 }

 // Relics the goo has grown over: a mound round the base, tendrils climbing the machine.
 for(const l of cave.loot){
  if(l.kind!=='artifact'&&l.kind!=='heart'&&l.kind!=='blueprint')continue;
  const big=l.kind==='heart',x=l.x*C,z=l.z*C,s=rng((l.x*.137+l.z*.071)%1+.001),R=big?1.4:.75;
  goo.push(blob(x,z,R,big?.85:.38,s()));
  for(let k=0,n=big?7:4;k<n;k++){const a=k/n*Math.PI*2+s()*.6,top=big?1.6+s()*.5:.75+s()*.3,pts=[];
   for(let i=0;i<=5;i++){const t=i/5,rr=R*(.75-.55*t)+.05*Math.sin(t*9+k);pts.push(new THREE.Vector3(x+Math.cos(a+t*.6)*rr,(big?.6:.25)+t*(top-(big?.6:.25)),z+Math.sin(a+t*.6)*rr));}
   grown.push(tendril(pts,big?.05:.03,16));}
  for(let k=0,n=big?9:4;k<n;k++){const a=s()*Math.PI*2,d=R*(.5+s()*.35),r=.05+s()*.07;pus.push(bead(new THREE.Vector3(x+Math.cos(a)*d,(big?.85:.38)*(1-(d/R)**2)*.9,z+Math.sin(a)*d),r));}
 }
 add(goo,gooMat);add(grown,growMat);add(pus,pusMat);add(veins,veinMat,true);add(throats,throatMat,true);

 // Silk walls across passages, and webs in corners.
 // A silk wall is a cocoon filling its cell: a curtain on each face and a sagging roof between, so it reads from above.
 // v runs up the near curtain, over the roof and down the far one.
 const silks=cave.silk.map(w=>{
  const along=w.axis==='x',W=2.3,H=2.4,D=1.3,L=2*H+D,s=rng(w.seed),k=s()*6;
  const g=keep(sheet(20,28,(u,v,out)=>{const d=v*L;let a,y;
   if(d<H){a=-D/2-.2*(1-d/H);y=d;}else if(d<H+D){a=-D/2+(d-H);y=H;}else{a=D/2+.2*((d-H-D)/H);y=L-d;}
   const mid=Math.sin(Math.PI*u);y*=1-.22*mid*Math.min(1,y/H);a*=1+.3*mid*Math.sin(Math.PI*Math.min(1,y/H))+.06*Math.sin(u*11+k+v*5);
   const t=(u-.5)*W;out.set(w.x*C+(along?a:t),y,w.z*C+(along?t:a));}));
  const mesh=new THREE.Mesh(g,keep(silkMaterial(sight,emberShared,{web:false,size:new THREE.Vector2(W,L),seed:w.seed,toCam})));mesh.frustumCulled=false;mesh.renderOrder=2;root.add(mesh);
  return {key:w.key,mesh,x:w.x*C,z:w.z*C,W,H,D,along,burnt:null,burnT:-1};
 });
 const webs=cave.webs.map(w=>{
  const s=rng(w.seed),cx=w.x*C+w.ax+w.bx,cz=w.z*C+w.az+w.bz,hi=2.0+s()*.5,size=w.size*1.8;
  const K=new THREE.Vector3(cx-(w.ax+w.bx)*.4,hi,cz-(w.az+w.bz)*.4);
  const A=new THREE.Vector3(cx-w.bx*size-w.ax*.18,hi-.2-s()*.3,cz-w.bz*size-w.az*.18),B=new THREE.Vector3(cx-w.ax*size-w.bx*.18,hi-.2-s()*.3,cz-w.az*size-w.bz*.18);
  const g=keep(sheet(10,9,(u,v,out)=>{out.lerpVectors(A,B,u).sub(K).multiplyScalar(v).add(K);out.y-=size*(.22*v*Math.sin(Math.PI*u)+.12*v*v);}));
  const mesh=new THREE.Mesh(g,keep(silkMaterial(sight,emberShared,{web:true,size:new THREE.Vector2(size*1.4,size),seed:w.seed,toCam})));mesh.frustumCulled=false;mesh.renderOrder=2;root.add(mesh);
  mesh.material.uniforms.uIgnite.value.set(.5,1);
  return {mesh,x:(K.x+A.x+B.x)/3,z:(K.z+A.z+B.z)/3,burnT:-1};
 });

 const nests=cave.nests.map(n=>{const view=createNestView(root,{mode:'sight',sight,toCave,viewDir,smoke});
  view.root.position.set(n.x*C+n.dx,0,n.z*C+n.dz);view.root.rotation.y=Math.atan2(-n.dx,-n.dz);return {n,view,burnt:null};});

 const from=new THREE.Vector3(),carry=new THREE.Vector3();
 // A nest goes up from the throat outward: a roaring column out of the mouth, flames all over the mound.
 const nestFire=s=>{
  const r=s.view.root,out=new THREE.Vector3(-s.n.dx,0,-s.n.dz).normalize(),side=new THREE.Vector3(-out.z,0,out.x),pts=[];
  for(let i=0;i<9;i++){const a=(i/9-.5)*2.4,d=.15+(i%3)*.35;pts.push(new THREE.Vector3(r.position.x+out.x*d+side.x*a*.55,.15+(i%2)*.55+Math.random()*.3,r.position.z+out.z*d+side.z*a*.55));}
  fire.blaze(`nest:${s.n.key}`,{points:pts,radius:.55,height:2.1,strength:2.6,life:8,smoke:2.4,scorch:2.2,billow:2.2});
  for(let i=0;i<60;i++)fire.ember(pts[i%pts.length],.8,6);
 };
 // Points on each silk sheet, for flames to run along the burning front.
 const sheetPoints=m=>{const pos=m.geometry.attributes.position,uv=m.geometry.attributes.uv,out=[];for(let i=0;i<pos.count;i+=2)out.push({p:new THREE.Vector3().fromBufferAttribute(pos,i),u:uv.getX(i),v:uv.getY(i)});return out;};
 const lickFront=(s,u,size,dt,rate)=>{
  if(!fire||!s.sheet)return;
  const front=s.burnT*1.3,ig=u.uIgnite.value,sz=u.uSize.value;
  for(let n=dt*rate;n>0;n--){if(n<1&&Math.random()>n)break;
   for(let tries=0;tries<6;tries++){const q=s.sheet[Math.floor(Math.random()*s.sheet.length)],d=Math.hypot((q.u-ig.x)*sz.x,(q.v-ig.y)*sz.y);
    if(Math.abs(d-front+.05)<.35){fire.lick(q.p,size*(.7+Math.random()*.6),.75,1.6);if(Math.random()<.3)fire.ember(q.p,.2,2);break;}}}
 };
 function update(state,dt,flame=[]){
  time.value+=dt;const ph=time.value%BEAT;beat.value=Math.exp(-((ph/.09)**2))+.55*Math.exp(-(((ph-.3)/.1)**2));
  const p=state.player,id=p.cave;
  for(const s of nests){
   const burnt=isBurnt(state,id,zone,s.n.key);
   if(s.burnt===null&&burnt){s.view.burn();s.view.update(9,{});}
   else if(burnt&&!s.burnt){s.view.burn();if(fire)nestFire(s);}
   else if(!burnt&&s.burnt)s.view.reset();
   s.burnt=burnt;
   const d=Math.hypot(p.x-(s.n.x*C+s.n.dx),p.z-(s.n.z*C+s.n.dz));
   s.view.root.visible=caveView.known(`${s.n.x},${s.n.z}`);
   s.view.update(dt,{alert:Math.max(0,Math.min(1,1-(d-2.5)/7))});
  }
  for(const s of silks){
   const burnt=isBurnt(state,id,zone,s.key),u=s.mesh.material.uniforms;
   if(s.burnt===null&&burnt)s.burnT=99;
   else if(burnt&&!s.burnt){s.burnT=0;const f=(state.flares??[]).map(f=>flareNow(f,p)).find(n=>n.stage==='down')??p;
    const side=f?(s.along?f.x-s.x:f.z-s.z):-1,across=f?(s.along?f.z-s.z:f.x-s.x):0;u.uIgnite.value.set(Math.max(.1,Math.min(.9,.5+across/s.W)),side<0?.03:.97);}
   else if(!burnt&&s.burnt){s.burnT=-1;u.uGrow.value=0;}
   s.burnt=burnt;
   if(s.burnT>=0){s.burnT+=dt;
    s.sheet??=sheetPoints(s.mesh);if(s.burnT<4.6)lickFront(s,u,.5,dt,240);
    if(fire&&s.burnT<dt*1.5)fire.blaze(`silk:${s.key}`,{points:[new THREE.Vector3(s.x,.05,s.z)],radius:.7,height:1,strength:.8,life:4.8,smoke:1.2,scorch:1.8});
    // Smoke off the burning silk.
    if(smoke?.space&&s.burnT<4.5&&Math.random()<dt*24){const a=(Math.random()-.5)*s.D,t=(Math.random()-.5)*s.W;
     from.set(s.x+(s.along?a:t),Math.random()*s.H,s.z+(s.along?t:a));carry.set(0,1.5,0);smoke.emit(from,carry,.3,.4);}
   }
   u.uBurn.value=s.burnT>=0?s.burnT:-1;s.mesh.visible=s.burnT<5.5;
   if(u.uGrow.value<1)u.uGrow.value=Math.min(1,u.uGrow.value+dt/5);
  }
  const fires=[...(state.flares??[]).map(f=>flareNow(f,p)).filter(n=>n.stage==='down'&&n.lit>0),...flame];
  for(const w of webs){
   if(w.burnT<0&&fires.some(f=>Math.hypot(f.x-w.x,f.z-w.z)<1.8))w.burnT=0;
   if(w.burnT>=0){w.burnT+=dt;const u=w.mesh.material.uniforms;u.uBurn.value=w.burnT;w.mesh.visible=w.burnT<2.5;
    w.sheet??=sheetPoints(w.mesh);if(w.burnT<2)lickFront(w,u,.2,dt,60);}
  }
 }
 return {root,update,dispose(){nests.forEach(s=>s.view.dispose());caveView.root.remove(root);owned.forEach(o=>o.dispose());}};
}
