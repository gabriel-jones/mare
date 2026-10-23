import * as THREE from 'three';
import {createCrawlerView} from './crawler-view.js';
import {CRAWLER,DODGE,walkable} from './crawler.js';
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

const LABEL={pistol:'PISTOL',rifle:'RIFLE'};
function createHud(){
 const root=document.createElement('div');root.className='hunt-hud';root.hidden=true;
 root.innerHTML=`<div class="hunt-hurt"></div><div class="hunt-prompt"><span>GRABBED — MASH E</span><i><b></b></i></div><div class="hunt-ammo"></div>`;
 const style=document.createElement('style');style.textContent=`
.hunt-hud{position:fixed;inset:0;pointer-events:none;z-index:4;font:600 12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;color:#e8dccb}
.hunt-hurt{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(120,8,4,.75) 100%)}
.hunt-prompt{position:absolute;left:50%;top:30%;transform:translateX(-50%);display:none;text-align:center;font-size:15px;color:#ffd9c2;text-shadow:0 0 8px #000}
.hunt-prompt i{display:block;width:180px;height:5px;margin:8px auto 0;background:rgba(255,255,255,.12);border-radius:3px;overflow:hidden}
.hunt-prompt b{display:block;height:100%;width:0;background:#ffb26b}
.hunt-ammo{position:absolute;right:18px;bottom:112px;padding:6px 10px;border-radius:6px;background:rgba(6,8,12,.62);text-shadow:0 0 6px #000}`;
 root.append(style);document.body.append(root);
 const hurt=root.querySelector('.hunt-hurt'),prompt=root.querySelector('.hunt-prompt'),meter=root.querySelector('.hunt-prompt b'),ammo=root.querySelector('.hunt-ammo');
 let lastAmmo='';
 return {
  update(on,{hurtFlash,grabbed,escape,weapon,loaded,reserve,reloading}){
   root.hidden=!on;if(!on)return;
   hurt.style.opacity=String(Math.min(.85,hurtFlash));
   prompt.style.display=grabbed?'block':'none';if(grabbed)meter.style.width=`${Math.min(1,escape)*100}%`;
   const text=!weapon?'NO WEAPON':WEAPONS[weapon].ammo==='fuel'?`FUEL ${Math.ceil(loaded)}% · ${reserve} CELL${reserve===1?'':'S'}${reloading?' · REFUELLING':''}`:`${LABEL[weapon]} ${loaded}/${reserve}${reloading?' · RELOADING':''}`;
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
 const smoke=createSmoke(fx),flares=createFlareView(fx),thrown=new WeakSet();
 const aimMarker=new THREE.Mesh(new THREE.RingGeometry(.18,.24,24).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:'#ffcf9a',transparent:true,opacity:.6,depthWrite:false}));aimMarker.position.y=.05;aimMarker.visible=false;fx.add(aimMarker);

 const localOf=(o,v=new THREE.Vector3())=>caveView.root.worldToLocal(o.getWorldPosition(v));
 let bodyYaw=null,turning=false,act=null,strain=0,wasAirborne=false,flicker=0,stutter=0,shake=0,hurtFlash=0,lastHealth=null,pending=[];
 const wisps=new Map(),wispFrom=new THREE.Vector3(),burns=new Map();

 function play(clip,rate=1){if(act?.clip===clip)actor.restart();act={clip,t:0,len:actor.duration(clip)/rate,rate};}
 function clearViews(){views.forEach(v=>v.view.dispose());views.clear();wisps.clear();burns.clear();}
 function clearEffects(){bullets.forEach(b=>{b.live=false;b.mesh.visible=false;});hideCases();ichor.clear();sparks.clear();dust.clear();smoke.clear();flares.clear();flash.material.opacity=0;impactFlash.material.opacity=0;muzzleLight.intensity=0;jet.clear();pending=[];}

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

 function syncViews(hunt){
  for(const c of hunt.crawlers)if(!views.has(c))views.set(c,{view:createCrawlerView(crawlerGLTF,caveView.root,{mode:'sight',sight:caveView.sight,toCave,viewDir}),last:new THREE.Vector3(),vel:new THREE.Vector3(),fresh:true});
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
   else if(e.type==='shot'||e.type==='impact')pending.push(e);
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
  return {...renderPose,animation:anim,speed:moving,weapon:heldWeapon(state),backward,rate,twist};
 }

 function fireShot(e){
  const g=GUNS[e.weapon]??GUNS.pistol;
  actor.fire();actor.root.updateMatrixWorld(true);
  const muzzle=localOf(actor.marker(g.muzzle)),ahead=localOf(actor.marker(g.ahead)).sub(muzzle).normalize();
  flash.position.copy(muzzle).addScaledVector(ahead,.12*g.flash);flash.scale.setScalar((.8+Math.random()*.5)*g.flash);flash.material.rotation=Math.random()*6.28;flash.material.opacity=1;
  muzzleLight.position.copy(flash.position);muzzleLight.intensity=g.light;
  for(let i=0;i<g.sparks;i++)sparks.spawn(flash.position.x,flash.position.y,flash.position.z,ahead.x*4+(Math.random()-.5)*2,ahead.y*4+Math.random(),ahead.z*4+(Math.random()-.5)*2,.08+Math.random()*.08);
  flicker=Math.max(flicker,.05);shake=Math.max(shake,g.shake);
  const b=bullets.find(b=>!b.live)??bullets[0],target=viewFor(e.target),targetY=target?target.position.y:.95;
  b.from.copy(muzzle);b.dir.set(e.x,targetY,e.z).sub(b.from);b.length=b.dir.length();b.dir.normalize();
  b.travelled=0;b.live=true;b.mesh.visible=true;b.thick=g.tracer;
  // Brass out of the port.
  const port=localOf(actor.marker(g.port)),out=localOf(actor.marker(g.out)).sub(port).normalize(),k=nextCase,c=cases[k];nextCase=(nextCase+1)%CASES;caseSize[k]=g.brass;
  c.p.copy(port);c.v.copy(out).multiplyScalar(2.2+Math.random()*1.2);c.v.x+=(Math.random()-.5)*.6;c.v.y+=2.2+Math.random()*1.2;c.v.z+=(Math.random()-.5)*.6;
  c.q.setFromEuler(euler.set(Math.random()*6,Math.random()*6,0));c.lie.setFromEuler(euler.set(Math.PI/2,0,Math.random()*6.28,'YXZ'));euler.order='XYZ';
  c.spin.set((Math.random()-.5)*50,(Math.random()-.5)*20,(Math.random()-.5)*50);c.age=0;c.bounces=0;
 }
 function impact(e){
  const dir=new THREE.Vector3(e.dir.x,0,e.dir.z),v=viewFor(e.crawler);
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
  // Rock: sparks off the wall and a puff of dust.
  const y=.95;
  for(let i=0;i<12;i++)sparks.spawn(e.x,y,e.z,-dir.x*(2+Math.random()*3)+(Math.random()-.5)*3,Math.random()*3,-dir.z*(2+Math.random()*3)+(Math.random()-.5)*3,.15+Math.random()*.25);
  for(let i=0;i<5;i++)dust.spawn(e.x,y,e.z,-dir.x*.6+(Math.random()-.5)*.5,.1+Math.random()*.3,-dir.z*.6+(Math.random()-.5)*.5,.8+Math.random()*.6);
  impactFlash.position.set(e.x,y,e.z);impactFlash.material.opacity=.6;
 }

 /** After the actor has been posed: gunfire from the real muzzle, everything in flight, the crawlers and their smoke. */
 function after(state,hunt,dt){
  for(const e of pending)(e.type==='shot'?fireShot:impact)(e);pending=[];
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
  sparks.update(dt,9,1);dust.update(dt,0,2);ichor.update(dt,9,.5);
  flash.material.opacity=Math.max(0,flash.material.opacity-dt*16);impactFlash.material.opacity=Math.max(0,impactFlash.material.opacity-dt*10);muzzleLight.intensity=Math.max(0,muzzleLight.intensity-dt*800);
  const p=state.player;
  for(const [c,v] of views){
   v.view.update(c,dt,{player:p});
   const at=v.view.position;
   if(v.fresh){v.last.copy(at);v.fresh=false;}
   if(dt>0){v.vel.copy(at).sub(v.last).divideScalar(dt);if(v.vel.lengthSq()>400)v.vel.set(0,0,0);}v.last.copy(at);
   // A thin wisp rises off it; dying, it pours out enough to hide the seizure, thinning as the body melts away.
   const s=c.state,shroud=s==='dead'?(c.t<.25?100:c.t<4.6?40:40*Math.max(0,1-(c.t-4.6)/1.2)):0;
   let clock=(wisps.get(c)??Math.random())+dt*(s==='dead'?shroud:s==='flee'||s==='lunge'||s==='evade'?12:6);
   for(;clock>1;clock--)smoke.emit(wispFrom.copy(at),v.vel,s==='dead'?.6:.15);
   wisps.set(c,clock);
  }
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
  hud.update(true,{hurtFlash,grabbed:!!held,escape:held?.escape??0,weapon:w,loaded:w?a.loaded[w]:0,reserve:w?reserveOf(state,w):0,reloading:a.reloading>0});
 }

 return {
  enter,leave,pose,after,light,
  /** Cave-local point under the cursor, or null to hide the marker. */
  setAim(point){aimMarker.visible=!!point&&!!caveView;if(point)aimMarker.position.set(point.x,.05,point.z);},
  get shake(){return shake*.5;},
  get active(){return !!caveView;},
  dispose(){leave();hud.dispose();bulletGeo.dispose();bulletMat.dispose();caseMesh.geometry.dispose();caseMesh.material.dispose();caseMesh.dispose();flashTex.dispose();flash.material.dispose();impactFlash.material.dispose();ichor.dispose();sparks.dispose();dust.dispose();smoke.dispose();flares.dispose();jet.dispose();aimMarker.geometry.dispose();aimMarker.material.dispose();},
 };
}
