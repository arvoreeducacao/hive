import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanTerminal, cleanPatch, TERMINAL_CHOICES } from "../lib/config.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = ["src/app/brand-face.js", "src/app/terminal-pool.js", "src/app/terminal-history.js"].map((f) => readFileSync(join(HERE, f), "utf8")).join("\n");
const server = readFileSync(join(HERE, "server.mjs"), "utf8");
const wrapper = readFileSync(join(HERE, "assets/ghostty/term.mjs"), "utf8");

test("ghostty is the engine nobody configured", () => {
  assert.equal(cleanTerminal(undefined, "x", []), "ghostty");
});

test("both engines are accepted, anything else falls back and complains", () => {
  for (const choice of TERMINAL_CHOICES) {
    const problems = [];
    assert.equal(cleanTerminal(choice, "x", problems), choice);
    assert.deepEqual(problems, []);
  }
  const problems = [];
  assert.equal(cleanTerminal("kitty", "x", problems), "ghostty");
  assert.equal(problems.length, 1);
});

test("the patch path carries the terminal choice", () => {
  const { clean, problems } = cleanPatch({ terminal: "xterm" });
  assert.deepEqual(problems, []);
  assert.equal(clean.terminal, "xterm");
});

test("the server reads the flag and serves the adapter", () => {
  assert.ok(server.includes("terminal: cleanTerminal(raw.terminal"));
  for (const path of ["/assets/ghostty/ghostty.mjs", "/assets/ghostty/term.mjs", "/assets/ghostty/ghostty-vt.wasm", "/assets/ghostty/ghostty-write-pty.wasm"]) {
    assert.ok(server.includes(`"${path}"`), `${path} is not served`);
  }
});

test("the page adopts the flag and asks the factory, not the class", () => {
  assert.ok(page.includes("adoptTerminalEngine(r)"));
  assert.ok(page.includes('import { GhosttyTerm } from "/assets/ghostty/term.mjs"'));
  const factoryCalls = page.match(/newTerm\(\{ \.\.\.TERM_LOOK/g) || [];
  assert.equal(factoryCalls.length, 2, "the live and the history terminal both go through the factory");
  assert.ok(!/new Terminal\(\{ \.\.\.TERM_LOOK/.test(page), "no terminal is built around the factory");
});

const wrapperClass = () => {
  const body = wrapper
    .replace('import { GhosttyTerminalSurface } from "/assets/ghostty/ghostty.mjs";', "")
    .replace(/export class GhosttyTerm/, "class GhosttyTerm");
  return new Function("GhosttyTerminalSurface", `${body}; return GhosttyTerm;`)(undefined);
};

test("OSC 52 is fished out of the stream, split chunks included", () => {
  const GhosttyTerm = wrapperClass();
  const term = new GhosttyTerm({ theme: {} });
  const got = [];
  term.parser.registerOscHandler(52, (payload) => got.push(payload));
  const b64 = Buffer.from("copied").toString("base64");
  assert.equal(term.siftOsc52(`antes\x1b]52;c;${b64}\x07depois`), "antesdepois");
  assert.equal(term.siftOsc52(`x\x1b]52;c;${b64.slice(0, 4)}`), "x");
  assert.equal(term.siftOsc52(`${b64.slice(4)}\x1b\\y`), "y");
  assert.deepEqual(got, [`c;${b64}`, `c;${b64}`]);
});

test("a stream with no handler passes through untouched", () => {
  const GhosttyTerm = wrapperClass();
  const term = new GhosttyTerm({ theme: {} });
  const raw = `a\x1b]52;c;AAAA\x07b`;
  assert.equal(term.siftOsc52(raw), raw);
});

test("the wrapper speaks the xterm dialect the page uses", () => {
  const GhosttyTerm = wrapperClass();
  const term = new GhosttyTerm({ theme: {} });
  for (const said of ["open", "write", "onData", "onSelectionChange", "attachCustomKeyEventHandler", "registerLinkProvider", "loadAddon", "fit", "focus", "blur", "getSelection", "hasSelection", "scrollLines", "scrollToBottom", "reset", "dispose", "atBottom"]) {
    assert.equal(typeof term[said], "function", `${said} is missing`);
  }
  assert.equal(term.cols, 0);
  assert.equal(term.rows, 0);
  assert.equal(term.modes.mouseTrackingMode, "none");
  assert.equal(typeof term.parser.registerOscHandler, "function");
  term.options.theme = { background: "#000000" };
  assert.equal(term.options.theme.background, "#000000");
});

test("the terminal wears the panel it sits in, not a palette of its own", () => {
  const GhosttyTerm = wrapperClass();
  const panel = { nodeType: 1, parentElement: null, css: { backgroundColor: "rgb(19, 20, 22)" } };
  const host = { nodeType: 1, parentElement: panel, css: { backgroundColor: "rgba(0, 0, 0, 0)" } };
  const vars = { "--txt": "#F2EFEA", "--accent": "#E5B567", "--accent-bg": "rgba(229,181,103,0.18)", "--txt-3": "#7C7D7E" };
  globalThis.getComputedStyle = (el) => ({ backgroundColor: el.css.backgroundColor, getPropertyValue: (name) => vars[name] || "" });
  try {
    const term = new GhosttyTerm({ theme: { background: "#000000", foreground: "#FFFFFF", cursor: "#FFFFFF", red: "#FF0000" } });
    term.element = host;
    const worn = term.wornTheme();
    assert.equal(worn.background, "#131416");
    assert.equal(worn.foreground, "#F2EFEA");
    assert.equal(worn.cursor, "#E5B567");
    assert.equal(worn.selectionBackground, "rgba(229,181,103,0.18)");
    assert.equal(worn.brightBlack, "#7C7D7E");
    assert.equal(worn.red, "#FF0000");
  } finally {
    delete globalThis.getComputedStyle;
  }
});
