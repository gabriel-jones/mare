import { caveOrigin,caveToWorld } from './cave-space.js';
import { createCaveView } from './cave-view.js';
import { caveLayout } from './caves.js';
import { buildingStatus, robotStatus, shipStatus, lampLevel } from './building-status.js';
import { LAUNCH } from './space.js';
import { DIRS, ports as machinePorts } from './defs.js';
import { MINING_RADIUS, beltTurns, total, MELT } from './production.js';
import { createStatusLamps } from './status-lamps.js';
import { createProductionView } from './production-view.js';
import { loadItemLibrary } from './item-models.js';
import { createHabitatView } from './habitat-view.js';
import { airlockOf, habitatLayout, isRoom } from './habitat.js';
import { surfaceHeightAt as heightAt, terrainData } from './terrain.js';
import { melterReady } from './production.js';
import { createExpeditionView } from './expedition-view.js';
import { createTerrainView } from './terrain-view.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFS, footprint, playerObstructs } from './sim.js';
import { createAstronaut } from './actor.js';
import { createCombatView } from './combat-view.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Presentation only: the simulation owns all positions, resources, and time.
/** Where each grower shows its ripe crop: [x, y, z, size] in the model's space. */
const RIPE_SPOTS={
  growbed:[[-.42,.51,.4,.42],[.42,.51,.4,.42]],
  hydrorack:[[-.45,1.62,.2,.3],[.42,1.62,-.25,.3],[0,1.06,.3,.28]],
  verticalfarm:[[-.4,1.7,1.2,.42],[.35,1.7,.2,.42],[-.2,1.7,-.9,.42],[.3,1.7,-1.5,.38]],
  mushroomtray:[[-.4,.86,.1,.32],[.42,.86,-.35,.32]],
};
export async function createWorld(canvas, initialState) {
  const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  const loader=new GLTFLoader();
  const assetNames=['starship','launchpad','solar','battery','hopper','habitat-kit','conveyor','conveyor-corner','processor','storage','growbed','hydrorack','verticalfarm','mushroomtray','mill','galley','recycler','melter','fabricator','assembler','electrolyser','tank','dock','roverbay','xenolab','reactor','lander','rover','hauler','rock-a','rock-b','rock-c','cave-mouth'];
  const [loaded,itemModels]=await Promise.all([
    Promise.all(assetNames.map(name=>loader.loadAsync(`./assets/${name}.glb`).then(g=>[name,g.scene]).catch(e=>{console.error('Asset failed:',name,e);return [name,null];}))),
    loadItemLibrary(loader),
  ]);
  const models=new Map(loaded);
  const lamps=createStatusLamps();for(const model of models.values())if(model)lamps.prepare(model);let lampClock=0;
  const [astronautGLTF,crawlerGLTF]=await Promise.all([
    loader.loadAsync('./assets/astronaut-v3.glb').catch(e=>{console.error('Animated astronaut failed',e);return null;}),
    loader.loadAsync('./assets/crawler.glb').catch(e=>{console.error('Crawler failed',e);return null;}),
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
  const sun=new THREE.DirectionalLight('#ffe4bc',3.0);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-40,right:40,top:40,bottom:-40,near:1,far:150});
  sun.shadow.normalBias=.12;sun.shadow.bias=.00005;
  scene.add(sun,sun.target);
  const fill=new THREE.HemisphereLight('#b3cbed','#272a3d',1.15);scene.add(fill);
  const terrainRoot=new THREE.Group();scene.add(terrainRoot);
  const productionView=createProductionView(scene,models,itemModels);
  const habitatView=createHabitatView(scene,models.get('habitat-kit'));
  // A fixed set of lights follows the nearest machines and habitats; every machine carries a work light. Adding a light per structure
  // would change the scene's light count and force every material to recompile its shader.
  const lightPool=Array.from({length:6},()=>{const l=new THREE.PointLight('#ffc777',0,13,2);scene.add(l);return l;});
  function updateLights(daylight){
    const candidates=[];
    if(state.power.powered!==false){
      for(const b of state.buildings){
        const p=b.built&&b.type!=='conveyor'&&!DEFS[b.type].layer&&structures.get(b.id)?.root.position;
        if(p)candidates.push({x:p.x,y:p.y+2.6,z:p.z,intensity:(1-daylight)*9,distance:8,color:0xffc777});
      }
      for(const l of habitatView.lights())candidates.push({...l,intensity:(1-daylight)*(l.greenhouse?7:10),distance:7,color:l.greenhouse?0xffb0dc:0xffcf8c});
    }
    for(const c of candidates)c.d=Math.hypot(c.x-follow.x,c.z-follow.z);
    candidates.sort((a,b)=>a.d-b.d);
    lightPool.forEach((l,i)=>{const c=candidates[i];if(!c||c.intensity<=0){l.intensity=0;return;}l.position.set(c.x,c.y,c.z);l.intensity=c.intensity;l.distance=c.distance;l.color.setHex(c.color);});
  }
  let caveView=null,activeCave=null,smoothedGround=null,caveBlend=0;const caveViews=new Map();
  const vignette=document.createElement('div');vignette.className='cave-vignette';document.body.append(vignette);

  const structures=new Map();
  const statusLayer=document.createElement('div');statusLayer.className='building-status-layer';statusLayer.setAttribute('aria-label','Building status');document.body.append(statusLayer);
  const statusLabels=new Map(),statusPoint=new THREE.Vector3();
  // Drives a machine's lamp, battery cells and sight glass from its status.
  function driveLamp(o,b,status){
    if(!o.lamp)return;
    const level=b.built?lampLevel(status):'off';o.lamp.set(level,b.built);
    if(b.type==='battery')o.lamp.cells(b.built?status?.fill??0:0,level);
    if(b.type==='melter')o.lamp.fill(b.built?(b.inv?.ice??0)/MELT.cap:0,'water');
    if(b.type==='tank')o.lamp.fill(b.built?(b.fuel??0)/DEFS.tank.capacity:0,'fuel');
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
      const view=productionView.rovers.get(r.id),status=view?robotStatus(r,state):null;
      if(view){view.lamp??=lamps.attach(view.model);view.lamp?.set(lampLevel(status));}
      entries.push({key:`robot-${r.id}`,status,anchor:view?.root,height:1.9,name:r.kind==='hauler'?'Hauler':'Mining rover'});
    }
    if(starship)entries.push({key:'ship',status:shipStatus(state),anchor:starship,height:13.4,name:'Starship'});
    const live=new Set(entries.map(e=>e.key));
    for(const [id,label] of statusLabels)if(!live.has(id)){label.remove();statusLabels.delete(id);}
    const rect=canvas.getBoundingClientRect(),placed=[];
    // Glyphs only for faults, charging and blueprints; the lamps on each machine carry every other state.
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
  const PAD_DECK=.34;
  for(const name of ['launchpad','starship']){
    const imported=models.get(name);
    if(imported){imported.position.set(0,name==='starship'?PAD_DECK:0,-10);imported.traverse(o=>{if(o.isMesh){o.castShadow=name==='starship';o.receiveShadow=true;}});scene.add(imported);}
  }
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
  function updateShip(dt){
    if(!starship)return;
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
  const padLight=new THREE.PointLight('#ffc584',18,23,2);padLight.position.set(0,3,-10);scene.add(padLight);
  const player=new THREE.Group();scene.add(player);
  const suitFill=new THREE.PointLight('#bddaff',7,8,2);suitFill.position.set(0,2,0);player.add(suitFill);
  const headlamp=new THREE.SpotLight('#cfe8ff',45,18,.52,.65,1.5);headlamp.position.set(0,1.55,.25);
  const headlampTarget=new THREE.Object3D();headlampTarget.position.set(0,.1,9);player.add(headlampTarget);headlamp.target=headlampTarget;player.add(headlamp);
  let actor=null;
  if(astronautGLTF){actor=createAstronaut(astronautGLTF);player.add(actor.root);}
  else{box(player,orange,0,.8,0,.65,.8,.45);mesh(sphereGeo,ivory,player,0,1.5,0,.42,.42,.42);}
  const combat=actor&&crawlerGLTF?createCombatView({actor,player,headlamp,crawlerGLTF}):null;
  const suitMaterials=[];actor?.root.traverse(o=>{if(o.isMesh)for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(!suitMaterials.some(x=>x.material===m))suitMaterials.push({material:m,color:m.color.clone(),environment:m.envMapIntensity});});let suitUnderground=false;
  document.body.dataset.characterClips=actor?.clips.join(',')||'unavailable';
  const markerGeo=new THREE.RingGeometry(.58,.66,32);geometries.add(markerGeo);const marker=mesh(markerGeo,mat('#ffbf6c',{emissive:'#a66624',emissiveIntensity:.35}),player,0,.025,0);marker.rotation.x=-Math.PI/2;
  function buildModel(type,turn=0){
    // Room squares are assembled per connected room by the habitat view; this is only a label anchor.
    if(DEFS[type].layer==='floor')return {root:new THREE.Group(),roof:null,emits:false,statusHeight:2.45};
    const template=models.get(type==='conveyor'&&turn?'conveyor-corner':type);
    if(template){
      const root=template.clone(true),part=name=>{let found=null;root.traverse(n=>{if(!found&&n.name.replace(/\.?\d{3}$/,'')===name)found=n;});return found;};
      if(type==='conveyor'&&turn<0)root.scale.x=-1;
      const oldTray=part('MealTray'),tray=itemModels&&oldTray?itemModels.replace(root,oldTray,'meal',.57):oldTray;
      // Ripe produce shows as the crop's own item model, laid where each grower holds it.
      const crops=RIPE_SPOTS[type]&&itemModels?new THREE.Group():null;
      if(crops){crops.name='Ripe crop';root.add(crops);}
      return {root,roof:null,emits:DEFS[type].layer==='interior',plants:part('Plants'),crops,cropKind:null,tray,heater:part('Heater')};
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
  function portArrows(parent,b,preview=false){
    const look=preview?previewArrows:arrows,scale=preview?1.3:.8,lift=preview?.3:.12;
    if(preview&&DEFS[b.type].airlock){const a=airlockOf(b),[dx,dz]=DIRS[a.dir];groundArrow(parent,look.output,a.x+dx*1.1,a.z+dz*1.1,a.dir,scale,lift);}
    for(const p of machinePorts(b,'inputs'))if(b.type!=='storage')groundArrow(parent,look.input,(p.cell.x+p.neighbor.x),(p.cell.z+p.neighbor.z),(p.dir+2)%4,scale,lift);
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
  const expedition=createExpeditionView(scene,models,itemModels);let watcherState=null;
  const aimPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  /** The cave-local floor point under the cursor, or null on the surface. */
  function aim(clientX,clientY){
    if(state.player.cave==null||!caveView)return null;const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return null;
    pointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
    aimPlane.constant=-caveView.root.position.y;if(!raycaster.ray.intersectPlane(aimPlane,hit))return null;
    const local=caveView.root.worldToLocal(hit.clone());combat?.setAim(local);return {x:local.x,z:local.z};
  }
  function update(next,dt,renderPose=next.player,watcher=null,hunt=null){
    state=next;watcherState=watcher;
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
    const daylight=Math.max(0,Math.sin(state.time/240*Math.PI*2+Math.PI/3));
    // Underground the surface sinks almost to black over a second, leaving only the cave light and colony lamps.
    caveBlend+=((underground?1:0)-caveBlend)*(1-Math.exp(-Math.min(dt,.1)*3));
    const surfaceLight=1-.94*caveBlend;
    scene.environmentIntensity=(.035+daylight*.265)*surfaceLight;
    sun.intensity=(.18+daylight*3.1)*surfaceLight;fill.intensity=(.5+daylight*.7)*surfaceLight;
    suitFill.intensity=2+(1-daylight)*5;headlamp.intensity=8+(1-daylight)*37;padLight.intensity=(5+(1-daylight)*18)*surfaceLight;
    sun.position.set(follow.x-25,12+daylight*38,follow.z-30);sun.target.position.set(follow.x,0,follow.z);sun.target.updateMatrixWorld();
    scene.background.setRGB((.025+daylight*.035)*surfaceLight,(.038+daylight*.05)*surfaceLight,(.065+daylight*.075)*surfaceLight);scene.fog.color.copy(scene.background);
    scene.fog.density=.0012;suitFill.distance=underground?6:8;headlamp.distance=underground?20:18;
    if(underground){suitFill.intensity=9;headlamp.intensity=145;}
    const position=underground?caveToWorld(state.seed,state.player.cave,renderPose.x,renderPose.z,zone):{x:renderPose.x,y:habitatView.floorAt(state,renderPose.x,renderPose.z)??heightAt(state.seed,renderPose.x,renderPose.z),z:renderPose.z};
    if(smoothedGround==null||Math.abs(position.y-smoothedGround)>2)smoothedGround=position.y;
    else smoothedGround+=(position.y-smoothedGround)*(1-Math.exp(-Math.min(dt,.1)*24));
    player.position.set(position.x,smoothedGround+(renderPose.y||0),position.z);
    player.rotation.y=(renderPose.facing||0)+(underground?caveOrigin(state.seed,state.player.cave).angle:0);
    if(suitUnderground!==underground){suitMaterials.forEach(({material,color,environment})=>{material.color.copy(color).multiplyScalar(underground?.3:1);material.envMapIntensity=underground?.05:environment;});suitUnderground=underground;}
    const hunting=underground&&hunt&&combat;
    if(hunting)combat.enter(caveView,state);else combat?.leave();
    actor?.update(hunting?combat.pose(state,renderPose,hunt,dt):renderPose,dt);
    if(hunting)combat.after(state,hunt,dt);
    if(canvas.dataset.animation!==renderPose.animation)canvas.dataset.animation=renderPose.animation||'idle';
    const ids=new Set(state.buildings.map(b=>b.id));for(const [id,o] of structures)if(!ids.has(id)){scene.remove(o.root,o.ports);o.ownedMaterials?.forEach(m=>m.dispose());structures.delete(id);}
    const turns=beltTurns(state),obstructs=b=>Math.hypot(b.x*2-state.player.x,b.z*2-state.player.z)<8&&playerObstructs(state,b);
    habitatView.update(state,dt,{player:renderPose,powered:state.power.powered!==false,obstructs});
    for(const b of state.buildings){
      let o=structures.get(b.id);const turn=b.type==='conveyor'?turns.get(b.id)??0:0;
      if(o&&(o.type!==b.type||o.rotation!==b.rotation||o.turn!==turn)){scene.remove(o.root,o.ports);o.ownedMaterials.forEach(m=>m.dispose());structures.delete(b.id);o=null;}
      if(!o){o=buildModel(b.type,turn);o.type=b.type;o.rotation=b.rotation;o.turn=turn;o.ports=new THREE.Group();portArrows(o.ports,b);scene.add(o.ports);o.ownedMaterials=[];const clones=new Map();o.root.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;const copy=m=>{if(!clones.has(m.uuid)){const c=m.clone();c.userData.baseEmission=c.emissiveIntensity;c.userData.baseColor=c.color.clone();c.userData.baseEmissive=c.emissive.clone();clones.set(m.uuid,c);o.ownedMaterials.push(c);}return clones.get(m.uuid);};n.material=Array.isArray(n.material)?n.material.map(copy):copy(n.material);}});o.statusHeight??=new THREE.Box3().setFromObject(o.root).max.y;o.lamp=lamps.attach(o.root);structures.set(b.id,o);scene.add(o.root);}
      o.root.visible=true;
      const def=DEFS[b.type],w=b.rotation%2?def.d:def.w,d=b.rotation%2?def.w:def.d;
      const bx=(b.x+(w-1)/2)*2,bz=(b.z+(d-1)/2)*2;
      o.root.position.set(bx,(def.layer==='interior'&&habitatView.floorAt(state,bx,bz))||heightAt(state.seed,bx,bz),bz);o.root.rotation.y=b.rotation*Math.PI/2;
      if(o.plants){o.plants.visible=b.built&&(b.grow>0||b.watered);o.plants.scale.setScalar(.2+.8*(b.grow??0));}
      if(o.crops){
        if(o.cropKind!==b.crop&&b.crop&&itemModels?.get(b.crop)){
          o.crops.clear();o.cropKind=b.crop;
          for(const [x,y,z,size] of RIPE_SPOTS[b.type]){const crop=itemModels.create(b.crop,size);crop.position.set(x,y,z);crop.rotation.y=x*3+z;o.crops.add(crop);}
        }
        o.crops.visible=b.built&&b.grow>=1;
      }
      if(o.tray)o.tray.visible=b.built&&Object.values(b.ready??{}).some(n=>n>0);
      // Blueprints turn red while the player stands where the finished structure would trap them.
      const blocked=!b.built&&!isRoom(b)&&obstructs(b);
      if(o.built!==b.built||o.blocked!==blocked){o.ownedMaterials.forEach(m=>{m.transparent=!b.built;m.opacity=b.built?1:blocked?.6:.5;m.depthWrite=b.built;m.color.copy(b.built?m.userData.baseColor:blueprintColor[blocked?1:0]);m.emissive.copy(b.built?m.userData.baseEmissive:blueprintEmissive[blocked?1:0]);m.emissiveIntensity=b.built?m.userData.baseEmission:.85;});o.root.traverse(n=>{if(n.isMesh)n.castShadow=b.built;});o.built=b.built;o.blocked=blocked;}
      if(!b.built)o.root.scale.y=.35+.65*(b.progress||0);
      else o.root.scale.y=1;
      if(o.emits){const powered=b.built&&state.power.powered!==false;o.ownedMaterials.forEach(m=>{m.emissiveIntensity=b.built?(m.userData.baseEmission||0)*(powered?1:0):.85;});}
      if(o.heater&&b.built){const glow=melterReady(state,b)&&state.power.powered!==false?1:0;o.heater.traverse(n=>{if(n.isMesh)n.material.emissiveIntensity=(n.material.userData.baseEmission||0)*glow;});}
    }
    expedition.update(state,dt,watcherState);
    lampClock+=dt;lamps.update(lampClock,daylight);
    updateLights(daylight);
    productionView.update(state,dt,daylight);
    updateShip(dt);
    follow.set(player.position.x,player.position.y+1.05,player.position.z);
    if(hunting&&combat.shake){follow.x+=(Math.random()-.5)*combat.shake;follow.z+=(Math.random()-.5)*combat.shake;}
    const cameraDistance=4;camera.position.set(follow.x+26*cameraDistance,follow.y+34*cameraDistance,follow.z+26*cameraDistance);camera.lookAt(follow);camera.updateMatrixWorld();
    if(underground){caveView.update(state,dt);if(hunting)combat.light(state,hunt,dt);}else updateStatuses();
    renderer.render(scene,camera);canvas.dataset.drawCalls=String(renderer.info.render.calls);canvas.dataset.triangles=String(renderer.info.render.triangles);
  }
  function caveViewFor(id,zone){
    const key=`${id}:${zone}`;let view=caveViews.get(key);if(view)return view;
    view=createCaveView(state.seed,id,scene,zone,itemModels);const origin=caveOrigin(state.seed,id,zone);
    view.root.position.set(origin.x,origin.y,origin.z);view.root.rotation.y=origin.angle;
    // compile() skips hidden objects, so the cave is visible only for the duration of this call.
    renderer.compileAsync(view.root,camera,scene).catch(()=>{});view.root.visible=false;
    caveViews.set(key,view);return view;
  }
  function dispose(){disposed=true;lamps.dispose();caveViews.forEach(v=>v.dispose());vignette.remove();expedition.dispose();productionView.dispose();habitatView.dispose();statusLayer.remove();terrainView.dispose();grid.geometry.dispose();grid.material.dispose();combat?.dispose();actor?.dispose();reflection.dispose();canvas.removeEventListener('wheel',zoom);for(const o of structures.values()){o.ownedMaterials?.forEach(m=>m.dispose());scene.remove(o.ports);}geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());itemModels?.dispose();renderer.dispose();}
  resize();update(initialState,1);
  return {renderer,scene,camera,update,pick,aim,setGhost,clearGhost,resize,dispose};
}
