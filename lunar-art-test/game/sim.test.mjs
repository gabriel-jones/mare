import test from 'node:test';
import {movePlayer,buildingCenter,nearestBlueprint,resetLocomotion,interpolatePose,WALK_SPEED,RUN_SPEED} from './controller.js';
import assert from 'node:assert/strict';
import {createState,DEFS,footprint,validatePlacement,placeBlueprint,construct,cancelBlueprint,tick,serialize,deserialize} from './sim.js';
import {count,createInventory} from './inventory.js';
function complete(state,type,x,z,rotation=0) {
  const result=placeBlueprint(state,type,x,z,rotation);
  assert.equal(result.ok,true,result.reason);
  const cells=footprint(type,x,z,rotation);
  state.player.x=x*2-1.5;
  state.player.z=cells.reduce((s,c)=>s+c.z*2,0)/cells.length;
  assert.equal(construct(state,result.id,DEFS[type].buildTime).ok,true);
  return result.id;
}
test('rotated footprints, boundaries and reserved pad validate every occupied cell',()=>{
  const s=createState();
  assert.deepEqual(footprint('battery',0,0,1),[{x:0,z:0},{x:1,z:0}]);
  assert.equal(validatePlacement(s,'solar',58,0).ok,false);
  assert.equal(validatePlacement(s,'solar',-5,-3).ok,false);
  assert.equal(validatePlacement(s,'battery',58,58,1).ok,false);
  assert.equal(validatePlacement(s,'lamp',0,0).ok,true);
  assert.equal(validatePlacement(s,'solar',0.5,0).ok,false);
});
test('placement spends once, reserves space, and partial cancellation refunds exactly once',()=>{
  const s=createState(), original=structuredClone(s.inventory);
  const p=placeBlueprint(s,'solar',0,0);
  assert.equal(count(s.inventory,'metal'),count(original,'metal')-DEFS.solar.cost.metal);
  assert.equal(placeBlueprint(s,'lamp',1,1).ok,false);
  s.player.x=-1.5;s.player.z=1;
  construct(s,p.id,1);
  assert.equal(cancelBlueprint(s,p.id).ok,true);
  assert.deepEqual(s.inventory,original);
  assert.equal(cancelBlueprint(s,p.id).ok,false);
  assert.deepEqual(s.inventory,original);
  s.inventory=createInventory({silicon:100});
  assert.equal(placeBlueprint(s,'solar',0,0).ok,false);
  assert.equal(s.buildings.length,0);
});
test('construction requires proximity and finished structures cannot refund',()=>{
  const s=createState(),p=placeBlueprint(s,'habitat',5,5);
  assert.equal(construct(s,p.id,20).ok,false);
  assert.equal(s.buildings[0].progress,0);
  s.player.x=12.5;s.player.z=10;
  assert.equal(construct(s,p.id,-1).ok,false);
  construct(s,p.id,100);
  assert.equal(s.buildings[0].progress,1);
  assert.equal(s.buildings[0].built,true);
  assert.equal(cancelBlueprint(s,p.id).ok,false);
});
test('only finished solar charges batteries; night drains storage then reports outage',()=>{
  const s=createState();
  placeBlueprint(s,'solar',-7,0);
  complete(s,'battery',-5,0);
  complete(s,'habitat',-3,0);
  tick(s,1);
  assert.equal(s.power.generation,0);
  assert.equal(s.power.powered,false);
  const solar=s.buildings[0];s.player.x=-15.5;s.player.z=1;
  construct(s,solar.id,4);
  tick(s,10);
  assert.ok(s.power.stored>0);
  assert.ok(s.power.stored<=180);
  // One habitat square draws 0.25 kW.
  s.time=150; s.power.stored=10;
  tick(s,8);
  assert.equal(s.power.generation,0);
  assert.equal(s.power.stored,8);
  assert.equal(s.power.powered,true);
  tick(s,33);
  assert.equal(s.power.stored,0);
  assert.equal(s.power.powered,false);
});
test('lamps consume only at night, blueprints consume nothing',()=>{
  const s=createState();complete(s,'lamp',0,0);
  tick(s,0);assert.equal(s.power.demand,0);
  s.time=150;tick(s,0);assert.equal(s.power.demand,0.2);
  assert.equal(s.power.powered,false);
});
test('save restores exact simulation and rejects corrupt/overlapping states',()=>{
  const s=createState(42);complete(s,'solar',0,0);complete(s,'battery',3,0);tick(s,2);
  assert.deepEqual(deserialize(serialize(s)),s);
  assert.throws(()=>deserialize('{broken'));
  const bad=JSON.parse(serialize(s));bad.buildings[1].x=0;
  assert.throws(()=>deserialize(JSON.stringify(bad)),/Invalid building/);
  bad.buildings=[];bad.inventory[0].count=-1;
  assert.throws(()=>deserialize(JSON.stringify(bad)),/inventory/);
  assert.throws(()=>deserialize(JSON.stringify({...s,version:99})));
  assert.throws(()=>tick(s,NaN));
});

