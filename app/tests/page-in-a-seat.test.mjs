import { test, after } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

Object.defineProperty(navigator, "userAgent", { value: `${navigator.userAgent} Electron/30.0.0`, configurable: true });
window.hiveLink = window.hiveLink || { open: () => ({ send() {}, close() {} }) };

const st = await state();
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { artifactTabOf, webOfSeat } = await app("chat-and-panes");
const { nameForPage, openPageInASeat, seatOfPage, seatThatPublished, seatYouClickedFrom } = await app("page-in-a-seat");
const { drafts } = await app("draft-seat");

const SHELF = {
  repo: "https://github.com/acme/artifacts",
  me: "jonas",
  pages: [
    {
      slug: "guarda-roupa-do-avatar-do-hive",
      title: "Guarda-roupa do avatar do Hive",
      label: "in-review",
      owner: "rosa",
      at: 20,
      tabs: {
        documento: { versions: [{ n: 1, label: "draft", at: 10 }, { n: 2, label: "in-review", at: 20 }] },
        telas: { versions: [{ n: 1, label: "in-review", at: 15 }] }
      }
    }
  ]
};

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat", raw: "idle" });

const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;

let asked = [];
let spawned = [];
let shelfOnTheWire = SHELF;
let shelfWireHangs = false;
let seatsOnTheWire = [];

globalThis.fetch = (where, how) => {
  const path = String(where);
  asked.push(path);
  if (path === "/api/spawn") {
    const body = JSON.parse(how?.body || "{}");
    spawned.push(body);
    seatsOnTheWire = [...seatsOnTheWire, seat(body.name)];
    return Promise.resolve(answered({ ok: true, id: `n${spawned.length}`, name: body.name }));
  }
  if (path.startsWith("/api/hive")) {
    return Promise.resolve(answered({ sessions: seatsOnTheWire.map((s) => ({ ...s })), spawning: [], archived: [], pod: { up: false, name: "" } }));
  }
  if (path.startsWith("/api/shelf")) return shelfWireHangs ? new Promise(() => {}) : Promise.resolve(answered(shelfOnTheWire));
  return Promise.resolve(answered({}));
};

const firstAt = (match) => asked.findIndex((one) => (typeof match === "string" ? one === match : match.test(one)));

const toTheShelfScreen = [];
window.hiveOpenShelf = (which) => toTheShelfScreen.push(which);
after(() => { globalThis.fetch = realFetch; });

bootSolid();

const withSeat = (name) => ({ ...SHELF, pages: SHELF.pages.map((one) => ({ ...one, seat: name })) });

function hive({ seats = ["atendimento-leitura"], shelf = SHELF } = {}) {
  st.LIMIT = 6;
  seatsOnTheWire = seats.map(seat);
  st.data = { sessions: seats.map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: [...seats] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.shelf = shelf;
  st.published = [];
  st.shelfOpen = null;
  document.getElementById("shelf").hidden = true;
  st.webChat = null;
  st.cockChat = null;
  st.deviceChat = null;
  st.threadChat = null;
  st.reviewChat = null;
  for (const name of [...webOfSeat.keys()]) webOfSeat.delete(name);
  for (const one of [...drafts.values()]) { one.e.host.remove(); drafts.delete(one.id); }
  asked = [];
  spawned = [];
  toTheShelfScreen.length = 0;
  shelfOnTheWire = shelf || { pages: [] };
  shelfWireHangs = false;
  render();
}

test("the seat a page opens is named after the page, and never collides with one already there", () => {
  assert.equal(nameForPage("guarda-roupa-do-avatar-do-hive", new Set()), "guarda-roupa-do-avatar-do-hive");
  assert.equal(nameForPage("estante", new Set(["estante"])), "estante-2");
  assert.equal(nameForPage("estante", new Set(["estante", "estante-2"])), "estante-3");
  assert.equal(nameForPage("a".repeat(80), new Set()).length, 40, "a seat name stays inside the ceiling");
});

test("the page opens in the seat that published it, and that seat is not asked to be born again", async () => {
  hive({ seats: ["atendimento-leitura", "guarda-roupa"], shelf: withSeat("guarda-roupa") });
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0 });
  assert.equal(spawned.length, 0, "the seat that wrote the page was already there");
  assert.equal(st.webChat, "guarda-roupa", "the page landed anywhere but in the seat that made it");
  assert.equal(artifactTabOf("guarda-roupa").slug, "guarda-roupa-do-avatar-do-hive");
  assert.equal(artifactTabOf("atendimento-leitura"), null, "the seat you were working in was left alone");
});

test("a page the shelf never learned the owner of still finds it in what this machine kept", async () => {
  hive({ seats: ["atendimento-leitura", "guarda-roupa"] });
  st.published = [{ key: "226a690e89b2", session: "guarda-roupa", where: "local", slug: "guarda-roupa-do-avatar-do-hive", title: "Guarda-roupa do avatar do Hive" }];
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0 });
  assert.equal(spawned.length, 0);
  assert.equal(drafts.size, 0, "a page this machine published from a live seat opened an empty chat instead");
  assert.equal(st.webChat, "guarda-roupa", "the page did not land in the seat that kept it");
});

test("the seat that published it is gone, so the page does not chase it", async () => {
  hive({ seats: ["atendimento-leitura"], shelf: withSeat("um-assento-que-ja-morreu") });
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0 });
  assert.equal(seatThatPublished("guarda-roupa-do-avatar-do-hive"), "", "a dead seat is not where the page goes");
  assert.ok(String(st.webChat).startsWith("draft:"), "the page opened somewhere it should not have");
  assert.equal(artifactTabOf("atendimento-leitura"), null);
});

