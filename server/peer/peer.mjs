import { readFile, readdir, stat, mkdir, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, basename, dirname } from "node:path";
import { request } from "node:http";
import { birthsLeft, seatTitle } from "../engine/protocol.mjs";
import { PROVIDER_IDS } from "../engine/providers.mjs";
import { socketPathFor, canonicalLabel, shelfPageUrl, shelfDeepLink } from "../door.mjs";

import { stateDir, sideOf, tmuxSession, seatSockPath, isSeatNamedPipe } from "../engine/paths.mjs";
export { stateDir, sideOf, tmuxSession };

export function readNow(text) {
  const out = { title: "", now: "", state: "", at: "" };
  for (const line of String(text || "").split("\n")) {
    const head = line.match(/^(title|now|summary):\s*(.+)$/i);
    if (head) {
      const key = head[1].toLowerCase();
      if (key === "title") out.title = head[2].trim();
      else if (!out.now) out.now = head[2].trim();
      continue;
    }
    const log = line.match(/^(\d{2}:\d{2})\s+\[(\w+)\]\s+(.+)$/);
    if (log) {
      out.state = log[2].toLowerCase();
      out.at = log[1];
      out.now = log[3].trim();
    }
  }
  return out;
}

export function repoOf(cwd) {
  const dir = String(cwd || "");
  if (!dir) return "";
  const parent = basename(dirname(dir));
  if (parent && parent !== "worktrees" && parent !== "repos" && parent !== "/") return parent;
  return basename(dir);
}

export function resolveSeat(seats, raw) {
  const q = String(raw || "").trim().toLowerCase();
  if (!q) return { error: "no seat named" };
  const exact = seats.find((s) => s.name.toLowerCase() === q);
  if (exact) return { seat: exact };
  /* the title is a sentence in the person's words: a piece of it only names a seat once it is long
     enough to be a word. Weighing "1" against every title carrying a digit turned a card number
     into an ambiguity between two chats that had nothing to do with it. */
  const near = seats.filter((s) => s.name.toLowerCase().startsWith(q) || (q.length >= 3 && (s.title || "").toLowerCase().includes(q)));
  if (!near.length) return { error: `no seat called “${raw}”` };
  if (near.length > 1) return { error: `“${raw}” fits ${near.length} seats — ${near.map((s) => s.name).join(", ")}. Write the whole name` };
  return { seat: near[0] };
}

function plain(raw) {
  return String(raw || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function seatLine(seat) {
  const called = seatTitle(seat.title);
  const named = called && plain(called) !== plain(seat.name) ? `${seat.name} "${called}"` : seat.name;
  const bits = [named, seat.side];
  if (seat.repo) bits.push(seat.repo);
  if (seat.model) bits.push(seat.model);
  const head = bits.join(" · ");
  const state = seat.state || (seat.alive ? "alive" : "closed");
  const said = seat.now ? ` · "${seat.now}"` : "";
  return `${head} · ${state}${said}`;
}

export const ROSTER_CLOSED_MAX = 30;

export function seatRoster(seats, closedMax = ROSTER_CLOSED_MAX) {
  const line = (seat) => `${seat.alive ? "·" : "×"} ${seatLine(seat)}`;
  const awake = seats.filter((s) => s.alive);
  const closed = seats.filter((s) => !s.alive)
    .sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")) || a.name.localeCompare(b.name));
  const shown = closed.slice(0, closedMax);
  const rest = closed.length - shown.length;
  const out = [];
  out.push(awake.length ? `open now (${awake.length})` : "no other chat is open right now");
  out.push(...awake.map(line));
  if (shown.length) {
    out.push("");
    out.push(`closed, most recent first (${shown.length} of ${closed.length})`);
    out.push(...shown.map(line));
  }
  if (rest > 0) out.push("", `${rest} older chat${rest === 1 ? "" : "s"} not listed. They still answer to their own name: message, ask or peek one by name.`);
  return out;
}

export function peerHandle(seat, me) {
  const lines = [
    `[hive] peer: ${seatLine(seat)}`,
    "[hive] reach it: message(seat, text) · ask(seat, question) · peek(seat)",
  ];
  if (me?.name) lines.push(`[hive] you are: ${me.name}${me.side ? ` (${me.side})` : ""} — it answers you by this name`);
  return lines.join("\n");
}

export function flatten(text) {
  return String(text || "").replace(/\s*\n\s*/g, " · ").trim();
}

export function run(cmd, args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) resolve({ ok: false, out: "", error: String(err?.message || err) });
      else resolve({ ok: true, out: String(stdout), error: "" });
    });
  });
}

