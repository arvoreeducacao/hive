import { test } from "node:test";
import assert from "node:assert/strict";
import { app, views } from "./dom.mjs";

await views();

const { drafts, newDraft, sendDraft } = await app("draft-seat");
const { st } = await app("core");
const { structPool } = await app("structured-seats");

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

function wire(answers) {
  const asked = [];
  globalThis.fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    asked.push({ url, body });
    const said = answers[url] ?? { ok: true };
    return { ok: true, json: async () => (typeof said === "function" ? said(body) : said) };
  };
  return asked;
}

function bench(answers = {}) {
  const asked = wire({ "/api/catalog?agent=claude": { ok: true, data: { models: [] } }, ...answers });
  const d = newDraft();
  document.body.appendChild(d.e.host);
  return { d, asked, box: d.e.host.querySelector("textarea"), suggest: d.e.host.querySelector(".sv-suggest") };
}

const shut = (b) => { b.d.e.host.remove(); drafts.delete(b.d.id); };

const type = (box, text) => {
  box.value = text;
  box.setSelectionRange(text.length, text.length);
  box.dispatchEvent(new Event("input", { bubbles: true }));
};

const press = (box, key, extra = {}) => {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra });
  box.dispatchEvent(ev);
  return ev;
};

const rows = (b) => [...b.suggest.querySelectorAll(".sg .val")].map((el) => el.textContent);

const fleet = [
  { name: "o-doutor", where: "local", state: "idle", model: "opus", title: "o doutor", now: "", structured: true },
  { name: "a-estante", where: "local", state: "working", model: "", title: "a estante", now: "publicando", structured: true }
];

const team = { me: "jonas", sharing: true, machines: false, devs: [
  { dev: "renato", up: true, sharing: true, seats: ["x"] },
  { dev: "rafael", up: false, sharing: false, seats: [] }
] };

test("a person's name offers itself in an empty chat, and enter picks it instead of opening the chat", () => {
  st.team = team;
  const b = bench();
  type(b.box, "fala com ~r");
  assert.deepEqual(rows(b), ["renato", "rafael"], "everyone on the team who is not me, the one with the hive open first");
  assert.equal(b.suggest.hidden, false);
  const enter = press(b.box, "Enter");
  assert.ok(enter.defaultPrevented);
  assert.equal(b.box.value, "fala com ~renato ");
  assert.equal(b.suggest.hidden, true);
  assert.ok(!b.asked.some((one) => one.url === "/api/spawn"), "enter on an open menu must not open the chat");
  shut(b);
});

test("another chat offers itself by name, and the first message carries its handle like a running chat would", async () => {
  st.team = team;
  st.data = { ...st.data, sessions: fleet };
  const b = bench({ "/api/spawn": { ok: false, error: "stop here" } });
  type(b.box, "olha o #o-d");
  assert.deepEqual(rows(b), ["o doutor"], "the row offers the name the chat goes by on the rail, with its handle beside it");
  press(b.box, "ArrowDown");
  press(b.box, "Tab");
  assert.equal(b.box.value, "olha o #o-doutor ");
  await sendDraft(b.d, b.box.value);
  const spawn = b.asked.find((one) => one.url === "/api/spawn");
  assert.ok(spawn, "the draft never asked for a seat");
  assert.match(spawn.body.prompt, /^\[hive\] peer: o-doutor · local · opus/);
  assert.ok(spawn.body.prompt.endsWith("olha o #o-doutor"));
  assert.doesNotMatch(spawn.body.prompt, /\[hive\] you are:/, "the seat has no name yet, so it cannot be told one");
  assert.equal(b.d.said, "olha o #o-doutor", "the tile shows what the person wrote, not the handle");
  shut(b);
});

test("a chat on the other side is refused before the seat opens, the way a running chat refuses it", async () => {
  st.team = team;
  st.data = { ...st.data, sessions: fleet };
  const b = bench({ "/api/spawn": { ok: false, error: "stop here" } });
  b.d.where = "cloud";
  b.d.e.where = "cloud";
  await sendDraft(b.d, "pergunta pro #o-doutor");
  assert.match(b.d.error, /cannot reach each other/);
  assert.ok(!b.asked.some((one) => one.url === "/api/spawn"), "a promise nobody can keep does not open a chat");
  shut(b);
});

test("a file is looked up in the hub, since the chat has no directory of its own yet", async () => {
  const b = bench({
    "/api/index?where=local&q=serv&limit=20": { files: [
      { repo: "dev-workspaces", name: "dev-workspaces", branch: "main", path: "app/server.mjs" },
      { repo: "leaf", name: "leaf", branch: "main", path: "src/server.ts" }
    ] }
  });
  type(b.box, "abre @serv");
  assert.equal(b.suggest.hidden, false, "the menu opens at once and says it is searching");
  await new Promise((again) => setTimeout(again, 220));
  assert.deepEqual(rows(b), ["dev-workspaces/app/server.mjs", "leaf/src/server.ts"]);
  press(b.box, "Tab");
  assert.equal(b.box.value, "abre @dev-workspaces/app/server.mjs ");
  shut(b);
});

test("the command list is borrowed from a chat of the same kind that is already open", () => {
  structPool.set("vivo", { name: "vivo", agent: "claude", slash: ["commit", "hive:publish"], slashInfo: { commit: { description: "commit the work", argumentHint: "" } } });
  const b = bench();
  type(b.box, "/com");
  assert.deepEqual(rows(b), ["commit"]);
  assert.equal(b.suggest.querySelector(".sg .desc")?.textContent, "commit the work", "the borrowed list brings its descriptions along");
  press(b.box, "Enter");
  assert.equal(b.box.value, "/commit ");
  structPool.delete("vivo");
  type(b.box, "/");
  assert.match(b.suggest.querySelector(".none")?.textContent || "", /already open/, "with no chat open, the box says where the list would come from");
  shut(b);
});
