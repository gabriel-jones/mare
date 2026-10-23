import * as THREE from 'three';
import {gooInk,legGeometry} from './crawler-view.js';

/**
 * A nest: a burrow the crawlers have dug into the cave wall and lined with themselves. A mound of living goo swells
 * out of the rock, rolls over at the lip and funnels into a black throat with a slow red heartbeat at the back.
 * Something inside keeps its legs on the rim, shifting its grip in snaps; goo hangs in strands from the upper lip and
 * drips. A flare burns it out: the legs thrash and draw in, the goo boils, smoke rolls out and the heart dies.
 *
 * Local space: the wall is the plane z = 0, the room is +z, the floor is y = 0.
 */
const CZ=.82;
// The burrow's profile as (radius from its axis, distance out of the wall), from the wall to the back of the throat.
const PROFILE=[[1.3,0],[1.15,.3],[.94,.56],[.76,.73],[.64,.8],[.55,.78],[.51,.68],[.48,.55],[.41,.4],[.32,.26],[.2,.14],[.09,.06],[.001,.03]];
const LIP=6,END=PROFILE.length-1;
function profileAt(s){
 const i=Math.min(END-1,Math.max(0,Math.floor(s))),t=s-i,P=k=>PROFILE[Math.min(END,Math.max(0,k))];
 const cr=(a,b,c,d)=>.5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
 return [cr(P(i-1)[0],P(i)[0],P(i+1)[0],P(i+2)[0]),cr(P(i-1)[1],P(i)[1],P(i+1)[1],P(i+2)[1])];
}
const lump=(a,s)=>1+.1*Math.sin(a*3+1.3)*Math.sin(s*1.7)+.07*Math.sin(a*7+s*2.3)+.05*Math.sin(a*11-s*3.1);
/** A point on the burrow: `a` round its axis (π/2 is the top), `s` along the profile. */
function surface(a,s,out=new THREE.Vector3()){
 const [r0,z]=profileAt(s),r=r0*lump(a,s);
 // The upper lip sags under its own weight; the lower half spreads over the floor.
 const sag=.11*Math.max(0,Math.sin(a))*Math.exp(-(((s-LIP+1)/1.6)**2));
 return out.set(Math.cos(a)*r*1.08,Math.max(0,CZ+Math.sin(a)*r-sag),z);
}
function surfaceNormal(a,s,out=new THREE.Vector3()){
 const p=surface(a,s),da=surface(a+.01,s).sub(p),ds=surface(a,s+.01).sub(p);
 return out.crossVectors(da,ds).normalize();
}
/**
 * Rings round the axis from s0 to s1. The goo shader's ripples and wet patches are sized for a crawler, so the mesh is
 * built at 1/GRAIN scale and the mesh scaled back up, which spreads them over the bigger surface.
 */
