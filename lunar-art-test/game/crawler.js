// Pure crawler behaviour and the player's answers to it (pistol, dodge roll). No rendering; one cave zone at a time.
import {CAVE_CELL,caveKey,lineVisible} from './caves.js';

/**
 * A blind hunter that hates light. It circles at the edge of sight, prefers your back, and commits only when its
 * patience runs out: it rears and shrieks (the tell), then lunges in a straight line. Light burns it slowly: it darts
 * out of the beam, and only a long burn or a flare drives it off; pinned in the beam up close, or shot, it attacks. From behind it grabs and drags;
 * from the front it slashes the headlamp dark.
 */
export const CRAWLER=Object.freeze({
 hp:60,radius:.55,reach:1.05,
 speed:{lurk:1.3,stalk:2.6,close:3.6,flee:8,drag:1.7},
 sense:24,ring:8,darkRing:4.5,patience:[3.5,6.5],
 lungeRange:[2.5,7],lungeSpeed:14,lungeTime:.42,shriekTime:.9,quickShriek:.55,recoverTime:1,
 throwDelay:.15,throwTime:.35,throwSpeed:7.5,
 burnRate:1.3,burnCool:.6,evadeTime:.5,evadeSpeed:6.5,evadeCooldown:1.1,provoked:5.5,
 recoilTime:.55,hitTime:.35,fleeTime:2.4,deathTime:1.4,
 grabDamage:7,slashDamage:16,shortTime:5,escapePerPress:.13,escapeDecay:.35,escapePerShot:.3,
 beamRange:11,beamCone:.86,auraRange:2.2,
 vulnerable:2,
});
export const PISTOL=Object.freeze({damage:12,range:16,magazine:6,reload:1.4,cooldown:.28,cost:{metal:1},makes:4,tolerance:.22});
export const DODGE=Object.freeze({time:.42,distance:3.6,cooldown:.85,invulnerable:.34});
export const PLAYER_RADIUS=.32;

const ANIM={lurk:'stalk',stalk:'stalk',close:'stalk',evade:'skitter',shriek:'shriek',lunge:'lunge',recover:'idle',grab:'grab',slash:'lunge',recoil:'recoil',flee:'skitter',hit:'hit',dead:'death'};
const cellOf=v=>Math.round(v/CAVE_CELL);
const between=(rng,[a,b])=>a+(b-a)*rng();

export function createCrawler(x,z,rng=Math.random){
 return {x,z,facing:0,state:'lurk',t:0,hp:CRAWLER.hp,patience:between(rng,CRAWLER.patience),lunge:{x:0,z:1},escape:0,goal:null,think:0,speed:0,anim:'idle',after:null,
  burn:0,evadeCool:0,evade:{x:1,z:0},tell:CRAWLER.shriekTime};
}
export const crawlerAnimation=c=>c.state==='lurk'&&c.speed<.2?'idle':ANIM[c.state];

export function walkable(cave,x,z,r=CRAWLER.radius*.6){
 return [[-r,-r],[r,-r],[-r,r],[r,r]].every(([dx,dz])=>cave.cells.has(caveKey(cellOf(x+dx),cellOf(z+dz))));
}

/** 0 (dark) to 1 (blazing) at a point: the headlamp beam and its close aura, and burning flares. */
export function exposure(env,x,z){
 const {cave,player,flares=[]}=env;let light=0;
 const dx=x-player.x,dz=z-player.z,d=Math.hypot(dx,dz);
 if(player.lamp&&d<CRAWLER.beamRange){
  const sees=lineVisible(cave,cellOf(player.x),cellOf(player.z),cellOf(x),cellOf(z));
  const along=d<.01?1:(dx*Math.sin(player.facing)+dz*Math.cos(player.facing))/d;
  if(sees&&along>CRAWLER.beamCone)light=Math.max(light,(1-d/CRAWLER.beamRange)*Math.min(1,(along-CRAWLER.beamCone)/.06));
  if(d<CRAWLER.auraRange)light=Math.max(light,.35);
 }
 for(const f of flares){const r=Math.hypot(x-f.x,z-f.z);if(r<f.r)light=Math.max(light,1-.5*r/f.r);}
 return light;
}

