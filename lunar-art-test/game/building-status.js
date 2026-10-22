import { daylightAt } from './sim.js';

// The prototype has one shared power network. Every battery displays its share
// of the pooled charge; independent battery storage can replace this later.
export function buildingStatus(building,state){
 if(!building.built)return {icon:'build',text:`${Math.floor(building.progress*100)}%`,tone:'construction',fill:building.progress};
 const daylight=daylightAt(state.time),night=daylight<=.05;
 if(building.type==='battery'){
  const charge=state.power.capacity>0?Math.max(0,Math.min(1,state.power.stored/state.power.capacity)):0;
  return {icon:'battery',text:`${Math.round(charge*100)}%`,tone:charge<=.15?'low':'charge',fill:charge};
 }
 const consuming=building.type==='habitat'||(building.type==='lamp'&&night);
 if(consuming&&state.power.powered===false)return {icon:'power',text:'No power',tone:'warning'};
 if(building.type==='solar'&&daylight===0)return {icon:'sun',text:'No sunlight',tone:'inactive'};
 return null;
}
