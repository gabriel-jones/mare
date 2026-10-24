import {caveLayout,cavePassable,caveKey,lineVisible,CAVE_CELL} from './caves.js';
import {FLARE,flareNow} from './peril.js';
import {burnNest,liveNests,nestMouth,silkBlocks,stepInfest} from './infest.js';
import {burnGoo} from './goo.js';
import {WEAPONS,stepArms,pullTrigger,burnTank,heldWeapon,armsOf,reload} from './arms.js';
import {CRAWLER,KINDS,PLAYER_RADIUS,radiusOf,partsOf,partNear,walkable,asKind,createCrawler,stepCrawler,struggle,hurtCrawler,scorchCrawler,shotEnd,spill,createDodge,startDodge,stepDodge} from './crawler.js';
import {SHAPE,createCentipede,huntCentipede} from './centipede.js';
import {ROSTER_KINDS,caveRoster} from './roster.js';

/**
 * Crawlers in the caves, and the player's answer to them: the weapons (arms.js), the dodge roll and breaking free of
 * a grab. The crawlers are not saved: whoever hunts a zone is rolled fresh each time the player enters it: the nests'
 * own crawlers, and the rest of the zone's level on the roster (roster.js), so the deeper the zone the bigger what
 * hunts it, from a few brood near the surface to drones, a brute, a centipede and a matron at the bottom. On the
 * surface the weapons still fire, at the hatchlings of a breach (state.brood). Damage lands on the suit's health, so
 * a mauling ends in the usual blackout.
 */
/**
 * `count`: crawlers per zone with every nest alive. Each nest burnt out takes its share of them and slows the rest
 * coming back; with every nest burnt one still prowls, slowest of all to return.
 * Nests fight back: each has `hp`, worn down by rounds and the flame jet. Every `burst` of damage squeezes one or two
 * more out of it (`brood`), and when it finally goes up in flames `final` more boil out. `limit` caps the living.
 */
export const NEST=Object.freeze({count:[3,5,7],farFrom:16,respawn:[16,30],bullet:90,hp:120,burst:30,brood:[1,2],final:3,limit:14,mouth:.95});
function brood(state,cave){
 const p=state.player,total=cave.nests.length,live=liveNests(state,p.cave,p.zone??0);
 if(!total)return {live,cap:NEST.count[cave.zone]??1,slow:1};
 return {live,cap:Math.max(1,Math.round((NEST.count[cave.zone]??1)*live.length/total)),slow:live.length?total/live.length:3};
}

export function createHunt(){
 return {key:null,crawlers:[],respawns:[],shots:[],dodge:createDodge(),lampShort:0,events:[],clock:0,wounds:{},liveKeys:null};
}


const grabber=hunt=>hunt.crawlers.find(c=>c.state==='grab')??null;
export const grabbedBy=grabber;
/** True while the player cannot walk: held, or tearing a crawler off their helmet. */
export const pinned=hunt=>!!grabber(hunt)||hunt.wrenching>0;

