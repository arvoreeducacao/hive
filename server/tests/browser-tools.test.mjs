import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { hiveDoor } from "../peer/peer.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

async function hive() {
  const base = await mkdtemp(join(tmpdir(), "hive-browser-"));
  await mkdir(join(base, "sessions"), { recursive: true });
  await writeFile(join(base, "sessions", "driver.json"), JSON.stringify({ session_id: "s1", cwd: "/w/worktrees/hub/driver" }));
  return base;
}

async function fakeApp(base, answers) {
  const seen = [];
  const app = createServer((req, res) => {
    let body = "";
    req.on("data", (piece) => { body += piece; });
    req.on("end", () => {
      seen.push({ path: req.url, body: body ? JSON.parse(body) : null });
      const answer = answers[req.url];
      res.setHeader("content-type", "application/json");
      if (!answer) return res.end(JSON.stringify({ error: "unknown route" }));
      res.statusCode = answer.error ? 502 : 200;
      res.end(JSON.stringify(answer));
    });
  });
  await new Promise((up) => app.listen({ path: hiveDoor(base) }, up));
  return { seen, close: () => new Promise((down) => app.close(down)) };
}

function mcp(base, seat) {
  const child = spawn(process.execPath, [join(HERE, "peer/peer-mcp.mjs")], {
    env: { HIVE_STATE_DIR: base, HIVE_SEAT: seat, PATH: "" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buf = "";
  const waiting = new Map();
  child.stdout.on("data", (data) => {
    buf += data;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const waiter = waiting.get(message.id);
      if (waiter) { waiting.delete(message.id); waiter(message); }
    }
  });
  let id = 0;
  return {
    call(method, params) {
      id += 1;
      const mine = id;
      const answer = new Promise((resolve) => waiting.set(mine, resolve));
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: mine, method, params })}\n`);
      return answer;
    },
    stop() { child.kill(); },
  };
}

const spoken = (reply) => reply.result.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
const pictured = (reply) => reply.result.content.find((c) => c.type === "image") || null;

async function drive(answers, run) {
  const base = await hive();
  const app = await fakeApp(base, answers);
  const client = mcp(base, "driver");
  try {
    await client.call("initialize", {});
    await run(client, app);
  } finally {
    client.stop();
    await app.close();
    await rm(base, { recursive: true, force: true });
  }
}

test("navigate says the address it opened, not undefined", async () => {
  await drive({ "/api/browser/navigate": { ok: true, url: "http://localhost:3000/writing" } }, async (client) => {
    const out = spoken(await client.call("tools/call", { name: "browser_navigate", arguments: { url: "localhost:3000/writing" } }));
    assert.match(out, /http:\/\/localhost:3000\/writing/);
    assert.doesNotMatch(out, /undefined/);
  });
});

test("the screenshot comes back as a picture the seat can see", async () => {
  await drive({ "/api/browser/shoot": { ok: true, image: PIXEL } }, async (client) => {
    const reply = await client.call("tools/call", { name: "browser_screenshot", arguments: {} });
    const shot = pictured(reply);
    assert.ok(shot, "the answer carries an image");
    assert.equal(shot.mimeType, "image/png");
    assert.equal(shot.data, PIXEL.slice(PIXEL.indexOf(",") + 1));
  });
});

test("eval hands back the value the page answered", async () => {
  await drive({ "/api/browser/eval": { ok: true, value: '"teste 6"' } }, async (client) => {
    const out = spoken(await client.call("tools/call", { name: "browser_eval", arguments: { code: "document.title" } }));
    assert.match(out, /teste 6/);
    assert.doesNotMatch(out, /ran, no value/);
  });
});

test("cookies, console and viewport report what the page has, not an empty page", async () => {
  await drive({
    "/api/browser/cookies": { ok: true, cookies: [{ name: "access_token", hint: "abc123…wxyz", httpOnly: true }] },
    "/api/browser/console": { ok: true, lines: [{ level: "error", text: "boom", source: "app.js", line: 12 }] },
    "/api/browser/viewport": { ok: true, value: "390×844 (mobile)" },
  }, async (client) => {
    const cookies = spoken(await client.call("tools/call", { name: "browser_cookies", arguments: {} }));
    assert.match(cookies, /access_token = abc123/);
    assert.match(cookies, /HttpOnly/);
    const console_ = spoken(await client.call("tools/call", { name: "browser_console", arguments: {} }));
    assert.match(console_, /\[error\] boom \(app\.js:12\)/);
    const viewport = spoken(await client.call("tools/call", { name: "browser_resize", arguments: { width: 390, height: 844, mobile: true } }));
    assert.match(viewport, /390×844 \(mobile\)/);
  });
});

test("profile and set_cookie name what they did", async () => {
  await drive({
    "/api/browser/profile": { ok: true, profile: "teacher" },
    "/api/browser/set-cookie": { ok: true, value: "set flag on http://localhost:3000" },
  }, async (client) => {
    const profile = spoken(await client.call("tools/call", { name: "browser_profile", arguments: { profile: "teacher" } }));
    assert.match(profile, /signed in as teacher/);
    const cookie = spoken(await client.call("tools/call", { name: "browser_set_cookie", arguments: { name: "flag", value: "1" } }));
    assert.match(cookie, /set flag on http:\/\/localhost:3000/);
  });
});

test("the snapshot comes back as the page's shape, with refs to act on", async () => {
  await drive({ "/api/browser/map": { ok: true, value: 'Cronograma — http://localhost:3000\n\n- textbox "Data de entrega" [ref=e4]' } }, async (client) => {
    const out = spoken(await client.call("tools/call", { name: "browser_snapshot", arguments: {} }));
    assert.match(out, /textbox "Data de entrega" \[ref=e4\]/);
  });
});

test("click and type name what they touched, and carry the ref the seat chose", async () => {
  await drive({
    "/api/browser/click": { ok: true, value: 'clicked button "Salvar cronograma"' },
    "/api/browser/type": { ok: true, value: 'typed into input "Data de entrega" and pressed Enter' },
  }, async (client, app) => {
    const clicked = spoken(await client.call("tools/call", { name: "browser_click", arguments: { ref: "e8" } }));
    assert.match(clicked, /clicked button "Salvar cronograma"/);
    const typed = spoken(await client.call("tools/call", { name: "browser_type", arguments: { ref: "e4", text: "27/08/2026", submit: true } }));
    assert.match(typed, /and pressed Enter/);
    const sent = app.seen.find((r) => r.path === "/api/browser/type");
    assert.equal(sent.body.ref, "e4");
    assert.equal(sent.body.text, "27/08/2026");
    assert.equal(sent.body.submit, true);
  });
});

test("a key press and a wait carry their own words back", async () => {
  await drive({
    "/api/browser/key": { ok: true, value: "pressed Escape" },
    "/api/browser/wait": { ok: true, value: '"salvo" is on the page' },
  }, async (client, app) => {
    assert.match(spoken(await client.call("tools/call", { name: "browser_press_key", arguments: { key: "Escape" } })), /pressed Escape/);
    assert.match(spoken(await client.call("tools/call", { name: "browser_wait_for", arguments: { text: "salvo", seconds: 3 } })), /"salvo" is on the page/);
    const waited = app.seen.find((r) => r.path === "/api/browser/wait");
    assert.equal(waited.body.seconds, 3);
    assert.equal(waited.body.gone, false);
  });
});

test("the seat opens, lists and closes its own tabs", async () => {
  await drive({ "/api/browser/tabs": { ok: true, value: "1. Cronograma — http://localhost:3000  ← the one the tools act on" } }, async (client, app) => {
    const out = spoken(await client.call("tools/call", { name: "browser_tabs", arguments: { act: "open", url: "localhost:3000/writing" } }));
    assert.match(out, /Cronograma/);
    const sent = app.seen.find((r) => r.path === "/api/browser/tabs");
    assert.equal(sent.body.act, "open");
    assert.equal(sent.body.url, "localhost:3000/writing");
  });
});

test("back, forward and reload each say where the page landed", async () => {
  await drive({ "/api/browser/step": { ok: true, value: "went back to http://localhost:3000/writing" } }, async (client, app) => {
    assert.match(spoken(await client.call("tools/call", { name: "browser_back", arguments: {} })), /went back to/);
    await client.call("tools/call", { name: "browser_reload", arguments: {} });
    const ways = app.seen.filter((r) => r.path === "/api/browser/step").map((r) => r.body.way);
    assert.deepEqual(ways, ["back", "reload"]);
  });
});

test("a dropdown is chosen by the words on the screen", async () => {
  await drive({ "/api/browser/choose": { ok: true, value: 'chose "entregue"' } }, async (client, app) => {
    assert.match(spoken(await client.call("tools/call", { name: "browser_select_option", arguments: { ref: "e5", option: "entregue" } })), /chose "entregue"/);
    const sent = app.seen.find((r) => r.path === "/api/browser/choose");
    assert.equal(sent.body.ref, "e5");
    assert.equal(sent.body.option, "entregue");
  });
});

test("a file is handed over by ref, and the calls of a page come back as lines", async () => {
  await drive({
    "/api/browser/upload": { ok: true, value: "handed capa.png to the file field" },
    "/api/browser/network": { ok: true, value: "403 GET https://api.hive.example/projects · XHR · 120ms" },
  }, async (client, app) => {
    assert.match(spoken(await client.call("tools/call", { name: "browser_upload", arguments: { ref: "e12", files: ["/tmp/capa.png"] } })), /handed capa\.png/);
    const sent = app.seen.find((r) => r.path === "/api/browser/upload");
    assert.deepEqual(sent.body.files, ["/tmp/capa.png"]);
    assert.match(spoken(await client.call("tools/call", { name: "browser_network", arguments: { failed_only: true } })), /403 GET https:\/\/api\.hive\.example/);
    const asked = app.seen.find((r) => r.path === "/api/browser/network");
    assert.equal(asked.body.failedOnly, true);
  });
});

test("a refusal from the app reaches the seat with the reason the app gave", async () => {
  await drive({ "/api/browser/shoot": { error: "the browser pane is not open on this seat" } }, async (client) => {
    const out = spoken(await client.call("tools/call", { name: "browser_screenshot", arguments: {} }));
    assert.match(out, /the browser pane is not open on this seat/);
  });
});
