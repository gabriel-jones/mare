import * as THREE from 'three';
import {createCrawlerView,scaled} from './crawler-view.js';
import {createHorrorView} from './horror-view.js';
import {createLampreyView} from './lamprey-view.js';
import {planetOf} from './planets.js';
import {createCentipedeView} from './centipede-view.js';
import {createBurrowFx} from './burrow-fx.js';
import {SHAPE} from './centipede.js';
import {CRAWLER,DODGE,KINDS,walkable} from './crawler.js';
import {caveLayout} from './caves.js';
import {grabbedBy} from './hunt.js';
import {FLARE} from './peril.js';
import {createFlareView} from './flare-view.js';
import {createSmoke} from './smoke-view.js';
import {createHiveView} from './hive-view.js';
import {buffed} from './farm.js';
import {createFlameJet} from './flame-view.js';
import {WEAPONS,armsOf,heldWeapon,reserveOf} from './arms.js';

/**
 * The hunt drawn: crawlers, their smoke, the weapon in hand and everything it throws (rounds, brass, sparks, ichor,
 * the flamethrower's jet), the astronaut's twist and step-turns toward the cursor, and the headlamp's fear of the dark.
 * Effects live in the active space's root, where the hunt's coordinates are: a cave view underground, or on the
 * surface `{root, surface: true}`, where the hatchlings are drawn by the caller and found through `lookup`.
 */
const UP=THREE.Object3D.DEFAULT_UP,TWIST=1,BULLET_SPEED=90,CASES=40,LAND=.3;
// What each gun's shot looks like, and which marker bones it fires from.
const GUNS={
 pistol:{muzzle:'Muzzle',ahead:'MuzzleAhead',port:'Port',out:'PortOut',flash:1,light:40,tracer:1,brass:1,shake:.07,sparks:4},
 railgun:{muzzle:'RailMuzzle',ahead:'RailMuzzleAhead',flash:1.6,light:70,shake:.2,sparks:10},
 smg:{muzzle:'SmgMuzzle',ahead:'SmgMuzzleAhead',port:'SmgPort',out:'SmgPortOut',flash:.9,light:35,tracer:.85,brass:.85,shake:.05,sparks:3},
 rifle:{muzzle:'RifleMuzzle',ahead:'RifleMuzzleAhead',port:'RiflePort',out:'RiflePortOut',flash:1.5,light:60,tracer:1.7,brass:1.35,shake:.11,sparks:8},
};
const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));

function particles(parent,count,{additive,color,size}){
 const pos=new Float32Array(count*3),vel=new Float32Array(count*3),life=new Float32Array(count),max=new Float32Array(count).fill(1),alpha=new Float32Array(count);
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('aAlpha',new THREE.BufferAttribute(alpha,1));
 const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,uniforms:{uColor:{value:new THREE.Color(color)},uSize:{value:size*Math.min(2,devicePixelRatio||1)}},
  vertexShader:'uniform float uSize;attribute float aAlpha;varying float vAlpha;void main(){vAlpha=aAlpha;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=uSize*(.6+.8*aAlpha);}',
  fragmentShader:'uniform vec3 uColor;varying float vAlpha;void main(){float a=smoothstep(.5,.1,length(gl_PointCoord-.5))*vAlpha;if(a<.01)discard;gl_FragColor=vec4(uColor,a);}'});
 const points=new THREE.Points(geo,mat);points.frustumCulled=false;parent.add(points);let next=0;
 return {
  spawn(x,y,z,vx,vy,vz,seconds){const i=next;next=(next+1)%count;pos.set([x,y,z],i*3);vel.set([vx,vy,vz],i*3);life[i]=seconds;max[i]=seconds;},
  update(dt,gravity=0,drag=0){for(let i=0;i<count;i++){if(life[i]<=0){alpha[i]=0;continue;}life[i]-=dt;const o=i*3,k=Math.exp(-drag*dt);vel[o]*=k;vel[o+2]*=k;vel[o+1]=vel[o+1]*k-gravity*dt;
   pos[o]+=vel[o]*dt;pos[o+1]=Math.max(.02,pos[o+1]+vel[o+1]*dt);pos[o+2]+=vel[o+2]*dt;const t=life[i]/max[i];alpha[i]=Math.max(0,Math.sin(t*Math.PI))*(additive?1:.55);}
   geo.attributes.position.needsUpdate=true;geo.attributes.aAlpha.needsUpdate=true;},
  clear(){life.fill(0);alpha.fill(0);geo.attributes.aAlpha.needsUpdate=true;},
  dispose(){geo.dispose();mat.dispose();},
 };
}

