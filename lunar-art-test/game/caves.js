// Pure seeded cave topology and line-of-sight; no rendering dependencies.
const cache=new Map();
export const CAVE_CELL=2;
/** Each entrance leads down through three zones joined by shafts. */
export const CAVE_ZONES=3;
export const ZONE_NAMES=['Upper caves','The Hollows','The Deep'];
export const caveKey=(x,z)=>`${x},${z}`;
function random(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}

/**
 * One zone of one cave. `cells` is where the player can walk; `open` is everything carved (walls wrap it);
 * `sight` is what light passes through (open minus spires and pillars, so you can see across chasms).
 * Each tile carries a `type`: floor, ice, vent, chasm, bridge, spire, pillar, shaftDown or shaftUp.
 */
export function caveLayout(seed,id=0,zone=0){
 const key=`${seed}:${id}:${zone}`;if(cache.has(key))return cache.get(key);
 const rng=random(seed+id*8191+45127+zone*104729),cells=new Set(),rooms=[],main=[];
 const carve=(x,z)=>{if(Math.abs(x)<=24&&z>=-1&&z<=55)cells.add(caveKey(x,z));};
 const room=(x,z,rx,rz)=>{rooms.push({x,z,rx,rz});for(let dx=-rx;dx<=rx;dx++)for(let dz=-rz;dz<=rz;dz++)if((dx*dx/(rx*rx)+dz*dz/(rz*rz))<1.12)carve(x+dx,z+dz);};
 function passage(ax,az,bx,bz,width=1){let x=ax,z=az;while(x!==bx||z!==bz){for(let dx=-width;dx<=width;dx++)for(let dz=-width;dz<=width;dz++)carve(x+dx,z+dz);if(x!==bx&&(z===bz||rng()<.5))x+=Math.sign(bx-x);else z+=Math.sign(bz-z);}carve(bx,bz);}
 let x=0,z;
 // The upper zone opens onto the surface; deeper zones begin around the foot of the shaft from above.
 if(zone===0){for(let zz=-1;zz<=8;zz++)for(let xx=-1;xx<=1;xx++)carve(xx,zz);z=8;room(x,z,3,3);}
 else{z=3;room(x,z,3,3);}
 main.push(rooms[rooms.length-1]);
 const steps=zone===0?7:8+zone;
 for(let i=0;i<steps;i++){
  const nx=Math.max(-16,Math.min(16,x+Math.floor(rng()*15)-7)),nz=Math.min(49,z+5+Math.floor(rng()*3));
  passage(x,z,nx,nz,rng()<.3?1:0);room(nx,nz,2+Math.floor(rng()*3),2+Math.floor(rng()*3));main.push(rooms[rooms.length-1]);
  const side=rng()<.5?-1:1,bx=Math.max(-21,Math.min(21,nx+side*(6+Math.floor(rng()*6)))),bz=nz-2+Math.floor(rng()*5);
  passage(nx,nz,bx,bz,0);room(bx,bz,2+Math.floor(rng()*2),2+Math.floor(rng()*2));
  x=nx;z=nz;
 }
 // A loop around one room rewards exploration without making every branch a dead end.
 if(rooms.length>7){const a=rooms[3],b=rooms[7];passage(a.x,a.z,b.x,b.z,0);}
 const last=main[main.length-1];
 const layout={id,zone,open:new Set(cells),cells,rooms,
  start:zone===0?{x:0,z:0}:{x:0,z:1},
  up:zone>0?{x:0,z:0}:null,
  down:zone<CAVE_ZONES-1?{x:last.x,z:last.z}:null,
  // The deepest chamber of the last zone is reserved for what the caves are hiding.
  heart:zone===CAVE_ZONES-1?{x:last.x,z:last.z}:null};
 decorate(layout,random(seed*31+id*977+zone*7919+3));
 layout.tiles=[...layout.open].map(key=>{const [x,z]=key.split(',').map(Number);return {key,x,z,type:layout.types.get(key)??'floor'};});
 cache.set(key,layout);return layout;
}

