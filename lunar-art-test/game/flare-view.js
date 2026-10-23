import * as THREE from 'three';
import {FLARE,flareNow} from './peril.js';

/**
 * Road flares, after The Long Dark: a red paper stick whose cap is raked off in the hand in a spray of sparks, thrown
 * tumbling end over end, bouncing once and burning on the floor with a white-hot core, a hard red light that never
 * holds still, spitting sparks and a column of red-lit smoke. Lives in the active cave's space (its root).
 */
export const FLARE_GLOW=new THREE.Color(1,.045,.015);
/** The cave's own light (cave-view.js uGlow): strength at the core and how far it reaches, in metres. */
export const FLARE_LIGHT=Object.freeze({strength:2.6,reach:9});

const seeds=new WeakMap();
const seedOf=f=>{let s=seeds.get(f);if(s==null){s=Math.random()*100;seeds.set(f,s);}return s;};

/** A flare's brightness this instant, 0 to ~2: a rush as the cap catches, a restless flicker, a sputter near the end. */
export function flareLight(f,now,time=performance.now()/1000){
 if(!(now.lit>0))return 0;
 const s=seedOf(f),t=time+s,age=f.age??Infinity;
 const flicker=.8+.12*Math.sin(t*17.3)*Math.sin(t*5.1+1)+.08*Math.sin(t*43.7+s*3);
 const rush=1+.6*Math.max(0,1-(age-FLARE.strike)/.6);
 const sputter=f.t<6&&Math.sin(t*21.3)*Math.sin(t*6.7+s)<-.25?.35:1;
 return now.lit*flicker*rush*sputter;
}

const LENGTH=.32,RADIUS=.03,UP=new THREE.Vector3(0,1,0);
const radial=stops=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),f=g.createRadialGradient(64,64,0,64,64,64);stops.forEach(([at,color])=>f.addColorStop(at,color));g.fillStyle=f;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);};

/** Points sized in metres, so smoke and sparks keep their scale at any zoom (orthographic or perspective). */
function cloud(parent,count,{additive,fragment}){
 const pos=new Float32Array(count*3),vel=new Float32Array(count*3),life=new Float32Array(count),max=new Float32Array(count).fill(1),size=new Float32Array(count),grow=new Float32Array(count),age=new Float32Array(count),spin=new Float32Array(count);
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('aSize',new THREE.BufferAttribute(size,1));geo.setAttribute('aAge',new THREE.BufferAttribute(age,1));geo.setAttribute('aSpin',new THREE.BufferAttribute(spin,1));
 const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,uniforms:{uPx:{value:800},uLight:{value:1}},
  vertexShader:`uniform float uPx;attribute float aSize;attribute float aAge;attribute float aSpin;varying float vAge;varying float vSpin;
   void main(){vAge=aAge;vSpin=aSpin;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;
    float k=projectionMatrix[2][3]==0.0?projectionMatrix[1][1]:projectionMatrix[1][1]/-mv.z;gl_PointSize=aAge>=1.0?0.0:aSize*k*uPx*.5;}`,
  fragmentShader:`uniform float uLight;varying float vAge;varying float vSpin;${fragment}`});
 const points=new THREE.Points(geo,mat);points.frustumCulled=false;points.renderOrder=3;parent.add(points);let next=0;
 age.fill(1);
 return {mat,
  spawn(p,vx,vy,vz,seconds,metres,growth=0){const i=next;next=(next+1)%count;pos[i*3]=p.x;pos[i*3+1]=p.y;pos[i*3+2]=p.z;vel[i*3]=vx;vel[i*3+1]=vy;vel[i*3+2]=vz;life[i]=max[i]=seconds;size[i]=metres;grow[i]=growth;spin[i]=Math.random();},
  update(dt,{gravity=0,drag=0,bounce=0,rise=0,swirl=0,time=0}){
   for(let i=0;i<count;i++){
    if(life[i]<=0){age[i]=1;continue;}
    life[i]-=dt;const o=i*3,k=Math.exp(-drag*dt);
    vel[o]*=k;vel[o+2]*=k;vel[o+1]=vel[o+1]*k-gravity*dt+rise*dt;
    if(swirl){vel[o]+=Math.sin(pos[o+1]*3+time+spin[i]*9)*swirl*dt;vel[o+2]+=Math.cos(pos[o+1]*2.6+time*.8+spin[i]*7)*swirl*dt;}
    pos[o]+=vel[o]*dt;pos[o+1]+=vel[o+1]*dt;pos[o+2]+=vel[o+2]*dt;
    if(pos[o+1]<.02){pos[o+1]=.02;if(vel[o+1]<0){vel[o+1]*=-bounce;vel[o]*=.5;vel[o+2]*=.5;}}
    size[i]+=grow[i]*dt;age[i]=Math.min(.999,1-life[i]/max[i]);
   }
   geo.attributes.position.needsUpdate=geo.attributes.aSize.needsUpdate=geo.attributes.aAge.needsUpdate=true;
  },
  clear(){life.fill(0);age.fill(1);geo.attributes.aAge.needsUpdate=true;},
  dispose(){points.removeFromParent();geo.dispose();mat.dispose();},
 };
}

