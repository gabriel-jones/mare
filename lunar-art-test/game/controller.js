import {worldVectorToCave} from './cave-space.js';
import { caveWalkable } from './caves.js';
import { terrainBlocked } from './terrain.js';
// Input-to-world movement is independent of rendering and networking.
export const CELL_SIZE=2;
export const RUN_SPEED=6.5;
export const WALK_SPEED=RUN_SPEED; // Compatibility for existing consumers; movement always runs.
export function resetLocomotion(player){
 player.vx=0;player.vz=0;player.speed=0;player.y=0;
 player.facing=Number.isFinite(player.facing)?player.facing:Math.PI;
 player.grounded=true;player.animation='idle';
}
export function interpolatePose(previous,current,alpha){
 const angle=Math.atan2(Math.sin(current.facing-previous.facing),Math.cos(current.facing-previous.facing));
 return {...current,x:previous.x+(current.x-previous.x)*alpha,y:previous.y+(current.y-previous.y)*alpha,z:previous.z+(current.z-previous.z)*alpha,facing:previous.facing+angle*alpha};
}
export function movePlayer(state,dx,dz,dt,defs){
 const p=state.player,step=Math.max(0,Math.min(dt,.05));
 const len=Math.hypot(dx,dz),speed=RUN_SPEED;
 // Screen-space up = -X,-Z. Screen-space right = +X,-Z.
 let targetX=len?(dx+dz)*Math.SQRT1_2*speed/Math.max(1,len):0;
 let targetZ=len?(-dx+dz)*Math.SQRT1_2*speed/Math.max(1,len):0;
 if(p.cave!=null){const local=worldVectorToCave(state.seed,p.cave,targetX,targetZ);targetX=local.x;targetZ=local.z;}
 const vx=p.vx??0,vz=p.vz??0,dvx=targetX-vx,dvz=targetZ-vz;
 const change=Math.hypot(dvx,dvz),limit=(len?45:54)*step,blend=change?Math.min(1,limit/change):1;
 p.vx=vx+dvx*blend;p.vz=vz+dvz*blend;
 const blocked=(x,z)=>{
  if(p.cave!=null)return !caveWalkable(state.seed,p.cave,x,z);
  if(Math.abs(x)>125||Math.abs(z)>125)return true;
  if(terrainBlocked(state.seed,x,z,state.buildings,defs))return true;
  // Landing ship itself is solid; the rest of the pad is walkable.
  if(Math.hypot(x,z+10)<1.9)return true;
  for(const b of state.buildings){
   const d=defs[b.type];if(!b.built||!d||d.walkable)continue;
   const w=b.rotation?d.d:d.w,h=b.rotation?d.w:d.d,r=.32;
   if(x>b.x*2-1-r&&x<(b.x+w-1)*2+1+r&&z>b.z*2-1-r&&z<(b.z+h-1)*2+1+r)return true;
  }return false;
 };
 // Resolve axes separately, clearing blocked velocity rather than accumulating it.
 if(!blocked(p.x+p.vx*step,p.z))p.x+=p.vx*step;else p.vx=0;
 if(!blocked(p.x,p.z+p.vz*step))p.z+=p.vz*step;else p.vz=0;
 p.speed=Math.hypot(p.vx,p.vz);
 if(!Number.isFinite(p.facing))p.facing=Math.PI;
 if(len&&p.speed>.02){
  const target=Math.atan2(targetX,targetZ),delta=Math.atan2(Math.sin(target-p.facing),Math.cos(target-p.facing));
  p.facing+=delta*(1-Math.exp(-step/0.065));
 }
}
export function buildingCenter(b,defs){const d=defs[b.type];return {x:(b.x+((b.rotation?d.d:d.w)-1)/2)*2,z:(b.z+((b.rotation?d.w:d.d)-1)/2)*2};}
export function nearestBlueprint(state,defs,range=5){
 let found=null,best=range;
 for(const b of state.buildings){if(b.built)continue;const c=buildingCenter(b,defs),dist=Math.hypot(c.x-state.player.x,c.z-state.player.z);if(dist<best){found=b;best=dist;}}
 return found;
}
