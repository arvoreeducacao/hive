import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { answerOnPage, hiveDoor } from "../peer/peer.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

async function hive() {
  const base = await mkdtemp(join(tmpdir(), "hive-reply-"));
  await mkdir(join(base, "sessions"), { recursive: true });
  await writeFile(join(base, "sessions", "as-telas.json"), JSON.stringify({ session_id: "s1", cwd: "/w/hub" }));
  return base;
}

async function fakeApp(base, { answer = { comment: { id: "c-9" }, pushed: true } } = {}) {
  const seen = [];
  const app = createServer((req, res) => {
    let body = "";
    req.on("data", (piece) => { body += piece; });
    req.on("end", () => {
      seen.push({ path: req.url, body: body ? JSON.parse(body) : null });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(answer));
    });
  });
  await new Promise((up) => app.listen({ path: hiveDoor(base) }, up));
  return { seen, close: () => new Promise((done) => app.close(done)) };
}

const envOf = (base) => ({ HIVE_SEAT: "as-telas", HIVE_STATE_DIR: base });

test("the answer goes into the conversation on the page, marked as the agent's", async () => {
  const base = await hive();
  const app = await fakeApp(base);
  const done = await answerOnPage({ slug: "as-telas", thread: "c-1", text: "empilhei os dois botões no celular", env: envOf(base) });
  await app.close();
  assert.equal(done.ok, true);
  assert.equal(app.seen.length, 1);
  assert.equal(app.seen[0].path, "/api/shelf/comment");
  assert.equal(app.seen[0].body.slug, "as-telas");
  assert.equal(app.seen[0].body.re, "c-1", "the answer hangs on the conversation that asked");
  assert.equal(app.seen[0].body.agent, true);
  assert.equal(app.seen[0].body.seat, "as-telas");
  assert.ok(!app.seen[0].body.pin, "an answer does not open a second pin on the element");
});

test("an answer with nothing in it never reaches the hive", async () => {
  const base = await hive();
  const app = await fakeApp(base);
  for (const missing of [{ slug: "", thread: "c-1", text: "oi" }, { slug: "as-telas", thread: "", text: "oi" }, { slug: "as-telas", thread: "c-1", text: "   " }]) {
    const said = await answerOnPage({ ...missing, env: envOf(base) });
    assert.ok(said.error, `${JSON.stringify(missing)} should have been refused`);
  }
  await app.close();
  assert.deepEqual(app.seen, []);
});

test("the seat is told the tool exists, and what it is for", () => {
  const mcp = readFileSync(fileURLToPath(new URL("../peer/peer-tools.mjs", import.meta.url)), "utf8");
  const cut = mcp.slice(mcp.indexOf('name: "reply_on_page"'), mcp.indexOf('name: "browser_navigate"'));
  assert.ok(cut.length > 0, "reply_on_page is not in the tool list the seat sees");
  assert.match(cut, /required: \["slug", "thread", "text"\]/);
  assert.match(cut, /pinned to that same element/);
  assert.match(mcp, /async reply_on_page\(args\)/, "the tool is declared but nothing runs it");
  assert.match(mcp, /answerOnPage\(\{ slug: args\.slug, thread: args\.thread, text: args\.text, env \}\)/, "the answer has to go out as the seat, not as the process");
});
