import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, views } from "./dom.mjs";

await views();

const rows = await app("timeline-rows");

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const model = readFileSync(join(SRC, "app", "conversation-model.js"), "utf8");
const view = readFileSync(join(SRC, "conversation.jsx"), "utf8");

const say = (text, vars) => (vars ? String(text).replace(/\{(\w+)\}/g, (whole, key) => (key in vars ? String(vars[key]) : whole)) : text);

let made = 0;
const key = () => `w${++made}`;
const ask = (text, at = 1000) => ({ key: key(), kind: "bubble", body: text, text, at: String(at), dataset: {} });
const said = (text, at = 9000) => ({ key: key(), kind: "said", parts: [`<p>${text}</p>`], at: String(at), streaming: false });
const tool = (face, name, arg = "", extra = {}) => ({ key: key(), kind: "tool", face, tool: name, name, arg, running: false, stat: "ok", keep: false, ...extra });
const run = (extra) => tool("run", "Bash", "npm test", extra);
const read = (arg = "a.js") => tool("read", "Read", arg);
const edit = (file) => tool("write", "Edit", file, file ? { edit: { file } } : {});
const card = (cls) => ({ key: key(), kind: "node", el: { className: cls } });
const kinds = (list) => list.map((one) => (one.kind === "block" ? `${one.block.kind}${one.block.keep ? ":kept" : ""}${one.hidden ? ":hidden" : ""}` : one.kind));

const settled = (blocks) => rows.deriveTimelineRows(blocks, { say });

function opened(blocks) {
  const fold = settled(blocks).find((one) => one.kind === "turn-fold");
  assert.ok(fold, "the settled turn folds its work");
  return rows.deriveTimelineRows(blocks, { say, unfolded: new Set([fold.fold]) });
}

const summaries = (list) => list.filter((one) => one.kind === "work-toggle").map((one) => one.summary);

test("a run of calls becomes one line that says what it did, and a lone call stays a line of its own", () => {
  const out = opened([ask("arruma"), run(), run(), said("pronto", 4000), read(), said("fim")]);
  assert.deepEqual(kinds(out), ["bubble", "turn-fold", "work-toggle", "said", "tool", "said"]);
  assert.deepEqual(summaries(out), ["Ran 2 commands"]);
});

test("words in the middle cut the run in two, so the order stays honest", () => {
  const out = opened([ask("arruma"), run(), run(), said("metade", 4000), read(), read("b.js"), said("fim")]);
  assert.deepEqual(kinds(out), ["bubble", "turn-fold", "work-toggle", "said", "work-toggle", "said"]);
  assert.deepEqual(summaries(out), ["Ran 2 commands", "Read 2 files"]);
});

test("a question card and a published artifact are never folded away", () => {
  const out = settled([ask("decide"), run(), run(), card("sv-q"), card("sv-art"), said("fim")]);
  assert.deepEqual(kinds(out), ["bubble", "turn-fold", "node", "node", "said"]);
});

test("a picture is never folded away, and it cuts the run around it", () => {
  const shot = () => tool("read", "Read", "tela.png", { keep: true });
  assert.deepEqual(kinds(settled([ask("tira o print"), run(), shot(), said("fim")])), ["bubble", "turn-fold", "tool:kept", "said"]);
  const out = opened([ask("tira o print"), run(), run(), shot(), run(), run(), said("fim")]);
  assert.deepEqual(kinds(out), ["bubble", "turn-fold", "work-toggle", "tool:kept", "work-toggle", "said"]);
  assert.deepEqual(kinds(opened([ask("dois prints"), run(), shot(), shot(), said("fim")])), ["bubble", "turn-fold", "tool", "tool:kept", "tool:kept", "said"]);
});

test("a run that ended on a failure says so on its line", () => {
  const out = opened([ask("testa"), read(), run({ stat: "bad" }), said("falhou")]);
  const line = out.find((one) => one.kind === "work-toggle");
  assert.equal(line.bad, true);
  assert.equal(opened([ask("testa"), run({ stat: "bad" }), read(), said("ok")]).find((one) => one.kind === "work-toggle").bad, false);
});

test("while the turn works, the calls that finished stay in order and the running one is the live line", () => {
  const out = rows.deriveTimelineRows([ask("arruma"), run(), run(), said("metade", 4000), read(), tool("run", "Bash", "npm run lint", { running: true, stat: "" })], { say, busy: true, since: 1000 });
  assert.deepEqual(kinds(out), ["bubble", "working", "work-toggle", "said", "work-live"]);
  assert.match(out.at(-1).label, /npm run lint|Running/);
});

test("the summary says what the run did, not how many times it did something", () => {
  assert.equal(rows.summarizeWork([read(), read("b.js"), run()], say), "Read 2 files and ran 1 command");
});

test("editing one file four times is one file changed, and a write with no name still counts", () => {
  assert.equal(rows.summarizeWork([edit("app/app.html"), edit("app/app.html"), edit("app/app.html"), edit("app/app.html"), edit("app/assets/i18n.mjs")], say), "Changed 2 files");
  assert.equal(rows.summarizeWork([edit(""), edit("app/app.html")], say), "Changed 2 files");
});

test("past two kinds, the rest are other actions, and a kind with no verb still counts", () => {
  assert.equal(rows.summarizeWork([tool("agent", "Task", "x"), run(), read()], say), "Ran 1 agent, ran 1 command, and performed 1 other action");
  assert.equal(rows.summarizeWork([tool("", "mcp__db__query", "q"), read()], say), "Used 1 tool and read 1 file");
});

test("a tool result that carries a picture marks its card to stay on the surface", () => {
  const shots = model.slice(model.indexOf("function svConvShots(e, card, paths)"), model.indexOf("function svConvRunOff("));
  assert.match(shots, /card\.keep = true;/);
  assert.match(view, /"sv-keep": !!props\.block\.keep/);
});
