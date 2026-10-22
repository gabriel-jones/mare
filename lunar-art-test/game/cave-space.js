import {terrainData,surfaceHeightAt} from './terrain.js';
export function caveOrigin(seed,id){const c=terrainData(seed).caves[id];return {...c,y:surfaceHeightAt(seed,c.x,c.z)};}
export function caveToWorld(seed,id,x,z){const c=caveOrigin(seed,id),s=Math.sin(c.angle),k=Math.cos(c.angle);return {x:c.x+x*k+z*s,y:c.y,z:c.z-x*s+z*k};}
export function worldVectorToCave(seed,id,x,z){const {angle}=terrainData(seed).caves[id],s=Math.sin(angle),k=Math.cos(angle);return {x:x*k-z*s,z:x*s+z*k};}
