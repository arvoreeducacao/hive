import test from "node:test";
import assert from "node:assert/strict";
import { registerSeatRoutes } from "../routes/seats.mjs";

const PNG = "data:image/png;base64,YQ==";

function seatHarness() {
  const routes = new Map();
  const calls = {
    jobs: [],
    says: [],
    answers: [],
    typed: [],
    saved: [],
    bridge: [],
    buzzes: [],
    shells: [],
    renamed: [],
    reads: [],
    uploads: [],
    killed: [],
    archiveFixed: [],
    forgotten: [],
    shotsForgotten: [],
    archived: [],
    revived: []
  };
  const spawning = new Map([["opening", { id: "opening" }]]);
  const archivedSeats = new Map([["local:seat", { name: "seat" }]]);
  const state = {
    wake: { ok: true, woke: false },
    ticks: 0,
    structured: false,
    say: { ok: true },
    answer: { ok: true, left: 0 },
    save: { files: ["/tmp/one.png"], error: "" },
    bridge: { oneshot: async (...args) => { calls.bridge.push(args); return { ok: true }; } },
    server: { client: { post: async () => ({ ok: true, body: {} }) } },
    buzz: { ok: true },
    shell: { ok: true, name: "terminal" },
    shellError: "",
    invalidations: 0,
    archivedWrites: 0,
    upload: { ok: true },
    kill: undefined,
    archive: { ok: true, archived: "seat" },
    archiveError: "",
    revive: { ok: true, name: "seat-2" },
    errands: {}
  };
  registerSeatRoutes((method, path, handler) => routes.set(path, { method, handler }), {
    bodyOf: async (req) => req.body || {},
    openJob: (body) => {
      calls.jobs.push(["open", body]);
      return { id: `job-${calls.jobs.filter((one) => one[0] === "open").length}`, name: body.name || "seat" };
    },
    runJob: (job, body) => { calls.jobs.push(["run", job, body]); },
    isSeatName: (name) => name === "seat" || name === "from",
    deliverSay: async (...args) => { calls.says.push(args); return state.say; },
    wakeAndWait: async () => state.wake,
    fleetTick: async () => { state.ticks++; },
    structuredSeat: () => state.structured,
    typeText: async (...args) => { calls.typed.push(args); },
    deliverAnswer: async (...args) => { calls.answers.push(args); return state.answer; },
    saveFiles: async (...args) => { calls.saved.push(args); return state.save; },
    bridgeFor: () => state.bridge,
    phoneBridgeFor: () => ({ buzz: async (...args) => { calls.buzzes.push(args); return state.buzz; } }),
    hiveHome: "/hive",
    readErrands: () => state.errands,
    serverFor: async () => state.server,
    openShell: async (body) => {
      calls.shells.push(body);
      if (state.shellError) throw new Error(state.shellError);
      return state.shell;
    },
    spawning,
    invalidateFleetCache: () => { state.invalidations++; },
    renameSeat: (...args) => { calls.renamed.push(args); return "New title"; },
    cloudReach: { putFile: async (...args) => { calls.uploads.push(args); return state.upload; } },
    killSeatWindow: async (...args) => { calls.killed.push(args); return state.kill; },
    historyClosedSeat: (...args) => { calls.archiveFixed.push(args); },
    forgetSeat: (...args) => { calls.forgotten.push(args); },
    forgetShots: async (name) => { calls.shotsForgotten.push(name); },
    archiveSeat: async (...args) => {
      calls.archived.push(args);
      if (state.archiveError) throw new Error(state.archiveError);
      return state.archive;
    },
    reviveArchivedSeat: async (...args) => { calls.revived.push(args); return state.revive; },
    archivedSeats,
    saveArchivedSeats: () => { state.archivedWrites++; },
    readFileImpl: async (path) => { calls.reads.push(path); return Buffer.from(path); }
  });
  const call = async (path, body = {}) => {
    const answers = [];
    const json = (value, status = 200) => { answers.push({ value, status }); };
    await routes.get(path).handler({ body }, {}, new URL(`http://hive${path}`), json);
    return answers;
  };
  return { routes, calls, spawning, archivedSeats, state, call };
}

test("the seat room registers every extracted route as POST in server order", () => {
  const { routes } = seatHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/spawn", "POST"],
    ["/api/say", "POST"],
    ["/api/answer", "POST"],
    ["/api/show", "POST"],
    ["/api/buzz", "POST"],
    ["/api/shell", "POST"],
    ["/api/spawning/forget", "POST"],
    ["/api/rename", "POST"],
    ["/api/attach", "POST"],
    ["/api/screenshot", "POST"],
    ["/api/seat/leftovers", "POST"],
    ["/api/kill", "POST"],
    ["/api/seat/archive", "POST"],
    ["/api/seat/unarchive", "POST"],
    ["/api/seat/forget-archived", "POST"]
  ]);
});

