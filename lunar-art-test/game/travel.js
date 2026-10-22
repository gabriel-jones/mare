import {terrainData} from './terrain.js';
import {caveToWorld,worldVectorToCave} from './cave-space.js';
// Keep the same world position and facing at the threshold. Only simulation
// coordinates change; the camera and rendered character remain continuous.
export function crossCavePortal(state){
 const p=state.player,caves=terrainData(state.seed).caves;
 if(p.cave!=null){
  if(p.z>=-.7)return false;
  const c=caves[p.cave],world=caveToWorld(state.seed,p.cave,p.x,p.z);p.x=world.x;p.z=world.z;p.facing=(p.facing||0)+c.angle;delete p.cave;return true;
 }
 for(let id=0;id<caves.length;id++){
  const c=caves[id],local=worldVectorToCave(state.seed,id,p.x-c.x,p.z-c.z);
  if(Math.abs(local.x)>1.9||local.z<0||local.z>2.5)continue;
  p.cave=id;p.x=local.x;p.z=local.z;p.facing=(Number.isFinite(p.facing)?p.facing:c.angle)-c.angle;return true;
 }
 return false;
}
