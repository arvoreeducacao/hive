import { transferText, transferResult, transferEvent } from "./transfer-context.mjs";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { eventLine, lastSeq, compactLine, sayEvent, sayGate, queueMiss, seatTitle, staleInterrupt, peerSayText, seatPreamble, answerHold } from "./protocol.mjs";
import { stateDir, sideOf, seatSockPath } from "./paths.mjs";
import { accountFailover } from "./failover.mjs";
import { accountDirFromEnv, providerEnv, providerEnvName, providerRanDry } from "./providers.mjs";
import { aBirthCarriesAMission, aFullPaneMustNeverWedgeTheSeat, arg, forgetWhatTheNameHeld, missionShots, tailOfFile, makeSessionStore, makeWarnOnce, makeEventsTrouble, createSeatServer, makeDirsTrail, toolDirs } from "./seat-core.mjs";
import { shellEnvFileFor } from "./shell-env.mjs";
import { createRpcClient } from "./rpc-stdio.mjs";
import { autocompactTokens } from "./agents.mjs";
import { DEFAULT_PORT, ensureGateway, gatewayPaths, hubFor } from "../gateway/mcp-gateway.mjs";
import { remoteMcpServers } from "./codex-app-server.mjs";
import {
  SLASH_COMMANDS, acpArgs, initializeParams, mcpServersFor, newSessionParams, loadSessionParams, setModeParams, setModelParams, setEffortParams, currentEffort, promptParams,
  resumeFellThrough, modelsFromConfigOptions, currentModel, newSessionContext, carryOver, translate, finishTurn, contextUsage, serverRequestReply, stderrTrouble,
} from "./kimi-acp.mjs";
import { subagentWatcher } from "./kimi-subagents.mjs";

aFullPaneMustNeverWedgeTheSeat();

const AGENT = "kimi";
const LABEL = "Kimi";
const name = arg("--name");
if (!name || !/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
  console.error("usage: node kimi-driver.mjs --name <seat> [--cwd <dir>] [--model <model>] [--prompt-file <path>] [--resume-id <session>]");
  process.exit(2);
}

const base = stateDir();
const side = sideOf(base);
const cwd = arg("--cwd", process.cwd());
const promptFile = arg("--prompt-file");
const autocompactAt = autocompactTokens(arg("--autocompact"));
let model = arg("--model");
let effort = arg("--effort");

const eventsFile = join(base, "events", `${name}.ndjson`);
const sockFile = seatSockPath(base, name);
const sessionFile = join(base, "sessions", `${name}.json`);

await mkdir(join(base, "events"), { recursive: true });
await mkdir(join(base, "sock"), { recursive: true });
await mkdir(join(base, "sessions"), { recursive: true });
await rm(sockFile, { force: true });

const bornNow = aBirthCarriesAMission({ promptFile, resumeId: arg("--resume-id") });
const nameHadAChatBefore = bornNow && await forgetWhatTheNameHeld({ sessionFile, eventsFile });

let seq = lastSeq(await tailOfFile(eventsFile));
/* a session picked up into an empty events file gets its history painted back from the
   agent's replay; one whose events file already holds the conversation keeps quiet, or
   every turn would appear twice. */
const freshEventsFile = seq === 0;
let appendChain = Promise.resolve();
const eventsTrouble = makeEventsTrouble(eventsFile);
let quiet = false;
function emit(event) {
  if (event.type === "user") event = transferEvent(event, sessionStore);
  if (event.type === "result") transferResult(event, sessionStore);
  if (event.type === "assistant") dirsTrail.note(...toolDirs(event, cwd));
  if (quiet && (event.type === "stream_event" || event.type === "assistant")) return seq;
  seq += 1;
  const line = eventLine(seq, event) + "\n";
  appendChain = appendChain.then(() => appendFile(eventsFile, line)).catch((e) => eventsTrouble.note(e));
  const short = compactLine(event);
  if (short) console.log(short);
  return seq;
}

if (nameHadAChatBefore) {
  emit({ type: "driver", subtype: "warning", message: `a chat named ${name} lived here before and was closed; this one starts empty — the old conversation is still in the history, to revive` });
}

