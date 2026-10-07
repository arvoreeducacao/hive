import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerArtifactRoutes } from "../routes/artifacts.mjs";
import { app, dom, state, views } from "./dom.mjs";

const st = await state();
await views();
const { ARTIFACT_TOOL, artifactFace, artifactPublish, artifactSaid, artifactTag, svToolCard, svToolResult } = await app("subagents-dock");
const { markArtRows, webOfSeat } = await app("chat-and-panes");
const { getStructured } = await app("chat-stretches");
const { svConvSeed } = await app("conversation-model");
await app("hold-numbers");

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const seatMenu = readFileSync(join(HERE, "src/app/seat-menu.js"), "utf8");

function cut(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const kept = new Function("createHash", "join", "HIVE_HOME",
  cut(server, "const ARTIFACT_HOME = join(", "function artifactIndex(key) {", "server.mjs")
  + "return { artifactKey, titleOfPage, nextVersions, ARTIFACT_KEPT };"
)(createHash, join, "/tmp/hive-artifacts-test");

function seatOf(name) {
  st.data = { sessions: [{ name, where: "local", state: "idle" }], spawning: [] };
  const e = getStructured({ name, where: "local" });
  e.conv = svConvSeed();
  document.body.appendChild(e.host);
  return e;
}

const PUBLISHED = "Published /tmp/s/scratchpad/rfc.html at https://claude.ai/code/artifact/cc6ad9fa-a642"
  + "\n\nLive subscription: skipped — the flag is off in this session.";

test("the published line gives back the file and the link", () => {
  const said = artifactSaid(PUBLISHED);
  assert.equal(said.path, "/tmp/s/scratchpad/rfc.html");
  assert.equal(said.url, "https://claude.ai/code/artifact/cc6ad9fa-a642");
});

test("a link that ends a sentence does not carry the punctuation into the url", () => {
  const said = artifactSaid("Published /tmp/a.html at https://claude.ai/code/artifact/abc.");
  assert.equal(said.url, "https://claude.ai/code/artifact/abc");
});

test("an answer that published nothing gives back nothing", () => {
  assert.deepEqual(artifactSaid("could not write that file"), { path: "", url: "" });
  assert.deepEqual(artifactSaid(undefined), { path: "", url: "" });
});

test("an answer that names the page on its own line still gives the link", () => {
  const said = artifactSaid("Published Sinal de Vida\nhttps://claude.ai/code/artifact/84e1f98a-bdb9\nversion 3");
  assert.equal(said.url, "https://claude.ai/code/artifact/84e1f98a-bdb9");
  assert.equal(said.path, "", "there is no file path to read in that shape");
});

test("an answer that carries several pages picks none — one of them would be a lie", () => {
  const many = "https://claude.ai/code/artifact/aaa1 and https://claude.ai/code/artifact/bbb2";
  assert.equal(artifactSaid(many).url, "");
});

test("publishing a page takes the row", () => {
  assert.equal(artifactPublish("Artifact", { file_path: "/tmp/a.html" }), true);
  assert.equal(artifactPublish("artifact", { action: "publish", file_path: "/tmp/a.html" }), true);
});

test("listing, reading comments or replying stays a tool call — there is no page to open", () => {
  assert.equal(artifactPublish("artifact", { action: "list", limit: 25 }), false);
  assert.equal(artifactPublish("artifact", { action: "comments", url: "https://claude.ai/code/artifact/aaa" }), false);
  assert.equal(artifactPublish("artifact", { action: "reply", thread_id: "t1", text: "ok" }), false);
  assert.equal(artifactPublish("artifact", { action: "upload_asset", file_path: "/tmp/a.png" }), false);
});

test("a publish that names no file is not a page either", () => {
  assert.equal(artifactPublish("artifact", {}), false);
  assert.equal(artifactPublish("artifact", { file_path: "   " }), false);
  assert.equal(artifactPublish("bash", { file_path: "/tmp/a.html" }), false);
});

test("the row takes the file name, the icon and the sentence from the call", () => {
  const it = artifactFace({
    file_path: "/tmp/s/scratchpad/rfc-atividade-etapas.html",
    label: "projecao-sem-backfill",
    description: "RFC que colapsa\n  os cinco modelos"
  });
  assert.equal(it.name, "rfc-atividade-etapas.html");
  assert.equal(it.glyph, "i-doc");
  assert.equal(it.label, "projecao-sem-backfill");
  assert.equal(it.says, "RFC que colapsa os cinco modelos");
});

test("a page of screens wears the screen icon, never the one of a document", () => {
  for (const path of ["/tmp/telas-do-crm.html", "/tmp/canvas-da-home.html", "/tmp/mockup.html", "/tmp/screens.html"]) {
    assert.equal(artifactFace({ file_path: path }).glyph, "i-screen", path);
  }
});

test("a call without a path still has a name, and its icon never depends on what the AI picked", () => {
  const it = artifactFace({ favicon: "🪜" });
  assert.equal(it.name, "page.html");
  assert.equal(it.glyph, "i-doc");
  assert.equal(it.says, "");
});

test("the version tag reads v3 · label, and drops what it does not have", () => {
  assert.equal(artifactTag(3, "projecao-sem-backfill"), "v3 · projecao-sem-backfill");
  assert.equal(artifactTag(3, ""), "v3");
  assert.equal(artifactTag(0, "primeira"), "primeira");
  assert.equal(artifactTag(0, ""), "");
});

test("only the artifact tool takes the row — an mcp call that mentions it does not", () => {
  assert.equal(ARTIFACT_TOOL.test("artifact"), true);
  assert.equal(ARTIFACT_TOOL.test("Artifact"), true);
  assert.equal(ARTIFACT_TOOL.test("artifacts"), false);
  assert.equal(ARTIFACT_TOOL.test("mcp__notion__create_artifact"), false);
});

test("the title of the page is the title tag, on one line", () => {
  assert.equal(kept.titleOfPage("<html><head><title>Uma atividade,\n  N etapas</title>"), "Uma atividade, N etapas");
  assert.equal(kept.titleOfPage("<title>Deploy &amp; rollback</title>"), "Deploy & rollback");
  assert.equal(kept.titleOfPage("<html><body>no title here</body></html>"), "");
});

const version = (over = {}) => ({ hash: "aaa", label: "", at: 1, bytes: 10, ...over });

test("the first publish opens version one", () => {
  const { versions, wrote } = kept.nextVersions([], version());
  assert.equal(wrote, 1);
  assert.deepEqual(versions.map((v) => v.n), [1]);
});

test("republishing the same bytes does not open a version — it only renames the one that is there", () => {
  const first = kept.nextVersions([], version({ label: "" })).versions;
  const { versions, wrote } = kept.nextVersions(first, version({ label: "backfill-via-script" }));
  assert.equal(wrote, 0, "same bytes must not write a file");
  assert.equal(versions.length, 1);
  assert.equal(versions[0].label, "backfill-via-script");
});

test("bytes that changed open the next version and keep the old one", () => {
  const first = kept.nextVersions([], version({ hash: "aaa", label: "primeira" })).versions;
  const { versions, wrote } = kept.nextVersions(first, version({ hash: "bbb", label: "segunda" }));
  assert.equal(wrote, 2);
  assert.deepEqual(versions.map((v) => v.n), [1, 2]);
  assert.deepEqual(versions.map((v) => v.label), ["primeira", "segunda"]);
});

test("a page that is republished forever keeps only the last dozen, and the numbers keep counting", () => {
  let versions = [];
  for (let i = 1; i <= kept.ARTIFACT_KEPT + 3; i++) versions = kept.nextVersions(versions, version({ hash: `h${i}` })).versions;
  assert.equal(versions.length, kept.ARTIFACT_KEPT);
  assert.equal(versions[versions.length - 1].n, kept.ARTIFACT_KEPT + 3);
  assert.equal(versions[0].n, 4);
});

test("the key is twelve hex characters, the same for the same seat and page", () => {
  const a = kept.artifactKey("etapas", "/tmp/s/rfc.html");
  assert.match(a, /^[a-f0-9]{12}$/);
  assert.equal(a, kept.artifactKey("etapas", "/tmp/s/rfc.html"));
});

test("two seats that publish the same path do not share a folder", () => {
  assert.notEqual(kept.artifactKey("etapas", "/tmp/s/rfc.html"), kept.artifactKey("outro", "/tmp/s/rfc.html"));
});

test("the route that serves a page only answers to a key it could have written", async () => {
  const routes = new Map();
  const read = [];
  registerArtifactRoutes((method, path, handler) => routes.set(path, handler), {
    isSeatName: (name) => name === "seat",
    artifactIndex: () => ({ versions: [{ n: 1 }] }),
    artifactKey: (name, path) => `${name}:${path}`,
    ARTIFACT_HOME: "/hive/artifacts",
    readFileSync: (path) => { read.push(path); return Buffer.from("<title>Kept</title>"); },
    join,
    TABS: ["documento", "telas", "plano", "lente"],
    getDev: () => "rick"
  });
  const ask = async (key) => {
    const answers = [];
    const ended = [];
    await routes.get("/api/artifact/page")({}, { writeHead() {}, end: (value) => ended.push(value) },
      new URL(`http://hive/api/artifact/page?key=${key}`), (value, status = 200) => answers.push({ value, status }));
    return { answers, ended };
  };
  const crooked = await ask("../../etc/passwd");
  assert.equal(crooked.answers[0].status, 400, "a key that is not twelve hex characters became a path on disk");
  assert.equal(read.length, 0);
  const straight = await ask("a1b2c3d4e5f6");
  assert.equal(straight.ended.length, 1);
  assert.deepEqual(read, ["/hive/artifacts/a1b2c3d4e5f6/v1.html"]);
});

test("the artifact call takes the row instead of the tool card", () => {
  const e = seatOf("art-row");
  const row = svToolCard(e, { id: "t1", name: "Artifact", input: { file_path: "/tmp/s/rfc.html", label: "projecao", description: "diz o que muda" } }, false);
  assert.equal(row.className, "sv-art");
  assert.equal(row.dataset.path, "/tmp/s/rfc.html");
  assert.equal(row.querySelector(".aname").textContent, "rfc.html");
  assert.equal(row.querySelector(".asay").textContent, "diz o que muda");
  const plain = svToolCard(e, { id: "t2", name: "Bash", input: { command: "ls" } }, false);
  assert.equal(plain.kind, "tool", "every other call is still a tool card");
});

test("the result of an artifact call lands on the row, not on a tool body", () => {
  const e = seatOf("art-landed");
  const row = svToolCard(e, { id: "t1", name: "Artifact", input: { file_path: "/tmp/s/rfc.html" } }, false);
  svToolResult(e, { tool_use_id: "t1", content: PUBLISHED }, false);
  assert.equal(row.classList.contains("running"), false);
  assert.equal(row.dataset.url, "https://claude.ai/code/artifact/cc6ad9fa-a642");
  assert.equal(row.querySelector(".ago").textContent, "open");
  assert.equal(row.querySelector(".tbody"), null, "the answer was written into a tool body the row does not have");
});

const ON_THE_SHELF = `on the shelf as "Plano da missão" · plano v4 · draft · pushed to the team's repo
hive://shelf/plano-da-missao?tab=plano&v=4 — this is the link to announce`;

async function keptBy(name, input, said) {
  const e = seatOf(`art-keep-${name}`);
  const asked = [];
  const fetched = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    asked.push({ url: String(url), body: JSON.parse(options?.body || "{}") });
    return { json: async () => ({ key: "aaaaaaaaaaaa", slug: "plano-da-missao", versions: [{ n: 4, label: "draft" }] }) };
  };
  try {
    svToolCard(e, { id: "t1", name, input }, true);
    svToolResult(e, { tool_use_id: "t1", content: said }, true);
    await new Promise((go) => setTimeout(go, 0));
  } finally {
    globalThis.fetch = fetched;
  }
  return asked.find((call) => call.url.includes("/api/artifact/keep"))?.body || null;
}

