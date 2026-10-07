import { transferText, transferResult, transferEvent } from "./transfer-context.mjs";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { eventLine, lastSeq, compactLine, sayEvent, sayGate, queueMiss, seatTitle, staleInterrupt, peerSayText, seatPreamble, answerHold } from "./protocol.mjs";
import { agents, autocompactTokens } from "./agents.mjs";
import { stateDir, sideOf, seatSockPath } from "./paths.mjs";
import { accountFailover } from "./failover.mjs";
import { accountDirFromEnv, providerEnv, providerEnvName, providerRanDry } from "./providers.mjs";
import { aBirthCarriesAMission, aFullPaneMustNeverWedgeTheSeat, arg, forgetWhatTheNameHeld, missionShots, tailOfFile, makeSessionStore, makeWarnOnce, makeEventsTrouble, createSeatServer, makeDirsTrail, toolDirs } from "./seat-core.mjs";
import { DEFAULT_PORT, ensureGateway, gatewayPaths, hubFor } from "../gateway/mcp-gateway.mjs";
import { remoteMcpServers } from "./codex-app-server.mjs";
import {
  SLASH_COMMANDS, serveArgs, serveEnv, listeningUrl, newPassword, basicAuth, sessionParams, promptParams, newMessageId, summarizeParams,
  newSessionContext, carryOver, translate, historyEvents, contextUsage, questionFromEvent, answersForOpencode, dismissalForOpencode, catalogFromProviders, mcpStatusList, sessionFellThrough,
} from "./opencode-server.mjs";

aFullPaneMustNeverWedgeTheSeat();

const AGENT = "opencode";
const LABEL = "OpenCode";
const EFFORT_LEVELS = agents.opencode.effortLevels;
const name = arg("--name");
if (!name || !/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
  console.error("usage: node opencode-driver.mjs --name <seat> [--cwd <dir>] [--model <provider/model>] [--prompt-file <path>] [--resume-id <session>] [--autocompact <k>]");
  process.exit(2);
}

const base = stateDir();
const side = sideOf(base);
const cwd = arg("--cwd", process.cwd());
const promptFile = arg("--prompt-file");
const autocompactAt = autocompactTokens(arg("--autocompact"));
let model = arg("--model");
let effort = "";

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
const freshEventsFile = seq === 0;
let appendChain = Promise.resolve();
const eventsTrouble = makeEventsTrouble(eventsFile);
function emit(event) {
  if (event.type === "user") event = transferEvent(event, sessionStore);
  if (event.type === "result") transferResult(event, sessionStore);
  if (event.type === "assistant") dirsTrail.note(...toolDirs(event, cwd));
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
if (loadedMeta.effort) effort = loadedMeta.effort;

const sessionTrouble = makeWarnOnce((message) => emit({ type: "driver", subtype: "warning", message }));
const sessionStore = makeSessionStore(sessionFile, loadedMeta, (e) => sessionTrouble(`the session file stopped taking writes — a restart would lose this conversation: ${String(e?.message || e)}`));
const persistSession = sessionStore.persist;
const dirsTrail = makeDirsTrail(loadedMeta.dirs, persistSession);

persistSession({ agent: AGENT, cwd, model: model || null, model_id: model || null, ...(sessionId ? { session_id: sessionId } : {}) });
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
  busy: () => gate.busy || gate.queued || pendingQuestions.size > 0,
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
  return { type: "system", subtype: "init", session_id: sessionId, model: model || "", effort, slash_commands: SLASH_COMMANDS, terminal_slash_commands: [], agent: AGENT, ...extra };
}

const gate = sayGate();
const expecting = answerHold({
  deliver: ({ from, text, images, side }) => {
    const item = gate.push({ text: peerSayText(from, text, side), images, cid: null });
    if (item) dispatchSay(item);
  },
});
const pendingQuestions = new Map();
let client = null;
let opening = null;
let ctx = newSessionContext();
let awaited = null;
let silenceTimer = null;
let leaving = false;
let preambleSaid = !!loadedMeta.preamble_said;

const SERVE_START_MS = 30000;
const SILENCE_IS_A_WEDGE_MS = 300000;
const STREAM_RETRY_MS = 1000;

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
  silenceTimer = setTimeout(theServerWentMute, SILENCE_IS_A_WEDGE_MS);
  silenceTimer.unref?.();
}

