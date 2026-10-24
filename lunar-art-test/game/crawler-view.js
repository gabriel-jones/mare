import * as THREE from 'three';
import {SIGHT_PARS} from './cave-view.js';
import {CRAWLER} from './crawler.js';

/**
 * The crawler's body comes from Blender (crawler.glb: ShellL, ShellR, Maw, Core); its legs are grown and stepped here.
 * Eight needle legs solve two-bone IK from hips on the body to planted feet. A foot stays put until the body has moved
 * on, then darts to a new hold in a fraction of a second, never alongside its neighbours. Poses per behaviour state
 * lift, sweep or curl legs. Everything is placed in the parent's space (the cave root underground).
 */
const LEGS=8,FEMUR=1.15,TIBIA=1,META=.55;
const SIDE_ANGLES=[.5,1.2,1.95,2.6];
const REST_HEIGHT={emerge:.42,idle:1.05,lurk:1.05,stalk:.78,close:.7,skitter:1,evade:.72,flee:1.05,recover:.9,slash:1.2,recoil:1.4,hit:1,shriek:2.15,lunge:.62,grab:1.84,dead:.3};
const OPEN={shriek:1,lunge:.85,grab:1,slash:.5};

const legInfo=[...Array(LEGS)].map((_,i)=>{
 const side=i<4?-1:1,j=i%4,a=SIDE_ANGLES[j],reach=j===0?1.6:j===3?1.5:1.45;
 return {side,j,hip:new THREE.Vector3(side*Math.sin(a)*.15,.02,Math.cos(a)*.2),rest:new THREE.Vector3(side*Math.sin(a)*reach,0,Math.cos(a)*reach)};
});
// A leg may not lift while a neighbour on its side or its mirror is in the air.
const neighbours=i=>{const s=i<4?0:4,j=i%4;return [...(j>0?[s+j-1]:[]),...(j<3?[s+j+1]:[]),(4-s)+j];};

/**
 * Living goo: the surface ripples and creeps downward, sags under its own weight and lags behind the body's motion.
 * Normals follow the ripples so the light moves across them. On the shells the motion fades to nothing at the slit
 * (x = 0) so the two halves still meet.
 */
const GOO=`
uniform float uTime;uniform vec3 uSag;uniform float uPulse;varying vec3 vGoo;
float gooFlow(vec3 p){
 float slow=sin(p.x*11.+uTime*1.3+sin(p.z*7.-uTime*.8)*1.6)*sin(p.z*9.-uTime*1.1+sin(p.y*8.+uTime*.6)*1.4);
 float creep=pow(max(0.,sin(p.y*12.+p.z*4.+uTime*2.2)),4.)*smoothstep(.05,-.2,p.y);
 return slow*.6+creep*.9;
}`;
/** Vertex code for `caveFrom`: object (or instance) space to cave space, for the sight-lit materials. */
const TO_CAVE='mat4 caveFrom=uToCave*modelMatrix;\n#ifdef USE_INSTANCING\ncaveFrom=caveFrom*instanceMatrix;\n#endif\n';
function gooShader(shader,uniforms,amount,body){
 Object.assign(shader.uniforms,uniforms);
 const a=amount.toFixed(4),seam=body?'smoothstep(.0,.09,abs(p.x))':'1.0';
 shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\n${GOO}\nfloat gooD(vec3 p){return ${a}*(1.0+4.0*uPulse)*gooFlow(p)*${seam};}
vec3 gooNormal(vec3 p,vec3 n){float e=.01,d=gooD(p);vec3 g=vec3(gooD(p+vec3(e,0,0))-d,gooD(p+vec3(0,e,0))-d,gooD(p+vec3(0,0,e))-d)/e;return normalize(n-(g-dot(g,n)*n));}`)
  .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=gooNormal(position,objectNormal);')
  .replace('#include <begin_vertex>',`#include <begin_vertex>
   vec3 gooN=gooNormal(position,normal);
   {vec3 p=position;transformed+=normal*gooD(p);vGoo=p;
    ${body?'float low=smoothstep(.04,-.2,p.y)*smoothstep(.0,.09,abs(p.x));transformed+=vec3(uSag.x,-uSag.y,uSag.z)*low*low;':''}}`);
 // Wet in patches, dulled skin between, slowly drifting.
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uTime;varying vec3 vGoo;\nfloat gooWet(){return smoothstep(-.2,.6,sin(vGoo.x*23.+uTime*.4)*sin(vGoo.z*19.-uTime*.3)+sin(vGoo.y*31.+vGoo.x*7.)*.45);}');
 if(shader.fragmentShader.includes('#include <roughnessmap_fragment>'))shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.62,.16,gooWet());');
 // Burning: the goo chars to a dull ash-black crust that cracks open on glowing heat underneath.
 shader.uniforms.uHeat??={value:0};shader.uniforms.uChar??={value:0};
 shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uHeat;uniform float uChar;')
  .replace('#include <opaque_fragment>',`#include <opaque_fragment>
   if(uChar+uHeat>.001){
    vec3 g=vGoo*vec3(38.,44.,40.);
    float n=sin(g.x+sin(g.z*.9+uTime*.3)*2.1)*sin(g.z+sin(g.y*1.1)*2.3)*sin(g.y*1.2+sin(g.x*.8)*1.7);
    float crack=smoothstep(.82,.99,1.0-abs(n)),pulse=.65+.35*sin(uTime*11.+g.x*.4+g.z*.3);
    gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.045,.038,.034)+gl_FragColor.rgb*.25,uChar*.85);
    gl_FragColor.rgb+=vec3(1.,.32,.05)*(crack*2.2+.18)*uHeat*pulse+vec3(1.,.55,.2)*crack*uChar*.12;
   }`);
}

/**
 * Wet black goo. In the studio it is physically lit; underground it takes the cave's sight and catches only the lamp.
 * `shared` holds the animation uniforms (uTime, uSag, uPulse); the caller owns and disposes the material.
 */
export function gooInk({mode='studio',shared,sight=null,toCave=null,viewDir=null},amount,body=false){
 if(mode==='studio'){
  const m=new THREE.MeshPhysicalMaterial({color:'#070708',roughness:.4,metalness:0,clearcoat:.35,clearcoatRoughness:.35,envMapIntensity:.7});
  m.onBeforeCompile=s=>gooShader(s,shared,amount,body);return m;
 }
 const m=new THREE.MeshBasicMaterial({color:'#050506',fog:false});
 m.onBeforeCompile=shader=>{
  gooShader(shader,{...shared,...sight,uToCave:toCave,uViewDir:viewDir},amount,body);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 uToCave;varying vec3 vCave;varying vec3 vCaveN;')
   .replace('#include <project_vertex>','#include <project_vertex>\n'+TO_CAVE+'vCave=(caveFrom*vec4(transformed,1.0)).xyz;vCaveN=mat3(caveFrom)*gooN;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 uViewDir;varying vec3 vCave;varying vec3 vCaveN;\n'+SIGHT_PARS.replace('varying vec2 vCaveLocal;varying float vSeen;',''))
   .replace('#include <opaque_fragment>',`
    vec3 n=normalize(vCaveN);vec3 toLamp=normalize(vec3(uPlayer.x,1.5,uPlayer.y)-vCave);
    float lampLevel=dot(caveSightRaw(vCave.xz),vec3(.33));
    // Wet black: a hard highlight where the surface mirrors the lamp toward the eye, and a thin rim.
    float wet=gooWet();
    float glint=smoothstep(.95,.985,dot(reflect(-toLamp,n),uViewDir))*wet;
    float rim=smoothstep(.72,.82,1.0-abs(dot(n,uViewDir)))*max(0.0,dot(n,toLamp)*.7+.3);
    outgoingLight=diffuseColor.rgb*caveSight(vCave.xz)+vec3(.62,.68,.8)*lampLevel*(glint*1.1+rim*.2)+caveGlow(vCave.xz)*(rim*.15+glint*.35);
    #include <opaque_fragment>`);
 };
 return m;
}