test("a page published to the shelf is kept under the tab it was published to, and is not shelved twice", async () => {
  const keep = await keptBy("mcp__hive__publish", { path: "/tmp/s/plano.html", label: "draft", tab: "plano" }, ON_THE_SHELF);
  assert.ok(keep, "the row never asked the hive to keep the page");
  assert.equal(keep.tab, "plano", "without the tab the shelf guesses documento from the filename, and the plan lands on top of the rfc");
  assert.equal(keep.shelve, false, "the publish already put it on the shelf — keeping it must not shelve it a second time");
});

test("the artifact tool has no publish behind it, so keeping it still reaches the shelf", async () => {
  const keep = await keptBy("Artifact", { file_path: "/tmp/s/rfc.html", label: "draft" }, PUBLISHED);
  assert.ok(keep);
  assert.equal(keep.tab, "");
  assert.equal(keep.shelve, true);
});

test("every repaint of a seat marks which of its rows is the page on screen", () => {
  const e = seatOf("art-marks");
  const rowOf = (slug) => {
    const row = document.createElement("div");
    row.className = "sv-art";
    row.dataset.slug = slug;
    e.scroll.appendChild(row);
    return row;
  };
  const mine = rowOf("rfc-etapas");
  const other = rowOf("outra-pagina");
  st.open = "art-marks";
  st.webChat = "art-marks";
  webOfSeat.set("art-marks", { tabs: [{ kind: "artifact", slug: "rfc-etapas" }], active: 0 });
  markArtRows("art-marks");
  assert.equal(mine.classList.contains("here"), true);
  assert.equal(other.classList.contains("here"), false);
  st.webChat = null;
  markArtRows("art-marks");
  assert.equal(mine.classList.contains("here"), false, "the row stayed lit after the page left the screen");
  const paint = cut(seatMenu, "  paintPrOfChat(el, s);", "  const well = el.querySelector", "src/app/seat-menu.js");
  assert.match(paint, /markArtRows\(s\.name\);/, "a repaint of the tile stopped marking its rows");
  assert.ok(!paint.includes("paintArtOfChat"), "there is no artifact pane to paint any more");
});

test("escape closes the browser, which is where the page lives now", () => {
  st.cockChat = null;
  st.deviceChat = null;
  st.webChat = "art-escape";
  document.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(st.webChat, null, "escape left the browser open, and with it the page");
});
