import {terrainData} from './terrain.js';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {caveLayout,visibleCaveCells,lineVisible,CAVE_CELL,SIGHT_RADIUS,BEAM_RANGE,CAVE_ZONES} from './caves.js';

const LIGHTS=8;
/**
 * Sight underground, shared by every lit surface: a dim cold circle around the player that fades to black,
 * a warmer headlamp beam ahead, and up to LIGHTS nearby glows (crystals, vents, the shaft of daylight).
 */
const SIGHT_PARS=`varying vec2 vCaveLocal;varying float vSeen;uniform vec2 uPlayer;uniform vec2 uFacing;uniform float uFlicker;
uniform vec3 uGlow[${LIGHTS}];uniform vec3 uGlowColor[${LIGHTS}];
float caveHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float caveNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(caveHash(i),caveHash(i+vec2(1,0)),f.x),mix(caveHash(i+vec2(0,1)),caveHash(i+vec2(1,1)),f.x),f.y);}
float caveGrit(vec2 p){return .72+.3*caveNoise(p*.9)+.16*caveNoise(p*4.3)+.08*caveNoise(p*13.0);}
vec3 caveSight(vec2 p){
 vec2 d=p-uPlayer;float r=length(d);
 float aura=1.0-smoothstep(1.5,${SIGHT_RADIUS.toFixed(1)},r);
 float beam=smoothstep(.52,.9,dot(d/max(.01,r),uFacing))*pow(max(0.0,1.0-r/${BEAM_RANGE.toFixed(1)}),1.4);
 return (vec3(.012,.014,.02)+vec3(.5,.58,.74)*.42*aura*aura+vec3(1.0,.93,.8)*.78*beam)*uFlicker;
}
vec3 caveGlow(vec2 p){
 vec3 g=vec3(0.0);
 for(int i=0;i<${LIGHTS};i++){float d=length(p-uGlow[i].xy);g+=uGlowColor[i]*uGlow[i].z*pow(max(0.0,1.0-d/6.0),2.0);}
 return g;
}`;

/** Light colours for crystals, vents and the daylight shaft. */
const GLOW={cyan:new THREE.Color(.25,.8,1),violet:new THREE.Color(.62,.36,1),vent:new THREE.Color(.45,.9,.3),sky:new THREE.Color(.6,.72,.95)};
const TILE_COLORS={floor:'#8b918b',spire:'#8b918b',pillar:'#857b6c',ice:'#a8c4d6',vent:'#5d6552',bridge:'#7b8079',shaftUp:'#8b918b'};

export const caveMemoryKey=(id,zone=0)=>zone?`${id}:${zone}`:String(id);

