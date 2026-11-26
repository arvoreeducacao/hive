import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { app, views } from "./dom.mjs";

const { svConvFlushAll } = await app("conversation-model");

const APP = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(APP, "app.html"), "utf8");

const PLAN = `Vou repartir em tres frentes.

## O que muda
1. o pai paga um nascimento
2. o filho nasce com by

\`\`\`frentes
campo-da-seta · claude/opus · aqui · dev-workspaces · desenha a seta entre pai e filho
teto-do-spawn · codex/gpt-5 · servidor · dev-workspaces · o orcamento de 3 nascimentos
\`\`\`
`;

const planCard = async (name, seat = {}, plan = PLAN) => {
  await views();
  const { svEvent } = await app("chat-and-panes");
  const { getStructured } = await app("chat-stretches");
  const e = getStructured({ name, where: seat.where || "local" });
  if (seat.agent) e.agent = seat.agent;
  const sent = [];
  e.ws = { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)) };
  svEvent(e, { type: "driver", subtype: "plan", id: "p1", plan });
  return { e, sent, card: (svConvFlushAll(), e.host).querySelector(".sv-plan") };
};

const BLANK_PLAN = `Uma frente so.

\`\`\`frentes
estoque-do-livro · padrao · · acme · o estoque que a loja mostra
\`\`\`
`;

test("the plan comes back as a card with one row per front, not as text", async () => {
  const { card } = await planCard("plan-card-rows");
  assert.ok(card, "no plan card in the chat");
  assert.equal(card.querySelector(".ph .tag").textContent.toLowerCase(), "plan");
  const rows = [...card.querySelectorAll(".prow")];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].querySelector(".rn").textContent, "campo-da-seta");
  assert.equal(rows[0].querySelector(".rd").textContent, "dev-workspaces · desenha a seta entre pai e filho");
  assert.equal(rows[1].querySelector(".rn").textContent, "teto-do-spawn");
  assert.ok(!card.querySelector(".pb").textContent.includes("campo-da-seta"), "the fronts block leaked into the prose");
  assert.equal(card.querySelectorAll(".pf .btn").length, 2);
});

test("every front is a control: which program, which model, and which side it runs on", async () => {
  const { card } = await planCard("plan-card-pickers");
  const rows = [...card.querySelectorAll(".prow")];
  for (const row of rows) {
    assert.ok(row.querySelector("select.ra"), "no agent picker on the row");
    assert.ok(row.querySelector("select.rm"), "no model picker on the row");
    assert.ok(row.querySelector("select.rw"), "no side picker on the row");
  }
  assert.equal(rows[0].querySelector("select.rw").value, "local", "“aqui” did not preselect this machine");
  assert.equal(rows[1].querySelector("select.rw").value, "cloud", "“servidor” did not preselect the server");
  assert.equal(rows[0].querySelector("select.ra").value, "claude");
  const model = rows[0].querySelector("select.rm");
  assert.equal(model.value, "opus", "the model the plan asked for is not the one the row carries");
  assert.ok([...rows[0].querySelectorAll("select.rw option")].map((o) => o.value).join(",") === "local,cloud");
});

test("approving sends what the person chose on the card, not what the plan wrote", async () => {
  const { card, sent } = await planCard("plan-card-answer");
  const rows = [...card.querySelectorAll(".prow")];
  const choose = (box, value) => {
    box.value = value;
    box.dispatchEvent(new window.Event("change"));
  };
  choose(rows[0].querySelector("select.rw"), "cloud");
  choose(rows[0].querySelector("select.rm"), "");
  card.querySelector(".pf .btn.pri").dispatchEvent(new window.Event("click"));
  const answer = sent.find((one) => one.type === "answer");
  assert.ok(answer, "the approval never left the card");
  assert.equal(answer.answers.plan, "go");
  assert.deepEqual(answer.answers.fronts, [
    { name: "campo-da-seta", agent: "claude", model: "", where: "cloud" },
    { name: "teto-do-spawn", agent: "codex", model: "gpt-5", where: "cloud" },
  ]);
});

test("a column the plan left blank starts on what this chat itself runs", async () => {
  const { card } = await planCard("plan-card-inherits", { where: "cloud", agent: "codex" }, BLANK_PLAN);
  const row = card.querySelector(".prow");
  assert.equal(row.querySelector("select.rw").value, "cloud", "a chat on the server opened its front on this machine");
  assert.equal(row.querySelector("select.ra").value, "codex", "a chat on codex opened its front on another program");
});

test("once it is answered the card is a record: it says what opened and nothing moves", async () => {
  await views();
  const { svEvent } = await app("chat-and-panes");
  const { card, e } = await planCard("plan-card-record");
  svEvent(e, { type: "driver", subtype: "plan_approved", id: "p1", fronts: [
    { name: "campo-da-seta", agent: "codex", model: "gpt-5", where: "cloud" },
  ] });
  const row = card.querySelector(".prow");
  assert.equal(row.querySelector("select.ra").value, "codex");
  assert.equal(row.querySelector("select.rw").value, "cloud");
  assert.equal(row.querySelector("select.rm").value, "gpt-5");
  assert.ok([...card.querySelectorAll("select")].every((box) => box.disabled), "the pickers of an answered card can still be moved");
});

