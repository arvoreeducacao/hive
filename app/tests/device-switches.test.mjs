import { test } from "node:test";
import assert from "node:assert/strict";
import { AGENT_DEVICES_OFF, DEVICES_OFF, deviceRefusal, registerDeviceRoutes } from "../routes/device.mjs";

const switches = (devices, agents) => async () => ({ devices, agents });
const person = { name: "reader" };
const agent = { name: "reader", where: "local" };

test("with both switches on, nobody is refused", async () => {
  assert.equal(await deviceRefusal(agent, switches(true, true), { opening: true }), "");
  assert.equal(await deviceRefusal(person, switches(true, true)), "");
  assert.equal(await deviceRefusal(agent, undefined), "", "a hive that passes no switches keeps today's behaviour");
});

test("devices off: no new device opens, and agents are refused, but the person's pane keeps a running one", async () => {
  assert.equal(await deviceRefusal(person, switches(false, true), { opening: true }), DEVICES_OFF);
  assert.equal(await deviceRefusal(agent, switches(false, true)), DEVICES_OFF);
  assert.equal(await deviceRefusal(person, switches(false, true)), "");
});

test("agents off: an agent is refused everything, the person is not", async () => {
  assert.equal(await deviceRefusal(agent, switches(true, false), { opening: true }), AGENT_DEVICES_OFF);
  assert.equal(await deviceRefusal(agent, switches(true, false)), AGENT_DEVICES_OFF);
  assert.equal(await deviceRefusal(person, switches(true, false), { opening: true }), "");
});

test("the routes answer 403 with the reason before touching any phone", async () => {
  const routes = new Map();
  const on = (method, path, fn) => routes.set(`${method || "GET"} ${path}`, fn);
  let body = {};
  registerDeviceRoutes(on, { isSeatName: () => true, bodyOf: async () => body, switches: switches(true, false) });
  const answer = (path) => new Promise((done) => routes.get(`POST ${path}`)({}, {}, new URL("http://hive"), (said, status = 200) => done({ said, status })));
  body = { name: "reader", where: "local", x: 1, y: 1 };
  for (const path of ["/api/device/open", "/api/device/shot", "/api/device/tap", "/api/device/close"]) {
    const { said, status } = await answer(path);
    assert.equal(status, 403, path);
    assert.equal(said.error, AGENT_DEVICES_OFF, path);
  }
});
