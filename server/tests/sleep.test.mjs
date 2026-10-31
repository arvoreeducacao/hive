import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sleepVerdict, sleepAfterMs, SLEEP_AFTER_MS, SLEEP_UNWATCHED_MS, rebornArgs, rebornScript, canBeReborn, childrenGone } from "../sleep.mjs";

const base = {
  now: 100000,
  lastActivity: 0,
  afterMs: 1000,
  sessionId: "abc",
};

test("dorme quando passou do tempo e o assento esta quieto", () => {
  const v = sleepVerdict(base);
  assert.equal(v.sleep, true);
  assert.equal(v.idle, 100000);
});

test("nunca dorme no meio de um turno, com fila ou com pergunta aberta", () => {
  for (const estado of [{ busy: true }, { queued: 2 }, { questions: 1 }]) {
    const v = sleepVerdict({ ...base, ...estado });
    assert.equal(v.sleep, false, JSON.stringify(estado));
    assert.equal(v.retry, true, "estado ocupado tem que reagendar, nao desistir");
  }
});

test("nao dorme sem sessao para retomar — dormir seria perder a conversa", () => {
  const v = sleepVerdict({ ...base, sessionId: "" });
  assert.equal(v.sleep, false);
  assert.match(v.why, /sem sessao/);
  assert.notEqual(v.retry, true);
});

test("nao dorme se ainda esta recente, e diz em quanto tempo tentar de novo", () => {
  const v = sleepVerdict({ ...base, lastActivity: 99700 });
  assert.equal(v.sleep, false);
  assert.equal(v.inMs, 700);
  assert.equal(v.retry, true);
});

test("nao dorme duas vezes, nem enquanto o assento esta saindo", () => {
  assert.equal(sleepVerdict({ ...base, sleeping: true }).sleep, false);
  assert.equal(sleepVerdict({ ...base, leaving: true }).sleep, false);
});

test("afterMs zero desliga o sono por completo", () => {
  const v = sleepVerdict({ ...base, afterMs: 0 });
  assert.equal(v.sleep, false);
  assert.equal(v.why, "desligado");
});

test("sleepAfterMs: padrao de 30 min, ajustavel, e lixo cai no padrao", () => {
  assert.equal(sleepAfterMs({}), SLEEP_AFTER_MS);
  assert.equal(SLEEP_AFTER_MS, 1800000);
  assert.equal(sleepAfterMs({ HIVE_SLEEP_AFTER_MS: "5000" }), 5000);
  assert.equal(sleepAfterMs({ HIVE_SLEEP_AFTER_MS: "0" }), 0);
  assert.equal(sleepAfterMs({ HIVE_SLEEP_AFTER_MS: "abacaxi" }), SLEEP_AFTER_MS);
  assert.equal(sleepAfterMs({ HIVE_SLEEP_AFTER_MS: "-3" }), SLEEP_AFTER_MS);
});

test("tarefa em segundo plano conta como ocupado: nao dorme e volta a conferir", () => {
  const v = sleepVerdict({ ...base, tasks: 1 });
  assert.equal(v.sleep, false);
  assert.equal(v.retry, true);
  assert.match(v.why, /segundo plano/);
  assert.equal(sleepVerdict({ ...base, tasks: 0 }).sleep, true);
});

test("sleepAfterMs: 30 min com o chat na tela, 15 min fora dela, cada um com seu ajuste", () => {
  assert.equal(SLEEP_UNWATCHED_MS, 900000);
  assert.equal(sleepAfterMs({}, { watched: true }), SLEEP_AFTER_MS);
  assert.equal(sleepAfterMs({}, { watched: false }), SLEEP_UNWATCHED_MS);
  assert.equal(sleepAfterMs({ HIVE_SLEEP_AFTER_MS: "5000" }, { watched: false }), 5000, "o ajuste geral vale para os dois");
  assert.equal(sleepAfterMs({ HIVE_SLEEP_AFTER_MS: "5000", HIVE_SLEEP_UNWATCHED_MS: "2000" }, { watched: false }), 2000);
  assert.equal(sleepAfterMs({ HIVE_SLEEP_AFTER_MS: "5000", HIVE_SLEEP_UNWATCHED_MS: "2000" }, { watched: true }), 5000);
  assert.equal(sleepAfterMs({ HIVE_SLEEP_UNWATCHED_MS: "abacaxi" }, { watched: false }), SLEEP_UNWATCHED_MS);
  assert.equal(sleepAfterMs({ HIVE_SLEEP_AFTER_MS: "0" }, { watched: false }), 0, "zero desliga o sono nos dois casos");
});

test("a rebirth drops the mission and the old ids from the command line, and carries the session to resume and --asleep", () => {
  const argv = ["/x/driver.mjs", "--name", "seat", "--prompt-file", "/p/seat.md", "--session-id", "old", "--cwd", "/w", "--asleep", "--resume-id", "older"];
  assert.deepEqual(rebornArgs(argv, "abc"), ["/x/driver.mjs", "--name", "seat", "--cwd", "/w", "--resume-id", "abc", "--asleep"]);
});

