import { transferText, transferResult, transferEvent } from "./transfer-context.mjs";
import { appendFile, mkdir, readFile, readdir, writeFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { accountRanDry, answerInput, dismissNote, endedOnApiError, eventLine, lastSeq, compactLine, noConversationToResume, sayEvent, sayGate, queueMiss, hookFate, staleInterrupt, weaveImageMarks, imageEdge, IMAGE_EDGE_CEILING, birthsLeft, peerSayText, unpackShots, shotsToForget, seatTitle, seatPreamble, BIRTHS_MAX, PLAN_INSTRUCTIONS, PLAN_MODES, frontWishes, answerHold, transcriptTail } from "./protocol.mjs";
import { DEFAULT_ACCOUNT } from "./accounts.mjs";
import { accountFailover } from "./failover.mjs";
import { normalizeClaudeModels, effortFromSettings, pickModelRow, autocompactFromConfig, withAppliedDefault } from "./agents.mjs";
import { ensureGateway, hubFor } from "../gateway/mcp-gateway.mjs";
import { claudeConfigPath, readClaudeConfig, hubServers, peerServerFor, routedThroughGateway } from "./mcp-routing.mjs";
import { readsOnly, wakesTheSeat, answerWhileAsleep } from "./seat-memory.mjs";
import { sleepVerdict, sleepAfterMs, rebornArgs, canBeReborn, childrenGone, REBIRTH_CHILD_GRACE_MS } from "../sleep.mjs";
import { stateDir, sideOf, hiveRoot, seatSockPath } from "./paths.mjs";
import { builtinClaudePath, chosenClaude, unmountable } from "./claude-binary.mjs";
import { peerEntry } from "./peer-module.mjs";
import { importSdk } from "./sdk-module.mjs";
import { prepareShellEnv, shellEnvFileFor } from "./shell-env.mjs";
import { aBirthCarriesAMission, aFullPaneMustNeverWedgeTheSeat, arg, forgetWhatTheNameHeld, missionShots, tailOfFile, makeSessionStore, makeWarnOnce, makeEventsTrouble, createSeatServer, makeDirsTrail, inputDirs } from "./seat-core.mjs";

aFullPaneMustNeverWedgeTheSeat();

const name = arg("--name");
if (!name || !/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
  console.error("usage: node driver.mjs --name <seat> [--cwd <dir>] [--model <model>] [--effort <level>] [--prompt-file <path>] [--session-id <id> | --resume-id <session>]");
  process.exit(2);
}

const base = stateDir();
const cwd = arg("--cwd", process.cwd());
const model = arg("--model");
let currentModel = model || "";
let chosenModel = model || "";
let effortLevel = arg("--effort", "");
const promptFile = arg("--prompt-file");
const bornAsleep = process.argv.includes("--asleep");

let query = null;
async function loadSdk() {
  if (query) return;
  ({ query } = await importSdk());
}

const fronts = frontWishes();

const eventsFile = join(base, "events", `${name}.ndjson`);
const sockFile = seatSockPath(base, name);
const sessionFile = join(base, "sessions", `${name}.json`);
const shotsDir = join(base, "shots", name);
const logins = accountFailover({
  base,
  bornIn: process.env.CLAUDE_CONFIG_DIR || "",
  emit: (event) => emit(event),
  persist: (patch) => persistSession(patch),
  apply: ({ dir }) => sessionTakesLogin(dir),
  redo: () => { if (lastSaid) dispatchSay(lastSaid); return !!lastSaid; },
  busy: () => gate.busy || gate.queued || pendingQuestions.size > 0,
});

await mkdir(join(base, "events"), { recursive: true });
await mkdir(join(base, "sock"), { recursive: true });
await mkdir(join(base, "sessions"), { recursive: true });
await mkdir(shotsDir, { recursive: true });

const ANOTHER_DRIVER_OWNS_THE_SEAT = 75;

function seatAnswers() {
  return new Promise((answer) => {
    const probe = connect(sockFile);
    const settle = (taken) => { probe.destroy(); answer(taken); };
    const giveUp = setTimeout(() => settle(true), 1500);
    probe.on("connect", () => { clearTimeout(giveUp); settle(true); });
    probe.on("error", () => { clearTimeout(giveUp); settle(false); });
  });
}

if (existsSync(sockFile) && await seatAnswers()) {
  console.error(`another driver already answers for ${name}; this one is leaving the seat alone`);
  process.exit(ANOTHER_DRIVER_OWNS_THE_SEAT);
}
await rm(sockFile, { force: true });

if (base === hiveRoot()) process.env.IS_SANDBOX = "1";

const side = sideOf(base);
process.env.HIVE_SEAT = name;
process.env.HIVE_SIDE = side;
process.env.HIVE_STATE_DIR = base;
if (!process.env.CLAUDE_ENV_FILE) {
  try { process.env.CLAUDE_ENV_FILE = await prepareShellEnv(shellEnvFileFor(base, name)); } catch {}
}

const bornNow = aBirthCarriesAMission({ promptFile, resumeId: arg("--resume-id") });
const nameHadAChatBefore = bornNow && await forgetWhatTheNameHeld({ sessionFile, eventsFile, shotsDir });
if (nameHadAChatBefore) await mkdir(shotsDir, { recursive: true });

let seq = lastSeq(await tailOfFile(eventsFile));
const freshEventsFile = seq === 0;
let appendChain = Promise.resolve();

async function keepShots(shots) {
  for (const shot of shots) {
    try { await writeFile(shot.path, Buffer.from(shot.data, "base64")); } catch {}
  }
}

const SHOTS_KEPT = 150;

async function forgetOldShots(keep = SHOTS_KEPT) {
  try {
    const names = await readdir(shotsDir);
    if (names.length <= keep) return;
    const dated = [];
    for (const shot of names) {
      try { dated.push({ name: shot, at: (await stat(join(shotsDir, shot))).mtimeMs }); } catch {}
    }
    for (const gone of shotsToForget(dated, keep)) await rm(join(shotsDir, gone), { force: true });
  } catch {}
}

const eventsTrouble = makeEventsTrouble(eventsFile);

function emit(event) {
  if (event.type === "user") event = transferEvent(event, sessionStore);
  if (event.type === "result") transferResult(event, sessionStore);
  seq += 1;
  const { event: lean, shots } = unpackShots(event, shotsDir, seq);
  const line = eventLine(seq, lean) + "\n";
  appendChain = appendChain.then(async () => {
    if (shots.length) await keepShots(shots);
    await appendFile(eventsFile, line);
  }).catch((e) => eventsTrouble.note(e));
  const short = compactLine(lean);
  if (short && !event.replayed) console.log(short);
  return seq;
}

for (const key of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]) {
  if (process.env[key]) {
    delete process.env[key];
    emit({ type: "driver", subtype: "warning", message: `${key} was set and would bypass the subscription; removed from this session's environment` });
  }
}