/** Walking distance in cells from the player to every reachable cell, cached until the player changes cell. */
function distances(cave,player){
 const from=caveKey(cellOf(player.x),cellOf(player.z));
 cave.crawlerField??=new Map();if(cave.crawlerField.has(from))return cave.crawlerField.get(from);
 const field=new Map([[from,0]]),queue=[from];
 for(let i=0;i<queue.length;i++){const [x,z]=queue[i].split(',').map(Number),d=field.get(queue[i]);
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const k=caveKey(x+dx,z+dz);if(cave.cells.has(k)&&!field.has(k)){field.set(k,d+1);queue.push(k);}}}
 if(cave.crawlerField.size>64)cave.crawlerField.clear();
 cave.crawlerField.set(from,field);return field;
}

/** Pick the neighbouring cell that best fits what the crawler wants right now. */
function choose(c,env,want,rng){
 const {cave,player}=env,field=distances(cave,player),cx=cellOf(c.x),cz=cellOf(c.z);
 const fx=Math.sin(player.facing),fz=Math.cos(player.facing);let best=null,bestScore=Infinity;
 for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
  const x=cx+dx,z=cz+dz,k=caveKey(x,z);if(!cave.cells.has(k))continue;
  if(dx&&dz&&!(cave.cells.has(caveKey(cx+dx,cz))&&cave.cells.has(caveKey(cx,cz+dz))))continue;
  const steps=field.get(k);if(steps==null)continue;
  const wx=x*CAVE_CELL,wz=z*CAVE_CELL,ox=wx-player.x,oz=wz-player.z,r=Math.hypot(ox,oz)||1;
  const ahead=(ox*fx+oz*fz)/r;
  let score=exposure(env,wx,wz)*12+rng()*.4;
  if(want.ring!=null)score+=Math.abs(steps*CAVE_CELL-want.ring)*.9+(want.behind?(ahead+1)*1.6:0);
  if(want.away)score-=steps*1.2;
  if(want.wander)score+=Math.hypot(wx-want.wander.x,wz-want.wander.z)*.5;
  if(score<bestScore){bestScore=score;best={x:wx,z:wz};}
 }
 return best;
}

function moveToward(c,env,goal,speed,dt){
 if(!goal){c.speed=0;return;}
 const dx=goal.x-c.x,dz=goal.z-c.z,d=Math.hypot(dx,dz);
 if(d<.05){c.speed=0;return;}
 const step=Math.min(d,speed*dt),nx=c.x+dx/d*step,nz=c.z+dz/d*step;
 if(walkable(env.cave,nx,nz)){c.x=nx;c.z=nz;}else if(walkable(env.cave,nx,c.z))c.x=nx;else if(walkable(env.cave,c.x,nz))c.z=nz;
 c.speed=step/Math.max(dt,1e-6);turn(c,Math.atan2(dx,dz),dt*8);
}
function turn(c,target,k){let d=target-c.facing;d=Math.atan2(Math.sin(d),Math.cos(d));c.facing+=d*Math.min(1,k);}
function enter(c,state,rng){c.state=state;c.t=0;c.think=0;if(state==='stalk')c.patience=between(rng,CRAWLER.patience);if(state!=='grab')c.escape=0;}

/** Rear for a short, angry tell: it was pinned in the beam or shot. */
function provoke(c,events,rng){enter(c,'shriek',rng);c.tell=CRAWLER.quickShriek;c.goal=null;events.push({type:'shriek',quick:true});}
/** Dart sideways, away from the middle of the beam. */
function evade(c,player,rng){
 const ox=c.x-player.x,oz=c.z-player.z,side=Math.sin(player.facing)*oz-Math.cos(player.facing)*ox>0?1:-1,len=Math.hypot(ox,oz)||1;
 enter(c,'evade',rng);c.evade={x:-oz/len*side,z:ox/len*side};c.evadeCool=CRAWLER.evadeCooldown;
}

/**
 * Advance one crawler. `env`: {cave, player:{x,z,facing,lamp,invulnerable}, flares:[{x,z,r}]}.
 * Returns events for the caller to apply: shriek, lunge, grab {damage}, drag {dx,dz}, slash {damage, short}, recoil, release, miss.
 */
