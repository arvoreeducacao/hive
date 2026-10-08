import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SHELF_KEPT, canonicalLabel, commitLine, pageFile, pickVersion,
  askedTab, readMeta, readPage, shelfIndex, shelve, slugOf, stateOfLabel, tabOf, TABS,
  keepThumb, readThumb, thumbFile, thumbQueue, thumbsOf
} from "../lib/shelf.mjs";

function sandbox() {
  const home = mkdtempSync(join(tmpdir(), "hive-shelf."));
  return { home, gone: () => rmSync(home, { recursive: true, force: true }) };
}

const page = (home, over = {}) => shelve({
  home, slug: "atividade-com-etapas", tab: "documento", html: "<h1>uma</h1>",
  title: "Uma atividade, N etapas", kind: "rfc", owner: "jonas", label: "in-review",
  at: 1_700_000_000_000, ...over
});

test("a label says which state it is in, suffix and all", () => {
  assert.equal(stateOfLabel("draft"), "draft");
  assert.equal(stateOfLabel("in-review-after-the-team-read-it"), "in-review");
  assert.equal(stateOfLabel("delivered"), "delivered");
  assert.equal(stateOfLabel("in-reviewing"), "");
  assert.equal(stateOfLabel(""), "");
});

test("the labels written in portuguese are rewritten to the english the shelf speaks", () => {
  assert.equal(canonicalLabel("rascunho"), "draft");
  assert.equal(canonicalLabel("em-revisao-virada-etapas"), "in-review-virada-etapas");
  assert.equal(canonicalLabel("em-revisão"), "in-review");
  assert.equal(canonicalLabel("Entregue"), "delivered");
  assert.equal(canonicalLabel("encerrado"), "closed");
  assert.equal(canonicalLabel("qualquer-coisa"), "qualquer-coisa");
  assert.equal(stateOfLabel("em-revisao-virada-etapas"), "in-review");
});

test("a page shelved with an old label carries the new one from then on", () => {
  const { home, gone } = sandbox();
  try {
    page(home, { label: "rascunho" });
    const meta = readMeta(home, "atividade-com-etapas");
    assert.equal(meta.label, "draft");
    assert.equal(meta.tabs.documento.versions[0].label, "draft");
  } finally { gone(); }
});

test("the slug survives accents, punctuation and a title that is all of them", () => {
  assert.equal(slugOf("Uma atividade, N etapas"), "uma-atividade-n-etapas");
  assert.equal(slugOf("Sync Ação ↔ Relatório"), "sync-acao-relatorio");
  assert.equal(slugOf("   "), slugOf("   "));
  assert.match(slugOf("↔↔↔"), /^[a-f0-9]{10}$/);
  assert.ok(slugOf("x".repeat(200)).length <= 60);
});

test("the tab comes from the file when nobody says which one it is", () => {
  assert.equal(tabOf("rfc-etapas.html"), "documento");
  assert.equal(tabOf("estante-canvas.html"), "telas");
  assert.equal(tabOf("qualquer.html", "telas"), "telas");
  assert.equal(tabOf("estante-canvas.html", "documento"), "documento");
  assert.equal(tabOf("plano-da-missao.html", "plano"), "plano");
  assert.equal(tabOf("estante-canvas.html", "inventada"), "telas");
  assert.equal(tabOf("lente-do-pr.html"), "lente");
  assert.equal(tabOf("relatorio.html"), "documento");
  assert.equal(tabOf("lente-do-pr.html", "documento"), "documento");
  assert.equal(tabOf("qualquer.html", "lente"), "lente");
});

test("the plan is a tab of its own, so a mission keeps living under one link", () => {
  assert.deepEqual(TABS, ["documento", "telas", "plano", "lente", "prints"]);
});

test("the lens of a pr is a tab of its own, and lands on the shelf under that name", () => {
  const { home, gone } = sandbox();
  try {
    const r = page(home, { tab: "lente", html: "<h1>a lente</h1>", label: "draft" });
    assert.equal(r.tab, "lente");
    assert.ok(existsSync(pageFile(home, "atividade-com-etapas", "lente", 1)));
    assert.deepEqual(Object.keys(readMeta(home, "atividade-com-etapas").tabs), ["lente"]);
  } finally { gone(); }
});

