import { AVD_RECIPE, DEFAULT_AVD } from "../lib/device.mjs";
import { NATIVE, asPosixPath } from "./fix-shell.mjs";
import { DEPLOYMENT_DIR, EXPECTED_REPOS as REPOS_WANTED, HUB_FOLDER, MEMORY_PLUGIN as PLUGIN_WANTED, POD_HUB, REPO_FOLDER, REPOS_OWNER } from "../lib/env.mjs";

export const EXPECTED_REPOS = REPOS_WANTED;
export const TRUSTED_DIRS = [...new Set([POD_HUB, `/workspace/repos/${REPO_FOLDER}`, "/workspace/hive"])].filter((one) => one && one !== "/workspace/repos/");
export const HIVE_DIR = "/workspace/hive";
export const BOOT_LOG = "/workspace/hive/boot.log";
export const SKIPPED = "skipped — the server is not up (see the server check)";
export const SKIPPED_DOWN_POD = "skipped — the server is not running (see the server check)";
export const CLOUD_SESSIONS_ON_POD = "/workspace/hive/cloud-sessions.mjs";
export const MEMORY_PLUGIN = PLUGIN_WANTED;
export const SIGNATURE_WINDOW = 90;

export function deploymentScript(ctx, name) {
  const dir = ctx.deploymentDir ?? DEPLOYMENT_DIR;
  return dir && ctx.repo ? `${ctx.repo}/${dir}/scripts/${name}` : "";
}

function runsDeploymentScript(ctx, name, label, tail = "") {
  const script = deploymentScript(ctx, name);
  return script ? { label, command: `${script} ${ctx.dev || "<your-name>"}${tail}` } : null;
}
export const CLOCK_OK = 10;
export const CLOCK_WARN = 45;
export const DISK_WARN = 85;
export const DISK_FAIL = 95;
export const CONNECTED_CONTROL = /Ready|Reconnected|claude\.ai\/code\?environment=|show QR code/i;
export const HUB_CONTEXT_DIR = "/workspace/hive/context";
export const HUB_CONTEXT_FRESH_HOURS = 24;
export const HUB_CHECKOUT = "hub-checkout";
export const ANDROID_NOT_CONFIGURED = "not configured — only the device pane needs it";
export const NO_DOOR_AT_ALL = /ENOTFOUND|EAI_AGAIN|getaddrinfo|could not resolve|nodename nor servname/i;

const preAcceptFor = (dirs) => 'node -e \'const fs=require("fs");const p=process.env.HOME+"/.claude.json";let j={};try{j=JSON.parse(fs.readFileSync(p,"utf8"))}catch(e){}j.hasCompletedOnboarding=true;j.bypassPermissionsModeAccepted=true;j.projects=j.projects||{};for(const d of ' +
  JSON.stringify(dirs) +
  ')j.projects[d]=Object.assign({},j.projects[d]||{},{hasTrustDialogAccepted:true});fs.writeFileSync(p,JSON.stringify(j,null,2))\'';

const ACCEPT_CROSS = 'node -e \'const fs=require("fs");const p=process.env.HOME+"/.claude/settings.json";let j={};try{j=JSON.parse(fs.readFileSync(p,"utf8"))}catch(e){}j.crossSessionInbound="accept";fs.writeFileSync(p,JSON.stringify(j,null,2))\'';

export const powerSwitchOf = (ctx) => (ctx.powerSwitch ? `bash ${ctx.powerSwitch}` : "bash <this deployment ships no power switch>");

/* Two ways to say the same thing, and a fix needs both. `command` is what a
   person reads and pastes, and it goes through the deployment's power switch,
   which is the only thing that can also turn a stopped box on. `podScript` is
   the same work as plain script, for the door to run: a machine with no
   kubectl still reaches a server that is up, and that is how the checks above
   already read this box. */
export function onPod(ctx, script) {
  return { command: `${powerSwitchOf(ctx)} exec ${quoted(script)}`, podScript: script };
}

