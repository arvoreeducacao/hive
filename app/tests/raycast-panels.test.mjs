import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";

const st = await state();
await views();
const { $ } = await app("core");
const { paintUsage, usageWindowModel, usageViewModel } = await app("usage");
const { panelKeys, openActions, closeActions, actionKeys } = await app("panel-window");
const { worktreesViewModel, worktreesWindowModel } = await app("worktrees");
const { routinesViewModel, routinesWindowModel } = await app("routines");

const flag = (on) => {
  const was = document.body.classList.contains("experience-raycast");
  document.body.classList.toggle("experience-raycast", on);
  document.dispatchEvent(new dom.CustomEvent("hive:experience", { detail: { experience: on ? "raycast" : "current", was: was ? "raycast" : "current" } }));
};

const withFlag = async (fn) => {
  flag(true);
  try { return await fn(); } finally { flag(false); }
};

const press = (over) => new dom.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...over });

const ACCOUNTS = [
  { provider: "claude", account: "default", label: "Claude", limits: [{ kind: "session", percent: 21, resets_at: "" }, { kind: "weekly_all", percent: 84, resets_at: "" }] },
  { provider: "claude", account: "other", label: "Claude", signedIn: false, limits: [] }
];

test("usage keeps its long page with the flag off: no window, no list", () => {
  st.limits = { accounts: ACCOUNTS, tightest: "" };
  const model = usageViewModel({});
  assert.equal(model.raycast, undefined);
  assert.equal(model.head, undefined);
  assert.equal($("usage").classList.contains("pw"), false);
});

test("with the flag on, usage opens in the window: accounts on the left, the picked one beside them", async () => {
  await withFlag(() => {
    st.limits = { accounts: ACCOUNTS, tightest: "" };
    st.usage = null;
    st.usagePick = "";
    st.usageQuery = "";
    const model = usageWindowModel({});
    assert.equal(model.raycast, true);
    assert.deepEqual(model.sections.map((one) => one.key), ["plan", "machine"]);
    const [plan] = model.sections;
    assert.equal(plan.rows[0].pct, "84%");
    assert.equal(plan.rows[0].hot, true, "a week past 80% is a warning");
    assert.equal(plan.rows[1].off, true, "an account not signed in has no bar");
    assert.equal(model.detail.kind, "account");
    assert.equal(model.detail.meters.length, 2);
    assert.equal(model.bar.go.say, "Open in Agents");
    $("usage").hidden = false;
    paintUsage({});
    assert.ok($("usage").classList.contains("pw"));
    assert.equal($("usage").querySelectorAll(".pw-row").length, 5);
    assert.ok($("usage").querySelector(".us-meter"));
    $("usage").hidden = true;
  });
  assert.equal($("usage").classList.contains("pw"), false, "turning the flag off takes the window class away");
});

test("with the flag on, the search of usage filters the rows and the arrows walk them", async () => {
  await withFlag(() => {
    st.limits = { accounts: ACCOUNTS, tightest: "" };
    st.usagePick = "";
    st.usageQuery = "codex";
    const empty = usageWindowModel({});
    assert.equal(empty.detail, null);
    assert.equal(empty.blank.head, "Nothing to show");
    st.usageQuery = "";
    $("usage").hidden = false;
    paintUsage({});
    const search = $("usage").querySelector("[data-pw-search]");
    search.focus();
    const before = st.usagePick;
    assert.equal(panelKeys(press({ key: "ArrowDown", code: "ArrowDown" }), "usage"), true);
    assert.notEqual(st.usagePick, before);
    $("usage").hidden = true;
  });
});

test("with the flag off, the window keys are never read", () => {
  assert.equal(document.body.classList.contains("experience-raycast"), false);
  $("usage").hidden = false;
  const e = press({ key: "k", code: "KeyK", metaKey: true, ctrlKey: true });
  document.dispatchEvent(e);
  assert.equal($("usage").querySelector(".pw-pop"), null);
  $("usage").hidden = true;
});

const tree = (over = {}) => ({ path: "/w/one", repo: "hub", branch: "feat/one", head: "abc", bytes: 1000, touched: Date.now() - 60000, idle: false, seat: "", ...over });

