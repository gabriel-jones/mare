#!/usr/bin/env python3
"""find.py REGEX [MAX_MB] [PER_PACK]: search the Sonniss index, grouped by pack.

Prints "year  MB  file" under each pack heading. Paths match case-insensitively against pack and file name.
"""
import glob, os, re, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
pat = re.compile(sys.argv[1], re.I)
max_mb = float(sys.argv[2]) if len(sys.argv) > 2 else 20
per = int(sys.argv[3]) if len(sys.argv) > 3 else 8
packs = defaultdict(list)
for f in sorted(glob.glob(os.path.join(HERE, 'index', '*.tsv'))):
    year = os.path.basename(f)[:4]
    for line in open(f, encoding='utf-8'):
        fields = line.rstrip('\n').split('\t')
        path, size = '\t'.join(fields[1:-1]), int(fields[-1])
        if '__MACOSX' in path or not path.lower().endswith('.wav') or size / 1e6 > max_mb or not pat.search(path): continue
        parts = path.split('/')
        packs[(year, parts[-2] if len(parts) > 1 else '')].append((size / 1e6, parts[-1]))
for (year, pack), files in packs.items():
    print(f'## {year} {pack}  ({len(files)})')
    for mb, name in files[:per]: print(f'   {mb:5.1f}  {name}')
