import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanPatch } from "../lib/config.mjs";
import { app, state, views } from "./dom.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const config = readFileSync(join(HERE, "lib", "config.mjs"), "utf8");
const tama = readFileSync(join(HERE, "assets/pets/tamagotchi.mjs"), "utf8");
const source = (module) => readFileSync(join(HERE, "src", "app", `${module}.js`), "utf8");

const st = await state();
await views();
const { CALM_KEY, adoptCalm, calmly, setAway, setCalm } = await app("pure-helpers");
const { shakeWindow } = await app("team");
const { countUp } = await app("whats-new");
await app("themes");

const saved = [];
const asleepFetch = () => {
  const was = globalThis.fetch;
  saved.length = 0;
  globalThis.fetch = async (url, init) => { saved.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({}) }; };
  return () => { globalThis.fetch = was; };
};

test("the switch is one line of the config file, visual, and lean is what a file that never chose gets", () => {
  assert.match(server, /visual: cleanVisual\(raw\.visual, tilde\(CONFIG_FILE\), problems\)/);
  assert.match(server, /visual: raw\.visual !== undefined/);
  assert.match(config, /if \(patch\.visual !== undefined\)/);
  assert.doesNotMatch(server, /raw\.calm/, "calm is gone: one key, not two");
  assert.match(source("pure-helpers"), /^st\.calmOn = true;$/m, "lean is the default for everyone");
  assert.equal(CALM_KEY, "hive.visual");
  assert.match(source("boot"), /st\.calmOn = c !== "full";/);
});

test("the file takes lean or full and names anything else a mistake", () => {
  assert.deepEqual(cleanPatch({ visual: "lean" }), { clean: { visual: "lean" }, problems: [] });
  assert.deepEqual(cleanPatch({ visual: "full" }), { clean: { visual: "full" }, problems: [] });
  const { clean, problems } = cleanPatch({ visual: "calm" });
  assert.equal(clean.visual, "lean");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /visual should be lean, full/);
});

test("the switch is a select in a pane of its own, Performance, and writes the one key", () => {
  const help = page.slice(page.indexOf('<div class="modal" id="help"'), page.indexOf('<div class="modal" id="themes"'));
  assert.match(help, /<button type="button" data-pane="performance">Performance<\/button>/);
  assert.match(help, /<section class="pref-pane" data-pane="performance" hidden>/);
  assert.match(help, /<label for="f-visual" data-t>how the screen is drawn<\/label><select id="f-visual"><\/select>/);
  assert.doesNotMatch(help, /t-motion|fewer animations/, "the old button is gone, not doubled");
  const restore = asleepFetch();
  setCalm(true, true);
  const pick = document.getElementById("f-visual");
  assert.deepEqual([...pick.options].map((o) => o.value), ["lean", "full"]);
  assert.equal(pick.value, "lean");
  pick.value = "full";
  pick.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(st.calmOn, false);
  assert.equal(document.body.classList.contains("lean"), false);
  assert.deepEqual(saved.map((c) => [c.url, c.body.config.visual]), [["/api/config", "full"]]);
  pick.value = "lean";
  pick.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(st.calmOn, true);
  assert.equal(document.body.classList.contains("lean"), true);
  assert.equal(saved.at(-1).body.config.visual, "lean");
  restore();
});

test("a config that says full is adopted, and one that never said anything leaves the choice alone", () => {
  setCalm(true, true);
  adoptCalm({ has: {}, config: {} });
  assert.equal(st.calmOn, true);
  adoptCalm({ has: { visual: true }, config: { visual: "full" } });
  assert.equal(st.calmOn, false);
  adoptCalm({ has: { visual: true }, config: { visual: "lean" } });
  assert.equal(st.calmOn, true);
});

