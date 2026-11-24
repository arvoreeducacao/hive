import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PRELOAD = fileURLToPath(new URL("../main/preload.js", import.meta.url));

const REACHABLE = new Set(["electron", "events", "timers", "url"]);

let minted = 0;

function runPreload({ withWebCrypto = true } = {}) {
  const exposed = new Map();
  const sent = [];
  const electron = {
    contextBridge: { exposeInMainWorld: (name, api) => exposed.set(name, api) },
    ipcRenderer: { on() {}, send: (...args) => sent.push(args), invoke: async () => undefined }
  };
  const context = vm.createContext({
    require(name) {
      if (!REACHABLE.has(name)) throw new Error(`module not found: ${name}`);
      return electron;
    },
    ...(withWebCrypto ? { crypto: { randomUUID: () => `page-${++minted}` } } : {})
  });
  vm.runInContext(readFileSync(PRELOAD, "utf8"), context, { filename: PRELOAD });
  return { exposed, sent };
}

test("every bridge survives the sandbox the window preload runs in", () => {
  const { exposed } = runPreload();
  assert.deepEqual([...exposed.keys()].sort(), ["hiveAway", "hiveDock", "hiveFiles", "hiveGaze", "hiveLink", "hiveMenu", "hiveMicrophone", "hiveQuit", "hiveSeatWindow", "hiveSystemSound", "hiveWindow", "seatBrowser"]);
  assert.equal(typeof exposed.get("hiveLink").open, "function");
});

test("the dock bridge hands main a whole count and asks for the window back", () => {
  const { exposed, sent } = runPreload();
  const dock = exposed.get("hiveDock");
  dock.badge(3.7);
  dock.badge(-2);
  dock.badge("x");
  dock.reveal();
  assert.deepEqual(sent, [["hive:badge", 3], ["hive:badge", 0], ["hive:badge", 0], ["hive:reveal"]]);
});

test("the file bridge asks main for a native drag with only a chat name and a path", async () => {
  const invoked = [];
  const exposed = new Map();
  const electron = {
    contextBridge: { exposeInMainWorld: (name, api) => exposed.set(name, api) },
    ipcRenderer: { on() {}, send() {}, invoke: async (...args) => { invoked.push(args); return { ok: true }; } }
  };
  const context = vm.createContext({ require: () => electron, crypto: { randomUUID: () => "page" } });
  vm.runInContext(readFileSync(PRELOAD, "utf8"), context, { filename: PRELOAD });
  assert.deepEqual(await exposed.get("hiveFiles").drag({ name: "fix-login", path: "src/a.js", extra: "dropped" }), { ok: true });
  assert.deepEqual(JSON.parse(JSON.stringify(invoked)), [["hive:file-drag", { name: "fix-login", path: "src/a.js" }]]);
});

test("the preload asks for nothing the sandbox withholds", () => {
  for (const name of ["node:crypto", "crypto", "node:os", "fs", "node:path"]) {
    assert.equal(REACHABLE.has(name), false);
  }
  assert.doesNotThrow(() => runPreload());
});

test("each page carries its own name on the wire", () => {
  const first = runPreload();
  const second = runPreload();
  first.exposed.get("hiveLink").open("/events", {});
  second.exposed.get("hiveLink").open("/events", {});
  const nameOf = (run) => run.sent.find(([channel]) => channel === "hive:open")[3];
  assert.equal(typeof nameOf(first), "string");
  assert.notEqual(nameOf(first), "");
  assert.notEqual(nameOf(first), nameOf(second));
});

test("a context without web crypto still names the page", () => {
  const { exposed, sent } = runPreload({ withWebCrypto: false });
  exposed.get("hiveLink").open("/events", {});
  const name = sent.find(([channel]) => channel === "hive:open")[3];
  assert.equal(typeof name, "string");
  assert.notEqual(name, "");
});
