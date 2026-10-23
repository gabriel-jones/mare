import test from 'node:test';
import {movePlayer,buildingCenter,nearestBlueprint,resetLocomotion,interpolatePose,WALK_SPEED,RUN_SPEED} from './controller.js';
import assert from 'node:assert/strict';
import {createState,DEFS,footprint,validatePlacement,placeBlueprint,construct,cancelBlueprint,tick,serialize,deserialize,interact,DAY_DURATION} from './sim.js';
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
  assert.equal(validatePlacement(s,'storage',0,0).ok,true);
  assert.equal(validatePlacement(s,'solar',0.5,0).ok,false);
});
test('placement spends once, reserves space, and partial cancellation refunds exactly once',()=>{
  const s=createState(), original=structuredClone(s.inventory);
  const p=placeBlueprint(s,'solar',0,0);
  assert.equal(count(s.inventory,'metal'),count(original,'metal')-DEFS.solar.cost.metal);
  assert.equal(placeBlueprint(s,'storage',1,1).ok,false);
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

test('a full battery powers a habitat through the complete prototype night',()=>{
  // Four habitat squares at 0.25 kW each.
  const s=createState();complete(s,'battery',0,0);
  for(const [x,z] of [[3,0],[4,0],[3,1],[4,1]]){const id=placeBlueprint(s,'habitat',x,z).id;s.player={...s.player,x:7,z:4.5};assert.equal(construct(s,id,9).ok,true);}
  s.time=80;tick(s,0);s.power.stored=180;
  for(let i=0;i<1200;i++) { tick(s,0.1);assert.equal(s.power.powered,true); }
  assert.ok(s.power.stored>59 && s.power.stored<61, String(s.power.stored));
});
test('saves reject unreachable player coordinates and invalid jump heights',()=>{
  for(const player of [{x:126,z:0,y:0},{x:0,z:-126,y:0},{x:0,z:0,y:-1},{x:0,z:0,y:11}]) {
    const s=createState();s.player=player;
    assert.throws(()=>deserialize(serialize(s)),/player position/);
  }
  const s=createState();s.player={...s.player,x:35,z:-35,y:10,satiety:100};
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
  const second=placeBlueprint(s,'storage',4,0).id;
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
 assert.ok(steep);assert.equal(validatePlacement(s,'storage',steep.x,steep.z).ok,false);
 // Legacy buildings remain valid even where revised terrain disallows new construction.
 s.buildings=[{id:1,type:'storage',...steep,rotation:0,progress:1,built:true}];s.nextId=2;
 assert.equal(deserialize(serialize(s)).buildings.length,1);
});

test('building indicators distinguish pooled battery charge, inactive lights and actual outages',async()=>{
 const {buildingStatus,lampLevel}=await import('./building-status.js');
 const s=createState();s.power={...s.power,capacity:360,stored:90,powered:false};
 const building=type=>({type,built:true,progress:1});
 assert.deepEqual(buildingStatus(building('battery'),s),{text:'Charge 25%',read:'90 / 360 KJ',tone:'charge',fill:.25});
 assert.equal(lampLevel(buildingStatus(building('battery'),s)),'ok');
 s.power.stored=0;assert.equal(buildingStatus(building('battery'),s).tone,'low');assert.equal(lampLevel(buildingStatus(building('battery'),s)),'low');
 s.power.generation=8;s.power.demand=2;assert.equal(buildingStatus(building('battery'),s).glyph,'charging','batteries show a charging glyph while there is surplus');
 s.power.stored=s.power.capacity;assert.equal(buildingStatus(building('battery'),s).glyph,undefined,'full batteries are not charging');
 assert.equal(lampLevel(null),'ok','machines with nothing to report show a steady lamp');
 s.time=150;
 assert.equal(buildingStatus(building('solar'),s).text,'No sunlight');assert.equal(lampLevel(buildingStatus(building('solar'),s)),'idle');
 assert.equal(buildingStatus(building('hopper'),s),null,'passive structures do not show false power warnings');
 const blueprint=buildingStatus({type:'battery',built:false,progress:.4},s);
 assert.equal(blueprint.read,'40% BUILT · HOLD E');assert.equal(lampLevel(blueprint),'off');
});

test('machines are numbered per type in build order, keep their numbers through saves, and old saves get numbered',async()=>{
 const {tagOf}=await import('./defs.js');
 const s=createState();s.inventory=createInventory({metal:600,silicon:300});
 const place=type=>{for(let x=-12;x<=12;x+=2)for(let z=-2;z<=10;z+=2)if(validatePlacement(s,type,x,z).ok)return placeBlueprint(s,type,x,z);};
 for(let i=0;i<3;i++)assert.ok(place('battery'));
 const crate=place('storage');
 assert.deepEqual(s.buildings.filter(b=>b.type==='battery').map(tagOf),['BAT-01','BAT-02','BAT-03']);
 assert.equal(tagOf(s.buildings.find(b=>b.id===crate.id)),'CRT-01');
 const restored=deserialize(serialize(s));
 assert.deepEqual(restored.buildings.map(tagOf),s.buildings.map(tagOf));
 const legacy=JSON.parse(serialize(s));legacy.buildings.forEach(b=>delete b.serial);
 assert.deepEqual(deserialize(JSON.stringify(legacy)).buildings.map(tagOf),s.buildings.map(tagOf),'unnumbered saves are numbered by build order');
 const bad=JSON.parse(serialize(s));bad.buildings[0].serial=-1;assert.throws(()=>deserialize(JSON.stringify(bad)),/building number/);
});


test('seeded cave networks are connected, varied, and safe to save underground',async()=>{
 const {caveLayout,caveWalkable}=await import('./caves.js');
 for(const seed of [42,1847,9191])for(let id=0;id<3;id++){
  const cave=caveLayout(seed,id),visited=new Set(['0,0']),queue=[[0,0]];
  for(let i=0;i<queue.length;i++){const [x,z]=queue[i];for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const key=`${x+dx},${z+dz}`;if(cave.cells.has(key)&&!visited.has(key)){visited.add(key);queue.push([x+dx,z+dz]);}}}
  assert.equal(visited.size,cave.cells.size);assert.ok(cave.rooms.length>=10);assert.ok(caveWalkable(seed,id,0,3.2));
 }
 assert.notDeepEqual([...caveLayout(42,0).cells],[...caveLayout(43,0).cells]);
 const s=createState();s.player={...s.player,x:0,z:4,y:0,satiety:100,cave:1};s.exploredCaves={1:['0,0','0,1']};
 assert.deepEqual(deserialize(serialize(s)),s);
 // A position that is no longer walkable (rock, or a feature added since) moves the player to the zone start.
 s.player.x=110;const moved=deserialize(serialize(s));assert.equal(moved.player.cave,1);assert.ok(caveWalkable(moved.seed,1,moved.player.x,moved.player.z));
 s.player.zone=7;assert.throws(()=>deserialize(serialize(s)),/cave position/);
});
test('every cave has three connected zones joined by shafts, with features that never cut a path',async()=>{
 const {caveLayout,caveWalkable,cavePassable,CAVE_ZONES}=await import('./caves.js'),{crossCavePortal}=await import('./travel.js');
 for(const seed of [42,1847,9191])for(let id=0;id<3;id++)for(let zone=0;zone<CAVE_ZONES;zone++){
  const cave=caveLayout(seed,id,zone),start=`${cave.start.x},${cave.start.z}`,visited=new Set([start]),queue=[start];
  while(queue.length){const [x,z]=queue.pop().split(',').map(Number);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const k=`${x+dx},${z+dz}`;if(cave.cells.has(k)&&!visited.has(k)){visited.add(k);queue.push(k);}}}
  assert.equal(visited.size,cave.cells.size,`seed ${seed} cave ${id} zone ${zone} is one connected network`);
  for(const t of cave.tiles)if(t.type==='chasm')assert.ok(!cave.cells.has(t.key),'chasms block walking');
  for(const s of cave.solids){assert.ok(!cavePassable(cave,s.x,s.z),'a formation is solid');assert.ok(cave.sight.has(`${Math.round(s.x/2)},${Math.round(s.z/2)}`),'formations do not block sight');}
  assert.ok(cave.tiles.some(t=>t.type==='bridge')||!cave.tiles.some(t=>t.type==='chasm'),'chasms come with a bridge');
  assert.equal(!!cave.down,zone<CAVE_ZONES-1);assert.equal(!!cave.up,zone>0);assert.equal(!!cave.heart,zone===CAVE_ZONES-1);
  if(cave.down)assert.ok(cave.cells.has(`${cave.down.x},${cave.down.z}`)&&cave.cells.has(`${cave.down.x},${cave.down.z-1}`));
 }
 // Down the shaft lands beside the shaft up, and climbing back returns beside the shaft down.
 const s=createState(42),top=caveLayout(42,0,0).down;s.player={x:top.x*2,z:top.z*2,y:0,cave:0};
 assert.equal(crossCavePortal(s),'down');assert.equal(s.player.zone,1);assert.ok(caveWalkable(42,0,s.player.x,s.player.z,.3,1));
 s.player.z=0;s.player.x=0;assert.equal(crossCavePortal(s),'up');assert.equal(s.player.zone,undefined);assert.equal(s.player.z,(top.z-1)*2);
 s.player.zone=1;s.exploredCaves={'0:1':['0,0']};assert.deepEqual(deserialize(serialize(s)).exploredCaves,{'0:1':['0,0']});
});
test('cave visibility is blocked by rock and restricted to the headlamp direction',async()=>{
 const {visibleCaveCells,lineVisible}=await import('./caves.js');
 const cave={cells:new Set(['1,0','2,0','2,1','2,2',...Array.from({length:21},(_,i)=>`0,${i-10}`)]),tiles:[]};cave.tiles=[...cave.cells].map(key=>{const [x,z]=key.split(',').map(Number);return {key,x,z};});
 assert.equal(lineVisible(cave,0,0,2,2),false);
 // A full circle of sight, and the headlamp beam reaches further ahead than the circle does behind.
 const view=visibleCaveCells(cave,0,0,0);assert.ok(view.has('0,9'));assert.ok(view.has('0,-6'));assert.ok(!view.has('0,-9'));assert.ok(view.has('0,-1'));assert.ok(!view.has('2,2'));
});
test('cave movement collides with walls and prevents surface construction',()=>{
 const s=createState();s.player={x:0,z:4,y:0,cave:0};
 for(let i=0;i<30;i++)movePlayer(s,1,1,.05,DEFS);
 assert.ok(s.player.x<2.8);assert.equal(validatePlacement(s,'storage',0,0).ok,false);
});