function quoted(text) {
  return `'${String(text).replace(/'/g, `'\\''`)}'`;
}

export function chain(...steps) {
  return steps.filter(Boolean).join(" && ");
}

const onWindows = (ctx) => ctx?.platform === "win32";

/* setup is a shell script, and on windows the shell that runs it is the one Git
   for Windows ships — so the path it is given is spelled the way that shell
   reads a path, and the label says where to paste it. */
export const CHECKOUT_UNKNOWN = "<path-to-the-dev-workspaces-checkout>";

/* an installed app is not a checkout of anything, so when the folder it guessed
   holds no setup.sh the command says which folder it is waiting for instead of
   naming one that is not there */
function setupCommand(ctx, tail) {
  const spell = (path) => (onWindows(ctx) ? `"${asPosixPath(path)}"` : path);
  if (ctx?.repoHasSetup === false) {
    if (ctx.bundledSetup) return `${spell(ctx.bundledSetup)} ${tail}`;
    return `${CHECKOUT_UNKNOWN}/infra/scripts/setup.sh ${tail}`;
  }
  return `${spell(`${ctx.repo}/infra/scripts/setup.sh`)} ${tail}`;
}

const setupLabel = (ctx, label) => (onWindows(ctx) ? `${label}, in Git Bash` : label);

/* winget answers to the id of a package, not to the name of the command it
   installs, and it stops on the agreements when nobody is at the keyboard. */
export const WINDOWS_PACKAGES = {
  gh: "GitHub.cli",
  git: "Git.Git",
  tmux: "",
  kubectl: "Kubernetes.kubectl",
  awscli: "Amazon.AWSCLI"
};

export function wingetCommand(packages) {
  const ids = packages.map((one) => WINDOWS_PACKAGES[one] ?? one).filter(Boolean);
  if (!ids.length) return "";
  return ids.map((id) => `winget install --id ${id} -e --accept-source-agreements --accept-package-agreements`).join(" && ");
}

export const fixes = {
  runSetup: (ctx) => ({ label: setupLabel(ctx, "prepare this machine"), command: setupCommand(ctx, ctx.dev || "<your-name>") }),
  pointHub: (ctx) => ({ label: setupLabel(ctx, "run setup again, so this machine learns where things are"), command: setupCommand(ctx, `${ctx.dev || "<your-name>"} ${ctx.hub || "<path-to-your-workspace>"}`) }),
  killLeftovers: (_ctx, pids = []) => ({ label: "stop the processes those chats left behind", command: `kill ${pids.join(" ")}` }),
  installDeps: (ctx, packages) => {
    const winget = onWindows(ctx) ? wingetCommand(packages) : "";
    if (winget) return { label: "install the missing tools", command: winget, shell: NATIVE };
    return { label: "install the missing tools", command: `${ctx.packageManager || "brew install"} ${packages.join(" ")}` };
  },
  syncClock: (ctx) => ({
    label: "sync this machine's clock",
    command: ctx?.platform === "darwin" ? "sudo sntp -sS time.apple.com" : "sudo timedatectl set-ntp true"
  }),
  provisionPod: (ctx) => runsDeploymentScript(ctx, "provision.sh", "provision the box", " <ssh-public-key>"),
  wakePod: (ctx) => ({ label: "bring the server back up", command: `${powerSwitchOf(ctx)} up` }),
  describePod: (ctx) => ({ label: "see why the server is not up", command: `${powerSwitchOf(ctx)} why`, kind: "investigate" }),
  rollPod: (ctx) => ({
    label: "restart the box onto the new server",
    command: `${powerSwitchOf(ctx)} restart`
  }),
  forceDeletePod: (ctx) => ({ label: "force-remove the stuck box", command: `${powerSwitchOf(ctx)} force-remove` }),
  describeNode: (node, ctx = {}) => ({ label: "see why the machine under it died", command: `${powerSwitchOf(ctx)} why-node ${node || "<node>"}`, kind: "investigate" }),
  readBootLog: (ctx) => ({ label: "read the server's black box", ...onPod(ctx, `tail -40 ${BOOT_LOG}`), kind: "investigate" }),
  authorizeKey: (ctx) => ({
    label: "authorize your key on the server",
    ...onPod(ctx, `mkdir -p ${HIVE_DIR} && printf '%s\\n' "${ctx.dev} ${ctx.publicKey || "<public-key>"}" >> ${HIVE_DIR}/allowed_signers`)
  }),
  loginClaude: (ctx) => runsDeploymentScript(ctx, "pod-login.sh", "log Claude in on the server", ""),
  preAcceptFlags: (ctx) => ({ label: "pre-accept the dialogs", ...onPod(ctx, chain(preAcceptFor(ctx.trustedDirs ?? TRUSTED_DIRS), ACCEPT_CROSS)) }),
  restartControl: (ctx) => ({
    label: "restart the remote control",
    ...onPod(ctx, `tmux kill-session -t rc 2>/dev/null; tmux new-session -d -s rc "export HOME=/workspace/home PATH=/workspace/npm-global/bin:$PATH && cd ${POD_HUB} && claude remote-control"`)
  }),
  syncHubContext: (ctx) => ({
    label: "sync the canonical hub context",
    ...onPod(ctx, `git -C ${POD_HUB} pull --ff-only && node ${POD_HUB}/scripts/hive/context.mjs`),
    heals: true
  }),
  inspectHubContext: (ctx) => ({ label: "see what dirtied the canonical context", ...onPod(ctx, `git -C ${HUB_CONTEXT_DIR} status`), kind: "investigate" }),
  pullSeat: (ctx) => ({ label: "fast-forward the hub checkout", ...onPod(ctx, `git -C ${POD_HUB} pull --ff-only`) }),
  mirrorPod: (ctx) => runsDeploymentScript(ctx, "pod-mirror.sh", "mirror your machine onto the server", ""),
  cloneRepos: (ctx, repos) => ({
    label: "clone the missing repos",
    ...onPod(ctx, `mkdir -p /workspace/repos && cd /workspace/repos && for r in ${repos.join(" ")}; do git clone https://github.com/${ctx.reposOwner ?? REPOS_OWNER}/$r.git; done`)
  }),
  loginGh: (ctx) => ({ label: "log gh in on the server", command: `${powerSwitchOf(ctx)} shell gh auth login` }),
  installMemory: (ctx) => runsDeploymentScript(ctx, "pod-memory.sh", "install the team memory on the server", ""),
  installCloudSessions: (ctx) => runsDeploymentScript(ctx, "pod-cloud-sessions.sh", "install the session sync on the server", " <private-repo-url>"),
  syncCloudSessions: (ctx) => ({ label: "run a session sync on the server", ...onPod(ctx, `node ${CLOUD_SESSIONS_ON_POD} sync`) }),
  seeDisk: (ctx) => ({ label: "see what is eating the disk", ...onPod(ctx, "du -sh /workspace/* 2>/dev/null | sort -h | tail -12"), kind: "investigate" }),
  pushEnv: (ctx) => runsDeploymentScript(ctx, "pod-env.sh", "push the .env to the secret and the running server", " <path-to-.env>"),
  seeGateway: (ctx) => ({ label: "read the MCP gateway log", ...onPod(ctx, `tail -40 ${POD_HUB}/.mcp-servers/gateway.log`), kind: "investigate" }),
  openDoor: (ctx) => runsDeploymentScript(ctx, "pod-door.sh", "open the server's door", " open"),
  installAndroidTools: () => ({ label: "install adb and the emulator into the sdk", command: 'sdkmanager "platform-tools" "emulator"' }),
  createAvd: () => ({ label: `create the ${DEFAULT_AVD} AVD`, command: AVD_RECIPE })
};

