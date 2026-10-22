import * as THREE from 'three';

// Blender-authored in-place animation; controller owns world motion and gravity.
export function createAstronaut(gltf) {
 const root=gltf.scene;
 const mixer=new THREE.AnimationMixer(root),actions=new Map();
 root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
 for(const clip of gltf.animations){
  const key=clip.name.toLowerCase().split('.')[0];
  if(!actions.has(key))actions.set(key,mixer.clipAction(clip));
 }
 let current='',active=null;
 const tools=[];root.traverse(o=>{if(o.name.startsWith('ConstructionTool'))tools.push(o);});
 function update(pose,dt){
  const wanted=actions.has(pose.animation)?pose.animation:'idle';
  if(wanted!==current){
   const next=actions.get(wanted);
   if(next){next.reset().setEffectiveWeight(1).fadeIn(.14).play();if(active)active.fadeOut(.14);active=next;}
   current=wanted;
  }
  if(active){
   const speed=Math.max(0,pose.speed||0);
   active.timeScale=current==='walk'?Math.max(.25,speed/2.7):current==='run'?Math.max(.4,speed/4.8):1;
  }
  tools.forEach(o=>o.visible=current==='build');
  mixer.update(Math.min(dt,.1));
 }
 update({animation:'idle'},0);
 return {root,update,clips:[...actions.keys()],dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);}};
}
