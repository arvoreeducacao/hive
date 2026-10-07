import test from "node:test";
import assert from "node:assert/strict";
import { registerPortariaRoutes } from "../routes/portaria.mjs";

function portariaHarness({ state = { devices: [] }, action = { closed: true } } = {}) {
  const routes = new Map();
  const calls = [];
  registerPortariaRoutes((method, path, handler) => routes.set(path, { method, handler }), {
    bodyOf: async (req) => req.body,
    portariaState: async () => {
      calls.push(["state"]);
      return state;
    },
    portariaDo: async (op, data) => {
      calls.push(["action", op, data]);
      return action;
    }
  });
  const call = async (path, body = {}) => {
    const answers = [];
    const json = (value, status = 200) => answers.push({ value, status });
    await routes.get(path).handler({ body }, {}, new URL(`http://hive${path}`), json);
    return answers;
  };
  return { routes, calls, call };
}

test("portaria routes keep the read endpoint open and the action endpoint on POST", () => {
  const { routes } = portariaHarness();
  assert.deepEqual([...routes].map(([path, route]) => [path, route.method]), [
    ["/api/portaria", null],
    ["/api/portaria/action", "POST"]
  ]);
});

test("portaria state is returned unchanged", async () => {
  const state = { door: "cloud", devices: [{ name: "phone" }] };
  const hive = portariaHarness({ state });
  assert.deepEqual(await hive.call("/api/portaria"), [{ value: state, status: 200 }]);
  assert.deepEqual(hive.calls, [["state"]]);
});

test("portaria actions receive the whole body and turn domain errors into 400", async () => {
  const data = { op: "revoke", fingerprint: "SHA256:phone" };
  const accepted = portariaHarness({ action: { revoked: true } });
  assert.deepEqual(await accepted.call("/api/portaria/action", data), [{ value: { revoked: true }, status: 200 }]);
  assert.deepEqual(accepted.calls, [["action", "revoke", data]]);

  const refused = portariaHarness({ action: { error: "that device would not go" } });
  assert.deepEqual(await refused.call("/api/portaria/action", {}), [
    { value: { error: "that device would not go" }, status: 400 }
  ]);
  assert.deepEqual(refused.calls, [["action", "", {}]]);
});