test('a full battery powers a habitat and light through the complete prototype night',()=>{
  // Four habitat squares at 0.25 kW each.
  const s=createState();complete(s,'battery',0,0);complete(s,'lamp',8,0);
  for(const [x,z] of [[3,0],[4,0],[3,1],[4,1]]){const id=placeBlueprint(s,'habitat',x,z).id;s.player={...s.player,x:7,z:4.5};assert.equal(construct(s,id,9).ok,true);}
  s.time=80;tick(s,0);s.power.stored=180;
  for(let i=0;i<1200;i++) { tick(s,0.1);assert.equal(s.power.powered,true); }
  assert.ok(s.power.stored>35 && s.power.stored<37);
});
test('saves reject unreachable player coordinates and invalid jump heights',()=>{
  for(const player of [{x:126,z:0,y:0},{x:0,z:-126,y:0},{x:0,z:0,y:-1},{x:0,z:0,y:11}]) {
    const s=createState();s.player=player;
    assert.throws(()=>deserialize(serialize(s)),/player position/);
  }
  const s=createState();s.player={x:35,z:-35,y:10,satiety:100};
  assert.deepEqual(deserialize(serialize(s)).player,s.player);
});
test('movement follows isometric screen axes and normalizes diagonal speed',()=>{
  const up=createState();up.player={x:0,z:0,y:0};
  movePlayer(up,0,-1,0.05,DEFS);
  assert.ok(up.player.x<0 && up.player.z<0);
  const right=createState();right.player={x:0,z:0,y:0};
  movePlayer(right,1,0,0.05,DEFS);
  assert.ok(right.player.x>0 && right.player.z<0);
  const diag=createState();diag.player={x:0,z:0,y:0};
  movePlayer(diag,1,1,0.05,DEFS);
  const distance=p=>Math.hypot(p.x,p.z);
  assert.ok(Math.abs(distance(up.player)-distance(diag.player))<1e-10);
  assert.ok(distance(right.player)>0 && distance(right.player)<WALK_SPEED*.05);
  for(let i=0;i<4;i++)movePlayer(right,1,0,0.05,DEFS);
  assert.ok(Math.abs(right.player.speed-WALK_SPEED)<1e-10);
});
test('collision blocks solid structures and ship, but permits blueprints and habitat airlocks',()=>{
  const s=createState();
  const id=complete(s,'solar',0,0);
  s.player={x:-1.4,z:0,y:0};
  movePlayer(s,1,1,0.05,DEFS);assert.equal(s.player.x,-1.4);
  s.buildings[0].built=false;
  movePlayer(s,1,1,0.05,DEFS);assert.ok(s.player.x>-1.4);
  // Room walls are solid; only the airlock square's outward door (+Z at rotation 0) lets the player in.
  const square=(id,type,x,z,rotation=0)=>({id,type,x,z,rotation,progress:1,built:true});
  s.buildings=[square(1,'habitat',0,0),square(2,'habitat',1,0),square(3,'airlock',0,1)];s.player={x:-1.4,z:0,y:0};
  for(let i=0;i<10;i++)movePlayer(s,1,1,0.05,DEFS);assert.ok(s.player.x<-1.4+.1,'side wall blocks');
  s.player={x:0,z:4.5,y:0,vx:0,vz:0};
  for(let i=0;i<20;i++)movePlayer(s,1,-1,0.05,DEFS);assert.ok(s.player.z<2,'airlock admits the player');
  s.player={x:2,z:4.5,y:0,vx:0,vz:0};
  for(let i=0;i<20;i++)movePlayer(s,1,-1,0.05,DEFS);assert.ok(s.player.z>1,'the wall beside the airlock blocks');
  s.buildings=[];s.player={x:-1.92,z:-10,y:0};
  movePlayer(s,1,1,0.05,DEFS);assert.equal(s.player.x,-1.92);assert.equal(s.player.vx,0);
  s.player={x:125,z:0,y:0};movePlayer(s,1,1,0.05,DEFS);assert.equal(s.player.x,125);
});
test('blueprint targeting uses rotated footprint centers and skips completed structures',()=>{
  const s=createState();const first=placeBlueprint(s,'battery',0,0,1).id;
  const second=placeBlueprint(s,'lamp',4,0).id;
  assert.deepEqual(buildingCenter(s.buildings[0],DEFS),{x:1,z:0});
  s.player={x:2,z:0,y:0};assert.equal(nearestBlueprint(s,DEFS).id,first);
  s.buildings[0].built=true;assert.equal(nearestBlueprint(s,DEFS),null);
  s.player.x=7;assert.equal(nearestBlueprint(s,DEFS).id,second);
});

