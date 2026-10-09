import { transferText, transferResult, transferEvent } from "./transfer-context.mjs";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { eventLine, lastSeq, compactLine, sayEvent, sayGate, queueMiss, seatTitle, staleInterrupt, peerSayText, seatPreamble, answerHold } from "./protocol.mjs";
import { parseCodexCatalog, autocompactTokens } from "./agents.mjs";
import { stateDir, sideOf, seatSockPath } from "./paths.mjs";
import { accountFailover } from "./failover.mjs";
import { accountDirFromEnv, providerEnv, providerEnvName, providerRanDry } from "./providers.mjs";
import { aBirthCarriesAMission, aFullPaneMustNeverWedgeTheSeat, arg, forgetWhatTheNameHeld, missionShots, tailOfFile, makeSessionStore, makeWarnOnce, makeEventsTrouble, createSeatServer, makeDirsTrail } from "./seat-core.mjs";
import { shellEnvFileFor } from "./shell-env.mjs";
import { createRpcClient } from "./rpc-stdio.mjs";
import { hasConversationEvents, replayCodexThread } from "./codex-history.mjs";
import { DEFAULT_PORT, ensureGateway, gatewayPaths, hubFor } from "../gateway/mcp-gateway.mjs";
import {
  SLASH_COMMANDS, EFFORT_LEVELS, appServerArgs, mcpStatusList, remoteMcpServers, codexConfigPath, codexStdioServers, codexServersToDisable, contextUsage, initializeParams, threadParams, resumeParams, turnParams, steerParams,
  newThreadContext, translate, questionFromRequest, answersForCodex, dismissalForCodex, stderrTrouble, serverRequestReply, itemDirs,
} from "./codex-app-server.mjs";

aFullPaneMustNeverWedgeTheSeat();