let sessionId = "";
let loadedMeta = {};
try {
  loadedMeta = JSON.parse(await readFile(sessionFile, "utf8"));
  sessionId = loadedMeta.session_id || "";
} catch {}
if (!sessionId) sessionId = arg("--resume-id");
if (!model && loadedMeta.model) model = loadedMeta.model;
if (!effort && loadedMeta.effort) effort = loadedMeta.effort;

const sessionTrouble = makeWarnOnce((message) => emit({ type: "driver", subtype: "warning", message }));
const sessionStore = makeSessionStore(sessionFile, loadedMeta, (e) => sessionTrouble(`the session file stopped taking writes — a restart would lose this conversation: ${String(e?.message || e)}`));
const persistSession = sessionStore.persist;
const dirsTrail = makeDirsTrail(loadedMeta.dirs, persistSession);

persistSession({ agent: AGENT, cwd, model: model || null, model_id: model || null, effort, ...(sessionId ? { session_id: sessionId } : {}) });
dirsTrail.note(cwd);

let childEnv = { ...process.env };
let lastSaid = null;
const logins = accountFailover({
  base,
  provider: AGENT,
  bornIn: accountDirFromEnv(AGENT, process.env),
  home: loadedMeta.home || "",
  emit: (event) => emit(event),
  persist: (patch) => persistSession(patch),
  apply: ({ dir }) => childTakesLogin(dir),
  redo: () => { if (lastSaid) dispatchSay(lastSaid); return !!lastSaid; },
  busy: () => gate.busy || gate.queued || !!turning,
});
persistSession({ home: logins.home });

function childTakesLogin(dir) {
  const inherited = { ...process.env };
  delete inherited[providerEnvName(AGENT)];
  childEnv = { ...inherited, ...providerEnv(AGENT, dir) };
  client?.close();
  client = null;
}

function initEvent(extra = {}) {
  return { type: "system", subtype: "init", session_id: sessionId, model: model || "", effort, working: gate.busy, slash_commands: SLASH_COMMANDS, terminal_slash_commands: [], agent: AGENT, ...extra };
}

const gate = sayGate();
const expecting = answerHold({
  deliver: ({ from, text, images, side }) => {
    const item = gate.push({ text: peerSayText(from, text, side), images, cid: null });
    if (item) dispatchSay(item);
  },
});
let client = null;
let opening = null;
let ctx = newSessionContext();
let turning = null;
let turnLive = false;
let catalog = [];
let configOptions = [];
let awaited = null;
let silenceTimer = null;
let leaving = false;
let preambleSaid = !!loadedMeta.preamble_said;

const SILENCE_IS_A_WEDGE_MS = 180000;
const PROMPT_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const LET_GO_OF_THE_TURN_MS = 20000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function noteTrouble(message) {
  emit({ type: "driver", subtype: "warning", message: String(message || "").slice(0, 400) });
}

function heardFromServer() {
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = null;
  awaited = null;
}

function watchForSilence(item) {
  awaited = item;
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => { theServerWentMute().catch((e) => noteTrouble(`the seat could not close the mute turn: ${String(e?.message || e)}`)); }, SILENCE_IS_A_WEDGE_MS);
  silenceTimer.unref?.();
}

async function theServerWentMute() {
  silenceTimer = null;
  if (!awaited || leaving) return;
  awaited = null;
  const gone = "kimi stopped answering";
  noteTrouble("kimi took the message and answered nothing for three minutes — closing this turn so the seat stops reading as busy; say it again to try once more");
  const wedged = turning;
  if (!wedged) return endTurn(finishTurn(ctx, "", sessionId, gone));
  try { client?.notify("session/cancel", { sessionId }); } catch {}
  await Promise.race([wedged.catch(() => {}), sleep(LET_GO_OF_THE_TURN_MS)]);
  if (leaving || turning !== wedged) return;
  if (!client?.alive) return endTurn(finishTurn(ctx, "", sessionId, gone));
  noteTrouble("kimi did not let the turn go when asked — closing the connection, so the next message opens it again on the same conversation");
  client.close();
}

let interruptAskedAt = 0;

