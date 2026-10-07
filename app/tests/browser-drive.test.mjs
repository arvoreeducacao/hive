import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { sayPage, MAP_CEILING } from "../assets/page-map.mjs";
import { registerBrowserRoutes } from "../routes/browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(join(here, "..", "server.mjs"), "utf8");
const browserRoutes = readFileSync(join(here, "..", "routes", "browser.mjs"), "utf8");
const panes = readFileSync(join(here, "..", "src", "app", "chat-and-panes.js"), "utf8");
const core = readFileSync(join(here, "..", "src", "app", "core.js"), "utf8");
const main = readFileSync(join(here, "..", "main.js"), "utf8");
const preload = readFileSync(join(here, "..", "main", "preload.js"), "utf8");
const map = readFileSync(join(here, "..", "assets", "page-map.mjs"), "utf8");

const cut = (text, from, to, what) => {
  const a = text.indexOf(from);
  assert.ok(a >= 0, `${what}: missing ${from}`);
  const b = text.indexOf(to, a);
  assert.ok(b > a, `${what}: missing ${to}`);
  return text.slice(a, b);
};

test("the page is read as roles, names and values — the shape a form can be filled from", () => {
  const said = sayPage({
    url: "http://localhost:3000/writing", title: "Cronograma",
    rows: [
      { ref: "e1", role: "heading", depth: 0, name: "Cronograma", value: "", marks: [] },
      { ref: "e4", role: "textbox", depth: 1, name: "Data de entrega", value: "27/08/2026", marks: ["required"] },
      { ref: "e8", role: "button", depth: 1, name: "Salvar", value: "", marks: ["disabled"] },
      { ref: "e9", role: "link", depth: 1, name: "voltar", value: "", marks: [], url: "/writing" }
    ]
  });
  assert.match(said, /Cronograma — http:\/\/localhost:3000\/writing/);
  assert.match(said, /- heading "Cronograma" \[ref=e1\]/);
  assert.match(said, / {2}- textbox "Data de entrega" = "27\/08\/2026" \[required\] \[ref=e4\]/);
  assert.match(said, /button "Salvar" \[disabled\] \[ref=e8\]/);
  assert.match(said, /link "voltar" → \/writing \[ref=e9\]/);
});

test("the app can actually load the module it maps pages with", () => {
  assert.match(server, /"\/assets\/page-map\.mjs": \["assets\/page-map\.mjs", "text\/javascript"\]/, "an import the server does not serve takes the whole page down");
  assert.match(core, /import \{ readPage, sayPage, reachRef, chooseOption, lookFor, markUpload, forgetUpload \} from "\/assets\/page-map\.mjs";/);
});

test("the map is taken in the page and the refs are kept there, not in the app", () => {
  assert.match(map, /window\.__hiveRefs = seen;/);
  const reach = cut(map, "export function reachRef(ref) {", "\n}\n", "page-map.mjs");
  assert.match(reach, /no map of this page yet — browser_snapshot first/);
  assert.match(reach, /left the page — browser_snapshot again/);
  assert.match(reach, /scrollIntoView/, "an element out of view is brought in before it is clicked");
});

test("the seat acts through a real mouse and a real keyboard, never a javascript call", () => {
  const click = cut(panes, "async function runBrowserClick(name, id, job) {", "\n}\n", "chat-and-panes.js");
  assert.match(click, /window\.seatBrowser\.input\(found\.wcId, \{ kind: "click", x: found\.at\.x, y: found\.at\.y \}\)/);
  assert.ok(!click.includes(".click()"), "el.click() is not what a person does");
  const input = cut(main, 'ipcMain.handle("seat-browser:input"', "\n  });\n", "main.js");
  assert.match(input, /Input\.dispatchMouseEvent/);
  assert.match(input, /wc\.sendInputEvent\(\{ type: "char", keyCode: letter \}\)/);
  assert.match(input, /wc\.sendInputEvent\(\{ type: "keyDown", keyCode: stroke\.keyCode \}\)/);
  assert.match(input, /if \(!wc\) return \{ error: "not a seat browser tab" \}/, "input only ever reaches a seat tab");
  assert.match(preload, /input: \(wcId, act\) => ipcRenderer\.invoke\("seat-browser:input", wcId, act\)/);
});