/** Seeded features per room, each kept only if every walkable cell stays reachable from the start. */
function decorate(layout,rng){
 const {cells,rooms,zone}=layout,types=new Map(),blocked=new Set();
 const spires=[],pillars=[],crystals=[],glyphs=[],vents=[];
 const protect=new Set();
 const guard=(p,r=1)=>{if(!p)return;for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)protect.add(caveKey(p.x+dx,p.z+dz));};
 guard(layout.start,1);guard(layout.up,1);guard(layout.down,1);guard(layout.heart,2);
 if(zone===0)for(let z=-1;z<=11;z++)for(let x=-3;x<=3;x++)protect.add(caveKey(x,z));
 if(layout.down)types.set(caveKey(layout.down.x,layout.down.z),'shaftDown');
 if(layout.up)types.set(caveKey(layout.up.x,layout.up.z),'shaftUp');
 const startKey=caveKey(layout.start.x,layout.start.z);
 function connected(){
  const walk=k=>cells.has(k)&&!blocked.has(k),seen=new Set([startKey]),queue=[startKey];
  while(queue.length){const [x,z]=queue.pop().split(',').map(Number);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const k=caveKey(x+dx,z+dz);if(walk(k)&&!seen.has(k)){seen.add(k);queue.push(k);}}}
  let total=0;for(const k of cells)if(!blocked.has(k))total++;return seen.size===total;
 }
 function tryBlock(keys,type){
  if(keys.some(k=>!cells.has(k)||blocked.has(k)||protect.has(k)||types.has(k)))return false;
  keys.forEach(k=>blocked.add(k));
  if(!connected()){keys.forEach(k=>blocked.delete(k));return false;}
  keys.forEach(k=>types.set(k,type));return true;
 }
 const interior=room=>{const out=[];for(let dx=-room.rx+1;dx<=room.rx-1;dx++)for(let dz=-room.rz+1;dz<=room.rz-1;dz++){const k=caveKey(room.x+dx,room.z+dz);if(cells.has(k)&&!protect.has(k))out.push({x:room.x+dx,z:room.z+dz,key:k});}return out;};
 const pick=list=>list[Math.floor(rng()*list.length)];
 const boundary=room=>{const out=[];for(let dx=-room.rx;dx<=room.rx;dx++)for(let dz=-room.rz;dz<=room.rz;dz++){const x=room.x+dx,z=room.z+dz;if(!cells.has(caveKey(x,z)))continue;for(const [ex,ez] of [[1,0],[-1,0],[0,1],[0,-1]])if(!layout.open.has(caveKey(x+ex,z+ez)))out.push({x,z,dx:ex,dz:ez});}return out;};
 rooms.forEach((room,i)=>{
  if(i===0)return;
  const deep=zone/(2),r=rng();
  const theme=r<.3?'spires':r<.48?'crystal':r<.6?'ice':r<.72+.1*deep?'ruin':r<.86?'vents':'chasm';
  const inside=interior(room);if(!inside.length)return;
  if(theme==='spires'||(theme==='chasm'&&room.rx<3)){
   let n=2+Math.floor(rng()*4);
   for(let k=0;k<12&&n>0;k++){const c=pick(inside);if(tryBlock([c.key],'spire')){spires.push({x:c.x,z:c.z,h:2.4+rng()*2.6,r:.55+rng()*.4,lean:(rng()-.5)*.2});n--;}}
  }else if(theme==='chasm'){
   // A crack across the room, crossed only on one narrow bridge.
   const row=[];for(let dx=-room.rx;dx<=room.rx;dx++){const k=caveKey(room.x+dx,room.z);if(cells.has(k)&&!protect.has(k))row.push({x:room.x+dx,z:room.z,key:k});}
   if(row.length>=4){const bridge=row[1+Math.floor(rng()*(row.length-2))];if(tryBlock(row.filter(c=>c!==bridge).map(c=>c.key),'chasm'))types.set(bridge.key,'bridge');}
  }else if(theme==='crystal'){
   const walls=boundary(room),n=2+Math.floor(rng()*3),hue=zone===2?'violet':rng()<.6?'cyan':'violet';
   for(let k=0;k<n&&walls.length;k++){const w=walls.splice(Math.floor(rng()*walls.length),1)[0];crystals.push({...w,hue,size:.7+rng()*.6});}
   if(rng()<.5){const c=pick(inside);if(tryBlock([c.key],'spire'))crystals.push({x:c.x,z:c.z,dx:0,dz:0,hue,size:1.3});}
  }else if(theme==='ice'){
   const center=pick(inside),radius=1+Math.floor(rng()*2);
   for(const c of inside)if(Math.hypot(c.x-center.x,c.z-center.z)<=radius+.3&&!types.has(c.key))types.set(c.key,'ice');
  }else if(theme==='ruin'){
   for(const c of inside)if((c.x-room.x)%2===0&&(c.z-room.z)%2===0&&(c.x!==room.x||c.z!==room.z)&&tryBlock([c.key],'pillar'))pillars.push({x:c.x,z:c.z});
   const walls=boundary(room);for(let k=0;k<3&&walls.length;k++)glyphs.push(walls.splice(Math.floor(rng()*walls.length),1)[0]);
  }else if(theme==='vents'){
   const n=1+Math.floor(rng()*3);for(let k=0;k<n;k++){const c=pick(inside);if(!types.has(c.key)){types.set(c.key,'vent');vents.push({x:c.x,z:c.z});}}
  }
 });
 for(const k of blocked)cells.delete(k);
 layout.sight=new Set([...layout.open].filter(k=>!['spire','pillar'].includes(types.get(k))));
 Object.assign(layout,{types,spires,pillars,crystals,glyphs,vents});
}

export function caveWalkable(seed,id,x,z,radius=.3,zone=0){const cave=caveLayout(seed,id,zone);return [[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]].every(([dx,dz])=>cave.cells.has(caveKey(Math.round((x+dx)/CAVE_CELL),Math.round((z+dz)/CAVE_CELL))));}
/** Light reaches a cell if every cell before it on the line lets light through; the cell itself may be solid. */
export function lineVisible(cave,x0,z0,x1,z1){
 const sight=cave.sight??cave.cells;
 let x=x0,z=z0,dx=Math.abs(x1-x0),dz=Math.abs(z1-z0),sx=x0<x1?1:-1,sz=z0<z1?1:-1,error=dx-dz;
 while(true){if(x===x1&&z===z1)return true;if(!sight.has(caveKey(x,z)))return false;const e=2*error;if(e>-dz){error-=dz;x+=sx;}if(e<dx){error+=dx;z+=sz;}}
}
/** Sight underground: everything in line of sight within SIGHT_RADIUS, and further along the headlamp beam. */
export const SIGHT_RADIUS=14,BEAM_RANGE=20;
export function visibleCaveCells(cave,x,z,facing){
 const cx=Math.round(x/CAVE_CELL),cz=Math.round(z/CAVE_CELL),visible=new Set(),fx=Math.sin(facing),fz=Math.cos(facing);
 for(const cell of cave.tiles){const dx=cell.x*CAVE_CELL-x,dz=cell.z*CAVE_CELL-z,distance=Math.hypot(dx,dz);if(distance>BEAM_RANGE)continue;if(distance>SIGHT_RADIUS&&(dx*fx+dz*fz)/distance<.55)continue;if(lineVisible(cave,cx,cz,cell.x,cell.z))visible.add(cell.key);}
 return visible;
}
