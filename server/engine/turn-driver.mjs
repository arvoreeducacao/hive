import { transferText, transferResult, transferEvent } from "./transfer-context.mjs";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { eventLine, lastSeq, compactLine, queueMiss, saidTrail, sayEvent, seatTitle, staleInterrupt, inlineImageMarks, peerSayText, seatPreamble, answerHold } from "./protocol.mjs";
import { agents, autocompactTokens, newTurnContext } from "./agents.mjs";
import { stateDir, sideOf, seatSockPath } from "./paths.mjs";
import { peerEntry } from "./peer-module.mjs";
import { accountFailover } from "./failover.mjs";
import { accountDirFromEnv, providerEnv, providerEnvName, providerRanDry } from "./providers.mjs";
import { aBirthCarriesAMission, aFullPaneMustNeverWedgeTheSeat, arg, forgetWhatTheNameHeld, missionShots, tailOfFile, makeSessionStore, makeWarnOnce, makeEventsTrouble, createSeatServer, makeDirsTrail, toolDirs } from "./seat-core.mjs";
import { DEFAULT_PORT, ensureGateway, gatewayPaths, hubFor } from "../gateway/mcp-gateway.mjs";
import { remoteMcpServers } from "./codex-app-server.mjs";

const PEER_MCP = peerEntry();

aFullPaneMustNeverWedgeTheSeat();

