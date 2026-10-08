import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "node:http";
import { app, state } from "./dom.mjs";

Object.defineProperty(navigator, "userAgent", { value: `${navigator.userAgent} Electron/30.0.0`, configurable: true });

const st = await state();
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { artFileOf, shelfPaneIndex } = await app("subagents-dock");
const { addWebTab, artifactTabOf, openArtifactTab, openKeptPage, shelvePreviews, webOfSeat, webStateOf } = await app("chat-and-panes");
const { tilePagesModel } = await app("seat-menu");

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const artifactRoutes = readFileSync(join(HERE, "routes/artifacts.mjs"), "utf8");

function cut(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const SHELF = {
  repo: "https://github.com/acme/artifacts",
  pages: [
    {
      slug: "chat-orquestrador",
      title: "Chat Orquestrador",
      label: "em-revisao",
      owner: "jonas",
      at: 20,
      tabs: {
        documento: { versions: [{ n: 1, label: "rascunho", at: 10 }, { n: 2, label: "em-revisao", at: 20 }] },
        telas: { versions: [{ n: 1, label: "em-revisao", at: 15 }] }
      }
    },
    { slug: "pagina-sem-versao", title: "Nada guardado", tabs: {} }
  ]
};

const KEPT = [
  { key: "aaaaaaaaaaaa", session: "orquestrador", path: "/tmp/a/rfc-orquestrador.html", slug: "chat-orquestrador", title: "Chat Orquestrador", label: "em-revisao", n: 2, at: 30 },
  { key: "bbbbbbbbbbbb", session: "orquestrador", path: "/tmp/a/telas-orquestrador.html", slug: "telas-do-chat", title: "Telas do chat", label: "rascunho", n: 1, at: 20 },
  { key: "cccccccccccc", session: "outro-assento", path: "/tmp/a/outra.html", slug: "outra", title: "Outra", label: "entregue", n: 5, at: 10 }
];

const asked = [];
const indexServed = { key: "aaaaaaaaaaaa", slug: "chat-orquestrador", tab: "", path: "/tmp/a/rfc-orquestrador.html", versions: [{ n: 2 }] };
const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
globalThis.fetch = (where) => {
  const path = String(where);
  asked.push(path);
  if (path.startsWith("/api/shelf")) return Promise.resolve(answered(st.shelf || { pages: [] }));
  if (path.startsWith("/api/artifact/index")) return Promise.resolve(answered(indexServed));
  if (path.startsWith("/api/artifacts")) return Promise.resolve(answered({ pages: st.published }));
  return Promise.resolve(answered({}));
};

const toTheShelf = [];
window.hiveOpenShelf = (which) => toTheShelf.push(which);
after(() => { globalThis.fetch = realFetch; });

bootSolid();

const seat = (name) => ({ name, title: name, where: "local", state: "idle", kind: "chat" });

function hive({ seats = ["orquestrador"], shelf = SHELF, published = KEPT, open = null } = {}) {
  st.LIMIT = 4;
  st.data = { sessions: seats.map(seat), spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: [...seats] }];
  st.block = 0;
  st.focus = 0;
  st.open = open;
  st.seatsKnown = true;
  st.shelf = shelf;
  st.published = published;
  st.webChat = null;
  st.cockChat = null;
  st.deviceChat = null;
  st.threadChat = null;
  st.reviewChat = null;
  for (const name of [...webOfSeat.keys()]) webOfSeat.delete(name);
  asked.length = 0;
  toTheShelf.length = 0;
  render();
}

test("a page on the shelf is dressed for the panel beside the terminal", () => {
  hive();
  const index = shelfPaneIndex(SHELF.pages[0], "documento", 1);
  assert.equal(index.shelf, true);
  assert.equal(index.slug, "chat-orquestrador");
  assert.equal(index.tab, "documento");
  assert.equal(index.v, 1, "the version the link asked for");
  assert.deepEqual(index.tabs, ["documento", "telas"]);
  assert.deepEqual(index.counts, { documento: 2, telas: 1 });
  assert.equal(index.title, "Chat Orquestrador");
});

test("a tab or a version that is not there falls back to what is", () => {
  hive();
  assert.equal(shelfPaneIndex(SHELF.pages[0], "inventada", 0).tab, "documento");
  assert.equal(shelfPaneIndex(SHELF.pages[0], "telas", 9).v, 1, "the newest version of that tab");
  assert.equal(shelfPaneIndex(SHELF.pages[0], "documento", 0).v, 2);
  assert.equal(shelfPaneIndex(SHELF.pages[1], "documento", 0), null, "a page with nothing kept opens nothing");
});

