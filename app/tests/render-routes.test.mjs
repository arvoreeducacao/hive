import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerRenderRoutes, renderShots } from "../routes/render.mjs";

const PAGE = "6f1d3c2a-9b8e-4c7d-a6f5-1e2d3c4b5a69";
const PNG = "data:image/png;base64,iVBORw0KGgo=";

function harness(home) {
  const routes = new Map();
  const pod = [];
  registerRenderRoutes((method, path, handler) => routes.set(`${method} ${path}`, handler), {
    isSeatName: (name) => /^[\w.-]+$/.test(String(name || "")),
    bodyOf: async (req) => req.body || {},
    HIVE_HOME: home,
    bytesFromServer: async (script, args) => {
      pod.push({ script, args });
      return args[1] === PAGE ? { ok: true, data: Buffer.from("<p>from the pod</p>") } : { ok: false, error: "there is no page" };
    }
  });
  const call = async (key, { body = {}, query = "" } = {}) => {
    const answers = [];
    const writes = [];
    const ended = [];
    const json = (value, status = 200) => answers.push({ value, status });
    const res = { writeHead: (status, headers) => writes.push({ status, headers }), end: (value) => ended.push(value) };
    const path = key.split(" ")[1];
    await routes.get(key)({ body }, res, new URL(`http://hive${path}${query}`), json);
    return { answers, writes, ended };
  };
  return { call, pod };
}

test("a chat's page is served from its own folder, and only by a well-formed id", async () => {
  const home = await mkdtemp(join(tmpdir(), "hive-render-"));
  try {
    await mkdir(join(home, "renders", "drawer"), { recursive: true });
    await writeFile(join(home, "renders", "drawer", `${PAGE}.html`), "<h1>kept</h1>");
    const { call } = harness(home);
    const served = await call("GET /api/render/page", { query: `?name=drawer&id=${PAGE}` });
    assert.equal(served.writes[0].status, 200);
    assert.equal(served.writes[0].headers["content-type"], "text/html; charset=utf-8");
    assert.equal(String(served.ended[0]), "<h1>kept</h1>");
    const sneaky = await call("GET /api/render/page", { query: "?name=drawer&id=../../secrets" });
    assert.equal(sneaky.answers[0].status, 400);
    const other = await call("GET /api/render/page", { query: "?name=../drawer&id=" + PAGE });
    assert.equal(other.answers[0].status, 400);
    const gone = await call("GET /api/render/page", { query: "?name=drawer&id=6f1d3c2a-9b8e-4c7d-a6f5-000000000000" });
    assert.equal(gone.answers[0].status, 404);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("a cloud chat's page is read from the pod, by the seat and the id alone", async () => {
  const { call, pod } = harness("/nowhere");
  const served = await call("GET /api/render/page", { query: `?name=cloudy&where=cloud&id=${PAGE}` });
  assert.equal(String(served.ended[0]), "<p>from the pod</p>");
  assert.deepEqual(pod[0].args, ["cloudy", PAGE]);
  assert.match(pod[0].script, /renders\/\$1\/\$2\.html/);
});

test("a preview waits for the window to draw it, and only the measures and the picture come back", async () => {
  const { call } = harness("/nowhere");
  const asking = call("POST /api/render/preview", { body: { name: "drawer", html: "<p>x</p>", width: 9999, appearance: "light" } });
  await new Promise((done) => setImmediate(done));
  const waiting = renderShots();
  assert.equal(waiting.length, 1);
  assert.equal(waiting[0].width, 1600);
  assert.equal(waiting[0].appearance, "light");
  assert.equal("html" in waiting[0], false, "the poll carries the job, not the page");
  const source = await call("GET /api/render/preview/source", { query: `?id=${waiting[0].id}` });
  assert.equal(String(source.ended[0]), "<p>x</p>");
  assert.equal(renderShots().length, 0, "a job the window took is not handed out again");
  await call("POST /api/render/preview/result", { body: { id: waiting[0].id, image: PNG, contentHeight: 512.4, capturedHeight: 512, console: [{ level: "error", text: "boom" }, { level: "shout", text: 7 }] } });
  const done = await asking;
  assert.deepEqual(done.answers[0].value, { ok: true, image: PNG, contentHeight: 512, capturedHeight: 512, console: [{ level: "error", text: "boom" }, { level: "log", text: "7" }] });
});

test("a preview that comes back without a png is an error, not a picture", async () => {
  const { call } = harness("/nowhere");
  const asking = call("POST /api/render/preview", { body: { name: "drawer", html: "<p>x</p>" } });
  await new Promise((done) => setImmediate(done));
  const [job] = renderShots();
  await call("POST /api/render/preview/result", { body: { id: job.id, image: "data:text/html;base64,PGgxPg==" } });
  const done = await asking;
  assert.match(done.answers[0].value.error, /without a picture/);
  const stale = await call("POST /api/render/preview/result", { body: { id: job.id, image: PNG } });
  assert.deepEqual(stale.answers[0].value, { ok: true, stale: true });
});

test("a preview without a chat or without a page is refused at the door", async () => {
  const { call } = harness("/nowhere");
  const nameless = await call("POST /api/render/preview", { body: { html: "<p>x</p>" } });
  assert.equal(nameless.answers[0].status, 400);
  const empty = await call("POST /api/render/preview", { body: { name: "drawer", html: "  " } });
  assert.equal(empty.answers[0].status, 400);
  assert.equal(renderShots().length, 0);
});

test("an MCP app and its record are served from the chat's own folder, and only by a well-formed id", async () => {
  const home = await mkdtemp(join(tmpdir(), "hive-render-app-"));
  try {
    await mkdir(join(home, "mcp-apps", "drawer"), { recursive: true });
    await writeFile(join(home, "mcp-apps", "drawer", `${PAGE}.html`), "<h1>app</h1>");
    await writeFile(join(home, "mcp-apps", "drawer", `${PAGE}.json`), '{"server":"metabase"}');
    const { call, pod } = harness(home);
    const page = await call("GET /api/render/app", { query: `?name=drawer&id=${PAGE}` });
    assert.equal(page.writes[0].headers["content-type"], "text/html; charset=utf-8");
    assert.equal(String(page.ended[0]), "<h1>app</h1>");
    const meta = await call("GET /api/render/app", { query: `?name=drawer&id=${PAGE}&part=meta` });
    assert.equal(meta.writes[0].headers["content-type"], "application/json; charset=utf-8");
    assert.equal(String(meta.ended[0]), '{"server":"metabase"}');
    const sneaky = await call("GET /api/render/app", { query: "?name=drawer&id=../../secrets" });
    assert.equal(sneaky.answers[0].status, 400);
    const odd = await call("GET /api/render/app", { query: `?name=drawer&id=${PAGE}&part=../../x` });
    assert.equal(String(odd.ended[0]), "<h1>app</h1>", "any part other than meta reads the app itself");
    await call("GET /api/render/app", { query: `?name=cloudy&where=cloud&id=${PAGE}&part=meta` });
    assert.deepEqual(pod.at(-1).args, ["cloudy", PAGE, "json"], "a cloud chat's app is read from the pod by seat, id and one of two fixed endings");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
