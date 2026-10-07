import test from "node:test";
import assert from "node:assert/strict";
import { registerCanopyRoutes } from "../routes/canopy.mjs";

function canopyHarness() {
  const routes = new Map();
  const calls = [];
  let live = { at: 7, seats: { first: { tabs: [] } } };
  let state = { url: "http://127.0.0.1:4664", up: true };
  let tab = { id: "tab/one" };
  let frame = new Response(Uint8Array.from([1, 2, 3]), { headers: { "content-type": "image/png" } });
  registerCanopyRoutes((method, path, handler) => routes.set(path, { method, handler }), {
    canopyStateOf: async () => state,
    canopyLiveOf: () => live,
    isSeatName: (name) => name === "first",
    newestCanopyTab: (seat, id) => {
      calls.push(["tab", seat, id]);
      return tab;
    },
    canopyCall: async (path) => {
      calls.push(["frame", path]);
      if (frame instanceof Error) throw frame;
      return frame;
    }
  });
  const call = async (path, query = "") => {
    const answers = [];
    const response = {
      headers: null,
      status: 0,
      bytes: null,
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
      },
      end(bytes) {
        this.bytes = bytes;
      }
    };
    const json = (value, status = 200) => answers.push({ value, status });
    await routes.get(path).handler({}, response, new URL(`http://hive${path}${query}`), json);
    return { answers, response };
  };
  return {
    routes,
    calls,
    call,
    setLive: (value) => { live = value; },
    setState: (value) => { state = value; },
    setTab: (value) => { tab = value; },
    setFrame: (value) => { frame = value; }
  };
}

test("canopy registers its state and frame endpoints as read routes", () => {
  const { routes } = canopyHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/canopy", null],
    ["/api/canopy/frame", null]
  ]);
});

test("canopy combines the fresh probe with the latest polled seats", async () => {
  const hive = canopyHarness();
  hive.setState({ url: "https://canopy.example", up: false });
  hive.setLive({ at: 19, seats: { second: { tabs: [{ id: "two" }] } } });
  const { answers } = await hive.call("/api/canopy");
  assert.deepEqual(answers, [{
    value: { url: "https://canopy.example", up: false, at: 19, seats: { second: { tabs: [{ id: "two" }] } } },
    status: 200
  }]);
});

test("canopy frame validates the seat and selected tab before calling the daemon", async () => {
  const hive = canopyHarness();
  const invalid = await hive.call("/api/canopy/frame", "?seat=not/a/seat");
  assert.deepEqual(invalid.answers, [{ value: { error: "no tab" }, status: 404 }]);
  assert.deepEqual(hive.calls, []);

  hive.setTab(null);
  const missing = await hive.call("/api/canopy/frame", "?seat=first&tab=gone");
  assert.deepEqual(missing.answers, [{ value: { error: "no tab" }, status: 404 }]);
  assert.deepEqual(hive.calls, [["tab", "first", "gone"]]);
});

test("canopy frame preserves content type and streams the daemon bytes to the response", async () => {
  const hive = canopyHarness();
  const { answers, response } = await hive.call("/api/canopy/frame", "?seat=first&tab=tab%2Fone");
  assert.deepEqual(answers, []);
  assert.equal(response.status, 200);
  assert.deepEqual(response.headers, { "content-type": "image/png", "cache-control": "no-store" });
  assert.deepEqual(response.bytes, Buffer.from([1, 2, 3]));
  assert.deepEqual(hive.calls, [
    ["tab", "first", "tab/one"],
    ["frame", "/tabs/tab%2Fone/frame"]
  ]);
});

test("canopy frame keeps daemon status mapping and connection errors", async () => {
  const hive = canopyHarness();
  hive.setFrame(new Response(null, { status: 404 }));
  assert.deepEqual((await hive.call("/api/canopy/frame", "?seat=first")).answers, [
    { value: { error: "no frame" }, status: 404 }
  ]);

  hive.setFrame(new Response(null, { status: 503 }));
  assert.deepEqual((await hive.call("/api/canopy/frame", "?seat=first")).answers, [
    { value: { error: "no frame" }, status: 502 }
  ]);

  hive.setFrame(new Error("offline"));
  assert.deepEqual((await hive.call("/api/canopy/frame", "?seat=first")).answers, [
    { value: { error: "canopy is not answering" }, status: 502 }
  ]);
});
