import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const status = document.querySelector('#status');
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.AgXToneMapping;
renderer.toneMappingExposure=1.1;
document.body.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#10171e');
const camera=new THREE.PerspectiveCamera(37,innerWidth/innerHeight,.05,150);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.minDistance=2;controls.maxDistance=32;
controls.maxPolarAngle=Math.PI*.49;
const pmrem=new THREE.PMREMGenerator(renderer);
const room=new RoomEnvironment();
const env=pmrem.fromScene(room,.04);scene.environment=env.texture;scene.environmentIntensity=.32;
room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xa5c3e0,0x202834,.85));
const sun=new THREE.DirectionalLight(0xffedd5,3.8);sun.position.set(-7,10,8);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:.1,far:35});
sun.shadow.normalBias=.025;sun.shadow.bias=-.00015;scene.add(sun);
const bandTexture=new THREE.DataTexture(new Uint8Array([56,105,162,216,255]),5,1,THREE.RedFormat);
bandTexture.minFilter=bandTexture.magFilter=THREE.NearestFilter;bandTexture.needsUpdate=true;
const pairs=[];const toonCache=new Map();let mixer,paused=false,last=performance.now(),loaded=false;
function pose(close=false){
 controls.target.set(0,close?1:.5,close?.25:-.4);
 const fit=close?Math.max(1,1.2/camera.aspect):Math.max(1,.7/camera.aspect);
 camera.position.set(close?4.8:9,close?3.5:10,close?7:15).sub(controls.target).multiplyScalar(fit).add(controls.target);
 controls.update();
}
pose();
function setMode(graphic){
 for(const {mesh,pbr,toon} of pairs)mesh.material=graphic?toon:pbr;
 document.querySelector('#pbr').setAttribute('aria-pressed',!graphic);
 document.querySelector('#graphic').setAttribute('aria-pressed',graphic);
}
function toonMaterial(m){
 // Keep the visor and metallic mechanisms specular as a deliberate contrast.
 if(m.metalness>.6)return m;
 if(!toonCache.has(m.uuid))toonCache.set(m.uuid,new THREE.MeshToonMaterial({color:m.color,emissive:m.emissive,emissiveIntensity:m.emissiveIntensity,gradientMap:bandTexture,side:m.side}));
 return toonCache.get(m.uuid);
}
new GLTFLoader().load('./lunar-art-test.glb',gltf=>{
 scene.add(gltf.scene);let triangles=0;
 gltf.scene.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
  const pbr=o.material;const toon=Array.isArray(pbr)?pbr.map(toonMaterial):toonMaterial(pbr);
  pairs.push({mesh:o,pbr,toon});triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
 });
 mixer=new THREE.AnimationMixer(gltf.scene);for(const clip of gltf.animations)mixer.clipAction(clip).play();
 loaded=true;status.textContent=`${Math.round(triangles).toLocaleString()} triangles · ${gltf.animations.length} drill animation · ready`;
 document.body.dataset.loaded='true';
},undefined,e=>{status.id='error';status.textContent='Could not load the art study. Serve this folder over HTTP and check the console.';console.error(e);});
document.querySelector('#pbr').onclick=()=>setMode(false);
document.querySelector('#graphic').onclick=()=>setMode(true);
document.querySelector('#wide').onclick=()=>pose(false);
document.querySelector('#close').onclick=()=>pose(true);
document.querySelector('#motion').onclick=e=>{paused=!paused;e.target.textContent=paused?'Run drill':'Pause drill';e.target.setAttribute('aria-pressed',!paused);};
document.querySelector('#sun').oninput=e=>{const a=THREE.MathUtils.degToRad(+e.target.value);sun.position.set(-10*Math.cos(a),10*Math.sin(a),8*Math.cos(a));};
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
renderer.setAnimationLoop(()=>{const now=performance.now(),dt=Math.min((now-last)/1000,.05);last=now;if(mixer&&!paused)mixer.update(dt);controls.update();renderer.render(scene,camera);});