if (!process.env.CLAUDE_CODE_ARTIFACT) process.env.CLAUDE_CODE_ARTIFACT = "1";

if (nameHadAChatBefore) {
  emit({ type: "driver", subtype: "warning", message: `a chat named ${name} lived here before and was closed; this one starts empty — the old conversation is still in the history, to revive` });
}

let resumeId = "";
let storedSession = {};
try {
  storedSession = JSON.parse(await readFile(sessionFile, "utf8"));
  resumeId = storedSession.session_id || "";
} catch {}
if (storedSession.home) logins.setHome(storedSession.home);
if (storedSession.effort) effortLevel = storedSession.effort;
if (!chosenModel && storedSession.model) chosenModel = currentModel = storedSession.model;
if (!resumeId) resumeId = arg("--resume-id");
const sessionTrouble = makeWarnOnce((message) => emit({ type: "driver", subtype: "warning", message }));
const sessionStore = makeSessionStore(sessionFile, storedSession, (e) => sessionTrouble(`the session file stopped taking writes — a restart would lose this conversation: ${String(e?.message || e)}`));
const persistSession = sessionStore.persist;
const dirsTrail = makeDirsTrail(storedSession.dirs, persistSession);

function channel() {
  const values = [];
  const waiters = [];
  let closed = false;
  return {
    push(v) {
      if (closed) return;
      const w = waiters.shift();
      if (w) w({ value: v, done: false });
      else values.push(v);
    },
    close() {
      closed = true;
      for (const w of waiters.splice(0)) w({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (values.length) return Promise.resolve({ value: values.shift(), done: false });
          if (closed) return Promise.resolve({ value: undefined, done: true });
          return new Promise((resolve) => waiters.push(resolve));
        },
      };
    },
  };
}

let input = channel();

let session = null;
let generation = 0;
let suspect = false;
let sleeping = false;
let watched = false;
const backgroundTasks = new Map();
let sleptAt = 0;
let lastActivity = Date.now();
let sleepTimer = null;
const sleepAfter = () => sleepAfterMs(process.env, { watched });


const IMAGE_MEDIA = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

async function imageBlock(path) {
  const ext = String(path).split(".").pop().toLowerCase();
  const media = IMAGE_MEDIA[ext];
  try {
    if (!media) throw new Error("not an image");
    const bytes = await readFile(path);
    if (bytes.length > 8 * 1024 * 1024) throw new Error("too big");
    if (imageEdge(bytes) > IMAGE_EDGE_CEILING) throw new Error("wider than a conversation of many images takes");
    return { type: "image", source: { type: "base64", media_type: media, data: bytes.toString("base64") } };
  } catch {
    return { type: "text", text: String(path) };
  }
}

async function userMessage(text, images = []) {
  const blocks = [];
  for (const piece of weaveImageMarks(text, images.slice(0, 8))) {
    if (piece.image !== undefined) blocks.push(await imageBlock(piece.image));
    else blocks.push({ type: "text", text: piece.text });
  }
  if (!blocks.length && text) blocks.push({ type: "text", text });
  return { type: "user", message: { role: "user", content: blocks }, parent_tool_use_id: null };
}

