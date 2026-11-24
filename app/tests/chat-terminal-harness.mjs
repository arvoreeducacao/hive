import { after } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

export const net = { shells: [], kills: [], held: [], nextNames: [], holdShells: false, killRefused: false, echoNames: false };

export const focused = [];
export const sentToShell = [];
export const selected = [];

const st = await state();
const { pool } = await app("leader-key");

export function fakeTerminal(name) {
  if (pool.has(name)) return pool.get(name);
  const host = document.createElement("div");
  host.className = "host";
  host.tabIndex = -1;
  const term = { focus() { focused.push(name); host.focus(); }, open() {}, cols: 80, rows: 24, dispose() {}, scrollLines() {}, scrollToBottom() {}, selectAll() { selected.push(name); }, hasSelection: () => false, getSelection: () => "" };
  const e = { term, fit: { fit() {} }, host, attached: true, ws: { readyState: 1, send(data) { sentToShell.push([name, data]); }, close() {} }, size: "", where: "local", name, root: false, hist: null, lookingBack: false, loadingBack: false };
  pool.set(name, e);
  return e;
}

const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const said = String(url);
  if (said.startsWith("/api/shell")) {
    const body = JSON.parse(init?.body || "{}");
    net.shells.push(body);
    const name = (net.echoNames && body.name) || net.nextNames.shift() || `${body.of}-terminal`;
    fakeTerminal(name);
    const reply = answered({ ok: true, name, where: "local", of: body.of });
    if (!net.holdShells) return Promise.resolve(reply);
    return new Promise((done) => net.held.push({ body, go: () => done(reply) }));
  }
  if (said.startsWith("/api/kill")) {
    net.kills.push(JSON.parse(init?.body || "{}"));
    if (net.killRefused) return Promise.resolve({ ok: false, status: 502, json: async () => ({ error: "the shell would not close" }) });
    return Promise.resolve(answered({ ok: true }));
  }
  if (said.startsWith("/api/changes?")) return Promise.resolve(answered({ state: "ok", added: 0, removed: 0, files: [], ahead: [] }));
  if (said.includes("/api/subagents")) return Promise.resolve(answered({ agents: [] }));
  return Promise.resolve(answered({ sessions: [], ok: true }));
};
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const core = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { tiles } = await app("leader-key");
await app("hold-numbers");
await app("chat-bar");
await app("chat-terminal");

bootSolid();
document.body.classList.add("experience-raycast");
document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: "raycast", was: "current" } }));

export const seat = (name, title, extra = {}) => ({ name, where: "local", kind: "chat", structured: true, model: "Opus 5.5", state: "done", title, agent: "claude", trees: [{ repo: "acme-hub", branch: `jonas/${name}`, path: `/tmp/${name}`, main: false }], ...extra });

export function lay() {
  st.LIMIT = 4;
  st.calmOn = false;
  st.team = { me: "jonas", machine: "Mac mini", devs: [] };
  st.data = { sessions: [seat("ada", "com terminal"), seat("bea", "sem terminal"), seat("cid", "na nuvem", { where: "cloud" })], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: ["ada", "bea", "cid"] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.seatLayout = "grid";
  st.planeOn = false;
  st.mirrorDev = "";
  st.prs = [];
  render();
}

export const settle = async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((done) => setTimeout(done, 5));
  await new Promise((done) => requestAnimationFrame(done));
};

export function read(name) {
  const at = st.blocks[st.block].keys.indexOf(name);
  st.focus = at;
  st.open = name;
  render();
}

export const tileOf = (name) => tiles.get(name);
export const wellOf = (name) => tileOf(name)?.querySelector(":scope > .well");
export const drawerOf = (name) => wellOf(name)?.querySelector(":scope > .ct") || null;
export const composerOf = (name) => tileOf(name)?.querySelector(".sv-composer textarea");
export const saved = () => JSON.parse(localStorage.getItem("hive.chatTerminal") || "{}");
export const paneNames = (name) => [...(drawerOf(name)?.querySelectorAll(".ct-panes > .ct-pane") || [])].map((pane) => pane.dataset.name);

export function press(target, code, extra = {}) {
  const ev = new KeyboardEvent("keydown", { key: code.replace(/^Key/, "").toLowerCase(), code, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(ev);
  return ev;
}

export function toggleKeys(target = document.activeElement || document.body) {
  return core.IS_MAC ? press(target, "KeyJ", { metaKey: true }) : press(target, "Backquote", { key: "`", ctrlKey: true });
}

export { assert, core, render, st, pool, tiles };