const AGENT = "codex";
const LABEL = "Codex";
const name = arg("--name");
if (!name || !/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
  console.error("usage: node codex-driver.mjs --name <seat> [--cwd <dir>] [--model <model>] [--prompt-file <path>] [--resume-id <thread>]");
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
let replayNeeded = !hasConversationEvents(await tailOfFile(eventsFile));
let appendChain = Promise.resolve();
const eventsTrouble = makeEventsTrouble(eventsFile);
function emit(event) {
  if (event.type === "user") event = transferEvent(event, sessionStore);
  if (event.type === "result") transferResult(event, sessionStore);
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
sessionId = arg("--resume-id") || sessionId;
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
  return { type: "system", subtype: "init", session_id: sessionId, model: model || "", effort, working: gate.busy, slash_commands: SLASH_COMMANDS, terminal_slash_commands: [], agent: AGENT, ...extra };
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
let ctx = newThreadContext();
let activeTurnId = "";
let awaited = null;
let silenceTimer = null;
let leaving = false;

const SILENCE_IS_A_WEDGE_MS = 180000;

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

function theServerWentMute() {
  silenceTimer = null;
  if (!awaited || leaving) return;
  awaited = null;
  noteTrouble("the app-server took the message and answered nothing for three minutes — closing this turn so the seat stops reading as busy; say it again to try once more");
  endTurn({ type: "result", subtype: "error", is_error: true, num_turns: 0, session_id: sessionId, result: "the app-server stopped answering" });
}

let interruptAskedAt = 0;

function endTurn(resultEvent) {
  activeTurnId = "";
  ctx = { ...newThreadContext(), lastUsage: ctx.lastUsage || null, contextWindow: ctx.contextWindow || 0 };
  if (resultEvent) emit(resultEvent);
  if (interruptAskedAt) {
    emit({ type: "driver", subtype: "interrupted", ms: Date.now() - interruptAskedAt });
    interruptAskedAt = 0;
  }
  const spent = resultEvent?.is_error ? providerRanDry(AGENT, resultEvent.result) : null;
  logins.turnEnded(spent).then((moved) => { if (!moved) dispatchSay(gate.turnEnded()); });
}

function onNotification(method, params, msg) {
  heardFromServer();
  if (method === "turn/started" && params.turn?.id) activeTurnId = params.turn.id;
  if (method === "item/started") dirsTrail.note(...itemDirs(params.item, cwd));
  const out = translate(msg, ctx, sessionId);
  const ended = out.find((e) => e.type === "result");
  for (const e of out) {
    if (e === ended) continue;
    emit(e);
  }
  if (ended) endTurn(ended);
}

async function onRequest(method, params) {
  heardFromServer();
  if (method === "item/tool/requestUserInput") return askTheDev(params);
  const reply = serverRequestReply(method, params);
  if (reply) return reply;
  throw new Error(`the seat does not answer ${method}`);
}

async function askTheDev(params) {
  const asked = questionFromRequest(params);
  const id = asked.id || `q-${seq + 1}`;
  emit({ type: "driver", subtype: "question", id, questions: asked.questions });
  const settled = await new Promise((resolve) => pendingQuestions.set(id, { resolve, questions: asked.questions }));
  if (settled?.dismissed) {
    emit({ type: "driver", subtype: "question_dismissed", id });
    return dismissalForCodex(asked.questions, settled.dismissed);
  }
  const filled = answersForCodex(asked.questions, settled.answers);
  if (filled.error) {
    emit({ type: "driver", subtype: "question_failed", id, error: filled.error });
    throw new Error(filled.error);
  }
  emit({ type: "driver", subtype: "question_answered", id });
  return filled;
}

function dismissQuestions(text) {
  const dropped = [...pendingQuestions.keys()];
  for (const id of dropped) {
    const held = pendingQuestions.get(id);
    pendingQuestions.delete(id);
    held.resolve({ dismissed: text });
  }
  return dropped;
}

function onExit(code, signal, said) {
  const wasOpen = !!client;
  client = null;
  opening = null;
  for (const [id, held] of pendingQuestions) {
    pendingQuestions.delete(id);
    held.resolve({ dismissed: "the app-server went away before this was answered" });
    emit({ type: "driver", subtype: "question_dismissed", id });
  }
  if (leaving || !wasOpen) return;
  noteTrouble(`the codex app-server went away (${said}) — the next message reopens the conversation`);
  if (gate.busy) endTurn({ type: "result", subtype: "error", is_error: true, num_turns: 0, session_id: sessionId, result: said });
}

function onStderr(line) {
  const trouble = stderrTrouble(line);
  if (trouble) noteTrouble(trouble);
}

const MCP_STATUS_TIMEOUT_MS = 120000;

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

function stdioServersTheGatewayServes() {
  if (!gatewayLink) return [];
  let toml = "";
  try { toml = readFileSync(codexConfigPath(childEnv), "utf8"); } catch { return []; }
  const { disabled, kept } = codexServersToDisable(codexStdioServers(toml), gatewayLink.servers);
  if (disabled.length) emit({ type: "driver", subtype: "mcp_routed", port: gatewayLink.port, servers: disabled, kept, how: "disabled" });
  return disabled;
}

async function openAppServer() {
  if (client?.alive) return client;
  if (opening) return opening;
  opening = (async () => {
    const child = spawn("codex", appServerArgs({ seat: name, base, gateway: gatewayLink, remote: remoteLink, disabled: stdioServersTheGatewayServes(), autocompact: autocompactAt }), { cwd, env: childEnv, stdio: ["pipe", "pipe", "pipe"] });
    const rpc = createRpcClient({ child, onNotification, onRequest, onExit, onStderr });
    try {
      await rpc.request("initialize", initializeParams());
      rpc.notify("initialized", {});
      const params = { cwd, model, preamble: seatPreamble(name, side) };
      let thread;
      if (sessionId) {
        thread = await rpc.request("thread/resume", resumeParams(sessionId, params));
        if (thread?.thread?.id !== sessionId) throw new Error("the app-server did not resume the requested conversation");
        if (replayNeeded) {
          const history = Array.isArray(thread.thread.turns) ? thread
            : await rpc.request("thread/read", { threadId: sessionId, includeTurns: true });
          for (const event of replayCodexThread(history.thread)) emit(event);
          replayNeeded = false;
        }
      } else {
        thread = await rpc.request("thread/start", threadParams(params));
        replayNeeded = false;
      }
      const opened = thread?.thread?.id || "";
      if (opened && opened !== sessionId) {
        sessionId = opened;
        persistSession({ session_id: sessionId });
      }
      if (!sessionId) throw new Error("the app-server opened no thread");
      if (!model && thread.model) model = thread.model;
      if (!effort && thread.reasoningEffort) effort = thread.reasoningEffort;
      persistSession({ model: model || null, model_id: model || null, effort });
      client = rpc;
      emit(initEvent());
      return rpc;
    } catch (e) {
      rpc.close();
      throw e;
    } finally {
      opening = null;
    }
  })();
  return opening;
}

function dispatchSay(item) {
  if (!item) return;
  if (!item.providerContext) item = { ...item, text: transferText(item.text, sessionStore), providerContext: true };
  lastSaid = item;
  if (item.cid) {
    gate.left(item.cid);
    emit({ type: "driver", subtype: "dispatched", cid: item.cid });
  }
  ctx = { ...newThreadContext(), lastUsage: ctx.lastUsage || null, contextWindow: ctx.contextWindow || 0 };
  watchForSilence(item);
  openAppServer()
    .then((rpc) => rpc.request("turn/start", turnParams({ threadId: sessionId, text: item.text, images: item.images, model, effort })))
    .then((turn) => { if (turn?.turn?.id) activeTurnId = turn.turn.id; })
    .catch((e) => {
      heardFromServer();
      emit({ type: "driver", subtype: "error", error: `codex: ${String(e?.message || e)}` });
      endTurn({ type: "result", subtype: "error", is_error: true, num_turns: 0, session_id: sessionId, result: String(e?.message || e) });
    });
}

function runCapture(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env: childEnv });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => reject(new Error(String(e?.message || e))));
    child.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(err.trim().split("\n").pop() || `${bin} exited with code ${code}`));
    });
    setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 20000).unref();
  });
}

