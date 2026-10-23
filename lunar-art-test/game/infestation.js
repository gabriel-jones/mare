import * as THREE from 'three';

/**
 * The infestation kit (assets/infestation.glb): nests, silk, goo, coral, shards and the swallowed relics. The kit's
 * materials are named for their role and swapped here for the game's: black glossy goo, red veins that pulse, a
 * throat that glows deeper the further in it goes, pale silk and ivory coral. `patch(material, role)` lets the caller
 * add its own lighting (the caves' sight) to each one.
 */
export const KIT=Object.freeze(['Nest','Silk_Wall','Web_Drape','Goo_Pool','Goo_Wall','Coral_Bloom','Shard_Cluster','Relic_Artifact','Relic_Schematic','Relic_Heart']);

const PULSE_PARS='uniform float uTime;varying vec3 vKitWorld;';
/** Light that throbs along the veins: a slow wave rolls through world space. */
function pulsing(material,time,strength=.45){
 material.onBeforeCompile=(shader,renderer)=>{
  shader.uniforms.uTime=time;
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\n${PULSE_PARS}`).replace('#include <project_vertex>',`#include <project_vertex>\nvKitWorld=(modelMatrix*vec4(transformed,1.0)).xyz;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${PULSE_PARS}`)
   .replace('#include <dithering_fragment>',`#include <dithering_fragment>\nfloat kitPulse=${(1-strength).toFixed(2)}+${strength.toFixed(2)}*(.5+.5*sin(uTime*1.7-dot(vKitWorld,vec3(1.3,.9,1.1))*1.6));gl_FragColor.rgb*=kitPulse;`);
  material.userData.patch?.(shader,renderer);
 };
 return material;
}

const NOISE=`float kitHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float kitNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(kitHash(i),kitHash(i+vec3(1,0,0)),f.x),mix(kitHash(i+vec3(0,1,0)),kitHash(i+vec3(1,1,0)),f.x),f.y),
  mix(mix(kitHash(i+vec3(0,0,1)),kitHash(i+vec3(1,0,1)),f.x),mix(kitHash(i+vec3(0,1,1)),kitHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float kitFbm(vec3 p){return .55*kitNoise(p)+.3*kitNoise(p*2.1)+.15*kitNoise(p*4.3);}`;
/** Gauze torn full of holes, fraying at their edges and thin in streaks. */
function torn(material){
 material.onBeforeCompile=(shader,renderer)=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSilk;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSilk=position;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vSilk;\n${NOISE}`)
   .replace('#include <alphatest_fragment>',`float silkHole=kitFbm(vSilk*3.2+3.1);if(silkHole>.54)discard;
diffuseColor.a*=smoothstep(.54,.4,silkHole)*(.35+.65*kitFbm(vSilk*vec3(14.,3.,14.)));
#include <alphatest_fragment>`);
  material.userData.patch?.(shader,renderer);
 };
 return material;
}

export function createInfestationMaterials(){
 const time={value:0};
 const goo=new THREE.MeshPhysicalMaterial({color:'#050305',roughness:.16,metalness:0,clearcoat:1,clearcoatRoughness:.08,envMapIntensity:.6});
 const glow=pulsing(new THREE.MeshBasicMaterial({color:'#ff2a12',fog:false}),time);
 const maw=pulsing(new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,fog:false}),time,.55);
 const silk=new THREE.MeshStandardMaterial({color:'#bdb7ae',roughness:.9,transparent:true,opacity:.78,depthWrite:false});
 const gauze=torn(new THREE.MeshStandardMaterial({color:'#cfc8bd',roughness:.95,transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false}));
 const coral=new THREE.MeshStandardMaterial({color:'#dcc6b4',roughness:.68,side:THREE.DoubleSide,emissive:'#2a0806',emissiveIntensity:.6});
 const crystal=pulsing(new THREE.MeshPhysicalMaterial({color:'#6a0605',roughness:.04,metalness:0,clearcoat:1,emissive:'#7a0703',emissiveIntensity:.9,transparent:true,opacity:.9}),time,.3);
 const alloy=new THREE.MeshStandardMaterial({color:'#7a6650',metalness:.55,roughness:.38});
 const chitin=new THREE.MeshStandardMaterial({color:'#050507',roughness:.3,metalness:.1});
 const byRole={Goo:goo,Glow:glow,Maw:maw,Silk:silk,Gauze:gauze,Coral:coral,Crystal:crystal,Alloy:alloy,Chitin:chitin};
 return {byRole,time,list:Object.values(byRole),dispose(){Object.values(byRole).forEach(m=>m.dispose());}};
}

/** The throat is dark at the mouth (a metre out of the wall, z = 1) and burns red at the back (the wall, z = 0). */
function shadeThroat(geometry){
 const pos=geometry.attributes.position,colors=new Float32Array(pos.count*3),deep=new THREE.Color('#ff1a06');
 for(let i=0;i<pos.count;i++){const t=Math.min(1,Math.max(0,(1-pos.getZ(i))/.95)),k=Math.pow(t,1.8)*1.4;colors.set([deep.r*k,deep.g*k,deep.b*k],i*3);}
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
}

export async function loadInfestation(loader,url='./assets/infestation.glb'){
 const gltf=await loader.loadAsync(url),materials=createInfestationMaterials(),templates=new Map();
 const role=m=>m?.name?.split('.')[0];
 gltf.scene.traverse(o=>{
  if(!o.isMesh)return;
  if(o.name.startsWith('Nest_Maw'))shadeThroat(o.geometry);
  o.material=materials.byRole[role(o.material)]??materials.byRole.Goo;
  if(o.material===materials.byRole.Silk||o.material===materials.byRole.Gauze)o.renderOrder=2;
  o.castShadow=o.material===materials.byRole.Goo||o.material===materials.byRole.Alloy;
 });
 for(const name of KIT){const node=gltf.scene.getObjectByName(name);if(node){node.removeFromParent();node.position.set(0,0,0);templates.set(name,node);}}
 return {
  materials,templates,
  /** A fresh copy of a kit piece (shares geometry and materials). */
  create(name){const t=templates.get(name);return t?t.clone(true):new THREE.Group();},
  /** Every mesh of a piece, by material role, for instancing. */
  parts(name){const out=[];templates.get(name)?.traverse(o=>{if(o.isMesh){o.updateWorldMatrix(true,false);out.push({geometry:o.geometry,material:o.material,matrix:o.matrixWorld.clone(),name:o.name});}});return out;},
  update(t){materials.time.value=t;},
  dispose(){materials.dispose();templates.forEach(t=>t.traverse(o=>o.geometry?.dispose()));},
 };
}
