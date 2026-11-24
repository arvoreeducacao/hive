import { test, after } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

Object.defineProperty(navigator, "userAgent", { value: `${navigator.userAgent} Electron/30.0.0`, configurable: true });
window.hiveLink = window.hiveLink || { open: () => ({ send() {}, close() {} }) };
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

const st = await state();
const { bootSolid } = await app("shared");
const { render } = await app("arrange");
const { phrase } = await app("core");
const { arriveOnADraft, askNewChat, draftItem, drafts, nothingInFocus, openDraftIn, openDraftOnBranchOf, scopeNewChatsBy, spawnPayloadOf } = await app("draft-seat");
const { closePlaceMenu } = await app("draft-place");
const { seatMenuRows } = await app("seat-menu");

const PROJECTS = { hub: "acme-hub", projects: [{ name: "api-acme", branch: "main", base: "main" }, { name: "lead-engine", branch: "main", base: "main" }] };
const BRANCHES = { project: "lead-engine", branch: "main", base: "main", branches: ["main", "develop", "812-retry"] };
const answered = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
const realFetch = globalThis.fetch;
globalThis.fetch = (where) => {
  const path = String(where);
  if (path === "/api/projects") return Promise.resolve(answered(PROJECTS));
  if (path.startsWith("/api/projects/branches")) return Promise.resolve(answered(BRANCHES));
  if (path.startsWith("/api/hive")) return Promise.resolve(answered({ sessions: st.data.sessions, spawning: [], archived: [], pod: { up: false, name: "" } }));
  return Promise.resolve(answered({}));
};
after(() => { globalThis.fetch = realFetch; });

bootSolid();

const settle = async () => { for (let n = 0; n < 6; n++) await new Promise((done) => setTimeout(done, 5)); };

const RETRY_TREE = "/hub/.worktrees/lead-engine/812-retry";
const seat = (name, over = {}) => ({ name, title: name, where: "local", state: "idle", kind: "structured", raw: "idle", trees: [], ...over });
const retry = seat("retry-cadencia", { trees: [{ repo: "lead-engine", branch: "812-retry", path: RETRY_TREE, main: false }] });
const hubChat = seat("triagem", { trees: [{ repo: "acme-hub", branch: "main", path: "/hub", main: true }], cwd: "/hub" });

function hive({ seats = [retry, hubChat], keys = seats.map((one) => one.name), recent = "" } = {}) {
  closePlaceMenu();
  st.LIMIT = 6;
  st.data = { sessions: seats, spawning: [], archived: [], pod: { up: false, name: "" } };
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.blocks = keys.length ? [{ id: "b0", ws: "w0", label: "", manual: true, keys: [...keys] }] : [];
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.mirrorDev = "";
  st.seatsKnown = true;
  for (const one of [...drafts.values()]) { one.e.host.remove(); drafts.delete(one.id); }
  localStorage.setItem("hive.draft", JSON.stringify({ agent: "claude", model: "", where: "local", kind: "structured", project: recent }));
  render();
}

const onlyDraft = () => { const all = [...drafts.values()]; assert.equal(all.length, 1, "one draft on screen"); return all[0]; };
const menuOf = (d) => d.e.host.querySelector(".sv-place-menu");
const clickProject = async (d) => { d.e.host.querySelector('[data-place="project"]').click(); await settle(); };
const press = (el, key, extra = {}) => el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));

test("New chat lands in the message, on the most recent project, and the project menu waits for a click", async () => {
  hive({ recent: "lead-engine" });
  askNewChat();
  await settle();
  const d = onlyDraft();
  assert.equal(d.project, "lead-engine");
  assert.equal(d.worktree, true, "a project chat gets a worktree of its own unless asked otherwise");
  assert.equal(menuOf(d), null, "the project menu opened on its own");
  assert.ok(document.activeElement === d.e.host.querySelector("textarea"), "the keyboard is not in the message");
  assert.equal(d.e.host.querySelector('[data-place="project"] .v').textContent, "lead-engine");
  await clickProject(d);
  const menu = menuOf(d);
  assert.ok(menu, "a click did not open the project menu");
  assert.equal(menu.dataset.kind, "project");
  assert.ok(document.activeElement === menu.querySelector("input"), "the keyboard is not in the project search");
  const ticked = [...menu.querySelectorAll("button.on .l")].map((el) => el.textContent);
  assert.deepEqual(ticked, ["lead-engine"]);
  assert.equal(menu.querySelector("button .l").textContent, "lead-engine", "the last project used comes first");
  assert.match(menu.textContent, new RegExp(phrase("No project")));
});

