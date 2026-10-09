import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_LANGUAGE, LANGUAGES, LANGUAGE_IDS, PT_BR, fill, isLanguage, phrase, speak } from "../assets/i18n.mjs";
import { TAMAGOTCHI_ID } from "../assets/pets/tamagotchi.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const walk = (dir) => readdirSync(join(HERE, dir), { withFileTypes: true }).flatMap((one) => one.isDirectory() ? walk(join(dir, one.name)) : /\.(js|jsx)$/.test(one.name) ? [readFileSync(join(HERE, dir, one.name), "utf8")] : []);
const page = [readFileSync(join(HERE, "app.html"), "utf8"), ...walk("src")].join("\n");
const server = [
  readFileSync(join(HERE, "server.mjs"), "utf8"),
  readFileSync(join(HERE, "lib/seat-link.mjs"), "utf8"),
  readFileSync(join(HERE, "lib/hub-path.mjs"), "utf8"),
  ...readdirSync(join(HERE, "routes")).filter((name) => name.endsWith(".mjs")).map((name) => readFileSync(join(HERE, "routes", name), "utf8"))
].join("\n");

function cut(text, from, to) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to}`);
  return text.slice(a, b);
}

import { LANGUAGES as CFG_LANGUAGES, PET_CHOICES, PETS_OFF, RETIRED_PETS, cleanLanguage, cleanPet } from "../lib/config.mjs";
const srv = { LANGUAGES: CFG_LANGUAGES, PET_CHOICES, PETS_OFF, RETIRED_PETS, cleanLanguage, cleanPet };

test("english is the default and the only language nobody has to translate", () => {
  assert.equal(DEFAULT_LANGUAGE, "en");
  assert.equal(LANGUAGES[0].id, "en");
  assert.deepEqual(LANGUAGES.map((one) => one.name), ["english", "português"], "the app writes in lowercase, language names included");
  assert.equal(speak("en"), "en");
  assert.equal(phrase("close"), "close");
});

test("an unknown language falls back to english instead of blanking the app", () => {
  assert.equal(speak("klingon"), "en");
  assert.equal(speak(undefined), "en");
  assert.equal(isLanguage("pt-BR"), true);
  assert.equal(isLanguage("pt"), false);
  speak("en");
});

test("a phrase with no translation comes back in english, never empty", () => {
  speak("pt-BR");
  assert.equal(phrase("a phrase nobody has translated yet"), "a phrase nobody has translated yet");
  speak("en");
});

test("the slots of a phrase are filled, and an unknown slot is left alone", () => {
  assert.equal(fill("wearing {name}", { name: "Bonsai" }), "wearing Bonsai");
  assert.equal(fill("{a} and {b}", { a: "one" }), "one and {b}");
  assert.equal(fill("nothing to fill"), "nothing to fill");
  assert.equal(phrase("could not write {file}", { file: "~/.hive/config.jsonc" }), "could not write ~/.hive/config.jsonc");
});

test("every translated phrase is a phrase the app really says", () => {
  const source = page
    + readFileSync(join(HERE, "assets/pets/pets.mjs"), "utf8")
    + readFileSync(join(HERE, "assets/pets/tamagotchi.mjs"), "utf8")
    + readFileSync(join(HERE, "assets/pets/visitor.mjs"), "utf8")
    + readFileSync(join(HERE, "assets/drops.mjs"), "utf8")
    + readFileSync(join(HERE, "assets/markdown.mjs"), "utf8")
    + readFileSync(join(HERE, "assets/status-strip.mjs"), "utf8")
    + readFileSync(join(HERE, "assets/themes.mjs"), "utf8")
    + readFileSync(join(HERE, "lib", "slack.mjs"), "utf8")
    + readFileSync(join(HERE, "lib", "tasks.mjs"), "utf8")
    + readFileSync(join(HERE, "doctor", "doctor-readings.mjs"), "utf8")
    + server;
  const orphans = Object.keys(PT_BR).filter((said) => !source.includes(said));
  assert.deepEqual(orphans, [], "these translations point at phrases that are not in the app any more");
});

test("no translation is left empty or identical to the english", () => {
  for (const [said, mine] of Object.entries(PT_BR)) {
    assert.ok(typeof mine === "string" && mine.trim(), `${said} was translated into nothing`);
    assert.notEqual(mine, said, `${said} was never translated`);
  }
});

test("the slots of a phrase survive the translation", () => {
  const slots = (text) => [...new Set(String(text).match(/\{\w+\}/g) || [])].sort();
  for (const [said, mine] of Object.entries(PT_BR)) {
    assert.deepEqual(slots(mine), slots(said), `the slots of "${said}" changed in the translation`);
  }
});

test("the client and the server agree on which languages exist", () => {
  assert.deepEqual(srv.LANGUAGES, LANGUAGE_IDS);
});

test("the server keeps a language it knows and refuses one it does not", () => {
  const problems = [];
  assert.equal(srv.cleanLanguage("pt-BR", "config", problems), "pt-BR");
  assert.equal(srv.cleanLanguage(undefined, "config", problems), "en");
  assert.deepEqual(problems, []);
  assert.equal(srv.cleanLanguage("klingon", "config", problems), "en");
  assert.equal(problems.length, 1);
});

test("the creature is the little you, or none at all", () => {
  assert.deepEqual(srv.PET_CHOICES, [TAMAGOTCHI_ID, srv.PETS_OFF]);
  const problems = [];
  assert.equal(srv.cleanPet("off", "config", problems), "off");
  assert.equal(srv.cleanPet("blob", "config", problems), "blob");
  assert.equal(srv.cleanPet(undefined, "config", problems), "off");
  assert.deepEqual(problems, []);
  assert.equal(srv.cleanPet("dragon", "config", problems), "off");
  assert.equal(problems.length, 1);
});

test("an animal the app retired is adopted in silence, not reported as a mistake", () => {
  const problems = [];
  for (const gone of srv.RETIRED_PETS) assert.equal(srv.cleanPet(gone, "config", problems), "off");
  assert.deepEqual(problems, []);
});

test("the translation never touches an id, an event name or a lookup key", () => {
  const script = page.slice(page.indexOf('<script type="module">'));
  const wrong = [
    [/\$\(phrase\(/, "an element id"],
    [/addEventListener\(phrase\(/, "an event name"],
    [/(?:===|!==)\s*phrase\(/, "a comparison"],
    [/\b(?:id|kind|action|where|state):\s*phrase\(/, "a field the code branches on"],
    [/(?:classList\.(?:add|remove|toggle|contains)|querySelector|getElementById|localStorage\.(?:getItem|setItem))\(phrase\(/, "a dom or storage key"]
  ];
  for (const [shape, what] of wrong) {
    assert.equal(shape.test(script), false, `phrase() is wrapping ${what} — that breaks the app in another language`);
  }
});

test("no phrase lives in a module-level list, where it would be frozen in english", () => {
  const script = page.slice(page.indexOf('<script type="module">'));
  const lines = script.split("\n");
  const frozen = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^(const|let)\s+\w+\s*=\s*[[{]/.test(lines[i]) || lines[i].trimEnd().endsWith(";")) continue;
    let depth = 0, j = i;
    for (; j < lines.length; j++) {
      depth += (lines[j].match(/[[{]/g) || []).length - (lines[j].match(/[\]}]/g) || []).length;
      if (depth <= 0) break;
    }
    const block = lines.slice(i, j + 1).join("\n");
    if (block.includes('phrase("')) frozen.push(lines[i].split("=")[0].trim());
    i = j;
  }
  assert.deepEqual(frozen, [], "translate these where they are painted, not where the list is built");
});

test("a phrase renamed in english is renamed in the translation too, never only on the key", () => {
  const behind = [];
  for (const [said, translated] of Object.entries(PT_BR)) {
    if (typeof translated !== "string") continue;
    if (/\bserver\b/i.test(said) && /\bpod\b/i.test(translated)) {
      behind.push(`"${said}" -> "${translated}"`);
    }
  }
  assert.deepEqual(behind, [],
    `these still say pod to whoever reads the screen in portuguese, because only the english side was renamed:\n${behind.join("\n")}`);
});

test("a pod is only ever named where the cluster itself is the subject", () => {
  const loose = [];
  for (const [said, translated] of Object.entries(PT_BR)) {
    for (const [side, text] of [["en", said], ["pt", translated]]) {
      if (typeof text !== "string" || !/\bpods?\b/i.test(text)) continue;
      if (/\bcluster\b|\bnamespace\b/i.test(text)) continue;
      loose.push(`${side}: ${text}`);
    }
  }
  assert.deepEqual(loose, [],
    `a pod is one way to host a server, not what the person reading this runs:\n${loose.join("\n")}`);
});

test("every fix the doctor offers reads in portuguese in the palette", () => {
  const readings = readFileSync(join(HERE, "doctor", "doctor-readings.mjs"), "utf8");
  const labels = [
    ...[...readings.matchAll(/label: "([^"$]+)"/g)].map((m) => m[1]),
    ...[...readings.matchAll(/runsDeploymentScript\(ctx, "[^"]+", "([^"]+)"/g)].map((m) => m[1]),
    ...[...readings.matchAll(/setupLabel\(ctx, "([^"]+)"/g)].map((m) => m[1])
  ];
  assert.ok(labels.length > 20, "the doctor's labels moved and this test lost them");
  assert.deepEqual(labels.filter((label) => !PT_BR[label]), []);
  assert.ok(PT_BR["{what}, in Git Bash"] && PT_BR["create the {avd} AVD"], "the windows and android labels are built, so the palette says them by their pattern");
});
