import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";
import { renderMarkdown } from "../assets/markdown.mjs";

await views();

const st = await state();
const { paintSaidChips } = await app("context-chips");
const { enrichMarkdown } = await app("markdown-rich");
const { hideSeatCard } = await app("seat-hover-card");

const SEAT = {
  name: "bruno",
  title: "Login da API",
  where: "local",
  state: "idle",
  cwd: "/Users/ana/hub/api-acme",
  trees: [{ repo: "api-acme", branch: "feat/login-captcha", path: "/Users/ana/hub/.wt-login", main: false }],
  model: "opus",
  agent: "claude",
  account: ""
};

function known() {
  st.data = { sessions: [{ ...SEAT }], spawning: [] };
  st.prs = [{ session: "bruno", key: "acme/api-acme#12", repo: "acme/api-acme", number: 12, title: "Captcha no login", state: "open" }];
}

function sentChip() {
  const said = document.createElement("div");
  said.className = "sv-user";
  said.textContent = "olha o #bruno";
  paintSaidChips(said);
  document.body.append(said);
  return { chip: said.querySelector(".ctx-chip[data-kind=chat]"), drop: () => said.remove() };
}

const card = () => document.querySelector(".seat-card");

function clock() {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 5_000_000 });
  return { tick: (ms) => mock.timers.tick(ms), stop: () => { hideSeatCard(); mock.timers.reset(); } };
}

const over = (el) => el.dispatchEvent(new dom.MouseEvent("mouseover", { bubbles: true }));
const out = (el) => el.dispatchEvent(new dom.MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
const key = (el, name) => {
  const ev = new dom.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};

test("a chat mention is a focusable link with a spoken name", () => {
  known();
  const { chip, drop } = sentChip();
  assert.ok(chip, "the mention never became a chip");
  assert.equal(chip.getAttribute("role"), "link");
  assert.equal(chip.getAttribute("tabindex"), "0");
  assert.match(chip.getAttribute("aria-label"), /^Login da API · .+ · go to this chat$/);
  drop();
});

test("hovering a chat chip shows the chat's card after the Inbox delay, with its title, repo, branch, model and PR", () => {
  known();
  const time = clock();
  const { chip, drop } = sentChip();
  try {
    over(chip);
    assert.equal(chip.hasAttribute("title"), false, "the native title still competes with the card");
    assert.ok(chip.getAttribute("aria-label"), "the chip lost its spoken name with the title");
    time.tick(599);
    assert.equal(card(), null, "the card came before the Inbox delay");
    time.tick(1);
    const shown = card();
    assert.ok(shown, "the card never came");
    assert.equal(shown.getAttribute("role"), "tooltip");
    assert.equal(chip.getAttribute("aria-describedby"), shown.id);
    assert.ok(shown.parentElement === document.body, "outside a structure the card belongs to the page");
    assert.equal(shown.querySelector(".tx-tip-title").textContent, "Login da API");
    const said = shown.textContent;
    for (const part of ["api-acme", "this machine", "opus", "#12", "Captcha no login"]) assert.ok(said.includes(part), `the card does not say ${part}`);
    assert.ok(shown.querySelector(".tx-mid")?.getAttribute("title") === "feat/login-captcha", "the card does not carry the branch");
    assert.ok(shown.style.top && shown.style.left, "the card was never placed");
  } finally {
    time.stop();
    drop();
  }
});

test("leaving the chip, Esc and a scroll each close the card, and a quick return opens it at once", () => {
  known();
  const time = clock();
  const { chip, drop } = sentChip();
  try {
    over(chip);
    time.tick(600);
    assert.ok(card());
    out(chip);
    assert.equal(card(), null, "the card outlived the pointer");
    over(chip);
    time.tick(0);
    assert.ok(card(), "coming straight back waited the whole delay again");
    const esc = key(chip, "Escape");
    assert.equal(card(), null, "Esc left the card up");
    assert.equal(esc.defaultPrevented, true);
    assert.equal(chip.hasAttribute("aria-describedby"), false);
    out(chip);
    time.tick(1000);
    over(chip);
    time.tick(600);
    assert.ok(card());
    document.dispatchEvent(new dom.Event("scroll"));
    assert.equal(card(), null, "a scroll left the card floating over nothing");
  } finally {
    time.stop();
    drop();
  }
});

test("keyboard focus opens the card, blur closes it, and Enter or Space opens the chat", () => {
  known();
  const time = clock();
  const { chip, drop } = sentChip();
  const opened = [];
  chip.addEventListener("click", () => opened.push(chip.dataset.seat));
  try {
    chip.focus();
    assert.ok(document.activeElement === chip, "the chip cannot take focus");
    time.tick(600);
    assert.ok(card(), "focus never opened the card");
    chip.blur();
    assert.equal(card(), null, "the card outlived the focus");
    for (const name of ["Enter", " "]) assert.equal(key(chip, name).defaultPrevented, true);
    assert.deepEqual(opened, ["bruno", "bruno"]);
  } finally {
    time.stop();
    drop();
  }
});

test("a chat that no longer exists shows no card and keeps its title", () => {
  known();
  const time = clock();
  const { chip, drop } = sentChip();
  try {
    over(chip);
    time.tick(600);
    out(chip);
    assert.equal(chip.hasAttribute("title"), false);
    st.data = { sessions: [], spawning: [] };
    time.tick(1000);
    over(chip);
    time.tick(1000);
    assert.equal(card(), null, "a chat that is gone still showed a card");
    assert.ok(chip.getAttribute("title"), "the chat that is gone lost the title it had");
    const stranger = document.createElement("span");
    stranger.className = "ctx-chip";
    stranger.dataset.kind = "chat";
    stranger.dataset.seat = "nobody";
    stranger.title = "idle · go to this chat";
    document.body.append(stranger);
    over(stranger);
    time.tick(1000);
    assert.equal(card(), null);
    assert.equal(stranger.title, "idle · go to this chat");
    stranger.remove();
  } finally {
    time.stop();
    drop();
  }
});

test("the chat chip in an answer is focusable and shows the same card", () => {
  known();
  const time = clock();
  const answer = document.createElement("div");
  answer.className = "sv-msg md";
  answer.innerHTML = renderMarkdown("veja `hive://seat/bruno`");
  document.body.append(answer);
  try {
    enrichMarkdown(answer);
    const chip = answer.querySelector(".md-chip[data-kind=chat]");
    assert.ok(chip, "the answer's mention never became a chip");
    assert.equal(chip.getAttribute("role"), "link");
    assert.equal(chip.tabIndex, 0);
    assert.match(chip.getAttribute("aria-label"), /^Login da API · /);
    over(chip);
    time.tick(600);
    assert.equal(card()?.querySelector(".tx-tip-title").textContent, "Login da API");
  } finally {
    time.stop();
    answer.remove();
  }
});

test("inside a structure the card hangs in its root, where the structure's look reaches it", () => {
  known();
  const time = clock();
  const root = document.createElement("div");
  root.id = "structure-root";
  const said = document.createElement("div");
  said.textContent = "fala #bruno";
  paintSaidChips(said);
  root.append(said);
  document.body.append(root);
  try {
    over(said.querySelector(".ctx-chip"));
    time.tick(600);
    assert.ok(card()?.parentElement === root);
  } finally {
    time.stop();
    root.remove();
  }
});
