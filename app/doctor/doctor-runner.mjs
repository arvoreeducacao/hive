import { execFile } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import * as readings from "./doctor-readings.mjs";
import { askTheDoor } from "../lib/cloud-door.mjs";
import { createBrokerClient } from "../../server/client.mjs";
import { loadIdentity } from "../lib/hive-identity.mjs";
import { avdHomeOf, avdNamesIn, sdkRootOf, toolsOf } from "../lib/device.mjs";
import { gitBashOf } from "./fix-shell.mjs";
import { readTable, strays } from "../../server/engine/leftovers.mjs";
import { seatWindowSession } from "../../server/sessions.mjs";
import { AWS_PROFILE, DEPLOYMENT_DIR, HUB_FOLDER, NS as CONFIGURED_NAMESPACE, POD_HUB, REPOS_OWNER, clusterIsWanted } from "../lib/env.mjs";

export const NS = CONFIGURED_NAMESPACE;
export const DEPS = process.platform === "win32" ? ["gh"] : ["tmux", "gh"];
export const CLUSTER_DEPS = ["kubectl", "aws"];
export const depsWanted = (ctx) => (ctx?.pod ? [...DEPS, ...CLUSTER_DEPS] : DEPS);
export const TIMEOUTS = { local: 3000, cluster: 9000, node: 4000, probe: 12000, podCheck: 13000, door: 10000, warmup: 15000, fix: 180000 };

const asSeconds = (ms) => `${Math.max(1, Math.round(ms / 1000))}s`;

export const REPO_MARK = "infra/scripts/setup.sh";

/* the copy the bundle carries, which is deliberately not under REPO_MARK: an app
   that was installed rather than cloned still has a setup to run */
export const bundledSetupIn = (here) => join(here, "..", "..", "setup", "setup.sh");

export const powerSwitchIn = (repo, deploymentDir) =>
  (repo && deploymentDir ? join(repo, deploymentDir, "scripts", "pod-power.sh") : "");

export const doorCanRun = (ctx) => !!(ctx?.serverUrl && ctx?.serverKey);

export async function overThePort(ctx, script, timeoutMs) {
  let identity = null;
  try { identity = loadIdentity(ctx.home ? join(ctx.home, ".hive") : undefined); } catch { identity = null; }
  if (!identity) return { ok: false, out: "", err: "this machine has no key of its own to sign with" };
  const client = createBrokerClient({ url: ctx.serverUrl, identity, audience: ctx.serverKey });
  const said = await client.post("/api/run", { script, timeoutMs });
  if (!said.ok) return { ok: false, out: "", err: said.error || "the server would not answer" };
  const body = said.body || {};
  return { ok: !!body.ok, out: Buffer.from(String(body.out || ""), "base64").toString("utf8"), err: String(body.err || "") };
}

const HERE = dirname(fileURLToPath(import.meta.url));

export function run(cmd, args, timeout) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 4 << 20, env: { ...process.env, ...(AWS_PROFILE ? { AWS_PROFILE } : {}) } },
      (err, stdout, stderr) => resolve({ ok: !err, out: stdout || "", err: err ? String(stderr || err.message || "").trim() : "" }));
  });
}

export function withTimeout(promise, ms, whenLate) {
  return new Promise((resolve) => {
    const clock = setTimeout(() => resolve(whenLate), ms);
    promise.then((v) => { clearTimeout(clock); resolve(v); }, () => { clearTimeout(clock); resolve(whenLate); });
  });
}

function once(fn) {
  let promise = null;
  return () => (promise ||= fn());
}

async function exists(path) {
  try { await access(path, constants.F_OK); return true; } catch { return false; }
}

/* windows names an executable by its extension, and nothing there is marked
   executable the way a unix file is */
const WINDOWS_SUFFIXES = ["", ".exe", ".cmd", ".bat"];

/* PATH is cut by ; on windows and by : everywhere else, and a folder there is
   spelled C:\..., which the unix separator would cut in half */
