import { daylightAt } from './sim.js';
import { DEFS, ITEM_INFO } from './defs.js';
import { HAULER } from './hauler.js';
import { ELECTROLYSIS, LAUNCH, REACTOR_POWER, electrolyserReady, touchesPad } from './space.js';
import { processorReady, melterReady, fabricatorReady, assemblerReady, currentPart, ASSEMBLY, FAB, remainingRegolith, roverHasWork, hasMelter, miningCells, dockSpace, total, ROVER, RECIPE, MELT, PROCESSOR_INPUT_CAP } from './production.js';
import { LIFE, STATIONS, isStation, jobName, roomStatus, readyCount, stationJobs } from './life.js';
import { CROPS, isGrower } from './farm.js';
import { GOO, gooOn } from './goo.js';
import { BIO, FUELCELL, RTG_POWER, THERMAL } from './power.js';
import { buildingHp } from './raid.js';
import { FENCE, TURRET, fenceRuns } from './defense.js';
import { MODES, ORE, crewed, depositLeft, drillDeposit, drillOre, furnaceReady } from './ore.js';

const roomCache={state:null,time:-1,result:null};
function roomsOf(state){
 if(roomCache.state!==state||roomCache.time!==state.time){roomCache.state=state;roomCache.time=state.time;roomCache.result=roomStatus(state);}
 return roomCache.result;
}

/** What a machine's status lamp shows. `warning` statuses need the player and always float a glyph (`glyph`, or `alert` by default). */
export const LAMP_LEVELS=Object.freeze({charge:'ok',low:'low',warning:'fault',inactive:'idle',construction:'off'});
export const lampLevel=status=>status?LAMP_LEVELS[status.tone]??'ok':'ok';

