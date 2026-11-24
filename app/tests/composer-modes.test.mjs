import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";

const st = await state();
await views();

const { svConvFlushAll } = await app("conversation-model");
const { getStructured, withQuotes, withoutQuotes, rememberSent } = await app("chat-stretches");
const { svEvent } = await app("chat-and-panes");
const { IS_MAC } = await app("core");
const cp = {
  ...(await app("composer-modes")),
  ...(await app("composer-queue")),
  ...(await app("composer-ask")),
  ...(await app("composer-plan")),
  ...(await app("composer-drawer")),
  ...(await app("composer-actions")),
  ...(await app("composer-keys"))
};
const { readStash, STASH_KEY } = await app("prompt-stash");

document.body.classList.add("experience-raycast");

const MOD = IS_MAC ? { metaKey: true } : { ctrlKey: true };
const rest = (ms = 10) => new Promise((done) => setTimeout(done, ms));

const posted = [];
globalThis.fetch = async (path, options = {}) => {
  posted.push({ path: String(path), body: JSON.parse(options.body || "{}") });
  return { ok: true, status: 200, json: async () => ({ ok: true, paths: ["/tmp/shots/seat-pasted-text-1-0.txt"] }), text: async () => "{}" };
};

let seq = 0;

function seat({ busy = false, answer = () => null } = {}) {
  const name = `composer-${++seq}`;
  st.data = { ...(st.data || {}), sessions: [{ name, where: "local", state: busy ? "working" : "idle" }], drafts: st.data?.drafts || {}, spawning: [] };
  const e = getStructured({ name, where: "local" });
  document.body.appendChild(e.host);
  e.turnOpen = busy;
  const sent = [];
  e.ws = {
    readyState: 1,
    send(raw) {
      const cmd = JSON.parse(raw);
      sent.push(cmd);
      const reply = answer(cmd) ?? (cmd.type === "say" ? { ok: true, queued: e.turnOpen } : { ok: true });
      queueMicrotask(() => e.pending.get(cmd.cid)?.(reply));
    }
  };
  if (busy) svEvent(e, { type: "user", subtype: "say", cid: `ask-${seq}`, images: [], message: { role: "user", content: [{ type: "text", text: "fecha o lote 812" }] } });
  cp.paintComposer(e);
  return { e, sent, box: e.host.querySelector(".sv-composer textarea") };
}

const form = (e) => e.host.querySelector(".sv-composer");
const typed = (box, text) => {
  box.value = text;
  box.dispatchEvent(new window.Event("input", { bubbles: true }));
};
const press = (box, key, mods = {}) => box.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...mods }));
const rows = (e) => [...e.host.querySelectorAll(".sv-queue .sv-qitem")];
const bubbles = (e) => (svConvFlushAll(), [...e.scroll.querySelectorAll(".sv-user")]);
const drawer = (e) => e.host.querySelector(".sv-drawer");

test("a message sent while the turn runs steers it by default; the modifier is what queues it", () => {
  assert.equal(cp.dispatchMode({ running: false, alternate: true }), "auto");
  assert.equal(cp.dispatchMode({ running: true, alternate: false }), "steer");
  assert.equal(cp.dispatchMode({ running: true, alternate: true }), "queue");
  assert.equal(cp.dispatchMode({ running: true, alternate: false, steerable: false }), "queue", "a turn that cannot take it, like one compacting, always queues");
});

test("enter during a turn goes into the turn at once and the bubble says it steered", async () => {
  const { e, sent, box } = seat({ busy: true });
  typed(box, "olha também o teste de fila");
  press(box, "Enter");
  await rest();
  assert.deepEqual(sent.map((one) => one.type), ["say", "saynow"]);
  assert.equal(sent[1].target, sent[0].cid, "the steer pushes the very message it just said");
  assert.equal(rows(e).length, 0, "a steered message never waits in the queue");
  svEvent(e, { type: "driver", subtype: "said_now", cid: sent[0].cid });
  const bubble = bubbles(e).at(-1);
  assert.match(bubble.textContent, /olha também o teste de fila/);
  assert.match(bubble.querySelector(".tl-steer-mark")?.textContent || "", /Steer · waiting to be read/, "until the agent reads it, the mark says so");
  svEvent(e, { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] } });
  svEvent(e, { type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "li" }] } });
  assert.equal(bubbles(e).find((one) => /olha também/.test(one.textContent))?.querySelector(".tl-steer-mark")?.textContent, "Steer", "after the next step the agent has read it");
  assert.equal(box.value, "");
});

