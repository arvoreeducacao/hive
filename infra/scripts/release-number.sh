#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

git rev-list --count --first-parent "${1:-HEAD}" -- \
  app cli driver server \
  "*/hive.defaults" \
  .github/workflows/release.yml \
  .github/workflows/release-linux.yml \
  .github/workflows/release-windows.yml \
  .github/workflows/release-js.yml \
  infra/scripts/publish-release.sh \
  infra/scripts/release-number.sh \
  infra/scripts/pack-js.sh \
  infra/scripts/sign-pack.mjs
