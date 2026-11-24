import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");

const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const asked = [];
let holdRetitle = null;
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init = {}) => {
  if (String(url).includes("/api/retitle")) {
    asked.push(JSON.parse(init.body));
    return new Promise((done) => { holdRetitle = () => done(answered({ ok: true, title: "a fresh title" })); });
  }
  if (String(url).includes("/api/hive")) return Promise.resolve(answered(JSON.parse(JSON.stringify(st.data))));
  return Promise.resolve(answered({ sessions: [], ok: true }));
};
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
const { $, ACTIONS, ACTION_SAID, CTRL_KEYS, DEFAULT_CHORDS, DEFAULT_KEYS, MAC_KEYS, phrase } = await app("core");
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { tiles } = await app("leader-key");
const { retitle, retitlingNow } = await app("chat-name");
const { seatMenuCommands, seatMenuRows } = await app("seat-menu");
const { run } = await app("themes");
const { setStructure } = await app("structure");
const { paintRail, railViewModel } = await app("mirror");
await import(new URL("../src/structures/island.js", import.meta.url).href);
await import(new URL("../src/structures/inbox.js", import.meta.url).href);

bootSolid();

const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((done) => setTimeout(done, 5)); };

const seat = (name, extra = {}) => ({ name, title: `title of ${name}`, where: "local", state: "idle", kind: "chat", ...extra });

function lay(sessions) {
  st.LIMIT = 4;
  st.calmOn = false;
  st.data = { sessions, spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: sessions.map((one) => one.name) }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.seatLayout = "grid";
  st.planeOn = false;
  st.mirrorDev = "";
  st.threadChat = null;
  st.reviewChat = null;
  st.webChat = null;
  st.cockChat = null;
  st.deviceChat = null;
  st.threads = [];
  st.prs = [];
  st.retitlingAsked.clear();
  render();
}

const raycast = (on) => {
  document.body.classList.toggle("experience-raycast", on);
  document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: on ? "raycast" : "current", was: on ? "current" : "raycast" } }));
};

test("regenerating the title is a keymap action with no key and no chord out of the box", () => {
  assert.ok(ACTIONS.some(([action]) => action === "retitle"));
  assert.equal(DEFAULT_KEYS.retitle, null);
  assert.equal(MAC_KEYS.retitle, undefined);
  assert.equal(CTRL_KEYS.retitle, undefined);
  assert.equal(DEFAULT_CHORDS.retitle, undefined);
  assert.match(ACTION_SAID.retitle, /^regenerate the title of the focused chat/);
});

test("the seat menu offers to regenerate the title, in both looks, and the palette lists it by the seat", () => {
  lay([seat("a")]);
  raycast(false);
  const plain = seatMenuRows(st.data.sessions[0]);
  const row = plain.find((one) => one.label === "regenerate title");
  assert.ok(row, "the classic menu has the row");
  assert.equal(row.off, false);
  assert.equal(row.note, "", "no key yet, so no key is shown");
  assert.equal(plain.indexOf(row), plain.findIndex((one) => one.label === "rename…") + 1, "it sits right under rename");
  raycast(true);
  const rows = seatMenuRows(st.data.sessions[0]);
  assert.ok(rows.find((one) => one.label === "regenerate title" && one.icon === "i-reload"));
  assert.ok(seatMenuCommands(st.data.sessions[0]).some((one) => one.label === "regenerate title"), "the palette's seat actions carry it too");
  assert.equal(seatMenuRows(seat("anon", { anon: true })).some((one) => one.label === "regenerate title"), false, "an anonymous chat keeps no title to regenerate");
  raycast(false);
});

test("while the server says it is regenerating, the row waits and the title glimmers", () => {
  lay([seat("a", { retitling: true })]);
  const row = seatMenuRows(st.data.sessions[0]).find((one) => one.label === "regenerating…");
  assert.ok(row);
  assert.equal(row.off, true);
  const name = tiles.get("a").querySelector(".t-name");
  assert.ok(name.classList.contains("title-regenerating"));
  assert.equal(name.getAttribute("aria-busy"), "true");
  assert.equal(name.textContent, "title of a", "the old title stays readable under the glimmer");
  lay([seat("a")]);
  assert.equal(tiles.get("a").querySelector(".t-name").classList.contains("title-regenerating"), false);
  assert.equal(tiles.get("a").querySelector(".t-name").hasAttribute("aria-busy"), false);
});

test("the shortcut regenerates the focused chat once, glimmers at once, and a second press waits", async () => {
  lay([seat("a"), seat("b")]);
  asked.length = 0;
  st.focus = 1;
  run("retitle");
  await settle();
  assert.deepEqual(asked, [{ name: "b", where: "local" }]);
  assert.ok(retitlingNow(st.data.sessions[1]), "the app marks it before the server answers");
  assert.ok(tiles.get("b").querySelector(".t-name").classList.contains("title-regenerating"));
  run("retitle");
  assert.equal(await retitle(st.data.sessions[1]), false);
  await settle();
  assert.equal(asked.length, 1, "no second request while the first one runs");
  assert.equal(seatMenuRows(st.data.sessions[1]).find((one) => one.label === "regenerating…")?.off, true);
  holdRetitle();
  await settle();
  assert.equal(retitlingNow(st.data.sessions[1]), false);
  assert.equal(tiles.get("b").querySelector(".t-name").classList.contains("title-regenerating"), false);
});

