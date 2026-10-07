import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const main = readFileSync(join(HERE, "main.js"), "utf8");
const preload = readFileSync(join(HERE, "main/preload.js"), "utf8");
const talk = readFileSync(join(HERE, "src/app/stt.js"), "utf8");
const built = JSON.parse(readFileSync(join(HERE, "package.json"), "utf8")).build;

test("the mac build says why it wants the microphone, in words a person reads", () => {
  const said = built.mac.extendInfo?.NSMicrophoneUsageDescription;
  assert.equal(typeof said, "string", "without this key macOS kills the app the moment it asks");
  assert.match(said, /microphone/i);
  assert.match(said, /never leaves/i, "the sentence must say the sound stays on the machine");
});

test("only the hive window may use the microphone, and nothing else may use anything", () => {
  assert.match(main, /window_\.webContents\.session\.setPermissionRequestHandler/);
  assert.match(main, /if \(permission !== "media" && permission !== "display-capture"\) return grant\(false\)/);
  assert.match(main, /grant\(wc === window_\.webContents\)/);
  assert.match(main, /seatBrowser\.setPermissionRequestHandler\(\(_wc, _permission, grant\) => grant\(false\)\)/, "the pages a seat opens stay locked out");
});

test("on a mac the app asks the system before it opens the microphone", () => {
  assert.match(main, /ipcMain\.handle\("hive:microphone"/);
  assert.match(main, /systemPreferences\.getMediaAccessStatus\("microphone"\)/);
  assert.match(main, /systemPreferences\.askForMediaAccess\("microphone"\)/);
  assert.match(main, /if \(!IS_MAC\) return \{ allowed: true/, "every other system answers yes without a dialog");
  assert.match(preload, /hiveMicrophone/);
  assert.match(preload, /ipcRenderer\.invoke\("hive:microphone"\)/);
});

test("a refusal from the system stops the recording before the microphone ever opens", () => {
  const at = talk.indexOf("hiveMicrophone");
  const opens = talk.indexOf("getUserMedia");
  assert.ok(at > 0 && at < opens, "the app must ask the system first");
  assert.match(talk, /NotAllowedError/, "a refusal has to read like the browser's own refusal");
});
