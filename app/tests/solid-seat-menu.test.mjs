import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";

const st = await state();
globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ prs: st.prs }), json: async () => ({ prs: st.prs }) });
await views();
const { closeFinish, closePrPop, closeSeatMenu, finishOn, openFinish, openMenuRows, openSeatMenu, paintPrButton, seatMenuBack, seatMenuOn, togglePrPop } = await app("seat-menu");
const { renderMarkdown } = await app("core");

const menu = document.getElementById("seatmenu");
const finish = document.getElementById("finish");
const prButton = document.getElementById("btn-prs");

const fix = (target, name, value) => Object.defineProperty(target, name, { value, configurable: true, writable: true });

function sized(el, width, height) {
  fix(el, "getBoundingClientRect", () => ({ width, height, left: 0, top: 0, right: width, bottom: height }));
}

function screen(width, height) {
  fix(globalThis, "innerWidth", width);
  fix(globalThis, "innerHeight", height);
}

const raycast = (on) => document.body.classList.toggle("experience-raycast", on);

function seats(list) {
  st.data = { pod: { up: true, name: "pod-1" }, sessions: list, archived: [], spawning: [] };
  st.blocks = [{ id: "b1", ws: st.space, keys: list.map((s) => s.name) }];
  st.block = 0;
  st.open = "";
  st.typing = "";
  st.threads = [];
}

test("the seat menu is drawn by its Solid view on #seatmenu, which it opens, names and places", () => {
  sized(menu, 240, 300);
  screen(1000, 700);
  openMenuRows("a seat", [{ label: "go", note: "⌘1", go() {} }, { sep: true }, { label: "close", danger: true, go() {} }], 120, 80);
  assert.equal(menu.dataset.view, "solid");
  assert.ok(menu.classList.contains("on"));
  assert.equal(seatMenuOn(), true);
  assert.equal(menu.getAttribute("aria-label"), "a seat");
  assert.deepEqual([menu.style.left, menu.style.top], ["120px", "80px"]);
  assert.deepEqual([...menu.querySelectorAll("button.ghost")].map((el) => el.textContent), ["go", "close"]);
  closeSeatMenu();
});

test("a menu near the edge of the window is pulled back inside it, six pixels from the edge", () => {
  sized(menu, 240, 300);
  screen(1000, 700);
  openMenuRows("a seat", [{ label: "go", go() {} }], 900, 650);
  assert.deepEqual([menu.style.left, menu.style.top], [`${1000 - 240 - 6}px`, `${700 - 300 - 6}px`]);
  openMenuRows("a seat", [{ label: "go", go() {} }], -40, -40);
  assert.deepEqual([menu.style.left, menu.style.top], ["6px", "6px"]);
  closeSeatMenu();
});

test("a menu with no caption is named for what it is, and closing only hides it", () => {
  openMenuRows("", [{ label: "go", go() {} }], 10, 10);
  assert.equal(menu.getAttribute("aria-label"), "what to do with this chat or block");
  closeSeatMenu();
  assert.ok(!menu.classList.contains("on"));
  assert.equal(seatMenuOn(), false);
  assert.equal(menu.querySelectorAll("button.ghost").length, 1, "the rows stay drawn behind the closed menu, as before");
});

test("a submenu opens in place: same spot, its own name, and the way back names the menu again", () => {
  sized(menu, 240, 300);
  screen(1000, 700);
  openMenuRows("a seat", [{ label: "hide until…", sub: [{ label: "it finishes", go() {} }] }], 200, 100);
  menu.querySelector('[data-i="0"]').click();
  assert.equal(menu.getAttribute("aria-label"), "hide until…");
  assert.deepEqual([menu.style.left, menu.style.top], ["200px", "100px"]);
  assert.ok(menu.querySelector(".mback"));
  assert.equal(seatMenuBack(), true);
  assert.equal(menu.getAttribute("aria-label"), "a seat");
  closeSeatMenu();
});

test("every paint names the menu again, so a translation pass that rewrote the name does not stick", () => {
  openMenuRows("a seat", [{ label: "go", go() {} }], 10, 10);
  menu.setAttribute("aria-label", "o que fazer com este chat ou bloco");
  openMenuRows("a seat", [{ label: "go", go() {} }], 10, 10);
  assert.equal(menu.getAttribute("aria-label"), "a seat");
  closeSeatMenu();
  menu.setAttribute("aria-label", "o que fazer com este chat ou bloco");
  assert.equal(menu.getAttribute("aria-label"), "o que fazer com este chat ou bloco", "closing leaves the name alone, as before");
});