let catalog = null;

async function loadCatalog(refresh) {
  if (refresh) catalog = null;
  if (catalog) return catalog;
  const rpc = await openAppServer();
  const all = [];
  let cursor = "";
  do {
    const page = await rpc.request("model/list", cursor ? { cursor } : {});
    all.push(...(page?.data || []));
    cursor = page?.nextCursor || "";
  } while (cursor);
  catalog = parseCodexCatalog(all);
  return catalog;
}

function modelRow(models, id) {
  return models.find((m) => m.value === id) || (id ? null : models.find((m) => m.isDefault)) || null;
}

function effortsFor(models, id) {
  return (modelRow(models, id)?.efforts || []).map((e) => e.value);
}

async function interruptTurn() {
  if (!client?.alive || !activeTurnId) return false;
  await client.request("turn/interrupt", { threadId: sessionId, turnId: activeTurnId }, { timeoutMs: 10000 });
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
    if (!client?.alive || !activeTurnId) {
      dispatchSay(item);
      emit({ type: "driver", subtype: "said_now", cid: item.cid });
      return reply({ ok: true });
    }
    client.request("turn/steer", steerParams({ threadId: sessionId, turnId: activeTurnId, text: item.text, images: item.images }), { timeoutMs: 10000 })
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
    const held = pendingQuestions.get(cmd.id);
    if (!held) return reply({ ok: false, error: `no pending question ${cmd.id}` });
    pendingQuestions.delete(cmd.id);
    held.resolve({ answers: cmd.answers });
    return reply({ ok: true });
  }
  if (cmd.type === "interrupt") {
    if (staleInterrupt(cmd)) {
      emit({ type: "driver", subtype: "stale_interrupt_dropped", waited_ms: Date.now() - cmd.sent });
      return reply({ ok: false, error: "this interrupt waited too long in the pipe and was dropped — press stop again if the turn still needs it" });
    }
    if (!gate.busy && !activeTurnId) return reply({ ok: false, error: "the seat was idle — there was no turn to stop" });
    interruptAskedAt = Date.now();
    interruptTurn()
      .then((sent) => {
        if (sent) return;
        interruptAskedAt = 0;
        if (gate.busy) endTurn({ type: "result", subtype: "interrupted", is_error: false, num_turns: 0, session_id: sessionId });
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
      context: () => contextUsage(ctx, model),
      mcp: async () => mcpStatusList(await (await openAppServer()).request("mcpServerStatus/list", {}, { timeoutMs: MCP_STATUS_TIMEOUT_MS })),
      reinit: async () => {
        client?.close();
        client = null;
        return { fresh: "the app-server was closed — the next message opens it again on the same conversation" };
      },
      mcpReconnect: async () => {
        client?.close();
        client = null;
        return mcpStatusList(await (await openAppServer()).request("mcpServerStatus/list", {}, { timeoutMs: MCP_STATUS_TIMEOUT_MS }));
      },
      compact: async () => {
        const rpc = await openAppServer();
        emit({ type: "driver", subtype: "compact_asked", focus: null, queued: gate.busy });
        await rpc.request("thread/compact/start", { threadId: sessionId });
        return { compacting: true };
      },
      setModel: async () => {
        model = String(cmd.model || "");
        const models = await loadCatalog().catch(() => []);
        const allowed = effortsFor(models, model);
        if (effort && models.length && !allowed.includes(effort)) {
          effort = modelRow(models, model)?.defaultEffort || "";
          emit({ type: "driver", subtype: "effort_changed", level: effort });
        }
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

const server = createSeatServer({ sockFile, shellEnvFile: shellEnvFileFor(base, name), handleCommand, emit, leave, store: sessionStore, flush: () => sessionStore.flush() });

emit({ type: "driver", subtype: "started", name, agent: AGENT, cwd, model: model || null, account: logins.name, base, resumed: sessionId || null, pid: process.pid });
emit(initEvent({ replayed: true }));

openAppServer().catch((e) => emit({ type: "driver", subtype: "error", error: `codex: ${String(e?.message || e)}` }));
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