test('construction cannot complete around a player inside future machine collision bounds',()=>{
  const s=createState(),p=placeBlueprint(s,'battery',0,0,1);
  s.player={x:1,z:0,y:0};
  assert.match(construct(s,p.id,100).reason,/Step outside/);
  assert.equal(s.buildings[0].progress,0);
  // The player's collision radius overlaps the footprint even outside its visual edge.
  s.player.x=-1.2;
  assert.equal(construct(s,p.id,100).ok,false);
  s.player.x=-1.5;
  assert.equal(construct(s,p.id,100).ok,true);
  assert.equal(s.buildings[0].built,true);
  const before=s.player.x;
  movePlayer(s,-1,-1,0.05,DEFS);
  assert.ok(s.player.x<before,'the finished machine leaves a safe path away');
  // A room square can be finished from outside its walls.
  const h=placeBlueprint(s,'habitat',4,0);s.player={x:10.5,z:0,y:0};
  assert.equal(construct(s,h.id,100).ok,true);
});


test('movement always runs, ignores a legacy run modifier, and stops without sliding',()=>{
  const s=createState();s.player={x:0,z:0,y:0};
  for(let i=0;i<5;i++)movePlayer(s,0,-1,1/30,DEFS);
  assert.ok(Math.abs(s.player.speed-WALK_SPEED)<1e-8);
  for(let i=0;i<5;i++)movePlayer(s,0,-1,1/30,DEFS,{run:true});
  assert.ok(Math.abs(s.player.speed-RUN_SPEED)<1e-8);
  for(let i=0;i<4;i++)movePlayer(s,0,0,1/30,DEFS);
  assert.ok(s.player.speed<1e-8);
  const stopped={x:s.player.x,z:s.player.z};
  movePlayer(s,0,0,1/30,DEFS);assert.equal(s.player.x,stopped.x);assert.equal(s.player.z,stopped.z);
});
test('render interpolation follows shortest facing arc and reset discards stale motion',()=>{
  const previous={x:0,y:0,z:2,facing:Math.PI-.1};
  const current={x:2,y:1,z:4,facing:-Math.PI+.1,speed:3,animation:'walk'};
  const pose=interpolatePose(previous,current,.5);
  assert.equal(pose.x,1);assert.equal(pose.y,.5);assert.equal(pose.z,3);
  assert.ok(Math.abs(pose.facing-Math.PI)<1e-8);assert.equal(pose.animation,'walk');
  current.vx=4;current.vz=3;resetLocomotion(current);
  assert.equal(current.vx,0);assert.equal(current.vz,0);assert.equal(current.speed,0);
  assert.equal(current.animation,'idle');assert.equal(current.grounded,true);
});


test('terrain is deterministic, level near landing, and rejects cliffs and large rocks',async()=>{
 const {heightAt,terrainData,terrainReason,terrainBlocked}=await import('./terrain.js');
 const s=createState(),data=terrainData(s.seed);
 assert.equal(heightAt(s.seed,0,-10),0);
 assert.equal(terrainReason(s.seed,footprint('solar',0,0)),null);
 assert.deepEqual(terrainData(42),terrainData(42));
 assert.notDeepEqual(terrainData(42),data);
 const rock=data.boulders[0],cell={x:Math.round(rock.x/2),z:Math.round(rock.z/2)};
 assert.match(terrainReason(s.seed,[cell]),/rock/);
 assert.equal(terrainBlocked(s.seed,rock.x,rock.z),true);
 let steep=null;
 for(let x=-18;x<=18&&!steep;x++)for(let z=-18;z<=18;z++){const reason=terrainReason(s.seed,[{x,z}]);if(reason?.includes('steep')){steep={x,z};break;}}
 assert.ok(steep);assert.equal(validatePlacement(s,'lamp',steep.x,steep.z).ok,false);
 // Legacy buildings remain valid even where revised terrain disallows new construction.
 s.buildings=[{id:1,type:'lamp',...steep,rotation:0,progress:1,built:true}];s.nextId=2;
 assert.equal(deserialize(serialize(s)).buildings.length,1);
});

