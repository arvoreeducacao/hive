import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { seatCommand } from "../../server/engine/seat-command.mjs";
import { cleanAutocompact, cleanPatch, AUTOCOMPACT_AUTO } from "../lib/config.mjs";
import { autocompactFromConfig, autocompactThousands, AUTOCOMPACT_FLOOR_K, AUTOCOMPACT_CEILING_K } from "../../server/engine/agents.mjs";
import { app, dom, state } from "./dom.mjs";
import { test, after } from "node:test";
import assert from "node:assert/strict";

const st = await state();
const { $ } = await app("core");
const { adoptAutocompact, autocompactK, ceilingReachesASeat, paintAutocompactReach, seatTakesCeiling, setAutocompact } = await app("pure-helpers");
await app("themes");

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const page = readFileSync(join(HERE, "app.html"), "utf8");
const driver = readFileSync(join(HERE, "..", "server", "engine", "driver.mjs"), "utf8");

const complaint = `here: autocompact should be ${AUTOCOMPACT_AUTO} or a size from ${AUTOCOMPACT_FLOOR_K}k to ${AUTOCOMPACT_CEILING_K}k`;

const saved = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (where, opts) => {
  if (String(where) === "/api/config") {
    const sent = JSON.parse(opts.body).config;
    saved.push(sent.autocompact);
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ config: sent }), text: async () => JSON.stringify({ config: sent }) });
  }
  return Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => "{}" });
};
after(() => { globalThis.fetch = realFetch; });

const settled = async () => { for (let i = 0; i < 4; i++) await new Promise((again) => setImmediate(again)); };

test("a file that says nothing leaves the ceiling where Claude Code puts it", () => {
  const problems = [];
  assert.equal(cleanAutocompact(undefined, "here", problems), AUTOCOMPACT_AUTO);
  assert.equal(cleanAutocompact(AUTOCOMPACT_AUTO, "here", problems), AUTOCOMPACT_AUTO);
  assert.deepEqual(problems, []);
});

test("the config takes a size in k and turns the rest away", () => {
  const problems = [];
  assert.equal(cleanAutocompact("200k", "here", problems), "200k");
  assert.equal(cleanAutocompact(`${AUTOCOMPACT_FLOOR_K}k`, "here", problems), "100k");
  assert.equal(cleanAutocompact(`${AUTOCOMPACT_CEILING_K}k`, "here", problems), "1000k");
  assert.equal(cleanAutocompact("50k", "here", problems), AUTOCOMPACT_AUTO);
  assert.equal(cleanAutocompact("2000k", "here", problems), AUTOCOMPACT_AUTO);
  assert.equal(cleanAutocompact(200000, "here", problems), AUTOCOMPACT_AUTO);
  assert.equal(cleanAutocompact("nonsense", "here", problems), AUTOCOMPACT_AUTO);
  assert.deepEqual(problems, [complaint, complaint, complaint, complaint]);
});

test("a size typed loosely still lands, so a capital K is not a silent auto", () => {
  const problems = [];
  assert.equal(cleanAutocompact("200K", "here", problems), "200k");
  assert.equal(cleanAutocompact(" 300k ", "here", problems), "300k");
  assert.equal(cleanAutocompact("400 k", "here", problems), "400k");
  assert.deepEqual(problems, []);
});

test("the patch cleans the size the same way the file does", () => {
  const { clean, problems } = cleanPatch({ autocompact: "200k" });
  assert.equal(clean.autocompact, "200k");
  assert.deepEqual(problems, []);
});

test("the driver reads the size off the flag, and one out of range reads as none", () => {
  assert.equal(autocompactFromConfig({ autocompact: "200k" }), "200k");
  assert.equal(autocompactFromConfig({ autocompact: undefined }), "");
  assert.equal(autocompactFromConfig({ autocompact: AUTOCOMPACT_AUTO }), "");
  assert.equal(autocompactFromConfig({ autocompact: "50k" }), "");
  assert.equal(autocompactFromConfig({ autocompact: "200000" }), "");
  assert.equal(autocompactThousands("250k"), 250);
  assert.equal(autocompactThousands("0k"), 0);
});

test("every size the config keeps is one the claude flag accepts", () => {
  for (const k of [AUTOCOMPACT_FLOOR_K, 200, 350, AUTOCOMPACT_CEILING_K]) {
    const kept = cleanAutocompact(`${k}k`, "here", []);
    assert.match(kept, /^\d+k$/, "the flag takes auto or a size like 200k");
    assert.equal(autocompactFromConfig({ autocompact: kept }), kept);
  }
});

