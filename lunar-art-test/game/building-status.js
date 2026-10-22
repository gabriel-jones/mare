import { daylightAt } from './sim.js';
import { DEFS } from './defs.js';
import { processorReady, remainingRegolith, roverHasWork, ROVER, RECIPE } from './production.js';

// The prototype has one shared power network. Every battery displays its share
// of the pooled charge; independent battery storage can replace this later.
export function buildingStatus(building,state){
 if(!building.built)return {icon:'build',text:`${Math.floor(building.progress*100)}%`,tone:'construction',fill:building.progress};
 const daylight=daylightAt(state.time),night=daylight<=.05;
 if(building.type==='battery'){
  const charge=state.power.capacity>0?Math.max(0,Math.min(1,state.power.stored/state.power.capacity)):0;
  return {icon:'battery',text:`${Math.round(charge*100)}%`,tone:charge<=.15?'low':'charge',fill:charge};
 }
 if(building.type==='hopper'){
  const amount=building.inv?.regolith??0;
  return amount?{icon:'ore',text:String(Math.floor(amount)),tone:amount>=DEFS.hopper.capacity?'low':'charge',fill:amount/DEFS.hopper.capacity}:null;
 }
 if(building.type==='storage'){
  const inv=building.inv??{},count=(inv.metal??0)+(inv.silicon??0)+(inv.regolith??0);
  if(!count)return null;
  return {icon:'box',text:count>=DEFS.storage.capacity?'Full':`${inv.metal??0} · ${inv.silicon??0}`,tone:count>=DEFS.storage.capacity?'low':'charge',fill:count/DEFS.storage.capacity};
 }
 if(building.type==='processor'){
  if(!building.inv)return null;
  if(processorReady(building))return state.power.powered===false?{icon:'power',text:'No power',tone:'warning'}:{icon:'gear',text:'Refining',tone:'charge',fill:building.work};
  if(building.inv.regolith<RECIPE.input)return {icon:'ore',text:'Needs regolith',tone:'inactive'};
  return {icon:'box',text:'Output blocked',tone:'low'};
 }
 const consuming=building.type==='habitat'||(building.type==='lamp'&&night);
 if(consuming&&state.power.powered===false)return {icon:'power',text:'No power',tone:'warning'};
 if(building.type==='solar'&&daylight===0)return {icon:'sun',text:'No sunlight',tone:'inactive'};
 return null;
}

export function robotStatus(robot,state){
 const hasHopper=state.buildings.some(b=>b.type==='hopper'&&b.built);
 const load=robot.cargo/ROVER.capacity;
 if(robot.task==='blocked')return {icon:'rover',text:'No route',tone:'warning'};
 if(robot.charge<=0)return {icon:'battery',text:'Battery flat',tone:'warning'};
 if(robot.task==='mining')return {icon:'rover',text:`Mining ${Math.floor(robot.cargo)}/${ROVER.capacity}`,tone:'charge',fill:load};
 if(robot.task==='toMine')return {icon:'rover',text:'To mine',tone:'charge',fill:load};
 if(robot.task==='toHopper')return {icon:'rover',text:robot.charge<ROVER.low?'Low battery':'Returning',tone:robot.charge<ROVER.low?'low':'charge',fill:load};
 if(robot.task==='docked'){
  const hopper=state.buildings.find(b=>b.id===robot.target?.id);
  if(robot.cargo>=1&&hopper?.inv?.regolith>=DEFS.hopper.capacity)return {icon:'ore',text:'Hopper full',tone:'low'};
  if(robot.cargo>=1)return {icon:'ore',text:'Unloading',tone:'charge',fill:load};
  if(robot.charge<.95)return state.power.powered===false?{icon:'power',text:'No power',tone:'warning'}:{icon:'battery',text:`Charging ${Math.round(robot.charge*100)}%`,tone:'charge',fill:robot.charge};
  return areaStatus(robot,state);
 }
 if(!hasHopper)return {icon:'rover',text:'Needs a hopper',tone:'inactive'};
 return areaStatus(robot,state);
}
function areaStatus(robot,state){
 if(!state.miningArea)return {icon:'rover',text:'Set mining area',tone:'inactive'};
 if(remainingRegolith(state)<1)return {icon:'ore',text:'Area exhausted',tone:'low'};
 if(!roverHasWork(state,robot))return {icon:'rover',text:'Area unreachable',tone:'warning'};
 return null;
}
