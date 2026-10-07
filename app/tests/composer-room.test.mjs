import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const stretches = readFileSync(join(HERE, "src", "app", "chat-stretches.js"), "utf8");
const draftSeat = readFileSync(join(HERE, "src", "app", "draft-seat.js"), "utf8");

function cut(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const styles = new Map();
const svRoom = new Function("getComputedStyle", `
  ${cut(stretches, "const SV_SPARE", "\nfunction healStructuredScroll", "chat-stretches.js")}
  return svRoom;
`)((el) => styles.get(el) || { position: "static", marginTop: "0px", marginBottom: "0px" });

function box(className, offsetHeight, style) {
  const el = { className, offsetHeight, classList: { contains: (c) => className.split(" ").includes(c) } };
  if (style) styles.set(el, { position: "static", marginTop: "0px", marginBottom: "0px", ...style });
  return el;
}

function seat({ tall, chrome = 45, textareaTall = 66, extra = [] }) {
  const scroll = box("sv-scroll", tall);
  const composer = box("sv-composer", chrome + textareaTall, { marginTop: "8px", marginBottom: "12px" });
  const textarea = { offsetHeight: textareaTall, closest: (sel) => (sel === ".sv-composer" ? composer : null) };
  const host = { clientHeight: tall, children: [scroll, ...extra, composer] };
  return { host, textarea };
}

test("a tall seat leaves the textarea its full growth", () => {
  const { host, textarea } = seat({ tall: 600 });
  assert.ok(svRoom(host, textarea) >= 260, "a 600px seat must not cap a 260px textarea");
});

test("a short seat caps the textarea so the pills and the send button stay on screen", () => {
  const { host, textarea } = seat({ tall: 210 });
  assert.equal(svRoom(host, textarea), 210 - 64 - 45 - 20);
});

test("whatever else sits in flow above the composer takes from the room too", () => {
  const queue = box("sv-queue", 40, { marginTop: "0px", marginBottom: "6px" });
  const floating = box("sv-suggest", 120, { position: "absolute" });
  const shut = box("sv-subs", 0);
  const { host, textarea } = seat({ tall: 300, extra: [queue, floating, shut] });
  assert.equal(svRoom(host, textarea), 300 - 64 - 45 - 20 - 46);
});

test("a seat that is not laid out yet does not cap anything", () => {
  const { host, textarea } = seat({ tall: 0 });
  assert.equal(svRoom(host, textarea), Infinity);
});

test("the room never goes negative, the css floor takes over from there", () => {
  const { host, textarea } = seat({ tall: 90 });
  assert.equal(svRoom(host, textarea), 0);
});

test("both composers grow through the room, and grow again when the seat resizes", () => {
  for (const [what, src] of [["chat-stretches.js", stretches], ["draft-seat.js", draftSeat]]) {
    const autosize = cut(src, "const autosize = () => {", "\n\n", what);
    assert.match(autosize, /svRoom\(host, textarea\)/, `${what} sizes its textarea without asking the seat how much room there is`);
    assert.match(autosize, /minHeight = room < COMPOSER_MIN \? `\$\{Math\.max\(SV_FLOOR, room\)\}px` : ""/, `${what} keeps the 66px floor even when the seat has no room for it`);
    assert.match(autosize, /new ResizeObserver\(\(\) => \{ if \(textarea\.value\) autosize\(\); \}\)\.observe\(host\)/, `${what} does not re-run autosize when the seat changes size`);
  }
});