export function sliceProbe(raw) {
  const map = {};
  let target = null;
  for (const line of String(raw || "").split("\n")) {
    if (line.startsWith("==")) { target = line.slice(2).trim(); map[target] = []; continue; }
    if (target) map[target].push(line);
  }
  for (const key of Object.keys(map)) map[key] = map[key].join("\n").trim();
  return map;
}

export function readConfig(text) {
  const map = {};
  for (const line of String(text || "").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    map[m[1]] = value;
  }
  return map;
}

export function readJson(text) {
  const raw = String(text || "");
  const opens = raw.indexOf("{");
  const closes = raw.lastIndexOf("}");
  if (opens < 0 || closes < opens) return null;
  try { return JSON.parse(raw.slice(opens, closes + 1)); } catch { return null; }
}

export function shorten(path, home) {
  const text = String(path || "");
  if (!home || !text.startsWith(home)) return text;
  return `~${text.slice(home.length)}`;
}

function item(id, title, state, detail, fix = null) {
  return { id, title, state, detail, fix };
}

function nowOf(ctx) {
  return typeof ctx?.now === "function" ? ctx.now() : Date.now();
}

export function relativeTime(iso, now) {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return "an unknown moment";
  const seconds = Math.max(0, Math.round(((Number.isFinite(now) ? now : Date.now()) - at) / 1000));
  if (seconds < 90) return `${seconds}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export function execFailure(text) {
  const line = String(text || "").split("\n").map((part) => part.trim()).filter(Boolean).pop() || "";
  const clean = line.replace(/^error: /, "").replace(/(?:Internal error occurred: )+/g, "").trim();
  return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
}

export const NOT_ON_A_CLUSTER = "skipped — this hive reaches its server at its address, not through a cluster";

export const ONLY_ON_A_CLUSTER = "skipped — a server reached at its address trusts the key it was started with and the people invited in";
export const HUB_RITUAL_ONLY_ON_A_CLUSTER = "skipped — this server is not part of a hosted deployment, so there is no hub contract or session sync to keep";

export function podUnavailable(id, title, ctx) {
  const waited = ctx.probeSeconds ? ` within ${ctx.probeSeconds}s` : "";
  if (!ctx.onACluster) return { ...item(id, title, "skip", NOT_ON_A_CLUSTER), dependsOn: "pod" };
  if (!ctx.pod) return { ...item(id, title, "fail", "no HIVE_POD, so there is no pod to talk to", fixes.runSetup(ctx)), dependsOn: "pod" };
  if (ctx.podAsleep) return { ...item(id, title, "warn", "cannot check while the server is down", fixes.wakePod(ctx)), dependsOn: "pod" };
  if (ctx.probeFailure) return { ...item(id, title, "fail", `the server would not run the check, so nothing inside it could be read: ${ctx.probeFailure}`, fixes.describePod(ctx)), dependsOn: "pod" };
  return { ...item(id, title, "fail", `the server did not answer${waited}, so nothing inside it could be read`, fixes.describePod(ctx)), dependsOn: "pod" };
}

export function collapseRootCause(items) {
  const list = Array.isArray(items) ? items : [];
  const root = list.find((entry) => entry?.id === "pod");
  const down = root?.state === "fail";
  const asleep = !!root?.asleep;
  return list.map((entry) => {
    const { dependsOn, asleep: _, ...rest } = entry || {};
    if ((!down && !asleep) || dependsOn !== "pod" || rest.id === "pod") return rest;
    return { ...rest, state: "skip", detail: asleep ? SKIPPED_DOWN_POD : SKIPPED, fix: null };
  });
}

export function checkConfig(data, ctx) {
  const id = "config";
  const title = "~/.hive/config";
  if (!data.exists) {
    const where = shorten(data.path, ctx.home);
    const detail = ctx.dev ? `no ${where}; falling back to HIVE_DEV from the environment` : `no ${where}`;
    return item(id, title, ctx.dev ? "warn" : "fail", detail, fixes.runSetup(ctx));
  }
  const config = readConfig(data.text);
  const wanted = ctx.onACluster ? ["HIVE_DEV", "HIVE_POD", "HIVE_HUB"] : ["HIVE_DEV", "HIVE_HUB"];
  const missing = wanted.filter((key) => !config[key]);
  if (missing.length) return item(id, title, "fail", `missing from the config: ${missing.join(", ")}`, fixes.runSetup(ctx));
  if (!data.hubExists) return item(id, title, "warn", `HIVE_HUB points at ${shorten(config.HIVE_HUB, ctx.home)}, which does not exist`, fixes.pointHub(ctx));
  const pod = config.HIVE_POD ? ` HIVE_POD=${config.HIVE_POD}` : "";
  return item(id, title, "ok", `HIVE_DEV=${config.HIVE_DEV}${pod} HIVE_HUB=${shorten(config.HIVE_HUB, ctx.home)}`);
}

export function checkKey(data, ctx) {
  const id = "key";
  const title = "signing key";
  if (!ctx.dev) return item(id, title, "fail", "no HIVE_DEV, so there is no way to tell which key is yours", fixes.runSetup(ctx));
  if (!data.keyExists) return item(id, title, "fail", `no key at ${shorten(data.path, ctx.home)}`, fixes.runSetup(ctx));
  return item(id, title, "ok", `key ${shorten(data.path, ctx.home)} present — nothing of the hive lives on PATH`);
}

export function checkDeps(missing, ctx, wanted = []) {
  const id = "deps";
  const title = "dependencies on PATH";
  /* a program only sees the PATH it was born with, so a command installed while
     the app is open is invisible to it until the app is opened again */
  const afterInstall = onWindows(ctx) ? " — if you just installed it, close the Hive and open it again" : "";
  if (missing.length) return item(id, title, "fail", `missing: ${missing.join(", ")}${afterInstall}`, fixes.installDeps(ctx, missing.map(packageOf)));
  const named = wanted.length ? wanted : ["tmux", "gh"];
  const listed = named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}` : named[0];
  return item(id, title, "ok", `${listed} are all here`);
}

