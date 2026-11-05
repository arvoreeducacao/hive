import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state } from "./dom.mjs";

await state();
const { fillWithPastes, foldPastes, isLongPaste, outboundPastes, pasteAt, pasteMark, pastePeek, pasteSpots, pasteStore, pastedPieces } = await app("pasted-text");

const HERE = fileURLToPath(new URL("..", import.meta.url));
const lines = (n) => Array.from({ length: n }, (_, i) => `linha ${i + 1}`).join("\n");

test("a short paste stays words in the box; ten lines or a thousand characters become a mark", () => {
  assert.equal(isLongPaste("uma linha só"), false);
  assert.equal(isLongPaste(lines(9)), false);
  assert.equal(isLongPaste(`${lines(9)}\n\n`), false, "trailing newlines are not lines");
  assert.equal(isLongPaste(lines(10)), true);
  assert.equal(isLongPaste("x".repeat(1000)), true);
  assert.equal(pasteMark(2, lines(232)), "[Pasted text #2 +232 lines]");
});

test("the mark goes out as the whole paste, wrapped, and a mark with nothing behind it goes out as it is", () => {
  const held = new Map([[1, lines(12)]]);
  const out = outboundPastes("revisa isso: [Pasted text #1 +12 lines] foca no fim [Pasted text #9 +3 lines]", held);
  assert.equal(out, `revisa isso: <pasted_content>\n${lines(12)}\n</pasted_content> foca no fim [Pasted text #9 +3 lines]`);
});

test("a message taken back into the box folds its pastes again", () => {
  const sent = `antes\n<pasted_content>\n${lines(12)}\n</pasted_content>\ndepois`;
  const kept = [];
  const back = foldPastes(sent, (words) => { kept.push(words); return pasteMark(kept.length, words); });
  assert.equal(back, "antes\n[Pasted text #1 +12 lines]\ndepois");
  assert.equal(kept[0], lines(12));
});

test("the caret on a mark finds it; the caret at its edges does not", () => {
  const said = "olha [Pasted text #3 +40 lines] aqui";
  const [spot] = pasteSpots(said);
  assert.equal(pasteAt(said, spot.start), null);
  assert.equal(pasteAt(said, spot.start + 1).n, 3);
  assert.equal(pasteAt(said, spot.end), null);
});

test("a sent message splits into its words and its folded pastes, in order", () => {
  const pieces = pastedPieces(`revisa:\n<pasted_content>\n${lines(12)}\n</pasted_content>\nfoca no fim`);
  assert.deepEqual(pieces.map((one) => one.kind), ["text", "paste", "text"]);
  assert.equal(pieces[1].text, lines(12));
});

test("in the chat the paste is a closed block whose head toggles it and whose words are kept whole", () => {
  const el = document.createElement("div");
  fillWithPastes(el, `revisa:\n<pasted_content>\n<b>${lines(12)}</b>\n</pasted_content>`, (part, words) => { part.textContent = words; });
  const card = el.querySelector("details.sv-paste");
  assert.ok(card, "the paste is a details block");
  assert.equal(card.open, false, "it starts closed");
  assert.match(card.querySelector("summary").textContent, /Pasted text/);
  assert.match(card.querySelector("summary").textContent, /12 lines/);
  assert.equal(card.querySelector("pre").textContent, `<b>${lines(12)}</b>`, "the words are text, never html");
  assert.equal(el.querySelector(".sv-said-part").textContent, "revisa:");
});

test("the store survives a reload of the page and empties after the send", () => {
  localStorage.clear();
  const one = pasteStore(() => "seat-a");
  const n = one.add(lines(12));
  const again = pasteStore(() => "seat-a");
  assert.equal(again.get(n), lines(12));
  assert.equal(again.add("outro"), n + 1, "numbers keep counting after the reload");
  again.clear();
  assert.equal(pasteStore(() => "seat-a").count(), 0);
});

test("the peek opens on the mark, closes on its head and on esc, and what is edited there is what goes", () => {
  localStorage.clear();
  const composer = document.createElement("form");
  const tray = document.createElement("div");
  tray.className = "sv-attach";
  const box = document.createElement("textarea");
  composer.append(tray, box);
  document.body.append(composer);
  const store = pasteStore(() => "seat-b");
  const n = store.add(lines(12));
  const peek = pastePeek(composer, box, store);
  peek.show(n);
  assert.equal(peek.el.hidden, false);
  assert.equal(composer.querySelector("textarea"), box, "the box is still the first textarea of the composer");
  assert.equal(peek.el.parentElement, tray, "the peek rides in the tray over the box");
  assert.equal(tray.classList.contains("on"), true, "the tray shows while the peek is open");
  assert.equal(peek.el.querySelector(".pp-body").textContent, lines(12));
  assert.equal(peek.el.querySelector("textarea"), null, "the peek never carries a textarea");
  peek.el.querySelector(".pp-head").click();
  assert.equal(peek.el.hidden, true, "the head closes it");
  assert.equal(tray.classList.contains("on"), false, "an empty tray hides again");
  peek.show(n);
  const body = peek.el.querySelector(".pp-body");
  body.textContent = "trocado";
  body.dispatchEvent(new Event("input"));
  assert.equal(store.get(n), "trocado");
  body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(peek.el.hidden, true, "esc closes it");
  composer.remove();
});

test("the composer and the chat are wired to the paste", () => {
  const stretches = readFileSync(join(HERE, "src/app/chat-stretches.js"), "utf8");
  assert.match(stretches, /textarea\.addEventListener\("paste"/);
  assert.match(stretches, /outboundPastes\(woven\.text, e\.pastes\.held\)/);
  const model = readFileSync(join(HERE, "src/app/conversation-model.js"), "utf8");
  assert.match(model, /hasPasted\(words\) \? fillWithPastes/);
});
