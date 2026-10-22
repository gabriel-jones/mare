import { crossCavePortal } from './travel.js';
import {DEFS,createState,validatePlacement,placeBlueprint,construct,tick,serialize,deserialize,cancelBlueprint,deconstruct,collectStorage,setMiningArea} from './sim.js';
import {movePlayer,nearestBlueprint,buildingCenter,resetLocomotion,interpolatePose,RUN_SPEED} from './controller.js';
import {MINING_RADIUS} from './production.js';
import {createWorld} from './world.js';
import {createUI} from './ui.js';

const KEY='lunar-frontier.phase-a.v1';
const TOOLS=[...Object.keys(DEFS),'mine'];
const canvas=document.querySelector('#game'),boot=document.querySelector('#boot');
let state=createState(),selectedType=null,rotation=0,world,ui;
let placementReason='',constructionReason='',hover=null,targetId=null,constructing=false,speed=1,saveStatus='Not saved',dragStart=null;
let jumpVelocity=0,accumulator=0,last=performance.now(),uiClock=0,autoClock=0;
const keys=new Set();
resetLocomotion(state.player);
let previousPose={...state.player};
function resetPlayer(){resetLocomotion(state.player);previousPose={...state.player};jumpVelocity=0;accumulator=0;}
function notify(message){ui?.notify(message);}
function save(){try{localStorage.setItem(KEY,serialize(state));saveStatus='Saved locally';notify('Colony saved on this browser.');}catch(e){saveStatus='Save unavailable';notify('Could not save: browser storage is unavailable.');}}
function load(){try{const raw=localStorage.getItem(KEY);if(!raw){notify('No saved colony yet.');return;}state=deserialize(raw);resetPlayer();keys.clear();selectedType=null;world?.clearGhost();saveStatus='Loaded';notify('Saved colony restored.');}catch(e){notify('Save could not be loaded. Current colony is unchanged.');}}
function select(type){selectedType=type;if(type!=='conveyor')rotation=0;placementReason='';dragStart=null;if(!type)world?.clearGhost();canvas.focus({preventScroll:true});if(type==='mine')notify('Click the ground to set where the rover digs.');}
function cancel(){
 const b=state.buildings.find(b=>b.id===targetId);
 if(b){const r=b.built?deconstruct(state,b.id):cancelBlueprint(state,b.id);notify(r.reason);targetId=null;refreshGhost();}
 else select(null);
}
function nearby(){
 if(state.player.cave!=null)return null;
 const pointed=state.buildings.find(b=>b.id===targetId&&!b.built);
 if(pointed){const c=buildingCenter(pointed,DEFS);if(Math.hypot(c.x-state.player.x,c.z-state.player.z)<5)return pointed;}
 return nearestBlueprint(state,DEFS);
}
function nearbyStorage(){
 if(state.player.cave!=null)return null;
 let best=null,distance=3.6;
 for(const b of state.buildings){if(b.type!=='storage'||!b.built)continue;const c=buildingCenter(b,DEFS),d=Math.hypot(c.x-state.player.x,c.z-state.player.z);if(d<distance){best=b;distance=d;}}
 return best;
}
function view(){
 const nearest=state.player.cave==null?nearestBlueprint(state,DEFS,100):null,c=nearest?buildingCenter(nearest,DEFS):null;
 const guidance=nearest?`${DEFS[nearest.type].name} blueprint: ${Math.ceil(Math.hypot(c.x-state.player.x,c.z-state.player.z))}m away. Walk within 5m, then hold E.`:null;
 return {selectedType,rotation,placementReason,constructionReason,nearbyBuilding:nearby(),nearbyStorage:nearbyStorage(),guidance,constructing,night:Math.sin(state.time/240*Math.PI*2+Math.PI/3)<=0,paused:false,saveStatus:saveStatus+(speed>1?' · Time ×12':''),timeScale:speed};
}
function point(event){hover=world?.pick(event.clientX,event.clientY);canvas.dataset.hoverCell=hover?`${hover.x},${hover.z}`:'';if(!hover){world?.clearGhost();return;}targetId=hover.buildingId??null;canvas.dataset.targetId=String(targetId??'');refreshGhost();}
/** A straight belt run from the drag start, oriented along the drag. */
function beltLine(){
 if(!dragStart||!hover)return [{x:hover.x,z:hover.z,rotation}];
 const dx=hover.x-dragStart.x,dz=hover.z-dragStart.z;
 if(!dx&&!dz)return [{x:dragStart.x,z:dragStart.z,rotation}];
 const alongX=Math.abs(dx)>=Math.abs(dz),length=Math.min(40,Math.abs(alongX?dx:dz)),step=Math.sign(alongX?dx:dz),dir=alongX?(step>0?1:3):(step>0?0:2);
 return Array.from({length:length+1},(_,i)=>({x:dragStart.x+(alongX?i*step:0),z:dragStart.z+(alongX?0:i*step),rotation:dir}));
}
function refreshGhost(){
 if(state.player.cave!=null||!selectedType||!hover){world?.clearGhost();return;}
 if(selectedType==='mine'){
  const ok=Math.abs(hover.x)<=58-MINING_RADIUS&&Math.abs(hover.z)<=58-MINING_RADIUS;
  placementReason=ok?'Click to set the mining area':'Outside the mining range.';world?.setGhost('mine',hover.x,hover.z,0,ok);return;
 }
 if(selectedType==='conveyor'){
  const line=beltLine().map(c=>({...c,valid:validatePlacement(state,'conveyor',c.x,c.z,c.rotation).ok}));
  placementReason=line.every(c=>c.valid)?'Drag to lay belts':line.some(c=>c.valid)?'Blocked cells are skipped':validatePlacement(state,'conveyor',line[0].x,line[0].z,line[0].rotation).reason;
  world?.setGhost('conveyor',hover.x,hover.z,rotation,line.some(c=>c.valid),line);return;
 }
 const valid=validatePlacement(state,selectedType,hover.x,hover.z,rotation);placementReason=valid.ok?'Click to place blueprint':valid.reason;world?.setGhost(selectedType,hover.x,hover.z,rotation,valid.ok);
}
function placeBelts(){
 const line=beltLine();let placed=0,reason='';
 for(const c of line){const r=placeBlueprint(state,'conveyor',c.x,c.z,c.rotation);if(r.ok){placed++;targetId=r.id;}else reason||=r.reason;}
 if(line.length>1)rotation=line[0].rotation;
 notify(placed?`${placed} belt blueprint${placed>1?'s':''}${placed<line.length?` · ${line.length-placed} blocked`:''}`:reason);
 dragStart=null;refreshGhost();
}
function commandPlace(){
 if(!selectedType||!hover)return;
 if(selectedType==='mine'){const r=setMiningArea(state,hover.x,hover.z);notify(r.reason);if(r.ok)select(null);return;}
 const d=DEFS[selectedType],w=rotation%2?d.d:d.w,h=rotation%2?d.w:d.d;
 // A solid foundation cannot be placed underneath the player.
 if(!d.walkable&&state.player.x>hover.x*2-1&&state.player.x<(hover.x+w-1)*2+1&&state.player.z>hover.z*2-1&&state.player.z<(hover.z+h-1)*2+1){notify('Step out of the footprint before placing.');return;}
 const r=placeBlueprint(state,selectedType,hover.x,hover.z,rotation);
 if(r.ok){targetId=r.id;notify(`${DEFS[selectedType].name} blueprint`);}else notify(r.reason);
 refreshGhost();
}
let portalCooldown=0;
function updatePortals(dt){
 portalCooldown=Math.max(0,portalCooldown-dt);if(portalCooldown>0)return;
 if(crossCavePortal(state)){resetPlayer();portalCooldown=1.2;select(null);hover=null;targetId=null;}
}
function completed(b){
 notify(`${DEFS[b.type].name} complete.`);
 if(b.type==='hopper'&&!state.miningArea)setTimeout(()=>notify('Rover ready: choose Mining area in Build and click nearby ground.'),2300);
}
function fixedUpdate(dt){
 const dx=(keys.has('d')?1:0)-(keys.has('a')?1:0),dz=(keys.has('s')?1:0)-(keys.has('w')?1:0);
 previousPose={...state.player};
 movePlayer(state,dx,dz,dt,DEFS);
 updatePortals(dt);
 if((state.player.y??0)>0||jumpVelocity>0){jumpVelocity-=1.62*dt;state.player.y=Math.max(0,(state.player.y??0)+jumpVelocity*dt);if(state.player.y===0)jumpVelocity=0;}
 constructing=false;constructionReason='';
 if(state.player.cave==null&&keys.has('e')){const b=nearby();if(b){const r=construct(state,b.id,dt);constructing=r.ok!==false;if(!r.ok)constructionReason=r.reason;if(b.built)completed(b);}}
 if(constructing&&state.player.speed<=.1){
  const b=nearby();
  if(b){const center=buildingCenter(b,DEFS),target=Math.atan2(center.x-state.player.x,center.z-state.player.z),delta=Math.atan2(Math.sin(target-state.player.facing),Math.cos(target-state.player.facing));state.player.facing+=delta*(1-Math.exp(-dt/.065));}
 }
 state.player.grounded=!(state.player.y>0||jumpVelocity>0);
 state.player.animation=!state.player.grounded?'jump':state.player.speed>.1?'run':constructing?'build':'idle';
 tick(state,dt*speed);
}
async function start(){
 try{
  let restored=false;
  try{const raw=localStorage.getItem(KEY);if(raw){state=deserialize(raw);resetPlayer();restored=true;saveStatus='Restored local save';}}catch(e){saveStatus='New colony · save unreadable';}
  ui=createUI(document.querySelector('#ui'),{onSelect:select,onRotate:()=>{rotation=(rotation+1)%4;refreshGhost();},onSave:save,onLoad:load,onReset:()=>{state=createState(Math.floor(Math.random()*999999));selectedType=null;resetPlayer();targetId=null;keys.clear();world?.clearGhost();save();notify('New lunar landing created.');},onCancel:()=>select(null),onTimeToggle:()=>{speed=speed===1?12:1;notify(speed===1?'Normal day/night speed.':'Day/night simulation ×12. Movement stays normal.');}});
  world=await createWorld(canvas,state);
  canvas.addEventListener('pointermove',point);
  canvas.addEventListener('pointerleave',()=>{hover=null;dragStart=null;world.clearGhost();});
  canvas.addEventListener('pointerdown',e=>{
   canvas.focus({preventScroll:true});
   if(e.button===2){select(null);return;}
   if(e.button!==0)return;
   point(e);
   if(selectedType==='conveyor'&&hover){dragStart={x:hover.x,z:hover.z};try{canvas.setPointerCapture(e.pointerId);}catch{}refreshGhost();}
   else commandPlace();
  });
  canvas.addEventListener('pointerup',e=>{if(e.button===0&&dragStart&&selectedType==='conveyor'){point(e);if(hover)placeBelts();else dragStart=null;}});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('keydown',e=>{
   if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;
   const k=e.key.toLowerCase();if(['w','a','s','d','e',' ','r','escape'].includes(k))e.preventDefault();
   keys.add(k);if(e.repeat)return;
   if(k===' '&&!(state.player.y>0)){jumpVelocity=1.8;}
   if(k==='escape')select(null);
   if(k==='r'){rotation=(rotation+1)%4;refreshGhost();}
   if(k==='e'&&!nearby()){const crate=nearbyStorage();if(crate)notify(collectStorage(state,crate.id).reason);}
   if(k==='delete'||k==='backspace')cancel();
   if(/^[1-9]$/.test(k)&&TOOLS[Number(k)-1])select(TOOLS[Number(k)-1]);
  });
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>keys.clear());
  document.addEventListener('visibilitychange',()=>{keys.clear();last=performance.now();accumulator=0;});
  window.addEventListener('resize',()=>world.resize());
  window.addEventListener('pagehide',()=>{try{localStorage.setItem(KEY,serialize(state));}catch{}});
  boot.remove();document.body.dataset.ready='true';canvas.focus({preventScroll:true});
  ui.update(state,view());
  function frame(now){
   const dt=Math.min((now-last)/1000,.1);last=now;accumulator+=dt;
   while(accumulator>=1/30){fixedUpdate(1/30);accumulator-=1/30;}
   world.update(state,dt,interpolatePose(previousPose,state.player,accumulator/(1/30)));uiClock+=dt;autoClock+=dt;
   if(uiClock>.1){ui.update(state,view());refreshGhost();uiClock=0;}
   if(autoClock>20){try{localStorage.setItem(KEY,serialize(state));saveStatus='Autosaved locally';}catch{}autoClock=0;}
   requestAnimationFrame(frame);
  }requestAnimationFrame(frame);
 }catch(e){console.error(e);boot.style.display='grid';boot.textContent='Could not start the colony. Reload to retry. '+e.message;}
}
start();