export function stepCrawler(c,env,dt,rng=Math.random){
 const events=[],{player,cave}=env;c.t+=dt;
 if(c.state==='dead'){c.speed=0;return events;}
 const dx=player.x-c.x,dz=player.z-c.z,d=Math.hypot(dx,dz),toPlayer=Math.atan2(dx,dz);
 const lit=exposure(env,c.x,c.z),inFlare=(env.flares??[]).some(f=>Math.hypot(c.x-f.x,c.z-f.z)<f.r);
 const sees=lineVisible(cave,cellOf(c.x),cellOf(c.z),cellOf(player.x),cellOf(player.z));
 c.burn=Math.max(0,Math.min(1.5,c.burn+(lit>.05?lit*CRAWLER.burnRate:-CRAWLER.burnCool)*dt));c.evadeCool=Math.max(0,c.evadeCool-dt);
 const inRange=sees&&d>=CRAWLER.lungeRange[0]&&d<=CRAWLER.lungeRange[1];
 const think=want=>{c.think-=dt;if(c.think<=0||!c.goal){c.goal=choose(c,env,want,rng);c.think=.22;}};
 switch(c.state){
  case 'lurk':
   if(d<CRAWLER.sense){enter(c,'stalk',rng);break;}
   if(!c.wander||c.t>6||(c.t>1.5&&c.speed<.05)){c.wander={x:c.x+(rng()-.5)*16,z:c.z+(rng()-.5)*16};c.t=0;}
   think({wander:c.wander});moveToward(c,env,c.goal,CRAWLER.speed.lurk,dt);break;
  case 'stalk':case 'close':{
   if(inFlare||c.burn>=1){enter(c,'recoil',rng);c.burn=Math.min(c.burn,.5);events.push({type:'recoil'});break;}
   if(lit>.15){
    if(d<CRAWLER.provoked&&c.burn>.4&&inRange){provoke(c,events,rng);break;}
    if(c.evadeCool<=0){evade(c,player,rng);break;}
   }
   if(d>CRAWLER.sense*1.3){enter(c,'lurk',rng);break;}
   const dark=!player.lamp;c.state=dark?'close':'stalk';
   c.patience-=dt*(lit>.05?.5:dark?2.5:1);
   // Out of patience it creeps in to striking distance, still keeping to the dark and the player's back.
   const ready=c.patience<=0;
   think({ring:dark||ready?CRAWLER.darkRing:CRAWLER.ring,behind:!dark});moveToward(c,env,c.goal,dark||ready?CRAWLER.speed.close:CRAWLER.speed.stalk,dt);
   if(c.speed<.1)turn(c,toPlayer,dt*4);
   if(c.patience<=0&&inRange){enter(c,'shriek',rng);c.tell=CRAWLER.shriekTime;c.goal=null;events.push({type:'shriek'});}
   break;}
  case 'shriek':
   c.speed=0;turn(c,toPlayer,dt*10);
   if(inFlare){enter(c,'recoil',rng);events.push({type:'recoil'});break;}
   // The direction locks the moment it leaps, so a roll at the last instant carries the player out of the line.
   if(c.t>=c.tell){c.facing=toPlayer;c.lunge={x:dx/(d||1),z:dz/(d||1)};enter(c,'lunge',rng);events.push({type:'lunge'});}
   break;
  case 'lunge':{
   const step=CRAWLER.lungeSpeed*dt,nx=c.x+c.lunge.x*step,nz=c.z+c.lunge.z*step;
   const blocked=!walkable(cave,nx,nz);if(!blocked){c.x=nx;c.z=nz;c.speed=CRAWLER.lungeSpeed;}
   const hd=Math.hypot(player.x-c.x,player.z-c.z);
   if(hd<CRAWLER.reach+PLAYER_RADIUS&&!player.invulnerable){
    const fromBehind=(Math.sin(player.facing)*(c.x-player.x)+Math.cos(player.facing)*(c.z-player.z))/(hd||1)<.1;
    if(fromBehind||!player.lamp){enter(c,'grab',rng);events.push({type:'grab',damage:CRAWLER.grabDamage*.5});}
    else{enter(c,'slash',rng);events.push({type:'slash',damage:CRAWLER.slashDamage,short:CRAWLER.shortTime});}
   }else if(blocked||c.t>=CRAWLER.lungeTime){enter(c,'recover',rng);events.push({type:'miss'});}
   break;}
  case 'recover':
   c.speed=0;turn(c,toPlayer,dt*3);
   // Dazed for a moment after a miss, even in the light: the window to punish it.
   if(c.t>CRAWLER.recoverTime*.5&&(c.burn>=1||inFlare)){enter(c,'recoil',rng);events.push({type:'recoil'});}
   else if(c.t>=CRAWLER.recoverTime)enter(c,'stalk',rng);break;
  case 'slash':
   c.speed=0;if(c.t>=.45){enter(c,'flee',rng);c.goal=null;}break;
  case 'grab':{
   c.escape=Math.max(0,c.escape-CRAWLER.escapeDecay*dt);
   if(inFlare){enter(c,'recoil',rng);events.push({type:'release'},{type:'recoil'});break;}
   const goal=choose(c,{...env,player:{...player,lamp:false}},{away:true},()=>.5),before={x:c.x,z:c.z};
   moveToward(c,env,goal,CRAWLER.speed.drag,dt);c.facing=toPlayer;c.speed=CRAWLER.speed.drag;
   events.push({type:'drag',dx:c.x-before.x,dz:c.z-before.z},{type:'hurt',damage:CRAWLER.grabDamage*dt});
   break;}
  case 'evade':{
   if(inFlare||c.burn>=1){enter(c,'recoil',rng);c.burn=Math.min(c.burn,.5);events.push({type:'recoil'});break;}
   const step=CRAWLER.evadeSpeed*dt,nx=c.x+c.evade.x*step,nz=c.z+c.evade.z*step;
   if(walkable(cave,nx,nz)){c.x=nx;c.z=nz;c.speed=CRAWLER.evadeSpeed;}else{c.evade={x:-c.evade.x,z:-c.evade.z};c.speed=0;}
   turn(c,toPlayer,dt*6);
   if(c.t>=CRAWLER.evadeTime){enter(c,'stalk',rng);c.goal=null;}
   break;}
  case 'recoil':
   c.speed=0;
   // Torn off the helmet: it hangs on a moment while the astronaut wrenches, then is flung out ahead of them.
   if(c.thrown&&c.t>CRAWLER.throwDelay&&c.t<CRAWLER.throwDelay+CRAWLER.throwTime){
    const step=CRAWLER.throwSpeed*dt,nx=c.x+Math.sin(c.thrown.facing)*step,nz=c.z+Math.cos(c.thrown.facing)*step;
    if(walkable(cave,nx,nz)){c.x=nx;c.z=nz;c.speed=CRAWLER.throwSpeed;}
   }
   if(c.t>=CRAWLER.recoilTime+(c.thrown?CRAWLER.throwTime:0)){c.thrown=null;enter(c,'flee',rng);c.goal=null;}break;
  case 'hit':
   c.speed=0;if(c.t>=CRAWLER.hitTime){
    const next=c.after??'stalk';c.after=null;
    // Shot and not beaten: it comes for you, or darts off the line of fire and closes in.
    if(next==='angry'){if(inRange&&rng()<.6)provoke(c,events,rng);else{evade(c,player,rng);c.patience=0;}}
    else{enter(c,next,rng);c.goal=null;}
   }break;
  case 'flee':
   think({away:true});moveToward(c,env,c.goal,CRAWLER.speed.flee,dt);
   if(c.t>=CRAWLER.fleeTime&&lit<.05)enter(c,'stalk',rng);break;
 }
 c.anim=crawlerAnimation(c);
 return events;
}