const noPower={text:'No power',read:'GRID OFFLINE',tone:'warning',glyph:'power'};
// The prototype has one shared power network. Every battery displays its share
// of the pooled charge; independent battery storage can replace this later.
export function buildingStatus(building,state){
 if(!building.built&&building.wreck)return {text:'Wrecked',read:`${Math.floor(building.progress*100)}% · HOLD E TO REBUILD`,tone:'warning',fill:building.progress,glyph:'build'};
 if(!building.built)return {text:'Blueprint',read:`${Math.floor(building.progress*100)}% BUILT · HOLD E`,tone:'construction',fill:building.progress,glyph:'build'};
 if(building.hp!=null){const k=building.hp/buildingHp(building.type);return {text:`Damaged ${Math.round(k*100)}%`,read:'CLAWED · HOLD E TO PATCH UP',tone:k<.35?'warning':'low',fill:k};}
 const daylight=daylightAt(state.time);
 if(building.type==='battery'){
  const charge=state.power.capacity>0?Math.max(0,Math.min(1,state.power.stored/state.power.capacity)):0;
  return {text:`Charge ${Math.round(charge*100)}%`,read:`${Math.round(state.power.stored)} / ${Math.round(state.power.capacity)} KJ`,tone:charge<=.15?'low':'charge',fill:charge,...(state.power.generation>state.power.demand&&charge<1?{glyph:'charging'}:{})};
 }
 if(building.type==='reactor')return {text:`${REACTOR_POWER} kW`,read:`RESONANCE STABLE · ${REACTOR_POWER} KW`,tone:'charge',fill:1};
 if(building.type==='rtg')return {text:`${RTG_POWER} kW`,read:`ISOTOPE DECAY · ${RTG_POWER} KW`,tone:'charge',fill:1};
 if(building.type==='fuelcell'){
  const tanks=state.buildings.filter(b=>b.built&&b.type==='tank'),fuel=tanks.reduce((s,t)=>s+(t.fuel??0),0),fill=tanks.length?fuel/(tanks.length*DEFS.tank.capacity):0;
  if(!tanks.length)return {text:'Needs a tank',read:'BUILD A PROPELLANT TANK',tone:'warning'};
  if(fuel<.5)return {text:'No propellant',read:'RUN AN ELECTROLYSER BY DAY',tone:'warning',glyph:'power'};
  if(building.on)return {text:`${(state.power.fuel??0).toFixed(1)} kW`,read:`BURNING PROPELLANT · ${Math.floor(fuel)} LEFT`,tone:'charge',fill};
  return {text:'Standby',read:`PROPELLANT ${Math.floor(fuel)} · STARTS AT ${Math.round(FUELCELL.reserve*100)}% BATTERY`,tone:'inactive',fill};
 }
 if(building.type==='thermal'){
  const r=Math.floor(building.inv?.regolith??0);
  if(!r)return {text:'Needs regolith',read:'ROVERS OR A BELT FILL IT',tone:'inactive'};
  return {text:`${r*THERMAL.perLoad} kJ`,read:`REGOLITH ${r} / ${THERMAL.cap} · HOLDS ${r*THERMAL.perLoad} KJ`,tone:'charge',fill:r/THERMAL.cap};
 }
 if(building.type==='bioreactor'){
  if(!building.fed)return {text:'Unfed',read:'PRESS E WITH BLACK GOO',tone:'inactive'};
  if(building.stock<1)return {text:`Breach in ${Math.ceil(BIO.starveAfter-building.starve)}s`,read:'CULTURE STARVING · FEED IT GOO',tone:'warning'};
  return {text:`${BIO.power} kW`,read:`DIGESTING · GOO ${building.stock} / ${BIO.cap}${building.stock<=1?' · FEED SOON':''}`,tone:building.stock<=1?'low':'charge',fill:building.stock/BIO.cap};
 }
 if(building.type==='drill'){
  const d=drillDeposit(state,building),left=d?depositLeft(state,d):0,ore=ITEM_INFO[drillOre(state,building)]?.name.toUpperCase()??'ORE',read=`${ore} ${building.out} / ${ORE.drill.cap} · ${Math.floor(left)} LEFT IN THE GROUND`;
  if(!d||left<1)return {text:'Worked out',read:'DEPOSIT EXHAUSTED · DISMANTLE AND MOVE IT',tone:'inactive'};
  if(building.out>=ORE.drill.cap)return {text:'Full',read:'BELT IT AWAY OR LET AN ANDROID HAUL IT',tone:'low',fill:1};
  if(state.power.powered===false)return noPower;
  if(!crewed(state,building))return {text:'No operator',read:`AN ANDROID MUST WORK THE CONTROLS · ${read}`,tone:'inactive',fill:building.out/ORE.drill.cap};
  return {text:'Drilling',read,tone:'charge',fill:building.out/ORE.drill.cap};
 }
 if(building.type==='furnace'){
  const ore=Object.entries(building.inv??{}).filter(([,n])=>n>0).map(([i,n])=>`${ITEM_INFO[i].name.toUpperCase()} ${n}`).join(' · '),made=Object.entries(building.out??{}).filter(([,n])=>n>0).map(([i,n])=>`${n} ${ITEM_INFO[i].name.toUpperCase()}`).join(' · ');
  if(furnaceReady(building)){if(state.power.powered===false)return noPower;return {text:building.mode==='plate'?'Rolling plate':'Smelting',read:[ore,made&&`READY: ${made}`].filter(Boolean).join(' · '),tone:'charge',fill:building.work};}
  if(made)return {text:total(building.out)>=ORE.furnace.cap?'Output full':'Ready',read:`READY: ${made} · PRESS E OR BELT IT AWAY`,tone:'low'};
  return {text:'Cold',read:building.mode==='plate'?'ROLLING PLATE · NEEDS IRON BARS':`${MODES.bars.toUpperCase()} · NEEDS 2 ORE`,tone:'inactive'};
 }
 if(building.type==='turret'){
  const ammo=building.ammo??0,read=`ROUNDS ${ammo} / ${TURRET.cap}`;
  if(state.power.powered===false)return noPower;
  if(ammo<1)return {text:'No rounds',read:'PRESS E WITH ROUNDS · ANDROIDS RESTOCK IT',tone:'warning'};
  if(building.target)return {text:'Engaging',read,tone:ammo<TURRET.cap*.25?'low':'charge',fill:ammo/TURRET.cap};
  return {text:ammo<TURRET.cap*.25?'Low on rounds':'Watching',read,tone:ammo<TURRET.cap*.25?'low':'inactive',fill:ammo/TURRET.cap};
 }
 if(building.type==='fence'){
  const foul=building.foul??0;
  if(building.fire>0)return {text:'On fire',read:'GOO BURNING ON THE WIRES · PRESS E',tone:'warning'};
  if(building.short)return {text:'Shorted',read:'GOO ACROSS THE WIRES · PRESS E TO SCRAPE',tone:'warning'};
  if(state.power.powered===false)return noPower;
  if(fenceRuns(state).find(r=>r.segments.includes(building))?.dead)return {text:'Dead',read:'A SHORT DOWN THE LINE',tone:'low',fill:foul/FENCE.short};
  return foul>=.5?{text:`Fouled ${Math.round(foul/FENCE.short*100)}%`,read:'GOO ON THE WIRES · PRESS E TO SCRAPE',tone:'low',fill:foul/FENCE.short}:{text:'Live',read:`${FENCE.power} KW · SHOCKS ON CONTACT`,tone:'charge'};
 }
 if(building.type==='xenolab')return {text:'Studying',read:`RESEARCH BANK ${Math.floor(state.research.bank)} PTS`,tone:'inactive'};
 if(building.type==='hopper'){
  const ice=Math.floor(building.inv?.ice??0),regolith=Math.floor(building.inv?.regolith??0),amount=total(building.inv),cap=DEFS.hopper.capacity;
  const read=ice?`REGOLITH ${regolith} · ICE ${ice} / ${cap}`:`REGOLITH ${regolith} / ${cap}`;
  return amount?{text:amount>=cap?'Full':'Holding',read,tone:amount>=cap?'low':'charge',fill:amount/cap}:null;
 }
 if(building.type==='melter'){
  if(!building.inv)return null;
  const read=`ICE ${String(building.inv.ice).padStart(2,'0')} / ${MELT.cap}`;
  if(state.reserves.water>=MELT.waterCap)return {text:'Tanks full',read:`WATER ${Math.floor(state.reserves.water)} / ${MELT.waterCap}`,tone:'inactive'};
  if(melterReady(state,building))return state.power.powered===false?noPower:{text:'Melting',read,tone:'charge',fill:building.work};
  return {text:'Needs ice',read:`${read} · INPUT EMPTY`,tone:'warning',glyph:'ice'};
 }
 if(building.type==='storage'){
  const slots=building.slots??[],used=slots.filter(Boolean).length,held={};
  if(!used)return null;
  for(const s of slots)if(s)held[s.item]=(held[s.item]??0)+s.count;
  const top=Object.entries(held).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([item,n])=>`${(ITEM_INFO[item]?.name??item).toUpperCase()} ${n}`).join(' · ');
  const full=used>=DEFS.storage.slots;
  return {text:full?'Full':'Stocked',read:`${top} · ${used}/${DEFS.storage.slots} SLOTS`,tone:full?'low':'charge',fill:used/DEFS.storage.slots};
 }
 if(building.type==='processor'){
  if(!building.inv)return null;
  const read=`REGOLITH ${Math.floor(building.inv.regolith)} / ${PROCESSOR_INPUT_CAP}`;
  if(processorReady(building))return state.power.powered===false?noPower:{text:'Refining',read,tone:'charge',fill:building.work};
  if(building.inv.regolith<RECIPE.input)return {text:'Needs regolith',read,tone:'inactive'};
  return {text:'Output blocked',read:'CLEAR THE OUTPUT BELT',tone:'warning'};
 }
 const room=DEFS[building.type].layer?roomsOf(state).at(building.x,building.z):null;
 if(DEFS[building.type].layer==='floor')return room?.pressurised?{text:'Pressurised',read:'LIFE SUPPORT NOMINAL',tone:'charge'}:{text:room?.reason??'No airlock',read:'ROOM UNPRESSURISED',tone:'warning'};
