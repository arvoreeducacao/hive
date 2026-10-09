import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const { svConvFlushAll } = await app("conversation-model");

await views();
const st = await state();
const { svEvent } = await app("chat-and-panes");
const { getStructured } = await app("chat-stretches");
const { memoryChip, memoryChipClick, memoryNow, relevanceSay, MEMORY_LOGIN_COMMAND } = await app("memory-signal");
const { tileViewModel } = await app("seat-menu");

const ITEMS = [
  { id: "m1", title: "api: mínimo 2 réplicas", source: "shared", relevance: 0.96, author: "rosa", date: "2026-05-02" },
  { id: "m2", title: "Deploy em PR é preview, não produção", source: "curated", relevance: 0.81, author: "juno", date: "2026-06-30" },
  { id: "c1", title: "readiness passava antes do Prisma conectar", source: "conversation", relevance: 0.88, author: "", date: "" }
];

let seq = 0;

function seat(name) {
  const e = getStructured({ name, where: "local", agent: "claude" });
  document.body.appendChild(e.host);
  return e;
}

const say = (e, text) => svEvent(e, { seq: ++seq, type: "user", subtype: "say", cid: `c${seq}`, message: { content: [{ type: "text", text }] } });
const flush = () => new Promise((r) => setTimeout(r, 0));

test("memory used under a message shows one chip with the counts, right under the person's bubble", async () => {
  const e = seat("mem-used");
  say(e, "o deploy deu 502 de novo, por quê?");
  svEvent(e, { seq: ++seq, type: "memory", kind: "used", state: "on", items: ITEMS });
  await flush();
  const kinds = e.conv.blocks.map((one) => one.kind);
  assert.deepEqual(kinds.slice(-2), ["bubble", "memory"]);
  const chip = (svConvFlushAll(), e.host).querySelector('.sv-mem[data-memory="used"] .mchip');
  assert.ok(chip, "no chip under the message");
  assert.deepEqual([...chip.querySelectorAll(".mpart")].map((one) => one.textContent), ["2 from the team", "1 excerpt"]);
  assert.equal(chip.querySelectorAll(".msep").length, 1);
  assert.deepEqual([...chip.querySelectorAll(".mpart")].map((one) => one.dataset.part), ["team", "loose"]);
});

test("the chip opens inline: score, title, author and date, and the conversation excerpt marked not verified", async () => {
  const e = seat("mem-open");
  say(e, "pergunta");
  svEvent(e, { seq: ++seq, type: "memory", kind: "used", state: "on", items: ITEMS });
  await flush();
  const box = (svConvFlushAll(), e.host).querySelector(".sv-mem");
  assert.equal(box.tagName, "DETAILS", "the list expands in the flow of the chat, not in a floating layer");
  assert.equal(box.open, false);
  box.open = true;
  const rows = [...box.querySelectorAll(".mit")];
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((one) => one.querySelector(".mrel").textContent), ["0,96", "0,81", "0,88"]);
  assert.equal(rows[0].querySelector(".mtitle").textContent, "api: mínimo 2 réplicas");
  assert.equal(rows[0].querySelector(".mby").textContent, "rosa · 02/05");
  assert.equal(rows[0].dataset.verified, "yes");
  assert.equal(rows[2].dataset.verified, "no");
  assert.equal(rows[2].dataset.source, "conversation");
  assert.match(rows[2].querySelector(".mtitle").textContent, /readiness passava antes do Prisma conectar/);
  assert.equal(rows[2].querySelector(".mby").textContent, "not verified");
  assert.equal(box.querySelector(".mopen").textContent, "Open in the memories panel ↗");
});

test("the footer opens the memories panel on the shared memory the chip pointed at", async () => {
  const e = seat("mem-panel");
  say(e, "pergunta");
  svEvent(e, { seq: ++seq, type: "memory", kind: "used", state: "on", items: [ITEMS[2], ITEMS[0]] });
  await flush();
  assert.equal(e.conv.blocks.at(-1).focus, "m1");
  document.getElementById("memories").hidden = true;
  (svConvFlushAll(), e.host).querySelector(".sv-mem .mopen").click();
  assert.equal(document.getElementById("memories").hidden, false);
  assert.equal(st.mem.pick, "m1");
});

function wearNextHive(on) {
  document.body.classList.toggle("experience-next", on);
  document.dispatchEvent(new window.CustomEvent("hive:experience", { detail: { experience: on ? "next" : "current" } }));
}

