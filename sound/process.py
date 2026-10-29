#!/usr/bin/env python3
"""Turns raw candidates into lab-ready clips: trimmed, made to loop seamlessly, loudness-matched per slot,
48 kHz AAC. Writes GAME/assets/audio/lab/SLOT-ID.m4a and lab.json (slots, candidates, credits).

A loop of length L is cut from [start, start+L+X) and its last X seconds are crossfaded over its first X,
so the end runs straight back into the beginning."""
import json, os, re, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
GAME = os.path.join(HERE, '..', 'lunar-art-test', 'game')
OUT = os.path.join(GAME, 'assets', 'audio', 'lab')

SONNISS = 'Sonniss GDC Game Audio Bundle (royalty-free, no attribution required)'
NASA_MARS = 'NASA/JPL-Caltech/LANL/CNES/CNRS/ISAE-Supaero (public domain)'
APOLLO = 'NASA, Apollo 11 onboard audio (public domain)'
MACLEOD = '"{}" Kevin MacLeod (incompetech.com), Licensed under Creative Commons: By Attribution 4.0'

# slot: (label, target LUFS, how the lab plays it, description)
SLOTS = {
    'day': ('Day on the surface', -24, 'loop', 'Serene musical bed for daylight outside. Wonder, not threat.'),
    'breath': ('Suit breathing', -24, 'loop', 'Reactive breathing: calm, exerted, panicked. Heard inside the helmet.'),
    'chatter': ('Radio chatter (day)', -26, 'loop', 'Mission-radio voices under the day. Nightfall breaks this up.'),
    'static': ('Radio static (night)', -28, 'loop', 'What the channel turns into after sunset.'),
    'clicks': ('Clicks through the radio', -24, 'grain', 'The creatures, heard as interference. Played through the radio filter.'),
    'dread': ('Night dread drone', -24, 'loop', 'Low drone that rises through the night and peaks with a raid.'),
    'cave': ('Cave tone', -26, 'loop', 'Close, claustrophobic underground air.'),
    'skitter': ('Skittering in the walls', -24, 'grain', 'Short bursts placed around you in the dark.'),
    'habitat': ('Inside a habitat', -28, 'loop', 'Air again: room tone and life-support hum.'),
    'mars': ('Mars wind', -24, 'loop', 'Real Perseverance recordings, plus stylised alternatives.'),
}

