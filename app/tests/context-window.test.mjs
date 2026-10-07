import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { openContextWindow, askToCompact, startCompactShow, dropCompactShow } = await app("context-window");
const { svDequeue } = await app("structured-seats");

const USAGE = {
  model: "claude-opus-4-1",
  maxTokens: 200000,
  totalTokens: 183400,
  percentage: 91.7,
  categories: [
    { name: "System prompt", tokens: 3100, kind: "used" },
    { name: "MCP tools", tokens: 21400, kind: "used" },
    { name: "Skills", tokens: 4100, kind: "used" },
    { name: "Messages", tokens: 128900, kind: "used" },
    { name: "Autocompact buffer", tokens: 13000, kind: "buffer" },
    { name: "Free space", tokens: 3600, kind: "free" },
    { name: "MCP tools (deferred)", tokens: 42000, kind: "deferred" },
  ],
  mcpTools: [{ name: "a", serverName: "hive", tokens: 12000 }, { name: "b", serverName: "hub", tokens: 9400 }],
  skills: { skillFrontmatter: Array.from({ length: 9 }, (_, i) => ({ name: `skill-${i}`, tokens: 900 - i * 60 })) },
};

function seat(name, { queued = false } = {}) {
  document.body.classList.add("experience-next");
  const tile = document.createElement("div");
  tile.className = "tile";
  const host = document.createElement("div");
  host.className = "sv";
  host.innerHTML = `<div class="sv-scroll"></div><div class="sv-queue"></div><div class="sv-composer"><div class="sv-pick"><button class="sv-ctx on"></button></div><textarea></textarea></div>`;
  tile.appendChild(host);
  document.body.appendChild(tile);
  const sent = [];
  const e = { name, host, tag: name, cmdSeq: 0, pending: new Map(), where: "local", agent: "claude", contextUsage: USAGE };
  e.ws = {
    readyState: 1,
    send(raw) {
      const cmd = JSON.parse(raw);
      sent.push(cmd);
      const data = cmd.op === "context" ? USAGE : cmd.op === "compact" ? { queued, cid: cmd.cid } : {};
      queueMicrotask(() => e.pending.get(cmd.cid)?.({ ok: true, data }));
    },
  };
  return { e, sent };
}

function clear() {
  for (const stray of document.querySelectorAll(".tile, .sv-menu, .sv-scrim, .ctx-fill")) stray.remove();
  document.body.classList.remove("experience-next");
}

const settle = () => new Promise((ok) => setTimeout(ok, 0));

test("the gauge opens a window that splits the context into conversation, setup, reserved, free and outside", async () => {
  clear();
  const { e } = seat("ctx-groups");
  openContextWindow(e);
  await settle();
  const box = e.menu.el;
  assert.equal(e.menu.kind, "context");
  assert.ok(e.host.querySelector(".sv-ctx").classList.contains("open"), "the gauge stays lit while its window is open");
  const groups = [...box.querySelectorAll(".g > span:first-child")].map((g) => g.textContent);
  assert.deepEqual(groups, ["Conversation", "Setup", "Reserved", "Free", "Outside the window"]);
  assert.ok(box.querySelector(".cw").classList.contains("hot"), "above 90% the window turns hot");
  assert.equal(box.querySelector(".go").textContent.includes("Compact conversation"), true);
  assert.equal(box.querySelector(".ft").children.length, 1, "the footer carries only the button");
  clear();
});

test("a setup row with detail unfolds into its parts, and skills past six fold into one line", async () => {
  clear();
  const { e } = seat("ctx-fold");
  openContextWindow(e);
  await settle();
  const skills = [...e.menu.el.querySelectorAll(".r.more")].find((row) => row.textContent.includes("Skills"));
  skills.click();
  const parts = [...e.menu.el.querySelectorAll(".r.sub .nm")].map((n) => n.textContent);
  assert.equal(parts.length, 7);
  assert.equal(parts.at(-1), "+ 3 more");
  clear();
});

test("clicking the gauge again closes the window", async () => {
  clear();
  const { e } = seat("ctx-toggle");
  openContextWindow(e);
  await settle();
  openContextWindow(e);
  assert.equal(document.querySelector(".sv-ctxw"), null);
  assert.equal(e.host.querySelector(".sv-ctx").classList.contains("open"), false);
  clear();
});

test("compacting mid-turn closes the window and queues a system item under the driver's cid", async () => {
  clear();
  const { e, sent } = seat("ctx-queue", { queued: true });
  openContextWindow(e);
  await settle();
  await askToCompact(e, USAGE);
  const asked = sent.find((cmd) => cmd.op === "compact");
  const item = e.host.querySelector(".sv-qitem.sys");
  assert.equal(document.querySelector(".sv-ctxw"), null, "the window closes on the click");
  assert.equal(item.dataset.cid, asked.cid, "the queue item answers to the cid the driver queued");
  assert.match(item.textContent, /frees about 129k/);
  assert.deepEqual(e.queuedEls, [item]);
  clear();
});

test("when the queued compact leaves the queue it goes away without becoming a chat bubble", async () => {
  clear();
  const { e } = seat("ctx-dequeue", { queued: true });
  await askToCompact(e, USAGE);
  const item = e.host.querySelector(".sv-qitem.sys");
  const bubbles = e.host.querySelectorAll(".sv-user").length;
  svDequeue(e, item);
  assert.equal(e.host.querySelector(".sv-qitem.sys"), null);
  assert.equal(e.host.querySelectorAll(".sv-user").length, bubbles);
  assert.deepEqual(e.queuedEls, []);
  clear();
});

test("dropping the queued compact unsays it by its cid", async () => {
  clear();
  const { e, sent } = seat("ctx-drop", { queued: true });
  await askToCompact(e, USAGE);
  const cid = e.host.querySelector(".sv-qitem.sys").dataset.cid;
  e.host.querySelector(".sv-qitem.sys .qdrop").click();
  await settle();
  assert.deepEqual(sent.at(-1), { type: "unsay", target: cid, cid: sent.at(-1).cid });
  assert.equal(e.host.querySelector(".sv-qitem.sys"), null);
  clear();
});

test("the compacting board is laid on the card's real size even when it is caught mid-flip", () => {
  const { e } = seat("flip-seat");
  const tile = e.host.closest(".tile");
  const scroll = e.host.querySelector(".sv-scroll");
  const scaled = { left: 100, top: 50, right: 500, bottom: 350, width: 400, height: 300 };
  Object.defineProperty(tile, "offsetWidth", { value: 800, configurable: true });
  Object.defineProperty(tile, "offsetHeight", { value: 600, configurable: true });
  tile.getBoundingClientRect = () => scaled;
  scroll.getBoundingClientRect = () => scaled;
  startCompactShow(e);
  const layer = tile.querySelector(".ctx-fill");
  assert.equal(layer.style.left, "0px");
  assert.equal(layer.style.top, "2px");
  assert.equal(layer.style.width, "798px");
  assert.equal(layer.style.height, "596px");
  dropCompactShow(e);
  clear();
});
