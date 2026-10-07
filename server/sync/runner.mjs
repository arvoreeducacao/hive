import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sayWithShot } from "../shot.mjs";

export const POLL_MS = 1000;
export const FLEET_MS = 5000;
export const FIRST_BYTES = 2 * 1024 * 1024;
export const FIRST_TURNS = 8;
export const FIRST_EVENTS = 400;
export const TEXT_CEILING = 6000;
export const SHOT_CEILING = 4 * 1024 * 1024;
export const INTENT_FRESH_MS = 10 * 60 * 1000;
export const MISSION_CEILING = 20000;
export const SHOT_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
export const NOTE_SUBTYPES = new Set(["todo", "interrupted", "exit", "error", "warning", "started", "slept", "woke", "model_changed", "effort_changed", "account_changed", "windowed", "rewound"]);
export const REPLY_CEILING = 120 * 1024;
export const NOTICE_CEILING = 140;
export const CONTROL_OPS = new Set(["catalog", "setModel", "setEffort", "setAccount", "models"]);

const cut = (text, ceiling = TEXT_CEILING) => {
  const one = String(text ?? "");
  return one.length > ceiling ? `${one.slice(0, ceiling - 1)}…` : one;
};

const tail = (path) => String(path ?? "").split("/").filter(Boolean).slice(-2).join("/");

const oneLine = (text) => cut(String(text ?? "").replace(/\s+/g, " ").trim(), NOTICE_CEILING);

export function targetOf(name, input = {}) {
  if (name === "Bash") return cut(String(input.description || input.command || "").replace(/\s+/g, " "), 120);
  if (["Read", "Write", "Edit", "NotebookEdit"].includes(name)) return tail(input.file_path || input.notebook_path);
  if (name === "Grep" || name === "Glob") return cut(input.pattern, 80);
  if (name === "Agent" || name === "Task") return cut(input.description, 80);
  if (name === "Skill") return cut(input.skill, 40);
  return cut(input.path || input.file_path || input.query || input.url || input.prompt || "", 80);
}

const blocksOf = (event) => {
  const content = event?.message?.content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? content : [];
};