test("spawn validates the mission and starts the accepted job without waiting", async () => {
  const hive = seatHarness();
  assert.deepEqual(await hive.call("/api/spawn"), [{ value: { error: "write the mission or give it a name" }, status: 400 }]);
  const body = { prompt: " Build it " };
  assert.deepEqual(await hive.call("/api/spawn", body), [{ value: { ok: true, id: "job-1", name: "seat", settled: false }, status: 202 }]);
  assert.deepEqual(hive.calls.jobs, [["open", { ...body, count: 1 }], ["run", { id: "job-1", name: "seat" }, { ...body, count: 1 }]]);
});

test("a chat opened by another chat opens its own, the same way the person's chat does", async () => {
  const hive = seatHarness();
  hive.state.errands = { "chat-abre-chat": { errand: "acervo" }, "biblion-capas": { errand: "acervo", by: "chat-abre-chat" } };

  const [child] = await hive.call("/api/spawn", { prompt: "olha o acervo", by: "chat-abre-chat" });
  assert.equal(child.status, 202);

  const [grandchild] = await hive.call("/api/spawn", { prompt: "olha as capas", by: "biblion-capas" });
  assert.equal(grandchild.status, 202);
  assert.equal(hive.calls.jobs.filter((one) => one[0] === "open").length, 2);
});

test("a race opens one job per chat, each carrying the same mission, its place, and one errand", async () => {
  const hive = seatHarness();
  assert.deepEqual(await hive.call("/api/spawn", { name: "login", count: 3 }), [{ value: { error: "a race needs a mission — the chats have to be given the same thing to do" }, status: 400 }]);
  const [answer] = await hive.call("/api/spawn", { prompt: "fix the login", name: "login", count: 3, where: "local" });
  assert.equal(answer.status, 202);
  assert.deepEqual(answer.value, { ok: true, id: "job-1", name: "login-1", settled: false, ids: ["job-1", "job-2", "job-3"], names: ["login-1", "login-2", "login-3"], race: 3 });
  const opened = hive.calls.jobs.filter((one) => one[0] === "open").map((one) => one[1]);
  assert.deepEqual(opened.map((one) => one.name), ["login-1", "login-2", "login-3"]);
  assert.deepEqual(opened.map((one) => one.race), [{ i: 1, of: 3 }, { i: 2, of: 3 }, { i: 3, of: 3 }]);
  assert.ok(opened.every((one) => one.errand === "fix the login"));
  assert.ok(opened.every((one) => one.prompt.endsWith("fix the login")));
  assert.match(opened[2].prompt, /chat 3 of 3/);
  assert.equal(hive.calls.jobs.filter((one) => one[0] === "run").length, 3);
});

test("say preserves peer delivery, cloud wakeup, structured seats and terminal input", async () => {
  const hive = seatHarness();
  assert.deepEqual(await hive.call("/api/say", { name: "bad", text: "hi" }), [{ value: { error: "missing name" }, status: 400 }]);
  assert.deepEqual(await hive.call("/api/say", { name: "seat", text: "hi", from: "from" }), [{ value: { ok: true, delivered: true }, status: 200 }]);
  assert.deepEqual(hive.calls.says, [["seat", "from", "hi"]]);

  hive.state.wake = { ok: true, woke: true };
  hive.state.structured = true;
  assert.deepEqual(await hive.call("/api/say", { name: "seat", text: "cloud", where: "cloud" }), [{ value: { ok: true, delivered: false }, status: 200 }]);
  assert.equal(hive.state.ticks, 1);

  hive.state.structured = false;
  assert.deepEqual(await hive.call("/api/say", { name: "seat", text: "local" }), [{ value: { ok: true, delivered: true }, status: 200 }]);
  assert.deepEqual(hive.calls.typed, [["seat", "local", "local", true]]);

  hive.state.wake = { ok: false, error: "asleep" };
  assert.deepEqual(await hive.call("/api/say", { name: "seat", text: "cloud", where: "cloud" }), [{ value: { error: "asleep" }, status: 503 }]);
});

test("say pushes into a local structured seat only when the caller cannot type it itself", async () => {
  const hive = seatHarness();
  hive.state.structured = true;
  assert.deepEqual(await hive.call("/api/say", { name: "seat", text: "local" }), [{ value: { ok: true, delivered: false }, status: 200 }]);
  assert.deepEqual(hive.calls.bridge, []);

  assert.deepEqual(await hive.call("/api/say", { name: "seat", text: "from outside", push: true }), [{ value: { ok: true, delivered: true }, status: 200 }]);
  assert.equal(hive.calls.bridge.length, 1);
  assert.match(hive.calls.bridge[0][0], /sock\/seat\.sock$/);
  assert.deepEqual(hive.calls.bridge[0][1], { type: "say", text: "from outside" });

  assert.deepEqual(await hive.call("/api/say", { name: "seat", text: "cloud", where: "cloud", push: true }), [{ value: { ok: true, delivered: false }, status: 200 }]);
  assert.equal(hive.calls.bridge.length, 1);

  hive.state.bridge = { oneshot: async () => ({ ok: false, error: "busy" }) };
  assert.deepEqual(await hive.call("/api/say", { name: "seat", text: "again", push: true }), [{ value: { error: "busy" }, status: 400 }]);
});

