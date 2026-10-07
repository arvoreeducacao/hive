import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { STT_ENGINE_ASSETS, engineAssetFor } from "../lib/stt-download.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(join(HERE, file), "utf8");

const SHIPPED = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64", "win32-x64"];

const LIB_OF = { darwin: "libtranscribe.dylib", linux: "libtranscribe.so", win32: "transcribe.dll" };

test("every machine the hive is released for has an engine built for it", () => {
  assert.deepEqual(Object.keys(STT_ENGINE_ASSETS).sort(), [...SHIPPED].sort());
  for (const key of SHIPPED) {
    const [platform] = key.split("-");
    const one = engineAssetFor(...key.split("-"));
    assert.ok(one, `${key} has no engine`);
    assert.equal(one.lib, LIB_OF[platform], `${key} would look for the wrong file name`);
    assert.ok(one.asset.endsWith(".tar.gz"), `${key} is not a tarball`);
    assert.equal(one.asset.includes(one.root.replace("transcribe-native-", "")), true, `${key} unpacks a folder its asset does not name`);
    assert.match(one.sha256, /^[0-9a-f]{64}$/, `${key} has no hash to check against`);
    assert.ok(one.bytes > 0, `${key} has no size`);
  }
});

test("a machine with no build gets told, instead of downloading something wrong", () => {
  assert.equal(engineAssetFor("win32", "arm64"), null);
  assert.equal(engineAssetFor("linux", "ia32"), null);
  assert.equal(engineAssetFor("freebsd", "x64"), null);
  assert.match(read("routes/stt.mjs"), /dictation has no engine built for \$\{platform\} \$\{arch\} yet/);
});

test("the ffi library ships a binary for each of those machines, so npm ci picks the right one", () => {
  const koffi = JSON.parse(read("node_modules/koffi/package.json"));
  for (const key of SHIPPED) {
    assert.ok(koffi.optionalDependencies[`@koromix/koffi-${key}`], `koffi has no prebuilt for ${key}`);
  }
});

test("a signed mac app is allowed to hear the microphone", () => {
  const mac = JSON.parse(read("package.json")).build.mac;
  assert.equal(typeof mac.extendInfo?.NSMicrophoneUsageDescription, "string", "without the reason macOS kills the app when it asks");
  assert.equal(mac.entitlements, "build/entitlements.mac.plist");
  assert.equal(mac.entitlementsInherit, mac.entitlements, "the helper processes need the same list");
  const plist = read(mac.entitlements);
  assert.match(plist, /com\.apple\.security\.device\.audio-input/, "under the hardened runtime the reason string alone is not enough — the entitlement is what opens the microphone");
  for (const kept of ["allow-jit", "allow-unsigned-executable-memory", "disable-library-validation"]) {
    assert.match(plist, new RegExp(kept.replace(/-/g, "\\-")), `electron needs ${kept}, and replacing the default list drops it`);
  }
});
