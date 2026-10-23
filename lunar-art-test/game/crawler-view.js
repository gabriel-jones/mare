import * as THREE from 'three';
import {SIGHT_PARS} from './cave-view.js';

/**
 * The crawler's body comes from Blender (crawler.glb: ShellL, ShellR, Maw, Core); its legs are grown and stepped here.
 * Eight needle legs solve two-bone IK from hips on the body to planted feet. A foot stays put until the body has moved
 * on, then darts to a new hold in a fraction of a second, never alongside its neighbours. Poses per behaviour state
 * lift, sweep or curl legs. Everything is placed in the parent's space (the cave root underground).
 */
const LEGS=8,FEMUR=1.15,TIBIA=1,META=.55;
const SIDE_ANGLES=[.5,1.2,1.95,2.6];
const REST_HEIGHT={idle:1.05,lurk:1.05,stalk:.78,close:.7,skitter:1,flee:1.05,recover:.9,slash:1.2,recoil:1.4,hit:1,shriek:2.15,lunge:.62,grab:1.55,dead:.28};
const OPEN={shriek:1,lunge:.85,grab:.7,slash:.5};

const legInfo=[...Array(LEGS)].map((_,i)=>{
 const side=i<4?-1:1,j=i%4,a=SIDE_ANGLES[j],reach=j===0?1.6:j===3?1.5:1.45;
 return {side,j,hip:new THREE.Vector3(side*Math.sin(a)*.15,.02,Math.cos(a)*.2),rest:new THREE.Vector3(side*Math.sin(a)*reach,0,Math.cos(a)*reach)};
});
// A leg may not lift while a neighbour on its side or its mirror is in the air.
const neighbours=i=>{const s=i<4?0:4,j=i%4;return [...(j>0?[s+j-1]:[]),...(j<3?[s+j+1]:[]),(4-s)+j];};

function wobble(shader,uniforms,amount){
 Object.assign(shader.uniforms,uniforms);
 shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uTime;')
  .replace('#include <begin_vertex>',`#include <begin_vertex>
   {vec3 w=transformed*7.0;transformed+=normal*${amount.toFixed(4)}*(sin(w.x+uTime*1.7)*sin(w.y*1.3+uTime*1.1)+.6*sin(w.z*1.7-uTime*2.3));}`);
}

