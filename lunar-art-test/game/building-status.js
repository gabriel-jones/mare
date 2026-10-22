import { daylightAt } from './sim.js';
import { DEFS } from './defs.js';
import { processorReady, melterReady, remainingRegolith, roverHasWork, total, ROVER, RECIPE, MELT, PROCESSOR_INPUT_CAP } from './production.js';
import { LIFE, roomStatus } from './life.js';

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
 if(!building.built)return {text:'Blueprint',read:`${Math.floor(building.progress*100)}% BUILT · HOLD E`,tone:'construction',fill:building.progress};
 const daylight=daylightAt(state.time);
 if(building.type==='battery'){
  const charge=state.power.capacity>0?Math.max(0,Math.min(1,state.power.stored/state.power.capacity)):0;
  return {text:`Charge ${Math.round(charge*100)}%`,read:`${Math.round(state.power.stored)} / ${Math.round(state.power.capacity)} KJ`,tone:charge<=.15?'low':'charge',fill:charge,...(state.power.generation>state.power.demand&&charge<1?{glyph:'charging'}:{})};
 }
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
 if(building.type==='growbed'){
  if(building.grow>=1)return {text:'Ripe',read:'PRESS E TO HARVEST',tone:'low'};
  if(!building.watered&&state.reserves.water<LIFE.growWater)return {text:'Needs water',read:`WATER ${Math.floor(state.reserves.water)}`,tone:'warning',glyph:'water'};
  return state.power.powered===false?noPower:{text:'Growing',read:`${Math.floor(building.grow*100)}% TO HARVEST`,tone:'charge',fill:building.grow};
 }
 if(building.type==='galley'){
  if(building.meals)return {text:building.meals>1?`${building.meals} meals`:'Meal ready',read:'PRESS E TO COLLECT',tone:'low'};
  if(building.crops>=LIFE.cookInput)return state.power.powered===false?noPower:{text:'Cooking',read:`POTATOES ${building.crops}`,tone:'charge',fill:building.work};
  return {text:'Needs potatoes',read:`POTATOES ${building.crops??0} / ${LIFE.cookInput}`,tone:'inactive'};
 }
 if(building.type==='recycler'){
  if(state.reserves.water>=LIFE.waterCap)return {text:'Tanks full',read:`WATER ${Math.floor(state.reserves.water)}`,tone:'inactive'};
  return state.power.powered===false?noPower:{text:'Recycling',read:`WATER ${Math.floor(state.reserves.water)}`,tone:'charge',fill:building.work};
 }
 if(building.type==='solar'&&daylight===0)return {text:'No sunlight',read:'0.0 KW · NIGHT',tone:'inactive'};
 return null;
}

export function robotStatus(robot,state){
 const hasHopper=state.buildings.some(b=>b.type==='hopper'&&b.built);
 const load=robot.cargo/ROVER.capacity,cargo=`${robot.load==='ice'?'ICE':'REGOLITH'} ${Math.floor(robot.cargo)} / ${ROVER.capacity}`,battery=`BATTERY ${Math.round(robot.charge*100)}%`;
 if(robot.task==='blocked')return {text:'No route',read:'CLEAR A PATH',tone:'warning'};
 if(robot.charge<=0)return {text:'Battery flat',read:battery,tone:'warning'};
 if(robot.task==='mining')return {text:'Mining',read:cargo,tone:'charge',fill:load};
 if(robot.task==='toMine')return {text:'To mine',read:battery,tone:'charge',fill:load};
 if(robot.task==='toHopper')return {text:robot.charge<ROVER.low?'Low battery':'Returning',read:cargo,tone:robot.charge<ROVER.low?'low':'charge',fill:load};
 if(robot.task==='docked'){
  const hopper=state.buildings.find(b=>b.id===robot.target?.id);
  if(robot.cargo>=1&&total(hopper?.inv)>=DEFS.hopper.capacity)return {text:'Hopper full',read:cargo,tone:'low'};
  if(robot.cargo>=1)return {text:'Unloading',read:cargo,tone:'charge',fill:load};
  if(robot.charge<.95)return state.power.powered===false?noPower:{text:'Charging',read:battery,tone:'charge',fill:robot.charge,glyph:'charging'};
  return areaStatus(robot,state);
 }
 if(!hasHopper)return {text:'Needs a hopper',read:'BUILD A HOPPER',tone:'inactive'};
 return areaStatus(robot,state);
}
function areaStatus(robot,state){
 if(!state.miningArea)return {text:'Idle',read:'SET A MINING AREA (M)',tone:'inactive'};
 if(remainingRegolith(state)<1)return {text:'Area exhausted',read:'SET A NEW MINING AREA',tone:'low'};
 if(!roverHasWork(state,robot))return {text:'Area unreachable',read:'CLEAR A PATH',tone:'warning'};
 return null;
}
