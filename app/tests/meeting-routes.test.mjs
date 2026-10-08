import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerMeetingRoutes } from "../routes/meetings.mjs";
import { readLocalMeeting, readSharedMeetings, sharedMeetingFile, writeLocalMeeting } from "../lib/meetings.mjs";

const NOTES = '{"title":"Sprint 41","oneLine":"fecha o importador","decisions":["entra inteiro"],"nextSteps":[],"open":[]}';

function harness({ config = { stt: true }, status, summarize, me = "ana", onThePod = () => false, withShelf = true, outputs = { supported: false, outputs: [] }, clock = null } = {}) {
  const home = mkdtempSync(join(tmpdir(), "hive-meeting-routes-"));
  const shelfHome = withShelf ? mkdtempSync(join(tmpdir(), "hive-meeting-shelf-")) : "";
  const routes = [];
  const calls = { transcribe: [], summarize: [], pushed: [], pulls: 0, taps: [] };
  let seq = 0;
  const domain = registerMeetingRoutes((method, path, handler) => routes.push({ method, path, handler }), {
    bodyOf: async (req) => {
      const pieces = [];
      for await (const piece of req) pieces.push(Buffer.from(piece));
      return pieces.length ? JSON.parse(Buffer.concat(pieces).toString("utf8")) : {};
    },
    home,
    me: () => me,
    shelf: {
      home: () => shelfHome,
      turn: (work) => work(),
      pull: async () => { calls.pulls++; return shelfHome ? { home: shelfHome } : { error: "no shelf repo" }; },
      push: async (line, dirs) => { calls.pushed.push({ line, dirs }); return { pushed: true, committed: true }; }
    },
    readConfig: async () => ({ config }),
    engine: {
      status: () => status || { engine: "ready", model: "ready" },
      load: async () => ({}),
      transcribe: async (pcm, opts) => { calls.transcribe.push({ samples: pcm.length, ...opts }); return { text: `trecho ${calls.transcribe.length}` }; }
    },
    people: async () => ["ana", "caio"],
    outputs: async () => outputs,
    openOutput: (asked) => {
      const tap = { asked, stopped: null, level: () => 0.4, heard: () => true, stop: async ({ discard = false } = {}) => { tap.stopped = { discard }; if (!discard) asked.onChunk({ at: 30, pcm: new Float32Array(16000).fill(0.2) }); } };
      calls.taps.push(tap);
      return tap;
    },
    onThePod,
    summarize: async (asked) => { calls.summarize.push(asked); return summarize ? summarize(asked) : NOTES; },
    newId: () => `m${String(++seq).padStart(7, "0")}`,
    now: () => (clock ? clock.at : 1000 + seq),
    bridge: { status: () => ({ supported: true, chrome: { found: true, ready: false }, firefox: { found: false, ready: false } }), install: (asked) => { calls.installed = asked; return { ok: true, supported: true, chrome: { found: true, ready: true }, firefox: { found: false, ready: false } }; }, open: (asked) => (asked.which === "firefox" ? { error: "set the extension up first" } : { ok: true, dir: "/home/x/hive-meet-captions/chrome" }) },
    captionAssets: "/app/assets/meet-captions",
    aveiaUrl: () => "https://aveia.example",
    meetingsGuide: "https://github.com/someone/hive/blob/main/docs/meetings.md",
    sock: () => "/tmp/hive.sock",
  });
  const call = async (method, path, { body = null, query = "", sound = null } = {}) => {
    const route = routes.find((one) => one.path === path && (one.method === null || one.method === method));
    assert.ok(route, `no route for ${method} ${path}`);
    const req = Readable.from(sound ? [Buffer.from(sound.buffer)] : body ? [Buffer.from(JSON.stringify(body))] : []);
    let said = null;
    await route.handler(req, {}, new URL(`http://hive${path}${query}`), (data, code = 200) => { said = { code, data }; });
    return said;
  };
  const done = () => { rmSync(home, { recursive: true, force: true }); if (shelfHome) rmSync(shelfHome, { recursive: true, force: true }); };
  return { call, calls, home, shelfHome, domain, done };
}

