import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MARKS_KEPT, UNMARKED_KEPT_MS, forgetMarksCache, keepMarks, readMarks } from "../lib/inbox-marks.mjs";
import { registerInboxRoutes } from "../routes/inbox.mjs";

const fresh = (name) => mkdtempSync(join(tmpdir(), `hive-${name}-`));

test("the marks of the inbox outlive the app and the browser data that held them", () => {
  const home = fresh("inbox-marks");
  keepMarks(home, { quiet: { pinnedAt: 10, at: 10 }, asks: { snoozeUntil: 9000, at: 20 } }, { now: 30 });
  forgetMarksCache();
  assert.deepEqual(readMarks(home), { quiet: { pinnedAt: 10, at: 10 }, asks: { snoozeUntil: 9000, at: 20 } }, "read back from disk after a restart");
  rmSync(home, { recursive: true, force: true });
  forgetMarksCache();
});

test("a mark that left a window late does not undo a newer one, and an unmarked chat stays known for a week", () => {
  const home = fresh("inbox-marks-late");
  keepMarks(home, { quiet: { pinnedAt: 10, at: 100 } }, { now: 100 });
  assert.deepEqual(keepMarks(home, { quiet: { settledAt: 50, at: 50 } }, { now: 120 }).taken, []);
  assert.deepEqual(readMarks(home).quiet, { pinnedAt: 10, at: 100 });

  keepMarks(home, { quiet: { at: 200 } }, { now: 200 });
  assert.deepEqual(readMarks(home).quiet, { at: 200 }, "the unpin is kept, so a late copy of the pin cannot bring it back");
  assert.deepEqual(keepMarks(home, { quiet: { pinnedAt: 10, at: 100 } }, { now: 210 }).taken, []);

  keepMarks(home, { asks: { unread: true, at: 300 } }, { now: 200 + UNMARKED_KEPT_MS + 1 });
  assert.equal(readMarks(home).quiet, undefined, "after a week nothing is left of a chat with no mark");
  assert.deepEqual(readMarks(home).asks, { unread: true, at: 300 });
  rmSync(home, { recursive: true, force: true });
  forgetMarksCache();
});

test("only the fields of a mark are kept, and a mark with no moment is stamped on arrival", () => {
  const home = fresh("inbox-marks-clean");
  keepMarks(home, { quiet: { pinnedAt: 10, stayActive: true, junk: "x", settledAt: "ontem", unread: false } }, { now: 77 });
  assert.deepEqual(readMarks(home).quiet, { pinnedAt: 10, stayActive: true, at: 77 });
  keepMarks(home, { ["x".repeat(201)]: { pinnedAt: 1 } }, { now: 78 });
  assert.equal(Object.keys(readMarks(home)).length, 1, "a key no seat could have is refused");
  rmSync(home, { recursive: true, force: true });
  forgetMarksCache();
});

test("moving the marks a browser held fills only the chats the hive has never seen, and drops what holds no mark", () => {
  const home = fresh("inbox-marks-move");
  keepMarks(home, { asks: { pinnedAt: 5, at: 5 } }, { now: 5 });
  const moved = keepMarks(home, { asks: { settledAt: 1 }, quiet: { pinnedAt: 2 }, back: {} }, { now: 900, moving: true });
  assert.deepEqual(moved.taken, ["quiet"]);
  assert.deepEqual(moved.marks, { asks: { pinnedAt: 5, at: 5 }, quiet: { pinnedAt: 2, at: 900 } });
  rmSync(home, { recursive: true, force: true });
  forgetMarksCache();
});

test("the hive keeps at most a thousand marks, the oldest go first", () => {
  const home = fresh("inbox-marks-cap");
  const many = Object.fromEntries(Array.from({ length: MARKS_KEPT + 2 }, (_, at) => [`seat-${at}`, { pinnedAt: 1, at: at + 1 }]));
  keepMarks(home, many, { now: MARKS_KEPT + 10 });
  const kept = readMarks(home);
  assert.equal(Object.keys(kept).length, MARKS_KEPT);
  assert.equal(kept["seat-0"], undefined);
  assert.equal(kept["seat-1"], undefined);
  rmSync(home, { recursive: true, force: true });
  forgetMarksCache();
});

test("the inbox route keeps what is sent and gives back what it holds", async () => {
  const home = fresh("inbox-marks-route");
  const routes = [];
  registerInboxRoutes((method, path, fn) => routes.push({ method, path, fn }), { bodyOf: async (req) => req.body, HIVE_HOME: home, now: () => 4000 });
  const post = routes.find((one) => one.method === "POST" && one.path === "/api/inbox/marks");
  const get = routes.find((one) => one.method === "GET" && one.path === "/api/inbox/marks");
  const answers = [];
  const json = (value, status = 200) => { answers.push({ value, status }); return { value, status }; };

  await post.fn({ body: {} }, {}, null, json);
  assert.equal(answers.at(-1).status, 400);

  await post.fn({ body: { marks: { quiet: { pinnedAt: 3 } } } }, {}, null, json);
  assert.deepEqual(answers.at(-1).value, { ok: true, taken: ["quiet"], marks: { quiet: { pinnedAt: 3, at: 4000 } } });

  await post.fn({ body: { marks: { quiet: { settledAt: 9 } }, moving: true } }, {}, null, json);
  assert.deepEqual(answers.at(-1).value.taken, [], "a browser moving its old marks never overwrites the hive");

  await get.fn({}, {}, null, json);
  assert.deepEqual(answers.at(-1).value, { marks: { quiet: { pinnedAt: 3, at: 4000 } } });
  rmSync(home, { recursive: true, force: true });
  forgetMarksCache();
});