test("in the new Hive each shared memory row opens that memory in the panel", async () => {
  wearNextHive(true);
  try {
    const e = seat("mem-row-next");
    say(e, "pergunta");
    svEvent(e, { seq: ++seq, type: "memory", kind: "used", state: "on", items: [ITEMS[0], { ...ITEMS[0], id: "m9", title: "outra" }, ITEMS[1], ITEMS[2]] });
    await flush();
    const rows = [...(svConvFlushAll(), e.host).querySelectorAll(".sv-mem .mit")];
    assert.deepEqual(rows.map((one) => one.dataset.opens || ""), ["yes", "yes", "", ""], "only shared memories live in the panel");
    assert.equal(rows[1].getAttribute("role"), "button");
    assert.equal(rows[1].tabIndex, 0);
    document.getElementById("memories").hidden = true;
    rows[1].click();
    assert.equal(document.getElementById("memories").hidden, false);
    assert.equal(st.mem.pick, "m9");
    rows[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    assert.equal(st.mem.pick, "m1");
    st.mem.pick = "";
    rows[3].click();
    assert.equal(st.mem.pick, "", "a conversation excerpt opens nothing");
  } finally {
    wearNextHive(false);
  }
});

test("in the current Hive the rows stay plain text", async () => {
  const e = seat("mem-row-current");
  say(e, "pergunta");
  svEvent(e, { seq: ++seq, type: "memory", kind: "used", state: "on", items: ITEMS });
  await flush();
  const row = (svConvFlushAll(), e.host).querySelector(".sv-mem .mit");
  assert.equal(row.dataset.opens, undefined);
  assert.equal(row.getAttribute("role"), null);
  st.mem.pick = "";
  row.click();
  assert.equal(st.mem.pick, "");
});

test("nothing relevant found leaves no chip at all", async () => {
  const e = seat("mem-empty");
  say(e, "oi");
  svEvent(e, { seq: ++seq, type: "memory", kind: "used", state: "on", items: [] });
  await flush();
  assert.equal(e.conv.blocks.some((one) => one.kind === "memory"), false);
  assert.equal((svConvFlushAll(), e.host).querySelector(".sv-mem"), null);
  assert.equal(memoryNow("mem-empty").state, "on", "it still says the memory is on");
});

test("only the parts that exist are counted", async () => {
  const e = seat("mem-loose");
  say(e, "oi");
  svEvent(e, { seq: ++seq, type: "memory", kind: "used", state: "limited", items: [ITEMS[2], { ...ITEMS[2], id: "c2" }] });
  await flush();
  assert.deepEqual([...(svConvFlushAll(), e.host).querySelectorAll(".sv-mem .mpart")].map((one) => one.textContent), ["2 excerpts"]);
  assert.equal((svConvFlushAll(), e.host).querySelector(".sv-mem .msep"), null);
  assert.equal(relevanceSay(0.5), "0,50");
  assert.equal(relevanceSay(null), "");
});

test("saving to the team memory is a row of its own, not the plain tool card", async () => {
  const e = seat("mem-save");
  say(e, "guarda isso");
  svEvent(e, { seq: ++seq, type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "mcp__plugin_claude-memory_team-memory__memory_save", input: { title: "readiness do api precisa esperar o Prisma conectar", content: "..." } }] } });
  await flush();
  const row = (svConvFlushAll(), e.host).querySelector('.sv-memsave[data-memory="saved"]');
  assert.ok(row, "no memory row");
  assert.equal((svConvFlushAll(), e.host).querySelector('.sv-tool[data-tool$="memory_save"]'), null, "the plain card drew too");
  assert.match(row.querySelector(".mk").textContent, /saving to the team memory…/);
  assert.equal(row.querySelector(".mv").textContent, "readiness do api precisa esperar o Prisma conectar");
  assert.equal(row.querySelector(".ma").textContent, "comes in through Jev at 4:30");
  assert.ok(row.classList.contains("running"));
  svEvent(e, { seq: ++seq, type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok", is_error: false }] } });
  await flush();
  assert.equal((svConvFlushAll(), e.host).querySelector(".sv-memsave").classList.contains("running"), false);
  assert.match((svConvFlushAll(), e.host).querySelector(".sv-memsave .mk").textContent, /saved to the team memory/);
});

