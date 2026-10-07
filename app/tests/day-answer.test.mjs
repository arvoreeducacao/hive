import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, views } from "./dom.mjs";

await views();

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function slice(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const { parseStructuredTail } = new Function(
  'const PR_LINK = /https:\\/\\/github\\.com\\/[\\w.-]+\\/[\\w.-]+\\/pull\\/\\d+/g;'
  + 'const prettyModel = (m) => m || "";'
  + slice(server, "const FINISH_WORDS", "function structuredStateOf", "server.mjs")
  + "return { parseStructuredTail };"
)();

const dayGroup = new Function(
  slice(server, "const dayGroup = (one)", "function dayOf", "server.mjs") + "return dayGroup;"
)();

const { dayLineModel, dayZoneModel } = await app("day");
const { mountDay } = await import(new URL("../src/views.js", import.meta.url).href);

const ACTIONS = { seen() {}, goto() {}, rename() {}, board() {} };
const BARE = { count: "", brief: null, fold: null, boardOpen: false, zones: [], emptyHead: "", emptySay: "" };

function paintHost(model) {
  const host = document.createElement("div");
  mountDay(host, { actions: ACTIONS }).show({ ...BARE, ...model });
  return host;
}

const lineHost = (one, kind) => paintHost({ brief: { hi: { lead: "", bold: "" }, lines: [dayLineModel(one, kind)] } });
const dayLine = (one, kind) => lineHost(one, kind).innerHTML;

const dayZone = (title, groups, kind) => {
  const zone = dayZoneModel(title, groups, kind);
  return zone ? paintHost({ brief: { hi: { lead: "", bold: "" }, lines: [] }, boardOpen: true, zones: [zone] }).innerHTML : "";
};

const log = (...events) => events.map((e) => JSON.stringify(e)).join("\n");
const question = (id, questions) => ({ type: "driver", subtype: "question", id, questions });
const OPTIONS = [{ label: "CloudFront", description: "desfaz em um deploy" }, { label: "CORS no bucket", description: "mexe em produção" }];
const ASKED = [{ header: "conserto", question: "por onde o áudio volta?", options: OPTIONS }];


test("a seat that stopped on a question carries the question itself, not just the fact that it stopped", () => {
  const info = parseStructuredTail(log(question("q-1", ASKED)));
  assert.equal(info.pending, true);
  assert.deepEqual(info.asks, [{ id: "q-1", questions: ASKED }]);
});

test("an answered question leaves nothing behind to answer twice", () => {
  const info = parseStructuredTail(log(
    question("q-1", ASKED),
    { type: "driver", subtype: "question_answered", id: "q-1" }
  ));
  assert.equal(info.pending, false);
  assert.deepEqual(info.asks, []);
});

test("a dropped or failed question is gone from the screen too", () => {
  for (const subtype of ["question_dismissed", "question_failed"]) {
    const info = parseStructuredTail(log(question("q-1", ASKED), { type: "driver", subtype, id: "q-1" }));
    assert.deepEqual(info.asks, [], `${subtype} left the question open`);
  }
});

test("two open questions both come through, in the order they were asked", () => {
  const info = parseStructuredTail(log(question("q-1", ASKED), question("q-2", ASKED)));
  assert.deepEqual(info.asks.map((one) => one.id), ["q-1", "q-2"]);
});

test("a question event with no questions in it does not become a card with nothing to pick", () => {
  const info = parseStructuredTail(log({ type: "driver", subtype: "question", id: "q-1" }));
  assert.deepEqual(info.asks, [{ id: "q-1", questions: [] }]);
});

test("the day payload hands the question down to the screen with the seat that asked it", () => {
  const group = dayGroup({
    errand: "áudio mudo no CRM",
    asked: "descobre por que o áudio fica mudo",
    at: 1,
    prs: [],
    seats: [{ name: "crm-audio", where: "local", state: "needs", title: "áudio mudo", now: "achou a causa", asks: [{ id: "q-1", questions: ASKED }] }]
  });
  assert.deepEqual(group.seats[0].asks, [{ id: "q-1", questions: ASKED }]);
});

test("a seat with nothing open still answers with a list, so the screen never guesses", () => {
  const group = dayGroup({ errand: "x", asked: "", at: 0, prs: [], seats: [{ name: "a", where: "local", state: "working" }] });
  assert.deepEqual(group.seats[0].asks, []);
});


const group = (extra = {}) => ({
  errand: "áudio mudo no CRM",
  asked: "descobre por que o áudio do CRM fica mudo",
  prs: [],
  seats: [{ name: "crm-audio", where: "local", state: "needs", title: "áudio mudo", now: "achou a causa", asks: [{ id: "q-1", questions: ASKED }] }],
  ...extra
});

test("the line that waits on you opens a place for the question card, tied to the seat that asked", () => {
  const html = dayLine(group(), "needs");
  assert.match(html, /class="dask" data-ask="q-1" data-seat="crm-audio"/);
});

test("one front asking needs no name — with two, the card says which one is asking", () => {
  assert.doesNotMatch(dayLine(group(), "needs"), /is asking|está perguntando/);
  const two = dayLine(group({
    seats: [
      { name: "crm-audio", where: "local", state: "needs", title: "áudio mudo", now: "", asks: [{ id: "q-1", questions: ASKED }] },
      { name: "crm-midia", where: "local", state: "working", title: "mídia", now: "", asks: [] }
    ]
  }), "needs");
  assert.match(two, /áudio mudo is asking|áudio mudo está perguntando/);
});

test("the other lines carry no card — there is nothing there to answer", () => {
  for (const kind of ["back", "way"]) {
    assert.doesNotMatch(dayLine(group(), kind), /class="dask"/, `${kind} grew an answer card`);
  }
});

test("the board behind the message never carries a second copy of the card", () => {
  for (const kind of ["needs", "back", "way", "hand"]) {
    assert.doesNotMatch(dayZone("x", [group()], kind), /class="(d|e)ask"/, `${kind} grew a duplicate card`);
  }
});

test("a request with nobody asking offers the chat instead of an empty box", () => {
  const html = dayLine(group({
    seats: [{ name: "crm-audio", where: "local", state: "needs", title: "áudio mudo", now: "", asks: [] }]
  }), "needs");
  assert.doesNotMatch(html, /class="dask"/);
  assert.match(html, /data-goto="crm-audio"/);
});

test("a question id with html in it is escaped before it becomes an attribute", () => {
  const said = '"><img src=x>';
  const host = lineHost(group({
    seats: [{ name: "a", where: "local", state: "needs", title: "a", now: "", asks: [{ id: said, questions: ASKED }] }]
  }), "needs");
  assert.equal(host.querySelectorAll("img").length, 0, "the question id broke out of its attribute");
  assert.equal(host.querySelector(".dask").dataset.ask, said);
  assert.match(host.innerHTML, /&quot;/);
});


const deliverAnswerWith = (fleet, bridge, pod) => new Function(
  "collect", "bridge", "podCmd", "join", "HIVE_HOME",
  slice(server, "async function deliverAnswer", "async function deliverSay", "server.mjs") + "return deliverAnswer;"
)(async () => ({ sessions: fleet }), bridge, pod, (...bits) => bits.join("/"), "/home");

const seat = (extra = {}) => ({ name: "crm-audio", where: "local", structured: true, ...extra });

test("a local seat is answered on its own socket, with the id it asked under", async () => {
  const sent = [];
  const answer = deliverAnswerWith([seat()], { oneshot: (sock, cmd) => { sent.push({ sock, cmd }); return { ok: true }; } });
  assert.deepEqual(await answer("crm-audio", "q-1", { "por onde?": "CloudFront" }), { ok: true });
  assert.deepEqual(sent, [{
    sock: "/home/sock/crm-audio.sock",
    cmd: { type: "answer", id: "q-1", answers: { "por onde?": "CloudFront" } }
  }]);
});

test("a seat on the pod is answered through the pod, never through a socket that is not there", async () => {
  const sent = [];
  const answer = deliverAnswerWith(
    [seat({ where: "cloud" })],
    { oneshot: () => { throw new Error("the local socket was used for a seat on the pod"); } },
    (name, cmd) => { sent.push({ name, cmd }); return { ok: true }; }
  );
  assert.deepEqual(await answer("crm-audio", "q-1", { a: "b" }), { ok: true });
  assert.deepEqual(sent, [{ name: "crm-audio", cmd: { type: "answer", id: "q-1", answers: { a: "b" } } }]);
});

test("a seat that is gone, or one that lives in a terminal, is told so instead of failing quietly", async () => {
  const gone = await deliverAnswerWith([], { oneshot: () => ({ ok: true }) })("nobody", "q-1", { a: "b" });
  assert.equal(gone.ok, false);
  assert.match(gone.error, /not alive/);
  const terminal = await deliverAnswerWith([seat({ structured: false })], { oneshot: () => ({ ok: true }) })("crm-audio", "q-1", { a: "b" });
  assert.equal(terminal.ok, false);
  assert.match(terminal.error, /terminal/);
});

test("a driver that refuses the answer says why, and the screen is not told it worked", async () => {
  const answer = deliverAnswerWith([seat()], { oneshot: () => ({ ok: false, error: "no pending question q-9" }) });
  assert.deepEqual(await answer("crm-audio", "q-9", { a: "b" }), { ok: false, error: "no pending question q-9" });
});


const APP_DEPS = existsSync(join(HERE, "node_modules", "jsonc-parser"));

const ask = (options) => new Promise((tell) => {
  const out = request({ ...options, timeout: 20000 }, (res) => {
    let said = "";
    res.on("data", (d) => { said += d; });
    res.on("end", () => tell({ code: res.statusCode, said }));
  });
  out.on("error", () => tell({ code: 0, said: "" }));
  out.on("timeout", () => { out.destroy(); tell({ code: 0, said: "" }); });
  out.end(options.payload);
});

test("the door reads the answer, and refuses the halves of one",
  { skip: APP_DEPS ? false : "the app dependencies are not installed, so server.mjs cannot boot here" },
  async () => {
  const home = await mkdtemp(join(tmpdir(), "hive-answer-"));
  const hub = await mkdtemp(join(tmpdir(), "hive-answer-hub-"));
  const sock = join(home, "hive.sock");
  const hive = spawn(process.execPath, ["server.mjs"], {
    cwd: HERE,
    env: { ...process.env, HIVE_DEV: "", HIVE_POD: "", HIVE_STATE_DIR: home, HIVE_HOME: home, HIVE_HUB: hub,
      HIVE_SANDBOX: "1", HIVE_NO_SWEEP: "1", HIVE_PHONES: "", HIVE_SOCK: sock, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let said = "";
  hive.stdout.on("data", (d) => { said += d; });
  hive.stderr.on("data", (d) => { said += d; });
  const post = (payload) => ask({ socketPath: sock, path: "/api/answer", method: "POST",
    headers: { "content-type": "application/json" }, payload: JSON.stringify(payload) });
  try {
    const up = await new Promise((done) => {
      const giveUp = setTimeout(() => done(false), 30000);
      const look = setInterval(() => {
        if (!existsSync(sock)) return;
        clearInterval(look); clearTimeout(giveUp); done(true);
      }, 100);
      hive.on("exit", () => { clearInterval(look); clearTimeout(giveUp); done(false); });
    });
    assert.ok(up, `the hive never opened its door: ${said}`);

    const noName = await post({ id: "q-1", answers: { a: "b" } });
    assert.equal(noName.code, 400);
    assert.match(noName.said, /name/);

    const noId = await post({ name: "crm-audio", answers: { a: "b" } });
    assert.equal(noId.code, 400);
    assert.match(noId.said, /question/);

    for (const answers of [undefined, {}, [], "CloudFront"]) {
      const empty = await post({ name: "crm-audio", id: "q-1", answers });
      assert.equal(empty.code, 400, `an answer of ${JSON.stringify(answers)} was taken as an answer`);
    }

    const gone = await post({ name: "nao-existe-aqui", id: "q-1", answers: { a: "b" } });
    assert.equal(gone.code, 400);
    assert.match(gone.said, /not alive/, "the door never reached the delivery");
  } finally {
    hive.kill("SIGKILL");
    await rm(home, { recursive: true, force: true });
    await rm(hub, { recursive: true, force: true });
  }
});

test("an init the driver re-emits after a turn ended (a reconnect, a reopen) does not put the seat back to work", () => {
  const born = parseStructuredTail(log(
    { seq: 1, type: "system", subtype: "init", model: "gpt-5.6-luna" },
  ));
  assert.equal(born.working, true);
  const idle = parseStructuredTail(log(
    { seq: 1, type: "system", subtype: "init", model: "gpt-5.6-luna" },
    { seq: 2, type: "user", message: { role: "user", content: "oi" } },
    { seq: 3, type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "opa" }] } },
    { seq: 4, type: "result", subtype: "success", is_error: false },
    { seq: 5, type: "system", subtype: "init", model: "gpt-5.6-luna" },
    { seq: 6, type: "driver", subtype: "interrupted", ms: 0 },
  ));
  assert.equal(idle.working, false);
  assert.equal(idle.model, "gpt-5.6-luna");
});