# slot, id, source, start s, loop length s (None = whole file as a one-shot), crossfade s, label, credit
C = [
    ('day', 'heaven-pad', 'sonniss/day-heaven-pad.wav', 1, 30, 3, 'Bluezone "Heaven" pad atmosphere', SONNISS),
    ('day', 'heaven-atmos', 'sonniss/day-heaven-atmos.wav', 1, 44, 4, 'Bluezone "Heaven" synth atmosphere', SONNISS),
    ('day', 'eternity', 'sonniss/day-eternity.wav', .5, 19, 2.5, 'Bluezone "Eternity" ethereal synth', SONNISS),
    ('day', 'afterlife', 'sonniss/day-afterlife.wav', 1, 34, 4, 'Bluezone "Afterlife" melodic texture', SONNISS),
    ('day', 'airy-chords', 'sonniss/day-airy-chords.wav', 2, 60, 5, 'Airborne Sound airy drone with chords', SONNISS),
    ('day', 'space-amb-07', 'sonniss/day-space-amb-07.wav', 2, 52, 5, 'Fox Audio space ambience 07', SONNISS),
    ('day', 'floating-cities', '../../trailer/music/Floating Cities.mp3', 0, 120, 6, 'Kevin MacLeod "Floating Cities" (music)', MACLEOD.format('Floating Cities')),
    ('breath', 'calm-slow', 'sonniss/breath-calm-slow.wav', .5, 20, 1, 'Calm: slow mouth breathing', SONNISS),
    ('breath', 'strong-exhale', 'sonniss/breath-strong-exhale.wav', .3, 11, 1, 'Exerted: deep inhale, strong exhale', SONNISS),
    ('breath', 'mask-run', 'sonniss/breath-mask-run.wav', 0, 2.8, .2, 'Exerted: breathing in a mask while running', SONNISS),
    ('breath', 'frightened', 'sonniss/breath-frightened.wav', .3, 13, 1, 'Panic: frightened, intermittent', SONNISS),
    ('breath', 'growing-panic', 'sonniss/breath-growing-panic.wav', .3, 17, 1.5, 'Panic: growing panic (female)', SONNISS),
    ('breath', 'scared', 'sonniss/breath-scared.wav', 0, None, 0, 'Panic: single scared breath', SONNISS),
    ('chatter', 'apollo-a', 'apollo/clip2.ogg', 440, 80, 2, 'Apollo 11 onboard, busy exchange', APOLLO),
    ('chatter', 'apollo-b', 'apollo/clip3.ogg', 95, 90, 2, 'Apollo 11 onboard, steady chatter', APOLLO),
    ('chatter', 'apollo-c', 'apollo/clip1.ogg', 55, 80, 2, 'Apollo 11 onboard, sparse calls', APOLLO),
    ('chatter', 'mission-control', 'sonniss/radio-mission-chatter.wav', 1, 60, 3, 'Double Trouble "Space Chatter: Mission Control"', SONNISS),
    ('static', 'lost-noise', 'sonniss/radio-lost-noise.wav', 1, 40, 3, 'SoundMorph Lost Transmissions noise loop', SONNISS),
    ('static', 'lost-malfunction', 'sonniss/radio-lost-malfunction.wav', .5, 18, 2, 'SoundMorph Lost Transmissions malfunction', SONNISS),
    ('static', 'shortwave', 'sonniss/radio-shortwave.wav', 1, 40, 3, 'CFry shortwave radio static', SONNISS),
    ('static', 'signal-interference', 'sonniss/radio-signal-interference.wav', 1, 40, 3, 'Glitchedtones signal interference', SONNISS),
    ('static', 'walkie-static', 'sonniss/radio-walkie-static.wav', .5, 22, 2, 'Walkie-talkie static, no speech', SONNISS),
    ('clicks', 'microbe-skitter', 'sonniss/clicks-microbe-skitter.wav', 0, None, 0, 'Hzandbits microbe skitter-squeak', SONNISS),
    ('clicks', 'insectoid', 'sonniss/clicks-insectoid.wav', 0, None, 0, 'SoundBits insectoid tremble', SONNISS),
    ('clicks', 'organic-insect', 'sonniss/clicks-organic-insect.wav', 0, None, 0, 'Bluezone organic insect texture', SONNISS),
    ('clicks', 'biohazard-insects', 'sonniss/clicks-biohazard-insects.wav', 0, None, 0, 'Bluezone biohazard insect ambience', SONNISS),
    ('clicks', 'mecha-swarm', 'sonniss/clicks-mecha-swarm.wav', 0, None, 0, 'Sergey Eybog mecha-insect swarm', SONNISS),
    ('clicks', 'rhythmic-clicking', 'sonniss/clicks-rhythmic-clicking.wav', 0, None, 0, 'Sonic Bat rhythmic clicking', SONNISS),
    ('dread', 'dangerous-air', 'sonniss/dread-dangerous-air.wav', 2, 50, 5, 'SmartSoundFX "Dangerous Air" pad', SONNISS),
    ('dread', 'doom-statiq', 'sonniss/dread-doom-statiq.wav', 1, 36, 4, 'SoundMorph Doom Drones "statiq"', SONNISS),
    ('dread', 'haunting-loop', 'sonniss/dread-haunting-loop.wav', 2, 60, 5, 'Shapeforms Dystopia "The Haunting"', SONNISS),
    ('dread', 'angst', 'sonniss/dread-angst.wav', 2, 50, 5, 'MatiasMacSD "Atmosphere Angst"', SONNISS),
    ('dread', 'cyber-pulse', 'sonniss/dread-cyber-pulse.wav', 1, 22, 2, 'Airborne Sound deep disturbing pulse', SONNISS),
    ('dread', 'hell-swarm', 'sonniss/dread-hell-swarm.wav', 2, 50, 5, 'SmartSoundFX "Hell Swarm" drone', SONNISS),
    ('cave', 'cavern-loop', 'sonniss/cave-cavern-loop.wav', 2, 50, 4, 'Olivier Girardot cavern loop', SONNISS),
    ('cave', 'underground-wind', 'sonniss/cave-underground-wind.wav', 2, 50, 4, 'Olivier Girardot underground wind', SONNISS),
    ('cave', 'cave-design', 'sonniss/cave-cave-design.wav', 1, 19, 2, 'InMotionAudio cave design', SONNISS),
    ('cave', 'airy-cavern', 'sonniss/cave-airy-cavern.wav', 3, 50, 4, 'RDG "Drone Airy Cavern"', SONNISS),
    ('cave', 'mine-shaft', 'sonniss/cave-mine-shaft.wav', 5, 50, 4, 'Coal mine shaft, bottom level, room tone', SONNISS),
    ('cave', 'forbidden-cave', 'sonniss/cave-forbidden-cave.wav', 3, 50, 4, 'Spectravelers "Forbidden Cave" drone', SONNISS),
    ('skitter', 'arachnid-steps', 'sonniss/skitter-arachnid-steps.wav', 0, None, 0, 'Arachnid footsteps foley', SONNISS),
    ('skitter', 'insect-steps', 'sonniss/skitter-insect-steps.wav', 0, None, 0, 'Insect footsteps foley', SONNISS),
    ('skitter', 'feeding-scratch', 'sonniss/skitter-feeding-scratch.wav', 0, None, 0, 'Hzandbits feeding and scratching', SONNISS),
    ('skitter', 'organic-insect', 'sonniss/skitter-organic-insect.wav', 0, None, 0, 'Bluezone organic insect texture', SONNISS),
    ('habitat', 'hvac-low', 'sonniss/habitat-hvac-low.wav', 1, 40, 3, 'Hzandbits HVAC room tone, low hum', SONNISS),
    ('habitat', 'ventilation', 'sonniss/habitat-ventilation.wav', 2, 50, 4, 'Hzandbits industrial ventilation', SONNISS),
    ('habitat', 'ship-low', 'sonniss/habitat-ship-low.wav', 3, 50, 4, 'Filmnoise spaceship interior, low', SONNISS),
    ('habitat', 'command-center', 'sonniss/habitat-command-center.wav', 1, 34, 3, 'Bluezone command-centre ambience', SONNISS),
    ('habitat', 'cockpit', 'sonniss/habitat-cockpit.wav', 1, 34, 3, 'Bluezone cargo-ship cockpit ambience', SONNISS),
    ('habitat', 'interior-tone', 'sonniss/habitat-interior-tone.wav', 1, 27, 3, 'Digital Rain Lab abstract interior tone', SONNISS),
    # Second round: cosmic horror for the night (Annihilation's shimmer), and something bigger in the walls.
    ('dread', 'tonal-ringing', 'sonniss/dread-tonal-ringing.wav', 3, 60, 5, 'Submerged Tapes tonal granular ringing drone', SONNISS, 'new'),
    ('dread', 'shimmer-bells', 'sonniss/dread-shimmer-bells.wav', 1, 38, 4, 'Epic Stock Media shimmer: small bells, metal taps', SONNISS, 'new'),
    ('dread', 'resonant-swells', 'sonniss/dread-resonant-swells.wav', 3, 60, 5, 'Airborne Sound resonant swells, longing, flutter', SONNISS, 'new'),
    ('dread', 'astral-spirits', 'sonniss/dread-astral-spirits.wav', 1, 20, 2.5, 'The Chris Alan ASTRAL: eerie airy spirits', SONNISS, 'new'),
    ('dread', 'night-creature', 'sonniss/dread-night-creature.wav', 2, 48, 4, 'Bluezone alien planet: night creature ambience', SONNISS, 'new'),
    ('dread', 'alien-soundscape', 'sonniss/dread-alien-soundscape.wav', 2, 56, 5, 'SoundMorph Spaces: alien soundscape', SONNISS, 'new'),
    ('dread', 'bowed-screech', 'sonniss/dread-bowed-screech.wav', .5, 17, 2.5, 'The Noisery: bowed metal, moaning, tonal', SONNISS, 'new'),
    ('dread', 'spectral-atmos', 'sonniss/dread-spectral-atmos.wav', 1, 27, 3, 'Bluezone Spectral Density synth atmosphere', SONNISS, 'new'),
    ('dread', 'metal-wail', 'sonniss/dread-metal-wail.wav', .5, 10, 1.5, 'Jake Fielding Haunted Metal: tense metallic wail', SONNISS, 'new'),
    ('static', 'tonal-noise', 'sonniss/static-tonal-noise.wav', 1, 28, 3, 'SoundMorph Lost Transmissions tonal noise', SONNISS, 'new'),
    ('static', 'dimension-glitches', 'sonniss/static-dimension-glitches.wav', 2, 50, 4, 'Dimension glitches ambience', SONNISS, 'new'),
    ('clicks', 'underwater-clicky', 'sonniss/clicks-underwater-clicky.wav', 0, None, 0, 'Submerged Tapes deep, rumbly, low clicky atmos', SONNISS, 'new'),
    ('clicks', 'alien-bugs', 'sonniss/clicks-alien-bugs.wav', 0, None, 0, 'Soundopolis alien bugs texture', SONNISS, 'new'),
    ('skitter', 'big-spider', 'designed/skitter-big-spider.wav', 0, None, 0, 'Designed: big spider (crab legs + spider steps, pitched down)', SONNISS, 'new'),
    ('skitter', 'wall-climber', 'designed/skitter-wall-climber.wav', 0, None, 0, 'Designed: wall climber (talons, nails dragging, carapace cracks)', SONNISS, 'new'),
    ('skitter', 'crustacean-steps', 'sonniss/skitter-crustacean-steps.wav', 0, None, 0, 'Crustacean legs foley', SONNISS, 'new'),
    ('skitter', 'talons-concrete', 'sonniss/skitter-talons-concrete.wav', 0, None, 0, 'Talons on concrete', SONNISS, 'new'),
    ('skitter', 'claws', 'sonniss/skitter-claws.wav', 0, None, 0, 'Paws with claws foley', SONNISS, 'new'),
    ('skitter', 'scurry', 'sonniss/skitter-scurry.wav', 0, None, 0, 'Reptiles and rodents scurrying', SONNISS, 'new'),
    ('skitter', 'nails-tile', 'sonniss/skitter-nails-tile.wav', 0, None, 0, 'Fingernails dragged on tile', SONNISS, 'new'),
    ('skitter', 'nails-metal', 'sonniss/skitter-nails-metal.wav', 0, None, 0, 'Fingernails dragged on metal', SONNISS, 'new'),
    ('mars', 'perseverance-sol4', 'nasa/45827_SCAM_MIC_SOL004_RUN001.wav', .5, 36, 3, 'Perseverance SuperCam, sol 4 (real wind)', NASA_MARS),
    ('mars', 'perseverance-sol1', 'nasa/45824_SCAM_MIC_SOL001_RUN001.wav', .5, 17, 2.5, 'Perseverance SuperCam, sol 1 (muffled)', NASA_MARS),
    ('mars', 'perseverance-filtered', 'nasa/45704_1st_Sounds_from_Mars_filters_out_rover_self-noise.wav', .5, 15, 2, 'Perseverance first sounds, filtered', NASA_MARS),
    ('mars', 'hood-wind', 'sonniss/mars-hood-wind.wav', 1, 44, 3, 'Wind heard inside a jacket hood (stylised)', SONNISS),
    ('mars', 'eerie-synth-wind', 'sonniss/mars-eerie-synth-wind.wav', 2, 60, 5, 'Eerie howling synth wind (stylised)', SONNISS),
    ('mars', 'tonal-howl', 'sonniss/mars-tonal-howl.wav', 2, 60, 5, 'Sound of Essen tonal howling wind (stylised)', SONNISS),
]


