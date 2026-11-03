#!/usr/bin/env python3
"""Copies the clips chosen in the sound labs into the game's committed audio folder.

    python3 sound/install.py

Ambience (picks.json, from sound-lab.html) goes to GAME/assets/audio/SLOT[-ROLE].m4a with audio.json; effects
(sfx-picks.json, from sfx-lab.html) go to GAME/assets/audio/sfx/SLOT.m4a with sfx.json. audio.js reads both.
"""
import json, os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.join(HERE, '..', 'lunar-art-test', 'game', 'assets', 'audio')
LAB = os.path.join(AUDIO, 'lab')

lab = json.load(open(os.path.join(LAB, 'lab.json')))
picks = json.load(open(os.path.join(HERE, 'picks.json')))
clips, credits = {}, set()
for slot in lab['slots']:
    for c in slot['candidates']:
        key = slot['id'] + (f".{c['role']}" if c.get('role') else '')
        if picks.get(key) != c['id']: continue
        name = key.replace('.', '-') + '.m4a'
        shutil.copyfile(os.path.join(LAB, c['file']), os.path.join(AUDIO, name))
        clips[key] = {'file': name, 'duration': c['duration'], 'loop': c['loop'], 'source': c['label'],
                      **({'talk': c['talk']} if c.get('talk') else {})}
        credits.add(c['credit'])
missing = [k for k in picks if k not in clips]
if missing: raise SystemExit(f'picks not found in lab.json: {missing}')
json.dump({'clips': clips, 'credits': sorted(credits)}, open(os.path.join(AUDIO, 'audio.json'), 'w'), indent=1)
print(f'{len(clips)} clips installed')

SFX = os.path.join(AUDIO, 'sfx')
os.makedirs(SFX, exist_ok=True)
sfx_lab = json.load(open(os.path.join(AUDIO, 'sfx-lab', 'sfx-lab.json')))
sfx_picks = json.load(open(os.path.join(HERE, 'sfx-picks.json')))
effects, sfx_credits = {}, set()
for slot in sfx_lab['slots']:
    c = next((c for c in slot['candidates'] if c['id'] == sfx_picks.get(slot['id'])), None)
    if not c: raise SystemExit(f"no effect picked for {slot['id']}")
    shutil.copyfile(os.path.join(AUDIO, 'sfx-lab', c['file']), os.path.join(SFX, f"{slot['id']}.m4a"))
    effects[slot['id']] = {'file': f"sfx/{slot['id']}.m4a", 'duration': c['duration'], 'source': c['label'],
                           **({'hits': c['hits']} if c.get('hits') else {}), **({'loop': True} if c.get('loop') else {})}
    sfx_credits.add(c['credit'])
json.dump({'effects': effects, 'credits': sorted(sfx_credits)}, open(os.path.join(AUDIO, 'sfx.json'), 'w'), indent=1)
print(f'{len(effects)} effects installed')