function spawnSpot(cave,player,rng,exclude=[]){
 const rooms=[...cave.rooms].sort(()=>rng()-.5);
 for(const minimum of [NEST.farFrom,NEST.farFrom*.6,6]){
  for(const r of rooms){
   const x=r.x*CAVE_CELL,z=r.z*CAVE_CELL;
   if(Math.hypot(x-player.x,z-player.z)<minimum||!cavePassable(cave,x,z))continue;
   if(exclude.some(c=>Math.hypot(c.x-x,c.z-z)<4))continue;
   return {x,z};
  }
 }
 return null;
}
/** Out of a live nest well away from the player, if there is one; otherwise from the far rooms. */
function nestSpot(nests,player,exclude){
 const spots=nests.map(n=>({x:n.x*CAVE_CELL,z:n.z*CAVE_CELL,nest:n.key})).filter(s=>Math.hypot(s.x-player.x,s.z-player.z)>=8&&!exclude.some(c=>Math.hypot(c.x-s.x,c.z-s.z)<4));
 return spots.sort((a,b)=>Math.hypot(b.x-player.x,b.z-player.z)-Math.hypot(a.x-player.x,a.z-player.z))[0]??null;
}
const alive=hunt=>hunt.crawlers.filter(c=>c.state!=='dead').length;
/** `count` crawlers squeeze out of nest `n` one after another, already hunting. */
function hatch(hunt,state,n,count,rng){
 const C=CAVE_CELL,p=state.player;
 for(let i=0;i<count&&alive(hunt)<NEST.limit;i++){
  const c=createCrawler(n.x*C+n.dx*.95,n.z*C+n.dz*.95,rng),side=(rng()-.5)*1.2;
  Object.assign(c,{state:'emerge',t:-i*.5,nest:n.key,patience:0,emergeTo:{x:n.x*C-n.dx*1.1+n.dz*side,z:n.z*C-n.dz*1.1+n.dx*side}});
  c.facing=Math.atan2(-n.dx,-n.dz);
  hunt.crawlers.push(c);hunt.events.push({type:'spawned',crawler:c,nest:n.key,emerge:true});
 }
 for(const c of hunt.crawlers)if(c.state==='lurk')c.state='stalk';
 if(Math.hypot(n.x*C-p.x,n.z*C-p.z)<30)for(const c of hunt.crawlers)if(c.state==='stalk'||c.state==='close')c.patience=Math.min(c.patience,.5);
}
/** Damage to a live nest in the player's zone: broods burst out as it weakens, and at zero it burns out. */
function woundNest(hunt,state,cave,key,damage,rng){
 const n=cave.nests.find(n=>n.key===key);if(!n||!liveNests(state,state.player.cave,state.player.zone??0).some(l=>l.key===key))return;
 const w=hunt.wounds[key]??={hp:NEST.hp,next:NEST.hp-NEST.burst,hit:0};
 w.hp-=damage;w.hit=.5;
 while(w.hp<=w.next&&w.next>0){w.next-=NEST.burst;hatch(hunt,state,n,NEST.brood[0]+Math.floor(rng()*(NEST.brood[1]-NEST.brood[0]+1)),rng);}
 if(w.hp<=0)burnNest(state,key);
}
function spawn(hunt,cave,state,rng,nests=[]){
 const at=nestSpot(nests,state.player,hunt.crawlers)??spawnSpot(cave,state.player,rng,hunt.crawlers);if(!at)return null;
 const c=createCrawler(at.x,at.z,rng);c.facing=Math.atan2(state.player.x-at.x,state.player.z-at.z);
 if(at.nest)c.nest=at.nest;
 hunt.crawlers.push(c);return c;
}

/**
 * One fixed step underground. Moves the player while rolling or dragged, and returns nothing: everything that
 * happened is appended to hunt.events for the view (shriek, lunge, grab, slash, hurt, release, recoil, roll,
 * throwoff, shot, impact, killed, spawned).
 */