export function checkLeftovers(data, ctx) {
  const id = "leftovers";
  const title = "processes of chats that are gone";
  if (!data?.measured) return item(id, title, "skip", onWindows(ctx) ? "not read on windows yet" : "tmux did not list its windows in time, so nothing was judged");
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (!rows.length) return item(id, title, "ok", "every process tagged with a chat belongs to a chat that is still open");
  const shown = rows.slice(0, 4).map((row) => `${String(row.command || "").slice(0, 60)} (pid ${row.pid}, up ${row.etime}, chat ${row.seat})`).join("; ");
  const more = rows.length > 4 ? ` and ${rows.length - 4} more` : "";
  const noun = rows.length === 1 ? "process" : "processes";
  return item(id, title, "warn", `${rows.length} ${noun} left by chats that are closed, still running: ${shown}${more}`, fixes.killLeftovers(ctx, rows.map((row) => row.pid)));
}

function packageOf(dep) {
  return dep === "aws" ? "awscli" : dep;
}

export function checkClock(data, ctx) {
  const id = "clock";
  const title = "clock in sync with the server";
  if (!data.measured) return podUnavailable(id, title, ctx);
  const delta = Math.round(data.delta);
  const size = Math.abs(delta);
  const side = delta > 0 ? "ahead of" : "behind";
  const base = `the server is ${size}s ${side} this machine`;
  if (size <= CLOCK_OK) return item(id, title, "ok", `${base} (a signature is valid for ${SIGNATURE_WINDOW}s)`);
  if (size <= CLOCK_WARN) return item(id, title, "warn", `${base}; a hive signature is only valid for ${SIGNATURE_WINDOW}s`, fixes.syncClock(ctx));
  return item(id, title, "fail", `${base}; with this drift every hive command dies with "signature invalid" even when everything else is fine`, fixes.syncClock(ctx));
}

