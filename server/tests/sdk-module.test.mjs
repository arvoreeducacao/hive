import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { importSdk, shippedSdkUrl, SDK_PACKAGE } from "../engine/sdk-module.mjs";

const SHIPPED = "/Applications/Hive.app/Contents/Resources/app";
const SHIPPED_ENTRY = join(SHIPPED, "..", "server", "node_modules", SDK_PACKAGE, "sdk.mjs");
const resolve = (root) => join(root, "node_modules", SDK_PACKAGE, "sdk.mjs");

test("the sdk beside the driver is the one loaded while its release is on disk", async () => {
  const asked = [];
  const sdk = await importSdk({ env: { HIVE_APP_SHIPPED: SHIPPED }, resolve, load: async (specifier) => (asked.push(specifier), { query: "beside" }) });
  assert.equal(sdk.query, "beside");
  assert.deepEqual(asked, [SDK_PACKAGE]);
});

test("a seat whose release was swept wakes on the sdk the bundle carries", async () => {
  const asked = [];
  const load = async (specifier) => {
    asked.push(specifier);
    if (specifier === SDK_PACKAGE) throw new Error(`Cannot find package '${SDK_PACKAGE}'`);
    return { query: "shipped" };
  };
  const sdk = await importSdk({ env: { HIVE_APP_SHIPPED: SHIPPED }, resolve, load });
  assert.equal(sdk.query, "shipped");
  assert.deepEqual(asked, [SDK_PACKAGE, pathToFileURL(SHIPPED_ENTRY).href]);
});

test("without a bundle the original failure is what the seat reports", async () => {
  const load = async () => { throw new Error("swept"); };
  await assert.rejects(importSdk({ env: {}, resolve, load }), /swept/);
});

test("a bundle without the sdk inside gives no fallback", () => {
  const missing = () => { throw new Error("not there"); };
  assert.equal(shippedSdkUrl({ env: { HIVE_APP_SHIPPED: SHIPPED }, resolve: missing }), "");
});

test("the sdk the installed bundle carries resolves to a file", { skip: !process.env.HIVE_APP_SHIPPED }, () => {
  assert.match(shippedSdkUrl(), /^file:.*claude-agent-sdk/);
});
