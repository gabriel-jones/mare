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
 * `sight` is what light passes through (everything carved: you see across chasms, past formations and through silk).
 * Each tile carries a `type`: floor, ice, vent, toxic, chasm, bridge, spire, shaftDown or shaftUp. The infestation
 * (nests, silk, webs, growths, goo) is listed alongside; whether a nest or silk wall is burnt out lives in the save.
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
 spinSilk(layout,random(seed*13+id*2027+zone*431+5));
 layout.tiles=[...layout.open].map(key=>{const [x,z]=key.split(',').map(Number);return {key,x,z,type:layout.types.get(key)??'floor'};});
 cache.set(key,layout);return layout;
}

/** The infestation thickens with depth: nests per zone, silk walls sealing side pockets, webs strung in corners. */
export const INFESTATION=Object.freeze({nests:[2,4,6],silk:[1,2,3],webs:[3,6,10],growths:[2,5,9]});

/** Seeded features per room, each kept only if every walkable cell stays reachable from the start. */
function decorate(layout,rng){
 const {cells,rooms,zone}=layout,types=new Map(),blocked=new Set();
 const spires=[],crystals=[],vents=[],nests=[],webs=[],growths=[],goo=[];
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
  const theme=r<.3?'spires':r<.48?'crystal':r<.6?'ice':r<.72+.1*deep?'hive':r<.86?'vents':'chasm';room.theme=theme;
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
  }else if(theme==='vents'){
   const n=1+Math.floor(rng()*3);for(let k=0;k<n;k++){const c=pick(inside);if(!types.has(c.key)){types.set(c.key,'vent');vents.push({x:c.x,z:c.z});}}
  }
 });
 for(const k of blocked)if(types.get(k)!=='spire')cells.delete(k);
 layout.sight=new Set(layout.open);
 // Nests are burrows in a straight run of wall, three cells long, with room to stand in front. Hive rooms get theirs
 // first; the rest of the zone's quota goes wherever a wall allows, a few cells apart.
 const isOpen=(x,z)=>layout.open.has(caveKey(x,z)),walkable=(x,z)=>cells.has(caveKey(x,z));
 const flatWall=w=>{const lx=w.dz,lz=w.dx,k=caveKey(w.x,w.z);
  return !protect.has(k)&&!types.has(k)&&walkable(w.x-w.dx,w.z-w.dz)&&[-1,1].every(s=>walkable(w.x+lx*s,w.z+lz*s)&&!isOpen(w.x+lx*s+w.dx,w.z+lz*s+w.dz));};
 const roomWalls=rooms.slice(1).map(room=>({room,walls:boundary(room).filter(flatWall)}));
 const nestOk=w=>!nests.some(n=>Math.hypot(n.x-w.x,n.z-w.z)<4)&&!crystals.some(c=>c.x===w.x&&c.z===w.z);
 const placeNest=w=>{nests.push({x:w.x,z:w.z,dx:w.dx,dz:w.dz,key:`nest@${w.x},${w.z},${w.dx},${w.dz}`});};
 for(const {room,walls} of roomWalls)if(room.theme==='hive')for(let k=0;k<4&&walls.length&&nests.length<INFESTATION.nests[zone];k++){const w=walls.splice(Math.floor(rng()*walls.length),1)[0];if(nestOk(w)){placeNest(w);break;}}
 const spare=roomWalls.flatMap(r=>r.walls);
 for(let k=0;k<60&&nests.length<INFESTATION.nests[zone]&&spare.length;k++){const w=spare.splice(Math.floor(rng()*spare.length),1)[0];if(nestOk(w))placeNest(w);}
 // Goo spills from every nest across the floor in front of it, and pools in hive rooms.
 for(const n of nests)goo.push({x:n.x*CAVE_CELL+n.dx*.3,z:n.z*CAVE_CELL+n.dz*.3,r:1.6+rng()*.6,seed:rng()});
 for(const room of rooms)if(room.theme==='hive'){const inside=interior(room);for(let k=0;k<2&&inside.length;k++){const c=pick(inside);goo.push({x:c.x*CAVE_CELL+(rng()-.5),z:c.z*CAVE_CELL+(rng()-.5),r:.9+rng()*.9,seed:rng()});}}
 // Webs strung across inside corners, hive rooms first.
 const corners=[];
 for(const room of [...rooms.filter(r=>r.theme==='hive'),...rooms.filter(r=>r.theme!=='hive')])for(let dx=-room.rx;dx<=room.rx;dx++)for(let dz=-room.rz;dz<=room.rz;dz++){
  const x=room.x+dx,z=room.z+dz;if(!walkable(x,z)||protect.has(caveKey(x,z)))continue;
  for(const [ax,az,bx,bz] of [[1,0,0,1],[0,1,-1,0],[-1,0,0,-1],[0,-1,1,0]])if(!isOpen(x+ax,z+az)&&!isOpen(x+bx,z+bz)&&!corners.some(c=>c.x===x&&c.z===z))corners.push({x,z,ax,az,bx,bz,hive:room.theme==='hive'});
 }
 for(let k=0;k<corners.length&&webs.length<INFESTATION.webs[zone];k++){const c=corners[k];if(c.hive||rng()<.35)webs.push({x:c.x,z:c.z,ax:c.ax,az:c.az,bx:c.bx,bz:c.bz,size:.8+rng()*.6,seed:rng()});}
 // Coral: branching growths at the foot of a wall, near the nests where there are any.
 const footholds=boundary({x:0,z:27,rx:30,rz:30}).filter(w=>!nests.some(n=>n.x===w.x&&n.z===w.z&&n.dx===w.dx&&n.dz===w.dz)&&!crystals.some(c=>c.x===w.x&&c.z===w.z));
 footholds.sort((a,b)=>Math.min(...nests.map(n=>Math.hypot(n.x-a.x,n.z-a.z)),99)-Math.min(...nests.map(n=>Math.hypot(n.x-b.x,n.z-b.z)),99)+(rng()-.5)*6);
 for(let k=0;k<footholds.length&&growths.length<INFESTATION.growths[zone];k++){const w=footholds[k];if(!protect.has(caveKey(w.x,w.z))&&!growths.some(g=>Math.hypot(g.x-w.x,g.z-w.z)<2))growths.push({...w,size:.7+rng()*.7,seed:rng()});}
 // Formations are about .8 across at scale 1, flaring at the foot; the trunk is what stops you. A nest's mound swells
 // half a cell out of its wall.
 const solids=[...spires.map(s=>({x:s.x*CAVE_CELL,z:s.z*CAVE_CELL,r:.62*s.r})),...crystals.filter(c=>!c.dx&&!c.dz).map(c=>({x:c.x*CAVE_CELL,z:c.z*CAVE_CELL,r:.45})),
  ...nests.map(n=>({x:n.x*CAVE_CELL+n.dx*.6,z:n.z*CAVE_CELL+n.dz*.6,r:.5}))];
 Object.assign(layout,{types,spires,crystals,vents,nests,webs,growths,goo,solids,protect});
}

