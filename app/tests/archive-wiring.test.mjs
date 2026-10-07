import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { foldText, wordsOf } from "../assets/archive-search.mjs";
import { oneRowPerSession } from "../lib/archive-scan.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function slice(from, to) {
  const a = server.indexOf(from);
  const b = server.indexOf(to);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of server.mjs`);
  return server.slice(a, b);
}

function scanner({ local = [], cloud = "", podIsUp = false, held = null } = {}) {
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
    podUp: async () => { seen.asked += 1; return podIsUp; },
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

function searcher(index) {
  const body = slice("async function searchArchive(asked) {", "function historyStamp(");
  return new Function("foldText", "wordsOf", "readArchiveIndex", `
    let histIndex = ${JSON.stringify(index)};
    ${body}
    return searchArchive;
  `)(foldText, wordsOf, async () => ({}));
}

test("a word only the conversation holds finds the chat, and brings the line it found", async () => {
  const found = await searcher({
    "p/a.jsonl": { row: { id: "a" }, says: ["nada a ver", "aquele bug do webview branco"] },
    "p/b.jsonl": { row: { id: "b" }, says: ["outra coisa"] },
    "p/c.jsonl": { m: 1, s: 2 }
  })("webview");
  assert.deepEqual(found, [{ id: "a", hit: "aquele bug do webview branco" }]);
});

test("every word typed has to appear somewhere in the conversation", async () => {
  const index = { "p/a.jsonl": { row: { id: "a" }, says: ["o webview branco", "no crm"] } };
  assert.equal((await searcher(index)("webview crm")).length, 1);
  assert.equal((await searcher(index)("webview jacaré")).length, 0);
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