test("answer validates the question map and returns the delivery result unchanged", async () => {
  const hive = seatHarness();
  assert.deepEqual(await hive.call("/api/answer", { name: "seat", id: "q1", answers: {} }), [{ value: { error: "an answer needs at least one question filled in" }, status: 400 }]);
  assert.deepEqual(await hive.call("/api/answer", { name: "seat", id: "q1", answers: { q1: "yes" } }), [{ value: { ok: true, left: 0 }, status: 200 }]);
  assert.deepEqual(hive.calls.answers, [["seat", "q1", { q1: "yes" }]]);
  hive.state.answer = { ok: false, error: "gone" };
  assert.deepEqual(await hive.call("/api/answer", { name: "seat", id: "q1", answers: { q1: "yes" } }), [{ value: { error: "gone" }, status: 400 }]);
});

test("show validates and saves phone images before using the bridge or terminal", async () => {
  const hive = seatHarness();
  assert.deepEqual(await hive.call("/api/show", { oversized: true }), [{ value: { error: "that is more than this door carries in one go" }, status: 413 }]);
  assert.deepEqual(await hive.call("/api/show", { name: "seat", image: PNG, text: "look" }), [{ value: { ok: true, delivered: true, path: "/tmp/one.png" }, status: 200 }]);
  assert.deepEqual(hive.calls.saved[0], [[{ name: "phone.png", data: PNG }], "seat"]);
  assert.deepEqual(hive.calls.typed, [["seat", "local", "look /tmp/one.png", true]]);

  hive.state.structured = true;
  assert.deepEqual(await hive.call("/api/show", { name: "seat", image: PNG, where: "cloud" }), [{ value: { ok: true, delivered: true, path: "/tmp/one.png" }, status: 200 }]);
  assert.deepEqual(hive.calls.bridge, [["/hive/sock/seat.sock", { type: "say", text: "/tmp/one.png" }]]);
  hive.state.bridge = null;
  assert.deepEqual(await hive.call("/api/show", { name: "seat", image: PNG }), [{ value: { error: "bridge.mjs not found" }, status: 500 }]);
});

test("buzz goes to the phone through the sync door, and shell turns thrown errors into input errors", async () => {
  const hive = seatHarness();
  assert.deepEqual(await hive.call("/api/buzz", { seat: 7, text: 9, where: "elsewhere" }), [{ value: { sent: 1 }, status: 200 }]);
  assert.deepEqual(hive.calls.buzzes, [["7", "9"]]);
  hive.state.buzz = { ok: false, error: "that chat is not travelling to the phone from this machine" };
  assert.deepEqual(await hive.call("/api/buzz"), [{ value: { error: "that chat is not travelling to the phone from this machine" }, status: 409 }]);

  assert.deepEqual(await hive.call("/api/shell", { cwd: "/repo" }), [{ value: { ok: true, name: "terminal" }, status: 200 }]);
  hive.state.shellError = "cannot open";
  assert.deepEqual(await hive.call("/api/shell", { cwd: "/repo" }), [{ value: { error: "cannot open" }, status: 400 }]);
});

test("spawning forget, rename and attach retain cache and file contracts", async () => {
  const hive = seatHarness();
  assert.deepEqual(await hive.call("/api/spawning/forget", { id: "opening" }), [{ value: { ok: true }, status: 200 }]);
  assert.equal(hive.spawning.has("opening"), false);
  assert.equal(hive.state.invalidations, 1);

  assert.deepEqual(await hive.call("/api/rename", { name: "  " }), [{ value: { error: "no seat to rename" }, status: 400 }]);
  assert.deepEqual(await hive.call("/api/rename", { name: " seat ", where: "cloud", title: "New title" }), [{ value: { title: "New title" }, status: 200 }]);
  assert.deepEqual(hive.calls.renamed, [["seat", "cloud", "New title"]]);
  assert.equal(hive.state.invalidations, 2);

  hive.state.save = { files: ["/tmp/a.txt", "/tmp/b.txt"], error: "" };
  assert.deepEqual(await hive.call("/api/attach", { images: ["a", "b"] }), [{ value: { ok: true, paths: ["/tmp/a.txt", "/tmp/b.txt"], path: "/tmp/a.txt" }, status: 200 }]);
  assert.deepEqual(hive.calls.saved.at(-1), [["a", "b"], "mission"]);
  assert.deepEqual(await hive.call("/api/attach", { oversized: true }), [{ value: { error: "that is more than this app carries in one go" }, status: 413 }]);
});