export const VERDICT_FIXES = {
  up: "wakePod",
  restart: "rollPod",
  why: "describePod",
  "why-node": "describeNode",
  "force-remove": "forceDeletePod",
  provision: "provisionPod"
};

export function checkPod(data, ctx, probeAnswered = false) {
  const id = "pod";
  const title = "server up";
  if (!ctx.onACluster || !ctx.powerSwitch) return podUnavailable(id, title, ctx);
  const said = readJson(data.verdict);
  if (!said?.state) {
    if (probeAnswered) {
      const why = said?.detail ? "could not describe it" : "was too slow to describe it";
      return item(id, title, "ok", `up and answering: a script ran inside it, though the cluster ${why}`, null);
    }
    const heard = String(data.verdict || "").trim();
    const why = said?.detail
      || String(data.verdictErr || "").split("\n").map((one) => one.trim()).filter(Boolean).pop()
      || (heard ? `it answered "${heard.slice(0, 90)}", which is not a verdict` : "it answered nothing at all");
    return item(id, title, "fail", `whoever hosts this server could not say whether it is up: ${why.slice(0, 160)}`, null);
  }
  const named = VERDICT_FIXES[said.fix];
  const fix = named === "describeNode" ? fixes.describeNode(said.node, ctx) : (named ? fixes[named](ctx) : null);
  const held = item(id, title, said.state, String(said.detail || "").slice(0, 200), fix);
  return said.asleep ? { ...held, asleep: true } : held;
}

export function readBootLog(text) {
  const entries = [];
  for (const line of String(text || "").trim().split("\n")) {
    const [at, kind, ...rest] = line.trim().split(/\s+/);
    if (!at || !kind || Number.isNaN(new Date(at).getTime())) continue;
    const fields = {};
    for (const [, key, value] of rest.join(" ").matchAll(/([\w-]+)=(.*?)(?=\s[\w-]+=|$)/g)) fields[key] = value.trim();
    entries.push({ at, kind, fields });
  }
  return entries;
}

export function checkLastBoot(text, ctx) {
  const id = "last-boot";
  const title = "the server's last boot";
  if (text === null) return podUnavailable(id, title, ctx);
  const entries = readBootLog(text);
  if (!entries.length) return item(id, title, "ok", "no black box yet (older pod bootstrap)");
  const lastBoot = entries.map((entry) => entry.kind).lastIndexOf("boot");
  const steps = entries.slice(lastBoot + 1).filter((entry) => entry.kind === "boot-error").map((entry) => entry.fields.step || "an unnamed step");
  if (steps.length) return item(id, title, "warn", `the last boot failed on ${steps.join(", ")}`, fixes.readBootLog(ctx));
  if (lastBoot < 0) return item(id, title, "ok", "no boot recorded yet, and nothing has failed");
  return item(id, title, "ok", `booted at ${entries[lastBoot].at}, with nothing failing since`);
}

export function checkSigners(text, ctx) {
  const id = "allowed-signers";
  const title = "allowed_signers on the server";
  if (!ctx.onACluster) return item(id, title, "skip", ONLY_ON_A_CLUSTER);
  if (text === null) return podUnavailable(id, title, ctx);
  const [state, ...rest] = String(text || "").trim().split("\n");
  const identities = (rest.join(" ") || "").trim();
  if (state === "has") return item(id, title, "ok", `your key is authorized (identities: ${identities || ctx.dev})`);
  if (state === "missing-key") return item(id, title, "fail", `the file is there but your key is not in it (identities: ${identities || "none"})`, fixes.authorizeKey(ctx));
  return item(id, title, "fail", `without ${HIVE_DIR}/allowed_signers the pod's server trusts nobody but the owner key it was started with`, fixes.authorizeKey(ctx));
}

export function checkCredential(text, ctx) {
  const id = "credential";
  const title = "Claude credential on the server";
  if (text === null) return podUnavailable(id, title, ctx);
  const data = readJson(text);
  if (!data || !data.token) return item(id, title, "fail", "the server's ~/.claude/.credentials.json is missing, empty or carries no token", fixes.loginClaude(ctx));
  const expired = !data.expires || data.expires < Date.now();
  if (expired && !data.refresh) {
    return item(id, title, "fail", "the credential on the volume expired and carries no refresh token — nothing here can talk to Claude, remote control included", fixes.loginClaude(ctx));
  }
  if (expired) return item(id, title, "warn", "the credential expired; the refresh token should renew it on the next session", fixes.loginClaude(ctx));
  return item(id, title, "ok", `${data.plan || "claude.ai"} credential valid until ${new Date(data.expires).toISOString().slice(0, 16).replace("T", " ")}`);
}

