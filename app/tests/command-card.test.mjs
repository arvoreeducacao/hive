import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();
const { runNativeCommand } = await app("chat-and-panes");
const { getStructured } = await app("chat-stretches");
const { svConvFlushAll } = await app("conversation-model");

const settle = async () => {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 5));
    svConvFlushAll();
  }
};

let next = 0;

function chat(answer) {
  const e = getStructured({ name: `command-card-${++next}`, where: "local", agent: "claude" });
  document.body.appendChild(e.host);
  const asked = [];
  e.ws = {
    readyState: 1,
    send(raw) {
      const cmd = JSON.parse(raw);
      asked.push(cmd);
      const done = e.pending.get(cmd.cid);
      e.pending.delete(cmd.cid);
      Promise.resolve(answer(cmd)).then((reply) => done?.(reply));
    }
  };
  return { e, asked };
}

const cardOf = (e) => e.host.querySelector(".sv-cmd");

const dressed = (on) => document.body.classList.toggle("experience-raycast", on);

test("the card names its command, says it is asking, and the dismiss button takes it away", async () => {
  let answer;
  const { e } = chat(() => new Promise((done) => { answer = done; }));
  const running = runNativeCommand(e, "agents");
  await settle();
  const card = cardOf(e);
  assert.equal(card.querySelector(".ch span").textContent, "/agents");
  const close = card.querySelector(".ch button.cx");
  assert.equal(close.getAttribute("type"), "button");
  assert.equal(close.getAttribute("title"), "dismiss");
  assert.equal(close.textContent, "×");
  assert.equal(card.querySelector(".body").innerHTML, '<span class="sv-meta">asking the session…</span>');
  answer({ ok: true, data: [] });
  await running;
  close.click();
  assert.equal(cardOf(e), null);
});

test("a session that cannot answer leaves one warning in the card, and an old driver is told to reopen", async () => {
  const { e } = chat(() => ({ ok: false, error: "unknown command control: agents" }));
  await runNativeCommand(e, "agents");
  await settle();
  const body = cardOf(e).querySelector(".body");
  assert.equal(body.children.length, 1);
  assert.equal(body.firstElementChild.className, "sv-meta warn");
  assert.match(body.textContent, /driver is older than the native commands/);
  const quiet = chat(() => ({ ok: true, data: [] }));
  await runNativeCommand(quiet.e, "agents");
  await settle();
  assert.equal(cardOf(quiet.e).querySelector(".body").textContent, "this session has no agents");
});

test("/agents lists each agent with what it is for, cut at 160 characters", async () => {
  const long = "x".repeat(200);
  const { e } = chat(() => ({ ok: true, data: [{ name: "reviewer", whenToUse: "reads a diff" }, { agentType: "explorer", description: long }, {}] }));
  await runNativeCommand(e, "agents");
  await settle();
  const rows = [...cardOf(e).querySelectorAll(".body > .mcp-row")];
  assert.deepEqual(rows.map((row) => row.querySelector(".nm").textContent), ["reviewer", "explorer", "?"]);
  assert.equal(rows[0].querySelector(".er").textContent, "reads a diff");
  assert.equal(rows[1].querySelector(".er").textContent.length, 160);
  assert.equal(rows[0].querySelector(".er").style.color, "var(--txt-3)");
});

test("/config marks the current style, moves the mark only when the session takes a choice, and clears the free line once it lands", async () => {
  const said = [];
  let take = true;
  const { e } = chat((cmd) => {
    if (cmd.op === "styles") return { ok: true, data: { available: ["default", "Concise"], current: "Concise" } };
    if (cmd.type === "say") { said.push(cmd.text); return { ok: take }; }
    return { ok: false };
  });
  await runNativeCommand(e, "config");
  await settle();
  const body = cardOf(e).querySelector(".body");
  const rows = [...body.querySelectorAll(".cfg-row")];
  assert.deepEqual(rows.map((row) => row.querySelector(".nm").textContent), ["autoCompact", "thinking", "verbose", "recap", "checkpoints", "turnDuration", "outputStyle", "language"]);
  const style = rows[6];
  const chosen = () => [...style.querySelectorAll(".co.sel")].map((one) => one.dataset.v);
  assert.deepEqual(chosen(), ["Concise"]);
  assert.deepEqual([...style.querySelectorAll(".co")].map((one) => `${one.getAttribute("type")}:${one.textContent}`), ["button:default", "button:Concise"]);
  style.querySelector('[data-v="default"]').click();
  assert.deepEqual(chosen(), [], "the mark leaves at once");
  await settle();
  assert.deepEqual(chosen(), ["default"]);
  take = false;
  style.querySelector('[data-v="Concise"]').click();
  await settle();
  assert.deepEqual(chosen(), [], "a choice the session refused stays unmarked");
  const language = rows[7].querySelector("input.ci");
  assert.equal(language.getAttribute("placeholder"), "value");
  language.value = "pt-BR";
  language.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  const free = body.querySelector(".qfree input");
  take = true;
  free.value = "not a pair";
  body.querySelector(".qfree .qgo").click();
  free.value = "editorMode=vim";
  free.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  await settle();
  assert.equal(free.value, "");
  assert.deepEqual(said, ["/config outputStyle=default", "/config outputStyle=Concise", "/config language=pt-BR", "/config editorMode=vim"]);
  assert.equal(body.lastElementChild.className, "sv-meta");
});

