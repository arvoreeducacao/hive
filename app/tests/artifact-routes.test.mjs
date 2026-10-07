import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { registerArtifactRoutes, withShelfFiles } from "../routes/artifacts.mjs";

function artifactHarness() {
  const routes = new Map();
  const calls = { kept: [], mirrored: [], files: [], shelfPages: [], pulls: 0, prints: [], shelfFiles: [], thumbs: [], thumbReads: [] };
  let printKept = { slug: "one", print: { n: 1 }, link: "hive://shelf/one?tab=prints#p1" };
  let shelfFile = { type: "image/jpeg", data: Buffer.from("jpg") };
  const indexes = new Map();
  let kept = { key: "kept-key" };
  let mirrored = { pushed: true };
  let pages = [{ key: "one" }];
  let shelfPage = { html: Buffer.from("<title>Shelf</title>") };
  let repo = "https://github.com/arvoreeducacao/artefatos";
  let pull = { ok: true };
  let shelfPages = [{ slug: "one" }];
  let file = Buffer.from("<title>Kept</title>");
  let fileError = null;
  let dev = "rick";

  registerArtifactRoutes((method, path, handler) => routes.set(path, { method, handler }), {
    bodyOf: async (req) => req.body || {},
    isSeatName: (name) => name === "seat",
    keepArtifact: async (asked) => { calls.kept.push(asked); return kept; },
    askedTab: (tab) => tab === "wrong" ? { tab: "", error: "bad tab" } : { tab: tab || "" },
    mirrorToShelf: async (asked) => { calls.mirrored.push(asked); return mirrored; },
    artifactIndex: (key) => indexes.get(key) || null,
    artifactKey: (name, path) => `${name}:${path}`,
    keptArtifacts: () => pages,
    ARTIFACT_HOME: "/hive/artifacts",
    readFileSync: (path) => { calls.files.push(path); if (fileError) throw fileError; return file; },
    join,
    canonicalLabel: (label) => label === "rascunho" ? "draft" : String(label || "").toLowerCase(),
    SHELF_SLUG: /^[a-z0-9][a-z0-9-]{0,59}$/,
    TABS: ["documento", "telas", "plano", "lente"],
    readShelfPage: (...args) => { calls.shelfPages.push(args); return shelfPage; },
    SHELF_HOME: "/hive/shelf",
    shelfRepoUrl: async () => repo,
    shelfPull: async () => { calls.pulls += 1; return pull; },
    shelfIndex: () => ({ pages: shelfPages }),
    getDev: () => dev,
    leafUrl: () => "https://leaf.example.org",
    keepPrintToShelf: async (asked) => { calls.prints.push(asked); return printKept; },
    readShelfFile: (slug, name) => { calls.shelfFiles.push([slug, name]); return shelfFile; },
    keepThumbOnShelf: async (asked) => { calls.thumbs.push(asked); return asked.data ? { ok: true } : { error: "no picture came back for that page" }; },
    readShelfThumb: (slug, tab, v) => { calls.thumbReads.push([slug, tab, v]); return v === 3 ? { data: Buffer.from("png") } : { error: "that version has no thumbnail yet" }; },
    now: () => 77
  });

  const call = async (path, { body = {}, query = "" } = {}) => {
    const answers = [];
    const writes = [];
    const ended = [];
    const json = (value, status = 200) => answers.push({ value, status });
    const res = {
      writeHead: (status, headers) => writes.push({ status, headers }),
      end: (value) => ended.push(value)
    };
    await routes.get(path).handler({ body }, res, new URL(`http://hive${path}${query}`), json);
    return { answers, writes, ended };
  };

  return {
    routes,
    calls,
    indexes,
    call,
    setKept: (value) => { kept = value; },
    setMirrored: (value) => { mirrored = value; },
    setPages: (value) => { pages = value; },
    setShelfPage: (value) => { shelfPage = value; },
    setRepo: (value) => { repo = value; },
    setPull: (value) => { pull = value; },
    setShelfPages: (value) => { shelfPages = value; },
    setDev: (value) => { dev = value; },
    setFile: (value) => { file = value; fileError = null; },
    setFileError: (value) => { fileError = value; }
  };
}

test("the artifact room registers every artifact and shelf path with the original methods", () => {
  const { routes } = artifactHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/artifact/keep", "POST"],
    ["/api/artifact/index", null],
    ["/api/artifacts", null],
    ["/api/artifact/page", null],
    ["/api/shelf/publish", "POST"],
    ["/api/shelf/page", null],
    ["/api/shelf/file", null],
    ["/api/shelf/thumb", null],
    ["/api/shelf/thumb/taken", "POST"],
    ["/api/shelf/keep-print", "POST"],
    ["/api/shelf/comments", null],
    ["/api/shelf/comment", "POST"],
    ["/api/shelf/here", "POST"],
    ["/api/shelf/watching", null],
    ["/api/shelf/comment/settle", "POST"],
    ["/api/shelf", null]
  ]);
});

