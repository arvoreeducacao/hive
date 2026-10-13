import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(app, path), "utf8");
const source = read("src/app/next-rail.js");
const body = source.slice(source.indexOf("function groupRow"), source.indexOf("function nextRailViewModel"));
const phrase = (t, v) => Object.entries(v || {}).reduce((s, [k, x]) => s.split(`{${k}}`).join(x), String(t));

function world(over = {}) {
  const st = { block: 0, mirrorKey: "", team: { here: "me@a", devs: [] }, alerts: null, data: { worktrees: null }, ...over };
  const ofBlock = (b) => b.items;
  const labelOf = (b, items) => ({ txt: items.length ? `${items[0].title}${items.length > 1 ? ` +${items.length - 1}` : ""}` : "" });
  const names = ["st", "phrase", "ofBlock", "labelOf", "blockNumber", "stateColor", "avatar"];
  const values = [st, phrase, ofBlock, labelOf, (i) => i + 1, (state) => `c-${state}`, (dev) => `<face ${dev}>`];
  return new Function(...names, `${body}\nreturn { groupRow, teamRows, healthRow, worktreeRow };`)(...values);
}

const seat = (title, state) => ({ kind: "session", key: title, title, state });

test("a group is the block: its number, the first chat +N, one dot per chat in its state colour", () => {
  const { groupRow } = world({ block: 1 });
  const row = groupRow({ id: "b2", items: [seat("Ajuste no login", "working"), seat("Testes do scanner", "idle")] }, 1);
  assert.equal(row.n, 2);
  assert.equal(row.label, "Ajuste no login +1");
  assert.equal(row.here, true);
  assert.equal(row.needs, false);
  assert.deepEqual(row.dots.map((dot) => dot.colour), ["c-working", "c-idle"]);
});

test("a group where a chat needs you is marked, so the number fills orange without any count badge", () => {
  const { groupRow } = world();
  const row = groupRow({ id: "b1", items: [seat("Exportar planilha", "needs")] }, 0);
  assert.equal(row.needs, true);
  assert.match(row.hint, /someone here needs you/);
});

test("the team splits into who has chats running and who is away, without local or cloud", () => {
  const { teamRows } = world({
    team: {
      here: "me@a",
      devs: [
        { key: "me@a", dev: "me", machine: "a", mine: true, seats: [{}], up: true },
        { key: "ana@x", dev: "ana", seats: [{}, {}, {}], up: true },
        { key: "bia@y", dev: "bia", seats: [], up: false }
      ]
    }
  });
  const { active, away } = teamRows();
  assert.deepEqual(active.map((one) => one.name), ["ana"]);
  assert.equal(active[0].said, "3 chats");
  assert.deepEqual(away.map((one) => one.name), ["bia"]);
});

test("the health card covers every check the header diamond used to count, from the pod and from this machine", () => {
  assert.deepEqual(world({ alerts: { count: 0, state: "ok", total: 18, items: [] } }).healthRow().state, "ok");
  assert.equal(world({ alerts: { count: 0, state: "ok", total: 18, items: [] } }).healthRow().said, "18 checks up to date");
  const warn = world({ alerts: { count: 1, state: "warn", total: 18, items: [{ headline: "this machine and the server disagree about what time it is" }] } }).healthRow();
  assert.equal(warn.state, "warn");
  assert.equal(warn.title, "1 warning");
  assert.match(warn.said, /disagree about what time/);
  assert.equal(world({ alerts: { count: 3, state: "fail", total: 18, items: [{ headline: "the server is not up" }] } }).healthRow().state, "fail");
});

test("the worktrees card only shows when there are worktrees", () => {
  assert.equal(world().worktreeRow(), null);
  assert.equal(world({ data: { worktrees: { count: 12, idle: 3 } } }).worktreeRow().said, "3 idle");
});

test("the new hive hides the old rail pieces and the header counters that moved into the rail; the current hive keeps them", () => {
  const css = read("assets/experience.css");
  assert.match(css, /body\.experience-next :is\(#rail-wt, #rail-team, #rail-toggle, #btn-tasks, #btn-alerts\) \{ display: none !important; \}/);
  assert.match(read("app.html"), /#rail-next, #rail-next-foot \{ display: none; \}/);
  assert.match(read("src/app/mirror.js"), /if \(!experienceNext\(\)\) for \(const g of \[/, "the cloud and local lists stay in the current hive only");
  assert.match(source, /localStorage\.getItem\(RAIL_MIN_KEY\) === null && experienceNext\(\)/, "the new hive starts with the rail closed unless the person chose otherwise");
});

test("the new hive drops the status strip under the top bar, since the health card in the rail says the same; the current hive keeps it", () => {
  const css = read("assets/experience.css");
  assert.match(css, /body\.experience-next #status-strip \{ height: 0 !important; padding: 0 !important; border: 0 !important; overflow: hidden; visibility: hidden; \}/);
  assert.doesNotMatch(css, /#status-strip \{[^}]*display: none/, "the strip owns a row of the body grid, and taking it out drops the shell into that row and the usage bar into the shell's");
  assert.match(read("app.html"), /body\.look-dimension:not\(\.experience-next\):has\(#status-strip:not\(:empty\)\)/, "panels do not leave room for a strip that is not there");
});
