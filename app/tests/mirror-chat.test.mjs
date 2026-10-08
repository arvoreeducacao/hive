import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state, views } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(HERE, "src/app");
const page = readFileSync(join(HERE, "app.html"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const teamRoutes = readFileSync(join(HERE, "routes/team.mjs"), "utf8");
const source = (name) => readFileSync(join(SRC, `${name}.js`), "utf8");
const teamSource = source("team");
const mirrorSource = source("mirror");
const stretches = source("chat-stretches");
const mirrorView = readFileSync(join(HERE, "src/mirror.jsx"), "utf8");

function cut(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of ${what}`);
  return text.slice(a, b);
}

const st = await state();
await views();
const { $ } = await app("core");
const { mirrorCardModel, renderMirror } = await app("team");
const { mountMirror } = await import(new URL("../src/views.js", import.meta.url).href);

const NOTHING = { side() {}, keyboard() {}, say() {}, wireTalk() {} };

const seat = { name: "b2", title: "Persist merged PRs", state: "working", when: "at 20:00", where: "local" };
const row = { dev: "jonas", up: true, seats: [seat] };

st.team = { me: "vini", sharing: true, devs: [row] };

function card(one, its, { shown = false } = {}) {
  const was = st.mirrorOpen;
  st.mirrorOpen = shown ? one.name : "";
  const model = { empty: null, cards: [mirrorCardModel(one, its)] };
  st.mirrorOpen = was;
  const host = document.createElement("div");
  mountMirror(host, NOTHING).show(model);
  return host.firstElementChild;
}

test("the deck and the opened seat draw the same card, never two", () => {
  const deck = card(seat, row).querySelector(".side").outerHTML;
  assert.equal(card(seat, row, { shown: true }).querySelector(".side").outerHTML, deck,
    "the opened seat rewrote the card instead of reusing it");
});

test("the opened mirror puts the chat where a seat of ours puts its terminal", () => {
  const open = card(seat, row, { shown: true });
  assert.match(open.innerHTML, /<div class="well structured"><\/div>/);
  assert.match(open.innerHTML, /class="kb-bar"/);
  assert.ok(open.innerHTML.indexOf('class="well structured"') > open.innerHTML.indexOf('class="side"'), "the head comes before the chat");
});

test("a seat title written by someone else is escaped on the way in", () => {
  const said = '<img src=x onerror="boom">';
  const open = card({ ...seat, title: said }, row, { shown: true });
  assert.equal(open.querySelectorAll("img").length, 0, "the title reached the page as markup");
  assert.equal(open.querySelector(".t-name").textContent, said);
  assert.match(open.innerHTML, /&lt;img/);
});

test("a seat away from home names whose server it is, one on a laptop names the person", () => {
  assert.match(card({ ...seat, where: "cloud" }, row, { shown: true }).innerHTML, /jonas's server/);
  assert.match(card(seat, row, { shown: true }).innerHTML, /jonas's machine/);
  assert.doesNotMatch(card({ ...seat, where: "cloud" }, row, { shown: true }).innerHTML, /ws-|pod/,
    "the screen names one deployment's way of hosting instead of whose server it is");
});

test("the reconnect loop never dials a mirrored seat", () => {
  assert.match(cut(stretches, "function keepStructuredUp()", "function healStructuredScroll()", "chat-stretches.js"), /!e\.host\.isConnected \|\| e\.mirror/);
});

test("the composer of a mirrored seat travels as a file, never as a driver command", () => {
  const deliver = cut(stretches, "  const deliver = (text, sending, fromDraft) =>", "  const dropFromTray =", "chat-stretches.js");
  assert.match(deliver, /if \(e\.mirror\)/);
  assert.match(deliver, /sayToTeamSeat\(e\.mirror\.dev, e\.mirror\.seat/);
  assert.ok(deliver.indexOf("if (e.mirror)") < deliver.indexOf("svCmd("), "svCmd is reached before the mirror is ruled out");
});

test("only the seat being watched is on screen while the chat is open", () => {
  assert.match(page, /#mirror\.zoom \.tile\.mirror:not\(\.open\) \{ display: none; \}/);
});

test("a hive with many seats scrolls instead of squeezing every card flat", () => {
  assert.match(page, /#mirror \{[^}]*overflow-y: auto;/, "the deck of another hive has no scroll of its own");
  assert.match(page, /\.tile\.mirror \{[^}]*min-height: 168px;/, "a card can be shrunk until its title and summary are cut off");
  assert.match(page, /\.tile\.mirror\.lent \{[^}]*min-height: 300px;/, "a borrowed seat has no room left for what was said");
});

test("an event that arrives twice is painted once", () => {
  const pull = cut(mirrorSource, "async function pullMirrorLive()", "function focusedSeat(", "mirror.js");
  assert.match(pull, /for \(const ev of events\) svEvent\(e, ev\);/, "the visitor keeps a rule of its own about what it already has");
  const rule = cut(source("chat-and-panes"), "function svAlreadyPainted(", "function svEvent(", "chat-and-panes.js");
  assert.match(rule, /<= \(e\.lastSeq \|\| 0\)\) return true/, "the chat lost the rule that says what was already painted");
});

test("the chat stops reading the moment the keyboard is not ours", () => {
  const pull = cut(mirrorSource, "async function pullMirrorLive()", "function focusedSeat(", "mirror.js");
  assert.match(pull, /card\?\.keyboard\?\.with !== st\.team\.me/);
  assert.match(pull, /stopBeat\("mirror"\)/);
});

test("the mirrored chat runs off the modules it names, and paints a card that is really there", () => {
  st.mirrorDev = "jonas";
  st.mirrorOpen = null;
  st.team = { me: "vini", sharing: true, devs: [{ ...row, seats: [{ ...seat, keyboard: { with: "vini", turns: [{ who: "you", text: "**bold**" }] } }] }] };
  renderMirror();
  const painted = $("mirror").querySelector('[data-key="jonas/b2"]');
  assert.ok(painted, "the deck painted no card for the seat it was given");
  assert.equal(painted.querySelector(".t-name").textContent, "Persist merged PRs");
  const said = card(st.team.devs[0].seats[0], st.team.devs[0]).innerHTML;
  assert.match(said, /class="kb-bar mine"/, "the borrowed keyboard says nothing on the card");
  assert.match(said, /<div class="turn md you"/);
  assert.match(said, /<b>bold<\/b>/, "the turn reached the page as flat text");
  st.mirrorDev = "";
  st.team = { me: "vini", sharing: true, devs: [row] };
  renderMirror();
  assert.equal($("mirror").querySelector('[data-key="jonas/b2"]'), null, "leaving the hive left its card behind");
});

test("a turn is written by the markdown renderer, not flattened by hand", () => {
  const talk = cut(teamSource, "function mirrorTalkModel(", "function mirrorCardModel(", "team.js");
  assert.match(talk, /renderMarkdown\(t\.text\)/);
  assert.ok(!talk.includes("esc(t.text)"), "the turn still reaches the page as flat text");
  assert.match(mirrorView, /class="turn md"/, "the turn carries no class for the markdown styles to hang on");
});

test("the markdown styles are not locked inside the chat bubble", () => {
  assert.match(page, /\n {2}\.md p \{/, "a turn outside .sv-msg gets no paragraph spacing");
  assert.match(page, /\n {2}\.mirror-talk \.turn \.md-code \{/, "a fenced block in a turn is left at chat size");
});

test("a picture in a mirrored turn leads nowhere instead of taking the panel with it", () => {
  const wire = cut(teamSource, "function wireMirrorTalk(", "const mirrorCards", "team.js");
  assert.match(wire, /a\.md-shot/);
  assert.match(wire, /ev\.preventDefault\(\)/);
  assert.match(wire, /wireShelfLinks\(name, talk\)/, "a page on the shelf is the team's and should open");
});

test("closing the chat stops the reading and keeps what was read", () => {
  const close = cut(mirrorSource, "function closeMirrorChat(", "function forgetMirrorChats(", "mirror.js");
  assert.match(close, /stopBeat\("mirror"\)/);
  assert.ok(!close.includes("structPool.delete"), "closing throws the conversation away, so opening reads it again");
});

test("the next read asks for the byte the last one stopped at, and the byte belongs to the chat", () => {
  const pull = cut(mirrorSource, "async function pullMirrorLive()", "function focusedSeat(", "mirror.js");
  assert.match(pull, /at=\$\{e\.mirrorAt \|\| 0\}/, "the read starts from a place that is not the chat's own");
  assert.match(pull, /e\.mirrorAt = Number\(r\.at\)/);
  assert.ok(!/\blet mirrorAt = 0/.test(mirrorSource), "the offset is a module-wide one again, and reopening starts from the top");
});

test("a hive we walked away from keeps no conversation", () => {
  const forget = cut(mirrorSource, "function forgetMirrorChats(", "function sweepMirrorChats(", "mirror.js");
  assert.match(forget, /key\.startsWith\("team:"\)/);
  assert.match(forget, /forgetStruct\(key\)/, "forgetting a chat also drops what it had subscribed to");
  const doors = [["function goToTeam(key)", "function leaveMirror()"], ["function leaveMirror()", "function wireMirrorTalk("]];
  for (const [from, to] of doors) {
    assert.match(cut(teamSource, from, to, "team.js"), /forgetMirrorChats\(/, `${from} leaves the chats of the hive behind`);
  }
});

test("a keyboard that went home loses its cached chat, and the one on screen does not", () => {
  const sweep = cut(mirrorSource, "function sweepMirrorChats(", "function mirrorWait(", "mirror.js");
  assert.match(sweep, /name === st\.mirrorOpen \|\| mine\.get\(name\)/, "the chat under the cursor can be emptied mid-read");
  assert.match(sweep, /seat\.keyboard\?\.with === st\.team\.me/);
  assert.match(cut(teamSource, "function renderMirror()", "if (!row || !row.seats.length)", "team.js"), /sweepMirrorChats\(row\)/);
});

test("the first read says it is reading, and stops saying it when the bytes land", () => {
  const wait = cut(mirrorSource, "function mirrorWait(", "async function pullMirrorLive()", "mirror.js");
  assert.match(wait, /svLine\(e, "sv-meta wait"/);
  const pull = cut(mirrorSource, "async function pullMirrorLive()", "function focusedSeat(", "mirror.js");
  assert.match(pull, /const cold = !e\.lastSeq && !e\.mirrorNote/, "a chat we already have would claim to be loading again");
  assert.ok(pull.indexOf('mirrorWait(e, "")') < pull.indexOf("e.mirrorNote = true"),
    "the empty note is written while the read is still in flight");
  assert.match(pull, /did not answer — trying again/, "a read that failed leaves the box saying it is still reading");
});

test("the fast beat asks for the hive in hand, not for the cluster", () => {
  const pace = cut(teamSource, "function paceTeam()", "async function askForKeyboard(", "team.js");
  assert.match(pace, /pullTeam\(true, teamFocus\(\)\)/);
  assert.ok(!/pullTeam\(fast \|\| !!st\.mirrorDev\)/.test(teamSource), "the fast beat forces the whole team again");
  const focus = cut(teamSource, "const teamFocus = ()", "function paceTeam()", "team.js");
  assert.match(focus, /st\.mirrorDev/);
  assert.match(focus, /s\.keyboard && s\.keyboard\.with === st\.team\.me/);
  const pull = cut(teamSource, "async function pullTeam(", "function goToTeam(", "team.js");
  assert.match(pull, /\?dev=\$\{encodeURIComponent\(only\)\}/);
});

test("visiting one hive goes to the board, never to the cluster", () => {
  const hive = cut(server, "async function readHive(", "async function peerKeyOf(", "server.mjs");
  assert.ok(!/kubectl|"exec"|PANEL_FILE/.test(hive), "the visit still reads a panel out of a pod");
  assert.match(hive, /return readTeam\(/, "the visit does not go through the board");
});

test("the hive a visit reaches for comes off the deck, never off the request", () => {
  const hive = cut(server, "async function readHive(", "async function peerKeyOf(", "server.mjs");
  assert.match(hive, /teamCache\.data\?\.devs \|\| \[\]/, "the visit trusts a name the board never mentioned");
  assert.ok(!/podOfDev\(dev\)/.test(hive), "the pod name is built out of what the caller sent");
  const start = teamRoutes.indexOf('on(null, "/api/team"');
  const end = teamRoutes.indexOf("\n  });", start);
  assert.ok(start >= 0 && end > start, "could not cut /api/team out of routes/team.mjs");
  const route = teamRoutes.slice(start, end);
  assert.match(route, /if \(!devName\.test\(only\)\) return json\(/, "a hive name from the query is not checked");
});