const sound = (seconds = 1) => new Float32Array(16000 * seconds).fill(0.1);

async function settled(h, id) {
  for (let tries = 0; tries < 200; tries++) {
    const state = readLocalMeeting(h.home, id)?.state;
    if (state === "ready" || state === "summary-failed") return readLocalMeeting(h.home, id);
    await new Promise((next) => setTimeout(next, 5));
  }
  throw new Error("the notes never settled");
}

test("a meeting goes from sound to words to notes, and only then reaches the team", async () => {
  const h = harness();
  try {
    const started = await h.call("POST", "/api/meetings/start", { body: {} });
    assert.equal(started.code, 200);
    const id = started.data.meeting.id;
    assert.equal((await h.call("POST", "/api/meetings/start", { body: {} })).code, 409, "one recording at a time");
    const heard = await h.call("POST", "/api/meetings/chunk", { query: `?id=${id}&source=system&at=0`, sound: sound(2) });
    assert.deepEqual(heard.data, { ok: true, text: "trecho 1" });
    await h.call("POST", "/api/meetings/chunk", { query: `?id=${id}&source=mic&at=0`, sound: sound(1) });
    assert.equal(h.calls.pushed.length, 0, "nothing leaves the machine while it records");
    assert.equal((await h.call("GET", "/api/meetings")).data.live, id);
    await h.call("POST", "/api/meetings/stop", { body: { id, seconds: 75 } });
    const meeting = await settled(h, id);
    assert.equal(meeting.title, "Sprint 41", "an untitled meeting takes the title the notes gave it");
    assert.equal(meeting.seconds, 75);
    assert.equal(meeting.model, "claude-sonnet-5-5");
    assert.equal(h.calls.summarize[0].input, "[00:00] the call: trecho 1\n[00:00] ana: trecho 2");
    assert.match(h.calls.summarize[0].prompt, /the microphone of ana/);
    assert.deepEqual(readSharedMeetings(h.shelfHome).map((one) => one.id), [id]);
    assert.deepEqual(h.calls.pushed[0].dirs, ["m"]);
    assert.equal((await h.call("GET", "/api/meetings")).data.live, "");
  } finally { h.done(); }
});

test("a meeting kept only for me never touches the shelf, and sharing it later sends it", async () => {
  const h = harness({ config: { stt: true, meetings: { who: "me" } } });
  try {
    const id = (await h.call("POST", "/api/meetings/start", { body: {} })).data.meeting.id;
    await h.call("POST", "/api/meetings/chunk", { query: `?id=${id}&source=mic&at=0`, sound: sound() });
    await h.call("POST", "/api/meetings/stop", { body: { id } });
    await settled(h, id);
    assert.equal(h.calls.pushed.length, 0);
    assert.equal(existsSync(sharedMeetingFile(h.shelfHome, id)), false);
    const shared = await h.call("POST", "/api/meetings/edit", { body: { id, who: "team" } });
    assert.equal(shared.data.pushed, true);
    assert.equal(existsSync(sharedMeetingFile(h.shelfHome, id)), true);
    await h.call("POST", "/api/meetings/edit", { body: { id, who: "me" } });
    assert.equal(existsSync(sharedMeetingFile(h.shelfHome, id)), false, "back to one person takes it off the shelf");
    const removed = await h.call("POST", "/api/meetings/remove", { body: { id } });
    assert.equal(removed.code, 200);
    assert.equal(readLocalMeeting(h.home, id), null);
  } finally { h.done(); }
});

test("when the model fails the words stay, and asking again writes the notes", async () => {
  let fail = true;
  const h = harness({ summarize: () => { if (fail) throw new Error("the model timed out"); return NOTES; } });
  try {
    const id = (await h.call("POST", "/api/meetings/start", { body: { title: "Gráfica" } })).data.meeting.id;
    await h.call("POST", "/api/meetings/chunk", { query: `?id=${id}&source=mic&at=0`, sound: sound() });
    await h.call("POST", "/api/meetings/stop", { body: { id } });
    const failed = await settled(h, id);
    assert.equal(failed.state, "summary-failed");
    assert.match(failed.trouble, /timed out/);
    assert.equal(failed.lines.length, 1);
    fail = false;
    await h.call("POST", "/api/meetings/summarize", { body: { id, model: "claude-opus-5-5" } });
    await new Promise((next) => setTimeout(next, 20));
    const fixed = await settled(h, id);
    assert.equal(fixed.state, "ready");
    assert.equal(fixed.title, "Gráfica", "a title the person wrote is never replaced");
    assert.equal(fixed.model, "claude-opus-5-5");
  } finally { h.done(); }
});