/**
 * Silk walls seal the one-cell corridors into side pockets that hold something (a find or a nest). Only the player is
 * stopped, until a flare burns through; the way between the shafts and to the heart is never sealed.
 */
function spinSilk(layout,rng){
 const {cells,types,protect}=layout,silk=[];
 const startKey=caveKey(layout.start.x,layout.start.z);
 const reach=blocked=>{const seen=new Set([startKey]),queue=[startKey];
  while(queue.length){const [x,z]=queue.pop().split(',').map(Number);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const k=caveKey(x+dx,z+dz);if(cells.has(k)&&!blocked.has(k)&&!seen.has(k)){seen.add(k);queue.push(k);}}}
  return seen;};
 const must=[layout.up,layout.down,layout.heart].filter(Boolean).map(p=>caveKey(p.x,p.z));
 const worth=[...layout.loot.map(l=>caveKey(l.x,l.z)),...layout.nests.map(n=>caveKey(n.x,n.z))];
 const loot=new Set(layout.loot.map(l=>caveKey(l.x,l.z)));
 const corridor=[...cells].filter(k=>{if(protect.has(k)||types.has(k)||loot.has(k))return false;const [x,z]=k.split(',').map(Number),o=(a,b)=>cells.has(caveKey(x+a,z+b));
  return (o(1,0)&&o(-1,0)&&!o(0,1)&&!o(0,-1))||(o(0,1)&&o(0,-1)&&!o(1,0)&&!o(-1,0));}).sort((a,b)=>rng()-.5);
 const blocked=new Set();let base=reach(blocked);
 for(const k of corridor){
  if(silk.length>=INFESTATION.silk[layout.zone])break;
  if(!base.has(k))continue;
  blocked.add(k);const after=reach(blocked);
  const sealed=[...base].filter(c=>!after.has(c)&&c!==k);
  if(sealed.length<5||must.some(m=>!after.has(m))||!worth.some(w=>sealed.includes(w))){blocked.delete(k);continue;}
  const [x,z]=k.split(',').map(Number);silk.push({x,z,axis:cells.has(caveKey(x+1,z))?'x':'z',key:`silk@${x},${z}`,seed:rng()});base=after;
 }
 layout.silk=silk;
}