test("mod+enter during a turn queues just this one, as a dashed row with send now, edit and remove", async () => {
  const { e, sent, box } = seat({ busy: true });
  typed(box, "depois disso, revisa");
  press(box, "Enter", MOD);
  await rest();
  assert.deepEqual(sent.map((one) => one.type), ["say"]);
  const [row] = rows(e);
  assert.ok(row?.classList.contains("cp-q"), "the queued row is a dashed bubble with its actions");
  assert.equal(row.querySelector(".cp-q-text").textContent, "depois disso, revisa");
  assert.deepEqual([...row.querySelectorAll(".cp-q-btn")].map((b) => b.dataset.act), ["q-now", "q-edit", "q-drop"]);
  assert.equal(row.querySelector(".cp-q-now").getAttribute("aria-label"), "Send now");
  assert.equal(row.querySelector(".cp-q-now").textContent, "", "send now is an icon with its words in the tooltip");
  assert.equal(e.host.querySelector(".sv-queue").classList.contains("on"), true);
});

test("the send button carries the same choice: a modifier-click queues", async () => {
  const { e, sent, box } = seat({ busy: true });
  typed(box, "fila pelo clique");
  e.host.querySelector(".sv-send").dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, ...MOD }));
  await rest();
  assert.deepEqual(sent.map((one) => one.type), ["say"]);
  assert.equal(rows(e).length, 1);
});

test("a seat that cannot take a message mid-turn keeps it queued, and the next one goes straight to the line", async () => {
  const { e, sent, box } = seat({ busy: true, answer: (cmd) => (cmd.type === "saynow" ? { ok: false, error: "runs one process per turn" } : null) });
  typed(box, "primeira");
  press(box, "Enter");
  await rest();
  assert.equal(rows(e).length, 1, "the refused steer left the message in line");
  assert.equal(e.steerRefused, true);
  assert.equal(form(e).dataset.cpMode, "queue");
  typed(box, "segunda");
  press(box, "Enter");
  await rest();
  assert.deepEqual(sent.map((one) => one.type), ["say", "saynow", "say"]);
  assert.equal(rows(e).length, 2);
});

test("while the conversation compacts, enter queues and the button says so", async () => {
  const { e, sent, box } = seat({ busy: true });
  e.activity = "compacting the conversation…";
  cp.paintComposer(e);
  assert.equal(form(e).dataset.cpMode, "queue");
  assert.equal(e.host.querySelector(".sv-send").getAttribute("aria-label"), "Queue message");
  typed(box, "espera a compactação");
  press(box, "Enter");
  await rest();
  assert.deepEqual(sent.map((one) => one.type), ["say"]);
  assert.equal(rows(e).length, 1);
});

test("the button names what enter will do, and holding the modifier flips steer to queue", () => {
  const { e } = seat({ busy: true });
  const send = e.host.querySelector(".sv-send");
  assert.equal(form(e).dataset.cpMode, "steer");
  assert.equal(send.getAttribute("aria-label"), "Steer message");
  assert.match(send.title, /^Click to steer, .*-click or .* to queue$/);
  cp.holdMod(true);
  assert.equal(form(e).dataset.cpMode, "queue");
  assert.equal(send.getAttribute("aria-label"), "Queue message");
  cp.holdMod(false);
  e.turnOpen = false;
  cp.paintComposer(e);
  assert.equal(send.getAttribute("aria-label"), "Submit message");
});

async function queueOf(n, opts = {}) {
  const made = seat({ busy: true, ...opts });
  for (let i = 1; i <= n; i++) {
    typed(made.box, `mensagem ${i}`);
    press(made.box, "Enter", MOD);
    await rest();
  }
  return made;
}

