import { crossCavePortal } from './travel.js';
import {DEFS,createState,validatePlacement,placeBlueprint,construct,tick,serialize,deserialize,cancelBlueprint,deconstruct,setMiningArea,rotateBelt,playerObstructs,interact,removalCheck,PROCESSOR_LOCKED} from './sim.js';
import {DIRS,ITEM_INFO,footprint} from './defs.js';
import {movePlayer,nearestBlueprint,buildingCenter,resetLocomotion,interpolatePose,RUN_SPEED} from './controller.js';
import {MINING_RADIUS} from './production.js';
import {count} from './inventory.js';
import {eat,lifeAction} from './life.js';
import {createWorld} from './world.js';
import {createUI} from './ui.js';
import {objective,missionAction,salvage,installCore,processorUnlocked,noteSighting} from './mission.js';
import {createWatcher,stepWatcher} from './watcher.js';

// ?sandbox=1 plays a throwaway colony that never touches the real save.
const KEY=new URLSearchParams(location.search).has('sandbox')?'lunar-frontier.sandbox':'lunar-frontier.phase-a.v1';
// Build shortcuts are letters; number keys 1-9 and 0 pick inventory slots.
const SHORTCUTS={...Object.fromEntries(Object.entries(DEFS).filter(([,def])=>def.key).map(([type,def])=>[def.key,type])),m:'mine',z:'dismantle'};
const canvas=document.querySelector('#game'),boot=document.querySelector('#boot');
let state=createState(),selectedType=null,rotation=0,world,ui,selectedSlot=0;
let placementReason='',constructionReason='',hover=null,targetId=null,constructing=false,speed=1,saveStatus='Not saved',beltPath=null,paintPath=null,erasing=null;
let jumpVelocity=0,accumulator=0,last=performance.now(),uiClock=0,autoClock=0,salvageReason='';
const watcher=createWatcher();
const keys=new Set();
resetLocomotion(state.player);
let previousPose={...state.player};
function resetPlayer(){resetLocomotion(state.player);previousPose={...state.player};jumpVelocity=0;accumulator=0;}
function notify(message){ui?.notify(message);}
function save(){try{localStorage.setItem(KEY,serialize(state));saveStatus='Saved locally';notify('Colony saved on this browser.');}catch(e){saveStatus='Save unavailable';notify('Could not save: browser storage is unavailable.');}}
function load(){try{const raw=localStorage.getItem(KEY);if(!raw){notify('No saved colony yet.');return;}state=deserialize(raw);resetPlayer();keys.clear();selectedType=null;world?.clearGhost();saveStatus='Loaded';notify('Saved colony restored.');}catch(e){notify('Save could not be loaded. Current colony is unchanged.');}}
function select(type){selectedType=type;if(type!=='conveyor'&&type!=='airlock')rotation=0;placementReason='';beltPath=null;paintPath=null;erasing=null;if(!type)world?.clearGhost();canvas.focus({preventScroll:true});if(type==='mine')notify('Click the ground to set where the rover digs.');}
function cancel(){
 const b=state.buildings.find(b=>b.id===targetId);
 if(b){const r=b.built?deconstruct(state,b.id):cancelBlueprint(state,b.id);notify(r.reason);targetId=null;refreshGhost();}
 else select(null);
}
/** Dismantle tool: removes whatever the pointer is over, once per structure per drag. */
function eraseAt(){
 const b=state.buildings.find(b=>b.id===targetId);
 if(!b||erasing.tried.has(b.id))return;
 erasing.tried.add(b.id);
 const r=b.built?deconstruct(state,b.id):cancelBlueprint(state,b.id);
 if(r.ok){erasing.removed++;erasing.done=r.reason;}else erasing.reason=r.reason;
 targetId=null;
}
function finishErase(){
 const {removed,reason,done}=erasing;erasing=null;
 if(removed===1&&!reason)notify(done);
 else if(removed||reason)notify([removed&&`Dismantled ${removed} structure${removed>1?'s':''} · materials returned`,reason].filter(Boolean).join(' · '));
 refreshGhost();
}
function nearby(){
 if(state.player.cave!=null)return null;
 const pointed=state.buildings.find(b=>b.id===targetId&&!b.built);
 if(pointed){const c=buildingCenter(pointed,DEFS);if(Math.hypot(c.x-state.player.x,c.z-state.player.z)<5)return pointed;}
 return nearestBlueprint(state,DEFS);
}
/** The nearest finished object E would act on: a ripe grow bed, a galley, or a crate holding goods. */
function nearbyUse(){
 if(state.player.cave!=null)return null;
 let best=null,distance=2.8;
 for(const b of state.buildings){
  if(!b.built)continue;
  const action=b.type==='storage'?(b.inv.metal||b.inv.silicon?{verb:`Collect ${b.inv.metal} metal · ${b.inv.silicon} silicon`}:null):lifeAction(state,b);
  if(!action)continue;
  const c=buildingCenter(b,DEFS),d=Math.hypot(c.x-state.player.x,c.z-state.player.z);
  if(d<distance){best={building:b,...action};distance=d;}
 }
 return best;
}
function view(){
 const nearest=state.player.cave==null?nearestBlueprint(state,DEFS,100):null,c=nearest?buildingCenter(nearest,DEFS):null;
 const guidance=nearest?`${DEFS[nearest.type].name} blueprint: ${Math.ceil(Math.hypot(c.x-state.player.x,c.z-state.player.z))}m away. Walk within 5m, then hold E.`:null;
 const goal=objective(state),distance=goal.target?Math.round(Math.hypot(goal.target.x-state.player.x,goal.target.z-state.player.z)):null;
 return {objective:{...goal,distance},missionUse:missionAction(state),locked:processorUnlocked(state)?{}:{processor:PROCESSOR_LOCKED},selectedType,rotation,placementReason,constructionReason,nearbyBuilding:nearby(),use:nearbyUse(),selectedSlot,foodSlot:foodSlot(),guidance,constructing,night:Math.sin(state.time/240*Math.PI*2+Math.PI/3)<=0,paused:false,saveStatus:saveStatus+(speed>1?' · Time ×12':''),timeScale:speed};
}
function point(event){hover=world?.pick(event.clientX,event.clientY);canvas.dataset.hoverCell=hover?`${hover.x},${hover.z}`:'';if(!hover){world?.clearGhost();return;}if(beltPath)extendBeltPath(hover);if(paintPath)extendPaintPath(hover);targetId=hover.buildingId??null;canvas.dataset.targetId=String(targetId??'');if(erasing)eraseAt();refreshGhost();}
const MAX_PAINT=120;
/** Adds a staircase of edge-touching cells from the last painted cell to `cell`. Screen-horizontal drags run
 * diagonally across the grid, and squares meeting only at corners would not join into one room. */
