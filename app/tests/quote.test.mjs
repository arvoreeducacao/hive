import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";

const st = await state();
await views();
const { asQuote, getStructured, quoteTray, withQuotes, withoutQuotes } = await app("chat-stretches");
const { splitLeadingQuotes, structPool, svQuoteCard } = await app("structured-seats");
const { svConvActions, svConvFlushAll, svConvKey, svConvLine, svConvPush, svConvSaid, svConvSeed } = await app("conversation-model");
const { mountConversation } = await import(new URL("../src/views.js", import.meta.url).href);
const { blockText } = await app("terminal-history");

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function inTheBrowser(run) {
  const was = globalThis.Event;
  globalThis.Event = dom.Event;
  try { return await run(); } finally { globalThis.Event = was; }
}

const trayOf = () => {
  const tray = document.createElement("div");
  tray.className = "sv-attach";
  let paints = 0;
  return { tray, quotes: quoteTray(tray, () => { paints++; }), reads: () => paints };
};

function seatOf(name, answer) {
  st.data = { sessions: [{ name, where: "local", state: "idle" }], spawning: [] };
  const e = getStructured({ name, where: "local" });
  const sent = [];
  e.ws = {
    readyState: 1,
    send(raw) {
      const cmd = JSON.parse(raw);
      sent.push(cmd);
      queueMicrotask(() => e.pending.get(cmd.cid)?.(answer(cmd)));
    }
  };
  document.body.appendChild(e.host);
  return { e, sent, box: e.host.querySelector("textarea"), submit: () => e.host.querySelector(".sv-composer").dispatchEvent(new dom.Event("submit", { bubbles: true, cancelable: true })) };
}

const held = () => ({ tag: `t${Math.random().toString(36).slice(2, 7)}`, conv: svConvSeed() });

const asNodes = (html) => {
  const hold = document.createElement("div");
  hold.innerHTML = html;
  return hold;
};

test("a quote goes out as a blockquote, one marker per line", () => {
  assert.equal(asQuote("uma linha\noutra"), "> uma linha\n> outra");
});

test("no quote leaves what you typed exactly as you typed it", () => {
  assert.equal(withQuotes([], "só o texto"), "só o texto");
});

test("two quotes stay two blockquotes, and your words come last", () => {
  assert.equal(withQuotes(["um", "dois"], "e daí?"), "> um\n\n> dois\n\ne daí?");
});

test("a message that is only quotes carries no empty tail", () => {
  assert.equal(withQuotes(["um"], ""), "> um");
});

test("quotes pile up and each one can be dropped on its own", () => {
  const { tray, quotes } = trayOf();
  quotes.add("primeiro", "what it answered");
  quotes.add("segundo", "what you asked");
  assert.deepEqual(quotes.all(), ["primeiro", "segundo"]);
  tray.children[0].querySelector(".ax").click();
  assert.deepEqual(quotes.all(), ["segundo"]);
  assert.equal(tray.children.length, 1);
  assert.equal(tray.querySelector(".att.quote .qt").textContent, "segundo");
});

test("the tray shows itself while it holds a quote and hides when the last one goes", () => {
  const { tray, quotes } = trayOf();
  quotes.add("um", "");
  assert.equal(tray.classList.contains("on"), true);
  quotes.clear();
  assert.equal(tray.classList.contains("on"), false);
  assert.equal(quotes.count(), 0);
});

test("the composer is told every time the pile changes", () => {
  const one = trayOf();
  one.quotes.add("um", "");
  one.quotes.clear();
  assert.equal(one.reads(), 2);
});

test("sending clears the quotes, not only the images", async () => {
  await inTheBrowser(async () => {
    const { e, sent, box, submit } = seatOf("quote-send", () => ({ ok: true, queued: true }));
    e.quotes.add("primeiro", "what it answered");
    e.tray.add("/tmp/a.png");
    box.value = "e daí?";
    submit();
    await tick();
    assert.equal(sent[0].text, "> primeiro\n\ne daí?", "the quote did not travel in front of the words");
    assert.equal(e.quotes.count(), 0, "the quotes stayed pinned after the message went");
    assert.equal(e.tray.count(), 0);
    assert.equal(e.host.querySelectorAll(".sv-attach .att").length, 0);
  });
});

