import {caveLayout,cavePassable,CAVE_CELL} from './caves.js';
import {FLARE,flareNow} from './peril.js';
import * as inv from './inventory.js';
import {liveNests,silkBlocks} from './infest.js';
import {CRAWLER,PISTOL,PLAYER_RADIUS,createCrawler,stepCrawler,struggle,hurtCrawler,createGun,stepGun,fireGun,reloadGun,shotEnd,createDodge,startDodge,stepDodge} from './crawler.js';

/**
 * Crawlers in the caves, and the player's answer to them: the pistol, the dodge roll and breaking free of a grab.
 * The crawlers are not saved: whoever hunts a zone is rolled fresh each time the player enters it. The gun is
 * (state.player.gun). Damage lands on the suit's health, so a mauling ends in the usual blackout.
 */
/**
 * `count`: crawlers per zone with every nest alive. Each nest burnt out takes its share of them and slows the rest
 * coming back; with every nest burnt one still prowls, slowest of all to return.
 */
export const NEST=Object.freeze({count:[1,2,3],farFrom:16,respawn:[60,110],bullet:90,startReserve:12});
function brood(state,cave){
 const p=state.player,total=cave.nests.length,live=liveNests(state,p.cave,p.zone??0);
 if(!total)return {live,cap:NEST.count[cave.zone]??1,slow:1};
 return {live,cap:Math.max(1,Math.round((NEST.count[cave.zone]??1)*live.length/total)),slow:live.length?total/live.length:3};
}

export function createHunt(){
 return {key:null,crawlers:[],respawns:[],shots:[],dodge:createDodge(),lampShort:0,events:[],clock:0};
}

/** The player's pistol, issued on first need. */
export function gunOf(state){
 const p=state.player;
 if(!p.gun)p.gun=createGun(NEST.startReserve);
 p.gun.cooldown??=0;p.gun.reloading??=0;
 return p.gun;
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
 if(p.cave==null){if(hunt.key!==null)Object.assign(hunt,createHunt(),{events:hunt.events});return;}
 const zone=p.zone??0,key=`${p.cave}:${zone}`,cave=caveLayout(state.seed,p.cave,zone);
 if(hunt.key!==key){
  Object.assign(hunt,createHunt(),{events:hunt.events,key});
  const b=brood(state,cave);for(let i=0;i<b.cap;i++)spawn(hunt,cave,state,rng,b.live);
 }
 hunt.clock+=dt;
 const gun=gunOf(state);stepGun(gun,dt);
 hunt.lampShort=Math.max(0,hunt.lampShort-dt);hunt.wrenching=Math.max(0,(hunt.wrenching??0)-dt);
 const dash=stepDodge(hunt.dodge,dt);
 if(dash.rolling){
  const clear=(x,z)=>cavePassable(cave,x,z,PLAYER_RADIUS)&&!silkBlocks(state,x,z,PLAYER_RADIUS);
  if(clear(p.x+dash.x,p.z))p.x+=dash.x;
  if(clear(p.x,p.z+dash.z))p.z+=dash.z;
 }
 hunt.rolling=dash.rolling;
 const held=grabber(hunt);
 const flares=(state.flares??[]).filter(f=>f.cave===p.cave&&(f.zone??0)===zone).map(f=>{const n=flareNow(f,p);return {x:n.x,z:n.z,r:FLARE.radius*n.lit};}).filter(f=>f.r>0);
 const hurt=amount=>{p.health=Math.max(0,(p.health??100)-amount);p.calm=0;};
 for(const c of hunt.crawlers){
  // One at a time: while something has hold of the player the others cannot land a blow.
  const env={cave,player:{x:p.x,z:p.z,facing:p.facing,lamp:hunt.lampShort<=0,invulnerable:dash.invulnerable||(held&&held!==c)||(p.y??0)>.6},flares};
  for(const e of stepCrawler(c,env,dt,rng)){
   if(e.type==='grab'||e.type==='slash'||e.type==='hurt')hurt(e.damage);
   if(e.type==='slash')hunt.lampShort=e.short;
   if(e.type==='drag'){if(cavePassable(cave,p.x+e.dx,p.z+e.dz,PLAYER_RADIUS)&&!silkBlocks(state,p.x+e.dx,p.z+e.dz,PLAYER_RADIUS)){p.x+=e.dx;p.z+=e.dz;}continue;}
   if(e.type==='hurt')continue;
   hunt.events.push({...e,crawler:c});
  }
 }
 // Rounds in flight land after their travel time.
 for(const s of hunt.shots){
  s.t-=dt;if(s.t>0)continue;
  if(s.target&&hunt.crawlers.includes(s.target)&&s.target.state!=='dead'){
   const r=hurtCrawler(s.target,PISTOL.damage,rng);
   hunt.events.push({type:'impact',crawler:s.target,x:s.x,z:s.z,dir:s.dir,killed:r.killed});
   if(r.killed)hunt.events.push({type:'killed',crawler:s.target});
   if(r.released)hunt.events.push({type:'release',crawler:s.target});
  }else hunt.events.push({type:'impact',x:s.x,z:s.z,dir:s.dir,rock:true});
 }
 hunt.shots=hunt.shots.filter(s=>s.t>0);
 // The dead melt away; another crawls out of a nest a while later, if the nests left can still breed one.
 const b=brood(state,cave);
 for(const c of hunt.crawlers)if(c.state==='dead'&&c.t>6.5){hunt.respawns.push((NEST.respawn[0]+(NEST.respawn[1]-NEST.respawn[0])*rng())*b.slow);}
 hunt.crawlers=hunt.crawlers.filter(c=>!(c.state==='dead'&&c.t>6.5));
 hunt.respawns=hunt.respawns.map(t=>t-dt);
 for(const t of hunt.respawns)if(t<=0&&hunt.crawlers.filter(c=>c.state!=='dead').length<b.cap){const c=spawn(hunt,cave,state,rng,b.live);if(c)hunt.events.push({type:'spawned',crawler:c,nest:c.nest??null});}
 hunt.respawns=hunt.respawns.filter(t=>t>0);
 if(hunt.events.length>200)hunt.events.splice(0,hunt.events.length-200);
}

