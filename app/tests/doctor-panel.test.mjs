import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, dom, state } from "./dom.mjs";
import { test } from "node:test";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const strip = readFileSync(join(HERE, "assets/status-strip.mjs"), "utf8");
const page = readFileSync(join(HERE, "app.html"), "utf8");

const st = await state();
const { $ } = await app("core");
await app("history");
await app("hold-numbers");

test("the panel makes its own home, so no screen can take it away", () => {
  const mount = strip.slice(strip.indexOf("panel = document.getElementById"), strip.indexOf("strip.addEventListener"));
  assert.match(mount, /if \(!panel\)/, "the panel only exists if some page happened to declare it");
  assert.match(mount, /panel\.id = "doctor-panel"/);
  assert.match(mount, /document\.body\.appendChild\(panel\)/, "a page with no shell has nowhere to put the panel");
});

test("the panel waits below the shell, never above it", () => {
  const mount = strip.slice(strip.indexOf("panel = document.getElementById"), strip.indexOf("strip.addEventListener"));
  assert.match(mount, /shell\.insertAdjacentElement\("afterend", panel\)/);
  assert.doesNotMatch(
    mount,
    /strip\.insertAdjacentElement\("afterend", panel\)/,
    "the panel sits between the strip and the shell, so the page grid gives it the flexible row and the seats fall to the bottom half"
  );
});

test("a closed panel takes no room at all", () => {
  assert.match(
    strip,
    /#doctor-panel:empty \{ display: none; \}/,
    "an empty panel is still a box in the page grid, and a box in the page grid still gets a row"
  );
});

test("the panel is not named after a pod, and no page holds it any more", () => {
  assert.doesNotMatch(strip, /pod-doctor/);
  assert.doesNotMatch(page, /id="doctor-panel"|pod-doctor/, "a page declares the panel again, and losing that page loses the findings");
});

test("the alerts button reaches a panel that can answer", () => {
  let opened = 0;
  window.hiveDoctorOpen = () => { opened++; };
  try {
    $("btn-alerts").click();
    assert.equal(opened, 1, "the alerts button reaches nothing");
  } finally {
    delete window.hiveDoctorOpen;
  }
  assert.match(strip, /window\.hiveDoctorOpen = /, "the button calls something nothing defines");
});

