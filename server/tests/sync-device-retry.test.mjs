import { test } from "node:test";
import assert from "node:assert/strict";
import { RETRY_CAP, RETRY_STEP, retryDelay } from "../sync/device.mjs";

test("the wait after a lost stream doubles per failure, lands in the upper half of its ceiling and never passes the cap", () => {
  assert.equal(retryDelay(1, 0), RETRY_STEP / 2);
  assert.equal(retryDelay(1, 1), RETRY_STEP);
  assert.equal(retryDelay(2, 0), RETRY_STEP);
  assert.equal(retryDelay(3, 1), RETRY_STEP * 4);
  assert.equal(retryDelay(50, 1), RETRY_CAP);
  assert.equal(retryDelay(50, 0), RETRY_CAP / 2);
  for (let n = 1; n < 12; n++) assert.ok(retryDelay(n) <= RETRY_CAP);
});