export function stepHunt(hunt,state,dt,rng=Math.random){
 const p=state.player;
 stepArms(state,dt);stepBurst(hunt,state,dt,rng);
 if(hunt.charging!=null)hunt.charging=WEAPONS[heldWeapon(state)]?.charge?hunt.charging+dt:null;
 if(p.cave==null){
  if(hunt.key!==null)Object.assign(hunt,createHunt(),{events:hunt.events,trigger:hunt.trigger});
  const brood=state.brood??[];
  hunt.clock+=dt;stepFlame(hunt,state,null,brood,dt,rng);stepArc(hunt,state,null,brood,dt,rng);land(hunt,state,null,brood,dt,rng);
  // On the surface the caller moves the player by `dash`, through the surface's own collision.
  const dash=stepDodge(hunt.dodge,dt);hunt.rolling=dash.rolling;hunt.dash=dash.rolling?dash:null;
  return;
 }
 const zone=p.zone??0,key=`${p.cave}:${zone}`,cave=caveLayout(state.seed,p.cave,zone);
 if(hunt.key!==key){
  Object.assign(hunt,createHunt(),{events:hunt.events,key,trigger:hunt.trigger});
  const b=brood(state,cave);for(let i=0;i<b.cap;i++)spawn(hunt,cave,state,rng,b.live);
  const rest=caveRoster(zone);
  for(const kind of ROSTER_KINDS)for(let i=0;i<rest[kind];i++){
   const at=spawnSpot(cave,state.player,rng,hunt.crawlers);if(!at)break;
   const facing=Math.atan2(state.player.x-at.x,state.player.z-at.z);
   hunt.crawlers.push(kind==='centipede'?createCentipede(at.x,at.z,{...SHAPE,facing}):Object.assign(asKind(createCrawler(at.x,at.z,rng),kind),{facing}));
  }
 }
 hunt.clock+=dt;
 for(const w of Object.values(hunt.wounds))w.hit=Math.max(0,w.hit-dt);
 stepFlame(hunt,state,cave,hunt.crawlers,dt,rng);stepArc(hunt,state,cave,hunt.crawlers,dt,rng);
 hunt.lampShort=Math.max(0,hunt.lampShort-dt);hunt.wrenching=Math.max(0,(hunt.wrenching??0)-dt);
 const dash=stepDodge(hunt.dodge,dt);
 if(dash.rolling){
  const clear=(x,z)=>cavePassable(cave,x,z,PLAYER_RADIUS)&&!silkBlocks(state,x,z,PLAYER_RADIUS);
  if(clear(p.x+dash.x,p.z))p.x+=dash.x;
  if(clear(p.x,p.z+dash.z))p.z+=dash.z;
 }
 hunt.rolling=dash.rolling;
 const held=grabber(hunt);
 const flares=(state.flares??[]).filter(f=>f.cave===p.cave&&(f.zone??0)===zone).map(f=>{const n=flareNow(f,p);return {x:n.x,z:n.z,r:FLARE.radius*n.lit};}).filter(f=>f.r>0)
 // Crawlers shy from the flamethrower's jet as from a flare.
 if(hunt.flame)flares.push(...hunt.flame.points);
 const hurt=amount=>{p.health=Math.max(0,(p.health??100)-amount);p.calm=0;};
 const caveOpen=(x,z)=>walkable(cave,x,z,.4);
 for(const c of hunt.crawlers){
  if(c.kind==='centipede'){
   // It feels the player through the rock from anywhere in the zone; a roll or a jump carries them clear of a blow.
   const near=Math.hypot(p.x-c.x,p.z-c.z)<CRAWLER.sense*1.5;
   for(const e of huntCentipede(c,dt,{prey:near?{x:p.x,z:p.z,invulnerable:dash.invulnerable||(p.y??0)>.6}:null,open:caveOpen,rng})){
    if(e.type==='strike'){hurt(e.damage);hunt.events.push({type:'slash',crawler:c,damage:e.damage});}
    else hunt.events.push({...e,crawler:c});
   }
   continue;
  }
  // A big one dead splits open and its brood boil out onto the floor around it.
  if(c.state==='dead'&&!c.burst&&KINDS[c.kind]?.burst){
   c.burst=true;
   const out=spill(c,Math.max(0,Math.min(KINDS[c.kind].burst,NEST.limit-alive(hunt))),rng);
   for(const b of out){if(!walkable(cave,b.emergeTo.x,b.emergeTo.z))b.emergeTo={x:c.x,z:c.z};hunt.crawlers.push(b);hunt.events.push({type:'spawned',crawler:b,emerge:true});}
  }
  // One at a time: while something has hold of the player the others cannot land a blow.
  const env={cave,player:{x:p.x,z:p.z,facing:p.facing,lamp:hunt.lampShort<=0,invulnerable:dash.invulnerable||(held&&held!==c)||(p.y??0)>.6},flares};
  const might=KINDS[c.kind]?.might??1;
  for(const e of stepCrawler(c,env,dt,rng)){
   if(e.type==='grab'||e.type==='slash'||e.type==='hurt')hurt(e.damage*might);
   if(e.type==='slash')hunt.lampShort=e.short;
   if(e.type==='drag'){if(cavePassable(cave,p.x+e.dx,p.z+e.dz,PLAYER_RADIUS)&&!silkBlocks(state,p.x+e.dx,p.z+e.dz,PLAYER_RADIUS)){p.x+=e.dx;p.z+=e.dz;}continue;}
   if(e.type==='hurt')continue;
   hunt.events.push({...e,crawler:c});
  }
 }
 land(hunt,state,cave,hunt.crawlers,dt,rng);
 // A nest that goes up in flames, by any means, looses its last brood.
 const b=brood(state,cave),live=new Set(b.live.map(n=>n.key));
 if(hunt.liveKeys)for(const k of hunt.liveKeys)if(!live.has(k)){const n=cave.nests.find(n=>n.key===k);if(n)hatch(hunt,state,n,NEST.final,rng);delete hunt.wounds[k];}
 hunt.liveKeys=live;
 // The dead melt away; another crawls out of a nest a while later, if the nests left can still breed one.
 for(const c of hunt.crawlers)if(c.state==='dead'&&c.t>6.5){hunt.respawns.push((NEST.respawn[0]+(NEST.respawn[1]-NEST.respawn[0])*rng())*b.slow);}
 hunt.crawlers=hunt.crawlers.filter(c=>!(c.state==='dead'&&c.t>6.5));
 hunt.respawns=hunt.respawns.map(t=>t-dt);
 // Only the nests' own crawlers come back; what else hunted the zone is gone until the player returns.
 for(const t of hunt.respawns)if(t<=0&&hunt.crawlers.filter(c=>c.state!=='dead'&&!c.kind).length<b.cap){const c=spawn(hunt,cave,state,rng,b.live);if(c)hunt.events.push({type:'spawned',crawler:c,nest:c.nest??null});}
 hunt.respawns=hunt.respawns.filter(t=>t>0);
 if(hunt.events.length>200)hunt.events.splice(0,hunt.events.length-200);
}

