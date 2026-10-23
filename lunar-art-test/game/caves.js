// Pure seeded cave topology and line-of-sight; no rendering dependencies.
const cache=new Map();
export const CAVE_CELL=2;
export const caveKey=(x,z)=>`${x},${z}`;
function random(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
export function caveLayout(seed,id=0){
 const key=`${seed}:${id}`;if(cache.has(key))return cache.get(key);
 const rng=random(seed+id*8191+45127),cells=new Set(),rooms=[];
 const carve=(x,z)=>{if(Math.abs(x)<=24&&z>=-1&&z<=55)cells.add(caveKey(x,z));};
 const room=(x,z,rx,rz)=>{rooms.push({x,z,rx,rz});for(let dx=-rx;dx<=rx;dx++)for(let dz=-rz;dz<=rz;dz++)if((dx*dx/(rx*rx)+dz*dz/(rz*rz))<1.12)carve(x+dx,z+dz);};
 function passage(ax,az,bx,bz,width=1){let x=ax,z=az;while(x!==bx||z!==bz){for(let dx=-width;dx<=width;dx++)for(let dz=-width;dz<=width;dz++)carve(x+dx,z+dz);if(x!==bx&&(z===bz||rng()<.5))x+=Math.sign(bx-x);else z+=Math.sign(bz-z);}carve(bx,bz);}
 for(let z=-1;z<=8;z++)for(let x=-1;x<=1;x++)carve(x,z);
 let x=0,z=8;room(x,z,3,3);
 for(let i=0;i<7;i++){
  const nx=Math.max(-16,Math.min(16,x+Math.floor(rng()*15)-7)),nz=Math.min(49,z+5+Math.floor(rng()*3));
  passage(x,z,nx,nz,rng()<.3?1:0);room(nx,nz,2+Math.floor(rng()*3),2+Math.floor(rng()*3));
  const side=rng()<.5?-1:1,bx=Math.max(-21,Math.min(21,nx+side*(6+Math.floor(rng()*6)))),bz=nz-2+Math.floor(rng()*5);
  passage(nx,nz,bx,bz,0);room(bx,bz,2+Math.floor(rng()*2),2+Math.floor(rng()*2));
  x=nx;z=nz;
 }
 // A loop around one room rewards exploration without making every branch a dead end.
 if(rooms.length>7){const a=rooms[3],b=rooms[7];passage(a.x,a.z,b.x,b.z,0);}
 const tiles=[...cells].map(key=>{const [x,z]=key.split(',').map(Number);return {key,x,z};});
 const layout={id,cells,tiles,rooms};cache.set(key,layout);return layout;
}
export function caveWalkable(seed,id,x,z,radius=.3){const cave=caveLayout(seed,id);return [[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]].every(([dx,dz])=>cave.cells.has(caveKey(Math.round((x+dx)/CAVE_CELL),Math.round((z+dz)/CAVE_CELL))));}
export function lineVisible(cave,x0,z0,x1,z1){
 let x=x0,z=z0,dx=Math.abs(x1-x0),dz=Math.abs(z1-z0),sx=x0<x1?1:-1,sz=z0<z1?1:-1,error=dx-dz;
 while(true){if(!cave.cells.has(caveKey(x,z)))return false;if(x===x1&&z===z1)return true;const e=2*error;if(e>-dz){error-=dz;x+=sx;}if(e<dx){error+=dx;z+=sz;}}
}
/** Sight underground: everything in line of sight within SIGHT_RADIUS, and further along the headlamp beam. */
export const SIGHT_RADIUS=14,BEAM_RANGE=20;
export function visibleCaveCells(cave,x,z,facing){
 const cx=Math.round(x/CAVE_CELL),cz=Math.round(z/CAVE_CELL),visible=new Set(),fx=Math.sin(facing),fz=Math.cos(facing);
 for(const cell of cave.tiles){const dx=cell.x*CAVE_CELL-x,dz=cell.z*CAVE_CELL-z,distance=Math.hypot(dx,dz);if(distance>BEAM_RANGE)continue;if(distance>SIGHT_RADIUS&&(dx*fx+dz*fz)/distance<.55)continue;if(lineVisible(cave,cx,cz,cell.x,cell.z))visible.add(cell.key);}
 return visible;
}
