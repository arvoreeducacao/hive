import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";

Object.defineProperty(globalThis.navigator, "platform", { value: "MacIntel", configurable: true });
const st = await state();
const now = { microphone: "granted", screen: "denied", accessibility: "denied", disk: "denied" };
const opened = [];
let tell = null;
window.hiveMacPermissions = {
  now: async () => ({ mac: true, now: { ...now } }),
  open: async (kind) => { opened.push(kind); return { ok: true, status: now[kind] }; },
  hear: (fn) => { tell = fn; }
};
globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
await views();
const { openMacPermissions, macPermissionsHere } = await app("mac-permissions");
const { paintAgentUpdates } = await app("agent-updates");
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((done) => setTimeout(done, 5)); };

test("the permissions dialog lists the four, and Allow opens System Settings and waits with the steps", async () => {
  assert.equal(macPermissionsHere(), true);
  const opener = document.getElementById("perm-open");
  opener.focus();
  await openMacPermissions();
  const box = document.getElementById("macperm");
  assert.equal(box.classList.contains("on"), true);
  assert.equal(box.querySelectorAll(".mp-row").length, 4);
  assert.equal(box.querySelectorAll(".mp-ok").length, 1);
  box.querySelector('.mp-allow[data-kind="accessibility"]').click();
  await settle();
  assert.deepEqual(opened, ["accessibility"]);
  const row = box.querySelector('.mp-row[data-kind="accessibility"]');
  assert.equal(row.classList.contains("waiting"), true);
  assert.ok(row.querySelector(".mp-how"));
  assert.equal(box.querySelector(".mp-again").hidden, false);
  tell("accessibility", "granted");
  assert.equal(box.querySelector('.mp-row[data-kind="accessibility"] .mp-ok') !== null, true, "the row turns allowed when macOS says so");
  box.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(box.classList.contains("on"), false);
  assert.ok(document.activeElement === opener, "the focus goes back to where it came from");
});

test("asked for one permission, the dialog opens straight on it", async () => {
  opened.length = 0;
  await openMacPermissions("disk");
  assert.deepEqual(opened, ["disk"]);
  document.getElementById("macperm").querySelector(".mp-close").click();
});

test("an agent on a version with a known problem shows at the top, with the update that fixes it", () => {
  st.autoUpdateAgents = true;
  st.providers = [{ id: "codex", name: "Codex", installed: true, enabled: true, behind: true, version: "0.140.0", latest: "0.159.2", canUpdate: true, compat: { status: "broken", version: "0.140.0", recommended: ">=0.159.0", latestFixes: true } }];
  paintAgentUpdates();
  assert.equal(document.getElementById("btn-agents").hidden, false);
  const risk = document.querySelector("#ap-list .ap-risk");
  assert.ok(risk);
  assert.match(risk.textContent, /0\.140\.0/);
  assert.ok(risk.querySelector('[data-ap-update="codex"]'));
  st.providers = [{ id: "codex", name: "Codex", installed: true, enabled: true, behind: false, version: "0.160.0", latest: "0.160.0", compat: null }];
  paintAgentUpdates();
  assert.equal(document.getElementById("btn-agents").hidden, true);
  st.providers = [];
});

test("with the switch off, the / menu leaves out the skills and keeps the commands", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/app/chat-stretches.js", import.meta.url)), "utf8");
  const body = source.slice(source.indexOf("function offeredCommands(e) {"), source.indexOf("export {", source.indexOf("function offeredCommands(e) {")));
  const offered = new Function("st", "phrase", "composerCommands", `${body}\nreturn offeredCommands;`);
  const e = { slash: ["compact", "review", "delivery", "screenbook"], skills: new Set(["delivery", "screenbook"]), slashInfo: {} };
  const none = () => [];
  assert.deepEqual(offered({ slashSkills: true }, (t) => t, none)(e).list, ["compact", "review", "delivery", "screenbook", "fresh"]);
  assert.deepEqual(offered({ slashSkills: false }, (t) => t, none)(e).list, ["compact", "review", "fresh"]);
});

test("closing a chat skips the question when the setting is off, and an anonymous one always asks", () => {
  const source = readFileSync(fileURLToPath(new URL("../src/app/tiles.js", import.meta.url)), "utf8");
  assert.match(source, /const asks = s\.anon \|\| confirmBefore\(s\.kind === "shell" \? "closeTerminal" : "closeChat"\);/);
  assert.match(source, /const ok = !asks \? true : s\.anon/);
});

test("archiving with the setting on asks once, and a yes archives without asking again", async () => {
  const { adoptBehavior } = await app("behavior-settings");
  const { archiveSeatNow } = await app("mirror");
  const archived = [];
  const opened = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/api/seat/archive")) archived.push(JSON.parse(init.body).name);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  const box = document.getElementById("confirm");
  const watch = new MutationObserver(() => { if (box.classList.contains("on")) opened.push(1); });
  watch.observe(box, { attributes: true, attributeFilter: ["class"] });
  adoptBehavior({ config: { confirm: { archive: true } } });
  const done = archiveSeatNow({ name: "lote", where: "local", title: "Lote" });
  await settle();
  assert.equal(box.classList.contains("on"), true);
  document.getElementById("c-yes").click();
  await done;
  await settle();
  assert.deepEqual(archived, ["lote"]);
  assert.equal(opened.length, 1, "one question for one archive");
  adoptBehavior({ config: {} });
  opened.length = 0;
  await archiveSeatNow({ name: "solto", where: "local" });
  await settle();
  assert.deepEqual(archived, ["lote", "solto"]);
  assert.equal(opened.length, 0, "with the setting off nothing asks");
  watch.disconnect();
});

test("unpinning and archiving ask through the same setting, in one place each", () => {
  const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  const marks = read("../src/app/seat-marks.js");
  assert.match(marks, /const asksBefore = \(action\) => confirmBefore\(action\);/);
  const pin = marks.slice(marks.indexOf("async function togglePinSeat("), marks.indexOf("\n}\n", marks.indexOf("async function togglePinSeat(")));
  assert.equal(pin.match(/await ask\(/g)?.length, 1);
  const mirror = read("../src/app/mirror.js");
  const archive = mirror.slice(mirror.indexOf("async function archiveSeatNow("), mirror.indexOf("\n}\n", mirror.indexOf("async function archiveSeatNow(")));
  assert.equal(archive.match(/await ask\(/g)?.length, 1);
  assert.match(archive, /asksBefore\("archive"\)/);
});
