const { test } = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { BADGE_MAX, badgeText } = require("../main/dock-badge.js");

const main = readFileSync(join(__dirname, "..", "main.js"), "utf8");

test("the dock says the count up to nine, then 9+, and nothing when nobody waits", () => {
  assert.equal(BADGE_MAX, 9);
  assert.equal(badgeText(0), "");
  assert.equal(badgeText(1), "1");
  assert.equal(badgeText(9), "9");
  assert.equal(badgeText(10), "9+");
  assert.equal(badgeText(240), "9+");
});

test("a count that is not a whole number of chats never reaches the dock as junk", () => {
  assert.equal(badgeText(-3), "");
  assert.equal(badgeText(undefined), "");
  assert.equal(badgeText("4"), "4");
  assert.equal(badgeText(2.9), "2");
});

test("once the page counts, main stops counting and notifying needs on its own", () => {
  assert.match(main, /ipcMain\.on\("hive:badge", \(event, count\) => \{\n\s+if \(!window_ \|\| window_\.isDestroyed\(\) \|\| event\.sender !== window_\.webContents\) return;\n\s+pageNotices = true;\n\s+if \(app\.dock\) app\.dock\.setBadge\(badgeText\(count\)\);/);
  const watch = main.slice(main.indexOf("async function watch() {"), main.indexOf("const GAZE_MS"));
  assert.match(watch, /^async function watch\(\) \{\n\s+if \(pageNotices\) return;/);
  assert.match(watch, /\} catch \{ return; \}\n\s+if \(pageNotices\) return;/, "a page that took over during the fetch is not doubled");
  assert.match(watch, /if \(app\.dock\) app\.dock\.setBadge\(badgeText\(asking\)\);/);
});

test("a click on a notice can bring a hidden or minimised window back", () => {
  const reveal = main.slice(main.indexOf('ipcMain.on("hive:reveal"'), main.indexOf('ipcMain.on("hive:window"'));
  assert.match(reveal, /win\.restore\(\)/);
  assert.match(reveal, /win\.show\(\)/);
  assert.match(reveal, /win\.focus\(\)/);
});