test("a tab nobody knows is refused by name, and the words the filename already accepts are not", () => {
  assert.deepEqual(askedTab("plano"), { tab: "plano" });
  assert.deepEqual(askedTab("lente"), { tab: "lente" });
  assert.deepEqual(askedTab("Lente"), { tab: "lente" });
  assert.deepEqual(askedTab("canvas"), { tab: "telas" });
  assert.deepEqual(askedTab("MOCKUP"), { tab: "telas" });
  assert.deepEqual(askedTab(""), { tab: "" });
  const refused = askedTab("planos");
  assert.equal(refused.tab, "");
  assert.match(refused.error, /no tab called "planos"/);
  assert.match(refused.error, /documento, telas, plano, lente, prints/);
});

test("shelving writes the file, the meta and nothing else", () => {
  const { home, gone } = sandbox();
  try {
    const r = page(home);
    assert.equal(r.wrote, 1);
    assert.ok(existsSync(pageFile(home, "atividade-com-etapas", "documento", 1)));
    const meta = readMeta(home, "atividade-com-etapas");
    assert.equal(meta.title, "Uma atividade, N etapas");
    assert.equal(meta.label, "in-review");
    assert.equal(meta.tabs.documento.versions.length, 1);
    assert.equal(meta.tabs.documento.versions[0].n, 1);
  } finally { gone(); }
});

test("the page remembers which chat wrote it, and a republication from elsewhere does not erase it", () => {
  const { home, gone } = sandbox();
  try {
    page(home, { seat: "guarda-roupa-do-avatar" });
    assert.equal(readMeta(home, "atividade-com-etapas").seat, "guarda-roupa-do-avatar");
    page(home, { tab: "telas", html: "<canvas-ish>", at: 1_700_000_100_000 });
    assert.equal(readMeta(home, "atividade-com-etapas").seat, "guarda-roupa-do-avatar",
      "a second tab published from a command line forgot the chat that owns the page");
    page(home, { html: "<h1>outra</h1>", seat: "outro-assento", at: 1_700_000_200_000 });
    assert.equal(readMeta(home, "atividade-com-etapas").seat, "outro-assento",
      "the chat that published last is the one the page belongs to now");
    assert.equal(shelfIndex(home).pages[0].seat, "outro-assento", "the index does not carry the chat to the app");
  } finally { gone(); }
});

test("a page nobody claims has no chat of its own, and says so in the plainest way", () => {
  const { home, gone } = sandbox();
  try {
    page(home);
    assert.equal(readMeta(home, "atividade-com-etapas").seat, "");
  } finally { gone(); }
});

test("the same bytes republished move the label instead of inventing a version", () => {
  const { home, gone } = sandbox();
  try {
    page(home);
    const again = page(home, { label: "decided-d1", at: 1_700_000_100_000 });
    assert.equal(again.wrote, 0);
    const meta = readMeta(home, "atividade-com-etapas");
    assert.equal(meta.tabs.documento.versions.length, 1);
    assert.equal(meta.tabs.documento.versions[0].label, "decided-d1");
    assert.equal(meta.label, "decided-d1");
  } finally { gone(); }
});

test("documento and telas are the same page with two tabs and one label", () => {
  const { home, gone } = sandbox();
  try {
    page(home);
    const telas = page(home, { tab: "telas", html: "<canvas-ish>", label: "in-review", at: 1_700_000_200_000 });
    assert.equal(telas.wrote, 1);
    const meta = readMeta(home, "atividade-com-etapas");
    assert.deepEqual(Object.keys(meta.tabs).sort(), ["documento", "telas"]);
    assert.equal(meta.tabs.documento.versions.length, 1);
    assert.equal(meta.tabs.telas.versions.length, 1);
    assert.equal(shelfIndex(home).pages.length, 1);
  } finally { gone(); }
});

test("the label of the page is the label of whatever was published last", () => {
  const { home, gone } = sandbox();
  try {
    page(home, { label: "in-review", at: 1_000 });
    page(home, { tab: "telas", html: "<telas>", label: "delivered", at: 2_000 });
    assert.equal(readMeta(home, "atividade-com-etapas").label, "delivered");
    page(home, { html: "<h1>outra</h1>", label: "in-review-virada-x", at: 3_000 });
    assert.equal(readMeta(home, "atividade-com-etapas").label, "in-review-virada-x");
  } finally { gone(); }
});