test("a meeting with no words ends without asking the model anything", async () => {
  const h = harness();
  try {
    const id = (await h.call("POST", "/api/meetings/start", { body: {} })).data.meeting.id;
    await h.call("POST", "/api/meetings/stop", { body: { id } });
    const meeting = await settled(h, id);
    assert.equal(meeting.summary, null);
    assert.equal(h.calls.summarize.length, 0);
  } finally { h.done(); }
});

test("discarding throws the words away, and sound for a gone meeting is refused", async () => {
  const h = harness();
  try {
    const id = (await h.call("POST", "/api/meetings/start", { body: {} })).data.meeting.id;
    assert.equal((await h.call("POST", "/api/meetings/chunk", { query: `?id=${id}&source=speaker&at=0`, sound: sound() })).code, 400);
    assert.equal((await h.call("POST", "/api/meetings/chunk", { query: `?id=${id}&source=mic&at=0`, sound: new Float32Array(0) })).code, 400);
    await h.call("POST", "/api/meetings/stop", { body: { id, discard: true } });
    assert.equal(readLocalMeeting(h.home, id), null);
    assert.equal((await h.call("POST", "/api/meetings/chunk", { query: `?id=${id}&source=mic&at=0`, sound: sound() })).code, 404);
    assert.equal(h.calls.pushed.length, 0);
  } finally { h.done(); }
});

test("recording is refused where nothing can listen, and the list says why", async () => {
  for (const [over, why] of [[{ config: { stt: false } }, "off"], [{ status: { engine: "missing", model: "none" } }, "missing"], [{ onThePod: () => true }, "pod"]]) {
    const h = harness(over);
    try {
      assert.equal((await h.call("GET", "/api/meetings")).data.listening.why, why);
      const refused = await h.call("POST", "/api/meetings/start", { body: {} });
      assert.equal(refused.code, 409);
      assert.equal(refused.data.why, why);
    } finally { h.done(); }
  }
});

test("someone else's meeting can be read when shared, and never changed", async () => {
  const h = harness({ me: "caio" });
  try {
    const theirs = { id: "m7777777", owner: "ana", title: "Sprint 41", who: "team", people: [], state: "ready", startedAt: 5, endedAt: 9, seconds: 60, lines: [], summary: null };
    const { writeSharedMeeting } = await import("../lib/meetings.mjs");
    writeSharedMeeting(h.shelfHome, theirs);
    writeSharedMeeting(h.shelfHome, { ...theirs, id: "m8888888", who: "me" });
    const list = (await h.call("GET", "/api/meetings")).data;
    assert.deepEqual(list.meetings.map((one) => one.id), ["m7777777"]);
    assert.deepEqual(list.people, ["ana", "caio"]);
    const one = await h.call("GET", "/api/meetings/one", { query: "?id=m7777777" });
    assert.equal(one.data.mine, false);
    assert.equal((await h.call("GET", "/api/meetings/one", { query: "?id=m8888888" })).code, 404);
    assert.equal((await h.call("POST", "/api/meetings/edit", { body: { id: "m7777777", title: "mine now" } })).code, 404);
    assert.equal((await h.call("POST", "/api/meetings/remove", { body: { id: "m7777777" } })).code, 404);
  } finally { h.done(); }
});

test("a meeting the hive closed on is not left recording forever", async () => {
  const h = harness();
  try {
    writeLocalMeeting(h.home, { id: "m6666666", owner: "ana", title: "x", who: "me", people: [], state: "recording", startedAt: 1, seconds: 30, lines: [{ at: 0, source: "mic", text: "oi" }], summary: null });
    const list = (await h.call("GET", "/api/meetings")).data;
    assert.equal(list.meetings[0].state, "summary-failed");
    assert.match(readLocalMeeting(h.home, "m6666666").trouble, /closed/);
  } finally { h.done(); }
});