const LABEL={pistol:'PISTOL',smg:'SMG',rifle:'RIFLE',railgun:'RAILGUN',arc:'ARC',katana:'ELECTRIC KATANA'};
function createHud(){
 const root=document.createElement('div');root.className='hunt-hud';root.hidden=true;
 root.innerHTML=`<div class="hunt-hurt"></div><div class="hunt-prompt"><span>GRABBED — MASH E</span><i><b></b></i></div><div class="hunt-ammo"></div><div class="hunt-parry"></div>`;
 const style=document.createElement('style');style.textContent=`
.hunt-hud{position:fixed;inset:0;pointer-events:none;z-index:4;font:600 12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;color:#e8dccb}
.hunt-hurt{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(120,8,4,.75) 100%)}
.hunt-prompt{position:absolute;left:50%;top:30%;transform:translateX(-50%);display:none;text-align:center;font-size:15px;color:#ffd9c2;text-shadow:0 0 8px #000}
.hunt-prompt i{display:block;width:180px;height:5px;margin:8px auto 0;background:rgba(255,255,255,.12);border-radius:3px;overflow:hidden}
.hunt-prompt b{display:block;height:100%;width:0;background:#ffb26b}
.hunt-parry{position:absolute;left:50%;top:38%;transform:translateX(-50%);font-size:17px;letter-spacing:.24em;color:#bff4ff;text-shadow:0 0 10px #39c6ff,0 0 2px #000;opacity:0;transition:opacity .08s}
.hunt-ammo{position:absolute;right:18px;bottom:112px;padding:6px 10px;border-radius:6px;background:rgba(6,8,12,.62);text-shadow:0 0 6px #000}`;
 root.append(style);document.body.append(root);
 const parryText=root.querySelector('.hunt-parry'),hurt=root.querySelector('.hunt-hurt'),prompt=root.querySelector('.hunt-prompt'),meter=root.querySelector('.hunt-prompt b'),ammo=root.querySelector('.hunt-ammo');
 let lastAmmo='';
 return {
  update(on,{hurtFlash,grabbed,escape,weapon,loaded,reserve,reloading,parried=null}){
   root.hidden=!on;if(!on)return;
   parryText.style.opacity=parried?'1':'0';if(parried&&parryText.textContent!==parried)parryText.textContent=parried;
   hurt.style.opacity=String(Math.min(.85,hurtFlash));
   prompt.style.display=grabbed?'block':'none';if(grabbed)meter.style.width=`${Math.min(1,escape)*100}%`;
   const spec=WEAPONS[weapon],cells=`${reserve} CELL${reserve===1?'':'S'}`;
   const text=!weapon?'NO WEAPON':spec.melee?LABEL[weapon]:spec.ammo==='fuel'?`FUEL ${Math.ceil(loaded)}% · ${cells}${reloading?' · REFUELLING':''}`:spec.stream?`${LABEL[weapon]} ${Math.ceil(loaded)}% · ${cells}${reloading?' · RECHARGING':''}`:spec.ammo==='charge'?`${LABEL[weapon]} ${loaded}/${reserve} ${reserve===1?'CELL':'CELLS'}${reloading?' · RELOADING':''}`:`${LABEL[weapon]} ${loaded}/${reserve}${reloading?' · RELOADING':''}`;
   if(text!==lastAmmo){ammo.textContent=text;lastAmmo=text;}
  },
  dispose(){root.remove();},
 };
}