export function createFlareView(parent){
 const group=new THREE.Group();group.name='flares';parent.add(group);
 const owned=[],keep=o=>{owned.push(o);return o;};
 const paper=keep(new THREE.MeshStandardMaterial({color:'#c8161a',emissive:'#3a0204',roughness:.5,metalness:0})),band=keep(new THREE.MeshStandardMaterial({color:'#d9d4c8',roughness:.6}));
 const plastic=keep(new THREE.MeshStandardMaterial({color:'#151413',roughness:.35})),slag=keep(new THREE.MeshStandardMaterial({color:'#2a1210',roughness:.9}));
 const hot=keep(new THREE.MeshBasicMaterial({color:'#fff1e8',fog:false}));
 const bodyGeo=keep(new THREE.CylinderGeometry(RADIUS,RADIUS,LENGTH,14)),bandGeo=keep(new THREE.CylinderGeometry(RADIUS*1.06,RADIUS*1.06,.018,14));
 const buttGeo=keep(new THREE.CylinderGeometry(RADIUS*1.12,RADIUS*1.12,.028,14)),capGeo=keep(new THREE.CylinderGeometry(RADIUS*1.18,RADIUS*1.12,.07,14));
 const coreGeo=keep(new THREE.SphereGeometry(RADIUS*.95,12,8)),slagGeo=keep(new THREE.CylinderGeometry(RADIUS*1.04,RADIUS*1.04,.03,14,1,true));
 const coreTex=keep(radial([[0,'rgba(255,255,255,1)'],[.12,'rgba(255,236,226,.95)'],[.3,'rgba(255,90,60,.55)'],[.6,'rgba(200,20,10,.15)'],[1,'rgba(120,0,0,0)']]));
 const haloTex=keep(radial([[0,'rgba(255,90,60,1)'],[.18,'rgba(240,30,14,.55)'],[.5,'rgba(170,8,4,.16)'],[1,'rgba(80,0,0,0)']]));
 const sparkFrag=`void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,.0,d);if(a<.02)discard;
  vec3 c=mix(vec3(1.0,.95,.85),vec3(1.0,.18,.05),smoothstep(.0,.7,vAge));gl_FragColor=vec4(c*a*(1.0-vAge*vAge)*1.6,1.0);}`;
 // Smoke is drawn lit by the flare: hot pink-red at the core of the plume, deep red as it climbs and thins.
 const smokeFrag=`void main(){vec2 c=gl_PointCoord-.5;float r=length(c)*2.0;
  float n=.8+.2*sin(atan(c.y,c.x)*3.0+vSpin*20.0+r*4.0);float a=(1.0-smoothstep(.15,1.0,r/n))*sin(min(1.0,vAge*4.0)*1.5708)*(1.0-vAge)*.2;if(a<.004)discard;
  vec3 col=mix(vec3(1.0,.42,.34),vec3(.9,.16,.12),smoothstep(.0,.7,vAge))*uLight;gl_FragColor=vec4(col,a);}`;
 const sparks=cloud(group,420,{additive:true,fragment:sparkFrag}),smoke=cloud(group,420,{additive:false,fragment:smokeFrag});
 const lights=Array.from({length:3},()=>{const l=new THREE.PointLight('#ff2612',0,9,1.6);group.add(l);return l;});
 const capMat=plastic;const loose=[];

 function makeStick(){
  const g=new THREE.Group();
  const body=new THREE.Mesh(bodyGeo,paper);g.add(body);
  for(const y of [-.1,.07]){const b=new THREE.Mesh(bandGeo,band);b.position.y=y;g.add(b);}
  const butt=new THREE.Mesh(buttGeo,plastic);butt.position.y=-LENGTH/2-.01;g.add(butt);
  const cap=new THREE.Mesh(capGeo,capMat);cap.position.y=LENGTH/2+.015;g.add(cap);
  const burnt=new THREE.Mesh(slagGeo,slag);burnt.position.y=LENGTH/2-.01;burnt.visible=false;g.add(burnt);
  const core=new THREE.Mesh(coreGeo,hot);core.position.y=LENGTH/2+.01;core.visible=false;g.add(core);
  const glow=new THREE.Sprite(keep(new THREE.SpriteMaterial({map:coreTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false})));glow.renderOrder=4;
  const halo=new THREE.Sprite(keep(new THREE.SpriteMaterial({map:haloTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,fog:false})));halo.renderOrder=4;
  group.add(g,glow,halo);
  g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  return {g,cap,core,burnt,glow,halo,struck:false,from:null,fromQ:new THREE.Quaternion(),rest:null,sparkClock:0,smokeClock:0,last:new THREE.Vector3(),fresh:true};
 }
 const sticks=new Map();
 const hand=new THREE.Vector3(),elbow=new THREE.Vector3(),axis=new THREE.Vector3(),tip=new THREE.Vector3(),dir=new THREE.Vector3(),side=new THREE.Vector3(),q=new THREE.Quaternion(),v=new THREE.Vector3();
 let time=0;

 function popCap(s,root){
  // The striker cap comes away in the other hand's swipe and is flung aside.
  const cap=s.cap;s.g.updateMatrixWorld(true);cap.getWorldPosition(v);root.worldToLocal(v);
  s.g.remove(cap);const loose_={mesh:new THREE.Mesh(capGeo,capMat),p:v.clone(),v:new THREE.Vector3((Math.random()-.5)*2,2+Math.random(),(Math.random()-.5)*2),spin:new THREE.Vector3(Math.random()*20,Math.random()*20,Math.random()*20),age:0};
  loose_.mesh.position.copy(v);group.add(loose_.mesh);loose.push(loose_);
 }

 /** `root`: the cave root; `actor`: the astronaut (its left hand holds the flare until it is thrown). */
 function update(state,dt,{root,actor}){
  time+=dt;
  const p=state.player,here=(state.flares??[]).filter(f=>f.cave===p.cave&&(f.zone??0)===(p.zone??0));
  for(const [f,s] of sticks)if(!here.includes(f)){s.g.removeFromParent();s.glow.removeFromParent();s.halo.removeFromParent();sticks.delete(f);}
  const handBone=actor?.marker('Hand.L'),foreBone=actor?.marker('Forearm.L');
  const lit=[];
  for(const f of here){
   let s=sticks.get(f);if(!s){s=makeStick();sticks.set(f,s);}
   const now=flareNow(f,p),light=flareLight(f,now,time),seed=seedOf(f);
   if(now.stage==='hand'&&handBone){
    handBone.getWorldPosition(hand);foreBone.getWorldPosition(elbow);root.worldToLocal(hand);root.worldToLocal(elbow);
    axis.copy(hand).sub(elbow).normalize();
    s.g.position.copy(hand).addScaledVector(axis,.05);s.g.quaternion.setFromUnitVectors(UP,axis);
    s.from=s.g.position.clone();s.fromQ.copy(s.g.quaternion);
   }else if(now.stage==='hand'){s.g.position.set(now.x,1.2,now.z);s.from=s.g.position.clone();}
   else if(now.stage==='flight'){
    const from=s.from??new THREE.Vector3(f.fromX,1.4,f.fromZ),dist=Math.hypot(f.x-from.x,f.z-from.z),k=now.k;
    s.g.position.set(from.x+(f.x-from.x)*k,from.y+(.06-from.y)*k+(.45+dist*.09)*4*k*(1-k),from.z+(f.z-from.z)*k);
    dir.set(f.x-from.x,0,f.z-from.z).normalize();side.crossVectors(UP,dir).normalize();
    q.setFromAxisAngle(side,(1.2+dist*.22)*Math.PI*2*k);s.g.quaternion.copy(q).multiply(s.fromQ);
   }else{
    // Down: one hop and a skid, then it lies on its side with the burning end raised a touch on the slag.
    if(!s.rest){dir.set(f.x-(s.from?.x??f.fromX??f.x),0,f.z-(s.from?.z??f.fromZ??f.z));if(dir.lengthSq()<1e-6)dir.set(Math.sin(seed),0,Math.cos(seed));dir.normalize();
     const yaw=Math.atan2(dir.x,dir.z)+(seed%1-.5)*1.4;
     s.rest={q:new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2-.12,yaw,0,'YXZ')),dir:dir.clone(),startQ:s.g.quaternion.clone(),landed:f.age!=null?f.age-FLARE.release-f.flight:9};}
    const u=Math.min(1,(f.age!=null?f.age-FLARE.release-f.flight:9)/.7),e=1-(1-u)*(1-u);
    s.g.position.set(f.x+s.rest.dir.x*.35*e,RADIUS+.01+.32*Math.abs(Math.sin(u*Math.PI*1.6))*(1-u)*(1-u),f.z+s.rest.dir.z*.35*e);
    s.g.quaternion.slerpQuaternions(s.rest.startQ,s.rest.q,Math.min(1,u*2.2));
   }
   if(now.lit>0&&!s.struck){s.struck=true;popCap(s,root);
    s.g.updateMatrixWorld(true);tip.set(0,LENGTH/2+.02,0).applyMatrix4(s.g.matrix);
    for(let i=0;i<46;i++)sparks.spawn(tip,(Math.random()-.5)*5,Math.random()*3.5,(Math.random()-.5)*5,.25+Math.random()*.5,.035+Math.random()*.03);
   }
   if(!s.struck&&now.stage==='hand'&&f.age>FLARE.strike-.12&&Math.random()<dt*30){
    // A dry scratch or two before it catches.
    s.g.updateMatrixWorld(true);tip.set(0,LENGTH/2+.04,0).applyMatrix4(s.g.matrix);
    for(let i=0;i<3;i++)sparks.spawn(tip,(Math.random()-.5)*2.5,Math.random()*1.5,(Math.random()-.5)*2.5,.12+Math.random()*.15,.025);
   }
   s.core.visible=s.burnt.visible=s.glow.visible=s.halo.visible=now.lit>0;
   s.g.updateMatrixWorld(true);tip.set(0,LENGTH/2+.03,0).applyMatrix4(s.g.matrix);
   s.core.scale.setScalar(.8+.4*Math.min(1.5,light));
   s.glow.position.copy(tip);s.glow.scale.setScalar((.4+.25*light)*(.9+Math.random()*.2));s.glow.material.opacity=Math.min(1,light);s.glow.material.rotation=Math.random()*6.28;
   s.halo.position.copy(tip);s.halo.scale.setScalar(1.3+.9*light);s.halo.material.opacity=Math.min(1,.5*light);
   if(s.fresh){s.last.copy(tip);s.fresh=false;}
   const moving=v.copy(tip).sub(s.last).divideScalar(Math.max(dt,1e-4));s.last.copy(tip);if(moving.lengthSq()>900)moving.set(0,0,0);
   if(light>0){
    lit.push({tip:tip.clone(),light,hand:now.stage==='hand'});
    // It spits: a stream off the burning end, thrown in bursts, raining down and skittering on the rock.
    s.sparkClock+=dt*(45+60*Math.max(0,Math.sin(time*7.3+seed)))*Math.min(1.5,light);
    axis.set(0,1,0).applyQuaternion(s.g.quaternion);
    for(;s.sparkClock>1;s.sparkClock--)sparks.spawn(tip,axis.x*1.6+(Math.random()-.5)*2.2+moving.x*.4,axis.y*1.6+Math.random()*2+moving.y*.3,axis.z*1.6+(Math.random()-.5)*2.2+moving.z*.4,.2+Math.random()*.45,.02+Math.random()*.025);
    s.smokeClock+=dt*(now.stage==='down'?11:16)*Math.min(1,light);
    for(;s.smokeClock>1;s.smokeClock--)smoke.spawn(tip,(Math.random()-.5)*.3+moving.x*.25,.35+Math.random()*.35,(Math.random()-.5)*.3+moving.z*.25,2.6+Math.random()*1.8,.18+Math.random()*.12,.55+Math.random()*.35);
   }
  }
  for(let i=loose.length-1;i>=0;i--){const c=loose[i];c.age+=dt;c.v.y-=9*dt;c.p.addScaledVector(c.v,dt);
   if(c.p.y<.03){c.p.y=.03;c.v.y*=-.3;c.v.x*=.5;c.v.z*=.5;c.spin.multiplyScalar(.5);}
   c.mesh.position.copy(c.p);c.mesh.rotation.x+=c.spin.x*dt;c.mesh.rotation.z+=c.spin.z*dt;
   if(c.age>6){c.mesh.removeFromParent();loose.splice(i,1);}}
  // Real lights for the suit and anything else drawn with scene lighting; the cave rock takes the flare from its uGlow.
  lit.sort((a,b)=>b.hand-a.hand||b.light-a.light);
  lights.forEach((l,i)=>{const n=lit[i];l.intensity=n?26*n.light:0;if(n)l.position.copy(n.tip).y+=.15;});
  const brightest=lit.reduce((m,n)=>Math.max(m,n.light),0);
  sparks.mat.uniforms.uPx.value=smoke.mat.uniforms.uPx.value=window.innerHeight*Math.min(2,window.devicePixelRatio||1);
  smoke.mat.uniforms.uLight.value=.45+.55*Math.min(1.3,brightest);
  sparks.update(dt,{gravity:9.5,drag:.6,bounce:.35});
  smoke.update(dt,{drag:1.2,rise:.12,swirl:.5,time});
 }
 function clear(){for(const s of sticks.values()){s.g.removeFromParent();s.glow.removeFromParent();s.halo.removeFromParent();}sticks.clear();loose.forEach(c=>c.mesh.removeFromParent());loose.length=0;sparks.clear();smoke.clear();lights.forEach(l=>l.intensity=0);}
 return {update,clear,dispose(){clear();sparks.dispose();smoke.dispose();group.removeFromParent();owned.forEach(o=>o.dispose());}};
}
