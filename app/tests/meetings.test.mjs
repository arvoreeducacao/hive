import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MEETING_DEFAULTS, addLine, cleanMeetingSettings, dropLocalMeeting, editMeeting, isMeetingId, matchesMeeting, meetingsOf, newMeeting,
  heardText, readLocalMeetings, readSharedMeetings, seesMeeting, summarizerCommand, summaryFromAnswer, summaryMarkdown, summaryPrompt, transcriptText,
  writeLocalMeeting, writeSharedMeeting
} from "../lib/meetings.mjs";
import { cleanPatch } from "../lib/config.mjs";

const made = (over = {}) => newMeeting({ id: "m1abcdef", owner: "ana", at: Date.UTC(2026, 9, 6, 14, 32), ...over }).meeting;

test("a meeting is born visible to the team, recording, with a title that says when", () => {
  const meeting = made();
  assert.equal(meeting.who, "team");
  assert.equal(meeting.state, "recording");
  assert.equal(meeting.titled, false);
  assert.match(meeting.title, /^Meeting of /);
  assert.match(made({ language: "pt" }).title, /^Reunião de /);
  assert.equal(made({ title: "  Sprint 41  " }).titled, true);
});

test("a meeting needs an id of its own shape and a person behind it", () => {
  assert.equal(isMeetingId("m1abcdef"), true);
  assert.equal(isMeetingId("../etc"), false);
  assert.ok(newMeeting({ id: "nope", owner: "ana" }).error);
  assert.ok(newMeeting({ id: "m1abcdef", owner: "" }).error);
});

test("what was heard lands in the order it was said, the call before the answer", () => {
  let meeting = made();
  meeting = addLine(meeting, { at: 30, source: "mic", text: "  sai por   linha " });
  meeting = addLine(meeting, { at: 0, source: "system", text: "fecha o importador?" });
  meeting = addLine(meeting, { at: 30, source: "system", text: "então tira o leitor" });
  meeting = addLine(meeting, { at: 60, source: "mic", text: "   " });
  assert.deepEqual(meeting.lines.map((line) => `${line.at}:${line.source}:${line.text}`), [
    "0:system:fecha o importador?", "30:system:então tira o leitor", "30:mic:sai por linha"
  ]);
});

test("only who it was shared with sees a meeting", () => {
  assert.equal(seesMeeting(made(), "caio"), true);
  assert.equal(seesMeeting(made({ who: "me" }), "caio"), false);
  assert.equal(seesMeeting(made({ who: "me" }), "ana"), true);
  assert.equal(seesMeeting(made({ who: "people", people: ["Caio", "caio", "../x"] }), "caio"), true);
  assert.equal(seesMeeting(made({ who: "people", people: ["caio"] }), "bruna"), false);
});

test("only who recorded changes a meeting, and picking people needs people", () => {
  assert.ok(editMeeting(made(), { title: "x" }, { me: "caio" }).error);
  assert.ok(editMeeting(made(), { title: "  " }, { me: "ana" }).error);
  assert.ok(editMeeting(made(), { who: "people", people: [] }, { me: "ana" }).error);
  const edited = editMeeting(made(), { title: "Sprint 41", who: "people", people: ["caio"] }, { me: "ana" }).meeting;
  assert.equal(edited.title, "Sprint 41");
  assert.equal(edited.titled, true);
  assert.deepEqual(edited.people, ["caio"]);
  assert.deepEqual(editMeeting(edited, { who: "me" }, { me: "ana" }).meeting.people, []);
});

test("the list is mine from this machine plus what the team shared, newest first", () => {
  const mine = { ...made({ id: "m2aaaaaa", who: "me" }), startedAt: 20 };
  const stale = { ...made({ id: "m3aaaaaa" }), title: "old copy on the shelf", startedAt: 10 };
  const fresh = { ...stale, title: "mine, fresher" };
  const theirs = { ...made({ id: "m4aaaaaa", owner: "caio" }), startedAt: 30 };
  const hidden = { ...made({ id: "m5aaaaaa", owner: "caio", who: "people", people: ["bruna"] }), startedAt: 40 };
  const list = meetingsOf({ local: [mine, fresh], shared: [stale, theirs, hidden], me: "ana" });
  assert.deepEqual(list.map((one) => one.id), ["m4aaaaaa", "m2aaaaaa", "m3aaaaaa"]);
  assert.equal(list[2].title, "mine, fresher");
});