export function createCrawlerView(gltf,parent,{mode='studio',sight=null,toCave=null,viewDir=null}={}){
 const root=new THREE.Group(),time={value:0},owned=[];parent.add(root);
 const keep=x=>(owned.push(x),x);
 const shared={uTime:time};
 /** Materials. In the studio they are physically lit wet goo; underground they take the cave's sight and catch only the lamp. */
 function ink(amount){
  if(mode==='studio'){
   const m=keep(new THREE.MeshPhysicalMaterial({color:'#060607',roughness:.14,metalness:0,clearcoat:1,clearcoatRoughness:.03,envMapIntensity:1.4}));
   m.onBeforeCompile=s=>wobble(s,shared,amount);return m;
  }
  const m=keep(new THREE.MeshBasicMaterial({color:'#050506',fog:false}));
  m.onBeforeCompile=shader=>{
   wobble(shader,{...shared,...sight,uToCave:toCave,uViewDir:viewDir},amount);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 uToCave;varying vec3 vCave;varying vec3 vCaveN;')
    .replace('#include <project_vertex>','#include <project_vertex>\nvCave=(uToCave*modelMatrix*vec4(transformed,1.0)).xyz;vCaveN=mat3(uToCave*modelMatrix)*normal;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 uViewDir;varying vec3 vCave;varying vec3 vCaveN;\n'+SIGHT_PARS.replace('varying vec2 vCaveLocal;varying float vSeen;',''))
    .replace('#include <opaque_fragment>',`
     vec3 n=normalize(vCaveN);vec3 toLamp=normalize(vec3(uPlayer.x,1.5,uPlayer.y)-vCave);
     float lampLevel=dot(caveSightRaw(vCave.xz),vec3(.33));
     // Wet black: a hard highlight where the surface mirrors the lamp toward the eye, and a thin rim.
     float glint=smoothstep(.93,.97,dot(reflect(-toLamp,n),uViewDir));
     float rim=smoothstep(.7,.8,1.0-abs(dot(n,uViewDir)))*max(0.0,dot(n,toLamp)*.7+.3);
     outgoingLight=diffuseColor.rgb*caveSight(vCave.xz)+vec3(.62,.68,.8)*lampLevel*(glint*1.8+rim*.35)+caveGlow(vCave.xz)*(rim*.25+glint*.5);
     #include <opaque_fragment>`);
  };
  return m;
 }
 const bone=mode==='studio'?keep(new THREE.MeshStandardMaterial({color:'#c9c2b2',roughness:.4})):keep(new THREE.MeshBasicMaterial({color:'#c9c2b2',fog:false}));
 if(mode!=='studio')bone.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,sight,{uToCave:toCave});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 uToCave;varying vec3 vCave;').replace('#include <project_vertex>','#include <project_vertex>\nvCave=(uToCave*modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCave;\n'+SIGHT_PARS.replace('varying vec2 vCaveLocal;varying float vSeen;','')).replace('#include <opaque_fragment>','outgoingLight=diffuseColor.rgb*(caveSight(vCave.xz)*1.4+caveGlow(vCave.xz));\n#include <opaque_fragment>');
 };
 const maw=mode==='studio'?keep(new THREE.MeshStandardMaterial({color:'#080404',roughness:.25})):keep(new THREE.MeshBasicMaterial({color:'#000000',fog:false}));
 const bodyInk=ink(.012),legInk=ink(.004);

 // Body.
 const body=new THREE.Group();root.add(body);
 const model=gltf.scene.clone(true);body.add(model);
 const shells={};
 model.traverse(o=>{
  if(o.name==='ShellL'||o.name==='ShellR')shells[o.name]=o;
  if(!o.isMesh)return;o.castShadow=mode==='studio';o.frustumCulled=false;
  const name=o.material.name;o.material=name.includes('bone')?bone:name.includes('maw')?maw:bodyInk;
 });

 // Legs: goo segments that swell where they join and thin between, ending in bone needles. No hard joints.
 const lathe=(profile,bow=0)=>{
  const pts=[];for(let i=0;i<=24;i++){const y=i/24;pts.push(new THREE.Vector2(Math.max(.001,profile(y)),y));}
  const g=new THREE.LatheGeometry(pts,10);const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const y=p.getY(i);p.setX(i,p.getX(i)+Math.sin(y*Math.PI)*bow);}
  g.computeVertexNormals();return keep(g);
 };
 const swell=(y,at,width)=>{const k=(y-at)/width;return Math.exp(-k*k);};
 const geo={
  femur:lathe(y=>.026+.03*swell(y,0,.12)+.016*swell(y,1,.12)+.004*Math.sin(y*19),.025),
  tibia:lathe(y=>.018+.016*swell(y,0,.1)+.006*swell(y,.97,.08)+.003*Math.sin(y*23),-.02),
  meta:lathe(y=>.016*(1-y*.55)+.006*swell(y,0,.1)),
  needle:keep(new THREE.ConeGeometry(.011,.2,7).translate(0,.1,0)),
  // A drop gathering on a thread, hung from each knee; it lengthens until the drop lets go.
  strand:lathe(y=>{const k=1-y;return .012*(1-k)**4+.004+(k>.82?.018*Math.sqrt(Math.max(0,1-((k-.91)/.09)**2)):0);}),
 };
 geo.strand.rotateX(Math.PI);
 const legs=legInfo.map((info,i)=>{
  const parts={femur:new THREE.Mesh(geo.femur,legInk),tibia:new THREE.Mesh(geo.tibia,legInk),meta:new THREE.Mesh(geo.meta,legInk),needle:new THREE.Mesh(geo.needle,bone),strand:new THREE.Mesh(geo.strand,legInk)};
  Object.values(parts).forEach(m=>{m.castShadow=mode==='studio';m.frustumCulled=false;root.add(m);});
  return {...info,parts,foot:new THREE.Vector3(),from:new THREE.Vector3(),to:new THREE.Vector3(),step:0,duration:.1,lift:.3,free:false,knee:new THREE.Vector3(),ankle:new THREE.Vector3(),strand:Math.random(),strandLength:.12+(i*.37%1)*.22};
 });

 // Goo: drops that fall from the knees and the belly, and splats where they land or where a foot plants.
 const dropGeo=keep(new THREE.SphereGeometry(1,8,6)),splatGeo=keep(new THREE.CircleGeometry(1,20).rotateX(-Math.PI/2));
 {const p=splatGeo.attributes.position;for(let i=1;i<p.count;i++){const a=Math.atan2(p.getZ(i),p.getX(i)),r=.86+.09*Math.sin(a*3+1)+.05*Math.sin(a*5+2);p.setX(i,Math.cos(a)*r);p.setZ(i,Math.sin(a)*r);}}
 const dropMat=mode==='studio'?bodyInk:keep(new THREE.MeshBasicMaterial({color:'#020203',fog:false}));
 const splatMat=keep(mode==='studio'?new THREE.MeshPhysicalMaterial({color:'#050506',roughness:.1,clearcoat:1,transparent:true,opacity:.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}):new THREE.MeshBasicMaterial({color:'#010102',transparent:true,opacity:.9,depthWrite:false,fog:false,polygonOffset:true,polygonOffsetFactor:-2}));
 const DROPS=48,SPLATS=64;
 const drops=new THREE.InstancedMesh(dropGeo,dropMat,DROPS),splats=new THREE.InstancedMesh(splatGeo,splatMat,SPLATS);drops.frustumCulled=splats.frustumCulled=false;root.add(drops,splats);
 const dropState=[...Array(DROPS)].map(()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),alive:false,size:.02}));
 const splatState=[...Array(SPLATS)].map(()=>({x:0,z:0,r:0,age:99,life:8}));
 let nextDrop=0,nextSplat=0,dropClock=0;
 const splat=(x,z,r,life=8)=>{const s=splatState[nextSplat];nextSplat=(nextSplat+1)%SPLATS;Object.assign(s,{x,z,r,age:0,life});};
 const drip=(p,size=.02+Math.random()*.02)=>{const d=dropState[nextDrop];nextDrop=(nextDrop+1)%DROPS;d.p.copy(p);d.v.set((Math.random()-.5)*.2,-.2,(Math.random()-.5)*.2);d.alive=true;d.size=size;};

 const pos=new THREE.Vector3(),vel=new THREE.Vector3(),last=new THREE.Vector3(),pose={height:1.05,pitch:0,roll:0,open:0,yaw:0};let started=false,clock=0;
 const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),tmp=new THREE.Vector3(),tmp2=new THREE.Vector3(),dummy=new THREE.Object3D();
 const toParent=(local,out)=>out.copy(local).applyMatrix4(body.matrix);
 function home(leg,out){
  out.copy(leg.rest).applyAxisAngle(up,pose.yaw);out.x+=pos.x+vel.x*.22;out.z+=pos.z+vel.z*.22;out.y=0;return out;
 }
 function place(mesh,from,to){const d=tmp2.subVectors(to,from),l=d.length();mesh.position.copy(from);mesh.quaternion.setFromUnitVectors(up,d.divideScalar(l||1));mesh.scale.set(1,l,1);}
 function solve(leg,hip){
  // Planted feet stand on a near-vertical needle; lifted legs carry it on in line with the shin.
  const out=tmp.set(leg.foot.x-hip.x,0,leg.foot.z-hip.z).normalize();
  if(leg.free){leg.ankle.copy(leg.foot);}else leg.ankle.copy(leg.foot).addScaledVector(out,-.1).setY(leg.foot.y+META*.92);
  const d=tmp2.subVectors(leg.ankle,hip),dist=Math.min(FEMUR+TIBIA-.01,Math.max(.1,d.length()));const u=d.normalize();
  const a=(FEMUR*FEMUR+dist*dist-TIBIA*TIBIA)/(2*dist),h=Math.sqrt(Math.max(0,FEMUR*FEMUR-a*a));
  const pole=new THREE.Vector3(out.x*.35,1,out.z*.35);pole.addScaledVector(u,-pole.dot(u)).normalize();
  leg.knee.copy(hip).addScaledVector(u,a).addScaledVector(pole,h);
  const ankle=new THREE.Vector3().copy(hip).addScaledVector(u,dist);
  const tip=leg.free?new THREE.Vector3().subVectors(ankle,leg.knee).normalize().multiplyScalar(META).add(ankle):leg.foot.clone();
  place(leg.parts.femur,hip,leg.knee);place(leg.parts.tibia,leg.knee,ankle);
  const needleStart=new THREE.Vector3().lerpVectors(ankle,tip,.72);place(leg.parts.meta,ankle,needleStart);place(leg.parts.needle,needleStart,tip);
  leg.parts.needle.scale.set(1,tip.distanceTo(needleStart)/.2,1);
  // The knee strand stretches under its drop, which falls when it is heavy enough; a quick step shakes it loose.
  const s=leg.parts.strand;s.position.copy(leg.knee);s.position.y-=.015;s.quaternion.identity();
  const length=leg.strandLength*(.25+.75*leg.strand);s.scale.set(.7+.5*leg.strand,length,.7+.5*leg.strand);
  return length;
 }

 /**
  * `c`: the simulated crawler {x,z,facing,state,t,speed}. `ctx.player`: {x,z} for poses that reach for the player.
  * Returns the step events this frame ({type:'plant',x,z}) so callers can add sound.
  */
 function update(c,dt,ctx={}){
  const events=[];time.value+=dt;clock+=dt;
  const state=c.state==='lurk'&&c.speed<.2?'idle':c.state;
  const player=ctx.player??{x:c.x,z:c.z+2};
  let tx=c.x,tz=c.z;
  if(state==='grab'){tx+=(player.x-c.x)*.55;tz+=(player.z-c.z)*.55;}
  if(!started){started=true;pos.set(tx,0,tz);last.copy(pos);pose.yaw=c.facing;body.position.set(tx,REST_HEIGHT.idle,tz);body.updateMatrix();legs.forEach(l=>{home(l,l.foot);});}
  // The body glides after its target and leans into its motion.
  const k=1-Math.exp(-dt*(state==='lunge'?30:9));pos.x+=(tx-pos.x)*k;pos.z+=(tz-pos.z)*k;
  vel.set((pos.x-last.x)/Math.max(dt,1e-4),0,(pos.z-last.z)/Math.max(dt,1e-4));last.copy(pos);
  let yawDiff=c.facing-pose.yaw;yawDiff=Math.atan2(Math.sin(yawDiff),Math.cos(yawDiff));pose.yaw+=yawDiff*(1-Math.exp(-dt*7));
  const breathe=Math.sin(clock*1.6)*.03,tremble=(state==='shriek'||state==='recoil')?Math.sin(clock*55)*.015:0;
  const wantHeight=(REST_HEIGHT[state]??1)+(state==='idle'?breathe:0)+(state==='dead'?0:Math.min(.08,vel.length()*.01));
  const pitchFor={shriek:-.75,recoil:-.45,lunge:.25,grab:.35,slash:-.2,dead:.1};
  pose.height+=(wantHeight-pose.height)*(1-Math.exp(-dt*(state==='shriek'||state==='lunge'||state==='recoil'?10:5)));
  pose.pitch+=((pitchFor[state]??0)+tremble*4-pose.pitch)*(1-Math.exp(-dt*8));
  const speedLean=new THREE.Vector3(vel.x,0,vel.z).applyAxisAngle(up,-pose.yaw);
  pose.roll+=((state==='hit'?.35*Math.sin(c.t*20):0)+THREE.MathUtils.clamp(-speedLean.x*.03,-.2,.2)-pose.roll)*(1-Math.exp(-dt*8));
  const wantOpen=(OPEN[state]??0)*(state==='shriek'?.85+.15*Math.sin(clock*30):1);
  pose.open+=(wantOpen-pose.open)*(1-Math.exp(-dt*(wantOpen>pose.open?14:6)));
  body.position.set(pos.x,pose.height+tremble,pos.z);
  body.rotation.set(0,0,0);body.rotateY(pose.yaw);body.rotateX(THREE.MathUtils.clamp(pose.pitch-speedLean.z*.02,-1,1));body.rotateZ(pose.roll);body.updateMatrix();
  if(shells.ShellL)shells.ShellL.rotation.y=-pose.open*.55;if(shells.ShellR)shells.ShellR.rotation.y=pose.open*.55;
  if(state==='dead'){const melt=Math.max(0,Math.min(1,(c.t-1.4)/1.8));model.scale.set(1+melt*.5,1-melt*.75,1+melt*.3);}else model.scale.set(1,1,1);

  // Which legs are lifted for this state, and where they reach.
  const reach=(i,leg)=>{
   const s=leg.side,j=leg.j,front=j<2;
   const local=v=>toParent(v,new THREE.Vector3());
   if(state==='shriek'&&front)return local(new THREE.Vector3(s*(j?1.25:.8),j?.9:1.35,j?.5:.9).add(new THREE.Vector3(0,Math.sin(clock*40+i)*.03,0)));
   if(state==='recoil'&&j===0)return local(new THREE.Vector3(s*.35,.7,.9));
   if(state==='lunge'&&front&&c.t<.4)return local(new THREE.Vector3(s*(j?.9:.45),-.2,1.5));
   if(state==='grab'&&front){const a=pose.yaw+(s*(j?1.3:.55));return new THREE.Vector3(player.x+Math.sin(a)*.55,0,player.z+Math.cos(a)*.55);}
   if(state==='slash'&&i===4)return new THREE.Vector3(player.x,c.t<.18?1.9:1.35,player.z);
   if(state==='dead'){const tuck=Math.min(1,c.t/.5);return local(new THREE.Vector3(s*(.75-.45*tuck),.15+.25*tuck,leg.rest.z*.4));}
   return null;
  };
  const airborne=legs.filter(l=>l.step>0).length;
  legs.forEach((leg,i)=>{
   const target=reach(i,leg);
   if(target){
    // A lifted leg: it snaps toward its hold, or plants into the ground for the grab cage.
    if(!leg.free&&leg.step<=0){leg.free=true;}
    const planted=target.y<=.001;
    if(planted){leg.free=false;if(leg.foot.distanceTo(target)>.2&&leg.step<=0){leg.from.copy(leg.foot);leg.to.copy(target);leg.step=.001;leg.duration=.07;leg.lift=.5;}}
    else leg.foot.lerp(target,1-Math.exp(-dt*(state==='slash'||state==='lunge'?30:16)));
   }else if(leg.free){leg.free=false;leg.from.copy(leg.foot);home(leg,leg.to);leg.step=.001;leg.duration=.12;leg.lift=.15;}
   if(leg.step>0){
    leg.step+=dt/leg.duration;const s=Math.min(1,leg.step),e=1-Math.pow(1-s,3);
    leg.foot.lerpVectors(leg.from,leg.to,e);leg.foot.y=Math.max(leg.to.y,Math.sin(s*Math.PI)*leg.lift+leg.from.y*(1-e));
    if(s>=1){leg.step=0;leg.foot.copy(leg.to);if(leg.to.y<=.001){events.push({type:'plant',x:leg.foot.x,z:leg.foot.z});if(Math.random()<.15)splat(leg.foot.x,leg.foot.z,.035+Math.random()*.035,4);}}
   }else if(!leg.free&&state!=='dead'){
    // Plant and snap: lift only when left behind, and never alongside a neighbour.
    const want=home(leg,tmp.clone()),gap=Math.hypot(want.x-leg.foot.x,want.z-leg.foot.z);
    const moving=vel.length()>.3,limit=moving?.42:.85;
    const busy=neighbours(i).some(n=>legs[n].step>0)||airborne>=(state==='skitter'||state==='flee'?4:3);
    const twitch=!moving&&Math.random()<dt*.25;
    if((gap>limit||twitch)&&!busy){
     leg.from.copy(leg.foot);leg.to.copy(want);if(twitch&&gap<limit)leg.to.add(new THREE.Vector3((Math.random()-.5)*.3,0,(Math.random()-.5)*.3));
     leg.to.addScaledVector(vel,.1);leg.step=.001;
     const fast=state==='skitter'||state==='flee'||state==='lunge';leg.duration=fast?.06+Math.random()*.03:.08+Math.random()*.06;leg.lift=fast?.3:.22+Math.random()*.15;
    }
   }
   const length=solve(leg,toParent(leg.hip,new THREE.Vector3()));
   leg.strand+=dt*(.25+(state==='shriek'||state==='grab'?.8:0));
   if(leg.strand>=1||(leg.step>0&&leg.strand>.6&&Math.random()<dt*8)){drip(new THREE.Vector3(leg.knee.x,leg.knee.y-length,leg.knee.z),.016);leg.strand=0;}
  });

  // Goo.
  const dripping=state==='dead'?0:state==='shriek'||state==='grab'?6:1.5;
  for(dropClock+=dt*dripping;dropClock>1;dropClock--)drip(toParent(new THREE.Vector3((Math.random()-.5)*.16,-.2-Math.random()*.25,.05+Math.random()*.25),new THREE.Vector3()),.014+Math.random()*.012);
  dropState.forEach((d,i)=>{
   if(d.alive){d.v.y-=9*dt;d.p.addScaledVector(d.v,dt);if(d.p.y<=0){d.alive=false;splat(d.p.x,d.p.z,d.size*2.2+Math.random()*.02,5);}}
   if(d.alive){dummy.position.copy(d.p);const stretch=1+Math.min(2.5,-d.v.y*.35);dummy.scale.set(d.size,d.size*stretch,d.size);}else dummy.scale.setScalar(0);
   dummy.rotation.set(0,0,0);dummy.updateMatrix();drops.setMatrixAt(i,dummy.matrix);
  });
  if(state==='dead'&&c.t>1.4&&c.t<3.2&&Math.random()<dt*10)splat(pos.x+(Math.random()-.5)*.6,pos.z+(Math.random()-.5)*.8,.25+Math.random()*.3,14);
  splatState.forEach((s,i)=>{
   s.age+=dt;const k=s.age/s.life,grow=Math.min(1,s.age*6)*(k>.7?Math.max(0,(1-k)/.3):1);
   dummy.position.set(s.x,.012+i*.00005,s.z);dummy.rotation.set(0,i*1.7,0);dummy.scale.set(s.r*grow*(1+.15*Math.sin(i)),1,s.r*grow);
   if(k>=1)dummy.scale.setScalar(0);dummy.updateMatrix();splats.setMatrixAt(i,dummy.matrix);
  });
  drops.instanceMatrix.needsUpdate=splats.instanceMatrix.needsUpdate=true;
  return events;
 }
 /** Snap to the next update's position instead of gliding there, for spawns and respawns. */
 function reset(){started=false;legs.forEach(l=>{l.step=0;l.free=false;});}
 return {root,body,legs,update,reset,get position(){return body.position;},dispose(){parent.remove(root);owned.forEach(o=>o.dispose());drops.dispose();splats.dispose();}};
}
