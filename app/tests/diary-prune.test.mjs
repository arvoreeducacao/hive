import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DIARY_DAYS_DEFAULT, cleanDiaryDays, diariesToPrune, pruneDiary, readDiaries, syncedSessionIds } from "../lib/diary-prune.mjs";
import { cleanPatch } from "../lib/config.mjs";
import { hiveSessionRow } from "../lib/own-history.mjs";
import { app, state, views } from "./dom.mjs";

await state();
await views();
const { $ } = await app("core");
const { adoptDiaryDays, diaryDays, setDiaryDays } = await app("pure-helpers");
await app("themes");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 6, 12);
const CLAUDE_ID = "9040c72d-089d-41bf-a4d2-e854782fe872";
const OTHER_CLAUDE_ID = "880e3bca-ac34-49cd-9537-a466e82ff6f0";

const sent = [];
globalThis.fetch = async (path, opts) => {
  const body = opts?.body ? JSON.parse(opts.body) : null;
  sent.push({ path, body });
  return { ok: true, json: async () => ({ config: body?.config || {} }) };
};

const metas = {
  "claude-synced": { session_id: CLAUDE_ID },
  "claude-not-synced": { session_id: OTHER_CLAUDE_ID },
  "codex-chat": { agent: "codex", session_id: "019a-codex-thread" },
  "kimi-chat": { agent: "kimi", session_id: "session_0001" },
  "cursor-chat": { agent: "cursor", session_id: "cursor-0001" }
};

const pick = ({ touchedAt = NOW - 40 * DAY, open = new Set(), synced = new Set([CLAUDE_ID]), days = 30, names = Object.keys(metas), metaOf = (name) => metas[name] } = {}) =>
  diariesToPrune({ diaries: names.map((name) => ({ name, touchedAt })), open, metaOf, synced, days, now: NOW }).map((one) => one.name);

test("a closed Claude chat goes only when its conversation is on github, and a Codex one goes on age alone", () => {
  assert.deepEqual(pick(), ["claude-synced", "codex-chat"]);
});

test("Kimi, Kiro, OpenCode and Cursor chats are never cleared, because nothing rebuilds their screen", () => {
  assert.deepEqual(pick({ names: ["kimi-chat", "cursor-chat"], synced: new Set() }), []);
});

test("a chat still open is never cleared, however old", () => {
  assert.deepEqual(pick({ open: new Set(["claude-synced", "codex-chat"]) }), []);
});

test("a chat quiet for less than the setting stays", () => {
  assert.deepEqual(pick({ touchedAt: NOW - 10 * DAY }), []);
});

test("a chat with no record or no readable date is left alone", () => {
  assert.deepEqual(pick({ metaOf: () => null }), []);
  assert.deepEqual(pick({ touchedAt: 0 }), []);
  assert.deepEqual(pick({ touchedAt: Number.NaN }), []);
});

test("with the setting off nothing is cleared", () => {
  assert.deepEqual(pick({ days: 0 }), []);
});

test("the sessions on github are read from the repo listing, whole or in parts", () => {
  const listing = [
    `-Users-art-hub/${CLAUDE_ID}.jsonl`,
    `-Users-art-hub/${OTHER_CLAUDE_ID}.jsonl.part-0001`,
    `-Users-art-hub/${OTHER_CLAUDE_ID}.jsonl.part-0002`,
    "_images/abc.png",
    "README.md"
  ].join("\n");
  assert.deepEqual([...syncedSessionIds(listing)].sort(), [OTHER_CLAUDE_ID, CLAUDE_ID].sort());
});

test("the setting defaults to 30 days, 0 turns it off, and a bad value falls back to the default", () => {
  const problems = [];
  assert.equal(cleanDiaryDays(undefined, "config", problems), DIARY_DAYS_DEFAULT);
  assert.equal(cleanDiaryDays(0, "config", problems), 0);
  assert.equal(cleanDiaryDays(45, "config", problems), 45);
  assert.deepEqual(problems, []);
  assert.equal(cleanDiaryDays(1000, "config", problems), DIARY_DAYS_DEFAULT);
  assert.equal(problems.length, 1);
  assert.equal(cleanPatch({ pruneDiariesAfterDays: 0 }).clean.pruneDiariesAfterDays, 0);
});