test('building indicators distinguish pooled battery charge, inactive lights and actual outages',async()=>{
 const {buildingStatus}=await import('./building-status.js');
 const s=createState();s.power={...s.power,capacity:360,stored:90,powered:false};
 const building=type=>({type,built:true,progress:1});
 assert.deepEqual(buildingStatus(building('battery'),s),{icon:'battery',text:'25%',tone:'charge',fill:.25});
 s.power.stored=0;assert.equal(buildingStatus(building('battery'),s).tone,'low');
 assert.equal(buildingStatus(building('lamp'),s),null,'daytime lights do not demand energy');
 s.time=150;assert.equal(buildingStatus(building('lamp'),s).text,'No power');
 assert.equal(buildingStatus(building('solar'),s).text,'No sunlight');
 assert.equal(buildingStatus(building('hopper'),s),null,'passive structures do not show false power warnings');
 assert.equal(buildingStatus({type:'battery',built:false,progress:.4},s).text,'40%');
});


test('seeded cave networks are connected, varied, and safe to save underground',async()=>{
 const {caveLayout,caveWalkable}=await import('./caves.js');
 for(const seed of [42,1847,9191])for(let id=0;id<3;id++){
  const cave=caveLayout(seed,id),visited=new Set(['0,0']),queue=[[0,0]];
  for(let i=0;i<queue.length;i++){const [x,z]=queue[i];for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const key=`${x+dx},${z+dz}`;if(cave.cells.has(key)&&!visited.has(key)){visited.add(key);queue.push([x+dx,z+dz]);}}}
  assert.equal(visited.size,cave.cells.size);assert.ok(cave.rooms.length>=10);assert.ok(caveWalkable(seed,id,0,3.2));
 }
 assert.notDeepEqual([...caveLayout(42,0).cells],[...caveLayout(43,0).cells]);
 const s=createState();s.player={x:0,z:4,y:0,satiety:100,cave:1};s.exploredCaves={1:['0,0','0,1']};
 assert.deepEqual(deserialize(serialize(s)),s);
 s.player.x=110;assert.throws(()=>deserialize(serialize(s)),/cave position/);
});
test('cave visibility is blocked by rock and restricted to the headlamp direction',async()=>{
 const {visibleCaveCells,lineVisible}=await import('./caves.js');
 const cave={cells:new Set(['0,0','0,1','0,2','0,3','0,4','0,-1','0,-2','0,-3','1,0','2,0','2,1','2,2']),tiles:[]};cave.tiles=[...cave.cells].map(key=>{const [x,z]=key.split(',').map(Number);return {key,x,z};});
 assert.equal(lineVisible(cave,0,0,2,2),false);
 const view=visibleCaveCells(cave,0,0,0);assert.ok(view.has('0,4'));assert.ok(!view.has('0,-3'));assert.ok(view.has('0,-1'));assert.ok(!view.has('2,2'));
});
test('cave movement collides with walls and prevents surface construction',()=>{
 const s=createState();s.player={x:0,z:4,y:0,cave:0};
 for(let i=0;i<30;i++)movePlayer(s,1,1,.05,DEFS);
 assert.ok(s.player.x<2.8);assert.equal(validatePlacement(s,'lamp',0,0).ok,false);
});

test('portal thresholds preserve world position and facing without a camera jump',async()=>{
 const {crossCavePortal}=await import('./travel.js'),{terrainData}=await import('./terrain.js'),{caveToWorld}=await import('./cave-space.js');
 for(let id=0;id<3;id++){
  const s=createState(),c=terrainData(s.seed).caves[id];s.player.x=c.x+Math.sin(c.angle)*.2;s.player.z=c.z+Math.cos(c.angle)*.2;s.player.facing=c.angle;
  const before={...s.player};assert.equal(crossCavePortal(s),true);assert.equal(s.player.cave,id);
  const world=caveToWorld(s.seed,id,s.player.x,s.player.z);assert.ok(Math.hypot(world.x-before.x,world.z-before.z)<1e-9);assert.ok(Math.abs(s.player.facing)<1e-9);
  assert.equal(crossCavePortal(s),false);s.player.z=-.8;const outside=caveToWorld(s.seed,id,s.player.x,s.player.z);
  assert.equal(crossCavePortal(s),true);assert.equal(s.player.cave,undefined);assert.ok(Math.hypot(outside.x-s.player.x,outside.z-s.player.z)<1e-9);assert.equal(crossCavePortal(s),false);
 }
});
test('screen movement keeps the same world direction inside rotated cave entrances',async()=>{
 const {caveToWorld}=await import('./cave-space.js');
 for(let id=0;id<3;id++){
  const s=createState();s.player={x:0,z:4,y:0,cave:id};const before=caveToWorld(s.seed,id,0,4);
  movePlayer(s,1,0,.03,DEFS);const after=caveToWorld(s.seed,id,s.player.x,s.player.z);
  assert.ok(after.x>before.x);assert.ok(after.z<before.z);assert.ok(Math.abs(after.x-before.x+after.z-before.z)<1e-8);
 }
});