// A failing vat outranks the room it stands in.
 if(building.type==='goovat'){
  if(!building.seeded)return building.stock>=1?{text:`${Math.floor(building.stock)} goo ready`,read:'PRESS E TO COLLECT',tone:'low'}:{text:'Unseeded',read:'NEEDS A SAMPLE FROM A LIVE NEST',tone:'inactive'};
  if(state.power.powered===false)return {text:`Breach in ${Math.ceil(GOO.breachAfter-building.dark)}s`,read:'CONTAINMENT FAILING · RESTORE POWER',tone:'warning'};
  return building.stock>=GOO.cap?{text:'Vat full',read:`PRESS E · ${GOO.cap} BLACK GOO`,tone:'low'}:{text:'Culturing',read:`BLACK GOO ${Math.floor(building.stock)} / ${GOO.cap}`,tone:'charge',fill:building.work};
 }
 if(DEFS[building.type].layer==='interior'&&!room?.pressurised&&STATIONS[building.type]?.air!==false)return {text:'No air',read:'ROOM UNPRESSURISED',tone:'inactive'};
 if(isGrower(building)){
  const crop=CROPS[building.crop],name=ITEM_INFO[building.crop].name.toUpperCase();
  if(gooOn(state,building))return {text:'Choked by goo',read:'BURN IT OFF WITH A FLARE',tone:'warning'};
  if(building.grow>=1)return {text:'Ripe',read:`PRESS E TO HARVEST ${name}`,tone:'low',glyph:'harvest'};
  if(!building.watered&&state.reserves.water<crop.water)return {text:'Needs water',read:`WATER ${Math.floor(state.reserves.water)}`,tone:'warning',glyph:'water'};
  return state.power.powered===false&&crop.power?noPower:{text:'Growing',read:`${name} · ${Math.floor(building.grow*100)}%`,tone:'charge',fill:building.grow};
 }
 if(isStation(building)){
  const ready=Object.entries(building.ready??{}).filter(([,n])=>n);
  if(ready.length){const [item,n]=ready[0];return {text:ready.length>1||n>1?`${readyCount(building)} ready`:`${ITEM_INFO[item].name} ready`,read:'PACK FULL · PRESS E TO COLLECT',tone:'low'};}
  const st=STATIONS[building.type],next=stationJobs(building)[0];
  if(next)return state.power.powered===false&&st.power?noPower:{text:st.verb,read:jobName(next).toUpperCase(),tone:'charge',fill:building.work};
  return {text:'Idle',read:`CLICK TO ${building.type==='galley'?'COOK':building.type==='mill'?'MILL':building.type==='roverbay'||building.type==='foundry'?'ASSEMBLE':'CRAFT'}`,tone:'inactive'};
 }
 if(building.type==='recycler'){
  if(state.reserves.water>=LIFE.waterCap)return {text:'Tanks full',read:`WATER ${Math.floor(state.reserves.water)}`,tone:'inactive'};
  return state.power.powered===false?noPower:{text:'Recycling',read:`WATER ${Math.floor(state.reserves.water)}`,tone:'charge',fill:building.work};
 }
 if(building.type==='fabricator'){
  if(fabricatorReady(building))return state.power.powered===false?noPower:{text:'Fabricating',read:currentPart(building).toUpperCase(),tone:'charge',fill:building.work};
  if(building.out[currentPart(building)]>=FAB.out)return {text:'Output full',read:'HAUL OR BELT THE PARTS AWAY',tone:'low'};
  return {text:'Needs materials',read:`METAL ${building.inv.metal} · SILICON ${building.inv.silicon}`,tone:'inactive'};
 }
 if(building.type==='assembler'){
  if(building.out.satellite>=1)return {text:'Satellite ready',read:'PRESS E OR SEND A HAULER',tone:'low',glyph:'satellite'};
  if(assemblerReady(building))return state.power.powered===false?noPower:{text:'Assembling',read:'SATELLITE',tone:'charge',fill:building.work,glyph:'build'};
  return {text:'Needs parts',read:Object.keys(ASSEMBLY.need).map(p=>`${p.toUpperCase()} ${building.inv[p]}/${ASSEMBLY.need[p]}`).join(' · '),tone:'inactive'};
 }
 if(building.type==='electrolyser'){
  if(electrolyserReady(state,building))return state.power.powered===false?noPower:{text:'Splitting water',read:'H2 + O2',tone:'charge',fill:building.work};
  if(!state.buildings.some(b=>b.type==='tank'&&b.built))return {text:'Needs a tank',read:'BUILD A TANK BY THE PAD',tone:'warning',glyph:'fuel'};
  if(state.reserves.water<=ELECTROLYSIS.waterFloor)return {text:'Needs water',read:'KEEPS A DRINKING RESERVE',tone:'warning',glyph:'water'};
  return {text:'Tanks full',read:'PROPELLANT STORED',tone:'inactive'};
 }
 if(building.type==='tank'){
  const fill=building.fuel/DEFS.tank.capacity;
  if(!touchesPad(building))return {text:'Not at the pad',read:'MOVE BESIDE THE PAD',tone:'warning'};
  return {text:`Propellant ${Math.round(fill*100)}%`,read:`${Math.floor(building.fuel)} / ${DEFS.tank.capacity}`,tone:'charge',fill};
 }
 if(building.type==='chargepad'){
  const a=state.robots.find(r=>r.kind==='android'&&r.home===building.id);
  if(!a)return {text:'Free',read:'BUILD AN ANDROID AT A FOUNDRY',tone:'inactive'};
  const docked=a.job?.type==='charge'&&a.job.here;
  if(docked&&a.charge<.95)return state.power.powered===false?noPower:{text:'Charging',read:`A${a.id} · BATTERY ${Math.round(a.charge*100)}%`,tone:'charge',fill:a.charge,glyph:'charging'};
  return {text:docked?'Docked':'In use',read:`HOME OF A${a.id}`,tone:'charge'};
 }
 if(building.type==='solar'&&daylight===0)return {text:'No sunlight',read:'0.0 KW · NIGHT',tone:'inactive'};
 return null;
}