test("clearing a Codex chat keeps it in the archive with its date and first message", async () => {
  const home = mkdtempSync(join(tmpdir(), "diary-prune-"));
  const eventsDir = join(home, "events");
  const sessionsDir = join(home, "sessions");
  mkdirSync(eventsDir);
  mkdirSync(sessionsDir);
  const meta = { agent: "codex", session_id: "019a-codex-thread", cwd: "/w/hub" };
  writeFileSync(join(sessionsDir, "codex-chat.json"), JSON.stringify(meta));
  const say = { type: "user", subtype: "say", message: { role: "user", content: [{ type: "text", text: "arruma o login do backoffice" }] } };
  writeFileSync(join(eventsDir, "codex-chat.ndjson"), `${JSON.stringify({ seq: 1, type: "driver" })}\n${JSON.stringify(say)}\n`);
  const touchedAt = NOW - 40 * DAY;
  utimesSync(join(eventsDir, "codex-chat.ndjson"), touchedAt / 1000, touchedAt / 1000);
  const [diary] = await readDiaries(eventsDir);
  assert.equal(Math.round(diary.touchedAt / 1000), Math.round(touchedAt / 1000));

  await pruneDiary({ eventsDir, sessionsDir, name: "codex-chat", meta, touchedAt });

  assert.equal(existsSync(join(eventsDir, "codex-chat.ndjson")), false);
  const kept = JSON.parse(readFileSync(join(sessionsDir, "codex-chat.json"), "utf8"));
  const row = hiveSessionRow("codex-chat", kept, 0, "", "local");
  assert.equal(row.at, touchedAt);
  assert.equal(row.prompt, "arruma o login do backoffice");
  assert.equal(row.title, "arruma o login do backoffice");
});

test("clearing a Claude chat leaves its record untouched, since the archive reads the transcript", async () => {
  const home = mkdtempSync(join(tmpdir(), "diary-prune-"));
  const eventsDir = join(home, "events");
  const sessionsDir = join(home, "sessions");
  mkdirSync(eventsDir);
  mkdirSync(sessionsDir);
  const record = JSON.stringify({ session_id: CLAUDE_ID });
  writeFileSync(join(sessionsDir, "claude-synced.json"), record);
  writeFileSync(join(eventsDir, "claude-synced.ndjson"), "{}\n");
  await pruneDiary({ eventsDir, sessionsDir, name: "claude-synced", meta: { session_id: CLAUDE_ID }, touchedAt: NOW - 40 * DAY });
  assert.equal(existsSync(join(eventsDir, "claude-synced.ndjson")), false);
  assert.equal(readFileSync(join(sessionsDir, "claude-synced.json"), "utf8"), record);
});

test("the conversation settings have a field for it, showing 30 until the person changes it", () => {
  const field = $("f-diary-days");
  assert.ok(field, "there is no field for the days");
  assert.equal(field.getAttribute("placeholder"), "30");
  adoptDiaryDays({ config: {} });
  assert.equal(field.value, "30");
  adoptDiaryDays({ config: { pruneDiariesAfterDays: 0 } });
  assert.equal(field.value, "0");
  adoptDiaryDays({ config: { pruneDiariesAfterDays: 60 } });
  assert.equal(field.value, "60");
});

test("what the person types is saved as days: 0 turns it off, and empty or out of range goes back to 30", async () => {
  assert.equal(diaryDays(" 45 "), 45);
  assert.equal(diaryDays("0"), 0);
  assert.equal(diaryDays(""), 30);
  assert.equal(diaryDays("900"), 30);
  sent.length = 0;
  setDiaryDays("0");
  setDiaryDays("14");
  await new Promise((done) => setTimeout(done, 0));
  assert.deepEqual(sent.map((one) => one.body), [{ config: { pruneDiariesAfterDays: 0 } }, { config: { pruneDiariesAfterDays: 14 } }]);
});

test("changing the field saves it", async () => {
  sent.length = 0;
  const field = $("f-diary-days");
  field.value = "7";
  field.dispatchEvent(new Event("change"));
  await new Promise((done) => setTimeout(done, 0));
  assert.deepEqual(sent.at(-1)?.body, { config: { pruneDiariesAfterDays: 7 } });
});