test("on a machine that can name its outputs the server listens to the one picked, and the window opens nothing", async () => {
  const h = harness({ config: { stt: true, meetings: { output: "alsa_output.usb-headset" } }, outputs: { supported: true, outputs: [{ id: "alsa_output.usb-headset", name: "Headset", default: false }] } });
  try {
    assert.equal((await h.call("GET", "/api/meetings/outputs")).data.supported, true);
    const started = await h.call("POST", "/api/meetings/start", { body: { systemByServer: true } });
    const id = started.data.meeting.id;
    assert.equal(started.data.system, "server");
    assert.equal(h.calls.taps[0].asked.output, "alsa_output.usb-headset");
    h.calls.taps[0].asked.onChunk({ at: 0, pcm: new Float32Array(16000).fill(0.01) });
    h.calls.taps[0].asked.onChunk({ at: 15, pcm: new Float32Array(16000) });
    assert.deepEqual((await h.call("GET", "/api/meetings/level")).data, { id, system: 0.4, heard: true, captions: { connected: false, on: false } });
    await h.call("POST", "/api/meetings/stop", { body: { id } });
    const meeting = await settled(h, id);
    assert.deepEqual(h.calls.taps[0].stopped, { discard: false });
    assert.deepEqual(meeting.lines.map((line) => `${line.at}:${line.source}`), ["0:system", "30:system"], "silence never reaches the model, and the last piece is not lost");
    assert.equal((await h.call("GET", "/api/meetings/level")).data.id, "");
  } finally { h.done(); }
});

test("the window keeps the computer's sound when the server cannot name outputs, or when it is turned off", async () => {
  const none = harness();
  try {
    assert.equal((await none.call("POST", "/api/meetings/start", { body: { systemByServer: true } })).data.system, "window");
    assert.equal(none.calls.taps.length, 0);
  } finally { none.done(); }
  const off = harness({ config: { stt: true, meetings: { systemAudio: false } }, outputs: { supported: true, outputs: [] } });
  try {
    const id = (await off.call("POST", "/api/meetings/start", { body: { systemByServer: true } })).data.meeting.id;
    assert.equal(off.calls.taps.length, 0);
    await off.call("POST", "/api/meetings/stop", { body: { id, discard: true } });
  } finally { off.done(); }
});

test("discarding a recording stops the listening and writes nothing down", async () => {
  const h = harness({ outputs: { supported: true, outputs: [] } });
  try {
    const id = (await h.call("POST", "/api/meetings/start", { body: { systemByServer: true } })).data.meeting.id;
    await h.call("POST", "/api/meetings/stop", { body: { id, discard: true } });
    assert.deepEqual(h.calls.taps[0].stopped, { discard: true });
    assert.equal(h.calls.transcribe.length, 0);
  } finally { h.done(); }
});

test("while the captions of the call arrive they are what is written down, with who spoke, and the sound is not transcribed twice", async () => {
  const clock = { at: 100000 };
  const h = harness({ clock });
  try {
    assert.equal((await h.call("POST", "/api/meetings/captions", { body: { captions: true, lines: [] } })).data.recording, false);
    const id = (await h.call("POST", "/api/meetings/start", { body: {} })).data.meeting.id;
    for (let second = 0; second <= 30; second += 4) {
      clock.at = 100000 + second * 1000;
      const lines = second === 4 ? [{ key: "abcd-1", speaker: "Marina", text: "A gente fecha o importador" }]
        : second === 8 ? [{ key: "abcd-1", speaker: "Marina", text: "A gente fecha o importador nesta sprint." }, { key: "abcd-2", speaker: "Caio", text: "Fechado." }] : [];
      const said = await h.call("POST", "/api/meetings/captions", { body: { captions: true, lines } });
      assert.equal(said.data.recording, true);
      assert.equal(said.data.meetingId, id);
    }
    const skipped = await h.call("POST", "/api/meetings/chunk", { query: `?id=${id}&source=mic&at=0`, sound: sound(30) });
    assert.deepEqual(skipped.data, { ok: true, text: "" });
    assert.equal(h.calls.transcribe.length, 0);
    assert.deepEqual((await h.call("GET", "/api/meetings/extension")).data.on, true);
    const lines = readLocalMeeting(h.home, id).lines;
    assert.deepEqual(lines.map((line) => `${line.at}:${line.source}:${line.speaker}:${line.text}`), ["4:caption:Marina:A gente fecha o importador nesta sprint.", "8:caption:Caio:Fechado."]);
    clock.at = 100000 + 31000;
    await h.call("POST", "/api/meetings/stop", { body: { id } });
    await settled(h, id);
    assert.equal(h.calls.summarize[0].input, "[00:04] Marina: A gente fecha o importador nesta sprint.\n[00:08] Caio: Fechado.");
  } finally { h.done(); }
});

