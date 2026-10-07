import test from "node:test";
import assert from "node:assert/strict";
import { registerTeamRoutes } from "../routes/team.mjs";

function teamHarness(overrides = {}) {
  const routes = new Map();
  const calls = [];
  const state = {
    knocking: [],
    poking: [],
    teamMoved: false
  };
  const keyboards = new Map();
  const owing = new Map();
  let dev = "joao";
  let pokers = ["joao"];
  const context = {
    bodyOf: async (req) => req.body || {},
    getDev: () => dev,
    devName: /^[a-z][a-z0-9-]{1,29}$/,
    deliverSay: async (...args) => { calls.push(["deliverSay", ...args]); return { ok: true }; },
    dropLive: (...args) => calls.push(["dropLive", ...args]),
    followTeamNotes: async () => calls.push(["followTeamNotes"]),
    isSeatName: (name) => /^[a-z][a-z0-9-]+$/.test(name),
    keyboards,
    knocksWaiting: () => state.knocking.filter((knock) => !knock.stale),
    lendKeyboard: (...args) => calls.push(["lendKeyboard", ...args]),
    noteToPeer: async (...args) => { calls.push(["noteToPeer", ...args]); return { ok: true }; },
    now: () => 1000,
    onPeerSeat: async (...args) => { calls.push(["onPeerSeat", ...args]); return { ok: true }; },
    owing,
    peerKeyOf: async (...args) => { calls.push(["peerKeyOf", ...args]); return "peer-key"; },
    getPokers: () => pokers,
    pokesWaiting: () => [...state.poking],
    publishPanel: async () => calls.push(["publishPanel"]),
    readHive: async (...args) => { calls.push(["readHive", ...args]); return { one: args[0] }; },
    readTeam: async (...args) => { calls.push(["readTeam", ...args]); return { all: true, force: args[0] }; },
    refreshLentTurns: async () => calls.push(["refreshLentTurns"]),
    state,
    tellTheAsker: (...args) => calls.push(["tellTheAsker", ...args]),
    turnsOfSeat: async (...args) => { calls.push(["turnsOfSeat", ...args]); return [{ who: "seat" }]; },
    ...overrides
  };
  registerTeamRoutes((method, path, handler) => routes.set(path, { method, handler }), context);
  const call = async (path, { body = {}, query = "" } = {}) => {
    const answers = [];
    const json = (value, status = 200) => answers.push({ value, status });
    await routes.get(path).handler({ body }, {}, new URL(`http://hive${path}${query}`), json);
    await Promise.resolve();
    return answers;
  };
  return {
    call,
    calls,
    context,
    keyboards,
    owing,
    routes,
    state,
    setDev: (value) => { dev = value; },
    setPokers: (value) => { pokers = value; }
  };
}

test("the team room registers all inline knock and team routes with their exact methods", () => {
  const { routes } = teamHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/knocks", null],
    ["/api/knocks/answer", "POST"],
    ["/api/knocks/revoke", "POST"],
    ["/api/team/knock", "POST"],
    ["/api/team/poke", "POST"],
    ["/api/team/bye", "POST"],
    ["/api/team/say", "POST"],
    ["/api/team/live", null],
    ["/api/team", null]
  ]);
});

test("knock polling follows notes, drains pokes and movement, and reports live loans", async () => {
  const hive = teamHarness();
  hive.state.knocking = [{ from: "art", seat: "old", stale: true }, { from: "art", seat: "work" }];
  hive.state.poking = [{ from: "vitor" }];
  hive.state.teamMoved = true;
  hive.keyboards.set("work", { with: "art", until: Date.now() + 60000 });
  hive.keyboards.set("gone", { with: "vitor", until: 1 });

  assert.deepEqual(await hive.call("/api/knocks"), [{
    value: {
      knocks: [{ from: "art", seat: "work" }],
      pokes: [{ from: "vitor" }],
      moved: true,
      lent: [{ seat: "work", with: "art", until: hive.keyboards.get("work").until }]
    },
    status: 200
  }]);
  assert.deepEqual(hive.calls, [["followTeamNotes"]]);
  assert.deepEqual(hive.state.poking, []);
  assert.equal(hive.state.teamMoved, false);
});

