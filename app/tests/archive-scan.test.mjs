import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { oneRowPerSession, readSeatRecords, scanTranscripts, scanTranscriptsApart } from "../lib/archive-scan.mjs";

const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER = "11111111-2222-3333-4444-555555555555";

const transcript = (entrypoint = "cli", promptSource = "typed") => [
  `{"type":"queue-operation","operation":"enqueue","timestamp":"2026-08-28T14:00:00.000Z"}`,
  `{"type":"user","cwd":"/Users/me/acme-hub","promptSource":"${promptSource}","entrypoint":"${entrypoint}"}`,
  `{"type":"assistant","timestamp":"2026-08-28T14:00:01.000Z"}`,
  `{"type":"last-prompt","lastPrompt":"conserta o histórico"}`
];

const pastedImage = `{"type":"user","content":[{"type":"image","source":{"data":"${"A".repeat(400000)}"}}]}`;

function archive(transcripts, { folder = "-p" } = {}) {
  const home = mkdtempSync(join(tmpdir(), "scan-"));
  const projects = join(home, ".claude/projects");
  mkdirSync(join(projects, folder), { recursive: true });
  for (const [id, lines] of Object.entries(transcripts)) writeFileSync(join(projects, folder, `${id}.jsonl`), `${lines.join("\n")}\n`);
  return { home, projects, folder };
}

test("a chat takes a row with the folder it ran in, the last thing typed and the hour of the last message", async () => {
  const { projects } = archive({ [ID]: transcript() });
  const { rows, files, read } = await scanTranscripts({ projectsDir: projects });
  assert.equal(files, 1);
  assert.equal(read, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, ID);
  assert.equal(rows[0].cwd, "/Users/me/acme-hub");
  assert.equal(rows[0].prompt, "conserta o histórico");
  assert.equal(rows[0].title, "conserta o histórico");
  assert.equal(new Date(rows[0].at).toISOString(), "2026-08-28T14:00:01.000Z");
});

test("a chat that opens with a pasted image still takes a row, folder and all", async () => {
  const { projects } = archive({ [ID]: [pastedImage, ...transcript("claude-desktop", "sdk")] });
  const { rows } = await scanTranscripts({ projectsDir: projects });
  assert.equal(rows.length, 1, "one pasted print must not hide a whole session");
  assert.equal(rows[0].cwd, "/Users/me/acme-hub");
});

test("a chat that ends with a pasted image keeps the last thing typed", async () => {
  const { projects } = archive({ [ID]: [...transcript(), pastedImage] });
  const { rows } = await scanTranscripts({ projectsDir: projects });
  assert.equal(rows[0].prompt, "conserta o histórico");
});

test("a chat with a name of its own wears it, and the typed line stays the subtitle", async () => {
  const { projects } = archive({ [ID]: [...transcript(), `{"type":"custom-title","customTitle":"sessoes-hive"}`] });
  const { rows } = await scanTranscripts({ projectsDir: projects });
  assert.equal(rows[0].title, "sessoes-hive");
  assert.equal(rows[0].prompt, "conserta o histórico");
});

test("a file that is no chat of any kind takes no row", async () => {
  const { projects } = archive({ [ID]: [`{"type":"summary","summary":"nada"}`] });
  const { rows } = await scanTranscripts({ projectsDir: projects });
  assert.deepEqual(rows, []);
});

test("a login with nothing typed and no name of its own takes no row", async () => {
  const { projects } = archive({ [ID]: [`{"type":"user","cwd":"/Users/me/hub","entrypoint":"cli"}`] });
  const { rows } = await scanTranscripts({ projectsDir: projects });
  assert.deepEqual(rows, []);
});

test("the scratch folders the system hands out are never walked", async () => {
  const { projects } = archive({ [ID]: transcript() }, { folder: "-private-tmp-claude-501" });
  const { rows, files } = await scanTranscripts({ projectsDir: projects });
  assert.equal(files, 0);
  assert.deepEqual(rows, []);
});

test("a second look reads nothing again — the index carries the answer", async () => {
  const { projects } = archive({ [ID]: transcript(), [OTHER]: transcript() });
  const first = await scanTranscripts({ projectsDir: projects });
  assert.equal(first.read, 2);
  const again = await scanTranscripts({ projectsDir: projects, known: first.index });
  assert.equal(again.read, 0, "an unchanged transcript must never be opened twice");
  assert.deepEqual(again.rows.map((row) => row.id).sort(), first.rows.map((row) => row.id).sort());
});

test("a transcript that moved is read again, and its row follows", async () => {
  const { projects, folder } = archive({ [ID]: transcript() });
  const first = await scanTranscripts({ projectsDir: projects });
  writeFileSync(join(projects, folder, `${ID}.jsonl`), `${[...transcript(), `{"type":"last-prompt","lastPrompt":"outra coisa"}`].join("\n")}\n`);
  const again = await scanTranscripts({ projectsDir: projects, known: first.index });
  assert.equal(again.read, 1);
  assert.equal(again.rows[0].prompt, "outra coisa");
});

test("a transcript with the same size but a newer hour is read again", async () => {
  const { projects, folder } = archive({ [ID]: transcript() });
  const first = await scanTranscripts({ projectsDir: projects });
  const later = new Date(Date.now() + 60000);
  utimesSync(join(projects, folder, `${ID}.jsonl`), later, later);
  const again = await scanTranscripts({ projectsDir: projects, known: first.index });
  assert.equal(again.read, 1);
});