test("clearing the images leaves the quotes standing on the same tray", async () => {
  await inTheBrowser(() => {
    const { e } = seatOf("quote-images", () => ({ ok: true }));
    e.quotes.add("fica", "what you asked");
    e.tray.add("/tmp/b.png");
    assert.equal(e.host.querySelectorAll(".sv-attach .att").length, 2);
    e.tray.clear();
    assert.equal(e.tray.count(), 0);
    assert.deepEqual(e.quotes.all(), ["fica"], "the image tray took the quote down with it");
    assert.equal(e.host.querySelectorAll(".sv-attach .att.quote").length, 1);
  });
});

test("the stamp never rides along into the clipboard", () => {
  const block = document.createElement("div");
  block.className = "sv-msg";
  block.innerHTML = `<div class="body">uma resposta</div><div class="sv-stamp"><span class="st-when">2 min</span></div>`;
  const stamp = block.querySelector(".sv-stamp");
  const whileRead = [];
  Object.defineProperty(block, "innerText", { configurable: true, get() { whileRead.push(stamp.style.display); return "uma resposta"; } });
  assert.equal(blockText(block), "uma resposta");
  assert.deepEqual(whileRead, ["none"], "the stamp was still on screen when the block was read into the clipboard");
  assert.equal(stamp.style.display, "", "and it was never put back");
});

test("an answer and what you said get a stamp; the block still streaming does not", () => {
  const e = held();
  const bubble = svConvLine(e, "sv-user", "e daí?");
  const streaming = svConvPush(e, { key: svConvKey(e), kind: "said", parts: [], streaming: true, stamped: false, at: "", said: "" });
  const answer = svConvSaid(e, "pronto");
  assert.equal(bubble.stamped, true);
  assert.equal(streaming.stamped, false);
  assert.equal(answer.stamped, true);
});

test("only a stretch inside one block can be quoted", async () => {
  const { e } = seatOf("quote-pick", () => ({ ok: true }));
  const one = document.createElement("div");
  one.className = "sv-msg";
  one.textContent = "primeira resposta";
  const two = document.createElement("div");
  two.className = "sv-msg";
  two.textContent = "segunda resposta";
  e.scroll.append(one, two);
  const pop = e.host.querySelector(".sv-quote-pop");
  const selecting = (fill) => {
    const sel = document.getSelection();
    const range = document.createRange();
    fill(range);
    sel.removeAllRanges();
    sel.addRange(range);
    e.scroll.dispatchEvent(new dom.MouseEvent("mouseup", { bubbles: true }));
    return tick();
  };

  await selecting((range) => range.selectNodeContents(one));
  assert.equal(pop.classList.contains("on"), true, "a stretch of one answer was not offered as a quote");
  pop.click();
  const note = e.host.querySelector(".cp-quote-note");
  assert.ok(note, "picking a quote opens the note for an optional comment");
  note.querySelector('[data-act="save"]').click();
  assert.deepEqual(e.quotes.pinned(), [{ said: "primeira resposta", kind: "what it answered" }]);

  e.quotes.clear();
  await selecting((range) => { range.setStartBefore(one); range.setEndAfter(two); });
  assert.equal(pop.classList.contains("on"), false, "a selection spilling across two blocks has no single voice, so it must not be quotable");
  assert.equal(e.quotes.count(), 0);
});

test("what the quotes added can be taken back off the front", () => {
  const said = withQuotes(["um", "dois"], "e daí?");
  assert.equal(withoutQuotes(["um", "dois"], said), "e daí?");
});

test("a message that was only quotes comes back empty, not half-stripped", () => {
  assert.equal(withoutQuotes(["um"], withQuotes(["um"], "")), "");
});

test("text you wrote that merely looks like a quote is left alone", () => {
  assert.equal(withoutQuotes([], "> escrevi isso na mão"), "> escrevi isso na mão");
  assert.equal(withoutQuotes(["outro"], "> escrevi isso na mão"), "> escrevi isso na mão");
});

test("a quote pulled back out of the queue keeps the voice it came from", () => {
  const { quotes } = trayOf();
  quotes.add("primeiro", "what it answered");
  const pinned = quotes.pinned();
  assert.deepEqual(pinned, [{ said: "primeiro", kind: "what it answered" }]);
  quotes.clear();
  for (const one of pinned) quotes.add(one.said, one.kind);
  assert.deepEqual(quotes.pinned(), pinned);
});

