import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
function glb(name){
 const bytes=readFileSync(new URL(`./assets/${name}.glb`,import.meta.url));
 assert.equal(bytes.toString('ascii',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
 const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.toString('utf8',20,20+length));
 const bin=bytes.subarray(28+length);
 return {json,bin};
}
function accessor(asset,index){
 const a=asset.json.accessors[index],v=asset.json.bufferViews[a.bufferView];
 assert.equal(a.componentType,5126,'expected floating-point animation or weights');
 const width={SCALAR:1,VEC3:3,VEC4:4}[a.type],result=[];
 for(let row=0;row<a.count;row++)for(let c=0;c<width;c++)result.push(asset.bin.readFloatLE((v.byteOffset??0)+(a.byteOffset??0)+row*(v.byteStride??width*4)+c*4));
 return result;
}
test('astronaut has a 15-bone skin and five distinct Blender clips with animated limbs',()=>{
 const a=glb('astronaut-v2'),d=a.json;
 assert.equal(d.skins.length,1);assert.equal(d.skins[0].joints.length,15);
 const clips=new Map(d.animations.map(c=>[c.name.toLowerCase().split('.')[0],c]));
 assert.equal(d.animations.length,5);
 assert.deepEqual([...clips.keys()].sort(),['build','idle','jump','run','walk']);
 for(const name of ['walk','run']){
  const clip=clips.get(name),leg=clip.channels.find(c=>d.nodes[c.target.node].name.startsWith('Thigh')&&c.target.path==='rotation');
  assert.ok(leg,`${name} must animate a thigh`);
  const values=accessor(a,clip.samplers[leg.sampler].output);assert.ok(Math.max(...values)-Math.min(...values)>.15);
 }
 let triangles=0;
 for(const mesh of d.meshes)for(const p of mesh.primitives){
  triangles+=d.accessors[p.indices].count/3;
  const w=accessor(a,p.attributes.WEIGHTS_0);
  for(let i=0;i<w.length;i+=4)assert.ok(Math.abs(w[i]+w[i+1]+w[i+2]+w[i+3]-1)<1e-5,'normalized skin weights');
 }
 assert.ok(triangles<6000,'player geometry budget');
 assert.ok(d.nodes.some(n=>n.name.startsWith('ConstructionTool')));
});
test('android has its work and combat clips, hideable weapons, a face strip and marker bones',()=>{
 const a=glb('android'),d=a.json,names=d.animations.map(c=>c.name.split('.')[0]).sort();
 assert.deepEqual(names,['BladeAim','BladeSlash','BladeWalk','Carry','CarryIdle','Charge','Down','GunAim','GunFire','GunWalk','Harvest','Idle','PistolAim','PistolFire','PistolWalk','Walk','Work']);
 for(const n of ['AndroidBody','Face','Gun','Pistol','Blade','Carry','Muzzle','PistolMuzzle','BladeTip','Hand.R'])assert.ok(d.nodes.some(x=>x.name===n),n);
 let triangles=0;for(const mesh of d.meshes)for(const p of mesh.primitives)triangles+=d.accessors[p.indices].count/3;
 assert.ok(triangles<6000,'android geometry budget');
});
test('industrial exports contain only intended assets, retain a hideable roof, and fit draw budgets',()=>{
 const budgets={starship:3500,launchpad:1500,solar:1500,battery:1500,hopper:1200,habitat:2500,processor:2600,conveyor:450,storage:800};
 for(const [name,budget] of Object.entries(budgets)){
  const {json:d}=glb(name);let triangles=0,parts=0;
  assert.equal((d.animations??[]).length,0);
  assert.ok(d.buffers.every(b=>!b.uri),'self-contained GLB');
  for(const n of d.nodes)assert.ok(!/^(Plane|Camera|Light|Astronaut)/.test(n.name??''),'no unrelated scene objects');
  // Status and animated parts (Lamp, Cell1..5, Level, Kiln, Heater, Fill, Panel, Belt) are separate on purpose so each can be lit, scaled or moved.
  const status=new Set(d.nodes.filter(n=>/^(Lamp|Cell\d|Level|Kiln|Heater|Fill|Panel|Belt)$/.test(n.name)).map(n=>n.mesh));
  d.meshes.forEach((mesh,i)=>{for(const p of mesh.primitives){triangles+=d.accessors[p.indices].count/3;if(!status.has(i))parts++;}});
  assert.ok(triangles<=budget,`${name}: ${triangles} triangles exceeds ${budget}`);
  assert.ok(parts<=10,`${name} has too many material parts`);
  if(name==='habitat')assert.ok(d.nodes.some(n=>n.name.startsWith('Roof')),'roof must remain independently hideable');
 }
});

test('mining rover keeps wheels, drill arm and cargo load as separate pivoting nodes',()=>{
 const {json:d}=glb('rover');let triangles=0;
 for(const mesh of d.meshes)for(const p of mesh.primitives)triangles+=d.accessors[p.indices].count/3;
 assert.ok(triangles<=1800,`rover: ${triangles} triangles`);
 const names=d.nodes.map(n=>n.name);
 assert.deepEqual(names.filter(n=>n.startsWith('Wheel_')).sort(),['Wheel_LB','Wheel_LF','Wheel_RB','Wheel_RF']);
 for(const name of ['Drill','Cargo']){const node=d.nodes.find(n=>n.name===name);assert.ok(node,`${name} node`);assert.ok(node.translation&&node.translation[1]>.5,`${name} pivots above ground`);}
 assert.ok(d.nodes.length<=16,'merged static parts');
});
test('Blender plains kit exports clean, colored, budgeted rocks and a separable cave roof',()=>{
 for(const name of ['rock-a','rock-b','rock-c','cave-mouth']){
  const {json:d}=glb(name);assert.equal(d.scenes.length,1,'only the active asset scene is exported');
  assert.ok(!d.nodes.some(n=>/Studio|Camera|launchpad|Light/.test(n.name||'')),'no unrelated scene objects');
  let triangles=0;for(const mesh of d.meshes)for(const primitive of mesh.primitives){triangles+=d.accessors[primitive.indices].count/3;assert.ok(primitive.attributes.COLOR_0!=null,'paint is exported as vertex colors');}
  assert.ok(triangles<(name==='cave-mouth'?1800:600),`${name} triangle budget`);
  if(name==='cave-mouth')assert.ok(d.nodes.some(n=>n.name==='ArchRoof'),'roof remains separable for cutaway');
 }
});
test('modular habitat kit exports every piece at the origin and the corner belt stays light',()=>{
 const {json:d}=glb('habitat-kit'),names=d.nodes.map(n=>n.name.replace(/\.\d+$/,''));
 for(const piece of ['Floor','Wall','Window','Airlock','AirlockDoor','Corner','Roof','RoofEdge','RoofCorner','RoofModule','Cabinet','GlassWall','GlassRoof','GlassRoofEdge','AirlockFloor'])assert.ok(names.includes(piece),`${piece} piece`);
 for(const n of d.nodes)assert.ok(!n.translation||n.translation.every(v=>Math.abs(v)<1e-6),`${n.name} is authored at the origin`);
 assert.ok(d.materials.some(m=>/greenhouse glazing/.test(m.name)),'greenhouse glass is named for runtime translucency');
 const triangles=json=>json.meshes.reduce((sum,mesh)=>sum+mesh.primitives.reduce((s,p)=>s+json.accessors[p.indices].count/3,0),0);
 assert.ok(triangles(d)<=1300,`habitat kit: ${triangles(d)} triangles`);
 assert.ok(triangles(glb('conveyor-corner').json)<=500,'conveyor corner triangles');
});
test('expedition assets keep the salvageable core and the melter heater as separate nodes',()=>{
 for(const [name,parts,budget] of [['lander',['Lander','Core','Silk'],3600],['melter',['Melter','Heater'],1300]]){
  const {json:d}=glb(name),names=d.nodes.map(n=>n.name.replace(/\.\d+$/,''));
  for(const part of parts)assert.ok(names.includes(part),`${name}: ${part} node`);
  assert.ok(!d.nodes.some(n=>/Camera|Light|Plane/.test(n.name||'')),'no preview objects');
  const triangles=d.meshes.reduce((sum,mesh)=>sum+mesh.primitives.reduce((s,p)=>s+d.accessors[p.indices].count/3,0),0);
  assert.ok(triangles<=budget,`${name}: ${triangles} triangles`);
 }
});
test('every machine carries a status lamp, and the battery, melter and hopper carry their gauges',()=>{
 const machines={solar:[],battery:['Cell1','Cell2','Cell3','Cell4','Cell5'],hopper:['Level'],processor:[],storage:[],rover:[],melter:['Level'],growbed:[],galley:[],recycler:[],fabricator:[],assembler:[],electrolyser:[],tank:['Level'],dock:[],roverbay:[],hauler:[],xenolab:[],reactor:[],fuelcell:['Level'],thermal:['Level'],rtg:[],bioreactor:['Level'],foundry:[],chargepad:[]};
 for(const [name,gauges] of Object.entries(machines)){
  const {json:d}=glb(name),names=d.nodes.map(n=>n.name.replace(/\.\d+$/,''));
  for(const part of ['Lamp',...gauges])assert.ok(names.includes(part),`${name}: ${part} node`);
  const lamp=d.nodes.find(n=>n.name.replace(/\.\d+$/,'')==='Lamp');
  const meshes=[lamp,...(lamp.children??[]).map(i=>d.nodes[i])].filter(n=>n.mesh!=null).map(n=>d.meshes[n.mesh]);
  assert.ok(meshes.some(m=>m.primitives.some(p=>/status lamp/.test(d.materials[p.material].name))),`${name}: Lamp uses the status lamp material`);
 }
});
test('interior fittings stay light and keep their animated parts separable',()=>{
 for(const [name,parts] of [['growbed',['GrowBed','Plants']],['galley',['Galley','MealTray']],['recycler',['Recycler']]]){
  const {json:d}=glb(name),names=d.nodes.map(n=>n.name.replace(/\.\d+$/,''));
  for(const part of parts)assert.ok(names.includes(part),`${name}: ${part} node`);
  const triangles=d.meshes.reduce((sum,mesh)=>sum+mesh.primitives.reduce((s,p)=>s+d.accessors[p.indices].count/3,0),0);
  assert.ok(triangles<=600,`${name}: ${triangles} triangles`);
 }
});
test('space kit stays within budget; the hauler keeps wheels and its cargo crate separate',()=>{
 for(const [name,budget] of [['fabricator',1400],['assembler',1500],['electrolyser',1500],['tank',2200],['dock',1000],['roverbay',1000],['hauler',1300],['satellite',700],['xenolab',1400],['reactor',2400],['fuelcell',2700],['thermal',1200],['rtg',1200],['bioreactor',2600],['foundry',1500],['chargepad',1000]]){
  const {json:d}=glb(name);assert.ok(!d.nodes.some(n=>/Camera|Light/.test(n.name||'')),`${name}: no preview objects`);
  const triangles=d.meshes.reduce((sum,mesh)=>sum+mesh.primitives.reduce((s,p)=>s+d.accessors[p.indices].count/3,0),0);
  assert.ok(triangles<=budget,`${name}: ${triangles} triangles`);
 }
 const names=glb('hauler').json.nodes.map(n=>n.name);
 assert.deepEqual(names.filter(n=>n.startsWith('Wheel_')).sort(),['Wheel_LB','Wheel_LF','Wheel_RB','Wheel_RF']);
 assert.ok(names.includes('Cargo'));
});