export function robotStatus(robot,state){
 if(robot.kind==='hauler')return haulerStatus(robot,state);
 if(robot.kind==='android')return androidStatus(robot,state);
 const hasDock=state.buildings.some(b=>(b.type==='hopper'||b.type==='melter')&&b.built);
 const load=robot.cargo/ROVER.capacity,cargo=`${robot.load==='ice'?'ICE':'REGOLITH'} ${Math.floor(robot.cargo)} / ${ROVER.capacity}`,battery=`BATTERY ${Math.round(robot.charge*100)}%`;
 if(robot.task==='blocked')return {text:'No route',read:'CLEAR A PATH',tone:'warning'};
 if(robot.charge<=0)return {text:'Battery flat',read:battery,tone:'warning'};
 if(robot.task==='mining')return {text:'Mining',read:cargo,tone:'charge',fill:load};
 if(robot.task==='toMine')return {text:'To mine',read:battery,tone:'charge',fill:load};
 if(robot.task==='toHopper')return {text:robot.charge<ROVER.low?'Low battery':'Returning',read:cargo,tone:robot.charge<ROVER.low?'low':'charge',fill:load};
 if(robot.task==='docked'){
  const dock=state.buildings.find(b=>b.id===robot.target?.id);
  if(robot.cargo>=1&&dock&&dockSpace(dock,robot.load)<1)return {text:dock.type==='melter'?'Waiting at melter':'Hopper full',read:cargo,tone:'low'};
  if(robot.cargo>=1)return {text:'Unloading',read:cargo,tone:'charge',fill:load};
  if(robot.charge<.95)return state.power.powered===false?noPower:{text:'Charging',read:battery,tone:'charge',fill:robot.charge,glyph:'charging'};
  return areaStatus(robot,state);
 }
 if(!hasDock)return {text:'Needs a hopper',read:'BUILD A HOPPER OR MELTER',tone:'inactive'};
 return areaStatus(robot,state);
}
function areaStatus(robot,state){
 if(!state.miningAreas.length)return {text:'Idle',read:'ADD A MINING ZONE',tone:'inactive'};
 if(remainingRegolith(state,robot.area??null)<1)return {text:'Zone exhausted',read:'ADD A NEW MINING ZONE',tone:'low'};
 if(roverHasWork(state,robot))return null;
 if(!hasMelter(state)&&miningCells(state,robot.area??null).some(c=>c.kind==='ice'&&c.remaining>0))return {text:'Needs a melter',read:'ICE GOES STRAIGHT INTO A MELTER',tone:'warning',glyph:'ice'};
 return {text:'Zone unreachable',read:'CLEAR A PATH',tone:'warning'};
}
const ANDROID_TASK={fetch:'Fetching',deliver:'Delivering',build:'Building',feed:'Feeding',collect:'Collecting',harvest:'Harvesting',craft:'Ordering',stow:'Storing',disarm:'Putting away arms',arm:'Arming',kit:'Getting parts',repair:'Repairing',fight:'Defending'};
function androidStatus(robot,state){
 const battery=`BATTERY ${Math.round(robot.charge*100)}%`,j=robot.job;
 if(robot.down)return {text:'Down',read:robot.charge<=0?'BATTERY FLAT · PRESS E TO REPAIR':'DAMAGED · PRESS E TO REPAIR',tone:'warning',glyph:'alert'};
 if(j?.type==='charge'){
  if(!j.here)return {text:robot.charge<.22?'Low battery':'To pad',read:battery,tone:robot.charge<.22?'low':'charge',fill:robot.charge};
  return robot.charge<.95&&state.power.powered===false?noPower:{text:robot.charge<.95?'Charging':'Standing by',read:battery,tone:'charge',fill:robot.charge,...(robot.charge<.95?{glyph:'charging'}:{})};
 }
 if(!state.buildings.some(b=>b.type==='chargepad'&&b.built))return {text:'No pad',read:'BUILD A CHARGING PAD',tone:'warning'};
 const what=robot.carry?`${(ITEM_INFO[robot.carry.item]?.name??robot.carry.item).toUpperCase()} ${robot.carry.n}`:robot.weapon?robot.weapon.toUpperCase():battery;
 if(j)return {text:ANDROID_TASK[j.type]??'Working',read:what,tone:j.type==='fight'?'warning':'charge',fill:robot.charge};
 return {text:'Idle',read:battery,tone:'inactive'};
}
function haulerStatus(robot,state){
 const battery=`BATTERY ${Math.round(robot.charge*100)}%`,cargo=robot.cargo?`${robot.cargo} ${robot.load}`:'empty';
 if(robot.task==='blocked')return {text:'No route',read:'CLEAR A PATH',tone:'warning'};
 if(robot.charge<=0)return {text:'Battery flat',read:battery,tone:'warning'};
 if(robot.task==='charging')return robot.charge>=.95?{text:'Docked',read:'NO JOBS',tone:'inactive'}:state.power.powered===false?noPower:{text:'Charging',read:battery,tone:'charge',fill:robot.charge,glyph:'charging'};
 if(robot.task==='toHome')return {text:robot.charge<HAULER.low?'Low battery':'Returning',read:battery,tone:robot.charge<HAULER.low?'low':'charge'};
 const where=id=>id==='ship'?'Starship':(n=>n?`${DEFS[n.type].name}`:'?')(state.buildings.find(b=>b.id===id));
 if(robot.task==='toPickup')return {text:`Fetching ${robot.job?.item??''}`,read:`FROM ${where(robot.job?.from).toUpperCase()}`,tone:'charge'};
 if(robot.task==='toDrop')return {text:`Delivering ${cargo}`,read:`TO ${where(robot.target?.id).toUpperCase()}`,tone:'charge'};
 return {text:'Idle',read:'NO JOBS',tone:'inactive'};
}
/** Starship status shown over the pad: fuel as a ring, a glyph once satellites are aboard. */
export function shipStatus(state){
 const ship=state.ship;
 if(ship.status!=='pad')return null;
 const fuel=Math.min(1,ship.fuel/LAUNCH.fuel);
 if(!ship.payload&&!ship.fuel)return null;
 return {text:ship.payload?`${ship.payload} aboard`:'Fuelling',read:`FUEL ${Math.round(fuel*100)}%`,tone:fuel>=1&&ship.payload?'low':'charge',fill:fuel,glyph:fuel>=1&&ship.payload?'launch':'fuel'};
}