export function slim(event) {
  if (!event || typeof event !== "object" || event.hive_ping || event.type === "stream_event") return [];
  const head = { hiveSeq: Number(event.seq) || 0, ts: event.ts || "" };
  if (event.type === "system" && event.subtype === "init") {
    const gone = new Set(Array.isArray(event.terminal_slash_commands) ? event.terminal_slash_commands : []);
    const slash = (Array.isArray(event.slash_commands) ? event.slash_commands : []).map((one) => (typeof one === "string" ? one : one?.name)).filter((one) => typeof one === "string" && one && !gone.has(one)).slice(0, 80);
    return [{ ...head, type: "system", model: cut(event.model, 60), ...(event.agent ? { agent: cut(event.agent, 24) } : {}), ...(event.effort ? { effort: cut(event.effort, 24) } : {}), ...(slash.length ? { slash } : {}) }];
  }
  if (event.type === "result") return [{ ...head, type: "result", cost: Number(event.total_cost_usd) || 0, turns: Number(event.num_turns) || 0, error: event.is_error ? cut(event.result, 300) : "" }];
  if (event.type === "driver") {
    if (event.subtype === "question") {
      return [{ ...head, type: "question", id: event.id, questions: (event.questions || []).slice(0, 4).map((q) => ({ question: cut(q.question, 800), header: cut(q.header, 24), multiSelect: !!q.multiSelect, options: (q.options || []).slice(0, 6).map((o) => ({ label: cut(o.label, 120), description: cut(o.description, 300) })) })) }];
    }
    if (event.subtype === "plan") return [{ ...head, type: "plan", id: event.id, plan: cut(event.plan, 4000) }];
    if (["plan_approved", "plan_dismissed"].includes(event.subtype)) return [{ ...head, type: "plan-closed", id: event.id, went: event.subtype === "plan_approved" }];
    if (["question_answered", "question_dismissed", "question_failed"].includes(event.subtype)) return [{ ...head, type: "question-closed", id: event.id }];
    if (event.subtype === "title_changed") return [{ ...head, type: "title", title: cut(event.title, 160) }];
    if (event.subtype === "commands_changed" && Array.isArray(event.commands)) {
      return [{ ...head, type: "commands", names: event.commands.map((one) => (typeof one === "string" ? one : one?.name)).filter((one) => typeof one === "string" && one).slice(0, 80) }];
    }
    if (NOTE_SUBTYPES.has(event.subtype)) {
      const text = event.message || event.error || event.reason || (event.subtype === "todo" ? event.text || "" : event.subtype === "model_changed" ? `modelo: ${event.label || event.model || ""}` : event.subtype === "effort_changed" ? `esforço: ${event.level || ""}` : event.subtype === "account_changed" ? `conta: ${event.account || ""}` : event.subtype);
      const extra = event.subtype === "model_changed" ? { model: cut(event.model, 60) } : event.subtype === "effort_changed" ? { level: cut(event.level, 24) } : event.subtype === "account_changed" ? { account: cut(event.account, 80) } : {};
      return [{ ...head, type: "note", subtype: event.subtype, text: cut(text, 300), ...extra }];
    }
    return [];
  }
  if (event.type === "assistant") {
    if (event.parent_tool_use_id) return [];
    const out = [];
    for (const block of blocksOf(event)) {
      if (block.type === "text" && block.text?.trim()) out.push({ ...head, type: "assistant", text: cut(block.text) });
      if (block.type === "tool_use") out.push({ ...head, type: "tool", name: block.name, target: targetOf(block.name, block.input || {}) });
    }
    return out;
  }
  if (event.type === "user") {
    if (event.parent_tool_use_id) return [];
    const out = [];
    for (const block of blocksOf(event)) {
      if (block.type === "image" && typeof block.path === "string") out.push({ ...head, type: "shot", path: block.path });
      if (block.type !== "tool_result" || !Array.isArray(block.content)) continue;
      for (const piece of block.content) {
        if (piece?.type === "image" && typeof piece.path === "string") out.push({ ...head, type: "shot", path: piece.path });
      }
    }
    const texts = blocksOf(event).filter((b) => b.type === "text" && b.text?.trim()).map((b) => b.text);
    if (texts.length && event.subtype === "say") out.push({ ...head, type: "user", text: cut(texts.join("\n")), from: event.from ? cut(event.from, 40) : "", cid: event.cid ?? null });
    return out;
  }
  return [];
}

export const isHumanTurn = (event) => event?.type === "user" && event.subtype === "say";

export function firstWindowOf(file, { bytes = FIRST_BYTES, turns = FIRST_TURNS, events = FIRST_EVENTS } = {}) {
  const size = statSync(file).size;
  const from = Math.max(0, size - bytes);
  const fd = openSync(file, "r");
  const buffer = Buffer.alloc(size - from);
  readSync(fd, buffer, 0, buffer.length, from);
  closeSync(fd);
  const lines = buffer.toString("utf8").split("\n");
  const partialTail = lines.pop() || "";
  const rows = [];
  let at = from;
  for (const line of lines) {
    const next = at + Buffer.byteLength(line) + 1;
    if (line.startsWith("{")) {
      let event = null;
      try { event = JSON.parse(line); } catch {}
      if (event && event.type !== "stream_event") rows.push({ at, human: isHumanTurn(event) });
    }
    at = next;
  }
  const starts = rows.filter((row) => row.human).map((row) => row.at);
  let offset = from > 0 && starts.length >= turns ? starts[starts.length - turns] : from > 0 ? (rows[0]?.at ?? size - partialTail.length) : 0;
  if (starts.length >= turns) offset = starts[starts.length - turns];
  const kept = rows.filter((row) => row.at >= offset);
  if (kept.length > events) offset = kept[kept.length - events].at;
  return { offset, size, events: rows.filter((row) => row.at >= offset).length, turns: rows.filter((row) => row.at >= offset && row.human).length };
}

