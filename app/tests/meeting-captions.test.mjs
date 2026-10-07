import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { CAPTION_CHROME_ID, captionStatus, createCaptionWatch, installCaptionBridge, mergeCaption, openCaptionFolder, upsertCaption } from "../lib/meeting-captions.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const ASSETS = join(HERE, "assets", "meet-captions");
const parse = createRequire(import.meta.url)(join(ASSETS, "extension", "caption-parse.js"));

const page = (html) => { const window = new Window(); window.document.body.innerHTML = html; return window.document; };

test("the captions of a call are read with who spoke, in the shape the page has today", () => {
  const doc = page(`<div role="region" aria-label="Captions"><div><div class="nMcdL"><div><img src="a.png"><span class="NWpY1d">Marina Costa</span></div><div class="ygicle">A gente fecha o  importador nesta sprint.</div></div>
    <div class="nMcdL"><div><img src="b.png"><span class="NWpY1d">Caio</span></div><div class="ygicle">Fechado.</div></div></div><button aria-label="Jump to bottom">Jump to bottom</button></div>`);
  const read = parse.readCaptions(doc);
  assert.equal(read.on, true);
  assert.deepEqual(read.blocks.map((one) => `${one.speaker}|${one.text}`), ["Marina Costa|A gente fecha o importador nesta sprint.", "Caio|Fechado."]);
});

test("a page whose class names changed is still read, by its region and its shape", () => {
  const doc = page(`<div role="region" aria-label="Legendas"><div class="x1"><div class="x2"><div class="q9"><img src="a.png"><div class="zz">Bruna</div></div><div class="q8"><span>Confirmo a data</span> <span>com a loja.</span></div></div>
    <div class="x2"><div class="q9"><img src="b.png"><div class="zz">Téo</div></div><div class="q8"><span>Combinado.</span></div></div></div></div>`);
  assert.deepEqual(parse.readCaptions(doc).blocks.map((one) => `${one.speaker}|${one.text}`), ["Bruna|Confirmo a data com a loja.", "Téo|Combinado."]);
});

test("the first caption of a call, alone and still without words, never becomes a line of its own", () => {
  const html = (text) => `<div role="region" aria-label="Legendas"><div class="wrap"><div class="b1"><div><img src="a.png"><span>Marina Costa</span></div><div class="t">${text}</div></div></div></div>`;
  assert.deepEqual(parse.readCaptions(page(html(""))).blocks, [], "a name with nothing said yet is not a caption");
  const doc = page(html("A gente"));
  const read = parse.readCaptions(doc);
  assert.deepEqual(read.blocks.map((one) => `${one.speaker}|${one.text}`), ["Marina Costa|A gente"]);
  assert.equal(read.blocks[0].el.className, "b1", "the line is tied to the caption itself, so it stays the same line when a second one arrives");
});

test("no captions on the page reads as off, and the button that turns them on is found in the languages the team uses", () => {
  const doc = page(`<button aria-label="Ativar legendas (c)">cc</button><div role="region" aria-label="Participantes">x</div>`);
  assert.equal(parse.readCaptions(doc).on, false);
  assert.ok(parse.captionButton(doc).turnOn);
  assert.ok(parse.captionButton(page(`<button aria-label="Turn on captions">cc</button>`)).turnOn);
  assert.equal(parse.captionButton(page(`<button aria-label="Turn off captions">cc</button>`)).turnOn, null);
});

test("a caption that grows replaces itself, and one the page trimmed at the start keeps what it had", () => {
  assert.equal(mergeCaption("A gente fecha", "A gente fecha o importador"), "A gente fecha o importador");
  assert.equal(mergeCaption("A gente fecha o importador nesta sprint e", "o importador nesta sprint e adia o leitor"), "A gente fecha o importador nesta sprint e adia o leitor");
  assert.equal(mergeCaption("A gente fecha o importador", "o importador"), "A gente fecha o importador");
  assert.equal(mergeCaption("", "oi"), "oi");
});

test("a caption is one line that updates in place, and a strange key is not a caption", () => {
  let meeting = { lines: [{ at: 2, source: "mic", text: "antes" }] };
  meeting = upsertCaption(meeting, { key: "abcd-1", speaker: "Marina", text: "A gente", at: 5 });
  meeting = upsertCaption(meeting, { key: "abcd-1", speaker: "", text: "A gente fecha", at: 9 });
  meeting = upsertCaption(meeting, { key: "../x", speaker: "x", text: "y", at: 1 });
  assert.deepEqual(meeting.lines.map((line) => `${line.at}:${line.source}:${line.speaker || ""}:${line.text}`), ["2:mic::antes", "5:caption:Marina:A gente fecha"]);
  assert.equal(upsertCaption(meeting, { key: "abcd-1", speaker: "Marina", text: "A gente fecha", at: 9 }), meeting, "nothing new writes nothing");
});

