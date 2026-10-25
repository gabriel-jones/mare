// What hunts on Mars, in place of the crawler. Pure behaviour, no rendering; horror-view.js draws it.
import {CAVE_CELL,lineVisible} from './caves.js';
import {CRAWLER,PARRY,PLAYER_RADIUS,between,choose,enter,exposure,moveToward,sizeOf,stepCrawler,turn,walkable} from './crawler.js';

/**
 * A heap of tentacles round a ring of mouths. It does not leap: it hauls itself along arm over arm in surges, and
 * strikes from out of reach with one long whip-arm it keeps coiled over its back. It shares the crawler's states (and
 * so every caller's handling of them) with its own meaning for each:
 *  stalk/close  surging after the player, keeping to the dark and their back
 *  shriek       the tell: the whip-arm drawn back and quivering (or, `slam`, every arm raised)
 *  lunge        the whip-arm flies out to where the player stood when it struck; the body stays put
 *  grab         snared: the arm reels the player in (`reel`), then the mouths feed (`reel` false)
 *  slash        the slam: arms brought down on whoever is in front of it
 *  recover      the whip-arm missed and is dragged back: the moment to punish it
 *  flee         a jet: it squirts away backwards behind a cloud of ink
 * Light angers it rather than driving it off; only a flare or the flame jet makes it let go and flee.
 */
export const HORROR=Object.freeze({
 speed:{lurk:1.1,stalk:2.4,close:3.2,flee:11},
 stroke:1.15,ring:6,closeRing:4,patience:[1.2,2.6],sense:30,
 lashRange:[2.4,7],lashSpeed:22,lashHit:.6,coilTime:.8,quickCoil:.45,
 reelSpeed:3.6,reelDamage:3,holdDamage:9,
 slamRange:1.5,slamTell:.55,slamTime:.6,slamDamage:15,slamCool:2.5,short:2.5,
 retractTime:1.2,jetTime:.7,
});
/** How hard it hauls this instant, about 1 on average: a pull of the arms, a glide, a pull. Advances its stroke. */
export function surge(c,dt){
 c.stroke=((c.stroke??Math.random())+dt*HORROR.stroke/Math.sqrt(Math.max(1,sizeOf(c))))%1;
 return (.25+1.5*Math.max(0,Math.sin(c.stroke*Math.PI*2)))/.7275;
}
const cellOf=v=>Math.round(v/CAVE_CELL);
const rootOf=c=>Math.sqrt(Math.max(1,sizeOf(c)));
/** How far its whip-arm reaches: the bigger, the further. */
export const lashReach=c=>HORROR.lashRange[1]*rootOf(c);
/** Leave a strike behind: the whip-arm is only out while it flies, holds or is dragged back. */
function go(c,state,rng){enter(c,state,rng);if(state!=='lunge'&&state!=='grab'&&state!=='recover')c.lash=null;if(state!=='grab')c.reel=false;}

/** The tell before a strike: the whip-arm drawn back (or, `slam`, every arm raised over the player). */
export function coil(c,{slam=false,quick=false}={}){go(c,'shriek',Math.random);c.slam=slam;c.tell=slam?HORROR.slamTell:quick?HORROR.quickCoil:HORROR.coilTime;c.goal=null;}
/** Squirt away from (x, z) behind a cloud of ink. */
export function jet(c,from){go(c,'flee',Math.random);const dx=c.x-from.x,dz=c.z-from.z,d=Math.hypot(dx,dz)||1;c.jet={x:dx/d,z:dz/d};c.ink=(c.ink??0)+1;c.goal=null;}

