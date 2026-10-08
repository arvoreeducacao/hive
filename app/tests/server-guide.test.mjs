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

test("the meetings guide sits beside the server guide, in the same repository", async () => {
  const { meetingsGuideOf } = await import("../lib/server-guide.mjs");
  assert.equal(meetingsGuideOf({ homepage: "https://github.com/someone/hive" }), "https://github.com/someone/hive/blob/main/docs/meetings.md");
  assert.equal(meetingsGuideOf({}), "");
});
