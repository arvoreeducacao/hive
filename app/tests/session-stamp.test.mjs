import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync as read } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

function slice(from, to) {
  const a = server.indexOf(from);
  const b = server.indexOf(to);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of server.mjs`);
  return server.slice(a, b);
}

const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER = "11111111-2222-3333-4444-555555555555";

function stamper() {
  const dir = mkdtempSync(join(tmpdir(), "stamp-"));
  mkdirSync(join(dir, "sessions"), { recursive: true });
  const appended = [];
  const stubs = {
    POD: "",
    podUp: async () => false,
    quoted: (t) => `'${t}'`,
    shr: async () => ({ ok: false, out: "" }),
    onPod: { bash: (s) => ["kubectl", [s]] },
    localTranscriptOf: (id) => (files.has(id) ? join(dir, `${id}.jsonl`) : ""),
    tailOfFile: (path) => read(path, "utf8"),
    appendFile: async (path, text) => {
      appended.push(text);
      writeFileSync(path, read(path, "utf8") + text);
    },
    readFile: async (path) => read(path, "utf8"),
    join,
    HIVE_HOME: dir,
    isSeatName: (n) => /^[a-z0-9-]+$/.test(n),
    titles: new Map(),
    titleKey: (name, where) => `${where}:${name}`,
    saveTitles: () => {},
  };
  const files = new Set();
  const body = slice("const SESSION_ID = /^[0-9a-f]{8}", "const PR_LINK = ");
  const made = new Function(
    ...Object.keys(stubs),
    body + "\nreturn { stampOnTranscript, stampTitle, stampRecord, seatSessionId };"
  )(...Object.values(stubs));
  return {
    ...made,
    titles: stubs.titles,
    appended,
    bindSeat(seat, id) {
      writeFileSync(join(dir, "sessions", `${seat}.json`), JSON.stringify({ session_id: id }));
    },
    makeTranscript(id, content = "") {
      files.add(id);
      writeFileSync(join(dir, `${id}.jsonl`), content);
    },
    transcript(id) {
      return read(join(dir, `${id}.jsonl`), "utf8");
    },
  };
}

test("the name is written into the transcript, once, however many times it is asked for", async () => {
  const h = stamper();
  h.makeTranscript(ID, '{"type":"user"}\n');

  assert.equal(await h.stampOnTranscript(ID, "minha-missao", "local"), true);
  assert.equal(await h.stampOnTranscript(ID, "minha-missao", "local"), true);

  const lines = h.transcript(ID).trim().split("\n");
  assert.equal(lines.length, 2, "the same name must not pile up in the transcript");
  assert.deepEqual(JSON.parse(lines[1]), { type: "custom-title", customTitle: "minha-missao", sessionId: ID });
});

test("a transcript that is not on disk yet is not counted as stamped", async () => {
  const h = stamper();
  assert.equal(await h.stampOnTranscript(ID, "minha-missao", "local"), false);
  assert.equal(h.appended.length, 0);
});

test("a chat that changes session keeps being stamped — the bookkeeping follows the id", async () => {
  const h = stamper();
  h.bindSeat("minha-missao", ID);
  h.makeTranscript(ID, "{}\n");
  await h.stampTitle("minha-missao", "local", "minha-missao");
  assert.match(h.transcript(ID), /custom-title/);

  h.bindSeat("minha-missao", OTHER);
  h.makeTranscript(OTHER, "{}\n");
  h.titles.set("local:minha-missao", { ...h.titles.get("local:minha-missao"), stampAt: 0 });
  await h.stampTitle("minha-missao", "local", "minha-missao");
  assert.match(h.transcript(OTHER), /custom-title/, "the new session of the same seat has to get the name too");
});

test("asking again right away does not touch the disk — the throttle holds", async () => {
  const h = stamper();
  h.bindSeat("minha-missao", ID);
  h.makeTranscript(ID, "{}\n");
  await h.stampTitle("minha-missao", "local", "minha-missao");
  const wrote = h.appended.length;
  await h.stampTitle("minha-missao", "local", "outro-nome");
  assert.equal(h.appended.length, wrote, "a second ask inside the window waits for the next one");
});

function parser() {
  const body = slice("function parseHistory(raw, where, into) {", "function decorateHistory");
  return new Function(body + "\nreturn parseHistory;")();
}

const chunk = (file, extra) => `==F==${file}\n==T==1787900000\n==W=="timestamp":"2026-08-28T14:00:00.000Z"\n==C=="cwd":"/Users/me/Documents/arvore/arvore-hub"\n${extra}`;

test("the hour on the row is the hour of the last message, not the hour of the sync", () => {
  const rows = [];
  parser()(chunk(`/p/${ID}.jsonl`, `==P=="lastPrompt":"conserta o histórico"\n`), "local", rows);
  assert.equal(rows.length, 1);
  assert.equal(new Date(rows[0].at).toISOString(), "2026-08-28T14:00:00.000Z");
});

test("a chat with a name of its own wears it instead of the first thing typed", () => {
  const rows = [];
  parser()(chunk(`/p/${ID}.jsonl`, `==N=="customTitle":"sessoes-hive-nomes-datas"\n==P=="lastPrompt":"tenta de novo"\n`), "local", rows);
  assert.equal(rows[0].title, "sessoes-hive-nomes-datas");
  assert.equal(rows[0].prompt, "tenta de novo", "the prompt is still the subtitle");
});

test("a session with nothing typed and no name of its own does not take a row", () => {
  const rows = [];
  parser()(chunk(`/p/${ID}.jsonl`, ""), "local", rows);
  assert.deepEqual(rows, [], "a /login with no conversation is not a past session");
});

function histScan(home) {
  const cut = slice("const HIST_SCAN = `", "const ARCHIVE_FILE");
  const body = cut.slice(cut.indexOf("`") + 1, cut.lastIndexOf("`"));
  const script = body.replace(/\\\$/g, "$").replace(/\\`/g, "`");
  return execFileSync("/bin/bash", ["-c", script], { env: { ...process.env, HOME: home }, maxBuffer: 1 << 26 }).toString();
}

function archive(transcripts) {
  const home = mkdtempSync(join(tmpdir(), "hist-"));
  const projects = join(home, ".claude/projects/-p");
  mkdirSync(projects, { recursive: true });
  mkdirSync(join(home, ".hive/sessions"), { recursive: true });
  for (const [id, lines] of Object.entries(transcripts)) writeFileSync(join(projects, `${id}.jsonl`), lines.join("\n") + "\n");
  return histScan(home);
}

const transcript = (entrypoint, promptSource) => [
  `{"type":"queue-operation","operation":"enqueue","timestamp":"2026-08-28T14:00:00.000Z"}`,
  `{"type":"user","cwd":"/Users/me/arvore-hub","promptSource":"${promptSource}","entrypoint":"${entrypoint}"}`,
  `{"type":"assistant","timestamp":"2026-08-28T14:00:01.000Z"}`,
  `{"type":"last-prompt","lastPrompt":"conserta o histórico"}`
];

test("a chat the desktop app wrote takes a row like any other", () => {
  const out = archive({ [ID]: transcript("claude-desktop", "sdk") });
  assert.match(out, new RegExp(`==F==.*${ID}\\.jsonl`), "the desktop app stamps promptSource sdk, and that is still a chat");
});

test("a chat the terminal wrote takes a row even when it touched no file", () => {
  const out = archive({ [ID]: transcript("cli", "sdk") });
  assert.match(out, new RegExp(`==F==.*${ID}\\.jsonl`));
});

test("a seat the hive opened keeps taking a row", () => {
  const out = archive({ [ID]: transcript("sdk-ts", "typed") });
  assert.match(out, new RegExp(`==F==.*${ID}\\.jsonl`));
});

test("the entrypoint is looked for past the first forty lines", () => {
  const noise = Array.from({ length: 60 }, () => `{"type":"queue-operation","operation":"dequeue"}`);
  const out = archive({ [ID]: [...noise, ...transcript("claude-desktop", "sdk")] });
  assert.match(out, new RegExp(`==F==.*${ID}\\.jsonl`), "a long warm-up must not hide the chat");
});

const pastedImage = `{"type":"user","content":[{"type":"image","source":{"data":"${"A".repeat(400000)}"}}]}`;

test("a chat that opens with a pasted image still takes a row", () => {
  const out = archive({ [ID]: [pastedImage, ...transcript("claude-desktop", "sdk")] });
  assert.match(out, new RegExp(`==F==.*${ID}\\.jsonl`), "one pasted print hid a whole session from the archive");
  assert.match(out, /==C=="cwd":"\/Users\/me\/arvore-hub"/, "the row came back without the folder it was worked in");
});

test("a chat that ends with a pasted image keeps the last thing typed", () => {
  const out = archive({ [ID]: [...transcript("claude-desktop", "sdk"), pastedImage] });
  assert.match(out, /==P=="lastPrompt":"conserta o histórico"/, "a print at the end pushed the last prompt out of reach");
});

test("a file that is no chat of any kind still takes no row", () => {
  const out = archive({ [ID]: [`{"type":"summary","summary":"nada"}`, `{"type":"summary","summary":"nada"}`] });
  assert.doesNotMatch(out, new RegExp(`==F==.*${ID}\\.jsonl`));
});
