import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const { svConvFlushAll } = await app("conversation-model");
await views();
await state();
const { svEvent } = await app("chat-and-panes");
const { getStructured } = await app("chat-stretches");
const turn = await app("memory-turn");

const HOME = "/Users/ana/.claude/projects/-Users-ana-hub/memory";
const memoryFile = (name, scope = "") => `---\nname: ${name}\ndescription: "sobre ${name}"\nmetadata:\n  type: project\n${scope ? `  scope: ${scope}\n` : ""}---\n\nCorpo.\n`;

let seq = 0;
const settle = () => new Promise((done) => setTimeout(done, 30));

function seat(name, where = "local") {
  const e = getStructured({ name, where, agent: "claude" });
  document.body.appendChild(e.host);
  return e;
}

const say = (e, text) => svEvent(e, { seq: ++seq, type: "user", subtype: "say", cid: `c${seq}`, message: { content: [{ type: "text", text }] } });
const write = (e, id, path, content) => svEvent(e, { seq: ++seq, type: "assistant", message: { content: [{ type: "tool_use", id, name: "Write", input: { file_path: path, content } }] } });
const edit = (e, id, path) => svEvent(e, { seq: ++seq, type: "assistant", message: { content: [{ type: "tool_use", id, name: "Edit", input: { file_path: path, old_string: "a", new_string: "b" } }] } });
const landed = (e, id, text, extra = {}) => svEvent(e, { seq: ++seq, type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content: text, ...extra }] } });
const done = (e) => svEvent(e, { seq: ++seq, type: "result", subtype: "success" });

let posted = [];
function serve(statuses = {}) {
  posted = [];
  globalThis.fetch = async (path, init = {}) => {
    const sent = JSON.parse(init.body || "{}");
    posted.push({ path, body: sent });
    if (path === "/api/memories/mine/status") return { ok: true, status: 200, json: async () => ({ state: "ok", memories: Object.fromEntries(sent.ids.map((id) => [id, statuses[id] || { gone: false }])) }) };
    if (path === "/api/memories/mine/delete") return { ok: true, status: 200, json: async () => ({ state: "ok", entry: "1-a" }) };
    return { ok: true, status: 200, json: async () => ({ state: "ok" }) };
  };
}

const cards = (e) => e.conv.blocks.filter((one) => one.kind === "memturn");

test("only a Write that creates a file inside a memory folder counts, never the index nor an edit", () => {
  assert.deepEqual(turn.memoryWriteOf("Write", { file_path: `${HOME}/deploy.md`, content: memoryFile("deploy", "team") }), { id: "-Users-ana-hub/deploy.md", file: "deploy.md", name: "deploy", description: "sobre deploy", scope: "team" });
  assert.equal(turn.memoryWriteOf("Write", { file_path: `${HOME}/MEMORY.md`, content: "" }), null);
  assert.equal(turn.memoryWriteOf("Edit", { file_path: `${HOME}/deploy.md` }), null);
  assert.equal(turn.memoryWriteOf("Write", { file_path: "/Users/ana/repo/notes.md", content: "" }), null);
  assert.equal(turn.createdByWrite("File created successfully at: /x.md"), true);
  assert.equal(turn.createdByWrite("The file /x.md has been updated successfully."), false);
  assert.equal(turn.createdByWrite("", { type: "create" }), true);
});

test("the memories saved in a turn pile up quietly and come out together when the turn ends", () => {
  const held = turn.freshTurn();
  turn.sawToolUse(held, { type: "tool_use", id: "a", name: "Write", input: { file_path: `${HOME}/a.md`, content: memoryFile("a") } });
  turn.sawToolUse(held, { type: "tool_use", id: "b", name: "Write", input: { file_path: `${HOME}/b.md`, content: memoryFile("b") } });
  turn.sawToolUse(held, { type: "tool_use", id: "c", name: "Write", input: { file_path: `${HOME}/c.md`, content: memoryFile("c") } });
  turn.sawToolResult(held, { type: "tool_result", tool_use_id: "a", content: "File created successfully at: a" });
  turn.sawToolResult(held, { type: "tool_result", tool_use_id: "b", content: "The file b has been updated successfully." });
  turn.sawToolResult(held, { type: "tool_result", tool_use_id: "c", content: "File created successfully at: c", is_error: true });
  assert.deepEqual(turn.endTurn(held).map((one) => one.file), ["a.md"]);
  assert.deepEqual(turn.endTurn(held), [], "the next turn starts empty");
});

