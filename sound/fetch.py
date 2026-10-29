#!/usr/bin/env python3
"""Downloads every Sonniss candidate in candidates.tsv to raw/sonniss/SLOT-ID.wav, plus the public-domain NASA Mars
recordings and Apollo 11 onboard clips (skips anything already there). Manifest paths may be truncated; they match
the index by substring."""
import os, subprocess, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'raw', 'sonniss')
MARS = 'https://assets.science.nasa.gov/content/dam/science/psd/mars/downloadable_items/4/5/'
PUBLIC = {
    'nasa/45827_SCAM_MIC_SOL004_RUN001.wav': MARS + '45827_SCAM_MIC_SOL004_RUN001.wav',
    'nasa/45824_SCAM_MIC_SOL001_RUN001.wav': MARS + '45824_SCAM_MIC_SOL001_RUN001.wav',
    'nasa/45704_1st_Sounds_from_Mars_filters_out_rover_self-noise.wav': MARS + '45704_1st_Sounds_from_Mars_filters_out_rover_self-noise.wav',
    **{f'apollo/clip{i}.ogg': f'https://archive.org/download/Apollo11Audio/Apollo11OnboardAudioHighlightClip{i}.ogg' for i in (1, 2, 3)},
}


def fetch_public(item):
    rel, url = item
    dest = os.path.join(HERE, 'raw', rel)
    if os.path.exists(dest): return f'have {rel}'
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, 'wb') as f:
        f.write(r.read())
    return f'ok   {rel}'


def resolve(year, path):
    with open(os.path.join(HERE, 'index', f'{year}.tsv')) as f:
        for line in f:
            fields = line.rstrip('\n').split('\t')
            part, full = fields[0], '\t'.join(fields[1:-1])
            if '__MACOSX' not in full and (full.endswith('/' + path) or ('/' + path) in full or full.startswith(path) or path in full):
                return part, full
    raise SystemExit(f'not in index: {year} {path}')


def fetch(row):
    slot, cid, year, path = row
    dest = os.path.join(OUT, f'{slot}-{cid}.wav')
    if os.path.exists(dest): return f'have {slot}-{cid}'
    part, full = resolve(year, path)
    r = subprocess.run([sys.executable, os.path.join(HERE, 'remotezip.py'), 'get', year, part, full, dest], capture_output=True, text=True)
    return f'{"ok  " if r.returncode == 0 else "FAIL"} {slot}-{cid} {r.stderr.strip()[-200:]}'


os.makedirs(OUT, exist_ok=True)
rows = [l.rstrip('\n').split('\t') for l in open(os.path.join(HERE, 'candidates.tsv')) if l.strip()]
with ThreadPoolExecutor(8) as pool:
    for msg in [*pool.map(fetch_public, PUBLIC.items()), *pool.map(fetch, rows)]:
        print(msg, flush=True)
