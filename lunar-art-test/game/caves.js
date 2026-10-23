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
 * `sight` is what light passes through (open minus pillars, so you can see across chasms and past formations).
 * Each tile carries a `type`: floor, ice, vent, chasm, bridge, spire, pillar, shaftDown or shaftUp.
 * Spire cells stay walkable: only the formation itself is solid, a circle in `solids` (world x, z, radius), so there is
 * room to squeeze between two neighbours.
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
 placeLoot(layout,last,random(seed*17+id*3571+zone*613+11));
 poison(layout);
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
  const theme=r<.3?'spires':r<.48?'crystal':r<.6?'ice':r<.72+.1*deep?'ruin':r<.86?'vents':'chasm';room.theme=theme;
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
 for(const k of blocked)if(types.get(k)!=='spire')cells.delete(k);
 layout.sight=new Set([...layout.open].filter(k=>types.get(k)!=='pillar'));
 // Formations are about .8 across at scale 1, flaring at the foot; the trunk is what stops you.
 const solids=[...spires.map(s=>({x:s.x*CAVE_CELL,z:s.z*CAVE_CELL,r:.62*s.r})),...crystals.filter(c=>!c.dx&&!c.dz).map(c=>({x:c.x*CAVE_CELL,z:c.z*CAVE_CELL,r:.45}))];
 Object.assign(layout,{types,spires,pillars,crystals,glyphs,vents,solids});
}

/**
 * What the caves give back, each entry taken once: titanium seams in the walls (richer deeper down), the rare-earth
 * crystals themselves, artifacts left in ruins, glyphs that tell the story, one reactor schematic in every second
 * zone and the heart at the bottom. `key` names an entry within its zone.
 */
function placeLoot(layout,last,rng){
 const {cells,rooms,zone,types}=layout,loot=[],used=new Set();
 const free=k=>cells.has(k)&&!['shaftDown','shaftUp','vent','bridge','spire'].includes(types.get(k))&&!used.has(k);
 const add=(kind,x,z,dx=0,dz=0,extra={})=>{used.add(caveKey(x,z));loot.push({key:`${kind}@${x},${z},${dx},${dz}`,kind,x,z,dx,dz,...extra});};
 const walls=room=>{const out=[];for(let dx=-room.rx;dx<=room.rx;dx++)for(let dz=-room.rz;dz<=room.rz;dz++){const x=room.x+dx,z=room.z+dz;if(!free(caveKey(x,z)))continue;for(const [ex,ez] of [[1,0],[-1,0],[0,1],[0,-1]])if(!layout.open.has(caveKey(x+ex,z+ez)))out.push({x,z,dx:ex,dz:ez});}return out;};
 const inRoom=(room,c)=>Math.abs(c.x-room.x)<=room.rx&&Math.abs(c.z-room.z)<=room.rz;
 const others=rooms.slice(1);
 for(let n=[2,4,5][zone]??5,k=0;n>0&&k<40;k++){const room=others[Math.floor(rng()*others.length)],w=walls(room);if(!w.length)continue;const c=w[Math.floor(rng()*w.length)];add('ore',c.x,c.z,c.dx,c.dz,{amount:3+zone*2});n--;}
 // The upper zone's crystals are dull and brittle; harvestable rare earth starts in the Hollows.
 if(zone>0)layout.crystals.forEach(c=>{used.add(caveKey(c.x,c.z));loot.push({key:`crystal@${c.x},${c.z},${c.dx},${c.dz}`,kind:'crystal',x:c.x,z:c.z,dx:c.dx,dz:c.dz,amount:1+zone});});
 for(const room of rooms.filter(r=>r.theme==='ruin')){
  if(free(caveKey(room.x,room.z)))add('artifact',room.x,room.z);
  const glyph=layout.glyphs.find(g=>inRoom(room,g));if(glyph)loot.push({key:`tablet@${glyph.x},${glyph.z},${glyph.dx},${glyph.dz}`,kind:'tablet',x:glyph.x,z:glyph.z,dx:glyph.dx,dz:glyph.dz});
 }
 // Every zone tells some of the story, and below the surface there is always something to bring back.
 if(!loot.some(l=>l.kind==='tablet')){const room=others[Math.floor(rng()*others.length)],w=walls(room);if(w.length){const g=w[Math.floor(rng()*w.length)];layout.glyphs.push(g);loot.push({key:`tablet@${g.x},${g.z},${g.dx},${g.dz}`,kind:'tablet',x:g.x,z:g.z,dx:g.dx,dz:g.dz});}}
 if(zone>0&&!loot.some(l=>l.kind==='artifact'))for(let k=0;k<20;k++){const room=others[Math.floor(rng()*others.length)];if(free(caveKey(room.x,room.z))){add('artifact',room.x,room.z);break;}}
 if(zone===1){const spot=[...cells].map(k=>k.split(',').map(Number)).filter(([x,z])=>inRoom(last,{x,z})&&Math.hypot(x-last.x,z-last.z)>=2&&free(caveKey(x,z))).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(spot.length){const [x,z]=spot[Math.floor(rng()*spot.length)];add('blueprint',x,z);}}
 if(layout.heart)add('heart',layout.heart.x,layout.heart.z);
 layout.loot=[...new Map(loot.map(l=>[l.key,l])).values()];
}