/** A struggle key press while held. Returns true when the player breaks free; pass the player's facing to throw it. */
export function struggle(c,amount=CRAWLER.escapePerPress,facing=null){
 if(c.state!=='grab')return false;
 c.escape+=amount;if(c.escape<1)return false;
 enter(c,'recoil',Math.random);c.thrown=facing==null?null:{facing};return true;
}

/** Burning: health lost without the flinch of a shot, so a crawler in the flames keeps running. */
export function scorchCrawler(c,damage,rng=Math.random){
 if(c.state==='dead')return {killed:false};
 c.hp=Math.max(0,c.hp-damage);
 if(c.hp<=0){enter(c,'dead',rng);c.anim='death';return {killed:true};}
 return {killed:false};
}
/** Damage from a shot. Doubled while it rears or recovers from a missed lunge; a hit during the shriek breaks the attack. */
export function hurtCrawler(c,damage,rng=Math.random){
 if(c.state==='dead')return {killed:false,dealt:0};
 const exposed=c.state==='shriek'||c.state==='recover',dealt=damage*(exposed?CRAWLER.vulnerable:1);
 c.hp=Math.max(0,c.hp-dealt);
 if(c.hp<=0){enter(c,'dead',rng);c.anim='death';return {killed:true,dealt};}
 if(c.state==='grab'){if(struggle(c,CRAWLER.escapePerShot))return {killed:false,dealt,released:true};return {killed:false,dealt};}
 if(c.state!=='lunge'){c.after=c.state==='shriek'||c.state==='recover'||c.state==='flee'?'flee':'angry';enter(c,'hit',rng);c.anim='hit';}
 return {killed:false,dealt,interrupted:exposed};
}

