import test from "node:test";
import assert from "node:assert/strict";
import { registerHistoryRoutes } from "../routes/history.mjs";

function historyHarness() {
  const routes = new Map();
  const histories = [];
  const images = [];
  let shot = { type: "image/png", data: Buffer.from("image") };
  registerHistoryRoutes((method, path, handler) => routes.set(path, { method, handler }), {
    isSeatName: (name) => name === "fern",
    paneHistory: async (...args) => { histories.push(args); return "pane text"; },
    readImage: async (args) => { images.push(args); return shot; }
  });
  const call = async (path, query = "") => {
    const answers = [];
    const writes = [];
    const ended = [];
    const json = (value, status = 200) => answers.push({ value, status });
    const res = {
      writeHead: (status, headers) => writes.push({ status, headers }),
      end: (value) => ended.push(value)
    };
    await routes.get(path).handler({}, res, new URL(`http://hive${path}${query}`), json);
    return { answers, writes, ended };
  };
  return { routes, histories, images, call, setShot: (value) => { shot = value; } };
}

test("history routes keep their paths and read-only methods", () => {
  const { routes } = historyHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/history", null],
    ["/api/image", null]
  ]);
});

test("history validates the seat and normalizes its location", async () => {
  const hive = historyHarness();
  assert.deepEqual(await hive.call("/api/history", "?name=missing&where=cloud"), {
    answers: [{ value: { error: "unknown session" }, status: 400 }],
    writes: [],
    ended: []
  });
  assert.deepEqual(hive.histories, []);

  const local = await hive.call("/api/history", "?name=fern&where=somewhere");
  assert.deepEqual(local.answers, [{ value: { text: "pane text" }, status: 200 }]);
  assert.deepEqual(hive.histories, [["fern", "local"]]);
});

test("image passes its query to the reader and writes the returned bytes", async () => {
  const hive = historyHarness();
  const result = await hive.call("/api/image", "?path=%2Ftmp%2Fshot.png&where=cloud&name=fern");
  assert.deepEqual(hive.images, [{ path: "/tmp/shot.png", where: "cloud", session: "fern" }]);
  assert.deepEqual(result.answers, []);
  assert.deepEqual(result.writes, [{
    status: 200,
    headers: { "content-type": "image/png", "cache-control": "no-store", "content-length": 5 }
  }]);
  assert.deepEqual(result.ended, [Buffer.from("image")]);
});

test("image returns reader errors as a 404 without writing bytes", async () => {
  const hive = historyHarness();
  hive.setShot({ error: "not there" });
  assert.deepEqual(await hive.call("/api/image"), {
    answers: [{ value: { error: "not there" }, status: 404 }],
    writes: [],
    ended: []
  });
  assert.deepEqual(hive.images, [{ path: "", where: "local", session: "" }]);
});
