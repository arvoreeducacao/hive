import { after, test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
const posts = [];
let servers = [{ pid: 4242, port: 4173, command: "node vite", url: "http://localhost:4173" }];
globalThis.fetch = (url, init) => {
  const said = String(url);
  if (init?.method === "POST") posts.push({ url: said, body: JSON.parse(init.body || "{}") });
  if (said.startsWith("/api/changes?")) return Promise.resolve(answered({ state: "ok", branch: "jonas/lote-812", top: "/tmp/lote", files: [{ path: "a.ts", status: "M", added: 3, removed: 1 }] }));
  if (said.startsWith("/api/seat/servers/stop")) { servers = []; return Promise.resolve(answered({ ok: true })); }
  if (said.startsWith("/api/seat/servers")) return Promise.resolve(answered({ servers }));
  if (said === "/api/open-in" && !init) return Promise.resolve(answered({ apps: [{ id: "cursor", name: "Cursor" }, { id: "finder", name: "Finder" }] }));
  if (said === "/api/open-in") return Promise.resolve(answered({ ok: true }));
  if (said.startsWith("/api/checkpoints?")) return Promise.resolve(answered({ turns: [{ ordinal: 1, at: 1000, baseline: true, files: 0 }, { ordinal: 2, at: Date.parse("2026-11-23T14:02:30Z"), added: 3, removed: 1, files: 1, paths: [{ path: "src/a.ts", added: 3, removed: 1 }] }] }));
  return Promise.resolve(answered({ sessions: [], ok: true }));
};
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
const { IS_MAC } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
await app("hold-numbers");
await app("side-panel");
await app("side-panel-diff");
const bar = await app("chat-bar");
await app("chat-details");
const turnFiles = await app("turn-files");

bootSolid();

const seat = (name, title) => ({ name, where: "local", kind: "chat", structured: true, model: "Opus 5.5", state: "done", title, agent: "claude", cwd: `/tmp/${name}`, trees: [{ repo: "lote", branch: `jonas/${name}`, path: `/tmp/${name}`, main: false }], turnSince: "" });

st.LIMIT = 4;
st.data = { sessions: [seat("lote", "Lote consignado"), seat("notas", "Notas de devolução")], spawning: [], archived: [], pod: { up: false, name: "" } };
st.spaces = [{ id: "w0", name: "" }];
st.space = "w0";
st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: ["lote", "notas"] }];
st.block = 0;
st.focus = 0;
st.open = "lote";
st.seatsKnown = true;
st.prs = [];
render();

