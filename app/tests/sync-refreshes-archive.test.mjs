import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = readFileSync(join(HERE, "server.mjs"), "utf8");
const CLIENT = readFileSync(join(HERE, "src/app/history.js"), "utf8");

function cut(text, name, kind = "async function") {
  const at = text.indexOf(`${kind} ${name}(`);
  assert.ok(at > 0, `${name} is gone`);
  return text.slice(at, text.indexOf("\n}", at) + 2);
}

function sync({ localOk = true, podReachable = true } = {}) {
  const histCache = { at: Date.now(), data: { sessions: [] }, running: null };
  const call = new Function(
    "histCache", "syncEngine", "existsSync", "localSyncState", "shr", "viaBash", "CLOUD", "podUp", "onTheServer", "HUB_FOLDER",
    `${cut(SERVER, "runSessionSync")}\nreturn runSessionSync;`
  );
  const run = call(
    histCache,
    () => "/sync-engine",
    () => true,
    () => ({ repo: "ada/claude-sessions" }),
    async () => ({ ok: localOk, out: "", error: "no remote named origin" }),
    (...argv) => argv,
    "cloud",
    async () => podReachable,
    async () => ({ ok: true, out: "" }),
    "hub"
  );
  return { histCache, run };
}

/* the archive's clock is expired by whoever closes a seat and by this button, but
   expiring it starts no scan: only a read does. A sync that failed used to throw
   before even reaching the clock, so the button meant to rebuild the list left it
   showing the same stale snapshot that sent the person to press it. */
test("a sync that worked expires the archive", async () => {
  const { histCache, run } = sync();
  await run();
  assert.equal(histCache.at, 0, "the archive still counts as fresh after a sync");
});

test("a sync that failed expires the archive too — the ask to see the list again is good either way", async () => {
  const { histCache, run } = sync({ localOk: false });
  await assert.rejects(run(), /sync on this machine failed/);
  assert.equal(histCache.at, 0, "a failed sync left the panel showing yesterday");
});

test("an asleep pod does not stop the archive from being expired", async () => {
  const { histCache, run } = sync({ podReachable: false });
  const said = await run();
  assert.equal(said.cloud, "server asleep");
  assert.equal(histCache.at, 0);
});

test("the sync button asks the archive for a scan, not for the snapshot", () => {
  const body = cut(CLIENT, "forceSync");
  assert.match(body, /pullHistory\(true, true\)/, "the button refreshes from the cache it just invalidated");
  assert.match(body, /await pullHistory/, "the button stops before the list it promised to rebuild");
  assert.doesNotMatch(body, /catch\s*\{\s*\}/, "a sync that failed still looks exactly like one that worked");
  assert.match(body, /histSyncBusy/, "the button can be pressed again while the first press is still running");
});

test("a fresh read reaches the fetch as a query the route reads", () => {
  const body = cut(CLIENT, "pullHistory", "function");
  assert.match(body, /"\/api\/archive\?fresh=1"/, "nothing in the client ever asks for a fresh scan");
  const routes = readFileSync(join(HERE, "routes/archive.mjs"), "utf8");
  assert.match(routes, /fresh: url\.searchParams\.get\("fresh"\) === "1"/, "the route drops the ask on the floor");
});

/* a fresh read is answered only when the scan is done, so it is the one read that
   must not be handed the snapshot with a stale flag on it. */
test("a fresh scan is waited for, never answered from the snapshot", () => {
  const body = cut(SERVER, "scanHistory");
  assert.match(body, /const showingOld = !fresh && !!histCache\.data/, "a fresh read is still answered with the old snapshot");
  assert.match(body, /if \(!fresh && histCache\.data && Date\.now\(\) - histCache\.at < 60000\)/, "a fresh read still stops at the minute's cache");
});