test("past three queued, two show and the rest fold under show all", async () => {
  const { e } = await queueOf(4);
  const tray = e.host.querySelector(".sv-queue");
  assert.deepEqual(rows(e).map((row) => row.querySelector(".cp-q-text").textContent), ["mensagem 1", "mensagem 2", "mensagem 3", "mensagem 4"], "the queue reads in the order it will go");
  assert.deepEqual(rows(e).map((row) => row.hidden), [false, false, true, true]);
  const more = tray.querySelector(".cp-q-more");
  assert.equal(more.textContent, "Show all 4 queued");
  more.click();
  assert.deepEqual(rows(e).map((row) => row.hidden), [false, false, false, false]);
  assert.equal(tray.querySelector(".cp-q-more").textContent, "Show fewer");
});

test("edit takes a queued message into the box and update rewrites it where it stands", async () => {
  const { e, sent, box } = await queueOf(2);
  typed(box, "o que eu estava escrevendo");
  rows(e)[0].querySelector('[data-act="q-edit"]').click();
  assert.equal(form(e).dataset.cpMode, "edit");
  assert.equal(box.value, "mensagem 1");
  assert.match(drawer(e).textContent, /Editing queued message/);
  assert.match(rows(e)[0].textContent, /Editing in the composer/);
  assert.equal(e.host.querySelector(".sv-send").getAttribute("aria-label"), "Update queued message");
  typed(box, "mensagem 1, melhor");
  press(box, "Enter");
  await rest();
  const resay = sent.find((one) => one.type === "resay");
  assert.ok(resay, "the edit asks the driver to rewrite the queued message");
  assert.equal(resay.target, rows(e)[0].dataset.cid);
  assert.equal(resay.text, "mensagem 1, melhor");
  assert.equal(rows(e)[0].querySelector(".cp-q-text").textContent, "mensagem 1, melhor");
  assert.equal(box.value, "o que eu estava escrevendo", "what the person was writing comes back");
  assert.equal(form(e).dataset.cpMode, "steer");
});

test("a driver from before the rewrite still gets the edit, said again at the back of the line", async () => {
  const { e, sent, box } = await queueOf(1, { answer: (cmd) => (cmd.type === "resay" ? { ok: false, error: "unknown command resay" } : null) });
  rows(e)[0].querySelector('[data-act="q-edit"]').click();
  typed(box, "reescrita");
  press(box, "Enter");
  await rest(20);
  assert.deepEqual(sent.slice(-3).map((one) => one.type), ["resay", "unsay", "say"]);
  assert.equal(rows(e).length, 1);
  assert.equal(rows(e)[0].querySelector(".cp-q-text").textContent, "reescrita");
});

test("escape gives the edit up and the box is what it was", async () => {
  const { e, box } = await queueOf(1);
  typed(box, "rascunho");
  rows(e)[0].querySelector('[data-act="q-edit"]').click();
  press(box, "Escape");
  assert.equal(box.value, "rascunho");
  assert.equal(e.editing, null);
  assert.equal(rows(e)[0].querySelector(".cp-q-text").textContent, "mensagem 1");
});

test("alt+up edits the last queued message and mod+shift+enter sends the first one now", async () => {
  const { e, sent, box } = await queueOf(2);
  press(box, "ArrowUp", { altKey: true });
  assert.equal(e.editing?.item, rows(e)[1]);
  assert.equal(box.value, "mensagem 2");
  press(box, "Escape");
  const first = rows(e)[0].dataset.cid;
  press(box, "Enter", { ...MOD, shiftKey: true });
  await rest();
  assert.equal(sent.at(-1).type, "saynow");
  assert.equal(sent.at(-1).target, first);
  assert.equal(rows(e).length, 1);
  svEvent(e, { type: "driver", subtype: "said_now", cid: first });
  assert.ok(bubbles(e).at(-1).querySelector(".tl-steer-mark"), "a queued message sent now steers the turn");
});

test("remove takes it out of the line without touching the box", async () => {
  const { e, sent, box } = await queueOf(1);
  typed(box, "fica aqui");
  rows(e)[0].querySelector('[data-act="q-drop"]').click();
  await rest();
  assert.equal(sent.at(-1).type, "unsay");
  assert.equal(rows(e).length, 0);
  assert.equal(box.value, "fica aqui");
});

const QUESTIONS = [
  { header: "Banco", question: "Qual **banco** usar?", multiSelect: false, options: [{ label: "Postgres", description: "o de sempre" }, { label: "MySQL" }] },
  { header: "Deploy", question: "Quando subir?", multiSelect: false, options: [{ label: "Agora" }, { label: "Amanhã" }] }
];

