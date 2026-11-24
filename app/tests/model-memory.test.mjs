import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
await app("arrange");
const memory = await app("model-memory");
const { drafts, newDraft, spawnPayloadOf } = await app("draft-seat");
const { getStructured } = await app("chat-stretches");
const { openSeatPicker, closeSeatPicker, paintPills } = await app("chat-and-panes");
const { paintModelFoot, seatProject } = await app("composer-models");

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

function memoryStore(seed = {}) {
  const box = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return { getItem: (k) => (box.has(k) ? box.get(k) : null), setItem: (k, v) => box.set(k, v), read: (k) => JSON.parse(box.get(k) || "null") };
}

const OPUS = { value: "opus", label: "Opus", resolved: "claude-opus-5-5", efforts: [{ value: "high" }, { value: "max" }], badges: ["fast mode"] };
const SONNET = { value: "sonnet", label: "Sonnet", resolved: "claude-sonnet-5", efforts: [{ value: "high" }], badges: [] };

function quietHive() {
  st.LIMIT = 4;
  st.data = { sessions: [], spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "a", name: "a" }];
  st.space = "a";
  st.blocks = [{ id: "blk0", ws: "a", label: "", manual: false, keys: [] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.accountsAsked = true;
}

test("every pick is remembered per provider, and the traits per model", () => {
  const store = memoryStore({ "hive.draft": { where: "cloud", kind: "terminal" } });
  memory.rememberPick({ agent: "claude", model: "opus" }, store);
  memory.rememberPick({ agent: "claude", model: "opus", effort: "max" }, store);
  memory.rememberPick({ agent: "claude", model: "opus", fast: true }, store);
  memory.rememberPick({ agent: "codex", model: "gpt-6" }, store);
  const kept = store.read("hive.draft");
  assert.equal(kept.where, "cloud", "remembering a model forgot where the chat runs");
  assert.equal(kept.agent, "codex");
  assert.deepEqual(kept.models, { claude: "opus", codex: "gpt-6" });
  assert.deepEqual(memory.rememberedOptions("claude", "opus", store), { effort: "max", fast: true });
  assert.equal(memory.rememberedModel("claude", store), "opus");
  assert.equal(memory.rememberedOptions("claude", "sonnet", store), null);
});

test("a new chat takes the link first, then the project's pin, then the remembered model", () => {
  const kept = { agent: "codex", model: "gpt-6", models: { codex: "gpt-6", claude: "opus" } };
  const ready = (agent) => agent !== "kiro";
  assert.deepEqual(memory.newChatSelection({ kept, ready }), { agent: "codex", model: "gpt-6", from: "remembered" });
  const pin = { agent: "claude", model: "sonnet", effort: "high" };
  assert.deepEqual(memory.newChatSelection({ kept, pin, ready }), { agent: "claude", model: "sonnet", effort: "high", from: "project" });
  assert.deepEqual(memory.newChatSelection({ kept, pin, link: { agent: "codex", model: "gpt-7" }, ready }), { agent: "codex", model: "gpt-7", from: "link" });
  assert.deepEqual(memory.newChatSelection({ kept, pin: { agent: "kiro", model: "x" }, ready }).agent, "codex", "a pin on a provider that is not set up is skipped");
});

test("a project pin is kept by project name, whatever the case, and comes off", () => {
  const store = memoryStore();
  memory.pinProject("API-Acme", { agent: "claude", model: "opus", fast: true }, store);
  assert.deepEqual(memory.projectPinOf("api-acme", store), { agent: "claude", model: "opus", fast: true });
  memory.unpinProject("api-acme", store);
  assert.equal(memory.projectPinOf("api-acme", store), null);
  assert.equal(memory.projectPinOf("", store), null);
});

test("a custom model is added with the same checks, and a built-in one can only be renamed", () => {
  const rows = [OPUS, SONNET];
  const say = (slug, name = "", customs = []) => memory.checkCustomModel({ slug, name, rows, customs });
  assert.equal(say("  ").error, "empty");
  assert.equal(say("x".repeat(memory.CUSTOM_MODEL_MAX + 1)).error, "tooLong");
  assert.equal(say("bad model$").error, "shape");
  assert.equal(say("opus").error, "builtIn");
  assert.equal(say("opus", "Opus").error, "builtIn", "the same name is not a rename");
  assert.deepEqual(say("opus", "The big one"), { error: "", entry: { slug: "opus", name: "The big one" }, rename: true });
  assert.deepEqual(say("claude-opus-5-5", "By id"), { error: "", entry: { slug: "claude-opus-5-5", name: "By id" }, rename: true });
  assert.equal(say("mine", "", [{ slug: "mine", name: "" }]).error, "saved");
  assert.deepEqual(say("anthropic/claude-x[1m]"), { error: "", entry: { slug: "anthropic/claude-x[1m]", name: "" }, rename: false });
  assert.equal(memory.customModelErrorText("builtIn"), "That model is already built in.");
});

test("custom models join the list with a badge, and a rename only changes the name shown", () => {
  const dressed = memory.withCustomModels([OPUS, SONNET], [{ slug: "opus", name: "The big one" }, { slug: "local-llama", name: "" }]);
  assert.equal(dressed.length, 3);
  assert.equal(dressed[0].label, "The big one");
  assert.equal(dressed[0].value, "opus");
  assert.equal(OPUS.label, "Opus", "the catalogue the driver sent was changed in place");
  assert.deepEqual(dressed[2], { value: "local-llama", label: "local-llama", description: "", context: "", group: "", resolved: "", isDefault: false, efforts: [], defaultEffort: "", badges: ["custom"], custom: true });
  const store = memoryStore();
  memory.saveCustomModel("claude", { slug: "local-llama", name: "Llama" }, store);
  assert.deepEqual(memory.customModelsOf("claude", store), [{ slug: "local-llama", name: "Llama" }]);
  assert.equal(memory.removeCustomModel("claude", "local-llama", store), true);
  assert.deepEqual(memory.customModelsOf("claude", store), []);
});

test("a new chat starts on the model pinned for the project of the chat in focus", () => {
  quietHive();
  localStorage.setItem("hive.projectModels", JSON.stringify({ "api-acme": { agent: "claude", model: "sonnet", effort: "high", fast: false } }));
  localStorage.setItem("hive.draft", JSON.stringify({ agent: "claude", model: "opus", models: { claude: "opus" } }));
  st.data.sessions = [{ name: "api-work", where: "local", trees: [{ repo: "api-acme", path: "/hub/api-acme" }], cwd: "/hub" }];
  st.open = "api-work";
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [OPUS, SONNET] }) });
  const pinned = newDraft();
  assert.equal(pinned.e.project, "api-acme");
  assert.equal(pinned.e.model, "sonnet");
  assert.equal(pinned.e.effort, "high");
  st.open = null;
  st.data.sessions = [];
  const plain = newDraft();
  assert.equal(plain.e.model, "opus", "without a project the remembered model is used");
  drafts.clear();
  localStorage.removeItem("hive.projectModels");
  localStorage.removeItem("hive.draft");
});

