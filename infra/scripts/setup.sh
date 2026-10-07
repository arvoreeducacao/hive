#!/usr/bin/env bash
set -euo pipefail

NAME="${1:?usage: setup.sh <your-name> [path-to-your-workspace]}"
HUB="${2:-}"
DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$HOME/.local/bin"
HIVE_HOME="${HIVE_HOME:-$HOME/.hive}"

OS="$(uname -s)"
WINDOWS=""
case "$OS" in MINGW*|MSYS*|CYGWIN*) WINDOWS=1 ;; esac
PM=""
if [ "$OS" = "Darwin" ]; then
  PM=brew
elif [ -n "$WINDOWS" ]; then
  PM=windows
elif command -v apt-get >/dev/null 2>&1; then
  PM=apt
elif command -v dnf >/dev/null 2>&1; then
  PM=dnf
elif command -v pacman >/dev/null 2>&1; then
  PM=pacman
fi

LEFTOVERS="hive hive-top.py door.mjs peer.mjs peer-cli.mjs peer-mcp.mjs protocol.mjs
doctor/doctor.mjs doctor/doctor-runner.mjs doctor/doctor-readings.mjs doctor/doctor-core.mjs
lib/device.mjs lib/pod-exec.mjs lib/cloud-door.mjs lib/env.mjs lib/pair.mjs
bridge/browser-bridge.mjs bridge/browser-bridge-pod.mjs bridge/browser-bridge-protocol.mjs
peer/peer.mjs peer/peer-cli.mjs peer/peer-mcp.mjs engine/protocol.mjs engine/paths.mjs"
swept=""
for leftover in $LEFTOVERS; do
  [ -e "$BIN/$leftover" ] || continue
  rm -f "$BIN/$leftover"
  swept=1
done
for folder in doctor lib bridge peer engine; do
  rmdir "$BIN/$folder" 2>/dev/null || true
done
[ -n "$swept" ] && echo "removed the old hive command from $BIN — nothing lives on your PATH any more, the app carries what it runs"

REQUIRED="tmux git gh"
[ -n "$WINDOWS" ] && REQUIRED="git gh"
CLUSTER_TOOLS="kubectl aws"

missing=""
packages=""
for dep in $REQUIRED; do
  if ! command -v "$dep" >/dev/null 2>&1; then
    missing="$missing $dep"
    p="$dep"
    if [ "$dep" = "aws" ]; then
      if [ "$PM" = "pacman" ]; then p="aws-cli"; else p="awscli"; fi
    fi
    packages="$packages $p"
  fi
done
if [ -n "$missing" ]; then
  echo "setup: missing dependencies:$missing" >&2
  case "$PM" in
    brew) echo "install with: brew install$packages" >&2 ;;
    apt) echo "install with: sudo apt-get install -y$packages" >&2 ;;
    dnf) echo "install with: sudo dnf install -y$packages" >&2 ;;
    pacman) echo "install with: sudo pacman -S --needed$packages" >&2 ;;
    windows)
      line=""
      for p in $packages; do
        case "$p" in
          gh) id="GitHub.cli" ;;
          git) id="Git.Git" ;;
          kubectl) id="Kubernetes.kubectl" ;;
          awscli) id="Amazon.AWSCLI" ;;
          *) id="$p" ;;
        esac
        one="winget install --id $id -e --accept-source-agreements --accept-package-agreements"
        if [ -z "$line" ]; then line="$one"; else line="$line && $one"; fi
      done
      echo "install with: $line" >&2
      echo "then close this terminal and open it again, so the new command is on PATH" >&2
      ;;
    *) echo "install with your system package manager:$packages" >&2 ;;
  esac
  exit 1
fi

absent=""
for dep in $CLUSTER_TOOLS; do
  command -v "$dep" >/dev/null 2>&1 || absent="$absent $dep"
done
if [ -n "$absent" ]; then
  echo "setup: no$absent on this machine — that is fine unless your server is hosted on a kubernetes cluster."
  echo "       a server in a container is reached over http and needs neither."
fi

if [ -n "$WINDOWS" ]; then
  echo "setup: seats on this machine run in a terminal of their own, in PowerShell. There is no tmux to install."
fi


mkdir -p "$HIVE_HOME"
chmod 700 "$HIVE_HOME"

KEY="$HIVE_HOME/key-$NAME"
if [ -f "$KEY" ]; then
  echo "key already exists: $KEY"
