import { spawn as nodeSpawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

export const ROOT_FOLDER = ".hive-host";
export const NODE_FLOOR = 22;
export const RETRY_AFTER = 10000;
export const RETRY_CEILING = 300000;
export const TUNNEL_PATIENCE = 15000;
export const PROBE_TIMEOUT = 45000;
export const UPLOAD_TIMEOUT = 120000;
export const INSTALL_TIMEOUT = 420000;
export const LEFT_OUT = new Set(["node_modules", "tests"]);
export const NEEDED_ON_THE_HOST = ["tmux", "git", "tar"];

const USER = /^[A-Za-z_][A-Za-z0-9._-]{0,63}$/;
const HOST = /^[A-Za-z0-9][A-Za-z0-9._-]{0,252}$/;
const PUBLIC_KEY = /^ssh-ed25519 [A-Za-z0-9+/=]+$/;
const FOLDER_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const SAFE_HOME = /^\/[A-Za-z0-9._\/-]+$/;
const NOT_A_PATH_BEFORE = "(^|[^A-Za-z0-9._/~})-])";
const NOT_A_NAME_AFTER = "(?=$|[^A-Za-z0-9._-])";
const BOX_HOME = new RegExp(NOT_A_PATH_BEFORE + "/workspace/home" + NOT_A_NAME_AFTER, "g");
const BOX_WORKSPACE = new RegExp(NOT_A_PATH_BEFORE + "/workspace" + NOT_A_NAME_AFTER, "g");

const quoted = (word) => "'" + String(word).replace(/'/g, "'\\''") + "'";
const lastLine = (text) => String(text || "").split("\n").map((line) => line.trim()).filter(Boolean).pop() || "";
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

export function sshTargetOf(text) {
  const asked = String(text || "").trim().replace(/^ssh:\/\//i, "");
  if (!asked) return { ok: false, error: "no machine was named — write HIVE_SERVER_SSH=user@host" };
  const parts = asked.match(/^(?:([^@\s]+)@)?([^:@\s]+)(?::(\d{1,5}))?$/);
  if (!parts) return { ok: false, error: asked + " is not user@host or user@host:port" };
  const [, user = "", host, portText = ""] = parts;
  if (user && !USER.test(user)) return { ok: false, error: user + " is not a user name ssh would take" };
  if (!HOST.test(host)) return { ok: false, error: host + " is not a host name ssh would take" };
  const port = portText ? Number(portText) : 0;
  if (portText && (port < 1 || port > 65535)) return { ok: false, error: portText + " is not a port" };
  return { ok: true, user, host, port, target: user ? user + "@" + host : host, label: host };
}

export function sshArgs({ target, port = 0 }, extra = []) {
  return [
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=10",
    "-o", "ServerAliveInterval=15",
    "-o", "ServerAliveCountMax=3",
    ...(port ? ["-p", String(port)] : []),
    ...extra,
    target
  ];
}

export const execArgs = (host, command) => [...sshArgs(host, ["-T"]), command];

export function tunnelArgs(host, { localPort, socket }) {
  return [...sshArgs(host, ["-T", "-o", "ExitOnForwardFailure=yes", "-L", "127.0.0.1:" + localPort + ":" + socket]), "cat"];
}

export function remoteLayout(home, folder = ROOT_FOLDER) {
  const root = String(home).replace(/\/+$/, "") + "/" + folder;
  return { root, server: root + "/server", incoming: root + "/server.new", socket: root + "/server.sock", log: root + "/server.log" };
}

export function hostPathsIn(text, home, folder = ROOT_FOLDER) {
  const said = String(text ?? "");
  const clean = String(home || "").replace(/\/+$/, "");
  if (!SAFE_HOME.test(clean) || /^\/workspace(\/|$)/.test(clean)) return said;
  const workspace = remoteLayout(clean, folder).root + "/workspace";
  return said.replace(BOX_HOME, (all, before) => before + clean).replace(BOX_WORKSPACE, (all, before) => before + workspace);
}

export function serverFilesOf(dir, under = "") {
  const found = [];
  for (const one of readdirSync(join(dir, under), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (LEFT_OUT.has(one.name)) continue;
    const at = under ? under + "/" + one.name : one.name;
    if (one.isDirectory()) found.push(...serverFilesOf(dir, at));
    else if (one.isFile()) found.push(at);
  }
  return found;
}

export function serverStamp(dir) {
  const hash = createHash("sha256");
  for (const file of serverFilesOf(dir)) {
    hash.update(file);
    hash.update("\0");
    hash.update(readFileSync(join(dir, file)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 32);
}

export function sshReason(stderr, target) {
  const said = String(stderr || "");
  if (/no ssh client/i.test(said)) return "this machine has no ssh client on its PATH";
  if (/Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(said)) {
    return "ssh does not trust " + target + " yet — run \"ssh " + target + "\" once in a terminal and settle its key there";
  }
  if (/Permission denied/i.test(said)) {
    return target + " refused this machine's key — the Hive cannot type a password, so the key has to be accepted there first (ssh-copy-id " + target + ")";
  }
  if (/Could not resolve hostname/i.test(said)) return "no machine answers to the name in " + target;
  if (/Connection timed out|Operation timed out|No route to host|Network is unreachable|Host is down/i.test(said)) {
    return target + " did not answer on the network — the machine may be asleep, off, or on another network";
  }
  if (/not responding|Broken pipe|Connection reset by|Connection closed by/i.test(said)) {
    return "the connection to " + target + " went quiet — the machine may have gone to sleep";
  }
  if (/Connection refused/i.test(said)) return target + " refused the connection — ssh (Remote Login) has to be on there";
  if (/Address already in use|cannot listen to port|Could not request local forwarding/i.test(said)) return "the local end of the tunnel is taken";
  return lastLine(said);
}

export const HOST_AWAY = /did not answer on the network|went quiet|no answer from the host in time|stopped answering/;

export function readFacts(out) {
  const facts = {};
  for (const line of String(out || "").split("\n")) {
    const found = line.match(/^hive:([a-z]+)=(.*)$/);
    if (found) facts[found[1]] = found[2].trim();
  }
  return facts;
}

export function whatTheHostLacks(facts, { installing = false } = {}) {
  const major = Number(String(facts.node || "").split(".")[0]) || 0;
  if (!major) return "the host has no node on the PATH its shell gives — the server needs node " + NODE_FLOOR + " or newer";
  if (major < NODE_FLOOR) return "the host has node " + facts.node + " and the server needs " + NODE_FLOOR + " or newer";
  const missing = [...NEEDED_ON_THE_HOST, ...(installing ? ["npm"] : [])].filter((tool) => facts[tool] !== "1");
  if (missing.length) return "the host is missing " + missing.join(", ");
  return "";
}

const PRELUDE = String.raw`
say() { printf 'hive:%s=%s\n' "$1" "$2"; }
shell="$SHELL"
[ -n "$shell" ] || shell=sh
hive_path() {
  "$shell" "$1" 'printf "__HIVE_PATH__%s__HIVE_PATH__" "$PATH"' 2>/dev/null </dev/null | sed -n 's/.*__HIVE_PATH__\(.*\)__HIVE_PATH__.*/\1/p' | tail -n 1
}
case "$(basename "$shell")" in
  bash|zsh|sh|dash|ksh)
    seen="$(hive_path -lc)"
    [ -n "$seen" ] && PATH="$seen"
    if ! command -v node >/dev/null 2>&1; then
      seen="$(hive_path -ilc)"
      [ -n "$seen" ] && PATH="$seen"
    fi ;;
esac
for extra in "$HOME/.local/bin" "$HOME/.local/share/mise/shims" "$HOME/.volta/bin" /opt/homebrew/bin /usr/local/bin; do
  case ":$PATH:" in
    *":$extra:"*) ;;
    *) [ -d "$extra" ] && PATH="$PATH:$extra" ;;
  esac
done
export PATH
unset HIVE_STATE_DIR HIVE_HOME HIVE_SEAT HIVE_SIDE HIVE_BROKER_HOME HIVE_HUB HIVE_MCP_HUB HIVE_ALLOWED_SIGNERS HIVE_TMUX_SESSION
root="$HOME/$FOLDER"
pidfile="$root/server.pid"
alive() {
  pid="$(cat "$pidfile" 2>/dev/null)"
  [ -n "$pid" ] && ps -ww -p "$pid" -o args= 2>/dev/null | grep -qF "$root/server/server.mjs"
}
stop_server() {
  alive || return 0
  kill "$pid" 2>/dev/null
  n=0
  while [ "$n" -lt 40 ] && alive; do sleep 0.25; n=$((n + 1)); done
  alive && kill -9 "$pid" 2>/dev/null
  return 0
}
start_server() {
  mkdir -p "$root/workspace/hive" "$root/workspace/repos" "$root/workspace/worktrees" "$root/workspace/npm-global/bin"
  chmod 700 "$root"
  for tool in node npm npx claude gh codex opencode kimi kiro-cli cursor-agent gemini agy; do
    at="$(command -v "$tool" 2>/dev/null)"
    case "$at" in
      /*) ln -sf "$at" "$root/workspace/npm-global/bin/$tool" ;;
    esac
  done
  signers="$root/workspace/hive/allowed_signers"
  if ! grep -qF "$KEY" "$signers" 2>/dev/null; then
    printf '%s %s\n' "$NAME" "$KEY" >> "$signers"
    stop_server
  fi
  chmod 600 "$signers"
  hub=""
  if [ -n "$HUBNAME" ] && [ -d "$root/workspace/repos/$HUBNAME" ]; then hub="$root/workspace/repos/$HUBNAME"; fi
  if [ -n "$hub" ]; then say hub 1; else say hub 0; fi
  if [ "$hub" != "$(cat "$root/server.hub" 2>/dev/null)" ]; then stop_server; fi
  if [ "$RESTART" != 1 ] && alive && [ -S "$root/server.sock" ]; then say started 1; return 0; fi
  stop_server
  rm -f "$root/server.sock"
  printf '%s' "$hub" > "$root/server.hub"
  (
    cd "$root/workspace" || exit 1
    if [ -n "$hub" ]; then HIVE_HUB="$hub"; export HIVE_HUB; fi
    HIVE_WORKSPACE="$root/workspace" HIVE_BROKER_SOCKET="$root/server.sock" HIVE_SERVER_NAME="$NAME" HIVE_SEAT_WINDOWS=1 \
      nohup node "$root/server/server.mjs" </dev/null >>"$root/server.log" 2>&1 &
    echo $! > "$pidfile"
  )
  n=0
  while [ "$n" -lt 80 ]; do
    [ -S "$root/server.sock" ] && break
    alive || break
    sleep 0.25
    n=$((n + 1))
  done
  if [ -S "$root/server.sock" ]; then
    say started 1
  else
    say started 0
    say log "$(tail -n 4 "$root/server.log" 2>/dev/null | tr '\n' ' ')"
  fi
}
`;

const LOOK = String.raw`
say home "$HOME"
say node "$(node -p 'process.versions.node' 2>/dev/null)"
for tool in npm tmux git tar claude; do
  if command -v "$tool" >/dev/null 2>&1; then say "$tool" 1; else say "$tool" 0; fi
done
have="$(cat "$root/server.stamp" 2>/dev/null)"
say stamp "$have"
if [ "$have" = "$STAMP" ] && [ -f "$root/server/server.mjs" ] && command -v node >/dev/null 2>&1 && command -v tmux >/dev/null 2>&1; then
  say ready 1
  start_server
else
  say ready 0
fi
`;

const INSTALL = String.raw`
new="$root/server.new"
cur="$root/server"
if [ ! -f "$new/server.mjs" ]; then
  say error "the server files did not arrive on the host"
  exit 0
fi
reuse=0
if [ -d "$cur/node_modules" ] && cmp -s "$cur/package-lock.json" "$new/package-lock.json"; then reuse=1; fi
if [ "$reuse" = 0 ]; then
  if ! (cd "$new" && npm ci --omit=dev --no-audit --no-fund) >"$root/install.log" 2>&1; then
    say error "npm ci failed on the host: $(tail -n 3 "$root/install.log" | tr '\n' ' ')"
    exit 0
  fi
fi
stop_server
if [ "$reuse" = 1 ]; then mv "$cur/node_modules" "$new/node_modules"; fi
rm -rf "$root/server.old"
if [ -d "$cur" ]; then mv "$cur" "$root/server.old"; fi
mv "$new" "$cur"
rm -rf "$root/server.old"
printf '%s' "$STAMP" > "$root/server.stamp"
say installed 1
RESTART=1
start_server
`;

export function remoteScript(body, { folder = ROOT_FOLDER, key, name, stamp, restart = false, hubFolder = "" }) {
  const head = [
    "FOLDER=" + quoted(folder),
    "KEY=" + quoted(key),
    "NAME=" + quoted(name),
    "STAMP=" + quoted(stamp),
    "RESTART=" + quoted(restart ? "1" : "0"),
    "HUBNAME=" + quoted(FOLDER_NAME.test(String(hubFolder || "")) ? hubFolder : "")
  ].join("\n");
  return head + "\n" + PRELUDE + body;
}

export const lookScript = (asked) => remoteScript(LOOK, asked);
export const installScript = (asked) => remoteScript(INSTALL, asked);

export function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

export function createSshHost({
  asked,
  publicKey,
  serverDir,
  name = "hive",
  hubFolder = "",
  folder = ROOT_FOLDER,
  bin = "ssh",
  tarBin = "tar",
  spawn = nodeSpawn,
  fetchImpl = fetch,
  pickPort = freePort,
  wait = sleep,
  now = () => Date.now(),
  retryAfter = RETRY_AFTER,
  tunnelPatience = TUNNEL_PATIENCE,
  log = () => {},
  onUp = () => {},
  onDown = () => {}
} = {}) {
  const host = sshTargetOf(asked);
  const key = String(publicKey || "").trim().split(/\s+/).slice(0, 2).join(" ");
  const who = String(name || "hive").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 40) || "hive";
  const label = host.ok ? host.label : String(asked || "").trim();

  let state = { phase: "idle", error: host.ok ? "" : host.error, url: "" };
  let facts = {};
  let stamp = "";
  let port = 0;
  let tunnel = null;
  let connecting = null;
  let failedAt = 0;
  let failures = 0;
  let restartNext = false;
  let leaving = false;

  const step = (phase) => {
    state = { phase, error: "", url: "" };
    log("ssh host " + label + ": " + phase);
  };

  function run(args, { input = "", timeout = PROBE_TIMEOUT } = {}) {
    return new Promise((done) => {
      let child = null;
      let out = "";
      let err = "";
      let settled = false;
      const finish = (ok, more = "") => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        done({ ok, out, err: err + more });
      };
      const timer = setTimeout(() => {
        try { child?.kill(); } catch {}
        finish(false, "\nno answer from the host in time");
      }, timeout);
      try {
        child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
      } catch (wrong) {
        return finish(false, "\n" + String(wrong?.message || wrong));
      }
      child.stdout.on("data", (chunk) => { out += chunk; });
      child.stderr.on("data", (chunk) => { err += chunk; });
      child.on("error", (wrong) => finish(false, wrong?.code === "ENOENT" ? "\nno ssh client" : "\n" + String(wrong?.message || wrong)));
      child.on("close", (code) => finish(code === 0));
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    });
  }

  async function ask(script, timeout) {
    const said = await run(execArgs(host, "sh -s"), { input: script, timeout });
    const seen = readFacts(said.out);
    if (!said.ok && !seen.home) throw new Error(sshReason(said.err, host.target) || "ssh to " + host.target + " failed and said nothing");
    return seen;
  }

  function upload(home) {
    const fresh = remoteLayout(home, folder).incoming;
    const command = "rm -rf " + quoted(fresh) + " && mkdir -p " + quoted(fresh) + " && tar -xzf - -C " + quoted(fresh);
    return new Promise((done, fail) => {
      let pack = null;
      let send = null;
      let bad = "";
      let settled = false;
      const finish = (wrong) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (wrong) {
          try { pack?.kill(); } catch {}
          try { send?.kill(); } catch {}
          return fail(wrong);
        }
        done();
      };
      const timer = setTimeout(() => finish(new Error("the server files took too long to reach " + label)), UPLOAD_TIMEOUT);
      try {
        pack = spawn(tarBin, ["-czf", "-", ...[...LEFT_OUT].map((one) => "--exclude=" + one), "-C", serverDir, "."], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, COPYFILE_DISABLE: "1" } });
        send = spawn(bin, execArgs(host, command), { stdio: ["pipe", "ignore", "pipe"] });
      } catch (wrong) {
        return finish(new Error(String(wrong?.message || wrong)));
      }
      pack.stderr.on("data", (chunk) => { bad += chunk; });
      send.stderr.on("data", (chunk) => { bad += chunk; });
      pack.on("error", (wrong) => finish(new Error("could not pack the server here — " + String(wrong?.message || wrong))));
      send.on("error", (wrong) => finish(new Error(sshReason(wrong?.code === "ENOENT" ? "no ssh client" : wrong?.message, host.target))));
      send.stdin.on("error", () => {});
      pack.on("close", (code) => { if (code !== 0) finish(new Error("could not pack the server here — " + (lastLine(bad) || "tar stopped (" + code + ")"))); });
      send.on("close", (code) => finish(code === 0 ? null : new Error("the server files did not reach " + label + " — " + (sshReason(bad, host.target) || "ssh stopped (" + code + ")"))));
      pack.stdout.pipe(send.stdin);
    });
  }

  async function healthy() {
    try {
      const said = await fetchImpl("http://127.0.0.1:" + port + "/health", { signal: AbortSignal.timeout(2000) });
      return !!said.ok;
    } catch {
      return false;
    }
  }

  async function openTunnel(socket) {
    if (!port) port = await pickPort();
    let bad = "";
    let gone = false;
    const child = spawn(bin, tunnelArgs(host, { localPort: port, socket }), { stdio: ["pipe", "ignore", "pipe"] });
    child.stdin.on("error", () => {});
    child.stderr.on("data", (chunk) => { bad = (bad + chunk).slice(-2000); });
    const over = (why) => {
      if (gone) return;
      gone = true;
      if (tunnel !== child) return;
      tunnel = null;
      if (leaving) return;
      state = { phase: "down", error: sshReason(why || bad, host.target) || "the ssh tunnel to " + label + " closed", url: "" };
      log("ssh host " + label + ": tunnel closed — " + state.error);
      onDown(state.error);
    };
    child.on("error", (wrong) => over(wrong?.code === "ENOENT" ? "no ssh client" : String(wrong?.message || wrong)));
    child.on("close", () => over(""));
    const deadline = now() + tunnelPatience;
    while (now() < deadline) {
      if (gone) {
        const why = sshReason(bad, host.target);
        if (/local end of the tunnel is taken/.test(why)) port = 0;
        throw new Error(why || "the ssh tunnel to " + label + " closed before it carried anything");
      }
      if (await healthy()) {
        tunnel = child;
        return;
      }
      await wait(250);
    }
    gone = true;
    try { child.kill(); } catch {}
    restartNext = true;
    throw new Error("the server on " + label + " is running and did not answer through the tunnel");
  }

  async function connect() {
    try {
      if (!host.ok) throw new Error(host.error);
      if (!PUBLIC_KEY.test(key)) throw new Error("this machine has no hive key to hand to the host yet");
      if (!stamp) stamp = serverStamp(serverDir);
      const asking = { folder, key, name: who, stamp, restart: restartNext, hubFolder };
      restartNext = false;
      step("looking at the host");
      let seen = await ask(lookScript(asking), PROBE_TIMEOUT);
      facts = seen;
      if (!seen.home) throw new Error(label + " did not say where its home folder is");
      if (!SAFE_HOME.test(seen.home)) throw new Error("the home folder on " + label + " (" + seen.home + ") has characters the Hive's scripts cannot carry");
      const installing = seen.ready !== "1";
      const lacking = whatTheHostLacks(seen, { installing });
      if (lacking) throw new Error(lacking);
      if (installing) {
        step("copying the server to the host");
        await upload(seen.home);
        step("installing the server on the host");
        seen = { ...seen, ...(await ask(installScript(asking), INSTALL_TIMEOUT)) };
        facts = seen;
        if (seen.error) throw new Error(seen.error);
        if (seen.installed !== "1") throw new Error("the install on " + label + " stopped before it finished");
      }
      if (seen.started !== "1") throw new Error("the server did not start on " + label + (seen.log ? " — " + seen.log : ""));
      step("opening the tunnel");
      await openTunnel(remoteLayout(seen.home, folder).socket);
      failedAt = 0;
      failures = 0;
      state = { phase: "up", error: "", url: "http://127.0.0.1:" + port };
      log("ssh host " + label + ": up on " + state.url);
      onUp(state.url);
      return state.url;
    } catch (wrong) {
      failedAt = now();
      failures += 1;
      state = { phase: "down", error: String(wrong?.message || wrong), url: "" };
      log("ssh host " + label + ": " + state.error);
      return "";
    }
  }

  function begin() {
    if (leaving) return null;
    if (tunnel && state.phase === "up") return null;
    if (connecting) return connecting;
    if (failedAt && now() - failedAt < Math.min(RETRY_CEILING, retryAfter * 2 ** Math.max(0, failures - 1))) return null;
    connecting = connect().finally(() => { connecting = null; });
    return connecting;
  }

  return {
    label,
    target: host.ok ? host.target : "",

    status() {
      return { asked: true, target: host.ok ? host.target : "", label, phase: state.phase, error: state.error, away: state.phase === "down" && HOST_AWAY.test(state.error), hub: facts.hub === "1", home: facts.home || "", url: state.url, node: facts.node || "", claude: facts.claude === "1" };
    },

    paths(text) {
      return hostPathsIn(text, facts.home, folder);
    },

    url() {
      begin();
      return tunnel && state.phase === "up" ? state.url : "";
    },

    async reach(timeout = 0) {
      const going = begin();
      if (going && timeout > 0) {
        let timer = null;
        await Promise.race([going, new Promise((done) => { timer = setTimeout(done, timeout); })]);
        clearTimeout(timer);
      }
      return tunnel && state.phase === "up" ? state.url : "";
    },

    async alive() {
      const held = tunnel;
      if (!held || state.phase !== "up") return false;
      if (await healthy()) return true;
      if (tunnel !== held) return false;
      tunnel = null;
      state = { phase: "down", error: "the tunnel to " + label + " stopped answering — the machine may have gone to sleep", url: "" };
      log("ssh host " + label + ": " + state.error);
      try { held.stdin?.end(); } catch {}
      try { held.kill(); } catch {}
      onDown(state.error);
      return false;
    },

    again() {
      failedAt = 0;
      failures = 0;
      return begin();
    },

    stop() {
      leaving = true;
      const going = tunnel;
      tunnel = null;
      state = { phase: "idle", error: "", url: "" };
      try { going?.stdin?.end(); } catch {}
      try { going?.kill(); } catch {}
    }
  };
}