test("a draft on Claude carries fast mode to the seat it opens; a terminal draft does not", () => {
  const d = { where: "local", kind: "structured", e: { agent: "claude", model: "opus", account: "", fast: true } };
  assert.equal(spawnPayloadOf(d, "go").fast, true);
  assert.equal("fast" in spawnPayloadOf({ ...d, kind: "terminal" }, "go"), false);
  assert.equal("fast" in spawnPayloadOf({ ...d, e: { ...d.e, agent: "codex" } }, "go"), false);
});

test("the model picker offers Standard and Fast only for a model that has fast mode, and a pick lands on the pill", async () => {
  const e = getStructured({ name: "fast-seat", where: "local" });
  document.body.appendChild(e.host);
  e.agent = "claude";
  e.model = "opus";
  e.catalog = [OPUS, SONNET];
  const sent = [];
  e.ws = { readyState: 1, send: (line) => {
    const cmd = JSON.parse(line);
    sent.push(cmd);
    const data = cmd.op === "catalog" || cmd.op === "models" ? { models: [OPUS, SONNET] } : { fast: cmd.on === true };
    queueMicrotask(() => e.pending.get(cmd.cid)?.({ ok: true, data }));
  } };
  openSeatPicker(e, "model");
  const foot = e.host.querySelector(".sv-menu .cp-pick-foot");
  assert.ok(foot, "the picker has no footer");
  const speed = foot.querySelector(".cp-speed");
  assert.equal(speed?.getAttribute("aria-label"), "Fast Mode");
  speed.querySelector('[data-fast="1"]').click();
  await new Promise((later) => setTimeout(later, 10));
  assert.deepEqual(sent.filter((cmd) => cmd.op === "setFast").map((cmd) => cmd.on), [true]);
  assert.equal(e.fast, true);
  assert.ok(e.host.querySelector(".sv-pill-model .cp-fast"), "the pill shows no bolt while fast mode is on");
  e.model = "sonnet";
  paintPills(e);
  assert.equal(e.host.querySelector(".sv-pill-model .cp-fast"), null, "a model without fast mode still shows the bolt");
  paintModelFoot(e, e.host.querySelector(".sv-menu"), { kind: "model" });
  assert.equal(e.host.querySelector(".sv-menu .cp-speed"), null, "a model without fast mode still offers the speed");
  closeSeatPicker(e);
  e.host.remove();
});

