#!/usr/bin/env python3
"""Reads files out of the Sonniss GDC bundles mirrored on archive.org without downloading whole bundles.
Each mirror is a zip of the original part zips, so we read the outer zip's directory over HTTP ranges,
then each stored part zip's directory, then pull single WAVs.

  remotezip.py list YEAR...          writes index/YEAR.tsv (part, path, size)
  remotezip.py get YEAR PART PATH OUT
"""
import io, os, sys, struct, zipfile, zlib, urllib.request, urllib.parse

ITEM = 'https://archive.org/download/sonniss-gdc-2020-game-audio-bundle/'
HERE = os.path.dirname(os.path.abspath(__file__))


def url_for(year):
    return ITEM + urllib.parse.quote(f'Sonniss - GDC {year} - Game Audio Bundle.zip')


class HttpFile(io.RawIOBase):
    """Seekable read-only view of [start, start+size) of a remote file, fetched in cached blocks."""
    BLOCK = 1 << 20

    def __init__(self, url, start=0, size=None, cache=None):
        self.url, self.start, self.pos = url, start, 0
        self.cache = {} if cache is None else cache
        if size is None:
            req = urllib.request.Request(url, headers={'Range': 'bytes=0-0'})
            with urllib.request.urlopen(req, timeout=60) as r:
                self.url = r.geturl()
                size = int(r.headers['Content-Range'].split('/')[1])
        self.size = size

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos

    def block(self, n):
        if n not in self.cache:
            a = n * self.BLOCK
            req = urllib.request.Request(self.url, headers={'Range': f'bytes={a}-{a + self.BLOCK - 1}'})
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(req, timeout=120) as r:
                        self.cache[n] = r.read()
                    break
                except Exception:
                    if attempt == 3: raise
        return self.cache[n]

    def read(self, n=-1):
        if n < 0: n = self.size - self.pos
        n = max(0, min(n, self.size - self.pos))
        out, abs_pos = bytearray(), self.start + self.pos
        while len(out) < n:
            b, off = divmod(abs_pos + len(out), self.BLOCK)
            out += self.block(b)[off:off + n - len(out)]
        self.pos += n
        return bytes(out)

    def readinto(self, buf):
        data = self.read(len(buf)); buf[:len(data)] = data; return len(data)


def data_offset(f, info):
    f.seek(info.header_offset)
    h = f.read(30)
    name_len, extra_len = struct.unpack('<HH', h[26:30])
    return info.header_offset + 30 + name_len + extra_len


def parts(year):
    outer = HttpFile(url_for(year))
    oz = zipfile.ZipFile(outer)
    for info in oz.infolist():
        if info.filename.lower().endswith('.zip'):
            assert info.compress_type == 0, f'{info.filename} is compressed inside the mirror'
            yield info.filename, HttpFile(outer.url, data_offset(outer, info), info.file_size, outer.cache)


def list_year(year):
    os.makedirs(os.path.join(HERE, 'index'), exist_ok=True)
    with open(os.path.join(HERE, 'index', f'{year}.tsv'), 'w') as out:
        for name, part in parts(year):
            for i in zipfile.ZipFile(part).infolist():
                if not i.is_dir():
                    out.write(f'{os.path.basename(name)}\t{i.filename}\t{i.file_size}\n')
            print(year, os.path.basename(name), flush=True)


def get(year, part_name, path, dest):
    """Streams one member in a single ranged request (stored or deflated)."""
    for name, part in parts(year):
        if os.path.basename(name) == part_name:
            info = zipfile.ZipFile(part).getinfo(path)
            a = part.start + data_offset(part, info)
            req = urllib.request.Request(part.url, headers={'Range': f'bytes={a}-{a + info.compress_size - 1}'})
            inflate = zlib.decompressobj(-15) if info.compress_type == 8 else None
            assert info.compress_type in (0, 8), f'unsupported compression {info.compress_type}'
            with urllib.request.urlopen(req, timeout=300) as r, open(dest + '.part', 'wb') as out:
                while chunk := r.read(1 << 20):
                    out.write(inflate.decompress(chunk) if inflate else chunk)
                if inflate: out.write(inflate.flush())
            os.replace(dest + '.part', dest)
            return
    raise SystemExit(f'no part {part_name}')


if __name__ == '__main__':
    if sys.argv[1] == 'list':
        for y in sys.argv[2:]: list_year(y)
    else:
        get(*sys.argv[2:6])
