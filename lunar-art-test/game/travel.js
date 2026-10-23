import {terrainData} from './terrain.js';
import {caveToWorld,worldVectorToCave} from './cave-space.js';
import {caveLayout,CAVE_CELL} from './caves.js';
/** How close to a shaft's centre the player must step to climb or drop through it. */
export const SHAFT_REACH=.85;
// Keep the same world position and facing at the threshold. Only simulation
// coordinates change; the camera and rendered character remain continuous.
// Returns 'surface', 'cave', 'down' or 'up' when the player crosses, otherwise false.
export function crossCavePortal(state){
 const p=state.player,caves=terrainData(state.seed).caves;
 if(p.cave!=null){
  const zone=p.zone??0,cave=caveLayout(state.seed,p.cave,zone),near=s=>s&&Math.hypot(p.x-s.x*CAVE_CELL,p.z-s.z*CAVE_CELL)<SHAFT_REACH;
  // Shafts land the player one cell into the room beside the opposite end.
  if(near(cave.down)){const below=caveLayout(state.seed,p.cave,zone+1).up;p.zone=zone+1;p.x=below.x*CAVE_CELL;p.z=(below.z+1)*CAVE_CELL;p.facing=0;return 'down';}
  if(near(cave.up)){const above=caveLayout(state.seed,p.cave,zone-1).down;p.zone=zone-1;if(!p.zone)delete p.zone;p.x=above.x*CAVE_CELL;p.z=(above.z-1)*CAVE_CELL;p.facing=Math.PI;return 'up';}
  if(zone>0||p.z>=-.7)return false;
  const c=caves[p.cave],world=caveToWorld(state.seed,p.cave,p.x,p.z);p.x=world.x;p.z=world.z;p.facing=(p.facing||0)+c.angle;delete p.cave;return 'surface';
 }
 for(let id=0;id<caves.length;id++){
  const c=caves[id],local=worldVectorToCave(state.seed,id,p.x-c.x,p.z-c.z);
  if(Math.abs(local.x)>1.9||local.z<0||local.z>2.5)continue;
  p.cave=id;p.x=local.x;p.z=local.z;p.facing=(Number.isFinite(p.facing)?p.facing:c.angle)-c.angle;return 'cave';
 }
 return false;
}