test("past the cap the oldest file leaves the tree and the newest ones stay readable", () => {
  const { home, gone } = sandbox();
  try {
    for (let i = 1; i <= SHELF_KEPT + 3; i++) page(home, { html: `<h1>${i}</h1>`, at: i * 1000 });
    const meta = readMeta(home, "atividade-com-etapas");
    assert.equal(meta.tabs.documento.versions.length, SHELF_KEPT);
    assert.equal(meta.tabs.documento.versions[0].n, 4);
    assert.equal(existsSync(pageFile(home, "atividade-com-etapas", "documento", 1)), false);
    assert.equal(existsSync(pageFile(home, "atividade-com-etapas", "documento", 4)), true);
    assert.equal(readPage(home, "atividade-com-etapas", "documento", 1).version.n, SHELF_KEPT + 3);
  } finally { gone(); }
});

test("a version the meta still promises but the tree lost says so instead of blanking", () => {
  const { home, gone } = sandbox();
  try {
    page(home, { html: "<h1>uma</h1>", at: 1_000 });
    rmSync(pageFile(home, "atividade-com-etapas", "documento", 1));
    assert.equal(readPage(home, "atividade-com-etapas", "documento", 1).error,
      "that version only exists in the git history now");
  } finally { gone(); }
});

test("a stale tab or version falls back to something that opens", () => {
  const { home, gone } = sandbox();
  try {
    page(home, { html: "<h1>uma</h1>", at: 1_000 });
    page(home, { html: "<h1>duas</h1>", at: 2_000 });
    assert.equal(pickVersion(readMeta(home, "atividade-com-etapas"), "documento", 99).version.n, 2);
    assert.equal(pickVersion(readMeta(home, "atividade-com-etapas"), "telas", 1).tab, "documento");
    const asked = readPage(home, "atividade-com-etapas", "documento", 1);
    assert.equal(asked.html, "<h1>uma</h1>");
  } finally { gone(); }
});

test("a page comes back as text, so a reader that only gets JSON still gets the page", () => {
  const { home, gone } = sandbox();
  try {
    page(home, { html: "<h1>uma</h1>", at: 1_000 });
    const asked = readPage(home, "atividade-com-etapas", "documento", 1);
    assert.equal(typeof asked.html, "string");
    const overTheWire = JSON.parse(JSON.stringify({ html: asked.html }));
    assert.equal(overTheWire.html, "<h1>uma</h1>");
  } finally { gone(); }
});

test("the shelf lists the newest page first and shrugs at an empty repo", () => {
  const { home, gone } = sandbox();
  try {
    assert.deepEqual(shelfIndex(home), { pages: [] });
    page(home, { slug: "velha", title: "Velha", at: 1_000 });
    page(home, { slug: "nova", title: "Nova", at: 9_000 });
    assert.deepEqual(shelfIndex(home).pages.map((p) => p.slug), ["nova", "velha"]);
  } finally { gone(); }
});

test("shelving refuses what it cannot store instead of writing half a page", () => {
  const { home, gone } = sandbox();
  try {
    assert.match(shelve({ home, slug: "x", tab: "documento", html: "" }).error, /nothing to shelve/);
    assert.match(shelve({ home, slug: "", tab: "documento", html: "<p>" }).error, /needs a slug/);
    assert.match(shelve({ home: "", slug: "x", tab: "documento", html: "<p>" }).error, /no repo/);
    assert.match(readPage(home, "nao-existe", "documento", 1).error, /no page with that name/);
  } finally { gone(); }
});

test("the commit line says which page, which tab and what state it reached", () => {
  const { home, gone } = sandbox();
  try {
    const { meta, wrote, tab } = page(home);
    assert.equal(commitLine(meta, tab, wrote), "estante: atividade-com-etapas · documento v1 · in-review");
  } finally { gone(); }
});

