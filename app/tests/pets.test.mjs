import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PET_ID, moodOf } from "../assets/pets/pets.mjs";
import { TAMAGOTCHI_ID } from "../assets/pets/tamagotchi.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const core = readFileSync(join(HERE, "src", "app", "core.js"), "utf8");
const page = readFileSync(join(HERE, "src", "app", "preferences.js"), "utf8");
const rail = readFileSync(join(HERE, "src", "app", "mirror.js"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const pack = readFileSync(join(HERE, "assets", "pets", "pets.mjs"), "utf8");
const tamagotchi = readFileSync(join(HERE, "assets", "pets", "tamagotchi.mjs"), "utf8");

test("the only creature at the foot of the rail is the little you", () => {
  assert.equal(PET_ID, TAMAGOTCHI_ID);
});

test("an empty hive leaves the creature at rest", () => {
  assert.equal(moodOf([]), "idle");
  assert.equal(moodOf(undefined), "idle");
});

test("the most urgent seat is the one the creature answers to", () => {
  const sessions = [{ state: "idle" }, { state: "working" }, { state: "needs" }, { state: "done" }];
  assert.equal(moodOf(sessions), "needs");
});

test("a stalled seat outranks the quiet ones", () => {
  assert.equal(moodOf([{ state: "idle" }, { state: "stalled" }, { state: "ready" }]), "stalled");
});

test("a state the rail does not know is ignored instead of picked", () => {
  assert.equal(moodOf([{ state: "exploded" }, { state: "ready" }]), "ready");
  assert.equal(moodOf([{ state: "exploded" }]), "idle");
  assert.equal(moodOf([null, undefined]), "idle");
});

test("the nest is the strip the creature lives in, and nothing else is drawn there", () => {
  assert.match(pack, /nest\.id = "pet";/);
  assert.match(pack, /doc\.body\.classList\.add\("pet-on"\);/);
  assert.match(pack, /const blob = mountTamagotchi\(nest, \{/);
  assert.ok(!pack.includes("canvas"), "no pixel pack is painted at the foot of the rail any more");
  assert.ok(!pack.includes("nextPet"), "there is nothing left to swap to");
});

test("the mood of the fleet reaches the creature only when it changes", () => {
  assert.match(pack, /if \(next === mood\) return;/);
  assert.match(pack, /blob\.setMood\(mood\);/);
});

test("the page mounts the creature and feeds the rail's sessions to it", () => {
  assert.match(core, /import \{ mountPet \} from "\/assets\/pets\/pets\.mjs";/);
  assert.match(page, /pet = mountPet\(\$\("shell"\), \{\s*\n\s*face: \(\) => mugFace\(\),/);
  assert.match(page, /reach: gazeReach,\s*\n\s*farPointer: \(\) => farAt/, "the creature is told how far to look, and where the cursor is off-window");
  assert.match(rail, /pet\?\.setSessions\(st\.data\.sessions\)/);
});

test("the creature only shows up when the config asks for one", () => {
  const off = page.slice(page.indexOf("function setPet("), page.indexOf("function adoptPet("));
  assert.match(off, /petChoice === PET_OFF/);
  assert.match(off, /pet\?\.destroy\(\)/);
  assert.match(off, /pet = null/);
});

test("the creature catches its own button without covering the archived sessions", () => {
  assert.match(tamagotchi, /#pet\.tama-home \{ pointer-events: none; \}/);
  assert.match(pack, /#pet button \{[^}]*pointer-events: auto;/);
});

test("the little you starts off, and only a saved yes wakes it", () => {
  const boot = page.slice(page.indexOf("function bootPet("), page.indexOf("function setPet("));
  assert.match(boot, /setPet\(saved, true\);/);
  const set = page.slice(page.indexOf("function setPet("), page.indexOf("function adoptPet("));
  assert.match(set, /petChoice = choice === PET_ON \? PET_ON : PET_OFF;/);
  const adopt = page.slice(page.indexOf("function adoptPet("), page.indexOf("function paintChoices("));
  assert.match(adopt, /r\.config\.pet === PET_ON \? PET_ON : PET_OFF/);
  assert.match(page, /const PET_KEY = "hive\.littleYou";/);
});

test("the server hands out the module, and no art the pack used to need", () => {
  assert.match(server, /"\/assets\/pets\/pets\.mjs": \["assets\/pets\/pets\.mjs"/);
  for (const art of ["capybara-art", "bee-art", "fox-art"]) {
    assert.ok(!server.includes(`assets/pets/${art}.mjs`), `${art} is not served any more`);
  }
});
