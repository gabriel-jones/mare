import { daylightAt } from './sim.js';
import { DEFS, ITEM_INFO } from './defs.js';
import { HAULER } from './hauler.js';
import { ELECTROLYSIS, LAUNCH, REACTOR_POWER, electrolyserReady, touchesPad } from './space.js';
import { processorReady, melterReady, fabricatorReady, assemblerReady, currentPart, ASSEMBLY, FAB, remainingRegolith, roverHasWork, hasMelter, miningCells, dockSpace, total, ROVER, RECIPE, MELT, PROCESSOR_INPUT_CAP } from './production.js';
import { LIFE, roomStatus, readyCount } from './life.js';
import { CROPS, MILL, isGrower } from './farm.js';

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
 if(!building.built)return {text:'Blueprint',read:`${Math.floor(building.progress*100)}% BUILT · HOLD E`,tone:'construction',fill:building.progress,glyph:'build'};
 const daylight=daylightAt(state.time);
 if(building.type==='battery'){
  const charge=state.power.capacity>0?Math.max(0,Math.min(1,state.power.stored/state.power.capacity)):0;
  return {text:`Charge ${Math.round(charge*100)}%`,read:`${Math.round(state.power.stored)} / ${Math.round(state.power.capacity)} KJ`,tone:charge<=.15?'low':'charge',fill:charge,...(state.power.generation>state.power.demand&&charge<1?{glyph:'charging'}:{})};
 }
 if(building.type==='reactor')return {text:`${REACTOR_POWER} kW`,read:`RESONANCE STABLE · ${REACTOR_POWER} KW`,tone:'charge',fill:1};
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
  const inv=building.inv??{},count=(inv.metal??0)+(inv.silicon??0)+(inv.regolith??0);
  if(!count)return null;
  const full=count>=DEFS.storage.capacity;
  return {text:full?'Full':'Stocked',read:`METAL ${inv.metal??0} · SILICON ${inv.silicon??0}`,tone:full?'low':'charge',fill:count/DEFS.storage.capacity};
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
 if(DEFS[building.type].layer==='interior'&&!room?.pressurised)return {text:'No air',read:'ROOM UNPRESSURISED',tone:'inactive'};
 if(isGrower(building)){
  const crop=CROPS[building.crop],name=ITEM_INFO[building.crop].name.toUpperCase();
  if(building.grow>=1)return {text:'Ripe',read:`PRESS E TO HARVEST ${name}`,tone:'low'};
  if(!building.watered&&state.reserves.water<crop.water)return {text:'Needs water',read:`WATER ${Math.floor(state.reserves.water)}`,tone:'warning',glyph:'water'};
  return state.power.powered===false&&crop.power?noPower:{text:'Growing',read:`${name} · ${Math.floor(building.grow*100)}%`,tone:'charge',fill:building.grow};
 }
 if(building.type==='galley'||building.type==='mill'){
  const ready=Object.entries(building.ready??{}).filter(([,n])=>n);
  if(ready.length){const [item,n]=ready[0];return {text:ready.length>1||n>1?`${readyCount(building)} ready`:`${ITEM_INFO[item].name} ready`,read:'PRESS E TO COLLECT',tone:'low'};}
  const next=building.queue?.[0];
  if(next)return state.power.powered===false?noPower:{text:building.type==='galley'?'Cooking':'Milling',read:ITEM_INFO[building.type==='galley'?next:MILL.makes[next]].name.toUpperCase(),tone:'charge',fill:building.work};
  return building.type==='galley'?{text:'Needs ingredients',read:building.recipe?ITEM_INFO[building.recipe].name.toUpperCase():'AUTO RECIPE',tone:'inactive'}:{text:'Needs grain',read:'WHEAT OR SOYBEANS',tone:'inactive'};
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
 if(building.type==='solar'&&daylight===0)return {text:'No sunlight',read:'0.0 KW · NIGHT',tone:'inactive'};
 return null;
}

export function robotStatus(robot,state){
 if(robot.kind==='hauler')return haulerStatus(robot,state);
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