test("a page still says which file it is, on the shelf and in the keep", () => {
  assert.equal(artFileOf({ shelf: true, slug: "chat-orquestrador", tab: "telas" }), "a/chat-orquestrador/telas");
  assert.equal(artFileOf({ key: "a1b2c3d4e5f6", path: "/tmp/rfc/telas-orquestrador.html" }), "telas-orquestrador.html");
});

/* ── the pages a seat published, as cards in its chat ── */

test("a chat shows the pages its own seat published, and nobody else's", () => {
  hive({ open: "orquestrador" });
  assert.deepEqual(tilePagesModel({ name: "orquestrador" }).cards.map((one) => one.key), ["aaaaaaaaaaaa", "bbbbbbbbbbbb"]);
  assert.deepEqual(tilePagesModel({ name: "assento-sem-pagina" }).cards, []);
});

test("the card says the file, the version and the state, and carries the title", () => {
  hive({ open: "orquestrador" });
  const [card] = tilePagesModel({ name: "orquestrador" }).cards;
  assert.equal(card.name, "rfc-orquestrador.html");
  assert.equal(card.version, "v2 · em-revisao");
  assert.equal(card.subject, "Chat Orquestrador");
  assert.equal(card.here, false);

  openArtifactTab("orquestrador", { slug: "chat-orquestrador", tab: "documento" }, 2);
  assert.equal(tilePagesModel({ name: "orquestrador" }).cards[0].here, true, "the page on screen is marked on its own card");
});

test("a closed tile shows the newest page and says how many are behind it", () => {
  hive();
  const shut = tilePagesModel({ name: "orquestrador" });
  assert.deepEqual(shut.cards.map((one) => one.name), ["rfc-orquestrador.html"]);
  assert.match(shut.more, /1 more page/);

  hive({ open: "orquestrador" });
  const wide = tilePagesModel({ name: "orquestrador" });
  assert.deepEqual(wide.cards.map((one) => one.name), ["rfc-orquestrador.html", "telas-orquestrador.html"]);
  assert.equal(wide.more, "");
});

const page = (key, file, n, at, tab = "") => ({
  key, session: "materiais", path: `/tmp/a/${file}`, tab,
  slug: "materiais-da-escola", title: "Materiais da escola", label: "draft-ampliado", n, at
});

const SAME_PAGE = [
  page("dddddddddddd", "plano-materiais.html", 2, 50, "plano"),
  page("eeeeeeeeeeee", "telas-materiais.html", 3, 40),
  page("ffffffffffff", "materiais.html", 6, 30)
];

test("the tabs of one page are one card, and the card is the document", () => {
  hive({ seats: ["materiais"], published: SAME_PAGE, open: "materiais" });
  const { cards, more } = tilePagesModel({ name: "materiais" });
  assert.deepEqual(cards.map((one) => one.name), ["materiais.html"], "neither the canvas nor the plan gets a line of its own");
  assert.equal(cards[0].version, "v6 · draft-ampliado", "and it carries the version of the document, not of the other tabs");
  assert.equal(more, "", "one page behind one card is not a page hidden behind another");
});

test("a page published without a document shows the tab it does have", () => {
  hive({ seats: ["materiais"], published: SAME_PAGE.slice(0, 2), open: "materiais" });
  assert.deepEqual(tilePagesModel({ name: "materiais" }).cards.map((one) => one.name), ["telas-materiais.html"], "screens come before the plan");

  hive({ seats: ["materiais"], published: [SAME_PAGE[0]], open: "materiais" });
  assert.deepEqual(tilePagesModel({ name: "materiais" }).cards.map((one) => one.name), ["plano-materiais.html"]);
});

test("a seat with no page paints nothing at all", () => {
  hive({ published: [] });
  const bare = tilePagesModel({ name: "orquestrador" });
  assert.deepEqual(bare.cards, []);
  assert.equal(bare.more, "");
});

test("clicking a card opens that page, and clicking it again closes it", async () => {
  hive({ open: "orquestrador" });
  await openKeptPage("orquestrador", KEPT[0]);
  assert.ok(asked.some((one) => one.startsWith("/api/artifact/index") && one.includes("rfc-orquestrador.html")));
  assert.equal(artifactTabOf("orquestrador").slug, "chat-orquestrador");
  assert.equal(st.webChat, "orquestrador");

  asked.length = 0;
  await openKeptPage("orquestrador", KEPT[0]);
  assert.equal(st.webChat, null, "the page already on screen closes instead of opening twice");
  assert.deepEqual(asked.filter((one) => one.startsWith("/api/artifact/index")), [], "and nothing is fetched to close it");
});

/* ── what the hive kept, whichever door published it ── */

