import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const main = readFileSync(join(HERE, "main.js"), "utf8");
const preload = readFileSync(join(HERE, "main/preload.js"), "utf8");
const meetings = readFileSync(join(HERE, "src/app/meetings.js"), "utf8");
const built = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")).build;

test("the computer's sound is handed over only to the hive window, and only right after it asked", () => {
  assert.match(main, /setDisplayMediaRequestHandler/);
  assert.match(main, /const armed = Date\.now\(\) < systemSoundUntil;\s+systemSoundUntil = 0;/, "one ask opens one capture");
  assert.match(main, /if \(!armed \|\| request\.frame !== window_\.webContents\.mainFrame\)/);
  assert.match(main, /audio: "loopback"/);
  assert.match(main, /ipcMain\.handle\("hive:system-sound"/);
  assert.match(preload, /ipcRenderer\.invoke\("hive:system-sound"\)/);
});

test("the picture of the screen that comes with the sound is dropped at once", () => {
  const at = meetings.indexOf("getDisplayMedia");
  assert.ok(at > 0);
  assert.match(meetings.slice(at, at + 260), /for \(const track of stream\.getVideoTracks\(\)\) track\.stop\(\)/);
  assert.ok(meetings.indexOf("hiveSystemSound") < at, "the window asks the main process before it asks the browser");
});

test("nothing is recorded before the person is told the other side sees no sign of it", () => {
  const start = meetings.slice(meetings.indexOf("export async function startRecording"));
  assert.ok(start.indexOf("Record this meeting?") < start.indexOf("openMic("), "the question comes before the microphone opens");
});

test("the mac build says why it listens to the computer's sound", () => {
  const said = built.mac.extendInfo?.NSAudioCaptureUsageDescription;
  assert.equal(typeof said, "string");
  assert.match(said, /never leaves/i);
});
