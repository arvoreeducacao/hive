import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { app, dom } from "./dom.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const browserRoutes = readFileSync(join(here, "..", "routes", "browser.mjs"), "utf8");
const preload = readFileSync(join(here, "..", "main", "preload.js"), "utf8");
const picker = readFileSync(join(here, "..", "main", "seat-preload.js"), "utf8");
const panesSource = readFileSync(join(here, "..", "src", "app", "chat-and-panes.js"), "utf8");
const cut = (t, a, b, w) => { const i = t.indexOf(a); assert.ok(i >= 0, `${w}: ${a}`); const j = t.indexOf(b, i); assert.ok(j > i, `${w}: ${b}`); return t.slice(i, j); };

const { bornWebFrame, sendPickReference, askOnTheElement, threadsOnThePage, threadLine, standOnThePage, tabOfFrame, frameIsUpFront, webStateOf } = await app("chat-and-panes");

function dialled(run, answer = {}) {
  const was = globalThis.fetch;
  const calls = [];
  globalThis.fetch = (url, init) => { calls.push({ url, body: init && init.body ? JSON.parse(init.body) : null }); return Promise.resolve({ ok: true, json: async () => answer }); };
  return Promise.resolve(run()).then(() => calls).finally(() => { globalThis.fetch = was; });
}