/** Goo leg parts that swell where they join and thin between, ending in bone needles (no hard joints), and the
 * knee strand that gathers a drop. `keep` collects them for disposal. */
export function legGeometry(keep=g=>g){
 const lathe=(profile,bow=0,round=0)=>{
  // Rounded ends so overlapping segments melt into one blob at each joint instead of showing cut tubes.
  const cap=y=>round?Math.sqrt(Math.min(1,y/round))*Math.sqrt(Math.min(1,(1-y)/round)):1;
  const pts=[];for(let i=0;i<=40;i++){const y=i/40;pts.push(new THREE.Vector2(Math.max(.001,profile(y)*cap(y)),y));}
  const g=new THREE.LatheGeometry(pts,10);const p=g.attributes.position;
  for(let i=0;i<p.count;i++){const y=p.getY(i);p.setX(i,p.getX(i)+Math.sin(y*Math.PI)*bow);}
  g.computeVertexNormals();return keep(g);
 };
 const swell=(y,at,width)=>{const k=(y-at)/width;return Math.exp(-k*k);};
 const geo={
  femur:lathe(y=>.026+.026*swell(y,.04,.12)+.014*swell(y,.97,.1)+.004*Math.sin(y*19),.025,.05),
  tibia:lathe(y=>.018+.014*swell(y,.04,.1)+.006*swell(y,.97,.08)+.003*Math.sin(y*23),-.02,.04),
  meta:lathe(y=>.016*(1-y*.55)+.006*swell(y,.04,.1),0,.03),
  needle:keep(new THREE.ConeGeometry(.011,.2,7).translate(0,.1,0)),
  // A drop gathering on a thread, hung from each knee; it lengthens until the drop lets go.
  strand:lathe(y=>.014*(1-y)**5+.0035+(y>.8?.017*Math.sqrt(Math.max(0,1-((y-.9)/.1)**2)):0)),
 };
 geo.strand.rotateX(Math.PI);
 return geo;
}

/** Abdomen looks under review (alien-lab.html); `abdomenStyle` is the one the game draws. */
export const ABDOMEN_STYLES=Object.freeze({
 bulb:'Spider bulb: a heavy glossy sphere riding high behind',
 sac:'Brood sac: a thin dark membrane, the brood squirming inside against a red glow',
 segments:'Segmented: a curled, ribbed gaster of overlapping goo plates',
 pustules:'Pustules: a lumpy sack studded with glowing red blisters, like the goo vat',
});
export const abdomenStyle={value:'segments'};
const RED='#ff1a0a';
/** A sphere roughed into a lumpy blob, `seed` picking the lumps. */
function lumpy(segments,seed,amount=.06){
 const g=new THREE.SphereGeometry(1,segments,Math.round(segments*.7)),p=g.attributes.position,v=new THREE.Vector3();
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const n=1+amount*(Math.sin(v.x*6.1+seed)*Math.sin(v.y*5.3+seed*1.7)+.6*Math.sin(v.z*8.7-seed*2.3)*Math.sin(v.x*4.4+v.y*3.1));p.setXYZ(i,v.x*n,v.y*n,v.z*n);}
 g.computeVertexNormals();return g;
}
/**
 * The abdomen behind the body, in the body's space (+Z ahead). `belly` (0–1) sizes it. It breathes, swings out
 * behind on a turn, and splits open when its crawler dies. `keep` collects disposables.
 */