test("lean takes the blur off every surface that has one, in a single rule", () => {
  const blurred = [];
  for (const line of page.split("\n")) {
    const rule = line.match(/^\s*([^{@/][^{]*?)\s*\{.*backdrop-filter:\s*blur/);
    if (rule && !rule[1].includes("look-dimension") && !rule[1].includes("body.lean")) blurred.push(rule[1].trim());
  }
  blurred.push(".relpop");
  assert.ok(blurred.length >= 20, `expected the 21 blurred surfaces, saw ${blurred.length}`);
  const lean = page.match(/^\s*body\.lean [^\n]*\{ backdrop-filter: none; -webkit-backdrop-filter: none; \}$/m)?.[0] || "";
  for (const one of blurred) assert.ok(lean.includes(`body.lean ${one}`), `${one} keeps its blur under lean`);
});

const leanRules = () => page.match(/^\s*body\.lean [^\n]*\{[^}]*\}$/gm) || [];

const leanBackground = (surface) => {
  const rule = leanRules().find((one) => one.includes("background:") && (one.includes(`body.lean ${surface},`) || one.includes(`body.lean ${surface} {`)));
  return rule?.match(/background: ([^;]+);/)?.[1] || null;
};

test("lean paints every blurred surface on a solid panel, so nothing shows through", () => {
  const surfaces = [".menu", "#btrade", ".sv-menu", ".box", ".pal-sheet", ".relpop", "#plane-hud", ".plink-menu", ".pbar", "#plane-said", "#plane-map", ".sv-queue", ".sv-subs", ".sv-suggest::before", ".sv-jump", ".w-bar", ".wn-list"];
  for (const one of surfaces) {
    const background = leanBackground(one);
    assert.match(background || "", /^var\(--(panel|panel-2|well)\)$/, `${one} stays see-through under lean: ${background}`);
  }
});

test("lean darkens the scrims behind modals, palettes and the arrange view", () => {
  const alpha = (background) => Number(background?.match(/,\s*(\.\d+)\)/)?.[1]);
  const base = (selector) => page.match(new RegExp(`^\\s*${selector.replace(/[.#]/g, "\\$&")} \\{[^}]*background: (rgba\\([^)]+\\))`, "m"))?.[1];
  for (const scrim of [".modal", ".pal-scrim", "#mission-scrim", "#nudge-scrim", "#arrange"]) {
    const before = alpha(base(scrim));
    const after = alpha(leanBackground(scrim));
    assert.ok(after > before, `${scrim} is not darker under lean (${before} → ${after})`);
    assert.ok(after >= 0.8, `${scrim} still lets the page through under lean (${after})`);
  }
});

test("under calm no avatar on the rail is played by the engine, the brand mug included", () => {
  const avatars = source("avatars");
  for (const fn of ["function mugPlay(state, { hold = true } = {}) {", "function lentFlash(seat, dev) {", "function teamFlash(dev, state) {"]) {
    const body = avatars.slice(avatars.indexOf(fn), avatars.indexOf("player.play(", avatars.indexOf(fn)) + 1);
    assert.ok(body.includes("calmly()) return;"), `${fn} plays under calm`);
  }
});

test("the switch and the system preference feed the same calm", () => {
  const was = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  setCalm(false, true);
  assert.equal(calmly(), false);
  assert.equal(document.body.classList.contains("no-motion"), false);
  setCalm(true, true);
  assert.equal(calmly(), true);
  assert.equal(document.body.classList.contains("no-motion"), true);
  setCalm(false, true);
  globalThis.matchMedia = (q) => ({ matches: q === "(prefers-reduced-motion: reduce)", addEventListener() {}, removeEventListener() {} });
  assert.equal(calmly(), true, "the system preference alone is enough");
  globalThis.matchMedia = was;
});

test("nobody at the machine stills the motion without touching the switch", () => {
  const was = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const restore = asleepFetch();
  setCalm(false, true);
  setAway(true);
  assert.equal(calmly(), true);
  assert.equal(document.body.classList.contains("no-motion"), true);
  assert.equal(st.calmOn, false);
  assert.equal(document.body.classList.contains("unwatched"), true);
  assert.equal(document.getElementById("f-visual").value, "full", "being away does not move the switch");
  setAway(false);
  assert.equal(calmly(), false);
  assert.equal(document.body.classList.contains("no-motion"), false);
  assert.equal(document.body.classList.contains("unwatched"), false);
  assert.deepEqual(saved, []);
  restore();
  globalThis.matchMedia = was;
});

test("under the switch every keyframe animation dies, even the ones a state selector would win back", () => {
  assert.match(page, /body\.no-motion \* \{ transition-duration: 1ms !important; animation: none !important; \}/,
    "!important, because .tile:not(.focused):not(.open) .sv-composer beats any plain override and the composer would keep sliding open");
  assert.match(page, /body\.no-motion \.spinner \{[^}]*animation: pulse 1\.1s var\(--ease\) infinite !important; \}/,
    "the spinner is the one that stays — a still one reads as nothing happening");
  assert.match(page, /body\.no-motion\.unwatched \.spinner \{ animation: none !important; \}/,
    "unless nobody is at the machine — then nothing is left to read it");
  assert.match(page, /body\.no-motion \.tile\[data-state="needs"\] \{ box-shadow: 0 0 0 1px rgba\(205,105,74,\.24\), var\(--e2\), var\(--hair\); \}/,
    "and the seat that needs you keeps its still highlight");
});