test("typing filters the menu, enter picks the project and hands the keyboard to the composer", async () => {
  hive({ recent: "lead-engine" });
  askNewChat();
  await settle();
  const d = onlyDraft();
  await clickProject(d);
  const input = menuOf(d).querySelector("input");
  input.value = "api";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  assert.deepEqual([...menuOf(d).querySelectorAll("button .l")].map((el) => el.textContent), ["api-acme"]);
  press(input, "Enter");
  await settle();
  assert.equal(d.project, "api-acme");
  assert.equal(menuOf(d), null);
  assert.ok(document.activeElement === d.e.host.querySelector("textarea"), "the composer did not get the keyboard back");
  assert.equal(d.e.host.querySelector('[data-place="project"] .v').textContent, "api-acme");
});

test("escape leaves the project as it was and puts the cursor in the composer", async () => {
  hive({ recent: "lead-engine" });
  askNewChat();
  await settle();
  const d = onlyDraft();
  await clickProject(d);
  press(menuOf(d).querySelector("input"), "ArrowDown");
  press(menuOf(d).querySelector("input"), "Escape");
  assert.equal(menuOf(d), null);
  assert.equal(d.project, "lead-engine");
  assert.ok(document.activeElement === d.e.host.querySelector("textarea"));
});

test("picking No project puts the chat back in the hub, with no branch to choose", async () => {
  hive({ recent: "lead-engine" });
  askNewChat();
  await settle();
  const d = onlyDraft();
  await clickProject(d);
  const input = menuOf(d).querySelector("input");
  press(input, "ArrowUp");
  press(input, "Enter");
  await settle();
  assert.equal(d.project, "");
  assert.equal(d.worktree, false);
  assert.ok(d.e.host.querySelector('[data-place="base"]').hidden);
  assert.deepEqual(spawnPayloadOf(d, "x").project, undefined);
});

test("shift-click starts in the project of the chat in focus, without asking", async () => {
  hive({ recent: "api-acme" });
  st.focus = 0;
  askNewChat({ here: true });
  await settle();
  const d = onlyDraft();
  assert.equal(d.project, "lead-engine");
  assert.equal(menuOf(d), null);
  assert.ok(document.activeElement === d.e.host.querySelector("textarea"));
});

test("shift-click on a chat that lives in the hub starts with no project", async () => {
  hive({ recent: "api-acme" });
  st.focus = 1;
  askNewChat({ here: true });
  await settle();
  assert.equal(onlyDraft().project, "");
});

test("with the list filtered to a project, the chat is born there; the hub is no filter, so the recent project wins", async () => {
  hive();
  scopeNewChatsBy(() => "api-acme");
  try {
    askNewChat();
    await settle();
    const d = onlyDraft();
    assert.equal(d.project, "api-acme");
    assert.equal(menuOf(d), null);
    hive({ recent: "lead-engine" });
    scopeNewChatsBy(() => "acme-hub");
    askNewChat();
    await settle();
    assert.equal(onlyDraft().project, "lead-engine", "a filter on the hub itself is not a project");
    assert.equal(menuOf(onlyDraft()), null);
  } finally {
    scopeNewChatsBy(null);
  }
});

test("the base branch menu lists the project's branches with the default first", async () => {
  hive();
  const d = openDraftIn({ repo: "lead-engine" });
  await settle();
  d.e.host.querySelector('[data-place="base"]').click();
  await settle();
  const menu = menuOf(d);
  assert.equal(menu.dataset.kind, "base");
  assert.deepEqual([...menu.querySelectorAll("button .l")].map((el) => el.textContent), ["main", "develop", "812-retry"]);
  const input = menu.querySelector("input");
  press(input, "ArrowDown");
  press(input, "Enter");
  await settle();
  assert.equal(d.base, "develop");
  assert.deepEqual(spawnPayloadOf(d, "x"), { name: "", prompt: "x", images: [], where: "local", model: "", agent: "claude", structured: true, account: "", repo: "", branch: "", project: "lead-engine", base: "develop", worktree: true });
  assert.deepEqual(draftItem(d.key).trees, [{ repo: "lead-engine", branch: "develop", path: "", main: false }]);
});

test("both seat menus offer a new chat on the branch of a chat in a worktree, and it shares that folder", async () => {
  hive();
  for (const raycast of [false, true]) {
    document.body.classList.toggle("experience-raycast", raycast);
    const row = seatMenuRows(retry).find((one) => one.label === phrase("new chat on {branch}", { branch: "812-retry" }));
    assert.ok(row, `the ${raycast ? "raycast" : "classic"} menu has no new chat on the branch`);
    assert.equal(row.note, "lead-engine");
    assert.ok(!seatMenuRows(hubChat).some((one) => /812|main/.test(one.label) && one.label.startsWith(phrase("new chat on {branch}", { branch: "" }))), "a chat in the hub has no project branch to share");
    assert.ok(!seatMenuRows({ ...retry, where: "cloud" }).some((one) => one.label === row.label), "a cloud chat does not share a folder on this machine");
  }
  document.body.classList.remove("experience-raycast");
  const d = openDraftOnBranchOf(retry);
  await settle();
  assert.equal(d.project, "lead-engine");
  assert.equal(d.tree, RETRY_TREE);
  assert.equal(d.worktree, false);
  assert.ok(d.e.host.querySelector('[data-place="base"]').disabled, "the branch of a shared folder is not a choice");
  assert.equal(d.e.host.querySelector('[data-place="base"] .v').textContent, "812-retry");
  const payload = spawnPayloadOf(d, "x");
  assert.equal(payload.tree, RETRY_TREE);
  assert.equal(payload.worktree, undefined);
  assert.equal(payload.base, undefined);
});

