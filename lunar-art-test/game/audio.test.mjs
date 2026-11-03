import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {soundMix,LAYERS,effectRoute,falloff} from './audio.js';

test('every ambience layer and breathing role has an installed clip',()=>{
 const {clips}=JSON.parse(readFileSync(new URL('./assets/audio/audio.json',import.meta.url)));
 for(const k of [...LAYERS,'breath.calm','breath.exerted','breath.panic']){
  assert.ok(clips[k],k);assert.ok(existsSync(new URL(`./assets/audio/${clips[k].file}`,import.meta.url)),clips[k].file);
 }
});
test('day brings music; night brings the dread',()=>{
 const day=soundMix({sun:.8}),night=soundMix({sun:-.6});
 assert.ok(day.level.day>.5&&day.level.dread===0);
 assert.equal(night.level.day,0);
 assert.ok(night.level.dread>.4);
});
test('a raid swells the dread',()=>{
 const calm=soundMix({sun:-.6}),raid=soundMix({sun:-.6,raid:true});
 assert.ok(raid.level.dread>calm.level.dread);
});
test('caves close in: no daylight, skittering that quickens as something approaches',()=>{
 const far=soundMix({sun:.8,where:'cave'}),close=soundMix({sun:.8,where:'cave',threat:1});
 assert.equal(far.level.day,0);assert.equal(far.open,0);assert.ok(far.level.cave>.5);
 assert.ok(close.density.skitter>far.density.skitter);assert.ok(close.level.dread>far.level.dread);
});
test('habitats bring the air back and muffle the outside; Mars has wind',()=>{
 const inside=soundMix({sun:.8,where:'habitat'});
 assert.ok(inside.level.habitat>.5);assert.equal(inside.open,0);
 assert.equal(soundMix({sun:.8}).level.mars,0);assert.equal(soundMix({sun:.8,mars:true}).level.mars,1);
});
test('breathing: calm at rest, exerted after running, panicked when hurt, grabbed or hunted',()=>{
 assert.equal(soundMix({}).breath,0);
 assert.equal(soundMix({exert:1}).breath,.5);
 for(const s of [{hurt:1},{grabbed:true},{threat:1}])assert.ok(soundMix(s).breath>.9,JSON.stringify(s));
 assert.ok(soundMix({health:20}).breath>.8);
});
test('breathing is only heard in caves',()=>{
 assert.equal(soundMix({where:'cave'}).breathLevel,1);
 for(const where of ['surface','habitat','ship'])assert.equal(soundMix({where,exert:1}).breathLevel,0);
});
test('every effect the game plays has an installed clip with takes inside it',()=>{
 const {effects}=JSON.parse(readFileSync(new URL('./assets/audio/sfx.json',import.meta.url)));
 const used=readFileSync(new URL('./main.js',import.meta.url),'utf8');
 for(const k of ['step-ground','step-floor','land','roll','hurt','pistol','smg','rifle','flamer','rail-charge','rail','arc','swing','slash','reload','dry','impact','parry','flare','shriek','lunge','bite','death','hiss','burst','emerge','build','built','place','dismantle','turret','zap','airlock','dig','hum','launch']){
  const e=effects[k];assert.ok(e,k);assert.ok(existsSync(new URL(`./assets/audio/${e.file}`,import.meta.url)),e.file);
  for(const [a,b] of e.hits??[])assert.ok(a>=0&&b>a&&b<=e.duration+.01,`${k} take ${a}-${b}`);
  assert.ok(used.includes(`'${k}'`),`${k} is never played`);
 }
});
test('in vacuum your own actions come through the suit and the rest through the ground; air carries everything',()=>{
 assert.equal(effectRoute('pistol','surface'),'suit');assert.equal(effectRoute('step-ground','surface'),'suit');
 assert.equal(effectRoute('turret','surface'),'ground');assert.equal(effectRoute('launch','surface'),'ground');
 for(const where of ['habitat','cave','ship'])assert.equal(effectRoute('turret',where),'air');
 assert.equal(effectRoute('turret','surface',true),'air');assert.equal(effectRoute('place','surface'),'air');
});
test('effects fade with distance and vanish far away',()=>{
 assert.equal(falloff(0),1);assert.equal(falloff(3),1);assert.ok(falloff(10)<falloff(5));assert.equal(falloff(40),0);assert.equal(falloff(100),0);
});