test("worktrees with the flag on are a list by repo with the picked one beside it; with it off, the old page", async () => {
  st.wt = { hub: "/hub", at: Date.now(), trees: [tree({ seat: "ada" }), tree({ path: "/w/two", branch: "feat/two", idle: true, bytes: 500 })], idle: 1, sweep: 1, sized: true, bytes: 1500, idleBytes: 500 };
  st.wtPick = "";
  st.wtQuery = "";
  assert.equal(worktreesViewModel().raycast, undefined);
  await withFlag(() => {
    const model = worktreesWindowModel();
    assert.equal(model.raycast, true);
    assert.equal(model.groups[0].rows[0].here, true);
    assert.deepEqual(model.groups[0].rows[0].status, { dot: "working", say: "ada" });
    assert.equal(model.detail.path, "/w/one");
    assert.equal(model.bar.go.say, "Copy the path");
    st.wtQuery = "two";
    assert.deepEqual(worktreesWindowModel().groups[0].rows.map((row) => row.path), ["/w/two"]);
    st.wtQuery = "";
  });
  st.wt = null;
});

test("routines with the flag on pick the first routine and carry its mission; with it off, the old rows", async () => {
  st.routines = [{ id: "r1", name: "triage", prompt: "look at the inbox", enabled: true, trigger: "weekdays", time: "09:00" }, { id: "r2", name: "nightly", prompt: "sum up", enabled: false, trigger: "weekdays", time: "22:00" }];
  st.routinePick = "";
  st.routineQuery = "";
  assert.equal(routinesViewModel().raycast, undefined);
  await withFlag(() => {
    const model = routinesWindowModel();
    assert.equal(model.picked.id, "r1");
    assert.equal(model.picked.prompt, "look at the inbox");
    assert.equal(model.bar.go.say, "Run now");
    st.routineQuery = "night";
    assert.deepEqual(routinesWindowModel().rows.map((row) => row.id), ["r2"]);
    st.routineQuery = "";
  });
  st.routines = null;
});

const tasksApi = await app("tasks");

const task = (over = {}) => ({ id: "t1", text: "Conferir saldo A2B", owner: "juno", who: "me", at: 1, ...over });

function taskWorld(list, over = {}) {
  st.tasks = { me: "juno", list, groups: [], shelf: "ok", at: 1 };
  st.team = { devs: [] };
  st.data = { ...st.data, sessions: over.sessions || [], spawning: [], archived: [] };
  Object.assign(tasksApi.tasksUi, { section: "mine", open: "", query: "", form: null, mention: null, confirm: null }, over.ui || {});
}

test("tasks with the flag off keep swapping the list for the detail, nothing picked by itself", () => {
  taskWorld([task(), task({ id: "t2", text: "Cobrar editoras" })]);
  const model = tasksApi.tasksModel();
  assert.equal(model.raycast, undefined);
  assert.equal(model.view, "list");
  assert.equal(model.detail, null);
  assert.equal(model.rows[0].here, undefined);
});

test("tasks with the flag on pick the first task, so the detail beside the list is never empty", async () => {
  await withFlag(() => {
    taskWorld([task(), task({ id: "t2", text: "Cobrar editoras" })]);
    const model = tasksApi.tasksModel();
    assert.equal(model.raycast, true);
    assert.equal(model.view, "detail");
    assert.equal(model.detail.key, "t1");
    assert.deepEqual(model.rows.map((row) => [row.key, row.here]), [["t1", true], ["t2", false]]);
  });
});

test("with the flag on, the search of tasks finds a task by its words, its owner, its chat or a person", async () => {
  assert.equal(tasksApi.taskMatches(task(), "saldo"), true);
  assert.equal(tasksApi.taskMatches(task({ seat: "valores-incoerentes" }), "incoerentes"), true);
  assert.equal(tasksApi.taskMatches(task({ people: ["mees"] }), "@mees"), true);
  assert.equal(tasksApi.taskMatches(task(), "editoras"), false);
  await withFlag(() => {
    taskWorld([task(), task({ id: "t2", text: "Cobrar editoras" })], { ui: { query: "editoras" } });
    const model = tasksApi.tasksModel();
    assert.deepEqual(model.rows.map((row) => row.key), ["t2"]);
    assert.equal(model.detail.key, "t2");
    taskWorld([task()], { ui: { query: "nada" } });
    assert.match(tasksApi.tasksModel().empty.head, /Nothing matches/);
  });
});