test("when the captions stop arriving the sound takes over, so leaving the call tab loses nothing", async () => {
  const clock = { at: 100000 };
  const h = harness({ clock });
  try {
    const id = (await h.call("POST", "/api/meetings/start", { body: {} })).data.meeting.id;
    for (let second = 0; second <= 12; second += 4) {
      clock.at = 100000 + second * 1000;
      await h.call("POST", "/api/meetings/captions", { body: { captions: true, lines: second === 4 ? [{ key: "abcd-1", speaker: "Marina", text: "oi" }] : [] } });
    }
    clock.at = 100000 + 60000;
    assert.equal((await h.call("POST", "/api/meetings/chunk", { query: `?id=${id}&source=mic&at=0`, sound: sound(30) })).data.text, "trecho 1", "the browser went quiet at 12s, so the piece is heard");
    assert.equal((await h.call("POST", "/api/meetings/chunk", { query: `?id=${id}&source=system&at=30`, sound: sound(30) })).data.text, "trecho 2");
    assert.equal((await h.call("GET", "/api/meetings/extension")).data.connected, false);
  } finally { h.done(); }
});

test("while the call's captions are on the sound is not written down at all, and captions turned off never count", async () => {
  const clock = { at: 100000 };
  const h = harness({ clock });
  try {
    const id = (await h.call("POST", "/api/meetings/start", { body: {} })).data.meeting.id;
    for (let second = 0; second <= 30; second += 4) { clock.at = 100000 + second * 1000; await h.call("POST", "/api/meetings/captions", { body: { captions: true, lines: [] } }); }
    assert.equal((await h.call("POST", "/api/meetings/chunk", { query: `?id=${id}&source=mic&at=0`, sound: sound(30) })).data.text, "", "the call already says everything, the microphone would only say it twice");
    assert.equal(h.calls.transcribe.length, 0);
    for (let second = 34; second <= 64; second += 4) { clock.at = 100000 + second * 1000; await h.call("POST", "/api/meetings/captions", { body: { captions: false, lines: [{ key: "abcd-9", speaker: "x", text: "y" }] } }); }
    assert.equal((await h.call("POST", "/api/meetings/chunk", { query: `?id=${id}&source=mic&at=32`, sound: sound(30) })).data.text, "trecho 1");
  } finally { h.done(); }
});

test("a meeting can be started and stopped from the call's tab, with no microphone, and your own captions carry your name", async () => {
  const clock = { at: 100000 };
  const h = harness({ clock });
  try {
    const started = await h.call("POST", "/api/meetings/captions", { body: { command: "start", title: "abc-defg-hij", captions: false, lines: [] } });
    assert.equal(started.data.recording, true);
    const id = started.data.meetingId;
    assert.equal(started.data.startedAt, 100000);
    assert.equal(readLocalMeeting(h.home, id).via, "extension");
    assert.equal(readLocalMeeting(h.home, id).titled, false, "the code of the call is not a title");
    assert.equal((await h.call("POST", "/api/meetings/captions", { body: { command: "start", captions: true, lines: [] } })).data.meetingId, id, "asking twice starts one meeting");
    assert.equal((await h.call("POST", "/api/meetings/start", { body: {} })).code, 409);
    clock.at = 104000;
    await h.call("POST", "/api/meetings/captions", { body: { captions: true, lines: [{ key: "abcd-1", speaker: "Você", text: "Eu confirmo a data." }, { key: "abcd-2", speaker: "Marina", text: "Fechado." }] } });
    assert.deepEqual(readLocalMeeting(h.home, id).lines.map((line) => `${line.speaker}:${line.text}`), ["ana:Eu confirmo a data.", "Marina:Fechado."]);
    assert.equal((await h.call("GET", "/api/meetings")).data.captions.on, true);
    clock.at = 130000;
    assert.equal((await h.call("POST", "/api/meetings/captions", { body: { command: "stop", captions: true, lines: [] } })).data.recording, false);
    const meeting = await settled(h, id);
    assert.equal(meeting.seconds, 30);
    assert.equal(h.calls.transcribe.length, 0);
    assert.equal(h.calls.summarize[0].input, "[00:04] ana: Eu confirmo a data.\n[00:04] Marina: Fechado.");
  } finally { h.done(); }
});

