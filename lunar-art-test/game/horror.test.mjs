import test from 'node:test';
import assert from 'node:assert/strict';
import {CRAWLER,createCrawler,hurtCrawler,asKind} from './crawler.js';
import {HORROR,stepHorror,coil,surge,lashReach} from './horror.js';
import {caveKey} from './caves.js';

function hall(half=10){const cells=new Set();for(let x=-half;x<=half;x++)for(let z=-half;z<=half;z++)cells.add(caveKey(x,z));return {cells,open:new Set(cells)};}
function seeded(n=7){return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
/** Runs `c` against `player` for `seconds`, applying drags to the player as the cave hunt does. */
function run(c,env,seconds,until=null,dt=1/60){const all=[];for(let t=0;t<seconds;t+=dt){const ev=stepHorror(c,env,dt,seeded());for(const e of ev)if(e.type==='drag'){env.player.x+=e.dx;env.player.z+=e.dz;}all.push(...ev);if(until?.(c,all))break;}return all;}

test('it strikes from out of reach with its whip-arm and reels the player in to feed; the body never leaps', () => {
 const cave=hall(),player={x:0,z:0,facing:Math.PI,lamp:true},c=createCrawler(0,5);
 const env={cave,player};coil(c);
 const before={x:c.x,z:c.z},ev=run(c,env,3,(c)=>c.state==='grab'&&!c.reel);
 assert.ok(ev.some(e=>e.type==='lunge'));assert.ok(ev.some(e=>e.type==='grab'));assert.ok(ev.some(e=>e.type==='devour'));
 assert.ok(Math.hypot(c.x-before.x,c.z-before.z)<2,'it hauls, it does not spring');
 assert.ok(Math.hypot(player.x-c.x,player.z-c.z)<=CRAWLER.reach+.4,'pulled to its mouths');
 assert.ok(ev.filter(e=>e.type==='hurt').length>0);
});

test('stepping out of the line makes it miss and leaves it exposed while it drags the arm back', () => {
 const cave=hall(),player={x:0,z:0,facing:Math.PI,lamp:true},c=createCrawler(0,5),env={cave,player};
 coil(c);run(c,env,HORROR.coilTime+.02);assert.equal(c.state,'lunge');
 player.x=2.5;run(c,env,.5,c=>c.state!=='lunge');
 assert.equal(c.state,'recover');
 const hp=c.hp;hurtCrawler(c,10,()=>.99);assert.equal(hp-c.hp,10*CRAWLER.vulnerable);
});

test('a parry turns the whip-arm: no snare, and it is left reeling', () => {
 const cave=hall(),player={x:0,z:0,facing:0,lamp:true,guard:'perfect'},c=createCrawler(0,5),env={cave,player};
 coil(c);const ev=run(c,env,2,c=>c.state==='recover');
 assert.ok(ev.some(e=>e.type==='parried'&&e.perfect));assert.ok(!ev.some(e=>e.type==='grab'));
 assert.ok(c.dazed>HORROR.retractTime);
});

test('close in, it raises every arm and slams them down', () => {
 const cave=hall(),player={x:0,z:0,facing:0,lamp:true},c=createCrawler(0,1.2),env={cave,player};
 c.state='stalk';c.patience=0;
 const ev=run(c,env,2,(c,all)=>all.some(e=>e.type==='slash'));
 assert.ok(ev.some(e=>e.type==='shriek'&&e.slam));assert.ok(ev.some(e=>e.type==='slash'&&e.damage===HORROR.slamDamage));
});

test('a flare makes it let go and jet away', () => {
 const cave=hall(),player={x:0,z:0,facing:0,lamp:true},c=createCrawler(0,1),env={cave,player,flares:[]};
 c.state='grab';c.reel=false;c.t=0;
 env.flares.push({x:0,z:1,r:3});
 const ev=run(c,env,.05);assert.ok(ev.some(e=>e.type==='release'));
 env.flares.length=0;
 run(c,env,1.2,c=>c.state==='flee'&&c.t>.5);
 assert.equal(c.state,'flee');assert.ok(Math.hypot(c.x,c.z)>3,'squirted well clear');
});

test('it hauls itself along in surges, about its set pace on average, slower the bigger it is', () => {
 const small=createCrawler(0,0),big=asKind(createCrawler(0,0),'matron');let a=[],sum=0;
 for(let i=0;i<600;i++){const s=surge(small,1/60);a.push(s);sum+=s;}
 assert.ok(Math.abs(sum/600-1)<.15);assert.ok(Math.max(...a)>1.8&&Math.min(...a)<.4,'pulls and glides');
 assert.ok(lashReach(big)>lashReach(small));
});