test("the queue carries the quotes beside the message, the way it carries images", async () => {
  await inTheBrowser(async () => {
    const { e, box, submit } = seatOf("quote-queue", () => ({ ok: true, queued: true, cid: "c9" }));
    e.quotes.add("primeiro", "what it answered");
    box.value = "e daí?";
    submit();
    await tick();
    const item = e.host.querySelector(".sv-qitem");
    assert.ok(item, "nothing was queued");
    assert.deepEqual(JSON.parse(item.dataset.quotes), [{ said: "primeiro", kind: "what it answered" }]);
    assert.equal(item.querySelector(".cp-q-text").textContent.includes("> primeiro"), true, "the queued row shows what goes out, quote and words");

    item.querySelector('[data-act="q-edit"]').click();
    await tick();
    assert.equal(box.value, "e daí?", "the words came back with the quote markers glued on");
    assert.deepEqual(e.quotes.pinned(), [{ said: "primeiro", kind: "what it answered" }], "the quote did not come back onto the tray");
  });
});

test("only what you drafted here pins quotes to the queued message", async () => {
  await inTheBrowser(async () => {
    const { e, sent } = seatOf("quote-outside", () => ({ ok: true, queued: true }));
    e.quotes.add("meu", "what you asked");
    e.type("vindo de fora");
    await tick();
    assert.equal(sent[0].text, "vindo de fora", "a message from elsewhere carried this seat's draft quotes");
    assert.deepEqual(JSON.parse(e.host.querySelector(".sv-qitem").dataset.quotes), []);
    assert.deepEqual(e.quotes.all(), ["meu"], "and the draft quotes were cleared by someone else's message");
  });
});

test("a sent quote is read back out of its own shape, not left as a bare '>'", () => {
  const out = splitLeadingQuotes(withQuotes(["uma linha\noutra"], "e daí?"));
  assert.deepEqual(out, { quotes: ["uma linha\noutra"], rest: "e daí?" });
});

test("two quotes on the way out come back as two quotes on the way in", () => {
  const out = splitLeadingQuotes(withQuotes(["um", "dois"], "e daí?"));
  assert.deepEqual(out, { quotes: ["um", "dois"], rest: "e daí?" });
});

test("a message that was only quotes reads back with no tail at all", () => {
  const out = splitLeadingQuotes(withQuotes(["um"], ""));
  assert.deepEqual(out, { quotes: ["um"], rest: "" });
});

test("plain text with no quote at its head is not mistaken for one", () => {
  assert.equal(splitLeadingQuotes("e daí?"), null);
  assert.equal(splitLeadingQuotes("uma frase\n> não é bem no começo"), null);
});

test("the quote card is an inset holding the quoted words, labelled for the jump, with no icon and no '>' marker", () => {
  const card = svQuoteCard("uma linha\noutra");
  assert.equal(card.className, "sv-said-quote");
  assert.equal(card.getAttribute("role"), "button");
  assert.equal(card.tabIndex, 0);
  assert.equal(card.getAttribute("aria-label"), "Go to the quoted response: uma linha outra");
  assert.equal(card.querySelector(".qi"), null, "the inset card carries no icon of its own");
  assert.equal(card.querySelector(".qt").textContent, "uma linha\noutra");
  assert.equal(card.querySelector(".qt").getAttribute("dir"), "auto");
  assert.equal(card.querySelector("mark"), null, "a whole answer reads plain");
  assert.ok(!card.querySelector(".qt").textContent.startsWith(">"));
});

test("a stretch of an answer is marked inside its card, and a long quote is cut only in the label", () => {
  const long = "palavra ".repeat(20).trim();
  const card = svQuoteCard(long, true);
  assert.equal(card.querySelector(".qt > mark")?.textContent, long);
  assert.equal(card.getAttribute("aria-label"), `Go to the quoted response: ${long.slice(0, 64)}…`);
});

const cardsOf = (bubble) => [...asNodes(bubble.body).querySelectorAll(".sv-said-quote")];

test("a quote of a whole answer reads plain, a stretch of it is marked, and the comment comes below as text", () => {
  const e = held();
  svConvSaid(e, "Rode isto:\n\n```sh\nnpm test\n```\n\nDepois veja $x^2$ em `src/app.ts`.");
  const whole = svConvLine(e, "sv-user", withQuotes(["Rode isto:\n\nnpm test\n\nDepois veja $x^2$ em `src/app.ts`."], "e se falhar?"));
  const part = svConvLine(e, "sv-user", withQuotes(["npm test"], ""));
  const [plain] = cardsOf(whole);
  assert.equal(plain.querySelector("mark"), null, "the whole answer, code head and all, was taken for a stretch");
  assert.equal(cardsOf(part)[0].querySelector(".qt > mark")?.textContent, "npm test");
  const said = asNodes(whole.body);
  assert.deepEqual([...said.children].map((one) => one.className), ["sv-said-quotes", "sv-said-body"]);
  assert.equal(said.querySelector(".sv-said-body").textContent, "e se falhar?");
});

