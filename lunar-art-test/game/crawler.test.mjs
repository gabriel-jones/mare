import test from 'node:test';
import assert from 'node:assert/strict';
import {CRAWLER,PISTOL,DODGE,createCrawler,stepCrawler,struggle,hurtCrawler,exposure,createGun,fireGun,stepGun,reloadGun,craftAmmo,shotTarget,createDodge,startDodge,stepDodge} from './crawler.js';
import {caveKey,caveLayout} from './caves.js';

/** A plain square hall, `half` cells from the middle to each wall, with an optional rock column. */
function hall(half=8,rock=[]){
 const cells=new Set();for(let x=-half;x<=half;x++)for(let z=-half;z<=half;z++)if(!rock.some(([rx,rz])=>rx===x&&rz===z))cells.add(caveKey(x,z));
 return {cells,open:new Set(cells)};
}
function seeded(n=7){return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
const run=(c,env,seconds,rng=seeded(),dt=1/30)=>{const all=[];for(let t=0;t<seconds;t+=dt)all.push(...stepCrawler(c,env,dt,rng));return all;};

test('the headlamp beam, its aura and flares light the dark; nothing else does', () => {
 const cave=hall(),player={x:0,z:0,facing:0,lamp:true};
 assert.ok(exposure({cave,player},0,6)>.3,'straight ahead in the beam');
 assert.equal(exposure({cave,player},0,-6),0,'behind is dark');
 assert.ok(exposure({cave,player},1,-1)>0,'the close aura');
 assert.equal(exposure({cave,player:{...player,lamp:false}},0,6),0,'a shorted lamp lights nothing');
 assert.ok(exposure({cave,player:{...player,lamp:false},flares:[{x:6,z:-6,r:6}]},6,-4)>.5,'a flare pool');
 const blocked=hall(8,[[0,2]]);
 assert.equal(exposure({cave:blocked,player},0,8),0,'rock shades the beam');
});

test('a crawler that senses the player stalks it from the dark, prefers its back and stays out of the beam', () => {
 const cave=hall(10),player={x:0,z:0,facing:0,lamp:true},c=createCrawler(0,-16);
 const env={cave,player};
 run(c,env,.2);assert.equal(c.state,'stalk');
 c.patience=1e9;run(c,env,8);
 const d=Math.hypot(c.x,c.z);
 assert.ok(d>CRAWLER.ring-3&&d<CRAWLER.ring+3,`circles near the ring, at ${d.toFixed(1)}`);
 assert.ok(c.z<0,'behind the player');
 assert.ok(exposure(env,c.x,c.z)<.45,'out of the beam');
 assert.equal(c.anim,'stalk');
});

test('the beam enrages it: held in the light it never backs off, and comes for the player', () => {
 const cave=hall(12),c=createCrawler(0,11);c.state='stalk';
 const env={cave,player:{x:0,z:0,facing:0,lamp:true}};
 const events=run(c,env,3);
 assert.ok(!events.some(e=>e.type==='recoil'),'the headlamp does not drive it off');
 assert.ok(events.some(e=>e.type==='shriek'||e.type==='lunge'),'it attacks');
 const near=createCrawler(0,5);near.state='stalk';
 assert.ok(run(near,env,.05).some(e=>e.type==='shriek'&&e.quick),'within reach in the beam it charges at once');
});

test('only a flare drives it back, and only for a moment', () => {
 const cave=hall(10),c=createCrawler(0,-8);Object.assign(c,{state:'stalk',burn:1.5,evadeCool:9,patience:9});
 const env={cave,player:{x:0,z:0,facing:Math.PI,lamp:true},flares:[{x:0,z:-8,r:3}]};
 const events=run(c,env,.1);
 assert.ok(events.some(e=>e.type==='recoil'));assert.equal(c.state,'recoil');assert.equal(c.anim,'recoil');
 run(c,env,CRAWLER.recoilTime+.1);assert.equal(c.state,'flee');assert.equal(c.anim,'skitter');
 run(c,{...env,flares:[]},CRAWLER.fleeTime+.1);
 assert.equal(c.state,'stalk','back on the hunt, beam or not');
});

test('pinned in the beam up close, or shot, it turns on the player', () => {
 const cave=hall(10),env={cave,player:{x:0,z:0,facing:0,lamp:true}};
 const c=createCrawler(0,4);Object.assign(c,{state:'stalk',burn:.5});
 const events=run(c,env,.05);
 assert.ok(events.some(e=>e.type==='shriek'&&e.quick));assert.equal(c.state,'shriek');assert.equal(c.tell,CRAWLER.quickShriek);
 const shot=createCrawler(0,-5);shot.state='stalk';shot.patience=9;
 hurtCrawler(shot,PISTOL.damage);assert.equal(shot.state,'hit');
 run(shot,env,CRAWLER.hitTime+.05);
 assert.ok(shot.state==='shriek'||(shot.state==='evade'&&shot.patience===0),`answers the shot: ${shot.state}`);
});

test('when patience runs out it rears and shrieks, then lunges where the player stood', () => {
 const cave=hall(10),player={x:0,z:0,facing:0,lamp:true},c=createCrawler(0,-5);c.state='stalk';c.patience=.01;
 const env={cave,player};
 const events=run(c,env,.1);
 assert.ok(events.some(e=>e.type==='shriek'));assert.equal(c.state,'shriek');assert.equal(c.anim,'shriek');
 const lunge=run(c,env,CRAWLER.shriekTime);
 assert.ok(lunge.some(e=>e.type==='lunge'));
 assert.ok(c.lunge.z>.95,'aimed at the player');
});

test('a lunge from behind grabs and drags; mashing breaks free', () => {
 const cave=hall(10),player={x:0,z:0,facing:0,lamp:true},c=createCrawler(0,-3);
 Object.assign(c,{state:'lunge',t:0,lunge:{x:0,z:1}});
 const env={cave,player},events=run(c,env,.3);
 assert.ok(events.some(e=>e.type==='grab'));assert.equal(c.state,'grab');assert.equal(c.anim,'grab');
 const held=run(c,env,1);
 assert.ok(held.some(e=>e.type==='drag'&&Math.hypot(e.dx,e.dz)>0),'drags the player');
 assert.ok(held.filter(e=>e.type==='hurt').reduce((s,e)=>s+e.damage,0)>CRAWLER.grabDamage*.9,'hurts while it holds');
 let free=false,presses=0;while(!free&&presses<40){free=struggle(c);presses++;}
 assert.ok(free,'escapes');assert.ok(presses>=6&&presses<=10,`takes a real effort: ${presses} presses`);
 assert.equal(c.state,'recoil');
});

test('breaking free tears it off the helmet and flings it out ahead of the player', () => {
 const cave=hall(10),player={x:0,z:0,facing:Math.PI/2,lamp:true},c=createCrawler(-.6,0);
 Object.assign(c,{state:'grab',t:0});
 let free=false;for(let i=0;i<40&&!free;i++)free=struggle(c,undefined,player.facing);
 assert.ok(free);assert.equal(c.state,'recoil');
 run(c,{cave,player},CRAWLER.throwDelay*.6);assert.ok(Math.abs(c.x+.6)<.01,'it hangs on while the astronaut wrenches');
 run(c,{cave,player},CRAWLER.throwTime+.1);
 assert.ok(c.x>1.5,`thrown ahead, now at x ${c.x.toFixed(1)}`);
});

test('a lunge from the front slashes and shorts the headlamp; a shorted lamp means it grabs instead', () => {
 const cave=hall(10),c=createCrawler(0,3);
 Object.assign(c,{state:'lunge',t:0,lunge:{x:0,z:-1}});
 const events=run(c,{cave,player:{x:0,z:0,facing:0,lamp:true}},.3);
 const slash=events.find(e=>e.type==='slash');
 assert.ok(slash);assert.equal(slash.short,CRAWLER.shortTime);assert.equal(slash.damage,CRAWLER.slashDamage);
 const d=createCrawler(0,3);Object.assign(d,{state:'lunge',t:0,lunge:{x:0,z:-1}});
 assert.ok(run(d,{cave,player:{x:0,z:0,facing:0,lamp:false}},.3).some(e=>e.type==='grab'));
});

test('rolling through the lunge makes it miss and leaves it exposed', () => {
 const cave=hall(10),c=createCrawler(0,-4);Object.assign(c,{state:'lunge',t:0,lunge:{x:0,z:1}});
 const events=run(c,{cave,player:{x:0,z:0,facing:0,lamp:true,invulnerable:true}},CRAWLER.lungeTime+.1);
 assert.ok(events.some(e=>e.type==='miss'));assert.equal(c.state,'recover');
 const before=c.hp,shot=hurtCrawler(c,PISTOL.damage);
 assert.equal(before-c.hp,PISTOL.damage*CRAWLER.vulnerable);assert.equal(c.state,'hit');assert.ok(shot.interrupted);
});

test('a shot during the shriek interrupts the attack; enough shots kill it', () => {
 const c=createCrawler(0,5);c.state='shriek';
 hurtCrawler(c,PISTOL.damage);assert.equal(c.state,'hit');assert.equal(c.after,'flee');
 let shots=1;while(c.state!=='dead'&&shots<20){hurtCrawler(c,PISTOL.damage);shots++;}
 assert.equal(c.state,'dead');assert.equal(c.anim,'death');assert.ok(shots>=4&&shots<=6,`${shots} shots`);
});

test('a flare ends a grab and keeps it at bay', () => {
 const cave=hall(10),c=createCrawler(0,-1);Object.assign(c,{state:'grab',t:0});
 const events=run(c,{cave,player:{x:0,z:0,facing:0,lamp:false},flares:[{x:0,z:-1,r:6}]},.1);
 assert.ok(events.some(e=>e.type==='release'));assert.equal(c.state,'recoil');
});

test('the pistol: a magazine, reloads from the reserve, rounds crafted from metal', () => {
 const g=createGun(3);
 for(let i=0;i<PISTOL.magazine;i++){assert.equal(fireGun(g),true);stepGun(g,PISTOL.cooldown);}
 assert.equal(g.mag,0);assert.ok(g.reloading>0,'empty starts a reload');assert.equal(fireGun(g),false);
 stepGun(g,PISTOL.reload+.01);assert.equal(g.mag,3);assert.equal(g.reserve,0);
 assert.equal(reloadGun(g),false,'nothing left to load');
 const items={metal:2};assert.equal(craftAmmo(g,items),true);assert.equal(g.reserve,PISTOL.makes);assert.equal(items.metal,1);
 assert.equal(craftAmmo(g,{metal:0}),false);
});

test('shots find the first crawler on the aim line and stop at rock', () => {
 const cave=hall(10),near=createCrawler(0,4),far=createCrawler(0,9),wide=createCrawler(3,4);
 assert.equal(shotTarget(cave,{x:0,z:0},{x:0,z:1},[far,near,wide]).crawler,near);
 assert.equal(shotTarget(cave,{x:0,z:0},{x:0,z:-1},[near]),null);
 assert.equal(shotTarget(hall(10,[[0,1]]),{x:0,z:0},{x:0,z:1},[near]),null);
});

test('the dodge roll covers its distance, protects early, then cools down', () => {
 const d=createDodge();assert.equal(startDodge(d,1,0),true);assert.equal(startDodge(d,1,0),false);
 let x=0,early=null;for(let t=0;t<DODGE.time+.1;t+=1/60){const s=stepDodge(d,1/60);x+=s.x;early??=s.invulnerable;}
 assert.ok(Math.abs(x-DODGE.distance)<.25,`rolled ${x.toFixed(2)} m`);assert.equal(early,true);
 assert.equal(startDodge(d,1,0),false,'cooling down');
 for(let t=0;t<DODGE.cooldown;t+=1/60)stepDodge(d,1/60);assert.equal(startDodge(d,0,1),true);
});

test('in a real cave zone it finds its way round the rock to the player and keeps to walkable cells', () => {
 const cave=caveLayout(1,0,1),room=cave.rooms[2],player={x:cave.start.x*2,z:cave.start.z*2,facing:Math.PI/2,lamp:true};
 const c=createCrawler(room.x*2,room.z*2),rng=seeded(3);let shrieked=false;
 for(let t=0;t<20&&!shrieked;t+=1/30){shrieked=stepCrawler(c,{cave,player},1/30,rng).some(e=>e.type==='shriek');assert.ok(cave.cells.has(caveKey(Math.round(c.x/2),Math.round(c.z/2))));}
 assert.ok(shrieked,'commits to an attack');
 assert.ok(Math.hypot(c.x-player.x,c.z-player.z)<=CRAWLER.lungeRange[1]);
});

// ---- The hunt in the game's caves ----
import {createState,serialize,deserialize} from './sim.js';
import {NEST,createHunt,stepHunt,fire,wrench,roll,grabbedBy,pinned} from './hunt.js';
import * as inv from './inventory.js';
function underground(zone=0){
 const s=createState(1847),start=caveLayout(s.seed,0,zone).start;
 Object.assign(s.player,{cave:0,zone,x:start.x*2,z:start.z*2+(zone?2:1),facing:0});return s;
}
test('each cave zone is hunted by more crawlers the deeper it lies, spawned well away from the player',()=>{
 for(const zone of [0,1,2]){
  const s=underground(zone),h=createHunt();stepHunt(h,s,1/30,seeded(zone+3));
  assert.equal(h.crawlers.filter(c=>c.kind!=='centipede').length,NEST.count[zone]);
  for(const c of h.crawlers)assert.ok(Math.hypot(c.x-s.player.x,c.z-s.player.z)>=6,'not on top of the player');
 }
});
test('leaving the caves clears the hunt, and coming back rolls a fresh one',()=>{
 const s=underground(1),h=createHunt();stepHunt(h,s,1/30,seeded());
 delete s.player.cave;stepHunt(h,s,1/30,seeded());assert.equal(h.crawlers.length,0);
 s.player.cave=0;stepHunt(h,s,1/30,seeded());assert.equal(h.crawlers.filter(c=>c.kind!=='centipede').length,NEST.count[1]);
});
test('a round lands only after its flight time and a kill brings a replacement later',()=>{
 const s=underground(0),h=createHunt(),rng=seeded();stepHunt(h,s,1/30,rng);
 const c=h.crawlers[0];c.x=s.player.x;c.z=s.player.z+9;c.state='lurk';
 s.player.facing=0;
 // Hold the crawler still so only the shooting is under test.
 const before=c.hp;assert.equal(fire(h,s).ok,true);assert.equal(c.hp,before,'not hit at the muzzle');
 assert.equal(h.shots.length,1);h.crawlers.forEach(k=>k.state='dead');c.state='lurk';
 const hit=h.shots[0].t;stepHunt(h,s,hit+.01,rng);
 assert.ok(c.hp<before||h.events.some(e=>e.type==='impact'),'the round arrived');
 c.hp=0;c.state='dead';c.t=7;stepHunt(h,s,1/30,rng);
 assert.ok(!h.crawlers.includes(c),'the corpse melts away');assert.ok(h.respawns.length>=1);
 stepHunt(h,s,NEST.respawn[1]+1,rng);assert.ok(h.events.some(e=>e.type==='spawned'));
});
test('a grab hurts the suit, pins the player, and mashing breaks free',()=>{
 const s=underground(0),h=createHunt(),rng=seeded();stepHunt(h,s,1/30,rng);
 const c=h.crawlers[0];Object.assign(c,{state:'grab',t:0,escape:0,x:s.player.x,z:s.player.z-.6});
 const health=s.player.health??100;stepHunt(h,s,.5,rng);
 assert.ok(s.player.health<health,'held hurts');assert.ok(pinned(h));assert.equal(grabbedBy(h),c);
 assert.equal(roll(h,s,1,0),false,'cannot roll while held');
 let free=false;for(let i=0;i<40&&!free;i++)free=wrench(h,s);
 assert.ok(free);assert.ok(pinned(h),'still tearing it off');assert.equal(c.thrown.facing,s.player.facing);
 stepHunt(h,s,1,rng);assert.ok(!pinned(h));
});
