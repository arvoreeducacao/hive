import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, views } from "./dom.mjs";

await views();

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");

function slice(from, to) {
  const a = page.indexOf(from);
  const b = page.indexOf(to);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of app.html`);
  return page.slice(a, b);
}

const { getStructured, svNarrow } = await app("chat-stretches");
const { svConvSeed } = await app("conversation-model");
const { structPool } = await app("structured-seats");

let seq = 0;

function pane() {
  const name = `seat-${++seq}`;
  const e = getStructured({ name, where: "local" });
  e.conv = svConvSeed();
  return e;
}

const widthOf = (host, px) => Object.defineProperty(host, "clientWidth", { value: px, configurable: true });

test("the queue above the box wears the floating skin", () => {
  const css = slice("  .sv-queue { position: relative; display: none", ".sv-composer { position: relative");
  for (const rule of [".sv-queue {"]) {
    const at = css.indexOf(rule);
    assert.ok(at >= 0, `${rule} should live in that stretch of css`);
    assert.match(css.slice(at, at + 420), /var\(--float-bg\)/);
    assert.match(css.slice(at, at + 420), /border-radius: 12px/);
  }
  assert.match(slice(".sv-jump { position: absolute", ".sv-jump:hover"), /var\(--float-bg\)|color-mix/);
});

test("the pane knows it is narrow, and only says so when it changes", () => {
  const e = pane();
  widthOf(e.host, 900);
  svNarrow(e);
  assert.ok(!e.host.classList.contains("sv-narrow"));
  widthOf(e.host, 520);
  svNarrow(e);
  assert.ok(e.host.classList.contains("sv-narrow"));
  widthOf(e.host, 900);
  svNarrow(e);
  assert.ok(!e.host.classList.contains("sv-narrow"));
  structPool.delete(e.name);
});