test("an answer split by a tool is one answer: all of it reads plain, one side of it is a stretch", () => {
  const e = held();
  svConvSaid(e, "primeira parte");
  svConvPush(e, { key: svConvKey(e), kind: "tool" });
  svConvSaid(e, "segunda parte");
  const whole = svConvLine(e, "sv-user", withQuotes(["primeira parte\n\nsegunda parte"], ""));
  const half = svConvLine(e, "sv-user", withQuotes(["segunda parte"], ""));
  assert.equal(cardsOf(whole)[0].querySelector("mark"), null);
  assert.ok(cardsOf(half)[0].querySelector("mark"));
});

test("a quote whose answer is not in the conversation reads plain", () => {
  const e = held();
  assert.equal(cardsOf(svConvLine(e, "sv-user", withQuotes(["algo que sumiu"], "e aí?")))[0].querySelector("mark"), null);
});

test("copying the message gives back the '>' lines it was sent with", () => {
  const e = held();
  const said = withQuotes(["um", "dois\ntrês"], "e daí?");
  const bubble = svConvLine(e, "sv-user", said);
  assert.equal(asNodes(bubble.body).querySelector(".sv-said-quotes").dataset.mdCopy, "> um\n\n> dois\n> três\n");
  const only = svConvLine(e, "sv-user", withQuotes(["um"], ""));
  assert.equal(asNodes(only.body).querySelector(".sv-said-quotes").dataset.mdCopy, "> um");
  const el = document.createElement("div");
  el.className = "sv-user";
  el.style.whiteSpace = "pre-wrap";
  el.innerHTML = bubble.body;
  document.body.append(el);
  assert.match(blockText(el), /^> um\n+> dois\n> três\n+e daí\?$/);
  el.remove();
});

function mountedSeat(name, quote) {
  const e = getStructured({ name, where: "local" });
  e.conv = svConvSeed();
  e.convView = mountConversation(e.scroll, { ...svConvActions(e), ...(quote ? { quote } : {}) });
  document.body.appendChild(e.host);
  return e;
}

function unmount(e, name) {
  e.convView.dispose();
  e.host.remove();
  structPool.delete(name);
}

test("the card is reached with Tab and jumps on click, Enter and Space; a card whose answer is gone stays put", () => {
  const name = "quote-card-keys";
  const jumped = [];
  const e = mountedSeat(name, (card) => jumped.push(card));
  svConvSaid(e, "a resposta inteira");
  svConvLine(e, "sv-user", withQuotes(["a resposta inteira"], "comentário"));
  svConvFlushAll();
  const card = e.scroll.querySelector(".sv-said-quote");
  assert.ok(card, "the sent quote never became a card");
  document.getSelection().removeAllRanges();
  card.focus();
  assert.ok(document.activeElement === card, "the card cannot take focus");
  for (const key of ["Enter", " "]) card.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  card.click();
  assert.equal(jumped.length, 3);
  assert.ok(jumped.every((one) => one === card));
  card.dataset.missing = "1";
  card.click();
  card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  assert.equal(jumped.length, 3, "a card whose answer is gone still tried to jump");
  unmount(e, name);
});

test("a card whose answer is gone says so and is marked disabled", async () => {
  const name = "quote-card-gone";
  const e = mountedSeat(name);
  svConvLine(e, "sv-user", withQuotes(["uma resposta que não existe"], ""));
  svConvFlushAll();
  const card = e.scroll.querySelector(".sv-said-quote");
  assert.equal(await svConvActions(e).quote(card), false);
  assert.equal(card.dataset.missing, "1");
  assert.equal(card.getAttribute("aria-disabled"), "true");
  assert.equal(card.title, "The original answer is no longer in this conversation");
  unmount(e, name);
});

test("the bubble hands each quote its own card and keeps the rest as the said body", () => {
  const e = held();
  const bubble = svConvLine(e, "sv-user", withQuotes(["um", "dois"], "e daí?"));
  assert.equal(bubble.kind, "bubble");
  const said = asNodes(bubble.body);
  assert.deepEqual([...said.querySelectorAll(".sv-said-quote .qt")].map((one) => one.textContent), ["um", "dois"]);
  assert.equal(said.querySelector(".sv-said-body").textContent, "e daí?");
  assert.ok(!said.textContent.includes(">"), "the markers were carried into the bubble instead of becoming cards");
});