test("with the flag the chat menu opens placed, named after the chat and with the filter focused", () => {
  raycast(true);
  try {
    seats([{ name: "q1", title: "valores incoerentes", state: "idle" }]);
    sized(menu, 240, 300);
    screen(1000, 700);
    openSeatMenu(st.data.sessions[0], 300, 200);
    assert.ok(menu.classList.contains("on"));
    assert.equal(menu.getAttribute("aria-label"), "valores incoerentes");
    assert.deepEqual([menu.style.left, menu.style.top], ["300px", "200px"]);
    assert.equal(document.activeElement, menu.querySelector(".mi-q"));
    closeSeatMenu();
  } finally {
    raycast(false);
  }
});

const said = { at: Date.now() - 120000, ms: 95000, turns: 3, cost: 0.42, text: "Done. See **the PR**.", clipped: true, stop: "max_tokens", denials: 2 };

function withFinish(finishAs = said, prs = []) {
  seats([{ name: "q1", title: "valores incoerentes", state: "idle", finish: finishAs }]);
  st.prs = prs;
}

test("the finish card is drawn by its Solid view on #finish: caption, facts, warnings, words and the way out", () => {
  withFinish(said, [{ key: "own/repo#7", repo: "own/repo", number: 7, title: "fix the import", url: "https://github.com/own/repo/pull/7", session: "q1", state: "open" }]);
  openFinish("q1", { left: 100, bottom: 50 });
  assert.equal(finish.dataset.view, "solid");
  assert.ok(finish.classList.contains("on"));
  assert.equal(finishOn(), true);
  assert.deepEqual([...finish.children].map((el) => el.className), ["cap", "fin-meta", "fin-say sv-msg md", "fin-pr md-art", "fin-go"]);
  const cap = finish.querySelector(".cap");
  assert.equal(cap.childNodes.length, 1, "the caption is one run of text");
  assert.equal(cap.textContent, "valores incoerentes — what it left for you");
  const meta = [...finish.querySelectorAll(".fin-meta span")];
  assert.deepEqual(meta.filter((el) => !el.classList.contains("bad")).map((el) => el.textContent), ["finished 2 min ago", "took 2 min", "3 turns", "$0.42"]);
  assert.deepEqual(meta.filter((el) => el.classList.contains("bad")).map((el) => el.textContent), ["it stopped on max_tokens, not on its own", "2 permissions denied"]);
  assert.equal(finish.querySelector(".fin-say").innerHTML, `${renderMarkdown(said.text)}<span class="fin-clip">the rest of it is in the seat</span>`, "the closing word is the rendered markdown, as before");
  assert.equal(finish.querySelector(".fin-say .fin-clip").textContent, "the rest of it is in the seat");
  const pr = finish.querySelector("a.fin-pr");
  assert.deepEqual([pr.getAttribute("href"), pr.getAttribute("target"), pr.getAttribute("rel")], ["https://github.com/own/repo/pull/7", "_blank", "noreferrer"]);
  assert.deepEqual([pr.querySelector("b").textContent, pr.querySelector("span").textContent], ["repo#7", "fix the import"]);
  assert.equal(pr.dataset.here, "1", "its links are wired to open in the hive");
  assert.deepEqual([...finish.querySelectorAll(".fin-go button")].map((el) => [el.className, el.textContent]), [["ghost b-open", "open the chat"], ["ghost b-shut", "close"]]);
  closeFinish();
});

test("the finish card opens under the tile it came from, or in the middle of the window, and from its top", () => {
  withFinish();
  sized(finish, 460, 300);
  screen(1200, 800);
  finish.scrollTop = 90;
  openFinish("q1", { left: 140, bottom: 60 });
  assert.deepEqual([finish.style.left, finish.style.top], ["140px", "66px"]);
  assert.equal(finish.scrollTop, 0);
  openFinish("q1", null);
  assert.deepEqual([finish.style.left, finish.style.top], [`${600 - 230}px`, "86px"]);
  openFinish("q1", { left: 1100, bottom: 700 });
  assert.deepEqual([finish.style.left, finish.style.top], [`${1200 - 460 - 6}px`, `${800 - 300 - 6}px`]);
  closeFinish();
});