const gate = sayGate();
let lastSaid = null;

function dispatchSay(item) {
  if (!item) return;
  if (!item.providerContext) item = { ...item, text: transferText(item.text, sessionStore), providerContext: true };
  fronts.clear();
  lastSaid = item;
  ensureAwake();
  watchForSilence(item);
  if (item.cid) {
    gate.left(item.cid);
    emit({ type: "driver", subtype: "dispatched", cid: item.cid });
  }
  userMessage(item.text, item.images).then((message) => input.push(message));
}

const SILENCE_IS_A_WEDGE_MS = 180000;
const SILENCE_AFTER_AN_API_ERROR_MS = 30000;

let silenceTimer = null;
let awaited = null;
let reopenedForIt = false;

function watchForSilence(item) {
  awaited = item;
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = setTimeout(theSessionWentMute, suspect ? SILENCE_AFTER_AN_API_ERROR_MS : SILENCE_IS_A_WEDGE_MS);
  silenceTimer.unref?.();
}

function heardFromSession() {
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = null;
  awaited = null;
  suspect = false;
  reopenedForIt = false;
}

function theSessionWentMute() {
  silenceTimer = null;
  const item = awaited;
  if (!item || leaving) return;
  if (!reopenedForIt) {
    reopenedForIt = true;
    emit({ type: "driver", subtype: "warning", message: "this seat handed a message over and the session answered nothing at all — opening a fresh one on the same conversation and saying it again" });
    retire("mute session");
    dispatchSay(item);
    return;
  }
  awaited = null;
  reopenedForIt = false;
  emit({ type: "driver", subtype: "warning", message: "the fresh session went mute too — closing this turn so the seat stops reading as busy; say it again to try once more" });
  emit({ type: "result", subtype: "error", is_error: true, num_turns: 0, session_id: sessionId, result: "the session stopped answering" });
  retire("mute session");
  dispatchSay(gate.turnEnded());
}

async function deliverMission() {
  if (!promptFile || !existsSync(promptFile)) return;
  const mission = (await readFile(promptFile, "utf8")).trim();
  const images = missionShots(promptFile);
  if (!mission && !images.length) return;
  emit(sayEvent(mission, images));
  dispatchSay(gate.push({ text: mission, images }));
}

if (!resumeId) await deliverMission();

const pendingQuestions = new Map();

/* a message typed while a card is open is the answer: the question is dropped with the words in it,
   so the model reads them inside the same turn instead of waiting for options nobody will pick. */
function dismissQuestions(text) {
  const dropped = [...pendingQuestions.keys()];
  for (const id of dropped) {
    const settle = pendingQuestions.get(id);
    pendingQuestions.delete(id);
    settle({ dismissed: dismissNote(text) });
  }
  return dropped;
}

async function canUseTool(toolName, toolInput, options) {
  if (toolName === "ExitPlanMode") return waitOnThePlan(toolInput, options);
  if (toolName === "mcp__hive__spawn") return { behavior: "allow", updatedInput: fronts.pick(toolInput), toolUseID: options?.toolUseID };
  if (toolName !== "AskUserQuestion") return { behavior: "allow", updatedInput: toolInput };
  const id = options?.toolUseID || `q-${seq + 1}`;
  emit({ type: "driver", subtype: "question", id, questions: toolInput.questions });
  const settled = await new Promise((resolve) => pendingQuestions.set(id, resolve));
  if (settled?.dismissed) {
    emit({ type: "driver", subtype: "question_dismissed", id });
    return { behavior: "deny", message: settled.dismissed, toolUseID: options?.toolUseID };
  }
  const filled = answerInput(toolInput, settled.answers);
  if (filled.error) {
    emit({ type: "driver", subtype: "question_failed", id, error: filled.error });
    return { behavior: "deny", message: filled.error, toolUseID: options?.toolUseID };
  }
  emit({ type: "driver", subtype: "question_answered", id });
  return { behavior: "allow", updatedInput: filled.input, toolUseID: options?.toolUseID };
}

async function waitOnThePlan(toolInput, options) {
  const id = options?.toolUseID || `plan-${seq + 1}`;
  const plan = String(toolInput?.plan || "").trim();
  emit({ type: "driver", subtype: "plan", id, plan });
  const settled = await new Promise((resolve) => pendingQuestions.set(id, resolve));
  if (settled?.dismissed) {
    emit({ type: "driver", subtype: "plan_dismissed", id });
    return { behavior: "deny", message: settled.dismissed, toolUseID: options?.toolUseID };
  }
  fronts.keep(settled?.answers?.fronts);
  await leavePlanMode();
  emit({ type: "driver", subtype: "plan_approved", id, fronts: fronts.rows() });
  return { behavior: "allow", updatedInput: toolInput, toolUseID: options?.toolUseID };
}

async function leavePlanMode() {
  if (mode !== "plan") return;
  await wearMode("normal").catch((wrong) => {
    emit({ type: "driver", subtype: "warning", message: `this chat approved a plan and could not leave plan mode: ${String(wrong?.message || wrong)}` });
  });
}

