import { test, after } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

Object.defineProperty(navigator, "userAgent", { value: `${navigator.userAgent} Electron/30.0.0`, configurable: true });
window.hiveLink = window.hiveLink || { open: () => ({ send() {}, close() {} }) };

const st = await state();
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { homeOfLink, openWebPage, paintYards, webOfSeat, wireLinks } = await app("chat-and-panes");
const { openPrInASeat } = await app("page-in-a-seat");
const { goToPr } = await app("seat-menu");
const { drafts } = await app("draft-seat");
const { prPageAddress } = await import("../assets/pr-page.mjs");

const SHELF = {
  repo: "https://github.com/acme/artifacts",
  me: "art",
  pages: [{
    slug: "guarda-roupa-do-avatar-do-hive", title: "Guarda-roupa do avatar do Hive", label: "in-review", owner: "art", at: 20,
    tabs: { documento: { versions: [{ n: 1, label: "in-review", at: 20 }] } }
  }]
};

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat", raw: "idle" });
const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
globalThis.fetch = (where) => {
  const path = String(where);
  if (path.startsWith("/api/hive")) return Promise.resolve(answered({ sessions: [seat("atendimento-leitura")], spawning: [], archived: [], pod: { up: false, name: "" } }));
  if (path.startsWith("/api/shelf")) return Promise.resolve(answered(SHELF));
  return Promise.resolve(answered({}));
};
window.hiveOpenShelf = () => {};
after(() => { globalThis.fetch = realFetch; });

if (!document.getElementById("webyard")) {
  const yard = document.createElement("div");
  yard.id = "webyard";
  document.body.appendChild(yard);
}

bootSolid();

const PR = "https://github.com/acme/hive/pull/1111";
const PAGE = prPageAddress("acme/hive#1111");

function hive(session = "") {
  document.body.classList.add("experience-next");
  st.LIMIT = 6;
  st.data = { sessions: [seat("atendimento-leitura")], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: ["atendimento-leitura"] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.shelf = SHELF;
  st.published = [];
  st.webChat = null;
  st.prs = [{ key: "acme/hive#1111", url: PR, session, title: "menu", repo: "acme/hive", number: 1111 }];
  for (const name of [...webOfSeat.keys()]) webOfSeat.delete(name);
  for (const one of [...drafts.values()]) { one.e.host.remove(); drafts.delete(one.id); }
  document.getElementById("webyard").innerHTML = "";
  render();
}

const tabsOf = (name) => webOfSeat.get(name)?.tabs || [];

test("a PR that has a chat opens as the hive's own PR page in that chat's browser", () => {
  hive("atendimento-leitura");
  goToPr(st.prs[0]);
  assert.equal(st.webChat, "atendimento-leitura");
  assert.match(PAGE, /^shelf:\/\/pr-[0-9a-f]{8}\/$/);
  assert.deepEqual(tabsOf("atendimento-leitura").map((t) => t.url), [PAGE]);
  assert.equal(tabsOf("atendimento-leitura")[0].kind, "web", "the page has no shelf rail");
  assert.equal(st.reviewChat, null, "the in-app review screen stays shut");
});

test("a PR with no chat opens in a new chat, the way a page from the shelf does", () => {
  hive("");
  goToPr(st.prs[0]);
  assert.ok(String(st.webChat).startsWith("draft:"));
  assert.deepEqual(tabsOf(st.webChat).map((t) => t.url), [PAGE]);
});

test("opening the same PR again goes back to its tab, even after clicking around inside it", () => {
  hive("atendimento-leitura");
  openPrInASeat(st.prs[0]);
  openPrInASeat(st.prs[0]);
  assert.equal(tabsOf("atendimento-leitura").length, 1);
  assert.equal(tabsOf("atendimento-leitura")[0].url, PAGE);
});

test("another PR in the same chat takes over the PR tab instead of opening one more", () => {
  hive("");
  openPrInASeat(st.prs[0]);
  const first = st.webChat;
  openPrInASeat({ ...st.prs[0], key: "acme/hive#11112", url: `${PR}2` });
  assert.equal(st.webChat, first);
  assert.deepEqual(tabsOf(first).map((t) => t.url), [prPageAddress("acme/hive#11112")]);
});

test("a GitHub tab reached from the PR page is taken over by the next PR", () => {
  hive("atendimento-leitura");
  openPrInASeat(st.prs[0]);
  tabsOf("atendimento-leitura")[0].url = `${PR}/files`;
  openPrInASeat({ ...st.prs[0], key: "acme/hive#7" });
  assert.deepEqual(tabsOf("atendimento-leitura").map((t) => t.url), [prPageAddress("acme/hive#7")]);
});

test("a tab that is not a pull request is left where it was", () => {
  hive("atendimento-leitura");
  openWebPage("atendimento-leitura", "https://github.com/acme/hive/issues/7");
  openPrInASeat(st.prs[0]);
  assert.deepEqual(tabsOf("atendimento-leitura").map((t) => t.url), ["https://github.com/acme/hive/issues/7", PAGE]);
});

test("the current hive keeps its own review screen", () => {
  hive("atendimento-leitura");
  document.body.classList.remove("experience-next");
  goToPr(st.prs[0]);
  assert.equal(st.reviewChat, "atendimento-leitura");
  assert.equal(tabsOf("atendimento-leitura").length, 0);
});

test("in the new hive any link in the chat opens in that chat's browser, and ⌘+click still leaves", () => {
  hive("atendimento-leitura");
  const local = "http://localhost:3107/biblioteca/pagamento?kit=B";
  const root = document.createElement("div");
  root.innerHTML = `<a href="${local}" target="_blank" rel="noreferrer">${local}</a>`;
  wireLinks("atendimento-leitura", root);
  const link = root.querySelector("a");
  assert.equal(link.dataset.here, "1");
  const opened = [];
  const wasOpen = window.open;
  window.open = (url) => { opened.push(url); return null; };
  link.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.equal(st.webChat, "atendimento-leitura");
  assert.deepEqual(tabsOf("atendimento-leitura").map((t) => t.url), [local]);
  link.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true, ctrlKey: true }));
  window.open = wasOpen;
  assert.deepEqual(opened, [local]);
});

test("the current hive keeps sending plain links to the person's browser", () => {
  hive("atendimento-leitura");
  document.body.classList.remove("experience-next");
  assert.equal(homeOfLink("atendimento-leitura", "http://localhost:3107/"), null);
});