test('portal thresholds preserve world position and facing without a camera jump',async()=>{
 const {crossCavePortal}=await import('./travel.js'),{terrainData}=await import('./terrain.js'),{caveToWorld}=await import('./cave-space.js');
 for(let id=0;id<3;id++){
  const s=createState(),c=terrainData(s.seed).caves[id];s.player.x=c.x+Math.sin(c.angle)*.2;s.player.z=c.z+Math.cos(c.angle)*.2;s.player.facing=c.angle;
  const before={...s.player};assert.equal(crossCavePortal(s),'cave');assert.equal(s.player.cave,id);
  const world=caveToWorld(s.seed,id,s.player.x,s.player.z);assert.ok(Math.hypot(world.x-before.x,world.z-before.z)<1e-9);assert.ok(Math.abs(s.player.facing)<1e-9);
  assert.equal(crossCavePortal(s),false);s.player.z=-.8;const outside=caveToWorld(s.seed,id,s.player.x,s.player.z);
  assert.equal(crossCavePortal(s),'surface');assert.equal(s.player.cave,undefined);assert.ok(Math.hypot(outside.x-s.player.x,outside.z-s.player.z)<1e-9);assert.equal(crossCavePortal(s),false);
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

test('retired work lights vanish from old saves instead of breaking them',()=>{
 const s=createState();complete(s,'battery',0,0);
 const raw=JSON.parse(serialize(s));raw.buildings.push({...raw.buildings[0],id:99,type:'lamp',x:4,z:4,serial:1});
 assert.deepEqual(deserialize(JSON.stringify(raw)).buildings.map(b=>b.type),['battery']);
});

test('caves give titanium, rare earth, artifacts and the reactor schematic, each taken once',async()=>{
 const {caveLayout}=await import('./caves.js'),{lootAction,takeLoot}=await import('./delve.js'),{selectResearch,lockedReason}=await import('./space.js');
 const s=createState();s.inventory=createInventory({metal:200,silicon:100});
 const stand=(l,zone)=>{s.player={x:l.x*2,z:l.z*2,y:0,satiety:100,cave:0};if(zone)s.player.zone=zone;};
 const top=caveLayout(s.seed,0,0),hollows=caveLayout(s.seed,0,1),deep=caveLayout(s.seed,0,2);
 assert.ok(!top.loot.some(l=>l.kind==='crystal'),'no rare earth near the surface');
 const ore=top.loot.find(l=>l.kind==='ore');stand(ore,0);
 assert.match(lootAction(s).verb,/titanium/);assert.equal(takeLoot(s).ok,true);assert.equal(count(s.inventory,'titanium'),ore.amount);
 assert.notEqual(lootAction(s)?.loot.key,ore.key,'a seam is only chipped once');
 assert.ok([0,1,2].every(z=>!caveLayout(s.seed,0,z).loot.some(l=>l.kind==='tablet')),'no glyph tablets: the old builders left machinery, not writing');
 // The reactor stays locked until its schematic is found, then needs research.
 assert.match(lockedReason(s,'reactor'),/schematic/);assert.equal(selectResearch(s,'reactor').ok,false);
 stand(hollows.loot.find(l=>l.kind==='blueprint'),1);assert.equal(takeLoot(s).ok,true);assert.deepEqual(s.blueprints,['reactor']);
 assert.match(lockedReason(s,'reactor'),/research/);assert.equal(selectResearch(s,'reactor').ok,true);
 const crystal=hollows.loot.find(l=>l.kind==='crystal');stand(crystal,1);
 assert.equal(takeLoot(s).ok,true);assert.equal(count(s.inventory,'rareearth'),2);
 const heart=deep.loot.find(l=>l.kind==='heart');stand(heart,2);
 assert.equal(takeLoot(s).ok,true);assert.equal(count(s.inventory,'heart'),1);
 const saved=deserialize(serialize(s));assert.deepEqual(saved.caveLoot,s.caveLoot);assert.deepEqual(saved.blueprints,['reactor']);
 // A full pack refuses what doesn't fit and leaves it in the cave.
 s.inventory=createInventory({metal:2000});stand(caveLayout(s.seed,1,0).loot.find(l=>l.kind==='ore'),0);s.player.cave=1;
 assert.equal(takeLoot(s).ok,false);assert.equal(s.caveLoot['1'],undefined);
});
test('a xeno lab turns finds into research and a resonance reactor powers the night',async()=>{
 const {STUDY,REACTOR_POWER}=await import('./space.js');
 const s=createState();s.inventory=createInventory({metal:200,silicon:100,titanium:30,rareearth:8,artifact:2,heart:1});s.player={...s.player,x:0,z:20,y:0,satiety:100};
 assert.equal(placeBlueprint(s,'xenolab',3,3).ok,true);const lab=s.buildings.at(-1);lab.progress=1;lab.built=true;
 assert.equal(interact(s,lab.id).ok,true);assert.equal(s.research.bank,STUDY.artifact*2+STUDY.heart);assert.equal(count(s.inventory,'artifact'),0);
 s.blueprints=['reactor'];s.research.done.push('reactor');
 assert.equal(placeBlueprint(s,'reactor',8,2).ok,true);const reactor=s.buildings.at(-1);reactor.progress=1;reactor.built=true;
 s.time=DAY_DURATION*.75;tick(s,0);assert.equal(s.power.generation,REACTOR_POWER);
});
test('vents and toxic pools hurt, the surface heals, and blacking out leaves the pack where you fell',async()=>{
 const {caveLayout}=await import('./caves.js'),P=await import('./peril.js');
 let found=null;for(let id=0;id<3&&!found;id++)for(let zone=0;zone<3&&!found;zone++){const t=caveLayout(1847,id,zone).tiles.find(t=>t.type==='vent');if(t)found={id,zone,t};}
 assert.ok(found,'some cave has a vent');
 const s=createState();s.inventory=createInventory({metal:20,titanium:5});
 s.player={x:found.t.x*2,z:found.t.z*2,y:0,satiety:100,cave:found.id,...(found.zone?{zone:found.zone}:{})};
 assert.equal(P.stepPeril(s,1).hazard,'vent');assert.equal(s.player.health,100-P.HEALTH.vent);
 assert.ok(caveLayout(1847,found.id,found.zone).tiles.some(t=>t.type==='toxic'),'vents seep into toxic pools');
 const where={x:s.player.x,z:s.player.z};let r;for(let i=0;i<20&&!r?.blackout;i++)r=P.stepPeril(s,1);
 assert.equal(r.blackout,true);assert.equal(s.player.cave,undefined);assert.equal(s.player.health,100);assert.equal(count(s.inventory,'metal'),0);
 assert.equal(s.drops.length,1);assert.deepEqual({x:s.drops[0].x,z:s.drops[0].z},where);
 const saved=deserialize(serialize(s));assert.deepEqual(saved.drops,s.drops);
 // Back to where the pack lies, and it all comes back.
 Object.assign(s.player,{x:where.x+.5,z:where.z,cave:found.id});if(found.zone)s.player.zone=found.zone;
 assert.equal(P.dropAction(s).verb,"Recover your pack · 25 items");assert.equal(P.recoverDrop(s).ok,true);assert.equal(count(s.inventory,'titanium'),5);assert.equal(s.drops.length,0);
 // Healing only happens above ground, after a moment without harm.
 delete s.player.cave;delete s.player.zone;s.player.health=50;s.player.calm=0;P.stepPeril(s,2);assert.equal(s.player.health,50);P.stepPeril(s,4);assert.ok(s.player.health>50);
});
test('flares are made from metal, thrown short of walls underground, and light their surroundings',async()=>{
 const {caveLayout,visibleCaveCells}=await import('./caves.js'),P=await import('./peril.js');
 const s=createState();s.inventory=createInventory({metal:3});
 assert.equal(P.craftFlares(s).ok,true);assert.equal(count(s.inventory,'flare'),3);assert.equal(P.craftFlares(s).ok,false,'needs more metal');
 assert.equal(P.throwFlare(s).ok,true,'on the surface too');s.flares=[];
 s.player={x:0,z:4,y:0,satiety:100,cave:0,facing:Math.PI/2};
 assert.equal(P.throwFlare(s).ok,true);const f=s.flares[0];assert.ok(f.x<4&&f.x>=0,'stops before the side wall');
 const cave=caveLayout(s.seed,0),dark=visibleCaveCells(cave,0,30,Math.PI),lit=visibleCaveCells(cave,0,30,Math.PI,[{x:0,z:40,r:P.FLARE.radius}]);
 assert.ok(lit.size>dark.size);
 P.stepPeril(s,P.FLARE.life+P.FLARE.release+2);assert.equal(s.flares.length,0);
});
test('the infestation thickens with depth; flares burn nests and silk, which regrow, and burnt nests thin the crawlers',async()=>{
 const {caveLayout,cavePassable,INFESTATION}=await import('./caves.js'),I=await import('./infest.js'),P=await import('./peril.js'),H=await import('./hunt.js');
 for(const seed of [42,1847,9191])for(let id=0;id<3;id++){
  const per=[0,1,2].map(z=>caveLayout(seed,id,z));
  per.forEach((c,z)=>{assert.equal(c.nests.length,INFESTATION.nests[z],`seed ${seed} cave ${id} zone ${z} nests`);assert.ok(c.silk.length<=INFESTATION.silk[z]);
   for(const n of c.nests){assert.ok(c.cells.has(`${n.x},${n.z}`)&&!c.open.has(`${n.x+n.dx},${n.z+n.dz}`),'a nest is dug into a wall beside the floor');}
   // With every silk wall standing, the shafts and the heart are still reachable from the start.
   const silk=new Set(c.silk.map(s=>`${s.x},${s.z}`)),start=`${c.start.x},${c.start.z}`,seen=new Set([start]),queue=[start];
   while(queue.length){const [x,zz]=queue.pop().split(',').map(Number);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const k=`${x+dx},${zz+dz}`;if(c.cells.has(k)&&!silk.has(k)&&!seen.has(k)){seen.add(k);queue.push(k);}}}
   for(const p of [c.up,c.down,c.heart].filter(Boolean))assert.ok(seen.has(`${p.x},${p.z}`),'silk never seals the way through');
  });
 }
 // Silk stops the player until a flare burns it, then grows back.
 const s=createState();let id=0,zone=0,cave;
 for(;id<3;id++){for(zone=0;zone<3;zone++){cave=caveLayout(s.seed,id,zone);if(cave.silk.length)break;}if(cave.silk.length)break;}
 const web=cave.silk[0];s.player={x:web.x*2,z:web.z*2,y:0,satiety:100,cave:id,zone,facing:0};
 assert.ok(I.silkBlocks(s,web.x*2,web.z*2),'silk blocks');
 s.flares=[{cave:id,zone,x:web.x*2,z:web.z*2,t:30}];P.stepPeril(s,.1);
 assert.ok(I.isBurnt(s,id,zone,web.key)&&!I.silkBlocks(s,web.x*2,web.z*2),'burnt through');
 s.flares=[];const saved=deserialize(serialize(s));assert.ok(I.isBurnt(saved,id,zone,web.key),'saved');
 P.stepPeril(s,I.INFEST.regrow.silk+1);assert.ok(I.silkBlocks(s,web.x*2,web.z*2),'regrown');
 // Burnt nests breed fewer crawlers, but one always prowls.
 const deep=caveLayout(s.seed,0,2);s.player={x:deep.start.x*2,z:deep.start.z*2,y:0,satiety:100,cave:0,zone:2,facing:0};s.burnt={};
 const count=()=>{const h=H.createHunt();H.stepHunt(h,s,.01,()=>.5);return h.crawlers.length;};
 assert.equal(count(),H.NEST.count[2]);
 s.flares=deep.nests.map(n=>({cave:0,zone:2,...I.nestMouth(n),t:30}));P.stepPeril(s,.1);
 assert.equal(I.liveNests(s,0,2).length,0);assert.equal(count(),1);
 const h=H.createHunt();H.stepHunt(h,s,.01,()=>.5);assert.ok(h.crawlers.every(c=>cavePassable(deep,c.x,c.z)));
});
test('a flare is struck in hand, thrown at the aim point and burns where it lands',async()=>{
 const P=await import('./peril.js');const s=createState();s.inventory=createInventory({flare:2});
 s.player={x:0,z:4,y:0,satiety:100,cave:0,facing:0};
 assert.equal(P.throwFlare(s,{x:0,z:7}).ok,true);const f=s.flares[0];
 assert.ok(Math.abs(f.x)<.01&&Math.abs(f.z-7)<.01,'lands on the aim point');
 assert.equal(P.throwFlare(s,{x:0,z:7}).ok,false,'one throw at a time');
 let n=P.flareNow(f,s.player);assert.equal(n.stage,'hand');assert.equal(n.lit,0,'dark until the cap is struck');
 P.stepPeril(s,P.FLARE.strike+.2);n=P.flareNow(f,s.player);assert.equal(n.stage,'hand');assert.ok(n.lit>0,'lit in hand');
 s.player.x=1;P.stepPeril(s,P.FLARE.release-P.FLARE.strike-.2+.01);n=P.flareNow(f,s.player);assert.equal(n.stage,'flight');assert.ok(Math.abs(n.x-1)<.1,'leaves from where the player stands');
 P.stepPeril(s,f.flight);n=P.flareNow(f,s.player);assert.equal(n.stage,'down');assert.equal(n.x,f.x);
 assert.ok(f.t>P.FLARE.life-.5,'burns its full life once down');
 assert.equal(P.flareNow({x:1,z:2,t:20},s.player).stage,'down','older flares are already down');
});