test("keep validates the seat, normalizes its input and mirrors only a successful page", async () => {
  const hive = artifactHarness();
  const refused = await hive.call("/api/artifact/keep", { body: { name: "other" } });
  assert.deepEqual(refused.answers, [{ value: { error: "unknown session" }, status: 400 }]);
  assert.deepEqual(hive.calls.kept, []);

  const kept = await hive.call("/api/artifact/keep", {
    body: { name: "seat", where: "cloud", path: "/tmp/page.html", label: "draft", url: "https://page", tab: "plano" }
  });
  const expected = { session: "seat", where: "cloud", path: "/tmp/page.html", label: "draft", url: "https://page", at: 77, tab: "plano" };
  assert.deepEqual(hive.calls.kept, [expected]);
  assert.deepEqual(hive.calls.mirrored, [expected]);
  assert.deepEqual(kept.answers, [{ value: { key: "kept-key" }, status: 200 }]);

  hive.setKept({ error: "gone" });
  const failed = await hive.call("/api/artifact/keep", { body: { name: "seat", path: "/tmp/gone.html" } });
  assert.deepEqual(failed.answers, [{ value: { error: "gone" }, status: 404 }]);
  assert.equal(hive.calls.mirrored.length, 1);
});

test("artifact index, list and page retain their guards, version choice and byte response", async () => {
  const hive = artifactHarness();
  const missingIndex = await hive.call("/api/artifact/index", { query: "?name=seat&path=%2Ftmp%2Fnone.html" });
  assert.deepEqual(missingIndex.answers, [{ value: { versions: [] }, status: 200 }]);
  const listed = await hive.call("/api/artifacts");
  assert.deepEqual(listed.answers, [{ value: { pages: [{ key: "one" }] }, status: 200 }]);

  const bad = await hive.call("/api/artifact/page", { query: "?key=..%2Foutside" });
  assert.deepEqual(bad.answers, [{ value: { error: "that is not a page this hive kept" }, status: 400 }]);

  const key = "abcdef012345";
  hive.indexes.set(key, { versions: [{ n: 1 }, { n: 3 }] });
  const bytes = Buffer.from("<title>First</title>");
  hive.setFile(bytes);
  const page = await hive.call("/api/artifact/page", { query: `?key=${key}&v=1` });
  assert.deepEqual(hive.calls.files, [join("/hive/artifacts", key, "v1.html")]);
  assert.deepEqual(page.writes, [{ status: 200, headers: {
    "content-type": "text/html; charset=utf-8",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store",
    "content-length": bytes.length
  } }]);
  assert.deepEqual(page.ended, [bytes]);

  hive.setFileError(new Error("gone"));
  const gone = await hive.call("/api/artifact/page", { query: `?key=${key}` });
  assert.deepEqual(gone.answers, [{ value: { error: "that version is no longer on disk" }, status: 404 }]);
});

test("shelf publish validates before writing and reports shelf failure without losing the kept key", async () => {
  const hive = artifactHarness();
  const invalid = await hive.call("/api/shelf/publish", { body: { name: "seat", tab: "wrong" } });
  assert.deepEqual(invalid.answers, [{ value: { error: "bad tab" }, status: 400 }]);
  assert.deepEqual(hive.calls.kept, []);

  hive.setMirrored({ error: "no shelf repo yet" });
  const published = await hive.call("/api/shelf/publish", {
    body: { name: "seat", path: "/tmp/page.html", label: "rascunho", at: 12 }
  });
  const expected = { session: "seat", where: "local", path: "/tmp/page.html", label: "draft", url: "", at: 12 };
  assert.deepEqual(hive.calls.kept, [{ ...expected, tab: "" }]);
  assert.deepEqual(hive.calls.mirrored, [{ ...expected, tab: "" }]);
  assert.deepEqual(published.answers, [{ value: { error: "no shelf repo yet", kept: "kept-key" }, status: 400 }]);
});

test("the tab a page was published to is kept with it, not only sent to the shelf", async () => {
  const hive = artifactHarness();
  await hive.call("/api/shelf/publish", { body: { name: "seat", path: "/tmp/plano.html", tab: "plano", at: 12 } });
  assert.equal(hive.calls.kept.at(-1).tab, "plano");

  await hive.call("/api/artifact/keep", { body: { name: "seat", path: "/tmp/telas.html", tab: "telas", at: 12 } });
  assert.equal(hive.calls.kept.at(-1).tab, "telas", "the keep the seat writes carries it too");

  await hive.call("/api/shelf/publish", { body: { name: "seat", path: "/tmp/lente-do-pr.html", tab: "lente", at: 12 } });
  assert.equal(hive.calls.kept.at(-1).tab, "lente");
  assert.equal(hive.calls.mirrored.at(-1).tab, "lente", "the lens reaches the shelf under its own tab");
});

