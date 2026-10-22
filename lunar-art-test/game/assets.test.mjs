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
test('industrial exports contain only intended assets, retain a hideable roof, and fit draw budgets',()=>{
 const budgets={starship:3500,launchpad:1500,solar:1500,battery:1500,hopper:1200,habitat:2500,lamp:600,processor:2600,conveyor:450,storage:800};
 for(const [name,budget] of Object.entries(budgets)){
  const {json:d}=glb(name);let triangles=0,parts=0;
  assert.equal((d.animations??[]).length,0);
  assert.ok(d.buffers.every(b=>!b.uri),'self-contained GLB');
  for(const n of d.nodes)assert.ok(!/^(Plane|Camera|Light|Astronaut)/.test(n.name??''),'no unrelated scene objects');
  for(const mesh of d.meshes)for(const p of mesh.primitives){triangles+=d.accessors[p.indices].count/3;parts++;}
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