test("screenshot copies cloud files and only types paths when they are not attachments", async () => {
  const hive = seatHarness();
  hive.state.save = { files: ["/tmp/a.png", "/tmp/b.png"], error: "" };
  assert.deepEqual(await hive.call("/api/screenshot", { name: "seat", where: "cloud", images: ["a", "b"] }), [{
    value: { ok: true, paths: ["/workspace/hive/assets/a.png", "/workspace/hive/assets/b.png"], path: "/workspace/hive/assets/a.png" },
    status: 200
  }]);
  assert.deepEqual(hive.calls.reads, ["/tmp/a.png", "/tmp/b.png"]);
  assert.deepEqual(hive.calls.uploads.map(([path]) => path), ["/workspace/hive/assets/a.png", "/workspace/hive/assets/b.png"]);
  assert.deepEqual(hive.calls.typed, [["seat", "cloud", "/workspace/hive/assets/a.png /workspace/hive/assets/b.png"]]);

  hive.calls.typed.length = 0;
  assert.deepEqual(await hive.call("/api/screenshot", { name: "seat", image: "a", attach: true }), [{ value: { ok: true, paths: ["/tmp/a.png", "/tmp/b.png"], path: "/tmp/a.png" }, status: 200 }]);
  assert.deepEqual(hive.calls.typed, []);
  assert.deepEqual(await hive.call("/api/screenshot", { name: "bad", image: "a" }), [{ value: { error: "missing name" }, status: 400 }]);
});

test("a close the server refused reaches the caller, and the fleet keeps the seat", async () => {
  const hive = seatHarness();
  hive.state.kill = { ok: false, error: "the pod hung up" };
  assert.deepEqual(await hive.call("/api/kill", { name: "seat", where: "cloud" }), [{ value: { error: "the pod hung up" }, status: 502 }]);
  assert.deepEqual(hive.calls.killed, [["seat", "cloud"]]);
  assert.deepEqual(hive.calls.forgotten, [], "a seat that did not close was forgotten anyway");
  assert.deepEqual(hive.calls.archiveFixed, []);
  assert.equal(hive.state.invalidations, 0);
});

test("kill, archive, unarchive and archived forgetting preserve lifecycle side effects", async () => {
  const hive = seatHarness();
  assert.deepEqual(await hive.call("/api/kill", { name: "seat", where: "other" }), [{ value: { ok: true }, status: 200 }]);
  assert.deepEqual(hive.calls.killed, [["seat", "other"]]);
  assert.deepEqual(hive.calls.forgotten, [["local", "seat"]]);
  assert.deepEqual(hive.calls.archiveFixed, [["local", "seat"]], "the history keeps a snapshot that predates the close");
  assert.equal(hive.state.invalidations, 1);

  assert.deepEqual(await hive.call("/api/seat/archive", { name: "seat", where: "cloud" }), [{ value: { ok: true, archived: "seat" }, status: 200 }]);
  assert.deepEqual(await hive.call("/api/seat/unarchive", { name: "seat", where: "cloud" }), [{ value: { ok: true, name: "seat-2" }, status: 200 }]);
  assert.deepEqual(hive.calls.archived, [["seat", "cloud"]]);
  assert.deepEqual(hive.calls.revived, [["seat", "cloud"]]);

  assert.deepEqual(await hive.call("/api/seat/forget-archived", { name: "seat", where: "other" }), [{ value: { ok: true }, status: 200 }]);
  assert.equal(hive.archivedSeats.has("local:seat"), false);
  assert.equal(hive.state.archivedWrites, 1);
  assert.equal(hive.state.invalidations, 2);

  hive.state.archiveError = "cannot archive";
  assert.deepEqual(await hive.call("/api/seat/archive", { name: "seat" }), [{ value: { error: "cannot archive" }, status: 400 }]);
});

test("closing a local chat takes its shots folder with it; a cloud chat leaves the pod's alone", async () => {
  const hive = seatHarness();
  await hive.call("/api/kill", { name: "seat", where: "local" });
  assert.deepEqual(hive.calls.shotsForgotten, ["seat"]);
  await hive.call("/api/kill", { name: "far", where: "cloud" });
  assert.deepEqual(hive.calls.shotsForgotten, ["seat"]);
});

test("archiving keeps the shots for the chat that may come back; forgetting the archived chat drops them", async () => {
  const hive = seatHarness();
  await hive.call("/api/seat/archive", { name: "seat", where: "local" });
  assert.deepEqual(hive.calls.shotsForgotten, []);
  await hive.call("/api/seat/forget-archived", { name: "seat", where: "local" });
  assert.deepEqual(hive.calls.shotsForgotten, ["seat"]);
});
