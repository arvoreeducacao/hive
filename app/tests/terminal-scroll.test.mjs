import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
let history = "";
const realFetch = globalThis.fetch;
globalThis.fetch = (url) => {
  const said = String(url);
  const body = said.startsWith("/api/history") ? { text: history } : { ok: true };
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
};
after(() => { globalThis.fetch = realFetch; });

const { IS_MAC } = await app("core");
const { navigateTerminal, selectEverything, backToLive } = await app("terminal-history");
const { getTerminal } = await app("terminal-pool");
const { pool } = await app("leader-key");

const settle = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((done) => setTimeout(done, 5));
  await new Promise((done) => requestAnimationFrame(done));
};

function recorder(rows = 24) {
  const calls = [];
  const term = {
    rows,
    cols: 80,
    calls,
    bottom: true,
    scrollLines(n) { calls.push(["lines", n]); },
    scrollToTop() { calls.push(["top"]); },
    scrollToBottom() { calls.push(["bottom"]); },
    selectAll() { calls.push(["all"]); },
    reset() { calls.push(["reset"]); },
    write(text, done) { calls.push(["write", text.split("\r\n").length]); done?.(); },
    atBottom() { return this.bottom; },
    focus() {}
  };
  return term;
}

function entry(name) {
  const well = document.createElement("div");
  const host = document.createElement("div");
  well.append(host);
  document.body.append(well);
  const term = recorder();
  const hist = { term: recorder(), fit: { fit() {} }, wrap: document.createElement("div"), host: document.createElement("div"), opened: true };
  return { name, where: "local", host, term, hist, lookingBack: false, loadingBack: false, ws: null };
}

const longHistory = () => Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n");

test("Shift+PageUp from the live screen opens the history one page up, and the next one goes a page further", async () => {
  history = longHistory();
  const e = entry("seat-page");
  await navigateTerminal(e, "page-up");
  assert.ok(e.lookingBack, "the history is on screen");
  assert.ok(e.host.parentElement.contains(e.hist.wrap));
  assert.deepEqual(e.hist.term.calls.slice(-2), [["bottom"], ["lines", -23]], "scrolled up a page from the end");
  await navigateTerminal(e, "page-up");
  assert.deepEqual(e.hist.term.calls.at(-1), ["lines", -23]);
});

test("Shift+PageDown walks back down, and past the end returns to the live screen", async () => {
  history = longHistory();
  const e = entry("seat-down");
  await navigateTerminal(e, "page-up");
  e.hist.term.bottom = false;
  await navigateTerminal(e, "page-down");
  assert.deepEqual(e.hist.term.calls.at(-1), ["lines", 23]);
  e.hist.term.bottom = true;
  await navigateTerminal(e, "page-down");
  assert.equal(e.lookingBack, false, "at the end it is live again");
  await navigateTerminal(e, "page-down");
  assert.deepEqual(e.term.calls.at(-1), ["lines", 23], "live, it pages the terminal's own scrollback");
});

test("⌘⇧Home jumps to the first line kept and ⌘⇧End back to the latest output", async () => {
  history = longHistory();
  const e = entry("seat-ends");
  await navigateTerminal(e, "top");
  assert.ok(e.lookingBack);
  assert.deepEqual(e.hist.term.calls.at(-1), ["top"]);
  await navigateTerminal(e, "bottom");
  assert.equal(e.lookingBack, false);
  assert.deepEqual(e.term.calls.at(-1), ["bottom"]);
});

test("with nothing above the screen, the keys scroll the terminal itself", async () => {
  history = "one\ntwo";
  const e = entry("seat-short");
  await navigateTerminal(e, "page-up");
  assert.equal(e.lookingBack, false);
  assert.deepEqual(e.term.calls.at(-1), ["lines", -23]);
  await navigateTerminal(e, "top");
  assert.deepEqual(e.term.calls.at(-1), ["top"]);
});

test("select all takes every line the terminal kept, not only the screen", async () => {
  history = longHistory();
  const e = entry("seat-all");
  await selectEverything(e);
  assert.ok(e.lookingBack, "the whole history is brought up to be selected");
  assert.deepEqual(e.hist.term.calls.at(-1), ["all"]);
  backToLive(e);
  history = "short";
  const small = entry("seat-small");
  await selectEverything(small);
  assert.deepEqual(small.term.calls.at(-1), ["all"], "a short one is selected where it is");
});

test("every terminal of the app hands the scroll and select keys to the Hive and keeps them from the program", async () => {
  const e = getTerminal({ name: "seat-keys", where: "local" });
  try {
    const handler = e.term.keyHandler;
    assert.equal(typeof handler, "function", "the terminal has the Hive's key handler");
    const ev = new KeyboardEvent("keydown", { key: "PageUp", code: "PageUp", shiftKey: true, cancelable: true });
    assert.equal(handler(ev), false, "the program never sees it");
    assert.ok(ev.defaultPrevented);
    const all = new KeyboardEvent("keydown", { key: "a", code: "KeyA", metaKey: IS_MAC, ctrlKey: !IS_MAC, shiftKey: !IS_MAC, cancelable: true });
    assert.equal(handler(all), false);
    const plain = new KeyboardEvent("keydown", { key: "PageUp", code: "PageUp", cancelable: true });
    assert.equal(handler(plain), true, "a bare PageUp still goes to the program");
    e.lookingBack = true;
    e.hist = { wrap: document.createElement("div"), term: recorder() };
    assert.equal(handler(new KeyboardEvent("keydown", { key: "l", code: "KeyL", cancelable: true })), true);
    assert.equal(e.lookingBack, false, "typing while looking back returns to the live screen");
    await settle();
  } finally {
    pool.delete("seat-keys");
  }
});

const wrapperClass = () => {
  const body = readFileSync(join(HERE, "assets/ghostty/term.mjs"), "utf8")
    .replace('import { GhosttyTerminalSurface } from "/assets/ghostty/ghostty.mjs";', "")
    .replace(/export class GhosttyTerm/, "class GhosttyTerm");
  return new Function("GhosttyTerminalSurface", `${body}; return GhosttyTerm;`)(undefined);
};

test("the ghostty terminal selects everything it keeps and scrolls to its first line", () => {
  const GhosttyTerm = wrapperClass();
  const term = new GhosttyTerm({ theme: {} });
  const done = [];
  term.onSelectionChange(() => done.push("selection"));
  term.selectAll();
  assert.deepEqual(done, [], "nothing happens before the surface exists");
  term.surface = {
    core: { selectAll: () => done.push("all"), scrollbarState: () => ({ total: 300, offset: 120, len: 24 }), scroll: (rows) => done.push(["scroll", rows]) },
    requestRender: () => done.push("render")
  };
  for (const run of term.pending.splice(0)) run();
  assert.deepEqual(done, ["all", "render", "selection"], "it selects, repaints and tells the copy-on-select");
  term.scrollToTop();
  assert.deepEqual(done.at(-2), ["scroll", -120], "up by as many lines as it is from the top");
});