function createAbdomen(style,belly,{ink,keep,castShadow}){
 const pivot=new THREE.Group(),k=.75+.95*belly,parts=[];pivot.position.set(0,.02,-.2);
 const add=(geo,mat,x,y,z,sx,sy,sz,into=pivot)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=castShadow;m.frustumCulled=false;into.add(m);parts.push(m);return m;};
 const goo=ink(.018),neck=keep(lumpy(14,1.3,.03));
 add(neck,goo,0,0,-.04,.08,.07,.09);
 const centre=new THREE.Vector3(),glow=[],wrigglers=[],plates=[];let membrane=null;
 if(style==='bulb'||style==='pustules'){
  const r=.27*k;centre.set(0,.08*k,-.06-r*1.05);
  add(keep(lumpy(32,2.1,style==='pustules'?.09:.035)),goo,centre.x,centre.y,centre.z,r*.95,r*.85,r*1.15);
  if(style==='pustules'){
   const blister=keep(new THREE.MeshStandardMaterial({color:'#4a0404',emissive:RED,emissiveIntensity:1.4,roughness:.25})),bump=keep(new THREE.SphereGeometry(1,10,8));
   for(let i=0;i<9+Math.round(belly*8);i++){
    const a=i*2.39996,y=1-(i+.5)/(9+belly*8)*1.6,rr=Math.sqrt(Math.max(0,1-y*y)),dir=new THREE.Vector3(Math.cos(a)*rr,y*.9,Math.sin(a)*rr-.15).normalize();
    if(dir.y<-.55)continue;const s=r*(.09+.07*((i*.618)%1));
    const m=add(bump,blister,centre.x+dir.x*r*.93,centre.y+dir.y*r*.82,centre.z+dir.z*r*1.1,s,s*.8,s);glow.push({m,phase:i*1.7,s});
   }
  }
 }else if(style==='sac'){
  const r=.3*k;centre.set(0,-.02*k,-.04-r*1.1);
  membrane=keep(new THREE.MeshPhysicalMaterial({color:'#1a0606',roughness:.12,clearcoat:1,clearcoatRoughness:.08,transparent:true,opacity:.55,depthWrite:false,emissive:'#3a0302',emissiveIntensity:.6}));
  const skin=add(keep(lumpy(32,4.2,.05)),membrane,centre.x,centre.y,centre.z,r*.9,r*.82,r*1.2);skin.renderOrder=2;
  const core=keep(new THREE.MeshBasicMaterial({color:RED,transparent:true,opacity:.5,blending:THREE.AdditiveBlending,depthWrite:false}));
  const heart=add(keep(new THREE.SphereGeometry(1,16,12)),core,centre.x,centre.y,centre.z,r*.45,r*.4,r*.6);glow.push({m:heart,phase:0,s:r*.45,core:true});
  const embryo=keep(lumpy(12,7.7,.12)),dark=ink(.03);
  for(let i=0;i<3+Math.round(belly*4);i++){
   const a=i*2.1,home=new THREE.Vector3(Math.cos(a)*r*.38,Math.sin(i*1.3)*r*.25,Math.sin(a)*r*.5).add(centre);
   const m=add(embryo,dark,home.x,home.y,home.z,r*.24,r*.17,r*.3);m.renderOrder=1;wrigglers.push({m,home,phase:i*1.9});
  }
 }else{
  // Overlapping plates along a curve that sweeps back and curls down, each narrower than the last.
  const plate=keep(lumpy(24,5.5,.025)),gloss=ink(.01),n=5;let at=new THREE.Vector3(0,.02,-.08),dir=new THREE.Vector3(0,.25,-1).normalize();
  let parent=pivot;
  for(let i=0;i<n;i++){
   const r=.2*k*(1-i*.13),seg=new THREE.Group();seg.position.copy(at);parent.add(seg);
   const m=add(plate,gloss,0,0,-r*.75,r*1.05,r*.86,r*.95,seg);
   plates.push({seg,rest:new THREE.Euler(i?-.42-.04*i:.3,0,0)});seg.rotation.copy(plates.at(-1).rest);
   parent=seg;at=new THREE.Vector3(0,0,-r*1.25);dir.applyAxisAngle(new THREE.Vector3(1,0,0),.35);
   if(i===0)centre.set(0,0,-r*2.4);
  }
 }
 let swing=0,popped=false;const lastYaw={v:null};
 return {pivot,centre,
  update(dt,clock,{yaw,dead,t,drip,splatAt,toRoot}){
   if(dead&&!popped&&t>.12){popped=true;pivot.visible=false;
    const at=toRoot(pivot.position.clone().add(centre));
    for(let i=0;i<24;i++)drip(at.clone().add(new THREE.Vector3((Math.random()-.5)*.25*k,0,(Math.random()-.5)*.25*k)),.02+Math.random()*.03*k,new THREE.Vector3((Math.random()-.5)*5,1.5+Math.random()*3,(Math.random()-.5)*5));
    splatAt(at,.35*k);}
   if(!dead&&popped){popped=false;pivot.visible=true;}
   const turn=lastYaw.v==null?0:Math.atan2(Math.sin(yaw-lastYaw.v),Math.cos(yaw-lastYaw.v))/Math.max(dt,1e-4);lastYaw.v=yaw;
   swing+=(THREE.MathUtils.clamp(-turn*.12,-.5,.5)-swing)*(1-Math.exp(-dt*4));
   const breathe=1+.045*Math.sin(clock*1.9);
   pivot.rotation.set(-.06+.04*Math.sin(clock*1.3),swing,swing*.3);pivot.scale.set(breathe,1+.6*(breathe-1),breathe);
   plates.forEach((p,i)=>{p.seg.rotation.set(p.rest.x+.06*Math.sin(clock*2.2-i*.7),swing*.35,0);});
   for(const g of glow){const pulse=.5+.5*Math.sin(clock*(g.core?2.4:1.7)+g.phase);if(g.core){g.m.material.opacity=.28+.3*pulse;}else{g.m.material.emissiveIntensity=1.1+.7*pulse;}}
   for(const w of wrigglers){w.m.position.set(w.home.x+.03*k*Math.sin(clock*3.1+w.phase),w.home.y+.02*k*Math.sin(clock*4.3+w.phase*2),w.home.z+.03*k*Math.cos(clock*2.7+w.phase));w.m.rotation.set(Math.sin(clock*2+w.phase),clock*.7+w.phase,0);}
  },
  reset(){popped=false;pivot.visible=true;lastYaw.v=null;},
 };
}

