import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertWithSips, registerAttachmentRoutes, storedNameOf } from "../routes/attachments.mjs";
import { slug } from "../lib/naming.mjs";

function harness(overrides = {}) {
  const home = mkdtempSync(join(tmpdir(), "attach-"));
  const routes = [];
  const put = [];
  registerAttachmentRoutes((method, path, handler) => routes.push({ method, path, handler }), {
    isSeatName: (name) => /^[\w.-]+$/.test(name),
    shotsDirOf: (name) => join(home, "shots", name),
    assetsDir: join(home, "assets"),
    cloudReach: { putFile: async (path, body) => { put.push({ path, size: body.length }); return { ok: true, path }; } },
    slug,
    readAttachment: async ({ path }) => (existsSync(path) ? { type: "text/plain", data: readFileSync(path) } : { error: "gone" }),
    now: () => 1000,
    ...overrides
  });
  async function call(path, { method = "POST", body = [] } = {}) {
    const url = new URL(path, "http://hive");
    const route = routes.find((one) => one.path === url.pathname && one.method === method);
    const answers = [];
    const res = { head: null, writeHead(status, headers) { this.head = { status, headers }; }, end(data) { answers.push({ raw: data, status: this.head.status, headers: this.head.headers }); } };
    await route.handler(Readable.from(body), res, url, (value, status = 200) => answers.push({ value, status }));
    return answers[0];
  }
  return { home, call, put };
}

test("the stored name keeps the file's own name, made safe", () => {
  assert.equal(storedNameOf("Relatório Final (2).PDF", slug), "relatorio-final-2.pdf");
  assert.equal(storedNameOf("../../etc/passwd", slug), "passwd.bin");
});

test("a file streams to the chat's folder under its own name and comes back with its path", async () => {
  const h = harness();
  const said = await h.call("/api/attachment?name=seat-1&where=local&file=notas.csv", { body: [Buffer.from("a,b\n"), Buffer.from("1,2\n")] });
  assert.equal(said.status, 200);
  assert.equal(said.value.name, "notas.csv");
  assert.equal(said.value.size, 8);
  assert.ok(said.value.path.startsWith(join(h.home, "shots", "seat-1", "files")));
  assert.equal(readFileSync(said.value.path, "utf8"), "a,b\n1,2\n");
});

test("a new chat with no seat yet keeps its files with the hub assets", async () => {
  const h = harness();
  const said = await h.call("/api/attachment?where=local&file=a.txt", { body: [Buffer.from("x")] });
  assert.ok(said.value.path.startsWith(join(h.home, "assets", "files")));
});

test("a file over the ceiling, or one that came in empty, is refused and leaves nothing behind", async () => {
  const h = harness({ ceiling: 4 });
  const big = await h.call("/api/attachment?name=s&file=big.bin", { body: [Buffer.from("12345")] });
  assert.equal(big.status, 413);
  assert.equal(big.value.code, "too-big");
  const empty = await h.call("/api/attachment?name=s&file=none.txt", { body: [] });
  assert.equal(empty.value.code, "empty");
  const files = join(h.home, "shots", "s", "files");
  assert.deepEqual(existsSync(files) ? readdirSync(files) : [], [], "a refused upload left its folder behind");
});

test("a photo the browser could not decode is converted on the way in, and the jpeg is what lands", async () => {
  const h = harness({ convertImage: async (path) => { const out = path.replace(/\.heic$/, ".jpg"); writeFileSync(out, "jpeg!"); return { path: out }; } });
  const said = await h.call("/api/attachment?name=s&file=IMG_1.HEIC&convert=jpeg", { body: [Buffer.from("heic bytes")] });
  assert.equal(said.value.name, "img-1.jpg");
  assert.equal(said.value.size, 5);
  const refused = harness({ convertImage: async () => ({ error: "unreadable" }) });
  assert.equal((await refused.call("/api/attachment?name=s&file=x.heic&convert=jpeg", { body: [Buffer.from("?")] })).value.code, "unreadable");
});

test("a cloud chat gets the file on the server and the server's path back", async () => {
  const h = harness();
  const said = await h.call("/api/attachment?name=s&where=cloud&file=log.txt", { body: [Buffer.from("hello")] });
  assert.match(said.value.path, /^\/workspace\/hive\/assets\/.+-log\.txt$/);
  assert.deepEqual(h.put.map((one) => one.size), [5]);
});

test("the preview reads an attached file back", async () => {
  const h = harness();
  const saved = await h.call("/api/attachment?name=s&file=a.txt", { body: [Buffer.from("conteúdo")] });
  const read = await h.call(`/api/attachment?path=${encodeURIComponent(saved.value.path)}`, { method: "GET" });
  assert.equal(read.status, 200);
  assert.equal(read.raw.toString("utf8"), "conteúdo");
});

test("sips only runs on a mac", async () => {
  assert.deepEqual(await convertWithSips("/x.heic", { platform: "linux" }), { error: "unreadable" });
  const asked = [];
  const made = await convertWithSips("/tmp/x.heic", { platform: "darwin", run: (cmd, args, opts, done) => { asked.push([cmd, args]); done(null); } });
  assert.equal(made.path, "/tmp/x.jpg");
  assert.equal(asked[0][0], "sips");
  assert.ok(asked[0][1].includes("2000"));
});

test("a file read back never runs as a page in the app", async () => {
  const h = harness();
  const saved = await h.call("/api/attachment?name=seat-1&where=local&file=pagina.html", { body: [Buffer.from("<script>alert(1)</script>")] });
  const read = await h.call(`/api/attachment?path=${encodeURIComponent(saved.value.path)}&where=local&name=seat-1`, { method: "GET" });
  assert.equal(read.status, 200);
  assert.equal(read.headers["x-content-type-options"], "nosniff");
  assert.equal(read.headers["content-security-policy"], "sandbox");
});
