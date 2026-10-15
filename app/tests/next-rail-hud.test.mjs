import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(app, path), "utf8");
const source = read("src/app/next-rail-hud.js");
const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
const body = `${between("const HUD_GAP", "const HUD_HIDDEN")}${between("const pad", "function anchorOf")}${between("function hudPlace", "let hudView")}`;
const phrase = (t, v) => Object.entries(v || {}).reduce((s, [k, x]) => s.split(`{${k}}`).join(x), String(t));

function world({ st = {}, groupRow, healthRow, teamRows, worktreeRow, tasks = [], railMin = true } = {}) {
  const base = { blocks: [], keys: { new: "new", block: "block", tasks: "tasks", shelf: "shelf" }, alerts: null, ...st };
  const $ = () => ({ classList: { contains: () => railMin } });
  const names = ["st", "$", "phrase", "ofBlock", "stateColor", "keyLabel", "groupRow", "healthRow", "teamRows", "worktreeRow", "myOpenTasks", "taskBrief"];
  const values = [base, $, phrase, (b) => b.items, (state) => `c-${state}`, (b, digit) => `${b}${digit ?? ""}`, groupRow, healthRow, teamRows || (() => ({ active: [], away: [] })), worktreeRow || (() => null), () => tasks, (task) => task];
  return new Function(...names, `${body}\nreturn { hudContent, hudPlace };`)(...values);
}

const seat = (title, state) => ({ kind: "session", key: title, title, state });

test("a group's box lists every chat with its state colour, and goes orange only when one of them needs you", () => {
  const items = [seat("Ajuste no login", "needs"), seat("Testes do scanner", "idle"), { kind: "note", key: "n1" }];
  const { hudContent } = world({ st: { blocks: [{ items }, { items }] }, groupRow: (b, i) => ({ n: i + 1, label: "Ajuste no login +1", needs: true }) });
  const box = hudContent("group:1");
  assert.equal(box.tone, "acc");
  assert.equal(box.title, "Ajuste no login +1");
  assert.equal(box.meta, "group 02 · block2 · 2 chats");
  assert.deepEqual(box.rows.map((row) => [row.k, row.label, row.state, row.needs]), [["01", "Ajuste no login", "needs", true], ["02", "Testes do scanner", "idle", false]]);
  assert.equal(world({ st: { blocks: [{ items: [seat("Dump", "done")] }] }, groupRow: () => ({ n: 1, label: "Dump", needs: false }) }).hudContent("group:0").tone, "");
});

test("the health box draws one segment per check, the failing ones last, and says the worst problem", () => {
  const healthRow = () => ({ state: "warn", title: "1 warning", said: "the clock is off" });
  const box = world({ st: { alerts: { count: 1, total: 18 } }, healthRow }).hudContent("health");
  assert.equal(box.tone, "warn");
  assert.equal(box.title, "Environment · 1 warning");
  assert.equal(box.said, "the clock is off");
  assert.equal(box.seg.length, 18);
  assert.deepEqual(box.seg.map((one) => one.bad).lastIndexOf(false), 16);
  assert.deepEqual(box.foot, { left: "17 of 18 up to date", right: "diagnosis", act: "health" });
  const ok = world({ st: { alerts: { count: 0, total: 18 } }, healthRow: () => ({ state: "ok", title: "Environment ok", said: "" }) }).hudContent("health");
  assert.equal(ok.tone, "");
  assert.equal(ok.said, "");
});

const task = (id, live = false, passed = false) => ({ id, text: `task ${id}`, live, passed, say: live ? "working" : "to do", state: live ? "working" : "" });

test("the tasks box lists the first five, the ones with a live chat first, and counts what was left out", () => {
  const tasks = [task("a"), task("b", false, true), task("c", true), task("d"), task("e"), task("f", true, true), task("g")];
  const box = world({ tasks }).hudContent("short:tasks");
  assert.equal(box.big, true);
  assert.equal(box.meta, "7 open · 2 with you · tasks");
  assert.deepEqual(box.tasks.map((one) => one.key), ["c", "f", "a", "b", "d"]);
  assert.deepEqual(box.tasks.map((one) => one.k), ["01", "02", "03", "04", "05"]);
  assert.equal(box.tasks[0].state, "working");
  assert.deepEqual(box.foot, { left: "+2 tasks", right: "see all", act: "tasks" });
});

