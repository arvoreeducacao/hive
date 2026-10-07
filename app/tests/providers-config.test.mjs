import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { PROVIDER_IDS, cleanPatch, cleanProvider, cleanProviders } from "../lib/config.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const server = readFileSync(join(HERE, "server.mjs"), "utf8");

test("a provider nobody configured is on, nameless and colourless", () => {
  const problems = [];
  assert.deepEqual(cleanProviders(undefined, "here", problems), {});
  assert.deepEqual(cleanProvider(undefined, "here", problems), { enabled: true, name: "", color: "", binary: "", args: [], env: {} });
  assert.deepEqual(problems, []);
});

test("what the person wrote about a provider comes back clean", () => {
  const problems = [];
  const got = cleanProviders({
    codex: { enabled: false, name: " Codex do trabalho ", color: "#10a37f", binary: "/opt/bin/codex", args: ["--profile", "work"], env: { OPENAI_BASE_URL: "https://proxy.example.test" } }
  }, "here", problems);
  assert.deepEqual(got, {
    codex: { enabled: false, name: "Codex do trabalho", color: "#10a37f", binary: "/opt/bin/codex", args: ["--profile", "work"], env: { OPENAI_BASE_URL: "https://proxy.example.test" } }
  });
  assert.deepEqual(problems, []);
});

test("an agent this hive does not run is refused by name, and the rest is kept", () => {
  const problems = [];
  const got = cleanProviders({ gemini: { enabled: true }, kimi: { enabled: true } }, "here", problems);
  assert.deepEqual(Object.keys(got), ["kimi"]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /providers\.gemini is not an agent this hive runs/);
  assert.deepEqual(PROVIDER_IDS, ["claude", "codex", "kimi", "kiro", "cursor", "opencode"]);
});

test("a colour that is not hex, a flag that is not a boolean and a variable with a strange name are each called out", () => {
  const problems = [];
  const got = cleanProvider({ enabled: "yes", color: "green", env: { "BAD NAME": "x", GOOD: 1 }, args: "not a list" }, "here", problems);
  assert.equal(got.enabled, true);
  assert.equal(got.color, "");
  assert.deepEqual(got.env, {});
  assert.deepEqual(got.args, []);
  assert.deepEqual(problems.map((one) => one.split(" should")[0].split(" is not")[0]), ["here.enabled", "here.color", "here.args", "here.env.BAD NAME", "here.env.GOOD"]);
});

test("a patch carries the providers through the same cleaning", () => {
  const { clean, problems } = cleanPatch({ providers: { kiro: { enabled: false } } });
  assert.deepEqual(clean.providers, { kiro: { enabled: false, name: "", color: "", binary: "", args: [], env: {} } });
  assert.deepEqual(problems, []);
});

test("the server reads the providers out of the config file and says whether they were written", () => {
  assert.match(server, /providers: cleanProviders\(raw\.providers, tilde\(CONFIG_FILE\), problems\)/);
  assert.match(server, /providers: raw\.providers !== undefined/);
});
