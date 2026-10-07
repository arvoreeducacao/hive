#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: publish-release.sh <asset>..." >&2
  exit 2
fi

here=$(dirname "${BASH_SOURCE[0]}")
repo=${GITHUB_REPOSITORY:?}
latest=${LATEST:-false}
sha=$(git rev-parse HEAD)
short=${sha:0:8}

release_for_head() {
  gh release list -R "$repo" --limit 30 --exclude-drafts --json tagName \
    --jq "[.[] | select(.tagName | endswith(\"-$short\"))][0].tagName // \"\""
}

a_newer_commit_is_out() {
  local newest released
  newest=$(gh release list -R "$repo" --limit 1 --exclude-drafts --json tagName --jq '.[0].tagName // ""')
  released=${newest##*-}
  [ -n "$released" ] || return 1
  git cat-file -e "$released" 2>/dev/null || return 1
  ! git merge-base --is-ancestor "$released" "$sha"
}

tag=$(release_for_head)

if [ -z "$tag" ]; then
  if a_newer_commit_is_out; then
    echo "a newer commit is already released — this build is late and stays out of the releases"
    exit 0
  fi
  tag="hive-$(date -u +%Y.%m.%d)-$short"
  previous=$(gh release list -R "$repo" --limit 5 --exclude-drafts --json tagName \
    --jq "[.[] | select(.tagName != \"$tag\")][0].tagName // \"\"")
  notes="${RUNNER_TEMP:-/tmp}/release-notes.md"
  node infra/scripts/release-notes.mjs "${previous##*-}" > "$notes"
  cat "$notes"
  if ! gh release create "$tag" -R "$repo" --target "$sha" \
      --title "Hive $("$here/release-number.sh")" --notes-file "$notes" --latest="$latest"; then
    tag=$(release_for_head)
    if [ -z "$tag" ]; then
      echo "the release for $short is neither ours nor anybody else's — nothing to attach to" >&2
      exit 1
    fi
    echo "the other platform got there first: attaching to $tag"
  fi
fi

gh release upload "$tag" -R "$repo" --clobber "$@"

if [ "$latest" = true ]; then
  gh release edit "$tag" -R "$repo" --latest
fi

newest_build_of_each_platform=$(
  for asset in Hive-arm64.zip Hive-x86_64.AppImage Hive-x86_64.rpm Hive.ipa Hive-x64.exe; do
    gh api "repos/$repo/releases?per_page=100" \
      --jq "[.[] | select(.draft | not) | select([.assets[].name] | index(\"$asset\"))][0].tag_name // empty" || true
  done
)

tail_of_the_list=$(gh release list -R "$repo" --limit 100 --json tagName,createdAt,isLatest \
  --jq 'sort_by(.createdAt) | reverse | .[10:] | map(select(.isLatest | not)) | .[].tagName' 2>/dev/null || true)

printf '%s\n' "$tail_of_the_list" | while read -r old; do
  [ -n "$old" ] || continue
  if printf '%s\n' "$newest_build_of_each_platform" | grep -qxF "$old"; then
    echo "$old still carries the newest build of a platform — it stays"
    continue
  fi
  gh release delete "$old" -R "$repo" --yes --cleanup-tag \
    || echo "another build already trimmed $old"
done

exit 0
