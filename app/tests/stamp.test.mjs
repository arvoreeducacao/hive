import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, views } from "./dom.mjs";

await views();

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const stretches = readFileSync(join(HERE, "src", "app", "chat-stretches.js"), "utf8");

function slice(from, to) {
  const a = page.indexOf(from);
  const b = page.indexOf(to);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of app.html`);
  return page.slice(a, b);
}

const { getStructured, svGutter } = await app("chat-stretches");
const { svConvActions, svConvPush, svConvSeed } = await app("conversation-model");
const { structPool, svRunTail, svRunText, svSaidNear } = await app("structured-seats");
const { mountConversation } = await import(new URL("../src/views.js", import.meta.url).href);

let seq = 0;

function pane(at = 1000) {
  const name = `stamp-${++seq}`;
  const e = getStructured({ name, where: "local" });
  e.at = at;
  e.conv = svConvSeed();
  e.convView = mountConversation(e.scroll, svConvActions(e));
  return e;
}

const said = (e, text, over = {}) => svConvPush(e, { key: `k${e.conv.blocks.length}`, kind: "said", parts: [`<p>${text}</p>`], streaming: false, ...over });
const bubble = (e, text) => svConvPush(e, { key: `k${e.conv.blocks.length}`, kind: "bubble", dataset: {}, body: `<p>${text}</p>`, thumbs: [] });
const worked = (e) => svConvPush(e, { key: `k${e.conv.blocks.length}`, kind: "tool", keep: true, running: false, face: "misc", arg: "", items: [] });

const stampedInModel = (e) => e.conv.blocks.filter((one) => one.stamped);
const stampedOnScreen = (e) => [...e.scroll.querySelectorAll(".stamped")];
const shut = (e) => { e.convView.dispose(); structPool.delete(e.name); };

test("three things said in a row carry one stamp, on the last of them", () => {
  const e = pane();
  said(e, "um");
  said(e, "dois");
  said(e, "três");
  assert.deepEqual(stampedInModel(e).map((one) => one.parts[0]), ["<p>três</p>"]);
  assert.deepEqual(stampedOnScreen(e).map((el) => el.textContent), ["três"]);
  shut(e);
});

test("work between two things the model said does not end the run", () => {
  const e = pane();
  said(e, "um");
  worked(e);
  said(e, "dois");
  assert.deepEqual(stampedInModel(e).map((one) => one.parts[0]), ["<p>dois</p>"]);
  shut(e);
});

test("anything else between them does end the run — each voice keeps its own stamp", () => {
  const e = pane();
  said(e, "um");
  bubble(e, "eu");
  said(e, "dois");
  assert.equal(stampedInModel(e).length, 3);
  assert.deepEqual(stampedOnScreen(e).map((el) => el.textContent), ["um", "eu", "dois"]);
  shut(e);
});

test("what the stamp copies is the whole run, in the order it was said", () => {
  const e = pane();
  said(e, "um");
  worked(e);
  said(e, "dois");
  said(e, "três");
  const tail = stampedOnScreen(e)[0];
  assert.equal(svRunText(tail), "um\n\ndois\n\ntrês");
  shut(e);
});

test("the clock on the stamp is when the run began, not when it ended", () => {
  const e = pane(5000);
  said(e, "um");
  e.at = 5001;
  said(e, "dois");
  const tail = stampedOnScreen(e)[0];
  assert.equal(tail.dataset.said, "5000");
  assert.equal(tail.dataset.at, "5001");
  shut(e);
});

test("hovering the first block of a run finds the stamp at the end of it", () => {
  const e = pane();
  said(e, "um");
  worked(e);
  said(e, "dois");
  const blocks = [...e.scroll.querySelectorAll(".sv-msg")];
  assert.equal(svRunTail(blocks[0]), blocks[1]);
  assert.equal(svSaidNear(blocks[0], false), blocks[1], "the work between them is stepped over");
  shut(e);
});

test("a run still being written has no stamp to light yet", () => {
  const e = pane();
  said(e, "um");
  said(e, "", { streaming: true, parts: [] });
  const blocks = [...e.scroll.querySelectorAll(".sv-msg")];
  assert.equal(svRunTail(blocks[0]), null);
  shut(e);
});

test("the stamp of what you said hangs under the bubble, not inside it", () => {
  const css = slice("  .sv-msg.stamped {", "  .sv-quote-pop {");
  assert.match(css, /\.sv-user\.stamped \{[^}]*margin-bottom:/);
  assert.doesNotMatch(css, /\.sv-user\.stamped \{[^}]*padding-bottom:/);
  assert.match(css, /\.sv-user \.sv-stamp \{[^}]*bottom: -\d+px/);
});

test("only the block the mouse is over lights up — hover alone no longer shows the stamp", () => {
  const css = slice("  .sv-msg.stamped {", "  .sv-quote-pop {");
  assert.match(css, /\.sv-msg\.stamped\.lit \.sv-stamp, \.sv-user\.stamped\.lit \.sv-stamp/);
});

test("the bar of the scroll is measured and handed to the css as --sv-bar", () => {
  const e = pane();
  Object.defineProperty(e.scroll, "offsetWidth", { value: 500, configurable: true });
  Object.defineProperty(e.scroll, "clientWidth", { value: 488, configurable: true });
  svGutter(e);
  assert.equal(e.host.style.getPropertyValue("--sv-bar"), "12px");
  shut(e);
});

test("the scroll is watched by an observer of its own, which tells the gutter the bar showed up without looping on the room it reserves", () => {
  const wiring = stretches.slice(stretches.indexOf("const room = new ResizeObserver"), stretches.indexOf("const textarea = host.querySelector"));
  assert.match(wiring, /const gutter = new ResizeObserver\(\(\) => svGutter\(e\)\)/);
  assert.match(wiring, /gutter\.observe\(scroll\)/);
  assert.doesNotMatch(wiring, /room\.observe\(scroll\)/, "svReserve writes the scroll's padding — an observer that watches the scroll and writes to it loops");
});

test("everything floating over the scroll stops before the bar, on the right only", () => {
  for (const name of [".sv-composer", ".sv-queue", ".sv-subs"]) {
    const css = page.split("\n").find((line) => line.trim().startsWith(`${name} {`));
    assert.ok(css, `no rule for ${name}`);
    assert.match(css, /calc\(12px \+ var\(--sv-bar\)\) [^;]*12px/, `${name} still ends flush against the bar`);
  }
});
