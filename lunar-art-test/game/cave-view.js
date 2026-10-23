import {terrainData} from './terrain.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {caveLayout,visibleCaveCells,lineVisible,CAVE_CELL,SIGHT_RADIUS,BEAM_RANGE,CAVE_ZONES} from './caves.js';
import {FLARE,MAX_DROPS,flareNow} from './peril.js';
import {flareLight,FLARE_LIGHT,FLARE_GLOW} from './flare-view.js';

const LIGHTS=8;
/** The seen field covers cave cells x -32..31, z -4..59 (caves are carved within x ±24, z -1..55, walls a cell beyond). */
const SEEN_SIZE=64,SEEN_X0=32,SEEN_Z0=4;
/**
 * Sight underground, shared by every lit surface: a dim cold circle around the player that fades to black,
 * a warmer headlamp beam ahead, and up to LIGHTS nearby glows (crystals, vents, the shaft of daylight, flares), each
 * uGlow (x, z, strength, radius).
 */
export const SIGHT_PARS=`varying vec2 vCaveLocal;varying float vSeen;uniform vec2 uPlayer;uniform vec2 uFacing;uniform float uFlicker;
uniform vec4 uGlow[${LIGHTS}];uniform vec3 uGlowColor[${LIGHTS}];uniform vec3 uVoid;uniform sampler2D uSeenMap;
float caveHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float caveNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(caveHash(i),caveHash(i+vec2(1,0)),f.x),mix(caveHash(i+vec2(0,1)),caveHash(i+vec2(1,1)),f.x),f.y);}
// How much of a point is in view: the per-cell field blurred between cells, its edge pushed about by noise so the
// boundary of what the lamp reaches wanders like a real shadow instead of stepping along the grid.
float caveSeen(vec2 p){
 vec2 q=p+(vec2(caveNoise(p*.8),caveNoise(p*.8+17.3))-.5)*.9;
 return smoothstep(.15,.85,texture2D(uSeenMap,(q/${CAVE_CELL}.0+vec2(${SEEN_X0}.5,${SEEN_Z0}.5))/${SEEN_SIZE}.0).r);
}
float caveGrit(vec2 p){return .72+.3*caveNoise(p*.9)+.16*caveNoise(p*4.3)+.08*caveNoise(p*13.0);}
vec3 caveSightRaw(vec2 p){
 vec2 d=p-uPlayer;float r=length(d);
 float aura=1.0-smoothstep(1.5,${SIGHT_RADIUS.toFixed(1)},r);
 float beam=smoothstep(.52,.9,dot(d/max(.01,r),uFacing))*pow(max(0.0,1.0-r/${BEAM_RANGE.toFixed(1)}),1.4);
 return (vec3(.012,.014,.02)+vec3(.5,.58,.74)*.42*aura*aura+vec3(1.0,.93,.8)*.78*beam)*uFlicker;
}
/** A pool of darkness carried by something that eats light: uVoid is (x, z, strength). */
float caveVoid(vec2 p){return 1.0-uVoid.z*(1.0-smoothstep(1.0,4.5,length(p-uVoid.xy)));}
vec3 caveSight(vec2 p){return caveSightRaw(p)*caveVoid(p);}
vec3 caveGlow(vec2 p){
 vec3 g=vec3(0.0);
 for(int i=0;i<${LIGHTS};i++){float d=length(p-uGlow[i].xy);g+=uGlowColor[i]*uGlow[i].z*pow(max(0.0,1.0-d/uGlow[i].w),2.0);}
 return g;
}`;

/** Light colours for crystals, vents and the daylight shaft. */
const GLOW={cyan:new THREE.Color(.25,.8,1),violet:new THREE.Color(.62,.36,1),vent:new THREE.Color(.45,.9,.3),sky:new THREE.Color(.6,.72,.95)};
const TILE_COLORS={floor:'#8b918b',spire:'#8b918b',ice:'#a8c4d6',vent:'#5d6552',toxic:'#55672f',bridge:'#7b8079',shaftUp:'#8b918b'};

/** The Blender formation kit (cave-formations.glb), loading in the background; caves use cones until it arrives. */
const FORMATION_NAMES=['Stalagmite','Twin','Column','Stump','Cluster'];
let formationGeometries=null;
const formationsReady=typeof window==='undefined'?Promise.resolve(null):new GLTFLoader().loadAsync(new URL('./assets/cave-formations.glb',import.meta.url).href).then(gltf=>{
 const found={};gltf.scene.traverse(o=>{if(o.isMesh)found[o.name.replace('Formation_','')]=o.geometry;});
 formationGeometries=FORMATION_NAMES.every(n=>found[n])?found:null;return formationGeometries;
}).catch(()=>null);

export const caveMemoryKey=(id,zone=0)=>zone?`${id}:${zone}`:String(id);

