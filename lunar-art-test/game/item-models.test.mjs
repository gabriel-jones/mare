import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createItemLibrary, BELT_ITEM_SIZES } from './item-models.js';
import { ITEM_INFO, ITEMS } from './defs.js';
import { createProductionView } from './production-view.js';
import { createState } from './sim.js';
import { createCaveView, caveMemoryKey } from './cave-view.js';
import { caveLayout } from './caves.js';
import { takeLoot } from './delve.js';

async function load(path) {
  const data=readFileSync(new URL(path,import.meta.url));
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
}
const gltf=await load('./assets/inventory/items.glb'),library=createItemLibrary(gltf.scene);
const models=new Map(await Promise.all(['hauler','rover'].map(async key=>[key,(await load(`./assets/${key}.glb`)).scene])));
after(()=>library.dispose());

test('the icon meshes export as complete, grounded, unit-size game items within geometry budgets',()=>{
  const report=JSON.parse(readFileSync(new URL('./assets/inventory/models.json',import.meta.url)));
  for(const item of new Set([...Object.keys(ITEM_INFO),...ITEMS])){
    const model=library.get(item);assert.ok(model,`${item} has its own model`);
    const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    assert.ok(Math.abs(bounds.min.y)<1e-5,`${item} sits on its surface`);
    assert.ok(Math.abs(Math.max(size.x,size.y,size.z)-1)<1e-5,`${item} predictable scale`);
    assert.ok(Math.abs(bounds.min.x+bounds.max.x)<1e-5&&Math.abs(bounds.min.z+bounds.max.z)<1e-5,`${item} centred origin`);
    let triangles=0;
    for(const part of model.children){
      assert.ok(part.isMesh&&!Array.isArray(part.material),'one material per instanced part');
      assert.ok(part.material.isMeshStandardMaterial,'physically lit GLB materials');
      assert.equal(part.geometry.attributes.position.count>0,true);
      triangles+=(part.geometry.index?.count??part.geometry.attributes.position.count)/3;
    }
    assert.equal(triangles,report[item].triangles);
    assert.ok(triangles<=2000,`${item}: bounded game mesh`);
    assert.ok(model.children.length<=7,`${item}: merged material parts`);
  }
});

test('a thousand multicolour chips share seven mesh parts and receive identical instance transforms',()=>{
  const batch=library.batch('chip',1000,.4),matrix=new THREE.Matrix4().compose(new THREE.Vector3(2,.38,7),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2),new THREE.Vector3(1,1,1));
  const source=library.get('chip');
  for(let i=0;i<1000;i++)batch.set(i,matrix);
  batch.finish(1000);
  assert.equal(batch.root.children.length,7);
  for(const [i,mesh]of batch.meshes.entries()){
    assert.equal(mesh.count,1000);assert.equal(mesh.geometry,source.children[i].geometry);assert.equal(mesh.material,source.children[i].material);
    const m=new THREE.Matrix4();mesh.getMatrixAt(999,m);
    assert.ok(Math.abs(m.elements[12]-2)<1e-6&&Math.abs(m.elements[14]-7)<1e-6,'world placement is not scaled with the item');
    assert.ok(Math.abs(new THREE.Vector3().setFromMatrixScale(m).x-.4)<1e-6);
  }
  batch.finish(0);assert.equal(batch.root.visible,false);assert.ok(batch.meshes.every(m=>m.count===0));
  assert.throws(()=>batch.set(1000,matrix),RangeError);
  let sharedDisposed=false;source.children[0].geometry.addEventListener('dispose',()=>sharedDisposed=true);
  batch.dispose();assert.equal(sharedDisposed,false,'removing a belt batch leaves shared items usable');
});