/* the mode belongs to the seat, not to the session that happens to be up: a session
   reopened after a nap copies `options`, so a mode written only into the live session
   is lost the moment the seat sleeps — with the pill still saying it is on. */
async function wearMode(wanted) {
  const was = mode;
  const permission = wanted === "plan" ? "plan" : "bypassPermissions";
  await session.setPermissionMode(permission);
  mode = wanted;
  options.permissionMode = permission;
  persistSession({ mode });
  if (was !== mode) emit({ type: "driver", subtype: "mode_changed", mode });
  return mode;
}

let sessionId = resumeId;

let mode = storedSession?.mode === "plan" ? "plan" : "normal";

const gateway = await ensureGateway({ hub: hubFor(cwd) }).catch((e) => ({ ok: false, reason: String(e?.message || e) }));
emit({ type: "driver", subtype: "mcp_gateway", ok: !!gateway.ok, started: !!gateway.started, replaced: gateway.replaced || null, port: gateway.port || null, reason: gateway.reason || null });

const EFFORTS_A_SESSION_CAN_BE_BORN_ON = ["low", "medium", "high", "xhigh"];

const options = {
  cwd,
  permissionMode: mode === "plan" ? "plan" : "bypassPermissions",
  planModeInstructions: PLAN_INSTRUCTIONS,
  includePartialMessages: true,
  includeHookEvents: true,
  systemPrompt: {
    type: "preset",
    preset: "claude_code",
    append: seatPreamble(name, side),
  },
  canUseTool,
  hooks: { PostToolUse: [{ hooks: [async (hookInput) => {
    dirsTrail.note(hookInput.cwd, ...inputDirs(hookInput.tool_input, hookInput.cwd || cwd));
    return {};
  }] }] },
};
function seatMcpServers(configDir) {
  const hive = peerServerFor({ seat: name, side, home: base, entry: peerEntry(), gateway });
  emit({ type: "driver", subtype: "mcp_peer", via: hive.type === "http" ? "gateway" : "stdio", port: gateway.port || null });
  const own = { hive };
  if (!gateway.ok || !gateway.token) return own;
  const { routed, kept } = routedThroughGateway({
    config: readClaudeConfig(claudeConfigPath(configDir)),
    cwd,
    served: hubServers(hubFor(cwd)),
    port: gateway.port,
    token: gateway.token,
  });
  if (Object.keys(routed).length) emit({ type: "driver", subtype: "mcp_routed", port: gateway.port, servers: Object.keys(routed), kept });
  return { ...routed, ...own };
}

options.mcpServers = seatMcpServers(logins.dir || process.env.CLAUDE_CONFIG_DIR || "");
if (chosenModel) options.model = chosenModel;
if (resumeId) options.resume = resumeId;
if (EFFORTS_A_SESSION_CAN_BE_BORN_ON.includes(effortLevel)) options.settings = { effortLevel };

const builtinClaude = builtinClaudePath();
const claude = chosenClaude({ builtin: builtinClaude });
if (claude.path && claude.path !== builtinClaude) {
  options.pathToClaudeCodeExecutable = claude.path;
  emit({ type: "driver", subtype: "claude_binary", path: claude.path, from: claude.from, version: claude.version });
} else if (builtinClaude && unmountable(builtinClaude)) {
  emit({ type: "driver", subtype: "warning", message: `this seat runs claude straight off the app bundle at ${builtinClaude} — an update that replaces the bundle will take the seat down with it` });
}

const extraArgs = {};
if (process.env.HIVE_REMOTE_CONTROL !== "0") extraArgs["remote-control"] = name;
const autocompact = autocompactFromConfig({ autocompact: arg("--autocompact") });
if (autocompact) extraArgs["autocompact"] = autocompact;
const givenSessionId = arg("--session-id");
if (givenSessionId && !resumeId) extraArgs["session-id"] = givenSessionId;
if (Object.keys(extraArgs).length) options.extraArgs = extraArgs;

/* the level a seat runs at when nobody set one this session is the level Claude
   Code itself would pick: the settings files, later file winning. Read fresh —
   three small files, and a stale answer is exactly the lie to avoid. */
function settingsFiles() {
  return [
    join(logins.dir || join(homedir(), ".claude"), "settings.json"),
    join(cwd, ".claude", "settings.json"),
    join(cwd, ".claude", "settings.local.json"),
  ];
}

async function appliedEffort() {
  try {
    return (await session.getSettings?.())?.applied?.effort ?? null;
  } catch {
    return null;
  }
}

async function settingsEffort() {
  const texts = [];
  for (const file of settingsFiles()) {
    try { texts.push(await readFile(file, "utf8")); } catch { texts.push(""); }
  }
  return effortFromSettings(texts);
}

let effortRestored = false;

function restoreEffort() {
  if (effortRestored || !effortLevel) return;
  effortRestored = true;
  persistSession({ effort: effortLevel });
  session.applyFlagSettings({ effortLevel })
    .catch((e) => emit({ type: "driver", subtype: "warning", message: `could not put this seat back on ${effortLevel} effort: ${String(e?.message || e)}` }));
}

