import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { liveOf } from "../lib/team.mjs";
import { withoutCommand } from "../assets/slash-command.mjs";
import { app } from "./dom.mjs";

const { commandTray } = await app("said-command");

const HERE = fileURLToPath(new URL("../src/app", import.meta.url));
const read = (file) => readFileSync(join(HERE, file), "utf8");
const stretches = read("chat-stretches.js");
const suggest = read("suggest-menu.js");
const draft = read("draft-seat.js");
const panes = read("chat-and-panes.js");
const seats = read("structured-seats.js");
const said = read("said-command.js");
const images = read("pinned-images.js");
const model = read("conversation-model.js");
const driver = readFileSync(join(fileURLToPath(new URL("../..", import.meta.url)), "server", "engine", "driver.mjs"), "utf8");

function slice(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

test("the init keeps hiding the commands bound to a terminal, and forgets last session's details", () => {
  const init = slice(panes, 'if (ev.subtype === "init")', 'if (ev.subtype === "status")', "chat-and-panes.js");
  assert.match(init, /new Set\(ev\.terminal_slash_commands \|\| \[\]\)/, "the terminal-bound list still filters");
  assert.match(init, /e\.slashGone = gone/, "the filter is kept for the details that arrive later");
  assert.match(init, /e\.slashInfo = \{\}/, "a fresh session starts with no descriptions carried over");
});

test("the details only land whole: a card without commands changes nothing", () => {
  const changed = slice(panes, 'if (ev.subtype === "commands_changed")', 'if (ev.subtype === "status")', "chat-and-panes.js");
  assert.match(changed, /if \(Array\.isArray\(ev\.commands\)\)/, "a mirrored card, stripped of its list, must not wipe the seat's own");
  assert.match(changed, /gone\.has\(c\.name\)/, "a terminal-bound command stays hidden even when detailed");
  assert.match(changed, /description: typeof c\.description === "string" \? c\.description : ""/, "the description is a string or nothing");
  assert.match(changed, /argumentHint: typeof c\.argumentHint === "string" \? c\.argumentHint : ""/, "the hint is a string or nothing");
});

test("the menu only spends a column on descriptions where descriptions exist", () => {
  const render = slice(suggest, "const renderMenu = (emptyMsg)", "const computeSuggest", "suggest-menu.js");
  assert.match(render, /m\.kind === "slash" \? m\.info\?\.\[item\] : null/, "peers, people and files carry no description");
  assert.match(render, /<span class="desc">/, "the slash row shows the description");
  assert.match(render, /<span class="hint">/, "the slash row shows how to argue with the command");
});

test("the mirrored card of a commands change carries nothing to fingerprint the machine with", () => {
  const e = liveOf({ seq: 2, ts: "t", type: "system", subtype: "commands_changed", commands: [{ name: "prs", description: "track prs", argumentHint: "" }] });
  assert.deepEqual(Object.keys(e), ["seq", "ts", "type", "subtype", "model"]);
});

test("the claude driver asks the session for its command details once it introduces itself", () => {
  assert.match(driver, /session\.supportedCommands\?\.\(\)/, "older SDKs without the call are tolerated");
  assert.match(driver, /subtype: "commands_changed", commands/, "the details ride the event the frontend already understands");
  assert.match(driver, /Array\.isArray\(commands\) && commands\.length/, "an empty answer is not worth an event");
});

test("the command menu opens wherever the slash was typed, not only at the start", () => {
  const compute = slice(suggest, "const computeSuggest = ()", "const key = (kev)", "suggest-menu.js");
  assert.match(compute, /const slash = before\.match\(\/\(\^\|\[\\s\(\[\{'"\]\)\\\/\(\[\\w:-\]\*\)\$\/\)/, "the slash gets the same opening as #, ! and @");
  assert.doesNotMatch(compute, /if \(slash && !v\.slice\(caret\)\.trim\(\)\)/, "words after the caret no longer keep the menu shut");
  assert.match(compute, /start: caret - q\.length - 1, end: caret/, "the menu owns only the fragment it matched — start 0 would eat the words and their image marks");
});

test("the list is grouped by family, and the best match stays the selected one", () => {
  const compute = slice(suggest, "const computeSuggest = ()", "const key = (kev)", "suggest-menu.js");
  assert.match(compute, /SLASH_FAMILY_ORDER\.indexOf\(slashFamily\(a\)\)/, "the ranking is laid out family by family");
  assert.match(compute, /const best = Math\.max\(0, items\.indexOf\(hits\[0\] \|\| ""\)\)/, "grouping moves the best match but must not deselect it");
  const render = slice(suggest, "const renderMenu = (emptyMsg)", "const computeSuggest", "suggest-menu.js");
  assert.match(render, /family === group \? "" : `<div class="grp">/, "a family heading is written once, not on every row");
  assert.match(render, /suggestKeys\.hidden = m\.kind !== "slash"/, "the keys row shows for commands and hides for the other marks");
});

test("the three families are told apart by what they cost, not by how they are spelled", () => {
  const block = slice(seats, "const SLASH_FAMILY_ORDER", "function svLine", "structured-seats.js");
  assert.match(block, /isNativeCommand\(name\) \? "seat"/, "a command that acts on the app spends no turn and leads the list");
  assert.match(block, /String\(name\)\.includes\(":"\) \? "packaged"/, "a plugin or skill command is namespaced for its owner");
});

test("a command picked from the menu stays where it was called, like every other mark", () => {
  const pick = slice(suggest, "const pickMenu = (i)", "const renderMenu = (emptyMsg)", "suggest-menu.js");
  assert.match(pick, /textarea\.value = v\.slice\(0, m\.start\) \+ inserted \+ v\.slice\(m\.end\);/, "the command lands in the hole the fragment left, not at the head");
  assert.doesNotMatch(pick, /textarea\.value = head \+ body;/, "nothing is moved to the front of the box any more");
  assert.doesNotMatch(pick, /stripCommand/, "and picking a second command does not delete the first");
  const seatPick = slice(stretches, "const menu = suggestMenu({", "const recall = (text)", "chat-stretches.js");
  assert.match(seatPick, /if \(kind === "slash"\) e\.command\.set\(item\)/, "the mark goes to the command just picked");
  assert.match(seatPick, /paintInk\(\)/, "the mark is painted on the spot, without waiting for an input event");
});

test("an empty chat gets the same menu as a running one, fed from what the app already holds", () => {
  const draftMenu = slice(draft, "const menu = suggestMenu({", 'host.querySelector(".sv-composer").addEventListener("submit"', "draft-seat.js");
  assert.match(draftMenu, /commands: \(\) => draftCommands\(d\)/, "the command list is borrowed, since the seat has no driver to ask yet");
  assert.match(draftMenu, /find: \(q\) => hubFiles\(d\.where, q\)/, "a file is looked up in the hub, since the seat has no directory of its own yet");
  const borrowed = slice(draft, "function draftCommands(d) {", "async function hubFiles", "draft-seat.js");
  assert.match(borrowed, /seatAgent\(one\) === d\.e\.agent && one\.slash\?\.length/, "only a chat of the same kind knows the same commands");
  const keys = slice(draft, 'textarea.addEventListener("keydown"', 'textarea.addEventListener("input"', "draft-seat.js");
  assert.match(keys, /if \(menu\.key\(kev\)\) return;/, "enter on an open menu picks, and never opens the chat");
});

test("the box paints the command itself instead of parking a chip outside it", () => {
  const paint = slice(stretches, "const paintInk = ()", "const syncCommand = ()", "chat-stretches.js");
  assert.match(paint, /const spot = name \? commandSpot\(said, name\) : null/, "the mark is painted over the word the person called, wherever it sits");
  assert.match(paint, /\.\.\.\(spot \? \[\{ \.\.\.spot, cls: "ink-cmd" \}\] : \[\]\)/, "a name that is no longer in the text paints nothing");
  assert.match(paint, /said\.slice\(last, mark\.start\)/, "the words in front of the command are painted in front of it");
  assert.match(paint, /composer\.classList\.remove\("inked"\)/, "with no command the textarea goes back to painting its own words");
  assert.match(paint, /ink\.scrollTop = textarea\.scrollTop/, "a box that scrolled would otherwise show the mark on the wrong line");

  let told = 0;
  const held = commandTray(() => { told++; });
  assert.equal(commandTray.length, 1, "the command tray takes no element — it has no chip to hang");
  held.set("prs");
  assert.equal(held.name(), "prs");
  assert.equal(held.count(), 1);
  held.clear();
  assert.equal(held.count(), 0);
  assert.equal(told, 2, "the box is told when the command comes and when it goes");
  assert.doesNotMatch(said, /createElement/, "the command no longer builds a chip of its own");
  assert.doesNotMatch(said, /att command/, "and no longer sits in the attachment row");
});

test("the two layers keep the same room for a scrollbar, so a long text wraps the same in both", () => {
  const page = readFileSync(join(HERE, "..", "..", "app.html"), "utf8");
  const box = slice(page, ".sv-composer textarea {", ".sv-composer textarea:focus", "app.html");
  const layer = slice(page, ".sv-ink {", ".sv-ink:empty", "app.html");
  assert.match(box, /scrollbar-gutter: stable/, "where the system paints a scrollbar that takes room, the box loses width the layer would keep");
  assert.match(layer, /scrollbar-gutter: stable/, "and the layer has to lose the same width, or it fits a word the box already pushed to the next line");
});

test("the pinned name is a mirror of the text, so any edit can give the command up", () => {
  const sync = slice(stretches, "const syncCommand = ()", "e.tray = imageTray", "chat-stretches.js");
  assert.match(sync, /commandsIn\(textarea\.value\)\.filter/, "the whole text decides, not only its head, and not the menu");
  assert.match(sync, /\(e\.slash \|\| \[\]\)\.includes\(name\) \|\| isNativeCommand\(name\)/, "a word that is not a command of this session is just a word");
  assert.match(sync, /if \(held && found\.some\(\(one\) => one\.name === held\)\) return;/, "a second command written by hand does not steal the mark from the one already running");
  const keys = slice(stretches, 'if (kev.key === "Backspace"', "if (menu.key(kev)) return;", "chat-stretches.js");
  assert.match(keys, /textarea\.setSelectionRange\(spot\.start, spot\.end\)/, "the first backspace marks the command wherever it is, not the first letters of the box");
});

test("what goes out carries the command in front, wherever it sat in the box", () => {
  const say = slice(stretches, "const say = (cutIn = false) => {", 'host.querySelector(".sv-composer").addEventListener("submit"', "chat-stretches.js");
  assert.match(say, /withCommand\(called, withQuotes\(/, "quotes go inside the argument, never ahead of the command");
  assert.match(say, /withoutCommand\(called, woven\.text\)/, "the word is lifted out of the sentence first, or the message goes out calling it twice");
});

test("what was said keeps the mark it had in the box", () => {
  const painted = slice(seats, "function paintSaidCommand(el)", "function svLine(e, cls, text)", "structured-seats.js");
  assert.match(painted, /const name = commandOf\(said\)/, "the transcript reads the head the same way the box does");
  assert.match(painted, /said\.slice\(name\.length \+ 1\)/, "and the argument keeps every space the person typed");
  const line = slice(model, "function svConvLine(e, cls, text)", "\nfunction svConvMentions", "conversation-model.js");
  assert.match(line, /if \(!\/\(\^\|\\s\)sv-user\(\\s\|\$\)\/\.test\(cls\)\) return/, "only the lines the person said carry a command");
  assert.match(line, /fillSaid\(\w+, [\w.]+, paintSaidCommand\)/, "the line the person said never gets its command marked");
});

test("a message that goes out gives its command up, like it gives images and quotes up", () => {
  const deliver = slice(stretches, "const deliver = (text, sending, fromDraft, cutIn = false)", "const dropFromTray", "chat-stretches.js");
  assert.equal((deliver.match(/e\.command\.clear\(\)/g) || []).length, 4, "the mirrored seat, the shell line, the command the app answers itself and the sent message all let it go");
  const native = slice(stretches, "const native = text.match(NATIVE_COMMANDS)", "svCmd(e, sending.length", "chat-stretches.js");
  assert.match(native, /e\.command\.clear\(\); paintReady\(\); paintInk\(\)/, "a spent /model or /agents leaves no mark painted over an empty box");
});

test("the attachment row is back to images and quotes only", () => {
  const tray = slice(images, "function imageTray(tray, box, origin)", "\nexport {", "pinned-images.js");
  assert.match(tray, /\.att:not\(\.quote\)/, "clearing the images still spares the quotes");
  assert.doesNotMatch(tray, /:not\(\.command\)/, "there is no command chip left to spare");
});

test("a pinned command with an empty box still lights the send button", () => {
  const ready = slice(stretches, "const paintReady = ()", "e.quotes = quoteTray", "chat-stretches.js");
  assert.match(ready, /!!e\.command\?\.count\(\)/, "asking a skill with no words of your own is a message");
});

test("lifting the command out of the middle of a sentence does not leave a hole", () => {
  assert.equal(withoutCommand("prs", "olha isso /prs agora"), "olha isso agora", "one of the two spaces around it goes with it");
  assert.equal(withoutCommand("prs", "/prs olha isso"), " olha isso", "at the head there is only one space to give, and withCommand trims it");
  assert.equal(withoutCommand("prs", "olha isso"), "olha isso", "a command that is not there takes nothing with it");
});