test("with nothing open the tasks box still offers the panel, and the shelf keeps its big title", () => {
  const box = world().hudContent("short:tasks");
  assert.equal(box.meta, "nothing open · tasks");
  assert.deepEqual(box.tasks, []);
  assert.deepEqual(box.foot, { left: "", right: "see all", act: "tasks" });
  assert.equal(world().hudContent("short:shelf").big, true);
});

test("a teammate and the away row say who and what is running; a row that left gives no box", () => {
  const teamRows = () => ({ active: [{ key: "ana@x", name: "ana", status: "3 seats" }], away: [{ key: "bia@y", name: "bia", status: "server asleep" }] });
  const { hudContent } = world({ teamRows });
  assert.equal(hudContent("mate:ana@x").meta, "3 seats");
  assert.equal(hudContent("off:bia@y").meta, "server asleep");
  assert.equal(hudContent("away").said, "bia");
  assert.equal(hudContent("mate:gone@z"), null);
  assert.equal(hudContent("wt"), null);
});

test("the line leaves the item's right edge and runs flat into the box, bending only when the box hits the bottom", () => {
  const { hudPlace } = world();
  const flat = hudPlace({ top: 160, height: 20, right: 48 }, { right: 64 }, 90, 800);
  assert.equal(flat.x, 120);
  assert.equal(flat.y, 149.5);
  assert.equal(flat.line, "48,170.5 90,170.5 120,170.5");
  const low = hudPlace({ top: 740, height: 34, right: 57 }, { right: 64 }, 100, 800);
  assert.equal(low.y, 692);
  assert.equal(low.line, "57,757.5 90,713 120,713");
});

test("hovering dims the rest of the hive and keeps the lit item, only in the new hive", () => {
  const css = read("assets/experience.css");
  assert.match(css, /body\.experience-next\.rail-hud-on :is\(#top, #stage, #rail-sessions, \.nr-sec, \.nr-row:not\(\.lit\), \.nr-card:not\(\.lit\)\) \{ opacity: \.38; \}/);
  assert.match(source, /if \(!experienceNext\(\)\) return;/);
  assert.match(read("app.html"), /<div id="rail-hud"><\/div>/);
});

test("the box stays open while the mouse travels to it and closes half a second after it leaves", () => {
  assert.match(source, /const HUD_LINGER = 500;/);
  assert.match(source, /\$\("rail-list"\)\.addEventListener\("pointerleave", lingerHud\);/);
  assert.match(source, /if \(!el\) return lit && lingerHud\(\);/, "crossing the rail's own margin on the way to the box closed it on the spot");
  assert.match(source, /if \(ev\.target\.closest\?\.\("\.rh-box"\)\) holdHud\(\);/);
  assert.match(read("assets/experience.css"), /#rail-hud \.rh-box \{ pointer-events: auto; \}/);
});

test("each state paints in the new hive's own palette, the same hues the tiles use, so working, done and idle stop looking alike", () => {
  const css = read("assets/experience.css");
  const hue = (state) => css.match(new RegExp(`\\[data-state="${state}"\\] \\{ --state-hue: ([^;]+); \\}`))?.[1];
  assert.equal(hue("needs"), "var(--accent)");
  assert.equal(hue("working"), "var(--blue)");
  assert.equal(hue("done"), "var(--green)");
  assert.match(css, /body\.experience-next \.tile\[data-state="working"\] \{ --pill-hue: var\(--blue\); \}/, "the tiles changed their palette and the rail did not follow");
  assert.match(css, /#rail-hud \.rh-bar i:is\(\[data-state="idle"\], \[data-state="stalled"\]\) \{ right: 65%; \}/, "a sleeping chat draws a short bar");
  assert.doesNotMatch(read("src/next-rail.jsx"), /style=\{\{ (background|color): /, "an inline colour from the old palette wins over the theme");
});
