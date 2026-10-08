import { test } from "node:test";
import assert from "node:assert";
import { serverGuideOf } from "../lib/server-guide.mjs";

test("the server guide is the run-your-own page of the repository the app was built from", () => {
  assert.equal(serverGuideOf({ homepage: "https://github.com/someone/hive" }), "https://github.com/someone/hive/blob/main/docs/run-your-own.md");
  assert.equal(serverGuideOf({ homepage: "https://github.com/someone/hive/" }), "https://github.com/someone/hive/blob/main/docs/run-your-own.md");
});

test("an app with no repository to point at offers no link instead of a wrong one", () => {
  assert.equal(serverGuideOf({}), "");
  assert.equal(serverGuideOf({ homepage: "https://example.com/hive" }), "");
  assert.equal(serverGuideOf(null), "");
});