export function createCaveView(seed,id,parent,zone=0,itemModels=null){
 const angle=terrainData(seed).caves[id].angle,viewX=Math.cos(angle)-Math.sin(angle),viewZ=Math.sin(angle)+Math.cos(angle);
 const cave=caveLayout(seed,id,zone),root=new THREE.Group(),memory=caveMemoryKey(id,zone);parent.add(root);
 const seenNow=new Float32Array(SEEN_SIZE*SEEN_SIZE),seenTarget=new Float32Array(SEEN_SIZE*SEEN_SIZE),seenPixels=new Uint8Array(SEEN_SIZE*SEEN_SIZE);
 const seenMap=new THREE.DataTexture(seenPixels,SEEN_SIZE,SEEN_SIZE,THREE.RedFormat);seenMap.minFilter=seenMap.magFilter=THREE.LinearFilter;seenMap.needsUpdate=true;
 const sight={uSeenMap:{value:seenMap},uPlayer:{value:new THREE.Vector2()},uFacing:{value:new THREE.Vector2(0,1)},uFlicker:{value:1},uVoid:{value:new THREE.Vector3()},
  uGlow:{value:Array.from({length:LIGHTS},()=>new THREE.Vector4(0,0,0,6))},uGlowColor:{value:Array.from({length:LIGHTS},()=>new THREE.Color(0,0,0))}};
 const disposables=[],keep=x=>(disposables.push(x),x);
 /** Instanced surfaces lit by sight, which they take from the seen field where they stand. */
 // `goo` glazes formations from the tip down with the crawler's black goo, in drips of uneven length (aGoo per instance).
 const litMaterial=(vertexColors,goo=false)=>{
  const material=keep(new THREE.MeshBasicMaterial({color:'#ffffff',vertexColors,fog:false}));
  material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,sight);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vCaveLocal;varying float vSeen;'+(goo?'attribute float aGoo;varying float vGoo;varying vec3 vLocal;':'')).replace('#include <project_vertex>','#include <project_vertex>\nvCaveLocal=(instanceMatrix*vec4(transformed,1.0)).xz;'+(goo?'vGoo=aGoo;vLocal=transformed;':''));
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+SIGHT_PARS+(goo?'varying float vGoo;varying vec3 vLocal;':'')).replace('#include <opaque_fragment>',`
    vec3 glow=caveGlow(vCaveLocal);
    vec3 ghost=diffuseColor.rgb*(vec3(.42,.55,.85)*.07+glow*.5);
    float seenHere=caveSeen(vCaveLocal);
    outgoingLight=mix(ghost,outgoingLight*(caveSight(vCaveLocal)*caveGrit(vCaveLocal)+glow),seenHere);
    ${goo?`float streak=caveNoise(vec2(atan(vLocal.z,vLocal.x)*2.4+vGoo*31.0,vGoo*7.0)),edge=1.0-vGoo*(.15+.8*streak*streak);
    float coat=smoothstep(edge-.012,edge+.012,vLocal.y)*step(.01,vGoo);
    vec3 lit=caveSight(vCaveLocal)+glow,wet=vec3(.03,.03,.04)*lit+lit*pow(caveNoise(vCaveLocal*8.0+vLocal.y*11.0),7.0)*1.4;
    outgoingLight=mix(outgoingLight,mix(ghost*.15,wet,seenHere),coat);`:''}
    #include <opaque_fragment>
   `);
  };
  return material;
 };
 const floorMat=litMaterial(false),rockMat=litMaterial(true),formationMat=litMaterial(true,true);
 const groups=[];let disposed=false;
 function litGroup(geometry,material,items,place,color){
  const mesh=new THREE.InstancedMesh(keep(geometry),material,Math.max(1,items.length));mesh.count=items.length;mesh.frustumCulled=false;root.add(mesh);
  const c=new THREE.Color();items.forEach((item,i)=>{c.set(color(item));const n=Math.sin(item.x*12.9+item.z*78.2+i*.37)*43758.5;c.multiplyScalar(.85+(n-Math.floor(n))*.2);mesh.setColorAt(i,c);});
  if(!items.length)mesh.setColorAt(0,c.set('#000'));
  const group={mesh,items,place};groups.push(group);return group;
 }
 const shade=geometry=>{geometry.computeVertexNormals();const n=geometry.attributes.normal,colors=[];for(let i=0;i<n.count;i++){const s=.62+Math.max(0,n.getY(i))*.28+Math.max(0,n.getX(i))*.1;colors.push(s*.84,s*.9,s);}geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return geometry;};
 // Authored glowing finds retain their material colors and faceted volume in the
 // cave's custom lighting. These clones belong to this cave, never the shared library.
 const itemBatches=[];
 function glowingItems(type,capacity,size){
  const batch=itemModels?.batch(type,Math.max(1,capacity),size);if(!batch)return null;
  for(const mesh of batch.meshes){
   const source=mesh.material;
   mesh.geometry=keep(shade(mesh.geometry.clone()));
   const color=source.color.clone().add(source.emissive.clone().multiplyScalar(source.emissiveIntensity??1));
   mesh.material=keep(new THREE.MeshBasicMaterial({color,vertexColors:true,fog:false}));
  }
  root.add(batch.root);itemBatches.push(batch);return batch;
 }
 const jitter=(geometry,a,b)=>{const p=geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,x+Math.sin(y*7+z*4)*a,y,z+Math.sin(x*9+y*5)*b);}return geometry;};
 const dummy=new THREE.Object3D();
 const cellKnown=key=>seen.has(key);

 // Floor, except where the ground falls away.
 const floorTiles=cave.tiles.filter(t=>t.type!=='chasm'&&t.type!=='shaftDown');
 const floorGeo=new THREE.PlaneGeometry(2.04,2.04);floorGeo.rotateX(-Math.PI/2);
 litGroup(floorGeo,floorMat,floorTiles,t=>{dummy.position.set(t.x*CAVE_CELL,-.035+Math.sin(t.x*1.7+t.z*.4)*.025,t.z*CAVE_CELL);dummy.rotation.set(0,0,0);dummy.scale.setScalar(1);},t=>TILE_COLORS[t.type]??TILE_COLORS.floor);

 // Walls wrap everything carved; the side facing the camera is cut down near the player.
 const edges=[];for(const t of cave.tiles)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(!cave.open.has(`${t.x+dx},${t.z+dz}`))edges.push({key:t.key,x:t.x,z:t.z,dx,dz});
 // One continuous skin of rock traced round the carved cells: corners rounded off, the face pushed in and out by noise
 // into bulges, ledges and a ragged top. Faceted on purpose. Each quad follows the cell in front of it for sight and
 // memory (through a small per-cell texture); rock between the player and the camera is cut down in the shader.
 const tileIndex=new Map(cave.tiles.map((t,i)=>[t.key,i]));
 const wallCells=new Uint8Array(cave.tiles.length*4);
 const wallTex=keep(new THREE.DataTexture(wallCells,cave.tiles.length,1));wallTex.needsUpdate=true;
 const wallGeo=keep(buildWallSkin(cave,edges,tileIndex,[
  ...cave.nests.map(n=>[n.x*2+n.dx,n.z*2+n.dz]),...cave.crystals.filter(c=>c.dx||c.dz).map(c=>[c.x*2+c.dx,c.z*2+c.dz]),
  ...cave.loot.filter(l=>l.kind==='ore').map(l=>[l.x*2+l.dx,l.z*2+l.dz])]));
 // Rock between the camera and the player is cut away above a height that drops toward the player. The cut is made per
 // pixel: moving the vertices down instead folded the faceted skin inside out into jagged holes.
 const vl=Math.hypot(viewX,viewZ),wallMat=keep(new THREE.MeshBasicMaterial({color:'#ffffff',vertexColors:true,fog:false}));
 wallMat.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,sight,{uCells:{value:wallTex}});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float aCell;attribute vec2 aOut;attribute vec2 aSeenAt;uniform sampler2D uCells;varying vec2 vCaveLocal;varying float vSeen;varying vec2 vSeenAt;varying vec3 vRock;varying vec2 vOut;').replace('#include <begin_vertex>',`#include <begin_vertex>
   vec4 cell=texture2D(uCells,vec2((aCell+.5)/${cave.tiles.length}.0,.5));vCaveLocal=transformed.xz;vSeenAt=aSeenAt;vRock=transformed;vOut=aOut;
   if(cell.g<.5)transformed=vec3(0.0);`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vSeenAt;varying vec3 vRock;varying vec2 vOut;'+SIGHT_PARS).replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
   vec2 toCam=vec2(${(viewX/vl).toFixed(4)},${(viewZ/vl).toFixed(4)}),rel=vRock.xz-uPlayer;float dp=length(rel),ahead=dot(rel,toCam);
   float toward=max(smoothstep(.6,2.2,ahead),smoothstep(.05,.4,dot(normalize(vOut),toCam))*step(0.0,ahead))*(1.0-smoothstep(10.0,12.0,dp));
   float cutAt=mix(9.0,.35+max(0.0,dp-3.0)*.22+(caveNoise(vRock.xz*1.7)-.5)*.3,toward);
   if(vRock.y>cutAt)discard;`).replace('#include <opaque_fragment>',`
   vec3 glow=caveGlow(vCaveLocal);
   outgoingLight=mix(diffuseColor.rgb*(vec3(.42,.55,.85)*.07+glow*.5),outgoingLight*(caveSight(vCaveLocal)*caveGrit(vCaveLocal)+glow),caveSeen(vSeenAt));
   #include <opaque_fragment>`);
 };
 const walls=new THREE.Mesh(wallGeo,wallMat);walls.frustumCulled=false;root.add(walls);

 // Cliff faces dropping into chasms and the down shaft, so the dark below reads as depth.
 const lips=[];for(const t of cave.tiles)if(t.type==='chasm'||t.type==='shaftDown')for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const k=`${t.x+dx},${t.z+dz}`,type=cave.types.get(k);if(cave.open.has(k)&&type!=='chasm'&&type!=='shaftDown')lips.push({key:t.key,x:t.x,z:t.z,dx,dz});}
 litGroup(shade(jitter(new THREE.BoxGeometry(2.04,1,.3,1,3,1),.06,.05)),rockMat,lips,l=>{dummy.position.set(l.x*2+l.dx*.86,-3.5,l.z*2+l.dz*.86);dummy.rotation.set(0,l.dx?Math.PI/2:0,0);dummy.scale.set(1,7,1);},()=>'#4c5450');
 // A dim ember glow far below, so a chasm reads as a drop rather than a black stripe.
 const pitItems=cave.tiles.filter(t=>t.type==='chasm'||t.type==='shaftDown');
 // Opaque, so the dimmed surface terrain far below never shows through the hole.
 const pitMat=keep(new THREE.MeshBasicMaterial({color:'#6a1a0a',fog:false}));
 const pits=new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2)),pitMat,Math.max(1,pitItems.length));pits.count=pitItems.length;pits.frustumCulled=false;root.add(pits);

 // Rock formations that split rooms into paths: drip-built stalagmites, fused twins, fluted columns, snapped stumps and
 // clusters. Goo glazes some of them, more the deeper you go and thickest round the lair.
 const lair=cave.heart??cave.down,depthShare=zone/(CAVE_ZONES-1);
 const spireItems=cave.spires.map(s=>{const h=hash2(s.x*1.7,s.z*2.3),g=hash2(s.x*5.1,s.z*.7);
  const kind=s.h<3?(h<.45?'Stump':'Cluster'):s.h>4.3?(h<.4?'Column':h<.75?'Stalagmite':'Twin'):(h<.45?'Stalagmite':h<.75?'Twin':'Cluster');
  const near=lair?Math.max(0,1-Math.hypot(lair.x-s.x,lair.z-s.z)/(cave.heart?9:6))*(cave.heart?1:.6):0;
  return {...s,key:`${s.x},${s.z}`,kind,goo:Math.max(g<.3+.45*depthShare?.3+.5*hash2(s.z,s.x):0,near)};});
 const placeSpire=s=>{dummy.position.set(s.x*2,0,s.z*2);dummy.rotation.set(s.lean,s.x*1.3+s.z,s.lean*.6);dummy.scale.set(s.r,s.h*(s.kind==='Stump'?.5:1),s.r);};
 let spireGroups=[];
 const growSpires=geometries=>{
  for(const g of spireGroups){root.remove(g.mesh);g.mesh.dispose();groups.splice(groups.indexOf(g),1);}
  spireGroups=[];
  const kinds=geometries?FORMATION_NAMES:['Cone'];
  for(const kind of kinds){
   const items=spireItems.filter(s=>!geometries||s.kind===kind);if(!items.length)continue;
   const geo=geometries?shade(geometries[kind].clone()):shade(jitter(new THREE.CylinderGeometry(.12,.75,1,7,4).translate(0,.5,0),.07,.07));
   geo.setAttribute('aGoo',new THREE.InstancedBufferAttribute(new Float32Array(items.map(s=>s.goo)),1));
   spireGroups.push(litGroup(geo,formationMat,items,placeSpire,()=>'#7f8a84'));
  }
 };
 growSpires(formationGeometries);
 if(!formationGeometries)formationsReady.then(geometries=>{if(geometries&&!disposed){growSpires(geometries);clock=1;lastFacing=-100;}});

 // Crystals glow on their own and light what is around them.
 const shardParts=[0,1,2].map(i=>new THREE.OctahedronGeometry(1,0).scale(.16,.75,.16).rotateZ((i-1)*.45).rotateX((i%2?.25:-.2)).translate((i-1)*.18,.55-(i===1?0:.18),0).toNonIndexed());
 const shardGeo=keep(mergeGeometries(shardParts));shardParts.forEach(g=>g.dispose());
 const crystalMat=keep(new THREE.MeshBasicMaterial({color:'#ffffff',fog:false}));
 const crystalItems=cave.crystals.map(c=>({...c,key:`${c.x},${c.z}`}));
 const crystals=new THREE.InstancedMesh(shardGeo,crystalMat,Math.max(1,crystalItems.length));crystals.count=crystalItems.length;crystals.frustumCulled=false;root.add(crystals);
 const crystalColor=new THREE.Color();crystalItems.forEach((c,i)=>{crystalColor.copy(GLOW[c.hue]).multiplyScalar(1.15);crystals.setColorAt(i,crystalColor);});if(!crystalItems.length)crystals.setColorAt(0,crystalColor.set('#000'));

 // Finds. Titanium seams only show in the lamp; relics glow on their own and are spotted from afar like crystals.
 const loot=cave.loot,lootByCrystal=new Map(loot.filter(l=>l.kind==='crystal').map(l=>[`${l.x},${l.z},${l.dx},${l.dz}`,l.key]));
 crystalItems.forEach(c=>c.loot=lootByCrystal.get(`${c.x},${c.z},${c.dx},${c.dz}`));
 const collectibleCrystals=crystalItems.filter(c=>c.loot),rareEarthModels=glowingItems('rareearth',collectibleCrystals.length,1.3);
 const seamParts=[[0,0,0,.34],[.3,.22,.05,.22],[-.28,-.18,.04,.26],[.12,-.32,.03,.18],[-.1,.36,.02,.2]].map(([x,y,z,r],i)=>new THREE.OctahedronGeometry(r,0).rotateZ(i).rotateX(i*.7).translate(x,y,z).toNonIndexed());
 const seamGeo=shade(mergeGeometries(seamParts));seamParts.forEach(g=>g.dispose());
 const seams=loot.filter(l=>l.kind==='ore').map(l=>({...l,key:`${l.x},${l.z}`,loot:l.key}));
 const oreModel=itemModels?.get('titanium');
 if(oreModel){
  seamGeo.dispose();
  for(const part of oreModel.children)litGroup(shade(part.geometry.clone()),litMaterial(true),seams,l=>{dummy.position.set(l.x*2+l.dx*.68,.18,l.z*2+l.dz*.68);dummy.rotation.set(0,Math.atan2(l.dx,l.dz),0);dummy.scale.setScalar(1.35);},()=>part.material.color);
 }else litGroup(seamGeo,rockMat,seams,l=>{dummy.position.set(l.x*2+l.dx*.68,.75+Math.sin(l.x+l.z)*.25,l.z*2+l.dz*.68);dummy.rotation.set(0,Math.atan2(l.dx,l.dz),0);dummy.scale.set(1.2,1,1.2);},()=>'#d58a46');
 const RELIC={artifact:{color:new THREE.Color(1,.2,.04),size:.46,light:.6},blueprint:{color:new THREE.Color(.1,.75,1),size:.42,light:.6},heart:{color:new THREE.Color(1,.04,.02),size:1.15,light:1.2}};
 const relicItems=loot.filter(l=>RELIC[l.kind]).map(l=>({key:`${l.x},${l.z}`,loot:l.key,kind:l.kind,x:l.x,z:l.z}));
 const relicModels=Object.fromEntries(['artifact','heart'].map(kind=>[kind,glowingItems(kind,relicItems.filter(r=>r.kind===kind).length,2)]));
 const relicMat=keep(new THREE.MeshBasicMaterial({color:'#ffffff',fog:false}));
 const relics=new THREE.InstancedMesh(keep(new THREE.OctahedronGeometry(1,0).scale(.6,1,.6)),relicMat,Math.max(1,relicItems.length));relics.count=relicItems.length;relics.frustumCulled=false;root.add(relics);
 relicItems.forEach((r,i)=>relics.setColorAt(i,RELIC[r.kind].color));if(!relicItems.length)relics.setColorAt(0,new THREE.Color(0,0,0));
 const haloCanvas=document.createElement('canvas');haloCanvas.width=haloCanvas.height=64;
 {const g=haloCanvas.getContext('2d'),fill=g.createRadialGradient(32,32,0,32,32,32);fill.addColorStop(0,'rgba(255,255,255,.9)');fill.addColorStop(.35,'rgba(255,255,255,.35)');fill.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=fill;g.fillRect(0,0,64,64);}
 const haloMat=keep(new THREE.MeshBasicMaterial({map:keep(new THREE.CanvasTexture(haloCanvas)),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
 const halos=new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2)),haloMat,Math.max(1,relicItems.length));halos.count=relicItems.length;halos.frustumCulled=false;halos.renderOrder=2;root.add(halos);
 relicItems.forEach((r,i)=>halos.setColorAt(i,RELIC[r.kind].color.clone().multiplyScalar(.55)));if(!relicItems.length)halos.setColorAt(0,new THREE.Color(0,0,0));
 // The packs left behind by a blackout, drawn whether or not the cell has been seen. Flares draw themselves
 // (flare-view.js); here they only light the cave, from wherever they are: in hand, in the air or down.
 const packMat=keep(new THREE.MeshBasicMaterial({color:'#e07a2e',fog:false}));
 const packs=new THREE.InstancedMesh(keep(new THREE.BoxGeometry(.5,.32,.65).translate(0,.16,0)),packMat,MAX_DROPS);packs.count=0;packs.frustumCulled=false;root.add(packs);
 const PACK_GLOW=new THREE.Color(.3,.75,1);
 const packHalos=new THREE.InstancedMesh(halos.geometry,haloMat,MAX_DROPS);packHalos.count=0;packHalos.frustumCulled=false;packHalos.renderOrder=2;root.add(packHalos);
 for(let i=0;i<MAX_DROPS;i++)packHalos.setColorAt(i,PACK_GLOW);
 let flaresHere=[],dropsHere=[];
 function updateFlares(state){
  flaresHere=(state.flares??[]).filter(f=>f.cave===id&&(f.zone??0)===zone).map(f=>({f,now:flareNow(f,state.player)})).filter(n=>n.now.lit>0);
  dropsHere=(state.drops??[]).filter(d=>d.cave===id&&(d.zone??0)===zone);
  dropsHere.forEach((d,i)=>{dummy.position.set(d.x,0,d.z);dummy.rotation.set(0,d.id,0);dummy.scale.setScalar(1);dummy.updateMatrix();packs.setMatrixAt(i,dummy.matrix);
   const blink=Math.sin(time*4)>.2?1:.25;dummy.position.y=.08;dummy.scale.setScalar(2.4*blink);dummy.updateMatrix();packHalos.setMatrixAt(i,dummy.matrix);});
  packs.count=packHalos.count=dropsHere.length;packs.instanceMatrix.needsUpdate=packHalos.instanceMatrix.needsUpdate=true;
 }
 let taken=new Set(),takenCount=-1,flareCount=0;
 const gone=item=>item.loot&&taken.has(item.loot);

 // Vents breathe a faint green gas.
 const VENT_PUFFS=26,ventCount=cave.vents.length*VENT_PUFFS,ventPositions=new Float32Array(Math.max(1,ventCount)*3),ventLife=new Float32Array(Math.max(1,ventCount));
 for(let i=0;i<ventCount;i++)ventLife[i]=Math.random();
 const ventGeo=keep(new THREE.BufferGeometry());ventGeo.setAttribute('position',new THREE.BufferAttribute(ventPositions,3));ventGeo.setAttribute('aLife',new THREE.BufferAttribute(ventLife,1));ventGeo.setDrawRange(0,ventCount);
 const ventMat=keep(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{uPointScale:{value:Math.min(2,window.devicePixelRatio||1)}},
  vertexShader:'uniform float uPointScale;attribute float aLife;varying float vLife;void main(){vLife=aLife;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=(6.0+aLife*14.0)*uPointScale;}',
  fragmentShader:'varying float vLife;void main(){float a=smoothstep(.5,0.0,length(gl_PointCoord-.5))*sin(vLife*3.14159)*.16;gl_FragColor=vec4(vec3(.42,.85,.3)*a,1.0);}'}));
 const vents=new THREE.Points(ventGeo,ventMat);vents.frustumCulled=false;root.add(vents);

 // The shaft up: a cold column of light and a rope. The shaft down: a black pit with a rope ladder over the lip.
 const shaftLight=keep(new THREE.MeshBasicMaterial({color:'#8fa6d0',transparent:true,opacity:.07,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));
 const ropeMat=keep(new THREE.MeshBasicMaterial({color:'#2a2622',fog:false}));
 if(cave.up){const column=new THREE.Mesh(keep(new THREE.CylinderGeometry(.85,1.05,40,18,1,true)),shaftLight);column.position.set(cave.up.x*2,20,cave.up.z*2);root.add(column);
  const rope=new THREE.Mesh(keep(new THREE.BoxGeometry(.05,14,.05)),ropeMat);rope.position.set(cave.up.x*2+.35,7,cave.up.z*2-.2);root.add(rope);}
 if(cave.down){const ladder=new THREE.Group();for(const sx of [-.28,.28]){const rail=new THREE.Mesh(keep(new THREE.BoxGeometry(.05,1.6,.05)),ropeMat);rail.position.set(sx,-.6,0);ladder.add(rail);}
  for(let k=0;k<4;k++){const rung=new THREE.Mesh(keep(new THREE.BoxGeometry(.6,.04,.04)),ropeMat);rung.position.set(0,-1.2+k*.4,0);ladder.add(rung);}
  ladder.position.set(cave.down.x*2,0,cave.down.z*2-.85);root.add(ladder);}

 // Dust hanging in the air, only visible where the light catches it.
 const DUST=420,dustPositions=new Float32Array(DUST*3),dustSeeds=new Float32Array(DUST);
 for(let i=0;i<DUST;i++){dustPositions.set([(Math.random()-.5)*28,.2+Math.random()*3,(Math.random()-.5)*28],i*3);dustSeeds[i]=Math.random();}
 const dustGeo=keep(new THREE.BufferGeometry());dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));dustGeo.setAttribute('aSeed',new THREE.BufferAttribute(dustSeeds,1));
 const dustMat=keep(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{...sight,uPointScale:{value:Math.min(2,window.devicePixelRatio||1)}},
  vertexShader:`uniform float uPointScale;attribute float aSeed;varying vec2 vCaveLocal;varying float vSeed;void main(){vCaveLocal=position.xz;vSeed=aSeed;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=(1.5+aSeed*2.5)*uPointScale;}`,
  fragmentShader:SIGHT_PARS.replace('varying float vSeen;','')+`varying float vSeed;void main(){vec2 c=gl_PointCoord-.5;float a=smoothstep(.5,.1,length(c));
   vec2 d=vCaveLocal-uPlayer;float r=length(d);float beam=smoothstep(.6,.92,dot(d/max(.01,r),uFacing))*pow(max(0.0,1.0-r/${BEAM_RANGE.toFixed(1)}),1.2);
   vec3 glow=(vec3(.78,.8,.84)*(beam*.55+.05*(1.0-smoothstep(1.0,6.0,r)))*uFlicker+caveGlow(vCaveLocal)*.5)*(.4+.6*vSeed);gl_FragColor=vec4(glow*a,1.0);}`}));
 const dust=new THREE.Points(dustGeo,dustMat);dust.frustumCulled=false;root.add(dust);

 let flicker=0,flickerSeed=0;

 const roofPixels=new Uint8Array(64*64),roofMap=keep(new THREE.DataTexture(roofPixels,64,64,THREE.RedFormat));roofMap.minFilter=THREE.LinearFilter;roofMap.magFilter=THREE.LinearFilter;roofMap.needsUpdate=true;
 let visible=new Set(),seen=new Set(),loaded=false,clock=1,lastFacing=-100,lastX=-100,lastZ=-100,time=0;
 const glowSources=[
  ...relicItems.map(r=>({key:r.key,loot:r.loot,x:r.x*2,z:r.z*2,color:RELIC[r.kind].color,strength:RELIC[r.kind].light,pulse:r.kind==='heart'})),
  ...crystalItems.map(c=>({key:c.key,loot:c.loot,x:c.x*2+c.dx*(c.loot&&rareEarthModels ? .35 : .8),z:c.z*2+c.dz*(c.loot&&rareEarthModels ? .35 : .8),color:c.loot&&rareEarthModels?GLOW.violet:GLOW[c.hue],strength:.55*c.size})),
  ...cave.vents.map(v=>({key:`${v.x},${v.z}`,x:v.x*2,z:v.z*2,color:GLOW.vent,strength:.28})),
  ...(cave.up?[{key:`${cave.up.x},${cave.up.z}`,x:cave.up.x*2,z:cave.up.z*2,color:GLOW.sky,strength:.75,always:true}]:[]),
 ];

 function place(p){
  cave.tiles.forEach((t,i)=>wallCells[i*4+1]=cellKnown(t.key)?255:0);wallTex.needsUpdate=true;
  for(const g of groups){g.items.forEach((item,i)=>{g.place(item,p);if(!cellKnown(item.key)||(item.kind==='ore'&&gone(item)))dummy.scale.setScalar(0);dummy.updateMatrix();g.mesh.setMatrixAt(i,dummy.matrix);});g.mesh.instanceMatrix.needsUpdate=true;}
  let crystalIndex=0;
  crystalItems.forEach((c,i)=>{const wall=c.dx||c.dz;dummy.position.set(c.x*2+c.dx*.78,wall?.2:0,c.z*2+c.dz*.78);dummy.rotation.set(-c.dz*.5,(c.x*7+c.z*3)%6,c.dx*.5);dummy.scale.setScalar(cellKnown(c.key)&&!gone(c)?c.size:0);
   if(rareEarthModels&&c.loot){dummy.position.set(c.x*2+c.dx*.35,0,c.z*2+c.dz*.35);dummy.rotation.set(0,(c.x*7+c.z*3)%6,0);dummy.updateMatrix();rareEarthModels.set(crystalIndex++,dummy.matrix);dummy.scale.setScalar(0);}
   dummy.updateMatrix();crystals.setMatrixAt(i,dummy.matrix);});crystals.instanceMatrix.needsUpdate=true;rareEarthModels?.finish(crystalIndex);
  pitItems.forEach((t,i)=>{dummy.position.set(t.x*2,-1.1,t.z*2);dummy.rotation.set(0,0,0);dummy.scale.setScalar(cellKnown(t.key)?1:0);dummy.updateMatrix();pits.setMatrixAt(i,dummy.matrix);});pits.instanceMatrix.needsUpdate=true;
 }
 function ease(dt){
  const k=1-Math.exp(-dt*6);
  let moving=false;
  for(let i=0;i<seenNow.length;i++){const d=seenTarget[i]-seenNow[i];if(d===0)continue;seenNow[i]=Math.abs(d)>.004?seenNow[i]+d*k:seenTarget[i];seenPixels[i]=Math.round(seenNow[i]*255);moving=true;}
  if(moving)seenMap.needsUpdate=true;
 }
 function updateGlow(p){
  const burning=[...flaresHere.map(({f,now})=>({x:now.x,z:now.z,color:FLARE_GLOW,strength:FLARE_LIGHT.strength*flareLight(f,now),radius:FLARE_LIGHT.reach})),...dropsHere.map(d=>({x:d.x,z:d.z,color:PACK_GLOW,strength:Math.sin(time*4)>.2?.45:.1}))];
  const near=[...burning.map(s=>({s,d:0})),...glowSources.filter(s=>(s.always||seen.has(s.key))&&!(s.loot&&taken.has(s.loot))).map(s=>({s,d:Math.hypot(s.x-p.x,s.z-p.z)})).sort((a,b)=>a.d-b.d)].slice(0,LIGHTS);
  for(let i=0;i<LIGHTS;i++){const n=near[i];if(n){sight.uGlow.value[i].set(n.s.x,n.s.z,n.s.strength*(n.s.key&&cave.types.get(n.s.key)==='vent'?.8+.2*Math.sin(time*2+i):n.s.pulse?.75+.25*Math.sin(time*2.4):1),n.s.radius??6);sight.uGlowColor.value[i].copy(n.s.color);}else sight.uGlow.value[i].set(0,0,0,6);}
 }
 function updateVents(dt){
  cave.vents.forEach((v,j)=>{for(let k=0;k<VENT_PUFFS;k++){const i=j*VENT_PUFFS+k;ventLife[i]+=dt*(.25+(k%5)*.04);if(ventLife[i]>1)ventLife[i]-=1;const l=ventLife[i],a=k*2.4;ventPositions.set([v.x*2+Math.cos(a)*l*.6,.1+l*2.4,v.z*2+Math.sin(a)*l*.6],i*3);}});
  if(ventCount){ventGeo.attributes.position.needsUpdate=true;ventGeo.attributes.aLife.needsUpdate=true;}
  vents.visible=cave.vents.some(v=>seen.has(`${v.x},${v.z}`));
 }
 function update(state,dt){
  const p=state.player;time+=dt;
  if(!loaded){seen=new Set(state.exploredCaves?.[memory]||[]);loaded=true;}
  updateFlares(state);if(flaresHere.length!==flareCount||flaresHere.some(n=>n.now.stage!=='down')){flareCount=flaresHere.length;clock=1;lastFacing=-100;}
  const takenList=state.caveLoot?.[memory]??[];if(takenList.length!==takenCount){taken=new Set(takenList);takenCount=takenList.length;clock=1;lastFacing=-100;}
  const relicCounts={artifact:0,heart:0};
  // Swallowed: each find sits tilted and half sunk in the goo that has grown over it (hive-view.js), still as
  // machinery; only the heart still beats.
  relicItems.forEach((r,i)=>{const big=r.kind==='heart',modeled=relicModels[r.kind],tilt=hash2(r.x*3.1,r.z*1.7);dummy.position.set(r.x*2,(big?1.25:.55),r.z*2);dummy.rotation.set((tilt-.5)*.9,r.x*2.3+r.z,(hash2(r.z,r.x)-.5)*.8);dummy.scale.setScalar(cellKnown(r.key)&&!gone(r)?RELIC[r.kind].size*(big?1+.06*Math.sin(time*2.4):1):0);
   if(modeled){dummy.position.y-=RELIC[r.kind].size*(big?.55:.45);dummy.updateMatrix();modeled.set(relicCounts[r.kind]++,dummy.matrix);dummy.scale.setScalar(0);}
   dummy.updateMatrix();relics.setMatrixAt(i,dummy.matrix);const shown=cellKnown(r.key)&&!gone(r);dummy.position.set(r.x*2,.06,r.z*2);dummy.rotation.set(0,0,0);dummy.scale.setScalar(shown?(big?6:2.6)*(.92+.08*Math.sin(time*2+i)):0);dummy.updateMatrix();halos.setMatrixAt(i,dummy.matrix);});relics.instanceMatrix.needsUpdate=true;halos.instanceMatrix.needsUpdate=true;
  for(const [kind,batch]of Object.entries(relicModels))batch?.finish(relicCounts[kind]);
  sight.uPlayer.value.set(p.x,p.z);sight.uFacing.value.set(Math.sin(p.facing),Math.cos(p.facing));
  const depth=Math.min(1,(zone+Math.min(1,Math.max(0,p.z/90)))/CAVE_ZONES);
  // The headlamp stutters now and then on its own deeper down.
  if(Math.random()<dt*.03*depth)flicker=Math.max(flicker,.3);
  flicker=Math.max(0,flicker-dt);
  if(flicker>0){if(Math.random()<.35)flickerSeed=Math.random();sight.uFlicker.value=flickerSeed<.45?.12+flickerSeed:1;}else sight.uFlicker.value=1;
  for(let i=0;i<DUST;i++){
   const o=i*3;dustPositions[o]+=Math.sin(time*.3+dustSeeds[i]*20)*dt*.08;dustPositions[o+1]+=Math.cos(time*.21+dustSeeds[i]*13)*dt*.05;
   dustPositions[o]=p.x+((dustPositions[o]-p.x+14)%28+28)%28-14;dustPositions[o+2]=p.z+((dustPositions[o+2]-p.z+14)%28+28)%28-14;
  }
  dustGeo.attributes.position.needsUpdate=true;
  pitMat.color.setRGB(.14+.03*Math.sin(time*.5),.012,.004);
  updateVents(dt);updateGlow(p);ease(dt);
  clock+=dt;if(clock<.09&&Math.abs(lastFacing-p.facing)<.18&&Math.hypot(lastX-p.x,lastZ-p.z)<.5)return;
  clock=0;lastFacing=p.facing;lastX=p.x;lastZ=p.z;
  visible=visibleCaveCells(cave,p.x,p.z,p.facing,flaresHere.map(({now})=>({x:now.x,z:now.z,r:FLARE.radius*now.lit})));
  // Rock cells take the brightest open cell beside them, so the wall tops between two passages agree.
  seenTarget.fill(0);const at=(x,z)=>(z+SEEN_Z0)*SEEN_SIZE+x+SEEN_X0;
  for(const t of cave.tiles)if(visible.has(t.key))seenTarget[at(t.x,t.z)]=1;
  for(const t of cave.tiles)if(visible.has(t.key))for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(!cave.open.has(`${t.x+dx},${t.z+dz}`))seenTarget[at(t.x+dx,t.z+dz)]=1;
  // Crystals shine far beyond the headlamp, so they are spotted from anywhere in line of sight.
  const cx=Math.round(p.x/CAVE_CELL),cz=Math.round(p.z/CAVE_CELL);
  for(const c of [...crystalItems,...relicItems])if(!seen.has(c.key)&&Math.hypot(c.x*2-p.x,c.z*2-p.z)<34&&lineVisible(cave,cx,cz,c.x,c.z))seen.add(c.key);
  let changed=false;for(const key of visible)if(!seen.has(key)){seen.add(key);changed=true;}
  if(changed){state.exploredCaves??={};state.exploredCaves[memory]=[...seen];}
  // The surface above opens over what is in view and over the rock behind its walls, so no slab of it lies across a wall top.
  roofPixels.fill(0);const roof=(x,z)=>{const index=(z+3)*64+x+32;if(x>=-32&&x<32&&index>=0&&index<roofPixels.length)roofPixels[index]=255;};
  for(const key of seen){const [x,z]=key.split(',').map(Number);if(!visible.has(key)&&Math.hypot(x*2-p.x,z*2-p.z)>6)continue;roof(x,z);
   for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(!cave.open.has(`${x+dx},${z+dz}`))roof(x+dx,z+dz);}
  roofMap.needsUpdate=true;
  place(p);
  document.body.dataset.caveVisible=String(visible.size);document.body.dataset.caveExplored=String(seen.size);document.body.style.setProperty('--cave-depth',depth.toFixed(3));
 }
 return {root,roofMap,cave,sight,update,known:cellKnown,dispose(){disposed=true;parent.remove(root);seenMap.dispose();itemBatches.forEach(b=>b.dispose());disposables.forEach(d=>d.dispose());crystals.dispose();relics.dispose();halos.dispose();packHalos.dispose();packs.dispose();groups.forEach(g=>g.mesh.dispose());}};
}

