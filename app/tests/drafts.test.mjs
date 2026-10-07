import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { draftOf, dropGoneDrafts, forgetDraftCache, keepDraft, readDrafts } from "../lib/drafts.mjs";
import { registerDraftRoutes } from "../routes/drafts.mjs";

test("the drafts a hive keeps outlive the app that was closed on top of them", () => {
  const home = mkdtempSync(join(tmpdir(), "hive-drafts-"));

  keepDraft(home, "cadencia", "vou pedir o relatório de ", 1000);
  assert.deepEqual(draftOf(home, "cadencia"), { text: "vou pedir o relatório de ", at: 1000 });

  forgetDraftCache();
  assert.deepEqual(readDrafts(home), { cadencia: { text: "vou pedir o relatório de ", at: 1000 } }, "what was typed is read back from disk after a restart");

  assert.deepEqual(keepDraft(home, "cadencia", "isto chegou atrasado", 500), { draft: { text: "vou pedir o relatório de ", at: 1000 }, older: true });
  assert.equal(draftOf(home, "cadencia").text, "vou pedir o relatório de ");

  keepDraft(home, "cadencia", "", 2000);
  assert.equal(draftOf(home, "cadencia"), null, "an emptied box keeps nothing");

  keepDraft(home, "cadencia", "de novo", 3000);
  keepDraft(home, "outra", "e aqui também", 3000);
  assert.equal(dropGoneDrafts(home, new Set(["cadencia"])), 1, "a chat that is gone takes its draft with it");
  assert.deepEqual(Object.keys(readDrafts(home)), ["cadencia"]);

  rmSync(home, { recursive: true, force: true });
  forgetDraftCache();
});

test("the draft route refuses a name no chat has, and hands what it kept to the phone", async () => {
  const home = mkdtempSync(join(tmpdir(), "hive-draft-route-"));
  const routes = [];
  const handed = [];
  registerDraftRoutes((method, path, fn) => routes.push({ method, path, fn }), {
    bodyOf: async (req) => req.body,
    HIVE_HOME: home,
    isSeatName: (name) => /^[a-z0-9][a-z0-9_-]*$/i.test(name),
    publish: async (name, text, at) => { handed.push({ name, text, at }); },
    now: () => 4000
  });
  const post = routes.find((one) => one.method === "POST" && one.path === "/api/draft");
  const get = routes.find((one) => one.method === "GET" && one.path === "/api/drafts");

  const answers = [];
  const json = (value, status = 200) => { answers.push({ value, status }); return { value, status }; };

  await post.fn({ body: { name: "não é um nome", text: "x" } }, {}, null, json);
  assert.equal(answers.at(-1).status, 400);
  assert.deepEqual(handed, []);

  await post.fn({ body: { name: "cadencia", text: "meia frase" } }, {}, null, json);
  assert.equal(answers.at(-1).value.draft.at, 4000, "a draft with no moment of its own is stamped on arrival");
  assert.deepEqual(handed, [{ name: "cadencia", text: "meia frase", at: 4000 }]);

  await post.fn({ body: { name: "cadencia", text: "isto chegou atrasado", at: 100 } }, {}, null, json);
  assert.equal(answers.at(-1).value.older, true);
  assert.equal(handed.length, 1, "a draft that lost does not travel");

  await get.fn({}, {}, null, json);
  assert.deepEqual(answers.at(-1).value, { drafts: { cadencia: { text: "meia frase", at: 4000 } } });

  rmSync(home, { recursive: true, force: true });
  forgetDraftCache();
});
