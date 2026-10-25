import * as THREE from 'three';
import {terrainData,randomStream,surfaceHeightAt,latticeHeight,facetFlip,FACET} from './terrain.js';
export function createTerrainView(seed,root,models=new Map()){
 const random=randomStream(seed),data=terrainData(seed),geometries=[],materials=[],textures=[];
 const material=(color,options={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:1,...options});materials.push(m);return m;};
 const add=(geo,mat,parent=root)=>{geometries.push(geo);const m=new THREE.Mesh(geo,mat);m.receiveShadow=true;m.castShadow=true;parent.add(m);return m;};
 const pixels=new Uint8Array(128*128*4);
 for(let i=0;i<pixels.length;i+=4){const v=210+Math.floor(random()*28);pixels[i]=pixels[i+1]=pixels[i+2]=v;pixels[i+3]=255;}
 const dust=new THREE.DataTexture(pixels,128,128);dust.wrapS=dust.wrapT=THREE.RepeatWrapping;dust.repeat.set(130,130);dust.generateMipmaps=true;dust.minFilter=THREE.LinearMipmapLinearFilter;dust.needsUpdate=true;textures.push(dust);
 // Faceted maria: one flat-shaded triangle per lattice half-square, each coloured on its own so the facets read.
 // Steep facets go rocky, crater floors darker, and the bigger craters throw bright ejecta rays.
 const positions=[],colors=[],uvs=[],N=Math.ceil(224/FACET),mars=data.mars;
 // Mars: rust dust over darker basalt, red-brown cliff faces, ochre ejecta; the same faceted language as the Moon.
 const palette=mars?['#b4633a','#6b3321','#8b4630','#91502f','#d39a68']:['#9c968a','#4d4a47','#655f70','#5a5650','#cdc6b8'];
 const [dustColor,mareColor,stoneColor,floorColor,rayColor]=palette.map(c=>new THREE.Color(c)),color=new THREE.Color();
 // Ore shows at the surface of each deposit, breaking up toward its edge.
 const ORE={iron:new THREE.Color('#4a2c25'),titanium:new THREE.Color('#9d9c9b'),gold:new THREE.Color('#c89a3c'),ice:new THREE.Color('#e9e4de')};
 const deposits=data.deposits.map(d=>({...d,ore:ORE[d.kind]}));
 const rays=data.craters.map(()=>Array.from({length:28},()=>random()**3)),craters=data.craters.map(c=>({...c,cos:Math.cos(c.angle),sin:Math.sin(c.angle)}));
 const smooth=(a,b,t)=>{t=Math.max(0,Math.min(1,(t-a)/(b-a)));return t*t*(3-2*t);};
 const cell=(i,j)=>{let n=Math.imul(i,73856093)^Math.imul(j,19349663)^Math.imul(seed+31,83492791);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
 const value=(x,z)=>{const i=Math.floor(x),j=Math.floor(z),u=smooth(0,1,x-i),v=smooth(0,1,z-j);return (cell(i,j)*(1-u)+cell(i+1,j)*u)*(1-v)+(cell(i,j+1)*(1-u)+cell(i+1,j+1)*u)*v;};
 // Dark basalt mare pooled between pale highland dust, broken into a few big blots.
 const mare=(x,z)=>smooth(.44,.56,value(x*.03,z*.03)*.65+value(x*.09,z*.09)*.35)*.85;
 const ab=new THREE.Vector3(),ac=new THREE.Vector3(),normal=new THREE.Vector3();
 function facet(p0,p1,p2){
  ab.set(p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]);ac.set(p2[0]-p0[0],p2[1]-p0[1],p2[2]-p0[2]);normal.crossVectors(ac,ab).normalize();
  const x=(p0[0]+p1[0]+p2[0])/3,z=(p0[2]+p1[2]+p2[2])/3,cavity=(p0[3]+p1[3]+p2[3])/3;
  color.copy(dustColor).lerp(mareColor,mare(x,z)).lerp(stoneColor,smooth(.03,.3,1-Math.abs(normal.y))*.6);
  craters.forEach((c,n)=>{
   const dx=x-c.x,dz=z-c.z,reach=c.radius*3.2;if(dx>reach||dx<-reach||dz>reach||dz<-reach)return;
   const side=dx*c.cos-dz*c.sin,depth=dx*c.sin+dz*c.cos,d=Math.hypot(side/c.radius,depth/(c.radius*c.aspect));
   if(d>3)return;
   if(d<.9)color.lerp(floorColor,.45*(1-d/.9)+.2);
   if(c.radius>3&&d>.95){const t=(Math.atan2(depth,side)/(Math.PI*2)+.5)*rays[n].length,k=Math.floor(t),f=t-k,w=rays[n][k%rays[n].length]*(1-f)+rays[n][(k+1)%rays[n].length]*f;color.lerp(rayColor,w*.55*smooth(.95,1.2,d)*(1-smooth(1.3,3,d)));}
  });
  for(const d of deposits){
   const r=Math.hypot(x-d.x,z-d.z)/d.radius;if(r>1.6)continue;
   const broken=r+(value(x*.9+d.id*7,z*.9)-.5)*.7;
   if(broken<1.15)color.lerp(d.ore,(1-smooth(.55,1.15,broken))*(.75+value(x*2.3,z*2.3)*.25));
  }
  // Hollows sink into shade and ridges catch light, so relief reads even under a high sun.
  color.multiplyScalar(Math.max(.62,Math.min(1.3,1-cavity*3-Math.min(0,cavity)*1.2))*(.95+((Math.sin(x*12.9898+z*78.233)*43758.5453)%1+1)%1*.1));
  for(const p of [p0,p1,p2]){positions.push(p[0],p[1],p[2]);colors.push(color.r,color.g,color.b);uvs.push(p[0]/384+.5,p[2]/384+.5);}
 }
 const corner=(i,j)=>{const h=latticeHeight(seed,i,j);return [i*FACET,h,j*FACET,((latticeHeight(seed,i+1,j)+latticeHeight(seed,i-1,j)+latticeHeight(seed,i,j+1)+latticeHeight(seed,i,j-1))/4-h)/FACET];};
 for(let j=-N;j<N;j++)for(let i=-N;i<N;i++){
  const a=corner(i,j),b=corner(i+1,j),c=corner(i,j+1),d=corner(i+1,j+1);
  if(facetFlip(seed,i,j)){facet(a,b,c);facet(b,d,c);}else{facet(a,b,d);facet(a,d,c);}
 }
 const groundGeo=new THREE.BufferGeometry();groundGeo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));groundGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));groundGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));groundGeo.computeVertexNormals();
 const groundMat=material('#ffffff',{vertexColors:true,flatShading:true,side:THREE.DoubleSide});
 // Martian washes run warm; mesa walls show bands of paler and darker sediment.
 const tints=mars?{cool:'vec3(.9,.86,.86)',warm:'vec3(1.1,.98,.86)',strata:'.17',band:'diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.22,1.1,.92),rock*smoothstep(.55,.9,sin(vPaintWorld.y*2.1+paintNoise(vPaintWorld.xz*.05)*1.5)*.5+.5)*.6);'}
  :{cool:'vec3(.83,.88,1.02)',warm:'vec3(1.1,1.035,.92)',strata:'.08',band:''};
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
   vec3 cool=${tints.cool},warm=${tints.warm};
   diffuseColor.rgb*=mix(cool,warm,smoothstep(.2,.85,wash));
   float rock=smoothstep(2.0,8.0,vPaintWorld.y);
   float strata=sin(vPaintWorld.y*.72+paintNoise(vPaintWorld.xz*.09)*2.5);
   diffuseColor.rgb*=1.0+rock*strata*${tints.strata};
   ${tints.band}
   float drift=paintNoise(vec2(vPaintWorld.x*.32+vPaintWorld.z*.08,vPaintWorld.z*1.6));
   diffuseColor.rgb*=.99+drift*.02;
  `).replace('#include <opaque_fragment>',`
   vec2 delta=vPaintWorld.xz-max(0.0,vPaintWorld.y-uRoofHeight)*vec2(26.0/34.0)-uRoofOrigin;
   vec2 caveLocal=vec2(delta.x*uRoofRotation.y-delta.y*uRoofRotation.x,delta.x*uRoofRotation.x+delta.y*uRoofRotation.y);
   // Noise breaks the cut's edge, which would otherwise step along the cave's cells.
   vec2 roofUV=(caveLocal/2.0+(vec2(paintNoise(caveLocal*.7),paintNoise(caveLocal*.7+9.1))-.5)*.7+vec2(32.5,3.5))/64.0;
   float inMap=step(0.0,roofUV.x)*step(roofUV.x,1.0)*step(0.0,roofUV.y)*step(roofUV.y,1.0);
   // Full is open roof over what is in view, cut at any height: where the hill dips to the cave's floor its ground
   // would otherwise lie across the passage. Half is the rest of the cave's footprint, where only ground down at
   // floor level goes, so the dark beside the lamp's reach stays dark without unseating the hill above it.
   float roof=texture2D(uRoofMap,roofUV).r*inMap*uRoofEnabled;
   // Discarding keeps the material opaque, so entering a cave never forces a shader recompile.
   if(roof>.75||roof>.2&&vPaintWorld.y<uRoofHeight+1.2)discard;
   #include <opaque_fragment>
  `);
 };
 const ground=add(groundGeo,groundMat);ground.castShadow=false;
 // Only raised ground and steep walls cast terrain shadows. A huge self-shadowing floor produced
 // a square of shadow-map acne around the player at overview zoom.
 const casting=[],steep=(i)=>{ab.set(positions[i+3]-positions[i],positions[i+4]-positions[i+1],positions[i+5]-positions[i+2]);ac.set(positions[i+6]-positions[i],positions[i+7]-positions[i+1],positions[i+8]-positions[i+2]);return Math.abs(normal.crossVectors(ac,ab).normalize().y)<.86;};
 for(let i=0;i<positions.length;i+=9)if(positions[i+1]>1||positions[i+4]>1||positions[i+7]>1||steep(i))casting.push(...positions.slice(i,i+9));
 const cliffGeo=new THREE.BufferGeometry();cliffGeo.setAttribute('position',new THREE.Float32BufferAttribute(casting,3));
 const shadowCaster=add(cliffGeo,new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false,side:THREE.DoubleSide}));materials.push(shadowCaster.material);shadowCaster.receiveShadow=false;shadowCaster.position.y=-.4;

 function setCaveCutaway(texture,origin,angle=0){
  const enabled=!!texture;roofUniforms.uRoofEnabled.value=enabled?1:0;roofUniforms.uRoofMap.value=texture||blankRoof;
  if(origin){roofUniforms.uRoofOrigin.value.set(origin.x,origin.z);roofUniforms.uRoofHeight.value=origin.y;roofUniforms.uRoofRotation.value.set(Math.sin(angle),Math.cos(angle));}
 }

 // On Mars the authored grey rock takes on the iron-oxide red of everything else.
 const reddened=new Map();
 function redden(m){if(!reddened.has(m)){const c=m.clone();c.color.multiply(new THREE.Color(1.5,.82,.6));materials.push(c);reddened.set(m,c);}return reddened.get(m);}
 // Authored Blender meshes are instanced by variant, keeping repeated rocks cheap.
 const dummy=new THREE.Object3D(),rockBatches=[];
 for(let variant=0;variant<3;variant++){
  const template=models.get(['rock-a','rock-b','rock-c'][variant]);let source=null;
  template?.updateMatrixWorld(true);template?.traverse(o=>{if(o.isMesh&&!source)source=o;});
  if(!source)continue;
  const geo=source.geometry.clone().applyMatrix4(source.matrixWorld);geo.computeBoundingBox();const bounds=geo.boundingBox,size=new THREE.Vector3(),center=new THREE.Vector3();bounds.getSize(size);bounds.getCenter(center);geo.translate(-center.x,-bounds.min.y,-center.z);geo.scale(2/size.x,1/size.y,2/size.z);geometries.push(geo);
  const items=data.boulders.filter(r=>r.variant===variant),instances=new THREE.InstancedMesh(geo,mars?redden(source.material):source.material,items.length);instances.castShadow=true;instances.receiveShadow=true;root.add(instances);rockBatches.push({items,instances});
 }
 const portals=[];const caveDark=new THREE.MeshBasicMaterial({color:'#050609',side:THREE.DoubleSide});materials.push(caveDark);
 for(let id=0;id<data.caves.length;id++){
  const c=data.caves[id],group=new THREE.Group();group.position.set(c.x,surfaceHeightAt(seed,c.x,c.z),c.z);group.rotation.y=c.angle+Math.PI;root.add(group);
  const model=models.get('cave-mouth')?.clone(true);let roof=null;
  if(model){model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(mars)o.material=Array.isArray(o.material)?o.material.map(redden):redden(o.material);}if(o.name.startsWith('ArchRoof'))roof=o;});group.add(model);}
  const back=add(new THREE.CircleGeometry(2.65,20,0,Math.PI),caveDark,group);back.scale.y=1.73;back.position.z=-1.8;back.castShadow=false;
  portals.push({id,roof,back});
 }
 const pebbleGeo=new THREE.IcosahedronGeometry(1,0);geometries.push(pebbleGeo);const pebbleMat=material(mars?'#7d4129':'#77717b');
 // Each deposit is strewn with lumps of its ore: dull iron, pale titanium, glinting gold, frost-white ice.
 const nuggetData=deposits.flatMap(d=>Array.from({length:Math.round(d.radius*7)},()=>{const a=random()*6.28,r=Math.sqrt(random())*d.radius*.95;return {x:d.x+Math.sin(a)*r,z:d.z+Math.cos(a)*r,size:.1+random()**2*.32,angle:random()*6.28,tilt:random(),kind:d.kind};}));
 const NUGGET={iron:['#3b2724',.35,.55],titanium:['#c9cdd2',.7,.3],gold:['#e0b04a',.95,.22],ice:['#eef6fb',0,.18]};
 const nuggets=nuggetData.length?new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),material('#ffffff',{flatShading:true,metalness:.6,roughness:.35}),nuggetData.length):null;
 if(nuggets){geometries.push(nuggets.geometry);nuggets.castShadow=true;nuggets.receiveShadow=true;root.add(nuggets);
  nuggetData.forEach((n,i)=>{const [hex,metal]=NUGGET[n.kind];dummy.position.set(n.x,surfaceHeightAt(seed,n.x,n.z)+n.size*.2,n.z);dummy.rotation.set(n.tilt,n.angle,n.tilt*.5);dummy.scale.set(n.size*(1+metal*.3),n.size*.7,n.size);dummy.updateMatrix();nuggets.setMatrixAt(i,dummy.matrix);nuggets.setColorAt(i,color.set(hex));});}
 const pebbles=new THREE.InstancedMesh(pebbleGeo,pebbleMat,450);pebbles.receiveShadow=true;root.add(pebbles);
 const pebbleData=Array.from({length:450},(_,i)=>{let x,z;if(i<300){const c=data.craters[i%data.craters.length],a=random()*6.28,r=c.radius*(.9+random()*.6);x=c.x+Math.sin(a)*r;z=c.z+Math.cos(a)*r;}else{x=(random()-.5)*180;z=(random()-.5)*180;}return {x,z,size:.06+random()*.15,angle:random()*6.28};});let occupancy=null;
 function update(buildings,footprint,player){
  for(const p of portals){const inside=player?.cave===p.id;if(p.roof)p.roof.visible=!inside;p.back.visible=!inside;}
  const key=buildings.map(b=>[b.id,b.x,b.z,b.rotation].join(':')).join('|');if(key===occupancy)return;occupancy=key;
  const occupied=new Set(buildings.flatMap(b=>footprint(b.type,b.x,b.z,b.rotation).map(c=>`${c.x},${c.z}`)));
  for(const batch of rockBatches){batch.items.forEach((r,i)=>{const hidden=buildings.some(b=>footprint(b.type,b.x,b.z,b.rotation).some(c=>Math.abs(c.x*2-r.x)<r.radius+1.5&&Math.abs(c.z*2-r.z)<r.radius+1.5));dummy.position.set(r.x,surfaceHeightAt(seed,r.x,r.z)-.12,r.z);dummy.rotation.set(.04,r.angle,.03);dummy.scale.set(hidden?0:r.radius,hidden?0:r.height,hidden?0:r.radius);dummy.updateMatrix();batch.instances.setMatrixAt(i,dummy.matrix);});batch.instances.instanceMatrix.needsUpdate=true;}
  pebbleData.forEach((r,i)=>{dummy.position.set(r.x,surfaceHeightAt(seed,r.x,r.z),r.z);dummy.rotation.set(0,r.angle,.2);dummy.scale.set(r.size,r.size*.45,r.size);if(occupied.has(`${Math.round(r.x/2)},${Math.round(r.z/2)}`)||Math.hypot(r.x,r.z+10)<9)dummy.scale.setScalar(0);dummy.updateMatrix();pebbles.setMatrixAt(i,dummy.matrix);});pebbles.instanceMatrix.needsUpdate=true;
  if(nuggets){nuggetData.forEach((n,i)=>{const hide=occupied.has(`${Math.round(n.x/2)},${Math.round(n.z/2)}`);dummy.position.set(n.x,surfaceHeightAt(seed,n.x,n.z)+n.size*.2,n.z);dummy.rotation.set(n.tilt,n.angle,n.tilt*.5);dummy.scale.set(hide?0:n.size*1.15,hide?0:n.size*.7,hide?0:n.size);dummy.updateMatrix();nuggets.setMatrixAt(i,dummy.matrix);});nuggets.instanceMatrix.needsUpdate=true;}
 }
 return {ground,update,setCaveCutaway,dispose(){root.clear();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