function openSession(withFreshInput = false) {
  if (withFreshInput) input = channel();
  const fresh = { ...options };
  if (sessionId) fresh.resume = sessionId;
  if (fresh.resume && fresh.extraArgs) {
    const { "session-id": discarded, ...rest } = fresh.extraArgs;
    fresh.extraArgs = rest;
  }
  generation += 1;
  suspect = false;
  backgroundTasks.clear();
  session = query({ prompt: input, options: fresh });
}

function touch() {
  lastActivity = Date.now();
  armSleep();
}

function armSleep(inMs = sleepAfter()) {
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = null;
  if (!sleepAfter()) return;
  sleepTimer = setTimeout(trySleep, Math.max(1000, inMs));
  sleepTimer.unref?.();
}

function trySleep() {
  sleepTimer = null;
  const verdict = sleepVerdict({
    now: Date.now(),
    lastActivity,
    afterMs: sleepAfter(),
    sleeping,
    leaving,
    sessionId,
    busy: gate.busy,
    queued: gate.queued,
    questions: pendingQuestions.size,
    tasks: backgroundTasks.size,
  });
  if (!verdict.sleep) {
    if (verdict.retry) armSleep(verdict.inMs ?? 60000);
    return;
  }
  retire("idle", verdict.idle);
}

function retire(why, idleMs = Date.now() - lastActivity) {
  if (sleeping || leaving) return;
  sleeping = true;
  sleptAt = Date.now();
  persistSession({ asleep: true });
  const reborn = canBeReborn(process, process.env, sessionId);
  emit({ type: "driver", subtype: "slept", idle_ms: idleMs, reason: why, session_id: sessionId, watched, reborn });
  input.close();
  if (reborn) rebornAsleep().catch((e) => emit({ type: "driver", subtype: "warning", message: `this seat sleeps with the sdk still loaded: it could not be reborn (${String(e?.message || e)})` }));
}

async function rebornAsleep() {
  await childrenGone({ pid: process.pid, graceMs: REBIRTH_CHILD_GRACE_MS });
  if (!sleeping || leaving) return;
  await sessionStore.flush();
  await appendChain;
  server.close();
  process.execve(process.execPath, [process.execPath, ...rebornArgs(process.argv.slice(1), sessionId)], process.env);
}

function ensureAwake() {
  if (!sleeping) return;
  sleeping = false;
  emit({ type: "driver", subtype: "woke", slept_ms: Date.now() - sleptAt, sdk_loaded: !!query });
  persistSession({ asleep: false });
  if (query) {
    openSession(true);
    runConsume();
    touch();
    return;
  }
  const fresh = input;
  loadSdk().then(() => {
    if (sleeping || input !== fresh) return;
    openSession(false);
    runConsume();
    touch();
  }).catch((e) => {
    sleeping = true;
    emit({ type: "driver", subtype: "error", error: `the seat could not load the agent sdk to wake up: ${String(e?.message || e)}` });
  });
}

function noteTasks(message) {
  if (message.subtype !== "background_tasks_changed") return;
  backgroundTasks.clear();
  for (const task of message.tasks || []) {
    if (!task.ambient && task.task_id) backgroundTasks.set(task.task_id, task.description || task.task_type || "");
  }
}

if (bornAsleep) {
  sleeping = true;
  sleptAt = Date.now();
} else {
  await loadSdk();
  openSession();
}

const expecting = answerHold({
  deliver: ({ from, text, images, side }) => {
    const item = gate.push({ text: peerSayText(from, text, side), images, cid: null });
    if (item) dispatchSay(item);
  },
});

function sessionTakesLogin(dir) {
  const inherited = { ...process.env };
  if (dir) inherited.CLAUDE_CONFIG_DIR = dir;
  else delete inherited.CLAUDE_CONFIG_DIR;
  options.env = inherited;
  options.mcpServers = seatMcpServers(dir);
  const stale = input;
  openSession(true);
  stale.close();
  effortRestored = false;
  runConsume();
}

function sessionRereadsMcp() {
  options.mcpServers = seatMcpServers(logins.dir || process.env.CLAUDE_CONFIG_DIR || "");
  const stale = input;
  openSession(true);
  stale.close();
  effortRestored = false;
  runConsume();
}

function moveToAccount(wanted, why = "asked") {
  return logins.moveTo(wanted, why);
}

async function theTurnEnded(message) {
  const spent = accountRanDry(message);
  if (await logins.turnEnded(spent)) return true;
  if (endedOnApiError(message)) suspect = true;
  dispatchSay(gate.turnEnded());
  return false;
}

async function goHomeWhenTheDoorOpens() {
  if (leaving || sleeping) return;
  await logins.goHome();
}