export function createCaveView(seed,id,parent,zone=0){
 const angle=terrainData(seed).caves[id].angle,viewX=Math.cos(angle)-Math.sin(angle),viewZ=Math.sin(angle)+Math.cos(angle);
 const cave=caveLayout(seed,id,zone),root=new THREE.Group(),memory=caveMemoryKey(id,zone);parent.add(root);
 const sight={uPlayer:{value:new THREE.Vector2()},uFacing:{value:new THREE.Vector2(0,1)},uFlicker:{value:1},
  uGlow:{value:Array.from({length:LIGHTS},()=>new THREE.Vector3())},uGlowColor:{value:Array.from({length:LIGHTS},()=>new THREE.Color(0,0,0))}};
 const disposables=[],keep=x=>(disposables.push(x),x);
 /** Instanced surfaces lit by sight. Every instance belongs to a cave cell whose visibility it follows. */
 const litMaterial=vertexColors=>{
  const material=keep(new THREE.MeshBasicMaterial({color:'#ffffff',vertexColors,fog:false}));
  material.onBeforeCompile=shader=>{
   Object.assign(shader.uniforms,sight);
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float aSeen;varying vec2 vCaveLocal;varying float vSeen;').replace('#include <project_vertex>','#include <project_vertex>\nvCaveLocal=(instanceMatrix*vec4(transformed,1.0)).xz;vSeen=aSeen;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+SIGHT_PARS).replace('#include <opaque_fragment>',`
    vec3 glow=caveGlow(vCaveLocal);
    vec3 ghost=diffuseColor.rgb*(vec3(.42,.55,.85)*.07+glow*.5);
    outgoingLight=mix(ghost,outgoingLight*(caveSight(vCaveLocal)*caveGrit(vCaveLocal)+glow),vSeen);
    #include <opaque_fragment>
   `);
  };
  return material;
 };
 const floorMat=litMaterial(false),rockMat=litMaterial(true);
 const groups=[];
 function litGroup(geometry,material,items,place,color){
  const seen=new THREE.InstancedBufferAttribute(new Float32Array(items.length),1);geometry.setAttribute('aSeen',seen);
  const mesh=new THREE.InstancedMesh(keep(geometry),material,Math.max(1,items.length));mesh.count=items.length;mesh.frustumCulled=false;root.add(mesh);
  const c=new THREE.Color();items.forEach((item,i)=>{c.set(color(item));const n=Math.sin(item.x*12.9+item.z*78.2+i*.37)*43758.5;c.multiplyScalar(.85+(n-Math.floor(n))*.2);mesh.setColorAt(i,c);});
  if(!items.length)mesh.setColorAt(0,c.set('#000'));
  const group={mesh,items,seen,place};groups.push(group);return group;
 }
 const shade=geometry=>{geometry.computeVertexNormals();const n=geometry.attributes.normal,colors=[];for(let i=0;i<n.count;i++){const s=.62+Math.max(0,n.getY(i))*.28+Math.max(0,n.getX(i))*.1;colors.push(s*.84,s*.9,s);}geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return geometry;};
 const jitter=(geometry,a,b)=>{const p=geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,x+Math.sin(y*7+z*4)*a,y,z+Math.sin(x*9+y*5)*b);}return geometry;};
 const dummy=new THREE.Object3D();
 const cellKnown=key=>seen.has(key);

 // Floor, except where the ground falls away.
 const floorTiles=cave.tiles.filter(t=>t.type!=='chasm'&&t.type!=='shaftDown');
 const floorGeo=new THREE.PlaneGeometry(2.04,2.04);floorGeo.rotateX(-Math.PI/2);
 litGroup(floorGeo,floorMat,floorTiles,t=>{dummy.position.set(t.x*CAVE_CELL,-.035+Math.sin(t.x*1.7+t.z*.4)*.025,t.z*CAVE_CELL);dummy.rotation.set(0,0,0);dummy.scale.setScalar(1);},t=>TILE_COLORS[t.type]??TILE_COLORS.floor);

 // Walls wrap everything carved; the side facing the camera is cut down near the player.
 const edges=[];for(const t of cave.tiles)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])if(!cave.open.has(`${t.x+dx},${t.z+dz}`))edges.push({key:t.key,x:t.x,z:t.z,dx,dz});
 const wallGroup=litGroup(shade(jitter(new THREE.BoxGeometry(2.12,1,.65,1,2,1),.09,.12)),rockMat,edges,(e,p)=>{
  const x=e.x*2+e.dx,z=e.z*2+e.dz,distance=Math.hypot(x-p.x,z-p.z);
  let height=3.6+Math.sin(e.x*3.2+e.z*2.7)*.45;
  if(e.dx*viewX+e.dz*viewZ>0&&distance<11)height=.35+Math.max(0,distance-3)*.22;
  dummy.position.set(x,height/2-.05,z);dummy.rotation.set(0,e.dx?Math.PI/2:0,0);dummy.scale.set(1,height,1);
 },()=>'#77827c');

 // Cliff faces dropping into chasms and the down shaft, so the dark below reads as depth.
 const lips=[];for(const t of cave.tiles)if(t.type==='chasm'||t.type==='shaftDown')for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const k=`${t.x+dx},${t.z+dz}`,type=cave.types.get(k);if(cave.open.has(k)&&type!=='chasm'&&type!=='shaftDown')lips.push({key:t.key,x:t.x,z:t.z,dx,dz});}
 litGroup(shade(jitter(new THREE.BoxGeometry(2.04,1,.3,1,3,1),.06,.05)),rockMat,lips,l=>{dummy.position.set(l.x*2+l.dx*.86,-3.5,l.z*2+l.dz*.86);dummy.rotation.set(0,l.dx?Math.PI/2:0,0);dummy.scale.set(1,7,1);},()=>'#4c5450');
 // A dim ember glow far below, so a chasm reads as a drop rather than a black stripe.
 const pitItems=cave.tiles.filter(t=>t.type==='chasm'||t.type==='shaftDown');
 // Opaque, so the dimmed surface terrain far below never shows through the hole.
 const pitMat=keep(new THREE.MeshBasicMaterial({color:'#6a1a0a',fog:false}));
 const pits=new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2)),pitMat,Math.max(1,pitItems.length));pits.count=pitItems.length;pits.frustumCulled=false;root.add(pits);

 // Rock spires: tapered, leaning columns that split rooms into paths.
 const spireGeo=new THREE.CylinderGeometry(.12,.75,1,7,4);spireGeo.translate(0,.5,0);
 litGroup(shade(jitter(spireGeo,.07,.07)),rockMat,cave.spires.map(s=>({...s,key:`${s.x},${s.z}`})),s=>{dummy.position.set(s.x*2,0,s.z*2);dummy.rotation.set(s.lean,s.x*1.3+s.z,s.lean*.6);dummy.scale.set(s.r,s.h,s.r);},()=>'#7f8a84');

 // Ruin pillars: squared, banded, older than anything human.
 const pillarParts=[new THREE.BoxGeometry(.8,3.6,.8,1,6,1).translate(0,1.8,0),new THREE.BoxGeometry(1.05,.28,1.05).translate(0,.14,0),new THREE.BoxGeometry(1.05,.28,1.05).translate(0,3.6,0),new THREE.BoxGeometry(.9,.12,.9).translate(0,2.2,0)];
 const pillarGeo=shade(mergeGeometries(pillarParts.map(g=>g.toNonIndexed())));pillarParts.forEach(g=>g.dispose());
 litGroup(pillarGeo,rockMat,cave.pillars.map(p=>({...p,key:`${p.x},${p.z}`})),p=>{dummy.position.set(p.x*2,0,p.z*2);dummy.rotation.set(0,(p.x+p.z)%2?.08:-.06,0);dummy.scale.setScalar(1);},()=>'#8a806f');

 // Crystals glow on their own and light what is around them.
 const shardParts=[0,1,2].map(i=>new THREE.OctahedronGeometry(1,0).scale(.16,.75,.16).rotateZ((i-1)*.45).rotateX((i%2?.25:-.2)).translate((i-1)*.18,.55-(i===1?0:.18),0).toNonIndexed());
 const shardGeo=keep(mergeGeometries(shardParts));shardParts.forEach(g=>g.dispose());
 const crystalMat=keep(new THREE.MeshBasicMaterial({color:'#ffffff',fog:false}));
 const crystalItems=cave.crystals.map(c=>({...c,key:`${c.x},${c.z}`}));
 const crystals=new THREE.InstancedMesh(shardGeo,crystalMat,Math.max(1,crystalItems.length));crystals.count=crystalItems.length;crystals.frustumCulled=false;root.add(crystals);
 const crystalColor=new THREE.Color();crystalItems.forEach((c,i)=>{crystalColor.copy(GLOW[c.hue]).multiplyScalar(1.15);crystals.setColorAt(i,crystalColor);});if(!crystalItems.length)crystals.setColorAt(0,crystalColor.set('#000'));

 // Glyphs carved into ruin walls, faintly lit from within.
 const glyphCanvas=document.createElement('canvas');glyphCanvas.width=128;glyphCanvas.height=96;
 {const g=glyphCanvas.getContext('2d');g.strokeStyle='#fff';g.lineWidth=3;g.lineCap='round';let s=7;const r=()=>(s=(s*16807)%2147483647)/2147483647;
  for(let row=0;row<3;row++)for(let col=0;col<4;col++){const x=14+col*32,y=16+row*30;g.beginPath();g.moveTo(x+r()*10-5,y-10);for(let k=0;k<3;k++)g.lineTo(x+r()*20-10,y+r()*20-10);g.stroke();if(r()<.5){g.beginPath();g.arc(x,y,4+r()*3,0,Math.PI*2);g.stroke();}}}
 const glyphTexture=keep(new THREE.CanvasTexture(glyphCanvas));
 const glyphMat=keep(new THREE.MeshBasicMaterial({map:glyphTexture,color:'#4fd6bd',transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));
 const glyphItems=cave.glyphs.map(g=>({...g,key:`${g.x},${g.z}`}));
 const glyphs=new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(1.4,1.05)),glyphMat,Math.max(1,glyphItems.length));glyphs.count=glyphItems.length;glyphs.frustumCulled=false;root.add(glyphs);

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

 // Something pale at the edge of the light. It is never there when you look straight at it.
 const shapeMat=keep(new THREE.MeshBasicMaterial({color:'#5d646c',transparent:true,opacity:0,depthWrite:false,fog:false}));
 const shapeGeos=[keep(new THREE.SphereGeometry(1,10,6)),keep(new THREE.BoxGeometry(.07,.07,1))];
 const shape=new THREE.Group();root.add(shape);shape.visible=false;
 const body=new THREE.Mesh(shapeGeos[0],shapeMat);body.scale.set(.42,.3,.85);body.position.y=.55;shape.add(body);
 for(let i=0;i<6;i++){const side=i<3?-1:1,k=i%3,leg=new THREE.Mesh(shapeGeos[1],shapeMat);leg.position.set(side*.5,.3,(k-1)*.45);leg.rotation.order='YXZ';leg.rotation.set(.55,side*Math.PI/2-(k-1)*.45*side,0);shape.add(leg);}
 const presence={state:'gone',timer:8+Math.random()*10,fade:0,x:0,z:0,fleeX:0,fleeZ:0};
 let flicker=0,flickerSeed=0;

 const roofPixels=new Uint8Array(64*64),roofMap=keep(new THREE.DataTexture(roofPixels,64,64,THREE.RedFormat));roofMap.minFilter=THREE.LinearFilter;roofMap.magFilter=THREE.LinearFilter;roofMap.needsUpdate=true;
 let visible=new Set(),seen=new Set(),loaded=false,clock=1,lastFacing=-100,lastX=-100,lastZ=-100,time=0;
 const glowSources=[
  ...crystalItems.map(c=>({key:c.key,x:c.x*2+c.dx*.8,z:c.z*2+c.dz*.8,color:GLOW[c.hue],strength:.55*c.size})),
  ...cave.vents.map(v=>({key:`${v.x},${v.z}`,x:v.x*2,z:v.z*2,color:GLOW.vent,strength:.28})),
  ...(cave.up?[{key:`${cave.up.x},${cave.up.z}`,x:cave.up.x*2,z:cave.up.z*2,color:GLOW.sky,strength:.75,always:true}]:[]),
 ];

 function place(p){
  for(const g of groups){g.items.forEach((item,i)=>{g.place(item,p);if(!cellKnown(item.key))dummy.scale.setScalar(0);dummy.updateMatrix();g.mesh.setMatrixAt(i,dummy.matrix);});g.mesh.instanceMatrix.needsUpdate=true;}
  crystalItems.forEach((c,i)=>{const wall=c.dx||c.dz;dummy.position.set(c.x*2+c.dx*.78,wall?.2:0,c.z*2+c.dz*.78);dummy.rotation.set(-c.dz*.5,(c.x*7+c.z*3)%6,c.dx*.5);dummy.scale.setScalar(cellKnown(c.key)?c.size:0);dummy.updateMatrix();crystals.setMatrixAt(i,dummy.matrix);});crystals.instanceMatrix.needsUpdate=true;
  pitItems.forEach((t,i)=>{dummy.position.set(t.x*2,-1.1,t.z*2);dummy.rotation.set(0,0,0);dummy.scale.setScalar(cellKnown(t.key)?1:0);dummy.updateMatrix();pits.setMatrixAt(i,dummy.matrix);});pits.instanceMatrix.needsUpdate=true;
  glyphItems.forEach((g,i)=>{dummy.position.set(g.x*2+g.dx*.66,1.75,g.z*2+g.dz*.66);dummy.rotation.set(0,Math.atan2(-g.dx,-g.dz),0);dummy.scale.setScalar(cellKnown(g.key)?1:0);dummy.updateMatrix();glyphs.setMatrixAt(i,dummy.matrix);});glyphs.instanceMatrix.needsUpdate=true;
 }
 function ease(dt){
  const k=1-Math.exp(-dt*6);
  for(const g of groups){const a=g.seen.array;let moving=false;for(let i=0;i<g.items.length;i++){const target=visible.has(g.items[i].key)?1:0,d=target-a[i];if(Math.abs(d)>.002){a[i]+=d*k;moving=true;}else a[i]=target;}if(moving)g.seen.needsUpdate=true;}
 }
 function updateGlow(p){
  const near=glowSources.filter(s=>s.always||seen.has(s.key)).map(s=>({s,d:Math.hypot(s.x-p.x,s.z-p.z)})).sort((a,b)=>a.d-b.d).slice(0,LIGHTS);
  for(let i=0;i<LIGHTS;i++){const n=near[i];if(n){sight.uGlow.value[i].set(n.s.x,n.s.z,n.s.strength*(n.s.key&&cave.types.get(n.s.key)==='vent'?.8+.2*Math.sin(time*2+i):1));sight.uGlowColor.value[i].copy(n.s.color);}else sight.uGlow.value[i].set(0,0,0);}
 }
 function updateVents(dt){
  cave.vents.forEach((v,j)=>{for(let k=0;k<VENT_PUFFS;k++){const i=j*VENT_PUFFS+k;ventLife[i]+=dt*(.25+(k%5)*.04);if(ventLife[i]>1)ventLife[i]-=1;const l=ventLife[i],a=k*2.4;ventPositions.set([v.x*2+Math.cos(a)*l*.6,.1+l*2.4,v.z*2+Math.sin(a)*l*.6],i*3);}});
  if(ventCount){ventGeo.attributes.position.needsUpdate=true;ventGeo.attributes.aLife.needsUpdate=true;}
  vents.visible=cave.vents.some(v=>seen.has(`${v.x},${v.z}`));
 }
 function updatePresence(p,dt,depth){
  const fx=Math.sin(p.facing),fz=Math.cos(p.facing);
  if(presence.state==='gone'){
   presence.timer-=dt*(1+depth*2);if(presence.timer>0)return;
   presence.timer=18+Math.random()*20;
   // A walkable cell at the very edge of sight, in line of sight but outside the beam.
   const cx=Math.round(p.x/CAVE_CELL),cz=Math.round(p.z/CAVE_CELL);
   const spots=cave.tiles.filter(c=>{if(!cave.cells.has(c.key))return false;const dx=c.x*2-p.x,dz=c.z*2-p.z,r=Math.hypot(dx,dz);return r>9.5&&r<12.5&&(dx*fx+dz*fz)/r<.2&&lineVisible(cave,cx,cz,c.x,c.z);});
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
  if(!loaded){seen=new Set(state.exploredCaves?.[memory]||[]);loaded=true;}
  sight.uPlayer.value.set(p.x,p.z);sight.uFacing.value.set(Math.sin(p.facing),Math.cos(p.facing));
  const depth=Math.min(1,(zone+Math.min(1,Math.max(0,p.z/90)))/CAVE_ZONES);
  // The headlamp stutters when something is near, and now and then on its own deeper down.
  if(Math.random()<dt*.03*depth)flicker=Math.max(flicker,.3);
  flicker=Math.max(0,flicker-dt);
  if(flicker>0){if(Math.random()<.35)flickerSeed=Math.random();sight.uFlicker.value=flickerSeed<.45?.12+flickerSeed:1;}else sight.uFlicker.value=1;
  for(let i=0;i<DUST;i++){
   const o=i*3;dustPositions[o]+=Math.sin(time*.3+dustSeeds[i]*20)*dt*.08;dustPositions[o+1]+=Math.cos(time*.21+dustSeeds[i]*13)*dt*.05;
   dustPositions[o]=p.x+((dustPositions[o]-p.x+14)%28+28)%28-14;dustPositions[o+2]=p.z+((dustPositions[o+2]-p.z+14)%28+28)%28-14;
  }
  dustGeo.attributes.position.needsUpdate=true;
  glyphMat.opacity=.55+.25*Math.sin(time*.9);pitMat.color.setRGB(.14+.03*Math.sin(time*.5),.012,.004);
  updatePresence(p,dt,depth);updateVents(dt);updateGlow(p);ease(dt);
  clock+=dt;if(clock<.09&&Math.abs(lastFacing-p.facing)<.18&&Math.hypot(lastX-p.x,lastZ-p.z)<.5)return;
  clock=0;lastFacing=p.facing;lastX=p.x;lastZ=p.z;
  visible=visibleCaveCells(cave,p.x,p.z,p.facing);
  // Crystals shine far beyond the headlamp, so they are spotted from anywhere in line of sight.
  const cx=Math.round(p.x/CAVE_CELL),cz=Math.round(p.z/CAVE_CELL);
  for(const c of crystalItems)if(!seen.has(c.key)&&Math.hypot(c.x*2-p.x,c.z*2-p.z)<34&&lineVisible(cave,cx,cz,c.x,c.z))seen.add(c.key);
  let changed=false;for(const key of visible)if(!seen.has(key)){seen.add(key);changed=true;}
  if(changed){state.exploredCaves??={};state.exploredCaves[memory]=[...seen];}
  roofPixels.fill(0);for(const key of seen){const [x,z]=key.split(',').map(Number);if(!visible.has(key)&&Math.hypot(x*2-p.x,z*2-p.z)>6)continue;const index=(z+3)*64+x+32;if(index>=0&&index<roofPixels.length)roofPixels[index]=255;}roofMap.needsUpdate=true;
  place(p);
  document.body.dataset.caveVisible=String(visible.size);document.body.dataset.caveExplored=String(seen.size);document.body.style.setProperty('--cave-depth',depth.toFixed(3));
 }
 return {root,roofMap,cave,update,dispose(){parent.remove(root);disposables.forEach(d=>d.dispose());crystals.dispose();glyphs.dispose();groups.forEach(g=>g.mesh.dispose());}};
}