def pitch(semitones):
    """Slows and lowers a 96 kHz source together, the way a bigger body would move."""
    return f'asetrate={96000 * 2 ** (semitones / 12):.0f},aresample=96000'


DESIGNED = {
    # Crab legs and spider steps a few semitones down: something the size of a dog, on many legs.
    'big-spider': ['sonniss/skitter-crustacean-steps.wav', 'sonniss/skitter-arachnid-steps.wav'],
    # Talons climbing, with nails dragging and carapace cracking now and then.
    'wall-climber': ['sonniss/skitter-talons-concrete.wav', 'sonniss/skitter-nails-tile.wav', 'sonniss/skitter-nails-metal.wav',
                     'sonniss/skitter-carapace-crack.wav', 'sonniss/skitter-cladding-scratch.wav'],
}
DESIGN_GRAPH = {
    'big-spider': f'[0]aresample=96000,{pitch(-4)},volume=2[a];[1]aresample=96000,{pitch(-6)},volume=14dB[b];'
                  '[a][b]amix=inputs=2:normalize=0:duration=shortest[o]',
    'wall-climber': f'[0]aresample=96000,{pitch(-3)}[a];'
                    f'[1]aresample=96000,{pitch(-2)},adelay=2500|2500,volume=-4dB[n1];'
                    f'[2]aresample=96000,{pitch(-4)},adelay=9000|9000,volume=-4dB[n2];'
                    f'[3]aresample=96000,{pitch(-5)},asplit[c1][c2];[c1]adelay=5200|5200[k1];[c2]adelay=14800|14800[k2];'
                    f'[4]aresample=96000,{pitch(-3)},adelay=19000|19000,volume=-2dB[s];'
                    '[a][n1][n2][k1][k2][s]amix=inputs=6:normalize=0:duration=first[o]',
}


