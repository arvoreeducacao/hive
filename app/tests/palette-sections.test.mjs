import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";

const st = await state();
await views();
const core = await app("core");
const { $, ACTIONS, phrase } = core;
const { closePal, openPal, palAsk, palKeys, palModel, palPaint, palRun, setPalMode } = await app("palette");
const { closeHelp } = await app("themes");

const turn = (on) => {
  const was = document.body.classList.contains("experience-raycast");
  document.body.classList.toggle("experience-raycast", on);
  document.dispatchEvent(new dom.CustomEvent("hive:experience", { detail: { experience: on ? "raycast" : "current", was: was ? "raycast" : "current" } }));
};

const HOUR = 60 * 60 * 1000;
const iso = (ago) => new Date(Date.now() - ago).toISOString();

function hive() {
  localStorage.removeItem("hive.paletteOpens");
  st.data = {
    pod: { up: false, name: "" },
    archived: [],
    spawning: [],
    sessions: [
      { name: "funil", title: "Etapa nova no funil", where: "local", agent: "claude", state: "ready", cwd: "/w/sales", trees: [{ repo: "lead-engine", branch: "2601-etapa-nova", path: "/w/sales" }], finish: { at: iso(HOUR) } },
      { name: "retry", title: "Retry da cadência no WhatsApp", where: "local", agent: "codex", state: "needs", cwd: "/w/sales", trees: [{ repo: "lead-engine", branch: "812-retry-cadencia", path: "/w/sales-retry" }], finish: { at: iso(2 * HOUR) } },
      { name: "orq", title: "Orquestrador", where: "cloud", agent: "claude", state: "working", cwd: "/workspace/hub", turnSince: iso(3 * HOUR) }
    ]
  };
  st.prs = [{ key: "sdr#2648", session: "retry", repo: "acme/lead-engine", number: 2648, title: "fix: retry da cadência", url: "https://github.com/acme/lead-engine/pull/2648", state: "open" }];
  st.spaces = [{ id: "w0", name: "sales", tint: "#000" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: ["funil", "retry", "orq"] }];
  st.block = 0;
  st.focus = 0;
  st.open = "";
  st.palMode = "";
  st.palMessages = { q: "", rows: [], loading: false, error: "" };
  st.alerts = { items: [], count: 0 };
  st.seatsKnown = true;
}

const sections = (rows) => rows.filter((r) => r.sec).map((r) => r.sec);
const under = (rows, sec) => {
  const at = rows.findIndex((r) => r.sec === sec);
  if (at < 0) return [];
  const end = rows.findIndex((r, i) => i > at && r.sec);
  return rows.slice(at + 1, end < 0 ? rows.length : end);
};

for (const raycast of [false, true]) {
  const look = raycast ? "the default look" : "the experimental look";

  test(`with nothing typed the palette shows the actions and the recent chats, the current one left out (${look})`, () => {
    turn(raycast);
    hive();
    try {
      const rows = palModel("");
      assert.deepEqual(sections(rows), [phrase("actions"), phrase("recent chats")]);
      const actions = under(rows, phrase("actions")).map((r) => r.id);
      assert.deepEqual(actions, ["root:new", "mode:file", "mode:code", "root:find", "root:theme", "root:prs", "root:usage", "root:settings"]);
      const recent = under(rows, phrase("recent chats"));
      assert.deepEqual(recent.map((r) => r.id), ["seat:retry", "seat:orq"]);
      assert.equal(recent[0].ctx, "lead-engine · 812-retry-cadencia · #2648");
      assert.match(recent[1].ctx, new RegExp(phrase("cloud")));
    } finally { turn(false); }
  });

  test(`typing finds a chat by its words without the accents, marks the current one and keeps the hive's own finds (${look})`, () => {
    turn(raycast);
    hive();
    try {
      const rows = palModel("cadencia");
      const chats = under(rows, phrase("chats"));
      assert.equal(chats[0].id, "seat:retry");
      assert.equal(under(palModel("2648"), phrase("chats"))[0].id, "seat:retry");
      assert.equal(under(palModel("2601"), phrase("chats"))[0].id, "seat:funil");
      const funil = under(palModel("funil"), phrase("chats"))[0];
      assert.equal(funil.current, true);
      assert.equal(under(palModel("cadencia"), phrase("chats"))[0].current, false);
      assert.ok(under(palModel("bloco 1"), phrase("blocks")).length || under(palModel("block 1"), phrase("blocks")).length, "the blocks are still searchable");
      assert.ok(under(palModel("workspace"), phrase("workspaces")).length, "so are the workspaces");
      assert.ok(under(palModel("fix retry"), phrase("pull requests")).length, "and the pull requests");
    } finally { turn(false); }
  });

  test(`a leading > lists only actions, ranked (${look})`, () => {
    turn(raycast);
    hive();
    try {
      const rows = palModel("> theme");
      assert.deepEqual(sections(rows), [phrase("actions")]);
      assert.ok(under(rows, phrase("actions")).some((r) => r.id === "root:theme"));
    } finally { turn(false); }
  });
}