export function pathDirs(env = process.env, platform = process.platform) {
  return String(env.PATH || env.Path || "").split(platform === "win32" ? ";" : ":").filter(Boolean);
}

export async function onPath(name, dirs, platform = process.platform) {
  const names = platform === "win32" ? WINDOWS_SUFFIXES.map((suffix) => `${name}${suffix}`) : [name];
  const how = platform === "win32" ? constants.F_OK : constants.X_OK;
  for (const dir of dirs) {
    for (const one of names) {
      try { await access(join(dir, one), how); return true; } catch {}
    }
  }
  return false;
}

async function findRepo(candidates) {
  for (const base of candidates) {
    if (!base) continue;
    let dir = base;
    for (let hop = 0; hop < 4; hop += 1) {
      if (await exists(join(dir, REPO_MARK))) return dir;
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return dirname(HERE);
}

function keyBody(text) {
  const parts = String(text || "").trim().split(/\s+/);
  const body = parts[1] || "";
  return /^[A-Za-z0-9+/=]+$/.test(body) ? body : "";
}

/* the contract is read through CLAUDE.md, which in the hub is a symlink to
   AGENTS.md: the commit holds the link itself, so the blob to compare against is
   the one the link points at, not the nine bytes spelling its target */
export const contractBlobShell = (dir) => `contract_blob() {
    p=CLAUDE.md
    if [ "$(git -C ${dir} ls-tree "$1" "$p" 2>/dev/null | awk '{print $1}')" = "120000" ]; then
      p=$(git -C ${dir} show "$1:$p" 2>/dev/null)
    fi
    git -C ${dir} rev-parse "$1:$p" 2>/dev/null || echo ""
  }`;

export function probeScript(ctx) {
  const podHub = ctx.podHub ?? POD_HUB;
  const hubFolder = ctx.hubFolder ?? HUB_FOLDER;
  const lookup = ctx.publicKey ? `grep -qF '${ctx.publicKey}' ${readings.HIVE_DIR}/allowed_signers` : "false";
  const flags = 'node -e \'const fs=require("fs");let j={};try{j=JSON.parse(fs.readFileSync(process.env.HOME+"/.claude.json","utf8"))}catch(e){}' +
    'let s={};try{s=JSON.parse(fs.readFileSync(process.env.HOME+"/.claude/settings.json","utf8"))}catch(e){}' +
    `const t={};for(const d of ${JSON.stringify(ctx.trustedDirs ?? readings.TRUSTED_DIRS)})t[d]=!!(j.projects&&j.projects[d]&&j.projects[d].hasTrustDialogAccepted);` +
    'console.log(JSON.stringify({onboarding:!!j.hasCompletedOnboarding,bypass:!!j.bypassPermissionsModeAccepted,trusted:t,cross:s.crossSessionInbound||""}))\'';
  const memory = 'node -e \'const fs=require("fs");const read=(f)=>{try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch(e){return {}}};' +
    'const home=process.env.HOME;const ins=read(home+"/.claude/plugins/installed_plugins.json");const cfg=read(home+"/.claude/settings.json");' +
    'const cred=read(home+"/.config/pi/memory-credentials.json");' +
    `console.log(JSON.stringify({installed:!!(ins.plugins||{})["${ctx.memoryPlugin ?? readings.MEMORY_PLUGIN}"],enabled:(cfg.enabledPlugins||{})["${ctx.memoryPlugin ?? readings.MEMORY_PLUGIN}"]===true,user:cred.username||"",refresh:!!cred.refreshToken,expiresIn:cred.expiresAt?Math.round((cred.expiresAt-Date.now())/1000):0}))'`;
  const cloudSessions = 'node -e \'const fs=require("fs");const read=(f)=>{try{return fs.readFileSync(f,"utf8")}catch(e){return ""}};const home=process.env.HOME;' +
    'let c={};try{c=JSON.parse(read(home+"/.claude/cloud-sessions.json"))}catch(e){}' +
    'const state=home+"/.claude/cloud-sessions";const last=Number(read(state+"/last-sync").trim())||0;' +
    'const lines=read(state+"/sync.log").trim().split(String.fromCharCode(10)).filter(Boolean);' +
    `console.log(JSON.stringify({repo:(c.git&&c.git.repo)||"",script:fs.existsSync("${readings.CLOUD_SESSIONS_ON_POD}"),lastSync:last,lastLog:lines.pop()||"",now:Date.now()}))'`;
  return `export HOME=/workspace/home PATH=/workspace/npm-global/bin:$PATH
printf '\\n==clock\\n'; date +%s
printf '\\n==signers\\n'
if [ -f ${readings.HIVE_DIR}/allowed_signers ]; then
  if ${lookup}; then echo has; else echo missing-key; fi
  awk '{print $1}' ${readings.HIVE_DIR}/allowed_signers | sort -u | tr '\\n' ' '
  echo
else
  echo absent
fi
printf '\\n==credential\\n'; node -e 'try{const o=JSON.parse(require("fs").readFileSync("/workspace/home/.claude/.credentials.json","utf8")).claudeAiOauth||{};console.log(JSON.stringify({token:!!o.accessToken,expires:o.expiresAt||0,refresh:!!o.refreshToken,plan:o.subscriptionType||""}))}catch(e){console.log("{}")}' 2>/dev/null || echo "{}"
printf '\\n==flags\\n'; ${flags} 2>/dev/null
printf '\\n==memory\\n'; ${memory} 2>/dev/null
printf '\\n==boot\\n'; tail -20 ${readings.BOOT_LOG} 2>/dev/null
printf '\\n==cloudsessions\\n'; ${cloudSessions} 2>/dev/null
printf '\\n==control\\n'; if tmux has-session -t rc 2>/dev/null; then tmux capture-pane -t rc -p 2>/dev/null | grep -v '^$' | tail -6; else echo down; fi
printf '\\n==repos\\n'
for d in /workspace/repos/*/; do
  [ -d "$d" ] || continue
  if [ -d "$d/.git" ]; then echo "ok $(basename "$d")"; else echo "no-git $(basename "$d")"; fi
done
printf '\\n==context\\n'
if [ -d /workspace/hive/context/.git ]; then
  git -C /workspace/hive/context fetch --quiet origin main 2>/dev/null || true
  ${contractBlobShell(readings.HUB_CONTEXT_DIR)}
  tip=$(contract_blob origin/main)
  here=$(contract_blob main)
  [ -n "$tip" ] || tip=$here
  behind=$(git -C /workspace/hive/context rev-list --count main..origin/main 2>/dev/null || echo 0)
  dirty=$(git -C /workspace/hive/context status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  at=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync("/workspace/hive/context-version.json","utf8")).at||"")}catch(e){console.log("")}' 2>/dev/null)
  echo "present tip=$tip behind=$behind dirty=$dirty at=$at"
  seat=absent
  if [ -f ${podHub}/CLAUDE.md ]; then
    b=$(git -C ${podHub} hash-object CLAUDE.md 2>/dev/null || echo "")
    if [ -n "$b" ] && [ "$b" = "$tip" ]; then seat=ok; else seat=stale; fi
  fi
  echo "seat:$seat"
  stale=""
  for d in /workspace/worktrees/${hubFolder}/*/; do
    [ -f "$d/CLAUDE.md" ] || continue
    b=$(git -C "$d" hash-object CLAUDE.md 2>/dev/null || echo "")
    if [ -n "$b" ] && [ "$b" != "$tip" ]; then stale="$stale $(basename "$d")"; fi
  done
  echo "stale:$stale"
else
  echo absent
fi
printf '\\n==gh\\n'; s=$(gh auth status 2>&1); case "$s" in *"Logged in"*) echo "logged-in $(printf '%s' "$s" | sed -n 's/.*account \\([^ ]*\\).*/\\1/p' | head -1)";; *) echo logged-out;; esac
printf '\\n==mcpenv\\n'; curl -fsS --max-time 3 http://127.0.0.1:4671/health 2>/dev/null || echo gateway-down
printf '\\n==disk\\n'; df -k /workspace | tail -1
true`;
}

export async function buildContext(options = {}) {
  const env = options.env || process.env;
  const home = options.home || env.HOME || env.USERPROFILE || homedir() || "";
  const configPath = join(home, ".hive/config");
  const hasConfig = await exists(configPath);
  const configText = hasConfig ? await readFile(configPath, "utf8").catch(() => "") : "";
  const config = readings.readConfig(configText);
  const dev = env.HIVE_DEV || config.HIVE_DEV || "";
  const pod = env.HIVE_POD || config.HIVE_POD || "";
  const hub = env.HIVE_HUB || config.HIVE_HUB || "";
  const key = dev ? join(home, `.hive/key-${dev}`) : "";
  const publicKey = key ? keyBody(await readFile(`${key}.pub`, "utf8").catch(() => "")) : "";
  const repo = options.repo || (await findRepo([env.HIVE_REPO, config.HIVE_REPO, HERE, process.cwd()]));
  return {
    dev,
    pod,
    ns: NS,
    serverUrl: env.HIVE_SERVER_URL || config.HIVE_SERVER_URL || "",
    serverKey: env.HIVE_SERVER_KEY || config.HIVE_SERVER_KEY || "",
    onACluster: clusterIsWanted(env, config),
    powerSwitch: powerSwitchIn(repo, DEPLOYMENT_DIR),
    deploymentDir: DEPLOYMENT_DIR,
    podHub: POD_HUB,
    hubFolder: HUB_FOLDER,
    reposOwner: REPOS_OWNER,
    expectedRepos: readings.EXPECTED_REPOS,
    memoryPlugin: readings.MEMORY_PLUGIN,
    trustedDirs: readings.TRUSTED_DIRS,
    home,
    stateDir: env.HIVE_STATE_DIR || env.HIVE_HOME || join(home, ".hive"),
    hub,
    repo,
    configPath,
    hasConfig,
    configText,
    hubExists: hub ? await exists(hub) : false,
    repoHasSetup: await exists(join(repo, REPO_MARK)),
    bundledSetup: (await exists(bundledSetupIn(HERE))) ? bundledSetupIn(HERE) : "",
    key,
    publicKey,
    packageManager: process.platform === "darwin" ? "brew install" : process.platform === "win32" ? "winget install" : "sudo apt-get install -y",
    platform: process.platform,
    paths: pathDirs(env),
    androidSdk: sdkRootOf(env, home),
    avdHome: avdHomeOf(env, home),
    podAsleep: false
  };
}

async function androidOf(ctx) {
  const tools = toolsOf(ctx.androidSdk || "");
  if (!tools) return { sdk: "", adb: false, emulator: false, avds: [] };
  const [adb, emulator] = await Promise.all([exists(tools.adb), exists(tools.emulator)]);
  return { sdk: tools.root, adb, emulator, avds: avdNamesIn(ctx.avdHome || "") };
}

export async function runChecks(ctx, options = {}) {
  const exec = options.exec || run;
  const now = options.now || (() => Date.now());
  const platform = options.platform || process.platform;
  const bashOf = options.gitBashOf || gitBashOf;
  const T = { ...TIMEOUTS, ...(options.timeouts || {}) };

  const clusterWait = T.cluster + T.node;
  ctx.now = now;
  ctx.probeSeconds = Math.round(T.probe / 1000);

  const cluster = once(async () => {
    if (!ctx.onACluster) return { verdict: "", verdictErr: "" };
    if (!ctx.powerSwitch) return { verdict: "", verdictErr: "this hive names no deployment, so nothing here knows how to look at the cluster" };
    if (!(await exists(ctx.powerSwitch))) return { verdict: "", verdictErr: `there is no ${ctx.powerSwitch} — this checkout is older than the script, or is not the checkout the app found` };
    const said = await exec(platform === "win32" ? (bashOf() || "bash") : "bash", [ctx.powerSwitch, "verdict"], clusterWait);
    return said.ok ? { verdict: said.out, verdictErr: "" } : { verdict: "", verdictErr: said.err || "no answer in time" };
  });

  const probe = once(async () => {
    if (!ctx.serverUrl || !ctx.serverKey) return { parts: null, delta: 0, measured: false };
    const start = now();
    const r = await (options.probe || overThePort)(ctx, probeScript(ctx), T.probe);
    const middle = (start + now()) / 2;
    if (!r.out.includes("==disk")) {
      ctx.probeFailure = readings.execFailure(r.err);
      return { parts: null, delta: 0, measured: false };
    }
    const parts = readings.sliceProbe(r.out);
    const epoch = Number(parts.clock || 0);
    return { parts, delta: epoch ? epoch - middle / 1000 : 0, measured: !!epoch };
  });

  const ask = options.ask || askTheDoor;
  const door = once(async () => {
    const url = ctx.serverUrl || "";
    if (!url) return { url: "", ok: false, error: "this hive has no server address — put one in HIVE_SERVER_URL" };
    return { url, ...(await ask(url, { timeoutMs: T.door })) };
  });

  const clusterState = once(async () => {
    const late = `no answer in ${asSeconds(clusterWait)} while reading the cluster`;
    const raw = await withTimeout(cluster(), clusterWait, { verdict: "", verdictErr: late });
    ctx.podAsleep = !!readings.readJson(raw.verdict)?.asleep;
    return raw;
  });

  const probeParts = once(async () => {
    const [seen] = await Promise.all([withTimeout(probe(), T.probe, { parts: null, measured: false, delta: 0 }), clusterState()]);
    return seen;
  });

  const section = async (name) => {
    const seen = await probeParts();
    return seen.parts ? (seen.parts[name] ?? "") : null;
  };

  const processes = options.processes || processTable;
  const strayProcesses = async () => {
    if (platform === "win32") return { measured: false, rows: [] };
    const session = ctx.tmuxSession || seatWindowSession(ctx.home || "");
    const { rows, windows } = await processes({ platform, session, timeout: T.local });
    if (!Array.isArray(windows)) return { measured: false, rows: [] };
    return { measured: true, rows: strays(rows, windows, { hive: ctx.stateDir }) };
  };

  const checks = [
    { id: "config", title: "~/.hive/config", timeout: T.local, run: async () =>
      readings.checkConfig({ exists: ctx.hasConfig, text: ctx.configText, path: ctx.configPath, hubExists: ctx.hubExists }, ctx) },
    { id: "key", title: "signing key", timeout: T.local, run: async () => readings.checkKey({
      keyExists: ctx.key ? await exists(ctx.key) : false,
      path: ctx.key
    }, ctx) },
    { id: "deps", title: "dependencies on PATH", timeout: T.local, run: async () => {
      const wanted = depsWanted(ctx);
      const found = await Promise.all(wanted.map((dep) => onPath(dep, ctx.paths || [], ctx.platform)));
      return readings.checkDeps(wanted.filter((_, i) => !found[i]), ctx, wanted);
    } },
    { id: "android", title: "android emulator", timeout: T.local, run: async () => readings.checkAndroid(await androidOf(ctx), ctx) },
    { id: "leftovers", title: "processes of chats that are gone", timeout: Math.max(T.local, WINDOWS_WAIT) + 500, run: async () => readings.checkLeftovers(await strayProcesses(), ctx) },
    { id: "clock", title: "clock in sync with the server", timeout: T.podCheck, run: async () => readings.checkClock(await probeParts(), ctx) },
    { id: "pod", title: "server up", timeout: clusterWait + 1000, run: async () => {
      const [cluster, seen] = await Promise.all([clusterState(), probeParts()]);
      return readings.checkPod(cluster, ctx, !!seen.parts);
    } },
    { id: "cloud-door", title: "door to the server", timeout: T.door + 1000, run: async () => readings.checkCloudDoor(await door(), ctx) },
    { id: "last-boot", title: "the server's last boot", timeout: T.podCheck, run: async () => readings.checkLastBoot(await section("boot"), ctx) },
    { id: "allowed-signers", title: "allowed_signers on the server", timeout: T.podCheck, run: async () => readings.checkSigners(await section("signers"), ctx) },
    { id: "credential", title: "Claude credential on the server", timeout: T.podCheck, run: async () => readings.checkCredential(await section("credential"), ctx) },
    { id: "flags", title: "Claude flags on the server", timeout: T.podCheck, run: async () => readings.checkFlags(await section("flags"), ctx) },
    { id: "memory", title: "team memory on the server", timeout: T.podCheck, run: async () => readings.checkMemory(await section("memory"), ctx) },
    { id: "cloud-sessions", title: "session sync on the server", timeout: T.podCheck, run: async () => readings.checkCloudSessions(await section("cloudsessions"), ctx) },
    { id: "remote-control", title: "remote control alive", timeout: T.podCheck, run: async () => readings.checkRemoteControl(await section("control"), ctx, await section("credential")) },
    { id: "repos", title: "repos cloned on the server", timeout: T.podCheck, run: async () => readings.checkRepos(await section("repos"), ctx) },
    { id: "hub-context", title: "canonical hub context on the server", timeout: T.podCheck, run: async () => readings.checkHubContext(await section("context"), ctx) },
    { id: "hub-contract", title: "hub contract in the seats", timeout: T.podCheck, run: async () => readings.checkHubContract(await section("context"), ctx) },
    { id: "gh", title: "gh authenticated on the server", timeout: T.podCheck, run: async () => readings.checkGh(await section("gh"), ctx) },
    { id: "mcp-env", title: "MCP credentials on the server", timeout: T.podCheck, run: async () => readings.checkMcpEnv(await section("mcpenv"), ctx) },
    { id: "disk", title: "space on /workspace", timeout: T.podCheck, run: async () => readings.checkDisk(await section("disk"), ctx) }
  ];

  return readings.collapseRootCause(await Promise.all(checks.map((check) => withTimeout(check.run(), check.timeout, timedOut(check)))));
}

export const WINDOWS_WAIT = 8000;

const NO_SESSION = /no server running|error connecting to .*No such file|can't find session|no such session|no sessions|session not found/i;

export function windowsOf(said) {
  if (said.ok) return said.out.split("\n").map((name) => name.trim()).filter(Boolean);
  return NO_SESSION.test(String(said.err || "")) ? [] : null;
}

export async function processTable({ platform, session, timeout }) {
  const [rows, windows] = await Promise.all([
    readTable({ platform, run: (cmd, args) => run(cmd, args, timeout) }),
    run("tmux", ["list-windows", "-t", session, "-F", "#W"], Math.max(timeout, WINDOWS_WAIT))
  ]);
  return { rows, windows: windowsOf(windows) };
}

export function timedOut(check) {
  return {
    id: check.id,
    title: check.title,
    state: "fail",
    detail: `no answer in ${asSeconds(check.timeout)} while checking ${check.title}, so this check was cut short`,
    fix: null
  };
}

export async function diagnose(options = {}) {
  const ctx = options.ctx || (await buildContext(options));
  const items = await runChecks(ctx, options);
  return {
    dev: ctx.dev,
    pod: ctx.pod,
    ranWith: `${process.execPath} ${fileURLToPath(new URL("doctor.mjs", import.meta.url))}`,
    generatedAt: new Date(options.now ? options.now() : Date.now()).toISOString(),
    items
  };
}