test("a question takes the drawer over the box: markdown, options with their keys, and the count", () => {
  const { e, box } = seat({ busy: true });
  typed(box, "meu rascunho");
  svEvent(e, { type: "driver", subtype: "question", id: "q1", questions: QUESTIONS });
  assert.equal(form(e).dataset.cpMode, "question");
  assert.equal(box.value, "", "the box is the free answer now");
  const ban = drawer(e).querySelector(".cp-ask");
  assert.equal(ban.querySelector(".cp-ask-h").textContent, "Banco");
  assert.equal(ban.querySelector(".cp-bcount").textContent, "1/2");
  assert.ok(ban.querySelector(".cp-ask-q :is(b, strong)"), "the question is markdown");
  const options = [...ban.querySelectorAll(".cp-opt")];
  assert.deepEqual(options.map((o) => o.querySelector(".cp-opt-l").textContent), ["Postgres", "MySQL"]);
  assert.equal(options[0].querySelector(".cp-opt-d").textContent, "o de sempre");
  assert.deepEqual(options.map((o) => o.getAttribute("aria-keyshortcuts")), ["1", "2"]);
  assert.equal(options[0].querySelector("kbd"), null, "the number lives in the tooltip, not as a key cap beside every option");
  assert.equal(form(e).querySelector(".cp-pill").textContent, "Next question");
  ban.querySelector(".cp-ask-head").click();
  assert.equal(drawer(e).querySelector(".cp-ask").dataset.fold, "collapsed");
  assert.equal(drawer(e).querySelector(".cp-ask-line").textContent, "Qual **banco** usar?");
});

test("typed words answer the question instead of dropping it, a pick moves on by itself, and the box comes back", async () => {
  const { e, sent, box } = seat({ busy: true });
  typed(box, "meu rascunho");
  svEvent(e, { type: "driver", subtype: "question", id: "q2", questions: QUESTIONS });
  typed(box, "SQLite, na verdade");
  press(box, "Enter");
  assert.equal(drawer(e).querySelector(".cp-bcount").textContent, "2/2");
  assert.equal(form(e).querySelector(".cp-pill").textContent, "Submit answers");
  assert.equal(sent.some((one) => one.type === "say"), false, "nothing was said to the chat — the question stays");
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "2", bubbles: true, cancelable: true }));
  await rest(260);
  const answer = sent.find((one) => one.type === "answer");
  assert.deepEqual(answer, { type: "answer", id: "q2", answers: { "Qual **banco** usar?": "SQLite, na verdade", "Quando subir?": "Amanhã" }, cid: answer.cid });
  await rest();
  assert.equal(e.ask, null);
  assert.equal(box.value, "meu rascunho");
  svEvent(e, { type: "driver", subtype: "question_answered", id: "q2" });
  const sum = [...(svConvFlushAll(), e.scroll).querySelectorAll(".sv-q .qsum-row")].map((row) => row.textContent);
  assert.deepEqual(sum, ["Qual **banco** usar?→SQLite, na verdade", "Quando subir?→Amanhã"]);
});

test("previous walks back with its own answer, and a reloaded question shows what the driver kept", () => {
  const { e, box } = seat({ busy: true });
  svEvent(e, { type: "driver", subtype: "question", id: "q3", questions: QUESTIONS });
  typed(box, "o primeiro");
  press(box, "Enter");
  typed(box, "o segundo");
  form(e).querySelector(".cp-prev").click();
  assert.equal(box.value, "o primeiro");
  svEvent(e, { type: "driver", subtype: "question_answered", id: "q3", answers: { "Qual **banco** usar?": "Postgres", "Quando subir?": ["Agora"] } });
  assert.equal(e.ask, null);
  assert.deepEqual([...(svConvFlushAll(), e.scroll).querySelectorAll(".sv-q .qsum-a")].map((a) => a.textContent), ["Postgres", "Agora"]);
});

const PLAN = `# Fila editável

## Summary

Vou mexer no composer.

${Array.from({ length: 24 }, (_, i) => `- passo ${i + 1}`).join("\n")}
`;