const subagents = subagentWatcher({
  sessionId: () => sessionId,
  env: () => childEnv,
  emit: (event) => emit(event),
  onTrouble: (message) => noteTrouble(message),
});

function endTurn(events) {
  if (!turnLive) return;
  turnLive = false;
  turning = null;
  subagents.turnEnded();
  for (const e of events || []) emit(e);
  ctx = carryOver(ctx);
  if (interruptAskedAt) {
    emit({ type: "driver", subtype: "interrupted", ms: Date.now() - interruptAskedAt });
    interruptAskedAt = 0;
  }
  const ended = (events || []).find((e) => e.type === "result");
  const spent = ended?.is_error ? providerRanDry(AGENT, ended.result) : null;
  logins.turnEnded(spent).then((moved) => { if (!moved) dispatchSay(gate.turnEnded()); });
}

function onNotification(method, params, msg) {
  heardFromServer();
  for (const e of translate(msg, ctx)) {
    emit(ctx.replaying ? { ...e, replayed: true } : e);
    if (ctx.replaying) continue;
    for (const block of e.type === "assistant" ? e.message?.content || [] : []) {
      if (block.type === "tool_use") subagents.launched(block);
    }
  }
}

async function onRequest(method, params) {
  heardFromServer();
  const reply = serverRequestReply(method, params);
  if (reply) return reply;
  throw new Error(`the seat does not answer ${method}`);
}

function onExit(code, signal, said) {
  const wasOpen = !!client;
  client = null;
  opening = null;
  if (leaving || !wasOpen) return;
  noteTrouble(`kimi acp went away (${said}) — the next message reopens the conversation`);
  if (gate.busy) endTurn(finishTurn(ctx, "", sessionId, said));
}

function onStderr(line) {
  const trouble = stderrTrouble(line);
  if (trouble) noteTrouble(trouble);
}

function hubServers(hub) {
  try { return Object.keys(JSON.parse(readFileSync(gatewayPaths(hub).servers, "utf8")).servers || {}); } catch { return []; }
}

const gateway = await ensureGateway({ hub: hubFor(cwd) }).catch((e) => ({ ok: false, reason: String(e?.message || e) }));
emit({ type: "driver", subtype: "mcp_gateway", ok: !!gateway.ok, started: !!gateway.started, replaced: gateway.replaced || null, port: gateway.port || null, reason: gateway.reason || null });
const gatewayLink = gateway.ok ? { port: gateway.port, servers: hubServers(hubFor(cwd)), hub: gateway.hub } : null;

function hubRemoteServers(hub) {
  try { return remoteMcpServers(readFileSync(join(hub, ".mcp.json"), "utf8"), gateway.port || DEFAULT_PORT); } catch { return []; }
}

const remoteLink = hubRemoteServers(hubFor(cwd));
const mcpServers = mcpServersFor({ seat: name, base, gateway: gatewayLink, remote: remoteLink });

function takeConfig(result) {
  if (!Array.isArray(result?.configOptions)) return;
  configOptions = result.configOptions;
  const current = currentModel(configOptions);
  const rows = modelsFromConfigOptions(configOptions);
  if (rows.length) catalog = rows.map((row) => {
    const known = catalog.find((old) => old.value === row.value);
    return row.value !== current && known ? { ...row, efforts: known.efforts, defaultEffort: known.defaultEffort } : row;
  });
  if (current) model = current;
  effort = currentEffort(configOptions);
  persistSession({ model, model_id: model, effort });
}

async function changeEffort(rpc, level) {
  const result = await rpc.request("session/set_config_option", setEffortParams(sessionId, level, configOptions));
  if (!currentEffort(result?.configOptions)) throw new Error(`Kimi did not confirm thinking ${level}`);
  takeConfig(result);
  return { effort, models: catalog };
}