const agentName = arg("--agent");
const agent = agents[agentName];
const name = arg("--name");
if (!agent || !name || !/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
  console.error(`usage: node turn-driver.mjs --agent <${Object.keys(agents).join("|")}> --name <seat> [--cwd <dir>] [--model <model>] [--prompt-file <path>] [--resume-id <session>]`);
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

persistSession({ agent: agentName, cwd, model: model || null, model_id: model || null, ...(sessionId ? { session_id: sessionId } : {}) });
dirsTrail.note(cwd);

const queue = [];
const gone = saidTrail();
let current = null;
const expecting = answerHold({
  deliver: ({ from, text, images, side }) => {
    queue.push({ text: peerSayText(from, text, side), images, cid: null });
    pump();
  },
});
let preambleSaid = !!loadedMeta.preamble_said;

function hubServers(hub) {
  try { return Object.keys(JSON.parse(readFileSync(gatewayPaths(hub).servers, "utf8")).servers || {}); } catch { return []; }
}

const gateway = await ensureGateway({ hub: hubFor(cwd) }).catch((e) => ({ ok: false, reason: String(e?.message || e) }));
emit({ type: "driver", subtype: "mcp_gateway", ok: !!gateway.ok, started: !!gateway.started, replaced: gateway.replaced || null, port: gateway.port || null, reason: gateway.reason || null });
const gatewayLink = gateway.ok ? { port: gateway.port, servers: hubServers(hubFor(cwd)), hub: gateway.hub } : null;

function hubRemoteServers(hub) {
  try { return remoteMcpServers(readFileSync(join(hub, ".mcp.json"), "utf8"), gateway.port || DEFAULT_PORT); } catch { return []; }
}

function envForTurns(accountDir) {
  const inherited = { ...process.env };
  delete inherited[providerEnvName(agentName)];
  return { ...inherited, ...providerEnv(agentName, accountDir), ...(agent.turnEnv ? agent.turnEnv({ seat: name, base, peerMcp: PEER_MCP, gateway: gatewayLink, remote: hubRemoteServers(hubFor(cwd)) }) : {}) };
}

let turnEnv = envForTurns(accountDirFromEnv(agentName, process.env));
let lastTurn = null;
const logins = accountFailover({
  base,
  provider: agentName,
  bornIn: accountDirFromEnv(agentName, process.env),
  home: sessionStore.meta.home || "",
  emit: (event) => emit(event),
  persist: (patch) => persistSession(patch),
  apply: ({ dir }) => { turnEnv = envForTurns(dir); },
  redo: () => { if (!lastTurn) return false; queue.unshift(lastTurn); pump(); return true; },
  busy: () => !!current || queue.length > 0,
});
persistSession({ home: logins.home });
const goingHome = setInterval(() => { logins.goHome().catch(() => {}); }, 60000);
goingHome.unref?.();

if (autocompactAt) {
  emit({ type: "driver", subtype: "warning", message: `${agent.label} compacts its context by its own rules — the hive's ceiling of ${autocompactAt} tokens is noted, but this seat cannot be told to compact from outside` });
}

function withPreamble(text) {
  if (preambleSaid) return text;
  preambleSaid = true;
  persistSession({ preamble_said: true });
  return `${seatPreamble(name, side)}\n\n${text}`;
}

function pump() {
  if (current || !queue.length) return;
  runTurn(queue.shift());
}

const SLASH_COMMANDS = ["model", "effort", "mcp"];

function initEvent(extra = {}) {
  return { type: "system", subtype: "init", session_id: sessionId, model: model || "", effort, slash_commands: SLASH_COMMANDS, terminal_slash_commands: [], agent: agentName, ...extra };
}

function runTurn(turn) {
  if (!turn.providerContext) turn = { ...turn, text: transferText(turn.text, sessionStore), providerContext: true };
  const ctx = newTurnContext();
  ctx.sessionId = sessionId;
  if (turn.cid) {
    gone.left(turn.cid);
    emit({ type: "driver", subtype: "dispatched", cid: turn.cid });
  }
  const args = agent.turnArgs({ text: withPreamble(inlineImageMarks(turn.text, turn.images)), images: turn.images, model, effort, sessionId, seat: name, base });
  lastTurn = turn;
  const troubles = [];
  emit(initEvent());
  const child = spawn(agent.binary, args, { cwd, env: turnEnv, stdio: ["ignore", "pipe", "pipe"] });
  current = { child, startedAt: Date.now(), interrupted: false, killTimer: null };
  let buf = "";
  let errTail = "";
  child.stdout.on("data", (data) => {
    buf += data;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      const before = ctx.sessionId;
      for (const out of agent.translate(ev, ctx)) {
        emit(out);
        if (out.type === "driver" && out.subtype === "warning") troubles.push(out.message);
      }
      if (ctx.sessionId && ctx.sessionId !== before) {
        sessionId = ctx.sessionId;
        persistSession({ session_id: sessionId });
      }
    }
  });
  child.stderr.on("data", (data) => { errTail = (errTail + data).slice(-1500); });
  child.on("error", (e) => {
    emit({ type: "driver", subtype: "error", error: `${agent.binary}: ${String(e?.message || e)}` });
  });
  child.on("close", (code) => {
    if (current?.killTimer) clearTimeout(current.killTimer);
    const interrupted = current?.interrupted;
    current = null;
    let spent = null;
    if (code !== 0 && !interrupted) {
      const said = errTail.trim().split("\n").pop() || `${agent.binary} exited with code ${code}`;
      emit({ type: "driver", subtype: "warning", message: said.slice(0, 400) });
      spent = providerRanDry(agentName, [errTail.trim(), ...troubles].join("\n"));
    }
    logins.turnEnded(spent).then((moved) => {
      if (moved) return;
      emit({
        type: "result",
        subtype: interrupted ? "interrupted" : code === 0 ? "success" : "error",
        is_error: !interrupted && code !== 0,
        num_turns: 1,
        total_cost_usd: ctx.cost,
        usage: ctx.usage,
        session_id: sessionId,
      });
      pump();
    });
  });
}

function interrupt(reply) {
  if (!current) {
    queue.length = 0;
    emit({ type: "driver", subtype: "interrupted", ms: 0 });
    return reply({ ok: true });
  }
  const started = Date.now();
  current.interrupted = true;
  current.child.kill("SIGTERM");
  current.killTimer = setTimeout(() => { try { current?.child.kill("SIGKILL"); } catch {} }, 4000);
  current.child.once("close", () => emit({ type: "driver", subtype: "interrupted", ms: Date.now() - started }));
  return reply({ ok: true });
}