async function theServerWentMute() {
  silenceTimer = null;
  if (!awaited || leaving) return;
  if (client?.alive && await stillBusy(client)) {
    watchForSilence(awaited);
    return;
  }
  awaited = null;
  noteTrouble("opencode took the message and answered nothing for five minutes — closing this turn so the seat stops reading as busy; say it again to try once more");
  endTurn({ type: "result", subtype: "error", is_error: true, num_turns: 0, session_id: sessionId, result: "opencode stopped answering" });
}

let interruptAskedAt = 0;

function endTurn(resultEvent) {
  ctx = carryOver(ctx);
  heardFromServer();
  if (resultEvent) emit(resultEvent);
  if (interruptAskedAt) {
    emit({ type: "driver", subtype: "interrupted", ms: Date.now() - interruptAskedAt });
    interruptAskedAt = 0;
  }
  const spent = resultEvent?.is_error ? providerRanDry(AGENT, resultEvent.result) : null;
  logins.turnEnded(spent).then((moved) => {
    if (moved) return;
    const next = gate.turnEnded();
    if (next) return dispatchSay(next);
    if (resultEvent?.subtype === "success") compactAtTheCeiling();
  });
}

function withPreamble(text) {
  if (preambleSaid) return text;
  preambleSaid = true;
  persistSession({ preamble_said: true });
  return `${seatPreamble(name, side)}\n\n${text}`;
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function api(held, path, { method = "GET", body, timeoutMs = 20000 } = {}) {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetch(held.url + path, {
      method,
      headers: { authorization: held.auth, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: control.signal,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) {
      const said = data && typeof data === "object" ? data.data?.message || data.message || data.error : "";
      const error = new Error(said || `${method} ${path} answered ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function makeClient({ child, url, password }) {
  const held = {
    child, url, auth: basicAuth(password), alive: true, stream: null,
    close() {
      held.alive = false;
      held.stream?.abort();
      held.stream = null;
      try { child.kill("SIGTERM"); } catch {}
      const hard = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 1500);
      hard.unref?.();
    },
  };
  return held;
}

async function stillBusy(held) {
  try {
    const status = await api(held, "/session/status", { timeoutMs: 5000 });
    return status?.[sessionId]?.type === "busy";
  } catch {
    return false;
  }
}

async function openSession(held) {
  if (sessionId) {
    try {
      const got = await api(held, `/session/${encodeURIComponent(sessionId)}`);
      if (got?.id) return true;
    } catch (e) {
      if (!sessionFellThrough(e?.status)) throw e;
      noteTrouble(`there is no conversation stored under ${sessionId} to pick up, so this seat starts one`);
      sessionId = "";
    }
  }
  const made = await api(held, "/session", { method: "POST", body: sessionParams({ title: sessionStore.meta.title || "" }) });
  if (!made?.id) throw new Error("opencode opened no session");
  sessionId = made.id;
  persistSession({ session_id: sessionId });
  return false;
}

let historyPainted = false;

async function paintHistory(held) {
  historyPainted = true;
  let messages = [];
  try {
    messages = await api(held, `/session/${encodeURIComponent(sessionId)}/message`, { timeoutMs: 60000 });
  } catch (e) {
    noteTrouble(`the conversation came back without its history on screen — opencode did not hand it over: ${String(e?.message || e)}`);
    return;
  }
  ctx.replaying = true;
  try {
    const painted = historyEvents(messages, ctx, { preamble: seatPreamble(name, side) });
    for (const e of painted) emit({ ...e, replayed: true });
    const total = Array.isArray(messages) ? messages.length : 0;
    emit({ type: "driver", subtype: "replayed", session_id: sessionId, count: total, total });
  } finally {
    ctx.replaying = false;
  }
}

function onServerExit(held, code, signal, tail) {
  const wasOpen = client === held;
  held.alive = false;
  held.stream?.abort();
  if (client === held) client = null;
  if (leaving || !wasOpen) return;
  for (const [id, waiting] of pendingQuestions) {
    pendingQuestions.delete(id);
    waiting.resolve({ dismissed: "opencode went away before this was answered" });
    emit({ type: "driver", subtype: "question_dismissed", id });
  }
  const said = String(tail || "").trim().split("\n").pop() || `exit ${code ?? signal}`;
  noteTrouble(`opencode serve went away (${said.slice(0, 200)}) — the next message reopens the conversation`);
  if (gate.busy) endTurn({ type: "result", subtype: "error", is_error: true, num_turns: 0, session_id: sessionId, result: said });
}

async function openServer() {
  if (client?.alive) return client;
  if (opening) return opening;
  opening = (async () => {
    const port = await freePort();
    const password = newPassword();
    const env = { ...childEnv, ...serveEnv({ seat: name, base, gateway: gatewayLink, remote: remoteLink, password, env: childEnv }) };
    const child = spawn("opencode", serveArgs({ port }), { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    let seen = "";
    let tail = "";
    const held = makeClient({ child, url: "", password });
    child.on("exit", (code, signal) => onServerExit(held, code, signal, tail));
    child.stdout.on("data", (d) => { seen += d; tail = (tail + d).slice(-2000); });
    child.stderr.on("data", (d) => { seen += d; tail = (tail + d).slice(-2000); });
    try {
      held.url = await new Promise((resolve, reject) => {
        const look = () => { const url = listeningUrl(seen); if (url) resolve(url); };
        look();
        child.stdout.on("data", look);
        child.stderr.on("data", look);
        child.on("error", (e) => reject(new Error(`opencode: ${String(e?.message || e)}`)));
        child.on("exit", (code, signal) => reject(new Error(`opencode serve left before listening (${code ?? signal}): ${tail.trim().split("\n").pop() || ""}`)));
        setTimeout(() => reject(new Error("opencode serve did not start listening within 30s")), SERVE_START_MS).unref();
      });
      await api(held, "/global/health", { timeoutMs: 10000 });
      const pickedUp = await openSession(held);
      if (pickedUp && freshEventsFile && !historyPainted) await paintHistory(held);
      client = held;
      startStream(held);
      loadCatalog().catch(() => {});
      return held;
    } catch (e) {
      held.close();
      throw e;
    } finally {
      opening = null;
    }
  })();
  return opening;
}

function startStream(held) {
  const control = new AbortController();
  held.stream = control;
  (async () => {
    let first = true;
    while (held.alive && !leaving && held.stream === control) {
      try {
        const response = await fetch(`${held.url}/event`, { headers: { authorization: held.auth }, signal: control.signal });
        if (!response.ok || !response.body) throw new Error(`the event stream answered ${response.status}`);
        if (!first) reconcileAfterReconnect(held);
        first = false;
        await readEvents(response.body, control.signal);
      } catch {
        if (control.signal.aborted) return;
      }
      if (control.signal.aborted || !held.alive || leaving) return;
      await sleep(STREAM_RETRY_MS);
    }
  })();
}

async function readEvents(body, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done || signal.aborted) return;
    buf += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const line = chunk.split("\n").find((one) => one.startsWith("data:"));
      if (!line) continue;
      let event;
      try { event = JSON.parse(line.slice(5)); } catch { continue; }
      onEvent(event);
    }
  }
}

async function reconcileAfterReconnect(held) {
  if (!gate.busy) return;
  if (await stillBusy(held)) return;
  noteTrouble("the event stream came back with the turn already over — closing it");
  endTurn({ type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: ctx.cost, usage: { ...ctx.usage }, session_id: sessionId });
}

function onEvent(event) {
  const type = event?.type;
  const p = event?.properties || {};
  if (!type || type === "server.heartbeat") return;
  if (p.sessionID === sessionId || type === "question.asked" || type === "permission.asked") heardFromServer();
  if (type === "question.asked") return void askTheDev(p);
  if (type === "question.replied" || type === "question.rejected") return settledElsewhere(p.requestID);
  if (type === "permission.asked") return void allowAnyway(p);
  const out = translate(event, ctx, sessionId);
  const ended = out.find((e) => e.type === "result");
  for (const e of out) {
    if (e === ended) continue;
    emit(e);
  }
  if (ended && gate.busy) endTurn(ended);
  if (type === "session.status" && p.sessionID === sessionId && p.status?.type === "busy" && gate.busy) watchForSilence(awaited || lastSaid);
}

function allowAnyway(p) {
  if (!client?.alive || !p.id) return;
  api(client, `/permission/${encodeURIComponent(p.id)}/reply`, { method: "POST", body: { reply: "once" } }).catch((e) => noteTrouble(`opencode asked for ${p.permission || "a permission"} and the seat could not answer it: ${String(e?.message || e)}`));
}

function settledElsewhere(id) {
  const waiting = pendingQuestions.get(id);
  if (!waiting) return;
  pendingQuestions.delete(id);
  waiting.resolve({ elsewhere: true });
  emit({ type: "driver", subtype: "question_answered", id });
}

async function askTheDev(p) {
  const asked = questionFromEvent(p);
  const id = asked.id || `q-${seq + 1}`;
  emit({ type: "driver", subtype: "question", id, questions: asked.questions });
  const settled = await new Promise((resolve) => pendingQuestions.set(id, { resolve, questions: asked.questions }));
  if (settled?.elsewhere || !client?.alive) return;
  if (settled?.dismissed) {
    emit({ type: "driver", subtype: "question_dismissed", id });
    await api(client, `/question/${encodeURIComponent(id)}/reply`, { method: "POST", body: dismissalForOpencode(asked.questions, settled.dismissed) }).catch((e) => noteTrouble(`the dismissal did not reach opencode: ${String(e?.message || e)}`));
    return;
  }
  const filled = answersForOpencode(asked.questions, settled.answers);
  if (filled.error) {
    emit({ type: "driver", subtype: "question_failed", id, error: filled.error });
    await api(client, `/question/${encodeURIComponent(id)}/reject`, { method: "POST" }).catch(() => {});
    return;
  }
  try {
    await api(client, `/question/${encodeURIComponent(id)}/reply`, { method: "POST", body: filled });
    emit({ type: "driver", subtype: "question_answered", id });
  } catch (e) {
    emit({ type: "driver", subtype: "question_failed", id, error: String(e?.message || e) });
  }
}

function dismissQuestions(text) {
  const dropped = [...pendingQuestions.keys()];
  for (const id of dropped) {
    const waiting = pendingQuestions.get(id);
    pendingQuestions.delete(id);
    waiting.resolve({ dismissed: text });
  }
  return dropped;
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
  ctx.turnActive = true;
  watchForSilence(item);
  openServer()
    .then((held) => {
      emit(initEvent());
      return api(held, `/session/${encodeURIComponent(sessionId)}/prompt_async`, { method: "POST", body: promptParams({ messageID: newMessageId(), text: withPreamble(item.text), images: item.images, model, effort }) });
    })
    .catch((e) => {
      emit({ type: "driver", subtype: "error", error: `opencode: ${String(e?.message || e)}` });
      endTurn({ type: "result", subtype: "error", is_error: true, num_turns: 0, session_id: sessionId, result: String(e?.message || e) });
    });
}

let catalog = null;

async function loadCatalog(refresh) {
  if (refresh) catalog = null;
  if (catalog) return catalog;
  const held = await openServer();
  catalog = catalogFromProviders(await api(held, "/provider"));
  rememberContextWindow();
  return catalog;
}

function modelRow(models, id) {
  return models.find((m) => m.value === id) || (id ? null : models.find((m) => m.isDefault)) || null;
}

function effortsFor(models, id) {
  return (modelRow(models, id)?.efforts || []).map((e) => e.value);
}

function rememberContextWindow() {
  const row = modelRow(catalog || [], model);
  if (row?.contextTokens) ctx.contextWindow = row.contextTokens;
}

function chosenModel() {
  return model || modelRow(catalog || [], "")?.value || "";
}

async function compactNow(why) {
  const held = await openServer();
  await loadCatalog().catch(() => {});
  const params = summarizeParams(chosenModel());
  if (!params) throw new Error("no model to compact with — pick one with /model first");
  emit({ type: "driver", subtype: "compact_asked", focus: null, queued: gate.busy, why });
  await api(held, `/session/${encodeURIComponent(sessionId)}/summarize`, { method: "POST", body: params, timeoutMs: 600000 });
  return { compacting: true };
}

function compactAtTheCeiling() {
  if (!autocompactAt || !ctx.contextTokens || ctx.contextTokens < autocompactAt || gate.busy) return;
  compactNow("ceiling").catch((e) => noteTrouble(`the context passed the hive's ceiling of ${autocompactAt} tokens and opencode did not compact: ${String(e?.message || e)}`));
}

async function interruptTurn() {
  if (!client?.alive || !gate.busy) return false;
  await api(client, `/session/${encodeURIComponent(sessionId)}/abort`, { method: "POST", timeoutMs: 10000 });
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
    if (!client?.alive || !gate.busy) {
      dispatchSay(item);
      emit({ type: "driver", subtype: "said_now", cid: item.cid });
      return reply({ ok: true });
    }
    api(client, `/session/${encodeURIComponent(sessionId)}/prompt_async`, { method: "POST", body: promptParams({ messageID: newMessageId(), text: item.text, images: item.images, model, effort }) })
      .then(() => {
        if (item.cid) {
          gate.left(item.cid);
          emit({ type: "driver", subtype: "dispatched", cid: item.cid });
        }
        emit({ type: "driver", subtype: "said_now", cid: item.cid });
        reply({ ok: true });
      })
      .catch((e) => {
        gate.push(item);
        reply({ ok: false, error: `the turn did not take the message: ${String(e?.message || e)}` });
      });
    return;
  }
  if (cmd.type === "answer") {
    const waiting = pendingQuestions.get(cmd.id);
    if (!waiting) return reply({ ok: false, error: `no pending question ${cmd.id}` });
    pendingQuestions.delete(cmd.id);
    waiting.resolve({ answers: cmd.answers });
    return reply({ ok: true });
  }
  if (cmd.type === "interrupt") {
    if (staleInterrupt(cmd)) {
      emit({ type: "driver", subtype: "stale_interrupt_dropped", waited_ms: Date.now() - cmd.sent });
      return reply({ ok: false, error: "this interrupt waited too long in the pipe and was dropped — press stop again if the turn still needs it" });
    }
    if (!gate.busy) return reply({ ok: false, error: "the seat was idle — there was no turn to stop" });
    interruptAskedAt = Date.now();
    interruptTurn()
      .then((sent) => {
        if (sent) return;
        interruptAskedAt = 0;
        endTurn({ type: "result", subtype: "interrupted", is_error: false, num_turns: 0, session_id: sessionId });
        emit({ type: "driver", subtype: "interrupted", ms: 0 });
      })
      .catch((e) => {
        interruptAskedAt = 0;
        emit({ type: "driver", subtype: "interrupt_failed", error: String(e?.message || e) });
      });
    return reply({ ok: true });
  }
  if (cmd.type === "state") {
    return reply({ ok: true, name, side, agent: AGENT, model, effort, session_id: sessionId, seq, questions: [...pendingQuestions.keys()], queued: gate.queued, working: gate.busy, expecting: expecting.waitingOn(), events_write_failed: eventsTrouble.broken });
  }
  if (cmd.type === "control") {
    const ops = {
      models: async () => (await loadCatalog()).map((m) => ({ value: m.value, displayName: m.label, description: m.description })),
      catalog: async () => ({ agent: AGENT, models: await loadCatalog(cmd.refresh), current: { model, effort, account: logins.name } }),
      setAccount: async () => {
        if (gate.busy) throw new Error("this chat is mid-turn — stop it or let it finish, and the login changes after that");
        return { account: logins.moveTo(String(cmd.account || "").trim()) };
      },
      context: () => contextUsage(ctx, chosenModel()),
      mcp: async () => mcpStatusList(await api(await openServer(), "/mcp", { timeoutMs: 60000 })),
      reinit: async () => {
        client?.close();
        client = null;
        return { fresh: "opencode was closed — the next message opens it again on the same conversation" };
      },
      mcpReconnect: async () => {
        client?.close();
        client = null;
        return mcpStatusList(await api(await openServer(), "/mcp", { timeoutMs: 60000 }));
      },
      compact: () => compactNow("asked"),
      setModel: async () => {
        model = String(cmd.model || "");
        const models = await loadCatalog().catch(() => []);
        const allowed = effortsFor(models, model);
        if (effort && models.length && !allowed.includes(effort)) {
          effort = modelRow(models, model)?.defaultEffort || "";
          emit({ type: "driver", subtype: "effort_changed", level: effort });
        }
        rememberContextWindow();
        persistSession({ model: model || null, model_id: model || null, effort });
        emit({ type: "driver", subtype: "model_changed", model, label: model || `${LABEL} default` });
        return { model, effort };
      },
      setEffort: async () => {
        const level = String(cmd.level || "");
        const models = await loadCatalog().catch(() => []);
        const allowed = effortsFor(models, model);
        if (allowed.length) {
          if (!allowed.includes(level)) throw new Error(`this model takes ${allowed.join(", ")}`);
        } else if (!EFFORT_LEVELS.includes(level)) {
          throw new Error(`effort must be one of ${EFFORT_LEVELS.join(", ")}`);
        }
        effort = level;
        persistSession({ effort });
        emit({ type: "driver", subtype: "effort_changed", level: effort });
        return { level: effort };
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

const server = createSeatServer({ sockFile, handleCommand, emit, leave, store: sessionStore, flush: () => sessionStore.flush() });

emit({ type: "driver", subtype: "started", name, agent: AGENT, cwd, model: model || null, account: logins.name, base, side, resumed: sessionId || null, pid: process.pid });
emit(initEvent({ replayed: true }));

openServer().catch((e) => emit({ type: "driver", subtype: "error", error: `opencode: ${String(e?.message || e)}` }));
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