/** Rounds in flight land after their travel time, on whichever of `targets` they were aimed at. */
function land(hunt,state,cave,targets,dt,rng){
 for(const s of hunt.shots){
  s.t-=dt;if(s.t>0)continue;
  if(s.nest&&cave){woundNest(hunt,state,cave,s.nest,s.damage,rng);hunt.events.push({type:'impact',x:s.x,z:s.z,dir:s.dir,nest:s.nest,weapon:s.weapon});}
  else if(s.target&&targets.includes(s.target)&&s.target.state!=='dead'){
   const r=hurtCrawler(s.target,s.damage,rng);
   hunt.events.push({type:'impact',crawler:s.target,x:s.x,z:s.z,dir:s.dir,killed:r.killed,weapon:s.weapon});
   if(r.killed)hunt.events.push({type:'killed',crawler:s.target});
   if(r.released)hunt.events.push({type:'release',crawler:s.target});
  }else hunt.events.push({type:'impact',x:s.x,z:s.z,dir:s.dir,rock:true,weapon:s.weapon});
 }
 hunt.shots=hunt.shots.filter(s=>s.t>0);
}
const cellOf=v=>Math.round(v/CAVE_CELL);
/** The jet's reach this step: points along the aim, every .7 m out to its range or the first rock. */
export function flamePoints(cave,p){
 const spec=WEAPONS.flamethrower,ax=Math.sin(p.facing??0),az=Math.cos(p.facing??0),points=[];
 for(let d=.9;d<=spec.range;d+=.7){
  const x=p.x+ax*d,z=p.z+az*d;
  if(cave&&!cave.open.has(caveKey(cellOf(x),cellOf(z))))break;
  points.push({x,z,r:1.1});
 }
 return points;
}
/**
 * While the trigger is held on a flamethrower with fuel: everything in the cone burns. Crawlers take steady damage
 * without flinching; nests and silk catch underground, goo burns away on the surface.
 */
function stepFlame(hunt,state,cave,targets,dt,rng){
 const p=state.player,on=!!hunt.trigger&&heldWeapon(state)==='flamethrower'&&burnTank(state,dt);
 for(const c of targets)if(c.scorched)c.scorched=Math.max(0,c.scorched-dt);
 hunt.flame=on?{points:flamePoints(cave,p)}:null;
 if(!on)return;
 const spec=WEAPONS.flamethrower,points=hunt.flame.points,ax=Math.sin(p.facing??0),az=Math.cos(p.facing??0);
 for(const c of targets){
  if(c.state==='dead')continue;
  // The jet stops at rock, so whatever lies by its points (or right at the nozzle) is in the fire.
  const body=partsOf(c),close=body.some(b=>{const ox=b.x-p.x,oz=b.z-p.z;return Math.hypot(ox,oz)<1.2&&ox*ax+oz*az>0;});
  if(!close&&!points.some(f=>body.some(b=>Math.hypot(b.x-f.x,b.z-f.z)<radiusOf(c)+.55)))continue;
  const r=scorchCrawler(c,spec.damage*dt,rng);c.scorched=.4;
  if(r.killed)hunt.events.push({type:'killed',crawler:c,burnt:true});
 }
 if(cave){
  stepInfest(state,0,points,{nests:false});
  for(const n of liveNests(state,p.cave,p.zone??0)){const m=nestMouth(n);if(points.some(f=>Math.hypot(f.x-m.x,f.z-m.z)<NEST.mouth+.6))woundNest(hunt,state,cave,n.key,spec.damage*dt,rng);}
 }else burnGoo(state,points);
}
/**
 * While the trigger is held on a charged arc projector: the beam leaps to the nearest crawler in its cone that it can
 * see, then on to the nearest unstruck one within `hop`, up to `chain` more. Each takes steady damage and is held
 * stunned. With nothing to strike the beam crackles out to its range or the rock. `hunt.arc` is the path, for the view.
 */