test("a save that failed says so on the same row", async () => {
  const e = seat("mem-save-bad");
  svEvent(e, { seq: ++seq, type: "assistant", message: { content: [{ type: "tool_use", id: "t2", name: "mcp__plugin_claude-memory_team-memory__memory_save", input: { title: "x" } }] } });
  svEvent(e, { seq: ++seq, type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t2", content: "boom", is_error: true }] } });
  await flush();
  const row = (svConvFlushAll(), e.host).querySelector(".sv-memsave");
  assert.ok(row.classList.contains("bad"));
  assert.match(row.querySelector(".mk").textContent, /did not save to the team memory/);
  assert.equal(row.querySelector(".ma").textContent, "try again or save it by hand");
});

test("another tool that happens to end in memory_save keeps the plain card", async () => {
  const e = seat("mem-save-other");
  svEvent(e, { seq: ++seq, type: "assistant", message: { content: [{ type: "tool_use", id: "t3", name: "mcp__other__memory_save", input: { title: "x" } }] } });
  await flush();
  assert.equal((svConvFlushAll(), e.host).querySelector(".sv-memsave"), null);
});

const claude = (name) => ({ name, where: "local", state: "idle", when: "1m", agent: "claude" });

test("the head chip says the state the last memory event left", () => {
  const states = [
    ["on", { kind: "used", state: "on", items: [] }, "memory on", "team memory"],
    ["login", { kind: "state", state: "login" }, "memory login", "memory off · sign in"],
    ["incognito", { kind: "state", state: "incognito" }, "memory incognito", "incognito · not saved"],
    ["limited", { kind: "used", state: "limited", items: [] }, "memory limited", "limited memory"]
  ];
  for (const [state, ev, cls, text] of states) {
    const name = `chip-${state}`;
    svEvent(seat(name), { seq: ++seq, type: "memory", ...ev });
    const chip = memoryChip(claude(name));
    assert.equal(chip.cls, cls, state);
    assert.equal(chip.text, text, state);
    assert.equal(chip.memory, state);
  }
});

test("the last word wins, and an older page loaded later does not take it back", () => {
  const e = seat("chip-order");
  svEvent(e, { seq: 100, type: "memory", kind: "state", state: "login" });
  svEvent(e, { seq: 101, type: "memory", kind: "used", state: "on", items: [] });
  assert.equal(memoryChip(claude("chip-order")).memory, "on");
  svEvent({ ...e, lastSeq: 0, conv: { ...e.conv, blocks: [] } }, { seq: 50, type: "memory", kind: "state", state: "incognito", replayed: true });
  assert.equal(memoryChip(claude("chip-order")).memory, "on");
});

test("the end of a conversation only lands in the tooltip, never as a line in the chat", async () => {
  const e = seat("chip-sent");
  svEvent(e, { seq: ++seq, type: "memory", kind: "used", state: "on", items: [] });
  const before = e.conv.blocks.length;
  const at = new Date(2026, 9, 5, 14, 7).getTime();
  svEvent(e, { seq: ++seq, type: "memory", kind: "sent", at });
  await flush();
  assert.equal(e.conv.blocks.length, before);
  assert.match(memoryChip(claude("chip-sent")).title, /last conversation sent 14:07/);
});

test("a claude seat that has heard nothing yet shows no chip, and other engines say memory comes on demand", () => {
  assert.equal(memoryChip(claude("chip-silent")), null);
  assert.equal(memoryChip({ name: "sh", where: "local", kind: "shell" }), null);
  for (const agent of ["codex", "kimi", "kiro", "cursor", "opencode"]) {
    const chip = memoryChip({ name: `chip-${agent}`, where: "local", agent });
    assert.equal(chip.memory, "demand", agent);
    assert.equal(chip.text, "memory on demand only", agent);
  }
});

test("the chip rides in the seat's head and in the chip row, and a click hands its state over", () => {
  svEvent(seat("chip-tile"), { seq: ++seq, type: "memory", kind: "state", state: "login" });
  const s = claude("chip-tile");
  const flat = tileViewModel(s);
  assert.ok(flat.chips.some((one) => one.key === "memory" && one.memory === "login"));
  const head = tileViewModel(s, { pos: 0 });
  assert.ok(head.heads.some((one) => one.key === "memory" && one.memory === "login"));
  const host = document.createElement("div");
  const clicked = [];
  const actions = new Proxy({ memory: (memory) => clicked.push(memory) }, { get: (held, key) => held[key] || (() => {}) });
  const view = st.tileSide(host, head, actions);
  const chip = host.querySelector('.t-hchips .c.memory[data-memory="login"]');
  assert.ok(chip, "no memory chip in the head");
  assert.equal(chip.querySelector(".tx").textContent, "memory off · sign in");
  assert.ok(chip.querySelector(".mdot"));
  chip.$$click({ stopPropagation() {}, currentTarget: chip });
  assert.deepEqual(clicked, ["login"]);
  view.dispose();
  const row = document.createElement("div");
  const rowView = st.tileSide(row, flat, actions);
  const plain = row.querySelector('.t-chips .c.memory[data-memory="login"]');
  assert.ok(plain, "no memory chip in the chip row");
  plain.$$click({ stopPropagation() {}, currentTarget: plain });
  assert.deepEqual(clicked, ["login", "login"]);
  rowView.dispose();
});

test("signing in puts the login command in the seat's composer", () => {
  const e = seat("chip-login");
  svEvent(e, { seq: ++seq, type: "memory", kind: "state", state: "login" });
  st.blocks = st.blocks || [];
  memoryChipClick("chip-login", "login", null);
  assert.equal((svConvFlushAll(), e.host).querySelector(".sv-composer textarea").value, MEMORY_LOGIN_COMMAND);
  assert.equal(MEMORY_LOGIN_COMMAND, "/claude-memory:memory-login");
});