function handleCommand(cmd, reply) {
  if (wakesTheSeat(cmd) && sleeping && !query) {
    loadSdk().then(() => handleCommand(cmd, reply), (e) => reply({ ok: false, error: `the seat could not load the agent sdk to wake up: ${String(e?.message || e)}` }));
    return;
  }
  if (wakesTheSeat(cmd)) ensureAwake();
  if (sleeping) {
    const fromMemory = answerWhileAsleep(cmd, remembered);
    if (fromMemory) return reply(fromMemory);
  }
  if (cmd.type === "presence") {
    const looking = !!cmd.watched;
    if (looking !== watched) {
      watched = looking;
      emit({ type: "driver", subtype: "presence", watched, sleep_after_ms: sleepAfter() });
      armSleep(1000);
    }
    return reply({ ok: true, watched, sleep_after_ms: sleepAfter() });
  }
  if (cmd.type === "say") {
    const images = Array.isArray(cmd.images) ? cmd.images.filter((p) => typeof p === "string") : [];
    if ((typeof cmd.text !== "string" || !cmd.text.trim()) && !images.length) return reply({ ok: false, error: "say needs text" });
    const text = String(cmd.text || "").trim() || "(image)";
    const from = typeof cmd.from === "string" && cmd.from.trim() ? cmd.from.trim() : null;
    if (!from) persistSession({ births: BIRTHS_MAX });
    if (expecting.take(from, { text, images, side: cmd.side })) {
      emit(sayEvent(text, images, cmd.cid, from, true));
      return reply({ ok: true, consumed: true });
    }
    emit(sayEvent(text, images, cmd.cid, from));
    const dropped = dismissQuestions(text);
    const goes = !dropped.length || images.length > 0;
    const item = goes ? gate.push({ text: from ? peerSayText(from, text, cmd.side) : text, images, cid: cmd.cid || null }) : null;
    if (item) dispatchSay(item);
    const answer = { ok: true, dismissed: dropped.length };
    if (goes) answer.queued = !item;
    return reply(answer);
  }
  if (cmd.type === "expect") {
    const from = String(cmd.from || "").trim();
    if (!from) return reply({ ok: false, error: "expect needs the seat to wait on" });
    expecting.expect(from, cmd.wait_ms);
    return reply({ ok: true, seq });
  }
  if (cmd.type === "collect") {
    const answer = expecting.collect(String(cmd.from || "").trim());
    return reply(answer ? { ok: true, answered: true, ...answer } : { ok: true, answered: false });
  }
  if (cmd.type === "unexpect") {
    expecting.unexpect(String(cmd.from || "").trim());
    return reply({ ok: true });
  }
  if (cmd.type === "unsay") {
    const item = gate.unsay(cmd.target);
    if (!item) return reply(queueMiss(gate, cmd.target));
    emit({ type: "driver", subtype: "unsaid", cid: item.cid });
    return reply({ ok: true });
  }
  if (cmd.type === "saynow") {
    const item = gate.unsay(cmd.target);
    if (!item) return reply(gate.alreadyLeft(cmd.target) ? { ok: true, already: true } : queueMiss(gate, cmd.target));
    dispatchSay(item);
    emit({ type: "driver", subtype: "said_now", cid: item.cid });
    return reply({ ok: true });
  }
  if (cmd.type === "answer") {
    const settle = pendingQuestions.get(cmd.id);
    if (!settle) return reply({ ok: false, error: `no pending question ${cmd.id}` });
    pendingQuestions.delete(cmd.id);
    settle({ answers: cmd.answers });
    return reply({ ok: true });
  }
  if (cmd.type === "interrupt") {
    if (staleInterrupt(cmd)) {
      emit({ type: "driver", subtype: "stale_interrupt_dropped", waited_ms: Date.now() - cmd.sent });
      return reply({ ok: false, error: "this interrupt waited too long in the pipe and was dropped — press stop again if the turn still needs it" });
    }
    if (!session) return reply({ ok: false, error: "the seat was asleep — there was no turn to stop" });
    const started = Date.now();
    session.interrupt()
      .then(() => emit({ type: "driver", subtype: "interrupted", ms: Date.now() - started }))
      .catch((e) => emit({ type: "driver", subtype: "interrupt_failed", error: String(e?.message || e) }));
    return reply({ ok: true });
  }
  if (cmd.type === "state") {
    return reply({ ok: true, name, side, agent: "claude", model: currentModel || chosenModel || "", effort: effortLevel, session_id: sessionId, seq, questions: [...pendingQuestions.keys()], queued: gate.queued, working: gate.busy, asleep: sleeping, watched, tasks: backgroundTasks.size, expecting: expecting.waitingOn(), events_write_failed: eventsTrouble.broken });
  }
  if (cmd.type === "control") {
    const ops = {
      ...readers,
      setModel: async () => {
        const models = await session.supportedModels().catch(() => []);
        const chosen = models.find((m) => m.value === cmd.model || m.resolvedModel === cmd.model);
        /* the catalogue is the whole list of names this seat can run, and until
           this was here anything at all went through it into options.model —
           so the next session opened on a model that does not exist. A word
           lifted out of the middle of a sentence by the composer reached this
           as a model name. An empty catalogue means the CLI could not be asked,
           and refusing on a guess there would block a pick that is probably
           fine. */
        if (cmd.model && !chosen && models.length) {
          throw new Error(`this chat runs no model called "${cmd.model}" — the picker has the ones it does`);
        }
        let restarted = false;
        try {
          await session.setModel(cmd.model || undefined);
        } catch (e) {
          /* a busy seat answers this slowly, not with a throw — see apply() in
             app.html. A throw means the CLI hard-refused the hot swap outright,
             so retrying the same call would just fail again. Reopening (the
             same path a sleeping seat wakes through) is the only way the pick
             still lands instead of dying here with the seat pinned on the old
             model forever. Skip it while a turn is in flight: that path never
             reopens a session underneath a live generation. */
          if (gate.busy) throw e;
          restarted = true;
        }
        const id = chosen?.resolvedModel || cmd.model || "";
        chosenModel = currentModel = cmd.model || "";
        if (chosenModel) options.model = chosenModel;
        else delete options.model;
        const allowed = chosen?.supportedEffortLevels || [];
        /* haiku has no levels: moving onto it has to drop the level, not keep a
           stale one. Only enforce when the row was actually found. */
        if (effortLevel && chosen && !allowed.includes(effortLevel)) {
          effortLevel = "";
          emit({ type: "driver", subtype: "effort_changed", level: effortLevel });
        }
        persistSession({ ...(id ? { model_id: id } : {}), model: chosenModel || null, effort: effortLevel });
        if (restarted) openSession(true);
        emit({ type: "driver", subtype: "model_changed", model: id, label: chosen?.displayName || cmd.model || "account default", restarted });
        return { model: id, effort: effortLevel };
      },
      mcpReconnect: async () => {
        await session.reconnectMcpServer(String(cmd.server || ""));
        return session.mcpServerStatus();
      },
      reinit: () => session.reinitialize(),
      mcpReload: async () => {
        if (gate.busy) throw new Error("this chat is mid-turn — its tools are read again when it is reopened after the turn");
        sessionRereadsMcp();
        return session.mcpServerStatus();
      },
      compact: () => {
        const focus = typeof cmd.focus === "string" ? cmd.focus.trim() : "";
        const text = "/compact" + (focus ? ` ${focus}` : "");
        const cid = cmd.cid || null;
        const item = gate.push({ text, images: [], cid });
        emit({ type: "driver", subtype: "compact_asked", focus: focus || null, queued: !item, cid });
        if (item) dispatchSay(item);
        return { queued: !item, cid };
      },
      setAccount: async () => {
        if (gate.busy) throw new Error("this chat is mid-turn — stop it or let it finish, and the login changes after that");
        return { account: moveToAccount(String(cmd.account || "").trim()) };
      },
      setEffort: async () => {
        const level = String(cmd.level || "");
        const models = await session.supportedModels().catch(() => []);
        const chosen = models.find((m) => m.value === currentModel || m.resolvedModel === currentModel)
          || models.find((m) => m.value === "default");
        const levels = chosen?.supportedEffortLevels || ["low", "medium", "high", "xhigh", "max"];
        if (!levels.includes(level)) throw new Error(`this model takes ${levels.join(", ")}`);
        await session.applyFlagSettings({ effortLevel: level });
        effortLevel = level;
        persistSession({ effort: effortLevel });
        emit({ type: "driver", subtype: "effort_changed", level: effortLevel });
        return { level: effortLevel };
      },
      setMode: async () => {
        const wanted = String(cmd.mode || "");
        if (!PLAN_MODES.has(wanted)) throw new Error("the mode of a chat is plan or normal");
        if (wanted === mode) return { mode };
        return { mode: await wearMode(wanted) };
      },
      spendBirth: () => {
        const asked = Math.max(1, Math.trunc(Number(cmd.n) || 1));
        const left = birthsLeft(sessionStore.meta.births);
        if (asked > left) {
          throw new Error(left === 0
            ? `this chat has opened ${BIRTHS_MAX} of ${BIRTHS_MAX} chats this round, and nothing was opened now. Work with the ones already open, or tell the person what else the request needs — the budget comes back with their next message.`
            : `this chat has ${left} of ${BIRTHS_MAX} chats left this round and asked for ${asked}, so nothing was opened. Open ${left}, or tell the person what else the request needs.`);
        }
        persistSession({ births: left - asked });
        return { left: left - asked, of: BIRTHS_MAX };
      },
      setTitle: () => {
        const line = seatTitle(cmd.title);
        if (!line) throw new Error("a title with nothing in it would leave the seat showing its slug");
        persistSession({ title: line });
        emit({ type: "driver", subtype: "title_changed", title: line });
        return { title: line };
      },
    };
    const op = ops[cmd.op];
    if (!op) return reply({ ok: false, error: `unknown control op ${cmd.op}` });
    Promise.resolve().then(op).then(
      (data) => reply({ ok: true, data: readsOnly(cmd) ? remember(cmd.op, data) : data }),
      (err) => reply({ ok: false, error: String(err?.message || err) })
    );
    return;
  }
  return reply({ ok: false, error: `unknown command ${cmd.type}` });
}