// Deterministic value noise for shaping rock.
const hash2=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
function noise2(x,y){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
 return (hash2(ix,iy)*(1-u)+hash2(ix+1,iy)*u)*(1-v)+(hash2(ix,iy+1)*(1-u)+hash2(ix+1,iy+1)*u)*v;}
const fbm2=(x,y)=>noise2(x,y)*.55+noise2(x*2.1+5.2,y*2.1+1.3)*.3+noise2(x*4.3+9.1,y*4.3+7.7)*.15;

/**
 * The cave wall as one faceted mesh. The face reads its sight from the passage in front of it (aSeenAt); the shelf
 * behind the top reads where it lies, so the shelves of two neighbouring passages, which overlap, always agree.
 * `edges` are open-cell sides that face rock; they chain into closed outlines, which
 * are rounded (Chaikin), resampled and lofted into a wall with a talus foot, bulging face, the odd ledge, a ragged top
 * and a shelf of rock running back from it. `anchors` are wall spots (nests, crystals, seams) where the face is kept
 * flat so what is mounted there still sits on it.
 */
function buildWallSkin(cave,edges,tileIndex,anchors){
 const segs=edges.map(e=>{const cx=e.x*2+e.dx,cz=e.z*2+e.dz,tx=-e.dz,tz=e.dx;return {a:[cx-tx,cz-tz],b:[cx+tx,cz+tz],cell:tileIndex.get(e.key),used:false};});
 const byStart=new Map();for(const g of segs){const k=g.a.join(',');if(!byStart.has(k))byStart.set(k,[]);byStart.get(k).push(g);}
 const loops=[];
 for(const first of segs){if(first.used)continue;const loop=[];let g=first;
  while(g&&!g.used){g.used=true;loop.push({p:g.a,cell:g.cell});g=(byStart.get(g.b.join(','))??[]).find(n=>!n.used);}
  if(loop.length>2)loops.push(loop);}
 const pos=[],cells=[],outs=[],seenAt=[];
 const tri=(a,b,c)=>{for(const v of [a,b,c]){pos.push(v.x,v.y,v.z);cells.push(v.cell);outs.push(v.nx,v.nz);seenAt.push(v.sx??v.x,v.sz??v.z);}};
 for(let loop of loops){
  for(let it=0;it<3;it++){const next=[];for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length];
   next.push({p:[a.p[0]*.75+b.p[0]*.25,a.p[1]*.75+b.p[1]*.25],cell:a.cell},{p:[a.p[0]*.25+b.p[0]*.75,a.p[1]*.25+b.p[1]*.75],cell:a.cell});}loop=next;}
  // Resample to an even, coarse spacing so the facets read.
  const lens=loop.map((a,i)=>{const b=loop[(i+1)%loop.length];return Math.hypot(b.p[0]-a.p[0],b.p[1]-a.p[1]);}),total=lens.reduce((u,v)=>u+v,0),count=Math.max(3,Math.round(total/.6)),pts=[];
  for(let k=0,i=0,start=0;k<count;k++){const at=k*total/count;while(start+lens[i]<at&&i<loop.length-1){start+=lens[i];i++;}
   const a=loop[i],b=loop[(i+1)%loop.length],t=lens[i]?(at-start)/lens[i]:0;pts.push({x:a.p[0]+(b.p[0]-a.p[0])*t,z:a.p[1]+(b.p[1]-a.p[1])*t,cell:a.cell});}
  if(pts.length<3)continue;
  const cols=pts.map((q,i)=>{
   const a=pts[(i-1+pts.length)%pts.length],b=pts[(i+1)%pts.length],tx=b.x-a.x,tz=b.z-a.z,tl=Math.hypot(tx,tz)||1,nx=tz/tl,nz=-tx/tl;
   const along=q.x*.43+q.z*.37,top=2.7+1.3*fbm2(q.x*.21,q.z*.21)+.45*noise2(along*1.7,5),ledgeAt=.9+2*noise2(along*.55+3,1),ledge=noise2(along*.7+11,2)>.55?.22+.2*noise2(along*2,4):0;
   const ledge2At=ledgeAt+.7+.6*noise2(along*.9,8),ledge2=noise2(along*.8+21,3)>.62?.18:0;
   let pin=0;for(const [ax,az] of anchors){const d=Math.hypot(ax-q.x,az-q.z);if(d<1.4)pin=Math.max(pin,1-d/1.4);}
   const offset=y=>{const face=(fbm2(along*.55,y*.42+q.x*.05)-.5)*.9+(noise2(along*1.9,y*.25+2)-.5)*.42+(y>ledgeAt?ledge:0)+(y>ledge2At?ledge2:0)-.12,foot=-.32*(1-Math.min(1,y/.55))*fbm2(along*1.3,7);
    const o=Math.max(-.42,Math.min(.6,face+foot));return y<2.7?o+(-.3-o)*pin:o;};
   const heights=[0,.3,.75,ledgeAt-.02,ledgeAt+.04,ledge2At-.02,ledge2At+.04,top-.5,top].map(y=>Math.min(y,top)).sort((u,v)=>u-v);
   // Chipped, not smooth: every vertex is knocked a little off the surface.
   const ring=heights.map((y,k)=>{const o=offset(y)+(hash2(along*13.1,k*7.3)-.5)*.16*(1-pin),yy=y+(k&&k<heights.length-1?(hash2(along*5.7,k*3.1)-.5)*.14:0);return {x:q.x+nx*o,y:yy,z:q.z+nz*o,cell:q.cell,nx,nz,sx:q.x-nx*.9,sz:q.z-nz*.9};});
   // The shelf of rock behind the top edge, so the wall reads as mass from above.
   const o=offset(top);ring.push({x:q.x+nx*(o+.9),y:top+.2*(noise2(along*2.3,3)-.3),z:q.z+nz*(o+.9),cell:q.cell,nx,nz},{x:q.x+nx*(o+2.4),y:top-.25,z:q.z+nz*(o+2.4),cell:q.cell,nx,nz});
   return ring;});
  for(let i=0;i<cols.length;i++){const A=cols[i],B=cols[(i+1)%cols.length],cell=A[0].cell;
   for(let k=0;k<A.length-1;k++){const a=A[k],b=B[k],c=B[k+1],d=A[k+1],w=v=>({...v,cell});tri(w(a),w(b),w(c));tri(w(a),w(c),w(d));}}
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('aCell',new THREE.Float32BufferAttribute(cells,1));geo.setAttribute('aOut',new THREE.Float32BufferAttribute(outs,2));geo.setAttribute('aSeenAt',new THREE.Float32BufferAttribute(seenAt,2));
 geo.computeVertexNormals();
 const n=geo.attributes.normal,p=geo.attributes.position,colors=[];
 for(let i=0;i<n.count;i++){
  const lit=.62+Math.max(0,n.getY(i))*.28+Math.max(0,n.getX(i))*.1,tone=.82+.26*fbm2(p.getX(i)*.7,p.getZ(i)*.7+p.getY(i)*.9);
  colors.push(.392*lit*tone,.459*lit*tone,.486*lit*tone);}
 geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 return geo;
}