test("a stretch of the meeting counts as captioned only while the browser kept answering through all of it", () => {
  let at = 0;
  const watch = createCaptionWatch({ now: () => at });
  for (at = 0; at <= 30000; at += 4000) watch.beat(true);
  assert.equal(watch.covered(0, 30000), true);
  assert.equal(watch.covered(0, 60000), false, "the beats ended at 28s");
  at = 100000;
  assert.deepEqual(watch.state(), { connected: false, on: false });
  watch.beat(false);
  assert.deepEqual(watch.state(), { connected: true, on: false });
  assert.equal(watch.covered(90000, 100000), false, "captions turned off are not coverage");
  const gap = createCaptionWatch({ now: () => at });
  for (at = 0; at <= 8000; at += 4000) gap.beat(true);
  for (at = 26000; at <= 30000; at += 4000) gap.beat(true);
  assert.equal(gap.covered(0, 30000), false, "eighteen seconds without the browser is a hole");
});

test("setting up writes the two extensions, a launcher tied to this hive, and a manifest only for the browsers that exist", () => {
  const root = mkdtempSync(join(tmpdir(), "hive-captions-"));
  try {
    const home = join(root, ".hive");
    const userHome = join(root, "user");
    mkdirSync(join(userHome, ".config/google-chrome"), { recursive: true });
    mkdirSync(join(userHome, ".mozilla"), { recursive: true });
    assert.equal(captionStatus({ home, platform: "linux", userHome }).chrome.ready, false);
    const ran = [];
    const done = installCaptionBridge({ home, assets: ASSETS, sock: "/tmp/it's/hive.sock", nodePath: "/usr/bin/node", asNode: false, platform: "linux", userHome, run: (cmd, args) => { ran.push([cmd, ...args]); return true; } });
    assert.equal(done.chromeDir, join(userHome, "hive-meet-captions", "chrome"), "the extension sits in a folder a file picker shows");
    assert.deepEqual(ran, [], "no sandboxed browser, nothing to let in");
    assert.equal(done.chrome.ready, true);
    assert.equal(done.firefox.ready, true);
    const chrome = JSON.parse(readFileSync(join(userHome, ".config/google-chrome/NativeMessagingHosts/dev.hive.captions.json"), "utf8"));
    assert.deepEqual(chrome.allowed_origins, [`chrome-extension://${CAPTION_CHROME_ID}/`, "chrome-extension://ocekllahcpdjidbemkbjalmeggjcodad/"]);
    const firefox = JSON.parse(readFileSync(join(userHome, ".mozilla/native-messaging-hosts/dev.hive.captions.json"), "utf8"));
    assert.deepEqual(firefox.allowed_extensions, ["meet-captions@hive.dev"]);
    assert.equal(existsSync(join(userHome, ".config/chromium")), false, "a browser that is not installed gets nothing");
    const launcher = readFileSync(chrome.path, "utf8");
    assert.match(launcher, /^#!\/bin\/sh\nHIVE_SOCK='\/tmp\/it'\\''s\/hive\.sock' exec '\/usr\/bin\/node' /);
    assert.ok(statSync(chrome.path).mode & 0o100, "the browser has to be able to run it");
    assert.equal(JSON.parse(readFileSync(join(done.chromeDir, "manifest.json"), "utf8")).manifest_version, 3);
    assert.equal(JSON.parse(readFileSync(join(done.firefoxDir, "manifest.json"), "utf8")).manifest_version, 2);
    assert.ok(existsSync(join(done.firefoxDir, "content.js")));
    assert.ok(installCaptionBridge({ home, assets: ASSETS, sock: "x", platform: "win32", userHome }).error);
    const opened = [];
    assert.ok(openCaptionFolder({ home, which: "firefox", platform: "linux", userHome, spawn: (cmd, args) => opened.push([cmd, ...args]) }).ok);
    assert.deepEqual(opened, [["xdg-open", join(userHome, "hive-meet-captions", "firefox")]]);
    assert.ok(openCaptionFolder({ home, platform: "linux", userHome: join(root, "nobody"), spawn: () => {} }).error, "nothing to open before it is set up");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the id chrome gives the extension is the one the bridge lets in", async () => {
  const { createHash } = await import("node:crypto");
  const key = JSON.parse(readFileSync(join(ASSETS, "extension", "manifest.chrome.json"), "utf8")).key;
  const hash = createHash("sha256").update(Buffer.from(key, "base64")).digest().subarray(0, 16);
  const id = [...hash].map((byte) => String.fromCharCode(97 + (byte >> 4)) + String.fromCharCode(97 + (byte & 15))).join("");
  assert.equal(id, CAPTION_CHROME_ID);
});

test("the bridge carries a message from the browser to the hive's socket and the answer back, in the browser's framing", async () => {
  const root = mkdtempSync(join(tmpdir(), "hive-host-"));
  const sock = join(root, "h.sock");
  const got = [];
  const server = createServer((req, res) => {
    const pieces = [];
    req.on("data", (piece) => pieces.push(piece));
    req.on("end", () => { got.push({ url: req.url, body: JSON.parse(Buffer.concat(pieces).toString("utf8")) }); res.end(JSON.stringify({ recording: true, taken: true, id: "a-meeting" })); });
  });
  await new Promise((up) => server.listen(sock, up));
  const child = spawn(process.execPath, [join(ASSETS, "host", "hive-captions-host.mjs")], { env: { ...process.env, HIVE_SOCK: sock }, stdio: ["pipe", "pipe", "inherit"] });
  try {
    const frame = (message) => { const data = Buffer.from(JSON.stringify(message)); const head = Buffer.alloc(4); head.writeUInt32LE(data.length, 0); return Buffer.concat([head, data]); };
    const answer = new Promise((done) => {
      let held = Buffer.alloc(0);
      child.stdout.on("data", (bytes) => { held = Buffer.concat([held, bytes]); if (held.length >= 4 && held.length >= 4 + held.readUInt32LE(0)) done(JSON.parse(held.subarray(4, 4 + held.readUInt32LE(0)).toString("utf8"))); });
    });
    const whole = frame({ id: 7, captions: true, lines: [{ key: "abcd-1", speaker: "Marina", text: "oi" }] });
    child.stdin.write(whole.subarray(0, 9));
    child.stdin.write(whole.subarray(9));
    assert.deepEqual(await answer, { id: 7, recording: true, taken: true }, "the number of the message wins over any id the hive answers with");
    assert.equal(got[0].url, "/api/meetings/captions");
    assert.deepEqual(got[0].body, { captions: true, lines: [{ key: "abcd-1", speaker: "Marina", text: "oi" }] });
  } finally { child.kill(); server.close(); rmSync(root, { recursive: true, force: true }); }
});

test("a sandboxed browser gets its own manifest and is let in to the hive, the node that runs the bridge and the extension folder", () => {
  const root = mkdtempSync(join(tmpdir(), "hive-captions-flatpak-"));
  try {
    const home = join(root, ".hive");
    const userHome = join(root, "user");
    mkdirSync(join(userHome, ".var/app/com.google.Chrome"), { recursive: true });
    mkdirSync(join(userHome, ".var/app/app.zen_browser.zen"), { recursive: true });
    mkdirSync(home, { recursive: true });
    symlinkSync(home, join(userHome, "hive-meet-captions"));
    const ran = [];
    const done = installCaptionBridge({ home, assets: ASSETS, sock: "/tmp/h.sock", nodePath: "/opt/node/bin/node", asNode: false, platform: "linux", userHome, run: (cmd, args) => { ran.push([cmd, ...args].join(" ")); return true; } });
    assert.equal(lstatSync(join(userHome, "hive-meet-captions")).isSymbolicLink(), false, "an old shortcut gives way to the real folder");
    assert.ok(existsSync(join(userHome, ".var/app/com.google.Chrome/config/google-chrome/NativeMessagingHosts/dev.hive.captions.json")));
    assert.ok(existsSync(join(userHome, ".var/app/app.zen_browser.zen/.zen/native-messaging-hosts/dev.hive.captions.json")));
    assert.deepEqual(done.flatpaks, ["com.google.Chrome", "app.zen_browser.zen"]);
    assert.deepEqual(done.sandboxed, [{ app: "com.google.Chrome", ok: true }, { app: "app.zen_browser.zen", ok: true }]);
    assert.equal(ran[0], `flatpak override --user --filesystem=${home} --filesystem=/opt/node/bin:ro --filesystem=${join(userHome, "hive-meet-captions")}:ro com.google.Chrome`);
    assert.equal(done.chrome.ready, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the button on the call sits beside the call's own buttons and says so when captions are off, which it cannot turn on by itself", () => {
  const content = readFileSync(join(ASSETS, "extension", "content.js"), "utf8");
  assert.match(content, /box\.left < innerWidth \* 0\.75/, "it looks for the cluster at the bottom right");
  assert.match(content, /const deaf = recording && !closed && !captionsOn && Date\.now\(\) - recordingSince > 6000;/, "a few seconds of grace, then the button asks for captions");
  assert.match(content, /captions: "Ligue a legenda \(tecla C\)"/);
  assert.doesNotMatch(content, /turnOff\?\.click\(\)/, "captions are left on: the call remembers them for the next meeting");
});

test("captions are made invisible while the hive records, and the videos are grown back into the room the call took from them", () => {
  const content = readFileSync(join(ASSETS, "extension", "content.js"), "utf8");
  assert.match(content, /if \(recording && now\.region\) quiet = now\.region;/, "they stay out of sight after the recording stops, until the person toggles them");
  assert.match(content, /setProperty\("opacity", "0", "important"\)/);
  assert.match(content, /const room = stage\.offsetHeight \+ panel\.offsetHeight;/, "the room is what the videos had before captions took their strip");
  assert.match(content, /Math\.max\(1, Math\.min\(2\.5, room \/ tall, stage\.offsetWidth \/ wide\)\)/, "never smaller than the call drew them, never wider than the stage");
  assert.match(content, /if \(!want \|\| !stage\)/, "a call laid out some other way is left alone");
});
