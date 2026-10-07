import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { NATIVE_COMMAND_NAMES, commandCounts, commandOf, commandSpot, commandsIn, isNativeCommand, stripCommand, withCommand, withoutCommand } from "../assets/slash-command.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));

test("the command goes in front, whatever the person wrote comes after", () => {
  assert.equal(withCommand("design", "lorem ipsum"), "/design lorem ipsum");
});

test("a command chosen with nothing written is the whole message", () => {
  assert.equal(withCommand("design", ""), "/design");
  assert.equal(withCommand("design", "   "), "/design");
});

test("no command means the words travel untouched", () => {
  assert.equal(withCommand("", "lorem ipsum"), "lorem ipsum");
  assert.equal(withCommand(null, "lorem ipsum"), "lorem ipsum");
});

test("the words keep their own line breaks — only the front is added", () => {
  assert.equal(withCommand("design", "primeira\n\nsegunda"), "/design primeira\n\nsegunda");
});

test("the seven commands the app answers by itself are known as native", () => {
  for (const name of NATIVE_COMMAND_NAMES) assert.ok(isNativeCommand(name), `${name} is answered by the app`);
  assert.ok(isNativeCommand("COMPACT"), "the name is matched without case");
  assert.ok(!isNativeCommand("design"), "a skill is not native");
  assert.ok(!isNativeCommand(""), "nothing is not a command");
});

test("the head of a message is the command it calls", () => {
  assert.equal(commandOf("/design lorem ipsum"), "design");
  assert.equal(commandOf("/design"), "design");
  assert.equal(commandOf("/plugin:thing arg"), "plugin:thing");
  assert.equal(commandOf(""), "");
  assert.equal(commandOf(null), "");
});

test("a slash that does not lead is not a command", () => {
  assert.equal(commandOf("lorem ipsum /design"), "", "the command has to lead to be a command");
  assert.equal(commandOf(" /design"), "", "a space in front means the person is still writing");
});

test("a pasted path keeps every character it had", () => {
  for (const path of ["/Users/someone/notes.md", "/etc/hosts", "/tmp/a/b"]) {
    assert.equal(commandOf(path), "", `${path} is a path, not a command`);
    assert.equal(stripCommand(path), path, `${path} must survive whole`);
  }
});

test("taking the head off leaves the argument exactly as it was typed", () => {
  assert.equal(stripCommand("/design lorem ipsum"), "lorem ipsum");
  assert.equal(stripCommand("/design   três espaços"), "três espaços", "the separator goes, the words do not");
  assert.equal(stripCommand("/design"), "");
  assert.equal(stripCommand("sem comando"), "sem comando");
  assert.equal(stripCommand("/design primeira\n\nsegunda"), "primeira\n\nsegunda");
});

test("stripping is idempotent, so picking twice cannot stack two heads", () => {
  const once = stripCommand("/design /simplify o resto");
  assert.equal(once, "/simplify o resto");
  assert.equal(withCommand("design", stripCommand(once)), "/design o resto");
});

test("what the box sends is what the box can read back", () => {
  for (const [name, body] of [["design", "lorem ipsum"], ["compact", ""], ["plugin:thing", "arg"]]) {
    const sent = withCommand(name, body);
    assert.equal(commandOf(sent), name, `${sent} still calls ${name}`);
    assert.equal(stripCommand(sent), body, `${sent} still argues ${JSON.stringify(body)}`);
  }
});

test("a command is a word of its own, and the box finds it wherever the person called it", () => {
  assert.deepStrictEqual(commandsIn("olha isso /prs agora"), [{ name: "prs", start: 10, end: 14 }]);
  assert.deepStrictEqual(commandsIn("/prs olha"), [{ name: "prs", start: 0, end: 4 }]);
  assert.deepStrictEqual(commandsIn("(/prs)"), [{ name: "prs", start: 1, end: 5 }], "a command between brackets is still the word it is");
  assert.deepStrictEqual(commandsIn("no fim: /prs"), [{ name: "prs", start: 8, end: 12 }]);
  assert.deepStrictEqual(commandsIn(""), []);
  assert.deepStrictEqual(commandsIn(null), []);
});