test("every action of the key map is found by typing, a new one included, with no list to update", () => {
  hive();
  ACTIONS.push(["retitleProbe", "regenerate the probe title"]);
  try {
    const found = under(palModel("regenerate the probe"), phrase("actions"));
    assert.ok(found.some((r) => r.id === "key:retitleProbe"), "a key-map action with no key still answers");
    const scroll = under(palModel("scroll the focused chat up"), phrase("actions"));
    assert.ok(scroll.some((r) => r.id === "key:scrollUp"));
    const dupes = under(palModel("new chat"), phrase("actions")).filter((r) => r.action === "new");
    assert.equal(dupes.length, 1, "an action already listed is not listed twice");
  } finally { ACTIONS.pop(); }
});

test("a setting is found by its name and opens its own section", async () => {
  hive();
  const rows = palModel("chat line height");
  const found = under(rows, phrase("settings"));
  const row = found.find((r) => /chat line height/i.test(r.name));
  assert.ok(row, "the row of the setting answers");
  assert.equal(row.ctx, phrase("Settings · {section}", { section: "Look" }));
  const section = under(palModel("look"), phrase("settings")).find((r) => r.id === "set:look");
  assert.equal(section.name, phrase("Settings · {section}", { section: "Look" }));
  try {
    row.go();
    assert.ok($("help").classList.contains("on"));
    assert.equal($("pref-body").querySelector('.pref-pane[data-pane="look"]').hidden, false);
    await new Promise((done) => requestAnimationFrame(done));
    assert.ok(document.activeElement === $("f-chat-line"), "the field of the setting takes the focus");
  } finally { closeHelp(); }
});

test("change theme opens the themes with the current one marked, and picking one wears it", () => {
  hive();
  const was = st.themeName;
  openPal();
  try {
    const at = st.palRows.filter((r) => !r.sec).findIndex((r) => r.id === "root:theme");
    palRun(at);
    assert.equal(st.palMode, "theme");
    assert.equal($("pal").hidden, false, "the palette stays open on the themes");
    const themes = st.palRows.filter((r) => !r.sec);
    const worn = themes.filter((r) => r.tag === phrase("current"));
    assert.equal(worn.length, 1);
    assert.ok(themes.every((r) => r.swatches.length === 3));
    const other = themes.find((r) => !r.tag);
    palRun(themes.indexOf(other));
    assert.equal(st.themeName, other.id.slice("theme:".length));
    assert.equal($("pal").hidden, true);
    openPal();
    setPalMode("theme");
    palKeys(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    assert.equal(st.palMode, "", "esc goes back to every result");
  } finally {
    closePal();
    st.themeName = was;
  }
});

test("a chat that says the words in a message is listed apart, unless its title already answered", () => {
  hive();
  st.palMessages = { q: "cadencia worker", loading: false, error: "", rows: [
    { name: "orq", role: "assistant", at: iso(HOUR), snippet: "… o worker da cadência caiu …", text: "o worker da cadência caiu na DLQ" },
    { name: "gone", role: "user", at: iso(HOUR), snippet: "… worker cadência …", text: "worker cadência" }
  ] };
  const rows = palModel("cadencia worker");
  const said = under(rows, phrase("in messages"));
  assert.deepEqual(said.map((r) => r.id), ["msg:orq"]);
  assert.equal(said[0].name, "Orquestrador");
  assert.deepEqual(said[0].ctxWords, ["cadencia", "worker"]);
  st.palMessages = { ...st.palMessages, q: "cadencia", rows: [{ name: "retry", role: "user", at: iso(HOUR), snippet: "cadência", text: "cadência" }] };
  assert.equal(under(palModel("cadencia"), phrase("in messages")).length, 0, "a chat its title found is not listed twice");
});

test("the painted rows mark the typed words even where the accent differs, and nothing found says so", () => {
  hive();
  openPal();
  try {
    $("pal-q").value = "cadencia";
    palPaint();
    assert.match($("pal-list").innerHTML, /<mark>cadência<\/mark>/);
    $("pal-q").value = "funil";
    palPaint();
    assert.equal($("pal-list").querySelector(".pal-current")?.textContent, phrase("current"), "the open chat says it is the current one");
    $("pal-q").value = "zzzz qqqq";
    palPaint();
    assert.equal($("pal-list").textContent.trim(), phrase("No results"));
  } finally { closePal(); }
});

test("picking a chat counts as an open of it, so the chat you open climbs", () => {
  hive();
  openPal();
  try {
    $("pal-q").value = "funil";
    palPaint();
    const at = st.palRows.filter((r) => !r.sec).findIndex((r) => r.id === "seat:funil");
    palRun(at);
    const opens = JSON.parse(localStorage.getItem("hive.paletteOpens"));
    assert.equal(opens.funil.score, 1);
    assert.equal(opens.funil.picks[0].query, "funil");
  } finally { closePal(); }
});

test("the words typed with capitals still find the messages, because the search and the list agree on the query", async () => {
  hive();
  const was = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return { json: async () => ({ query: "x", matches: [{ name: "orq", role: "assistant", at: iso(HOUR), snippet: "o worker da cadência", text: "o worker da cadência" }] }) };
  };
  openPal();
  try {
    $("pal-q").value = "Worker";
    palAsk(true);
    await new Promise((done) => setTimeout(done, 30));
    assert.match(asked[0], /\/api\/chat\/messages\/search\?q=worker&names=funil%2Cretry/);
    assert.ok(!asked[0].includes("orq"), "a chat on the server is not searched here");
    assert.deepEqual(under(st.palRows, phrase("in messages")).map((r) => r.id), ["msg:orq"]);
  } finally {
    closePal();
    globalThis.fetch = was;
  }
});