const readers = {
  models: () => session.supportedModels(),
  catalog: async () => {
    const models = normalizeClaudeModels(await session.supportedModels());
    /* before the first turn the session has not said which model it resolved
       to, and the seat is on the account default — same fallback the pill uses. */
    const row = pickModelRow(models, currentModel);
    const levels = (row?.efforts || []).map((x) => x.value);
    const inherited = effortLevel ? "" : await settingsEffort();
    const effort = effortLevel || (levels.includes(inherited) ? inherited : "");
    if (!effort) withAppliedDefault(row, await appliedEffort());
    return {
      agent: "claude",
      current: { model: currentModel, effort, from: effortLevel ? "session" : effort ? "settings" : "", account: logins.name },
      models,
    };
  },
  mcp: () => session.mcpServerStatus(),
  context: () => session.getContextUsage(),
  agents: () => session.supportedAgents(),
  styles: async () => {
    const init = await session.initializationResult();
    return { current: init?.output_style || "", available: init?.available_output_styles || [] };
  },
};

const remembered = new Map();

function remember(op, data) {
  remembered.set(op, data);
  return data;
}

const server = createSeatServer({ sockFile, shellEnvFile: shellEnvFileFor(base, name), handleCommand, emit, leave, store: sessionStore, flush: () => sessionStore.flush() });

