import { after, test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const finds = [];
const realFetch = globalThis.fetch;
const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
globalThis.fetch = (url, init) => {
  if (String(url).includes("/api/seats/find")) {
    finds.push(String(url));
    return Promise.resolve(answered({ q: "webhook", found: [{ name: "c", who: "agent", text: "o webhook da cadência devolve 503" }] }));
  }
  if (String(url).includes("/api/inbox/marks")) return Promise.resolve(answered({ ok: true, taken: [], settled: [], marks: {} }));
  return Promise.resolve(answered({ sessions: [] }));
};
window.hiveLink = { open: () => ({ send() {}, close() {} }) };
after(() => { globalThis.fetch = realFetch; });

const st = await state();
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const mirror = await app("mirror");
const marks = await app("seat-marks");
const selection = await app("seat-selection");
const { keepDraft } = await app("kept-drafts");
const { hasDraft } = await app("draft-marks");

bootSolid();
document.body.classList.add("experience-raycast");
document.dispatchEvent(new CustomEvent("hive:experience", { detail: { experience: "raycast", was: "current" } }));

const seat = (name, extra = {}) => ({ name, title: `chat ${name}`, where: "local", state: "idle", kind: "chat", ...extra });

function lay(rules = {}) {
  st.LIMIT = 4;
  st.calmOn = false;
  st.team = { me: "jonas", devs: [] };
  st.data = {
    sessions: [
      seat("a", { trees: [{ repo: "api-acme", branch: "jonas/lote" }] }),
      seat("b", { state: "working", turnSince: new Date().toISOString(), trees: [{ repo: "api-acme" }] }),
      seat("c", { trees: [{ repo: "lead-engine" }] }),
      seat("d", { state: "needs", trees: [{ repo: "lead-engine" }] })
    ],
    spawning: [], archived: [], pod: { up: false, name: "" }, marks: {}, hub: "/hub"
  };
  st.prs = [{ session: "a", repo: "o/r", number: 812, title: "lote consignado", state: "open", url: "https://github.com/o/r/pull/812", key: "o/r#812" }];
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = [{ id: "b0", ws: "w0", label: "", manual: true, keys: ["a", "b", "c", "d"] }];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.seatsKnown = true;
  st.planeOn = false;
  st.mirrorDev = "";
  st.railQuery = "";
  st.railShows = "all";
  st.threadRules = { ...st.threadRules, workingSection: false, groupByProject: false, listClick: "main", ...rules };
  render();
}

const groups = () => mirror.railViewModel().groups;
const rowOf = (key) => groups().flatMap((g) => g.items).find((one) => one.key === key);
const click = (key, extra = {}) => {
  mirror.paintRail();
  const el = document.querySelector(`#rail-sessions .item[data-name="${key}"]`);
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...extra }));
};

lay();

test("⌘-click picks chats and ⇧-click picks the range, and the bar settles them all at once", () => {
  click("a", { metaKey: true, ctrlKey: true });
  click("c", { shiftKey: true });
  assert.deepEqual(selection.pickedKeys().sort(), ["a", "b", "c"]);
  assert.equal(rowOf("b").picked, true);
  const bar = mirror.railViewModel().selection;
  assert.equal(bar.count, 3);
  assert.deepEqual(bar.actions.map((one) => one.act), ["settle", "snooze", "pin", "archive", "erase"]);
  selection.runPicked("settle");
  assert.deepEqual(["a", "b", "c"].map((key) => marks.seatSection(key)), ["settled", "settled", "settled"]);
  assert.equal(mirror.railViewModel().selection, null, "the bar leaves once the action ran");
  marks.unsettleSeats(["a", "b", "c"]);
  render();
});

test("a plain click clears the picks and opens the chat, and Escape clears them too", () => {
  click("a", { metaKey: true, ctrlKey: true });
  assert.equal(selection.pickedKeys().length, 1);
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.equal(selection.pickedKeys().length, 0);
});

test("with the Working section on, the chat at work keeps its place in its block and also shows in Working, at the foot", () => {
  lay({ workingSection: true });
  const all = groups();
  const working = all.find((g) => g.shelf === "working");
  assert.equal(working.fold.count, 1);
  assert.ok(all.find((g) => g.key === "b0").items.some((one) => one.key === "b"));
  lay();
});

test("grouped by project, the list is one folder per project, with a dot when a chat in it needs you", () => {
  lay({ groupByProject: true });
  const folders = groups().filter((g) => g.folder);
  assert.deepEqual(folders.map((g) => [g.label, g.fold.count, !!g.fold.needs]), [["api-acme", 2, false], ["lead-engine", 2, true]]);
  lay();
});

test("the row shows its PR, which opens on a click, and a pen while a draft waits in the composer", () => {
  assert.deepEqual(rowOf("a").pr && { say: rowOf("a").pr.say, state: rowOf("a").pr.state }, { say: "#812", state: "open" });
  assert.match(rowOf("a").pr.list, /#812 lote consignado/);
  keepDraft("c", "falta revisar");
  assert.equal(hasDraft("c"), true);
  assert.equal(rowOf("c").draft, true);
  keepDraft("c", "");
});

test("the search finds a chat by its branch and by the words of its messages, and says why", async () => {
  st.railQuery = "jonas/lote";
  assert.equal(rowOf("a").why, "branch jonas/lote");
  st.railQuery = "webhook";
  mirror.railViewModel();
  await new Promise((go) => setTimeout(go, 400));
  assert.equal(finds.length, 1);
  assert.equal(rowOf("c").why, "Agent: o webhook da cadência devolve 503");
  assert.equal(rowOf("c").whyParts.hit, "webhook");
  st.railQuery = "";
});