test("a meeting started from the browser ends by itself when the call's tab goes away, and one started in the hive does not", async () => {
  const clock = { at: 100000 };
  const h = harness({ clock });
  try {
    const id = (await h.call("POST", "/api/meetings/captions", { body: { command: "start", captions: true, lines: [{ key: "abcd-1", speaker: "Marina", text: "oi" }] } })).data.meetingId;
    clock.at = 130000;
    assert.equal(await h.domain.sweep(), false, "thirty seconds of silence from the tab is not the end yet");
    clock.at = 150000;
    assert.equal(await h.domain.sweep(), true);
    assert.equal((await settled(h, id)).lines.length, 1);
    const own = (await h.call("POST", "/api/meetings/start", { body: {} })).data.meeting.id;
    clock.at = 400000;
    assert.equal(await h.domain.sweep(), false);
    assert.equal(readLocalMeeting(h.home, own).state, "recording");
  } finally { h.done(); }
});

test("setting up the extension hands the bridge the socket of this hive and the address aveia is configured at", async () => {
  const h = harness();
  try {
    const status = (await h.call("GET", "/api/meetings/extension")).data;
    assert.equal(status.chrome.ready, false);
    assert.equal(status.aveia, "https://aveia.example", "the meetings screen can say which aveia the captions go to");
    assert.equal(status.guide, "https://github.com/someone/hive/blob/main/docs/meetings.md");
    const done = await h.call("POST", "/api/meetings/extension/install", { body: {} });
    assert.equal(done.data.chrome.ready, true);
    assert.equal(h.calls.installed.sock, "/tmp/hive.sock");
    assert.equal(h.calls.installed.assets, "/app/assets/meet-captions");
    assert.equal(h.calls.installed.aveia, "https://aveia.example");
    assert.equal((await h.call("POST", "/api/meetings/extension/open", { body: { which: "chrome" } })).data.ok, true);
    assert.equal((await h.call("POST", "/api/meetings/extension/open", { body: { which: "firefox" } })).code, 409);
  } finally { h.done(); }
});

test("recording from the hive with a call open in the browser takes the captions only, and without a call it is refused so the microphone path runs", async () => {
  const clock = { at: 100000 };
  const h = harness({ clock, status: { engine: "missing", model: "none" } });
  try {
    assert.equal((await h.call("GET", "/api/meetings/extension")).data.call, false);
    const refused = await h.call("POST", "/api/meetings/start", { body: { captionsOnly: true } });
    assert.equal(refused.code, 409);
    assert.equal(refused.data.why, "no-call");
    await h.call("POST", "/api/meetings/captions", { body: { inCall: true, captions: false, lines: [] } });
    assert.equal((await h.call("GET", "/api/meetings/extension")).data.call, true);
    const started = await h.call("POST", "/api/meetings/start", { body: { captionsOnly: true } });
    assert.equal(started.data.system, "captions");
    assert.equal(readLocalMeeting(h.home, started.data.meeting.id).via, "extension");
    await h.call("POST", "/api/meetings/stop", { body: { id: started.data.meeting.id, discard: true } });
    clock.at = 100000 + 60000;
    assert.equal((await h.call("GET", "/api/meetings/extension")).data.call, false);
  } finally { h.done(); }
});