test("a calm screen keeps the composer expanded — nothing even has to appear", () => {
  const slims = page.match(/[^\n]*\.tile:not\(\.focused\):not\(\.open\) \.sv-composer:not\(\.ready\)[^\n]*\{/g) || [];
  assert.ok(slims.length >= 6, "the slim state is a family of rules, all of them");
  for (const rule of slims) assert.match(rule.trim(), /^body:not\(\.no-motion\) /, `unguarded slim rule: ${rule}`);
});

test("the js that checks the media query by hand goes through the switch instead", () => {
  setCalm(false, true);
  document.body.classList.remove("nudged");
  shakeWindow();
  assert.equal(document.body.classList.contains("nudged"), true);
  clearTimeout(shakeWindow.until);
  document.body.classList.remove("nudged");
  setCalm(true, true);
  shakeWindow();
  assert.equal(document.body.classList.contains("nudged"), false, "the nudge shake asks calmly()");
  assert.ok(!source("team").slice(source("team").indexOf("function shakeWindow()"), source("team").indexOf("function pulseNudge()")).includes("matchMedia"));
  const number = document.createElement("b");
  countUp(number, 42);
  assert.equal(number.textContent, "42", "a calm counter lands on the total at once");
  setCalm(false, true);
});

test("the face in the title bar stops the moment the switch moves, and plays nothing while it is on", () => {
  assert.match(source("pure-helpers"), /paintCalm\(\);\n  if \(st\.calmOn && st\.mugPlayer\) paintBrandAvatar\(\);/);
  assert.match(source("avatars"), /if \(!slot \|\| !slot\.isConnected \|\| slot\.hidden \|\| calmly\(\)\) return;/);
});

test("the little you hears the switch the moment it moves, not on the next mount", () => {
  assert.match(source("preferences"), /reducedMotion: \(\) => calmly\(\)/);
  assert.match(tama, /typeof asked === "function" \? asked\(\) : asked/);
  assert.match(tama, /body\.no-motion #pet \.tama-heart, body\.no-motion #pet \.tama-snack, body\.no-motion #pet \.tama-pulse, body\.no-motion #pet \.tama-note, body\.no-motion #pet \.tama-zee, body\.no-motion #pet \.tama-say \{ display: none; \}/);
});

test("the choice is cached for the boot and adopted live from the file", () => {
  const restore = asleepFetch();
  setCalm(true, true);
  assert.equal(localStorage.getItem(CALM_KEY), "lean");
  setCalm(false, true);
  assert.equal(localStorage.getItem(CALM_KEY), "full");
  assert.equal(saved.length, 0, "a quiet set writes the cache and does not answer back to the file");
  adoptCalm({ has: { visual: true }, config: { visual: "lean" } });
  assert.equal(st.calmOn, true);
  assert.equal(saved.length, 0, "adopting the file does not write it back");
  adoptCalm({ has: {}, config: { visual: "full" } });
  assert.equal(st.calmOn, true, "a file that never said visual leaves the choice alone");
  setCalm(false, true);
  restore();
  assert.match(source("boot"), /const c = localStorage\.getItem\(CALM_KEY\); if \(c !== null\) st\.calmOn = c !== "full";/);
  assert.match(source("brand-face"), /\n {4}adoptCalm\(r\);\n/);
});