const kept = (indexes) => new Function("readdirSync", "artifactIndex", "ARTIFACT_HOME",
  cut(server, "function keptArtifacts() {", "\nasync function readArtifactPage(", "server.mjs")
  + "return keptArtifacts;"
)(
  () => Object.keys(indexes),
  (key) => indexes[key] || null,
  "/tmp/hive-artifacts-test"
);

test("the pages of this hive come back newest first, with the head version on the face", () => {
  const list = kept({
    old: { key: "old", session: "um", path: "/tmp/a.html", slug: "a", title: "A", versions: [{ n: 1, label: "rascunho", at: 10 }] },
    fresh: { key: "fresh", session: "dois", path: "/tmp/b.html", slug: "b", title: "B", versions: [{ n: 1, at: 20 }, { n: 4, label: "entregue", at: 40 }] },
    empty: { key: "empty", session: "tres", versions: [] }
  })();
  assert.deepEqual(list.map((one) => one.key), ["fresh", "old"], "a page with no version kept is not a page");
  assert.equal(list[0].n, 4);
  assert.equal(list[0].label, "entregue");
  assert.equal(list[0].at, 40);
  assert.equal(list[1].label, "rascunho");
});

test("a home with no artifacts at all answers with an empty list, not a crash", () => {
  const blind = new Function("readdirSync", "artifactIndex", "ARTIFACT_HOME",
    cut(server, "function keptArtifacts() {", "\nasync function readArtifactPage(", "server.mjs")
    + "return keptArtifacts;"
  )(() => { throw new Error("no such directory"); }, () => null, "/tmp/nowhere");
  assert.deepEqual(blind(), []);
});

const APP_DEPS = existsSync(join(HERE, "node_modules", "jsonc-parser"));

const ask = (options) => new Promise((tell) => {
  const out = request({ ...options, timeout: 8000 }, (res) => {
    let said = "";
    res.on("data", (d) => { said += d; });
    res.on("end", () => tell({ code: res.statusCode, body: said }));
  });
  out.on("error", () => tell({ code: 0, body: "" }));
  out.on("timeout", () => { out.destroy(); tell({ code: 0, body: "" }); });
  out.end(options.payload);
});

const untilTrue = async (look, tries = 300) => {
  for (let i = 0; i < tries; i++) {
    if (await look()) return true;
    await new Promise((go) => setTimeout(go, 100));
  }
  return false;
};

const keepRoute = () => cut(artifactRoutes, 'on("POST", "/api/artifact/keep"', 'on(null, "/api/artifact/index"', "routes/artifacts.mjs");

const keepDecides = (asked) => new Function(
  "asked", "askedTab",
  cut(keepRoute(), "const wanted = askedTab", "const index = await keepArtifact", "the keep route")
  + cut(keepRoute(), "const alsoShelve =", "if (!index.error &&", "the keep route")
  + "return { tab: wanted.tab, shelved: alsoShelve };"
)(asked, (hint) => (["documento", "telas", "plano", "lente"].includes(hint) ? { tab: hint } : (hint ? { tab: "", error: "no" } : { tab: "" })));

test("keeping a page in the chat shelves it only when nobody else will, and never guesses the tab", () => {
  assert.deepEqual(keepDecides({ tab: "plano" }), { tab: "plano", shelved: true }, "the tool that writes a page has no publish behind it — this is how it reaches the shelf");
  assert.deepEqual(keepDecides({ tab: "plano", shelve: false }), { tab: "plano", shelved: false }, "a publish is coming, so the page is not shelved twice");
  assert.deepEqual(keepDecides({ tab: "planos" }), { tab: "", shelved: false }, "a tab nobody knows is not quietly turned into documento here either");
  assert.deepEqual(keepDecides({}), { tab: "", shelved: true }, "with no tab asked for, the filename still decides, as it always did");
});

