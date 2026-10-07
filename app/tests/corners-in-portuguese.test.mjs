import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { state } from "./dom.mjs";
import { speak } from "../assets/i18n.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const src = (file) => readFileSync(join(HERE, "src", file), "utf8");

const st = await state();
const { ago } = await import("../src/app/pod.js");
const { prPopRowModel } = await import("../src/app/seat-menu.js");

const inPortuguese = (run) => { speak("pt-BR"); try { return run(); } finally { speak("en"); } };

test("a time ago speaks the language of the app, days included", () => {
  const twoDays = new Date(Date.now() - 50 * 3600 * 1000).toISOString();
  assert.equal(ago(twoDays), "2 days");
  assert.equal(inPortuguese(() => ago(twoDays)), "2 dias");
});

test("a pull request row says when it moved in the language of the app, not 'N days ago' in english", () => {
  const p = { key: "k", repo: "org/repo", number: 7, title: "t", updatedAt: new Date(Date.now() - 50 * 3600 * 1000).toISOString(), ci: "none", state: "open" };
  assert.equal(prPopRowModel(p).when, "2 days ago");
  assert.equal(inPortuguese(() => prPopRowModel(p).when), "faz 2 dias");
  assert.equal(inPortuguese(() => prPopRowModel({ ...p, ci: "running", ciDetail: "" }).why), "checagens rodando");
  assert.equal(inPortuguese(() => prPopRowModel({ ...p, review: "changes_requested" }).why), "mudanças pedidas");
});

test("the strings the palette, the history, the usage screen and the day screen paint go through phrase()", () => {
  const palette = src("app/palette.js");
  assert.match(palette, /section\(phrase\("blocks"\)/);
  assert.match(palette, /section\(phrase\("actions"\)/);
  assert.match(palette, /\{ sec: phrase\("files"\) \}/);
  assert.match(palette, /name: phrase\("open file…"\)/);
  assert.match(palette, /name: phrase\("block \{n\}", \{ n: blockNumber\(i\) \}\)/);
  assert.match(palette, /phrase\("environment · \{n\} warnings"/);
  assert.match(palette, /phrase\("checked \{when\}", \{ when: st\.alerts\.checked \}\)/);
  assert.match(src("app/history.js"), /phrase\("\{n\} sessions", \{ n: st\.histSessions\.length \}\)/);
  assert.match(src("app/usage.js"), /phrase\("\{from\} to \{to\}"/);
  assert.match(src("app/usage.js"), /say: say \? phrase\(say\) : ""/);
  assert.match(src("app/usage.js"), /mean: number\(p\.mean_when_active\)/);
  assert.match(src("app/arrange.js"), /phrase\("\{dev\}'s hive", \{ dev: st\.mirrorDev \}\)/);
  assert.match(src("app/day.js"), /const byHandSay = \(n\) => n === 1 \? phrase\("1 chat you opened by hand"\)/);
});

test("the row dot and the sync strip of the history no longer share a class, so neither wears the other's size", () => {
  assert.equal(page.split("\n").filter((line) => line.trim().startsWith(".hist-sync {")).length, 1);
  assert.match(page, /\.hist-synced \{ font-size: 8px;/);
  assert.match(src("panels/history.jsx"), /class=\{`hist-synced \$\{props\.row\.sync\.tone\}`\}/);
});

test("a header button the model hides stays hidden even though its style unsets the browser's defaults", () => {
  assert.match(page, /\.t-home\[hidden\], \.t-fold\[hidden\] \{ display: none; \}/);
});

test("the rail that folds on a narrow window folds its worktree summary too, like the rail folded by hand", () => {
  const at = page.indexOf("@media (max-width: 1100px) {");
  const block = page.slice(at, page.indexOf("\n  }", at));
  assert.match(block, /\.rail-wt \.wt-sub, \.rail-wt \.wt-track, \.rail-wt \.wt-name \{ display: none; \}/);
  assert.match(block, /\.kn \.kn-who, \.kn \.kn-acts, \.kn-title span \{ display: none; \}/);
});