function extendPaintPath(cell){
 const start=paintPath[paintPath.length-1],dx=cell.x-start.x,dz=cell.z-start.z;
 let {x,z}=start;
 while((x!==cell.x||z!==cell.z)&&paintPath.length<MAX_PAINT){
  // Step along whichever axis lags furthest behind the straight line.
  if(Math.abs(cell.x-x)*Math.abs(dz)>=Math.abs(cell.z-z)*Math.abs(dx)&&x!==cell.x)x+=Math.sign(dx);else z+=Math.sign(dz);
  if(!paintPath.some(c=>c.x===x&&c.z===z))paintPath.push({x,z});
 }
}
let lineCache={key:'',line:[]};
/** Cells to paint with their validity, spending materials cumulatively in drag order. */
function paintLine(){
 const path=paintPath??(hover?[{x:hover.x,z:hover.z}]:[]),cost=DEFS[selectedType].cost;
 const key=`${selectedType}|${JSON.stringify(path)}|${state.buildings.length}|${count(state.inventory,'metal')}|${count(state.inventory,'silicon')}`;
 if(lineCache.key===key)return lineCache.line;
 const budget=Object.fromEntries(Object.keys(cost).map(item=>[item,count(state.inventory,item)]));
 const line=path.map(c=>{
  const check=validatePlacement(state,selectedType,c.x,c.z,0),afford=Object.entries(cost).every(([item,n])=>budget[item]>=n);
  if(check.ok&&afford)for(const [item,n] of Object.entries(cost))budget[item]-=n;
  return {x:c.x,z:c.z,rotation:0,valid:check.ok&&afford,reason:check.ok?'Not enough materials.':check.reason};
 });
 lineCache={key,line};return line;
}
function placePaint(){
 let placed=0,reason='';
 for(const c of paintLine()){if(!c.valid){reason||=c.reason;continue;}const r=placeBlueprint(state,selectedType,c.x,c.z,0);if(r.ok){placed++;targetId=r.id;}else reason||=r.reason;}
 notify(placed?`${placed} ${DEFS[selectedType].name.toLowerCase()} square${placed>1?'s':''} · walk over and hold E to build`:reason);
 paintPath=null;refreshGhost();
}
function useNearby(){
 const use=nearbyUse();
 if(use)notify(interact(state,use.building.id).reason);
}
/** The selected slot if it holds food, otherwise the most filling food carried. */
function foodSlot(){
 if(ITEM_INFO[state.inventory[selectedSlot]?.item]?.food)return selectedSlot;
 const slot=['meal','crop'].map(item=>state.inventory.findIndex(s=>s?.item===item)).find(i=>i>=0);
 return slot??selectedSlot;
}
function eatSelected(){notify(eat(state,foodSlot()).reason);}
const MAX_BELT_PATH=80;
/** Grows the dragged belt route to `cell` one grid step at a time, continuing along the current
 * heading before turning, so the route follows the pointer around corners. Backtracking trims it. */