test(
  "a page published through the door reaches the chat even when the shelf has nowhere to put it",
  { skip: APP_DEPS ? false : "the app dependencies are not installed, so server.mjs cannot boot here" },
  async () => {
    const home = await mkdtemp(join(tmpdir(), "hive-publish-"));
    const hub = await mkdtemp(join(tmpdir(), "hive-hub-"));
    const sock = join(home, "hive.sock");
    const file = join(home, "rfc-a-pagina-abre-no-chat.html");
    await writeFile(file, "<title>A página abre no chat</title><p>uma página</p>");

    const hive = spawn(process.execPath, ["server.mjs"], {
      cwd: HERE,
      env: {
        ...process.env,
        HIVE_DEV: "", HIVE_POD: "", HIVE_STATE_DIR: home, HIVE_HOME: home, HIVE_HUB: hub,
        HIVE_SANDBOX: "1", HIVE_NO_SWEEP: "1", HIVE_SOCK: sock
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let said = "";
    hive.stdout.on("data", (d) => { said += d; });
    hive.stderr.on("data", (d) => { said += d; });

    try {
      assert.ok(await untilTrue(async () => /hive at /.test(said)), `the hive never opened its door: ${said}`);

      const published = await ask({
        socketPath: sock, path: "/api/shelf/publish", method: "POST",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ name: "artefato-hive-sessao", where: "local", path: file, label: "rascunho", at: 1787428353481 })
      });
      assert.equal(published.code, 400, published.body);
      const answer = JSON.parse(published.body);
      assert.match(answer.error, /no shelf repo yet/, "with no repo pointed at, publishing says what is missing");
      assert.ok(answer.kept, "the page reached the chat anyway, so nothing written is lost");

      const invented = await ask({
        socketPath: sock, path: "/api/shelf/publish", method: "POST",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify({ name: "artefato-hive-sessao", where: "local", path: file, label: "rascunho", tab: "planos", at: 1787428353481 })
      });
      assert.equal(invented.code, 400, invented.body);
      assert.match(JSON.parse(invented.body).error, /no tab called "planos"/, "a tab nobody knows is refused instead of quietly overwriting the rfc");

      const mine = await ask({ socketPath: sock, path: "/api/artifacts" });
      assert.equal(mine.code, 200);
      const pages = JSON.parse(mine.body).pages || [];
      const one = pages.find((p) => p.session === "artefato-hive-sessao");
      assert.ok(one, `the seat's page never reached the chat: ${mine.body.slice(0, 300)}`);
      assert.equal(one.title, "A página abre no chat");
      assert.equal(one.slug, "a-pagina-abre-no-chat", "the same name the shelf would give it");
      assert.equal(one.path, file);
      assert.equal(one.n, 1);
      assert.equal(one.label, "draft", "the old label was rewritten to the one the shelf speaks");
      assert.equal(one.tab, "documento", "the keep says which tab the page went to, the same one the shelf reads off the filename");

      const plan = join(home, "plano-a-pagina-abre-no-chat.html");
      await writeFile(plan, "<title>A página abre no chat</title><p>o plano</p>");
      const asPlan = { name: "artefato-hive-sessao", where: "local", path: plan, label: "rascunho", at: 1787428353481 };
      const post = (body) => ask({
        socketPath: sock, path: "/api/shelf/publish", method: "POST",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify(body)
      });
      await post({ ...asPlan, tab: "plano" });
      await post(asPlan);
      const again = JSON.parse((await ask({ socketPath: sock, path: "/api/artifacts" })).body).pages || [];
      assert.equal(again.find((p) => p.path === plan).tab, "documento",
        "publishing the same file with no tab sends it to documento, and the keep says documento — it does not keep claiming the plano of the first publish");

      const lens = join(home, "lente-a-pagina-abre-no-chat.html");
      await writeFile(lens, "<title>A página abre no chat</title><p>a lente</p>");
      await post({ ...asPlan, path: lens, tab: "lente" });
      const withLens = JSON.parse((await ask({ socketPath: sock, path: "/api/artifacts" })).body).pages || [];
      assert.equal(withLens.find((p) => p.path === lens).tab, "lente", "the lens of a pr is kept under its own tab");
      await post({ ...asPlan, path: lens });
      const byName = JSON.parse((await ask({ socketPath: sock, path: "/api/artifacts" })).body).pages || [];
      assert.equal(byName.find((p) => p.path === lens).tab, "lente", "and with no tab asked for, the filename says lente");
    } finally {
      hive.kill();
      await new Promise((done) => hive.on("exit", done));
    }
  }
);

test("publishing swaps the seat's local preview for the page on the shelf", () => {
  hive();
  const web = webStateOf("orquestrador");
  const preview = addWebTab("orquestrador");
  preview.url = "file:///tmp/a/rfc-orquestrador.html";
  preview.since = 25;
  shelvePreviews();
  assert.equal(web.tabs.length, 1, "the preview stayed open beside the page it became");
  const now = web.tabs[0];
  assert.equal(now.kind, "artifact", "the published page came back as a plain tab, without its rail");
  assert.equal(now.slug, "chat-orquestrador");
  assert.equal(web.active, 0, "the tools act on the page that replaced the preview");
  assert.equal(st.webChat, null, "shelving a preview never opens the pane on its own");
});

test("a preview opened after the last publish is left where it is", () => {
  hive();
  const web = webStateOf("orquestrador");
  const preview = addWebTab("orquestrador");
  preview.url = "file:///tmp/a/rfc-orquestrador.html";
  preview.since = 40;
  shelvePreviews();
  assert.equal(web.tabs.length, 1);
  assert.equal(web.tabs[0].kind, "web", "a draft still being written was yanked from under the seat");
});