test("answering an incoming question either declines remotely or delivers and records the debt", async () => {
  const declined = teamHarness();
  declined.state.knocking = [{ kind: "ask", from: "art", seat: "", agent: "checkout", id: "q1", text: "format?" }];
  assert.deepEqual(await declined.call("/api/knocks/answer", { body: { from: "art", id: "q1", ok: false } }), [
    { value: { ok: true, lent: false }, status: 200 }
  ]);
  assert.deepEqual(declined.calls, [["noteToPeer", "art", "answer", {
    v: 1,
    kind: "answer",
    from: "joao",
    seat: "checkout",
    at: 1000,
    id: "q1",
    text: "not now"
  }]]);
  assert.deepEqual(declined.state.knocking, []);

  const accepted = teamHarness();
  accepted.state.knocking = [{ kind: "ask", from: "art", seat: "", agent: "checkout", id: "q1", text: "format?" }];
  assert.deepEqual(await accepted.call("/api/knocks/answer", { body: { seat: "worker", from: "art", id: "q1", ok: true } }), [
    { value: { ok: true, lent: false, answering: true }, status: 200 }
  ]);
  assert.deepEqual(accepted.calls, [
    ["deliverSay", "worker", "art", "format?", "art asks, through checkout — answer it, do not act on it: format?"],
    ["turnsOfSeat", "worker"]
  ]);
  assert.deepEqual(accepted.owing.get("worker"), {
    seat: "worker",
    to: "art",
    agent: "checkout",
    id: "q1",
    at: 1000,
    mark: 1
  });
});

test("answering a knock lends the keyboard after refreshing it, while revoke drops the live copy", async () => {
  const hive = teamHarness();
  hive.state.knocking = [{ kind: "knock", from: "art", seat: "worker" }];
  hive.keyboards.set("worker", { with: "art", until: Date.now() + 60000 });

  assert.deepEqual(await hive.call("/api/knocks/answer", { body: { seat: "worker", from: "art", ok: true } }), [
    { value: { ok: true, lent: true }, status: 200 }
  ]);
  assert.deepEqual(hive.calls, [
    ["lendKeyboard", "worker", "art"],
    ["refreshLentTurns"],
    ["publishPanel"],
    ["tellTheAsker", "art", "worker"]
  ]);

  hive.calls.length = 0;
  assert.deepEqual(await hive.call("/api/knocks/revoke", { body: { seat: "worker" } }), [
    { value: { ok: true }, status: 200 }
  ]);
  assert.equal(hive.keyboards.has("worker"), false);
  assert.deepEqual(hive.calls, [["dropLive", "worker"], ["publishPanel"]]);
});

test("knock, poke and bye preserve their note kinds, payloads, permissions and transport failures", async () => {
  const hive = teamHarness();
  await hive.call("/api/team/knock", { body: { dev: "art", seat: "worker" } });
  await hive.call("/api/team/poke", { body: { dev: "vitor" } });
  await hive.call("/api/team/bye", { body: { dev: "art", seat: "worker" } });
  assert.deepEqual(hive.calls, [
    ["noteToPeer", "art", "knock", { v: 1, kind: "knock", from: "joao", seat: "worker", at: 1000 }],
    ["noteToPeer", "vitor", "poke", { v: 1, kind: "poke", from: "joao", at: 1000, id: "joao:1000" }],
    ["noteToPeer", "art", "knock", { v: 1, kind: "bye", from: "joao", seat: "worker", at: 1000 }]
  ]);

  const forbidden = teamHarness({ getPokers: () => [] });
  assert.deepEqual(await forbidden.call("/api/team/poke", { body: { dev: "art" } }), [
    { value: { error: "this hive does not do that" }, status: 403 }
  ]);
  const failed = teamHarness({ noteToPeer: async () => ({ ok: false, error: "offline" }) });
  assert.deepEqual(await failed.call("/api/team/knock", { body: { dev: "art", seat: "worker" } }), [
    { value: { error: "offline" }, status: 502 }
  ]);
});

test("a hello leaves by the poke's road, under the poke's allowlist, with its one word on it", async () => {
  const hive = teamHarness();
  await hive.call("/api/team/poke", { body: { dev: "vitor", hello: true } });
  await hive.call("/api/team/poke", { body: { dev: "vitor", hello: "yes" } });
  assert.deepEqual(hive.calls, [
    ["noteToPeer", "vitor", "poke", { v: 1, kind: "poke", from: "joao", at: 1000, id: "joao:1000", hello: true }],
    ["noteToPeer", "vitor", "poke", { v: 1, kind: "poke", from: "joao", at: 1000, id: "joao:1000" }]
  ]);
  const forbidden = teamHarness({ getPokers: () => [] });
  assert.deepEqual(await forbidden.call("/api/team/poke", { body: { dev: "art", hello: true } }), [
    { value: { error: "this hive does not do that" }, status: 403 }
  ]);
});