test("the picker preload only talks to the host, and is inert until toggled", () => {
  assert.match(picker, /ipcRenderer\.sendToHost\("hive-ask"/);
  assert.match(picker, /ipcRenderer\.on\("hive-pick-mode"/);
  const click = cut(picker, "function onClick", "function setPicking", "seat-preload");
  assert.match(click, /if \(!picking\) return;/);
  assert.match(click, /ev\.preventDefault\(\)/);
  assert.match(picker, /addEventListener\("keydown"/);
});

test("main sets the picker preload only for seat browser tabs", () => {
  const main = readFileSync(join(here, "..", "main.js"), "utf8");
  assert.match(main, /on\("will-attach-webview"/);
  assert.match(main, /String\(params\.partition \|\| ""\)\.includes\("seat-browser"\)\) webPreferences\.preload = join\(HERE, "main", "seat-preload\.js"\)/);
  assert.ok(!preload.includes("pickerPreload"), "preload.js must not build paths (it is sandboxed)");
});

test("a pick coming up from the page's own preload becomes a reference the seat can read", async () => {
  const yard = document.createElement("div");
  const frame = bornWebFrame(yard, "picker-seat", { id: "t1", url: "https://arvore.dev/" });
  const calls = await dialled(() => {
    const ev = new dom.Event("ipc-message");
    ev.channel = "hive-ask";
    ev.args = [{ selector: "main > h1", tag: "h1", text: "Olá", said: "", url: "https://arvore.dev/" }];
    frame.dispatchEvent(ev);
  });
  assert.equal(calls.length, 1, "the webview heard nothing coming up from the page");
  assert.equal(calls[0].url, "/api/browser/reference");
  assert.equal(calls[0].body.selector, "main > h1");
  assert.equal(calls[0].body.name, "picker-seat");
});

test("the picker crop is captured to the element rect and posted", async () => {
  const rects = [];
  const frame = { capturePage: async (r) => { rects.push(r); return { toDataURL: () => "data:image/png;base64,ok" }; } };
  const rect = { x: 4, y: 8, width: 120, height: 40 };
  const calls = await dialled(() => sendPickReference("a", frame, { selector: ".card", rect, url: "https://arvore.dev/" }));
  assert.deepEqual(rects, [rect], "the crop must follow the element, not the whole page");
  assert.equal(calls[0].url, "/api/browser/reference");
  assert.equal(calls[0].body.crop, "data:image/png;base64,ok");
});

test("a pick with no selector never reaches the server", async () => {
  const frame = { capturePage: async () => ({ toDataURL: () => "data:image/png;base64,ok" }) };
  assert.deepEqual(await dialled(() => sendPickReference("a", frame, { rect: { width: 10, height: 10 } })), []);
  assert.deepEqual(await dialled(() => sendPickReference("a", frame, null)), []);
});

test("a capture that throws still sends the reference, crop-less", async () => {
  const frame = { capturePage: async () => { throw new Error("no frame"); } };
  const calls = await dialled(() => sendPickReference("a", frame, { selector: ".card", rect: { width: 10, height: 10 } }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.crop, "");
});

test("the reference route sanitizes untrusted page text before it becomes a turn", () => {
  const r = cut(browserRoutes, '"/api/browser/reference"', '"/api/browser/profile"', "routes/browser.mjs");
  assert.ok(browserRoutes.includes("u0000") && browserRoutes.includes("u001f"), "strips control chars");
  assert.match(browserRoutes, /const clean = /, "has a clean() sanitizer");
  assert.match(r, /if \(!selector\) return json/);
  assert.match(r, /referência do navegador:/);
  assert.match(r, /const said = clean\(asked\.said, 2000\)/, "the words the person typed are sanitised too");
});

test("the reference does not press enter when the seat is waiting on the person", () => {
  const r = cut(browserRoutes, '"/api/browser/reference"', '"/api/browser/profile"', "routes/browser.mjs");
  assert.match(r, /const submit = seat && seat\.state !== "needs"/);
});


test("the click on an element opens the box instead of firing a line at the chat", () => {
  const click = cut(picker, "function onClick", "function setPicking", "seat-preload");
  assert.ok(!click.includes("sendToHost"), "the click must not send anything on its own any more");
  assert.match(click, /openAsk\(pickedFrom\(el\), \[\]\)/);
  assert.match(picker, /ipcRenderer\.sendToHost\("hive-ask"/);
  assert.match(picker, /ipcRenderer\.on\("hive-pins"/);
});

function seatOnAPage(name, tab) {
  const web = webStateOf(name);
  web.tabs = [tab];
  web.active = 0;
  return web;
}

test("a question asked on an element becomes a comment pinned to that element", async () => {
  seatOnAPage("ask-seat", { id: "t1", kind: "artifact", slug: "as-telas", tab: "telas", version: 3, url: "shelf://as-telas/?tab=telas" });
  const frame = { dataset: { id: "t1" }, send: () => {} };
  const calls = await dialled(() => askOnTheElement("ask-seat", frame, {
    said: "esse botão some no celular",
    selector: "#f-1 .cta",
    elAt: "cta-turmas",
    frame: "f-1",
    name: "Lista de turmas",
    x: 0.5,
    y: 0.25
  }));
  const wrote = calls.find((one) => one.url === "/api/shelf/comment");
  assert.ok(wrote, "the question never reached the shelf");
  assert.equal(wrote.body.slug, "as-telas");
  assert.equal(wrote.body.tab, "telas");
  assert.equal(wrote.body.v, 3);
  assert.equal(wrote.body.text, "esse botão some no celular");
  assert.equal(wrote.body.pin.el, "#f-1 .cta");
  assert.equal(wrote.body.pin.elAt, "cta-turmas");
  assert.equal(wrote.body.pin.frame, "f-1");
  assert.equal(wrote.body.seat, "ask-seat", "the seat looking at the page is the one that hears about it");
});

test("an empty question never becomes a comment", async () => {
  seatOnAPage("quiet-seat", { id: "t1", kind: "artifact", slug: "as-telas", tab: "telas", version: 1, url: "shelf://as-telas/" });
  const calls = await dialled(() => askOnTheElement("quiet-seat", { dataset: { id: "t1" }, send: () => {} }, { said: "   ", selector: "#f-1 .cta" }));
  assert.deepEqual(calls, []);
});

test("off the shelf, the question still reaches the seat as a reference carrying the words", async () => {
  seatOnAPage("web-seat", { id: "t1", kind: "page", url: "https://arvore.dev/" });
  const frame = { capturePage: async () => ({ toDataURL: () => "data:image/png;base64,ok" }) };
  const calls = await dialled(() => askOnTheElement("web-seat", frame, {
    said: "aqui o contraste está baixo",
    selector: "main > h1",
    rect: { x: 0, y: 0, width: 10, height: 10 },
    url: "https://arvore.dev/"
  }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/browser/reference");
  assert.equal(calls[0].body.said, "aqui o contraste está baixo");
  assert.equal(calls[0].body.selector, "main > h1");
});

test("the pins the page draws are the threads of that tab, numbered, with their replies", () => {
  const comments = [
    { id: "c-1", tab: "telas", text: "troca o verbo", who: "rafael", pin: { el: "#f-1 .cta", elAt: "cta-turmas" } },
    { id: "c-2", tab: "telas", text: "concordo", who: "artemis", re: "c-1" },
    { id: "c-3", tab: "documento", text: "de outra aba", who: "rafael", pin: { el: "h1" } },
    { id: "c-4", tab: "telas", text: "sem pino", who: "rafael" },
    { id: "c-5", tab: "telas", text: "esse já foi", who: "rafael", done: true, pin: { el: "#f-2" } }
  ];
  const pins = threadsOnThePage(comments, "telas");
  assert.deepEqual(pins.map((one) => one.id), ["c-1", "c-5"], "only pinned tops of this tab become pins");
  assert.deepEqual(pins.map((one) => one.n), [1, 2]);
  assert.equal(pins[0].elAt, "cta-turmas");
  assert.deepEqual(pins[0].said.map((one) => one.text), ["troca o verbo", "concordo"]);
  assert.equal(pins[1].done, true);
});

test("the answer the agent wrote reaches the page marked as the agent's", () => {
  const comments = [
    { id: "c-1", tab: "telas", text: "troca o verbo", who: "rafael", pin: { el: "#f-1 .cta" } },
    { id: "c-2", tab: "telas", text: "troquei pra Criar turma", who: "as-telas", re: "c-1", agent: true }
  ];
  const pins = threadsOnThePage(comments, "telas");
  assert.equal(pins.length, 1, "an answer does not open a second pin");
  assert.deepEqual(pins[0].said.map((one) => one.agent), [false, true]);
  assert.equal(pins[0].said[1].text, "troquei pra Criar turma");
});

test("the page keeps being read while it is open, so an answer shows up without a click", () => {
  assert.match(panesSource, /const PINS_BEAT = 5000/);
  const watch = cut(panesSource, "function watchPagePins(name, frame)", "function askOnTheElement", "chat-and-panes.js");
  assert.match(watch, /clearInterval/, "a second open must not leave two beats running");
  assert.match(watch, /tab\?\.kind !== "artifact" \|\| !frame\.isConnected/, "the beat stops when the page is gone");
});

test("answering in the chat writes in the conversation first, then hands the seat its id", async () => {
  seatOnAPage("chat-seat", { id: "t1", kind: "artifact", slug: "as-telas", tab: "telas", version: 2, url: "shelf://as-telas/" });
  const frame = { dataset: { id: "t1" }, send: () => {}, capturePage: async () => ({ toDataURL: () => "" }) };
  const calls = await dialled(() => askOnTheElement("chat-seat", frame, {
    said: "e se ficasse em cima?", selector: "#f-1 .cta", elAt: "criar-turma", where: "chat", rect: { x: 0, y: 0, width: 4, height: 4 }
  }), { comment: { id: "c-7" }, comments: [] });
  const wrote = calls.find((one) => one.url === "/api/shelf/comment");
  assert.ok(wrote, "as palavras da pessoa têm de ficar na página, não só no chat");
  assert.equal(wrote.body.text, "e se ficasse em cima?");
  assert.equal(wrote.body.quiet, true, "quem avisa o assento é a referência, senão ele ouve a mesma pergunta duas vezes");
  const handed = calls.find((one) => one.url === "/api/browser/reference");
  assert.ok(handed, "o assento precisa saber onde responder");
  assert.match(handed.body.said, /conversa "c-7"/, "o id é o da conversa que acabou de nascer, nunca um seletor");
  assert.match(handed.body.said, /reply_on_page/);
});

test("in the new hive, adding to the chat leaves no comment and no pin on the page", async () => {
  document.body.classList.add("experience-next");
  seatOnAPage("chat-only-seat", { id: "t1", kind: "artifact", slug: "as-telas", tab: "telas", version: 2, url: "shelf://as-telas/" });
  const frame = { dataset: { id: "t1" }, send: () => {}, capturePage: async () => ({ toDataURL: () => "" }) };
  const calls = await dialled(() => askOnTheElement("chat-only-seat", frame, {
    said: "e se ficasse em cima?", selector: "#f-1 .cta", elAt: "criar-turma", where: "chat", rect: { x: 0, y: 0, width: 4, height: 4 }
  }), { comment: { id: "c-7" }, comments: [] });
  document.body.classList.remove("experience-next");
  assert.equal(calls.some((one) => one.url === "/api/shelf/comment"), false);
  const handed = calls.find((one) => one.url === "/api/browser/reference");
  assert.equal(handed.body.said, "e se ficasse em cima?");
  assert.doesNotMatch(handed.body.said, /reply_on_page/);
});

test("in the new hive, answering a pin from the chat still answers in its conversation", async () => {
  document.body.classList.add("experience-next");
  seatOnAPage("pin-reply-seat", { id: "t1", kind: "artifact", slug: "as-telas", tab: "telas", version: 2, url: "shelf://as-telas/" });
  const frame = { dataset: { id: "t1" }, send: () => {}, capturePage: async () => ({ toDataURL: () => "" }) };
  const calls = await dialled(() => askOnTheElement("pin-reply-seat", frame, {
    said: "e agora?", selector: "#f-1 .cta", elAt: "criar-turma", where: "chat", re: "c-3", rect: { x: 0, y: 0, width: 4, height: 4 }
  }), { comment: { id: "c-9", re: "c-3" }, comments: [] });
  document.body.classList.remove("experience-next");
  assert.equal(calls.find((one) => one.url === "/api/shelf/comment")?.body.re, "c-3");
});

test("the line handed to the chat names the page, the conversation and the piece", () => {
  const line = threadLine({ slug: "as-telas" }, { elAt: "criar-turma" }, "empilha?", "c-1");
  assert.equal(line, 'empilha? · responda na página com reply_on_page: slug "as-telas", conversa "c-1", no pedaço "criar-turma"');
});

test("a beat belongs to its own frame, so two shelf tabs never paint each other", () => {
  const web = webStateOf("two-tabs");
  web.tabs = [
    { id: "t1", kind: "artifact", slug: "pagina-a", tab: "telas", url: "shelf://pagina-a/" },
    { id: "t2", kind: "artifact", slug: "pagina-b", tab: "telas", url: "shelf://pagina-b/" }
  ];
  web.active = 1;
  assert.equal(tabOfFrame("two-tabs", { dataset: { id: "t1" } })?.slug, "pagina-a", "o quadro manda, não a aba que está na frente");
  assert.equal(tabOfFrame("two-tabs", { dataset: { id: "t2" } })?.slug, "pagina-b");
  assert.equal(tabOfFrame("two-tabs", { dataset: { id: "sumiu" } }), null);
});

test("where the person is standing is told once, not on every beat", async () => {
  seatOnAPage("stand-seat", { id: "t1", kind: "artifact", slug: "as-telas", tab: "telas", url: "shelf://as-telas/" });
  const first = await dialled(() => standOnThePage("stand-seat", "criar-turma"));
  assert.equal(first.length, 1);
  assert.equal(first[0].url, "/api/shelf/here");
  assert.deepEqual(first[0].body, { seat: "stand-seat", slug: "as-telas", tab: "telas", el: "criar-turma" });
  const again = await dialled(() => standOnThePage("stand-seat", "criar-turma"));
  assert.deepEqual(again, [], "parado no mesmo lugar não fala de novo");
  const moved = await dialled(() => standOnThePage("stand-seat", ""));
  assert.equal(moved.length, 1, "fechar a conversa conta como sair do pedaço");
});

test("on a page that is not on the shelf, nobody is told where you are", async () => {
  seatOnAPage("out-seat", { id: "t1", kind: "page", url: "https://arvore.dev/" });
  const calls = await dialled(() => standOnThePage("out-seat", "qualquer"));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { seat: "out-seat", slug: "", tab: "", el: "" });
});

test("the box offers the two doors the decision asked for", () => {
  assert.match(picker, /__hive_ask_chat/);
  assert.match(picker, /responder no chat/);
  const send = cut(picker, "function sendAsk(where)", "function pinHost", "seat-preload");
  assert.match(send, /where: where === "chat" \? "chat" : "page"/);
  assert.match(picker, /ipcRenderer\.on\("hive-faces"/, "a página precisa saber quem mais está nela");
  assert.match(picker, /function drawWatchers/);
});

test("standing still is said again before the team forgets you", async () => {
  seatOnAPage("still-seat", { id: "t1", kind: "artifact", slug: "as-telas", tab: "telas", url: "shelf://as-telas/" });
  const first = await dialled(() => standOnThePage("still-seat", "criar-turma"));
  assert.equal(first.length, 1);
  const quiet = await dialled(() => standOnThePage("still-seat", "criar-turma"));
  assert.deepEqual(quiet, [], "logo depois não precisa repetir");
  const src = readFileSync(join(here, "..", "src", "app", "chat-and-panes.js"), "utf8");
  const stand = cut(src, "function standOnThePage(name, el, tabNow)", "async function paintPageFaces", "chat-and-panes.js");
  assert.match(stand, /Date\.now\(\) - was\.at < HERE_AGAIN/, "o carimbo tem de envelhecer");
  const again = Number(src.match(/const HERE_AGAIN = (\d+)/)?.[1]);
  const hold = 90000;
  assert.ok(again > 0 && again < hold, `o recado tem de voltar antes dos ${hold}ms em que o time esquece — é ${again}`);
});

test("a click on the hive's own furniture never becomes a comment", () => {
  const click = cut(picker, "function onClick", "function setPicking", "seat-preload");
  for (const mark of ["__hive_ask", "__hive_pin", "__hive_who", "__hive_quote"]) {
    assert.match(click, new RegExp(mark), `${mark} tem de estar fora do alvo`);
  }
});

test("the pointing mode goes off once the box opens, on the shelf too", () => {
  const src = readFileSync(join(here, "..", "src", "app", "chat-and-panes.js"), "utf8");
  const ask = cut(src, "async function askOnTheElement(name, frame, ask)", "async function sendPickReference", "chat-and-panes.js");
  assert.match(ask, /setWebPick\(name, false\)/, "senão o botão fica aceso e o próximo clique só o apaga");
});

test("the words are never lost in silence when the shelf refuses them", async () => {
  seatOnAPage("lost-seat", { id: "t1", kind: "artifact", slug: "as-telas", tab: "telas", url: "shelf://as-telas/" });
  const frame = { dataset: { id: "t1" }, send: () => {}, capturePage: async () => ({ toDataURL: () => "" }) };
  const calls = await dialled(() => askOnTheElement("lost-seat", frame, {
    said: "empilha os dois", selector: "#f-1 .cta", elAt: "criar-turma", rect: { x: 0, y: 0, width: 4, height: 4 }
  }), { error: "no page with that name on the shelf" });
  const handed = calls.find((one) => one.url === "/api/browser/reference");
  assert.ok(handed, "a caixa já apagou o texto: ele tem de chegar em algum lugar");
  assert.equal(handed.body.said, "empilha os dois");
});

test("only the tab in front paints the bar and says where the person is", () => {
  const web = webStateOf("front-seat");
  web.tabs = [
    { id: "t1", kind: "artifact", slug: "pagina-a", tab: "telas", url: "shelf://pagina-a/" },
    { id: "t2", kind: "artifact", slug: "pagina-b", tab: "telas", url: "shelf://pagina-b/" }
  ];
  web.active = 1;
  assert.equal(frameIsUpFront("front-seat", { dataset: { id: "t2" } }), true);
  assert.equal(frameIsUpFront("front-seat", { dataset: { id: "t1" } }), false);
  const src = readFileSync(join(here, "..", "src", "app", "chat-and-panes.js"), "utf8");
  const faces = cut(src, "async function paintPageFaces(name, frame)", "function paintFacesOfPane", "chat-and-panes.js");
  assert.match(faces, /if \(frameIsUpFront\(name, frame\)\) paintFacesOfPane/, "senão os rostinhos piscam entre as abas");
  assert.match(faces, /FACES_HELD\.get\(frameKey\(name, frame\)\)/, "o que foi pintado é lembrado por quadro");
});

test("a page the agent opened with the pane shut never says the person is looking at it", () => {
  const src = readFileSync(join(here, "..", "src", "app", "chat-and-panes.js"), "utf8");
  const born = cut(src, "function bornWebFrame(yard, name, t)", "function paintYards", "chat-and-panes.js");
  assert.match(born, /showingArtifact\(name\) && frameIsUpFront\(name, frame\)/, "o dom-ready tem de usar o mesmo guarda da batida");
  const watch = cut(src, "function watchPagePins(name, frame)", "function threadsOnThePage", "chat-and-panes.js");
  assert.match(watch, /showingArtifact\(name\) && frameIsUpFront\(name, frame\)/, "e a batida, o mesmo do dom-ready");
});

test("in the new hive the box has one door off the shelf and two named ones on it", () => {
  const doors = cut(picker, "function doorsOfAsk(card)", "\n}\n", "seat-preload");
  assert.match(doors, /page\.style\.display = shelf \? "" : "none";/, "off the shelf, commenting on the page and adding to the chat were the same thing");
  assert.match(picker, /const onTheShelf = \(\) => location\.protocol === "shelf:";/);
  assert.match(picker, /sendAsk\(askLook && !onTheShelf\(\) \? "chat" : "page"\)/, "⌘↵ presses the door that is on screen");
  assert.match(picker, /ipcRenderer\.on\("hive-ask-look"/);
  assert.match(panesSource, /frame\.send\("hive-ask-look", \{ next: experienceNext\(\), chat: phrase\("add to the chat"\), page: phrase\("comment on the page"\)/);
  assert.match(picker, /responder no chat/, "the current hive keeps its two doors as they were");
});