test("a panel that opens can also close, from its own header", () => {
  assert.match(
    strip,
    /<button class="x" data-doctor="close"/,
    "the header draws a close button once the panel is open"
  );
  const click = strip.slice(strip.indexOf("function onClick"), strip.indexOf("if (what === \"reload\")"));
  assert.match(
    click,
    /if \(what === "close"\) \{\s*panelOn = false;/,
    "clicking close has to turn panelOn off, the only flag drawPanel reads"
  );
});

test("escape closes the panel without swallowing the key from anything else open", () => {
  assert.match(strip, /window\.hiveDoctorPanelOn = \(\) => panelOn;/, "nothing else can ask if the panel is open");
  const shut = [];
  window.hiveDoctorPanel = (open) => shut.push(open);
  st.typing = false;
  st.capturing = null;
  st.tourAt = -1;
  st.pending = null;
  const escape = () => {
    const key = new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.dispatchEvent(key);
    return key;
  };
  try {
    window.hiveDoctorPanelOn = () => false;
    escape();
    assert.deepEqual(shut, [], "escape closed a panel that was never open");
    window.hiveDoctorPanelOn = () => true;
    const key = escape();
    assert.deepEqual(shut, [false], "escape did not close the panel that was open");
    assert.equal(key.defaultPrevented, true, "the key went on to whatever else was listening");
  } finally {
    delete window.hiveDoctorPanel;
    delete window.hiveDoctorPanelOn;
  }
});

test("the strip has a row of its own in the page grid, and the shell has the one that stretches", () => {
  assert.match(page, /#status-strip|grid-template-rows/);
  assert.match(
    page,
    /grid-template-rows: auto auto minmax\(0, 1fr\)/,
    "the page grid changed shape — whoever comes third takes the height, and that has to be the shell"
  );
  const body = page.slice(page.indexOf(`<header id="top"`));
  assert.ok(
    body.indexOf(`id="status-strip"`) < body.indexOf(`id="shell"`),
    "the strip comes after the shell, so the two rows the page declares are not the ones it thinks"
  );
});

test("nothing offers to solve what is already solved", () => {
  const drawn = strip.slice(strip.indexOf("function drawPanel"), strip.indexOf("function draw()"));
  assert.match(drawn, /open\.map\(\(model\) => row\(model\)\)/, "the panel drew every row it knew, settled ones included");
  assert.match(drawn, /settledOf\(report\)\.map\(\(model\) => row\(model, "done"\)\)/, "what was solved has nowhere to go");
  const one = strip.slice(strip.indexOf("function row(model, kind)"), strip.indexOf("function passedFold"));
  assert.match(
    one,
    /const side = state === "mute"[\s\S]*?: loud && !open\s*\? actionButton\(model\)\s*: "";/,
    "a solved row that still draws an action invites you to solve a solved check"
  );
  assert.match(one, /\$\{open \? drawer\(model\) : ""\}/, "only a row you opened carries the recipe, and a settled row can never be open");
});

test("the settled group can be cleared, and clearing it forgets the receipts", () => {
  assert.match(strip, /data-doctor="clear-settled"/);
  assert.match(
    strip,
    /for \(const model of settledOf\(report\)\) model\.ids\.forEach\(forgetResult\)/,
    "clearing has to drop the receipts, or the group comes straight back on the next draw"
  );
});

test("the panel floats over the seats instead of pushing them up", () => {
  assert.match(strip, /#doctor-panel \{ position: fixed; inset: 0;/, "a panel in the page grid squeezes every seat into the top half");
  assert.match(strip, /card\.setAttribute\("role", "dialog"\)/, "a floating panel that does not say it is a dialog traps a screen reader behind it");
  const click = strip.slice(strip.indexOf("function onClick"), strip.indexOf("if (what === \"dismiss\")"));
  assert.match(click, /event\.target === panel && pressedOutside/, "clicking the dim around the card has to close it, and only a click that started there");
});

test("a finding takes the whole width of the card", () => {
  for (const part of ["ttl", "det", "drawer"]) {
    assert.doesNotMatch(
      strip,
      new RegExp(`#doctor-panel \\.${part} \\{[^}]*max-width`),
      `the ${part} of a finding stops short of the card it lives in`
    );
  }
});

test("the arrow on a finding opens it, not just the title", () => {
  const one = strip.slice(strip.indexOf("function row(model, kind)"), strip.indexOf("function passedFold"));
  assert.match(one, /<button class="tog" data-doctor="expand" data-id="\$\{esc\(keyOf\(model\)\)\}"/, "the arrow is a picture nobody listens to");
  assert.match(strip, /\.fold\[aria-expanded="true"\] \.chev/, "the passed fold opens with its arrow still pointing down");
});

test("the severity of a card is not carried by colour alone", () => {
  assert.match(strip, /const ICON = \{/);
  for (const state of ["fail", "warn", "done"]) {
    assert.ok(strip.includes(`${state}: \`<svg class="ic"`), `${state} has no shape, only a colour`);
  }
});

test("the strip runs the automatic recipes without opening the panel", () => {
  assert.match(strip, /data-doctor="fix-all"/);
  assert.match(strip, /if \(what === "fix-all"\) \{\n    fixAll\(\);/);
  const all = strip.slice(strip.indexOf("async function fixAll"), strip.indexOf("async function act"));
  assert.match(all, /for \(const id of ids\) \{/, "the recipes have to run one at a time — two of them touching the pod at once is a race");
  assert.match(all, /await pull\(false\)/, "the batch has to end on a fresh report, or the strip keeps offering what it just resolved");
});

test("what was silenced stays in the same list, and has a way back out of it", () => {
  assert.match(strip, /data-doctor="silence"/);
  assert.match(strip, /data-doctor="unsilence"/, "silencing with no way back is a warning you deleted, not one you postponed");
  const one = strip.slice(strip.indexOf("function row(model, kind)"), strip.indexOf("function passedFold"));
  assert.match(one, /phrase\("bring it back"\)/, "a silenced row you cannot unmute is a warning you deleted");
  const drawn = strip.slice(strip.indexOf("function drawPanel"), strip.indexOf("function draw()"));
  assert.match(
    drawn,
    /silencedOf\(report\)\.map\(\(model\) => row\(model, "mute"\)\)/,
    "what was silenced has nowhere to be seen, so nowhere to be brought back from"
  );
  assert.match(
    strip,
    /function passedFold[\s\S]*?silencedOf\(report\)/,
    "a silenced check counted among the ones that passed is a warning that disappeared twice"
  );
});

test("only a warning offers to be silenced", () => {
  const one = strip.slice(strip.indexOf("function drawer(model)"), strip.indexOf("function row(model, kind)"));
  assert.match(one, /canSilence\(model\) \?/, "a failure that can be silenced is a pod that goes down quietly");
});

test("the silence is written down, and a broken store does not take the strip with it", () => {
  assert.match(strip, /const SILENCE_KEY = "hive\.doctor\.silenced"/);
  assert.match(strip, /function mount\(\) \{\n  recallSilenced\(\);/, "a silence that dies on every restart is not worth asking for");
  const recall = strip.slice(strip.indexOf("function recallSilenced"), strip.indexOf("function mount"));
  assert.match(recall, /try \{[\s\S]*\} catch \{\}/, "localStorage throws on its own in a locked-down window");
});

test("an ignored check also has a way back, and the ignore is only offered when the server keeps it", () => {
  assert.match(strip, /data-doctor="unignore"/, "an ignore with no way back is a warning you deleted");
  const drawn = strip.slice(strip.indexOf("function drawer(model)"), strip.indexOf("function mutedSays"));
  assert.match(drawn, /report\?\.ignored \?/, "a server that cannot keep the ignore would forget it on the next check");
  assert.match(drawn, /phrase\("ignore it for 7 days"\)/, "a failure ignored for good is a pod that goes down quietly");
});