test('open plains have local crater relief and isolated cave hills without an enclosing rim',async()=>{
 const {terrainData,heightAt}=await import('./terrain.js'),data=terrainData(1847);
 assert.ok(data.craters.length>=12);assert.ok(data.hills.length>=6);assert.equal(data.caves.length,3);
 let low=0;for(let i=0;i<48;i++){const a=i/48*Math.PI*2;if(heightAt(1847,Math.sin(a)*78,Math.cos(a)*78)<3)low++;}
 assert.ok(low>24,'most directions at the former rim are open plains');
 for(let i=0;i<3;i++){const c=data.caves[i],hill=data.hills.find(h=>h.cave===i);assert.ok(Math.hypot(c.x-hill.x,c.z-hill.z)<hill.rz);assert.ok(heightAt(1847,hill.x,hill.z)>7);}
 const c=data.craters[0],rim=heightAt(1847,c.x+c.radius,c.z),bowl=heightAt(1847,c.x,c.z);assert.ok(rim-bowl>.5,'impact crater is sculpted into the surface');
 assert.equal(validatePlacement(createState(),'solar',0,0).ok,true);
});
test('walking into and back out of every cave clears the cliff collision apron',async()=>{
 const {crossCavePortal}=await import('./travel.js');
 const {caveToWorld}=await import('./cave-space.js');
 const {terrainData,terrainBlocked}=await import('./terrain.js');
 for(const seed of [42,1847,9191])for(let id=0;id<3;id++)for(const offset of [-1.2,0,1.2]){
  const s=createState(seed),c=terrainData(seed).caves[id],start=caveToWorld(seed,id,offset,-5);
  s.player={x:start.x,z:start.z,y:0};let cooldown=0,entered=false,exited=false;
  const advance=(direction,frames)=>{
   const wx=Math.sin(c.angle)*direction,wz=Math.cos(c.angle)*direction;
   for(let i=0;i<frames;i++){
    movePlayer(s,(wx-wz)*Math.SQRT1_2,(wx+wz)*Math.SQRT1_2,1/30,DEFS);
    cooldown=Math.max(0,cooldown-1/30);
    if(cooldown===0&&crossCavePortal(s)){if(s.player.cave!=null)entered=true;else exited=true;resetLocomotion(s.player);cooldown=1.2;}
   }
  };
  advance(1,40);assert.equal(s.player.cave,id,`entry seed ${seed} cave ${id} offset ${offset}`);assert.ok(entered);
  advance(-1,100);assert.equal(s.player.cave,undefined,`exit seed ${seed} cave ${id} offset ${offset}`);assert.ok(exited);
  assert.ok(Math.hypot(s.player.x-c.x,s.player.z-c.z)>8,'can continue well past the threshold');
  assert.equal(terrainBlocked(seed,s.player.x,s.player.z),false);
 }
});
test('the reported trapped surface position becomes walkable without resetting a save',async()=>{
 const {terrainBlocked}=await import('./terrain.js');const s=createState();s.player={x:-48.39,z:-38.30,y:0};
 assert.equal(terrainBlocked(s.seed,s.player.x,s.player.z),false);
 for(let i=0;i<30;i++)movePlayer(s,0,1,1/30,DEFS);
 assert.ok(s.player.x>-46&&s.player.z>-36,'character moves away from the cliff');
});

test('voxel surface has stable broad shelves and preserves a level starting clearing',async()=>{
 const {surfaceHeightAt}=await import('./terrain.js');
 assert.equal(surfaceHeightAt(1847,0,8),0);
 for(const [x,z] of [[30,22],[-50,54],[70,-66]]){
  assert.equal(surfaceHeightAt(1847,x-.5,z-.5),surfaceHeightAt(1847,x+.5,z+.5));
  assert.ok(Number.isFinite(surfaceHeightAt(1847,x,z)));
 }
});
