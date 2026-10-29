#!/usr/bin/env python3
"""Copies the clips chosen in the sound lab (picks.json) into the game's committed audio folder.

    python3 sound/install.py

Writes GAME/assets/audio/SLOT[-ROLE].m4a and audio.json, which audio.js reads at startup.
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