test("the server reads the size from the file and hands it to every seat it brings back", () => {
  assert.match(server, /autocompact: cleanAutocompact\(raw\.autocompact/);
  assert.match(server, /async function autocompactNow\(\)/);
  assert.match(server, /return autocompactFromConfig\(config\)/);
  assert.match(server, /--dangerously-skip-permissions\$\{compactFlag\}/);
  for (const carries of [
    /const compactAt = await autocompactNow\(\)/,
    /seats: wanted, compactAt/,
    /seats: \[back\], compactAt: await autocompactNow\(\)/,
    /autocompact: await autocompactNow\(\)/
  ]) assert.match(server, carries, "a way of bringing a seat back forgot the ceiling");
});

test("the structured seat takes the size through the agent SDK, not the flag", () => {
  assert.match(driver, /extraArgs\["autocompact"\] = autocompact/);
});

test("the settings screen counts in k, so the field holds three digits and not six", async () => {
  assert.match(page, /<h2>The conversation<\/h2>/);
  const field = $("f-compact");
  assert.equal(field.type, "number");
  assert.equal(field.min, "100");
  assert.equal(field.max, "1000");
  assert.equal(field.step, "50");
  assert.equal(field.placeholder, "auto");

  adoptAutocompact({ config: { autocompact: "350k" } });
  assert.equal(field.value, "350", "the screen shows the size in k, never in tokens");
  adoptAutocompact({ config: { autocompact: AUTOCOMPACT_AUTO } });
  assert.equal(field.value, "", "auto leaves the field empty, not zeroed");

  saved.length = 0;
  field.value = "250";
  field.dispatchEvent(new dom.Event("change"));
  await settled();
  assert.deepEqual(saved, ["250k"], "the field itself sends the change");
});

test("the screen sends a size in k, and auto when the field is emptied or out of range", async () => {
  saved.length = 0;
  for (const typed of ["200", "200k", "", "50", "5000", "nonsense"]) setAutocompact(typed);
  await settled();
  assert.deepEqual(saved, ["200k", "200k", AUTOCOMPACT_AUTO, AUTOCOMPACT_AUTO, AUTOCOMPACT_AUTO, AUTOCOMPACT_AUTO]);
  assert.equal(autocompactK("200"), 200);
  assert.equal(autocompactK("5000"), 0);
});

test("the ceiling reaches every native chat and a terminal on Claude, and the field says so", () => {
  assert.equal(seatTakesCeiling({ kind: "chat", agent: "claude" }), true);
  assert.equal(seatTakesCeiling({ kind: "structured" }), true, "no agent recorded means claude");
  for (const agent of ["codex", "kimi", "kiro", "cursor"]) {
    assert.equal(seatTakesCeiling({ kind: "structured", agent }), true, `a native ${agent} chat takes the ceiling since every driver got --autocompact`);
    assert.equal(seatTakesCeiling({ kind: "chat", agent }), false, `a ${agent} terminal has no flag for the ceiling`);
  }
  assert.equal(seatTakesCeiling({ kind: "shell" }), false);

  assert.equal(ceilingReachesASeat([{ kind: "chat", agent: "claude" }]), true);
  assert.equal(ceilingReachesASeat([{ kind: "structured", agent: "codex" }]), true);
  assert.equal(ceilingReachesASeat([{ kind: "chat", agent: "codex" }]), false);
  assert.equal(ceilingReachesASeat([{ kind: "chat", agent: "codex" }, { kind: "chat" }]), true);
  assert.equal(ceilingReachesASeat([]), true, "an empty fleet is no reason to lock the choice");
  assert.equal(ceilingReachesASeat([{ kind: "shell" }]), true, "a terminal alone says nothing about the agents");
  assert.equal(ceilingReachesASeat(undefined), true);

  assert.match(page, /Every native chat takes the ceiling, on Claude, Codex, Kimi, Kiro or Cursor; a terminal takes it only on Claude/);
  assert.doesNotMatch(page, /Only a seat on Claude takes the ceiling/);
  st.data = { sessions: [{ kind: "chat", agent: "codex" }] };
  paintAutocompactReach();
  assert.equal($("f-compact").disabled, true, "a fleet of terminals on other agents cannot take the ceiling");
  st.data = { sessions: [{ kind: "structured", agent: "kimi" }] };
  paintAutocompactReach();
  assert.equal($("f-compact").disabled, false, "a native kimi chat takes the ceiling");
  st.data = { sessions: [{ kind: "chat", agent: "claude" }] };
  paintAutocompactReach();
  assert.equal($("f-compact").disabled, false);
});

test("the server tells the screen which agent each seat runs", () => {
  assert.match(server, /const agent = seat\?\.agent \|\| "claude";/);
  assert.match(server, /kind: seat\?\.kind \|\| "",\n\s+agent,/);
});

test("a brand new seat carries the ceiling too, not just a revived one", () => {
  assert.match(server, /const compactAt = await autocompactNow\(\);/);
  assert.match(server, /agent: eng,\n        compactAt,/, "the seat opened on a hosted server loses its ceiling");
  const localSeatArgs = server.match(/await seatInATmuxWindow\(\{([^}]+)\}\)/)?.[1];
  assert.ok(localSeatArgs, "the server must open the local seat");
  assert.match(localSeatArgs, /(?:^|,)\s*compactAt\s*(?:,|$)/, "the seat opened on this machine loses its ceiling");
});

test("reviving a seat carries the ceiling, structured or plain, wherever it lands", () => {
  assert.match(server, /const compactFlag = compactAt \? ` --autocompact \$\{compactAt\}` : "";/);
  assert.equal(server.match(/compactFlag/g)?.length, 3, "one definition, one plain-chat use and one structured winCmd on this machine");
  assert.match(server, /resumeId: id, structured, compactAt/, "a seat revived inside a box loses its ceiling");
});

test("a new local seat's spawn command takes --autocompact too, structured and plain", () => {
  const seat = { hub: "/hub", name: "orca", stateDir: "/home/.hive", compactAt: "70000" };
  assert.match(seatCommand(seat), /--autocompact 70000/, "the plain chat opens without a ceiling");
  assert.match(seatCommand({ ...seat, structured: true, driver: "/x/driver.mjs" }), /--autocompact 70000/, "the structured seat opens without a ceiling");
  assert.doesNotMatch(seatCommand({ ...seat, compactAt: "" }), /--autocompact/);
});

test("a seat opened inside a box takes --autocompact too, structured and plain", () => {
  const seat = { hub: "/workspace/worktrees/hub/orca", name: "orca", stateDir: "/workspace/hive", side: "cloud", compactAt: "70000" };
  assert.match(seatCommand(seat), /--autocompact 70000/, "the plain chat in a box opens without a ceiling");
  assert.match(seatCommand({ ...seat, structured: true, driver: "/x/driver.mjs" }), /--autocompact 70000/, "the structured seat in a box opens without a ceiling");
});
