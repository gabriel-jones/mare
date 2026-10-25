#!/usr/bin/env bash
# Assembles the public game into site/ for Cloudflare: the game modules and assets, and the parts of three.js its import map points at.
set -euo pipefail
cd "$(dirname "$0")/.."

src=lunar-art-test
out=site
rm -rf "$out"
mkdir -p "$out/node_modules/three/build" "$out/node_modules/three/examples"

(cd "$src" && npm ci --silent)

rsync -a \
  --exclude 'art-direction/' --exclude 'blender/' --exclude '__pycache__/' \
  --exclude '*.blend' --exclude '*.blend1' --exclude '*.py' --exclude '*.pyc' \
  --exclude '*.test.mjs' --exclude '*.md' --exclude 'art-lab.*' --exclude '*-preview.png' \
  "$src/game/" "$out/game/"

cp "$src"/node_modules/three/build/three.{module,core}.js "$out/node_modules/three/build/"
cp -R "$src/node_modules/three/examples/jsm" "$out/node_modules/three/examples/"

cat > "$out/_redirects" <<'EOF'
/ /game/ 302
EOF

# Modules are not fingerprinted, so make browsers revalidate rather than mix fresh and stale ones.
cat > "$out/_headers" <<'EOF'
/game/*
  Cache-Control: no-cache
/node_modules/*
  Cache-Control: public, max-age=86400
EOF

echo "site/: $(find "$out" -type f | wc -l | tr -d ' ') files, $(du -sh "$out" | cut -f1)"
