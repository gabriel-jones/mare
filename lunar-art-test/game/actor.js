import * as THREE from 'three';

// Played once and held on their last frame until the caller asks for something else.
const ONCE=new Set(['hurt','roll','land','throwoff','collapse','katanaslash','katanaparry']);
const FADE={roll:.06,hurt:.05,land:.06,throwoff:.08,jump:.08,katanaslash:.04,katanaparry:.03};
/**
 * The flare throw, keyed to peril.js FLARE (struck at .42s, let go at .8s): raised to the chest, the cap raked across,
 * wound up behind the head and thrown overhand. Upper arm and forearm directions are [forward, up, out to the side].
 */
const THROW=[
 {t:0,w:0,twist:0},
 {t:.16,w:1,upper:[.5,-.8,.3],fore:[.75,.6,-.5],twist:-.1},
 {t:.34,w:1,upper:[.55,-.65,.4],fore:[.6,.75,-.2],twist:-.15},
 {t:.44,w:1,upper:[.6,-.75,.15],fore:[.8,.15,-.65],twist:-.05},
 {t:.58,w:1,upper:[-.3,.5,.85],fore:[-.15,.95,.25],twist:.35},
 {t:.7,w:1,upper:[-.55,.5,.65],fore:[-.75,.6,.1],twist:.55},
 {t:.8,w:1,upper:[.7,.65,.25],fore:[.95,.3,0],twist:-.2},
 {t:.98,w:1,upper:[.65,-.6,.05],fore:[.7,-.6,-.3],twist:-.4},
 {t:1.35,w:0,twist:0},
];

/**
 * Blender-authored in-place animation; controller owns world motion and gravity.
 * `pose`: {animation, speed, weapon, backward, rate, twist}. `weapon` ('pistol', 'smg', 'rifle', 'flamethrower', 'arc', 'railgun' or 'katana'; `gun: true` means the
 * pistol) shows that weapon and swaps in its own aim, walk, run and turn clips where it has them; `backward` plays a walk or run
 * in reverse for backpedalling; `rate` scales one-shots and loops such as the struggle; `twist` turns the torso about
 * the vertical (radians, positive to the left) so the upper body can aim ahead of the feet. `fire()` layers the recoil
 * additively over whatever is playing (each gun has its own kick); `restart()` replays the current one-shot; `marker(name)`
 * finds the weapons' muzzle, ejection-port and nozzle bones (and the left hand, which holds a flare); `throwFlare()`
 * strikes and throws one.
 */