emit({ type: "driver", subtype: "started", name, cwd, model: chosenModel || null, account: logins.name, base, resumed: resumeId || null, pid: process.pid, asleep: bornAsleep });

async function replayTranscript(id) {
  const projects = join(homedir(), ".claude", "projects");
  let file = "";
  try {
    for (const dir of await readdir(projects)) {
      const candidate = join(projects, dir, `${id}.jsonl`);
      if (existsSync(candidate)) { file = candidate; break; }
    }
  } catch {}
  if (!file) return;
  let replay;
  try { replay = await transcriptTail(file); } catch { return; }
  if (!replay.tail.length) return;
  emit({ type: "driver", subtype: "replayed", count: replay.tail.length, total: replay.total });
  for (const event of replay.tail) emit(event);
}

if (resumeId && freshEventsFile) await replayTranscript(resumeId);

let leaving = false;
async function leave(reason, code) {
  if (leaving) return;
  leaving = true;
  emit({ type: "driver", subtype: "exit", reason });
  input.close();
  await sessionStore.flush();
  await appendChain;
  server.close();
  await rm(sockFile, { force: true });
  process.exit(code);
}
process.on("SIGTERM", () => leave("sigterm", 0));
process.on("SIGINT", () => leave("sigint", 0));

async function runConsume(mine = generation) {
  try {
    for await (const message of session) {
      if (mine !== generation) return;
      heardFromSession();
      touch();
      const hook = hookFate(message);
      if (hook.memory) emit(hook.memory);
      if (!hook.shown) continue;
      if (message.type === "system" && message.subtype === "init") {
        sessionId = message.session_id;
        if (message.model) currentModel = message.model;
        persistSession({ session_id: sessionId, cwd, model: chosenModel || null, model_id: message.model || null });
        dirsTrail.note(message.cwd || cwd);
        restoreEffort();
        readers.catalog().then((data) => remember("catalog", data)).catch(() => {});
        session.supportedCommands?.()
          .then((commands) => {
            if (Array.isArray(commands) && commands.length) emit({ type: "system", subtype: "commands_changed", commands });
          })
          .catch(() => {});
      }
      noteTasks(message);
      emit(message);
      if (message.type === "result") readers.context().then((data) => remember("context", data)).catch(() => {});
      if (message.type === "result" && await theTurnEnded(message)) return;
    }
    if (sleeping || mine !== generation) return;
    await leave("stream ended", 0);
  } catch (e) {
    if (sleeping || mine !== generation) return;
    const trouble = String(e?.message || e);
    if (!startedOver && noConversationToResume(trouble)) return startOver();
    emit({ type: "driver", subtype: "error", error: trouble });
    await leave("crashed", 1);
  }
}

let startedOver = false;

function startOver() {
  startedOver = true;
  const lost = sessionId || resumeId;
  resumeId = "";
  sessionId = "";
  delete options.resume;
  options.extraArgs = { ...(options.extraArgs || {}) };
  if (lost) options.extraArgs["session-id"] = lost;
  emit({ type: "driver", subtype: "warning", message: `there is no conversation stored under ${lost} to pick up, so this seat starts one` });
  openSession(true);
  runConsume();
  deliverMission();
  touch();
}

persistSession({ home: logins.home });
const goingHome = setInterval(() => { goHomeWhenTheDoorOpens().catch(() => {}); }, 60000);
goingHome.unref?.();

if (bornAsleep) persistSession({ asleep: true });
else if (storedSession.asleep) persistSession({ asleep: false });
if (!bornAsleep) touch();
forgetOldShots(freshEventsFile ? 0 : SHOTS_KEPT);
if (!bornAsleep) await runConsume();