export function createRunner({ device, base, seats, say, spawn = null, answer = null, draftOf = () => null, keepDraft = () => {}, profile = () => null, log = () => {}, pollMs = POLL_MS, fleetMs = FLEET_MS, firstWindow = {}, now = () => Date.now() } = {}) {
  const followed = new Map();
  const birthsTaken = new Set();
  const asksTaken = new Set();
  let timers = [];
  let running = false;
  let startedAt = 0;
  let unlisten = null;
  let profileSent = "";
  const intentFloor = new Map();

  const eventsFile = (name) => join(base, "events", `${name}.ndjson`);

  async function shipShot(seat, path) {
    try {
      const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
      const mime = SHOT_TYPES[ext];
      if (!mime || !existsSync(path) || statSync(path).size > SHOT_CEILING) return null;
      const id = await device.putBlob(seat, new Uint8Array(readFileSync(path)));
      return { id, mime };
    } catch { return null; }
  }

  async function openIfNew(seat) {
    const known = followed.get(seat.name);
    if (known) {
      if (seat.title && seat.title !== known.title) {
        known.title = seat.title;
        await device.retitle(seat.name, seat.title).catch((wrong) => log(`sync: ${seat.name} did not take its title: ${wrong.message}`));
      }
      return known;
    }
    const file = eventsFile(seat.name);
    if (!existsSync(file)) return null;
    const held = { name: seat.name, file, offset: 0, rest: "", queue: Promise.resolve(), title: seat.title || seat.name, lastSeq: 0, catchingUp: true, said: "", asked: "" };
    const size = statSync(file).size;
    const onBroker = device.seats.get(seat.name);
    if (!onBroker || onBroker.closedAt || !device.keyFor(seat.name, onBroker.keyId)) {
      await device.openSeat({ id: seat.name, title: held.title, fresh: !!onBroker });
      const window = firstWindowOf(file, firstWindow);
      held.offset = window.offset;
      log(`sync: ${seat.name} opened on the hive, mirrored from byte ${held.offset} of ${size} (${window.turns} turns, ${window.events} events)`);
    } else {
      const kept = await device.store.get(`offset-${seat.name}`);
      held.offset = Math.min(Number.isFinite(kept) ? kept : size, size);
      if (seat.title && seat.title !== device.held(seat.name).title) await device.retitle(seat.name, seat.title).catch(() => {});
    }
    followed.set(seat.name, held);
    await settleDraft(seat.name).catch((wrong) => log(`sync: ${seat.name} did not settle what was typed: ${wrong.message}`));
    return held;
  }

  async function closeGone(names) {
    for (const [name, held] of [...followed]) {
      if (names.has(name)) continue;
      await held.queue.catch(() => {});
      followed.delete(name);
      await device.closeSeat(name).catch((wrong) => log(`sync: ${name} did not close on the hive: ${wrong.message}`));
      log(`sync: ${name} closed on the hive`);
    }
  }

  function wakeOfPass(held, ones, catchingUp) {
    let asked = false;
    let ended = false;
    for (const one of ones) {
      if (one.type === "title") held.title = one.title;
      if (one.type === "user") held.said = "";
      if (one.type === "assistant") held.said = oneLine(one.text);
      if (one.type === "question" || one.type === "plan") {
        held.asking = true;
        held.asked = oneLine(one.type === "plan" ? one.plan : one.questions?.[0]?.question || one.questions?.[0]?.header);
        asked = true;
        ended = false;
      }
      if (one.type === "question-closed" || one.type === "plan-closed") {
        held.asking = false;
        asked = false;
      }
      if (one.type === "result") ended = true;
    }
    if (catchingUp) return "";
    if (held.asking) return asked ? "needs" : "";
    return ended ? "done" : "";
  }

  function carrierOf(ones, wake) {
    const kinds = wake === "needs" ? ["question", "plan"] : ["result"];
    for (let at = ones.length - 1; at >= 0; at -= 1) if (kinds.includes(ones[at].type)) return ones[at];
    return null;
  }

  const noticeOf = (held, wake) => ({ title: oneLine(held.title || held.name), text: wake === "needs" ? held.asked || "" : held.said || "" });

  async function shipEvent(held, one, sending = null) {
    if (one.type === "title") {
      held.title = one.title;
      return device.retitle(held.name, one.title);
    }
    if (one.type === "shot") {
      const shipped = await shipShot(held.name, one.path);
      if (!shipped) return null;
      return device.write(held.name, { ...one, path: undefined, blob: shipped.id, mime: shipped.mime, name: one.path.split("/").pop() });
    }
    return device.write(held.name, one, sending || {});
  }

  async function drain(held) {
    let size;
    try { size = statSync(held.file).size; } catch { return; }
    if (size < held.offset) {
      held.offset = 0;
      held.rest = "";
      held.lastSeq = 0;
      held.catchingUp = true;
      await device.openSeat({ id: held.name, title: held.title, fresh: true });
      intentFloor.set(held.name, 0);
      await device.store.set(`intents-done-${held.name}`, 0);
      log(`sync: ${held.name} started over, so its chat on the hive starts over too`);
    }
    const catchingUp = !!held.catchingUp;
    held.catchingUp = false;
    if (size === held.offset) return;
    const fd = openSync(held.file, "r");
    const buffer = Buffer.alloc(size - held.offset);
    readSync(fd, buffer, 0, buffer.length, held.offset);
    closeSync(fd);
    const partial = held.offset > 0 && held.rest === "" && !buffer.subarray(0, 1).equals(Buffer.from("{"));
    held.offset = size;
    const text = held.rest + buffer.toString("utf8");
    const lines = text.split("\n");
    held.rest = lines.pop() || "";
    let skipHead = partial;
    const ones = [];
    for (const line of lines) {
      if (skipHead) { skipHead = false; continue; }
      if (!line.trim()) continue;
      let event = null;
      try { event = JSON.parse(line); } catch { continue; }
      if (Number.isFinite(event.seq) && event.seq <= held.lastSeq) continue;
      if (Number.isFinite(event.seq)) held.lastSeq = event.seq;
      ones.push(...slim(event));
    }
    const wake = wakeOfPass(held, ones, catchingUp);
    const carrier = wake ? carrierOf(ones, wake) : null;
    const notice = carrier ? noticeOf(held, wake) : null;
    for (const one of ones) {
      const sending = one === carrier ? { wake, notice } : null;
      held.queue = held.queue.then(() => shipEvent(held, one, sending)).catch((wrong) => log(`sync: ${held.name} did not take an event: ${wrong.message}`));
    }
    await held.queue;
    await device.store.set(`offset-${held.name}`, held.offset);
  }

  async function settleDraft(name) {
    const mine = draftOf(name);
    const kept = device.held(name);
    const there = Number(kept.draftAt || 0);
    const here = Number(mine?.at || 0);
    if (there > here) return void keepDraft(name, kept.draft || "", there);
    if (here > there && mine?.text) await device.putDraft(name, mine.text, here);
  }

  function takeDraft(note) {
    if (note.mine) return;
    keepDraft(note.seat, note.text, note.at);
  }

  async function takeIntent(note) {
    if (note.kind !== "intent" || note.locked || note.entry.by === device.fingerprint) return;
    const held = followed.get(note.seat);
    if (!held) return;
    const floor = intentFloor.get(note.seat) || 0;
    if (note.entry.n <= floor) return;
    intentFloor.set(note.seat, note.entry.n);
    await device.store.set(`intents-done-${note.seat}`, note.entry.n);
    if (Number(note.entry.at) && now() - Number(note.entry.at) > INTENT_FRESH_MS) return;
    const intent = note.value || {};
    let text = String(intent.text || "");
    const pictures = [...(Array.isArray(intent.images) ? intent.images : []), ...(intent.image?.id ? [intent.image] : [])].filter((one) => one?.id).slice(0, 6);
    for (const [at, picture] of pictures.entries()) {
      try {
        const bytes = await device.getBlob(note.seat, picture.id);
        const ext = picture.mime === "image/png" ? "png" : picture.mime === "image/webp" ? "webp" : "jpg";
        const dir = join(base, "shots", note.seat);
        mkdirSync(dir, { recursive: true });
        const file = join(dir, `celular-${now()}${at ? `-${at}` : ""}.${ext}`);
        writeFileSync(file, bytes);
        text = sayWithShot(text, file).text;
      } catch (wrong) {
        log(`sync: ${note.seat} could not keep a picture from the phone: ${wrong.message}`);
      }
    }
    const cmd = intent.type === "answer" ? { type: "answer", id: intent.id, answers: intent.answers || {} }
      : intent.type === "interrupt" ? { type: "interrupt" }
      : intent.type === "control" ? controlOf(intent)
      : { type: "say", text };
    let reply;
    if (!cmd) reply = { ok: false, error: "that is not a control a chat takes" };
    else { try { reply = await say(note.seat, cmd); } catch (wrong) { reply = { ok: false, error: String(wrong?.message || wrong) }; } }
    const done = { type: "intent-done", n: note.entry.n, ok: !!reply?.ok, error: reply?.ok ? "" : cut(reply?.error || "the chat did not answer", 200), echo: cut(intent.text || intent.op || intent.type || "", 200) };
    if (cmd?.type === "control" && reply?.ok) done.reply = replyOf(reply);
    await device.write(note.seat, done).catch(() => {});
    log(`sync: ${note.seat} took ${cmd.type} from ${String(note.entry.by).slice(7, 17)}: ${reply?.ok ? "ok" : reply?.error}`);
  }

  async function takeBirth(note) {
    if (note.kind !== "birth" || birthsTaken.has(note.id)) return;
    birthsTaken.add(note.id);
    const birth = { id: note.id, from: note.from };
    const answer = (said) => device.answerBirth(birth, said).catch((wrong) => log(`sync: could not answer the ask for a new chat: ${wrong.message}`));
    if (!spawn) return answer({ error: "this device does not open chats" });
    if (Number(note.at) && now() - Number(note.at) > INTENT_FRESH_MS) return answer({ error: "that ask waited too long; ask again" });
    const asked = note.mission || {};
    const mission = { prompt: cut(asked.prompt, MISSION_CEILING), where: asked.where === "cloud" ? "cloud" : "local", name: cut(asked.name, 80), model: cut(asked.model, 120), account: cut(asked.account, 80), repo: cut(asked.repo, 160), branch: cut(asked.branch, 120), agent: cut(asked.agent, 24) };
    if (!mission.prompt.trim() && !mission.name.trim()) return answer({ error: "write what the chat should do" });
    let made;
    try { made = await spawn(mission); } catch (wrong) { made = { error: String(wrong?.message || wrong) }; }
    log(`sync: a new chat asked from ${String(note.from).slice(7, 17)}: ${made?.error || made?.name || "opened"}`);
    await answer(made?.error ? { error: cut(made.error, 200) } : { id: made?.id || "", name: made?.name || "", where: made?.where || mission.where });
    if (!made?.error) refreshFleet().catch(() => {});
  }

  function controlOf(intent) {
    const op = String(intent.op || "");
    if (!CONTROL_OPS.has(op)) return null;
    const cmd = { type: "control", op };
    if (op === "setModel") cmd.model = cut(intent.model, 120);
    if (op === "setEffort") cmd.level = cut(intent.level, 24);
    if (op === "setAccount") cmd.account = cut(intent.account, 80);
    if (op === "catalog" && intent.refresh) cmd.refresh = true;
    return cmd;
  }

  function replyOf(reply) {
    const { ok, error, ...rest } = reply || {};
    if (Array.isArray(rest.models)) {
      rest.models = rest.models.slice(0, 80).map((one) => ({ value: cut(one.value, 120), label: cut(one.label, 80), group: cut(one.group || "", 40), efforts: (Array.isArray(one.efforts) ? one.efforts : []).map((e) => cut(typeof e === "string" ? e : e?.value, 24)).filter(Boolean), defaultEffort: cut(one.defaultEffort || "", 24), isDefault: !!one.isDefault }));
    }
    let text = JSON.stringify(rest);
    if (text.length > REPLY_CEILING && Array.isArray(rest.models)) { rest.models = rest.models.slice(0, 30); text = JSON.stringify(rest); }
    return text.length > REPLY_CEILING ? { error: "the reply was too big to carry" } : rest;
  }

  async function takeAsk(note) {
    if (note.kind !== "ask" || asksTaken.has(note.id)) return;
    asksTaken.add(note.id);
    const ask = { id: note.id, from: note.from };
    const reply = (said) => device.answerAsk(ask, said).catch((wrong) => log(`sync: could not answer a ${note.ask} ask: ${wrong.message}`));
    if (!answer) return reply({ error: "this device does not answer that" });
    if (Number(note.at) && now() - Number(note.at) > INTENT_FRESH_MS) return reply({ error: "that ask waited too long; ask again" });
    let said;
    try { said = await answer(String(note.ask || ""), note.payload || {}); } catch (wrong) { said = { error: String(wrong?.message || wrong) }; }
    await reply(said && typeof said === "object" ? said : { error: "nothing to answer" });
  }

  async function refreshFleet() {
    await device.refreshPeople();
    await device.welcomeMates().catch((wrong) => log(`sync: could not hand the keys to a new device: ${wrong.message}`));
    const listed = await seats();
    const names = new Set();
    for (const seat of listed) {
      if (!seat?.name) continue;
      names.add(seat.name);
      await openIfNew(seat).catch((wrong) => log(`sync: could not open ${seat.name} on the hive: ${wrong.message}`));
    }
    await closeGone(names);
    const wanted = JSON.stringify(profile() || null);
    if (wanted !== "null" && wanted !== profileSent) {
      await device.setProfile(JSON.parse(wanted)).then(() => { profileSent = wanted; }).catch(() => {});
    }
  }

  async function tick() {
    for (const held of [...followed.values()]) await drain(held).catch((wrong) => log(`sync: ${held.name}: ${wrong.message}`));
  }

  return {
    get following() { return [...followed.keys()]; },
    get running() { return running; },
    refreshFleet,
    tick,

    async start() {
      if (running) return;
      running = true;
      startedAt = now();
      await device.sync();
      const deliver = (note) => {
        if (note.kind === "draft") return void takeDraft(note);
        return (note.kind === "birth" ? takeBirth(note) : note.kind === "ask" ? takeAsk(note) : takeIntent(note)).catch((wrong) => log(`sync: ${note.kind} on ${note.seat || note.id} failed: ${wrong.message}`));
      };
      for (const [id, kept] of device.replica) {
        const done = await device.store.get(`intents-done-${id}`);
        intentFloor.set(id, Number.isFinite(done) ? done : kept.lastIntent || 0);
      }
      unlisten = device.listen(deliver);
      await refreshFleet();
      for (const id of device.seats.keys()) await settleDraft(id).catch(() => {});
      for (const [id, kept] of device.replica) {
        for (const one of kept.intents.filter((entry) => entry.n > (intentFloor.get(id) || 0))) {
          await deliver({ kind: "intent", seat: id, entry: one, value: one.intent, locked: !!one.locked });
        }
      }
      await tick();
      timers = [
        setInterval(() => { if (running) refreshFleet().catch((wrong) => log(`sync: fleet: ${wrong.message}`)); }, fleetMs),
        setInterval(() => { if (running) tick().catch(() => {}); }, pollMs)
      ];
      for (const timer of timers) timer.unref?.();
      log(`sync: following ${followed.size} chat(s) for the phone since ${new Date(startedAt).toISOString()}`);
    },

    stop() {
      running = false;
      for (const timer of timers) clearInterval(timer);
      timers = [];
      try { unlisten?.(); } catch {}
      unlisten = null;
      device.stream?.stop();
    }
  };
}
