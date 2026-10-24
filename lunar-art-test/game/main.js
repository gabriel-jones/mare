import { crossCavePortal } from './travel.js';
import { ZONE_NAMES } from './caves.js';
import { lootAction, takeLoot } from './delve.js';
import { stepPeril, dropAction, recoverDrop, craftFlares, throwFlare, flareNow, FLARE, HURT_TEXT, BLACKOUT } from './peril.js';
import { sampleAction, takeSample, stepBrood, vatAction } from './goo.js';
import {DEFS,createState,validatePlacement,placeBlueprint,construct,tick,serialize,deserialize,cancelBlueprint,deconstruct,collectStorage,setMiningArea,miningAreaReason,removeMiningArea,assignRover,rotateBelt,playerObstructs,interact,removalCheck,PROCESSOR_LOCKED} from './sim.js';
import {DIRS,ITEM_INFO,footprint} from './defs.js';
import {movePlayer,nearestBlueprint,buildingCenter,resetLocomotion,interpolatePose,RUN_SPEED} from './controller.js';
import {eat,lifeAction,setCrop,setRecipe} from './life.js';
import {isGrower} from './farm.js';
import {createWorld} from './world.js';
import {createUI} from './ui.js';
import {objective,missionAction,salvage,installCore,processorUnlocked} from './mission.js';
import {createEncounter,stepEncounter,ENCOUNTER_SAY} from './encounter.js';
import {shipAction,holdLaunch,releaseLaunch,loadSatellite,recallShip,selectResearch,machineAction,lockedReason} from './space.js';
import {createOrbitView} from './orbit-view.js';
import {createResearchView} from './research-view.js';
import {createHunt,stepHunt,fire,release,roll,wrench,pinned,grabbedBy,rouse} from './hunt.js';
import {isWeapon,holdWeapon,reload,craft,heldWeapon,armsOf,WEAPONS} from './arms.js';
import {installCursors,createReticle} from './cursors.js';
import {crateDistance,moveStack,storeAll,storeSlot,takeSlot,crates as storageCrates,crateCentre,BASE_REACH} from './storage.js';
import {worldVectorToCave} from './cave-space.js';
import {count} from './inventory.js';

