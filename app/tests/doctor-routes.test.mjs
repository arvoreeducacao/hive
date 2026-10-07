import test from "node:test";
import assert from "node:assert/strict";
import { registerDoctorRoutes } from "../routes/doctor.mjs";

function doctorHarness(doctor = {}) {
  const routes = new Map();
  const reads = [];
  const fixes = [];
  const service = {
    readDoctor: async (force) => {
      reads.push(force);
      return { force };
    },
    applyFix: async (id) => {
      fixes.push(id);
      return id === "broken" ? { error: "not fixed" } : { ok: true, id };
    },
    ...doctor
  };
  registerDoctorRoutes((method, path, handler) => routes.set(path, { method, handler }), {
    doctor: service,
    bodyOf: async (req) => req.body
  });
  const call = async (path, { body = {}, query = "" } = {}) => {
    const answers = [];
    const json = (value, status = 200) => answers.push({ value, status });
    await routes.get(path).handler({ body }, {}, new URL(`http://hive${path}${query}`), json);
    return answers;
  };
  return { routes, reads, fixes, call };
}

test("the doctor room registers the optional read and fix routes", () => {
  const { routes } = doctorHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/doctor", null],
    ["/api/doctor/fix", "POST"]
  ]);

  const unavailable = new Map();
  registerDoctorRoutes((method, path, handler) => unavailable.set(path, { method, handler }), {
    doctor: null,
    bodyOf: async () => ({})
  });
  assert.equal(unavailable.size, 0);
});

test("doctor reads preserve force and fixes preserve id coercion and status", async () => {
  const hive = doctorHarness();
  assert.deepEqual(await hive.call("/api/doctor"), [{ value: { force: false }, status: 200 }]);
  assert.deepEqual(await hive.call("/api/doctor", { query: "?force=1" }), [{ value: { force: true }, status: 200 }]);
  assert.deepEqual(await hive.call("/api/doctor/fix", { body: { id: 12 } }), [{ value: { ok: true, id: "12" }, status: 200 }]);
  assert.deepEqual(await hive.call("/api/doctor/fix", { body: { id: "broken" } }), [{ value: { error: "not fixed" }, status: 400 }]);
  assert.deepEqual(hive.reads, [false, true]);
  assert.deepEqual(hive.fixes, ["12", "broken"]);
});