test("the app opens on a draft only when no chat is in focus", async () => {
  hive({ seats: [], keys: [], recent: "api-acme" });
  st.seatsKnown = false;
  arriveOnADraft();
  await settle();
  assert.equal(drafts.size, 0, "the draft waited for the first answer about the seats");
  hive();
  assert.equal(nothingInFocus(), false, "a wall with chats is left alone");
  hive({ seats: [], keys: [] });
  st.open = "triagem";
  assert.equal(nothingInFocus(), false, "a chat open alone is a chat in focus");
  hive({ seats: [], keys: [], recent: "api-acme" });
  assert.equal(nothingInFocus(), true);
  arriveOnADraft();
  await settle();
  const d = onlyDraft();
  assert.equal(d.project, "api-acme");
  assert.equal(menuOf(d), null, "opening the app does not ask for the project");
  arriveOnADraft();
  assert.equal(drafts.size, 1, "the app lands on a draft once, at boot");
});

test("an anonymous or cloud draft carries no project, even after one was picked", async () => {
  hive();
  const d = openDraftIn({ repo: "lead-engine" });
  await settle();
  d.where = "cloud";
  assert.equal(spawnPayloadOf(d, "x").project, undefined);
  d.where = "anonymous";
  assert.equal(spawnPayloadOf(d, "x").project, undefined);
});

test("a tile still leaving the wall does not make the wall move the others, so the fresh draft keeps the keyboard", async () => {
  hive({ recent: "lead-engine" });
  const d = openDraftIn({ repo: "lead-engine" });
  await settle();
  const canvas = document.getElementById("canvas");
  const box = d.e.host.querySelector("textarea");
  box.focus();
  const leaving = document.createElement("article");
  leaving.className = "tile";
  leaving.dataset.key = "job:n9";
  leaving.dataset.gone = "1";
  canvas.insertBefore(leaving, canvas.firstChild);
  const moved = [];
  const append = canvas.appendChild.bind(canvas);
  canvas.appendChild = (el) => { moved.push(el); return append(el); };
  try {
    render({ animate: false });
    render({ animate: false });
  } finally {
    delete canvas.appendChild;
    leaving.remove();
  }
  assert.equal(moved.length, 0, "the wall re-appended its tiles because of a tile on its way out");
  assert.ok(document.activeElement === box, "the composer lost the keyboard");
});

test("while the first message is on its way the place cannot change, and a refused send gives it back", async () => {
  hive();
  const d = openDraftIn({ repo: "lead-engine" });
  await settle();
  const realSpawn = globalThis.fetch;
  let release = null;
  globalThis.fetch = (where, init) => String(where) === "/api/spawn" ? new Promise((done) => { release = () => done(answered({ ok: false, error: "no" })); }) : realSpawn(where, init);
  try {
    const { sendDraft } = await app("draft-seat");
    const sending = sendDraft(d, "conserta o retry");
    await settle();
    const picks = [...d.e.host.querySelectorAll(".sv-place-pick")];
    assert.ok(picks.every((one) => one.disabled), "the project or the branch can change while the chat is being opened");
    release();
    await sending;
    assert.equal(d.e.host.querySelector('[data-place="project"]').disabled, false);
    assert.equal(d.e.host.querySelector('[data-place="base"]').disabled, false);
  } finally {
    globalThis.fetch = realSpawn;
  }
});

test("the rail of the classic has a New chat row, and shift-click on it starts in the project of the chat in focus", async () => {
  hive({ recent: "api-acme" });
  document.body.classList.add("experience-raycast");
  try {
    const { railViewModel } = await app("mirror");
    const model = railViewModel();
    assert.equal(model.newSaid, phrase("New chat"));
    assert.match(model.newHint, /shift/);
    const rail = document.getElementById("rail-sessions");
    const row = document.createElement("button");
    row.dataset.railNew = "";
    rail.appendChild(row);
    st.focus = 0;
    row.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    row.remove();
    await settle();
    const d = onlyDraft();
    assert.equal(d.project, "lead-engine");
    assert.equal(menuOf(d), null);
  } finally {
    document.body.classList.remove("experience-raycast");
  }
});
