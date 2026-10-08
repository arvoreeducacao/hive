#!/usr/bin/env bash
set -uo pipefail

export HOME=/workspace/home
export NPM_CONFIG_PREFIX=/workspace/npm-global
export PATH=/workspace/npm-global/bin:$PATH
export TMUX_TMPDIR="${TMUX_TMPDIR:-/workspace/hive/tmux}"

HUB="${HIVE_HUB:-${HIVE_MCP_HUB:-/workspace/repos}}"
NAME="${HIVE_SERVER_NAME:-workspace}"

mkdir -p /workspace/home /workspace/npm-global /workspace/repos /workspace/hive

boot_error() {
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) boot-error step=$1 detail=$2" >> /workspace/hive/boot.log 2>/dev/null
}

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) boot" >> /workspace/hive/boot.log 2>/dev/null

rm -f /workspace/npm-global/bin/hive
rm -rf /workspace/hive/cli

if [ -e /workspace/npm-global/lib/node_modules/@anthropic-ai/claude-code ]; then
  npm rm -g @anthropic-ai/claude-code >/dev/null 2>&1 \
    || boot_error claude-on-volume "a copy on the volume shadows the image and could not be removed"
fi

for tool in tmux git curl rg gh node npm claude; do
  command -v "$tool" >/dev/null 2>&1 || boot_error missing-tool "$tool is not in the image"
done

grep -q NPM_CONFIG_PREFIX /workspace/home/.bashrc 2>/dev/null || cat >> /workspace/home/.bashrc <<'EOF'
export HOME=/workspace/home
export NPM_CONFIG_PREFIX=/workspace/npm-global
export PATH=/workspace/npm-global/bin:$PATH
EOF

grep -q HIVE_MCP_GATEWAY_TOKEN /workspace/home/.bashrc 2>/dev/null || cat >> /workspace/home/.bashrc <<'EOF'
[ -r "${HIVE_HUB:-}/.mcp-servers/.token" ] \
  && export HIVE_MCP_GATEWAY_TOKEN="$(cat "$HIVE_HUB/.mcp-servers/.token")"
true
EOF

if [ -n "${HIVE_SSH_PUBKEY:-}" ]; then
  mkdir -p /run/sshd /workspace/home/.ssh
  grep -qxF "$HIVE_SSH_PUBKEY" /workspace/home/.ssh/authorized_keys 2>/dev/null \
    || echo "$HIVE_SSH_PUBKEY" >> /workspace/home/.ssh/authorized_keys
  chmod 700 /workspace/home/.ssh && chmod 600 /workspace/home/.ssh/authorized_keys
  /usr/sbin/sshd || boot_error sshd "sshd did not start"
fi

if [ -d "$HUB/.git" ]; then
  mkdir -p "$HUB/.claude"
  [ -f "$HUB/.claude/settings.local.json" ] \
    || echo '{"enableAllProjectMcpServers": true}' > "$HUB/.claude/settings.local.json" \
    || boot_error settings-trust "could not write .claude/settings.local.json"
fi

if [ ! -s "$HUB/.env" ] && [ -s /workspace/secrets/env ] && [ -d "$HUB" ]; then
  cp /workspace/secrets/env "$HUB/.env" && chmod 600 "$HUB/.env" \
    || boot_error hub-env "could not seed $HUB/.env from the secret"
fi
MCP_DIR="$HUB/.mcp-servers"
MCP_LOCK="$MCP_DIR/package-lock.json"
MCP_STAMP="$MCP_DIR/node_modules/.lock-stamp"
if [ -f "$MCP_LOCK" ]; then
  if [ "$(cat "$MCP_STAMP" 2>/dev/null)" != "$(sha256sum "$MCP_LOCK" | cut -d' ' -f1)" ]; then
    if (cd "$MCP_DIR" && npm ci --no-audit --no-fund >/dev/null 2>&1); then
      sha256sum "$MCP_LOCK" | cut -d' ' -f1 > "$MCP_STAMP"
    else
      boot_error mcp-install "npm ci failed in $MCP_DIR"
    fi
  fi
  MCP_GATEWAY="${HIVE_SERVER_DIR:-/app/server}/gateway/gateway.mjs"
  if [ ! -f "$MCP_GATEWAY" ]; then
    boot_error mcp-gateway "no gateway at $MCP_GATEWAY"
  elif [ -d "$MCP_DIR/node_modules" ] \
    && ! curl -fsS --max-time 2 http://127.0.0.1:4671/health >/dev/null 2>&1; then
    (cd "$HUB" && HIVE_HUB="$HUB" nohup node "$MCP_GATEWAY" >> "$MCP_DIR/gateway.log" 2>&1 &)
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      curl -fsS --max-time 2 http://127.0.0.1:4671/health >/dev/null 2>&1 && break
      sleep 1
    done
    curl -fsS --max-time 2 http://127.0.0.1:4671/health >/dev/null 2>&1 \
      || boot_error mcp-gateway "gateway did not answer on 4671"
  fi
fi

mkdir -p "$TMUX_TMPDIR"
if command -v tmux >/dev/null 2>&1; then
  tmux has-session -t hive 2>/dev/null \
    || tmux new-session -d -s hive -n hub "sleep infinity" \
    || boot_error tmux-hive "could not create the hive session"
  if [ -s /workspace/home/.claude/.credentials.json ] && [ -d "$HUB" ]; then
    HOME=/workspace/home node -e 'const fs=require("fs");const p=process.env.HOME+"/.claude.json";let j={};try{j=JSON.parse(fs.readFileSync(p,"utf8"))}catch(e){}j.projects=j.projects||{};j.projects[process.argv[1]]=Object.assign({},j.projects[process.argv[1]]||{},{hasTrustDialogAccepted:true});fs.writeFileSync(p,JSON.stringify(j,null,2))' "$HUB" \
      || boot_error remote-control-trust "could not mark $HUB as trusted"
    tmux new-session -d -s rc 2>/dev/null || true
    tmux send-keys -t rc "export HOME=/workspace/home PATH=/workspace/npm-global/bin:\$PATH && cd $HUB && claude remote-control" Enter || true
    sleep 12
    tmux send-keys -t rc "y" Enter || true
  else
    boot_error remote-control "no credential yet — sign in with claude inside this container, then restart it"
  fi
else
  boot_error tmux "tmux is not installed"
fi

echo "$NAME ready: $(claude --version 2>/dev/null || echo 'claude pending')"

SERVER="${HIVE_SERVER_DIR:-/app/server}/server.mjs"
if [ -f "$SERVER" ]; then
  export HIVE_SEAT_WINDOWS="${HIVE_SEAT_WINDOWS:-1}"
  export HIVE_BROKER_BIND="${HIVE_BROKER_BIND:-0.0.0.0}"
  exec node "$SERVER"
fi

boot_error server "no server at $SERVER — this image carries none, so nothing will answer on the port"
sleep infinity
