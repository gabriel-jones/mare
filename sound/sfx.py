#!/usr/bin/env python3
"""Turns the raw effect candidates (sfx-candidates.tsv, fetched by fetch.py) into the effects lab's clips.

    python3 sound/sfx.py

Recordings of several shots, steps or hits are cut into separate takes at their onsets, so the game can pick a
different one each time; held sounds (flamethrower, arc, hum, rover) become seamless loops. Each candidate is
written to GAME/assets/audio/sfx-lab/SLOT-ID.m4a with its takes listed in sfx-lab.json.
"""
import json, os, re, subprocess
from process import RAW, GAME, SONNISS, run, duration, loudness

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(GAME, 'assets', 'audio', 'sfx-lab')
SHUTTLE = 'Space Shuttle Discovery launch STS-124, recorded by Joe Shambro (CC BY-NC 3.0: credit, free game only)'
GAP = .25  # silence between takes in the output file

# slot: (group, label, mode, LUFS target, longest take, onset jump dB, shortest gap between onsets, most takes, note)
SLOTS = {
    'step-ground': ('You', 'Footsteps: regolith and rock', 'hits', -22, .45, 9, .18, 10, 'Every step outside and in caves.'),
    'step-floor': ('You', 'Footsteps: habitat floor', 'hits', -22, .45, 9, .18, 10, 'Boots on metal decking inside.'),
    'land': ('You', 'Landing from a jump', 'hits', -20, 1, 12, .3, 4, 'Low gravity: long hang, soft thump.'),
    'roll': ('You', 'Dodge roll', 'hits', -22, 1.2, 10, .4, 4, 'Suit and gear tumbling.'),
    'hurt': ('You', 'Getting hurt', 'hits', -18, .9, 12, .3, 5, 'A hit on the suit.'),
    'pistol': ('Weapons', 'Pistol shot', 'hits', -14, 1.1, 14, .1, 6, 'Real gun.'),
    'smg': ('Weapons', 'SMG shot', 'hits', -15, .35, 10, .05, 8, 'One round of a 3-round burst, 70 ms apart.'),
    'rifle': ('Weapons', 'Rifle shot', 'hits', -13, 1.2, 14, .08, 7, 'Real gun, heavier.'),
    'flamer': ('Weapons', 'Flamethrower', 'loop', -18, 4, 0, 0, 1, 'Held: loops while the trigger is down.'),
    'rail-charge': ('Weapons', 'Railgun charging', 'hits', -18, 1.2, 10, .5, 2, 'Up to 0.8 s while the trigger is held.'),
    'rail': ('Weapons', 'Railgun firing', 'hits', -13, 2.2, 14, .5, 3, 'Sci-fi slug.'),
    'arc': ('Weapons', 'Arc projector', 'loop', -18, 3, 0, 0, 1, 'Held beam: loops while the trigger is down.'),
    'swing': ('Weapons', 'Katana swing', 'hits', -18, .8, 12, .25, 5, 'Every swing, hit or miss.'),
    'slash': ('Weapons', 'Katana cut', 'hits', -16, .9, 12, .25, 5, 'When the blade lands.'),
    'reload': ('Weapons', 'Reload', 'hits', -20, 1.4, 12, .35, 4, 'Magazine out and in.'),
    'dry': ('Weapons', 'Empty click', 'hits', -22, .4, 12, .15, 4, 'Trigger with nothing loaded.'),
    'impact': ('Weapons', 'Hit on a creature', 'hits', -17, .7, 12, .15, 6, 'Rounds landing in flesh.'),
    'parry': ('Weapons', 'Parry', 'hits', -15, 1.6, 14, .3, 4, 'Blade meets claw.'),
    'flare': ('Weapons', 'Flare lighting', 'hits', -18, 2.5, 12, .5, 3, 'Thrown flare ignites.'),
    'shriek': ('Creatures', 'Crawler shriek', 'hits', -17, 2.5, 12, .5, 4, 'It has seen you.'),
    'lunge': ('Creatures', 'Crawler lunge', 'hits', -17, 1.2, 12, .3, 4, 'Leaping attack.'),
    'bite': ('Creatures', 'Bite / grab', 'hits', -17, 1.2, 12, .3, 4, 'It has you.'),
    'death': ('Creatures', 'Crawler death', 'hits', -17, 2.2, 12, .5, 3, 'Killed.'),
    'hiss': ('Creatures', 'Hiss', 'hits', -20, 2, 12, .5, 3, 'Stalking, spawning.'),
    'burst': ('Creatures', 'Raider bursting into brood', 'hits', -16, 1.6, 12, .4, 3, 'A big one splits open.'),
    'emerge': ('Creatures', 'Emerging from the ground', 'hits', -19, 2.2, 10, .5, 3, 'Burrowing up.'),
    'build': ('Base', 'Building (holding E)', 'hits', -20, 2.5, 10, .4, 5, 'Tool bursts while constructing.'),
    'built': ('Base', 'Construction complete', 'hits', -17, 3, 12, 1, 2, 'It locks into place.'),
    'place': ('Base', 'Blueprint placed', 'hits', -22, .6, 12, .2, 3, 'Holographic marker.'),
    'dismantle': ('Base', 'Dismantle', 'hits', -18, 1.6, 12, .4, 3, 'Coming apart.'),
    'turret': ('Base', 'Turret firing', 'hits', -17, .6, 12, .08, 6, 'Automated defence.'),
    'zap': ('Base', 'Fence zap', 'hits', -18, 1.4, 10, .3, 4, 'Electric fence catching something.'),
    'airlock': ('Base', 'Airlock cycling', 'hits', -19, 3.5, 12, 1, 2, 'Door opens: pressure hiss.'),
    'dig': ('Base', 'Rover digging', 'loop', -24, 4, 0, 0, 1, 'Loop near a working rover.'),
    'hum': ('Base', 'Machine hum', 'loop', -26, 5, 0, 0, 1, 'Loop near running machines.'),
    'launch': ('Base', 'Starship launch', 'whole', -14, 26, 0, 0, 1, 'Felt through the ground in vacuum.'),
}
# Per-candidate overrides: source file (relative to raw/), start, length.
EXTRA = [
    ('launch', 'shuttle', 'shuttle/STS-124-Launch_1.flac', 29, 26, 'Shuttle launch from 3 miles (real)', SHUTTLE),
    ('launch', 'rumble', None, 0, 14, 'Designed: low ground rumble', 'Designed for Mare'),
    ('arc', 'buzz-long', 'sonniss/zap-arc-buzz.wav', .3, None, 'Electric arc buzz, resonant fizzle, surges', SONNISS),
    ('dig', 'churn', 'sonniss/hum-metal-roll.wav', .3, None, 'Metal rotation, loose churning', SONNISS),
]
START = {('flamer', 'firestorm'): .4, ('flamer', 'torch-whoosh'): 0, ('arc', 'surge'): .2, ('arc', 'zap-short'): 0, ('hum', 'server-room'): 1}