test("the plan card folds a long plan to a preview, with copy and download in its menu", () => {
  const { e } = seat({ busy: true });
  svEvent(e, { type: "driver", subtype: "plan", id: "p1", plan: PLAN });
  svConvFlushAll();
  const card = e.scroll.querySelector(".sv-plan");
  assert.equal(card.querySelector(".cp-plan-title").textContent, "Fila editável");
  assert.ok(card.querySelector(".cp-plan-title"), "the card carries its title");
  assert.ok(card.classList.contains("cp-plan-folds"));
  assert.equal(card.querySelector(".cp-plan-toggle").textContent, "Expand plan");
  card.querySelector(".cp-plan-toggle").click();
  assert.ok(card.classList.contains("cp-plan-open"));
  assert.equal(card.querySelector(".cp-plan-toggle").textContent, "Collapse plan");
  assert.deepEqual([...card.querySelectorAll(".cp-plan-pop button")].map((b) => b.textContent), ["Copy to clipboard", "Download as markdown", "Save to workspace"]);
  assert.match(drawer(e).textContent, /Plan ready\s*Fila editável/);
  assert.equal(form(e).dataset.cpMode, "plan");
});

test("implement approves the plan with the fronts on the card; words in the box refine it instead", async () => {
  const { e, sent, box } = seat({ busy: true });
  svEvent(e, { type: "driver", subtype: "plan", id: "p2", plan: "Plano curto\n\n```frentes\nloja · claude/opus · aqui · acme · a loja\n```\n" });
  assert.ok(e.planAsk.card.classList.contains("cp-plan-held"), "the card hides its own buttons while the box offers implement and refine");
  form(e).querySelector(".cp-impl-go").click();
  await rest();
  const answer = sent.find((one) => one.type === "answer");
  assert.equal(answer.answers.plan, "go");
  assert.equal(answer.answers.fronts[0].name, "loja", "the fronts still travel with the approval");
  const second = seat({ busy: true });
  svEvent(second.e, { type: "driver", subtype: "plan", id: "p3", plan: "Outro plano" });
  typed(second.box, "troca o passo 2");
  assert.ok(form(second.e).classList.contains("ready"));
  assert.equal(form(second.e).querySelector(".cp-pill").textContent, "Refine");
  press(second.box, "Enter");
  await rest();
  assert.deepEqual(second.sent.map((one) => one.type), ["say"], "refining is saying it: the driver drops the plan with these words");
  assert.equal(second.sent[0].text, "troca o passo 2");
  const card = second.e.planAsk.card;
  svEvent(second.e, { type: "driver", subtype: "plan_dismissed", id: "p3" });
  assert.equal(second.e.planAsk, null);
  assert.ok(!card.classList.contains("cp-plan-held"), "a plan the box let go shows its card as it was");
  assert.notEqual(form(second.e).dataset.cpMode, "plan");
  void box;
});

test("the plan helpers read a title, strip it from the body and cut a ten-line preview", () => {
  assert.equal(cp.planTitle("# Integrar RPC\n\ncorpo"), "Integrar RPC");
  assert.equal(cp.planTitle("- passo 1"), null);
  assert.equal(cp.displayedPlan("# Integrar RPC\n\n## Summary\n\n- passo 1\n"), "- passo 1");
  assert.equal(cp.planFileName("# Fila: editável (v2)!"), "fila-editavel-v2.md");
  assert.equal(cp.planPreview(PLAN).split("\n").filter((line) => line.trim()).length, 11, "ten lines and the ellipsis");
  assert.equal(cp.planFolds("x".repeat(901)), true);
  assert.equal(cp.planFolds("curto"), false);
  assert.equal(cp.planPrompt("  o plano  "), "PLEASE IMPLEMENT THIS PLAN:\no plano");
});

test("mod+s stashes the prompt with its pictures and quotes, and an empty box takes the only one back", () => {
  localStorage.removeItem(STASH_KEY);
  const { e, box } = seat();
  e.quotes.add("o que ele disse", "what it answered", "isso");
  e.tray.add("/tmp/shots/a.png");
  typed(box, `${box.value}guarda isso`);
  press(box, "s", { ...MOD, code: "KeyS" });
  assert.equal(box.value, "");
  assert.equal(e.quotes.count(), 0);
  assert.equal(e.tray.count(), 0);
  const [entry] = readStash();
  assert.match(entry.text, /guarda isso/);
  assert.deepEqual(entry.images, [[1, "/tmp/shots/a.png"]]);
  assert.deepEqual(entry.quotes, [{ said: "o que ele disse", kind: "what it answered", comment: "isso" }]);
  assert.equal(drawer(e).querySelector(".cp-stash-tab .cp-bcount").textContent, "1");
  press(box, "s", { ...MOD, code: "KeyS" });
  assert.match(box.value, /guarda isso/);
  assert.equal(e.tray.count(), 1);
  assert.equal(e.quotes.pinned()[0].comment, "isso");
  assert.equal(readStash().length, 0);
});