async function socketAlive(path) {
  if (!isSeatNamedPipe(path) && !existsSync(path)) return false;
  return new Promise((resolve) => {
    const conn = createConnection(path);
    const done = (ok) => { try { conn.destroy(); } catch {} resolve(ok); };
    conn.on("connect", () => done(true));
    conn.on("error", () => done(false));
    setTimeout(() => done(false), 700);
  });
}

export async function socketCommand(base, name, command, timeout = 4000) {
  const path = seatSockPath(base, name);
  if (!isSeatNamedPipe(path) && !existsSync(path)) return { ok: false, error: "no driver socket" };
  return new Promise((resolve) => {
    const conn = createConnection(path);
    let buf = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      try { conn.destroy(); } catch {}
      resolve(value);
    };
    const timer = setTimeout(() => finish({ ok: false, error: "the driver did not answer in time" }), timeout);
    conn.on("connect", () => conn.write(JSON.stringify(command) + "\n"));
    conn.on("data", (data) => {
      buf += data;
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      clearTimeout(timer);
      try { finish(JSON.parse(buf.slice(0, nl))); }
      catch { finish({ ok: false, error: "unreadable reply from the driver" }); }
    });
    conn.on("error", (e) => { clearTimeout(timer); finish({ ok: false, error: String(e?.message || e) }); });
  });
}

async function statusOf(base, name) {
  try { return readNow(await readFile(join(base, "status", `${name}.md`), "utf8")); }
  catch { return readNow(""); }
}

