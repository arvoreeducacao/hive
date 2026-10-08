import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { publishPage, hiveDoor } from "../peer/peer.mjs";
import { socketPathFor, canonicalLabel, shelfPageUrl, shelfDeepLink } from "../door.mjs";
import { socketPathFor as appSocketPathFor } from "../../app/lib/doorstep.mjs";

async function hive() {
  const base = await mkdtemp(join(tmpdir(), "hive-publish-"));
  await mkdir(join(base, "sessions"), { recursive: true });
  await writeFile(join(base, "sessions", "seat.json"), JSON.stringify({ session_id: "s1", cwd: "/w/hub" }));
  await writeFile(join(base, "page.html"), "<!doctype html><title>Uma Página</title>");
  return base;
}

async function fakeApp(base, { pushed = true, refuse = "" } = {}) {
  const seen = [];
  const app = createServer((req, res) => {
    let body = "";
    req.on("data", (piece) => { body += piece; });
    req.on("end", () => {
      seen.push({ path: req.url, body: body ? JSON.parse(body) : null });
      res.setHeader("content-type", "application/json");
      if (refuse && req.url === refuse) return res.end(JSON.stringify({ error: "no" }));
      if (req.url === "/api/artifact/keep") return res.end(JSON.stringify({ key: "k1", title: "Uma Página", versions: [{ n: 2, label: "draft" }] }));
      if (req.url === "/api/shelf/publish") {
        return res.end(JSON.stringify({
          meta: { slug: "uma-pagina", title: "Uma Página", label: "draft", tabs: { documento: { versions: [{ n: 3 }] } } },
          tab: "documento", pushed
        }));
      }
      if (req.url === "/api/shelf") return res.end(JSON.stringify({ repo: "https://github.com/acme/artifacts", pages: [] }));
      res.end(JSON.stringify({ error: "unknown route" }));
    });
  });
  await new Promise((up) => app.listen({ path: hiveDoor(base) }, up));
  return { seen, close: () => new Promise((done) => app.close(done)) };
}

const envOf = (base) => ({ HIVE_SEAT: "seat", HIVE_STATE_DIR: base });

test("the door the driver knocks on is the one the app opens", () => {
  for (const home of ["/Users/x/.hive", "/workspace/hive", `/Users/${"y".repeat(120)}/.hive`]) {
    assert.equal(socketPathFor({ home }), appSocketPathFor({ home }));
  }
});

test("the labels of the shelf are english, and the portuguese ones are rewritten to them", () => {
  assert.equal(canonicalLabel("rascunho"), "draft");
  assert.equal(canonicalLabel("em-revisao-pos-feedback"), "in-review-pos-feedback");
  assert.equal(canonicalLabel("In-Review"), "in-review");
  assert.equal(canonicalLabel("entregue"), "delivered");
  assert.equal(canonicalLabel(""), "");
  assert.equal(canonicalLabel("qualquer-coisa"), "qualquer-coisa");
});

test("the link to announce opens the page in the hive", () => {
  assert.equal(shelfDeepLink("uma-pagina", "telas", 2), "hive://shelf/uma-pagina?tab=telas", "the link names the page — a version frozen in it turns a live document into a screenshot");
  assert.equal(shelfDeepLink("uma-pagina", "telas", 0), "");
});

test("the shelf link points at the version, and needs every piece", () => {
  assert.equal(
    shelfPageUrl("https://github.com/acme/artifacts", "uma-pagina", "documento", 3),
    "https://github.com/acme/artifacts/blob/HEAD/a/uma-pagina/documento.v3.html"
  );
  assert.equal(shelfPageUrl("", "uma-pagina", "documento", 3), "");
  assert.equal(shelfPageUrl("https://github.com/a/b", "uma-pagina", "documento", 0), "");
});

test("a draft goes up like any other page, under the label the shelf speaks", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });
  const done = await publishPage({ path: join(base, "page.html"), label: "rascunho", env: envOf(base) });
  assert.equal(done.title, "Uma Página");
  assert.equal(done.url, "hive://shelf/uma-pagina?tab=documento");
  assert.deepEqual(app.seen.map((call) => call.path), ["/api/artifact/keep", "/api/shelf/publish", "/api/shelf"]);
  for (const call of app.seen.filter((one) => one.body)) assert.equal(call.body.label, "draft");
});

test("publishing keeps the page here and puts it on the shelf, with the link back", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });
  const done = await publishPage({ path: join(base, "page.html"), label: "em-revisao", tab: "documento", env: envOf(base) });
  assert.equal(done.pushed, true);
  assert.equal(done.version, 3);
  assert.equal(done.url, "hive://shelf/uma-pagina?tab=documento");
  assert.equal(done.source, "https://github.com/acme/artifacts/blob/HEAD/a/uma-pagina/documento.v3.html");
  assert.deepEqual(app.seen.map((call) => call.path), ["/api/artifact/keep", "/api/shelf/publish", "/api/shelf"]);
  assert.equal(app.seen[0].body.url, "");
});

test("keeping the page in the chat does not shelve it a second time, and hears which tab it is", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });
  await publishPage({ path: join(base, "page.html"), label: "in-review", tab: "plano", env: envOf(base) });
  const kept = app.seen.find((call) => call.path === "/api/artifact/keep");
  assert.equal(kept.body.shelve, false, "the publish that comes next is what puts the page on the shelf");
  assert.equal(kept.body.tab, "plano", "and if an older app shelves it anyway, it knows the tab instead of guessing by filename");
});

test("the lens of a pr is published under its own tab", async (t) => {
  const base = await hive();
  const app = await fakeApp(base);
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });
  await publishPage({ path: join(base, "page.html"), label: "draft", tab: "lente", env: envOf(base) });
  const shelved = app.seen.find((call) => call.path === "/api/shelf/publish");
  assert.equal(shelved.body.tab, "lente", "the shelf hears lente, not a guess off the filename");
  assert.equal(app.seen.find((call) => call.path === "/api/artifact/keep").body.tab, "lente");
});

test("a page the shelf refused says so instead of pretending it landed", async (t) => {
  const base = await hive();
  const app = await fakeApp(base, { refuse: "/api/shelf/publish" });
  t.after(async () => { await app.close(); await rm(base, { recursive: true, force: true }); });
  const done = await publishPage({ path: join(base, "page.html"), label: "delivered", env: envOf(base) });
  assert.match(done.error, /kept on this machine/);
  assert.match(done.error, /shelf refused/);
});

test("without a hive answering on this machine, publishing says what is missing", async () => {
  const base = await hive();
  const done = await publishPage({ path: join(base, "page.html"), label: "in-review", env: envOf(base) });
  assert.match(done.error, /no hive answering/);
  await rm(base, { recursive: true, force: true });
});

test("only an html file is a page", async () => {
  const base = await hive();
  const done = await publishPage({ path: join(base, "page.txt"), label: "in-review", env: envOf(base) });
  assert.match(done.error, /html/);
  await rm(base, { recursive: true, force: true });
});

test("a session with no seat cannot publish", async () => {
  const base = await hive();
  const done = await publishPage({ path: join(base, "page.html"), label: "in-review", env: { HIVE_STATE_DIR: base } });
  assert.match(done.error, /seat/);
  await rm(base, { recursive: true, force: true });
});