test("a label that moves without new bytes still changes what the repo would commit", () => {
  const { home, gone } = sandbox();
  try {
    const first = page(home, { label: "in-review" });
    assert.equal(commitLine(first.meta, first.tab, 1), "estante: atividade-com-etapas · documento v1 · in-review");
    const again = page(home, { label: "delivered", at: 1_700_000_100_000 });
    assert.equal(again.wrote, 0);
    const kept = again.meta.tabs.documento.versions;
    const head = kept[kept.length - 1];
    assert.equal(head.n, 1);
    assert.equal(
      commitLine(again.meta, again.tab, head.n, again.wrote),
      "estante: atividade-com-etapas · documento v1 (relabel) · delivered",
      "the line says the version it did not write, so the history stops announcing bytes that never moved"
    );
  } finally { gone(); }
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("rest of the picture")]);

test("a thumbnail sits next to the version it pictures, and the index says which version has one", () => {
  const { home, gone } = sandbox();
  try {
    shelve({ home, slug: "galeria", tab: "telas", html: "<title>Galeria</title>v1", title: "Galeria", label: "draft", at: 1 });
    shelve({ home, slug: "galeria", tab: "telas", html: "<title>Galeria</title>v2", title: "Galeria", label: "draft", at: 2 });
    assert.deepEqual(thumbsOf(home, readMeta(home, "galeria")), {});
    assert.deepEqual(keepThumb(home, "galeria", "telas", 1, PNG), { file: thumbFile(home, "galeria", "telas", 1) });
    const [page] = shelfIndex(home).pages;
    assert.deepEqual(page.thumbs, { telas: 1 }, "until the newest version is pictured, the card shows the last picture there is");
    keepThumb(home, "galeria", "telas", 2, PNG);
    assert.deepEqual(shelfIndex(home).pages[0].thumbs, { telas: 2 });
    assert.deepEqual(readThumb(home, "galeria", "telas", 2), { data: PNG });
  } finally { gone(); }
});

test("a thumbnail is refused when it is not a png or pictures a version the shelf does not have", () => {
  const { home, gone } = sandbox();
  try {
    shelve({ home, slug: "galeria", tab: "documento", html: "<title>Galeria</title>", title: "Galeria", label: "draft", at: 1 });
    assert.match(keepThumb(home, "galeria", "documento", 1, Buffer.from("<script>")).error, /png/);
    assert.match(keepThumb(home, "galeria", "documento", 9, PNG).error, /not on the shelf/);
    assert.match(keepThumb(home, "galeria", "../../etc", 1, PNG).error, /not on the shelf/);
    assert.match(readThumb(home, "galeria", "documento", 1).error, /no thumbnail yet/);
  } finally { gone(); }
});

test("a version pushed off the shelf takes its thumbnail with it", () => {
  const { home, gone } = sandbox();
  try {
    shelve({ home, slug: "galeria", tab: "documento", html: "<title>Galeria</title>0", title: "Galeria", label: "draft", at: 1 });
    keepThumb(home, "galeria", "documento", 1, PNG);
    for (let n = 1; n <= SHELF_KEPT; n += 1) shelve({ home, slug: "galeria", tab: "documento", html: `<title>Galeria</title>${n}`, title: "Galeria", label: "draft", at: n + 1 });
    assert.equal(existsSync(thumbFile(home, "galeria", "documento", 1)), false);
  } finally { gone(); }
});

test("the thumbnail queue hands out one page at a time, never twice, and forgets what nobody took", () => {
  let clock = 0;
  let ids = 0;
  const queue = thumbQueue({ now: () => clock, wait: 1000, newId: () => `job-${++ids}` });
  assert.equal(queue.want("galeria", "telas", 2), "job-1");
  assert.equal(queue.want("galeria", "telas", 2), "job-1", "the same version asked twice is one job");
  assert.equal(queue.want("outra", "documento", 1), "job-2");
  assert.equal(queue.want("outra", "inventada", 1), null);
  assert.deepEqual(queue.next(), [{ id: "job-1", slug: "galeria", tab: "telas", v: 2 }]);
  assert.equal(queue.take("job-1").slug, "galeria");
  assert.equal(queue.take("job-1"), null);
  assert.deepEqual(queue.next().map((job) => job.id), ["job-2"]);
  clock = 5000;
  assert.deepEqual(queue.next(), [], "with no window to take it, the job is dropped and the page waits for the backfill");
});