export function checkFlags(text, ctx) {
  const id = "flags";
  const title = "Claude flags on the server";
  if (text === null) return podUnavailable(id, title, ctx);
  const data = readJson(text);
  if (!data) return item(id, title, "fail", "could not read .claude.json on the server", fixes.preAcceptFlags(ctx));
  const serious = [];
  const minor = [];
  if (!data.onboarding) serious.push("hasCompletedOnboarding");
  if (!data.bypass) serious.push("bypassPermissionsModeAccepted");
  const untrusted = (ctx.trustedDirs ?? TRUSTED_DIRS).filter((dir) => !(data.trusted || {})[dir]);
  if (untrusted.length) minor.push(`hasTrustDialogAccepted on ${untrusted.join(", ")}`);
  if (data.cross !== "accept") minor.push('crossSessionInbound: "accept" in settings.json');
  if (serious.length) return item(id, title, "fail", `missing ${serious.join(" and ")}; every new session stalls on a dialog and dies with exit code 1`, fixes.preAcceptFlags(ctx));
  if (minor.length) return item(id, title, "warn", `missing ${minor.join("; ")}`, fixes.preAcceptFlags(ctx));
  return item(id, title, "ok", "onboarding, bypass, dir trust and crossSessionInbound all in place");
}

export function checkMemory(text, ctx) {
  const id = "memory";
  const title = "team memory on the server";
  const plugin = ctx.memoryPlugin ?? MEMORY_PLUGIN;
  if (!plugin) return item(id, title, "skip", "skipped — this hive names no team memory plugin");
  if (text === null) return podUnavailable(id, title, ctx);
  const data = readJson(text);
  if (!data) return item(id, title, "fail", `could not read the ${plugin} state on the pod`, fixes.installMemory(ctx));
  if (!data.installed) return item(id, title, "fail", `${plugin} is not installed; every worker here starts blind to what the team already learned`, fixes.installMemory(ctx));
  if (!data.enabled) return item(id, title, "fail", `${plugin} is installed but disabled in settings.json`, fixes.installMemory(ctx));
  if (!data.user) return item(id, title, "fail", "the plugin is there with no credential, so every memory_search dies with \"Not authenticated\"", fixes.installMemory(ctx));
  if (!data.refresh && !(data.expiresIn > 0)) return item(id, title, "warn", `the credential of ${data.user} expired and carries no refresh token`, fixes.installMemory(ctx));
  const life = data.expiresIn > 0 ? `token good for ${Math.max(1, Math.round(data.expiresIn / 60))} min` : "token expired, refreshes on the next session";
  return item(id, title, "ok", `${plugin} enabled, signed in as ${data.user} (${life})`);
}

export function checkCloudSessions(text, ctx) {
  const id = "cloud-sessions";
  const title = "session sync on the server";
  if (!ctx.onACluster) return item(id, title, "skip", HUB_RITUAL_ONLY_ON_A_CLUSTER);
  if (text === null) return podUnavailable(id, title, ctx);
  const data = readJson(text);
  if (!data) return item(id, title, "warn", "could not read the cloud-sessions state on the pod", fixes.installCloudSessions(ctx));
  if (!data.repo) return item(id, title, "warn", "sessions live only on the volume; a lost PVC takes every conversation with it", fixes.installCloudSessions(ctx));
  if (!data.script) return item(id, title, "fail", `configured, but ${CLOUD_SESSIONS_ON_POD} is not on the pod, so no sync ever runs`, fixes.installCloudSessions(ctx));
  if (!data.lastSync) return item(id, title, "warn", "configured but never synced", fixes.syncCloudSessions(ctx));
  const lastLog = String(data.lastLog || "");
  if (/ error: /.test(` ${lastLog}`)) return item(id, title, "warn", `the last sync attempt failed: ${lastLog.slice(0, 140)}`, fixes.syncCloudSessions(ctx));
  const minutes = Math.max(0, Math.round((Number(data.now) - Number(data.lastSync)) / 60000));
  const age = minutes < 120 ? `${minutes} min ago` : `${Math.round(minutes / 60)}h ago`;
  return item(id, title, "ok", `syncing to ${data.repo}, last sync ${age}`);
}

export function checkRemoteControl(text, ctx, credentialText) {
  const id = "remote-control";
  const title = "remote control alive";
  if (text === null) return podUnavailable(id, title, ctx);
  const credential = readJson(credentialText) || {};
  const unusable = credentialText != null && (!credential.token || (!credential.refresh && !(credential.expires > Date.now())));
  const screen = String(text || "").trim();
  if (unusable) {
    return item(id, title, "fail", "remote control cannot start while the Claude credential on the pod is expired — restarting it will not help, it needs a login", fixes.loginClaude(ctx));
  }
  if (!screen || screen === "down") return item(id, title, "fail", "there is no tmux session rc on the pod", fixes.restartControl(ctx));
  if (!CONNECTED_CONTROL.test(screen)) return item(id, title, "warn", "the rc session is alive, but its screen never says it connected", fixes.restartControl(ctx));
  return item(id, title, "ok", "rc session alive and connected");
}

