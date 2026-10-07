import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "experience.css"), "utf8");
const DORMANT = 'body.experience-next #canvas > .tile:is([data-state="idle"], [data-state="stalled"]):not(.focused, .open, .typing, .draft):not(:has(.sv-composer.ready))';
const rule = (tail) => css.split("\n").find((line) => line.startsWith(`${DORMANT}${tail}`)) || "";

test("a chat that stopped a while ago goes dark until the person picks it", () => {
  assert.ok(DORMANT.includes('[data-state="idle"]') && DORMANT.includes('[data-state="stalled"]'), "only idle and quiet chats sleep; ready, done, needs and working stay lit");
  assert.ok(DORMANT.includes(":not(.focused, .open"), "picking the chat wakes it, and leaving it without a message puts it back to sleep");
  assert.ok(DORMANT.includes(":not(:has(.sv-composer.ready))"), "a chat with an unsent message never sleeps");
  assert.match(rule(", "), /background-color: var\(--bg\) !important;/, "the chat darkens to the page background");
  assert.match(rule("::after"), /display: none;/, "it drops the halftone shadow");
});

test("the sleeping chat keeps its header and shows the same plain skeleton whatever the conversation", () => {
  assert.match(rule(" .well > * {"), /visibility: hidden;/, "the conversation and its scrollbar are gone, so nothing mirrors the messages");
  const bones = rule(" .well::before");
  assert.match(bones, /--bone: color-mix\(in srgb, var\(--line\) 70%, var\(--bg\)\);/, "the bones sit a step darker than the lines");
  assert.equal((bones.match(/linear-gradient\(var\(--bone\) 0 8px, transparent 8px\)/g) || []).length, 4, "a paragraph of four lines, repeated down the chat");
  assert.match(bones, /112px repeat-y/, "the paragraph repeats every 112px");
  assert.match(rule(" .well {"), /mask: radial-gradient\(circle, #000 \.7px, transparent \.9px\) 0 0 \/ 3px 3px;/, "the bones wear the same 3px halftone as the loading skeleton");
  assert.doesNotMatch(css.split("\n").filter((line) => line.startsWith(DORMANT)).join("\n"), /\.t-head \*|\.side \*/, "the header stays readable");
  assert.match(rule(" .side {"), /opacity: \.6;/, "the header dims a little but can still be read");
});

test("a slow, faint shine crosses the sleeping chat, each at its own time, and rests when motion is off", () => {
  assert.match(rule(" .well::after"), /mix-blend-mode: color-dodge;/, "the shine lifts the bars and leaves the dark background as it was");
  const moving = css.split("\n").find((line) => line.startsWith("body.experience-next:not(.no-motion) #canvas > .tile") && line.includes(".well::after")) || "";
  assert.match(moving, /animation: sleeping-shimmer 8s linear infinite;/, "one pass every eight seconds");
  assert.match(moving, /animation-delay: calc\(sibling-index\(\) \* -2\.7s\);/, "sleeping chats never shine together");
  assert.match(css, new RegExp(`@media \\(prefers-reduced-motion: reduce\\) \\{ ${DORMANT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\.well::after \\{ animation: none !important; \\} \\}`), "reduced motion keeps it still");
});