function runRpc(bin, args, use) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env: turnEnv, stdio: ["pipe", "pipe", "pipe"] });
    const waiting = new Map();
    let nextId = 0, out = "", err = "";
    const call = (method, params) => new Promise((ok, no) => {
      const id = ++nextId;
      waiting.set(id, { ok, no });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params: params || {} }) + "\n");
    });
    child.stdout.on("data", (d) => {
      out += d;
      let nl;
      while ((nl = out.indexOf("\n")) >= 0) {
        const line = out.slice(0, nl).trim();
        out = out.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        const seat = waiting.get(msg.id);
        if (!seat) continue;
        waiting.delete(msg.id);
        if (msg.error) seat.no(new Error(msg.error.message || `${bin} refused the request`));
        else seat.ok(msg.result);
      }
    });
    child.stderr.on("data", (d) => { err = (err + d).slice(-1500); });
    const stop = () => { try { child.kill("SIGKILL"); } catch {} };
    child.on("error", (e) => { stop(); reject(new Error(String(e?.message || e))); });
    child.on("close", (code) => {
      const said = err.trim().split("\n").pop() || `${bin} exited with code ${code}`;
      for (const seat of waiting.values()) seat.no(new Error(said));
      waiting.clear();
    });
    const guard = setTimeout(stop, 25000);
    guard.unref?.();
    Promise.resolve().then(() => use(call)).then(
      (data) => { clearTimeout(guard); stop(); resolve(data); },
      (e) => { clearTimeout(guard); stop(); reject(e); }
    );
  });
}

function runCapture(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env: turnEnv });
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
  if (!catalog) catalog = await agent.listCatalog({ run: runCapture, rpc: runRpc });
  return catalog;
}

function modelRow(models, id) {
  return models.find((m) => m.value === id) || (id ? null : models.find((m) => m.isDefault)) || null;
}

function effortsFor(models, id) {
  return (modelRow(models, id)?.efforts || []).map((e) => e.value);
}

