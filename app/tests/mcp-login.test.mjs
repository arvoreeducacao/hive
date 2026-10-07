import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { loginUrlIn, loginVerdict, plain } from "../lib/mcp-login.mjs";

const OSC = "\x1b]8;;";
const BEL = "\x07";
const URL = "https://www.figma.com/oauth/mcp?response_type=code&client_id=9ie8&state=abc";

const screenWithLink = [
  'Starting authentication for "figma"…',
  "Visit this URL to authorize:",
  `  ${OSC}${URL}${BEL}\x1b[94m${URL}\x1b[39m${OSC}${BEL}`,
  "",
  "Waiting for authorization… (^C to cancel)"
].join("\r\n");

test("the address comes out of the hyperlink the terminal painted, not glued to its escapes", () => {
  assert.equal(loginUrlIn(screenWithLink), URL);
  assert.equal(loginUrlIn(screenWithLink).includes("\x1b"), false);
  assert.equal(loginUrlIn(screenWithLink).includes(BEL), false);
});

test("a screen with no address answers empty instead of guessing", () => {
  assert.equal(loginUrlIn("Waiting for authorization…"), "");
  assert.equal(loginUrlIn(""), "");
});

test("plain keeps the lines and drops the paint", () => {
  assert.equal(plain("\x1b[31mred\x1b[39m"), "red");
  assert.equal(plain("one\r\ntwo").split("\n").length, 2);
});

test("a login that gave up for want of a terminal is a failure, even leaving with code 0", () => {
  const tail = [
    'Starting authentication for "360dialog"…',
    "Waiting for authorization… (^C to cancel)",
    `Couldn't complete authentication for "360dialog": stdin isn't a terminal, so authentication can't be completed here.`
  ].join("\n");
  const verdict = loginVerdict(0, tail);
  assert.equal(verdict.state, "failed");
  assert.match(verdict.error, /stdin isn't a terminal/);
});

test("the login that worked is the only one called done", () => {
  const tail = `Authenticated with "360dialog". Its tools are now available in Claude Code.`;
  assert.deepEqual(loginVerdict(0, tail), { state: "done", error: "" });
});

test("what the login said is what the person reads", () => {
  assert.match(loginVerdict(1, 'No MCP server named "nao-existe". Configured servers: figma, linear').error, /No MCP server named/);
  assert.match(loginVerdict(1, '"figma" is from .mcp.json and awaiting approval. Run `claude` in this directory to review it first.').error, /awaiting approval/);
  assert.match(loginVerdict(0, "HTTP 401 Unauthorized\ndone").error, /HTTP 401/);
  assert.equal(loginVerdict(2, "").error, "login exited with code 2");
});

test("the verdict reads the screen through the paint", () => {
  const painted = `\x1b[31mCouldn't complete authentication for "figma": the login timed out\x1b[39m`;
  const verdict = loginVerdict(0, painted);
  assert.equal(verdict.state, "failed");
  assert.equal(verdict.error.includes("\x1b"), false);
  assert.match(verdict.error, /^Couldn't complete authentication/);
});

test("an error longer than the row is cut, never dropped", () => {
  const verdict = loginVerdict(1, "x".repeat(400));
  assert.equal(verdict.state, "failed");
  assert.equal(verdict.error.length, 200);
});

test("a login on a kimi seat says plainly there is no command to drive, here and on the box, instead of running claude's", () => {
  const server = readFileSync(new globalThis.URL("../server.mjs", import.meta.url), "utf8");
  const local = server.slice(server.indexOf("function startMcpLogin("), server.indexOf("function loginUrlIn") > 0 ? server.indexOf("function loginUrlIn") : server.indexOf("function startMcpLogin(") + 4000);
  assert.match(local, /if \(OTHER_AGENTS\.has\(meta\.agent\)\) engine = meta\.agent;/, "an agent the hive runs was still read as claude");
  assert.match(local, /if \(engine === "kimi"\) \{\n\s+job\.state = "failed";\n\s+job\.error = `kimi has no login command/);
  assert.ok(local.indexOf('engine === "kimi"') < local.indexOf("theClaude(), [\"mcp\", \"login\""), "kimi reached claude's login");
  const cloud = server.slice(server.indexOf("async function runCloudMcpLogin("), server.indexOf("async function codexKnowsTheServer("));
  assert.match(cloud, /kimi\|kiro\|cursor\) echo "\$engine has no login command/);
  assert.match(local, /if \(engine === "cursor"\) \{\n\s+job\.state = "failed";\n\s+job\.error = `cursor's mcp login only knows/);
  assert.ok(local.indexOf('engine === "cursor"') < local.indexOf("theClaude(), [\"mcp\", \"login\""), "cursor reached claude's login");
  assert.match(cloud, /claude\|""\) claude mcp login/, "an unknown agent on the box still fell through to claude's login");
});