// ?sandbox=1 plays a throwaway colony that never touches the real save.
const KEY=new URLSearchParams(location.search).has('sandbox')?'lunar-frontier.sandbox':'lunar-frontier.phase-a.v1';
// Build shortcuts are letters; number keys 1-9 and 0 pick inventory slots.
const SHORTCUTS={...Object.fromEntries(Object.entries(DEFS).filter(([,def])=>def.key).map(([type,def])=>[def.key,type])),m:'mine',z:'dismantle'};
const canvas=document.querySelector('#game'),boot=document.querySelector('#boot');
let state=createState(),selectedType=null,rotation=0,world,ui,selectedSlot=0;
let placeOk=true,placeFar=null,pointerIn=false,placementReason='',constructionReason='',hover=null,targetId=null,constructing=false,speed=1,saveStatus='Not saved',beltPath=null,paintPath=null,erasing=null;
let orbit=null,research=null,shipStatus='pad';
let jumpVelocity=0,accumulator=0,last=performance.now(),uiClock=0,autoClock=0,salvageReason='';
const encounter=createEncounter();
const keys=new Set();
// Underground the astronaut aims at the cursor; the hunt itself is never saved.
const hunt=createHunt();let aimClient=null,breaches=0;
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
 const pack=dropAction(state);if(pack)return pack;
 if(state.player.cave!=null){const find=lootAction(state);if(find)return {...find,cave:true};const sample=sampleAction(state);return sample&&{...sample,sample:true};}
 let best=null,distance=2.8;
 for(const b of state.buildings){
  if(!b.built)continue;
  const action=b.type==='storage'?{verb:ui?.crateId===b.id?'Close crate':'Open crate'}:machineAction(state,b)??lifeAction(state,b)??vatAction(state,b);
  if(!action)continue;
  const c=buildingCenter(b,DEFS),d=Math.hypot(c.x-state.player.x,c.z-state.player.z);
  if(d<distance){best={building:b,...action};distance=d;}
 }
 return best;
}
/** The grower, galley or armory the player stands at, whose picker the HUD shows. */
function nearbyStation(){
 if(state.player.cave!=null)return null;
 let best=null,distance=3;
 for(const b of state.buildings){
  if(!b.built||!(isGrower(b)||b.type==='galley'||b.type==='armory'))continue;
  const c=buildingCenter(b,DEFS),d=Math.hypot(c.x-state.player.x,c.z-state.player.z);
  if(d<distance){best=b;distance=d;}
 }
 return best;
}
function view(){
 const nearest=state.player.cave==null?nearestBlueprint(state,DEFS,100):null,c=nearest?buildingCenter(nearest,DEFS):null;
 const guidance=nearest?`${DEFS[nearest.type].name} blueprint: ${Math.ceil(Math.hypot(c.x-state.player.x,c.z-state.player.z))}m away. Walk within 5m, then hold E.`:null;
 const goal=objective(state),distance=goal.target&&state.player.cave==null?Math.round(Math.hypot(goal.target.x-state.player.x,goal.target.z-state.player.z)):null;
 return {objective:{...goal,distance},missionUse:missionAction(state)??shipAction(state),locked:{...(processorUnlocked(state)?{}:{processor:PROCESSOR_LOCKED}),...Object.fromEntries(Object.keys(DEFS).map(type=>[type,lockedReason(state,type)]).filter(([,reason])=>reason))},selectedType,rotation,placementReason,constructionReason,nearbyBuilding:nearby(),use:nearbyUse(),station:nearbyStation(),selectedSlot,foodSlot:foodSlot(),guidance,constructing,night:Math.sin(state.time/240*Math.PI*2+Math.PI/3)<=0,paused:false,saveStatus:saveStatus+(speed>1?' · Time ×12':''),timeScale:speed};
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
/** Cells to paint with their validity. Blueprints are free; materials go in as each square is built. */
function paintLine(){
 const path=paintPath??(hover?[{x:hover.x,z:hover.z}]:[]);
 const key=`${selectedType}|${JSON.stringify(path)}|${state.buildings.length}`;
 if(lineCache.key===key)return lineCache.line;
 const line=path.map(c=>{
  const check=validatePlacement(state,selectedType,c.x,c.z,0);
  return {x:c.x,z:c.z,rotation:0,valid:check.ok,reason:check.reason};
 });
 lineCache={key,line};return line;
}
function placePaint(){
 let placed=0,reason='';
 for(const c of paintLine()){if(!c.valid){reason||=c.reason;continue;}const r=placeBlueprint(state,selectedType,c.x,c.z,0);if(r.ok){placed++;targetId=r.id;}else reason||=r.reason;}
 notify(placed?`${placed} ${DEFS[selectedType].name.toLowerCase()} square${placed>1?'s':''} · walk over and hold E to build`:reason);
 paintPath=null;refreshGhost();
}
/** Which pointer the game canvas shows: a tool's own, red when the cell under it won't take the action, or none
 * when a weapon is up and the reticle takes over. */
function cursorMode(){
 if(drawn()&&heldWeapon(state))return 'none';
 if(state.player.cave!=null)return 'explore';
 if(!selectedType)return constructing||(hover&&state.buildings.some(b=>!b.built&&footprint(b.type,b.x,b.z,b.rotation).some(c=>c.x===hover.x&&c.z===hover.z)))?'construct':'explore';
 const tool=selectedType==='dismantle'?'dismantle':selectedType==='mine'?'mine':'build';
 return hover&&!placeOk?'blocked':hover&&placeFar&&tool==='build'?'far':tool;
}
/** Crate logistics areas show while placing buildings, building them, or being told they're out of reach. */
const showLogistics=()=>!!(selectedType&&selectedType!=='mine')||constructing||/crate range/.test(constructionReason);
function reticleState(){
 const w=heldWeapon(state),a=armsOf(state),spec=WEAPONS[w],p=state.player,at=aimClient&&world.aim(aimClient.x,aimClient.y);
 return {weapon:w,magazine:spec.magazine,loaded:a.loaded[w],reload:a.reloading>0?1-a.reloading/spec.reload:null,far:!!at&&Math.hypot(at.x-p.x,at.z-p.z)>spec.range,spraying:spec.stream&&hunt.trigger&&a.loaded[w]>0&&!a.reloading};
}
function useNearby(){
 const use=nearbyUse();
 if(use?.drop)notify(recoverDrop(state).reason);
 else if(use?.sample){const r=takeSample(state);notify(r.reason);if(r.wake)rouse(hunt,state,r.wake);}
 else if(use?.cave){const r=takeLoot(state);notify(r.reason);if(r.say)ui.say(r.say);}
 else if(use?.building.type==='storage'){if(ui.crateId===use.building.id)ui.closeStore();else ui.openCrate(use.building.id);}
 else if(use)notify(interact(state,use.building.id).reason);
}
/** The selected slot if it holds food, otherwise the most filling food carried. */
function foodSlot(){
 if(ITEM_INFO[state.inventory[selectedSlot]?.item]?.food)return selectedSlot;
 let slot=selectedSlot,best=0;
 state.inventory.forEach((s,i)=>{const food=ITEM_INFO[s?.item]?.food??0;if(food>best){best=food;slot=i;}});
 return slot;
}
/** A transfer in the open crate panel; failures always explain themselves, bulk moves also report success. */
function crateMove(id,move,report=false){
 const b=state.buildings.find(o=>o.id===id&&o.built&&o.slots);if(!b)return;
 const r=move(b);if(!r.ok||report)notify(r.reason);ui.update(state,view());canvas.focus({preventScroll:true});
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
 * belts on the route are redirected rather than rebuilt. */
function beltLine(){
 const path=beltPath??(hover?[{x:hover.x,z:hover.z}]:[]);
 const dirTo=(a,b)=>DIRS.findIndex(([dx,dz])=>dx===b.x-a.x&&dz===b.z-a.z);
 return path.map((c,i)=>{
  const dir=path[i+1]?dirTo(c,path[i+1]):path[i-1]?dirTo(path[i-1],c):rotation;
  const existing=state.buildings.find(b=>b.type==='conveyor'&&b.x===c.x&&b.z===c.z);
  if(existing)return {x:c.x,z:c.z,rotation:dir,existing:existing.id,valid:true};
  const check=validatePlacement(state,'conveyor',c.x,c.z,dir);
  return {x:c.x,z:c.z,rotation:dir,valid:check.ok,reason:check.reason};
 });
}
function refreshGhost(){
 if(state.player.cave!=null||!selectedType||!hover){world?.clearGhost();return;}
 if(selectedType==='dismantle'){
  const b=state.buildings.find(b=>b.id===targetId);
  placeOk=!b||!removalCheck(state,b.id);
  if(!b){placementReason='Click or drag over structures to dismantle them';world?.clearGhost();return;}
  const refused=removalCheck(state,b.id);
  placementReason=refused??`Click to dismantle ${DEFS[b.type].name.toLowerCase()}`;
  world?.setGhost('dismantle',b.x,b.z,0,false,refused?[]:[{x:b.x,z:b.z,valid:false,cells:footprint(b.type,b.x,b.z,b.rotation)}]);return;
 }
 if(selectedType==='mine'){
  const reason=miningAreaReason(state,hover.x,hover.z);
  placeOk=!reason;placementReason=reason??'Click to mark a mining zone';world?.setGhost('mine',hover.x,hover.z,0,!reason);return;
 }
 if(selectedType==='conveyor'){
  const line=beltLine(),blocked=line.find(c=>!c.valid);placeOk=line.some(c=>c.valid);
  placementReason=!blocked?(beltPath?`${line.length} belt${line.length>1?'s':''} · release to place`:line[0]?.existing!=null?'Click to turn this belt, or drag a route':'Drag a route; it can turn corners'):line.some(c=>c.valid)?'Blocked cells are skipped':blocked.reason;
  world?.setGhost('conveyor',hover.x,hover.z,rotation,line.some(c=>c.valid),line);return;
 }
 if(DEFS[selectedType].paint){
  const line=paintLine(),valid=line.filter(c=>c.valid).length,blocked=line.find(c=>!c.valid);placeOk=valid>0;
  placementReason=paintPath?`${valid} square${valid===1?'':'s'}${blocked?` · ${line.length-valid} blocked`:''} · release to place`:blocked?blocked.reason:'Click or drag to paint squares';
  world?.setGhost(selectedType,hover.x,hover.z,0,valid>0,line);return;
 }
 const valid=validatePlacement(state,selectedType,hover.x,hover.z,rotation),underfoot=valid.ok&&!DEFS[selectedType].walkable&&playerObstructs(state,{type:selectedType,x:hover.x,z:hover.z,rotation,built:false});
 placeOk=valid.ok&&!underfoot;placeFar=placeOk?outOfCrateRange(selectedType,hover.x,hover.z,rotation):null;
 placementReason=underfoot?'Step out of the footprint before placing.':placeFar?`Out of crate range · carry `:valid.ok?'Click to place blueprint':valid.reason;world?.setGhost(selectedType,hover.x,hover.z,rotation,valid.ok&&!underfoot);
}
/** What a blueprint here would still need from your pockets, when it stands outside every crate's logistics
 * area and crate stock can't reach it; null when it is in range, there are no crates, or you carry enough. */
function outOfCrateRange(type,x,z,rotation){
 const list=storageCrates(state);if(!list.length)return null;
 const c=buildingCenter({type,x,z,rotation},DEFS);
 if(list.some(b=>{const p=crateCentre(b);return Math.hypot(p.x-c.x,p.z-c.z)<=BASE_REACH;}))return null;
 const short=Object.entries(DEFS[type].cost??{}).filter(([item,n])=>count(state.inventory,item)<n).map(([item,n])=>`${n-count(state.inventory,item)} ${ITEM_INFO[item]?.name.toLowerCase()??item}`);
 return short.length?short:null;
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
let hazardNow=null;
function updatePeril(dt){
 const r=stepPeril(state,dt);
 if(r?.blackout){resetPlayer();portalCooldown=1.2;select(null);hover=null;targetId=null;hazardNow=null;document.body.dataset.hurt='false';notify(r.items?`You blacked out ${r.where}. Your pack is still there.`:'You blacked out.');ui.say(BLACKOUT);return;}
 const hazard=r?.hazard??null;
 if(hazard&&hazard!==hazardNow)notify(HURT_TEXT[hazard]);
 if(hazard!==hazardNow)document.body.dataset.hurt=String(!!hazard);
 hazardNow=hazard;
}
let portalCooldown=0;
function updatePortals(dt){
 portalCooldown=Math.max(0,portalCooldown-dt);if(portalCooldown>0)return;
 const crossed=crossCavePortal(state);
 if(crossed){resetPlayer();portalCooldown=1.2;select(null);hover=null;targetId=null;if(crossed==='down'||crossed==='up')notify(ZONE_NAMES[state.player.zone??0]);}
}
function completed(b){
 notify(`${DEFS[b.type].name} complete.`);
 if(b.type==='hopper'&&!state.miningAreas.length)setTimeout(()=>notify('Rover ready: press M and click nearby ground to mark a mining zone.'),2300);
}
/** On the surface a weapon is out while its slot is selected and no build tool is; underground it always is. */
const drawn=()=>state.player.cave!=null||(!selectedType&&isWeapon(state.inventory[selectedSlot]?.item));
/** Picking a slot that holds a weapon takes it up. */
function pickSlot(i){selectedSlot=i;const item=state.inventory[i]?.item;if(isWeapon(item))holdWeapon(state,item);else release(hunt);ui.update(state,view());}
function fixedUpdate(dt){
 const dx=(keys.has('d')?1:0)-(keys.has('a')?1:0),dz=(keys.has('s')?1:0)-(keys.has('w')?1:0);
 previousPose={...state.player};
 const p=state.player,caving=p.cave!=null;
 if(caving&&(hunt.rolling||pinned(hunt))){p.vx=0;p.vz=0;p.speed=0;}
 else movePlayer(state,dx,dz,dt,DEFS);
 hunt.drawn=drawn();if(!hunt.drawn)release(hunt);
 if(hunt.drawn&&aimClient&&!pinned(hunt)){const a=world.aim(aimClient.x,aimClient.y);if(a&&Math.hypot(a.x-p.x,a.z-p.z)>.3)p.facing=Math.atan2(a.x-p.x,a.z-p.z);}
 stepHunt(hunt,state,dt);
 if(!caving&&state.brood?.length){
  const fires=(state.flares??[]).filter(f=>f.cave==null).map(f=>({f,n:flareNow(f,p)})).filter(({n})=>n.stage==='down'&&n.lit>0).map(({n})=>({x:n.x,z:n.z,r:FLARE.radius*n.lit}));
  if(hunt.flame)fires.push(...hunt.flame.points);
  stepBrood(state,dt,fires);
 }
 updatePortals(dt);
 updatePeril(dt);
 if((state.player.y??0)>0||jumpVelocity>0){jumpVelocity-=1.62*dt;state.player.y=Math.max(0,(state.player.y??0)+jumpVelocity*dt);if(state.player.y===0)jumpVelocity=0;}
 constructing=false;constructionReason='';
 const mission=keys.has('e')?missionAction(state):null,ship=keys.has('e')&&!mission?shipAction(state):null;
 if(ship?.hold){
  const r=holdLaunch(state,dt);constructing=r.ok&&!r.done;
  if(r.done){notify(r.reason);keys.delete('e');}
 }else releaseLaunch(state);
 const action=mission;
 if(action?.hold){
  // Holding E at the lander works the core loose; the astronaut kneels into the build pose.
  const r=salvage(state,dt);constructing=r.ok;
  if(r.done)notify(r.reason);
  else if(!r.ok&&r.reason!==salvageReason)notify(r.reason);
  salvageReason=r.ok?'':r.reason;
 }
 else if(state.player.cave==null&&keys.has('e')&&!ship){const b=nearby();if(b){const r=construct(state,b.id,dt);constructing=r.ok!==false;if(!r.ok)constructionReason=r.reason;if(b.built)completed(b);}}
 if(constructing&&state.player.speed<=.1){
  const b=nearby();
  if(b){const center=buildingCenter(b,DEFS),target=Math.atan2(center.x-state.player.x,center.z-state.player.z),delta=Math.atan2(Math.sin(target-state.player.facing),Math.cos(target-state.player.facing));state.player.facing+=delta*(1-Math.exp(-dt/.065));}
 }
 state.player.grounded=!(state.player.y>0||jumpVelocity>0);
 state.player.animation=!state.player.grounded?'jump':state.player.speed>.1?'run':constructing?'build':'idle';
 tick(state,dt*speed);
}
/** Underground controls: Space rolls, Shift jumps, E breaks a grab, R reloads. True when handled. */
function caveKey(k){
 const p=state.player;
 if(k===' '){
  const dx=(keys.has('d')?1:0)-(keys.has('a')?1:0),dz=(keys.has('s')?1:0)-(keys.has('w')?1:0);
  const way=dx||dz?worldVectorToCave(state.seed,p.cave,(dx+dz)*Math.SQRT1_2,(-dx+dz)*Math.SQRT1_2):{x:Math.sin(p.facing),z:Math.cos(p.facing)};
  if(!(p.y>0))roll(hunt,state,way.x,way.z);return true;
 }
 if(k==='shift'){if(!(p.y>0)&&!hunt.rolling&&!pinned(hunt))jumpVelocity=1.8;return true;}
 if(k==='e'&&grabbedBy(hunt)){wrench(hunt,state);return true;}
 if(k==='r'){const r=reload(state);if(r.reason)notify(r.reason);return true;}
 return false;
}
async function start(){
 try{
  let restored=false;
  try{const raw=localStorage.getItem(KEY);if(raw){state=deserialize(raw);resetPlayer();restored=true;saveStatus='Restored local save';}}catch(e){saveStatus='New colony · save unreadable';}
  ui=createUI(document.querySelector('#ui'),{onSelect:select,onAssign:(robot,area)=>{const r=assignRover(state,robot,area);if(!r.ok)notify(r.reason);},onRemoveZone:id=>notify(removeMiningArea(state,id).reason),onSlot:i=>{if(selectedSlot===i)eatSelected();pickSlot(i);},onRotate:()=>{rotation=(rotation+1)%4;refreshGhost();},onSave:save,onLoad:load,onReset:()=>{state=createState(Math.floor(Math.random()*999999));selectedType=null;resetPlayer();targetId=null;keys.clear();world?.clearGhost();save();notify('New lunar landing created.');},onStation:({id,crop,recipe,make})=>{const b=state.buildings.find(o=>o.id===id);if(!b)return;notify((make?craft(state,make):crop?setCrop(state,b,crop):setRecipe(state,b,recipe)).reason);canvas.focus({preventScroll:true});},onCancel:()=>select(null),onStore:(id,i,half)=>crateMove(id,b=>{const s=state.inventory[i];return storeSlot(state,i,b,half&&s?Math.ceil(s.count/2):Infinity);}),onTake:(id,i,half)=>crateMove(id,b=>{const s=b.slots[i];return takeSlot(state,b,i,half&&s?Math.ceil(s.count/2):Infinity);}),onMoveSlot:({crate,from,to,half})=>{if(from.crate||to.crate){crateMove(crate,b=>moveStack(state,b,from,to,half));return;}const r=moveStack(state,null,from,to,half);if(!r.ok)notify(r.reason);else if(to.i!=null&&from.i===selectedSlot){pickSlot(to.i);return;}ui.update(state,view());canvas.focus({preventScroll:true});},onStoreAll:id=>crateMove(id,b=>storeAll(state,b),true),onTakeAll:id=>crateMove(id,b=>collectStorage(state,b.id),true),onCloseStore:()=>canvas.focus({preventScroll:true}),onOrbit:()=>{research?.close();orbit?.toggle();},onResearch:()=>{orbit?.close();research?.toggle();},onTimeToggle:()=>{speed=speed===1?12:1;notify(speed===1?'Normal day/night speed.':'Day/night simulation ×12. Movement stays normal.');}});
  world=await createWorld(canvas,state);
  installCursors();const reticle=createReticle();
  if(window.debugGame)window.game={world,get state(){return state;}};
  orbit=createOrbitView({onReturn:()=>{notify(recallShip(state).reason);orbit.close();},onClose:()=>{keys.clear();canvas.focus({preventScroll:true});}});
  research=createResearchView({onResearch:id=>notify(selectResearch(state,id).reason),onClose:()=>{keys.clear();canvas.focus({preventScroll:true});}});
  canvas.addEventListener('pointermove',e=>{pointerIn=true;aimClient={x:e.clientX,y:e.clientY};reticle.move(e.clientX,e.clientY);point(e);});
  canvas.addEventListener('pointerenter',()=>{pointerIn=true;});
  canvas.addEventListener('pointerleave',()=>{pointerIn=false;if(beltPath||paintPath||erasing)return;hover=null;world.clearGhost();});
  canvas.addEventListener('pointerdown',e=>{
   canvas.focus({preventScroll:true});
   if(e.button===2){select(null);return;}
   if(e.button!==0)return;
   aimClient={x:e.clientX,y:e.clientY};
   if(drawn()){const r=fire(hunt,state);if(r.reason)notify(r.reason);try{canvas.setPointerCapture(e.pointerId);}catch{}return;}
   point(e);
   if(selectedType==='conveyor'&&hover){beltPath=[{x:hover.x,z:hover.z}];try{canvas.setPointerCapture(e.pointerId);}catch{}refreshGhost();}
   else if(DEFS[selectedType]?.paint&&hover){paintPath=[{x:hover.x,z:hover.z}];try{canvas.setPointerCapture(e.pointerId);}catch{}refreshGhost();}
   else if(selectedType==='dismantle'&&hover){erasing={tried:new Set(),removed:0,reason:''};try{canvas.setPointerCapture(e.pointerId);}catch{}eraseAt();refreshGhost();}
   else commandPlace();
  });
  canvas.addEventListener('pointerup',e=>{
   if(e.button!==0)return;
   release(hunt);
   if(beltPath&&selectedType==='conveyor'){point(e);placeBelts();}
   else if(paintPath&&DEFS[selectedType]?.paint){point(e);placePaint();}
   else if(erasing)finishErase();
  });
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  window.addEventListener('keydown',e=>{
   if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;
   const k=e.key.toLowerCase();
   if(k==='o'&&!e.repeat){e.preventDefault();research.close();orbit.toggle();return;}
   if(k==='t'&&!e.repeat){e.preventDefault();orbit.close();research.toggle();return;}
   if(orbit.open){if(k==='escape')orbit.close();return;}
   if(research.open){if(k==='escape')research.close();return;}
   if(['w','a','s','d','e','f','q','x',' ','r','b','g','i','escape'].includes(k)||SHORTCUTS[k]||/^[0-9]$/.test(k))e.preventDefault();
   keys.add(k);if(e.repeat)return;
   if(state.player.cave!=null&&caveKey(k))return;
   if(k===' '&&!(state.player.y>0)){jumpVelocity=1.8;}
   if(k==='escape')select(null);
   if(k==='b')ui.toggleMenu();
   if(k==='g')ui.toggleRobots();
   if(k==='i')ui.toggleStock();
   if(k==='r'){if(drawn()){const r=reload(state);if(r.reason)notify(r.reason);}else{rotation=(rotation+1)%4;refreshGhost();}}
   const mission=k==='e'?missionAction(state):null;
   const ship=k==='e'&&!mission?shipAction(state):null;
   if(mission&&!mission.hold)notify(installCore(state).reason);
   else if(ship&&!ship.hold)notify(loadSatellite(state).reason);
   else if(k==='e'&&!mission&&!ship&&!nearby())useNearby();
   if(k==='f')eatSelected();
   if(k==='q'){const r=throwFlare(state,aimClient&&world.aim(aimClient.x,aimClient.y)).reason;if(r)notify(r);}
   if(k==='x')notify(craftFlares(state).reason);
   if(k==='delete'||k==='backspace')cancel();
   if(/^[0-9]$/.test(k))pickSlot((Number(k)+9)%10);
   if(SHORTCUTS[k])select(selectedType===SHORTCUTS[k]?null:SHORTCUTS[k]);
  });
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>keys.clear());
  document.addEventListener('visibilitychange',()=>{keys.clear();last=performance.now();accumulator=0;});
  window.addEventListener('resize',()=>world.resize());
  window.addEventListener('pagehide',()=>{try{localStorage.setItem(KEY,serialize(state));}catch{}});
  breaches=state.goo?.breaches??0;
  boot.remove();document.body.dataset.ready='true';canvas.focus({preventScroll:true});
  ui.update(state,view());
  const fps=document.createElement('div');fps.className='fps-meter';document.body.append(fps);
  let fpsFrames=0,fpsSince=performance.now(),fpsWorst=0;
  function frame(now){
   fpsFrames++;fpsWorst=Math.max(fpsWorst,now-last);
   if(now-fpsSince>=500){const rate=fpsFrames*1000/(now-fpsSince);fps.textContent=`${Math.round(rate)} fps · ${fpsWorst.toFixed(0)} ms worst`;fps.dataset.level=rate>=50?'good':rate>=30?'ok':'bad';fpsFrames=0;fpsSince=now;fpsWorst=0;}
   const dt=Math.min((now-last)/1000,.1);last=now;accumulator+=dt;
   while(accumulator>=1/30){fixedUpdate(1/30);accumulator-=1/30;}
   if(stepEncounter(encounter,state,dt)==='fled')setTimeout(()=>ui.say(ENCOUNTER_SAY),600);
   world.update(state,dt,interpolatePose(previousPose,state.player,accumulator/(1/30)),encounter,hunt);uiClock+=dt;autoClock+=dt;
   const cursor=cursorMode();if(canvas.dataset.cursor!==cursor)canvas.dataset.cursor=cursor;world.setLogistics(showLogistics());world.setZones(selectedType==='mine'||!!ui?.robotsOpen?.());
   reticle.update(cursor==='none'&&pointerIn?reticleState():null,dt);
   if(state.ship.status!==shipStatus){if(state.ship.status==='orbit'&&shipStatus==='ascent'){notify(`Satellites deployed. ${state.satellites} in orbit.`);orbit.show();}if(state.ship.status==='pad'&&shipStatus==='descent')notify('The Starship is back on the pad.');shipStatus=state.ship.status;}
   if((state.goo?.breaches??0)>breaches){breaches=state.goo.breaches;notify('Containment breach! The goo vat lost power.');ui.say('The vat has breached. Goo is spreading through the base and something hatched. Flares burn both: press X for flares, Q to throw.');}
   orbit.update(state,dt);research.update(state);
   if(ui.crateId!=null){const b=state.buildings.find(o=>o.id===ui.crateId);if(!b||state.player.cave!=null||crateDistance(state,b)>3.6)ui.closeStore();}
   if(uiClock>.1){ui.update(state,view());refreshGhost();uiClock=0;}
   if(autoClock>20){try{localStorage.setItem(KEY,serialize(state));saveStatus='Autosaved locally';}catch{}autoClock=0;}
   requestAnimationFrame(frame);
  }requestAnimationFrame(frame);
 }catch(e){console.error(e);boot.style.display='grid';boot.textContent='Could not start the colony. Reload to retry. '+e.message;}
}
start();