test("with the flag on, up and down walk the tasks and a row says the chat's state in words beside the dot", async () => {
  await withFlag(() => {
    taskWorld([task(), task({ id: "t2" }), task({ id: "t3" })]);
    tasksApi.tasksModel();
    tasksApi.stepTask(1);
    assert.equal(tasksApi.tasksUi.open, "t2");
    tasksApi.stepTask(-1);
    tasksApi.stepTask(-1);
    assert.equal(tasksApi.tasksUi.open, "t3");
    taskWorld([task({ seat: "ada" })], { sessions: [{ name: "ada", state: "working" }] });
    const [row] = tasksApi.tasksModel().rows;
    assert.equal(row.seat.state, "working");
    assert.equal(row.seat.label, "working");
  });
  taskWorld([task({ seat: "ada" })], { sessions: [{ name: "ada", state: "working" }] });
  assert.equal(tasksApi.tasksModel().rows[0].seat.label, undefined, "with the flag off the state is still said in words");
  st.tasks = { me: "", list: [], groups: [], shelf: "ok", at: 0 };
});

const shelfApi = await app("shelf");

test("the shelf is dressed as a window with the flag on and gets its own markup back, nodes and all, with it off", async () => {
  const before = $("shelf").innerHTML;
  const search = $("sh-search");
  const gallery = $("sh-gal");
  st.shelf = { repo: "https://github.com/acme/shelf", me: "juno", pages: [
    { slug: "one", title: "One", owner: "juno", label: "draft", tabs: { telas: [{ n: 1 }] }, at: Date.now() },
    { slug: "two", title: "Two", owner: "ana", label: "decided", tabs: { documento: [{ n: 2 }] }, at: Date.now() }
  ] };
  st.shelfPick = "";
  await withFlag(() => {
    $("shelf").hidden = false;
    shelfApi.paintShelf();
    assert.ok($("shelf").classList.contains("pw"));
    assert.ok($("shelf").querySelector(":scope > .pw-head #sh-search"), "the search moved into the head");
    assert.equal($("sh-search"), search, "the very same input, so its listeners stay");
    assert.equal(gallery.className, "pw-list");
    assert.ok($("sh-prev") && $("sh-foot") && $("sh-close"));
    assert.ok($("sh-gal").querySelectorAll(".pw-row").length >= 1);
    const model = shelfApi.shelfGalleryWindowModel();
    assert.equal(model.raycast, true);
    assert.ok(st.shelfPick, "the first page is picked");
    assert.equal(shelfApi.shelfPreviewModel().page.slug, st.shelfPick);
  });
  assert.equal($("shelf").classList.contains("pw"), false);
  assert.equal($("sh-prev"), null);
  assert.equal($("sh-search"), search);
  assert.equal(search.className, "sh-search");
  assert.equal(search.getAttribute("placeholder"), "search");
  assert.equal(gallery.className, "sh-gal");
  assert.ok($("shelf").querySelector(":scope > .sh-top #sh-search"), "the search is back in the old bar");
  $("shelf").hidden = true;
  shelfApi.closeShelf();
  assert.equal($("shelf").innerHTML.replace(/\s+/g, " ").includes("pw-head"), false);
  assert.equal(before.includes("pw-head"), false);
  st.shelf = null;
});

const dayApi = await app("day");

const errand = (name, over = {}) => ({ errand: name, asked: "", prs: [], closed: false, seats: [{ name: `${name}-1`, title: name, state: "needs", now: "asking you", asks: [] }], ...over });

