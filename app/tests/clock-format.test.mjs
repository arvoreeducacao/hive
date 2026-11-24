import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TIME_FORMATS, chooseTimeFormat, clockHM, clockOptions, timeFormatOf } from "../src/app/clock-format.js";
import { TIME_FORMAT_CHOICES, TIME_FORMAT_DEFAULT, cleanPatch, cleanTimeFormat } from "../lib/config.mjs";

const at = new Date(2026, 10, 23, 14, 5);

test("the system default leaves every place formatting its time as it always did", () => {
  chooseTimeFormat("system");
  const asked = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  assert.equal(clockOptions(asked), asked);
  assert.deepEqual(clockOptions(), {});
  assert.equal(clockHM(at), "14:05");
});

test("12-hour and 24-hour win over what each place asked for", () => {
  chooseTimeFormat("12h");
  assert.deepEqual(clockOptions({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }), { hour: "2-digit", minute: "2-digit", hourCycle: "h12" });
  assert.deepEqual(clockOptions({ hour: "numeric", hour12: false }), { hour: "numeric", hourCycle: "h12" });
  assert.match(clockHM(at), /2:05/);
  assert.doesNotMatch(clockHM(at), /14/);
  chooseTimeFormat("24h");
  assert.deepEqual(clockOptions({ hour: "numeric", minute: "2-digit" }), { hour: "numeric", minute: "2-digit", hourCycle: "h23" });
  assert.equal(at.toLocaleTimeString("en-US", clockOptions({ hour: "2-digit", minute: "2-digit" })), "14:05");
  assert.equal(clockHM(at), "14:05");
  chooseTimeFormat("system");
});

test("an unknown choice falls back to the system default", () => {
  assert.equal(chooseTimeFormat("13h"), "system");
  assert.equal(timeFormatOf(), "system");
});

test("the file and the app agree on the choices, and a bad one is reported", () => {
  assert.deepEqual(TIME_FORMATS, TIME_FORMAT_CHOICES);
  assert.equal(TIME_FORMAT_DEFAULT, "system");
  const problems = [];
  assert.equal(cleanTimeFormat(undefined, "f", problems), "system");
  assert.equal(cleanTimeFormat(" 12h ", "f", problems), "12h");
  assert.deepEqual(problems, []);
  assert.equal(cleanTimeFormat("am/pm", "f", problems), "system");
  assert.equal(problems.length, 1);
  assert.deepEqual(cleanPatch({ timeFormat: "24h" }), { clean: { timeFormat: "24h" }, problems: [] });
});

test("the server reads the choice back out of the file", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const shape = server.slice(server.indexOf("async function readConfig()"), server.indexOf("async function autocompactNow("));
  assert.match(shape, /timeFormat: cleanTimeFormat\(raw\.timeFormat, tilde\(CONFIG_FILE\), problems\),/);
});

test("every place that writes an hour goes through the choice", () => {
  const files = ["src/app/tasks.js", "src/app/limit-chip.js", "src/app/timeline-rows.js", "src/app/usage.js", "src/app/subagents-dock.js", "src/app/mirror.js", "src/app/routines.js", "src/app/focus-navigation.js", "src/app/worktrees.js", "src/structures/cockpit.js", "src/structures/inbox.js", "src/structures/atmosphere.js"];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /from "(\.\/|\.\.\/app\/)clock-format\.js"/, `${file} should take the time format`);
    for (const line of source.split("\n").filter((one) => /toLocale(Time|Date)?String\(/.test(one) && /hour/.test(one))) assert.match(line, /clockOptions\(/, `${file}: ${line.trim()}`);
  }
});