def envelope(path, hop=.01):
    """RMS level in dB every `hop` seconds, mono."""
    out = subprocess.run(['ffmpeg', '-i', path, '-af', f'pan=mono|c0=0.5*c0+0.5*c1,aresample=48000,asetnsamples={int(48000 * hop)},'
                          'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-', '-f', 'null', '-'],
                         capture_output=True, text=True).stdout
    return [float(x) if x not in ('-inf', '') else -120 for x in re.findall(r'RMS_level=(\S+)', out)]


def takes(path, maxlen, jump, gap, most, hop=.01):
    """Onsets where the level leaps `jump` dB over the last 50 ms and is within 30 dB of the loudest moment; each take
    runs to the next onset, `maxlen`, or until it has decayed 40 dB below its own peak."""
    v = envelope(path, hop)
    top = max(v)
    onsets = []
    for i in range(len(v)):
        before = min(v[max(0, i - 5):i] or [-120])
        if v[i] > top - 30 and v[i] - before >= jump and (not onsets or (i - onsets[-1]) * hop >= gap):
            onsets.append(i)
    if not onsets: onsets = [max(range(len(v)), key=v.__getitem__)]
    spans = []
    for k, i in enumerate(onsets):
        stop = min(onsets[k + 1] if k + 1 < len(onsets) else len(v), i + int(maxlen / hop))
        peak = max(v[i:stop])
        end = i + 1
        for j in range(i, stop):
            if v[j] > peak - 40: end = j + 1
        spans.append((max(0, i * hop - .005), end * hop, peak))
    # Keep the loudest takes, in their original order.
    keep = sorted(sorted(spans, key=lambda s: -s[2])[:most])
    return [(a, b) for a, b, _ in keep if b - a > .04]


def cut(src, spans, tmp):
    """Concatenates the takes with GAP of silence between, each with a short fade out; returns their new positions."""
    fmt = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'
    parts, pos, at = [], [], 0
    for k, (a, b) in enumerate(spans):
        d = b - a
        parts.append(f'[0]{fmt},atrim={a:.3f}:{b:.3f},asetpts=N/SR/TB,afade=t=in:d=0.003,afade=t=out:st={max(0, d - min(.08, d / 3)):.3f}:d={min(.08, d / 3):.3f},apad=pad_dur={GAP}[p{k}]')
        pos.append([round(at, 3), round(at + d, 3)]); at += d + GAP
    graph = ';'.join(parts) + ';' + ''.join(f'[p{k}]' for k in range(len(spans))) + f'concat=n={len(spans)}:v=0:a=1[o]'
    run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-filter_complex', graph, '-map', '[o]', '-c:a', 'pcm_f32le', tmp])
    return pos


