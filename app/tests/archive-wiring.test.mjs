import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { holdsEvery, wordsOf } from "../assets/archive-search.mjs";
import { oneRowPerSession } from "../lib/archive-scan.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function slice(from, to) {
  const a = server.indexOf(from);
  const b = server.indexOf(to);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of server.mjs`);
  return server.slice(a, b);
}

function scanner({ local = [], cloud = "", podIsUp = false, podTakes = 0, held = null } = {}) {
  const body = slice("async function scanLocalHistory(sessions) {", "async function readArchiveFile()");
  const seen = { kept: null, watched: [], asked: 0 };
  const world = {
    HIVE_HOME: "/hive",
    HOME: "/home",
    CLAUDE_PROJECTS: "/home/.claude/projects",
    SESSION_MIRROR: "/home/.claude/cloud-sessions/repo",
    join: (...bits) => bits.join("/"),
    existsSync: () => false,
    oneRowPerSession,
    podUp: async () => { seen.asked += 1; if (podTakes) await new Promise((go) => setTimeout(go, podTakes)); return podIsUp; },
    HIST_SCAN: "",
    onTheServer: async () => ({ ok: !!cloud, out: cloud }),
    parseHistory: (raw, where, into) => { if (raw) into.push({ id: "cloudy", where, at: 2, title: "on the pod" }); },
    parseHiveSessions: () => [],
    readSeatRecords: async () => ({ seatOf: new Map([["one", "minha-missao"]]), rows: [] }),
    scanTranscriptsApart: async ({ onProgress }) => {
      seen.watched.push("started");
      if (onProgress) onProgress({ done: 3, total: 10, read: 3 });
      if (local instanceof Error) throw local;
      return { rows: local, index: { "p/one.jsonl": { m: 1, s: 2 } } };
    }
  };
  const run = new Function(...Object.keys(world), `
    let histIndex = null;
    let histWatch = null;
    let histCache = { data: ${JSON.stringify(held)} };
    ${body}
    return { runHistoryScan, watchOf: () => histWatch, indexOf: () => histIndex };
  `)(...Object.values(world));
  return { ...run, seen };
}

test("the local side is read by a child of this process that dies with the answer, never by shelling out per transcript", () => {
  const body = slice("async function scanLocalHistory(sessions) {", "async function runHistoryScan(");
  assert.match(body, /scanTranscriptsApart\(/, "the local scan must run in a child: read in this process, the 8 MB windows leave ~200 MB behind that V8 never gives back");
  assert.doesNotMatch(body, /scanTranscripts\(/, "the in-process scan is back in the server");
  assert.doesNotMatch(body, /viaBash|HIST_SCAN/, "the local scan is back to spawning a shell per transcript");
  assert.match(slice("async function runHistoryScan(", "async function readArchiveFile()"), /HIST_SCAN/, "the pod still needs the shell scan");
});

test("a local scan hands back its rows, with the seat that holds each one", async () => {
  const hive = scanner({ local: [{ id: "one", at: 5, title: "uma coisa" }] });
  const { sessions } = await hive.runHistoryScan();
  assert.deepEqual(sessions, [{ id: "one", at: 5, title: "uma coisa", where: "local", seat: "minha-missao" }]);
});

test("the index the scan built is kept for the next round", async () => {
  const hive = scanner({ local: [{ id: "one", at: 5, title: "uma coisa" }] });
  await hive.runHistoryScan();
  assert.deepEqual(hive.indexOf(), { "p/one.jsonl": { m: 1, s: 2 } });
});

test("a local scan that breaks keeps the rows already on the shelf instead of emptying the list", async () => {
  const hive = scanner({ local: new Error("disk said no"), held: { sessions: [{ id: "old", where: "local", at: 9, title: "de ontem" }] } });
  const { sessions } = await hive.runHistoryScan();
  assert.deepEqual(sessions.map((row) => row.id), ["old"], "a failed scan must never erase the archive");
});

test("a local scan that breaks while the pod is still being asked leaves no rejection for the server to die of", async () => {
  const stray = [];
  const note = (wrong) => stray.push(wrong);
  process.on("unhandledRejection", note);
  try {
    const hive = scanner({ local: new Error("the scan child left with 0 before answering"), podTakes: 20, held: { sessions: [{ id: "old", where: "local", at: 9, title: "from yesterday" }] } });
    const { sessions } = await hive.runHistoryScan();
    await new Promise((go) => setImmediate(go));
    assert.deepEqual(stray, [], "node kills the server over a rejection nobody was holding");
    assert.deepEqual(sessions.map((row) => row.id), ["old"]);
  } finally {
    process.off("unhandledRejection", note);
  }
});

test("the pod rows come from the shell scan and sit in the same list", async () => {
  const hive = scanner({ local: [{ id: "one", at: 5, title: "uma coisa" }], cloud: "==F==x", podIsUp: true });
  const { sessions } = await hive.runHistoryScan();
  assert.deepEqual(sessions.map((row) => row.where), ["local", "cloud"], "the list is newest first");
});

test("a pod that answers badly keeps the cloud rows already on the shelf", async () => {
  const hive = scanner({ local: [], podIsUp: true, held: { sessions: [{ id: "old", where: "cloud", at: 9, title: "no servidor" }] } });
  const { sessions } = await hive.runHistoryScan();
  assert.deepEqual(sessions.map((row) => row.id), ["old"], "a cut-off pod scan must never erase the cloud half");
});

test("how far the scan has got is written down while it runs, and dropped when it ends", async () => {
  const hive = scanner({ local: [] });
  const running = hive.runHistoryScan();
  await running;
  assert.equal(hive.watchOf(), null, "a finished scan must stop claiming to be running");
});

function searcher(index, erased = []) {
  const body = slice("async function searchArchive(asked) {", "function historyStamp(");
  return new Function("holdsEvery", "wordsOf", "readArchiveIndex", "readErased", "HIVE_HOME", `
    let histIndex = ${JSON.stringify(index)};
    ${body}
    return searchArchive;
  `)(holdsEvery, wordsOf, async () => ({}), () => new Set(erased), "/hive");
}

test("a word only the conversation holds finds the chat, and brings the line it found", async () => {
  const found = await searcher({
    "p/a.jsonl": { row: { id: "a" }, says: ["nada a ver", "aquele bug do webview branco"] },
    "p/b.jsonl": { row: { id: "b" }, says: ["outra coisa"] },
    "p/c.jsonl": { m: 1, s: 2 }
  })("webview");
  assert.deepEqual(found, [{ id: "a", hit: "aquele bug do webview branco" }]);
});

test("a conversation deleted for good is not found again, even when its words are still in the index", async () => {
  const index = { "p/a.jsonl": { row: { id: "a" }, says: ["o webview branco"] }, "p/b.jsonl": { row: { id: "b" }, says: ["webview de novo"] } };
  assert.deepEqual((await searcher(index, ["a"])("webview")).map((one) => one.id), ["b"]);
});

test("every word typed has to appear somewhere in the conversation", async () => {
  const index = { "p/a.jsonl": { row: { id: "a" }, says: ["o webview branco", "no crm"] } };
  assert.equal((await searcher(index)("webview crm")).length, 1);
  assert.equal((await searcher(index)("webview jacaré")).length, 0);
});

test("a short word only counts where a word begins, so it does not match the middle of every line", async () => {
  const index = { "p/a.jsonl": { row: { id: "a" }, says: ["a conversa toda"] }, "p/b.jsonl": { row: { id: "b" }, says: ["dá pra ver isso"] } };
  assert.deepEqual((await searcher(index)("ver")).map((one) => one.id), ["b"]);
});

test("the line shown is the one that holds every word, when one does", async () => {
  const index = { "p/a.jsonl": { row: { id: "a" }, says: ["o webview", "o webview branco no sales"] } };
  assert.equal((await searcher(index)("webview sales"))[0].hit, "o webview branco no sales");
});

test("nothing typed searches nothing", async () => {
  assert.deepEqual(await searcher({ "p/a.jsonl": { row: { id: "a" }, says: ["qualquer coisa"] } })("   "), []);
});

test("a scan that is told not to reach out never asks whether the pod is up", async () => {
  const hive = scanner({ local: [{ id: "one", at: 5, title: "uma coisa" }], podIsUp: true, cloud: "==F==x" });
  const { sessions } = await hive.runHistoryScan({ reachOut: false });
  assert.equal(hive.seen.asked, 0, "opening the panel still pays for a kubectl");
  assert.deepEqual(sessions.map((row) => row.where), ["local"], "a scan that stayed home invented a cloud row");
});

test("a scan that stays home keeps the cloud rows the archive already holds", async () => {
  const hive = scanner({ local: [{ id: "one", at: 5, title: "uma coisa" }], held: { sessions: [{ id: "old", where: "cloud", at: 9, title: "no servidor" }] } });
  const { sessions } = await hive.runHistoryScan({ reachOut: false });
  assert.deepEqual(sessions.map((row) => row.id), ["old", "one"], "staying home emptied the cloud half");
});

test("a scan folds a conversation that both sides report into the side it was last closed", async () => {
  const hive = scanner({ local: [{ id: "cloudy", at: 50, title: "trazida pra ca" }], cloud: "==F==x", podIsUp: true });
  const { sessions } = await hive.runHistoryScan();
  assert.deepEqual(sessions.map((row) => [row.id, row.where]), [["cloudy", "local"]], "one conversation still takes two rows");
});

function eraser({ live = null, archived = null, serverFails = false, localFails = false, where = "cloud" } = {}) {
  const body = slice("async function eraseConversation(rawName, rawWhere) {", "async function carrySessionFile(");
  const seen = { order: [], erased: [], droppedRows: [], saved: 0 };
  const fleet = new Map(live ? [[`${where}:seat`, live]] : []);
  const archivedSeats = new Map(archived ? [[`${where}:seat`, archived]] : []);
  const world = {
    SESSION_ID: /^[0-9a-f-]{36}$/,
    HIVE_HOME: "/hive",
    cache: { at: 1 },
    fleet,
    archivedSeats,
    isSeatName: (name) => !!name,
    seatKey: (where, name) => `${where}:${name}`,
    killSeatWindow: async () => { seen.order.push("kill"); return { ok: true }; },
    forgetSeat: (where, name) => { seen.order.push("forget"); fleet.delete(`${where}:${name}`); },
    saveArchivedSeats: () => { seen.saved += 1; },
    rememberErased: (home, ids) => { seen.erased.push(...ids); },
    dropHistoryRow: (id) => { seen.droppedRows.push(id); },
    eraseOnTheServer: async () => { seen.order.push("server"); if (serverFails) throw new Error("the server would not erase it"); },
    eraseLocally: async () => { seen.order.push("local"); if (localFails) throw new Error("could not delete /p/seat.jsonl"); },
    archiveEntry: (seat, at) => ({ ...seat, archivedAt: at }),
    keepMarks: () => {}
  };
  const run = new Function(...Object.keys(world), `${body}\nreturn eraseConversation;`)(...Object.values(world));
  return { run, seen, fleet, archivedSeats };
}

const CLOUD_ID = "11111111-1111-4111-8111-111111111111";

test("a cloud conversation the server would not erase stays archived, in the history and off the tombstone, so it can be erased again", async () => {
  const hive = eraser({ archived: { name: "seat", where: "cloud", id: CLOUD_ID }, serverFails: true });
  await assert.rejects(hive.run("seat", "cloud"), /would not erase it/);
  assert.ok(hive.archivedSeats.has("cloud:seat"), "the archived chat must stay to be erased again");
  assert.deepEqual(hive.seen.erased, []);
  assert.deepEqual(hive.seen.droppedRows, []);
  assert.equal(hive.seen.saved, 0);
});

test("a live cloud chat closes, the server erases it, and only then this app forgets it; if the server fails, it waits in Archived", async () => {
  const hive = eraser({ live: { name: "seat", where: "cloud", id: CLOUD_ID } });
  assert.deepEqual(await hive.run("seat", "cloud"), { ok: true, name: "seat", where: "cloud" });
  assert.deepEqual(hive.seen.order, ["kill", "server", "forget"]);
  assert.deepEqual(hive.seen.erased, [CLOUD_ID]);
  assert.deepEqual(hive.seen.droppedRows, [CLOUD_ID]);
  const failed = eraser({ live: { name: "seat", where: "cloud", id: CLOUD_ID }, serverFails: true });
  await assert.rejects(failed.run("seat", "cloud"));
  assert.deepEqual(failed.seen.order, ["kill", "server", "forget"]);
  assert.ok(!failed.fleet.has("cloud:seat"), "a closed chat must not stay live");
  assert.equal(failed.archivedSeats.get("cloud:seat")?.id, CLOUD_ID, "the closed chat waits in Archived, where it can be erased again");
  assert.deepEqual(failed.seen.erased, []);
  assert.deepEqual(failed.seen.droppedRows, []);
});

const LOCAL_ID = "22222222-2222-4222-8222-222222222222";

test("a local conversation whose files this Mac could not delete stays archived, in the history and off the tombstone, and says which file stayed", async () => {
  const hive = eraser({ where: "local", live: { name: "seat", where: "local", id: LOCAL_ID }, localFails: true });
  await assert.rejects(hive.run("seat", "local"), /could not delete \/p\/seat\.jsonl/);
  assert.deepEqual(hive.seen.order, ["kill", "local", "forget"]);
  assert.ok(!hive.fleet.has("local:seat"));
  assert.equal(hive.archivedSeats.get("local:seat")?.id, LOCAL_ID, "the closed chat waits in Archived, where it can be erased again");
  assert.deepEqual(hive.seen.erased, []);
  assert.deepEqual(hive.seen.droppedRows, []);
  const done = eraser({ where: "local", archived: { name: "seat", where: "local", id: LOCAL_ID } });
  assert.deepEqual(await done.run("seat", "local"), { ok: true, name: "seat", where: "local" });
  assert.deepEqual(done.seen.order, ["local"]);
  assert.deepEqual(done.seen.erased, [LOCAL_ID]);
  assert.ok(!done.archivedSeats.has("local:seat"));
});

test("erasing on this Mac tries every file and names the ones that stayed", async () => {
  const body = slice("async function eraseLocally(name, id, cwd, { byName }) {", "async function eraseConversation(");
  const tried = [];
  const world = {
    anonymousLeftovers: () => ["/tmp/anon-seat"],
    projectSlug: () => "-work",
    readdirSafe: () => ["-work", "-other"],
    CLAUDE_PROJECTS: "/p",
    join: (...parts) => parts.join("/"),
    rm: async (path) => { tried.push(path); if (path.endsWith(".jsonl")) throw new Error("EACCES"); }
  };
  const eraseLocally = new Function(...Object.keys(world), `${body}\nreturn eraseLocally;`)(...Object.values(world));
  await assert.rejects(eraseLocally("seat", LOCAL_ID, "/work", { byName: true }), new RegExp(`could not delete /p/-work/${LOCAL_ID}\\.jsonl and 1 more`));
  assert.deepEqual(tried, ["/tmp/anon-seat", `/p/-work/${LOCAL_ID}.jsonl`, `/p/-work/${LOCAL_ID}`, `/p/-other/${LOCAL_ID}.jsonl`, `/p/-other/${LOCAL_ID}`]);
});