export async function listSeats(env = process.env) {
  const base = stateDir(env);
  const side = sideOf(base);
  const seats = new Map();

  let files = [];
  try { files = await readdir(join(base, "sessions")); } catch {}
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const name = file.slice(0, -5);
    let meta = {};
    try { meta = JSON.parse(await readFile(join(base, "sessions", file), "utf8")); } catch {}
    seats.set(name, {
      name,
      side,
      kind: "structured",
      cwd: meta.cwd || "",
      repo: repoOf(meta.cwd),
      model: meta.model_id || meta.model || "",
      title: meta.title || "",
      updated: meta.updated || "",
      alive: await socketAlive(seatSockPath(base, name)),
    });
  }

  const windows = await run("tmux", ["list-windows", "-t", tmuxSession(side), "-F", "#{window_name}"]);
  for (const raw of windows.out.split("\n")) {
    const name = raw.trim();
    if (!name || name === "hub") continue;
    const known = seats.get(name);
    if (known) { known.alive = true; continue; }
    seats.set(name, { name, side, kind: "classic", cwd: "", repo: "", model: "", title: "", updated: "", alive: true });
  }

  const out = [];
  for (const seat of seats.values()) {
    const status = await statusOf(base, seat.name);
    out.push({ ...seat, title: status.title || seat.title, now: status.now, state: status.state || (seat.alive ? "alive" : "closed") });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function me(env = process.env) {
  const name = env.HIVE_SEAT || "";
  const base = stateDir(env);
  const side = sideOf(base);
  if (!name) return { name: "", side, base, structured: false };
  let meta = {};
  try { meta = JSON.parse(await readFile(join(base, "sessions", `${name}.json`), "utf8")); } catch {}
  return {
    name,
    side,
    base,
    births: birthsLeft(meta.births),
    structured: existsSync(join(base, "events", `${name}.ndjson`)),
  };
}

export async function spendBirths(self, n = 1) {
  if (!self.name) return { ok: true };
  const said = await socketCommand(self.base, self.name, { type: "control", op: "spendBirth", n });
  if (said?.ok) return { ok: true, left: said.data?.left ?? 0 };
  if (said?.error === "no driver socket") return { ok: true };
  return { ok: false, error: said?.error || "the budget could not be read" };
}

export async function sendSay(seat, text, { from = "", images = [], env = process.env } = {}) {
  const base = stateDir(env);
  const body = String(text || "");
  if (!body.trim()) return { ok: false, error: "nothing to say" };

  if (seat.kind !== "classic") {
    const command = { type: "say", text: body, images };
    if (from) command.from = from;
    const reply = await socketCommand(base, seat.name, command);
    if (reply.ok) return { ok: true, how: "driver", queued: !!reply.queued };
    const path = seatSockPath(base, seat.name);
    if (isSeatNamedPipe(path) || existsSync(path)) return { ok: false, error: reply.error || "the driver refused it" };
  }

  const target = `${tmuxSession(sideOf(base))}:${seat.name}`;
  const one = flatten(from ? `[hive] from ${from}: ${body}` : body);
  const typed = await run("tmux", ["send-keys", "-t", target, "-l", one]);
  if (!typed.ok && !(await run("tmux", ["list-windows", "-t", tmuxSession(sideOf(base)), "-F", "#{window_name}"])).out.includes(seat.name)) {
    return { ok: false, error: `${seat.name} has no driver and no window to type into` };
  }
  await new Promise((r) => setTimeout(r, 1200));
  await run("tmux", ["send-keys", "-t", target, "Enter"]);
  return { ok: true, how: "terminal" };
}

export async function peekSeat(seat, lines = 30, env = process.env) {
  const base = stateDir(env);
  if (seat.kind !== "classic") {
    const file = join(base, "events", `${seat.name}.ndjson`);
    try {
      const { size } = await stat(file);
      const bytes = Math.min(size, 120000);
      const buf = await readFile(file);
      const tail = buf.slice(size - bytes).toString("utf8").split("\n");
      const out = [];
      for (const raw of tail.reverse()) {
        let event;
        try { event = JSON.parse(raw); } catch { continue; }
        const said = compactSaid(event);
        if (said) out.push(said);
        if (out.length >= lines) break;
      }
      if (out.length) return out.reverse().join("\n");
    } catch {}
  }
  const screen = await run("tmux", ["capture-pane", "-t", `${tmuxSession(sideOf(base))}:${seat.name}`, "-p"]);
  return screen.out.split("\n").filter((l) => l.trim()).slice(-lines).join("\n");
}

function compactSaid(event) {
  if (event?.type === "user" && event.subtype === "say") {
    const text = event.message?.content?.[0]?.text || "";
    return `${event.from ? `${event.from} →` : "human →"} ${clip(text)}`;
  }
  if (event?.type === "assistant") {
    const parts = [];
    for (const block of event.message?.content || []) {
      if (block.type === "text" && block.text.trim()) parts.push(clip(block.text));
      if (block.type === "tool_use") parts.push(`>${block.name}`);
    }
    return parts.length ? `it → ${parts.join(" ")}` : "";
  }
  return "";
}

const clip = (s, n = 160) => {
  const one = String(s ?? "").replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

export const ASK_WAIT_MAX_SECONDS = 270;

export async function awaitReply(from, { base, name, timeout = 180000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const got = await socketCommand(base, name, { type: "collect", from });
    if (got?.answered) return { ok: true, text: got.text || "" };
    await new Promise((r) => setTimeout(r, 900));
  }
  return { ok: false, error: "no answer yet" };
}

const DEV_NAME = /^[a-z0-9][a-z0-9-]{0,30}$/;
const ASK_CHARS = 1200;

export const BUZZ_CHARS = 140;

export const SEAT_NOW_CEILING = 140;

export function statusWith(had, { title = "", now = "", clock = "" } = {}) {
  const kept = String(had || "").split("\n").filter((line) => !/^title:\s*/i.test(line)).join("\n").trim();
  const head = title ? `title: ${title}` : "";
  const tail = now ? `${clock} [working] ${now}` : "";
  const body = [head, kept, tail].filter(Boolean).join("\n");
  return body ? `${body}\n` : "";
}

export async function renameSeat({ title, now = "", env = process.env, at = new Date() } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this seat has no name in the hive yet — there is nothing to rename" };
  const line = seatTitle(title);
  if (!line) return { error: "a title with nothing in it would leave the seat showing its slug" };

  const said = await socketCommand(self.base, self.name, { type: "control", op: "setTitle", title: line });
  if (!said.ok) return { error: said.error || "the driver would not take the title" };

  const doing = String(now || "").replace(/\s+/g, " ").trim().slice(0, SEAT_NOW_CEILING);
  const file = join(self.base, "status", `${self.name}.md`);
  let had = "";
  try { had = await readFile(file, "utf8"); } catch {}
  const clock = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, statusWith(had, { title: line, now: doing, clock }));
  } catch (wrong) {
    return { name: self.name, title: line, now: doing, partial: String(wrong?.message || wrong) };
  }
  return { name: self.name, title: line, now: doing };
}

