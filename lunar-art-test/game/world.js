import { caveOrigin,caveToWorld } from './cave-space.js';
import { createCaveView } from './cave-view.js';
import { caveLayout } from './caves.js';
import { buildingStatus, robotStatus, shipStatus, lampLevel } from './building-status.js';
import { LAUNCH } from './space.js';
import { DIRS, ITEM_INFO, ports as machinePorts } from './defs.js';
import { MINING_RADIUS, beltTurns, total, MELT, BELT_SPEED } from './production.js';
import { createStatusLamps, WORK_LIGHT } from './status-lamps.js';
import { createProductionView } from './production-view.js';
import { loadItemLibrary, BELT_ITEM_SIZES } from './item-models.js';
import { createHabitatView } from './habitat-view.js';
import { createTray } from './growbed-model.js';
import { createLaunchFx } from './launch-fx.js';
import { growBeds } from './life.js';
import { airlockOf, habitatLayout, isRoom } from './habitat.js';
import { surfaceHeightAt as heightAt, terrainData } from './terrain.js';
import { melterReady, processorReady, PROCESSOR_INPUT_CAP } from './production.js';
import { createExpeditionView } from './expedition-view.js';
import { createIceView } from './ice-view.js';
import { createTerrainView } from './terrain-view.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFS, footprint, playerObstructs } from './sim.js';
import { createAstronaut } from './actor.js';
import { createCombatView } from './combat-view.js';
import { createAndroidView } from './android-view.js';
import { ALARM_RED, createAlarmView } from './alarm-view.js';
import { raidAlert } from './raid.js';
import { createHeadlamp } from './headlamp.js';
import { createCrawlerView, scaled } from './crawler-view.js';
import { createRaidFx } from './raid-fx.js';
import { createCentipedeView } from './centipede-view.js';
import { createBurrowFx } from './burrow-fx.js';
import { SHAPE } from './centipede.js';
import { landerBay } from './encounter.js';
import { createFlareView } from './flare-view.js';
import { createGooView } from './goo-view.js';
import { FLARE } from './peril.js';
import { GOO } from './goo.js';
import { beltSlopes } from './belt-slope.js';
import { DODGE, KINDS, partsOf } from './crawler.js';
import { BIO, THERMAL } from './power.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createLightBudget, createAdaptiveResolution, trimShadows } from './render-budget.js';
import { createConstructionFx } from './construction-fx.js';
import { createTreadTexture, applyTread, ownTread } from './conveyor-tread.js';
import { createPortLinks } from './port-links.js';
import { createPipeView } from './pipe-view.js';
import { createGroundPads } from './ground-pads.js';
import { createGroundMarks } from './ground-marks.js';
import { createLogisticsView } from './logistics-view.js';
import { BASE_REACH, crates as storageCrates, crateCentre } from './storage.js';

// Presentation only: the simulation owns all positions, resources, and time.
/** Where each grower shows its ripe crop: [x, y, z, size] in the model's space. */
const RIPE_SPOTS={
  growbed:[[-.5,.49,-.4,.4],[.48,.49,.42,.4],[-.42,.49,.5,.36],[.5,.49,-.48,.36]],
  hydrorack:[[-.45,1.62,.2,.3],[.42,1.62,-.25,.3],[0,1.06,.3,.28]],
  verticalfarm:[[-.4,1.7,1.2,.42],[.35,1.7,.2,.42],[-.2,1.7,-.9,.42],[.3,1.7,-1.5,.38]],
  mushroomtray:[[-.4,.86,.1,.32],[.42,.86,-.35,.32]],
};
/** The launch site is the painted-square pad with its fuelling tower and launch effects; `options.pad` 'b' or 'c' shows the
 * other reviewed pads, and `options.launchSite: 'v1'` the original solid pad, for comparison. */