test("with more than one stashed, mod+s opens the stash, and it restores or deletes from there", () => {
  localStorage.removeItem(STASH_KEY);
  const { e, box } = seat();
  for (const text of ["primeiro", "segundo"]) {
    typed(box, text);
    press(box, "s", { ...MOD, code: "KeyS" });
  }
  press(box, "s", { ...MOD, code: "KeyS" });
  const rowsOf = () => [...drawer(e).querySelectorAll(".cp-stash-row .cp-stash-go")].map((b) => b.textContent);
  assert.deepEqual(rowsOf(), ["segundo", "primeiro"], "the newest comes first");
  drawer(e).querySelector('.cp-stash-row [data-act="stash-drop"]').click();
  assert.deepEqual(rowsOf(), ["primeiro"]);
  drawer(e).querySelector(".cp-stash-go").click();
  assert.equal(box.value, "primeiro");
  assert.equal(readStash().length, 0);
});

test("a paste the size of a file goes in as pasted-text.txt instead of flooding the box", async () => {
  const { e, box } = seat();
  posted.length = 0;
  const big = "linha de log\n".repeat(3000);
  const paste = new window.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", { value: { getData: () => big } });
  box.dispatchEvent(paste);
  assert.equal(paste.defaultPrevented, true);
  await rest();
  assert.deepEqual(e.files.names(), ["pasted-text.txt"], "the paste becomes one file chip");
  assert.match(box.value, /\[File #1\]/, "the box keeps one mark for it, not the text");
  assert.doesNotMatch(box.value, /\[Pasted text/, "and not a second copy as a folded paste");
  const small = new window.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(small, "clipboardData", { value: { getData: () => "curto" } });
  box.dispatchEvent(small);
  assert.equal(small.defaultPrevented, false);
  void e;
});

test("the kept draft carries the pictures and quotes, and a chat drawn again gets them back", async () => {
  const { e } = seat();
  posted.length = 0;
  e.quotes.add("citado", "what you asked", "comentário");
  e.tray.add("/tmp/shots/b.png");
  await rest(400);
  const kept = posted.filter((one) => one.path === "/api/draft").at(-1);
  assert.deepEqual(kept.body.images, [[1, "/tmp/shots/b.png"]]);
  assert.deepEqual(kept.body.quotes, [{ said: "citado", kind: "what you asked", comment: "comentário" }]);
  st.data.drafts = { "composer-back": { text: "olha [Image #3] ", at: Date.now(), images: [[3, "/tmp/shots/c.png"]], quotes: [{ said: "volta", kind: "", comment: "" }] } };
  const back = getStructured({ name: "composer-back", where: "local" });
  assert.equal(back.host.querySelector("textarea").value, "olha [Image #3] ");
  assert.equal(back.tray.marks.get(3), "/tmp/shots/c.png");
  assert.deepEqual(back.quotes.pinned(), [{ said: "volta", kind: "" }]);
});

test("a quote can carry a comment, which travels right under it", () => {
  assert.equal(withQuotes([{ said: "um\ndois", comment: "por quê?" }, "três"], "e aí"), "> um\n> dois\n\npor quê?\n\n> três\n\ne aí");
  assert.equal(withoutQuotes([{ said: "um", comment: "isso" }], "> um\n\nisso\n\nresto"), "resto");
});

test("quoting opens a comment box: save pins it, save and send sends it", async () => {
  const { e, sent, box } = seat();
  const pop = e.host.querySelector(".sv-quote-pop");
  const said = document.createElement("div");
  said.className = "sv-msg";
  said.textContent = "a resposta inteira";
  e.scroll.appendChild(said);
  const range = document.createRange();
  range.selectNodeContents(said);
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);
  e.scroll.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }));
  await rest();
  pop.click();
  const note = e.host.querySelector(".cp-quote-note");
  assert.ok(note, "the quote asks for an optional comment");
  assert.equal(note.querySelector("textarea").placeholder, "Add an optional comment…");
  note.querySelector("textarea").value = "isso aqui está errado";
  note.querySelector('[data-act=\"send\"]').click();
  await rest();
  assert.equal(sent[0].type, "say");
  assert.equal(sent[0].text, "> a resposta inteira\n\nisso aqui está errado");
  assert.equal(box.value, "");
});