test("one card at the end of the turn lists each new memory with its scope, and nothing shows during the turn", async () => {
  serve({ "-Users-ana-hub/b.md": { gone: false, scope: "personal" } });
  const e = seat("mem-turn-one");
  say(e, "lembra disso");
  write(e, "w1", `${HOME}/a.md`, memoryFile("a", "team"));
  landed(e, "w1", "File created successfully at: a.md");
  write(e, "w2", `${HOME}/b.md`, memoryFile("b"));
  landed(e, "w2", "File created successfully at: b.md");
  assert.equal(cards(e).length, 0, "nothing interrupts the turn");
  done(e);
  assert.equal(cards(e).length, 1);
  await settle();
  svConvFlushAll();
  const card = e.host.querySelector(".sv-memturn");
  assert.ok(card);
  assert.match(card.querySelector(".mh").textContent, /2 new memories in this turn/);
  assert.deepEqual([...card.querySelectorAll(".mscope")].map((one) => one.dataset.scope), ["team", "personal"], "the scope comes from the file as it is now");
  assert.deepEqual(posted.find((one) => one.path === "/api/memories/mine/status").body, { ids: ["-Users-ana-hub/a.md", "-Users-ana-hub/b.md"] });
});

test("a turn with no new memory, or only edits, shows no card", () => {
  serve();
  const e = seat("mem-turn-none");
  say(e, "corrige a memória");
  edit(e, "e1", `${HOME}/a.md`);
  landed(e, "e1", "The file has been updated successfully.");
  write(e, "w1", `${HOME}/a.md`, memoryFile("a"));
  landed(e, "w1", "The file a.md has been updated successfully.");
  done(e);
  assert.equal(cards(e).length, 0);
});

test("the card leaves with the next message, which is how ignoring it accepts it", () => {
  serve();
  const e = seat("mem-turn-next");
  say(e, "lembra");
  write(e, "w1", `${HOME}/a.md`, memoryFile("a"));
  landed(e, "w1", "File created successfully at: a.md");
  done(e);
  assert.equal(cards(e).length, 1);
  say(e, "outra coisa");
  assert.equal(cards(e).length, 0);
  assert.equal(posted.filter((one) => one.path !== "/api/memories/mine/status").length, 0, "nothing was written by leaving it alone");
});

test("switching the scope and deleting from the card call the panel's routes, and delete offers undo", async () => {
  serve();
  const e = seat("mem-turn-act");
  say(e, "lembra");
  write(e, "w1", `${HOME}/a.md`, memoryFile("a", "team"));
  landed(e, "w1", "File created successfully at: a.md");
  done(e);
  await settle();
  svConvFlushAll();
  e.host.querySelector(".sv-memturn .mscope").click();
  await settle();
  assert.deepEqual(posted.at(-1), { path: "/api/memories/mine/scope", body: { id: "-Users-ana-hub/a.md", scope: "personal" } });
  e.host.querySelector(".sv-memturn [data-mem-drop]").click();
  await settle();
  assert.deepEqual(posted.at(-1), { path: "/api/memories/mine/delete", body: { id: "-Users-ana-hub/a.md" } });
  svConvFlushAll();
  assert.ok(e.host.querySelector(".sv-memturn .mrow.gone"));
  e.host.querySelector(".sv-memturn [data-mem-undo]").click();
  await settle();
  assert.deepEqual(posted.at(-1), { path: "/api/memories/mine/undo", body: { entry: "1-a" } });
});

test("a memory already deleted by the time the card shows is left out of it", async () => {
  serve({ "-Users-ana-hub/a.md": { gone: true } });
  const e = seat("mem-turn-gone");
  say(e, "lembra");
  write(e, "w1", `${HOME}/a.md`, memoryFile("a"));
  landed(e, "w1", "File created successfully at: a.md");
  done(e);
  await settle();
  assert.equal(cards(e).length, 0);
});

test("a seat on the server shows no card, since its memory folder is not on this machine", () => {
  serve();
  const e = seat("mem-turn-cloud", "cloud");
  say(e, "lembra");
  write(e, "w1", `${HOME}/a.md`, memoryFile("a"));
  landed(e, "w1", "File created successfully at: a.md");
  done(e);
  assert.equal(cards(e).length, 0);
});