const GRAIN=2.2;
function burrowGeometry(s0,s1,rings){
 const SEG=64,pos=[],depth=[],index=[],v=new THREE.Vector3();
 for(let i=0;i<=rings;i++){const s=s0+(s1-s0)*i/rings;for(let j=0;j<=SEG;j++){surface(j/SEG*Math.PI*2,s,v).divideScalar(GRAIN);pos.push(v.x,v.y,v.z);depth.push(i/rings);}}
 for(let i=0;i<rings;i++)for(let j=0;j<SEG;j++){const a=i*(SEG+1)+j,b=a+SEG+1;index.push(a,a+1,b,a+1,b+1,b);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aDepth',new THREE.Float32BufferAttribute(depth,1));g.setIndex(index);g.computeVertexNormals();
 return g;
}

export function createNestView(parent,{mode='studio',sight=null,toCave=null,viewDir=null}={}){
 const root=new THREE.Group(),owned=[],keep=x=>(owned.push(x),x);parent.add(root);
 const time={value:0},sag={value:new THREE.Vector3(0,.02,0)},pulse={value:0},ember={value:1},beat={value:0};
 const shared={uTime:time,uSag:sag,uPulse:pulse};
 const opts={mode,shared,sight,toCave,viewDir};

 // The mound and lip: living goo.
 const moundInk=keep(gooInk(opts,.01));
 const mound=new THREE.Mesh(keep(burrowGeometry(0,LIP+.25,40)),moundInk);mound.scale.setScalar(GRAIN);mound.castShadow=mode==='studio';mound.receiveShadow=true;root.add(mound);
 // The throat: black that swallows the lamp, warming to a heartbeat of red at the back.
 const throatInk=keep(new THREE.MeshBasicMaterial({color:'#000000',fog:false,side:THREE.DoubleSide}));
 throatInk.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,shared,{uEmber:ember,uBeat:beat});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float aDepth;varying float vDepth;').replace('#include <begin_vertex>','#include <begin_vertex>\nvDepth=aDepth;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uEmber;uniform float uBeat;uniform float uTime;varying float vDepth;')
   .replace('#include <opaque_fragment>',`float deep=pow(vDepth,3.5)*.55;
    float vein=.6+.4*sin(vDepth*26.-uTime*1.4+sin(gl_FragCoord.x*.02)*2.);
    outgoingLight+=vec3(1.,.11,.03)*deep*vein*uEmber*(.28+.72*uBeat);
    #include <opaque_fragment>`);
 };
 const throat=new THREE.Mesh(keep(burrowGeometry(LIP+.25,END,20)),throatInk);throat.scale.setScalar(GRAIN);root.add(throat);

 // Legs out of the dark, gripping the mound round the lip.
 const geo=legGeometry(keep),legInk=keep(gooInk(opts,.004));
 const F=.9,T=.78,META=.4,THICK=1.9;
 const legs=[-.3,.55,1.25,1.95,2.65,3.45].map((home,i)=>{
  const parts={femur:new THREE.Mesh(geo.femur,legInk),tibia:new THREE.Mesh(geo.tibia,legInk),meta:new THREE.Mesh(geo.meta,legInk),needle:new THREE.Mesh(geo.needle,legInk),strand:new THREE.Mesh(geo.strand,legInk)};
  Object.values(parts).forEach(m=>{m.castShadow=mode==='studio';m.frustumCulled=false;root.add(m);});
  const sHome=1.5+(i%3)*.4,leg={home,sHome,a:home,s:sHome,parts,foot:surface(home,sHome),from:new THREE.Vector3(),to:new THREE.Vector3(),step:0,duration:.1,lift:.2,
   timer:.5+Math.random()*2,knee:new THREE.Vector3(),ankle:new THREE.Vector3(),strand:Math.random(),strandLength:.08+Math.random()*.14,spasmT:0,air:new THREE.Vector3(),hip:new THREE.Vector3()};
  // Hips deep in the throat, a little round from the axis toward their side.
  surface(home,LIP+1.8,leg.hip);leg.hip.lerp(new THREE.Vector3(0,CZ,leg.hip.z),.55);
  return leg;
 });
 const up=new THREE.Vector3(0,1,0),tmp=new THREE.Vector3(),tmp2=new THREE.Vector3(),pole=new THREE.Vector3();
 function place(mesh,from,to,thick=1.25){const d=tmp2.subVectors(to,from),l=d.length();mesh.position.copy(from);mesh.quaternion.setFromUnitVectors(up,d.divideScalar(l||1));mesh.scale.set(thick,l,thick);}
 function solve(leg,planted){
  // The needle stabs into the goo along its normal; a leg in the air carries it on in line with the shin.
  const n=surfaceNormal(leg.a,leg.s,tmp);
  if(planted)leg.ankle.copy(leg.foot).addScaledVector(n,META*.85);else leg.ankle.copy(leg.foot).addScaledVector(tmp2.subVectors(leg.foot,leg.hip).normalize(),-META*.6);
  const d=tmp2.subVectors(leg.ankle,leg.hip),dist=Math.min(F+T-.01,Math.max(.1,d.length())),u=d.normalize().clone();
  const a=(F*F+dist*dist-T*T)/(2*dist),h=Math.sqrt(Math.max(0,F*F-a*a));
  // Knees arch up and out over the lip.
  pole.set(Math.cos(leg.a)*.9,Math.sin(leg.a)*.9+.35,.4).normalize();pole.addScaledVector(u,-pole.dot(u)).normalize();
  leg.knee.copy(leg.hip).addScaledVector(u,a).addScaledVector(pole,h);
  const ankle=new THREE.Vector3().copy(leg.hip).addScaledVector(u,dist);
  place(leg.parts.femur,leg.hip,leg.knee,1.35*THICK);place(leg.parts.tibia,leg.knee,ankle,1.3*THICK);
  const needleStart=new THREE.Vector3().lerpVectors(ankle,leg.foot,.7);place(leg.parts.meta,ankle,needleStart,1.25*THICK);place(leg.parts.needle,needleStart,leg.foot,1.2*THICK);
  leg.parts.needle.scale.y=leg.foot.distanceTo(needleStart)/.2;
  const s=leg.parts.strand;s.visible=planted||leg.step>0;s.position.copy(leg.knee);s.position.y-=.015;s.quaternion.identity();
  const length=Math.max(.06,leg.strandLength*(.25+.75*leg.strand));s.scale.set(1.2+.6*leg.strand,length,1.2+.6*leg.strand);
  return length;
 }

 // Strands hanging from the upper lip, each gathering a drop until it lets go.
 const lipStrands=[.55,1.0,1.45,1.85,2.3,2.7].map(a=>{const mesh=new THREE.Mesh(geo.strand,legInk);mesh.frustumCulled=false;mesh.castShadow=mode==='studio';root.add(mesh);
  return {mesh,a,at:surface(a,LIP-.15),grow:Math.random(),rate:.18+Math.random()*.3,length:.15+Math.random()*.45,retract:0};});
 // Falling drops and the splats they leave.
 const dropMat=mode==='studio'?moundInk:keep(new THREE.MeshBasicMaterial({color:'#020203',fog:false}));
 const splatMat=keep(mode==='studio'?new THREE.MeshPhysicalMaterial({color:'#050506',roughness:.3,clearcoat:.5,clearcoatRoughness:.3,envMapIntensity:.25,transparent:true,opacity:.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}):new THREE.MeshBasicMaterial({color:'#010102',transparent:true,opacity:.9,depthWrite:false,fog:false,polygonOffset:true,polygonOffsetFactor:-2}));
 const splatGeo=keep(new THREE.CircleGeometry(1,20).rotateX(-Math.PI/2));
 const DROPS=32,SPLATS=40,drops=new THREE.InstancedMesh(keep(new THREE.SphereGeometry(1,8,6)),dropMat,DROPS),splats=new THREE.InstancedMesh(splatGeo,splatMat,SPLATS);
 drops.frustumCulled=splats.frustumCulled=false;root.add(drops,splats);
 const dropState=[...Array(DROPS)].map(()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),alive:false,size:.02})),splatState=[...Array(SPLATS)].map(()=>({x:0,z:0,y:0,r:0,age:99,life:8}));
 let nextDrop=0,nextSplat=0;
 const drip=(p,size)=>{const d=dropState[nextDrop];nextDrop=(nextDrop+1)%DROPS;d.p.copy(p);d.v.set((Math.random()-.5)*.1,-.1,(Math.random()-.5)*.1);d.alive=true;d.size=size;};
 const splat=(x,y,z,r,life=8)=>{const s=splatState[nextSplat];nextSplat=(nextSplat+1)%SPLATS;Object.assign(s,{x,y,z,r,age:0,life});};
 // Smoke rolling out of the burrow while it burns: soft puffs that swell, rise and thin out.
 const PUFFS=90,puffPos=new Float32Array(PUFFS*3),puffAge=new Float32Array(PUFFS).fill(1),puffSeed=new Float32Array(PUFFS).map(()=>Math.random()),puffVel=[...Array(PUFFS)].map(()=>new THREE.Vector3()),puffLife=new Float32Array(PUFFS);
 const puffGeo=keep(new THREE.BufferGeometry());puffGeo.setAttribute('position',new THREE.BufferAttribute(puffPos,3));puffGeo.setAttribute('aAge',new THREE.BufferAttribute(puffAge,1));puffGeo.setAttribute('aSeed',new THREE.BufferAttribute(puffSeed,1));
 const puffMat=keep(new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,uniforms:{uHeight:{value:800}},
  vertexShader:'attribute float aAge;attribute float aSeed;varying float vAge;varying float vSeed;uniform float uHeight;void main(){vAge=aAge;vSeed=aSeed;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=aAge>=1.0?0.0:(.35+1.6*aAge)*projectionMatrix[1][1]*uHeight*.5/max(.1,-mv.z);}',
  fragmentShader:'varying float vAge;varying float vSeed;void main(){vec2 p=gl_PointCoord-.5;float edge=.8+.2*sin(atan(p.y,p.x)*5.0+vSeed*40.0+vAge*3.0);float a=(1.0-smoothstep(.1,1.0,length(p)*2.0/edge))*(1.0-vAge)*min(1.0,vAge*12.0)*.7;if(a<.01)discard;gl_FragColor=vec4(vec3(.3,.28,.27)*(1.0-.5*vAge),a);}'}));
 const puffs=new THREE.Points(puffGeo,puffMat);puffs.frustumCulled=false;root.add(puffs);
 const viewport=new THREE.Vector2();puffs.onBeforeRender=r=>{r.getDrawingBufferSize(viewport);puffMat.uniforms.uHeight.value=viewport.y;};
 let nextPuff=0,smokeClock=0;
 const mouth=new THREE.Vector3(0,CZ,.5);
 function puff(){const i=nextPuff;nextPuff=(nextPuff+1)%PUFFS;const a=Math.random()*Math.PI*2,r=Math.random()*.35;
  puffPos.set([Math.cos(a)*r,CZ+Math.sin(a)*r,.5],i*3);puffVel[i].set((Math.random()-.5)*.5,.9+Math.random()*.7,.7+Math.random()*.6);puffAge[i]=0;puffLife[i]=2.5+Math.random()*1.5;}

 let clock=0,burnT=-1,shiftT=4+Math.random()*5;const dummy=new THREE.Object3D();
 const deepIn=(leg,out)=>surface(leg.home,LIP+2.4,out).lerp(tmp2.set(0,CZ,out.z),.45);

 /** ctx: {alert 0..1, how close something is}. */
 function update(dt,ctx={}){
  time.value+=dt;clock+=dt;pulse.value*=Math.exp(-dt*3);
  const alert=ctx.alert??0,burning=burnT>=0,dead=burning&&burnT>1.6;
  if(burning)burnT+=dt;
  // Heartbeat: a double thump, quicker when something is near, gone when burnt out.
  const period=1.7-.6*alert,ph=clock%period;beat.value=Math.exp(-((ph/.07)**2))+.6*Math.exp(-(((ph-.26)/.08)**2));
  ember.value+=((burning?(burnT<.6?3:Math.max(0,1-(burnT-.6)/3)):1)-ember.value)*(1-Math.exp(-dt*(burning?6:2)));
  // The whole mound breathes with it, and boils while it burns.
  if(burning&&burnT<4)pulse.value=Math.max(pulse.value,.6+.4*Math.random());
  const breathe=1+.012*beat.value+(dead?-.08*Math.min(1,(burnT-1.6)/3):0);mound.scale.set(breathe,dead?1-.12*Math.min(1,(burnT-1.6)/3):breathe,1).multiplyScalar(GRAIN);
  sag.value.set(0,.02+.015*beat.value,0);
  // Every few seconds it shifts its whole grip, leg after leg.
  shiftT-=dt;if(shiftT<=0&&!burning){shiftT=3+Math.random()*6-2*alert;legs.forEach((l,i)=>{l.timer=Math.min(l.timer,i*.05+Math.random()*.04);});}
  const stepping=legs.filter(l=>l.step>0).length;
  legs.forEach((leg,i)=>{
   leg.timer-=dt;
   if(burning){
    // Burning: thrash at the air for a moment, then pull back into the dark and stay there.
    if(burnT<1.4){leg.spasmT-=dt;if(leg.spasmT<=0){leg.spasmT=.03+Math.random()*.08;const a=leg.home+(Math.random()-.5)*1.2,r=.6+Math.random()*.7;leg.air.set(Math.cos(a)*r,CZ+Math.sin(a)*r,.7+Math.random()*.8);}
     leg.foot.lerp(leg.air,1-Math.exp(-dt*35));}
    else leg.foot.lerp(deepIn(leg,tmp),1-Math.exp(-dt*3));
    leg.a=leg.home;leg.s=LIP+1;leg.step=0;
   }else if(leg.step>0){
    leg.step+=dt/leg.duration;const s=Math.min(1,leg.step),e=1-Math.pow(1-s,3);
    leg.foot.lerpVectors(leg.from,leg.to,e).addScaledVector(surfaceNormal(leg.a,leg.s,tmp),Math.sin(s*Math.PI)*leg.lift);
    if(s>=1){leg.step=0;leg.foot.copy(leg.to);}
   }else if(leg.timer<=0&&stepping<2){
    // A new hold: close to home, drawn in toward the lip when something is near. Sometimes just a tap.
    const tap=Math.random()<.35;
    leg.from.copy(leg.foot);
    if(!tap){leg.a=leg.home+(Math.random()-.5)*.45;leg.s=Math.max(1.1,Math.min(LIP-1.6,leg.sHome+1.2*alert+(Math.random()-.5)*.5));}
    surface(leg.a,leg.s,leg.to);leg.step=.001;
    leg.duration=tap?.05+Math.random()*.03:.07+Math.random()*.06;leg.lift=tap?.05+Math.random()*.08:.14+Math.random()*.16;
    leg.timer=(tap?.3:.8)+Math.random()*(3.2-2.4*alert);
   }
   const length=solve(leg,!burning&&leg.step<=0);
   leg.strand+=dt*(.2+.6*alert);
   if(leg.strand>=1||(leg.step>0&&leg.strand>.6&&Math.random()<dt*6)){drip(new THREE.Vector3(leg.knee.x,leg.knee.y-length,leg.knee.z),.014);leg.strand=0;}
  });
  // Lip strands: hang, stretch, drop, form again.
  lipStrands.forEach(s=>{
   if(s.retract>0){s.retract-=dt;s.mesh.visible=false;if(s.retract<=0){s.grow=0;s.length=.15+Math.random()*.45;s.rate=.18+Math.random()*.3;}return;}
   s.mesh.visible=!dead;s.grow+=dt*s.rate*(burning?4:1);
   const length=s.length*Math.min(1,s.grow)*(1+.06*Math.sin(clock*2.6+s.a*9));
   s.mesh.position.copy(s.at);s.mesh.rotation.set(Math.sin(clock*1.1+s.a)*.06,0,Math.sin(clock*.9+s.a*2)*.06);
   const fat=.7+.7*Math.min(1,s.grow);s.mesh.scale.set(fat,Math.max(.01,length),fat);
   if(s.grow>=1.15){drip(s.at.clone().setY(s.at.y-length*.95),.014+.012*fat);s.retract=.3+Math.random()*1.2;}
  });
  dropState.forEach((d,i)=>{
   if(d.alive){d.v.y-=9*dt;d.p.addScaledVector(d.v,dt);
    // Drops land on the floor, or on the mound's skirt where it spreads over it.
    const floor=d.p.z<PROFILE[3][1]?.0:0;if(d.p.y<=floor){d.alive=false;splat(d.p.x,floor,d.p.z,d.size*2.4+Math.random()*.02,6);}}
   if(d.alive){dummy.position.copy(d.p);const st=1+Math.min(2.5,-d.v.y*.35);dummy.scale.set(d.size,d.size*st,d.size);}else dummy.scale.setScalar(0);
   dummy.rotation.set(0,0,0);dummy.updateMatrix();drops.setMatrixAt(i,dummy.matrix);
  });
  splatState.forEach((s,i)=>{
   s.age+=dt;const k=s.age/s.life,grow=Math.min(1,s.age*6)*(k>.7?Math.max(0,(1-k)/.3):1);
   dummy.position.set(s.x,s.y+.012+i*.00005,s.z);dummy.rotation.set(0,i*1.7,0);dummy.scale.set(s.r*grow,1,s.r*grow);
   if(k>=1)dummy.scale.setScalar(0);dummy.updateMatrix();splats.setMatrixAt(i,dummy.matrix);
  });
  drops.instanceMatrix.needsUpdate=splats.instanceMatrix.needsUpdate=true;
  // Smoke pours out while it burns.
  const rate=burning&&burnT<5?18*Math.max(.15,1-burnT/5):0;
  for(smokeClock+=dt*rate;smokeClock>1;smokeClock--)puff();
  for(let i=0;i<PUFFS;i++){if(puffAge[i]>=1)continue;puffAge[i]=Math.min(1,puffAge[i]+dt/puffLife[i]);const v=puffVel[i];v.multiplyScalar(Math.exp(-dt*.8));v.y+=.35*dt;
   puffPos[i*3]+=v.x*dt;puffPos[i*3+1]+=v.y*dt;puffPos[i*3+2]+=v.z*dt;}
  puffGeo.attributes.position.needsUpdate=puffGeo.attributes.aAge.needsUpdate=true;
 }
 return {
  root,update,
  /** Set it alight (a flare landed in it). */
  burn(){if(burnT<0)burnT=0;},
  get burning(){return burnT>=0;},
  /** Back to a live nest (regrowth, or the preview's reset). */
  reset(){burnT=-1;ember.value=1;mound.scale.setScalar(GRAIN);legs.forEach(l=>{l.a=l.home;l.s=l.sHome;surface(l.a,l.s,l.foot);l.step=0;});puffAge.fill(1);},
  /** Where its mouth is, in this nest's space (for smoke, sound and aim). */
  mouth,
  dispose(){parent.remove(root);owned.forEach(o=>o.dispose());drops.dispose();splats.dispose();},
 };
}