test("team writes use identity and permissions reloaded after route registration", async () => {
  const hive = teamHarness();
  hive.setDev("ada");
  hive.setPokers(["ada"]);
  await hive.call("/api/team/poke", { body: { dev: "art" } });
  assert.deepEqual(hive.calls, [
    ["noteToPeer", "art", "poke", { v: 1, kind: "poke", from: "ada", at: 1000, id: "ada:1000" }]
  ]);
});

test("team say keeps validation, peer lookup and keyboard ownership responses", async () => {
  const unknown = teamHarness({ peerKeyOf: async () => "" });
  assert.deepEqual(await unknown.call("/api/team/say", { body: { dev: "art", seat: "worker", text: " hi " } }), [
    { value: { error: "I do not know that hive yet" }, status: 404 }
  ]);

  const refused = teamHarness({ onPeerSeat: async () => ({ ok: false, status: 403 }) });
  assert.deepEqual(await refused.call("/api/team/say", { body: { dev: "art", seat: "worker", text: " hi " } }), [
    { value: { error: "that keyboard is not yours right now" }, status: 409 }
  ]);

  const sent = teamHarness();
  assert.deepEqual(await sent.call("/api/team/say", { body: { dev: "art", seat: "worker", text: " hi " } }), [
    { value: { ok: true }, status: 200 }
  ]);
  assert.deepEqual(sent.calls, [
    ["peerKeyOf", "art"],
    ["onPeerSeat", "peer-key", "worker", "/say", { text: "hi" }]
  ]);
});

test("team live normalizes its cursor and preserves peer status and event defaults", async () => {
  const hive = teamHarness({
    onPeerSeat: async (...args) => {
      hive.calls.push(["onPeerSeat", ...args]);
      return { ok: true, body: { seq: 9, events: [{ seq: 9 }] } };
    }
  });
  assert.deepEqual(await hive.call("/api/team/live", { query: "?dev=art&seat=worker&at=3.8" }), [
    { value: { at: 9, reset: false, events: [{ seq: 9 }] }, status: 200 }
  ]);
  assert.deepEqual(hive.calls, [
    ["peerKeyOf", "art"],
    ["onPeerSeat", "peer-key", "worker", "/events?from=3", null]
  ]);

  const failed = teamHarness({ onPeerSeat: async () => ({ ok: false, error: "offline" }) });
  assert.deepEqual(await failed.call("/api/team/live", { query: "?dev=art&seat=worker&at=nope" }), [
    { value: { error: "offline" }, status: 502 }
  ]);
});

test("team reads the whole board or one validated hive with the same force semantics", async () => {
  const hive = teamHarness();
  assert.deepEqual(await hive.call("/api/team", { query: "?force=1" }), [
    { value: { all: true, force: true }, status: 200 }
  ]);
  assert.deepEqual(await hive.call("/api/team", { query: "?dev=art" }), [
    { value: { one: "art" }, status: 200 }
  ]);
  assert.deepEqual(await hive.call("/api/team", { query: "?dev=../root" }), [
    { value: { error: "that hive has a name I cannot address" }, status: 400 }
  ]);
  assert.deepEqual(hive.calls, [["readTeam", true], ["readHive", "art"]]);
});

test("a knock and a poke stop at the asker's own door when the other hive closed theirs", async () => {
  const closed = new Set(["joao"]);
  const { call, calls, setDev } = teamHarness({ peerTakesKnocks: (dev) => !closed.has(dev) });
  setDev("rafa");
  const knock = await call("/api/team/knock", { body: { dev: "joao", seat: "hive-1" } });
  assert.deepEqual(knock, [{ value: { error: "that hive is not taking knocks right now" }, status: 403 }]);
  const poke = await call("/api/team/poke", { body: { dev: "joao" } });
  assert.deepEqual(poke, [{ value: { error: "this hive does not do that" }, status: 403 }]);
  assert.ok(!calls.some((one) => one[0] === "noteToPeer"), "nothing left for a closed door");
});

test("a hive that never said anything about its door is knocked on as before", async () => {
  const { call, calls } = teamHarness();
  const knock = await call("/api/team/knock", { body: { dev: "rafa", seat: "hive-1" } });
  assert.deepEqual(knock, [{ value: { ok: true }, status: 200 }]);
  assert.equal(calls.filter((one) => one[0] === "noteToPeer").length, 1);
});