// ---- The player's side ----
export const createGun=(reserve=12)=>({mag:PISTOL.magazine,reserve,cooldown:0,reloading:0});
export function stepGun(g,dt){
 g.cooldown=Math.max(0,g.cooldown-dt);
 if(g.reloading>0){g.reloading-=dt;if(g.reloading<=0){const n=Math.min(PISTOL.magazine-g.mag,g.reserve);g.mag+=n;g.reserve-=n;g.reloading=0;}}
}
export function reloadGun(g){if(g.reloading||g.mag>=PISTOL.magazine||!g.reserve)return false;g.reloading=PISTOL.reload;return true;}
/** Fire if ready. Starts a reload on an empty magazine. */
export function fireGun(g){
 if(g.cooldown>0||g.reloading)return false;
 if(!g.mag){reloadGun(g);return false;}
 g.mag--;g.cooldown=PISTOL.cooldown;if(!g.mag)reloadGun(g);return true;
}
/** Metal into rounds. `items` is an inventory map. */
export function craftAmmo(g,items){
 if((items.metal??0)<PISTOL.cost.metal)return false;
 items.metal-=PISTOL.cost.metal;g.reserve+=PISTOL.makes;return true;
}
/**
 * The first live crawler along the aim line, within the weapon's range and not behind rock. `cave` is null on the open
 * surface, where nothing stands in the way. Returns {crawler, distance} or null.
 */
export function shotTarget(cave,from,aim,crawlers,gun=PISTOL){
 const len=Math.hypot(aim.x,aim.z)||1,ax=aim.x/len,az=aim.z/len;let best=null;
 for(const c of crawlers){
  if(c.state==='dead')continue;
  const ox=c.x-from.x,oz=c.z-from.z,along=ox*ax+oz*az;if(along<0||along>gun.range)continue;
  const off=Math.abs(ox*az-oz*ax);if(off>CRAWLER.radius+gun.tolerance)continue;
  if(cave&&!lineVisible(cave,cellOf(from.x),cellOf(from.z),cellOf(c.x),cellOf(c.z)))continue;
  if(!best||along<best.distance)best={crawler:c,distance:along};
 }
 return best;
}
/** Where the shot stops: the target, or the first rock along the line. */
export function shotEnd(cave,from,aim,crawlers,gun=PISTOL){
 const hit=shotTarget(cave,from,aim,crawlers,gun),len=Math.hypot(aim.x,aim.z)||1,ax=aim.x/len,az=aim.z/len;
 if(hit)return {x:from.x+ax*hit.distance,z:from.z+az*hit.distance,hit};
 if(!cave)return {x:from.x+ax*gun.range,z:from.z+az*gun.range,hit:null};
 let d=0;while(d<gun.range&&cave.open.has(caveKey(cellOf(from.x+ax*d),cellOf(from.z+az*d))))d+=.25;
 return {x:from.x+ax*d,z:from.z+az*d,hit:null};
}

export const createDodge=()=>({t:0,cooldown:0,dx:0,dz:0});
export function startDodge(dodge,dirX,dirZ){
 if(dodge.t>0||dodge.cooldown>0)return false;
 const len=Math.hypot(dirX,dirZ);if(len<.01)return false;
 Object.assign(dodge,{t:DODGE.time,cooldown:DODGE.time+DODGE.cooldown,dx:dirX/len,dz:dirZ/len});return true;
}
/** Movement this step and whether the roll protects the player right now. */
export function stepDodge(dodge,dt){
 dodge.cooldown=Math.max(0,dodge.cooldown-dt);
 if(dodge.t<=0)return {x:0,z:0,rolling:false,invulnerable:false};
 const elapsed=DODGE.time-dodge.t;dodge.t=Math.max(0,dodge.t-dt);
 const speed=2*DODGE.distance/DODGE.time*(1-elapsed/DODGE.time);
 return {x:dodge.dx*speed*dt,z:dodge.dz*speed*dt,rolling:true,invulnerable:elapsed<DODGE.invulnerable};
}
