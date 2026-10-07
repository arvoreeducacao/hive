import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { VISIT_HOLD_MS, VISIT_ID, VISIT_LINE, VISIT_PLAY, VISIT_WALK_MS } from "../assets/pets/visitor.mjs";
import { PLAY_IDS, holdOf } from "../assets/avatar/avatar-play.mjs";
import { PT_BR } from "../assets/i18n.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const core = readFileSync(join(HERE, "src", "app", "core.js"), "utf8");
const seatMenu = readFileSync(join(HERE, "src", "app", "seat-menu.js"), "utf8");
const teamView = readFileSync(join(HERE, "src", "app", "team.js"), "utf8");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const visitor = readFileSync(join(HERE, "assets", "pets", "visitor.mjs"), "utf8");
const pack = readFileSync(join(HERE, "assets", "pets", "pets.mjs"), "utf8");
const tama = readFileSync(join(HERE, "assets", "pets", "tamagotchi.mjs"), "utf8");
const team = readFileSync(join(HERE, "lib", "team.mjs"), "utf8");

test("the guest wears a play the engine draws, and stays long enough to finish it", () => {
  assert.ok(PLAY_IDS.includes(VISIT_PLAY), "the hello is a real play");
  assert.ok(VISIT_HOLD_MS >= 1000 * holdOf(VISIT_PLAY) + VISIT_WALK_MS, "the visit is not cut off mid-wave");
  assert.ok(VISIT_HOLD_MS < 8000, "and it is a visit, not a resident");
});

test("the hello says hi in every language the app speaks", () => {
  assert.equal(VISIT_LINE, "hi!");
  for (const said of ["hi!", "say hi", "{who} says hi", "your face walks in at the foot of their rail, waving", "their face is waving at the foot of your rail"]) {
    assert.ok(typeof PT_BR[said] === "string" && PT_BR[said], `"${said}" has no portuguese`);
  }
});

test("the hello is on the right-click menu of a mate, beside the poke, and goes out by the poke's road", () => {
  const rows = seatMenu.slice(seatMenu.indexOf("function teamMenuRows("), seatMenu.indexOf("function openTeamMenu("));
  assert.match(rows, /phrase\("say hi"\)/, "the menu offers it");
  assert.match(rows, /off: !row\?\.up \|\| quiet, go: \(\) => helloTeam\(dev\)/, "and only while their server is up and their door is open");
  const hello = seatMenu.slice(seatMenu.indexOf("function helloTeam("), seatMenu.indexOf("function openBlockMenu("));
  assert.match(hello, /pokeTeam\(dev, true\)/, "the hello is a poke with the word on it");
  const poke = seatMenu.slice(seatMenu.indexOf("async function pokeTeam("), seatMenu.indexOf("function helloTeam("));
  assert.match(poke, /\{ dev, hello: true \}/);
});

test("a hello that lands is a face at the foot of the rail, never a shake", () => {
  const take = teamView.slice(teamView.indexOf("function takePokes("), teamView.indexOf("function greetFrom("));
  assert.match(take, /const hellos = fresh\.filter\(\(p\) => p\.hello\);/);
  assert.match(take, /const shakes = fresh\.filter\(\(p\) => !p\.hello\);/);
  assert.match(take, /if \(shakes\.length\) shakeWindow\(\);/, "only a shake shakes");
  assert.match(take, /if \(hellos\.length\) greetFrom\(/, "a hello walks in");
  const greet = teamView.slice(teamView.indexOf("function greetFrom("), teamView.indexOf("const lentSeen"));
  assert.match(greet, /visitor\?\.destroy\(\);/, "one guest at a time");
  assert.match(greet, /mountVisitor\(\$\("shell"\), \{ face: devFace\(from\), svg: wearsBlob\(from\) \? personFace\(from\) : "", from, reducedMotion: \(\) => calmly\(\) \}\)/, "the face is the one the rail already deals them");
  assert.match(greet, /pet\?\.wave\(\);/, "and the little you waves back");
});

test("the guest lives in its own strip, hides where the pet hides, and leaves the page clean", () => {
  assert.equal(VISIT_ID, "visit");
  assert.match(visitor, /#shell\.rail-min #visit \{ display: none; \}/);
  assert.match(visitor, /@media \(max-width: 860px\) \{ #visit \{ display: none; \} \}/);
  assert.match(visitor, /pointer-events: none;/, "nothing under it stops being clickable");
  assert.match(visitor, /strip\.remove\(\);\s*\n\s*style\.remove\(\);/, "the visit takes its style with it");
  assert.match(visitor, /if \(still\(\)\) return;\s*\n\s*if \(player\) player\.play\(VISIT_PLAY\);\s*\n\s*else strip\.classList\.add\("waving"\);/, "calm mode keeps the face still, robot or blobatar");
});

test("the little you knows how to wave, so the engine's wave is worn by somebody", () => {
  assert.match(tama, /wave: \(\) => play\("wave"\)/);
  assert.match(pack, /wave: \(\) => blob\.wave\(\)/);
});

test("the page loads the guest and the server hands it out", () => {
  assert.match(core, /import \{ mountVisitor \} from "\/assets\/pets\/visitor\.mjs";/);
  assert.match(server, /"\/assets\/pets\/visitor\.mjs": \["assets\/pets\/visitor\.mjs", "text\/javascript"\]/);
});

test("what travels is that somebody came over — never how their face should move", () => {
  assert.ok(!team.includes(`"${VISIT_PLAY}"`), "the play is picked by the rail it lands on, not sent");
  assert.match(team, /hello === true/, "and the word is a boolean, not a string anyone can fill");
});