export async function buzzPhone(line, { env = process.env, ask = askTheApp } = {}) {
  const text = String(line || "").replace(/\s+/g, " ").trim();
  if (!text) return { error: "there is nothing to buzz about" };
  const self = await me(env);
  if (!self.name) return { error: "this seat has no name in the hive yet" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine" };
  const rang = await ask(door, "POST", "/api/buzz", {
    seat: self.name,
    where: self.where === "cloud" ? "cloud" : "local",
    text: text.slice(0, BUZZ_CHARS)
  });
  if (!rang.ok) return { error: rang.error || "the hive would not buzz" };
  return { ok: true, seat: self.name };
}

export const SLACK_CHARS = 12000;

export async function sayOnSlack(text, { env = process.env, ask = askTheApp } = {}) {
  const said = String(text || "").trim();
  if (!said) return { error: "there is nothing to say on slack" };
  const self = await me(env);
  if (!self.name) return { error: "this seat has no name in the hive yet" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the chat is" };
  const sent = await ask(door, "POST", "/api/slack/reply", { name: self.name, where: self.side, text: said.slice(0, SLACK_CHARS) });
  if (!sent.ok) return { error: sent.error || "the hive would not put it on slack" };
  return { ok: true, channel: sent.said?.channel || "", thread: sent.said?.thread || "" };
}

export async function browserProfile({ profile, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/profile", { name: self.name, where: self.side, profile });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the profile change did not come back" };
}

export async function browserSetCookie({ cookieName, value, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/set-cookie", { name: self.name, where: self.side, cookieName, value });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the cookie write did not come back" };
}

export async function browserCookies({ env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/cookies", { name: self.name, where: self.side });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the cookie read did not come back" };
}

export async function browserResize({ width, height, mobile = false, reset = false, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const payload = reset ? { name: self.name, where: self.side, reset: true } : { name: self.name, where: self.side, width, height, mobile };
  const done = await ask(door, "POST", "/api/browser/viewport", payload);
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the viewport change did not come back" };
}

export async function browserEval({ code, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const src = String(code || "").trim();
  if (!src) return { error: "there is nothing to run" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/eval", { name: self.name, where: self.side, code: src });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the eval did not come back" };
}

export async function browserConsole({ env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/console", { name: self.name, where: self.side });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the console read did not come back" };
}

export async function browserShoot({ env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/shoot", { name: self.name, where: self.side });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the shot did not come back" };
}

export async function browserMap({ env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/map", { name: self.name, where: self.side });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the page did not answer with its shape" };
}

export async function browserClick({ ref, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/click", { name: self.name, where: self.side, ref });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the click did not come back" };
}

export async function browserType({ ref, text, submit = false, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/type", { name: self.name, where: self.side, ref, text, submit });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the typing did not come back" };
}

export async function browserKey({ key, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/key", { name: self.name, where: self.side, key });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the key did not come back" };
}

export async function browserWait({ text, gone = false, seconds = 10, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/wait", { name: self.name, where: self.side, text, gone, seconds }, { timeout: (Number(seconds) || 10) * 1000 + 15000 });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the wait did not come back" };
}

export async function browserChoose({ ref, option, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/choose", { name: self.name, where: self.side, ref, option });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the choice did not come back" };
}

export async function browserTabs({ act = "list", url = "", index = 0, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/tabs", { name: self.name, where: self.side, act, url, index });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the tabs did not come back" };
}

export async function browserStep({ way, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/step", { name: self.name, where: self.side, way });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || `the ${way} did not come back` };
}

export async function browserUpload({ ref, files = [], env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/upload", { name: self.name, where: self.side, ref, files });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the file did not reach the page" };
}

export async function browserNetwork({ about = "", failedOnly = false, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/network", { name: self.name, where: self.side, about, failedOnly });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the calls did not come back" };
}

export const DEVICE_OPEN_WAIT = 160000;

export async function deviceCall({ path, payload = {}, timeout, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the device from a chat in the hive" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", `/api/device/${path}`, { name: self.name, where: self.side, ...payload }, timeout ? { timeout } : undefined);
  return done && done.ok ? done : { error: (done && done.error) || `the device ${path} did not come back` };
}

export async function browserNavigate({ url, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — drive the browser from a chat in the hive" };
  const target = String(url || "").trim();
  if (!target) return { error: "there is nothing to open" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the pane is" };
  const done = await ask(door, "POST", "/api/browser/navigate", { name: self.name, where: self.side, url: target });
  return done && done.ok ? (done.said || {}) : { error: (done && done.error) || "the app did not open it" };
}

export async function askPerson(to, question, { env = process.env } = {}) {
  const who = String(to || "").trim().toLowerCase();
  const text = String(question || "").trim();
  if (!DEV_NAME.test(who)) return { error: `“${to}” is not a name I can address` };
  if (!text) return { error: "there is nothing to ask" };
  const self = await me(env);
  if (!self.name) return { error: "this seat has no name in the hive yet, so an answer would have nowhere to come back to" };
  const base = stateDir(env);
  const dir = join(base, "outbox");
  const id = randomUUID();
  const note = { v: 1, kind: "out", to: who, agent: self.name, at: Date.now(), id, text: text.slice(0, ASK_CHARS) };
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `${id}.json.tmp`);
  await writeFile(tmp, JSON.stringify(note), "utf8");
  await rename(tmp, join(dir, `${id}.json`));
  return { id, to: who, agent: self.name };
}

export const hiveDoor = (base) => socketPathFor({ home: base });

function askTheApp(door, method, path, payload, { timeout = 120000 } = {}) {
  return new Promise((resolve) => {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const headers = body ? { "content-type": "application/json", "content-length": Buffer.byteLength(body) } : {};
    const call = request({ socketPath: door, path, method, headers, timeout }, (res) => {
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", (piece) => { buf += piece; });
      res.on("end", () => {
        let said = null;
        try { said = JSON.parse(buf); } catch { return resolve({ ok: false, error: "the hive answered something unreadable" }); }
        resolve({ ok: res.statusCode < 400 && !said.error, said, error: said.error || "" });
      });
    });
    call.on("timeout", () => { call.destroy(); resolve({ ok: false, error: "the hive did not answer in time" }); });
    call.on("error", (wrong) => resolve({ ok: false, error: String(wrong?.message || wrong) }));
    if (body) call.write(body);
    call.end();
  });
}

export async function noteTask({ text, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — write tasks from a chat in the hive" };
  const said = String(text || "").replace(/\s+/g, " ").trim();
  if (!said) return { error: "a task needs some words" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open to keep the task" };
  const kept = await ask(door, "POST", "/api/tasks", { text: said, who: "me", from: self.name });
  if (!kept.ok) return { error: kept.error || "the hive would not keep the task" };
  return { task: kept.said?.task || null };
}

export async function publishPage({ path, label = "", tab = "", env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — publish from a chat in the hive" };
  if (!/\.html?$/i.test(String(path || ""))) return { error: "a page is an html file" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the page is" };

  const at = Date.now();
  const named = canonicalLabel(label);
  const kept = await ask(door, "POST", "/api/artifact/keep", { name: self.name, where: self.side, path, label: named, tab, url: "", at, shelve: false });
  if (!kept.ok) return { error: kept.error || "the hive would not keep the page" };

  const shelved = await ask(door, "POST", "/api/shelf/publish", { name: self.name, where: self.side, path, label: named, tab, url: "", at });
  if (!shelved.ok) return { error: `the page is kept on this machine, but the shelf refused it: ${shelved.error || "no reason given"}` };
  const shelf = await ask(door, "GET", "/api/shelf");
  const meta = shelved.said?.meta || {};
  const kind = shelved.said?.tab || "";
  const versions = meta.tabs?.[kind]?.versions || [];
  const head = versions[versions.length - 1];
  return {
    title: meta.title || "",
    label: meta.label || named,
    slug: meta.slug || "",
    tab: kind,
    version: head?.n || 0,
    pushed: Boolean(shelved.said?.pushed),
    url: shelfDeepLink(meta.slug, kind, head?.n || 0),
    source: shelfPageUrl(shelf.said?.repo || "", meta.slug, kind, head?.n || 0),
    leaf: shelved.said?.leaf || null
  };
}

export async function answerOnPage({ slug, thread, text, env = process.env, ask = askTheApp } = {}) {
  const self = await me(env);
  if (!self.name) return { error: "this session has no seat — answer from a chat in the hive" };
  const page = String(slug || "").trim();
  if (!page) return { error: "which page? give the slug the question came from" };
  const id = String(thread || "").trim();
  if (!id) return { error: "which conversation? give the thread the question came from" };
  const said = String(text || "").trim();
  if (!said) return { error: "an answer needs some words" };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open where the page is" };
  const sent = await ask(door, "POST", "/api/shelf/comment", {
    slug: page, text: said, re: id, seat: self.name, agent: true
  });
  if (!sent.ok) return { error: sent.error || "the hive would not take the answer" };
  return { ok: true, id: sent.said?.comment?.id || "", pushed: Boolean(sent.said?.pushed) };
}

const SEAT_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

export async function openSeat({ mission, name = "", title = "", errand = "", where = "", repo = "", model = "", agent = "", account = "", count = 1, env = process.env, ask = askTheApp, pay = null } = {}) {
  const self = await me(env);
  const asked = String(mission || "").trim();
  if (!asked) return { error: "a seat with no mission has nothing to do — say what it should get done" };
  const called = String(name || "").trim().toLowerCase();
  if (called && !SEAT_NAME.test(called)) return { error: "a seat name is lowercase letters, digits and dashes" };
  const side = where === "cloud" || where === "local" ? where : (self.side || "local");
  const runs = String(agent || "").trim().toLowerCase();
  if (runs && !PROVIDER_IDS.includes(runs)) return { error: `the hive talks to ${PROVIDER_IDS.join(", ")} — "${runs}" is none of them` };
  const door = hiveDoor(self.base);
  if (!existsSync(door)) return { error: "no hive answering on this machine — the app has to be open to open a seat" };

  if (pay) {
    const paid = await pay(self);
    if (!paid?.ok) return { error: paid?.error || "the budget could not be read" };
  }

  const born = await ask(door, "POST", "/api/spawn", {
    prompt: asked, name: called, title: String(title || "").replace(/\s+/g, " ").trim().slice(0, 60),
    errand: String(errand || "").replace(/\s+/g, " ").trim().slice(0, 60),
    where: side, repo: String(repo || ""), model: String(model || ""), count: Math.min(4, Math.max(1, Math.floor(Number(count) || 1))),
    by: self.name,
    structured: self.name ? self.structured : true,
    ...(runs ? { agent: runs } : {}),
    ...(side === "local" && account ? { account: String(account).trim() } : {})
  });
  if (!born.ok) return { error: born.error || "the hive would not open the seat" };
  const names = Array.isArray(born.said?.names) && born.said.names.length > 1 ? born.said.names : null;
  return { id: born.said?.id || "", name: born.said?.name || called, where: side, mission: asked, ...(names ? { names, race: names.length } : {}) };
}