/**
 * What the caves give back, each entry taken once: titanium seams in the walls (richer deeper down), the rare-earth
 * crystals themselves, the old builders' machinery the hives have swallowed, one reactor schematic in every second zone
 * and the heart at the bottom. `key` names an entry within its zone.
 */
function placeLoot(layout,last,rng){
 const {cells,rooms,zone,types}=layout,loot=[],used=new Set();
 const free=k=>cells.has(k)&&!['shaftDown','shaftUp','vent','bridge','spire'].includes(types.get(k))&&!used.has(k);
 const add=(kind,x,z,dx=0,dz=0,extra={})=>{used.add(caveKey(x,z));loot.push({key:`${kind}@${x},${z},${dx},${dz}`,kind,x,z,dx,dz,...extra});};
 const walls=room=>{const out=[];for(let dx=-room.rx;dx<=room.rx;dx++)for(let dz=-room.rz;dz<=room.rz;dz++){const x=room.x+dx,z=room.z+dz;if(!free(caveKey(x,z)))continue;for(const [ex,ez] of [[1,0],[-1,0],[0,1],[0,-1]])if(!layout.open.has(caveKey(x+ex,z+ez)))out.push({x,z,dx:ex,dz:ez});}return out;};
 const inRoom=(room,c)=>Math.abs(c.x-room.x)<=room.rx&&Math.abs(c.z-room.z)<=room.rz;
 const others=rooms.slice(1);
 if(layout.heart)used.add(caveKey(layout.heart.x,layout.heart.z));
 for(let n=[2,4,5][zone]??5,k=0;n>0&&k<40;k++){const room=others[Math.floor(rng()*others.length)],w=walls(room);if(!w.length)continue;const c=w[Math.floor(rng()*w.length)];add('ore',c.x,c.z,c.dx,c.dz,{amount:3+zone*2});n--;}
 // The upper zone's crystals are dull and brittle; harvestable rare earth starts in the Hollows.
 if(zone>0)layout.crystals.forEach(c=>{used.add(caveKey(c.x,c.z));loot.push({key:`crystal@${c.x},${c.z},${c.dx},${c.dz}`,kind:'crystal',x:c.x,z:c.z,dx:c.dx,dz:c.dz,amount:1+zone});});
 for(const room of rooms.filter(r=>r.theme==='hive'))if(free(caveKey(room.x,room.z)))add('artifact',room.x,room.z);
 // Below the surface there is always something to bring back.
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