/** Gas vents seep into the floor around them: toxic pools that hurt to stand in, but never block the way. */
function poison(layout){
 const {types,cells}=layout,keep=new Set(layout.loot.map(l=>caveKey(l.x,l.z)));
 for(const p of [layout.start,layout.up,layout.down,layout.heart])if(p)for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)keep.add(caveKey(p.x+dx,p.z+dz));
 for(const v of layout.vents)for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
  const k=caveKey(v.x+dx,v.z+dz),h=Math.sin((v.x+dx)*12.9898+(v.z+dz)*78.233)*43758.5453;
  if(cells.has(k)&&!types.has(k)&&!keep.has(k)&&h-Math.floor(h)<.7)types.set(k,'toxic');
 }
}

export function caveWalkable(seed,id,x,z,radius=.3,zone=0){return cavePassable(caveLayout(seed,id,zone),x,z,radius);}
/** Whether a body of `radius` fits at world (x, z): on walkable cells and clear of every formation. */
export function cavePassable(cave,x,z,radius=.3){
 return [[-radius,-radius],[radius,-radius],[-radius,radius],[radius,radius]].every(([dx,dz])=>cave.cells.has(caveKey(Math.round((x+dx)/CAVE_CELL),Math.round((z+dz)/CAVE_CELL))))
  &&!(cave.solids??[]).some(s=>Math.hypot(x-s.x,z-s.z)<s.r+radius);
}
/** Light reaches a cell if every cell before it on the line lets light through; the cell itself may be solid. */
export function lineVisible(cave,x0,z0,x1,z1){
 const sight=cave.sight??cave.cells;
 let x=x0,z=z0,dx=Math.abs(x1-x0),dz=Math.abs(z1-z0),sx=x0<x1?1:-1,sz=z0<z1?1:-1,error=dx-dz;
 while(true){if(x===x1&&z===z1)return true;if(!sight.has(caveKey(x,z)))return false;const e=2*error;if(e>-dz){error-=dz;x+=sx;}if(e<dx){error+=dx;z+=sz;}}
}
/** Sight underground: everything in line of sight within SIGHT_RADIUS, and further along the headlamp beam. */
export const SIGHT_RADIUS=14,BEAM_RANGE=20;
export function visibleCaveCells(cave,x,z,facing,lights=[]){
 const cx=Math.round(x/CAVE_CELL),cz=Math.round(z/CAVE_CELL),visible=new Set(),fx=Math.sin(facing),fz=Math.cos(facing);
 for(const cell of cave.tiles){const dx=cell.x*CAVE_CELL-x,dz=cell.z*CAVE_CELL-z,distance=Math.hypot(dx,dz);if(distance>BEAM_RANGE)continue;if(distance>SIGHT_RADIUS&&(dx*fx+dz*fz)/distance<.55)continue;if(lineVisible(cave,cx,cz,cell.x,cell.z))visible.add(cell.key);}
 // Thrown flares light their own pool, wherever the player is looking.
 for(const l of lights){const lx=Math.round(l.x/CAVE_CELL),lz=Math.round(l.z/CAVE_CELL);for(const cell of cave.tiles)if(!visible.has(cell.key)&&Math.hypot(cell.x*CAVE_CELL-l.x,cell.z*CAVE_CELL-l.z)<=l.r&&lineVisible(cave,lx,lz,cell.x,cell.z))visible.add(cell.key);}
 return visible;
}