/** Black bone (teeth, needles, plates) and the maw: lit in the studio, under the cave's sight below ground. */
export function hardParts({mode='studio',sight=null,toCave=null},keep){
 const bone=mode==='studio'?keep(new THREE.MeshStandardMaterial({color:'#060607',roughness:.12,envMapIntensity:1.6})):keep(new THREE.MeshBasicMaterial({color:'#0b0b0d',fog:false}));
 if(mode!=='studio')bone.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,sight,{uToCave:toCave});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform mat4 uToCave;varying vec3 vCave;').replace('#include <project_vertex>','#include <project_vertex>\n'+TO_CAVE+'vCave=(caveFrom*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCave;\n'+SIGHT_PARS.replace('varying vec2 vCaveLocal;varying float vSeen;','')).replace('#include <opaque_fragment>','outgoingLight=diffuseColor.rgb*(caveSight(vCave.xz)*1.4+caveGlow(vCave.xz));\n#include <opaque_fragment>');
 };
 const maw=mode==='studio'?keep(new THREE.MeshStandardMaterial({color:'#080404',roughness:.25})):keep(new THREE.MeshBasicMaterial({color:'#000000',fog:false}));
 return {bone,maw};
}
export function createCrawlerView(gltf,parent,{mode='studio',sight=null,toCave=null,viewDir=null,girth=0,abdomen=null,lite=false}={}){
 const root=new THREE.Group(),time={value:0},owned=[];parent.add(root);
 const keep=x=>(owned.push(x),x);
 const sag={value:new THREE.Vector3()},pulse={value:0};
 const heat={value:0},char={value:0};
 const shared={uTime:time,uSag:sag,uPulse:pulse,uHeat:heat,uChar:char};
 const ink=(amount,body=false)=>keep(gooInk({mode,shared,sight,toCave,viewDir},amount,body));
 // Teeth are black needles; only a wet glint picks them out from the goo.
 const {bone,maw}=hardParts({mode,sight,toCave},keep);
 const bodyInk=ink(.022,true),legInk=ink(.004),dropInk=ink(0);

 // Body. Blender's fixed drip cluster (Core) is replaced by live strands below.
 const body=new THREE.Group();root.add(body);
 const model=gltf.scene.clone(true);body.add(model);
 const shells={};
 model.traverse(o=>{
  if(o.name==='ShellL'||o.name==='ShellR')shells[o.name]=o;
  if(o.name==='Core')o.visible=false;
  if(!o.isMesh)return;o.castShadow=mode==='studio'&&!lite;o.frustumCulled=false;
  const name=o.material.name;o.material=name.includes('bone')?bone:name.includes('maw')?maw:bodyInk;
 });
 // Where belly strands may grow: underside points of the shells, in the body's space.
 model.updateMatrixWorld(true);
 const belly=[];
 Object.values(shells).forEach(shell=>shell.traverse(o=>{
  if(!o.isMesh||o.material!==bodyInk)return;
  const p=o.geometry.attributes.position,n=o.geometry.attributes.normal,m=o.matrixWorld,nm=new THREE.Matrix3().getNormalMatrix(m);
  for(let i=0;i<p.count;i+=3){const v=new THREE.Vector3().fromBufferAttribute(n,i).applyMatrix3(nm).normalize();if(v.y<-.75)belly.push(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(m));}
 }));

 const tail=girth>0&&mode==='studio'?createAbdomen(abdomen??abdomenStyle.value,girth,{ink,keep,castShadow:!lite}):null;
 if(tail)body.add(tail.pivot);
 const geo=legGeometry(keep);
 const legs=legInfo.map((info,i)=>{
  const parts={femur:new THREE.Mesh(geo.femur,legInk),tibia:new THREE.Mesh(geo.tibia,legInk),meta:new THREE.Mesh(geo.meta,legInk),needle:new THREE.Mesh(geo.needle,legInk),strand:new THREE.Mesh(geo.strand,legInk)};
  Object.values(parts).forEach(m=>{m.castShadow=mode==='studio'&&!lite;m.frustumCulled=false;root.add(m);});
  return {...info,parts,foot:new THREE.Vector3(),from:new THREE.Vector3(),to:new THREE.Vector3(),step:0,duration:.1,lift:.3,free:false,knee:new THREE.Vector3(),ankle:new THREE.Vector3(),strand:Math.random(),strandLength:.12+(i*.37%1)*.22,
   shrink:1,wrapAnkle:null,wrapFrom:new THREE.Vector3(),wrapPole:null,spasm:new THREE.Vector3(),spasmT:0};
 });

 // Belly strands: each gathers a drop somewhere on the underside, stretches until it lets go, then forms again elsewhere.
 const BELLY=lite?3:6;
 const bellyStrands=[...Array(BELLY)].map(()=>{
  const mesh=new THREE.Mesh(geo.strand,legInk);mesh.castShadow=mode==='studio';mesh.frustumCulled=false;root.add(mesh);
  return {mesh,at:new THREE.Vector3(),grow:Math.random(),rate:.3,length:.2,retract:0};
 });
 const reseed=s=>{if(belly.length)s.at.copy(belly[Math.floor(Math.random()*belly.length)]);s.at.y+=.03;s.grow=0;s.rate=.25+Math.random()*.6;s.length=.12+Math.random()*.38;};
 bellyStrands.forEach(s=>{reseed(s);s.grow=Math.random();});

 // Goo: drops that fall from the knees and the belly, and splats where they land or where a foot plants.
 const dropGeo=keep(new THREE.SphereGeometry(1,8,6)),splatGeo=keep(new THREE.CircleGeometry(1,20).rotateX(-Math.PI/2));
 {const p=splatGeo.attributes.position;for(let i=1;i<p.count;i++){const a=Math.atan2(p.getZ(i),p.getX(i)),r=.86+.09*Math.sin(a*3+1)+.05*Math.sin(a*5+2);p.setX(i,Math.cos(a)*r);p.setZ(i,Math.sin(a)*r);}}
 const dropMat=mode==='studio'?dropInk:keep(new THREE.MeshBasicMaterial({color:'#020203',fog:false}));
 const splatMat=keep(mode==='studio'?new THREE.MeshPhysicalMaterial({color:'#050506',roughness:.1,clearcoat:1,transparent:true,opacity:.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}):new THREE.MeshBasicMaterial({color:'#010102',transparent:true,opacity:.9,depthWrite:false,fog:false,polygonOffset:true,polygonOffsetFactor:-2}));
 const DROPS=48,SPLATS=64;
 const drops=new THREE.InstancedMesh(dropGeo,dropMat,DROPS),splats=new THREE.InstancedMesh(splatGeo,splatMat,SPLATS);drops.frustumCulled=splats.frustumCulled=false;root.add(drops,splats);
 const dropState=[...Array(DROPS)].map(()=>({p:new THREE.Vector3(),v:new THREE.Vector3(),alive:false,size:.02}));
 const splatState=[...Array(SPLATS)].map(()=>({x:0,z:0,r:0,age:99,life:8}));
 let nextDrop=0,nextSplat=0,dropClock=0;
 const splat=(x,z,r,life=8)=>{const s=splatState[nextSplat];nextSplat=(nextSplat+1)%SPLATS;Object.assign(s,{x,z,r,age:0,life});};
 const drip=(p,size=.02+Math.random()*.02,v=null)=>{const d=dropState[nextDrop];nextDrop=(nextDrop+1)%DROPS;d.p.copy(p);if(v)d.v.copy(v);else d.v.set((Math.random()-.5)*.2,-.2,(Math.random()-.5)*.2);d.alive=true;d.size=size;};

 const pos=new THREE.Vector3(),vel=new THREE.Vector3(),last=new THREE.Vector3(),pose={height:1.05,pitch:0,roll:0,open:0,yaw:0};let started=false,clock=0,biteT=0,bite=1,stretch=0,lastState='idle',go=true,goT=0,aftershock=0;
 const jerk={t:0,want:{yaw:0,pitch:0,roll:0,y:0,open:0},now:{yaw:0,pitch:0,roll:0,y:0,open:0}};
 const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),tmp=new THREE.Vector3(),tmp2=new THREE.Vector3(),dummy=new THREE.Object3D();
 const toParent=(local,out)=>out.copy(local).applyMatrix4(body.matrix);
 function home(leg,out){
  out.copy(leg.rest).applyAxisAngle(up,pose.yaw);out.x+=pos.x+vel.x*.22;out.z+=pos.z+vel.z*.22;out.y=0;return out;
 }
 function place(mesh,from,to){const d=tmp2.subVectors(to,from),l=d.length();mesh.position.copy(from);mesh.quaternion.setFromUnitVectors(up,d.divideScalar(l||1));mesh.scale.set(1,l,1);}
 function solve(leg,hip){
  // Planted feet stand on a near-vertical needle; lifted legs carry it on in line with the shin.
  const out=tmp.set(leg.foot.x-hip.x,0,leg.foot.z-hip.z).normalize();
  const wrapped=!!leg.wrapAnkle;
  if(wrapped)leg.ankle.copy(leg.wrapAnkle);
  else if(leg.free){leg.ankle.copy(leg.foot);}else leg.ankle.copy(leg.foot).addScaledVector(out,-.1).setY(leg.foot.y+META*.92);
  const F=FEMUR*leg.shrink,T=TIBIA*leg.shrink;
  const d=tmp2.subVectors(leg.ankle,hip),dist=Math.min(F+T-.01,Math.max(.1,d.length()));const u=d.normalize();
  const a=(F*F+dist*dist-T*T)/(2*dist),h=Math.sqrt(Math.max(0,F*F-a*a));
  const pole=wrapped?leg.wrapPole.clone():new THREE.Vector3(out.x*.35,1,out.z*.35);pole.addScaledVector(u,-pole.dot(u)).normalize();
  leg.knee.copy(hip).addScaledVector(u,a).addScaledVector(pole,h);
  const ankle=new THREE.Vector3().copy(hip).addScaledVector(u,dist);
  const tip=leg.free&&!wrapped?new THREE.Vector3().subVectors(ankle,leg.knee).normalize().multiplyScalar(META).add(ankle):leg.foot.clone();
  place(leg.parts.femur,hip,leg.knee);place(leg.parts.tibia,leg.knee,ankle);
  const needleStart=new THREE.Vector3().lerpVectors(ankle,tip,.72);place(leg.parts.meta,ankle,needleStart);place(leg.parts.needle,needleStart,tip);
  leg.parts.needle.scale.set(1,tip.distanceTo(needleStart)/.2,1);
  // The knee strand stretches under its drop, which falls when it is heavy enough; a quick step shakes it loose.
  const s=leg.parts.strand;s.position.copy(leg.knee);s.position.y-=.015;s.quaternion.identity();
  const length=leg.strandLength*(.25+.75*leg.strand);s.scale.set(.7+.5*leg.strand,length,.7+.5*leg.strand);
  return length;
 }

 /**
  * `c`: the simulated crawler {x,z,facing,state,t,speed}. `ctx.player`: {x,z} for poses that reach for the player.
  * Returns the step events this frame ({type:'plant',x,z}) so callers can add sound.
  */
 function update(c,dt,ctx={}){
  const events=[];time.value+=dt;clock+=dt;pulse.value*=Math.exp(-dt*5);
  // Torn off the helmet it clings on through the wrench, then flies, spinning, before it lands and recoils.
  const flung=c.state==='recoil'&&c.thrown?(c.t-CRAWLER.throwDelay)/(CRAWLER.throwTime+.15):-1;
  const state=flung>=0&&flung<1?'thrown':c.state==='recoil'&&c.thrown&&flung<0?'grab':c.state==='lurk'&&c.speed<.2?'idle':c.state==='march'?'stalk':c.state;
  const player=ctx.player??{x:c.x,z:c.z+2};
  const dead=state==='dead';
  // Death is a seizure: violent for a moment, fading, then a few late aftershocks before it curls and melts.
  if(dead){if(c.t>3&&c.t<4.6&&aftershock<=0&&Math.random()<dt*1.6)aftershock=.2+Math.random()*.2;aftershock-=dt;}else aftershock=0;
  const seize=dead?Math.max(c.t<1.9?1:Math.max(0,1-(c.t-1.9)/1.1),aftershock>0?.55:0):0;
  // While grabbing it climbs the player and clamps its open mouth over the helmet, its body hunched on top.
  const toCrawler=new THREE.Vector2(c.x-player.x,c.z-player.z);if(toCrawler.lengthSq()<1e-4)toCrawler.set(-Math.sin(c.facing),-Math.cos(c.facing));toCrawler.normalize();
  let tx=c.x,tz=c.z;
  if(state==='grab'){const gnaw=.05*(Math.random()*2-1)*Math.random();tx=player.x+toCrawler.x*(.3+gnaw);tz=player.z+toCrawler.y*(.3+gnaw);}
  if(!started){started=true;pos.set(tx,0,tz);last.copy(pos);pose.yaw=c.facing;body.position.set(tx,REST_HEIGHT.idle,tz);body.updateMatrix();legs.forEach(l=>{home(l,l.foot);});}
  // A shot knocks it back hard: the body is thrown away from the player and wrenched off balance.
  if(state==='hit'&&lastState!=='hit'){pos.x+=toCrawler.x*.45;pos.z+=toCrawler.y*.45;jerk.t=.12;Object.assign(jerk.want,{yaw:(Math.random()-.5)*.9,pitch:-.6,roll:(Math.random()-.5)*1.1,y:.18,open:.8});jerk.now.y=.12;
   for(let i=0;i<6;i++)drip(body.position.clone().add(new THREE.Vector3((Math.random()-.5)*.3,0,(Math.random()-.5)*.3)),.015+Math.random()*.02);}
  lastState=state;
  // Stop-start: it freezes, then darts to catch up, like a spider crossing a floor.
  const fast=state==='skitter'||state==='flee'||state==='evade'||state==='emerge';
  goT-=dt;if(goT<=0){go=!go;goT=go?(fast?.05+Math.random()*.09:.07+Math.random()*.14):(fast?.03+Math.random()*.07:.08+Math.random()*.32);}
  const glide=state==='lunge'||state==='thrown'?30:state==='grab'?14:dead?6:go?24:.6;
  const k=1-Math.exp(-dt*glide);pos.x+=(tx-pos.x)*k;pos.z+=(tz-pos.z)*k;
  vel.set((pos.x-last.x)/Math.max(dt,1e-4),0,(pos.z-last.z)/Math.max(dt,1e-4));last.copy(pos);
  let yawDiff=c.facing-pose.yaw;yawDiff=Math.atan2(Math.sin(yawDiff),Math.cos(yawDiff));pose.yaw+=yawDiff*(1-Math.exp(-dt*(go?14:3)));
  // Twitches: the body snaps between small held offsets all the time; in the seizure they are huge and constant.
  jerk.t-=dt;
  if(jerk.t<=0){
   const r=()=>Math.random()*2-1,big=seize>.05,amount=big?seize:state==='grab'?1.6:state==='shriek'?.6:1;
   jerk.t=big?.035+Math.random()*.09:state==='grab'?.03+Math.random()*.07:(state==='stalk'||state==='close'?.08+Math.random()*.4:.12+Math.random()*.6);
   Object.assign(jerk.want,big?{yaw:r()*.5*amount,pitch:r()*.55*amount,roll:r()*.8*amount,y:Math.random()*.22*amount,open:Math.random()*amount}:
    {yaw:r()*.16*amount,pitch:r()*.1*amount,roll:r()*.08*amount,y:r()*.035*amount,open:Math.random()<.12?.15+Math.random()*.2:0});
  }
  const snap=1-Math.exp(-dt*(seize>.05?60:45));for(const key in jerk.want)jerk.now[key]+=(jerk.want[key]-jerk.now[key])*snap;
  const breathe=Math.sin(clock*1.6)*.03,tremble=(state==='shriek'||state==='recoil')?Math.sin(clock*55)*.015:0;
  const wantHeight=state==='thrown'?1.84*(1-flung)+.85*flung+1.1*Math.sin(Math.PI*flung):dead?.3+.2*seize:(REST_HEIGHT[state]??1)+(state==='idle'?breathe:0)+Math.min(.08,vel.length()*.01);
  const pitchFor={shriek:-.75,recoil:-.45,lunge:.25,grab:.32,slash:-.2};
  pose.height+=(wantHeight-pose.height)*(1-Math.exp(-dt*(state==='thrown'?30:state==='shriek'||state==='lunge'||state==='recoil'||dead?10:5)));
  pose.pitch+=((pitchFor[state]??0)+tremble*4-pose.pitch)*(1-Math.exp(-dt*8));
  const speedLean=new THREE.Vector3(vel.x,0,vel.z).applyAxisAngle(up,-pose.yaw);
  // Dead, it flips onto its back; flung, it tumbles.
  if(state==='thrown')pose.roll+=dt*16;else{pose.roll=Math.atan2(Math.sin(pose.roll),Math.cos(pose.roll));pose.roll+=((state==='hit'?.35*Math.sin(c.t*20):0)+(dead?Math.PI*.92:0)+THREE.MathUtils.clamp(-speedLean.x*.03,-.2,.2)-pose.roll)*(1-Math.exp(-dt*(dead?7:8)));}
  // Clamped on, the jaws chomp at random: snapping half shut, then gaping wider than they ever open on the floor.
  biteT-=dt;if(biteT<=0){biteT=.03+Math.random()*.08;bite=Math.random()<.35?.45+Math.random()*.2:.95+Math.random()*.35;}
  const wantOpen=Math.max((OPEN[state]??0)*(state==='shriek'?.85+.15*Math.sin(clock*30):state==='grab'?bite:1),jerk.now.open);
  pose.open+=(wantOpen-pose.open)*(1-Math.exp(-dt*(state==='grab'?45:wantOpen>pose.open?20:8)));
  body.position.set(pos.x,pose.height+tremble+jerk.now.y,pos.z);
  body.rotation.set(0,0,0);body.rotateY(pose.yaw+jerk.now.yaw);body.rotateX(THREE.MathUtils.clamp(pose.pitch+jerk.now.pitch-speedLean.z*.02,-1.2,1.2));body.rotateZ(pose.roll+jerk.now.roll);body.updateMatrix();
  if(shells.ShellL)shells.ShellL.rotation.y=-pose.open*.55;if(shells.ShellR)shells.ShellR.rotation.y=pose.open*.55;
  const melt=dead?Math.max(0,Math.min(1,(c.t-3.8)/1.8)):0;
  // Grabbing, the goo stretches wide enough for its jaws to close round a helmet.
  stretch+=((state==='grab'?1:0)-stretch)*(1-Math.exp(-dt*(state==='grab'?8:5)));
  model.scale.set((1+melt*.5)*(1+.75*stretch),(1-melt*.75)*(1+.5*stretch),(1+melt*.3)*(1+.3*stretch));
  // The goo lags behind the body's motion and sags under its weight; it heaves while seizing.
  const wantSag=new THREE.Vector3(THREE.MathUtils.clamp(-speedLean.x*.012,-.07,.07),.035+.02*Math.sin(clock*1.3)+.05*seize*Math.random(),THREE.MathUtils.clamp(-speedLean.z*.012,-.07,.07));
  sag.value.lerp(wantSag,1-Math.exp(-dt*6));

  // Which legs are lifted for this state, and where they reach.
  const reach=(i,leg)=>{
   const s=leg.side,j=leg.j,front=j<2;
   const local=v=>toParent(v,new THREE.Vector3());
   if(state==='shriek'&&front)return local(new THREE.Vector3(s*(j?1.25:.8),j?.9:1.35,j?.5:.9).add(new THREE.Vector3(0,Math.sin(clock*40+i)*.03,0)));
   if(state==='recoil'&&j===0)return local(new THREE.Vector3(s*.35,.7,.9));
   if(state==='lunge'&&front&&c.t<.4)return local(new THREE.Vector3(s*(j?.9:.45),-.2,1.5));
   if(state==='grab'&&c.t>.04*(j*2+(s>0?1:0))){
    // Wrapped round the torso: front legs reach round to the chest, rear legs clamp the thighs; needles curl along the body and squeeze.
    // Front legs lock round the back of the helmet until their tips nearly meet; the rest clamp the neck and chest.
    // They never settle: each leg jabs to a new grip every few frames, and now and then one tears loose and stabs back in.
    leg.spasmT-=dt;if(leg.spasmT<=0){const tear=Math.random()<.08;leg.spasmT=tear?.07+Math.random()*.06:.025+Math.random()*.045;
     leg.spasm.set((Math.random()*2-1)*.4,(Math.random()*2-1)*.1+(tear?.28:0),(Math.random()*2-1)*.05+(tear?.4:0));}
    const back=Math.atan2(toCrawler.x,toCrawler.y),around=back-s*[2.95,2.45,2.55,1.9][j]+leg.spasm.x,h=[1.92,1.68,1.42,1.12][j]+leg.spasm.y+Math.sin(clock*47+i*2.3)*.025;
    const squeeze=[.31,.33,.37,.39][j]+leg.spasm.z+Math.sin(clock*61+i*1.7)*.02;
    const foot=new THREE.Vector3(player.x+Math.sin(around)*squeeze,h,player.z+Math.cos(around)*squeeze);
    const behind=around+s*.95;leg.wrapAnkle=new THREE.Vector3(player.x+Math.sin(behind)*(squeeze+.12),h+.1,player.z+Math.cos(behind)*(squeeze+.12));
    leg.wrapPole=new THREE.Vector3(Math.sin(behind),.5,Math.cos(behind));
    return foot;
   }
   if(state==='slash'&&i===4)return new THREE.Vector3(player.x,c.t<.18?1.9:1.35,player.z);
   if(state==='thrown'){
    leg.spasmT-=dt;if(leg.spasmT<=0){leg.spasmT=.03+Math.random()*.07;leg.spasm.set(s*(.4+Math.random()*1.1),-.6+Math.random()*1.1,leg.rest.z*.6+(Math.random()-.5)*.9);}
    return local(leg.spasm.clone());
   }
   if(dead){
    // Belly-up: legs thrash at random, then fold over the belly.
    leg.spasmT-=dt;
    if(leg.spasmT<=0){leg.spasmT=.025+Math.random()*.1;leg.spasm.set(s*(.25+Math.random()*1.2),-(.05+Math.random()*1.1),leg.rest.z*.5+(Math.random()-.5)*1.1);}
    const curl=new THREE.Vector3(s*.22,-.42-.06*j,leg.rest.z*.25);
    return local(curl.lerp(leg.spasm,seize));
   }
   return null;
  };
  const airborne=legs.filter(l=>l.step>0).length;
  legs.forEach((leg,i)=>{
   const wasWrapped=!!leg.wrapAnkle;leg.wrapAnkle=null;
   // Goo legs draw in to hug what they hold.
   leg.shrink+=((state==='grab'?.68:1)-leg.shrink)*(1-Math.exp(-dt*(state==='grab'?10:4)));
   const target=reach(i,leg);
   if(wasWrapped&&!leg.wrapAnkle)leg.ankle.copy(leg.foot);
   if(target){
    // A lifted leg snaps toward its hold.
    if(leg.step<=0)leg.free=true;
    if(leg.free){
     const rate=state==='slash'||state==='lunge'||state==='thrown'||dead?35:state==='grab'?48:16;
     leg.foot.lerp(target,1-Math.exp(-dt*rate));leg.foot.y=Math.max(.02,leg.foot.y);
     if(leg.wrapAnkle){if(!wasWrapped)leg.wrapFrom.copy(leg.ankle);leg.wrapAnkle=leg.wrapFrom.lerp(leg.wrapAnkle,1-Math.exp(-dt*rate));}
    }else leg.wrapAnkle=null;
   }else if(leg.free){leg.free=false;leg.from.copy(leg.foot);home(leg,leg.to);leg.step=.001;leg.duration=.1;leg.lift=.15;}
   if(leg.step>0){
    leg.step+=dt/leg.duration;const s=Math.min(1,leg.step),e=1-Math.pow(1-s,3);
    leg.foot.lerpVectors(leg.from,leg.to,e);leg.foot.y=Math.max(leg.to.y,Math.sin(s*Math.PI)*leg.lift+leg.from.y*(1-e));
    if(s>=1){leg.step=0;leg.foot.copy(leg.to);if(leg.to.y<=.001){events.push({type:'plant',x:leg.foot.x,z:leg.foot.z});if(Math.random()<.15)splat(leg.foot.x,leg.foot.z,.035+Math.random()*.035,4);}}
   }else if(!leg.free&&!dead){
    // Plant and snap: lift only when left behind, and never alongside a neighbour. Idle legs fidget: a quick tap, a shuffle.
    const want=home(leg,tmp.clone()),gap=Math.hypot(want.x-leg.foot.x,want.z-leg.foot.z);
    const moving=vel.length()>.3,limit=moving?.38:.8;
    const busy=neighbours(i).some(n=>legs[n].step>0)||airborne>=(fast?4:3);
    const twitch=Math.random()<dt*(moving?.7:2.2);
    if((gap>limit||twitch)&&!busy){
     const tap=twitch&&gap<limit&&Math.random()<.45;
     leg.from.copy(leg.foot);leg.to.copy(tap?leg.foot:want);if(twitch&&gap<limit&&!tap)leg.to.add(new THREE.Vector3((Math.random()-.5)*.35,0,(Math.random()-.5)*.35));
     if(!tap)leg.to.addScaledVector(vel,.1);leg.step=.001;
     const quick=fast||state==='lunge';leg.duration=tap?.05+Math.random()*.03:quick?.05+Math.random()*.03:.06+Math.random()*.05;leg.lift=tap?.08+Math.random()*.12:quick?.3:.2+Math.random()*.15;
    }
   }
   const length=solve(leg,toParent(leg.hip,new THREE.Vector3()));
   leg.strand+=dt*(.25+(state==='shriek'||state==='grab'?.8:0));
   if(leg.strand>=1||(leg.step>0&&leg.strand>.6&&Math.random()<dt*8)){drip(new THREE.Vector3(leg.knee.x,leg.knee.y-length,leg.knee.z),.016);leg.strand=0;}
  });

  // Goo.
  // Belly strands hang straight down whatever the body does, swing back against its motion, and snap up when they drop.
  const hurry=state==='shriek'||state==='grab'?2.5:seize>.05?4:1;
  bellyStrands.forEach(s=>{
   const at=toParent(s.at,new THREE.Vector3());
   if(s.retract>0){s.retract-=dt;s.mesh.visible=false;if(s.retract<=0)reseed(s);return;}
   s.mesh.visible=!dead||c.t<3.8;
   s.grow+=dt*s.rate*hurry;
   const length=s.length*Math.min(1,s.grow)*(1+.08*Math.sin(clock*3+s.length*40));
   s.mesh.position.copy(at);s.mesh.quaternion.setFromEuler(new THREE.Euler(THREE.MathUtils.clamp(vel.z*.05,-.5,.5),0,THREE.MathUtils.clamp(-vel.x*.05,-.5,.5)));
   const fat=.6+.6*Math.min(1,s.grow);s.mesh.scale.set(fat,Math.max(.01,length),fat);
   if(s.grow>=1.15||(seize>.05&&s.grow>.5&&Math.random()<dt*6)){drip(at.clone().setY(at.y-length*.95),.012+.01*fat);s.retract=.2+Math.random()*.8;}
  });
  if(state==='shriek'||state==='grab')for(dropClock+=dt*3;dropClock>1;dropClock--)drip(toParent(new THREE.Vector3((Math.random()-.5)*.12,0,.1+Math.random()*.15),new THREE.Vector3()),.01+Math.random()*.01);
  dropState.forEach((d,i)=>{
   if(d.alive){d.v.y-=9*dt;d.p.addScaledVector(d.v,dt);if(d.p.y<=0){d.alive=false;splat(d.p.x,d.p.z,d.size*2.2+Math.random()*.02,5);}}
   if(d.alive){dummy.position.copy(d.p);const stretch=1+Math.min(2.5,-d.v.y*.35);dummy.scale.set(d.size,d.size*stretch,d.size);}else dummy.scale.setScalar(0);
   dummy.rotation.set(0,0,0);dummy.updateMatrix();drops.setMatrixAt(i,dummy.matrix);
  });
  if(dead&&c.t>3.8&&c.t<5.6&&Math.random()<dt*10)splat(pos.x+(Math.random()-.5)*.6,pos.z+(Math.random()-.5)*.8,.25+Math.random()*.3,14);
  splatState.forEach((s,i)=>{
   s.age+=dt;const k=s.age/s.life,grow=Math.min(1,s.age*6)*(k>.7?Math.max(0,(1-k)/.3):1);
   dummy.position.set(s.x,.012+i*.00005,s.z);dummy.rotation.set(0,i*1.7,0);dummy.scale.set(s.r*grow*(1+.15*Math.sin(i)),1,s.r*grow);
   if(k>=1)dummy.scale.setScalar(0);dummy.updateMatrix();splats.setMatrixAt(i,dummy.matrix);
  });
  tail?.update(dt,clock,{yaw:pose.yaw,dead,t:c.t,drip,splatAt:(p,r)=>splat(p.x,p.z,r,14),toRoot:v=>toParent(v,v)});
  drops.instanceMatrix.needsUpdate=splats.instanceMatrix.needsUpdate=true;
  return events;
 }
 /** A bullet strike at `point` travelling along `dir` (both in the parent's space): goo sprays out behind and the skin shudders. */
 function hit(point,dir){
  pulse.value=1;
  for(let i=0;i<14;i++){
   const v=new THREE.Vector3(dir.x,0,dir.z).normalize().multiplyScalar(2+Math.random()*3).add(new THREE.Vector3((Math.random()-.5)*2.5,1+Math.random()*2.2,(Math.random()-.5)*2.5));
   drip(new THREE.Vector3(point.x+(Math.random()-.5)*.1,point.y+(Math.random()-.5)*.1,point.z+(Math.random()-.5)*.1),.012+Math.random()*.02,v);
  }
 }
 /** Snap to the next update's position instead of gliding there, for spawns and respawns. */
 function reset(){started=false;legs.forEach(l=>{l.step=0;l.free=false;});tail?.reset();}
 /** How hot it is burning (0–1) and how charred it is (0–1). */
 function burn(h,c){heat.value=h;char.value=c;}
 /** Where flames take hold, in the root's space: the body and every knee and ankle. */
 const burnPoints=Array.from({length:21},()=>new THREE.Vector3()),shellAt=[[0,.05,0],[.1,.12,.12],[-.1,.12,.12],[.08,.1,-.14],[-.08,.1,-.14]];
 function burning(){
  // The body burns hardest: five points over the shells, then every knee and ankle.
  shellAt.forEach((o,i)=>burnPoints[i].set(o[0],o[1],o[2]).applyQuaternion(body.quaternion).add(body.position));
  legs.forEach((l,i)=>{burnPoints[5+i*2].copy(l.knee);burnPoints[6+i*2].copy(l.ankle);});return burnPoints;
 }
 return {root,body,legs,update,reset,hit,burn,burning,get position(){return body.position;},dispose(){parent.remove(root);owned.forEach(o=>o.dispose());drops.dispose();splats.dispose();}};
}
