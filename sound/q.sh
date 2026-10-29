#!/bin/zsh
# q.sh REGEX: search the Sonniss index; prints "year | part | MB | path" for matching WAVs.
cd "${0:A:h}/index"
rg -i "$1" *.tsv | rg -v __MACOSX | awk -F'\t' '{split($1,a,".tsv:"); printf "%s|%s|%.1f|%s\n", a[1], a[2], $3/1e6, $2}' | rg -i '\.wav$'
