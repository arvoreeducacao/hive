#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: pack-js.sh <output directory>" >&2
  exit 2
fi

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

out=$1
mkdir -p "$out"

node app/main/stamp.mjs

print=$(node -e 'const {readdirSync,readFileSync,statSync}=require("node:fs");process.stdout.write(require("./app/main/ota.js").shellPrint(process.cwd(),{readdirSync,readFileSync,statSync}))')

if [ -z "$print" ]; then
  echo "the shell print came out empty — nothing to name the pack after" >&2
  exit 1
fi

pack="$out/hive-js-$print.tar.gz"

test -f app/assets/dist/hive.mjs || { echo "app/assets/dist/hive.mjs is missing — run npm run build in app/ first; a pack without it is a dead app" >&2; exit 1; }

tar --exclude=node_modules --exclude=app/dist --exclude=.git -czf "$pack" app server

node infra/scripts/sign-pack.mjs "$pack" "$pack.sig"

echo "$pack"
