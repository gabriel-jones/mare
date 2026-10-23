import {terrainData} from './terrain.js';
import * as THREE from 'three';
import {caveLayout,visibleCaveCells,lineVisible,CAVE_CELL,SIGHT_RADIUS,BEAM_RANGE} from './caves.js';

/**
 * Sight underground, shared by floor, walls and dust: a dim circle around the player that fades to black,
 * a brighter headlamp beam ahead, and cells explored earlier left as faint cold outlines.
 */
const SIGHT_PARS=`varying vec2 vCaveLocal;varying float vSeen;uniform vec2 uPlayer;uniform vec2 uFacing;uniform float uFlicker;
float caveHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float caveNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(caveHash(i),caveHash(i+vec2(1,0)),f.x),mix(caveHash(i+vec2(0,1)),caveHash(i+vec2(1,1)),f.x),f.y);}
vec3 caveSight(vec2 p){
 vec2 d=p-uPlayer;float r=length(d);
 float aura=1.0-smoothstep(1.5,${SIGHT_RADIUS.toFixed(1)},r);
 float beam=smoothstep(.52,.9,dot(d/max(.01,r),uFacing))*pow(max(0.0,1.0-r/${BEAM_RANGE.toFixed(1)}),1.4);
 float grit=.72+.3*caveNoise(p*.9)+.16*caveNoise(p*4.3)+.08*caveNoise(p*13.0);
 return (vec3(.012,.014,.02)+vec3(.5,.58,.74)*.42*aura*aura+vec3(1.0,.93,.8)*.78*beam)*grit*uFlicker;
}`;

