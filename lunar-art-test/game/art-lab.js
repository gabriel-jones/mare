import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createAstronaut} from './actor.js';
const canvas=document.querySelector('#studio'),status=document.querySelector('#status');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;
const scene=new THREE.Scene();scene.background=new THREE.Color('#15202c');
const camera=new THREE.PerspectiveCamera(35,innerWidth/innerHeight,.03,300);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.49;
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.02).texture;scene.environmentIntensity=.45;room.dispose();pmrem.dispose();
const key=new THREE.DirectionalLight('#fff1dc',3.2);key.position.set(-5,8,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-20,right:20,top:20,bottom:-20,far:60});key.shadow.normalBias=.015;scene.add(key);
scene.add(new THREE.HemisphereLight('#c2ddff','#25303b',1.2));
const floor=new THREE.Mesh(new THREE.PlaneGeometry(250,250),new THREE.MeshStandardMaterial({color:'#2a3949',roughness:.94}));floor.rotation.x=-Math.PI/2;floor.position.y=-.015;floor.receiveShadow=true;scene.add(floor);
const loader=new GLTFLoader(),cache=new Map();let actor=null,model=null,clip='idle',last=performance.now(),request=0;
async function show(name){
 const id=++request;status.textContent='Loading model…';
 try{
  const gltf=cache.get(name)??await loader.loadAsync(`./assets/${name}.glb`);cache.set(name,gltf);if(id!==request)return;
  actor?.dispose();actor=null;if(model)scene.remove(model);
  model=gltf.scene;
  if(name==='astronaut-v2'){actor=createAstronaut(gltf);model=actor.root;}
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(model);
  const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  const distance=Math.max(size.x,size.y,size.z)*2.4*Math.max(1,.9/camera.aspect);
  controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(.7,.46,1.15).normalize().multiplyScalar(distance));controls.update();
  let triangles=0;model.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  status.textContent=`${Math.round(triangles).toLocaleString()} triangles${actor?' · 15 bones · five motion clips':' · Blender-authored game asset'}`;
  document.querySelector('#animations').hidden=!actor;document.body.dataset.model=name;
 }catch(error){status.textContent='Model could not load. Return to the colony and try again.';console.error(error);}
}
document.querySelector('#model').onchange=e=>show(e.target.value);
document.querySelectorAll('[data-clip]').forEach(button=>button.onclick=()=>{clip=button.dataset.clip;document.querySelectorAll('[data-clip]').forEach(b=>b.setAttribute('aria-pressed',b===button));});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
renderer.setAnimationLoop(()=>{const now=performance.now(),dt=Math.min((now-last)/1000,.1);last=now;actor?.update({animation:clip,speed:clip==='run'?4.8:2.7},dt);controls.update();renderer.render(scene,camera);document.body.dataset.animation=clip;});
show('astronaut-v2');