test("a page with no seat of its own opens a chat that costs nothing until you write", async () => {
  hive();
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "telas", version: 1 });

  assert.equal(spawned.length, 0, "reading a page paid for a model and an agent");
  assert.deepEqual(toTheShelfScreen, [], "the shelf screen never covers the window");
  assert.ok(String(st.webChat).startsWith("draft:"));
  assert.equal(drafts.size, 1, "one empty chat, for one page");
  const tab = artifactTabOf(st.webChat);
  assert.equal(tab.slug, "guarda-roupa-do-avatar-do-hive");
  assert.equal(tab.tab, "telas");
  assert.equal(tab.version, 1);
});

test("the index already on this machine answers, so the click waits on no network", async () => {
  hive();
  shelfWireHangs = true;
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0 });
  assert.ok(String(st.webChat).startsWith("draft:"), "the click sat waiting on an index this machine already had");
  assert.equal(artifactTabOf(st.webChat).slug, "guarda-roupa-do-avatar-do-hive");
});

test("a page this machine has never seen is worth the wait, and only that one", async () => {
  hive({ shelf: { repo: SHELF.repo, pages: [] } });
  shelfOnTheWire = SHELF;
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0 });
  assert.ok(firstAt(/pull=1/) >= 0, "the network was asked, because the page was not here");
  assert.ok(String(st.webChat).startsWith("draft:"));
});

test("a page open in a seat that is not its own is not a reason to send you there", async () => {
  hive();
  webOfSeat.set("atendimento-leitura", { tabs: [{ id: 1, kind: "artifact", slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 2 }], active: 0 });
  assert.equal(seatOfPage("guarda-roupa-do-avatar-do-hive"), "", "a working seat holding the page is not the page's seat");
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0 });
  assert.ok(String(st.webChat).startsWith("draft:"), "the seat you were working in was taken over");
});

test("clicking the same page again goes back to where it already is, never to a second chat", async () => {
  hive();
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0 });
  const first = st.webChat;
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "telas", version: 1 });
  assert.equal(st.webChat, first, "the second click opened a second chat");
  assert.equal(drafts.size, 1);
  assert.equal(artifactTabOf(first).tab, "telas", "and it moved to the tab that was asked for");
});

test("open in a seat leaves the shelf screen behind, whichever chat the page lands in", async () => {
  hive({ seats: ["atendimento-leitura", "guarda-roupa"], shelf: withSeat("guarda-roupa") });
  document.getElementById("shelf").hidden = false;
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0 });
  assert.equal(st.webChat, "guarda-roupa");
  assert.equal(document.getElementById("shelf").hidden, true, "the page opened in its seat, but the shelf screen stayed on top of it");

  hive();
  document.getElementById("shelf").hidden = false;
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0 });
  assert.ok(String(st.webChat).startsWith("draft:"));
  assert.equal(document.getElementById("shelf").hidden, true, "the empty chat opened behind the shelf screen");
});

test("a page the shelf does not have falls back to the shelf screen", async () => {
  hive();
  shelfOnTheWire = { repo: SHELF.repo, pages: [] };
  await openPageInASeat({ slug: "nao-existe", tab: "", version: 0 });
  assert.equal(spawned.length, 0, "no seat is opened on a page that is not there");
  assert.equal(drafts.size, 0, "and no empty chat either");
  assert.deepEqual(toTheShelfScreen, [{ slug: "nao-existe", tab: "", version: 0 }]);
});

test("a page you click inside a chat opens in that chat, not in a seat of its own", async () => {
  hive({ seats: ["atendimento-leitura", "metricas-design-ai"] });
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0, from: "metricas-design-ai" });

  assert.equal(st.webChat, "metricas-design-ai", "the page landed where the person was reading");
  assert.equal(artifactTabOf("metricas-design-ai").slug, "guarda-roupa-do-avatar-do-hive");
  assert.equal(drafts.size, 0, "and no empty chat was opened for it");
});

test("the seat that published the page still wins over the seat you clicked from", async () => {
  hive({ seats: ["atendimento-leitura", "metricas-design-ai"], shelf: withSeat("atendimento-leitura") });
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0, from: "metricas-design-ai" });

  assert.equal(st.webChat, "atendimento-leitura", "the page goes home to whoever wrote it");
  assert.equal(artifactTabOf("metricas-design-ai"), null);
});

test("a link from outside the app has no chat to land in, so it still gets a draft", async () => {
  hive();
  await openPageInASeat({ slug: "guarda-roupa-do-avatar-do-hive", tab: "documento", version: 0 });

  assert.equal(drafts.size, 1, "a deep link from Slack opens the empty chat, as it did before");
  assert.equal(artifactTabOf("atendimento-leitura"), null, "and never takes over the seat you happened to be in");
});

test("a chat that died between the click and the open is not somewhere to land", () => {
  hive({ seats: ["atendimento-leitura"] });
  assert.equal(seatYouClickedFrom({ from: "um-assento-que-ja-morreu" }), "", "a name nobody answers to is no seat");
  assert.equal(seatYouClickedFrom({ from: "atendimento-leitura" }), "atendimento-leitura");
  assert.equal(seatYouClickedFrom({}), "", "and a link with no origin points nowhere");
});
