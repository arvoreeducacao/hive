import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FAILURE_IGNORED_FOR, forgetIgnored, ignoreCheck, ignoredFile, readIgnored } from "../lib/doctor-ignored.mjs";
import { registerDoctorRoutes } from "../routes/doctor.mjs";

const home = () => mkdtempSync(join(tmpdir(), "hive-ignored-"));

test("a warning is ignored for good and a failure only for a week", () => {
  const at = home();
  const now = 1_000_000;
  ignoreCheck(at, ["gh"], "warn", now);
  ignoreCheck(at, ["pod"], "fail", now);
  assert.deepEqual(readIgnored(at, now), { gh: 0, pod: now + FAILURE_IGNORED_FOR });
  assert.deepEqual(readIgnored(at, now + FAILURE_IGNORED_FOR + 1), { gh: 0 }, "a failure ignored forever is a pod that goes down quietly");
});

test("the ignore survives a restart and can be taken back", () => {
  const at = home();
  ignoreCheck(at, ["hub-context", "hub-contract"], "warn");
  assert.deepEqual(Object.keys(readIgnored(at)).sort(), ["hub-context", "hub-contract"]);
  forgetIgnored(at, ["hub-context", "hub-contract"]);
  assert.deepEqual(readIgnored(at), {});
});

test("a broken file reads as nothing ignored", () => {
  const at = home();
  writeFileSync(ignoredFile(at), "{not json");
  assert.deepEqual(readIgnored(at), {});
});

test("the doctor route carries what is ignored and takes new ignores", async () => {
  const at = home();
  const routes = new Map();
  registerDoctorRoutes((method, path, handler) => routes.set(path, handler), {
    doctor: { readDoctor: async () => ({ items: [] }), applyFix: async () => ({}) },
    bodyOf: async (req) => req.body,
    HIVE_HOME: at
  });
  const call = async (path, body = {}) => {
    const answers = [];
    await routes.get(path)({ body }, {}, new URL(`http://hive${path}`), (value, status = 200) => answers.push({ value, status }));
    return answers[0];
  };
  assert.deepEqual(await call("/api/doctor/ignore", {}), { value: { error: "which check?" }, status: 400 });
  assert.deepEqual((await call("/api/doctor/ignore", { ids: ["gh"], state: "warn" })).value, { ok: true, ignored: { gh: 0 } });
  assert.deepEqual((await call("/api/doctor")).value, { items: [], ignored: { gh: 0 } });
  assert.deepEqual((await call("/api/doctor/ignore", { ids: ["gh"], forget: true })).value, { ok: true, ignored: {} });
});