export async function createWorld(canvas, initialState, options = {}) {
  const siteV2 = options.launchSite !== 'v1', padFile = `launchpad-v2${options.pad ?? 'a'}`;
  const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled=true;renderer.localClippingEnabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  const loader=new GLTFLoader();
  const assetNames=['starship','launchpad','solar','battery','hopper','habitat-kit','conveyor','conveyor-corner','processor','storage','growbed','hydrorack','verticalfarm','mushroomtray','mill','goovat','armory','galley','recycler','melter','fabricator','assembler','electrolyser','tank','dock','roverbay','foundry','chargepad','xenolab','reactor','fuelcell','thermal','rtg','bioreactor','lander','rover','hauler','rock-a','rock-b','rock-c','cave-mouth'];
  const [loaded,itemModels]=await Promise.all([
    Promise.all(assetNames.map(name=>loader.loadAsync(`./assets/${siteV2&&name==='launchpad'?padFile:name}.glb`).then(g=>[name,g.scene]).catch(e=>{console.error('Asset failed:',name,e);return [name,null];}))),
    loadItemLibrary(loader),
  ]);
  const models=new Map(loaded);
  const tread=createTreadTexture(renderer);applyTread(models.get('conveyor'),tread);applyTread(models.get('conveyor-corner'),tread);
  const lamps=createStatusLamps();for(const model of models.values())if(model)lamps.prepare(model);let lampClock=0;
  const [astronautGLTF,crawlerGLTF,androidGLTF]=await Promise.all([
    loader.loadAsync('./assets/astronaut-v3.glb').catch(e=>{console.error('Animated astronaut failed',e);return null;}),
    loader.loadAsync('./assets/crawler.glb').catch(e=>{console.error('Crawler failed',e);return null;}),
    loader.loadAsync('./assets/android.glb').catch(e=>{console.error('Android failed',e);return null;}),
  ]);
  const scene=new THREE.Scene();
  const pmrem=new THREE.PMREMGenerator(renderer),reflectionRoom=new RoomEnvironment();
  const reflection=pmrem.fromScene(reflectionRoom,.02);scene.environment=reflection.texture;scene.environmentIntensity=.30;
  reflectionRoom.dispose();pmrem.dispose();
  scene.background=new THREE.Color('#090f1a');
  scene.fog=new THREE.FogExp2('#172131',.006);
  const camera=new THREE.OrthographicCamera(-20,20,20,-20,.1,600);
  const follow=new THREE.Vector3(initialState.player.x,0,initialState.player.z);
  let viewHeight=48, state=initialState, disposed=false, lastSeed=initialState.seed;
  const lightBudget=createLightBudget(scene,6),resolution=createAdaptiveResolution(renderer,()=>resize());let shadowClock=1;
  const sun=new THREE.DirectionalLight('#ffe4bc',3.0);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:150});
  sun.shadow.normalBias=.12;sun.shadow.bias=.00005;
  scene.add(sun,sun.target);
  const fill=new THREE.HemisphereLight('#b3cbed','#272a3d',1.15);scene.add(fill);
  const terrainRoot=new THREE.Group();scene.add(terrainRoot);
  const productionView=createProductionView(scene,models,itemModels);
  const androidView=androidGLTF?createAndroidView(scene,androidGLTF,itemModels):null;
  const groundMarks=createGroundMarks(scene,{heightAt,dust:(x,y,z,dx,dz)=>productionView.regolith.spray(x,y,z,dx*.4,dz*.4,3,'regolith',y-.03,.5,.22)});
  const habitatView=createHabitatView(scene,models.get('habitat-kit'));
  // A fixed pool of lights, so the scene's light count (and every material's shader) never changes. Nearby
  // machines and rooms are pooled into clusters, each lit by one broader light at its centre, so the whole
  // colony glows at night instead of only the few structures nearest the player.
  const workHex=new THREE.Color(WORK_LIGHT).getHex(),LIGHTS=12,CLUSTER=8;
  const lightPool=Array.from({length:LIGHTS},()=>{const l=new THREE.PointLight('#ffc777',0,13,2);scene.add(l);return l;});
  const mixColor=new THREE.Color(),addColor=new THREE.Color(),alarmColor=new THREE.Color(ALARM_RED);
  const alarmView=createAlarmView(scene,heightAt);let alarmClock=0;
  // During a raid the lights go red and pulse, and beacons sweep the ground, while there is power to light them.
  function updateLights(daylight,dt){
    const lit=state.power.powered!==false&&daylight<1&&state.player.cave==null;
    const sources=[],dark=1-daylight;
    if(state.power.powered!==false&&dark>0){
      for(const b of state.buildings){
        const p=b.built&&b.type!=='conveyor'&&!DEFS[b.type].layer&&structures.get(b.id)?.root.position;
        if(p)sources.push({x:p.x,y:p.y+2.6,z:p.z,power:11,color:workHex});
      }
      for(const l of habitatView.lights())sources.push({x:l.x,y:l.y,z:l.z,power:l.greenhouse?10:15,color:l.greenhouse?0xffb0dc:0xffcf8c});
    }
    const clusters=[];
    for(const s of sources){
      let c=clusters.find(c=>Math.hypot(c.x/c.n-s.x,c.z/c.n-s.z)<CLUSTER);
      if(!c){c={x:0,y:0,z:0,n:0,power:0,r:0,g:0,b:0,members:[]};clusters.push(c);}
      c.x+=s.x;c.y=Math.max(c.y,s.y);c.z+=s.z;c.n++;c.power+=s.power;addColor.setHex(s.color);c.r+=addColor.r*s.power;c.g+=addColor.g*s.power;c.b+=addColor.b*s.power;c.members.push(s);
    }
    for(const c of clusters){
      c.x/=c.n;c.z/=c.n;c.y+=.8;
      const spread=Math.max(0,...c.members.map(m=>Math.hypot(m.x-c.x,m.z-c.z)));
      c.distance=10+spread*1.4;c.intensity=dark*Math.min(c.power,11*(1+Math.sqrt(c.n-1)*.9))*(1+spread*.06);
      c.d=Math.hypot(c.x-follow.x,c.z-follow.z);
    }
    clusters.sort((a,b)=>a.d-b.d);
    alarmClock+=dt;
    const alarm=alarmView.update(dt,lit&&raidAlert(state)?1:0,clusters.map(c=>({x:c.x,z:c.z,reach:Math.min(13,c.distance*.75)})),state.seed);
    lightPool.forEach((l,i)=>{const c=clusters[i];if(!c){l.intensity=0;return;}l.position.set(c.x,c.y,c.z);l.distance=c.distance;l.color.copy(mixColor.setRGB(c.r/c.power,c.g/c.power,c.b/c.power)).lerp(alarmColor,alarm);
      l.intensity=c.intensity*(1+alarm*(.55*Math.sin(alarmClock*5.2+i*1.3)-.15));});
    return alarm;
  }
  let caveView=null,activeCave=null,smoothedGround=null,caveBlend=0;const caveViews=new Map();
  const vignette=document.createElement('div');vignette.className='cave-vignette';document.body.append(vignette);

  const structures=new Map();
  // A crate shows its four biggest holdings on the lid, one per quarter, stacked higher as they fill.
  const CRATE_SPOTS=[[-.27,-.27],[.27,-.27],[-.27,.27],[.27,.27]];
  function showCrateGoods(o,b){
    if(!itemModels)return;
    const held={};for(const s of b.built?b.slots??[]:[])if(s)held[s.item]=(held[s.item]??0)+s.count;
    const top=Object.entries(held).sort((p,q)=>q[1]-p[1]).slice(0,4).map(([item,n])=>{const stack=ITEM_INFO[item]?.stack??1;return [item,stack<3?1:n>=stack?3:n>=stack/3?2:1];});
    const key=top.map(t=>t.join(':')).join();
    if(o.goodsKey===key)return;o.goodsKey=key;
    if(!o.goods){o.goods=new THREE.Group();o.goods.name='Crate goods';o.goods.position.y=1.67;o.root.add(o.goods);}
    o.goods.clear();
    top.forEach(([item,levels],i)=>{
      const size=Math.min(.42,BELT_ITEM_SIZES[item]??.4),probe=itemModels.create(item,size);if(!probe)return;
      const height=new THREE.Box3().setFromObject(probe).getSize(new THREE.Vector3()).y;
      for(let l=0;l<levels;l++){const m=l?itemModels.create(item,size):probe;m.position.set(CRATE_SPOTS[i][0],l*height*.96,CRATE_SPOTS[i][1]);m.rotation.y=i*1.3+l*.5;o.goods.add(m);}
    });
  }
  const statusLayer=document.createElement('div');statusLayer.className='building-status-layer';statusLayer.setAttribute('aria-label','Building status');document.body.append(statusLayer);
  const statusLabels=new Map(),statusPoint=new THREE.Vector3();
  // Drives a machine's lamp, battery cells and sight glass from its status.
  function driveLamp(o,b,status){
    if(!o.lamp)return;
    const level=b.built&&state.power.powered!==false?lampLevel(status):'off';o.lamp.set(level,b.built);
    if(b.type==='battery')o.lamp.cells(b.built?status?.fill??0:0,level);
    if(b.type==='melter')o.lamp.fill(b.built?(b.inv?.ice??0)/MELT.cap:0,'water');
    if(b.type==='tank')o.lamp.fill(b.built?(b.fuel??0)/DEFS.tank.capacity:0,'fuel');
    if(b.type==='fuelcell')o.lamp.fill(b.built?state.buildings.reduce((s,t)=>s+(t.built&&t.type==='tank'?t.fuel??0:0),0)/Math.max(1,state.buildings.filter(t=>t.built&&t.type==='tank').length*DEFS.tank.capacity):0,'fuel');
    if(b.type==='thermal')o.lamp.fill(b.built?(b.inv?.regolith??0)/THERMAL.cap:0,'regolith');
    if(b.type==='bioreactor')o.lamp.fill(b.built?(b.stock-(b.stock>0?b.burn:0))/BIO.cap:0,'goo');
    if(b.type==='hopper')o.lamp.fill(b.built?total(b.inv)/DEFS.hopper.capacity:0,(b.inv?.ice??0)>(b.inv?.regolith??0)?'water':'regolith');
  }
  const GLYPHS={
    charging:'<path d="M13 2 5 13.5h6L10 22l8-11.5h-6z"/>',
    power:'<path d="M13 2 5 13.5h6L10 22l8-11.5h-6z"/><path d="M3 3l18 18"/>',
    ice:'<path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5"/>',
    water:'<path d="M12 3s-6 6.8-6 11a6 6 0 0 0 12 0c0-4.2-6-11-6-11z"/>',
    alert:'<path d="M12 3 2.5 20h19z"/><path d="M12 9.5v4.5M12 17v.5"/>',
    build:'<path d="m14 4 6 6-3 3-2-2-8 9-3-3 9-8-2-2 3-3Z"/>',
    satellite:'<path d="M9 9h6v6H9ZM2 10h5v4H2Zm15 0h5v4h-5ZM12 9V5"/>',
    fuel:'<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
    harvest:'<path d="M12 21v-8"/><path d="M12 13c0-4.2 3-7 8-7 0 4.2-3 7-8 7Z"/><path d="M12 15.5c0-3.2-2.6-5.7-7-5.7 0 3.2 2.6 5.7 7 5.7Z"/>',
    launch:'<path d="M12 2c3 3 4 7 3 12H9C8 9 9 5 12 2Z"/><path d="M9 14l-3 3 1 3 3-2m5-4 3 3-1 3-3-2M12 18v4"/>',
  };
  function updateStatuses(){
    const entries=[],rooms=habitatLayout(state.buildings);
    // One label per finished room, on its oldest square; unfinished squares and belts stay quiet.
    const roomLabel=b=>{const room=rooms.roomOf.get(`${b.x},${b.z}`);return !!room&&Math.min(...room.modules)===b.id;};
    for(const b of state.buildings){
      const object=structures.get(b.id),show=b.type==='conveyor'||isRoom(b)?b.built&&(b.type==='conveyor'||roomLabel(b)):true,status=object&&show?buildingStatus(b,state):null;
      if(object)driveLamp(object,b,status);
      entries.push({key:String(b.id),status,anchor:object?.root,height:object?.statusHeight,name:DEFS[b.type].name});
    }
    for(const r of state.robots??[]){
      const android=r.kind==='android',view=android?androidView?.views.get(r.id):productionView.rovers.get(r.id),status=view?robotStatus(r,state):null;
      if(view&&!android){view.lamp??=lamps.attach(view.model);view.lamp?.set(lampLevel(status));}
      entries.push({key:`robot-${r.id}`,status,anchor:view?.root,height:android?2.3:1.9,name:android?`Android A${r.id}`:r.kind==='hauler'?'Hauler':'Mining rover'});
    }
    if(starship)entries.push({key:'ship',status:shipStatus(state),anchor:starship,height:13.4,name:'Starship'});
    const live=new Set(entries.map(e=>e.key));
    for(const [id,label] of statusLabels)if(!live.has(id)){label.remove();statusLabels.delete(id);}
    const rect=canvas.getBoundingClientRect(),placed=[];
    // Glyphs only for faults, charging and blueprints; the lamps on each machine carry every other state.
    // A joined bed floats one harvest badge, over the ripe plot nearest its middle.
    const harvestAt=new Set();
    for(const bed of new Set(growBeds(state).values())){
      const ripe=bed.filter(o=>o.grow>=1);if(!ripe.length)continue;
      const cx=bed.reduce((a,o)=>a+o.x,0)/bed.length,cz=bed.reduce((a,o)=>a+o.z,0)/bed.length;
      harvestAt.add(ripe.reduce((a,o)=>Math.hypot(o.x-cx,o.z-cz)<Math.hypot(a.x-cx,a.z-cz)?o:a).id);
    }
    for(const e of entries)if(e.status?.glyph==='harvest'&&state.buildings.find(b=>String(b.id)===e.key)?.type==='growbed'&&!harvestAt.has(Number(e.key)))e.status={...e.status,glyph:null};
    for(const e of entries)e.glyph=e.status?.glyph??(e.status?.tone==='warning'?'alert':null);
    const visible=entries.filter(e=>e.glyph&&e.anchor);
    const shown=new Set(visible.map(e=>e.key));
    for(const [id,label] of statusLabels)if(!shown.has(id))label.classList.remove('on');
    visible.sort((a,b)=>b.anchor.position.x+b.anchor.position.z-a.anchor.position.x-a.anchor.position.z);
    for(const {key:id,status,anchor,height,name,glyph} of visible){
      let label=statusLabels.get(id);
      if(!label){
        label=document.createElement('div');label.className='callout';label.dataset.buildingId=id;
        label.innerHTML='<span class="callout-bubble"><svg class="callout-ring" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14.5"/><circle class="arc" cx="16" cy="16" r="14.5" pathLength="100"/></svg><svg class="callout-glyph" viewBox="0 0 24 24" aria-hidden="true"></svg></span>';label.setAttribute('role','img');
        statusLayer.append(label);statusLabels.set(id,label);
      }
      if(label.dataset.glyph!==glyph||label.dataset.tone!==status.tone){label.dataset.glyph=glyph;label.dataset.tone=status.tone;label.querySelector('.callout-glyph').innerHTML=GLYPHS[glyph]??GLYPHS.alert;}
      // Blueprints and charging wear a progress ring around the bubble.
      const ring=status.fill!=null&&(glyph==='build'||glyph==='charging'||glyph==='fuel'||glyph==='launch')?Math.round(Math.max(0,Math.min(1,status.fill))*100):-1;
      if(label.dataset.ring!==String(ring)){label.dataset.ring=String(ring);label.querySelector('.arc').style.strokeDashoffset=String(100-Math.max(0,ring));}
      if(label.dataset.status!==status.text){label.dataset.status=status.text;label.setAttribute('aria-label',`${name}: ${status.text}`);}
      statusPoint.copy(anchor.position);statusPoint.y+=height+.25;statusPoint.project(camera);
      const x=rect.left+(statusPoint.x+1)*rect.width/2,y=rect.top+(1-statusPoint.y)*rect.height/2;
      const offscreen=statusPoint.z<-1||statusPoint.z>1||x<40||x>rect.right-40||y<90||y>rect.bottom-80;
      label.classList.toggle('on',!offscreen);if(offscreen)continue;
      // Glyphs sit centred over their machine and step up a tier when a nearer one already holds the spot.
      const w=32,h=38;
      let spot=null;
      for(let tier=0;tier<4&&!spot;tier++){
        const lift=8+tier*(h+4),r={left:x-w/2,right:x+w/2,top:y-lift-h,bottom:y-lift,lift};
        if(!placed.some(p=>r.left<p.right+4&&r.right>p.left-4&&r.top<p.bottom+2&&r.bottom>p.top-2))spot=r;
      }
      if(!spot){label.classList.remove('on');continue;}
      placed.push(spot);
      label.style.transform=`translate(${Math.round(x)}px,${Math.round(y)}px)`;label.style.setProperty('--lift',`${spot.lift}px`);
    }
  }

  const geometries=new Set(),materials=new Set();
  const mat=(color,opts={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.82,...opts});materials.add(m);return m;};
  const ivory=mat('#d6dcd8'), dark=mat('#293544'), orange=mat('#e17a35'), steel=mat('#818d99',{metalness:.55,roughness:.45}), glass=mat('#638b99',{metalness:.4,roughness:.25}), blue=mat('#203f6b',{metalness:.3,roughness:.35});
  const whiteLight=mat('#d0edff',{emissive:'#96d6ff',emissiveIntensity:1.7});
  const boxGeo=new THREE.BoxGeometry(1,1,1),cylGeo=new THREE.CylinderGeometry(1,1,1,12),sphereGeo=new THREE.IcosahedronGeometry(1,1);
  [boxGeo,cylGeo,sphereGeo].forEach(g=>geometries.add(g));
  function mesh(g,m,parent,x=0,y=0,z=0,sx=1,sy=1,sz=1){const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function box(parent,m,x,y,z,sx,sy,sz){return mesh(boxGeo,m,parent,x,y,z,sx,sy,sz);}
  function cylinder(parent,m,x,y,z,r,h){return mesh(cylGeo,m,parent,x,y,z,r,h,r);}
  let terrainView=createTerrainView(initialState.seed,terrainRoot,models);
  // Quiet grid; line spacing is the actual two-metre construction cell.
  const grid=new THREE.GridHelper(74,37,'#a1aaba','#8590a2');grid.position.set(0,.015,0);grid.material.transparent=true;grid.material.opacity=0;scene.add(grid);
  function drapeGrid(){
    const vertices=[];
    for(let line=-101;line<=101;line+=2)for(let a=-101;a<101;a+=1){
      for(const [x,z] of [[line,a],[line,a+1],[a,line],[a+1,line]])vertices.push(x,heightAt(state.seed,x,z)+.025,z);
    }
    grid.geometry.dispose();grid.geometry=new THREE.BufferGeometry();grid.geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));grid.material.vertexColors=false;grid.material.color.set('#8590a2');
  }drapeGrid();
  // The Starship stands on the pad's deck, not on the ground.
  const PAD_DECK=siteV2?0:.34;
  for(const name of ['launchpad','starship']){
    const imported=models.get(name);
    if(imported){imported.position.set(0,name==='starship'?PAD_DECK:0,-10);imported.traverse(o=>{if(o.isMesh){o.castShadow=name==='starship';o.receiveShadow=true;}});scene.add(imported);}
  }
  // The pad's edge and deck lights are on the colony grid.
  const padLamps=new Set();models.get('launchpad')?.traverse(o=>{if(o.isMesh)for(const m of [o.material].flat())if(m.emissiveIntensity>0&&m.emissive?.getHex()){m.userData.baseEmission??=m.emissiveIntensity;padLamps.add(m);}});
  // Liftoff and landing: the ship rises on a flame and a glare light, and kicks up a ring of dust near the ground.
  const starship=models.get('starship');
  const flameMaterial=new THREE.MeshBasicMaterial({color:'#ffb35c',transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false});materials.add(flameMaterial);
  const flameGeo=new THREE.ConeGeometry(1.1,7,16,1,true);flameGeo.rotateX(Math.PI);flameGeo.translate(0,-3.5,0);geometries.add(flameGeo);
  const flame=new THREE.Mesh(flameGeo,flameMaterial);flame.position.y=.6;flame.visible=false;starship?.add(flame);
  const plumeCore=new THREE.Mesh(flameGeo,new THREE.MeshBasicMaterial({color:'#fff4d6',transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));materials.add(plumeCore.material);plumeCore.scale.set(.45,.6,.45);flame.add(plumeCore);
  const burnLight=new THREE.PointLight('#ff9a3c',0,45,2);burnLight.position.set(0,-1,0);starship?.add(burnLight);
  const dustMaterial=new THREE.MeshBasicMaterial({color:'#c9c1b4',transparent:true,opacity:0,depthWrite:false});materials.add(dustMaterial);
  const dustGeo=new THREE.RingGeometry(.6,1,48);dustGeo.rotateX(-Math.PI/2);geometries.add(dustGeo);
  const dust=new THREE.Mesh(dustGeo,dustMaterial);dust.position.set(0,.3,-10);scene.add(dust);let dustClock=0;
  const launchFx=siteV2?createLaunchFx(scene,{heightAt:(x,z)=>heightAt(state.seed,x,z)}):null;
  if(launchFx&&starship){launchFx.attach(starship);flame.visible=false;dust.visible=false;}
  const umbilical=siteV2?(()=>{let found=null;models.get('launchpad')?.traverse(o=>{if(!found&&o.name.startsWith('Umbilical'))found=o;});return found;})():null;
  let thrustLeft=0,armSwing=0;
  function updateShip(dt,daylight=1){
    if(!starship)return;
    if(launchFx){updateLaunchSite(dt,daylight);return;}
    const s=state.ship,flying=s.status==='ascent'||s.status==='descent';
    let altitude=0;
    if(s.status==='ascent')altitude=.5*(2*170/LAUNCH.ascent**2)*s.t**2;
    if(s.status==='descent')altitude=170*(1-Math.min(1,s.t/LAUNCH.descent))**2;
    starship.visible=s.status!=='orbit';
    const shake=flying&&altitude<4?(Math.random()-.5)*.08:0;
    starship.position.set(shake,PAD_DECK+altitude,-10+shake);
    flame.visible=flying;burnLight.intensity=flying?60+Math.random()*25:0;
    if(flying){const k=s.status==='descent'?.65+.35*Math.min(1,s.t/LAUNCH.descent):1;flame.scale.set(k*(.9+Math.random()*.2),k*(.85+Math.random()*.35),k*(.9+Math.random()*.2));}
    // Dust billows out while the plume is close to the ground.
    const near=flying&&altitude<25;dustClock=near?dustClock+dt:Math.max(0,dustClock-dt*2);
    dust.visible=dustClock>0;dust.scale.setScalar(4+dustClock*6%14);dustMaterial.opacity=near?.35*(1-altitude/25):dustMaterial.opacity*.95;
  }
  // The second site: engines throttle up on the way down and cut at touchdown, the dust settles after.
  function updateLaunchSite(dt,daylight){
    const s=state.ship,flying=s.status==='ascent'||s.status==='descent';
    let altitude=0;
    if(s.status==='ascent')altitude=.5*(2*170/LAUNCH.ascent**2)*s.t**2;
    if(s.status==='descent')altitude=170*(1-Math.min(1,s.t/LAUNCH.descent))**2;
    starship.visible=s.status!=='orbit';
    const thrust=s.status==='ascent'?Math.min(1,.35+s.t*1.6):s.status==='descent'?.45+.55*Math.min(1,s.t/LAUNCH.descent)**2:0;
    thrustLeft=flying?thrust:Math.max(0,thrustLeft-dt*2.5);
    const shake=thrustLeft>0&&altitude<6?(Math.random()-.5)*.1*thrustLeft:0;
    starship.position.set(shake,PAD_DECK+altitude,-10+shake);
    // The fuelling arm swings clear before liftoff and back once the ship is down and still.
    const away=s.status!=='pad'||s.hold>0;armSwing=THREE.MathUtils.damp(armSwing,away?1:0,away?3:1.2,dt);
    if(umbilical)umbilical.rotation.y=-armSwing*1.35;
    launchFx.update(dt,{ship:{x:0,z:-10},altitude,thrust:thrustLeft,daylight,ground:0});
  }
  const padLight=new THREE.PointLight('#ffc584',18,23,2);padLight.position.set(0,3,-10);scene.add(padLight);
  const player=new THREE.Group();scene.add(player);
  const suitFill=new THREE.PointLight('#bddaff',7,8,2);suitFill.position.set(0,2,0);player.add(suitFill);
  const headlamp=createHeadlamp(player);
  let actor=null;
  if(astronautGLTF){actor=createAstronaut(astronautGLTF);player.add(actor.root);}
  else{box(player,orange,0,.8,0,.65,.8,.45);mesh(sphereGeo,ivory,player,0,1.5,0,.42,.42,.42);}
  // A breached vat's goo, hatchlings and the flares thrown at them, in world metres on the player's ground.
  const surfaceFx=new THREE.Group();surfaceFx.name='surface-hunt';scene.add(surfaceFx);
  const HATCHLING=.6,surfaceFlares=createFlareView(surfaceFx),thrownOnSurface=new WeakSet(),broodViews=new Map();
  // Weapons drawn on the surface fire in surfaceFx, where sim x,z are local x,z; hatchlings are found in their holders.
  const surfaceSpace={root:surfaceFx,surface:true},broodAt=new THREE.Vector3();
  const broodLookup=c=>{const v=broodViews.get(c);if(!v)return null;
    return {position:broodAt.copy(v.view.position).multiplyScalar(v.scale).add(v.holder.position),hit:(at,dir)=>v.view.hit(at.clone().sub(v.holder.position).divideScalar(v.scale),dir),
      burn:(h,c)=>v.view.burn(h,c),burning:()=>v.view.burning().map(p=>p.clone().multiplyScalar(v.scale).add(v.holder.position))};};
  const combat=actor&&crawlerGLTF?createCombatView({actor,player,headlamp,crawlerGLTF,lookup:broodLookup}):null;
  // The brood walks the ground itself: each holder rides the terrain (or a room floor) under its crawler.
  const broodGround=(x,z)=>habitatView.floorAt(state,x,z)??heightAt(state.seed,x,z);
  const gooView=createGooView(scene,broodGround);
  const raidFx=createRaidFx(scene,{groundAt:broodGround});
  // Centipedes walk the ground in surfaceFx's space; the terrain itself hides whatever of them is dug in.
  const onSurfaceFx=(x,z)=>broodGround(x,z)-surfaceFx.position.y,surfaceBurrows=createBurrowFx(surfaceFx,{groundAt:onSurfaceFx});
  function updateSurfaceHunt(dt,underground){
    surfaceFx.visible=!underground;gooView.update(state,dt);
    const brood=underground?[]:state.brood??[];
    // Each crawler is drawn at its own size: the view walks a world shrunk (or grown) about the origin by the same
    // factor, so its feet stay planted and its strides scale with its legs.
    for(const c of brood)if(c.kind==='centipede'&&!broodViews.has(c)&&crawlerGLTF){const holder=new THREE.Group();surfaceFx.add(holder);const view=createCentipedeView(crawlerGLTF,holder,{style:SHAPE.style,freak:SHAPE.freak,groundAt:onSurfaceFx,clip:false});broodViews.set(c,{holder,view,scale:1,update:(c,dt)=>view.update(c,dt),dispose:()=>{view.dispose();holder.removeFromParent();}});}
    for(const c of brood)if(c.kind!=='centipede'&&!broodViews.has(c)&&crawlerGLTF){const scale=c.raider?c.size??(c.small?HATCHLING:1):HATCHLING,holder=new THREE.Group();holder.scale.setScalar(scale);surfaceFx.add(holder);const view=createCrawlerView(crawlerGLTF,holder,{mode:'studio',girth:c.raider?KINDS[c.kind]?.belly??0:0,lite:scale<1,size:scale});broodViews.set(c,{holder,view,scale,update:(c,dt,ctx)=>{holder.position.set(0,broodGround(c.x,c.z)-surfaceFx.position.y,0);view.update(scaled(c,scale),dt,ctx);},dispose:()=>{view.dispose();holder.removeFromParent();}});}
    for(const [c,v] of broodViews)if(!brood.includes(c)){v.dispose();broodViews.delete(c);}
    if(underground)return;
    surfaceFx.position.y=smoothedGround??0;
    for(const f of state.flares??[])if(f.cave==null&&f.age!=null&&f.age<FLARE.release&&!thrownOnSurface.has(f)){thrownOnSurface.add(f);actor?.throwFlare();}
    surfaceFlares.update(state,dt,{root:surfaceFx,actor});
    for(const [c,v] of broodViews){const at=c.aimAt??state.player;v.update(c,dt,{player:{x:at.x/v.scale,z:at.z/v.scale}});}
    surfaceBurrows.update(brood.filter(c=>c.kind==='centipede'),dt);
  }
  const suitMaterials=[];actor?.root.traverse(o=>{if(o.isMesh)for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(!suitMaterials.some(x=>x.material===m))suitMaterials.push({material:m,color:m.color.clone(),environment:m.envMapIntensity});});let suitUnderground=false;
  document.body.dataset.characterClips=actor?.clips.join(',')||'unavailable';
  const markerGeo=new THREE.RingGeometry(.58,.66,32);geometries.add(markerGeo);const marker=mesh(markerGeo,mat('#ffbf6c',{emissive:'#a66624',emissiveIntensity:.35}),player,0,.025,0);marker.rotation.x=-Math.PI/2;
  // A belt on uneven ground tilts onto the plane through its joined ends; a straight one stretches to keep spanning its cell.
  const UP=new THREE.Vector3(0,1,0),beltNormal=new THREE.Vector3(),beltTilt=new THREE.Quaternion(),beltYaw=new THREE.Quaternion();
  function tiltBelt(root,b,slope,turn){
    if(!slope)return;
    root.position.y=slope.y;
    beltYaw.setFromAxisAngle(UP,b.rotation*Math.PI/2);beltTilt.setFromUnitVectors(UP,beltNormal.set(-slope.gx,1,-slope.gz).normalize());
    root.quaternion.copy(beltTilt).multiply(beltYaw);
    const [fx,fz]=DIRS[b.rotation];root.scale.z=turn?1:Math.hypot(1,slope.gx*fx+slope.gz*fz);
  }
  function buildModel(type,turn=0){
    // Room squares are assembled per connected room by the habitat view; this is only a label anchor.
    if(DEFS[type].layer==='floor')return {root:new THREE.Group(),roof:null,emits:false,statusHeight:2.45};
    const template=models.get(type==='conveyor'&&turn?'conveyor-corner':type);
    if(type==='growbed'&&template){
      const t=createTray(template),crops=itemModels?new THREE.Group():null;
      if(crops){crops.name='Ripe crop';t.root.add(crops);}
      return {root:t.root,roof:null,emits:true,plants:t.plants,crops,cropKind:null,tray:null,trayShape:t};
    }
    if(template){
      const root=template.clone(true),part=name=>{let found=null;root.traverse(n=>{if(!found&&n.name.replace(/\.?\d{3}$/,'')===name)found=n;});return found;};
      if(type==='conveyor'&&turn<0)root.scale.x=-1;
      const oldTray=part('MealTray'),tray=itemModels&&oldTray?itemModels.replace(root,oldTray,'meal',.57):oldTray;
      // Ripe produce shows as the crop's own item model, laid where each grower holds it.
      const crops=RIPE_SPOTS[type]&&itemModels?new THREE.Group():null;
      if(crops){crops.name='Ripe crop';root.add(crops);}
      return {root,roof:null,emits:DEFS[type].layer==='interior',plants:part('Plants'),crops,cropKind:null,tray,level:type==='goovat'?part('Level'):null,heater:part('Heater'),panel:type==='solar'?part('Panel'):null,kiln:part('Kiln'),fill:part('Fill')};
    }
    const root=new THREE.Group(),w=DEFS[type].w*2,d=DEFS[type].d*2;
    box(root,dark,0,.12,0,w-.12,.24,d-.12);
    let roof=null,emits=false;
    if(type==='solar'){
      for(const x of [-w*.28,w*.28])cylinder(root,steel,x,.8,0,.08,1.4);
      const panel=new THREE.Group();panel.position.y=1.4;panel.rotation.x=-.25;root.add(panel);
      box(panel,steel,0,0,0,w-.3,.12,d-.25);box(panel,blue,0,.08,0,w-.42,.05,d-.37);
      for(let x=-w*.5+.65;x<w*.5-.3;x+=.65)box(panel,steel,x,.115,0,.018,.012,d-.4);
      for(let z=-d*.5+.7;z<d*.5-.3;z+=.65)box(panel,steel,0,.115,z,w-.4,.012,.018);
    } else if(type==='battery') {
      for(const x of [-w*.22,w*.22]){box(root,ivory,x,.9,0,w*.38,1.55,d-.4);box(root,dark,x,.9,d*.5-.18,w*.29,1.1,.07);for(let i=0;i<4;i++)box(root,i<3?whiteLight:orange,x,.55+i*.2,d*.5-.13,w*.2,.08,.04);}
      box(root,orange,0,1.76,0,w-.4,.12,d-.5);
    } else if(type==='hopper'){
      box(root,steel,0,.85,0,w-.55,1.3,d-.5);box(root,dark,0,1.53,0,w-.72,.1,d-.7);
      for(const x of [-1,1])box(root,orange,x*(w*.5-.17),1.4,0,.16,.45,d-.25);
      box(root,dark,0,.48,d*.5-.04,.7,.55,.3);
    } else if(type==='conveyor'){
      box(root,dark,0,.3,0,1.3,.1,1.98);for(const x of [-.72,.72])box(root,steel,x,.38,0,.14,.2,1.98);box(root,orange,0,.37,.3,.5,.02,.5);
    } else box(root,ivory,0,.75,0,w-.4,1.3,d-.4);
    return {root,roof,emits};
  }
  const sunDir=new THREE.Vector3(0,1,0);
  const padBase=b=>{const def=DEFS[b.type],w=b.rotation%2?def.d:def.w,d=b.rotation%2?def.w:def.d;return heightAt(state.seed,(b.x+(w-1)/2)*2,(b.z+(d-1)/2)*2);};
  const buildFx=createConstructionFx(scene,{make:o=>buildModel(o.type,o.turn).root}),portLinks=createPortLinks(scene,{heightAt}),pipes=createPipeView(scene,{groundAt:(x,z)=>{let y=heightAt(state.seed,x,z);for(const b of state.buildings){if(b.type==='conveyor'||DEFS[b.type].layer)continue;const def=DEFS[b.type],w=b.rotation%2?def.d:def.w,d=b.rotation%2?def.w:def.d;if(x>b.x*2-1.6&&x<(b.x+w)*2-.4&&z>b.z*2-1.6&&z<(b.z+d)*2-.4)y=Math.max(y,padBase(b)+.03);}return y;}}),groundPads=createGroundPads(scene,{skip:b=>b.type==='conveyor'||b.type==='launchpad'||!!DEFS[b.type].layer});
  const logistics=createLogisticsView(scene,{heightAt:(x,z)=>heightAt(state.seed,x,z),radius:BASE_REACH});let logisticsShown=false;let booted=false;
  const blueprintColor=[new THREE.Color('#79d5ed'),new THREE.Color('#ff715d')],blueprintEmissive=[new THREE.Color('#2c8ca9'),new THREE.Color('#a3301f')];
  const ghost=new THREE.Group();scene.add(ghost);let ghostKey='';
  const ghostGood=new THREE.MeshBasicMaterial({color:'#8cddb9',transparent:true,opacity:.3,depthWrite:false}),ghostBad=new THREE.MeshBasicMaterial({color:'#ff715d',transparent:true,opacity:.35,depthWrite:false});materials.add(ghostGood);materials.add(ghostBad);
  const ghostRemove=new THREE.MeshBasicMaterial({color:'#ff3b2f',transparent:true,opacity:.5,depthWrite:false});materials.add(ghostRemove);
  // Flat ground arrows: belt travel, machine inputs (cyan, pointing in) and outputs (amber, pointing out).
  const arrowShape=new THREE.Shape();arrowShape.moveTo(-.38,-.32);arrowShape.lineTo(0,.38);arrowShape.lineTo(.38,-.32);arrowShape.lineTo(0,-.12);arrowShape.closePath();
  const arrowGeo=new THREE.ShapeGeometry(arrowShape);arrowGeo.rotateX(-Math.PI/2);arrowGeo.rotateY(Math.PI);geometries.add(arrowGeo);
  const arrowMaterial=(color,overlay=false)=>{const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false,depthTest:!overlay,side:THREE.DoubleSide});materials.add(m);return m;};
  const arrows={input:arrowMaterial('#72d7ec'),output:arrowMaterial('#f3a24b')},previewArrows={input:arrowMaterial('#72d7ec',true),output:arrowMaterial('#f3a24b',true)},beltArrow=arrowMaterial('#ffffff',true);
  function groundArrow(parent,material,x,z,dir,scale=1,lift=.12){const o=new THREE.Mesh(arrowGeo,material);o.position.set(x,heightAt(state.seed,x,z)+lift,z);o.rotation.y=dir*Math.PI/2;o.scale.setScalar(scale);o.renderOrder=3;parent.add(o);return o;}
  // Built machines' ports only show while laying belts, raised clear of their graded pads and port trays.
  let portsShown=false;
  function setPorts(shown){if(shown===portsShown)return;portsShown=shown;for(const o of structures.values())if(o.ports)o.ports.visible=shown;}
  function portArrows(parent,b,preview=false){
    const look=preview?previewArrows:arrows,scale=preview?1.3:1.25,lift=preview?.3:.62;
    if(preview&&DEFS[b.type].airlock){const a=airlockOf(b),[dx,dz]=DIRS[a.dir];groundArrow(parent,look.output,a.x+dx*1.1,a.z+dz*1.1,a.dir,scale,lift);}
    // Crate sides are two-way: a small in-and-out pair side by side on each face.
    if(b.type==='storage'){for(const p of machinePorts(b,'inputs')){const [dx,dz]=DIRS[p.dir],x=p.cell.x+p.neighbor.x,z=p.cell.z+p.neighbor.z;groundArrow(parent,look.input,x-dz*.42,z+dx*.42,(p.dir+2)%4,scale*.6,lift);groundArrow(parent,look.output,x+dz*.42,z-dx*.42,p.dir,scale*.6,lift);}return;}
    for(const p of machinePorts(b,'inputs'))groundArrow(parent,look.input,(p.cell.x+p.neighbor.x),(p.cell.z+p.neighbor.z),(p.dir+2)%4,scale,lift);
    for(const p of machinePorts(b,'outputs'))groundArrow(parent,look.output,(p.cell.x+p.neighbor.x),(p.cell.z+p.neighbor.z),p.dir,scale,lift);
  }
  function setGhost(type,x,z,rotation,valid,line=null){
    if(type!=='mine'&&type!=='dismantle'&&!DEFS[type]){clearGhost();return;}
    const items=line??[{x,z,rotation,valid}],key=type+JSON.stringify(items);if(key===ghostKey)return;ghostKey=key;ghost.clear();
    for(const item of items){
      // Dismantle items carry the target's cells and are drawn as a red volume over it.
      const cells=type==='mine'?Array.from({length:(MINING_RADIUS*2+1)**2},(_,i)=>({x:item.x-MINING_RADIUS+i%(MINING_RADIUS*2+1),z:item.z-MINING_RADIUS+Math.floor(i/(MINING_RADIUS*2+1))})):item.cells??footprint(type,item.x,item.z,item.rotation);
      const tall=type==='dismantle'?2.3:.13;
      for(const c of cells)box(ghost,type==='dismantle'?ghostRemove:item.valid?ghostGood:ghostBad,c.x*2,(habitatView.floorAt(state,c.x*2,c.z*2)??heightAt(state.seed,c.x*2,c.z*2))+.08+tall/2-.065,c.z*2,type==='mine'?1.7:1.94,tall,type==='mine'?1.7:1.94);
      if(type==='conveyor')groundArrow(ghost,beltArrow,item.x*2,item.z*2,item.rotation,1.1,.3);
      else if(type!=='mine'&&type!=='dismantle')portArrows(ghost,{type,x:item.x,z:item.z,rotation:item.rotation},true);
    }
    ghost.visible=true;grid.material.opacity=.28;
  }
  function clearGhost(){ghost.visible=false;ghostKey='';grid.material.opacity=0;}
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),hit=new THREE.Vector3();
  function pick(clientX,clientY){if(state.player.cave!=null)return null;const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return null;pointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObject(terrainView.ground);if(!hits.length)return null;hit.copy(hits[0].point);const x=Math.round(hit.x/2),z=Math.round(hit.z/2);const here=state.buildings.filter(b=>footprint(b.type,b.x,b.z,b.rotation).some(c=>c.x===x&&c.z===z)),b=here.find(b=>!isRoom(b))??here[0];return {x,z,worldX:hit.x,worldZ:hit.z,...(b?{buildingId:b.id}:{})};}
  function resize(){const r=canvas.getBoundingClientRect(),width=Math.max(1,r.width),height=Math.max(1,r.height);renderer.setSize(width,height,false);const aspect=width/height;camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix();}
  function zoom(e){e.preventDefault();viewHeight=THREE.MathUtils.clamp(viewHeight*Math.exp(e.deltaY*.001),20,180);resize();}
  canvas.addEventListener('wheel',zoom,{passive:false});
  const expedition=createExpeditionView(scene,models,itemModels),iceView=createIceView(scene);let encounterState=null;
  // The crawler at the crash site: full size, on the crater floor under it. It claws at the lander's bay while prying.
  const meetHolder=new THREE.Group();scene.add(meetHolder);let meetView=null,meetCrawler=null;
  const bay=landerBay(),pryAt={x:bay.x,z:bay.z};
  function updateEncounter(dt,underground){
    const c=underground?null:encounterState?.crawler??null;
    if(c!==meetCrawler){meetView?.dispose();meetView=c&&crawlerGLTF?createCrawlerView(crawlerGLTF,meetHolder,{mode:'studio'}):null;meetCrawler=c;}
    if(!meetView)return;
    meetHolder.position.y=heightAt(state.seed,c.x,c.z);
    meetView.update(c,dt,{player:encounterState.phase==='pry'?pryAt:state.player});
  }
  // Shots go out at about shoulder height over the ground they are aimed at, so on a slope they pitch with it.
  const AIM_HEIGHT=1.2;
  const aimPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0),aimBody=new THREE.Vector3(),aimStep=new THREE.Vector3();
  /**
   * On the surface, what the cursor is over: a raider's body if the ray passes through one, else the ground, found by
   * walking the ray down onto the terrain. `y` is the world height to shoot at (the body, or shoulder height over the
   * ground there), `pitch` the angle up (+) or down to it from the player's shoulder.
   */
  function aimOnSurface(){
    const ray=raycaster.ray;let best=null,bestT=Infinity;
    for(const c of state.brood??[]){
      if(c.state==='dead')continue;
      const size=c.kind==='centipede'?.6:c.raider?c.size??1:HATCHLING;
      for(const p of partsOf(c)){
        aimBody.set(p.x,broodGround(p.x,p.z)+(c.kind==='centipede'?.45:.75*size),p.z);
        const t=ray.origin.distanceTo(aimBody),r=.45*size+.3;
        if(t<bestT&&ray.distanceSqToPoint(aimBody)<r*r){bestT=t;best={x:p.x,z:p.z,y:aimBody.y,target:c};}
      }
    }
    if(!best){
      // Down the ray in half-metre steps from well above the highest ground about, then halve onto the crossing.
      const top=player.position.y+14;let t=(ray.origin.y-top)/-ray.direction.y,prev=t;
      if(!(t>0))return null;
      for(let i=0;i<400;i++){ray.at(t,aimStep);if(aimStep.y<=broodGround(aimStep.x,aimStep.z))break;prev=t;t+=.5/Math.max(.2,-ray.direction.y);}
      let lo=prev,hi=t;for(let i=0;i<12;i++){const mid=(lo+hi)/2;ray.at(mid,aimStep);if(aimStep.y<=broodGround(aimStep.x,aimStep.z))hi=mid;else lo=mid;}
      ray.at(hi,aimStep);best={x:aimStep.x,z:aimStep.z,y:broodGround(aimStep.x,aimStep.z)+AIM_HEIGHT,ground:true};
    }
    const from=player.position.y+AIM_HEIGHT,run=Math.hypot(best.x-player.position.x,best.z-player.position.z);
    best.pitch=THREE.MathUtils.clamp(Math.atan2(best.y-from,Math.max(.5,run)),-.7,.7);
    return best;
  }
  /** The floor point under the cursor (cave-local underground), with the height and pitch to shoot at on the surface. */
  function aim(clientX,clientY){
    const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return null;
    if(state.player.cave==null){
      pointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
      const at=aimOnSurface();
      if(!at){aimPlane.constant=-player.position.y;if(!raycaster.ray.intersectPlane(aimPlane,hit))return null;combat?.setAim({x:hit.x,z:hit.z,y:player.position.y+AIM_HEIGHT-surfaceFx.position.y,pitch:0});return {x:hit.x,z:hit.z};}
      combat?.setAim({x:at.x,z:at.z,y:at.y-surfaceFx.position.y,pitch:at.pitch,ground:broodGround(at.x,at.z)-surfaceFx.position.y});
      return {x:at.x,z:at.z,y:at.y,pitch:at.pitch,target:at.target??null};
    }
    if(!caveView)return null;
    pointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
    aimPlane.constant=-caveView.root.position.y;if(!raycaster.ray.intersectPlane(aimPlane,hit))return null;
    const local=caveView.root.worldToLocal(hit.clone());combat?.setAim(local);return {x:local.x,z:local.z};
  }
  function update(next,dt,renderPose=next.player,encounter=null,hunt=null){
    state=next;encounterState=encounter;
    if(lastSeed!==state.seed){terrainView.dispose();terrainView=createTerrainView(state.seed,terrainRoot,models);lastSeed=state.seed;drapeGrid();caveViews.forEach(v=>v.dispose());caveViews.clear();caveView=null;activeCave=null;}
    terrainView.update(state.buildings,footprint,state.player);
    const underground=state.player.cave!=null;
    // Caves are built and their shaders compiled while the player walks up, so the threshold costs nothing.
    const zone=state.player.zone??0,placeKey=underground?`${state.player.cave}:${zone}`:null;
    if(!underground)terrainData(state.seed).caves.forEach((c,id)=>{if(Math.hypot(state.player.x-c.x,state.player.z-c.z)<34)caveViewFor(id,0);});
    else{
      // The same for the zones above and below, once the player nears the shaft that leads there.
      const here=caveLayout(state.seed,state.player.cave,zone),near=s=>s&&Math.hypot(state.player.x-s.x*2,state.player.z-s.z*2)<24;
      if(near(here.down))caveViewFor(state.player.cave,zone+1);
      if(near(here.up))caveViewFor(state.player.cave,zone-1);
    }
    if(activeCave!==placeKey||underground&&!caveView){
      if(caveView)caveView.root.visible=false;caveView=null;activeCave=placeKey;
      if(underground){
        caveView=caveViewFor(state.player.cave,zone);caveView.root.visible=true;const origin=caveOrigin(state.seed,state.player.cave);
        // Only the upper zone lies under the hill; deeper zones need no roof cut away.
        if(zone===0)terrainView.setCaveCutaway(caveView.roofMap,origin,origin.angle);else terrainView.setCaveCutaway(null);
      }else terrainView.setCaveCutaway(null);
    }
    terrainRoot.visible=true;grid.visible=!underground;statusLayer.hidden=underground;
    padLight.visible=true;marker.visible=!underground;
    document.body.dataset.region=underground?'cave':'surface';
    canvas.dataset.caveId=String(state.player.cave??'');canvas.dataset.seed=String(state.seed);canvas.dataset.viewHeight=String(viewHeight);
    canvas.dataset.playerX=state.player.x.toFixed(2);canvas.dataset.playerZ=state.player.z.toFixed(2);
    const phase=(state.time/240*Math.PI*2+Math.PI/3)%(Math.PI*2),daylight=Math.max(0,Math.sin(phase));
    // The sun crosses the sky through the day, swinging 70° either side of its noon bearing, so shadows sweep round.
    const sunBearing=Math.atan2(-25,-30)+THREE.MathUtils.clamp(phase-Math.PI/2,-1.6,1.6)*.78;
    sunDir.set(Math.sin(sunBearing)*39,4+daylight*46,Math.cos(sunBearing)*39).normalize();
    // Underground the surface sinks almost to black over a second, leaving only the cave light and colony lamps.
    caveBlend+=((underground?1:0)-caveBlend)*(1-Math.exp(-Math.min(dt,.1)*3));
    const surfaceLight=1-.94*caveBlend;
    scene.environmentIntensity=(.01+daylight*.29)*surfaceLight;
    sun.intensity=(.05+(1-(1-daylight)**2)*3.75)*surfaceLight;fill.intensity=(.1+daylight*.55)*surfaceLight;
    suitFill.intensity=2+(1-daylight)*3;headlamp.intensity=8+(1-daylight)*62;padLight.intensity=state.power.powered===false?0:(5+(1-daylight)*22)*surfaceLight;
    for(const m of padLamps)m.emissiveIntensity=state.power.powered===false?0:m.userData.baseEmission;
    sun.position.copy(sunDir).multiplyScalar(70).add(follow);sun.target.position.set(follow.x,0,follow.z);sun.target.updateMatrixWorld();
    scene.background.setRGB((.01+daylight*.05)*surfaceLight,(.016+daylight*.072)*surfaceLight,(.03+daylight*.11)*surfaceLight);scene.fog.color.copy(scene.background);
    scene.fog.density=.0012;suitFill.distance=underground?6:8;headlamp.distance=underground?20:18;
    if(underground){suitFill.intensity=9;headlamp.intensity=145;}
    const position=underground?caveToWorld(state.seed,state.player.cave,renderPose.x,renderPose.z,zone):{x:renderPose.x,y:habitatView.floorAt(state,renderPose.x,renderPose.z)??heightAt(state.seed,renderPose.x,renderPose.z),z:renderPose.z};
    if(smoothedGround==null||Math.abs(position.y-smoothedGround)>2)smoothedGround=position.y;
    else smoothedGround+=(position.y-smoothedGround)*(1-Math.exp(-Math.min(dt,.1)*24));
    player.position.set(position.x,smoothedGround+(renderPose.y||0),position.z);
    if(underground||habitatView.floorAt(state,renderPose.x,renderPose.z)!=null)groundMarks.walk.reset();else groundMarks.walk(state.seed,position.x,position.z);
    player.rotation.y=(renderPose.facing||0)+(underground?caveOrigin(state.seed,state.player.cave).angle:0);
    if(suitUnderground!==underground){suitMaterials.forEach(({material,color,environment})=>{material.color.copy(color).multiplyScalar(underground?.3:1);material.envMapIntensity=underground?.05:environment;});suitUnderground=underground;}
    const hunting=hunt&&combat&&(underground?!!caveView:hunt.drawn);
    if(hunting)combat.enter(underground?caveView:surfaceSpace,state);else combat?.leave();
    actor?.update(hunting?combat.pose(state,renderPose,hunt,dt):renderPose.animation==='roll'?{...renderPose,rate:actor.duration('roll')/DODGE.time}:renderPose,dt);
    if(hunting)combat.after(state,hunt,dt);
    if(canvas.dataset.animation!==renderPose.animation)canvas.dataset.animation=renderPose.animation||'idle';
    const ids=new Set(state.buildings.map(b=>b.id));for(const [id,o] of structures)if(!ids.has(id)){buildFx.clear(o);scene.remove(o.root,o.ports);o.ownedMaterials?.forEach(m=>m.dispose());o.tread?.dispose();structures.delete(id);}
    const turns=beltTurns(state),slopes=beltSlopes(state,turns,(x,z)=>heightAt(state.seed,x,z)),obstructs=b=>Math.hypot(b.x*2-state.player.x,b.z*2-state.player.z)<8&&playerObstructs(state,b);
    habitatView.update(state,dt,{player:renderPose,powered:state.power.powered!==false,obstructs});
    const bedCells=new Set(state.buildings.filter(b=>b.type==='growbed').map(b=>`${b.x},${b.z}`));
    for(const b of state.buildings){
      let o=structures.get(b.id);const turn=b.type==='conveyor'?turns.get(b.id)??0:0;
      if(o&&(o.type!==b.type||o.rotation!==b.rotation||o.turn!==turn)){buildFx.clear(o);scene.remove(o.root,o.ports);o.ownedMaterials.forEach(m=>m.dispose());o.tread?.dispose();structures.delete(b.id);o=null;}
      if(!o){o=buildModel(b.type,turn);o.type=b.type;o.rotation=b.rotation;o.turn=turn;o.ports=new THREE.Group();portArrows(o.ports,b);o.ports.visible=portsShown;scene.add(o.ports);o.ownedMaterials=[];const clones=new Map();o.root.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;const copy=m=>{if(!clones.has(m.uuid)){const c=m.clone();c.userData.baseEmission=c.emissiveIntensity;c.userData.baseColor=c.color.clone();c.userData.baseEmissive=c.emissive.clone();clones.set(m.uuid,c);o.ownedMaterials.push(c);o.tread??=ownTread(c,tread);}return clones.get(m.uuid);};n.material=Array.isArray(n.material)?n.material.map(copy):copy(n.material);}});o.statusHeight??=new THREE.Box3().setFromObject(o.root).max.y;o.lamp=lamps.attach(o.root,b.type);structures.set(b.id,o);scene.add(o.root);}
      o.root.visible=true;
      const def=DEFS[b.type],w=b.rotation%2?def.d:def.w,d=b.rotation%2?def.w:def.d;
      const bx=(b.x+(w-1)/2)*2,bz=(b.z+(d-1)/2)*2;
      o.root.position.set(bx,(def.layer==='interior'&&habitatView.floorAt(state,bx,bz))||heightAt(state.seed,bx,bz),bz);o.root.rotation.y=b.rotation*Math.PI/2;
      if(b.type==='conveyor')tiltBelt(o.root,b,slopes.get(b.id),turn);
      if(o.trayShape){o.trayShape.tray.rotation.y=-b.rotation*Math.PI/2;o.trayShape.setJoined((dx,dz)=>bedCells.has(`${b.x+dx},${b.z+dz}`));}
      if(o.plants){o.plants.visible=b.built&&(b.grow>0||b.watered);o.plants.scale.setScalar(.2+.8*(b.grow??0));}
      if(o.crops){
        if(o.cropKind!==b.crop&&b.crop&&itemModels?.get(b.crop)){
          o.crops.clear();o.cropKind=b.crop;
          for(const [x,y,z,size] of RIPE_SPOTS[b.type]){const crop=itemModels.create(b.crop,size);crop.position.set(x,y,z);crop.rotation.y=x*3+z;o.crops.add(crop);}
        }
        o.crops.visible=b.built&&b.grow>=1;
      }
      if(o.tray)o.tray.visible=b.built&&Object.values(b.ready??{}).some(n=>n>0);
      if(b.type==='storage')showCrateGoods(o,b);
      if(o.level&&b.type==='goovat')o.level.scale.y=Math.max(.02,b.seeded||b.stock?(Math.max(b.stock,.6)+b.work)/(GOO.cap+1):.02);
      // Blueprints turn red while the player stands where the finished structure would trap them.
      const blocked=!b.built&&!isRoom(b)&&obstructs(b);
      if(o.built!==b.built||o.blocked!==blocked){o.ownedMaterials.forEach(m=>{m.transparent=!b.built;m.opacity=b.built?1:blocked?.6:.5;m.depthWrite=b.built;m.color.copy(b.built?m.userData.baseColor:blueprintColor[blocked?1:0]);m.emissive.copy(b.built?m.userData.baseEmissive:blueprintEmissive[blocked?1:0]);m.emissiveIntensity=b.built?m.userData.baseEmission:.85;});o.root.traverse(n=>{if(n.isMesh)n.castShadow=b.built;});if(b.built&&o.built===false)buildFx.finish(o);o.built=b.built;o.blocked=blocked;}
      buildFx.track(o,b,dt,booted&&!o.seen);o.seen=true;
      // Screens, windows and work lamps on every finished structure run off the grid and go dark with it.
      const lit=state.power.powered!==false;
      if(b.built&&o.lit!==lit){o.ownedMaterials.forEach(m=>{m.emissiveIntensity=(m.userData.baseEmission||0)*(lit?1:0);});o.lit=lit;}
      else if(!b.built)o.lit=null;
      if(o.panel&&b.built){
        // Trackers turn to face the sun by day and lie flat for the night. Tilt stops short of the sun's angle: any
        // steeper and the camera, which looks from the far side of the sky, would see the array edge-on.
        const up=daylight>.02,yaw=up?Math.atan2(sunDir.x,sunDir.z)-b.rotation*Math.PI/2:o.panel.rotation.y,tilt=up?Math.min(.32,Math.PI/2-Math.asin(sunDir.y)):0,k=1-Math.exp(-dt*1.2);
        o.panel.rotation.order='YXZ';o.panel.rotation.y+=Math.atan2(Math.sin(yaw-o.panel.rotation.y),Math.cos(yaw-o.panel.rotation.y))*k;o.panel.rotation.x+=(tilt-o.panel.rotation.x)*k;
      }
      if(o.tread){
        // The tread runs with the items: it halts in a blackout and when the load in front is backed up.
        const items=b.items??[],sum=items.reduce((s,i)=>s+i.p,0)+items.length*7;o.beltIdle=sum!==o.beltSum||!items.length?0:(o.beltIdle??0)+dt;o.beltSum=sum;
        const target=b.built&&state.power.powered!==false&&dt>0&&o.beltIdle<.25?BELT_SPEED:0;o.beltSpeed=(o.beltSpeed??0)+(target-(o.beltSpeed??0))*Math.min(1,dt*8);
        o.tread.offset.y=(o.tread.offset.y+o.beltSpeed*dt)%1;
      }
      if(o.heater&&b.built){
        const on=(b.type==='processor'?processorReady(b):melterReady(state,b))&&state.power.powered!==false?1:0;o.heat=(o.heat??0)+(on-(o.heat??0))*Math.min(1,dt*(on?1.5:3));
        o.heater.traverse(n=>{if(n.isMesh)n.material.emissiveIntensity=(n.material.userData.baseEmission||0)*o.heat*(.85+.15*Math.sin(state.time*9+b.id));});
      }
      if(o.kiln&&b.built){
        // The kiln spins up while it has a charge to roast and hums the whole skid; the feed mound shows what's queued.
        const on=processorReady(b)&&state.power.powered!==false?1:0;o.spin=(o.spin??0)+(on-(o.spin??0))*Math.min(1,dt*.8);
        o.kiln.rotation.z-=dt*1.4*o.spin;o.root.position.y+=Math.sin(state.time*47+b.id)*.008*o.spin;
        if(o.fill){const f=Math.min(1,b.inv.regolith/PROCESSOR_INPUT_CAP);o.fill.visible=f>0;o.fill.scale.set(.6+.4*f,Math.max(.05,f),.6+.4*f);}
      }
    }
    if(!underground)raidFx.update(state,structures,camera,renderer.domElement.height,dt);
    expedition.update(state,dt);iceView.update(state);updateEncounter(dt,underground);
    lampClock+=dt;lamps.update(lampClock,daylight,updateLights(daylight,dt));
    productionView.update(state,dt,daylight);androidView?.update(state,dt);for(const [id,view] of productionView.rovers)if(view.display)groundMarks.drive(state.seed,id,view.display.x,view.display.z,.73);groundMarks.update();logistics.update(state.player.cave==null?storageCrates(state).map(crateCentre):[],logisticsShown,dt);buildFx.update(dt);portLinks.update(state,structures,dt,state.time);groundPads.update(state,padBase);pipes.update(state);
    updateShip(dt,daylight);
    follow.set(player.position.x,player.position.y+1.05,player.position.z);
    if(hunting&&combat.shake){follow.x+=(Math.random()-.5)*combat.shake;follow.z+=(Math.random()-.5)*combat.shake;}
    if(!underground&&surfaceBurrows.shake){const k=surfaceBurrows.shake*.35;follow.x+=(Math.random()-.5)*k;follow.y+=(Math.random()-.5)*k;follow.z+=(Math.random()-.5)*k;}
    if(!underground&&raidFx.shake){const k=raidFx.shake*.4;follow.x+=(Math.random()-.5)*k;follow.y+=(Math.random()-.5)*k;follow.z+=(Math.random()-.5)*k;}
    if(encounterState?.phase==='shriek'){const k=.12*Math.max(0,1-encounterState.t);follow.x+=(Math.random()-.5)*k;follow.z+=(Math.random()-.5)*k;}
    const cameraDistance=4;camera.position.set(follow.x+26*cameraDistance,follow.y+34*cameraDistance,follow.z+26*cameraDistance);camera.lookAt(follow);camera.updateMatrixWorld();
    updateSurfaceHunt(dt,underground);
    if(underground){caveView.update(state,dt);if(hunting)combat.light(state,hunt,dt);}else updateStatuses();
    headlamp.update();
    if((shadowClock+=dt)>.5){shadowClock=0;trimShadows(scene);}
    lightBudget.update(follow);resolution.update(dt);
    renderer.render(scene,camera);booted=true;canvas.dataset.pixelRatio=String(resolution.ratio);canvas.dataset.lights=String(lightBudget.lit);canvas.dataset.drawCalls=String(renderer.info.render.calls);canvas.dataset.triangles=String(renderer.info.render.triangles);
  }
  function caveViewFor(id,zone){
    const key=`${id}:${zone}`;let view=caveViews.get(key);if(view)return view;
    view=createCaveView(state.seed,id,scene,zone,itemModels);const origin=caveOrigin(state.seed,id,zone);
    view.root.position.set(origin.x,origin.y,origin.z);view.root.rotation.y=origin.angle;
    // compile() skips hidden objects, so the cave is visible only for the duration of this call.
    renderer.compileAsync(view.root,camera,scene).catch(()=>{});view.root.visible=false;
    caveViews.set(key,view);return view;
  }
  function dispose(){disposed=true;logistics.dispose();buildFx.dispose();portLinks.dispose();pipes.dispose();iceView.dispose();groundPads.dispose();groundMarks.dispose();headlamp.dispose();meetView?.dispose();gooView.dispose();broodViews.forEach(v=>v.dispose());surfaceBurrows.dispose();raidFx.dispose();surfaceFx.removeFromParent();lamps.dispose();alarmView.dispose();caveViews.forEach(v=>v.dispose());vignette.remove();expedition.dispose();productionView.dispose();androidView?.dispose();habitatView.dispose();statusLayer.remove();terrainView.dispose();grid.geometry.dispose();grid.material.dispose();combat?.dispose();actor?.dispose();reflection.dispose();canvas.removeEventListener('wheel',zoom);for(const o of structures.values()){o.ownedMaterials?.forEach(m=>m.dispose());scene.remove(o.ports);}geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());itemModels?.dispose();renderer.dispose();}
  resize();update(initialState,1);
  return {renderer,scene,camera,actor,update,pick,aim,raided:events=>raidFx.apply(events,state,structures,state.player),setGhost,clearGhost,setLogistics:shown=>{logisticsShown=shown;},setZones:shown=>productionView.setZones(shown),setPorts,resize,dispose};
}