test('real production belts use the authored meshes through corners and clear removed items',()=>{
  const scene=new THREE.Scene(),view=createProductionView(scene,models,library),state=createState();
  state.robots=[];
  state.buildings=[{id:1,type:'conveyor',x:0,z:0,rotation:0,built:true,items:[]},
    {id:2,type:'conveyor',x:0,z:1,rotation:1,built:true,items:[{type:'chip',p:.2},{type:'metal',p:.7}]}];
  view.update(state,1/30,1);
  for(const item of ['chip','metal']){
    const root=scene.getObjectByName(`Items_${item}`);assert.ok(root?.visible);
    assert.ok(root.children.every(m=>m.isInstancedMesh&&m.count===1));
    const first=new THREE.Matrix4();root.children[0].getMatrixAt(0,first);
    for(const mesh of root.children){const m=new THREE.Matrix4();mesh.getMatrixAt(0,m);assert.deepEqual(m.elements,first.elements);}
    assert.ok(Math.abs(new THREE.Vector3().setFromMatrixScale(first).x-BELT_ITEM_SIZES[item])<1e-6);
  }
  state.buildings[1].items=[];view.update(state,1/30,1);
  for(const item of ['chip','metal'])assert.equal(scene.getObjectByName(`Items_${item}`).visible,false);
  view.dispose();assert.equal(scene.children.length,0);
});

test('a hauler shows the actual load, switches models, and hides its cargo when empty',()=>{
  const scene=new THREE.Scene(),view=createProductionView(scene,models,library),state=createState();
  state.robots=[{id:2,kind:'hauler',x:0,z:2,facing:0,cargo:1,load:'satellite',task:'toDrop'}];
  view.update(state,1/30,1);const robot=view.rovers.get(2);
  assert.equal(robot.loadRoot.children[0].userData.item,'satellite');assert.equal(robot.cargo.visible,false);
  state.robots[0].load='chip';view.update(state,1/30,1);
  assert.equal(robot.loadRoot.children.length,1);assert.equal(robot.loadRoot.children[0].userData.item,'chip');
  state.robots[0].cargo=0;view.update(state,1/30,1);
  assert.equal(robot.loadRoot.visible,false);assert.equal(robot.loadRoot.children.length,0);assert.equal(robot.cargo.visible,false);
  view.dispose();
});

test('modeled cave finds and flares build correctly, follow discovery, and disappear when collected',()=>{
  // Canvas textures need a drawing surface, but mesh/discovery integration needs no WebGL context.
  const oldDocument=globalThis.document,oldWindow=globalThis.window;
  const context=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(o,key)=>o[key]??(()=>{})});
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>context}),body:{dataset:{},style:{setProperty(){}}}};
  globalThis.window={devicePixelRatio:1};
  try{
    for(const [kind,item,zone]of [['heart','heart',2],['artifact','artifact',1],['crystal','rareearth',1]]){
      const state=createState(),cave=caveLayout(state.seed,0,zone),loot=cave.loot.find(l=>l.kind===kind),memory=caveMemoryKey(0,zone);
      Object.assign(state.player,{cave:0,zone,x:loot.x*2+loot.dx*.8,z:loot.z*2+loot.dz*.8,facing:0});
      state.exploredCaves={[memory]:[...cave.cells]};state.flares=[{cave:0,zone,x:state.player.x+1,z:state.player.z,t:20}];
      const scene=new THREE.Scene(),view=createCaveView(state.seed,0,scene,zone,library);
      view.update(state,.1);
      const batch=view.root.getObjectByName(`Items_${item}`);
      assert.ok(batch?.visible&&batch.children.every(m=>m.count>0),`${item} uses authored parts`);
      const first=new THREE.Matrix4();batch.children[0].getMatrixAt(0,first);
      assert.ok(new THREE.Vector3().setFromMatrixScale(first).length()>0,'discovered item visible');
      assert.equal(takeLoot(state).ok,true);view.update(state,.1);
      const after=new THREE.Matrix4();batch.children[0].getMatrixAt(0,after);
      assert.equal(new THREE.Vector3().setFromMatrixScale(after).length(),0,'collected item hidden');
      view.dispose();assert.equal(scene.children.length,0);
    }
  }finally{
    if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;
    if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;
  }
});
