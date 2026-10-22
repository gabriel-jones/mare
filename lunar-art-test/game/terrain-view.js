import * as THREE from 'three';
import {heightAt,terrainData,randomStream,surfaceHeightAt} from './terrain.js';
export function createTerrainView(seed,root,models=new Map()){
 const random=randomStream(seed),data=terrainData(seed),geometries=[],materials=[],textures=[];
 const material=(color,options={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:1,...options});materials.push(m);return m;};
 const add=(geo,mat,parent=root)=>{geometries.push(geo);const m=new THREE.Mesh(geo,mat);m.receiveShadow=true;m.castShadow=true;parent.add(m);return m;};
 const pixels=new Uint8Array(128*128*4);
 for(let i=0;i<pixels.length;i+=4){const v=210+Math.floor(random()*28);pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;}
 const dust=new THREE.DataTexture(pixels,128,128);dust.wrapS=dust.wrapT=THREE.RepeatWrapping;dust.repeat.set(130,130);dust.generateMipmaps=true;dust.minFilter=THREE.LinearMipmapLinearFilter;dust.needsUpdate=true;textures.push(dust);
 // Voxel shelves: horizontal dust tops, short bevels and exposed rock walls.
 // There is no interpolation across a cliff step, so no triangular spike pattern.
 const vertices=[],colors=[],uvs=[],indices=[],dustColor=new THREE.Color('#999387'),stoneColor=new THREE.Color('#655f70');
 function face(points,color){const offset=vertices.length/3;for(const p of points){vertices.push(...p);colors.push(color.r,color.g,color.b);uvs.push(p[0]/384+.5,p[2]/384+.5);}for(let i=1;i<points.length-1;i++)indices.push(offset,offset+i,offset+i+1);}
 const heights=new Map();const sample=(x,z)=>{const key=`${x}:${z}`;if(!heights.has(key))heights.set(key,surfaceHeightAt(seed,x,z));return heights.get(key);};
 function cell(x,z,size){
  const h=sample(x,z),half=size/2,neighbors=[[0,-1],[1,0],[0,1],[-1,0]].map(([dx,dz])=>sample(x+dx*size,z+dz*size));
  const cliff=h>2||neighbors.some(n=>Math.abs(n-h)>=.75),bevel=cliff&&neighbors.some(n=>Math.abs(n-h)>.02)?.1:0,edgeH=h-(bevel?.08:0);
  const outer=[[x-half,edgeH,z-half],[x+half,edgeH,z-half],[x+half,edgeH,z+half],[x-half,edgeH,z+half]],inner=[[x-half+bevel,h,z-half+bevel],[x+half-bevel,h,z-half+bevel],[x+half-bevel,h,z+half-bevel],[x-half+bevel,h,z+half-bevel]];
  const top=dustColor.clone().lerp(stoneColor,cliff?.19:0);face([...inner].reverse(),top);
  for(let i=0;i<4;i++){
   const next=(i+1)%4;
   if(bevel)face([inner[i],inner[next],outer[next],outer[i]].reverse(),top.clone().lerp(stoneColor,.15));
   if(neighbors[i]<edgeH-.02){const lower=neighbors[i]-.08,wall=top.clone().lerp(stoneColor,Math.min(1,(h-neighbors[i])/1.1));face([outer[i],[outer[i][0],lower,outer[i][2]],[outer[next][0],lower,outer[next][2]],outer[next]],wall);}
  }
 }
 for(let z=-126;z<128;z+=4)for(let x=-126;x<128;x+=4)cell(x,z,4);
 for(let z=-220;z<224;z+=8)for(let x=-220;x<224;x+=8){if(Math.abs(x)<128&&Math.abs(z)<128)continue;cell(x,z,8);}
 const groundGeo=new THREE.BufferGeometry();groundGeo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));groundGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));groundGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));groundGeo.setIndex(indices);groundGeo.computeVertexNormals();
 const groundMat=material('#ffffff',{vertexColors:true,flatShading:true,side:THREE.DoubleSide});
 const blankRoof=new THREE.DataTexture(new Uint8Array([0]),1,1,THREE.RedFormat);blankRoof.needsUpdate=true;textures.push(blankRoof);
 const roofUniforms={uRoofMap:{value:blankRoof},uRoofEnabled:{value:0},uRoofOrigin:{value:new THREE.Vector2()},uRoofRotation:{value:new THREE.Vector2(0,1)},uRoofHeight:{value:0}};
 groundMat.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,roofUniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vPaintWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvPaintWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying vec3 vPaintWorld;
   uniform sampler2D uRoofMap;uniform float uRoofEnabled;uniform vec2 uRoofOrigin;uniform vec2 uRoofRotation;uniform float uRoofHeight;
   float paintHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float paintNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(paintHash(i),paintHash(i+vec2(1,0)),f.x),mix(paintHash(i+vec2(0,1)),paintHash(i+vec2(1,1)),f.x),f.y);}
  `).replace('#include <color_fragment>',`#include <color_fragment>
   float wash=paintNoise(vPaintWorld.xz*.055)*.8+paintNoise(vPaintWorld.xz*.19)*.2;
   vec3 cool=vec3(.83,.88,1.02),warm=vec3(1.1,1.035,.92);
   diffuseColor.rgb*=mix(cool,warm,smoothstep(.2,.85,wash));
   float rock=smoothstep(2.0,8.0,vPaintWorld.y);
   float strata=sin(vPaintWorld.y*.72+paintNoise(vPaintWorld.xz*.09)*2.5);
   diffuseColor.rgb*=1.0+rock*strata*.08;
   float drift=paintNoise(vec2(vPaintWorld.x*.32+vPaintWorld.z*.08,vPaintWorld.z*1.6));
   diffuseColor.rgb*=.99+drift*.02;
  `).replace('#include <opaque_fragment>',`
   vec2 delta=vPaintWorld.xz-max(0.0,vPaintWorld.y-uRoofHeight)*vec2(26.0/34.0)-uRoofOrigin;
   vec2 caveLocal=vec2(delta.x*uRoofRotation.y-delta.y*uRoofRotation.x,delta.x*uRoofRotation.x+delta.y*uRoofRotation.y);
   vec2 roofUV=(caveLocal/2.0+vec2(32.5,3.5))/64.0;
   float inMap=step(0.0,roofUV.x)*step(roofUV.x,1.0)*step(0.0,roofUV.y)*step(roofUV.y,1.0);
   float roof=texture2D(uRoofMap,roofUV).r*inMap*uRoofEnabled*step(uRoofHeight+.25,vPaintWorld.y);
   diffuseColor.a*=mix(1.0,.035,smoothstep(.15,.8,roof));
   #include <opaque_fragment>
  `);
 };
 const ground=add(groundGeo,groundMat);ground.castShadow=false;
 // Only the cliff casts terrain shadows. A huge self-shadowing floor produced
 // a square of shadow-map acne around the player at overview zoom.
 const cliffIndices=[];for(let i=0;i<indices.length;i+=3)if(indices.slice(i,i+3).some(index=>vertices[index*3+1]>3))cliffIndices.push(indices[i],indices[i+1],indices[i+2]);
 const cliffGeo=new THREE.BufferGeometry();cliffGeo.setAttribute('position',groundGeo.attributes.position);cliffGeo.setIndex(cliffIndices);
 const shadowCaster=add(cliffGeo,new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,side:THREE.DoubleSide}));materials.push(shadowCaster.material);shadowCaster.receiveShadow=false;shadowCaster.position.y=-.4;

 function setCaveCutaway(texture,origin,angle=0){
  const enabled=!!texture;roofUniforms.uRoofEnabled.value=enabled?1:0;roofUniforms.uRoofMap.value=texture||blankRoof;
  if(origin){roofUniforms.uRoofOrigin.value.set(origin.x,origin.z);roofUniforms.uRoofHeight.value=origin.y;roofUniforms.uRoofRotation.value.set(Math.sin(angle),Math.cos(angle));}
  if(groundMat.transparent!==enabled){groundMat.transparent=enabled;groundMat.depthWrite=!enabled;groundMat.needsUpdate=true;}
 }

 // Authored Blender meshes are instanced by variant, keeping repeated rocks cheap.
 const dummy=new THREE.Object3D(),rockBatches=[];
 for(let variant=0;variant<3;variant++){
  const template=models.get(['rock-a','rock-b','rock-c'][variant]);let source=null;
  template?.updateMatrixWorld(true);template?.traverse(o=>{if(o.isMesh&&!source)source=o;});
  if(!source)continue;
  const geo=source.geometry.clone().applyMatrix4(source.matrixWorld);geo.computeBoundingBox();const bounds=geo.boundingBox,size=new THREE.Vector3(),center=new THREE.Vector3();bounds.getSize(size);bounds.getCenter(center);geo.translate(-center.x,-bounds.min.y,-center.z);geo.scale(2/size.x,1/size.y,2/size.z);geometries.push(geo);
  const items=data.boulders.filter(r=>r.variant===variant),instances=new THREE.InstancedMesh(geo,source.material,items.length);instances.castShadow=true;instances.receiveShadow=true;root.add(instances);rockBatches.push({items,instances});
 }
 const portals=[];const caveDark=new THREE.MeshBasicMaterial({color:'#050609',side:THREE.DoubleSide});materials.push(caveDark);
 for(let id=0;id<data.caves.length;id++){
  const c=data.caves[id],group=new THREE.Group();group.position.set(c.x,surfaceHeightAt(seed,c.x,c.z),c.z);group.rotation.y=c.angle+Math.PI;root.add(group);
  const model=models.get('cave-mouth')?.clone(true);let roof=null;
  if(model){model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}if(o.name.startsWith('ArchRoof'))roof=o;});group.add(model);}
  const back=add(new THREE.CircleGeometry(2.65,20,0,Math.PI),caveDark,group);back.scale.y=1.73;back.position.z=-1.8;back.castShadow=false;
  portals.push({id,roof,back});
 }
 const pebbleGeo=new THREE.IcosahedronGeometry(1,0);geometries.push(pebbleGeo);const pebbleMat=material('#77717b');
 const pebbles=new THREE.InstancedMesh(pebbleGeo,pebbleMat,450);pebbles.receiveShadow=true;root.add(pebbles);
 const pebbleData=Array.from({length:450},(_,i)=>{let x,z;if(i<300){const c=data.craters[i%data.craters.length],a=random()*6.28,r=c.radius*(.9+random()*.6);x=c.x+Math.sin(a)*r;z=c.z+Math.cos(a)*r;}else{x=(random()-.5)*180;z=(random()-.5)*180;}return {x,z,size:.06+random()*.15,angle:random()*6.28};});let occupancy=null;
 function update(buildings,footprint,player){
  for(const p of portals){const inside=player?.cave===p.id;if(p.roof)p.roof.visible=!inside;p.back.visible=!inside;}
  const key=buildings.map(b=>[b.id,b.x,b.z,b.rotation].join(':')).join('|');if(key===occupancy)return;occupancy=key;
  const occupied=new Set(buildings.flatMap(b=>footprint(b.type,b.x,b.z,b.rotation).map(c=>`${c.x},${c.z}`)));
  for(const batch of rockBatches){batch.items.forEach((r,i)=>{const hidden=buildings.some(b=>footprint(b.type,b.x,b.z,b.rotation).some(c=>Math.abs(c.x*2-r.x)<r.radius+1.5&&Math.abs(c.z*2-r.z)<r.radius+1.5));dummy.position.set(r.x,surfaceHeightAt(seed,r.x,r.z)-.12,r.z);dummy.rotation.set(.04,r.angle,.03);dummy.scale.set(hidden?0:r.radius,hidden?0:r.height,hidden?0:r.radius);dummy.updateMatrix();batch.instances.setMatrixAt(i,dummy.matrix);});batch.instances.instanceMatrix.needsUpdate=true;}
  pebbleData.forEach((r,i)=>{dummy.position.set(r.x,surfaceHeightAt(seed,r.x,r.z),r.z);dummy.rotation.set(0,r.angle,.2);dummy.scale.set(r.size,r.size*.45,r.size);if(occupied.has(`${Math.round(r.x/2)},${Math.round(r.z/2)}`)||Math.hypot(r.x,r.z+10)<9)dummy.scale.setScalar(0);dummy.updateMatrix();pebbles.setMatrixAt(i,dummy.matrix);});pebbles.instanceMatrix.needsUpdate=true;
 }
 return {ground,update,setCaveCutaway,dispose(){root.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