test("your day with the flag on is a list of requests with the picked one beside it, and the form keeps its nodes", async () => {
  const day = { needsYou: [errand("ship it")], cameBack: [], onTheWay: [errand("slow one")], byHand: [] };
  st.dayPick = "";
  assert.equal(dayApi.dayViewModel(day).raycast, undefined);
  const form = $("day-say");
  const field = $("day-in");
  const firstChild = form.firstElementChild;
  await withFlag(() => {
    const model = dayApi.dayWindowModel(day);
    assert.deepEqual(model.sections.map((one) => one.key), ["needs", "way"]);
    assert.equal(model.picked.key, "needs:ship it");
    assert.equal(model.sections[0].rows[0].here, true);
    st.data = { ...st.data, day };
    $("day").hidden = false;
    dayApi.paintDay(true);
    assert.ok($("day").classList.contains("pw"));
    assert.equal($("day-in"), field);
    assert.ok(field.closest(".day-field"), "the field sits in its label inside the foot");
    assert.ok($("day-more") && $("day-shut"));
    assert.ok($("day-body").querySelector(".day-row"));
  });
  assert.equal($("day").classList.contains("pw"), false);
  assert.equal($("day-more"), null);
  assert.equal(form.firstElementChild, firstChild, "the form gets its own children back");
  assert.equal(field.parentElement, form);
  $("day").hidden = true;
});

const themesApi = await app("themes");

test("settings open as the compact window with the flag on, the themes inside Appearance, and come back whole with it off", async () => {
  const box = $("help").querySelector(".box");
  const grid = $("thm-grid");
  const browse = $("thm-browse");
  const reset = $("t-reset");
  const resetHome = reset.parentNode;
  const lookPane = $("pref-body").querySelector('.pref-pane[data-pane="look"]');
  const lookKids = [...lookPane.childNodes];
  const tabSay = [...$("pref-nav").querySelectorAll("button")].map((one) => one.textContent);
  await withFlag(() => {
    themesApi.openHelp("look");
    assert.ok(box.classList.contains("pw") && box.classList.contains("compact"));
    assert.ok($("pref-find"), "the search sits in the head");
    assert.equal(box.dataset.pane, "look");
    assert.ok(grid.closest(".thm-list"), "the theme list moved into Appearance");
    assert.ok($("thm-prev") && $("help-foot") && $("thm-count"));
    assert.ok(reset.closest('.pref-pane[data-pane="keyboard"]'), "the shortcuts reset lives in the Keyboard section");
    assert.ok($("pref-nav").querySelector('button[data-pane="look"] svg'), "every section has its icon");
    const model = themesApi.themesWindowModel();
    assert.equal(model.raycast, true);
    assert.equal(model.rows[0].say, "Raycast", "the bare theme is the Raycast look inside the flag");
    assert.equal(model.rows[0].fresh, true);
    themesApi.closeHelp();
  });
  assert.equal(box.classList.contains("pw"), false);
  assert.equal(box.classList.contains("compact"), false);
  assert.equal(box.dataset.pane, undefined);
  assert.equal($("pref-find"), null);
  assert.equal(grid.parentNode, browse);
  assert.equal(reset.parentNode, resetHome);
  assert.deepEqual([...lookPane.childNodes], lookKids);
  assert.deepEqual([...$("pref-nav").querySelectorAll("button")].map((one) => one.textContent), tabSay);
  assert.equal(themesApi.themesViewModel().raycast, undefined);
});

const actionHost = document.createElement("section");
document.body.append(actionHost);
const actionRuns = [];
const actionSpec = { el: () => actionHost, actions: () => [
  { key: "first", say: "First action", go: () => actionRuns.push("first") },
  { key: "second", say: "Second action", go: () => actionRuns.push("second") }
] };
test("Enter runs the action focused through Tab rather than the old selection", () => {
  actionRuns.length = 0;
  openActions(actionSpec);
  actionHost.querySelector('[data-pi="1"]').focus();
  actionKeys(press({key: "Enter", code: "Enter"}));
  assert.deepEqual(actionRuns, ["second"]);
});

test("arrow navigation retains menu focus when it starts on an action button", () => {
  actionRuns.length = 0;
  openActions(actionSpec);
  actionHost.querySelector('[data-pi="0"]').focus();
  actionKeys(press({key: "ArrowDown", code: "ArrowDown"}));
  assert.ok(document.activeElement === actionHost.querySelector('[data-pi="1"]'), "the newly selected action must keep keyboard focus");
  actionKeys(press({key: "Enter", code: "Enter"}));
  assert.deepEqual(actionRuns, ["second"]);
});