function extendBeltPath(cell){
 const path=beltPath;let last=path[path.length-1];
 if(last.x===cell.x&&last.z===cell.z)return;
 const prev=path[path.length-2],alongXFirst=prev?prev.z===last.z:Math.abs(cell.x-last.x)>=Math.abs(cell.z-last.z);
 let {x,z}=last;
 while((x!==cell.x||z!==cell.z)&&path.length<MAX_BELT_PATH){
  if(alongXFirst?x!==cell.x:z===cell.z)x+=Math.sign(cell.x-x);else z+=Math.sign(cell.z-z);
  const seen=path.findIndex(c=>c.x===x&&c.z===z);
  if(seen>=0)path.length=seen+1;else path.push({x,z});
 }
}
/** The route as belt cells: each faces the next cell; the last keeps the final heading. Existing
 * belts on the route are redirected rather than rebuilt; new ones are limited by available metal. */
function beltLine(){
 const path=beltPath??(hover?[{x:hover.x,z:hover.z}]:[]);
 const dirTo=(a,b)=>DIRS.findIndex(([dx,dz])=>dx===b.x-a.x&&dz===b.z-a.z);
 let metal=count(state.inventory,'metal');
 return path.map((c,i)=>{
  const dir=path[i+1]?dirTo(c,path[i+1]):path[i-1]?dirTo(path[i-1],c):rotation;
  const existing=state.buildings.find(b=>b.type==='conveyor'&&b.x===c.x&&b.z===c.z);
  if(existing)return {x:c.x,z:c.z,rotation:dir,existing:existing.id,valid:true};
  const check=validatePlacement(state,'conveyor',c.x,c.z,dir),valid=check.ok&&metal>=DEFS.conveyor.cost.metal;
  if(valid)metal-=DEFS.conveyor.cost.metal;
  return {x:c.x,z:c.z,rotation:dir,valid,reason:check.ok?'Not enough metal.':check.reason};
 });
}
function refreshGhost(){
 if(state.player.cave!=null||!selectedType||!hover){world?.clearGhost();return;}
 if(selectedType==='dismantle'){
  const b=state.buildings.find(b=>b.id===targetId);
  if(!b){placementReason='Click or drag over structures to dismantle them';world?.clearGhost();return;}
  const refused=removalCheck(state,b.id);
  placementReason=refused??`Click to dismantle ${DEFS[b.type].name.toLowerCase()}`;
  world?.setGhost('dismantle',b.x,b.z,0,false,refused?[]:[{x:b.x,z:b.z,valid:false,cells:footprint(b.type,b.x,b.z,b.rotation)}]);return;
 }
 if(selectedType==='mine'){
  const ok=Math.abs(hover.x)<=58-MINING_RADIUS&&Math.abs(hover.z)<=58-MINING_RADIUS;
  placementReason=ok?'Click to set the mining area':'Outside the mining range.';world?.setGhost('mine',hover.x,hover.z,0,ok);return;
 }
 if(selectedType==='conveyor'){
  const line=beltLine(),blocked=line.find(c=>!c.valid);
  placementReason=!blocked?(beltPath?`${line.length} belt${line.length>1?'s':''} · release to place`:line[0]?.existing!=null?'Click to turn this belt, or drag a route':'Drag a route; it can turn corners'):line.some(c=>c.valid)?'Blocked cells are skipped':blocked.reason;
  world?.setGhost('conveyor',hover.x,hover.z,rotation,line.some(c=>c.valid),line);return;
 }
 if(DEFS[selectedType].paint){
  const line=paintLine(),valid=line.filter(c=>c.valid).length,blocked=line.find(c=>!c.valid);
  placementReason=paintPath?`${valid} square${valid===1?'':'s'}${blocked?` · ${line.length-valid} blocked`:''} · release to place`:blocked?blocked.reason:'Click or drag to paint squares';
  world?.setGhost(selectedType,hover.x,hover.z,0,valid>0,line);return;
 }
 const valid=validatePlacement(state,selectedType,hover.x,hover.z,rotation),underfoot=valid.ok&&!DEFS[selectedType].walkable&&playerObstructs(state,{type:selectedType,x:hover.x,z:hover.z,rotation,built:false});
 placementReason=underfoot?'Step out of the footprint before placing.':valid.ok?'Click to place blueprint':valid.reason;world?.setGhost(selectedType,hover.x,hover.z,rotation,valid.ok&&!underfoot);
}
function placeBelts(){
 const line=beltLine();let placed=0,turned=0,reason='';
 for(const c of line){
  if(c.existing!=null){const b=state.buildings.find(b=>b.id===c.existing);if(b.rotation!==c.rotation){rotateBelt(state,b.id,c.rotation);turned++;}continue;}
  const r=placeBlueprint(state,'conveyor',c.x,c.z,c.rotation);if(r.ok){placed++;targetId=r.id;}else reason||=r.reason;
 }
 if(line.length)rotation=line[line.length-1].rotation;
 const skipped=line.length-placed-line.filter(c=>c.existing!=null).length;
 notify(placed||turned?[placed&&`${placed} belt blueprint${placed>1?'s':''}`,turned&&`${turned} redirected`,skipped&&`${skipped} blocked`].filter(Boolean).join(' · '):reason||'Belts already face this way.');
 beltPath=null;refreshGhost();
}
function commandPlace(){
 if(!selectedType||!hover)return;
 if(selectedType==='mine'){const r=setMiningArea(state,hover.x,hover.z);notify(r.reason);if(r.ok)select(null);return;}
 // A solid foundation cannot be placed underneath the player.
 if(!DEFS[selectedType].walkable&&playerObstructs(state,{type:selectedType,x:hover.x,z:hover.z,rotation,built:false})){notify('Step out of the footprint before placing.');return;}
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
 const action=keys.has('e')?missionAction(state):null;
 if(action?.hold){
  // Holding E at the lander works the core loose; the astronaut kneels into the build pose.
  const r=salvage(state,dt);constructing=r.ok;
  if(r.done)notify(r.reason);
  else if(!r.ok&&r.reason!==salvageReason)notify(r.reason);
  salvageReason=r.ok?'':r.reason;
 }
 else if(state.player.cave==null&&keys.has('e')){const b=nearby();if(b){const r=construct(state,b.id,dt);constructing=r.ok!==false;if(!r.ok)constructionReason=r.reason;if(b.built)completed(b);}}
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
  ui=createUI(document.querySelector('#ui'),{onSelect:select,onSlot:i=>{if(selectedSlot===i)eatSelected();selectedSlot=i;ui.update(state,view());},onRotate:()=>{rotation=(rotation+1)%4;refreshGhost();},onSave:save,onLoad:load,onReset:()=>{state=createState(Math.floor(Math.random()*999999));selectedType=null;resetPlayer();targetId=null;keys.clear();world?.clearGhost();save();notify('New lunar landing created.');},onCancel:()=>select(null),onTimeToggle:()=>{speed=speed===1?12:1;notify(speed===1?'Normal day/night speed.':'Day/night simulation ×12. Movement stays normal.');}});
  world=await createWorld(canvas,state);
  canvas.addEventListener('pointermove',point);
  canvas.addEventListener('pointerleave',()=>{if(beltPath||paintPath||erasing)return;hover=null;world.clearGhost();});
  canvas.addEventListener('pointerdown',e=>{
   canvas.focus({preventScroll:true});
   if(e.button===2){select(null);return;}
   if(e.button!==0)return;
   point(e);
   if(selectedType==='conveyor'&&hover){beltPath=[{x:hover.x,z:hover.z}];try{canvas.setPointerCapture(e.pointerId);}catch{}refreshGhost();}
   else if(DEFS[selectedType]?.paint&&hover){paintPath=[{x:hover.x,z:hover.z}];try{canvas.setPointerCapture(e.pointerId);}catch{}refreshGhost();}
   else if(selectedType==='dismantle'&&hover){erasing={tried:new Set(),removed:0,reason:''};try{canvas.setPointerCapture(e.pointerId);}catch{}eraseAt();refreshGhost();}
   else commandPlace();
  });
  canvas.addEventListener('pointerup',e=>{
   if(e.button!==0)return;
   if(beltPath&&selectedType==='conveyor'){point(e);placeBelts();}
   else if(paintPath&&DEFS[selectedType]?.paint){point(e);placePaint();}
   else if(erasing)finishErase();
  });
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('keydown',e=>{
   if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;
   const k=e.key.toLowerCase();if(['w','a','s','d','e','f',' ','r','b','escape'].includes(k)||SHORTCUTS[k]||/^[0-9]$/.test(k))e.preventDefault();
   keys.add(k);if(e.repeat)return;
   if(k===' '&&!(state.player.y>0)){jumpVelocity=1.8;}
   if(k==='escape')select(null);
   if(k==='b')ui.toggleMenu();
   if(k==='r'){rotation=(rotation+1)%4;refreshGhost();}
   const mission=k==='e'?missionAction(state):null;
   if(mission&&!mission.hold)notify(installCore(state).reason);
   else if(k==='e'&&!mission&&!nearby())useNearby();
   if(k==='f')eatSelected();
   if(k==='delete'||k==='backspace')cancel();
   if(/^[0-9]$/.test(k)){selectedSlot=(Number(k)+9)%10;ui.update(state,view());}
   if(SHORTCUTS[k])select(selectedType===SHORTCUTS[k]?null:SHORTCUTS[k]);
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
   if(stepWatcher(watcher,state,dt)==='vanished'){const remark=noteSighting(state);if(remark)setTimeout(()=>ui.say(remark),1500);}
   world.update(state,dt,interpolatePose(previousPose,state.player,accumulator/(1/30)),watcher);uiClock+=dt;autoClock+=dt;
   if(uiClock>.1){ui.update(state,view());refreshGhost();uiClock=0;}
   if(autoClock>20){try{localStorage.setItem(KEY,serialize(state));saveStatus='Autosaved locally';}catch{}autoClock=0;}
   requestAnimationFrame(frame);
  }requestAnimationFrame(frame);
 }catch(e){console.error(e);boot.style.display='grid';boot.textContent='Could not start the colony. Reload to retry. '+e.message;}
}
start();
