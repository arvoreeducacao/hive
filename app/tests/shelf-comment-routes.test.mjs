import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { registerArtifactRoutes } from "../routes/artifacts.mjs";

function harness() {
  const routes = new Map();
  const calls = { commented: [], settled: [], stood: [], published: 0, pulls: 0 };
  const kept = { comments: [{ id: "c-1", who: "rita", text: "oi", tab: "telas", v: 1, done: false }] };

  registerArtifactRoutes((method, path, handler) => routes.set(path, { method, handler }), {
    bodyOf: async (req) => req.body || {},
    isSeatName: () => true,
    keepArtifact: async () => ({ key: "k" }),
    askedTab: (tab) => ({ tab: tab || "" }),
    mirrorToShelf: async () => ({ pushed: true }),
    artifactIndex: () => null,
    artifactKey: () => "",
    keptArtifacts: () => [],
    ARTIFACT_HOME: "/hive/artifacts",
    readFileSync: () => Buffer.from(""),
    join,
    canonicalLabel: (label) => label,
    SHELF_SLUG: /^[a-z0-9][a-z0-9-]{0,59}$/,
    TABS: ["documento", "telas", "plano"],
    readShelfPage: () => ({ html: Buffer.from("<title>Telas</title>") }),
    SHELF_HOME: "/hive/shelf",
    shelfRepoUrl: async () => "https://github.com/acme/artifacts",
    shelfPull: async () => { calls.pulls += 1; return { ok: true }; },
    shelfIndex: () => ({ pages: [] }),
    getDev: () => "guilherme",
    readShelfComments: (home, slug) => ({ comments: slug === "catalogacao-de-livros" ? kept.comments : [] }),
    commentOnShelf: async (asked) => { calls.commented.push(asked); return { comment: { id: "c-2", ...asked }, comments: kept.comments, pushed: true }; },
    settleShelfComment: async (asked) => { calls.settled.push(asked); return { comment: { id: asked.id, done: asked.done }, comments: kept.comments, pushed: true }; },
    withPinShim: (html) => `${html}<script data-hive-shelf-pins></script>`,
    seatIsOnAPage: (asked) => { calls.stood.push(asked); return asked.slug !== "mesmo-lugar"; },
    whoIsOnThePage: async (slug) => (slug === "catalogacao-de-livros" ? [{ dev: "mateus", el: "criar-turma", colour: "#e58bb0", mine: false }] : []),
    publishPanel: async () => { calls.published += 1; },
    now: () => 77
  });

  const call = async (path, { body = {}, query = "" } = {}) => {
    const answers = [];
    const writes = [];
    const ended = [];
    const json = (value, status = 200) => answers.push({ value, status });
    const res = { writeHead: (status, headers) => writes.push({ status, headers }), end: (value) => ended.push(value) };
    await routes.get(path).handler({ body }, res, new URL(`http://hive${path}${query}`), json);
    return { answers, writes, ended };
  };
  return { call, calls };
}

test("the page goes out with the pin shim, and the length says so", async () => {
  const hive = harness();
  const served = await hive.call("/api/shelf/page", { query: "?slug=catalogacao-de-livros&tab=telas&v=1" });
  const html = String(served.ended[0]);
  assert.ok(html.endsWith("<script data-hive-shelf-pins></script>"));
  assert.equal(served.writes[0].headers["content-length"], Buffer.byteLength(html));
});

test("reading the comments of a page says who is reading, and only pulls when asked", async () => {
  const hive = harness();
  const read = await hive.call("/api/shelf/comments", { query: "?slug=catalogacao-de-livros" });
  assert.deepEqual(read.answers, [{ value: { me: "guilherme", comments: [{ id: "c-1", who: "rita", text: "oi", tab: "telas", v: 1, done: false }] }, status: 200 }]);
  assert.equal(hive.calls.pulls, 0);
  await hive.call("/api/shelf/comments", { query: "?slug=catalogacao-de-livros&pull=1" });
  assert.equal(hive.calls.pulls, 1);
  const bad = await hive.call("/api/shelf/comments", { query: "?slug=../etc" });
  assert.equal(bad.answers[0].status, 400);
});