async function openAcp() {
  if (client?.alive) return client;
  if (opening) return opening;
  opening = (async () => {
    const wantedModel = model;
    const wantedEffort = effort;
    const child = spawn("kimi", acpArgs(), { cwd, env: childEnv, stdio: ["pipe", "pipe", "pipe"] });
    const rpc = createRpcClient({ child, onNotification, onRequest, onExit, onStderr });
    try {
      await rpc.request("initialize", initializeParams());
      let opened;
      if (sessionId) {
        ctx.muted = !freshEventsFile;
        ctx.replaying = freshEventsFile;
        try {
          opened = await rpc.request("session/load", loadSessionParams(sessionId, { cwd, mcpServers }), { timeoutMs: 120000 });
          opened = { ...opened, sessionId };
          if (freshEventsFile) emit({ type: "driver", subtype: "replayed", session_id: sessionId });
        } catch (e) {
          if (!resumeFellThrough(e?.message)) throw e;
          noteTrouble(`there is no conversation stored under ${sessionId} to pick up, so this seat starts one`);
          opened = await rpc.request("session/new", newSessionParams({ cwd, mcpServers }), { timeoutMs: 120000 });
        } finally {
          ctx.muted = false;
          ctx.replaying = false;
        }
      } else {
        opened = await rpc.request("session/new", newSessionParams({ cwd, mcpServers }), { timeoutMs: 120000 });
      }
      const id = opened?.sessionId || "";
      if (id && id !== sessionId) {
        sessionId = id;
        persistSession({ session_id: sessionId });
      }
      if (!sessionId) throw new Error("kimi opened no session");
      takeConfig(opened);
      await rpc.request("session/set_mode", setModeParams(sessionId)).catch((e) => noteTrouble(`kimi kept its own permission mode: ${String(e?.message || e)}`));
      if (wantedModel && model !== wantedModel) {
        takeConfig(await rpc.request("session/set_config_option", setModelParams(sessionId, wantedModel)));
      }
      if (wantedEffort) await changeEffort(rpc, wantedEffort);
      client = rpc;
      emit(initEvent());
      return rpc;
    } catch (e) {
      ctx.muted = false;
      ctx.replaying = false;
      rpc.close();
      throw e;
    } finally {
      opening = null;
    }
  })();
  return opening;
}

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };

function loadImage(path) {
  try {
    const mimeType = MIME[extname(path).toLowerCase()];
    if (!mimeType) return null;
    return { data: readFileSync(path).toString("base64"), mimeType };
  } catch { return null; }
}

function withPreamble(text) {
  if (preambleSaid) return text;
  preambleSaid = true;
  persistSession({ preamble_said: true });
  return `${seatPreamble(name, side)}\n\n${text}`;
}

function dispatchSay(item) {
  if (!item) return;
  if (!item.providerContext) item = { ...item, text: transferText(item.text, sessionStore), providerContext: true };
  lastSaid = item;
  if (item.cid) {
    gate.left(item.cid);
    emit({ type: "driver", subtype: "dispatched", cid: item.cid });
  }
  ctx = carryOver(ctx);
  watchForSilence(item);
  turnLive = true;
  const mine = openAcp()
    .then((rpc) => rpc.request("session/prompt", promptParams(sessionId, withPreamble(item.text), item.images, loadImage), { timeoutMs: PROMPT_TIMEOUT_MS }))
    .then(async (done) => {
      if (turning !== mine) return;
      heardFromServer();
      for (const e of finishTurn(ctx, done?.stopReason || "end_turn", sessionId)) emit(e);
      ctx = carryOver(ctx);
      await compactWhenPastTheCeiling().catch((e) => noteTrouble(`kimi did not compact on its own: ${String(e?.message || e)}`));
      if (turning !== mine) return;
      endTurn([]);
    })
    .catch((e) => {
      if (turning !== mine) return;
      heardFromServer();
      emit({ type: "driver", subtype: "error", error: `kimi: ${String(e?.message || e)}` });
      endTurn(finishTurn(ctx, "", sessionId, String(e?.message || e)));
    });
  turning = mine;
}

async function quietPrompt(text) {
  const rpc = await openAcp();
  quiet = true;
  const held = ctx;
  ctx = carryOver(ctx);
  try {
    await rpc.request("session/prompt", promptParams(sessionId, text, []), { timeoutMs: 120000 });
    held.lastUsage = ctx.lastUsage || held.lastUsage;
    held.contextWindow = ctx.contextWindow || held.contextWindow;
    held.commands = ctx.commands.length ? ctx.commands : held.commands;
  } finally {
    ctx = held;
    quiet = false;
  }
}