test("meetings are kept one file each, here and on the shelf, and a stray file is not a meeting", () => {
  const home = mkdtempSync(join(tmpdir(), "hive-meetings-"));
  try {
    writeLocalMeeting(home, made());
    writeSharedMeeting(home, made({ id: "m9zzzzzz" }));
    assert.deepEqual(readLocalMeetings(home).map((one) => one.id), ["m1abcdef"]);
    assert.deepEqual(readSharedMeetings(home).map((one) => one.id), ["m9zzzzzz"]);
    dropLocalMeeting(home, "m1abcdef");
    dropLocalMeeting(home, "../../etc/passwd");
    assert.deepEqual(readLocalMeetings(home), []);
    assert.deepEqual(readSharedMeetings(""), []);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("the search reads the title, the notes and what was said", () => {
  const meeting = { ...addLine(made({ title: "Sprint 41" }), { at: 0, text: "o alerta de custo" }), summary: { oneLine: "fecha o importador", decisions: [], nextSteps: [{ who: "Caio", what: "abre o PR" }], open: [] } };
  for (const q of ["sprint", "ALERTA", "importador", "caio abre", ""]) assert.equal(matchesMeeting(meeting, q), true, q);
  assert.equal(matchesMeeting(meeting, "gráfica"), false);
});

test("the transcript goes to the model on standard input, never on the command line", () => {
  const meeting = addLine(addLine(made(), { at: 65, source: "mic", text: "eu confirmo" }), { at: 5, source: "system", text: "alguém confirma?" });
  assert.equal(transcriptText(meeting), "[00:05] the call: alguém confirma?\n[01:05] me: eu confirmo");
  const ask = summarizerCommand({ claude: "claude", model: "claude-sonnet-5-5", prompt: summaryPrompt({ instructions: "liste datas" }) });
  assert.deepEqual(ask.args.slice(2), ["--model", "claude-sonnet-5-5", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}']);
  assert.match(ask.args[1], /liste datas/);
  assert.doesNotMatch(ask.args.join(" "), /eu confirmo/);
});

test("the answer of the model becomes notes even with chatter around the JSON, and nonsense becomes nothing", () => {
  const notes = summaryFromAnswer('here you go:\n```json\n{"title":"Sprint 41","oneLine":"fecha o importador","decisions":["entra inteiro", ""],"nextSteps":[{"who":"Caio","what":"abre o PR"},{"who":"x"}],"open":"not a list"}\n```');
  assert.deepEqual(notes, { title: "Sprint 41", oneLine: "fecha o importador", decisions: ["entra inteiro"], nextSteps: [{ who: "Caio", what: "abre o PR" }], open: [] });
  assert.equal(summaryFromAnswer("I could not read it"), null);
  assert.equal(summaryFromAnswer('{"title":"only a title"}'), null);
  assert.match(summaryMarkdown({ title: "Sprint 41", summary: notes }), /^# Sprint 41\n\nfecha o importador\n\n## Decisions\n- entra inteiro\n\n## Next steps\n- Caio: abre o PR\n$/);
});

test("the settings fall back to sonnet for the team, and say what was wrong", () => {
  assert.deepEqual(cleanMeetingSettings(undefined), MEETING_DEFAULTS);
  const problems = [];
  const clean = cleanMeetingSettings({ model: "gpt", who: "everyone", mic: 7, systemAudio: "yes", instructions: "  datas  " }, "config", problems);
  assert.deepEqual(clean, { ...MEETING_DEFAULTS, instructions: "datas" });
  assert.equal(problems.length, 4);
  const kept = cleanPatch({ meetings: { model: "claude-opus-5-5", who: "me", mic: "abc", systemAudio: false } }).clean.meetings;
  assert.deepEqual(kept, { model: "claude-opus-5-5", who: "me", mic: "abc", output: "", systemAudio: false, instructions: "" });
  assert.equal(cleanPatch({ meetings: { output: "alsa_output.pci-0000_08_00.1.hdmi-stereo" } }).clean.meetings.output, "alsa_output.pci-0000_08_00.1.hdmi-stereo");
  assert.equal(cleanPatch({ meetings: { output: "x; rm -rf /" } }).clean.meetings.output, "");
});

test("what the model invents out of noise is not written down: a sentence on a loop, or letters of an alphabet nobody spoke", () => {
  assert.equal(heardText("O capital de mim. O capital de nós. O capital de nós. O capital de nós. O capital de nós", "pt"), "O capital de mim.");
  assert.equal(heardText("Infelizmente混 SHA traditionally", "pt"), "");
  assert.equal(heardText("для れmedia Saipolinha", ""), "");
  assert.equal(heardText("Fechado. Fechado. Vamos em frente.", "pt"), "Fechado. Vamos em frente.");
  assert.equal(heardText("  Sai por   linha. ", "pt"), "Sai por linha.");
  assert.equal(heardText("こんにちは", "ja"), "こんにちは");
});