test("the card keeps its parts in order: badge, title and menu in the head, then prose, fronts and foot", async () => {
  const { card } = await planCard("plan-card-order");
  assert.deepEqual([...card.children].map((one) => one.className), ["ph", "pb", "prows", "pf"]);
  assert.deepEqual([...card.querySelector(".ph").children].map((one) => one.className), ["cp-plan-badge", "cp-plan-title", "tag", "say", "phn", "cp-plan-menu"]);
  assert.equal(card.querySelector(".cp-plan-title").tagName, "H3");
  assert.equal(card.querySelector(".cp-plan-title").textContent, "O que muda", "the first heading of the plan names the card");
  assert.equal(card.querySelector(".ph .phn").textContent, "2 chats");
  assert.equal(card.querySelector(".pf .cost").textContent, "2 of 3 of the budget");
});

test("the dots open the plan menu, and save opens a dialog that names the file and says why a save failed", async () => {
  const { card } = await planCard("plan-card-save");
  const pop = card.querySelector(".cp-plan-pop");
  assert.equal(pop.hidden, true);
  card.querySelector(".cp-plan-dots").click();
  assert.equal(pop.hidden, false, "the dots did not open the menu");
  const kept = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (path, options = {}) => {
    asked.push({ path: String(path), body: JSON.parse(options.body || "{}") });
    return { json: async () => ({ error: "no such folder" }) };
  };
  try {
    pop.querySelector('[data-act="save"]').click();
    assert.equal(pop.hidden, true, "choosing save left the menu open");
    const dialog = card.lastElementChild;
    assert.equal(dialog.className, "cp-plan-save", "the save dialog is not the last part of the card");
    assert.equal(dialog.getAttribute("role"), "dialog");
    assert.equal(dialog.querySelector("input").value, "plans/o-que-muda.md");
    assert.equal(dialog.querySelector(".cp-plan-save-err").hidden, true);
    dialog.dispatchEvent(new window.Event("submit"));
    await new Promise((done) => setTimeout(done, 10));
    assert.equal(asked[0].path, "/api/seat/plan-file");
    assert.equal(asked[0].body.path, "plans/o-que-muda.md");
    assert.equal(asked[0].body.text, `${PLAN.trimEnd()}\n`);
    assert.equal(dialog.querySelector(".cp-plan-save-err").hidden, false, "a failed save said nothing");
    assert.equal(dialog.querySelector(".cp-plan-save-err").textContent, "no such folder");
    dialog.querySelector("input").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    assert.equal(card.querySelector(".cp-plan-save"), null, "escape did not close the dialog");
  } finally {
    globalThis.fetch = kept;
  }
});

test("copy puts the whole plan on the clipboard, says so, and then closes the menu", async () => {
  const { card } = await planCard("plan-card-copy");
  const pop = card.querySelector(".cp-plan-pop");
  const copy = pop.querySelector('[data-act="copy"]');
  const kept = Object.getOwnPropertyDescriptor(window.navigator, "clipboard");
  const written = [];
  Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { written.push(text); } } });
  try {
    card.querySelector(".cp-plan-dots").click();
    copy.click();
    await new Promise((done) => setTimeout(done, 10));
    assert.deepEqual(written, [`${PLAN.trimEnd()}\n`], "the clipboard did not get the plan as written");
    assert.equal(copy.textContent, "Copied!");
    assert.equal(pop.hidden, false, "the menu closed before it said the plan was copied");
    await new Promise((done) => setTimeout(done, 950));
    assert.equal(copy.textContent, "Copy to clipboard");
    assert.equal(pop.hidden, true, "the menu stayed open after the copy");
  } finally {
    if (kept) Object.defineProperty(window.navigator, "clipboard", kept);
    else delete window.navigator.clipboard;
  }
});

test("the card never shrinks inside the chat, so what it clips is nothing", () => {
  const rule = page.match(/^\s*\.sv-plan \{[^}]*\}/m)?.[0] || "";
  assert.match(rule, /overflow: hidden/, "the plan card no longer clips — this guard can go");
  assert.match(rule, /flex: none/, ".sv-plan clips its content and is a flex child of .sv-scroll: without flex none it collapses to a sliver");
});

test("each front reads name and what it does on the left, its three pickers on the right", () => {
  assert.match(page, /\.sv-plan \.rn \{ grid-area: 1 \/ 1;/);
  assert.match(page, /\.sv-plan \.rd \{ grid-area: 2 \/ 1;/);
  assert.match(page, /\.sv-plan \.rr \{ grid-area: 1 \/ 2 \/ span 2 \/ 3; justify-self: end;/);
  assert.match(page, /\.sv-plan \.rr \{[^}]*flex-wrap: wrap;/, "three pickers on one row have to wrap on a narrow card");
});