test("the seat's keys never go through the devtools keyboard, which lands them in the person's composer", () => {
  const input = cut(main, 'ipcMain.handle("seat-browser:input"', "\n  });\n", "main.js");
  assert.ok(!input.includes("Input.insertText"), "a hidden tab's text went to whatever the hive had focused");
  assert.ok(!input.includes("Input.dispatchKeyEvent"), "a hidden tab's Enter sent the chat the person was writing");
});

test("a seat's click gives the focus back to what the person was typing in", () => {
  const born = cut(panes, "function bornWebFrame(yard, name, t) {", "\n}\n", "chat-and-panes.js");
  assert.match(born, /frame\.addEventListener\("focus", \(\) => \{\n\s+if \(pageMayHoldFocus\(name\)\) return;\n\s+if \(personsFocus\?\.isConnected\) personsFocus\.focus\(\{ preventScroll: true \}\);/);
  assert.match(panes, /if \(!ev\.target\.closest\?\.\("#webyard"\)\) personsFocus = ev\.target;/, "the page's own focus is never what the person was on");
  assert.match(panes, /const pageMayHoldFocus = \(name\) => webYards\.get\(name\)\?\.classList\.contains\("onstage"\) && !\(webDriving\.get\(name\)\?\.busy > 0\);/, "only a page the person can see, and is not being driven, keeps the focus");
});

test("typing replaces what the field had, and only presses Enter when asked", () => {
  const fn = cut(panes, "async function runBrowserType(name, id, job) {", "\n}\n", "chat-and-panes.js");
  assert.match(fn, /document\.execCommand\("selectAll"\)/);
  assert.match(fn, /if \(job\.submit\)/);
  assert.match(fn, /kind: "text", text: job\.text/);
});

test("only the keys the browser knows how to send are sent, and it says which", () => {
  const keys = cut(main, "const TYPED_KEYS = {", "\n  };", "main.js");
  for (const key of ["Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowUp", "ArrowDown", "Home", "End"]) {
    assert.ok(keys.includes(`${key}:`), `${key} is missing`);
  }
  assert.match(main, /is not a key this browser sends — \$\{Object\.keys\(TYPED_KEYS\)\.join\(", "\)\}/);
});

test("the routes check the ref before it reaches the page, and hold the job like the others", () => {
  const click = cut(browserRoutes, '"/api/browser/click"', '"/api/browser/type"', "routes/browser.mjs");
  assert.match(click, /REF_SHAPE\.test\(ref\)/);
  assert.match(click, /return \{ op: "click", ref \}/);
  const type = cut(browserRoutes, '"/api/browser/type"', '"/api/browser/key"', "routes/browser.mjs");
  assert.match(type, /text\.length > 4000/, "a field is not a file upload");
  const wait = cut(browserRoutes, '"/api/browser/wait"', '"/api/browser/choose"', "routes/browser.mjs");
  assert.match(wait, /Math\.min\(60, Math\.max\(1, Number\(asked\.seconds\) \|\| 10\)\)/);
  assert.match(wait, /\(seconds \+ 5\) \* 1000/, "the wait outlives what it is waiting for");
  const held = cut(browserRoutes, "const held = (op, timeout", "const seatSide", "routes/browser.mjs");
  assert.match(held, /holdBrowserOp\(asked\.name, built/, "every held route waits on the same job queue");
});

test("browser operations keep their short and long timeout groups", async () => {
  const routes = new Map();
  registerBrowserRoutes((method, path, handler) => routes.set(path, handler), {
    isSeatName: () => true,
    bodyOf: async (req) => req.body,
    fleet: new Map(),
    saveFiles: async () => ({ files: [] }),
    onTheServer: async () => {},
    cloudReach: {},
    typeText: async () => {}
  });
  const waits = [];
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, wait) => {
    waits.push(wait);
    queueMicrotask(fn);
    return 1;
  };
  try {
    const json = () => {};
    await routes.get("/api/browser/shoot")({ body: { name: "seat" } }, {}, new URL("http://hive/api/browser/shoot"), json);
    await routes.get("/api/browser/map")({ body: { name: "seat" } }, {}, new URL("http://hive/api/browser/map"), json);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  assert.deepEqual(waits, [12000, 20000]);
});

test("the wait polls the page and gives up out loud", () => {
  const fn = cut(panes, "async function runBrowserWait(name, id, job) {", "\n}\n", "chat-and-panes.js");
  assert.match(fn, /lookFor, job\.text, job\.gone === true/);
  assert.match(fn, /did not show up in \$\{job\.seconds\}s/);
  assert.match(fn, /was still there after \$\{job\.seconds\}s/);
});

test("the map reaches where a screenshot cannot: shadow roots, same-origin frames, text", () => {
  const read = cut(map, "export function readPage(", "\nexport function sayPage", "page-map.mjs");
  assert.match(read, /if \(el\.shadowRoot\)/, "a component that hides its insides is still a screen");
  assert.match(read, /el\.tagName === "IFRAME"/);
  assert.match(read, /this frame is from another origin and cannot be read/, "what cannot be read is said, not skipped in silence");
  assert.match(read, /keep\(\{ role: "text", depth, text: said \}\)/, "loose text is part of the screen");
  assert.match(read, /cursor === "pointer"/, "a div that acts like a button is one");
  assert.match(read, /aria-hidden"\) === "true"/, "what the page hides from a reader is hidden from the seat too");
});

test("a ref inside a frame is clicked where the frame really is", () => {
  const reach = cut(map, "export function reachRef(ref) {", "\n}\n", "page-map.mjs");
  assert.match(reach, /const frame = host \? host\.getBoundingClientRect\(\) : \{ left: 0, top: 0 \};/);
  assert.match(reach, /x: frame\.left \+ box\.left/, "without the frame offset the click lands somewhere else on the page");
});

test("a page too big to read says which way out it has", () => {
  const said = sayPage({ url: "u", title: "t", cut: true, rows: [] });
  assert.match(said, new RegExp(`cut at ${MAP_CEILING} elements`));
  assert.match(said, /browser_snapshot again with within/);
});

test("the seat opens its own tabs, and the cap answers with what to do", () => {
  const fn = cut(panes, "function runBrowserTabs(name, id, job) {", "\n}\n", "chat-and-panes.js");
  assert.match(fn, /already has \$\{WEB_TAB_CAP\} pages open/);
  assert.match(fn, /if \(job\.act === "open"\)/);
  assert.match(fn, /drivenTab\.set\(name, tab\.id\)/, "select must move the seat's tab, not the person's");
  assert.doesNotMatch(fn, /web\.active = /, "the seat must never write the tab the person is looking at");
  assert.match(fn, /closeWebTab\(name, tab\.id\)/);
  const route = cut(browserRoutes, '"/api/browser/tabs"', '"/api/browser/step"', "routes/browser.mjs");
  assert.match(route, /\["list", "open", "select", "close"\]\.includes\(act\)/);
});

test("back, forward and reload wait for the page to land before answering", () => {
  const fn = cut(panes, "async function runBrowserStep(name, id, job) {", "\n}\n", "chat-and-panes.js");
  assert.match(fn, /!frame\.canGoBack\(\)/);
  assert.match(fn, /!frame\.canGoForward\(\)/);
  assert.match(fn, /did-stop-loading/);
  const route = cut(browserRoutes, '"/api/browser/step"', '"/api/browser/upload"', "routes/browser.mjs");
  assert.match(route, /\["back", "forward", "reload"\]\.includes\(way\)/);
});

test("a dropdown is chosen by what it reads on screen, and a wrong option lists the right ones", () => {
  const fn = cut(map, "export function chooseOption(ref, wanted) {", "\n}\n", "page-map.mjs");
  assert.match(fn, /is not one of the options/);
  assert.match(fn, /new Event\("change", \{ bubbles: true \}\)/, "a framework listens to change, not to the assignment");
  assert.match(fn, /is a \$\{el\.tagName\.toLowerCase\(\)\}, not a dropdown/);
});

test("a file only reaches a page if it is a real file and not a secret", () => {
  const guard = cut(browserRoutes, "const refuseFile = (path) => {", "\n};", "routes/browser.mjs");
  assert.match(guard, /is not a full path/);
  assert.match(guard, /looks like a secret, and a page is never where one goes/);
  assert.match(guard, /bigger than \$\{Math\.round\(UPLOAD_CEILING/);
  for (const secret of ["SECRET_PATHS", "SECRET_KINDS"]) assert.ok(browserRoutes.includes(secret), `${secret} is missing`);
  const kept = cut(browserRoutes, "const SECRET_PATHS =", "\n", "routes/browser.mjs");
  for (const dir of ["ssh", "aws", "gnupg", "hive", "claude", "codex", "kimi", "kiro", "cursor", "opencode", "env", "credentials"]) {
    assert.ok(kept.includes(dir), `${dir} is not on the refused list — every agent's home holds a token`);
  }
  const route = cut(browserRoutes, '"/api/browser/upload"', '"/api/browser/network"', "routes/browser.mjs");
  assert.match(route, /files\.length > 5/);
  assert.match(route, /const no = refuseFile\(file\)/);
});

test("a file field the page hides is still on the map — that is how uploads are built", () => {
  const read = cut(map, "export function readPage(", "\nexport function sayPage", "page-map.mjs");
  assert.match(read, /const fileField = \(el\) => el\.tagName === "INPUT"/);
  assert.match(read, /if \(fileField\(el\)\) return false;/, "display:none on the real input is the normal way to style an upload");
});

test("the file field is found and released, and a field inside a frame says so", () => {
  const mark = cut(map, "export function markUpload(ref) {", "\n}\n", "page-map.mjs");
  assert.match(mark, /input\[type="file"\]/, "a styled upload hides the real field inside a wrapper");
  assert.match(mark, /if \(found\.host\) return \{ error/);
  const fn = cut(panes, "async function runBrowserUpload(name, id, job) {", "\n}\n", "chat-and-panes.js");
  assert.match(fn, /inThePage\(frame, forgetUpload\)/, "the mark never outlives the upload");
  assert.match(main, /DOM\.setFileInputFiles/);
  assert.match(main, /\[data-hive-upload\]/);
});

test("the calls a page makes are kept per tab, and start over on each new page", () => {
  const watch = cut(main, "const watchNetwork = (guest) => {", "\n  };", "main.js");
  assert.match(watch, /Network\.requestWillBeSent/);
  assert.match(watch, /Network\.responseReceived/);
  assert.match(watch, /Network\.loadingFailed/);
  assert.match(watch, /params\.type === "Document"[^\n]*kept\.length = 0/, "a new page starts a new list");
  assert.match(watch, /kept\.splice\(0, kept\.length - NET_KEEP\)/, "the list never grows without end");
  assert.match(main, /guest\.once\("destroyed", \(\) => seatNet\.delete\(guest\.id\)\)/);
  const fn = cut(panes, "async function runBrowserNetwork(name, id, job) {", "\n}\n", "chat-and-panes.js");
  assert.match(fn, /c\.failed \|\| c\.status >= 400/);
  assert.match(fn, /no call on this page failed/);
});
