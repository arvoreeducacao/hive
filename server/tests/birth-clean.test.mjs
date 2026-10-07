import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { aBirthCarriesAMission, arg, forgetWhatTheNameHeld } from "../engine/seat-core.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const driver = readFileSync(join(HERE, "engine/driver.mjs"), "utf8");
const turnDriver = readFileSync(join(HERE, "engine/turn-driver.mjs"), "utf8");
const codexDriver = readFileSync(join(HERE, "engine/codex-driver.mjs"), "utf8");

function slice(source, from, to, file) {
  const a = source.indexOf(from);
  const b = source.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${file}`);
  return source.slice(a, b);
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

const OLD_CHAT = "77cf1b2e-0000-4000-8000-000000000001";

async function deadSeatOnDisk(seat) {
  const base = await mkdtemp(join(tmpdir(), "hive-birth-"));
  const sessionFile = join(base, "sessions", `${seat}.json`);
  const eventsFile = join(base, "events", `${seat}.ndjson`);
  const shotsDir = join(base, "shots", seat);
  await mkdir(join(base, "sessions"), { recursive: true });
  await mkdir(join(base, "events"), { recursive: true });
  await mkdir(shotsDir, { recursive: true });
  await writeFile(sessionFile, JSON.stringify({ session_id: OLD_CHAT, model: "sonnet" }));
  await writeFile(eventsFile, `${JSON.stringify({ seq: 41, type: "user", subtype: "say" })}\n`);
  await writeFile(join(shotsDir, "1.png"), "not really a png");
  return { base, sessionFile, eventsFile, shotsDir };
}

test("a birth carries a mission, a restore carries a resume id, and only the first one is a birth", () => {
  assert.equal(aBirthCarriesAMission({ promptFile: "/p.md" }), true);
  assert.equal(aBirthCarriesAMission({ promptFile: "/p.md", resumeId: OLD_CHAT }), false);
  assert.equal(aBirthCarriesAMission({ resumeId: OLD_CHAT }), false);
  assert.equal(aBirthCarriesAMission({}), false);
  assert.equal(aBirthCarriesAMission(), false);
});

test("what the name held goes away, and it says whether anything was there", async () => {
  const seat = await deadSeatOnDisk("nome-repetido");
  try {
    assert.equal(await forgetWhatTheNameHeld(seat), true);
    assert.equal(existsSync(seat.sessionFile), false);
    assert.equal(existsSync(seat.eventsFile), false);
    assert.equal(existsSync(seat.shotsDir), false);
    assert.equal(await forgetWhatTheNameHeld(seat), false);
  } finally {
    await rm(seat.base, { recursive: true, force: true });
  }
});

async function driverBirth(argv, seat) {
  const source = `
    ${slice(driver, "const bornNow = aBirthCarriesAMission(", "\nlet seq = lastSeq(", "driver.mjs")}
    ${slice(driver, "if (nameHadAChatBefore) {\n  emit(", 'if (!resumeId) resumeId = arg("--resume-id");', "driver.mjs")}
    if (!resumeId) resumeId = arg("--resume-id");
    return { resumeId, storedSession, chosenModel, said };
  `;
  const said = [];
  return new AsyncFunction(
    "aBirthCarriesAMission", "forgetWhatTheNameHeld", "arg", "mkdir", "readFile", "emit",
    "name", "promptFile", "sessionFile", "eventsFile", "shotsDir", "chosenModel", "currentModel", "effortLevel", "homeAccount", "said",
    source
  )(
    aBirthCarriesAMission,
    forgetWhatTheNameHeld,
    (flag, fallback = "") => {
      const i = argv.indexOf(flag);
      return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
    },
    mkdir,
    (await import("node:fs/promises")).readFile,
    (event) => said.push(event),
    "nome-repetido",
    argv.includes("--prompt-file") ? argv[argv.indexOf("--prompt-file") + 1] : "",
    seat.sessionFile,
    seat.eventsFile,
    seat.shotsDir,
    "", "", "", "",
    said
  );
}

test("a new chat born on a dead seat's name does not wake up inside it", async () => {
  const seat = await deadSeatOnDisk("nome-repetido");
  try {
    const out = await driverBirth(["--prompt-file", "/tmp/mission.md"], seat);
    assert.equal(out.resumeId, "", "the new chat resumed the conversation the dead seat left behind");
    assert.equal(existsSync(seat.eventsFile), false, "the new chat inherited the dead seat's transcript");
    assert.equal(existsSync(seat.shotsDir), true, "the shots folder the seat writes into was left missing");
    assert.equal(out.said.length, 1, "the seat swapped a conversation without saying so");
    assert.match(out.said[0].message, /lived here before/);
  } finally {
    await rm(seat.base, { recursive: true, force: true });
  }
});

test("a restore of the same seat keeps the conversation and the transcript", async () => {
  const seat = await deadSeatOnDisk("nome-repetido");
  try {
    const out = await driverBirth(["--resume-id", OLD_CHAT], seat);
    assert.equal(out.resumeId, OLD_CHAT);
    assert.equal(out.chosenModel, "sonnet", "the restore lost the model the seat was on");
    assert.equal(existsSync(seat.eventsFile), true, "a restore wiped the transcript it was supposed to bring back");
    assert.deepEqual(out.said, []);
  } finally {
    await rm(seat.base, { recursive: true, force: true });
  }
});

test("reopening a seat with no mission still resumes what the name held", async () => {
  const seat = await deadSeatOnDisk("nome-repetido");
  try {
    const out = await driverBirth([], seat);
    assert.equal(out.resumeId, OLD_CHAT);
    assert.equal(existsSync(seat.eventsFile), true);
  } finally {
    await rm(seat.base, { recursive: true, force: true });
  }
});

const kimiDriver = readFileSync(join(HERE, "engine/kimi-driver.mjs"), "utf8");
const kiroDriver = readFileSync(join(HERE, "engine/kiro-driver.mjs"), "utf8");
const cursorDriver = readFileSync(join(HERE, "engine/cursor-driver.mjs"), "utf8");
const opencodeDriver = readFileSync(join(HERE, "engine/opencode-driver.mjs"), "utf8");
const OTHER_ENGINES = { "turn-driver.mjs": turnDriver, "codex-driver.mjs": codexDriver, "kimi-driver.mjs": kimiDriver, "kiro-driver.mjs": kiroDriver, "cursor-driver.mjs": cursorDriver, "opencode-driver.mjs": opencodeDriver };

async function turnDriverBirth(argv, seat, file = "turn-driver.mjs") {
  const text = OTHER_ENGINES[file];
  const source = `
    ${slice(text, "const bornNow = aBirthCarriesAMission(", "\nlet seq = lastSeq(", file)}
    ${slice(text, "if (nameHadAChatBefore) {\n  emit(", "} catch {}", file)}} catch {}
    return { sessionId, said };
  `;
  const said = [];
  return new AsyncFunction(
    "aBirthCarriesAMission", "forgetWhatTheNameHeld", "arg", "readFile", "emit",
    "name", "promptFile", "sessionFile", "eventsFile", "said",
    source
  )(
    aBirthCarriesAMission,
    forgetWhatTheNameHeld,
    (flag, fallback = "") => {
      const i = argv.indexOf(flag);
      return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
    },
    (await import("node:fs/promises")).readFile,
    (event) => said.push(event),
    "nome-repetido",
    argv.includes("--prompt-file") ? argv[argv.indexOf("--prompt-file") + 1] : "",
    seat.sessionFile,
    seat.eventsFile,
    said
  );
}

for (const file of Object.keys(OTHER_ENGINES)) {
  test(`${file} gets the same clean start, and the same untouched restore`, async () => {
    const born = await deadSeatOnDisk("nome-repetido");
    const back = await deadSeatOnDisk("nome-repetido");
    try {
      const fresh = await turnDriverBirth(["--prompt-file", "/tmp/mission.md"], born, file);
      assert.equal(fresh.sessionId, "");
      assert.equal(existsSync(born.eventsFile), false);
      const kept = await turnDriverBirth(["--resume-id", OLD_CHAT], back, file);
      assert.equal(kept.sessionId, OLD_CHAT);
      assert.equal(existsSync(back.eventsFile), true);
    } finally {
      await rm(born.base, { recursive: true, force: true });
      await rm(back.base, { recursive: true, force: true });
    }
  });
}

test("the flag reader both drivers use finds a value and falls back", () => {
  const argv = process.argv;
  process.argv = ["node", "driver.mjs", "--name", "seat", "--prompt-file", "/p.md"];
  try {
    assert.equal(arg("--prompt-file"), "/p.md");
    assert.equal(arg("--resume-id"), "");
    assert.equal(arg("--resume-id", "none"), "none");
  } finally {
    process.argv = argv;
  }
});