test("the picker adds a custom model that the list then shows, and refuses a duplicate out loud", () => {
  localStorage.removeItem("hive.customModels");
  const e = getStructured({ name: "custom-seat", where: "local" });
  document.body.appendChild(e.host);
  e.agent = "claude";
  e.model = "opus";
  e.catalog = [OPUS, SONNET];
  e.catalogRaw = [OPUS, SONNET];
  openSeatPicker(e, "model");
  const menu = e.host.querySelector(".sv-menu");
  menu.querySelector(".cp-custom-add").click();
  const slug = menu.querySelector(".cp-custom-slug");
  assert.ok(slug, "no field for the slug");
  slug.value = "opus";
  menu.querySelector(".cp-custom-go").click();
  assert.match(menu.querySelector(".cp-custom-error")?.textContent || "", /already built in/);
  menu.querySelector(".cp-custom-slug").value = "claude-next";
  menu.querySelector(".cp-custom-go").click();
  assert.ok(e.catalog.some((row) => row.value === "claude-next" && row.custom), "the custom model did not join the list");
  assert.deepEqual(JSON.parse(localStorage.getItem("hive.customModels")).claude, [{ slug: "claude-next", name: "" }]);
  closeSeatPicker(e);
  e.host.remove();
  localStorage.removeItem("hive.customModels");
});

test("the pin in the picker keeps this chat's model for new chats in its project", () => {
  localStorage.removeItem("hive.projectModels");
  st.data = { sessions: [{ name: "pin-seat", where: "local", trees: [{ repo: "wiki", path: "/hub/wiki" }] }] };
  const e = getStructured({ name: "pin-seat", where: "local" });
  document.body.appendChild(e.host);
  e.agent = "claude";
  e.model = "opus";
  e.catalog = [OPUS, SONNET];
  assert.equal(seatProject(e), "wiki");
  openSeatPicker(e, "model");
  const pin = e.host.querySelector(".sv-menu .cp-pin");
  assert.equal(pin.getAttribute("aria-label"), "New chats in wiki", "the pin is an icon that names its project in the tooltip");
  pin.click();
  assert.deepEqual(memory.projectPinOf("wiki"), { agent: "claude", model: "opus", fast: false });
  assert.equal(e.host.querySelector(".sv-menu .cp-pin").getAttribute("aria-pressed"), "true");
  e.host.querySelector(".sv-menu .cp-pin").click();
  assert.equal(memory.projectPinOf("wiki"), null);
  closeSeatPicker(e);
  e.host.remove();
});