test("history gives back only what was typed, walks back while untouched, and stays shut with a quote", () => {
  const { e, box } = seat();
  rememberSent(e, "> citado\n\nprimeiro [Image #1]", 1);
  rememberSent(e, "PLEASE IMPLEMENT THIS PLAN:\nfaz", 2);
  rememberSent(e, "segundo", 3);
  rememberSent(e, "segundo", 4);
  assert.deepEqual(e.sent, ["primeiro", "segundo"]);
  press(box, "ArrowUp");
  assert.equal(box.value, "segundo");
  box.setSelectionRange(0, 0);
  press(box, "ArrowUp");
  assert.equal(box.value, "primeiro", "a second up keeps walking while the recalled words are untouched");
  box.setSelectionRange(box.value.length, box.value.length);
  press(box, "ArrowDown");
  assert.equal(box.value, "segundo");
  typed(box, "");
  e.quotes.add("uma citação", "");
  press(box, "ArrowUp");
  assert.equal(box.value, "", "with a quote pinned, up does not recall");
});

test("a reloaded chat marks the message that steered and reads a rewritten queued one as rewritten", () => {
  const { e } = seat();
  svEvent(e, { type: "user", subtype: "say", cid: "c8-ask", seq: 49, images: [], message: { role: "user", content: [{ type: "text", text: "fecha o lote" }] }, replayed: true });
  svEvent(e, { type: "user", subtype: "say", cid: "c9-old", seq: 50, images: [], message: { role: "user", content: [{ type: "text", text: "versão velha" }] }, replayed: true });
  svEvent(e, { type: "driver", subtype: "resaid", cid: "c9-old", text: "versão nova", images: [], seq: 51, replayed: true });
  svEvent(e, { type: "driver", subtype: "said_now", cid: "c9-old", seq: 52, replayed: true });
  const bubble = bubbles(e).at(-1);
  assert.match(bubble.textContent, /versão nova/);
  assert.ok(bubble.querySelector(".tl-steer-mark"));
});

test("a question that lands while you type waits until you stop, so your words do not fall into it", async () => {
  const { e, box } = seat({ busy: true });
  box.focus();
  typed(box, "estou escrevendo outra coisa");
  e.lastKeyAt = Date.now();
  svEvent(e, { type: "driver", subtype: "question", id: "q-typing", questions: [{ header: "Nota", question: "Qual CFOP?", options: [{ label: "5.917" }, { label: "6.917" }] }] });
  assert.equal(e.ask?.waiting, true, "the question holds back while the person is typing");
  assert.notEqual(form(e).dataset.cpMode, "question");
  assert.equal(box.value, "estou escrevendo outra coisa", "the box keeps what was being typed");
  box.dispatchEvent(new window.Event("blur"));
  assert.equal(e.ask?.waiting, false, "leaving the box lets the question in");
  assert.equal(form(e).dataset.cpMode, "question");
});

test("stop asks once, says it is stopping, and gives up the lock after the agent stops", async () => {
  const { e, sent } = seat({ busy: true });
  const stop = e.host.querySelector(".sv-stop");
  assert.equal(stop.hidden, false, "an empty box during a turn offers stop");
  stop.click();
  stop.click();
  await rest();
  assert.equal(sent.filter((one) => one.type === "interrupt").length, 1, "a second click while stopping does nothing");
  assert.equal(stop.disabled, true);
  assert.equal(stop.getAttribute("aria-label"), "Stopping");
  e.turnOpen = false;
  cp.stopLanded(e);
  cp.paintComposer(e);
  assert.equal(e.stopPhase, "landed");
  await rest(cp.STOP_LANDED_GUARD_MS + 50);
  assert.equal(e.stopPhase, null);
});