function stepArc(hunt,state,cave,targets,dt,rng){
 const p=state.player,spec=WEAPONS.arc;
 for(const c of targets)if(c.shocked)c.shocked=Math.max(0,c.shocked-dt);
 hunt.arc=null;
 if(!hunt.trigger||heldWeapon(state)!=='arc'||!burnTank(state,dt))return;
 const facing=p.facing??0,from={x:p.x+Math.sin(facing)*.6,z:p.z+Math.cos(facing)*.6},cell=v=>Math.round(v/CAVE_CELL);
 const sees=(a,b)=>!cave||lineVisible(cave,cell(a.x),cell(a.z),cell(b.x),cell(b.z));
 const live=targets.filter(c=>c.state!=='dead'),struck=[];
 let first=null,best=Infinity;
 for(const c of live)for(const b of partsOf(c)){
  const ox=b.x-p.x,oz=b.z-p.z,d=Math.hypot(ox,oz);if(d>spec.range+radiusOf(c)||d>=best)continue;
  if(Math.abs(Math.atan2(Math.sin(Math.atan2(ox,oz)-facing),Math.cos(Math.atan2(ox,oz)-facing)))>spec.cone&&d>1.2)continue;
  if(sees(p,b)){first=c;best=d;}
 }
 if(first){
  struck.push(first);
  while(struck.length<=spec.chain){
   const last=struck.at(-1);let next=null,near=spec.hop;
   for(const c of live){if(struck.includes(c))continue;const at=partNear(c,last.x,last.z);if(at&&at.d<near&&sees(last,at)){next=c;near=at.d;}}
   if(!next)break;struck.push(next);
  }
 }
 for(const c of struck){
  const r=scorchCrawler(c,spec.damage*dt,rng);c.shocked=.25;
  if(r.killed)hunt.events.push({type:'killed',crawler:c,shocked:true});
 }
 const end=first?null:shotEnd(cave,from,{x:Math.sin(facing),z:Math.cos(facing)},[],{range:spec.range*.7,tolerance:0});
 hunt.arc={from,struck,end:end?{x:end.x,z:end.z}:null};
}
/** A nest scraped for goo: one more crawls out of it, cap or no, and the rest lose patience and close in. */
export function rouse(hunt,state,nestKey,rng=Math.random){
 const p=state.player;if(p.cave==null||hunt.key==null)return;
 const cave=caveLayout(state.seed,p.cave,p.zone??0),n=cave.nests.find(n=>n.key===nestKey);
 if(n){const c=createCrawler(n.x*CAVE_CELL,n.z*CAVE_CELL,rng);c.facing=Math.atan2(p.x-c.x,p.z-c.z);c.nest=n.key;c.state='stalk';c.patience=0;hunt.crawlers.push(c);hunt.events.push({type:'spawned',crawler:c,nest:n.key});}
 for(const c of hunt.crawlers)if(c.state==='lurk'||c.state==='stalk'){c.state='stalk';c.patience=0;}
}
/**
 * Pull the trigger, aimed along the player's facing. A round is in flight for distance / bullet speed; the
 * flamethrower sprays until `release`. Underground rock stops a round; on the surface it flies its full range.
 */
