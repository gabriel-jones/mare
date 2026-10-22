import { caveOrigin,caveToWorld } from './cave-space.js';
import { createCaveView } from './cave-view.js';
import { buildingStatus, robotStatus } from './building-status.js';
import { DIRS, ports as machinePorts } from './defs.js';
import { MINING_RADIUS } from './production.js';
import { createProductionView } from './production-view.js';
import { surfaceHeightAt as heightAt } from './terrain.js';
import { createTerrainView } from './terrain-view.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFS, footprint } from './sim.js';
import { createAstronaut } from './actor.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Presentation only: the simulation owns all positions, resources, and time.
export async function createWorld(canvas, initialState) {
  const renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  const loader=new GLTFLoader();
  const assetNames=['starship','launchpad','solar','battery','hopper','habitat','lamp','conveyor','processor','storage','rover','rock-a','rock-b','rock-c','cave-mouth'];
  const loaded=await Promise.all(assetNames.map(name=>loader.loadAsync(`./assets/${name}.glb`).then(g=>[name,g.scene]).catch(e=>{console.error('Asset failed:',name,e);return [name,null];})));
  const models=new Map(loaded);
  const astronautGLTF=await loader.loadAsync('./assets/astronaut-v2.glb').catch(e=>{console.error('Animated astronaut failed',e);return null;});
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
  const productionView=createProductionView(scene,models);
  let caveView=null,activeCave=null,smoothedGround=null;

  const structures=new Map();
  const statusLayer=document.createElement('div');statusLayer.className='building-status-layer';statusLayer.setAttribute('aria-label','Building status');document.body.append(statusLayer);
  const statusLabels=new Map(),statusPoint=new THREE.Vector3();
  const statusIcons={battery:'<rect x="3" y="5" width="16" height="14" rx="2"/><path d="M21 9v6M7 9v6m4-6v6m4-6v6"/>',power:'<path d="m14 2-9 12h7l-2 8 9-12h-7l2-8Z"/><path d="m3 3 18 18"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',build:'<path d="m14 3 7 7-4 3-3-3-9 11-3-3L13 8l-2-2 3-3Z"/>',ore:'<path d="m4 15 5-8 4 4 3-3 4 7Z"/><path d="M3 19h18"/>',box:'<path d="M4 8 12 4l8 4v8l-8 4-8-4Z"/><path d="m4 8 8 4 8-4M12 12v8"/>',gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',rover:'<rect x="4" y="8" width="13" height="6" rx="1"/><path d="M17 11h3l1 3"/><circle cx="7" cy="17" r="2"/><circle cx="15" cy="17" r="2"/>'};
  function updateStatuses(){
    const entries=[];
    for(const b of state.buildings){const object=structures.get(b.id);entries.push({key:String(b.id),status:object?buildingStatus(b,state):null,anchor:object?.root,height:object?.statusHeight,name:DEFS[b.type].name});}
    for(const r of state.robots??[]){const view=productionView.rovers.get(r.id);entries.push({key:`robot-${r.id}`,status:view?robotStatus(r,state):null,anchor:view?.root,height:1.9,name:'Mining rover'});}
    const live=new Set(entries.map(e=>e.key));
    for(const [id,label] of statusLabels)if(!live.has(id)){label.remove();statusLabels.delete(id);}
    const rect=canvas.getBoundingClientRect(),placed=[];
    for(const {key:id,status,anchor,height,name} of entries){
      let label=statusLabels.get(id);
      if(!status||!anchor){if(label)label.hidden=true;continue;}
      if(!label){label=document.createElement('div');label.className='building-status';label.dataset.buildingId=id;label.innerHTML='<div class="status-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg><span></span><div class="status-meter"><i></i></div></div><div class="status-leader"></div>';statusLayer.append(label);statusLabels.set(id,label);}
      const key=`${status.icon}:${status.text}:${status.tone}`;
      if(label.dataset.status!==key){label.dataset.status=key;label.dataset.tone=status.tone;label.querySelector('svg').innerHTML=statusIcons[status.icon];label.querySelector('span').textContent=status.text;label.setAttribute('aria-label',`${name}: ${status.text}`);}
      const meter=label.querySelector('.status-meter');meter.hidden=status.fill==null;if(status.fill!=null)meter.firstElementChild.style.transform=`scaleX(${Math.max(0,Math.min(1,status.fill))})`;
      statusPoint.copy(anchor.position);statusPoint.y+=height+.55;statusPoint.project(camera);
      let x=rect.left+(statusPoint.x+1)*rect.width/2,y=rect.top+(1-statusPoint.y)*rect.height/2;
      label.hidden=statusPoint.z<-1||statusPoint.z>1||x<32||x>rect.right-32||y<75||y>rect.bottom-80;
      if(label.hidden)continue;
      const anchorY=y,width=status.text.length>5?106:64;
      // Stack close markers with a short leader so adjacent batteries stay legible.
      for(let pass=0;pass<placed.length+1;pass++){const overlap=placed.find(p=>Math.abs(x-p.x)<(width+p.width)/2+5&&Math.abs(y-p.y)<31);if(!overlap)break;y=overlap.y-33;}
      placed.push({x,y,width});label.style.transform=`translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-100%)`;label.style.setProperty('--leader',`${Math.max(5,anchorY-y+5)}px`);
    }
  }

  const geometries=new Set(),materials=new Set();
  const mat=(color,opts={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.82,...opts});materials.add(m);return m;};
  const ivory=mat('#d6dcd8'), dark=mat('#293544'), orange=mat('#e17a35'), steel=mat('#818d99',{metalness:.55,roughness:.45}), glass=mat('#638b99',{metalness:.4,roughness:.25}), blue=mat('#203f6b',{metalness:.3,roughness:.35}), amber=mat('#ffc36a',{emissive:'#ffb347',emissiveIntensity:1.3});
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
  for(const name of ['launchpad','starship']){
    const imported=models.get(name);
    if(imported){imported.position.set(0,0,-10);imported.traverse(o=>{if(o.isMesh){o.castShadow=name==='starship';o.receiveShadow=true;}});scene.add(imported);}
  }
  const padLight=new THREE.PointLight('#ffc584',18,23,2);padLight.position.set(0,3,-10);scene.add(padLight);
  const player=new THREE.Group();scene.add(player);
  const suitFill=new THREE.PointLight('#bddaff',7,8,2);suitFill.position.set(0,2,0);player.add(suitFill);
  const headlamp=new THREE.SpotLight('#cfe8ff',45,18,.52,.65,1.5);headlamp.position.set(0,1.55,.25);
  const headlampTarget=new THREE.Object3D();headlampTarget.position.set(0,.1,9);player.add(headlampTarget);headlamp.target=headlampTarget;player.add(headlamp);
  let actor=null;
  if(astronautGLTF){actor=createAstronaut(astronautGLTF);player.add(actor.root);}
  else{box(player,orange,0,.8,0,.65,.8,.45);mesh(sphereGeo,ivory,player,0,1.5,0,.42,.42,.42);}
  const suitMaterials=[];actor?.root.traverse(o=>{if(o.isMesh)for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(!suitMaterials.some(x=>x.material===m))suitMaterials.push({material:m,color:m.color.clone(),environment:m.envMapIntensity});});let suitUnderground=false;
  document.body.dataset.characterClips=actor?.clips.join(',')||'unavailable';
  const markerGeo=new THREE.RingGeometry(.58,.66,32);geometries.add(markerGeo);const marker=mesh(markerGeo,mat('#ffbf6c',{emissive:'#a66624',emissiveIntensity:.35}),player,0,.025,0);marker.rotation.x=-Math.PI/2;
  function buildModel(type){
    const template=models.get(type);
    if(template){
      const root=template.clone(true);let roof=null,light=null;
      root.traverse(o=>{if(/^Roof/.test(o.name)&&!roof)roof=o;});
      if(type==='lamp'||type==='habitat'){
        light=new THREE.PointLight('#ffc777',0,type==='habitat'?7:13,2);light.position.set(0,type==='habitat'?1.9:2.2,0);root.add(light);
      }
      return {root,roof,light};
    }
    const root=new THREE.Group(),w=DEFS[type].w*2,d=DEFS[type].d*2;
    box(root,dark,0,.12,0,w-.12,.24,d-.12);
    let roof=null,light=null;
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
    } else if(type==='habitat'){
      box(root,ivory,0,1.23,-d*.5+.15,w-.15,2.2,.22);
      for(const x of [-1,1]){box(root,ivory,x*(w*.5-.15),1.23,0,.22,2.2,d-.15);box(root,glass,x*(w*.5-.01),1.4,0,.04,.8,Math.max(.5,d-1));}
      const door=1.1;box(root,ivory,-(w+door)/4,1.23,d*.5-.15,(w-door)/2,2.2,.22);box(root,ivory,(w+door)/4,1.23,d*.5-.15,(w-door)/2,2.2,.22);box(root,orange,0,2.3,d*.5-.14,1.35,.18,.3);
      roof=new THREE.Group();root.add(roof);box(roof,ivory,0,2.45,0,w+.05,.25,d+.05);box(roof,steel,0,2.62,0,w*.7,.12,d*.7);box(roof,orange,0,2.7,0,.22,.03,d*.7);
      box(root,amber,0,2.2,0,.7,.06,.4);
      light=new THREE.PointLight('#ffcf8c',0,7,2);light.position.set(0,1.9,0);root.add(light);
    } else if(type==='lamp'){
      cylinder(root,steel,0,1.8,0,.09,3.4);box(root,dark,0,3.4,0,.65,.18,.65);box(root,amber,0,3.28,0,.5,.12,.5);
      light=new THREE.PointLight('#ffc777',0,13,2);light.position.set(0,2.8,0);root.add(light);
    } else if(type==='conveyor'){
      box(root,dark,0,.3,0,1.3,.1,1.98);for(const x of [-.72,.72])box(root,steel,x,.38,0,.14,.2,1.98);box(root,orange,0,.37,.3,.5,.02,.5);
    } else box(root,ivory,0,.75,0,w-.4,1.3,d-.4);
    return {root,roof,light};
  }
  const ghost=new THREE.Group();scene.add(ghost);let ghostKey='';
  const ghostGood=new THREE.MeshBasicMaterial({color:'#8cddb9',transparent:true,opacity:.3,depthWrite:false}),ghostBad=new THREE.MeshBasicMaterial({color:'#ff715d',transparent:true,opacity:.35,depthWrite:false});materials.add(ghostGood);materials.add(ghostBad);
  // Flat ground arrows: belt travel, machine inputs (cyan, pointing in) and outputs (amber, pointing out).
  const arrowShape=new THREE.Shape();arrowShape.moveTo(-.38,-.32);arrowShape.lineTo(0,.38);arrowShape.lineTo(.38,-.32);arrowShape.lineTo(0,-.12);arrowShape.closePath();
  const arrowGeo=new THREE.ShapeGeometry(arrowShape);arrowGeo.rotateX(-Math.PI/2);arrowGeo.rotateY(Math.PI);geometries.add(arrowGeo);
  const arrowMaterial=(color,overlay=false)=>{const m=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9,depthWrite:false,depthTest:!overlay,side:THREE.DoubleSide});materials.add(m);return m;};
  const arrows={input:arrowMaterial('#72d7ec'),output:arrowMaterial('#f3a24b')},previewArrows={input:arrowMaterial('#72d7ec',true),output:arrowMaterial('#f3a24b',true)},beltArrow=arrowMaterial('#ffffff',true);
  function groundArrow(parent,material,x,z,dir,scale=1,lift=.12){const o=new THREE.Mesh(arrowGeo,material);o.position.set(x,heightAt(state.seed,x,z)+lift,z);o.rotation.y=dir*Math.PI/2;o.scale.setScalar(scale);o.renderOrder=3;parent.add(o);return o;}
  function portArrows(parent,b,preview=false){
    const look=preview?previewArrows:arrows,scale=preview?1.3:.8,lift=preview?.3:.12;
    for(const p of machinePorts(b,'inputs'))if(b.type!=='storage')groundArrow(parent,look.input,(p.cell.x+p.neighbor.x),(p.cell.z+p.neighbor.z),(p.dir+2)%4,scale,lift);
    for(const p of machinePorts(b,'outputs'))groundArrow(parent,look.output,(p.cell.x+p.neighbor.x),(p.cell.z+p.neighbor.z),p.dir,scale,lift);
  }
  function setGhost(type,x,z,rotation,valid,line=null){
    if(type!=='mine'&&!DEFS[type]){clearGhost();return;}
    const items=line??[{x,z,rotation,valid}],key=type+JSON.stringify(items);if(key===ghostKey)return;ghostKey=key;ghost.clear();
    for(const item of items){
      const cells=type==='mine'?Array.from({length:(MINING_RADIUS*2+1)**2},(_,i)=>({x:item.x-MINING_RADIUS+i%(MINING_RADIUS*2+1),z:item.z-MINING_RADIUS+Math.floor(i/(MINING_RADIUS*2+1))})):footprint(type,item.x,item.z,item.rotation);
      for(const c of cells)box(ghost,item.valid?ghostGood:ghostBad,c.x*2,heightAt(state.seed,c.x*2,c.z*2)+.08,c.z*2,type==='mine'?1.7:1.94,.13,type==='mine'?1.7:1.94);
      if(type==='conveyor')groundArrow(ghost,beltArrow,item.x*2,item.z*2,item.rotation,1.1,.3);
      else if(type!=='mine')portArrows(ghost,{type,x:item.x,z:item.z,rotation:item.rotation},true);
    }
    ghost.visible=true;grid.material.opacity=.28;
  }
  function clearGhost(){ghost.visible=false;ghostKey='';grid.material.opacity=0;}
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),hit=new THREE.Vector3();
  function pick(clientX,clientY){if(state.player.cave!=null)return null;const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return null;pointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObject(terrainView.ground);if(!hits.length)return null;hit.copy(hits[0].point);const x=Math.round(hit.x/2),z=Math.round(hit.z/2);const b=state.buildings.find(b=>footprint(b.type,b.x,b.z,b.rotation).some(c=>c.x===x&&c.z===z));return {x,z,worldX:hit.x,worldZ:hit.z,...(b?{buildingId:b.id}:{})};}
  function resize(){const r=canvas.getBoundingClientRect(),width=Math.max(1,r.width),height=Math.max(1,r.height);renderer.setSize(width,height,false);const aspect=width/height;camera.left=-viewHeight*aspect/2;camera.right=viewHeight*aspect/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;camera.updateProjectionMatrix();}
  function zoom(e){e.preventDefault();viewHeight=THREE.MathUtils.clamp(viewHeight*Math.exp(e.deltaY*.001),20,180);resize();}
  canvas.addEventListener('wheel',zoom,{passive:false});
  function update(next,dt,renderPose=next.player){
    state=next;
    if(lastSeed!==state.seed){terrainView.dispose();terrainView=createTerrainView(state.seed,terrainRoot,models);lastSeed=state.seed;drapeGrid();}
    terrainView.update(state.buildings,footprint,state.player);
    const underground=state.player.cave!=null;
    if(activeCave!==(state.player.cave??null)||underground&&!caveView){
      caveView?.dispose();caveView=null;activeCave=state.player.cave??null;
      if(underground){
        caveView=createCaveView(state.seed,activeCave,scene);const origin=caveOrigin(state.seed,activeCave);
        caveView.root.position.set(origin.x,origin.y,origin.z);caveView.root.rotation.y=origin.angle;
        terrainView.setCaveCutaway(caveView.roofMap,origin,origin.angle);
      }else terrainView.setCaveCutaway(null);
    }
    terrainRoot.visible=true;grid.visible=!underground;statusLayer.hidden=underground;
    padLight.visible=true;marker.visible=!underground;
    document.body.dataset.region=underground?'cave':'surface';
    canvas.dataset.caveId=String(state.player.cave??'');canvas.dataset.seed=String(state.seed);canvas.dataset.viewHeight=String(viewHeight);
    canvas.dataset.playerX=state.player.x.toFixed(2);canvas.dataset.playerZ=state.player.z.toFixed(2);
    const daylight=Math.max(0,Math.sin(state.time/240*Math.PI*2+Math.PI/3));
    scene.environmentIntensity=.035+daylight*.265;
    sun.intensity=.18+daylight*3.1;fill.intensity=.5+daylight*.7;
    suitFill.intensity=2+(1-daylight)*5;headlamp.intensity=8+(1-daylight)*37;padLight.intensity=5+(1-daylight)*18;
    sun.position.set(follow.x-25,12+daylight*38,follow.z-30);sun.target.position.set(follow.x,0,follow.z);sun.target.updateMatrixWorld();
    scene.background.setRGB(.025+daylight*.035,.038+daylight*.05,.065+daylight*.075);scene.fog.color.copy(scene.background);
    scene.fog.density=.0012;suitFill.distance=underground?6:8;headlamp.distance=underground?20:18;
    if(underground){suitFill.intensity=3;headlamp.intensity=145;}
    const position=underground?caveToWorld(state.seed,state.player.cave,renderPose.x,renderPose.z):{x:renderPose.x,y:heightAt(state.seed,renderPose.x,renderPose.z),z:renderPose.z};
    if(smoothedGround==null||Math.abs(position.y-smoothedGround)>2)smoothedGround=position.y;
    else smoothedGround+=(position.y-smoothedGround)*(1-Math.exp(-Math.min(dt,.1)*24));
    player.position.set(position.x,smoothedGround+(renderPose.y||0),position.z);
    player.rotation.y=(renderPose.facing||0)+(underground?caveOrigin(state.seed,state.player.cave).angle:0);
    if(suitUnderground!==underground){suitMaterials.forEach(({material,color,environment})=>{material.color.copy(color).multiplyScalar(underground?.3:1);material.envMapIntensity=underground?.05:environment;});suitUnderground=underground;}
    actor?.update(renderPose,dt);
    if(canvas.dataset.animation!==renderPose.animation)canvas.dataset.animation=renderPose.animation||'idle';
    const ids=new Set(state.buildings.map(b=>b.id));for(const [id,o] of structures)if(!ids.has(id)){scene.remove(o.root,o.ports);o.ownedMaterials?.forEach(m=>m.dispose());structures.delete(id);}
    for(const b of state.buildings){
      let o=structures.get(b.id);
      if(o&&(o.type!==b.type||o.rotation!==b.rotation)){scene.remove(o.root,o.ports);o.ownedMaterials.forEach(m=>m.dispose());structures.delete(b.id);o=null;}
      if(!o){o=buildModel(b.type);o.type=b.type;o.rotation=b.rotation;o.ports=new THREE.Group();portArrows(o.ports,b);scene.add(o.ports);o.ownedMaterials=[];const clones=new Map();o.root.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;const copy=m=>{if(!clones.has(m.uuid)){const c=m.clone();c.userData.baseEmission=c.emissiveIntensity;c.userData.baseColor=c.color.clone();c.userData.baseEmissive=c.emissive.clone();clones.set(m.uuid,c);o.ownedMaterials.push(c);}return clones.get(m.uuid);};n.material=Array.isArray(n.material)?n.material.map(copy):copy(n.material);}});o.statusHeight=new THREE.Box3().setFromObject(o.root).max.y;structures.set(b.id,o);scene.add(o.root);}
      o.root.visible=true;
      const def=DEFS[b.type],w=b.rotation%2?def.d:def.w,d=b.rotation%2?def.w:def.d;
      const bx=(b.x+(w-1)/2)*2,bz=(b.z+(d-1)/2)*2;
      o.root.position.set(bx,heightAt(state.seed,bx,bz),bz);o.root.rotation.y=b.rotation*Math.PI/2;
      if(o.built!==b.built){o.ownedMaterials.forEach(m=>{m.transparent=!b.built;m.opacity=b.built?1:.5;m.depthWrite=b.built;m.color.copy(b.built?m.userData.baseColor:new THREE.Color('#79d5ed'));m.emissive.copy(b.built?m.userData.baseEmissive:new THREE.Color('#2c8ca9'));m.emissiveIntensity=b.built?m.userData.baseEmission:.85;});o.root.traverse(n=>{if(n.isMesh)n.castShadow=b.built;});o.built=b.built;}
      if(!b.built)o.root.scale.y=.35+.65*(b.progress||0);
      else o.root.scale.y=1;
      if(o.roof)o.roof.visible=!(state.player.x>b.x*2-1&&state.player.x<(b.x+w)*2-1&&state.player.z>b.z*2-1&&state.player.z<(b.z+d)*2-1);
      if(o.light){const powered=b.built&&state.power.powered!==false;o.light.intensity=powered?(1-daylight)*(b.type==='habitat'?10:26):0;o.ownedMaterials.forEach(m=>{m.emissiveIntensity=b.built?(m.userData.baseEmission||0)*(powered?1:0):.85;});}
    }
    productionView.update(state,dt,daylight);
    follow.set(player.position.x,player.position.y+1.05,player.position.z);
    const cameraDistance=4;camera.position.set(follow.x+26*cameraDistance,follow.y+34*cameraDistance,follow.z+26*cameraDistance);camera.lookAt(follow);camera.updateMatrixWorld();
    if(underground)caveView.update(state,dt);else updateStatuses();
    renderer.render(scene,camera);canvas.dataset.drawCalls=String(renderer.info.render.calls);canvas.dataset.triangles=String(renderer.info.render.triangles);
  }
  function dispose(){disposed=true;caveView?.dispose();productionView.dispose();statusLayer.remove();terrainView.dispose();grid.geometry.dispose();grid.material.dispose();actor?.dispose();reflection.dispose();canvas.removeEventListener('wheel',zoom);for(const o of structures.values()){o.ownedMaterials?.forEach(m=>m.dispose());scene.remove(o.ports);}geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());renderer.dispose();}
  resize();update(initialState,1);
  return {renderer,scene,camera,update,pick,setGhost,clearGhost,resize,dispose};
}
