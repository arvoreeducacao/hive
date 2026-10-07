import test from "node:test";
import assert from "node:assert/strict";
import { cleanPatch, cleanSttLanguage, cleanSttModel } from "../lib/config.mjs";

test("dictation is off until someone says otherwise", () => {
  assert.deepEqual(cleanPatch({}).clean.stt, undefined);
  assert.equal(cleanPatch({ stt: false }).clean.stt, false);
  assert.equal(cleanPatch({ stt: true }).clean.stt, true);
});

test("a stt that is not true or false stays off, and says why", () => {
  const { clean, problems } = cleanPatch({ stt: "sim" });
  assert.equal(clean.stt, false);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /stt should be true or false/);
});

test("the dictation language is empty, for the model to work it out, or a short code", () => {
  const problems = [];
  assert.equal(cleanSttLanguage(undefined, "file", problems), "");
  assert.equal(cleanSttLanguage("", "file", problems), "");
  assert.equal(cleanSttLanguage("pt", "file", problems), "pt");
  assert.equal(cleanSttLanguage(" en ", "file", problems), "en");
  assert.equal(cleanSttLanguage("yue", "file", problems), "yue");
  assert.deepEqual(problems, []);
});

test("a language the model would not know falls back to working it out", () => {
  const problems = [];
  assert.equal(cleanSttLanguage("PT-br", "file", problems), "");
  assert.equal(cleanSttLanguage(7, "file", problems), "");
  assert.equal(problems.length, 2);
  assert.match(problems[0], /sttLanguage should be empty/);
});

test("the patch carries the language through the same cleaner", () => {
  assert.equal(cleanPatch({ sttLanguage: "pt" }).clean.sttLanguage, "pt");
  assert.equal(cleanPatch({ sttLanguage: "portuguese" }).clean.sttLanguage, "");
});

test("the dictation model is one the hive knows, and anything else falls back to the first", () => {
  const problems = [];
  assert.equal(cleanSttModel(undefined, "file", problems), "whisper-medium");
  assert.equal(cleanSttModel("parakeet-v3", "file", problems), "parakeet-v3");
  assert.deepEqual(problems, []);
  assert.equal(cleanSttModel("whisper-gigante", "file", problems), "whisper-medium");
  assert.match(problems[0], /sttModel should be whisper-medium or parakeet-v3/);
  assert.equal(cleanPatch({ sttModel: "parakeet-v3" }).clean.sttModel, "parakeet-v3");
});

test("the dictation microphone is kept as given, and junk falls back to the system default", () => {
  assert.equal(cleanPatch({ sttMic: "abc123" }).clean.sttMic, "abc123");
  assert.equal(cleanPatch({ sttMic: "" }).clean.sttMic, "");
  assert.equal(cleanPatch({ sttMic: 42 }).clean.sttMic, "");
});
