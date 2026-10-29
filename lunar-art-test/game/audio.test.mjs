import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {soundMix,LAYERS} from './audio.js';

test('every ambience layer and breathing role has an installed clip',()=>{
 const {clips}=JSON.parse(readFileSync(new URL('./assets/audio/audio.json',import.meta.url)));
 for(const k of [...LAYERS,'breath.calm','breath.exerted','breath.panic']){
  assert.ok(clips[k],k);assert.ok(existsSync(new URL(`./assets/audio/${clips[k].file}`,import.meta.url)),clips[k].file);
 }
});
test('day brings music and mission radio; night turns the radio to static, clicks and dread',()=>{
 const day=soundMix({sun:.8}),night=soundMix({sun:-.6});
 assert.ok(day.level.day>.5&&day.level.chatter>.3&&day.level.dread===0);
 assert.equal(night.level.day,0);assert.equal(night.level.chatter,0);
 assert.ok(night.level.static>0&&night.level.clicks>.5&&night.level.dread>.4);
});
test('a raid silences the mission radio and swells the dread',()=>{
 const calm=soundMix({sun:-.6}),raid=soundMix({sun:-.6,raid:true});
 assert.ok(raid.level.dread>calm.level.dread);assert.equal(soundMix({sun:.8,raid:true}).level.chatter,0);
});
test('caves close in: no daylight, skittering that quickens as something approaches',()=>{
 const far=soundMix({sun:.8,where:'cave'}),close=soundMix({sun:.8,where:'cave',threat:1});
 assert.equal(far.level.day,0);assert.equal(far.open,0);assert.ok(far.level.cave>.5);
 assert.ok(close.density.skitter>far.density.skitter);assert.ok(close.level.dread>far.level.dread);
});
test('habitats bring the air back and muffle the outside; Mars has wind',()=>{
 const inside=soundMix({sun:.8,where:'habitat'});
 assert.ok(inside.level.habitat>.5);assert.equal(inside.open,0);assert.ok(inside.breathLevel<1);
 assert.equal(soundMix({sun:.8}).level.mars,0);assert.equal(soundMix({sun:.8,mars:true}).level.mars,1);
});
test('breathing: calm at rest, exerted after running, panicked when hurt, grabbed or hunted',()=>{
 assert.equal(soundMix({}).breath,0);
 assert.equal(soundMix({exert:1}).breath,.5);
 for(const s of [{hurt:1},{grabbed:true},{threat:1}])assert.ok(soundMix(s).breath>.9,JSON.stringify(s));
 assert.ok(soundMix({health:20}).breath>.8);
});