export function createAstronaut(gltf) {
 const root=gltf.scene;
 const mixer=new THREE.AnimationMixer(root),actions=new Map(),durations=new Map();
 root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;}});
 const recoils=new Map();
 for(const clip of gltf.animations){
  const key=clip.name.toLowerCase().split('.')[0];
  if(actions.has(key)||recoils.has(key))continue;
  durations.set(key,clip.duration);
  if(key==='fire'||key==='riflefire'||key==='smgfire'||key==='railfire'){
   const additive=THREE.AnimationUtils.makeClipAdditive(clip.clone()),recoil=mixer.clipAction(additive);
   recoil.setLoop(THREE.LoopOnce,1);recoil.clampWhenFinished=false;recoils.set(key,recoil);continue;
  }
  const action=mixer.clipAction(clip);
  if(ONCE.has(key)){action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;}
  actions.set(key,action);
 }
 let current='',active=null;
 const spine=root.getObjectByName('Spine'),parentQ=new THREE.Quaternion(),twistQ=new THREE.Quaternion(),pitchQ=new THREE.Quaternion(),lean=new THREE.Vector3(),UP=new THREE.Vector3(0,1,0),untwisted=new THREE.Quaternion();let twisted=false;
 const tools=[],weapons={pistol:[],smg:[],rifle:[],flamethrower:[],arc:[],railgun:[],katana:[]},MESH={Pistol:'pistol',Smg:'smg',Rifle:'rifle',Flamethrower:'flamethrower',ArcProjector:'arc',Railgun:'railgun',Katana:'katana'};
 root.traverse(o=>{if(o.name.startsWith('ConstructionTool'))tools.push(o);if(MESH[o.name])weapons[MESH[o.name]].push(o);});
 // Clip names carry the weapon: 'rifleaimidle', 'flameturnl'. The pistol uses the plain set.
 const PREFIX={smg:'smg',rifle:'rifle',flamethrower:'flame',arc:'arc',railgun:'rail',katana:'katana'};let held=null;
 // GLTFLoader drops the dots from node names: Blender's 'Hand.L' arrives as 'HandL'.
 const arm={upper:root.getObjectByName('UpperArmL'),fore:root.getObjectByName('ForearmL'),hand:root.getObjectByName('HandL')};
 let throwT=-1;const restore=[],_a=new THREE.Vector3(),_b=new THREE.Vector3(),_d=new THREE.Vector3(),_q=new THREE.Quaternion(),_pq=new THREE.Quaternion();
 const blend=(a,b,k,out)=>out.set(a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k);
 function throwPose(t){
  let i=0;while(i<THROW.length-2&&t>=THROW[i+1].t)i++;
  const a=THROW[i],b=THROW[i+1],x=Math.min(1,Math.max(0,(t-a.t)/(b.t-a.t))),k=x*x*(3-2*x);
  return {w:a.w+(b.w-a.w)*k,twist:a.twist+(b.twist-a.twist)*k,upper:blend(a.upper??b.upper,b.upper??a.upper,k,new THREE.Vector3()),fore:blend(a.fore??b.fore,b.fore??a.fore,k,new THREE.Vector3())};
 }
 /** Swings `bone` so its child lies along `body` (forward, up, side in the body's frame), by weight w. */
 function aimBone(bone,child,body,side,w){
  bone.getWorldPosition(_a);child.getWorldPosition(_b);_b.sub(_a).normalize();
  _d.set(body.z*side,body.y,body.x).normalize().transformDirection(root.matrixWorld);
  _q.setFromUnitVectors(_b,_d.lerp(_b,1-w).normalize());
  restore.push([bone,bone.quaternion.clone()]);
  bone.parent.getWorldQuaternion(_pq);bone.quaternion.premultiply(_pq).premultiply(_q).premultiply(_pq.invert());
  bone.updateMatrixWorld(true);
 }
 function update(pose,dt){
  for(const [bone,q] of restore.splice(0))bone.quaternion.copy(q);
  held=pose.weapon??(pose.gun?'pistol':null);
  const own=PREFIX[held]&&pose.animation?PREFIX[held]+pose.animation:null;
  const wanted=own&&actions.has(own)?own:actions.has(pose.animation)?pose.animation:pose.animation?.startsWith('aim')&&actions.has(pose.animation.slice(3))?pose.animation.slice(3):'idle';
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
  for(const [w,list] of Object.entries(weapons))list.forEach(o=>o.visible=w===held&&current!=='build');
  // The mixer skips bones whose animated value has not changed, so last frame's twist must be undone first.
  if(twisted){spine.quaternion.copy(untwisted);twisted=false;}
  mixer.update(Math.min(dt,.1));
  const throwing=throwT>=0&&arm.fore?throwPose(throwT):null;
  if(throwing){throwT+=dt;if(throwT>THROW.at(-1).t)throwT=-1;}
  const twist=(pose.twist??0)+(throwing?throwing.twist:0),pitch=throwing?0:pose.pitch??0;
  if(spine&&(twist||pitch)){
   untwisted.copy(spine.quaternion);twisted=true;
   spine.parent.getWorldQuaternion(parentQ);twistQ.setFromAxisAngle(UP,twist);
   // Aiming up or down a slope the chest leans back or over, about the axis across the way it now faces.
   if(pitch){root.getWorldDirection(lean);lean.y=0;lean.normalize().applyAxisAngle(UP,twist);lean.crossVectors(UP,lean).normalize();twistQ.premultiply(pitchQ.setFromAxisAngle(lean,-pitch));}
   spine.quaternion.premultiply(parentQ).premultiply(twistQ).premultiply(parentQ.invert());
  }
  if(throwing?.w>0){
   root.updateWorldMatrix(true,true);
   const side=Math.sign(root.worldToLocal(arm.upper.getWorldPosition(_a)).x)||1;
   aimBone(arm.upper,arm.fore,throwing.upper,side,throwing.w);
   aimBone(arm.fore,arm.hand,throwing.fore,side,throwing.w);
  }
 }
 function fire(){const recoil=recoils.get({rifle:'riflefire',smg:'smgfire',railgun:'railfire'}[held]??'fire');if(recoil)recoil.reset().setEffectiveWeight(1).play();}
 function restart(){if(active)active.reset().play();}
 const markers=new Map([['Hand.L',arm.hand],['Forearm.L',arm.fore]]);root.traverse(o=>{if(['Muzzle','MuzzleAhead','Port','PortOut','RifleMuzzle','RifleMuzzleAhead','RiflePort','RiflePortOut','SmgMuzzle','SmgMuzzleAhead','SmgPort','SmgPortOut','BladeBase','BladeTip','RailMuzzle','RailMuzzleAhead','ArcEmitter','ArcEmitterAhead','Nozzle','NozzleAhead','Pilot'].includes(o.name))markers.set(o.name,o);});
 update({animation:'idle'},0);
 return {root,update,fire,restart,marker:name=>markers.get(name),duration:name=>durations.get(name)??0,clips:[...actions.keys()],
  /** Strikes and throws a flare with the free (left) hand over whatever is playing; `throwing` is the time into it. */
  throwFlare(){throwT=0;},get throwing(){return throwT;},
  dispose(){mixer.stopAllAction();mixer.uncacheRoot(root);}};
}