/** Pull the trigger, aimed along the player's facing. The round is in flight for distance / bullet speed. */
export function fire(hunt,state){
 const p=state.player;if(p.cave==null||hunt.key==null)return {ok:false};
 const gun=gunOf(state);
 if(!fireGun(gun))return {ok:false,reason:gun.reloading?'Reloading…':gun.reserve?'':'Out of rounds. Press C to make 4 from 1 metal.'};
 const cave=caveLayout(state.seed,p.cave,p.zone??0),dir={x:Math.sin(p.facing),z:Math.cos(p.facing)};
 const from={x:p.x+dir.x*.5,z:p.z+dir.z*.5},end=shotEnd(cave,from,dir,hunt.crawlers.filter(c=>c.state!=='dead'));
 const distance=Math.hypot(end.x-from.x,end.z-from.z);
 const shot={t:distance/NEST.bullet,target:end.hit?.crawler??null,x:end.x,z:end.z,dir};
 hunt.shots.push(shot);hunt.events.push({type:'shot',x:end.x,z:end.z,dir,hit:!!shot.target,target:shot.target});
 return {ok:true};
}
export function reload(state){const g=gunOf(state);return reloadGun(g)?{ok:true,reason:'Reloading…'}:{ok:false,reason:g.reserve?'':'No rounds left. Press C to make some from metal.'};}
/** One metal into four rounds, from the pack. */
export function craftRounds(state){
 const g=gunOf(state);
 if(inv.count(state.inventory,'metal')<PISTOL.cost.metal)return {ok:false,reason:'Rounds need 1 metal.'};
 inv.remove(state.inventory,'metal',PISTOL.cost.metal);g.reserve+=PISTOL.makes;
 return {ok:true,reason:`+${PISTOL.makes} rounds · ${g.mag}/${g.reserve}`};
}
/** Roll toward (dx, dz) in cave space. Not while held. */
export function roll(hunt,state,dx,dz){
 if(state.player.cave==null||pinned(hunt))return false;
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
