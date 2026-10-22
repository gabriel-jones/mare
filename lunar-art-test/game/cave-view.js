import {terrainData} from './terrain.js';
import * as THREE from 'three';
import {caveLayout,visibleCaveCells,CAVE_CELL} from './caves.js';

export function createCaveView(seed,id,parent){
 const angle=terrainData(seed).caves[id].angle,viewX=Math.cos(angle)-Math.sin(angle),viewZ=Math.sin(angle)+Math.cos(angle);
 const cave=caveLayout(seed,id),root=new THREE.Group();parent.add(root);
 const floorGeo=new THREE.PlaneGeometry(2.04,2.04);floorGeo.rotateX(-Math.PI/2);
 const floorMat=new THREE.MeshBasicMaterial({color:'#ffffff',fog:false});
 const wallGeo=new THREE.BoxGeometry(2.12,1,.65,1,2,1),wallMat=new THREE.MeshBasicMaterial({color:'#ffffff',vertexColors:true,fog:false});
 const torchUniforms={uTorchPosition:{value:new THREE.Vector2()},uTorchFacing:{value:new THREE.Vector2(0,1)}};
 for(const material of [floorMat,wallMat])material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,torchUniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vTorchLocal;').replace('#include <project_vertex>','#include <project_vertex>\nvTorchLocal=(instanceMatrix*vec4(transformed,1.0)).xz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vTorchLocal;uniform vec2 uTorchPosition;uniform vec2 uTorchFacing;').replace('#include <opaque_fragment>',`
   vec2 torchDelta=vTorchLocal-uTorchPosition;float torchDistance=length(torchDelta);
   float cone=smoothstep(.5,.88,dot(torchDelta/max(.01,torchDistance),uTorchFacing));
   float nearby=1.0-smoothstep(.3,3.6,torchDistance);
   float torchLight=.025+(.23*nearby+.65*cone)*pow(max(0.0,1.0-torchDistance/17.0),1.5);
   outgoingLight*=torchLight;
   #include <opaque_fragment>
  `);
 };
 const wp=wallGeo.attributes.position;for(let i=0;i<wp.count;i++){const x=wp.getX(i),y=wp.getY(i),z=wp.getZ(i);wp.setXYZ(i,x+Math.sin(y*7+z*4)*.09,y,z+Math.sin(x*9+y*5)*.12);}wallGeo.computeVertexNormals();
 const faceColors=[];for(let i=0;i<wp.count;i++){const n=wallGeo.attributes.normal,shade=.65+Math.max(0,n.getY(i))*.25+Math.max(0,n.getX(i))*.1;faceColors.push(shade*.84,shade*.9,shade);}wallGeo.setAttribute('color',new THREE.Float32BufferAttribute(faceColors,3));
 const roofPixels=new Uint8Array(64*64),roofMap=new THREE.DataTexture(roofPixels,64,64,THREE.RedFormat);roofMap.minFilter=THREE.LinearFilter;roofMap.magFilter=THREE.LinearFilter;roofMap.needsUpdate=true;

 const floor=new THREE.InstancedMesh(floorGeo,floorMat,cave.tiles.length);floor.receiveShadow=true;root.add(floor);
 const edges=[];for(const cell of cave.tiles)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(!cave.cells.has(`${cell.x+dx},${cell.z+dz}`))edges.push({...cell,dx,dz});
 const walls=new THREE.InstancedMesh(wallGeo,wallMat,edges.length);walls.receiveShadow=true;root.add(walls);
 floor.frustumCulled=false;walls.frustumCulled=false;
 const entrance=new THREE.PointLight('#a6c2dd',15,18,2);entrance.position.set(0,2.8,-1);root.add(entrance);
 const dummy=new THREE.Object3D(),color=new THREE.Color();let visible=new Set(),seen=new Set(),clock=1,lastFacing=-100,lastX=-100,lastZ=-100;
 function update(state,dt){
  clock+=dt;const p=state.player;if(clock<.09&&Math.abs(lastFacing-p.facing)<.18&&Math.hypot(lastX-p.x,lastZ-p.z)<.5)return;
  clock=0;lastFacing=p.facing;lastX=p.x;lastZ=p.z;torchUniforms.uTorchPosition.value.set(p.x,p.z);torchUniforms.uTorchFacing.value.set(Math.sin(p.facing),Math.cos(p.facing));
  if(!seen.size)seen=new Set(state.exploredCaves?.[id]||[]);
  visible=visibleCaveCells(cave,p.x,p.z,p.facing);let changed=false;for(const key of visible)if(!seen.has(key)){seen.add(key);changed=true;}
  if(changed){state.exploredCaves??={};state.exploredCaves[id]=[...seen];}
  roofPixels.fill(0);for(const key of seen){const [x,z]=key.split(',').map(Number);if(!visible.has(key)&&Math.hypot(x*2-p.x,z*2-p.z)>6)continue;const index=(z+3)*64+x+32;if(index>=0&&index<roofPixels.length)roofPixels[index]=255;}roofMap.needsUpdate=true;
  cave.tiles.forEach((cell,i)=>{
   const lit=visible.has(cell.key),known=seen.has(cell.key),distance=Math.hypot(cell.x*2-p.x,cell.z*2-p.z);
   dummy.position.set(cell.x*CAVE_CELL,-.035+Math.sin(cell.x*1.7+cell.z*.4)*.025,cell.z*CAVE_CELL);dummy.rotation.set(0,0,0);dummy.scale.setScalar(known?1:0);dummy.updateMatrix();floor.setMatrixAt(i,dummy.matrix);
   color.set(lit?'#8b918b':'#1b242c');floor.setColorAt(i,color);
  });
  edges.forEach((edge,i)=>{
   const known=seen.has(edge.key),lit=visible.has(edge.key),x=edge.x*2+edge.dx,z=edge.z*2+edge.dz,distance=Math.hypot(x-p.x,z-p.z);
   // The near-facing wall is cut down locally to preserve the isometric player view.
   let height=3.6+Math.sin(edge.x*3.2+edge.z*2.7)*.45;
   if(edge.dx*viewX+edge.dz*viewZ>0&&distance<11)height=.35+Math.max(0,distance-3)*.22;
   dummy.position.set(x,height/2-.05,z);dummy.rotation.set(0,edge.dx?Math.PI/2:0,0);dummy.scale.set(known?1:0,known?height:0,known?1:0);dummy.updateMatrix();walls.setMatrixAt(i,dummy.matrix);color.set(lit?'#77827c':'#151e27');walls.setColorAt(i,color);
  });
  floor.instanceMatrix.needsUpdate=true;walls.instanceMatrix.needsUpdate=true;floor.instanceColor.needsUpdate=true;walls.instanceColor.needsUpdate=true;
  document.body.dataset.caveVisible=String(visible.size);document.body.dataset.caveExplored=String(seen.size);
 }
 return {root,roofMap,update,dispose(){parent.remove(root);roofMap.dispose();floorGeo.dispose();floorMat.dispose();wallGeo.dispose();wallMat.dispose();}};
}
