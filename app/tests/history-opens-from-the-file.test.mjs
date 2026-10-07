import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function cut(name, kind = "async function") {
  const at = server.indexOf(`${kind} ${name}(`);
  assert.ok(at > 0, `${name} is gone`);
  return server.slice(at, server.indexOf("\n}", at) + 2);
}

test("bringing a chat down says so on the spot, before anything scans", () => {
  const body = cut("bringLocal");
  const stamp = body.indexOf('historyStamp(id, "local"');
  const revive = body.indexOf("reviveSession(");
  assert.ok(stamp > 0, "a chat brought down waits for a scan to stop calling itself cloud");
  assert.ok(stamp < revive, "the row is only stamped after the seat is already open");
});

function podHistFresh() {
  const found = /const POD_HIST_FRESH = (\d+)/.exec(server);
  assert.ok(found, "the archive no longer says how long a pod answer is good for");
  return Number(found[1]);
}

function reading({ held = { sessions: [] }, onDisk = { sessions: [] }, askedAt = 0, at = 0 } = {}) {
  const seen = [];
  const world = {
    histCache: { at, data: held, running: null },
    readArchiveFile: async () => onDisk,
    readArchiveIndex: async () => ({}),
    decorateHistory: (data) => data,
    keepArchive: async () => {},
    histWatch: null,
    runHistoryScan: async (asked) => { seen.push(asked); return { sessions: [] }; }
  };
  const run = new Function(...Object.keys(world), `
    const POD_HIST_FRESH = ${podHistFresh()};
    let histIndex = {};
    let podHistAt = ${askedAt};
    ${cut("scanHistory")}
    return scanHistory;
  `)(...Object.values(world));
  return { run, seen };
}

test("opening the panel scans this machine and leaves the pod alone", async () => {
  const hive = reading({ held: { sessions: [{ id: "one", where: "local", at: 1 }] }, askedAt: Date.now() });
  await hive.run({});
  assert.deepEqual(hive.seen, [{ reachOut: false }], "opening the panel still waits on the network");
});

test("the sync button always reaches out — rebuilding the list is what it promises", async () => {
  const hive = reading({ held: { sessions: [{ id: "one", where: "local", at: 1 }] }, askedAt: Date.now() });
  await hive.run({ fresh: true });
  assert.deepEqual(hive.seen, [{ reachOut: true }]);
});

test("a machine with no archive yet has to ask the pod, or its cloud half stays empty forever", async () => {
  const hive = reading({ held: null, onDisk: null, askedAt: Date.now() });
  await hive.run({});
  assert.deepEqual(hive.seen, [{ reachOut: true }]);
});

test("a pod nobody has asked in a long while is asked again", async () => {
  const hive = reading({ held: { sessions: [{ id: "one", where: "local", at: 1 }] }, askedAt: Date.now() - 3600000 });
  await hive.run({});
  assert.deepEqual(hive.seen, [{ reachOut: true }]);
});

test("a list read twice inside the minute is answered from the snapshot, with no scan at all", async () => {
  const hive = reading({ held: { sessions: [{ id: "one", where: "local", at: 1 }] }, at: Date.now(), askedAt: Date.now() });
  await hive.run({});
  assert.deepEqual(hive.seen, []);
});

test("a stamp written before the first scan never blanks the search index on disk", () => {
  const body = cut("keepArchive");
  assert.match(body, /if \(histIndex\) await writeFile\(ARCHIVE_INDEX_FILE/, "closing a seat at boot writes an empty index over the real one");
});

test("the archive is read once at boot, so the first panel to open is already answered", () => {
  const at = server.indexOf("scanHistory({}).catch(() => {});");
  const ticking = server.indexOf("setInterval(() => { scanHistory({}).catch(() => {}); }");
  assert.ok(at > 0 && at < ticking, "nothing reads the archive until five minutes after the hive starts");
});

test("the list is fetched at boot, so the first open has something to paint", () => {
  const boot = readFileSync(join(HERE, "src/app/boot.js"), "utf8");
  assert.match(boot, /pullHistory\(true\);/, "nothing fetches the archive until somebody opens the panel");
  assert.ok(boot.indexOf("bootSolid();") < boot.indexOf("pullHistory(true);"), "the fetch lands before the panel exists to paint it");
});

test("the window only says it is reading when it holds no rows at all", () => {
  const client = readFileSync(join(HERE, "src/app/history.js"), "utf8");
  assert.match(client, /st\.histLoading = !st\.histSessions\.length;/, "opening the window blanks the list it already had");
});