export function checkRepos(text, ctx) {
  const id = "repos";
  const title = "repos cloned on the server";
  const wanted = ctx.expectedRepos ?? EXPECTED_REPOS;
  if (!wanted.length) return item(id, title, "skip", "skipped — this hive names no repositories it expects");
  if (text === null) return podUnavailable(id, title, ctx);
  const map = {};
  for (const line of String(text || "").trim().split("\n")) {
    const [state, name] = line.trim().split(/\s+/);
    if (name) map[name] = state;
  }
  const absent = wanted.filter((repo) => !map[repo]);
  const noGit = wanted.filter((repo) => map[repo] === "no-git");
  if (absent.length || noGit.length) {
    const parts = [];
    if (absent.length) parts.push(`not cloned: ${absent.join(", ")}`);
    if (noGit.length) parts.push(`no .git: ${noGit.join(", ")}`);
    return item(id, title, "fail", parts.join("; "), fixes.cloneRepos(ctx, [...absent, ...noGit]));
  }
  return item(id, title, "ok", `${Object.keys(map).length} repo(s) in /workspace/repos, every one a real clone`);
}

export function parseHubContext(text) {
  const lines = String(text || "").trim().split("\n");
  if (!lines[0] || lines[0] === "absent") return { present: false, stale: [], seat: "absent", behind: 0 };
  const head = lines[0];
  const tip = (head.match(/tip=(\S*)/) || [])[1] || "";
  const behind = Number((head.match(/behind=(\d+)/) || [])[1] || 0);
  const dirty = Number((head.match(/dirty=(\d+)/) || [])[1] || 0);
  const at = (head.match(/at=(\S*)/) || [])[1] || "";
  const seatLine = lines.find((line) => line.startsWith("seat:"));
  const seat = seatLine ? seatLine.slice(5).trim() : "absent";
  const staleLine = lines.find((line) => line.startsWith("stale:")) || "stale:";
  const stale = staleLine.slice(6).trim().split(/\s+/).filter(Boolean);
  return { present: true, tip, behind, dirty, at, seat, stale };
}

export function checkHubContext(text, ctx) {
  const id = "hub-context";
  const title = "canonical hub context on the server";
  if (!ctx.onACluster) return item(id, title, "skip", HUB_RITUAL_ONLY_ON_A_CLUSTER);
  if (text === null) return podUnavailable(id, title, ctx);
  const data = parseHubContext(text);
  if (!data.present) {
    return item(id, title, "warn", `no checkout at ${HUB_CONTEXT_DIR} — new sessions cannot receive the fresh hub contract`, fixes.syncHubContext(ctx));
  }
  if (data.dirty > 0) {
    return item(id, title, "fail", `${HUB_CONTEXT_DIR} has ${data.dirty} local change(s) — investigate before anything resets it`, fixes.inspectHubContext(ctx));
  }
  if (data.behind > 0) {
    const behind = item(id, title, "warn", `${data.behind} commit(s) behind origin/main — every seat is being told an old contract`, fixes.syncHubContext(ctx));
    return { ...behind, group: HUB_CHECKOUT };
  }
  const age = data.at ? nowOf(ctx) - new Date(data.at).getTime() : NaN;
  if (!Number.isFinite(age) || age > HUB_CONTEXT_FRESH_HOURS * 3600 * 1000) {
    const said = data.at ? `last synced ${relativeTime(data.at, nowOf(ctx))} ago — older than ${HUB_CONTEXT_FRESH_HOURS}h` : "never recorded a sync";
    return item(id, title, "warn", said, fixes.syncHubContext(ctx));
  }
  return item(id, title, "ok", `clean checkout, synced ${relativeTime(data.at, nowOf(ctx))} ago`);
}

export function checkHubContract(text, ctx) {
  const id = "hub-contract";
  const title = "hub contract in the seats";
  if (!ctx.onACluster) return item(id, title, "skip", HUB_RITUAL_ONLY_ON_A_CLUSTER);
  if (text === null) return podUnavailable(id, title, ctx);
  const data = parseHubContext(text);
  if (!data.present) return item(id, title, "skip", "skipped — no canonical context to compare against (see hub-context)");
  const aged = data.stale.length
    ? ` · ${data.stale.length} worktree(s) on an older contract, which is expected — the session hook injects the current one`
    : "";
  if (data.seat === "absent") {
    return item(id, title, "warn", `no ${HUB_FOLDER} checkout on the server, so nothing carries the contract${aged}`, fixes.mirrorPod(ctx));
  }
  if (data.seat === "stale") {
    const stale = item(id, title, "warn", `${POD_HUB} carries an older CLAUDE.md than origin/main${aged}`, fixes.pullSeat(ctx));
    return { ...stale, group: HUB_CHECKOUT };
  }
  return item(id, title, "ok", `the hub checkout carries the CLAUDE.md at origin/main${aged}`);
}