export function fire(hunt,state,chained=false,rng=Math.random){
 const p=state.player,below=p.cave!=null;if(below&&hunt.key==null)return {ok:false};
 const held=heldWeapon(state);
 if(WEAPONS[held]?.charge){
  const a=armsOf(state);if(a.reloading||a.cooldown>0||hunt.charging!=null)return {ok:false,weapon:held};
  if(!a.loaded[held])return {ok:false,weapon:held,reason:reload(state).reason};
  hunt.trigger=true;hunt.charging=0;hunt.events.push({type:'charge',weapon:held});return {ok:true,weapon:held};
 }
 const r=pullTrigger(state,chained);
 if(r.weapon&&WEAPONS[r.weapon].stream){hunt.trigger=true;return {ok:true,weapon:r.weapon};}
 if(!r.ok)return r;
 if(r.spec.melee)return swing(hunt,state,r,rng);
 if(!chained&&r.spec.burst>1)hunt.burst={weapon:r.weapon,left:r.spec.burst-1,t:r.spec.interval};
 const off=chained&&r.spec.spread?(rng()-.5)*2*r.spec.spread:0,aim=(p.facing??0)+off;
 const cave=below?caveLayout(state.seed,p.cave,p.zone??0):null,targets=below?hunt.crawlers:(state.brood??[]),dir={x:Math.sin(aim),z:Math.cos(aim)};
 const from={x:p.x+dir.x*.5,z:p.z+dir.z*.5},end=shotEnd(cave,from,dir,targets.filter(c=>c.state!=='dead'),r.spec);
 let distance=Math.hypot(end.x-from.x,end.z-from.z),nest=null,at=end;
 // A nest's mouth in the line of fire, nearer than any crawler, takes the round instead.
 if(cave)for(const n of liveNests(state,p.cave,p.zone??0)){
  const m=nestMouth(n),ox=m.x-from.x,oz=m.z-from.z,along=ox*dir.x+oz*dir.z;
  if(along<0||along>Math.min(r.spec.range,distance+1.2)||Math.abs(ox*dir.z-oz*dir.x)>NEST.mouth)continue;
  if(!lineVisible(cave,Math.round(from.x/CAVE_CELL),Math.round(from.z/CAVE_CELL),n.x,n.z))continue;
  if(!nest||along<nest.along)nest={key:n.key,along,x:from.x+dir.x*along,z:from.z+dir.z*along};
 }
 if(nest&&(!end.hit||nest.along<end.hit.distance)){distance=nest.along;at=nest;}else nest=null;
 const shot={t:distance/NEST.bullet,target:nest?null:end.hit?.crawler??null,nest:nest?.key??null,x:at.x,z:at.z,dir,damage:r.spec.damage,weapon:r.weapon};
 hunt.shots.push(shot);hunt.events.push({type:'shot',x:at.x,z:at.z,dir,hit:!!shot.target,target:shot.target,weapon:r.weapon});
 return {ok:true,weapon:r.weapon};
}
/** The rest of a burst, one round every `interval`, for as long as the same gun is held and has rounds. */
function stepBurst(hunt,state,dt,rng){
 const b=hunt.burst;if(!b)return;
 if(heldWeapon(state)!==b.weapon){hunt.burst=null;return;}
 for(b.t-=dt;b.t<=0&&b.left>0;b.t+=WEAPONS[b.weapon].interval){b.left--;if(!fire(hunt,state,true,rng).ok)b.left=0;}
 if(b.left<=0)hunt.burst=null;
}
/**
 * A blade's swing: everything alive within reach and inside the arc is cut at once, flinching as from a shot, and a
 * nest mouth in reach is cut too. The cuts land straight away; there is nothing in flight.
 */
function swing(hunt,state,r,rng){
 const p=state.player,below=p.cave!=null,spec=r.spec,facing=p.facing??0,dir={x:Math.sin(facing),z:Math.cos(facing)};
 const cave=below?caveLayout(state.seed,p.cave,p.zone??0):null,targets=below?hunt.crawlers:(state.brood??[]);
 const inArc=(x,z,reach)=>{const ox=x-p.x,oz=z-p.z,d=Math.hypot(ox,oz);if(d>reach)return false;if(d<.4)return true;
  return Math.abs(Math.atan2(Math.sin(Math.atan2(ox,oz)-facing),Math.cos(Math.atan2(ox,oz)-facing)))<=spec.arc;};
 let hits=0;
 hunt.events.push({type:'swing',weapon:r.weapon,dir});
 for(const c of targets){
  if(c.state==='dead'||!partsOf(c).some(b=>inArc(b.x,b.z,spec.range+radiusOf(c))))continue;
  hits++;const h=hurtCrawler(c,spec.damage,rng),at=partNear(c,p.x,p.z)??c,d=Math.hypot(at.x-p.x,at.z-p.z)||1;
  hunt.events.push({type:'impact',crawler:c,x:at.x,z:at.z,dir:{x:(at.x-p.x)/d,z:(at.z-p.z)/d},killed:h.killed,weapon:r.weapon,melee:true});
  if(h.killed)hunt.events.push({type:'killed',crawler:c});
  if(h.released)hunt.events.push({type:'release',crawler:c});
 }
 if(cave)for(const n of liveNests(state,p.cave,p.zone??0)){
  const m=nestMouth(n);if(!inArc(m.x,m.z,spec.range+NEST.mouth))continue;
  hits++;woundNest(hunt,state,cave,n.key,spec.damage,rng);hunt.events.push({type:'impact',x:m.x,z:m.z,dir,nest:n.key,weapon:r.weapon,melee:true});
 }
 return {ok:true,weapon:r.weapon,hits};
}
/**
 * Let go of the trigger: the stream weapons stop, and a charging railgun fires (given the state) or, without it, is
 * stood down.
 */