function handleCommand(cmd, reply) {
  if (cmd.type === "say") {
    const images = Array.isArray(cmd.images) ? cmd.images.filter((p) => typeof p === "string") : [];
    const text = String(cmd.text || "").trim();
    if (!text && !images.length) return reply({ ok: false, error: "say needs text" });
    const said = text || "(image)";
    const from = typeof cmd.from === "string" && cmd.from.trim() ? cmd.from.trim() : null;
    if (expecting.take(from, { text: said, images, side: cmd.side })) {
      emit(sayEvent(said, images, cmd.cid, from, true));
      return reply({ ok: true, consumed: true });
    }
    emit(sayEvent(said, images, cmd.cid, from));
    queue.push({ text: from ? peerSayText(from, said, cmd.side) : said, images, cid: cmd.cid || null });
    const queued = !!current;
    pump();
    return reply({ ok: true, queued });
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
    const i = queue.findIndex((t) => cmd.target && t.cid === cmd.target);
    if (i < 0) return reply(queueMiss(gone, cmd.target));
    const [item] = queue.splice(i, 1);
    emit({ type: "driver", subtype: "unsaid", cid: item.cid });
    return reply({ ok: true });
  }
  if (cmd.type === "saynow") {
    return reply({ ok: false, error: `${agent.label} runs one process per turn — a queued message cannot enter a turn that is already running` });
  }
  if (cmd.type === "answer") return reply({ ok: false, error: `${agent.label} seats have no questions to answer` });
  if (cmd.type === "interrupt") {
    if (staleInterrupt(cmd)) {
      emit({ type: "driver", subtype: "stale_interrupt_dropped", waited_ms: Date.now() - cmd.sent });
      return reply({ ok: false, error: "this interrupt waited too long in the pipe and was dropped — press stop again if the turn still needs it" });
    }
    return interrupt(reply);
  }
  if (cmd.type === "state") {
    return reply({ ok: true, name, side, agent: agentName, model, effort, session_id: sessionId, seq, questions: [], queued: queue.length, working: !!current, expecting: expecting.waitingOn(), events_write_failed: eventsTrouble.broken });
  }
  if (cmd.type === "control") {
    const ops = {
      models: () => agent.listModels(runCapture, { rpc: runRpc }),
      catalog: async () => ({
        agent: agentName,
        models: await loadCatalog(cmd.refresh),
        current: { model, effort, account: logins.name },
      }),
      setAccount: async () => {
        if (current || queue.length) throw new Error("this chat is mid-turn — stop it or let it finish, and the login changes after that");
        return { account: logins.moveTo(String(cmd.account || "").trim()) };
      },
      mcp: () => agent.listMcp(runCapture),
      reinit: async () => ({ fresh: "every turn starts a fresh process — new credentials apply on the next turn" }),
      mcpReconnect: async () => ({ fresh: "every turn starts a fresh process — the server answers on the next turn" }),
      setModel: async () => {
        model = String(cmd.model || "");
        const models = await loadCatalog().catch(() => []);
        const allowed = effortsFor(models, model);
        /* a model with no levels at all must drop the level too, or the next turn
           carries a --variant the model never offered. Only enforce once the
           catalogue is actually known. */
        if (effort && models.length && !allowed.includes(effort)) {
          effort = modelRow(models, model)?.defaultEffort || "";
          emit({ type: "driver", subtype: "effort_changed", level: effort });
        }
        persistSession({ model: model || null, model_id: model || null, effort });
        emit({ type: "driver", subtype: "model_changed", model, label: model || `${agent.label} default` });
        return { model, effort };
      },
      setEffort: async () => {
        const level = String(cmd.level || "");
        const models = await loadCatalog().catch(() => []);
        const allowed = effortsFor(models, model);
        if (allowed.length) {
          if (!allowed.includes(level)) throw new Error(`this model takes ${allowed.join(", ")}`);
        } else if (!agent.effortLevels.includes(level)) {
          throw new Error(`effort must be one of ${agent.effortLevels.join(", ")}`);
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
    if (!op) return reply({ ok: false, error: `${agent.label} seats do not support /${cmd.op === "mcp" ? "mcp" : cmd.op}` });
    Promise.resolve().then(op).then(
      (data) => reply({ ok: true, data }),
      (err) => reply({ ok: false, error: String(err?.message || err) })
    );
    return;
  }
  return reply({ ok: false, error: `unknown command ${cmd.type}` });
}

const server = createSeatServer({ sockFile, handleCommand, emit, leave, store: sessionStore, flush: () => sessionStore.flush() });

emit({ type: "driver", subtype: "started", name, agent: agentName, cwd, model: model || null, account: logins.name, base, side, resumed: sessionId || null, pid: process.pid });
emit(initEvent({ replayed: true }));

if (!arg("--resume-id") && !sessionStore.meta.turns_started && promptFile && existsSync(promptFile)) {
  const mission = (await readFile(promptFile, "utf8")).trim();
  const images = missionShots(promptFile);
  if (mission || images.length) {
    persistSession({ turns_started: true });
    emit(sayEvent(mission, images));
    queue.push({ text: mission, images });
    pump();
  }
}

let leaving = false;
async function leave(reason, code) {
  if (leaving) return;
  leaving = true;
  emit({ type: "driver", subtype: "exit", reason });
  if (current) { current.interrupted = true; try { current.child.kill("SIGTERM"); } catch {} }
  await sessionStore.flush();
  await appendChain;
  server.close();
  await rm(sockFile, { force: true });
  process.exit(code);
}
process.on("SIGTERM", () => leave("sigterm", 0));
process.on("SIGINT", () => leave("sigint", 0));