export function checkGh(text, ctx) {
  const id = "gh";
  const title = "gh authenticated on the server";
  if (text === null) return podUnavailable(id, title, ctx);
  const raw = String(text || "").trim();
  if (!raw.startsWith("logged-in")) return item(id, title, "fail", "gh is not logged in on the pod; a worker cannot open a PR", fixes.loginGh(ctx));
  const who = raw.split(/\s+/)[1] || "";
  return item(id, title, "ok", who ? `logged in as ${who}` : "logged in");
}

export function checkAndroid(data, ctx) {
  const id = "android";
  const title = "android emulator";
  const sdk = String(data?.sdk || "");
  const avds = Array.isArray(data?.avds) ? data.avds : [];
  if (!sdk || (!data.adb && !data.emulator)) return item(id, title, "skip", ANDROID_NOT_CONFIGURED);
  const at = shorten(sdk, ctx.home);
  if (!data.adb || !data.emulator) return item(id, title, "warn", `${data.adb ? "the emulator is" : "adb is"} missing from ${at}, so the device pane cannot boot anything`, fixes.installAndroidTools(ctx));
  if (!avds.length) return item(id, title, "warn", `adb and emulator at ${at}, but no AVD to boot — the device pane needs one`, fixes.createAvd(ctx));
  return item(id, title, "ok", `adb and emulator at ${at} · ${avds.length === 1 ? "AVD" : "AVDs"}: ${avds.join(", ")}`);
}

export function checkMcpEnv(line, ctx) {
  const id = "mcp-env";
  const title = "MCP credentials on the server";
  if (line === null) return podUnavailable(id, title, ctx);
  const raw = String(line || "").trim();
  if ((!raw || raw === "gateway-down") && !ctx.onACluster) return item(id, title, "skip", "skipped — this server runs no MCP gateway");
  if (!raw || raw === "gateway-down") {
    return item(id, title, "fail", "the MCP gateway did not answer on 127.0.0.1:4671, so every server behind it is out", fixes.seeGateway(ctx));
  }
  const health = readJson(raw);
  if (!health) return item(id, title, "warn", "could not read the gateway health");
  const gaps = Object.entries(health.faltando || {});
  if (!gaps.length) return item(id, title, "ok", `${health.configurados ?? 0} servers, every credential in place`);
  const detail = gaps.map(([name, keys]) => `${name}: ${keys.join(", ")}`).join(" \u00b7 ");
  return item(id, title, "warn", `missing in ${health.envFile || "the hub .env"} — ${detail}`, fixes.pushEnv(ctx));
}

export function checkDisk(line, ctx) {
  const id = "disk";
  const title = "space on /workspace";
  if (line === null) return podUnavailable(id, title, ctx);
  const columns = String(line || "").trim().split(/\s+/);
  if (columns.length < 5) return item(id, title, "warn", "could not read df for /workspace");
  const total = Number(columns[1]);
  const used = Number(columns[2]);
  if (!total) return item(id, title, "warn", "could not read df for /workspace");
  const percent = Math.round((used / total) * 100);
  const free = ((total - used) / (1024 * 1024)).toFixed(1);
  const detail = `${percent}% used, ${free} GiB free`;
  if (percent >= DISK_FAIL) return item(id, title, "fail", detail, fixes.seeDisk(ctx));
  if (percent >= DISK_WARN) return item(id, title, "warn", detail, fixes.seeDisk(ctx));
  return item(id, title, "ok", detail);
}

export function checkCloudDoor(data, ctx) {
  const id = "cloud-door";
  const title = "door to the server";
  if (!ctx.dev) return item(id, title, "fail", "no HIVE_DEV, so there is no door address to ask", fixes.runSetup(ctx));
  if (!ctx.serverUrl) return item(id, title, "skip", "no server address — every chat runs on this machine");
  const host = String(data?.url || "").replace(/^https?:\/\//, "") || `hive-${ctx.dev}`;
  if (data?.ok) return item(id, title, "ok", `${host} answers, and names the key the seats sign for`);
  const why = String(data?.error || "it said nothing about why");
  if (NO_DOOR_AT_ALL.test(why)) {
    return {
      ...item(id, title, "fail",
        `${host} resolves to nothing — no door was ever opened for ${ctx.dev}, so every cloud seat only says "this hive has no server for that side yet"`,
        fixes.openDoor(ctx)),
      dependsOn: "pod"
    };
  }
  return { ...item(id, title, "warn", `${host} is in dns but did not answer: ${why}`, fixes.openDoor(ctx)), dependsOn: "pod" };
}