test("/config marks the newest choice the session took, whatever order the replies land in", async () => {
  const waiting = new Map();
  const { e } = chat((cmd) => {
    if (cmd.op === "styles") return { ok: true, data: { available: ["default", "Concise"], current: "" } };
    if (cmd.type === "say") return new Promise((done) => waiting.set(cmd.text, done));
    return { ok: false };
  });
  await runNativeCommand(e, "config");
  await settle();
  const style = [...cardOf(e).querySelectorAll(".cfg-row")][6];
  const chosen = () => [...style.querySelectorAll(".co.sel")].map((one) => one.dataset.v);
  style.querySelector('[data-v="default"]').click();
  style.querySelector('[data-v="Concise"]').click();
  waiting.get("/config outputStyle=Concise")({ ok: true });
  await settle();
  assert.deepEqual(chosen(), ["Concise"]);
  waiting.get("/config outputStyle=default")({ ok: true });
  await settle();
  assert.deepEqual(chosen(), ["Concise"], "the older reply does not take the mark back");
  waiting.clear();
  style.querySelector('[data-v="default"]').click();
  style.querySelector('[data-v="Concise"]').click();
  waiting.get("/config outputStyle=default")({ ok: true });
  await settle();
  assert.deepEqual(chosen(), ["default"]);
  waiting.get("/config outputStyle=Concise")({ ok: false });
  await settle();
  assert.deepEqual(chosen(), ["default"], "a newer choice the session refused leaves the older one it took");
  waiting.clear();
  style.querySelector('[data-v="Concise"]').click();
  style.querySelector('[data-v="default"]').click();
  waiting.get("/config outputStyle=default")({ ok: false });
  await settle();
  assert.deepEqual(chosen(), []);
  waiting.get("/config outputStyle=Concise")({ ok: true });
  await settle();
  assert.deepEqual(chosen(), ["Concise"], "an older choice the session took still marks when the newer one was refused first");
});

test("/context draws the bar and the legend in the dressed tones with what is free, and compact now says how it went", async () => {
  dressed(true);
  let compact = { ok: true, data: { queued: true } };
  const { e, asked } = chat((cmd) => {
    if (cmd.op === "context") return { ok: true, data: { maxTokens: 200000, totalTokens: 50000, percentage: 25, model: "opus", categories: [{ name: "System", tokens: 20000 }, { name: "Messages", tokens: 30000, kind: "used" }, { name: "Free space", tokens: 150000 }] } };
    if (cmd.op === "compact") return compact;
    return { ok: false };
  });
  try {
    await runNativeCommand(e, "context");
    await settle();
    const body = cardOf(e).querySelector(".body");
    const segments = [...body.querySelectorAll(".bar > i")];
    assert.deepEqual(segments.map((one) => [one.style.width, one.style.background, one.getAttribute("title")]), [["10%", "var(--accent)", "System: 20,000 tokens"], ["15%", "var(--txt-2)", "Messages: 30,000 tokens"]]);
    const legend = [...body.querySelector(".legend").children];
    assert.deepEqual(legend.map((one) => one.textContent), ["System 20k", "Messages 30k", "free 150k"]);
    assert.equal(legend[2].className, "free");
    assert.equal(legend[0].querySelector(".dot").style.background, "var(--accent)");
    assert.equal(body.querySelector(".sv-meta").textContent, "50,000 of 200,000 tokens · 25% · opus");
    const go = body.querySelector("button.ctx-go");
    assert.equal(go.textContent, "compact now");
    go.click();
    assert.equal(go.disabled, true);
    await settle();
    assert.equal(go.textContent, "queued — runs when this turn ends");
    assert.equal(go.disabled, true);
    assert.ok(asked.some((one) => one.op === "compact" && one.focus === ""));
  } finally {
    dressed(false);
  }
  compact = { ok: false, error: "busy" };
  await runNativeCommand(e, "context");
  await settle();
  const plain = [...e.host.querySelectorAll(".sv-cmd")].at(-1).querySelector(".body");
  assert.deepEqual([...plain.querySelectorAll(".bar > i")].map((one) => one.style.background), ["var(--blue)", "var(--blue)", "var(--blue)"]);
  assert.equal(plain.querySelector(".legend .free"), null);
  const go = plain.querySelector("button.ctx-go");
  go.click();
  await settle();
  assert.equal(go.textContent, "compact now");
  assert.equal(go.disabled, false);
});

test("/mcp lists each server with its dot, its state and its tools, and says so when there is none", async () => {
  const { e } = chat((cmd) => (cmd.op === "mcp" ? { ok: true, data: [{ name: "hive", status: "connected", tools: [1, 2] }, { name: "linear", status: "failed", error: "boom" }] } : { ok: false }));
  await runNativeCommand(e, "mcp");
  await settle();
  const rows = [...cardOf(e).querySelectorAll(".body > .mcp-row")];
  assert.deepEqual(rows.map((row) => [row.querySelector(".nm").textContent, row.querySelector(".st").textContent, row.querySelector(".er").textContent, row.querySelector(".dot").style.background]), [["hive", "connected · 2 tools", "", "var(--green)"], ["linear", "failed", "boom", "var(--accent)"]]);
  assert.equal(cardOf(e).querySelector("button.auth"), null);
  const none = chat((cmd) => (cmd.op === "mcp" ? { ok: true, data: [] } : { ok: false }));
  await runNativeCommand(none.e, "mcp");
  await settle();
  assert.equal(cardOf(none.e).querySelector(".body").textContent, "this session has no MCP servers");
});