let autocompactFloor = 0;

async function compactWhenPastTheCeiling() {
  if (!autocompactAt || autocompactFloor || leaving || !client?.alive) return;
  await quietPrompt("/usage");
  const before = ctx.lastUsage?.total || 0;
  if (before < autocompactAt) return;
  emit({ type: "driver", subtype: "compact_asked", focus: null, queued: false, auto: true, tokens: before, ceiling: autocompactAt });
  await quietPrompt("/compact");
  await quietPrompt("/usage").catch(() => {});
  const after = ctx.lastUsage?.total || null;
  emit({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "auto", pre_tokens: before, post_tokens: after } });
  if (after && after >= autocompactAt) {
    autocompactFloor = after;
    noteTrouble(`autocompact at ${autocompactAt} tokens cannot be met here: after compacting, the seat still carries ${after} (tool schemas and instructions, not conversation) — raise the ceiling in the hive config, or trim the MCP list; automatic compaction is off for this seat until it reopens`);
  }
}

async function interruptTurn() {
  if (!client?.alive || !turning) return false;
  client.notify("session/cancel", { sessionId });
  return true;
}

function handleCommand(cmd, reply) {
  if (cmd.type === "say") {
    const images = Array.isArray(cmd.images) ? cmd.images.filter((p) => typeof p === "string") : [];
    if ((typeof cmd.text !== "string" || !cmd.text.trim()) && !images.length) return reply({ ok: false, error: "say needs text" });
    const text = String(cmd.text || "").trim() || "(image)";
    const from = typeof cmd.from === "string" && cmd.from.trim() ? cmd.from.trim() : null;
    if (expecting.take(from, { text, images, side: cmd.side })) {
      emit(sayEvent(text, images, cmd.cid, from, true));
      return reply({ ok: true, consumed: true });
    }
    emit(sayEvent(text, images, cmd.cid, from));
    const item = gate.push({ text: from ? peerSayText(from, text, cmd.side) : text, images, cid: cmd.cid || null });
    if (item) dispatchSay(item);
    const answer = { ok: true, dismissed: 0, queued: !item };
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
    if (!turning) {
      dispatchSay(item);
      emit({ type: "driver", subtype: "said_now", cid: item.cid });
      return reply({ ok: true });
    }
    gate.push(item);
    return reply({ ok: false, error: `${LABEL} cannot take a message in the middle of a turn — it stays first in line` });
  }
  if (cmd.type === "answer") {
    return reply({ ok: false, error: `${LABEL} seats have no question cards to answer` });
  }
  if (cmd.type === "interrupt") {
    if (staleInterrupt(cmd)) {
      emit({ type: "driver", subtype: "stale_interrupt_dropped", waited_ms: Date.now() - cmd.sent });
      return reply({ ok: false, error: "this interrupt waited too long in the pipe and was dropped — press stop again if the turn still needs it" });
    }
    if (!gate.busy && !turning) return reply({ ok: false, error: "the seat was idle — there was no turn to stop" });
    interruptAskedAt = Date.now();
    interruptTurn()
      .then((sent) => {
        if (sent) return;
        interruptAskedAt = 0;
        if (gate.busy) endTurn(finishTurn(ctx, "cancelled", sessionId));
        emit({ type: "driver", subtype: "interrupted", ms: 0 });
      })
      .catch((e) => {
        interruptAskedAt = 0;
        emit({ type: "driver", subtype: "interrupt_failed", error: String(e?.message || e) });
      });
    return reply({ ok: true });
  }
  if (cmd.type === "state") {
    return reply({ ok: true, name, side, agent: AGENT, model, effort, session_id: sessionId, seq, questions: [], queued: gate.queued, working: gate.busy, expecting: expecting.waitingOn(), events_write_failed: eventsTrouble.broken });
  }
  if (cmd.type === "control") {
    const ops = {
      models: async () => { await openAcp(); return catalog.map((m) => ({ value: m.value, displayName: m.label, description: m.description })); },
      catalog: async () => { await openAcp(); return { agent: AGENT, models: catalog, current: { model, effort, account: logins.name } }; },
      setAccount: async () => {
        if (gate.busy) throw new Error("this chat is mid-turn — stop it or let it finish, and the login changes after that");
        return { account: logins.moveTo(String(cmd.account || "").trim()) };
      },
      context: async () => {
        if (!gate.busy && !turning) await quietPrompt("/usage").catch((e) => noteTrouble(`kimi did not report its usage: ${String(e?.message || e)}`));
        return contextUsage(ctx, model);
      },
      mcp: async () => {
        await openAcp();
        return mcpServers.map((s) => ({ name: s.name, status: "pending", error: "", tools: [], note: "kimi does not report per-server status over acp" }));
      },
      reinit: async () => {
        client?.close();
        client = null;
        return { fresh: "kimi acp was closed — the next message opens it again on the same conversation" };
      },
      mcpReconnect: async () => {
        client?.close();
        client = null;
        await openAcp();
        return mcpServers.map((s) => ({ name: s.name, status: "pending", error: "", tools: [] }));
      },
      compact: async () => {
        if (gate.busy || turning) throw new Error("wait for the turn to end, then ask again");
        emit({ type: "driver", subtype: "compact_asked", focus: cmd.focus || null, queued: false });
        await quietPrompt(cmd.focus ? `/compact ${cmd.focus}` : "/compact");
        emit({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual", pre_tokens: null, post_tokens: ctx.lastUsage?.total || null } });
        return { compacting: false, done: true };
      },
      setModel: async () => {
        if (gate.busy || turning) throw new Error("wait for the turn to end, then ask again");
        const wanted = String(cmd.model || "");
        const rpc = await openAcp();
        const result = await rpc.request("session/set_config_option", setModelParams(sessionId, wanted));
        takeConfig(result);
        model = currentModel(result?.configOptions) || wanted;
        persistSession({ model: model || null, model_id: model || null });
        emit({ type: "driver", subtype: "model_changed", model, label: catalog.find((m) => m.value === model)?.label || model || `${LABEL} default` });
        return { model, effort, models: catalog };
      },
      setEffort: async () => {
        if (gate.busy || turning) throw new Error("wait for the turn to end, then ask again");
        const rpc = await openAcp();
        const result = await changeEffort(rpc, String(cmd.level || ""));
        emit({ type: "driver", subtype: "effort_changed", level: effort });
        return result;
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
    if (!op) return reply({ ok: false, error: `${LABEL} seats do not support /${cmd.op}` });
    Promise.resolve().then(op).then(
      (data) => reply({ ok: true, data }),
      (err) => reply({ ok: false, error: String(err?.message || err) })
    );
    return;
  }
  return reply({ ok: false, error: `unknown command ${cmd.type}` });
}

const server = createSeatServer({ sockFile, shellEnvFile: shellEnvFileFor(base, name), handleCommand, emit, leave, store: sessionStore, flush: () => sessionStore.flush() });

emit({ type: "driver", subtype: "started", name, agent: AGENT, cwd, model: model || null, account: logins.name, base, resumed: sessionId || null, pid: process.pid });
emit(initEvent({ replayed: true }));

openAcp().catch((e) => emit({ type: "driver", subtype: "error", error: `kimi: ${String(e?.message || e)}` }));
const goingHome = setInterval(() => { logins.goHome().catch(() => {}); }, 60000);
goingHome.unref?.();

if (!arg("--resume-id") && !sessionStore.meta.turns_started && promptFile && existsSync(promptFile)) {
  const mission = (await readFile(promptFile, "utf8")).trim();
  const images = missionShots(promptFile);
  if (mission || images.length) {
    persistSession({ turns_started: true });
    emit(sayEvent(mission, images));
    dispatchSay(gate.push({ text: mission, images }));
  }
}

async function leave(reason, code) {
  if (leaving) return;
  leaving = true;
  emit({ type: "driver", subtype: "exit", reason });
  try { await interruptTurn(); } catch {}
  client?.close();
  await sessionStore.flush();
  await appendChain;
  server.close();
  await rm(sockFile, { force: true });
  process.exit(code);
}
process.on("SIGTERM", () => leave("sigterm", 0));
process.on("SIGINT", () => leave("sigint", 0));
