import { crossCavePortal } from './travel.js';
import {DEFS,createState,validatePlacement,placeBlueprint,construct,tick,serialize,deserialize,cancelBlueprint} from './sim.js';
import {movePlayer,nearestBlueprint,buildingCenter,resetLocomotion,interpolatePose,RUN_SPEED} from './controller.js';
import {createWorld} from './world.js';
import {createUI} from './ui.js';

const KEY='lunar-frontier.phase-a.v1';
const canvas=document.querySelector('#game'),boot=document.querySelector('#boot');
let state=createState(),selectedType=null,rotation=0,world,ui;
let placementReason='',constructionReason='',hover=null,targetId=null,constructing=false,speed=1,saveStatus='Not saved';
let jumpVelocity=0,accumulator=0,last=performance.now(),uiClock=0,autoClock=0;
const keys=new Set();
resetLocomotion(state.player);
let previousPose={...state.player};
function resetPlayer(){resetLocomotion(state.player);previousPose={...state.player};jumpVelocity=0;accumulator=0;}
function notify(message){ui?.notify(message);}
function save(){try{localStorage.setItem(KEY,serialize(state));saveStatus='Saved locally';notify('Colony saved on this browser.');}catch(e){saveStatus='Save unavailable';notify('Could not save: browser storage is unavailable.');}}
function load(){try{const raw=localStorage.getItem(KEY);if(!raw){notify('No saved colony yet.');return;}state=deserialize(raw);resetPlayer();keys.clear();selectedType=null;world?.clearGhost();saveStatus='Loaded';notify('Saved colony restored.');}catch(e){notify('Save could not be loaded. Current colony is unchanged.');}}
function select(type){selectedType=type;rotation=0;placementReason='';if(!type)world?.clearGhost();canvas.focus({preventScroll:true});}
function cancel(){
 const b=state.buildings.find(b=>b.id===targetId&&!b.built);
 if(b){const r=cancelBlueprint(state,b.id);if(r?.ok===false)notify(r.reason);else notify('Blueprint cancelled. Materials returned.');targetId=null;}
 else select(null);
}
function nearby(){
 if(state.player.cave!=null)return null;
 const pointed=state.buildings.find(b=>b.id===targetId&&!b.built);
 if(pointed){const c=buildingCenter(pointed,DEFS);if(Math.hypot(c.x-state.player.x,c.z-state.player.z)<5)return pointed;}
 return nearestBlueprint(state,DEFS);
}
function view(){
 const nearest=state.player.cave==null?nearestBlueprint(state,DEFS,100):null,c=nearest?buildingCenter(nearest,DEFS):null;
 const guidance=nearest?`${DEFS[nearest.type].name} blueprint: ${Math.ceil(Math.hypot(c.x-state.player.x,c.z-state.player.z))}m away. Walk within 5m, then hold E.`:null;
 return {selectedType,rotation,placementReason,constructionReason,nearbyBuilding:nearby(),guidance,constructing,night:Math.sin(state.time/240*Math.PI*2+Math.PI/3)<=0,paused:false,saveStatus:saveStatus+(speed>1?' · Time ×12':''),timeScale:speed};
}
function point(event){hover=world?.pick(event.clientX,event.clientY);if(!hover){world?.clearGhost();return;}targetId=hover.buildingId??null;refreshGhost();}
function refreshGhost(){if(state.player.cave!=null||!selectedType||!hover){world?.clearGhost();return;}const valid=validatePlacement(state,selectedType,hover.x,hover.z,rotation);placementReason=valid.ok?'Click to place blueprint':valid.reason;world?.setGhost(selectedType,hover.x,hover.z,rotation,valid.ok);}
function commandPlace(){
 if(!selectedType||!hover)return;
 // A foundation cannot be placed underneath the player.
 const d=DEFS[selectedType],w=rotation?d.d:d.w,h=rotation?d.w:d.d;
 if(state.player.x>hover.x*2-1&&state.player.x<(hover.x+w-1)*2+1&&state.player.z>hover.z*2-1&&state.player.z<(hover.z+h-1)*2+1){notify('Step out of the footprint before placing.');return;}
 const r=placeBlueprint(state,selectedType,hover.x,hover.z,rotation);
 if(r.ok){targetId=r.id;notify(`${DEFS[selectedType].name} blueprint`);}else notify(r.reason);
 refreshGhost();
}
let portalCooldown=0;
function updatePortals(dt){
 portalCooldown=Math.max(0,portalCooldown-dt);if(portalCooldown>0)return;
 if(crossCavePortal(state)){resetPlayer();portalCooldown=1.2;select(null);hover=null;targetId=null;}
}
function fixedUpdate(dt){
 const dx=(keys.has('d')?1:0)-(keys.has('a')?1:0),dz=(keys.has('s')?1:0)-(keys.has('w')?1:0);
 previousPose={...state.player};
 movePlayer(state,dx,dz,dt,DEFS);
 updatePortals(dt);
 if((state.player.y??0)>0||jumpVelocity>0){jumpVelocity-=1.62*dt;state.player.y=Math.max(0,(state.player.y??0)+jumpVelocity*dt);if(state.player.y===0)jumpVelocity=0;}
 constructing=false;constructionReason='';
 if(state.player.cave==null&&keys.has('e')){const b=nearby();if(b){const r=construct(state,b.id,dt);constructing=r.ok!==false;if(!r.ok)constructionReason=r.reason;if(b.built)notify(`${DEFS[b.type].name} complete.`);}}
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
  ui=createUI(document.querySelector('#ui'),{onSelect:select,onRotate:()=>{rotation=1-rotation;refreshGhost();},onSave:save,onLoad:load,onReset:()=>{state=createState(Math.floor(Math.random()*999999));selectedType=null;resetPlayer();targetId=null;keys.clear();world?.clearGhost();save();notify('New lunar landing created.');},onCancel:()=>select(null),onTimeToggle:()=>{speed=speed===1?12:1;notify(speed===1?'Normal day/night speed.':'Day/night simulation ×12. Movement stays normal.');}});
  world=await createWorld(canvas,state);
  canvas.addEventListener('pointermove',point);
  canvas.addEventListener('pointerleave',()=>{hover=null;world.clearGhost();});
  canvas.addEventListener('pointerdown',e=>{canvas.focus({preventScroll:true});if(e.button===0){point(e);commandPlace();}else if(e.button===2)select(null);});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('keydown',e=>{
   if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;
   const k=e.key.toLowerCase();if(['w','a','s','d','e',' ','r','escape'].includes(k))e.preventDefault();
   keys.add(k);if(e.repeat)return;
   if(k===' '&&!(state.player.y>0)){jumpVelocity=1.8;}
   if(k==='escape')select(null);
   if(k==='r'){rotation=1-rotation;refreshGhost();}
   if(k==='delete'||k==='backspace')cancel();
   const types=Object.keys(DEFS);if(/^[1-5]$/.test(k))select(types[Number(k)-1]);
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
