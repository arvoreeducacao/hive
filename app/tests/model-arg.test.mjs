import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL_ARG_PATTERN } from "../lib/spawn-args.mjs";
import { MODEL_NAME } from "../../server/seats.mjs";

const REAL = ["opus", "sonnet", "claude-opus-5[1m]", "opus[1m]", "amazon.nova-2-lite-v1:0"];
const HOSTILE = ["sonnet; rm -rf /", "a`id`", "a$(id)", "a b", "a'b", 'a"b', "a|b", "a&b"];

test("the app and the server agree on which model ids may be spawned", () => {
  for (const model of REAL) {
    assert.equal(MODEL_ARG_PATTERN.test(model), true, `the app refused ${model}`);
    assert.equal(MODEL_NAME.test(model), true, `the server refused ${model}`);
  }
  for (const model of HOSTILE) {
    assert.equal(MODEL_ARG_PATTERN.test(model), false, `the app took ${model}`);
    assert.equal(MODEL_NAME.test(model), false, `the server took ${model}`);
  }
});

test("an empty model is no model, and never a name the server tries to start", () => {
  assert.equal(MODEL_ARG_PATTERN.test(""), true, "the app treats no model as nothing to check");
  assert.equal(MODEL_NAME.test(""), false, "the server only ever sees a model when there is one");
});