export function createCombatView({actor,player,headlamp,crawlerGLTF,lookup=null}){
 const fx=new THREE.Group();fx.name='hunt-effects';
 const toCave={value:new THREE.Matrix4()},viewDir={value:new THREE.Vector3()};
 let caveView=null,cave=null,seed=null,hive=null;
 const jet=createFlameJet(fx),viewFor=c=>c?views.get(c)?.view??lookup?.(c)??null:null;
 const views=new Map(),hud=createHud();

 const muzzleLight=new THREE.PointLight('#ffc27a',0,7,2);fx.add(muzzleLight);
 const bulletGeo=new THREE.CylinderGeometry(.03,.012,1,6).rotateX(Math.PI/2),bulletMat=new THREE.MeshBasicMaterial({color:'#ffdcaa',transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});
 const bullets=Array.from({length:8},()=>{const mesh=new THREE.Mesh(bulletGeo,bulletMat);mesh.visible=false;mesh.frustumCulled=false;fx.add(mesh);return {mesh,from:new THREE.Vector3(),dir:new THREE.Vector3(),travelled:0,length:0,live:false};});
 const caseMesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.03,.03,.1,8),new THREE.MeshBasicMaterial(),CASES);const caseSize=new Float32Array(CASES).fill(1);caseMesh.frustumCulled=false;caseMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);fx.add(caseMesh);
 const cases=Array.from({length:CASES},()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),q:new THREE.Quaternion(),lie:new THREE.Quaternion(),spin:new THREE.Vector3(),age:99,bounces:0}));
 const brass=new THREE.Color('#4a3a1c'),hotBrass=new THREE.Color('#ffd08a'),caseColor=new THREE.Color(),caseMatrix=new THREE.Matrix4(),spinQ=new THREE.Quaternion(),one=new THREE.Vector3(1,1,1),euler=new THREE.Euler();
 const hideCases=()=>{for(let i=0;i<CASES;i++){cases[i].age=99;caseMesh.setColorAt(i,brass);caseMesh.setMatrixAt(i,caseMatrix.makeScale(0,0,0));}caseMesh.instanceMatrix.needsUpdate=true;caseMesh.instanceColor.needsUpdate=true;};
 hideCases();let nextCase=0;
 const flashTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),f=g.createRadialGradient(32,32,0,32,32,32);f.addColorStop(0,'rgba(255,240,200,1)');f.addColorStop(.3,'rgba(255,170,80,.5)');f.addColorStop(1,'rgba(255,120,40,0)');g.fillStyle=f;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
 const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:flashTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0}));flash.scale.setScalar(1.4);fx.add(flash);
 const impactFlash=new THREE.Sprite(new THREE.SpriteMaterial({map:flashTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0}));impactFlash.scale.setScalar(.9);fx.add(impactFlash);
 const ichor=particles(fx,80,{additive:false,color:'#020203',size:10}),sparks=particles(fx,60,{additive:true,color:'#ffb066',size:7}),dust=particles(fx,40,{additive:true,color:'#2c323c',size:30});
 const smoke=createSmoke(fx),flares=createFlareView(fx),thrown=new WeakSet(),burrows=createBurrowFx(fx,{dim:true});
 // The katana: a cyan glow that rides the blade, sparks off it, and a ribbon traced by the blade through each swing.
 const zaps=particles(fx,90,{additive:true,color:'#8fe6ff',size:6}),bladeLight=new THREE.PointLight('#8fe6ff',0,4,2);fx.add(bladeLight);
 const TRAIL=24,trailPos=new Float32Array(TRAIL*6),trailAlpha=new Float32Array(TRAIL*2),trailGeo=new THREE.BufferGeometry();
 trailGeo.setAttribute('position',new THREE.BufferAttribute(trailPos,3));trailGeo.setAttribute('aAlpha',new THREE.BufferAttribute(trailAlpha,1));
 trailGeo.setIndex(Array.from({length:TRAIL-1},(_,i)=>[2*i,2*i+1,2*i+2,2*i+1,2*i+3,2*i+2]).flat());
 const trailMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  vertexShader:'attribute float aAlpha;varying float vAlpha;varying float vEdge;void main(){vAlpha=aAlpha;vEdge=float(gl_VertexID%2);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'varying float vAlpha;varying float vEdge;void main(){float e=vEdge*vEdge*vEdge;vec3 c=mix(vec3(.1,.55,1.),vec3(.8,1.,1.),e*e);gl_FragColor=vec4(c,vAlpha*e*.85);}'});
 const trailMesh=new THREE.Mesh(trailGeo,trailMat);trailMesh.frustumCulled=false;fx.add(trailMesh);
 const trail=[];let slashT=9,crackle=0;
 // Lightning and the railgun's beam: camera-facing ribbons rebuilt every frame from a list of segments.
 const BOLTS=240,boltPos=new Float32Array(BOLTS*12),boltAlpha=new Float32Array(BOLTS*4),boltEdge=new Float32Array(BOLTS*4),boltGeo=new THREE.BufferGeometry();
 for(let i=0;i<BOLTS;i++)boltEdge.set([-1,1,-1,1],i*4);
 boltGeo.setAttribute('position',new THREE.BufferAttribute(boltPos,3));boltGeo.setAttribute('aAlpha',new THREE.BufferAttribute(boltAlpha,1));boltGeo.setAttribute('aEdge',new THREE.BufferAttribute(boltEdge,1));
 boltGeo.setIndex(Array.from({length:BOLTS},(_,i)=>[4*i,4*i+1,4*i+2,4*i+1,4*i+3,4*i+2]).flat());
 const boltMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  vertexShader:'attribute float aAlpha;attribute float aEdge;varying float vAlpha;varying float vEdge;void main(){vAlpha=aAlpha;vEdge=aEdge;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'varying float vAlpha;varying float vEdge;void main(){float e=1.-abs(vEdge);float core=smoothstep(.55,1.,e);vec3 c=mix(vec3(.15,.6,1.),vec3(.92,1.,1.),core);gl_FragColor=vec4(c,vAlpha*(e*e*.7+core*.6));}'});
 const boltMesh=new THREE.Mesh(boltGeo,boltMat);boltMesh.frustumCulled=false;fx.add(boltMesh);
 const energyLight=new THREE.PointLight('#8fe6ff',0,7,2);fx.add(energyLight);
 let bolts=0,rails=[];const _side=new THREE.Vector3(),_seg=new THREE.Vector3();
 function ribbon(a,b,width,alpha){
  if(bolts>=BOLTS)return;_seg.subVectors(b,a);_side.crossVectors(_seg,viewDir.value).normalize().multiplyScalar(width);
  boltPos.set([a.x-_side.x,a.y-_side.y,a.z-_side.z,a.x+_side.x,a.y+_side.y,a.z+_side.z,b.x-_side.x,b.y-_side.y,b.z-_side.z,b.x+_side.x,b.y+_side.y,b.z+_side.z],bolts*12);
  boltAlpha.fill(alpha,bolts*4,bolts*4+4);bolts++;
 }
 /** A jagged bolt from a to b: kinks thrown sideways and up, most in the middle. */
 function lightning(a,b,width,alpha,amp=.35,kinks=7){
  let prev=a.clone();
  for(let i=1;i<=kinks;i++){
   const t=i/kinks,next=new THREE.Vector3().lerpVectors(a,b,t);
   if(i<kinks){const k=Math.sin(Math.PI*t)*amp;next.x+=(Math.random()-.5)*2*k;next.y+=(Math.random()-.5)*1.2*k;next.z+=(Math.random()-.5)*2*k;}
   ribbon(prev,next,width,alpha);prev=next;
  }
 }
 const aimMarker=new THREE.Mesh(new THREE.RingGeometry(.18,.24,24).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:'#ffcf9a',transparent:true,opacity:.6,depthWrite:false}));aimMarker.position.y=.05;aimMarker.visible=false;fx.add(aimMarker);

 const localOf=(o,v=new THREE.Vector3())=>caveView.root.worldToLocal(o.getWorldPosition(v));
 let parryGlow=0,parryNote=null,bodyYaw=null,turning=false,act=null,strain=0,wasAirborne=false,flicker=0,stutter=0,shake=0,hurtFlash=0,lastHealth=null,pending=[];
 // Where the cursor aims, in this space ({x, z}, with y and pitch on the surface), and the body's lean toward it.
 let aimAt=null,pitch=0;const lastMuzzle=new THREE.Vector3(0,1.2,0);
 const wisps=new Map(),wispFrom=new THREE.Vector3(),burns=new Map();

 function play(clip,rate=1){if(act?.clip===clip)actor.restart();act={clip,t:0,len:actor.duration(clip)/rate,rate};}
 function clearViews(){views.forEach(v=>v.view.dispose());views.clear();wisps.clear();burns.clear();}
 function clearEffects(){bullets.forEach(b=>{b.live=false;b.mesh.visible=false;});hideCases();ichor.clear();sparks.clear();dust.clear();smoke.clear();flares.clear();flash.material.opacity=0;impactFlash.material.opacity=0;muzzleLight.intensity=0;jet.clear();pending=[];zaps.clear();trail.length=0;slashT=9;rails=[];bolts=0;boltAlpha.fill(0);boltGeo.attributes.aAlpha.needsUpdate=true;energyLight.intensity=0;}

 /** The cave the player is now in. Effects move into its space; crawlers of the last cave are dropped. */
 function enter(view,state){
  if(view===caveView)return;
  clearViews();clearEffects();act=null;bodyYaw=null;
  caveView=view;seed=state.seed;cave=view.surface?null:caveLayout(state.seed,state.player.cave,state.player.zone??0);
  view.root.add(fx);view.root.updateMatrixWorld(true);
  toCave.value.copy(view.root.matrixWorld).invert();
  viewDir.value.set(26,34,26).normalize().applyAxisAngle(UP,-view.root.rotation.y);
  hive?.dispose();hive=cave?createHiveView(view,cave,{zone:state.player.zone??0,toCave,viewDir,smoke,fire:jet}):null;
 }
 function leave(){
  if(!caveView)return;
  clearViews();clearEffects();hive?.dispose();hive=null;fx.removeFromParent();caveView=null;cave=null;act=null;bodyYaw=null;
  actor.root.rotation.y=0;hud.update(false,{});
 }

 /** A crawler drawn at its kind's size: its view walks a cave scaled about the origin by the same factor (see scaled). */
 function sized(c,look){
  const s=c.size??1,kind=KINDS[c.kind],mars=planetOf(seed)==='mars';
  // On Mars the same hunters are tentacled jelly (horror-view.js).
  const make=(parent,opts)=>mars?createHorrorView(parent,{...look,...opts,size:s}):createCrawlerView(crawlerGLTF,parent,{...look,girth:kind?.belly??0,...opts});
  if(s===1)return make(caveView.root,{});
  const holder=new THREE.Group();holder.scale.setScalar(s);caveView.root.add(holder);
  const view=make(holder,{lite:s<1,size:s}),at=new THREE.Vector3();
  return {
   update:(c,dt,ctx={})=>view.update(scaled(c,s),dt,{...ctx,player:ctx.player&&{x:ctx.player.x/s,z:ctx.player.z/s}}),
   get position(){return at.copy(view.position).multiplyScalar(s);},
   hit:(point,dir)=>view.hit(point.clone().divideScalar(s),dir),
   burn:(h,k)=>view.burn(h,k),burning:()=>view.burning().map(p=>p.clone().multiplyScalar(s)),
   dispose:()=>{view.dispose();holder.removeFromParent();},
  };
 }
 function syncViews(hunt){
  for(const c of hunt.crawlers)if(!views.has(c)){
   const look={mode:'sight',sight:caveView.sight,toCave,viewDir};
   views.set(c,{view:c.kind==='centipede'?(planetOf(seed)==='mars'?createLampreyView(caveView.root,{...look,segments:SHAPE.segments,spacing:SHAPE.spacing}):createCentipedeView(crawlerGLTF,caveView.root,{...look,style:SHAPE.style,freak:SHAPE.freak})):sized(c,look),last:new THREE.Vector3(),vel:new THREE.Vector3(),fresh:true});
  }
  for(const [c,v] of views)if(!hunt.crawlers.includes(c)){v.view.dispose();views.delete(c);wisps.delete(c);}
 }

 /** Read what the hunt did since the last frame; body reactions now, gunfire once the pose is up to date. */
 function drain(hunt){
  for(const e of hunt.events.splice(0)){
   if(e.type==='roll')play('roll',actor.duration('roll')/DODGE.time);
   else if(e.type==='slash'){shake=Math.max(shake,.35);if(!hunt.rolling)play('hurt');}
   else if(e.type==='grab'){shake=Math.max(shake,.3);act=null;}
   else if(e.type==='strain')strain+=.8;
   else if(e.type==='throwoff')play('throwoff');
   else if(e.type==='shriek')flicker=Math.max(flicker,.9);
   else if(e.type==='swing'){play('katanaslash');trail.length=0;slashT=0;}
   else if(e.type==='guard')play('katanaparry');
   else if(e.type==='parried'){pending.push(e);parryNote={text:e.perfect?'PERFECT PARRY':'PARRY',t:.75};}
   else if(e.type==='shot'||e.type==='impact'||e.type==='rail')pending.push(e);
  }
 }

 /** The astronaut's pose for this frame. Sets the body's yaw under the aim; the caller runs the actor. */
 function pose(state,renderPose,hunt,dt){
  syncViews(hunt);drain(hunt);
  for(const f of state.flares??[])if(f.age!=null&&f.age<FLARE.release&&!thrown.has(f)){thrown.add(f);actor.throwFlare();}
  const p=state.player,facing=renderPose.facing??0;
  if(bodyYaw==null)bodyYaw=facing;
  const airborne=renderPose.animation==='jump';
  if(wasAirborne&&!airborne)play('land',actor.duration('land')/LAND);
  wasAirborne=airborne;
  if(act){act.t+=dt;if(act.t>=act.len)act=null;}
  strain*=Math.exp(-dt*2.5);
  const moving=hunt.rolling?0:p.speed??0,grabbed=grabbedBy(hunt);
  let anim='aimidle',rate=1;
  if(grabbed){anim='struggle';rate=1+Math.min(2.5,strain);act=null;}
  else if(act){anim=act.clip;rate=act.rate;}
  else if(airborne)anim='jump';
  else if(moving>.5)anim=moving>5.2?'aimrun':'aimwalk';
  const backward=moving>.5&&(p.vx??0)*Math.sin(facing)+(p.vz??0)*Math.cos(facing)<-.3*moving;
  // The gun is always on the cursor: the torso takes up the twist, and the hips are dragged round so it never twists
  // past TWIST. Standing, the feet then step round under it; moving or mid-action they just swing on.
  let twist=0;
  if(hunt.rolling){bodyYaw=Math.atan2(hunt.dodge.dx,hunt.dodge.dz);turning=false;}
  else{
   let diff=wrapAngle(facing-bodyYaw);
   if(Math.abs(diff)>TWIST){bodyYaw=facing-Math.sign(diff)*TWIST;diff=Math.sign(diff)*TWIST;}
   if(anim==='aimidle'){
    if(Math.abs(diff)>.5)turning=true;
    if(turning){
     const speed=Math.min(9,Math.max(2.6,Math.abs(diff)*6));
     bodyYaw+=Math.sign(diff)*Math.min(Math.abs(diff),speed*dt);anim=diff>0?'turnl':'turnr';rate=speed/(Math.PI/2);
     if(Math.abs(diff)<.04)turning=false;
    }
   }else{turning=false;bodyYaw+=diff*(1-Math.exp(-dt*14));}
   twist=wrapAngle(facing-bodyYaw);
  }
  // The player group already turns with the aim; the body is set relative to it.
  actor.root.rotation.y=wrapAngle(bodyYaw-facing);
  pitch+=((hunt.rolling?0:aimAt?.pitch??0)-pitch)*(1-Math.exp(-dt*10));
  return {...renderPose,animation:anim,speed:moving,weapon:heldWeapon(state),backward,rate,twist,pitch};
 }

 /** How high a round that hit nothing is at (x, z): level underground; on the surface along the line to the aim. */
 function lineHeight(from,x,z){
  if(!aimAt||aimAt.y==null)return .95;
  const run=Math.hypot(aimAt.x-from.x,aimAt.z-from.z);if(run<.5)return aimAt.y;
  return from.y+(aimAt.y-from.y)*Math.hypot(x-from.x,z-from.z)/run;
 }
 function fireShot(e){
  const g=GUNS[e.weapon]??GUNS.pistol;
  actor.fire();actor.root.updateMatrixWorld(true);
  const muzzle=localOf(actor.marker(g.muzzle)),ahead=localOf(actor.marker(g.ahead)).sub(muzzle).normalize();
  flash.position.copy(muzzle).addScaledVector(ahead,.12*g.flash);flash.scale.setScalar((.8+Math.random()*.5)*g.flash);flash.material.rotation=Math.random()*6.28;flash.material.opacity=1;
  muzzleLight.position.copy(flash.position);muzzleLight.intensity=g.light;
  for(let i=0;i<g.sparks;i++)sparks.spawn(flash.position.x,flash.position.y,flash.position.z,ahead.x*4+(Math.random()-.5)*2,ahead.y*4+Math.random(),ahead.z*4+(Math.random()-.5)*2,.08+Math.random()*.08);
  flicker=Math.max(flicker,.05);shake=Math.max(shake,g.shake);
  const b=bullets.find(b=>!b.live)??bullets[0],target=viewFor(e.target),targetY=target?target.position.y:lineHeight(muzzle,e.x,e.z);
  lastMuzzle.copy(muzzle);  b.from.copy(muzzle);b.dir.set(e.x,targetY,e.z).sub(b.from);b.length=b.dir.length();b.dir.normalize();
  b.travelled=0;b.live=true;b.mesh.visible=true;b.thick=g.tracer;
  // Brass out of the port.
  const port=localOf(actor.marker(g.port)),out=localOf(actor.marker(g.out)).sub(port).normalize(),k=nextCase,c=cases[k];nextCase=(nextCase+1)%CASES;caseSize[k]=g.brass;
  c.p.copy(port);c.v.copy(out).multiplyScalar(2.2+Math.random()*1.2);c.v.x+=(Math.random()-.5)*.6;c.v.y+=2.2+Math.random()*1.2;c.v.z+=(Math.random()-.5)*.6;
  c.q.setFromEuler(euler.set(Math.random()*6,Math.random()*6,0));c.lie.setFromEuler(euler.set(Math.PI/2,0,Math.random()*6.28,'YXZ'));euler.order='XYZ';
  c.spin.set((Math.random()-.5)*50,(Math.random()-.5)*20,(Math.random()-.5)*50);c.age=0;c.bounces=0;
 }
 /** The railgun lets go: a kick, a flash and a beam out to where the slug left the cave or its range. */
 function fireRail(e){
  const g=GUNS.railgun;actor.fire();actor.root.updateMatrixWorld(true);
  const muzzle=localOf(actor.marker(g.muzzle)),ahead=localOf(actor.marker(g.ahead)).sub(muzzle).normalize();
  flash.position.copy(muzzle).addScaledVector(ahead,.15);flash.scale.setScalar(1.2+e.power);flash.material.rotation=Math.random()*6.28;flash.material.opacity=1;
  rails.push({from:muzzle.clone(),to:new THREE.Vector3(e.x,muzzle.y,e.z),age:0,power:e.power});
  for(let i=0;i<24;i++){const t=Math.random(),at=new THREE.Vector3().lerpVectors(muzzle,rails.at(-1).to,t);zaps.spawn(at.x,at.y,at.z,(Math.random()-.5)*2,Math.random()*1.5,(Math.random()-.5)*2,.2+Math.random()*.3);}
  energyLight.position.copy(muzzle);energyLight.intensity=60*e.power;
  flicker=Math.max(flicker,.1);shake=Math.max(shake,g.shake*(.5+e.power));
 }
 /** The arc projector's lightning, the railgun's charge gathering at its muzzle, and fading rail beams. */
 function energy(state,hunt,dt){
  bolts=0;const held=heldWeapon(state);let light=0;
  if(hunt.arc&&held==='arc'){
   const emitter=localOf(actor.marker('ArcEmitter')),points=[emitter];
   for(const c of hunt.arc.struck){const v=viewFor(c);if(v)points.push(new THREE.Vector3(c.x,v.position.y,c.z));}
   if(points.length===1&&hunt.arc.end)points.push(new THREE.Vector3(hunt.arc.end.x,emitter.y-.2,hunt.arc.end.z));
   for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],amp=Math.min(.6,a.distanceTo(b)*.08);
    lightning(a,b,.05,1,amp);lightning(a,b,.025,.7,amp*1.6,9);
    if(Math.random()<.6)for(let k=0;k<3;k++)zaps.spawn(b.x,b.y,b.z,(Math.random()-.5)*5,Math.random()*3,(Math.random()-.5)*5,.1+Math.random()*.15);
   }
   if(points.length===1)for(let k=0;k<3;k++){const a=Math.random()*6.28;lightning(emitter,emitter.clone().add(new THREE.Vector3(Math.cos(a)*.5,(Math.random()-.3)*.4,Math.sin(a)*.5)),.02,.8,.12,3);}
   energyLight.position.copy(points.at(-1));light=18+Math.random()*14;shake=Math.max(shake,.03);flicker=Math.max(flicker,.03);
  }
  if(hunt.charging!=null&&held==='railgun'){
   const spec=WEAPONS.railgun,k=Math.min(1,hunt.charging/spec.charge),muzzle=localOf(actor.marker('RailMuzzle'));
   if(Math.random()<.3+k*.7){const a=Math.random()*6.28,r=.6-k*.3,from=new THREE.Vector3(muzzle.x+Math.cos(a)*r,muzzle.y+(Math.random()-.5)*r,muzzle.z+Math.sin(a)*r);lightning(from,muzzle,.015+.02*k,.5+.5*k,.08,3);}
   if(k>=1&&Math.random()<.5)zaps.spawn(muzzle.x,muzzle.y,muzzle.z,(Math.random()-.5)*2,Math.random()*1.5,(Math.random()-.5)*2,.1);
   energyLight.position.copy(muzzle);light=Math.max(light,4+k*16+(k>=1?Math.random()*6:0));
  }
  for(const r of rails){
   r.age+=dt;const f=Math.max(0,1-r.age/.35);
   if(f>0){ribbon(r.from,r.to,(.05+.12*r.power)*f+.02,f);lightning(r.from,r.to,.025,f*.8,.25*f,12);}
  }
  rails=rails.filter(r=>r.age<.35);
  energyLight.intensity=Math.max(light,energyLight.intensity-dt*240);
  for(let i=bolts;i<BOLTS;i++)boltAlpha.fill(0,i*4,i*4+4);
  boltGeo.attributes.position.needsUpdate=true;boltGeo.attributes.aAlpha.needsUpdate=true;
 }
 /** The katana's glow and crackle while held, and the ribbon its edge leaves through a swing. */
 function blade(state,dt){
  const held=heldWeapon(state)==='katana',base=held&&actor.marker('BladeBase'),tip=held&&actor.marker('BladeTip');
  slashT+=dt;
  if(!base||!tip){bladeLight.intensity=0;trail.length=0;trailAlpha.fill(0);trailGeo.attributes.aAlpha.needsUpdate=true;return;}
  const a=localOf(base),b=localOf(tip),swinging=slashT<.42,cutting=slashT>.09&&slashT<.34;
  bladeLight.position.lerpVectors(a,b,.6);bladeLight.intensity=Math.max(parryGlow*60,swinging?28*(1-slashT/.42)+5:5+Math.random()*1.5);parryGlow=Math.max(0,parryGlow-dt*3);
  if((crackle-=dt)<0){crackle=.05+Math.random()*.2;const k=Math.random(),at=new THREE.Vector3().lerpVectors(a,b,k);zaps.spawn(at.x,at.y,at.z,(Math.random()-.5)*1.5,Math.random()*1.2,(Math.random()-.5)*1.5,.08+Math.random()*.1);}
  if(cutting)trail.unshift({a,b,age:0});
  for(const s of trail)s.age+=dt;
  while(trail.length&&(trail.length>TRAIL||trail.at(-1).age>.15))trail.pop();
  for(let i=0;i<TRAIL;i++){
   const s=trail[Math.min(i,trail.length-1)];
   if(!s){trailAlpha[2*i]=trailAlpha[2*i+1]=0;continue;}
   trailPos.set([s.a.x,s.a.y,s.a.z,s.b.x,s.b.y,s.b.z],i*6);
   const k=i<trail.length?Math.max(0,1-s.age/.15)*(1-i/TRAIL):0;trailAlpha[2*i]=k*.5;trailAlpha[2*i+1]=k;
  }
  trailGeo.attributes.position.needsUpdate=true;trailGeo.attributes.aAlpha.needsUpdate=true;
 }
 /** A blow turned on the blade: a burst of charge off the edge, an arc into what struck, the jelly quivering. */
 function parryFx(e){
  const v=viewFor(e.crawler),tip=actor.marker('BladeTip'),at=tip?localOf(tip):new THREE.Vector3(e.x,1.2,e.z),to=v?v.position.clone():new THREE.Vector3(e.x,.85,e.z);
  for(let i=0,n=e.perfect?60:36;i<n;i++){const a=Math.random()*Math.PI*2,s=3+Math.random()*(e.perfect?7:5);zaps.spawn(at.x,at.y,at.z,Math.cos(a)*s,Math.random()*4,Math.sin(a)*s,.15+Math.random()*.25);}
  for(let i=0;i<(e.heavy?10:22);i++){const p=new THREE.Vector3().lerpVectors(at,to,Math.random());zaps.spawn(p.x,p.y,p.z,(Math.random()-.5)*2,Math.random()*1.5,(Math.random()-.5)*2,.15+Math.random()*.2);}
  for(let i=0;i<14;i++)sparks.spawn(at.x,at.y,at.z,(Math.random()-.5)*6,Math.random()*4,(Math.random()-.5)*6,.12+Math.random()*.2);
  impactFlash.position.copy(at);impactFlash.scale.setScalar(e.perfect?2.4:1.6);impactFlash.material.opacity=1;
  if(v)v.hit(to,new THREE.Vector3(to.x-at.x,0,to.z-at.z).normalize());
  parryGlow=e.perfect?1:.7;shake=Math.max(shake,e.perfect?.45:.3);flicker=Math.max(flicker,.12);
 }
 function impact(e){
  const dir=new THREE.Vector3(e.dir.x,0,e.dir.z),v=viewFor(e.crawler);impactFlash.scale.setScalar(.9);
  if(e.melee){const y=v?v.position.y:.85;for(let i=0;i<18;i++){const a=Math.random()*Math.PI*2,s=2+Math.random()*4;zaps.spawn(e.x-dir.x*.3,y,e.z-dir.z*.3,Math.cos(a)*s,Math.random()*3,Math.sin(a)*s,.12+Math.random()*.18);}shake=Math.max(shake,.12);flicker=Math.max(flicker,.06);}
  if(v){
   const at=new THREE.Vector3(e.x,v.position.y,e.z);
   v.hit(at,dir);impactFlash.position.copy(at).addScaledVector(dir,-.2);impactFlash.material.opacity=1;
   for(let i=0;i<16;i++){const a=Math.random()*Math.PI*2,s=1.5+Math.random()*3;ichor.spawn(at.x,at.y,at.z,Math.cos(a)*s+dir.x*2,1+Math.random()*2.5,Math.sin(a)*s+dir.z*2,.35+Math.random()*.35);}
   return;
  }
  // A nest bleeds: ichor sprays back out of the burrow.
  if(e.nest){
   const at=new THREE.Vector3(e.x,.85,e.z);impactFlash.position.copy(at).addScaledVector(dir,-.2);impactFlash.material.opacity=.8;
   for(let i=0;i<22;i++){const a=Math.random()*Math.PI*2,s=1+Math.random()*2.5;ichor.spawn(at.x,at.y,at.z,Math.cos(a)*s-dir.x*3,.8+Math.random()*2.5,Math.sin(a)*s-dir.z*3,.4+Math.random()*.4);}
   return;
  }
  // Rock: sparks off the wall and a puff of dust. On the surface the round spends itself out along the aim.
  const y=aimAt?.y!=null?lineHeight(lastMuzzle,e.x,e.z):.95;
  for(let i=0;i<12;i++)sparks.spawn(e.x,y,e.z,-dir.x*(2+Math.random()*3)+(Math.random()-.5)*3,Math.random()*3,-dir.z*(2+Math.random()*3)+(Math.random()-.5)*3,.15+Math.random()*.25);
  for(let i=0;i<5;i++)dust.spawn(e.x,y,e.z,-dir.x*.6+(Math.random()-.5)*.5,.1+Math.random()*.3,-dir.z*.6+(Math.random()-.5)*.5,.8+Math.random()*.6);
  impactFlash.position.set(e.x,y,e.z);impactFlash.material.opacity=.6;
 }

 /** After the actor has been posed: gunfire from the real muzzle, everything in flight, the crawlers and their smoke. */
 function after(state,hunt,dt){
  for(const e of pending)(e.type==='shot'?fireShot:e.type==='rail'?fireRail:e.type==='parried'?parryFx:impact)(e);pending=[];
  for(const b of bullets){if(!b.live)continue;b.travelled+=BULLET_SPEED*dt;if(b.travelled>=b.length){b.live=false;b.mesh.visible=false;continue;}
   const streak=Math.min(1.1*(b.thick??1),b.travelled);b.mesh.scale.set(b.thick??1,b.thick??1,streak);b.mesh.position.copy(b.from).addScaledVector(b.dir,b.travelled-streak/2);b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),b.dir);}
  for(let i=0;i<CASES;i++){const c=cases[i];if(c.age>9)continue;c.age+=dt;
   c.v.y-=9*dt;const nx=c.p.x+c.v.x*dt,nz=c.p.z+c.v.z*dt;
   if(!cave||walkable(cave,nx,nz,.05)){c.p.x=nx;c.p.z=nz;}else{c.v.x*=-.4;c.v.z*=-.4;}
   c.p.y+=c.v.y*dt;
   if(c.p.y<.03&&c.v.y<0){c.p.y=.03;c.bounces++;c.v.y*=-.35;c.v.x*=.55;c.v.z*=.55;c.spin.multiplyScalar(.45);c.q.slerp(c.lie,.6);}
   if(c.bounces&&c.v.lengthSq()<.05){c.v.set(0,0,0);c.q.slerp(c.lie,.3);}
   else{spinQ.setFromEuler(euler.set(c.spin.x*dt,c.spin.y*dt,c.spin.z*dt));c.q.multiply(spinQ);}
   const fade=c.age>8?Math.max(0,9-c.age):1;
   const size=fade*caseSize[i];caseMatrix.compose(c.p,c.q,one.set(size,size*1.15,size));caseMesh.setMatrixAt(i,caseMatrix);
   caseMesh.setColorAt(i,caseColor.copy(brass).lerp(hotBrass,Math.max(0,1-c.age/1.4)));
  }
  caseMesh.instanceMatrix.needsUpdate=true;caseMesh.instanceColor.needsUpdate=true;
  blade(state,dt);energy(state,hunt,dt);
  sparks.update(dt,9,1);dust.update(dt,0,2);ichor.update(dt,9,.5);zaps.update(dt,4,3);
  flash.material.opacity=Math.max(0,flash.material.opacity-dt*16);impactFlash.material.opacity=Math.max(0,impactFlash.material.opacity-dt*10);muzzleLight.intensity=Math.max(0,muzzleLight.intensity-dt*800);
  const p=state.player,martian=planetOf(seed)==='mars';
  for(const [c,v] of views){
   v.view.update(c,dt,{player:p});
   const at=v.view.position;
   if(v.fresh){v.last.copy(at);v.fresh=false;}
   if(dt>0){v.vel.copy(at).sub(v.last).divideScalar(dt);if(v.vel.lengthSq()>400)v.vel.set(0,0,0);}v.last.copy(at);
   // A thin wisp rises off it; dying, it pours out enough to hide the seizure, thinning as the body melts away.
   // Martian jelly doesn't smoke: it melts into goo (horror-view.js).
   if(martian)continue;
   const s=c.state,shroud=s==='dead'?(c.t<.25?100:c.t<4.6?40:40*Math.max(0,1-(c.t-4.6)/1.2)):0;
   let clock=(wisps.get(c)??Math.random())+dt*(s==='dead'?shroud:s==='flee'||s==='lunge'||s==='evade'?12:6);
   for(;clock>1;clock--)smoke.emit(wispFrom.copy(at),v.vel,s==='dead'?.6:.15);
   wisps.set(c,clock);
  }
  if(cave){burrows.update(hunt.crawlers.filter(c=>c.kind==='centipede'),dt);shake=Math.max(shake,burrows.shake*.5);}
  hive?.update(state,dt,hunt.flame?.points??[],hunt.wounds);
  smoke.update(dt,viewDir.value);
  if(cave)flares.update(state,dt,{root:caveView.root,actor});
  // The flamethrower: the jet from the nozzle out to where the sim says it stops, and fire on whatever is burning.
  const weapon=heldWeapon(state);
  if(hunt.flame&&weapon==='flamethrower'){
   const nozzle=localOf(actor.marker('Nozzle')),ahead=localOf(actor.marker('NozzleAhead')).sub(nozzle).normalize();
   const pts=hunt.flame.points,full=Math.floor((WEAPONS.flamethrower.range-.9)/.7)+1,reach=pts.length?Math.hypot(pts.at(-1).x-p.x,pts.at(-1).z-p.z)+.5:.4;
   jet.emit(nozzle,ahead,reach,dt,pts.length<full);shake=Math.max(shake,.025);flicker=Math.max(flicker,.02);
  }
  // Whatever the jet touches catches: it burns on for a while after, chars, and dies as a pyre.
  for(const c of [...hunt.crawlers,...(cave?[]:state.brood??[])]){
   const v=viewFor(c);if(!v?.burning)continue;
   let b=burns.get(c);
   if(!b){if(!(c.scorched>0))continue;b={heat:0,char:0,alive:true};burns.set(c,b);}
   const dead=c.state==='dead';
   if(c.scorched>0)b.heat=Math.min(1,b.heat+dt*5);else b.heat=Math.max(0,b.heat-dt*(dead?.17:.4));
   if(dead&&b.alive){b.alive=false;if(b.heat>.15){b.heat=1;const at=v.position;for(let i=0;i<40;i++)jet.ember(at,.6,4.5);}}
   b.char=Math.min(1,b.char+dt*b.heat*.45);
   v.burn?.(b.heat,b.char);
   if(b.heat>.03)jet.blaze(c,{points:()=>viewFor(c)?.burning?.()??null,radius:dead?.2:.13,height:dead?1.1:.75,strength:b.heat*(dead?1.5:1.1),life:.35,smoke:dead?1.5:.8,scorch:dead?1.6:0,billow:dead?.6:.15});
  }
  for(const c of burns.keys())if(!hunt.crawlers.includes(c)&&!(state.brood??[]).includes(c))burns.delete(c);
  jet.update(dt,{pilotAt:weapon==='flamethrower'?localOf(actor.marker('Pilot')):null});
  hudUpdate(state,hunt,dt);
  shake=Math.max(0,shake-dt);
 }

 /** After the cave has set its own sight for the frame: the hunt's flicker and the crawler's dark ride on top. */
 function light(state,hunt,dt){
  const sight=caveView.sight,p=state.player,lampOn=hunt.lampShort<=0;
  flicker=Math.max(0,flicker-dt);
  // A slash shorts the lamp: it sputters (and stops burning the crawler) but never goes fully dark.
  if(!lampOn)sight.uFlicker.value=.55+Math.random()*.3;
  else if(flicker>0)sight.uFlicker.value=Math.random()<.4?.35+Math.random()*.3:1;
  // The nearest one sets the mood: the lamp flickers a little as it closes in but stays up, and its dark pool is gone
  // by the time it is a few metres off.
  let nearest=null,near=1e9;
  for(const c of hunt.crawlers){const alive=c.state!=='dead'?1:Math.max(0,1-c.t/2);if(!alive)continue;const d=Math.hypot(c.x-p.x,c.z-p.z);if(d<near){near=d;nearest=c;}}
  const alive=nearest?(nearest.state!=='dead'?1:Math.max(0,1-nearest.t/2)):0;
  const closeness=alive*Math.max(0,Math.min(1,1-(near-1.5)/7)),onYou=nearest?.state==='grab'?1:0;
  if(lampOn){
   if(Math.random()<dt*(7*closeness*closeness+5*onYou))stutter=.03+Math.random()*.06;
   stutter-=dt;
   const level=stutter>0?.72+Math.random()*.18:1-.06*closeness;
   sight.uFlicker.value=Math.max(.7,Math.min(sight.uFlicker.value,level));
  }
  if(nearest)sight.uVoid.value.set(nearest.x,nearest.z,alive*.85*Math.max(0,1-1.6*Math.max(closeness,onYou)));else sight.uVoid.value.set(0,0,0);
  // Night eyes steady the lamp.
  if(buffed(p,'sight'))sight.uFlicker.value=1-(1-sight.uFlicker.value)*.35;
  headlamp.intensity=145*sight.uFlicker.value;
  // Fire lights the rock round it: the brightest fires take over the cave's farthest glow slots.
  const glow=sight.uGlow.value,glowColor=sight.uGlowColor.value;
  jet.glows.slice(0,3).forEach((g,i)=>{const k=glow.length-1-i,f=.85+Math.random()*.3;glow[k].set(g.x,g.z,Math.min(2,g.strength*.7)*f,3.5+Math.min(3.5,g.strength*1.4));glowColor[k].setRGB(1,.3,.06);});
 }
 function hudUpdate(state,hunt,dt){
  const p=state.player,health=p.health??100;if(lastHealth!=null&&health<lastHealth)hurtFlash=Math.min(1,hurtFlash+(lastHealth-health)/14);lastHealth=health;
  hurtFlash=Math.max(0,hurtFlash-dt*1.5);
  const held=grabbedBy(hunt),w=heldWeapon(state),a=armsOf(state);
  if(parryNote&&(parryNote.t-=dt)<=0)parryNote=null;
  hud.update(true,{hurtFlash,grabbed:!!held,escape:held?.escape??0,weapon:w,loaded:w?a.loaded[w]:0,reserve:w?reserveOf(state,w):0,reloading:a.reloading>0,parried:parryNote?.text??null});
 }

 return {
  enter,leave,pose,after,light,
  /** Cave-local point under the cursor, or null to hide the marker. */
  setAim(point){aimMarker.visible=!!point&&!!caveView;aimAt=point;if(point)aimMarker.position.set(point.x,(point.ground??0)+.05,point.z);},
  get shake(){return shake*.5;},
  get active(){return !!caveView;},
  dispose(){leave();hud.dispose();burrows.dispose();bulletGeo.dispose();bulletMat.dispose();caseMesh.geometry.dispose();caseMesh.material.dispose();caseMesh.dispose();flashTex.dispose();flash.material.dispose();impactFlash.material.dispose();ichor.dispose();sparks.dispose();dust.dispose();zaps.dispose();trailGeo.dispose();trailMat.dispose();boltGeo.dispose();boltMat.dispose();smoke.dispose();flares.dispose();jet.dispose();aimMarker.geometry.dispose();aimMarker.material.dispose();},
 };
}
