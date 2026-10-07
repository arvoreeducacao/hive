import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as acp from "../engine/kimi-acp.mjs";
import { agents } from "../engine/agents.mjs";
import { seatCommand, seatArgv } from "../engine/seat-command.mjs";

const K2 = "kimi-code/kimi-for-coding", K3 = "kimi-code/k3";
function options(model = K2, effort = "on") {
  return [
    { id: "model", category: "model", currentValue: model, options: [{ value: K2, name: "K2.7 Coding" }, { value: K3, name: "K3" }] },
    { id: "thinking", category: "thought_level", currentValue: effort, options: (model === K3 ? ["low", "high", "max", ...(effort === "on" ? ["on"] : [])] : ["on"]).map((value) => ({ value, name: `Thinking ${value}` })) },
  ];
}

function fakeRpc({ failEffort = false } = {}) {
  let model = K2, effort = "on";
  const calls = [];
  return {
    calls, alive: true, closed: false,
    close() { this.closed = true; },
    async request(method, params) {
      calls.push({ method, params });
      if (method === "initialize" || method === "session/set_mode") return {};
      if (method === "session/set_config_option") {
        if (params.configId === "model") model = params.value;
        if (params.configId === "thinking") {
          if (failEffort) throw new Error("thinking change refused");
          effort = model === K3 && params.value === "on" ? "high" : params.value;
        }
      }
      return { sessionId: "session-test", configOptions: options(model, effort) };
    },
  };
}

test("the catalogue reads thinking per model without prompts or changing the default model", async () => {
  const server = fakeRpc();
  const rows = await agents.kimi.listCatalog({ rpc: async (bin, args, use) => {
    assert.equal(bin, "kimi");
    return use(server.request.bind(server));
  } });
  assert.deepEqual(rows.map((row) => [row.value, row.isDefault, row.efforts.map((level) => level.value)]), [
    [K2, true, ["on"]], [K3, false, ["low", "high", "max", "on"]],
  ]);
  assert.ok(server.calls.every((call) => !call.method.includes("prompt")));
});

test("thinking belongs only to the selected model and unsupported levels are refused", () => {
  const rows = acp.modelsFromConfigOptions(options());
  assert.deepEqual(rows[1].efforts, []);
  assert.throws(() => acp.setEffortParams("s", "max", options()), /does not offer/);
  assert.deepEqual(acp.setEffortParams("s", "max", options(K3)), { sessionId: "s", configId: "thinking", value: "max" });
  assert.equal(acp.currentEffort([]), "");
});

test("a Kimi native seat carries effort on POSIX and Windows, while its TUI has no unsupported flag", () => {
  const seat = { name: "kimi-test", hub: "/hub", stateDir: "/state", agent: "kimi", model: K3, effort: "max", structured: true, driver: "/engine/kimi-driver.mjs" };
  assert.match(seatCommand(seat), /--effort max/);
  const args = seatArgv(seat).args;
  assert.equal(args[args.indexOf("--effort") + 1], "max");
  assert.doesNotMatch(seatCommand({ ...seat, structured: false }), /--effort/);
  assert.ok(!seatArgv({ ...seat, structured: false }).args.includes("--effort"));
});

function driverOpening({ effort = "max", sessionId = "", failEffort = false } = {}) {
  const source = readFileSync(new URL("../engine/kimi-driver.mjs", import.meta.url), "utf8");
  const from = source.indexOf("function takeConfig(result) {");
  const to = source.indexOf("\nfunction dispatchSay(", from);
  assert.ok(from >= 0 && to > from);
  const rpc = fakeRpc({ failEffort }), events = [], saved = [];
  const driver = new Function("acp", "rpc", "initial", "events", "saved", `
    const { modelsFromConfigOptions, currentModel, currentEffort, setEffortParams, acpArgs, initializeParams, loadSessionParams, newSessionParams, setModeParams, setModelParams, resumeFellThrough } = acp;
    let client = null, opening = null, sessionId = initial.sessionId;
    let model = "${K3}", effort = initial.effort, configOptions = [], catalog = [];
    const cwd = "/tmp", childEnv = {}, mcpServers = [], freshEventsFile = true, ctx = {};
    const spawn = () => ({}), createRpcClient = () => rpc;
    const onNotification = () => {}, onRequest = () => {}, onExit = () => {}, onStderr = () => {};
    const emit = (event) => events.push(event), persistSession = (patch) => saved.push(patch);
    const noteTrouble = (message) => events.push({ message });
    const initEvent = () => ({ type: "system", model, effort, session_id: sessionId });
    ${source.slice(from, to)}
    return { open: openAcp, change: (level) => changeEffort(rpc, level) };
  `)(acp, rpc, { effort, sessionId }, events, saved);
  return { ...driver, rpc, events, saved };
}

test("the real driver selects the model before thinking, confirms and persists it before init", async () => {
  const driver = driverOpening();
  await driver.open();
  await driver.open();
  assert.deepEqual(driver.rpc.calls.filter((call) => call.method === "session/set_config_option").map((call) => call.params), [
    { sessionId: "session-test", configId: "model", value: K3 },
    { sessionId: "session-test", configId: "thinking", value: "max" },
  ]);
  assert.equal(driver.events.at(-1).effort, "max");
  assert.equal(driver.saved.at(-1).effort, "max");
  const changed = await driver.change("low");
  assert.equal(changed.effort, "low");
  assert.deepEqual(changed.models.find((row) => row.value === K3).efforts.map((level) => level.value), ["low", "high", "max"]);
  await assert.rejects(driver.change("on"), /does not offer/);
  assert.equal(driver.saved.at(-1).effort, "low");
});

test("restoring a Kimi session reapplies its saved thinking level", async () => {
  const driver = driverOpening({ sessionId: "session-test", effort: "high" });
  await driver.open();
  assert.ok(driver.rpc.calls.some((call) => call.method === "session/load"));
  assert.equal(driver.events.at(-1).effort, "high");
});

test("the driver keeps Kimi's resolved level when on becomes high", async () => {
  const driver = driverOpening({ effort: "on" });
  await driver.open();
  assert.equal(driver.events.at(-1).effort, "high");
  assert.equal(driver.saved.at(-1).effort, "high");
});

test("a rejected thinking selection fails opening instead of pretending it was accepted", async () => {
  const driver = driverOpening({ failEffort: true });
  await assert.rejects(driver.open(), /thinking change refused/);
  assert.ok(driver.rpc.closed);
  assert.ok(!driver.events.some((event) => event.type === "system"));
});