test("shelf page and index keep tab fallback, pull failure and owner behavior", async () => {
  const hive = artifactHarness();
  const badPage = await hive.call("/api/shelf/page", { query: "?slug=Bad" });
  assert.deepEqual(badPage.answers, [{ value: { error: "that is not a page on the shelf" }, status: 400 }]);

  const shelfPage = await hive.call("/api/shelf/page", { query: "?slug=my-page&tab=unknown&v=2" });
  assert.deepEqual(hive.calls.shelfPages, [["/hive/shelf", "my-page", "documento", 2]]);
  assert.equal(shelfPage.writes[0].status, 200);
  assert.equal(shelfPage.writes[0].headers["content-length"], Buffer.byteLength("<title>Shelf</title>"));

  hive.setRepo("");
  const empty = await hive.call("/api/shelf");
  assert.deepEqual(empty.answers, [{ value: { repo: "", pages: [], error: "no shelf repo yet" }, status: 200 }]);

  hive.setRepo("https://github.com/arvoreeducacao/artefatos");
  hive.setShelfPages([{ slug: "kept" }]);
  hive.setPull({ error: "cannot pull" });
  const failedPull = await hive.call("/api/shelf", { query: "?pull=1" });
  assert.deepEqual(failedPull.answers, [{ value: {
    repo: "https://github.com/arvoreeducacao/artefatos",
    pages: [{ slug: "kept" }],
    error: "cannot pull"
  }, status: 200 }]);
  assert.equal(hive.calls.pulls, 1);

  hive.setPull({ ok: true });
  hive.setDev("ada");
  const indexed = await hive.call("/api/shelf");
  assert.deepEqual(indexed.answers, [{ value: {
    repo: "https://github.com/arvoreeducacao/artefatos",
    me: "ada",
    leaf: "https://leaf.example.org",
    pages: [{ slug: "kept" }]
  }, status: 200 }]);
});

test("a print kept from the chat reaches the shelf with the chat, the caption and the picture", async () => {
  const hive = artifactHarness();
  const said = await hive.call("/api/shelf/keep-print", { body: { name: "seat", caption: "card inteiro", data: "data:image/jpeg;base64,AAAA", path: "/x/tela.png" } });
  assert.deepEqual(hive.calls.prints, [{ session: "seat", slug: "", caption: "card inteiro", data: "data:image/jpeg;base64,AAAA", from: "/x/tela.png", after: "last", at: 77 }]);
  assert.deepEqual(said.answers, [{ value: { slug: "one", print: { n: 1 }, link: "hive://shelf/one?tab=prints#p1" }, status: 200 }]);
  const refused = await hive.call("/api/shelf/keep-print", { body: { name: "nope", caption: "x", data: "" } });
  assert.deepEqual(refused.answers, [{ value: { error: "unknown session" }, status: 400 }]);
});

test("a file a page keeps is served by slug and name, and a bad name is refused", async () => {
  const hive = artifactHarness();
  const served = await hive.call("/api/shelf/file", { query: "?slug=one&f=prints%2F01-a.jpg" });
  assert.deepEqual(hive.calls.shelfFiles, [["one", "prints/01-a.jpg"]]);
  assert.equal(served.writes[0].headers["content-type"], "image/jpeg");
  assert.equal(String(served.ended[0]), "jpg");
  const bad = await hive.call("/api/shelf/file", { query: "?slug=..&f=prints%2Fa.jpg" });
  assert.equal(bad.answers[0].status, 400);
});

test("a card's thumbnail is served by page, tab and version, and cached for good because a version never changes", async () => {
  const hive = artifactHarness();
  const served = await hive.call("/api/shelf/thumb", { query: "?slug=one&tab=telas&v=3" });
  assert.deepEqual(hive.calls.thumbReads, [["one", "telas", 3]]);
  assert.equal(served.writes[0].headers["content-type"], "image/png");
  assert.match(served.writes[0].headers["cache-control"], /immutable/);
  assert.equal(String(served.ended[0]), "png");
  const missing = await hive.call("/api/shelf/thumb", { query: "?slug=one&tab=telas&v=4" });
  assert.equal(missing.answers[0].status, 404);
  const bad = await hive.call("/api/shelf/thumb", { query: "?slug=..&tab=telas&v=3" });
  assert.equal(bad.answers[0].status, 400);
});

test("the window hands a thumbnail back by the id it was asked for", async () => {
  const hive = artifactHarness();
  const kept = await hive.call("/api/shelf/thumb/taken", { body: { id: "job-1", data: "data:image/png;base64,AAAA" } });
  assert.deepEqual(hive.calls.thumbs, [{ id: "job-1", data: "data:image/png;base64,AAAA" }]);
  assert.equal(kept.answers[0].status, 200);
  const empty = await hive.call("/api/shelf/thumb/taken", { body: { id: "job-2" } });
  assert.equal(empty.answers[0].status, 400);
});

test("a relative print in a page points at the file route when the page is served", () => {
  const html = withShelfFiles('<a href="prints/01-a.jpg"><img src="prints/01-a.jpg" alt="a"></a> <img src="https://x/y.png">', "card-do-livro");
  assert.match(html, /href="\/api\/shelf\/file\?slug=card-do-livro&f=prints%2F01-a\.jpg"/);
  assert.match(html, /src="\/api\/shelf\/file\?slug=card-do-livro&f=prints%2F01-a\.jpg"/);
  assert.match(html, /src="https:\/\/x\/y\.png"/);
});
