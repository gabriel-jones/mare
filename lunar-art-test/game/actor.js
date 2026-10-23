import * as THREE from 'three';

// Played once and held on their last frame until the caller asks for something else.
const ONCE=new Set(['hurt','roll','land','throwoff','collapse']);
const FADE={roll:.06,hurt:.05,land:.06,throwoff:.08,jump:.08};

/**
 * Blender-authored in-place animation; controller owns world motion and gravity.
 * `pose`: {animation, speed, gun, backward, rate, twist}. `gun` shows the pistol (astronaut-v3); `backward` plays a walk or run
 * in reverse for backpedalling; `rate` scales one-shots and loops such as the struggle; `twist` turns the torso about
 * the vertical (radians, positive to the left) so the upper body can aim ahead of the feet. `fire()` layers the recoil
 * additively over whatever is playing; `restart()` replays the current one-shot; `marker(name)` finds the pistol's
 * muzzle and ejection-port bones.
 */
export function createAstronaut(gltf) {
 const root=gltf.scene;
 const mixer=new THREE.AnimationMixer(root),actions=new Map(),durations=new Map();
 root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
 let recoil=null;
 for(const clip of gltf.animations){
  const key=clip.name.toLowerCase().split('.')[0];
  if(actions.has(key)||(key==='fire'&&recoil))continue;
  durations.set(key,clip.duration);
  if(key==='fire'){
   const additive=THREE.AnimationUtils.makeClipAdditive(clip.clone());
   recoil=mixer.clipAction(additive);recoil.setLoop(THREE.LoopOnce,1);recoil.clampWhenFinished=false;continue;
  }
  const action=mixer.clipAction(clip);
  if(ONCE.has(key)){action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;}
  actions.set(key,action);
 }
 let current='',active=null;
 const spine=root.getObjectByName('Spine'),parentQ=new THREE.Quaternion(),twistQ=new THREE.Quaternion(),UP=new THREE.Vector3(0,1,0),untwisted=new THREE.Quaternion();let twisted=false;
 const tools=[],guns=[];root.traverse(o=>{if(o.name.startsWith('ConstructionTool'))tools.push(o);if(o.name==='Pistol')guns.push(o);});
 function update(pose,dt){
  const wanted=actions.has(pose.animation)?pose.animation:pose.animation?.startsWith('aim')&&actions.has(pose.animation.slice(3))?pose.animation.slice(3):'idle';
  if(wanted!==current){
   const next=actions.get(wanted),fade=FADE[wanted]??.14;
   if(next){next.reset().setEffectiveWeight(1).fadeIn(fade).play();if(active)active.fadeOut(fade);active=next;}
   current=wanted;
  }
  if(active){
   const speed=Math.max(0,pose.speed||0),rate=pose.rate??1,walking=current==='walk'||current==='aimwalk',running=current==='run'||current==='aimrun';
   active.timeScale=(walking?Math.max(.25,speed/2.7):running?Math.max(.4,speed/4.8):1)*rate*(pose.backward&&(walking||running)?-1:1);
  }
  tools.forEach(o=>o.visible=current==='build');
  guns.forEach(o=>o.visible=!!pose.gun&&current!=='build');
  // The mixer skips bones whose animated value has not changed, so last frame's twist must be undone first.
  if(twisted){spine.quaternion.copy(untwisted);twisted=false;}
  mixer.update(Math.min(dt,.1));
  if(spine&&pose.twist){
   untwisted.copy(spine.quaternion);twisted=true;
   spine.parent.getWorldQuaternion(parentQ);twistQ.setFromAxisAngle(UP,pose.twist);
   spine.quaternion.premultiply(parentQ).premultiply(twistQ).premultiply(parentQ.invert());
  }
 }
 function fire(){if(recoil)recoil.reset().setEffectiveWeight(1).play();}
 function restart(){if(active)active.reset().play();}
 const markers=new Map();root.traverse(o=>{if(['Muzzle','MuzzleAhead','Port','PortOut'].includes(o.name))markers.set(o.name,o);});
 update({animation:'idle'},0);
 return {root,update,fire,restart,marker:name=>markers.get(name),duration:name=>durations.get(name)??0,clips:[...actions.keys()],
  dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);}};
}