def design():
    os.makedirs(os.path.join(RAW, 'designed'), exist_ok=True)
    for name, srcs in DESIGNED.items():
        dest = os.path.join(RAW, 'designed', f'skitter-{name}.wav')
        if os.path.exists(dest): continue
        args = ['ffmpeg', '-loglevel', 'error', '-y']
        for s in srcs: args += ['-i', os.path.join(RAW, s)]
        run(args + ['-filter_complex', DESIGN_GRAPH[name], '-map', '[o]', '-c:a', 'pcm_f32le', dest])


def run(args):
    return subprocess.run(args, capture_output=True, text=True, check=True)


def duration(path):
    return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).stdout)


def loudness(path):
    err = subprocess.run(['ffmpeg', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    lufs = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', err)[-1])
    peak = float(re.findall(r'Peak:\s+(-?[\d.]+) dBFS', err)[-1])
    return lufs, peak


def talk_segments(path):
    """Spans where someone is speaking (voice band well above the tape hiss), merged across short pauses."""
    err = subprocess.run(['ffmpeg', '-i', path, '-af', 'highpass=300,lowpass=3400,aresample=8000,asetnsamples=2000,'
                          'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
                          '-f', 'null', '-'], capture_output=True, text=True).stdout
    v = [float(x) if x not in ('-inf', '') else -120 for x in re.findall(r'RMS_level=(\S+)', err)]
    floor = sorted(v)[len(v) // 5]
    spans, cur = [], None
    for i, x in enumerate(v):
        t = i * .25
        if x > floor + 9:
            if cur and t - cur[1] < 1.2: cur[1] = t + .25
            else:
                if cur: spans.append(cur)
                cur = [t, t + .25]
    if cur: spans.append(cur)
    return [[round(a, 2), round(b, 2)] for a, b in spans if b - a >= 1]


def build(slot, cid, src, start, length, xf, tmp):
    src = os.path.join(RAW, src)
    total = duration(src)
    base = ['ffmpeg', '-loglevel', 'error', '-y']
    fmt = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo'
    if length is None:
        run(base + ['-i', src, '-af', f'{fmt},afade=t=in:d=0.005,areverse,afade=t=in:d=0.02,areverse', '-c:a', 'pcm_f32le', tmp])
        return
    length = min(length, total - start - xf - .05)
    run(base + ['-i', src, '-i', src, '-filter_complex',
                f'[0]{fmt},atrim={start}:{start + length},asetpts=N/SR/TB,afade=t=in:d={xf}:curve=qsin[body];'
                f'[1]{fmt},atrim={start + length}:{start + length + xf},asetpts=N/SR/TB,afade=t=out:d={xf}:curve=qsin[tail];'
                f'[body][tail]amix=inputs=2:normalize=0:duration=first[o]',
                '-map', '[o]', '-c:a', 'pcm_f32le', tmp])


def main():
    os.makedirs(OUT, exist_ok=True)
    lab = {'slots': [], 'credits': {}}
    for slot, (label, target, mode, desc) in SLOTS.items():
        lab['slots'].append({'id': slot, 'label': label, 'mode': mode, 'description': desc, 'candidates': []})
    by_slot = {s['id']: s for s in lab['slots']}
    design()
    for slot, cid, src, start, length, xf, label, credit, *flags in C:
        tmp = f'/tmp/lab-{slot}-{cid}.wav'
        build(slot, cid, src, start, length, xf, tmp)
        lufs, peak = loudness(tmp)
        gain = min(SLOTS[slot][1] - lufs, -1 - peak)
        dest = os.path.join(OUT, f'{slot}-{cid}.m4a')
        dur = duration(tmp)
        for attempt in range(3):  # AudioToolbox occasionally writes an empty file under load
            run(['ffmpeg', '-loglevel', 'error', '-y', '-i', tmp, '-af', f'volume={gain:.2f}dB', '-c:a', 'aac_at', '-b:a', '160k', dest])
            try:
                if abs(duration(dest) - dur) < .1: break
            except (subprocess.CalledProcessError, ValueError):
                pass
        else:
            raise SystemExit(f'could not encode {dest}')
        entry = {'id': cid, 'label': label, 'file': f'{slot}-{cid}.m4a', 'duration': round(dur, 3),
                 'loop': length is not None, 'credit': credit}
        if 'new' in flags: entry['new'] = True
        if slot == 'breath': entry['role'] = label.split(':')[0].lower()
        if slot == 'chatter': entry['talk'] = talk_segments(tmp)
        by_slot[slot]['candidates'].append(entry)
        print(f'{slot:8} {cid:22} {dur:6.1f}s  {lufs:6.1f} LUFS -> {gain:+5.1f} dB', flush=True)
        os.remove(tmp)
    with open(os.path.join(OUT, 'lab.json'), 'w') as f:
        json.dump(lab, f, indent=1)


if __name__ == '__main__':
    main()