test("two commands in the box are two words, and the first one is the one in front", () => {
  const both = commandsIn("veja /plano-vivo e /prs");
  assert.deepStrictEqual(both.map((one) => one.name), ["plano-vivo", "prs"], "in the order they were written");
  assert.equal(commandSpot("veja /plano-vivo e /prs", "prs").start, 19, "each one is found by name, not by rank");
  assert.equal(commandSpot("veja /plano-vivo", "prs"), null, "a name that is not in the text has no place in it");
  assert.equal(commandSpot("veja /prs", ""), null, "no name, no place");
});

test("a path is not a command, wherever it appears", () => {
  for (const said of ["/Users/someone/notes.md", "abre /etc/hosts agora", "olha /tmp/a/b", "e/ou", "http://x/y"]) {
    assert.deepStrictEqual(commandsIn(said), [], `${said} carries no command`);
    assert.equal(withoutCommand("Users", said), said, `${said} must survive whole`);
  }
});

test("what the box sends is the same sentence with one word moved to the front", () => {
  const said = "compara com o de ontem /prs e me diz";
  const name = commandSpot(said, "prs").name;
  assert.equal(withCommand(name, withoutCommand(name, said)), "/prs compara com o de ontem e me diz");
});

test("only the command that runs is lifted; the other one goes out as the words it is", () => {
  const said = "/prs olha o /plano-vivo tambem";
  assert.equal(withCommand("prs", withoutCommand("prs", said)), "/prs olha o /plano-vivo tambem");
});

test("lifting the same command twice is a no-op, so a resend cannot eat the words", () => {
  const once = withoutCommand("prs", "olha isso /prs agora");
  assert.equal(withoutCommand("prs", once), once);
});

test("a native command in the middle of a sentence is just words", () => {
  const said = "eu tentei o /model e não funcionou não";
  const [one] = commandsIn(said);
  assert.equal(one.name, "model");
  assert.equal(commandCounts(one, said), false, "lifted to the head, the rest of this sentence went to the driver as a model name");
});

test("a native command that opens the message is the command", () => {
  for (const said of ["/model", "/model opus", "/model\topus", "/compact o que sobrou"]) {
    const [one] = commandsIn(said);
    assert.equal(commandCounts(one, said), true, said);
  }
});

test("a session command still travels from anywhere in the box", () => {
  const said = "arruma isso aqui /revisar por favor";
  const [one] = commandsIn(said);
  assert.equal(one.name, "revisar");
  assert.equal(commandCounts(one, said), true, "the rest of the sentence is this command's prompt — that is the whole point of lifting it");
});

test("a native name glued to punctuation does not open a message", () => {
  const said = "/model, sei lá";
  const [one] = commandsIn(said);
  assert.equal(commandCounts(one, said), false, "the head only counts when the name is followed by space or nothing");
});

test("a path that opens the message is still not a command", () => {
  assert.deepEqual(commandsIn("/Users/alguem/notas.md olha isso"), []);
});

test("a command in the menu is a command the app answers, and the two lists cannot drift", () => {
  const panes = readFileSync(join(HERE, "src", "app", "chat-and-panes.js"), "utf8");
  const pill = panes.slice(panes.indexOf("const PILL_COMMANDS"), panes.indexOf("const NATIVE_COMMANDS"));
  assert.match(panes, /const NATIVE_COMMANDS = new RegExp\(`\^\/\(\$\{NATIVE_COMMAND_NAMES/,
    "the line that decides on enter has to be built from the same list the menu reads");

  const held = [...pill.matchAll(/"([\w-]+)"/g)].map((one) => one[1]);
  const typed = NATIVE_COMMAND_NAMES.filter((one) => !held.includes(one));
  const decides = new RegExp(`^/(${typed.join("|")})(?:\\s+(.+))?$`);
  for (const name of typed) {
    assert.ok(decides.test(`/${name}`), `/${name} is in the menu and would be typed straight to the model`);
    assert.ok(isNativeCommand(name), `/${name} is answered by the app but the menu does not know it`);
  }
  assert.ok(decides.test("/plane-mode off"), "an argument comes through with the command");
  assert.equal(decides.test("/plan"), false, "there is one name for the mode, and it is /plane-mode");
});