const settle = async () => {
  for (let n = 0; n < 6; n += 1) await new Promise((done) => setTimeout(done, 5));
  render();
  for (let n = 0; n < 4; n += 1) await new Promise((done) => setTimeout(done, 5));
};
const card = () => document.querySelector(".cd-card");
const press = (code, mods = {}, target = document) => {
  const ev = new KeyboardEvent("keydown", { key: code.startsWith("Key") ? code.slice(3).toLowerCase() : code, code, altKey: !!mods.alt, shiftKey: !!mods.shift, metaKey: !!mods.mod && IS_MAC, ctrlKey: !!mods.mod && !IS_MAC, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
};

test("the open chat gets a bar with back, forward, details and the right panel", async () => {
  await settle();
  const chatBar = document.querySelector('.tile[data-name="lote"] .well > .chat-bar');
  assert.ok(chatBar);
  const acts = [...chatBar.querySelectorAll("[data-act]")].map((one) => one.dataset.act);
  assert.deepEqual(acts, ["trail-back", "trail-forward", "chat-details", "side-panel"]);
});

test("⇧⌘B opens the details card with the machine, the branch, the changes and the servers", async () => {
  press("KeyB", { mod: true, shift: true });
  await settle();
  assert.ok(card());
  const text = card().textContent;
  assert.match(text, /jonas\/lote/);
  assert.match(text, /\+3/);
  assert.match(text, /localhost:4173/);
  assert.match(text, /Cursor/);
});

test("the card carries no title or small print: copies sit on the rows and in the right-click menu", async () => {
  assert.equal(card().querySelector(".cd-top, .cd-head, .cd-meta"), null);
  assert.ok(card().querySelector('.cd-line [data-act="cd-copy-path"]'), "the folder row copies its path");
  assert.ok(card().querySelector('.cd-line [data-act="cd-copy-branch"]'), "the branch row copies the branch");
  card().querySelector(".cd-sec").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  await settle();
  const items = [...card().querySelectorAll(".cd-ctx [data-act]")].map((one) => one.dataset.act + (one.dataset.item ? `:${one.dataset.item}` : ""));
  assert.deepEqual(items, ["cd-copy-path", "cd-copy-branch", "cd-copy-id", "cd-item:workspace", "cd-item:openIn", "cd-item:branch", "cd-item:changes", "cd-item:servers", "cd-item:usage", "cd-items-reset"]);
  press("Escape", {}, card().querySelector(".cd-ctx button"));
  await settle();
  assert.ok(card(), "Esc closes the menu first");
  assert.equal(card().querySelector(".cd-ctx"), null);
});

test("usage limits stay off until asked, then show the windows of the chat's login at the bottom", async () => {
  st.limits = { accounts: [{ provider: "claude", account: "default", signedIn: true, limits: [{ kind: "session", percent: 40, resets_at: "2026-11-24T05:00:00Z" }, { kind: "weekly_all", percent: 96 }] }], tightest: "default" };
  st.limitsAt = Date.now();
  await settle();
  assert.equal(card().querySelector(".cd-use"), null, "off by default");
  card().querySelector(".cd-sec").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  await settle();
  card().querySelector('.cd-ctx [data-item="usage"]').click();
  await settle();
  const rows = [...card().querySelectorAll(".cd-use")];
  assert.equal(rows.length, 2);
  assert.match(rows[0].textContent, /5h.*40%/);
  assert.ok(rows[1].classList.contains("full"));
  assert.equal(JSON.parse(localStorage.getItem("hive.details.items")).usage, true);
  card().querySelector('.cd-ctx [data-act="cd-items-reset"]').click();
  await settle();
  assert.equal(card().querySelector(".cd-use"), null, "reset turns it back off");
  assert.equal(localStorage.getItem("hive.details.items"), null);
  press("Escape", {}, card().querySelector(".cd-ctx button"));
  await settle();
});

test("with every item off the card offers only the way back to the choice", async () => {
  for (const item of ["workspace", "openIn", "branch", "changes", "servers"]) {
    card().querySelector(".cd-sec").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
    await settle();
    card().querySelector(`.cd-ctx [data-item="${item}"]`).click();
    await settle();
    press("Escape", {}, card().querySelector(".cd-ctx button"));
    await settle();
  }
  assert.equal(card().querySelectorAll(".cd-sec[aria-label]").length, 0);
  card().querySelector('.cd-sec [data-act="cd-items"]').click();
  await settle();
  assert.ok(card().querySelector(".cd-ctx"), "the choice opens from the empty card");
  card().querySelector('.cd-ctx [data-act="cd-items-reset"]').click();
  await settle();
  assert.equal(localStorage.getItem("hive.details.items"), null);
  press("Escape", {}, card().querySelector(".cd-ctx button"));
  await settle();
});

test("open in uses the chosen app and the chooser remembers it", async () => {
  card().querySelector('[data-act="cd-open-menu"]').click();
  await settle();
  card().querySelector('[data-act="cd-open-with"][data-app="finder"]').click();
  await settle();
  assert.deepEqual(posts.at(-1), { url: "/api/open-in", body: { name: "lote", app: "finder" } });
  assert.match(card().querySelector(".cd-open-main").textContent, /Finder/);
});

test("Stop asks the server to stop that process and the server leaves the list", async () => {
  card().querySelector('[data-act="cd-server-stop"]').click();
  await settle();
  await settle();
  assert.deepEqual(posts.at(-1), { url: "/api/seat/servers/stop", body: { name: "lote", pid: 4242 } });
  assert.doesNotMatch(card().textContent, /localhost:4173/);
});

test("Esc closes the card and gives the focus back to the details button", async () => {
  card().querySelector("button").focus();
  press("Escape", {}, card().querySelector("button"));
  assert.equal(card(), null);
  const button = document.querySelector('.chat-ctl[data-name="lote"] [data-act="chat-details"]');
  assert.ok(document.activeElement === button, `open=${st.open} bar=${!!document.querySelector(".chat-bar")} ctl=${document.querySelectorAll(".chat-ctl").length}`);
});

test("back and forward walk between the chats read before", async () => {
  st.open = "notas";
  st.focus = 1;
  render();
  await settle();
  assert.ok(bar.canStep(-1));
  bar.stepVisit(-1);
  await settle();
  assert.equal(st.open || st.blocks[0].keys[st.focus], "lote");
  assert.ok(bar.canStep(1));
  bar.stepVisit(1);
  await settle();
  assert.equal(st.open || st.blocks[0].keys[st.focus], "notas");
});

test("a chat opened after a step back enters the trail on its first visit", async () => {
  bar.stepVisit(-1);
  await settle();
  assert.equal(st.open || st.blocks[0].keys[st.focus], "lote");
  bar.noteVisit("notas");
  assert.equal(bar.canStep(1), false);
  assert.ok(bar.canStep(-1));
  st.open = "notas";
  st.focus = 1;
  render();
  await settle();
});

test("the files a turn changed show under it in any structure, and Open diff opens that turn in the panel", async () => {
  const files = turnFiles.turnFilesOf({ name: "lote" });
  assert.equal(typeof files, "function");
  await settle();
  const shown = turnFiles.turnFilesOf({ name: "lote" })([Date.parse("2026-11-23T14:02:00Z")]);
  const one = shown.get(0);
  assert.ok(one, "the turn that ended after the ask holds the files");
  assert.match(one.html, /data-act="turn-diff"/);
  assert.match(one.html, /data-act="turn-revert"/);
});