test("a transcript the sync repo does not hold yet is marked behind, and a matching copy is marked ok", async () => {
  const { projects, folder } = archive({ [ID]: transcript(), [OTHER]: transcript() });
  const mirror = mkdtempSync(join(tmpdir(), "mirror-"));
  mkdirSync(join(mirror, folder), { recursive: true });
  const here = join(projects, folder, `${ID}.jsonl`);
  const twin = join(mirror, folder, `${ID}.jsonl`);
  writeFileSync(twin, `${transcript().join("\n")}\n`);
  const held = statSync(here);
  utimesSync(twin, held.atime, held.mtime);
  const { rows } = await scanTranscripts({ projectsDir: projects, mirrorDir: mirror });
  const state = Object.fromEntries(rows.map((row) => [row.id, row.sync]));
  assert.equal(state[ID], "ok");
  assert.equal(state[OTHER], "behind");
});

test("without a sync repo no row claims a sync state at all", async () => {
  const { projects } = archive({ [ID]: transcript() });
  const { rows } = await scanTranscripts({ projectsDir: projects });
  assert.equal(rows[0].sync, undefined);
});

function seats(records, events = {}) {
  const home = mkdtempSync(join(tmpdir(), "seats-"));
  mkdirSync(join(home, "sessions"), { recursive: true });
  mkdirSync(join(home, "events"), { recursive: true });
  for (const [name, body] of Object.entries(records)) writeFileSync(join(home, "sessions", `${name}.json`), JSON.stringify(body, null, 2));
  for (const [name, lines] of Object.entries(events)) writeFileSync(join(home, "events", `${name}.ndjson`), `${lines.join("\n")}\n`);
  return { sessionsDir: join(home, "sessions"), eventsDir: join(home, "events") };
}

test("a claude seat lends its name to the transcript it holds", async () => {
  const where = seats({ "minha-missao": { agent: "claude", session_id: ID, cwd: "/Users/me/hub" } });
  const { seatOf, rows } = await readSeatRecords(where);
  assert.equal(seatOf.get(ID), "minha-missao");
  assert.deepEqual(rows, []);
});

test("a kimi seat becomes a row of its own, dated by its events file", async () => {
  const say = JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: "Bom dia, kimi" }] } });
  const where = seats(
    { "bom-dia": { agent: "kimi", session_id: "session_4b046a2d-6fc7-4762-93bc-5fad7090d7a9", cwd: "/Users/me/hub", updated: "2026-09-03T16:02:09.454Z" } },
    { "bom-dia": [say] }
  );
  const { rows, seatOf } = await readSeatRecords(where);
  assert.equal(seatOf.size, 0, "a seat with a transcript of its own is not a claude id to map");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].agent, "kimi");
  assert.equal(rows[0].seat, "bom-dia");
  assert.equal(rows[0].prompt, "Bom dia, kimi");
  assert.equal(rows[0].where, "local");
});

test("a conversation that lives on both sides becomes one row, on the side it was last closed", () => {
  const folded = oneRowPerSession([
    { id: ID, where: "cloud", at: 100, title: "no servidor" },
    { id: ID, where: "local", at: 200, title: "trazida pra ca" }
  ]);
  assert.equal(folded.length, 1, "a chat brought down still shows twice");
  assert.equal(folded[0].where, "local");
  assert.equal(folded[0].at, 200);
});

test("the side that lost the fold still lends what the winner does not carry", () => {
  const [row] = oneRowPerSession([
    { id: ID, where: "cloud", at: 100, title: "no servidor", agent: "kiro", custom: "meu titulo" },
    { id: ID, where: "local", at: 200, title: "trazida pra ca" }
  ]);
  assert.equal(row.agent, "kiro", "the agent that ran the chat was dropped on the way in");
  assert.equal(row.custom, "meu titulo", "a title somebody typed was dropped on the way in");
  assert.equal(row.title, "trazida pra ca", "the older row overwrote the newer one");
});

test("a sync badge belongs to the side that won, never to the one it replaced", () => {
  const [row] = oneRowPerSession([
    { id: ID, where: "cloud", at: 100, sync: "behind" },
    { id: ID, where: "local", at: 200 }
  ]);
  assert.equal(row.sync, undefined, "the badge of the copy left behind followed the winner");
});

test("two conversations that only look alike are left alone", () => {
  const folded = oneRowPerSession([
    { id: ID, where: "local", at: 100 },
    { id: OTHER, where: "cloud", at: 200 }
  ]);
  assert.deepEqual(folded.map((row) => row.id), [OTHER, ID], "the list is newest first");
});

test("when both sides stopped at the same instant the machine in front of the person wins", () => {
  const [row] = oneRowPerSession([
    { id: ID, where: "cloud", at: 100 },
    { id: ID, where: "local", at: 100 }
  ]);
  assert.equal(row.where, "local");
});

test("the scan run apart, in a child that dies, answers the same rows and index as the scan run here", async () => {
  const { projects } = archive({ [ID]: transcript(), [OTHER]: ["{}"] });
  const here = await scanTranscripts({ projectsDir: projects, known: {} });
  const seen = [];
  const apart = await scanTranscriptsApart({ projectsDir: projects, known: {}, onProgress: (reached) => seen.push(reached) });
  assert.deepEqual(apart.rows, here.rows);
  assert.deepEqual(apart.index, here.index);
  assert.equal(apart.files, 2);
  assert.deepEqual(seen.at(-1), { done: 2, total: 2, read: 2 }, "progress crosses back from the child");
  const again = await scanTranscriptsApart({ projectsDir: projects, known: apart.index });
  assert.equal(again.read, 0, "the index carried into the child still spares every read");
});

test("a scan that breaks inside the child comes back as a failure, not as a hang or an empty list", async () => {
  const { projects } = archive({ [ID]: transcript() });
  await assert.rejects(scanTranscriptsApart({ projectsDir: projects, known: null }), /null/);
});