test("a comment carries the tab, the version and the pin the person clicked, stamped by the server", async () => {
  const hive = harness();
  const posted = await hive.call("/api/shelf/comment", { body: {
    slug: "catalogacao-de-livros", tab: "telas", v: "1", text: "o botão some", pin: { frame: "f-3", name: "Opção B", x: 0.4, y: 0.6 }
  } });
  assert.equal(posted.answers[0].status, 200);
  assert.deepEqual(hive.calls.commented, [{
    slug: "catalogacao-de-livros", tab: "telas", v: 1, text: "o botão some", pin: { frame: "f-3", name: "Opção B", x: 0.4, y: 0.6 }, re: "", seat: "", agent: false, quiet: false, at: 77
  }]);
  const noTab = await hive.call("/api/shelf/comment", { body: { slug: "catalogacao-de-livros", tab: "outra", text: "x", pin: "not-an-object" } });
  assert.equal(noTab.answers[0].status, 200);
  assert.deepEqual({ tab: hive.calls.commented[1].tab, pin: hive.calls.commented[1].pin }, { tab: "", pin: null });
  const bad = await hive.call("/api/shelf/comment", { body: { slug: "Not A Slug", text: "x" } });
  assert.equal(bad.answers[0].status, 400);
});

test("settling closes by default and reopens when told", async () => {
  const hive = harness();
  await hive.call("/api/shelf/comment/settle", { body: { slug: "catalogacao-de-livros", id: "c-1" } });
  await hive.call("/api/shelf/comment/settle", { body: { slug: "catalogacao-de-livros", id: "c-1", done: false } });
  assert.deepEqual(hive.calls.settled.map((one) => one.done), [true, false]);
  assert.deepEqual(hive.calls.settled[0], { slug: "catalogacao-de-livros", id: "c-1", done: true, at: 77 });
});

test("a comment says which seat is looking at the page, and carries the element it is pinned to", async () => {
  const hive = harness();
  await hive.call("/api/shelf/comment", { body: {
    slug: "catalogacao-de-livros", tab: "telas", v: 1, text: "troca o verbo", pin: { el: "#f-1 .cta", elAt: "cta-turmas", x: 0.5, y: 0.5 }, seat: "as-telas"
  } });
  assert.equal(hive.calls.commented.at(-1).seat, "as-telas");
  assert.deepEqual(hive.calls.commented.at(-1).pin, { el: "#f-1 .cta", elAt: "cta-turmas", x: 0.5, y: 0.5 });
});

test("the agent's answer is marked as the agent's, and never wakes the seat again", async () => {
  const hive = harness();
  await hive.call("/api/shelf/comment", { body: { slug: "catalogacao-de-livros", tab: "telas", text: "empilhei os dois", re: "c-1", seat: "as-telas", agent: true } });
  assert.equal(hive.calls.commented.at(-1).agent, true);
  assert.equal(hive.calls.commented.at(-1).re, "c-1");
  await hive.call("/api/shelf/comment", { body: { slug: "catalogacao-de-livros", tab: "telas", text: "e aqui?" } });
  assert.equal(hive.calls.commented.at(-1).agent, false, "a person's comment is never taken for the agent's");
});

test("the seat says which page and which piece it is standing on, and only when it moves", async () => {
  const hive = harness();
  await hive.call("/api/shelf/here", { body: { seat: "as-telas", slug: "catalogacao-de-livros", tab: "telas", el: "criar-turma" } });
  assert.deepEqual(hive.calls.stood.at(-1), { seat: "as-telas", slug: "catalogacao-de-livros", tab: "telas", el: "criar-turma", at: 77 });
  assert.equal(hive.calls.published, 1, "moving tells the team right away instead of waiting for the beat");

  await hive.call("/api/shelf/here", { body: { seat: "as-telas", slug: "mesmo-lugar" } });
  assert.equal(hive.calls.published, 1, "standing still says nothing");

  const bad = await hive.call("/api/shelf/here", { body: { seat: "as-telas", slug: "../etc" } });
  assert.equal(bad.answers[0].status, 400);

  await hive.call("/api/shelf/here", { body: { seat: "as-telas", slug: "catalogacao-de-livros", tab: "inventada", el: "x" } });
  assert.equal(hive.calls.stood.at(-1).tab, "", "a tab the shelf does not know is dropped, not passed on");
});

test("the page can ask who else is looking at it", async () => {
  const hive = harness();
  const said = await hive.call("/api/shelf/watching", { query: "?slug=catalogacao-de-livros" });
  assert.deepEqual(said.answers[0].value.watching, [{ dev: "mateus", el: "criar-turma", colour: "#e58bb0", mine: false }]);
  const bad = await hive.call("/api/shelf/watching", { query: "?slug=../etc" });
  assert.equal(bad.answers[0].status, 400);
});

test("a question the caller will hand over itself is filed without waking the seat twice", async () => {
  const hive = harness();
  await hive.call("/api/shelf/comment", { body: { slug: "catalogacao-de-livros", tab: "telas", text: "empilha?", quiet: true, seat: "as-telas" } });
  assert.equal(hive.calls.commented.at(-1).quiet, true);
  await hive.call("/api/shelf/comment", { body: { slug: "catalogacao-de-livros", tab: "telas", text: "empilha?" } });
  assert.equal(hive.calls.commented.at(-1).quiet, false, "o silêncio é pedido, nunca o padrão");
});