else
  ssh-keygen -t ed25519 -N '' -C "hive-$NAME" -f "$KEY" >/dev/null
  echo "key generated: $KEY (the private half never leaves your machine)"
fi

CONFIG="$HIVE_HOME/config"
if [ -z "$HUB" ] && [ -f "$CONFIG" ]; then
  HUB="$(sed -n 's/^HIVE_HUB=//p' "$CONFIG" | tail -1)"
fi
if [ -z "$HUB" ]; then
  above="$(dirname "$DIR")"
  [ "$above" != "$HOME" ] && [ "$above" != "/" ] && HUB="$above"
fi
if [ -z "$HUB" ]; then
  echo "setup: I do not know where your repositories are. Run it again with the path:" >&2
  echo "       setup.sh $NAME ~/path/to/your/workspace" >&2
  exit 1
fi
if [ -n "$WINDOWS" ] && command -v cygpath >/dev/null 2>&1; then
  HUB="$(cygpath -m "$HUB" 2>/dev/null || echo "$HUB")"
fi
DEPLOYMENT=""
for candidate in "$DIR"/*/hive.defaults; do
  [ -f "$candidate" ] && DEPLOYMENT="$candidate" && break
done

KEPT=""
if [ -f "$CONFIG" ]; then
  KEPT=$(grep -vE '^\s*HIVE_(DEV|POD|HUB|REPO|SERVER_URL)=' "$CONFIG" || true)
fi
if [ -n "$DEPLOYMENT" ]; then
  NAMED=$(grep -oE '^\s*HIVE_[A-Z_]+' "$DEPLOYMENT" | tr -d ' ' | paste -sd'|' -)
  [ -n "$NAMED" ] && KEPT=$(printf '%s' "$KEPT" | grep -vE "^\s*($NAMED)=" || true)
  WHOSE=$(basename "$(dirname "$DEPLOYMENT")")
  KEPT=$(printf '%s' "$KEPT" | grep -vE '^\s*HIVE_DEPLOYMENT_DIR=' || true)
  KEPT=$(printf '%s\n%s\nHIVE_DEPLOYMENT_DIR=%s' "$KEPT" "$(grep -E '^\s*HIVE_[A-Z_]+=' "$DEPLOYMENT")" "$WHOSE" | grep -v '^$' || true)
  echo "deployment defaults: $WHOSE/hive.defaults"
fi
ON_CLUSTER=""
if [ -n "$DEPLOYMENT" ] && grep -qE '^\s*HIVE_(NAMESPACE|CLUSTER)=\S' "$DEPLOYMENT"; then
  ON_CLUSTER=1
fi

PER_PERSON=""
if [ -n "$DEPLOYMENT" ] && [ -x "$(dirname "$DEPLOYMENT")/hive-setup.sh" ]; then
  PER_PERSON=$("$(dirname "$DEPLOYMENT")/hive-setup.sh" "$NAME" 2>/dev/null | grep -E '^\s*HIVE_[A-Z_]+=' || true)
fi

REPO_PATH="$DIR"
if [ -n "$WINDOWS" ] && command -v cygpath >/dev/null 2>&1; then
  REPO_PATH="$(cygpath -m "$REPO_PATH" 2>/dev/null || echo "$REPO_PATH")"
fi

{
  echo "HIVE_DEV=$NAME"
  [ -n "$PER_PERSON" ] && printf '%s\n' "$PER_PERSON"
  echo "HIVE_HUB=$HUB"
  echo "HIVE_REPO=$REPO_PATH"
  [ -n "$KEPT" ] && printf '%s\n' "$KEPT"
} > "$CONFIG"
chmod 600 "$CONFIG"
echo "config written: $CONFIG"
if [ -z "$ON_CLUSTER" ]; then
  echo "                no cluster in the deployment defaults, so nothing here asks for kubectl or aws."
  echo "                to reach a server, put its address in HIVE_SERVER_URL — or run seats on this machine and set nothing."
fi

echo ""
echo "What the script cannot do for you:"
echo ""
echo "1) Send this line to whoever runs the server you want into, for its allowed_signers:"
echo ""
echo "   $NAME $(cat "$KEY.pub")"
echo ""
echo "2) Open the app. There is nothing to run from a terminal: the app talks to the server,"
echo "   and the server opens the seats."