test("a rebirth can run another copy of the driver with the same command line", () => {
  const argv = ["/old/driver.mjs", "--name", "seat", "--resume-id", "older"];
  assert.deepEqual(rebornArgs(argv, "abc", "/new/driver.mjs"), ["/new/driver.mjs", "--name", "seat", "--resume-id", "abc", "--asleep"]);
});

function installedHive({ tag = "hive-2026.10.30-new", print = "shell1", liveDriver = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "hive-reborn-"));
  const shipped = join(root, "Resources", "app");
  mkdirSync(shipped, { recursive: true });
  writeFileSync(join(shipped, "build.json"), JSON.stringify({ shell: "shell1" }));
  const bundleEngine = join(root, "Resources", "server", "engine");
  mkdirSync(bundleEngine, { recursive: true });
  writeFileSync(join(bundleEngine, "driver.mjs"), "");
  const home = join(root, "home");
  const build = (dir) => {
    mkdirSync(join(home, "js", dir, "server", "engine"), { recursive: true });
    mkdirSync(join(home, "js", dir, "server", "peer"), { recursive: true });
    writeFileSync(join(home, "js", dir, "server", "peer", "peer-mcp.mjs"), "");
    if (dir !== "hive-2026_10_30-new" || liveDriver) writeFileSync(join(home, "js", dir, "server", "engine", "driver.mjs"), "");
    return join(home, "js", dir, "server", "engine", "driver.mjs");
  };
  const old = build("hive-2026_10_28-old");
  const fresh = build("hive-2026_10_30-new");
  writeFileSync(join(home, "js", "current.json"), JSON.stringify(tag ? { tag, print } : { rejected: "x" }));
  return { root, home, shipped, old, fresh, bundled: join(bundleEngine, "driver.mjs") };
}

test("a seat born on an older update wakes up on the engine the app runs now", () => {
  const it = installedHive();
  try {
    assert.equal(rebornScript(it.old, { home: it.home, shipped: it.shipped }), it.fresh);
    assert.equal(rebornScript(it.fresh, { home: it.home, shipped: it.shipped }), it.fresh);
    assert.equal(rebornScript(it.bundled, { home: it.home, shipped: it.shipped }), it.fresh, "a seat born on the bundle moves up to the update too");
  } finally {
    rmSync(it.root, { recursive: true, force: true });
  }
});

test("with no update the app can run, a seat wakes up on the bundle that shipped", () => {
  for (const it of [installedHive({ tag: "" }), installedHive({ print: "another-shell" })]) {
    try {
      assert.equal(rebornScript(it.old, { home: it.home, shipped: it.shipped }), it.bundled);
    } finally {
      rmSync(it.root, { recursive: true, force: true });
    }
  }
});

test("a seat keeps its engine when the new one has no driver, or when it was not started by the app", () => {
  const it = installedHive({ liveDriver: false });
  try {
    assert.equal(rebornScript(it.old, { home: it.home, shipped: it.shipped }), it.old, "a missing file must never be handed to execve");
    assert.equal(rebornScript("/work/hive/server/engine/driver.mjs", { home: it.home, shipped: it.shipped }), "/work/hive/server/engine/driver.mjs", "a dev seat from a worktree must not jump into the installed app");
    assert.equal(rebornScript(it.old, {}), it.old);
  } finally {
    rmSync(it.root, { recursive: true, force: true });
  }
});

test("a seat is reborn only when node has execve, off windows, with a session to resume and HIVE_SLEEP_REBIRTH not 0", () => {
  const node = { execve: () => {}, platform: "darwin" };
  assert.equal(canBeReborn(node, {}, "abc"), true);
  assert.equal(canBeReborn(node, { HIVE_SLEEP_REBIRTH: "0" }, "abc"), false);
  assert.equal(canBeReborn({ platform: "darwin" }, {}, "abc"), false);
  assert.equal(canBeReborn({ execve: () => {}, platform: "win32" }, {}, "abc"), false);
  assert.equal(canBeReborn(node, {}, ""), false);
});

test("before a rebirth the driver waits for its children to leave, and gives up at the deadline", async () => {
  let rounds = 0;
  const list = async () => (rounds++ < 2 ? ["123"] : []);
  const waits = [];
  const wait = async (ms) => { waits.push(ms); };
  assert.equal(await childrenGone({ pid: 1, graceMs: 10000, list, wait, now: () => 0 }), true);
  assert.deepEqual(waits, [250, 250]);
  let clock = 0;
  const never = async () => ["123"];
  assert.equal(await childrenGone({ pid: 1, graceMs: 1000, list: never, wait: async () => { clock += 600; }, now: () => clock }), false);
});