def loop(src, start, length, tmp, xf=.4):
    total = duration(src)
    length = min(length, total - start - xf - .05)
    fmt = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'
    run(['ffmpeg', '-loglevel', 'error', '-y', '-i', src, '-i', src, '-filter_complex',
         f'[0]{fmt},atrim={start}:{start + length},asetpts=N/SR/TB,afade=t=in:d={xf}:curve=qsin[body];'
         f'[1]{fmt},atrim={start + length}:{start + length + xf},asetpts=N/SR/TB,afade=t=out:d={xf}:curve=qsin[tail];'
         '[body][tail]amix=inputs=2:normalize=0:duration=first[o]', '-map', '[o]', '-c:a', 'pcm_f32le', tmp])


def whole(src, start, length, tmp):
    fmt = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'
    if src is None:
        # Brown-noise roar under a slow, uneven crackle, swelling in and dying away over 14 s.
        run(['ffmpeg', '-loglevel', 'error', '-y', '-filter_complex',
             f'anoisesrc=d={length}:c=brown:a=0.9:r=48000,lowpass=f=160,lowpass=f=160,volume=10[a];'
             f'anoisesrc=d={length}:c=pink:a=0.5:r=48000,bandpass=f=420:w=500,tremolo=f=11:d=0.8,tremolo=f=3.7:d=0.6,volume=2[b];'
             f'[a][b]amix=inputs=2:normalize=0,{fmt},afade=t=in:d=1.5:curve=exp,afade=t=out:st=5:d={length - 5}:curve=qsin[o]',
             '-map', '[o]', '-c:a', 'pcm_f32le', tmp])
        return
    run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(start), '-t', str(length), '-i', src, '-af',
         f'{fmt},afade=t=in:d=0.5,afade=t=out:st={length - 6}:d=6', '-c:a', 'pcm_f32le', tmp])


def encode(tmp, gain, dest):
    dur = duration(tmp)
    for _ in range(3):  # AudioToolbox occasionally writes an empty file under load
        run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp, '-af', f'volume={gain:.2f}dB', '-c:a', 'aac_at', '-b:a', '160k', dest])
        try:
            if abs(duration(dest) - dur) < .1: return dur
        except (subprocess.CalledProcessError, ValueError):
            pass
    raise SystemExit(f'could not encode {dest}')


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = [l.rstrip('\n').split('\t') for l in open(os.path.join(HERE, 'sfx-candidates.tsv')) if l.strip()]
    cands = [(slot, cid, f'sonniss/{slot}-{cid}.wav', START.get((slot, cid), .3), None, path.split('/')[-1].rsplit('.', 1)[0], SONNISS) for slot, cid, _, path in rows]
    cands += [(s, c, src, st, ln, label, credit) for s, c, src, st, ln, label, credit in EXTRA]
    lab = {'slots': [{'id': s, 'group': g, 'label': l, 'mode': m, 'description': d, 'candidates': []} for s, (g, l, m, *_, d) in SLOTS.items()]}
    by = {s['id']: s for s in lab['slots']}
    for slot, cid, src, start, length, label, credit in cands:
        group, _, mode, target, maxlen, jump, gap, most, _ = SLOTS[slot]
        path, tmp = src and os.path.join(RAW, src), f'/tmp/sfx-{slot}-{cid}.wav'
        hits = None
        if mode == 'hits': hits = cut(path, takes(path, maxlen, jump, gap, most), tmp)
        elif mode == 'loop': loop(path, start, maxlen, tmp)
        else: whole(path, start, length or maxlen, tmp)
        lufs, peak = loudness(tmp)
        gain = min(target - lufs, -1 - peak)
        dur = encode(tmp, gain, os.path.join(OUT, f'{slot}-{cid}.m4a'))
        entry = {'id': cid, 'label': label, 'file': f'{slot}-{cid}.m4a', 'duration': round(dur, 3), 'credit': credit}
        if hits: entry['hits'] = hits
        if mode == 'loop': entry['loop'] = True
        by[slot]['candidates'].append(entry)
        print(f'{slot:12} {cid:20} {mode:5} {len(hits) if hits else "":>2} takes {dur:6.2f}s  {lufs:6.1f} LUFS -> {gain:+5.1f} dB', flush=True)
        os.remove(tmp)
    json.dump(lab, open(os.path.join(OUT, 'sfx-lab.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
