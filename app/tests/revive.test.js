const { test } = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { REVIVALS, STEADY, readDeath } = require("../main/revive.js");

test("a pkill from a session brings the server back instead of a dialog", () => {
  const death = readDeath({ code: 0, signal: null, revivals: 0, aliveFor: 5000 });
  assert.equal(death.verdict, "revive");
  assert.equal(death.revivals, 1);
});

test("a kill -9 counts as the same kind of death", () => {
  const death = readDeath({ code: null, signal: "SIGKILL", revivals: 0, aliveFor: 5000 });
  assert.equal(death.verdict, "revive");
  assert.equal(death.killedBy, "SIGKILL");
});

test("a server that crashes on its own is mourned, not revived", () => {
  const death = readDeath({ code: 1, signal: null, revivals: 0, aliveFor: 5000 });
  assert.equal(death.verdict, "mourn");
  assert.match(death.reason, /code 1/);
  assert.match(death.said, /code 1/);
});

test("the revivals run out so a killing loop is not endless", () => {
  const death = readDeath({ code: 0, signal: null, revivals: REVIVALS, aliveFor: 5000 });
  assert.equal(death.verdict, "mourn");
  assert.match(death.said, /pkill -f "node server.mjs"/);
});

test("a server that stayed up starts the count over", () => {
  const death = readDeath({ code: 0, signal: null, revivals: REVIVALS, aliveFor: STEADY });
  assert.equal(death.verdict, "revive");
  assert.equal(death.revivals, 1);
});

test("the app revives the server and reloads the window", () => {
  const main = readFileSync(join(require("node:path").join(__dirname, ".."), "main.js"), "utf8");
  const onExit = main.slice(main.indexOf('server.on("exit"'), main.indexOf("if (await waitForServer())"));
  assert.match(onExit, /const death = readDeath\(/);
  const bail = onExit.indexOf("if (death.verdict === \"revive\") return reviveServer(death);");
  const dialog = onExit.indexOf("showErrorBox");
  assert.ok(bail > 0 && dialog > bail, "the death dialog fires before the revival");
  const revive = main.slice(main.indexOf("async function reviveServer"), main.indexOf("async function startServer"));
  assert.match(revive, /await startServer\(\)/);
  assert.match(revive, /showBase\(\)/);
});

test("loading the app clears the history so the mouse back button cannot reach the boot screen", () => {
  const main = readFileSync(join(require("node:path").join(__dirname, ".."), "main.js"), "utf8");
  const showBase = main.slice(main.indexOf("function showBase"), main.indexOf("async function reviveServer"));
  assert.match(showBase, /window_\.loadURL\(BASE\)/);
  assert.match(showBase, /navigationHistory\.clear\(\)/);
  const ready = main.slice(main.indexOf("app.whenReady"));
  assert.match(ready, /showBase\(\)/);
});

test("no server here answers to the pkill everyone types", () => {
  const main = readFileSync(join(require("node:path").join(__dirname, ".."), "main.js"), "utf8");
  const { scripts } = JSON.parse(readFileSync(join(require("node:path").join(__dirname, ".."), "package.json"), "utf8"));
  assert.match(main, /spawn\(node, \["\.\/server\.mjs"\]/);
  for (const [name, line] of Object.entries(scripts)) {
    assert.ok(!/node server\.mjs/.test(line), `npm run ${name} starts a server a pattern kill can find`);
  }
});