export function release(hunt,state=null,rng=Math.random){
 hunt.trigger=false;
 const held=hunt.charging;hunt.charging=null;
 if(held==null||!state)return {ok:false};
 return discharge(hunt,state,held,rng);
}
/**
 * The railgun's slug: it goes straight through every crawler and nest mouth along the line, out to its range or the
 * first rock, striking each at once for the charge's share of its damage.
 */
function discharge(hunt,state,held,rng){
 const p=state.player,below=p.cave!=null;if(below&&hunt.key==null)return {ok:false};
 const r=pullTrigger(state);if(!r.ok||!r.spec.charge)return r;
 const spec=r.spec,power=spec.minPower+(1-spec.minPower)*Math.min(1,held/spec.charge),damage=spec.damage*power;
 const cave=below?caveLayout(state.seed,p.cave,p.zone??0):null,targets=below?hunt.crawlers:(state.brood??[]),dir={x:Math.sin(p.facing??0),z:Math.cos(p.facing??0)};
 const from={x:p.x+dir.x*.5,z:p.z+dir.z*.5},end=shotEnd(cave,from,dir,[],spec),length=Math.hypot(end.x-from.x,end.z-from.z);
 const along=(x,z,width)=>{const ox=x-from.x,oz=z-from.z,a=ox*dir.x+oz*dir.z;return a>0&&a<=length+width&&Math.abs(ox*dir.z-oz*dir.x)<=width?a:null;};
 hunt.events.push({type:'rail',x:end.x,z:end.z,dir,power,weapon:r.weapon});
 let hits=0;
 for(const c of targets){
  if(c.state==='dead'||!partsOf(c).some(b=>along(b.x,b.z,radiusOf(c)+.25)!=null))continue;
  hits++;const h=hurtCrawler(c,damage,rng);
  hunt.events.push({type:'impact',crawler:c,x:c.x,z:c.z,dir,killed:h.killed,weapon:r.weapon});
  if(h.killed)hunt.events.push({type:'killed',crawler:c});
  if(h.released)hunt.events.push({type:'release',crawler:c});
 }
 if(cave)for(const n of liveNests(state,p.cave,p.zone??0)){
  const m=nestMouth(n);if(along(m.x,m.z,NEST.mouth)==null)continue;
  hits++;woundNest(hunt,state,cave,n.key,damage,rng);hunt.events.push({type:'impact',x:m.x,z:m.z,dir,nest:n.key,weapon:r.weapon});
 }
 return {ok:true,weapon:r.weapon,power,hits};
}
/** Roll toward (dx, dz) in cave space. Not while held. */
export function roll(hunt,state,dx,dz){
 if(pinned(hunt))return false;
 if(!startDodge(hunt.dodge,dx,dz))return false;
 hunt.events.push({type:'roll'});return true;
}
/** A struggle press while held. Breaking free tears it off and throws it out ahead. */
export function wrench(hunt,state){
 const c=grabber(hunt);if(!c)return false;
 hunt.events.push({type:'strain'});
 if(!struggle(c,undefined,state.player.facing))return false;
 hunt.wrenching=CRAWLER.throwDelay+CRAWLER.throwTime;
 hunt.events.push({type:'throwoff',crawler:c},{type:'release',crawler:c});return true;
}
export const lampOn=hunt=>hunt.lampShort<=0;