/** One step, with the crawler's `env` and events (see stepCrawler), plus `devour` when the reeled-in player reaches its mouths. */
export function stepHorror(c,env,dt,rng=Math.random){
 const events=[],{player,cave}=env;
 if(c.state==='dead'||c.state==='emerge'||c.state==='march')return stepCrawler(c,env,dt,rng);
 c.t+=dt;
 if(c.shocked>0&&c.state!=='grab'){c.t-=dt;c.speed=0;c.anim='hit';return events;}
 c.slamCool=Math.max(0,(c.slamCool??0)-dt);
 const size=sizeOf(c),root=rootOf(c),pull=surge(c,dt);
 const dx=player.x-c.x,dz=player.z-c.z,d=Math.hypot(dx,dz),toPlayer=Math.atan2(dx,dz);
 const lit=exposure(env,c.x,c.z),inFlare=(env.flares??[]).some(f=>Math.hypot(c.x-f.x,c.z-f.z)<f.r);
 const sees=lineVisible(cave,cellOf(c.x),cellOf(c.z),cellOf(player.x),cellOf(player.z));
 const reach=CRAWLER.reach*size+PLAYER_RADIUS,canLash=sees&&d>=HORROR.lashRange[0]*root&&d<=lashReach(c),canSlam=d<=HORROR.slamRange*size+PLAYER_RADIUS&&c.slamCool<=0;
 const front=(Math.sin(player.facing??0)*(c.x-player.x)+Math.cos(player.facing??0)*(c.z-player.z))/(d||1)>=.1;
 const think=want=>{c.think-=dt;if(c.think<=0||!c.goal){c.goal=choose(c,env,want,rng);c.think=.3;}};
 const recoil=()=>{go(c,'recoil',rng);events.push({type:'recoil'});};
 switch(c.state){
  case 'lurk':
   if(d<HORROR.sense){go(c,'stalk',rng);break;}
   if(!c.wander||c.t>7||(c.t>1.5&&c.speed<.05)){c.wander={x:c.x+(rng()-.5)*14,z:c.z+(rng()-.5)*14};c.t=0;}
   think({wander:c.wander});moveToward(c,env,c.goal,HORROR.speed.lurk*pull,dt);break;
  case 'evade':go(c,'stalk',rng);break;
  case 'stalk':case 'close':{
   if(inFlare){recoil();break;}
   if(d>HORROR.sense*1.3){go(c,'lurk',rng);break;}
   // Caught in the beam within reach of the whip-arm, it strikes at once.
   if(lit>.15&&canLash&&d<HORROR.lashRange[1]){coil(c,{quick:true});events.push({type:'shriek',quick:true});break;}
   const dark=!player.lamp;c.state=dark?'close':'stalk';
   c.patience-=dt*(lit>.05||dark?2:1);
   const ready=c.patience<=0;
   think({ring:(ready||dark?HORROR.closeRing:HORROR.ring)*root,behind:!dark});
   moveToward(c,env,c.goal,(ready||dark?HORROR.speed.close:HORROR.speed.stalk)*pull,dt);
   if(c.speed<.1)turn(c,toPlayer,dt*3);
   if(canSlam&&!player.invulnerable){coil(c,{slam:true});events.push({type:'shriek',slam:true});}
   else if(ready&&canLash){coil(c);events.push({type:'shriek'});}
   break;}
  case 'shriek':
   c.speed=0;turn(c,toPlayer,dt*6);
   if(inFlare){recoil();break;}
   if(c.t<c.tell)break;
   if(c.slam){
    // Arms down on whatever is in front of it now; the guard turns the blow.
    go(c,'slash',rng);c.slamCool=HORROR.slamCool;
    if(d<=HORROR.slamRange*size+PLAYER_RADIUS+.4&&!player.invulnerable){
     if(player.guard&&front){const perfect=player.guard==='perfect';c.dazed=0;events.push({type:'parried',perfect,zap:perfect?PARRY.perfectZap:PARRY.zap});go(c,'recover',rng);c.dazed=(perfect?PARRY.perfectDaze:PARRY.daze)/root;}
     else events.push({type:'slash',damage:HORROR.slamDamage,short:HORROR.short});
    }else events.push({type:'miss'});
    break;
   }
   // The whip-arm flies at where the player stands now, as far as it reaches: a roll takes them out of its line.
   {const len=Math.min(d,lashReach(c));c.lash={x:c.x+dx/(d||1)*len,z:c.z+dz/(d||1)*len,len,out:0};c.facing=toPlayer;go(c,'lunge',rng);events.push({type:'lunge'});}
   break;
  case 'lunge':{
   c.speed=0;const l=c.lash;if(!l){go(c,'stalk',rng);break;}
   l.out=Math.min(1,c.t*HORROR.lashSpeed/Math.max(.5,l.len));
   if(l.out<1)break;
   const missBy=Math.hypot(player.x-l.x,player.z-l.z);
   if(missBy<PLAYER_RADIUS+HORROR.lashHit*Math.min(1.5,root)&&!player.invulnerable){
    if(player.guard&&front){
     const perfect=player.guard==='perfect';events.push({type:'parried',perfect,zap:perfect?PARRY.perfectZap:PARRY.zap});
     go(c,'recover',rng);c.dazed=(perfect?PARRY.perfectDaze:PARRY.daze)/root;
    }else{go(c,'grab',rng);c.reel=true;c.lash={...l,x:player.x,z:player.z};events.push({type:'grab',damage:HORROR.reelDamage});}
   }else{go(c,'recover',rng);events.push({type:'miss'});}
   break;}
  case 'grab':{
   c.escape=Math.max(0,c.escape-CRAWLER.escapeDecay*dt);c.speed=0;c.facing=toPlayer;
   if(inFlare){go(c,'recoil',rng);events.push({type:'release'},{type:'recoil'});break;}
   if(c.lash){c.lash.x=player.x;c.lash.z=player.z;}
   if(c.reel){
    // Hauled in hand over hand; it creeps to meet them where rock stops the pull.
    if(d>reach+.05){const k=Math.min(d-reach,HORROR.reelSpeed*dt)/(d||1);events.push({type:'drag',dx:-dx*k,dz:-dz*k},{type:'hurt',damage:HORROR.reelDamage*dt});moveToward(c,env,player,HORROR.reelSpeed*.35,dt);c.facing=toPlayer;}
    else{c.reel=false;c.t=0;events.push({type:'devour'});}
   }else events.push({type:'hurt',damage:HORROR.holdDamage*dt});
   break;}
  case 'slash':
   c.speed=0;if(c.t>=HORROR.slamTime){go(c,'stalk',rng);c.patience*=.5;}break;
  case 'recover':
   c.speed=0;turn(c,toPlayer,dt*2);
   if(c.t>HORROR.retractTime*.5&&inFlare){recoil();break;}
   if(c.t>=(c.dazed||HORROR.retractTime)){c.dazed=0;go(c,'stalk',rng);c.patience*=.4;}break;
  case 'recoil':
   c.speed=0;
   // Torn off the player: flung away, then off in a jet (or, parried, left reeling).
   if(c.thrown&&c.t>CRAWLER.throwDelay&&c.t<CRAWLER.throwDelay+CRAWLER.throwTime){
    const step=CRAWLER.throwSpeed*dt/root,nx=c.x+Math.sin(c.thrown.facing)*step,nz=c.z+Math.cos(c.thrown.facing)*step;
    if(walkable(cave,nx,nz)){c.x=nx;c.z=nz;c.speed=CRAWLER.throwSpeed/root;}
   }
   if(c.t>=CRAWLER.recoilTime*.6+(c.thrown?CRAWLER.throwTime:0)){c.thrown=null;if(c.daze){const k=c.daze;go(c,'recover',rng);c.dazed=k;c.daze=0;}else jet(c,player);}
   break;
  case 'hit':
   c.speed=0;if(c.t>=CRAWLER.hitTime){
    const next=c.after??'stalk';c.after=null;
    if(next==='angry'){if(canLash&&rng()<CRAWLER.angry){coil(c,{quick:true});events.push({type:'shriek',quick:true});}else{go(c,'stalk',rng);c.patience=0;c.goal=null;}}
    else if(next==='flee')jet(c,player);
    else{go(c,next,rng);c.goal=null;}
   }break;
  case 'flee':{
   // The jet: fast and straight at first, sliding to a stop; rock turns it.
   if(!c.jet)jet(c,player);
   const k=Math.max(0,1-c.t/HORROR.jetTime),step=HORROR.speed.flee*k*k*dt/Math.sqrt(root),nx=c.x+c.jet.x*step,nz=c.z+c.jet.z*step;
   if(walkable(cave,nx,nz)){c.x=nx;c.z=nz;c.speed=step/Math.max(dt,1e-6);}
   else{const turned={x:-c.jet.z,z:c.jet.x};c.jet=walkable(cave,c.x+turned.x*.5,c.z+turned.z*.5)?turned:{x:-turned.x,z:-turned.z};c.speed=0;}
   c.facing=Math.atan2(-c.jet.x,-c.jet.z);
   if(c.t>=HORROR.jetTime&&!inFlare){go(c,'stalk',rng);c.patience=between(rng,HORROR.patience);c.jet=null;}
   else if(c.t>=HORROR.jetTime*2){go(c,'stalk',rng);c.jet=null;}
   break;}
  default:go(c,'stalk',rng);
 }
 c.anim=c.state;
 return events;
}