test("a chat that stopped without a closing word says so, and nothing is clipped", () => {
  withFinish({ at: Date.now() });
  openFinish("q1", null);
  assert.equal(finish.querySelector(".fin-say p").textContent, "It stopped without a closing word — the seat itself is the only place left to look.");
  assert.equal(finish.querySelector(".fin-clip"), null);
  assert.equal(finish.querySelector(".fin-pr"), null);
  closeFinish();
});

test("each opening draws the card anew, as the old innerHTML did, and closing only hides it", () => {
  withFinish();
  openFinish("q1", null);
  const before = finish.querySelector(".fin-say");
  openFinish("q1", null);
  assert.notEqual(finish.querySelector(".fin-say"), before);
  closeFinish();
  assert.ok(!finish.classList.contains("on"));
  assert.equal(finishOn(), false);
  assert.ok(finish.querySelector(".fin-say"), "the card stays drawn behind, hidden");
});

test("the card's buttons close it, and the first one opens the chat", () => {
  withFinish();
  openFinish("q1", null);
  finish.querySelector(".b-shut").click();
  assert.equal(finishOn(), false);
  openFinish("q1", null);
  finish.querySelector(".b-open").click();
  assert.equal(finishOn(), false);
  assert.equal(st.open, "q1");
  st.open = "";
});

test("a chat with nothing left for you opens no card", () => {
  seats([{ name: "q2", title: "x", state: "idle" }]);
  openFinish("q2", null);
  assert.equal(finishOn(), false);
});

const pr = (over) => ({ key: `own/repo#${over.number}`, repo: "own/repo", state: "open", ci: "running", updatedAt: "2026-11-25T10:00:00Z", ...over });

test("the PR button shows only when the hive watches a PR, and turns hot when one is failing", () => {
  st.prs = [];
  paintPrButton();
  assert.equal(prButton.hidden, true);
  st.prs = [pr({ number: 1 })];
  paintPrButton();
  assert.equal(prButton.hidden, false);
  assert.ok(!prButton.classList.contains("hot"));
  st.prs = [pr({ number: 1, ci: "failed" })];
  paintPrButton();
  assert.ok(prButton.classList.contains("hot"));
  st.prs = [];
  paintPrButton();
});

test("with the flag the PR button carries its keys in the tooltip on every paint and leaves the hot mark alone", () => {
  st.prs = [pr({ number: 1, ci: "failed" })];
  paintPrButton();
  assert.ok(prButton.classList.contains("hot"));
  raycast(true);
  try {
    paintPrButton();
    assert.match(prButton.title, /^the pull requests the hive is watching · /);
    const title = prButton.title;
    prButton.title = "os pull requests que a hive acompanha";
    paintPrButton();
    assert.equal(prButton.title, title, "a translation pass that rewrote it does not stick");
    assert.ok(prButton.classList.contains("hot"), "the mark is left as the plain look had it");
  } finally {
    raycast(false);
    st.prs = [];
    paintPrButton();
  }
});

test("the PR button says whether its panel is open", () => {
  st.prs = [pr({ number: 1 })];
  paintPrButton();
  assert.equal(prButton.getAttribute("aria-expanded"), "false");
  togglePrPop();
  assert.equal(prButton.getAttribute("aria-expanded"), "true");
  paintPrButton();
  assert.equal(prButton.getAttribute("aria-expanded"), "true", "a repaint keeps it");
  closePrPop();
  assert.equal(prButton.getAttribute("aria-expanded"), "false");
  st.prs = [];
  paintPrButton();
});

test("closing the PR panel twice is the same as closing it once", () => {
  closePrPop();
  closePrPop();
  assert.equal(document.getElementById("prpop").hidden, true);
  assert.equal(prButton.getAttribute("aria-expanded"), "false");
});

test("escape closes the finish card first, then the menu", () => {
  withFinish();
  openFinish("q1", null);
  document.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.equal(finishOn(), false);
  openMenuRows("a seat", [{ label: "go", go() {} }], 10, 10);
  document.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.equal(seatMenuOn(), false);
});