export function createCaveView(seed,id,parent){
 const angle=terrainData(seed).caves[id].angle,viewX=Math.cos(angle)-Math.sin(angle),viewZ=Math.sin(angle)+Math.cos(angle);
 const cave=caveLayout(seed,id),root=new THREE.Group();parent.add(root);
 const floorGeo=new THREE.PlaneGeometry(2.04,2.04);floorGeo.rotateX(-Math.PI/2);
 const floorMat=new THREE.MeshBasicMaterial({color:'#ffffff',fog:false});
 const wallGeo=new THREE.BoxGeometry(2.12,1,.65,1,2,1),wallMat=new THREE.MeshBasicMaterial({color:'#ffffff',vertexColors:true,fog:false});
 const sight={uPlayer:{value:new THREE.Vector2()},uFacing:{value:new THREE.Vector2(0,1)},uFlicker:{value:1}};
 for(const material of [floorMat,wallMat])material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,sight);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float aSeen;varying vec2 vCaveLocal;varying float vSeen;').replace('#include <project_vertex>','#include <project_vertex>\nvCaveLocal=(instanceMatrix*vec4(transformed,1.0)).xz;vSeen=aSeen;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+SIGHT_PARS).replace('#include <opaque_fragment>',`
   vec3 sightLight=caveSight(vCaveLocal);
   vec3 ghost=diffuseColor.rgb*vec3(.42,.55,.85)*.07;
   outgoingLight=mix(ghost,outgoingLight*sightLight,vSeen);
   #include <opaque_fragment>
  `);
 };
 const wp=wallGeo.attributes.position;for(let i=0;i<wp.count;i++){const x=wp.getX(i),y=wp.getY(i),z=wp.getZ(i);wp.setXYZ(i,x+Math.sin(y*7+z*4)*.09,y,z+Math.sin(x*9+y*5)*.12);}wallGeo.computeVertexNormals();
 const faceColors=[];for(let i=0;i<wp.count;i++){const n=wallGeo.attributes.normal,shade=.65+Math.max(0,n.getY(i))*.25+Math.max(0,n.getX(i))*.1;faceColors.push(shade*.84,shade*.9,shade);}wallGeo.setAttribute('color',new THREE.Float32BufferAttribute(faceColors,3));
 const roofPixels=new Uint8Array(64*64),roofMap=new THREE.DataTexture(roofPixels,64,64,THREE.RedFormat);roofMap.minFilter=THREE.LinearFilter;roofMap.magFilter=THREE.LinearFilter;roofMap.needsUpdate=true;

 const edges=[];for(const cell of cave.tiles)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(!cave.cells.has(`${cell.x+dx},${cell.z+dz}`))edges.push({...cell,dx,dz});
 // Per-instance light state eases between lit (1) and remembered (0), so cells never pop.
 const floorSeen=new THREE.InstancedBufferAttribute(new Float32Array(cave.tiles.length),1),wallSeen=new THREE.InstancedBufferAttribute(new Float32Array(edges.length),1);
 floorGeo.setAttribute('aSeen',floorSeen);wallGeo.setAttribute('aSeen',wallSeen);
 const floor=new THREE.InstancedMesh(floorGeo,floorMat,cave.tiles.length);root.add(floor);
 const walls=new THREE.InstancedMesh(wallGeo,wallMat,edges.length);root.add(walls);
 floor.frustumCulled=false;walls.frustumCulled=false;
 const dummy=new THREE.Object3D(),color=new THREE.Color();
 // Instance colours are fixed up front so the shader program is final before the first frame.
 cave.tiles.forEach((cell,i)=>{const n=Math.sin(cell.x*12.9+cell.z*78.2)*43758.5;color.set('#8b918b').multiplyScalar(.86+(n-Math.floor(n))*.18);floor.setColorAt(i,color);});
 edges.forEach((edge,i)=>{const n=Math.sin(edge.x*31.7+edge.z*11.3+edge.dx*5)*43758.5;color.set('#77827c').multiplyScalar(.85+(n-Math.floor(n))*.2);walls.setColorAt(i,color);});

 // Dust hanging in the air, only visible where the light catches it.
 const DUST=420,dustPositions=new Float32Array(DUST*3),dustSeeds=new Float32Array(DUST);
 for(let i=0;i<DUST;i++){dustPositions.set([(Math.random()-.5)*28,.2+Math.random()*3,(Math.random()-.5)*28],i*3);dustSeeds[i]=Math.random();}
 const dustGeo=new THREE.BufferGeometry();dustGeo.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));dustGeo.setAttribute('aSeed',new THREE.BufferAttribute(dustSeeds,1));
 const dustMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{...sight,uPointScale:{value:Math.min(2,window.devicePixelRatio||1)}},
  vertexShader:`uniform float uPointScale;attribute float aSeed;varying vec2 vCaveLocal;varying float vSeed;void main(){vCaveLocal=position.xz;vSeed=aSeed;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=(1.5+aSeed*2.5)*uPointScale;}`,
  fragmentShader:SIGHT_PARS.replace('varying float vSeen;','')+`varying float vSeed;void main(){vec2 c=gl_PointCoord-.5;float a=smoothstep(.5,.1,length(c));
   vec2 d=vCaveLocal-uPlayer;float r=length(d);float beam=smoothstep(.6,.92,dot(d/max(.01,r),uFacing))*pow(max(0.0,1.0-r/${BEAM_RANGE.toFixed(1)}),1.2);
   float glow=(beam*.55+.05*(1.0-smoothstep(1.0,6.0,r)))*uFlicker*(.4+.6*vSeed);gl_FragColor=vec4(vec3(.78,.8,.84)*glow*a,1.0);}`});
 const dust=new THREE.Points(dustGeo,dustMat);dust.frustumCulled=false;root.add(dust);

 // Something pale at the edge of the light. It is never there when you look straight at it.
 const shapeMat=new THREE.MeshBasicMaterial({color:'#5d646c',transparent:true,opacity:0,depthWrite:false,fog:false});
 const shapeGeos=[new THREE.SphereGeometry(1,10,6),new THREE.BoxGeometry(.07,.07,1)];
 const shape=new THREE.Group();root.add(shape);shape.visible=false;
 const body=new THREE.Mesh(shapeGeos[0],shapeMat);body.scale.set(.42,.3,.85);body.position.y=.55;shape.add(body);
 for(let i=0;i<6;i++){const side=i<3?-1:1,k=i%3,leg=new THREE.Mesh(shapeGeos[1],shapeMat);leg.position.set(side*.5,.3,(k-1)*.45);leg.rotation.order='YXZ';leg.rotation.set(.55,side*Math.PI/2-(k-1)*.45*side,0);shape.add(leg);}
 const presence={state:'gone',timer:8+Math.random()*10,fade:0,x:0,z:0,fleeX:0,fleeZ:0};
 let flicker=0,flickerSeed=0;

 let visible=new Set(),seen=new Set(),clock=1,lastFacing=-100,lastX=-100,lastZ=-100,time=0;
 const facing=new THREE.Vector2();
 function placeTiles(p){
  cave.tiles.forEach((cell,i)=>{
   const known=seen.has(cell.key);
   dummy.position.set(cell.x*CAVE_CELL,-.035+Math.sin(cell.x*1.7+cell.z*.4)*.025,cell.z*CAVE_CELL);dummy.rotation.set(0,0,0);dummy.scale.setScalar(known?1:0);dummy.updateMatrix();floor.setMatrixAt(i,dummy.matrix);
  });
  edges.forEach((edge,i)=>{
   const known=seen.has(edge.key),x=edge.x*2+edge.dx,z=edge.z*2+edge.dz,distance=Math.hypot(x-p.x,z-p.z);
   // The near-facing wall is cut down locally to preserve the isometric player view.
   let height=3.6+Math.sin(edge.x*3.2+edge.z*2.7)*.45;
   if(edge.dx*viewX+edge.dz*viewZ>0&&distance<11)height=.35+Math.max(0,distance-3)*.22;
   dummy.position.set(x,height/2-.05,z);dummy.rotation.set(0,edge.dx?Math.PI/2:0,0);dummy.scale.set(known?1:0,known?height:0,known?1:0);dummy.updateMatrix();walls.setMatrixAt(i,dummy.matrix);
  });
  floor.instanceMatrix.needsUpdate=true;walls.instanceMatrix.needsUpdate=true;
 }
 function ease(attribute,items,dt){
  const k=1-Math.exp(-dt*6),a=attribute.array;let moving=false;
  for(let i=0;i<items.length;i++){const target=visible.has(items[i].key)?1:0,d=target-a[i];if(Math.abs(d)>.002){a[i]+=d*k;moving=true;}else a[i]=target;}
  if(moving)attribute.needsUpdate=true;
 }
 function updatePresence(p,dt,depth){
  const fx=Math.sin(p.facing),fz=Math.cos(p.facing);
  if(presence.state==='gone'){
   presence.timer-=dt*(1+depth*2);if(presence.timer>0)return;
   presence.timer=18+Math.random()*20;
   // A remembered cell at the very edge of sight, in line of sight but outside the beam.
   const cx=Math.round(p.x/CAVE_CELL),cz=Math.round(p.z/CAVE_CELL);
   const spots=cave.tiles.filter(c=>{const dx=c.x*2-p.x,dz=c.z*2-p.z,r=Math.hypot(dx,dz);return r>9.5&&r<12.5&&(dx*fx+dz*fz)/r<.2&&lineVisible(cave,cx,cz,c.x,c.z);});
   if(!spots.length)return;
   const spot=spots[Math.floor(Math.random()*spots.length)];
   Object.assign(presence,{state:'watching',fade:0,x:spot.x*2,z:spot.z*2});
   shape.position.set(presence.x,0,presence.z);shape.rotation.y=Math.atan2(p.x-presence.x,p.z-presence.z);shape.visible=true;
   flicker=.5;
   return;
  }
  const dx=presence.x-p.x,dz=presence.z-p.z,r=Math.hypot(dx,dz),lit=(dx*fx+dz*fz)/r>.6||r<8;
  if(presence.state==='watching'){
   presence.fade=Math.min(1,presence.fade+dt*.5);
   if(lit){presence.state='fleeing';presence.fleeX=dx/r;presence.fleeZ=dz/r;flicker=Math.max(flicker,.35);shape.rotation.y=Math.atan2(presence.fleeX,presence.fleeZ);}
  }else{
   presence.fade=Math.max(0,presence.fade-dt*3.5);presence.x+=presence.fleeX*dt*9;presence.z+=presence.fleeZ*dt*9;
   if(presence.fade<=0){presence.state='gone';shape.visible=false;}
  }
  shape.position.set(presence.x,0,presence.z);
  shapeMat.opacity=presence.fade*.55;
  shape.children.forEach((leg,i)=>{if(i)leg.position.y=.3+Math.sin(time*(presence.state==='fleeing'?40:3)+i*2)*.04;});
 }
 function update(state,dt){
  const p=state.player;time+=dt;
  if(!seen.size)seen=new Set(state.exploredCaves?.[id]||[]);
  sight.uPlayer.value.set(p.x,p.z);sight.uFacing.value.copy(facing.set(Math.sin(p.facing),Math.cos(p.facing)));
  const depth=Math.min(1,Math.max(0,p.z/90));
  // The headlamp stutters when something is near, and now and then on its own deeper down.
  if(Math.random()<dt*.025*depth)flicker=Math.max(flicker,.3);
  flicker=Math.max(0,flicker-dt);
  if(flicker>0){if(Math.random()<.35)flickerSeed=Math.random();sight.uFlicker.value=flickerSeed<.45?.12+flickerSeed:1;}else sight.uFlicker.value=1;
  for(let i=0;i<DUST;i++){
   const o=i*3;dustPositions[o]+=Math.sin(time*.3+dustSeeds[i]*20)*dt*.08;dustPositions[o+1]+=Math.cos(time*.21+dustSeeds[i]*13)*dt*.05;
   dustPositions[o]=p.x+((dustPositions[o]-p.x+14)%28+28)%28-14;dustPositions[o+2]=p.z+((dustPositions[o+2]-p.z+14)%28+28)%28-14;
  }
  dustGeo.attributes.position.needsUpdate=true;
  updatePresence(p,dt,depth);
  ease(floorSeen,cave.tiles,dt);ease(wallSeen,edges,dt);
  clock+=dt;if(clock<.09&&Math.abs(lastFacing-p.facing)<.18&&Math.hypot(lastX-p.x,lastZ-p.z)<.5)return;
  clock=0;lastFacing=p.facing;lastX=p.x;lastZ=p.z;
  visible=visibleCaveCells(cave,p.x,p.z,p.facing);let changed=false;for(const key of visible)if(!seen.has(key)){seen.add(key);changed=true;}
  if(changed){state.exploredCaves??={};state.exploredCaves[id]=[...seen];}
  roofPixels.fill(0);for(const key of seen){const [x,z]=key.split(',').map(Number);if(!visible.has(key)&&Math.hypot(x*2-p.x,z*2-p.z)>6)continue;const index=(z+3)*64+x+32;if(index>=0&&index<roofPixels.length)roofPixels[index]=255;}roofMap.needsUpdate=true;
  placeTiles(p);
  document.body.dataset.caveVisible=String(visible.size);document.body.dataset.caveExplored=String(seen.size);document.body.style.setProperty('--cave-depth',depth.toFixed(3));
 }
 return {root,roofMap,update,dispose(){parent.remove(root);roofMap.dispose();floorGeo.dispose();floorMat.dispose();wallGeo.dispose();wallMat.dispose();dustGeo.dispose();dustMat.dispose();shapeMat.dispose();shapeGeos.forEach(g=>g.dispose());}};
}
