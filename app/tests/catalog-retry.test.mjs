import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();

const { CATALOG_RETRY_CAP, CATALOG_RETRY_STEP, CATALOG_TRIES, refreshCatalog } = await app("chat-and-panes");
const { getStructured } = await app("chat-stretches");
const { structPool } = await app("structured-seats");

let seq = 0;

function bench(answers) {
  const asked = [];
  const repainted = [];
  const e = getStructured({ name: `catalog-${++seq}`, where: "local" });
  document.body.appendChild(e.host);
  e.menu = { repaint: () => repainted.push(true) };
  e.ws = {
    readyState: 1,
    send: (text) => {
      const said = JSON.parse(text);
      asked.push(said.op);
      const answer = answers.shift() ?? { ok: false, error: "nothing left to say" };
      const waiting = e.pending.get(said.cid);
      e.pending.delete(said.cid);
      waiting?.(answer);
    }
  };
  return {
    seat: e,
    asked,
    repainted,
    unplug: () => e.host.remove(),
    shut: () => { e.host.remove(); structPool.delete(e.name); }
  };
}

const CATALOG = [{ value: "opus[1m]", label: "Opus (1M context)" }];

const DEAF = { ok: false, error: "that session is not listening" };

const clock = () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  return {
    tick: async (ms) => { mock.timers.tick(ms); await Promise.resolve(); },
    stop: () => mock.timers.reset()
  };
};

test("a catalogue that failed once is dialled again the next time it is wanted", async () => {
  const b = bench([{ ok: false, error: "the session blew up" }, { ok: true, data: { models: CATALOG } }]);
  await refreshCatalog(b.seat);
  assert.equal(b.seat.catalog, null);
  assert.equal(b.seat.catalogError, "the session blew up");
  await refreshCatalog(b.seat);
  assert.deepEqual(b.seat.catalog, CATALOG, "the failed attempt was handed back instead of asking again — the picker dies with the seat");
  assert.deepEqual(b.asked, ["catalog", "catalog"]);
  b.shut();
});

test("a driver that has not finished booting is not an error on screen", async () => {
  const time = clock();
  const b = bench([{ ok: false, error: "that session is not listening" }]);
  await refreshCatalog(b.seat);
  assert.equal(b.seat.catalogError, "", "a seat still coming up is not a seat without a picker");
  await time.tick(CATALOG_RETRY_STEP);
  assert.deepEqual(b.asked, ["catalog", "catalog"], "it knocks again on its own, so the picker does not wait forever");
  time.stop();
  b.shut();
});

test("a window that blinked is waited out the same way", async () => {
  const time = clock();
  const b = bench([{ ok: false, error: "not connected to the driver" }]);
  await refreshCatalog(b.seat);
  assert.equal(b.seat.catalogError, "");
  await time.tick(CATALOG_RETRY_STEP);
  assert.equal(b.asked.length, 2);
  time.stop();
  b.shut();
});

test("the knock that comes back finds the catalogue", async () => {
  const time = clock();
  const b = bench([DEAF, { ok: true, data: { models: CATALOG } }]);
  await refreshCatalog(b.seat);
  await time.tick(CATALOG_RETRY_STEP);
  assert.deepEqual(b.seat.catalog, CATALOG);
  assert.equal(b.seat.catalogTries, 0, "the count has to go back to zero, or the next bad moment starts near the cap");
  time.stop();
  b.shut();
});

test("the knocking backs off instead of hammering the same seat", async () => {
  const time = clock();
  const b = bench([DEAF, DEAF, DEAF]);
  await refreshCatalog(b.seat);
  await time.tick(CATALOG_RETRY_STEP - 1);
  assert.equal(b.asked.length, 1, "the first knock waits its full step");
  await time.tick(1);
  assert.equal(b.asked.length, 2);
  await time.tick(2 * CATALOG_RETRY_STEP - 1);
  assert.equal(b.asked.length, 2, "the second wait is twice as long");
  await time.tick(1);
  assert.equal(b.asked.length, 3);
  await time.tick(3 * CATALOG_RETRY_STEP - 1);
  assert.equal(b.asked.length, 3, "and the third longer still");
  time.stop();
  b.shut();
});

test("enough quiet knocks and the seat finally gets told", async () => {
  const time = clock();
  const b = bench(Array.from({ length: 30 }, () => DEAF));
  await refreshCatalog(b.seat);
  for (let at = 0; at < CATALOG_TRIES + 2; at += 1) await time.tick(CATALOG_RETRY_CAP);
  assert.equal(b.seat.catalogError, DEAF.error, "knocking forever leaves the person staring at a spinner with nothing said");
  assert.equal(b.asked.length, CATALOG_TRIES + 1, "the last try should not arm yet another timer");
  time.stop();
  b.shut();
});

test("a seat view that is gone stops the knocking", async () => {
  const time = clock();
  const b = bench([DEAF]);
  await refreshCatalog(b.seat);
  b.unplug();
  await time.tick(CATALOG_RETRY_CAP);
  assert.deepEqual(b.asked, ["catalog"], "a closed seat kept dialling its dead driver on a timer nobody cancels");
  time.stop();
  b.shut();
});

test("a picker left waiting is repainted when the catalogue lands", async () => {
  const time = clock();
  const b = bench([DEAF, { ok: true, data: { models: CATALOG } }]);
  await refreshCatalog(b.seat);
  const before = b.repainted.length;
  await time.tick(CATALOG_RETRY_STEP);
  assert.ok(b.repainted.length > before, "the answer arrived while the picker still read 'asking this chat what it can run…'");
  time.stop();
  b.shut();
});

test("a seat mid-turn is still forgotten rather than remembered as broken", async () => {
  const time = clock();
  const b = bench([{ ok: false, silent: true, error: "the driver did not answer" }, { ok: true, data: { models: CATALOG } }]);
  await refreshCatalog(b.seat);
  assert.equal(b.seat.catalogError, "");
  await time.tick(CATALOG_RETRY_CAP);
  assert.deepEqual(b.asked, ["catalog"], "a turn in flight is not a boot race — the next open asks, no timer needed");
  time.stop();
  await refreshCatalog(b.seat);
  assert.deepEqual(b.seat.catalog, CATALOG);
  b.shut();
});

test("what the catalogue says about the seat still lands on it", async () => {
  const b = bench([{ ok: true, data: { current: { model: "claude-fable-5", effort: "high", from: "settings", account: "" }, models: CATALOG } }]);
  await refreshCatalog(b.seat);
  assert.equal(b.seat.model, "claude-fable-5");
  assert.equal(b.seat.effort, "high");
  assert.equal(b.seat.effortFrom, "settings");
  b.shut();
});
