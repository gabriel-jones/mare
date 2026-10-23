import {terrainData,surfaceHeightAt} from './terrain.js';
/** Deeper zones sit far below the surface, so the terrain never comes between them and the camera. */
export const ZONE_DROP=200;
export function caveOrigin(seed,id,zone=0){const c=terrainData(seed).caves[id];return {...c,y:surfaceHeightAt(seed,c.x,c.z)-zone*ZONE_DROP};}
export function caveToWorld(seed,id,x,z,zone=0){const c=caveOrigin(seed,id,zone),s=Math.sin(c.angle),k=Math.cos(c.angle);return {x:c.x+x*k+z*s,y:c.y,z:c.z-x*s+z*k};}
export function worldVectorToCave(seed,id,x,z){const {angle}=terrainData(seed).caves[id],s=Math.sin(angle),k=Math.cos(angle);return {x:x*k-z*s,z:x*s+z*k};}
