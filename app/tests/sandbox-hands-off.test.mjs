import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const main = readFileSync(join(here, "..", "main.js"), "utf8");

test("a sandbox never makes itself the app that answers hive:// links on this machine", () => {
  assert.match(main, /if \(!process\.env\.HIVE_SANDBOX\) app\.setAsDefaultProtocolClient\(relay\.SCHEME\);/,
    "a sandbox that registers the scheme steals every hive:// link from the installed Hive until something re-registers it");
  assert.equal((main.match(/setAsDefaultProtocolClient/g) || []).length, 1, "the scheme is registered in one place only");
});