test("the shortcut does nothing while the server is already regenerating, or with no chat in focus", async () => {
  lay([seat("a", { retitling: true })]);
  asked.length = 0;
  run("retitle");
  await settle();
  assert.deepEqual(asked, []);
  st.data.sessions = [];
  st.blocks[0].keys = [];
  st.focus = 0;
  run("retitle");
  await settle();
  assert.deepEqual(asked, []);
});

test("the island's chat header glimmers while its title regenerates", () => {
  raycast(true);
  lay([seat("a", { retitling: true }), seat("b")]);
  setStructure("island", { quiet: true });
  const title = $("structure-root").querySelector(".il-title");
  assert.ok(title.classList.contains("title-regenerating"));
  assert.equal(title.getAttribute("aria-busy"), "true");
  lay([seat("a"), seat("b")]);
  assert.equal($("structure-root").querySelector(".il-title").classList.contains("title-regenerating"), false);
  setStructure("classic", { quiet: true });
  raycast(false);
});

test("the inbox's chat header glimmers while its title regenerates", async () => {
  raycast(true);
  lay([seat("a", { retitling: true })]);
  setStructure("inbox", { quiet: true });
  await settle();
  render();
  const crumb = $("structure-root").querySelector(".tx-crumb-title");
  assert.ok(crumb, "the inbox paints the reading header");
  assert.ok(crumb.querySelector(".title-regenerating"), "the title inside the crumb glimmers");
  assert.equal(crumb.getAttribute("aria-busy"), "true");
  lay([seat("a")]);
  await settle();
  render();
  assert.equal($("structure-root").querySelector(".tx-crumb-title .title-regenerating"), null);
  setStructure("classic", { quiet: true });
  raycast(false);
});

const railName = (name) => $("rail").querySelector(`.item[data-name="${name}"] .name`);

test("the rail row of a chat glimmers while its title regenerates, in both looks", async () => {
  raycast(false);
  lay([seat("a", { retitling: true }), seat("b")]);
  paintRail();
  await settle();
  const items = railViewModel().groups.flatMap((group) => group.items || []);
  assert.equal(items.find((one) => one.name === "a")?.regenerating, true);
  assert.equal(items.find((one) => one.name === "b")?.regenerating, false);
  assert.ok(railName("a").classList.contains("title-regenerating"), "the classic rail row glimmers");
  assert.equal(railName("a").getAttribute("aria-busy"), "true");
  assert.equal(railName("a").textContent, "title of a");
  assert.equal(railName("b").classList.contains("title-regenerating"), false);
  assert.equal(railName("b").hasAttribute("aria-busy"), false);
  raycast(true);
  lay([seat("a"), seat("b")]);
  st.retitlingAsked.add("b");
  paintRail();
  await settle();
  assert.ok(railName("b").classList.contains("title-regenerating"), "the raycast rail row glimmers from the moment it is asked");
  assert.equal(railName("b").getAttribute("aria-busy"), "true");
  assert.equal(railName("a").classList.contains("title-regenerating"), false);
  st.retitlingAsked.delete("b");
  paintRail();
  await settle();
  assert.equal(railName("b").classList.contains("title-regenerating"), false);
  raycast(false);
});

test("the inbox row of a chat glimmers while its title regenerates", async () => {
  raycast(true);
  lay([seat("a"), seat("b", { retitling: true })]);
  setStructure("inbox", { quiet: true });
  await settle();
  render();
  const title = (key) => $("structure-root").querySelector(`.tx-row[data-key="${key}"] .tx-title`);
  assert.ok(title("b"), "the inbox lists the chat");
  assert.ok(title("b").classList.contains("title-regenerating"));
  assert.equal(title("b").getAttribute("aria-busy"), "true");
  assert.equal(title("b").textContent, "title of b");
  assert.equal(title("a").classList.contains("title-regenerating"), false);
  lay([seat("a"), seat("b")]);
  await settle();
  render();
  assert.equal(title("b").classList.contains("title-regenerating"), false);
  assert.equal(title("b").hasAttribute("aria-busy"), false);
  setStructure("classic", { quiet: true });
  raycast(false);
});

test("the glimmer sweeps across the title, and stands still for reduced motion", () => {
  assert.match(page, /\.title-regenerating \{[^}]*background-clip: text;[^}]*animation: title-glimmer 2\.2s steps\(30\) infinite;/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\), \(forced-colors: active\) \{ \.title-regenerating, body\.no-motion \.title-regenerating \{ animation: none !important;/);
  assert.equal(phrase("regenerate title"), "regenerate title");
});
