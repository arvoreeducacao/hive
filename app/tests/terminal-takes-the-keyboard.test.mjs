import { test, after } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

Object.defineProperty(navigator, "userAgent", { value: `${navigator.userAgent} Electron/30.0.0`, configurable: true });
window.hiveLink = window.hiveLink || { open: () => ({ send() {}, close() {} }) };

const st = await state();
const { stopBeat } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { releaseKeyboard } = await app("focus-navigation");
const { pool } = await app("leader-key");
const { openShell } = await app("thread");

const seat = (name, kind = "chat") => ({ name, title: name, where: "local", state: "idle", kind, raw: "idle" });

const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;

let opened = [];
let onTheWire = [];

globalThis.fetch = (where, how) => {
  const path = String(where);
  if (path === "/api/shell") {
    const body = JSON.parse(how?.body || "{}");
    opened.push(body);
    const name = `terminal-${opened.length}`;
    onTheWire = [...onTheWire, seat(name, "shell")];
    return Promise.resolve(answered({ ok: true, name }));
  }
  if (path.startsWith("/api/hive")) {
    return Promise.resolve(answered({ sessions: onTheWire.map((s) => ({ ...s })), spawning: [], archived: [], pod: { up: false, name: "" } }));
  }
  return Promise.resolve(answered({}));
};

after(() => {
  for (const beat of ["threads", "prs"]) stopBeat(beat);
  globalThis.fetch = realFetch;
});

bootSolid();

function hive() {
  st.LIMIT = 6;
  onTheWire = [seat("atendimento-leitura")];
  st.data = { sessions: [seat("atendimento-leitura")], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: ["atendimento-leitura"] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.typing = null;
  st.webChat = null;
  st.cockChat = null;
  st.deviceChat = null;
  st.threadChat = null;
  st.reviewChat = null;
  opened = [];
  render();
}

test("a terminal you just opened already has the keyboard, with no click in between", async () => {
  hive();
  await openShell("local");

  assert.equal(opened.length, 1, "one shell was asked for");
  assert.equal(st.typing, "terminal-1", "the keyboard went to the terminal that was opened");

  const e = pool.get("terminal-1");
  assert.ok(e?.term, "the terminal was already built, so the focus had somewhere to land");
});

test("the terminal on the server takes the keyboard the same way", async () => {
  hive();
  await openShell("cloud");

  assert.deepEqual(opened, [{ where: "cloud" }]);
  assert.equal(st.typing, "terminal-1");
});

test("a shell the server refuses takes nobody's keyboard", async () => {
  hive();
  const shellFails = globalThis.fetch;
  globalThis.fetch = (where, how) =>
    (String(where) === "/api/shell" ? Promise.resolve(answered({ error: "cannot open" })) : shellFails(where, how));
  await openShell("local");
  globalThis.fetch = shellFails;

  assert.equal(st.typing, null, "a shell that never opened leaves the keyboard where it was");
});

test("the keyboard can still be handed back", async () => {
  hive();
  await openShell("local");
  assert.equal(st.typing, "terminal-1");
  releaseKeyboard();
  assert.equal(st.typing, null, "the release key still gets you out of the terminal");
});
