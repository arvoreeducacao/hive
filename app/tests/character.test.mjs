import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BRAND_FACE_CHOICES, BRAND_FACE_DEFAULT, GAZE_CHOICES, GAZE_DEFAULT,
  cleanBrandFace, cleanGaze, cleanPatch
} from "../lib/config.mjs";
import { GAZE_CUTOFF, GAZE_REACH_PX, GAZE_YAW, NEAR_PX, gazeAt } from "../assets/pets/tamagotchi.mjs";

import { faceSlot } from "../assets/avatar/avatar.mjs";
import { app, state, views } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const tama = readFileSync(join(HERE, "assets/pets/tamagotchi.mjs"), "utf8");
const main = readFileSync(join(HERE, "main.js"), "utf8");
const preload = readFileSync(join(HERE, "main/preload.js"), "utf8");
const welcome = readFileSync(join(HERE, "src/app/welcome.js"), "utf8");
const boot = readFileSync(join(HERE, "src/app/boot.js"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

const st = await state();
await views();
const { ACTIONS, DEFAULT_CHORDS, DEFAULT_KEYS, MAC_KEYS } = await app("core");
const { PET_OFF, PET_ON, adoptBrandFace, adoptGaze, brandWanted, farAt, gazeReach, paintChoices, setBrandFace, watchFarCursor } = await app("preferences");
const { paintBrandAvatar, paintSettingsFace, settingsFaceViewModel, toggleSettingsFace, wAvatar } = await app("welcome");
const { faceSheetOpen, toggleFaceSheet } = await app("face-door");
const { closeHelp, openHelp, run } = await app("themes");
const { setCalm } = await app("pure-helpers");
const { TOUR, tourViewModel } = await app("tour");
await app("new-chat");

document.getElementById("rail-team").remove();

test("the face in the title bar is a setting, and auto is what it starts as", () => {
  assert.deepEqual(BRAND_FACE_CHOICES, ["always", "auto", "never"]);
  assert.equal(BRAND_FACE_DEFAULT, "auto");
  assert.equal(cleanBrandFace(undefined, "config", []), "auto");
  for (const one of BRAND_FACE_CHOICES) assert.equal(cleanBrandFace(one, "config", []), one);
  const problems = [];
  assert.equal(cleanBrandFace("sometimes", "config", problems), "auto", "a word nobody knows falls back");
  assert.equal(problems.length, 1, "and says so, instead of failing quietly");
});

test("the reach of the eyes is a setting too", () => {
  assert.deepEqual(GAZE_CHOICES, ["off", "window", "screen"]);
  assert.equal(GAZE_DEFAULT, "screen");
  assert.equal(cleanGaze(undefined, "config", []), "screen");
  for (const one of GAZE_CHOICES) assert.equal(cleanGaze(one, "config", []), one);
  const problems = [];
  assert.equal(cleanGaze("everywhere", "config", problems), "screen");
  assert.equal(problems.length, 1);
});

/* a key the patch does not know is dropped without a word, so the two new ones have to be let
   through by name or the panel would look like it saved and change nothing on the next boot */
test("both settings survive a patch", () => {
  const { clean, problems } = cleanPatch({ brandFace: "never", gaze: "window" });
  assert.deepEqual(problems, []);
  assert.equal(clean.brandFace, "never");
  assert.equal(clean.gaze, "window");
});

test("a bad value in the patch is refused and does not reach the file", () => {
  const { clean, problems } = cleanPatch({ brandFace: 3, gaze: "into your soul" });
  assert.equal(clean.brandFace, BRAND_FACE_DEFAULT);
  assert.equal(clean.gaze, GAZE_DEFAULT);
  assert.equal(problems.length, 2);
});

/* the bug this fixes: the mug in the title bar had already been given the window as its reach,
   and the creature at the foot of the rail was left behind on a circle of 110px — the cursor
   spends the day in a terminal well outside it, so the eyes never once looked up */
test("the eyes reach as far as they are told, and the old pair is still the default", () => {
  assert.equal(GAZE_CUTOFF, NEAR_PX / GAZE_REACH_PX, "the cutoff keeps its old ratio to the reach");
  assert.equal(gazeAt(NEAR_PX + 1, 0), null, "out of the default reach is still nobody");
  const seen = gazeAt(NEAR_PX + 1, 0, 1200);
  assert.ok(seen && seen.yaw > 0, "the very cursor the old reach threw away is seen by the new one");
  assert.ok(seen.yaw < GAZE_YAW, "and it is not yet all the way over, because the reach is wider now");
  assert.ok(gazeAt(600, 0, 1200), "a cursor across the window is seen when the reach is the window");
  assert.ok(gazeAt(1400, 0, 1600), "and across the screen when the reach is the screen");
  assert.equal(gazeAt(4000, 0, 1200), null, "but the far side of a second monitor is still nobody");
});

test("a reach of nothing is a creature that does not look up", () => {
  assert.equal(gazeAt(0, 0, 0), null, "off means off, even with the cursor on its face");
  assert.equal(gazeAt(10, 10, -1), null);
});

test("the turn saturates at the reach, whatever the reach is", () => {
  assert.equal(gazeAt(1200, 0, 1200).yaw, GAZE_YAW);
  assert.equal(gazeAt(-1200, 0, 1200).yaw, -GAZE_YAW);
  assert.equal(gazeAt(GAZE_REACH_PX, 0).yaw, GAZE_YAW, "and the default reach still saturates where it did");
});

test("the creature is handed the reach and the cursor from outside, and prefers the near one", () => {
  assert.match(tama, /const reach = options\.reach \? options\.reach\(\) : GAZE_REACH_PX;/);
  assert.match(tama, /const aimedAt = \(\) => \(pointer \|\| \(options\.farPointer \? options\.farPointer\(\) : null\)\);/);
});

test("the page turns the setting into a reach, and off into no reach at all", () => {
  st.gazeMode = "off";
  assert.equal(gazeReach(), 0);
  st.gazeMode = "screen";
  assert.equal(gazeReach(), Math.hypot(screen.width, screen.height) / 2);
  st.gazeMode = "window";
  assert.equal(gazeReach(), Math.hypot(innerWidth, innerHeight) / 2, "the window is the fallback, as the mug already had");
  st.gazeMode = "whatever";
  assert.equal(gazeReach(), Math.hypot(innerWidth, innerHeight) / 2);
});

test("the cursor is only polled when a face is wearing the rail and the screen was asked for", () => {
  setCalm(false, true);
  const asked = [];
  window.hiveGaze = { hear() {}, watch: (on) => asked.push(on) };
  st.gazeMode = "screen";
  st.petChoice = PET_ON;
  watchFarCursor();
  st.gazeMode = "window";
  watchFarCursor();
  st.gazeMode = "screen";
  st.petChoice = PET_OFF;
  watchFarCursor();
  assert.deepEqual(asked, [true, false, false]);
  assert.equal(farAt, null, "and the last point is forgotten when it stops");
  delete window.hiveGaze;
});

test("under lean the cursor is not polled either, and the poll comes back the moment full is chosen", () => {
  const asked = [];
  window.hiveGaze = { hear() {}, watch: (on) => asked.push(on) };
  st.gazeMode = "screen";
  st.petChoice = PET_ON;
  setCalm(true, true);
  assert.equal(asked.at(-1), false, "25 cursor reads a second for a face that cannot turn its eyes");
  setCalm(false, true);
  assert.equal(asked.at(-1), true);
  setCalm(true, true);
  st.petChoice = PET_OFF;
  delete window.hiveGaze;
});

test("the main process stops polling for a window nobody can see", () => {
  assert.match(main, /if \(!win\.isVisible\(\) \|\| win\.isMinimized\(\)\) return;/);
  assert.match(main, /const at = screen\.getCursorScreenPoint\(\);/);
  assert.match(main, /win\.webContents\.send\("hive:gaze-at", \{ x: at\.x - box\.x, y: at\.y - box\.y \}\);/,
    "the point arrives relative to the content, so the page reads it as a client point");
  assert.match(main, /win\.once\("closed", \(\) => stopCursor\(win\)\);/, "a closed window takes its timer with it");
  assert.match(preload, /watch: \(on\) => ipcRenderer\.send\("hive:gaze", !!on\)/);
});

test("the mug steps aside when the rail is already wearing the same face", () => {
  st.petChoice = PET_OFF;
  setBrandFace("auto", true);
  assert.equal(brandWanted(), true);
  st.petChoice = PET_ON;
  assert.equal(brandWanted(), false, "with the creature on the rail the title bar leaves the face to it");
  setBrandFace("always", true);
  assert.equal(brandWanted(), true);
  setBrandFace("never", true);
  st.petChoice = PET_OFF;
  assert.equal(brandWanted(), false);
});

test("a hidden mug does not strand the picker or leave a sheet floating", () => {
  st.team = { me: "me", devs: [], sharing: false, players: [], version: 0 };
  st.data = { sessions: [], spawning: [], archived: [], pod: {} };
  st.myFace = null;
  st.petChoice = PET_OFF;
  setBrandFace("always", true);
  paintBrandAvatar();
  const slot = document.getElementById("brand-mug");
  assert.equal(slot.hidden, false);
  toggleFaceSheet(true);
  assert.equal(faceSheetOpen(), true);
  setBrandFace("never", true);
  paintBrandAvatar();
  assert.equal(slot.hidden, true);
  assert.equal(faceSheetOpen(), false, "a sheet nobody can reach is a sheet that is shut");
  assert.equal(slot.innerHTML, "");
  assert.match(welcome, /if \(follower\.slot === slot\) follower\.slot = null;/, "and the eyes stop aiming at a button that left");
  setBrandFace("auto", true);
});

test("the settings paint the same picker the mug opens", () => {
  assert.match(page, /<div class="facepick" id="cfg-face" data-no-t><\/div>/);
  st.team = { me: "me", devs: [{ dev: "art", avatar: "ball/dark/blue" }, { dev: "me", avatar: "" }], sharing: false, players: [], version: 0 };
  st.myFace = { shape: "wide", face: "dark", colour: "blue" };
  st.cfgFaceOpen = true;
  paintSettingsFace();
  const pick = document.getElementById("cfg-face");
  assert.notEqual(pick.innerHTML, "");
  const rows = settingsFaceViewModel().rows;
  assert.deepEqual(rows.map((row) => row.part), ["style", "shape", "colour", "glasses", "hat", "extra"], "the same rows the sheet shows");
  assert.equal(rows.find((row) => row.part === "shape").opts.find((one) => one.value === "ball").taken, true, "and the same clash marks");

  pick.innerHTML = '<button data-w="face-set" data-part="shape" data-value="ball"></button>';
  pick.querySelector("button").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.notEqual(faceSlot(wAvatar()), "ball/blue", "the same clash check, so the two doors never drift");

  st.cfgFaceOpen = false;
  paintSettingsFace();
  assert.equal(pick.innerHTML, "", "and nothing is drawn while it is shut");
});

test("the picker is a way in, not a wall", () => {
  assert.match(page, /<div class="cfg-pick" id="cfg-pick" hidden>/, "it starts shut in the markup too");
  assert.match(page, /<button class="ghost" id="cfg-open" type="button" aria-expanded="false" aria-controls="cfg-pick"><\/button>/);
  st.cfgFaceOpen = false;
  toggleSettingsFace();
  const way = document.getElementById("cfg-open");
  assert.equal(document.getElementById("cfg-pick").hidden, false);
  assert.equal(way.textContent, "done");
  assert.equal(way.getAttribute("aria-expanded"), "true", "a disclosure that does not say so is a button that lies to a screen reader");
  document.getElementById("cfg-open").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(document.getElementById("cfg-pick").hidden, true);
  assert.equal(way.textContent, "change");
  assert.equal(way.getAttribute("aria-expanded"), "false");
});

test("the roll and the strip live inside the open picker", () => {
  const block = page.slice(page.indexOf('<div class="cfg-pick"'), page.indexOf("<div class=\"pair\">\n      <div><label for=\"f-brand\""));
  assert.match(block, /id="cfg-face"/);
  assert.match(block, /<div class="fs-act"><button type="button" id="cfg-roll" data-t>another<\/button><button type="button" id="cfg-strip" data-t>take it all off<\/button><\/div>/,
    "both are in the picker, after the rows, not next to the preview");
});

test("the panel paints its own face on the way in, and starts shut every time", () => {
  st.cfgFaceOpen = true;
  document.getElementById("cfg-mug").innerHTML = "";
  openHelp();
  assert.equal(st.cfgFaceOpen, false, "a panel reopened does not remember being expanded");
  assert.match(document.getElementById("cfg-mug").innerHTML, /<svg/, "the face is painted before the panel is shown");
  assert.equal(document.getElementById("help").classList.contains("on"), true);

  closeHelp();
  run("help");
  assert.equal(document.getElementById("help").classList.contains("on"), true, "the key goes through it");
  closeHelp();
  document.getElementById("btn-help").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(document.getElementById("help").classList.contains("on"), true, "and so does the button");
  closeHelp();
});

test("the two new choices are painted as selects and saved", () => {
  const wrote = [];
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, how) => { wrote.push(JSON.parse(how?.body || "{}")); return { ok: true, text: async () => "{}", json: async () => ({}) }; };

  st.petChoice = PET_OFF;
  paintChoices();
  assert.equal(document.getElementById("f-gaze").disabled, true, "there is nowhere to look without the little you");
  st.petChoice = PET_ON;
  paintChoices();
  assert.equal(document.getElementById("f-gaze").disabled, false);

  const brand = document.getElementById("f-brand");
  brand.value = "never";
  brand.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(brandWanted(), false);
  assert.deepEqual(wrote.at(-1), { config: { brandFace: "never" } });

  const eyes = document.getElementById("f-gaze");
  eyes.value = "off";
  eyes.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(st.gazeMode, "off");
  assert.deepEqual(wrote.at(-1), { config: { gaze: "off" } });

  globalThis.fetch = saved;
  setBrandFace("auto", true);
});

test("a config written by hand is adopted while the app runs, like the animal already was", () => {
  st.petChoice = PET_OFF;
  setBrandFace("always", true);
  st.gazeMode = "screen";
  adoptBrandFace({ config: { brandFace: "never" }, has: { brandFace: true } });
  adoptGaze({ config: { gaze: "off" }, has: { gaze: true } });
  assert.equal(brandWanted(), false);
  assert.equal(gazeReach(), 0);
  assert.match(boot, /bootBrandFace\(\);/);
  assert.match(boot, /bootGaze\(\);/);
  setBrandFace("auto", true);
});

/* the bug: both choices were let through the patch and written to the file, and then never read
   back out of it. `readConfig` did not name them, so `r.config.gaze` was `undefined` on every
   answer, `adoptGaze` read that as "the default", and the reload that follows any panel write put
   the default back — over the file and over localStorage. changing any other preference lost this
   one. the round trip is what has to be pinned, not the write: the write was already covered and
   the setting still did not hold. */
test("both choices are read back out of the file, not only written into it", () => {
  const shape = server.slice(server.indexOf("async function readConfig()"), server.indexOf("async function autocompactNow("));
  assert.match(shape, /brandFace: cleanBrandFace\(raw\.brandFace, tilde\(CONFIG_FILE\), problems\),/);
  assert.match(shape, /gaze: cleanGaze\(raw\.gaze, tilde\(CONFIG_FILE\), problems\),/);
  assert.match(shape, /brandFace: raw\.brandFace !== undefined/, "and the app is told whether the file said anything");
  assert.match(shape, /gaze: raw\.gaze !== undefined/);
  assert.match(server, /cleanBrandFace/, "the cleaners have to be imported to be called");
  assert.match(server, /cleanGaze/);
});

/* a launch after the fix finds a file that never held the key, because until now it could not.
   the choice lives in localStorage on that machine, so a config that says nothing must leave it
   alone instead of handing it the default. */
test("a config that never mentioned them does not overwrite the choice on this machine", () => {
  /* read through the two functions that consult the live value: `always` with the pet on is the
     one combination `auto` would answer differently, so a silent adopt that wiped the choice
     would show up here rather than passing by luck. */
  st.petChoice = PET_ON;
  setBrandFace("always", true);
  st.gazeMode = "off";
  adoptBrandFace({ config: {}, has: {} });
  adoptGaze({ config: {}, has: {} });
  assert.equal(brandWanted(), true, "the face this machine chose survives a config that never held it");
  assert.equal(gazeReach(), 0, "and so does the reach of the eyes");
  setBrandFace("auto", true);
});

test("one panel, one action, on the key every desktop app uses", () => {
  assert.deepEqual(MAC_KEYS.help, { meta: true, code: "Comma" });
  assert.deepEqual(DEFAULT_KEYS.help, { ctrl: true, code: "Comma" });
  assert.equal(DEFAULT_CHORDS.help, ",", "and the chord under the leader is the same key");
  assert.equal(MAC_KEYS.settings, undefined, "the second name for the same panel is gone");
  assert.equal(DEFAULT_KEYS.settings, undefined);
  assert.equal(DEFAULT_CHORDS.settings, undefined);
  closeHelp();
  run("help");
  assert.equal(document.getElementById("help").classList.contains("on"), true);
  closeHelp();
  assert.equal(ACTIONS.filter(([, said]) => /settings/.test(said)).length, 1,
    "the rebind list names the panel once");
  assert.ok(ACTIONS.some(([name, said]) => name === "help" && said === "open the shortcuts and the settings"),
    "and the row says what the panel is");
});

test("the tour names the keys the app is actually bound to", () => {
  for (const step of TOUR) {
    assert.doesNotMatch(step.text, /[⌥⌘⌃⇧]/, "no hand-written modifier symbols survive in the tour stops");
    assert.doesNotMatch(step.title, /[⌥⌘⌃⇧]/);
  }
  assert.ok(!TOUR.some((step) => /⌥\? shows every shortcut/.test(step.text)), "the made-up key is gone");
  assert.ok(!TOUR.some((step) => /⌥\[ and ⌥\] move between them/.test(step.text)), "and so are the block keys it never had");
  st.tourAt = TOUR.length - 1;
  const said = tourViewModel();
  assert.doesNotMatch(said.text, /\{settings\}/, "every stop that names a key reads it from the live bindings");
  st.tourAt = 1;
  const blocks = tourViewModel();
  for (const slot of ["prev", "next", "seat", "limit"]) assert.doesNotMatch(blocks.text, new RegExp(`\\{${slot}\\}`));
  st.tourAt = -1;
});
