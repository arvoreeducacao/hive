import { mountTasks } from "../panels/tasks.jsx";
import { $, avatarSvg, LABEL, phrase, raycastOn, st, stateColor } from "./core.js";
import { goTo, pull, releaseKeyboard } from "./focus-navigation.js";
import { keyHint } from "./leader-key.js";
import { closeMore } from "./new-chat.js";
import { capsOf, followRaycast, leavePanel, openActions, panelOf, registerPanel, runAction } from "./panel-window.js";
import { personFace } from "./person-face.js";
import { devFace, wearsBlob } from "./team.js";

const TASKS_POLL = 60000;
const PR_IN_URL = /github\.com\/[\w.-]+\/([\w.-]+)\/pull\/(\d+)/;
const MENTION_AT = /(^|[^\w@])@([a-z0-9-]{0,40})$/;
const MENTION_IN = /(@[a-z0-9][a-z0-9-]{0,39})/g;
const GROUP_ICONS = ["i-book", "i-tree", "i-bolt", "i-db", "i-globe", "i-heart", "i-chart", "i-pen", "i-target", "i-camera", "i-mail", "i-flow"];
const GROUP_COLOURS = ["accent", "green", "blue", "violet", "yellow"];
const PICTURE_SIDE = 256;
const PICTURE_MAX = 200 * 1024;

st.tasks = { me: "", list: [], groups: [], shelf: "ok", at: 0 };

const ui = {
  section: "mine", open: "", addWho: "", handTo: "", note: "", noteBad: false, busy: false,
  form: null, mention: null, mentionBox: "", confirm: null, query: ""
};

const NOTE_KEY = { alt: true, code: "KeyN" };

const tasksOn = () => $("tasks").classList.contains("on");

function clock(at) {
  if (!at) return "";
  const when = new Date(at);
  const today = new Date();
  const hm = `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
  if (when.toDateString() === today.toDateString()) return phrase("today {hm}", { hm });
  return `${String(when.getDate()).padStart(2, "0")}/${String(when.getMonth() + 1).padStart(2, "0")} ${hm}`;
}

async function ask(path, body) {
  try {
    const r = await fetch(path, body === undefined ? {} : {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
    const said = await r.json().catch(() => ({}));
    if (!r.ok || said.error) return { error: said.why ? `${phrase(said.error)}: ${phrase(said.why)}` : phrase(said.error || "the hive did not answer — try again") };
    return said;
  } catch (wrong) {
    return { error: wrong?.message || phrase("the hive did not answer — try again") };
  }
}

async function pullTasks(fresh = false) {
  const said = await ask(`/api/tasks${fresh ? "?fresh=1" : ""}`);
  if (said.error) { tell(said.error, true); return; }
  st.tasks = { me: said.me || "", list: said.tasks || [], groups: said.groups || [], shelf: said.shelf || "ok", at: Date.now() };
  if (said.warning && tasksOn()) tell(phrase("the team's tasks could not be refreshed: {why}", { why: said.warning }), true);
  paintTasks();
}

function tell(text, bad = false) {
  ui.note = text || "";
  ui.noteBad = !!bad;
  paintTasks();
}

const faces = new Map();

function devFaceOf(dev) {
  const name = String(dev || "");
  if (wearsBlob(name)) return { kind: "dev", svg: personFace(name) };
  if (!faces.has(name)) faces.set(name, avatarSvg(devFace(name), { salt: `task-${name}` }));
  return { kind: "dev", svg: faces.get(name) };
}

const chatFace = (name) => ({ kind: "chat", colour: "var(--green)", letter: String(name || "?").slice(0, 1) });

const groupOf = (id) => st.tasks.groups.find((one) => one.id === id);
const myGroups = () => st.tasks.groups.filter((one) => (one.members || []).includes(st.tasks.me));

function groupIcon(group) {
  if (!group) return { kind: "letter", colour: "var(--line-3)", letter: "?" };
  if (group.image) return { kind: "image", src: `/api/tasks/group-image?id=${group.id}&v=${encodeURIComponent(group.image)}` };
  return { kind: "icon", colour: `var(--${group.colour || "accent"})`, sprite: `#${group.icon || "i-book"}` };
}

function knownPeople() {
  const people = new Set([st.tasks.me, ...(st.team.devs || []).map((one) => one.dev)]);
  for (const task of st.tasks.list) {
    people.add(task.owner);
    for (const one of task.people || []) people.add(one);
  }
  for (const group of st.tasks.groups) for (const one of group.members || []) people.add(one);
  return [...people].filter(Boolean).sort();
}

const liveChats = () => (st.data.sessions || []).map((one) => one.name).filter(Boolean);

function seesTask(task, dev) {
  if (!task) return false;
  if (task.owner === dev || task.who === "team") return true;
  if (task.who === "people") return (task.people || []).includes(dev);
  if (task.who === "group") return (groupOf(task.group)?.members || []).includes(dev);
  return false;
}

const mine = (task) => task.owner === st.tasks.me;
const openOnes = () => st.tasks.list.filter((task) => !task.done);

function sectionOf(key) {
  const me = st.tasks.me;
  if (key === "mine") return st.tasks.list.filter((task) => !task.done && task.owner === me);
  if (key === "withMe") return st.tasks.list.filter((task) => !task.done && task.owner !== me && task.who === "people");
  if (key === "team") return st.tasks.list.filter((task) => !task.done && task.who === "team");
  if (key === "done") return st.tasks.list.filter((task) => task.done);
  if (key.startsWith("dev:")) return st.tasks.list.filter((task) => !task.done && task.owner === key.slice(4));
  if (key.startsWith("group:")) return st.tasks.list.filter((task) => !task.done && task.who === "group" && task.group === key.slice(6));
  return [];
}

function seatOf(task) {
  if (!task.seat) return null;
  const live = (st.data.sessions || []).find((seat) => seat.name === task.seat);
  const state = live?.state || "";
  return {
    name: task.seat,
    live: !!live,
    colour: live ? stateColor(state) || "var(--txt-3)" : "var(--txt-3)",
    ...(raycastOn()
      ? { state: live ? state || "idle" : "idle", label: live ? phrase(LABEL[state] || state || "") : phrase("closed") }
      : { state: live ? phrase(LABEL[state] || state || "") : phrase("closed") })
  };
}

function linksOf(task) {
  return (task.prs || []).map((href) => {
    const found = String(href).match(PR_IN_URL);
    return { href, say: found ? `PR #${found[2]}` : href };
  });
}

function whoSay(task) {
  if (task.who === "team") return phrase("team");
  if (task.who === "group") return groupOf(task.group)?.name || phrase("a group");
  if (task.who === "people") {
    const others = [task.owner, ...(task.people || [])].filter((one) => one !== st.tasks.me);
    return mine(task) ? (task.people || []).join(", ") : others.concat([phrase("you")]).join(", ");
  }
  return phrase("just me");
}

function taskSaid(task) {
  if (task.from && mine(task)) return phrase("written by the chat {seat} · {when}", { seat: task.from, when: clock(task.at) });
  if (mine(task)) return phrase("written by you · {when}", { when: clock(task.at) });
  return task.who === "people" ? phrase("passed to you · {when}", { when: clock(task.at) }) : clock(task.at);
}

function talkOf(task) {
  const comments = task.comments || [];
  if (!comments.length) return { talk: "", hot: false };
  const fresh = comments.filter((one) => one.who !== st.tasks.me && one.at > (st.tasksSeen?.[task.id] || 0)).length;
  if (fresh) return { talk: fresh === 1 ? phrase("1 new comment") : phrase("{n} new comments", { n: fresh }), hot: true };
  return { talk: comments.length === 1 ? phrase("1 comment") : phrase("{n} comments", { n: comments.length }), hot: false };
}

function partsOf(text) {
  const people = new Set(knownPeople());
  const chats = new Set(liveChats());
  return String(text || "").split(MENTION_IN).filter(Boolean).map((bit, i) => {
    const name = bit.startsWith("@") ? bit.slice(1) : "";
    if (name && people.has(name)) return { key: `${i}`, kind: "person", text: name, face: devFaceOf(name) };
    if (name && chats.has(name)) return { key: `${i}`, kind: "chat", text: name, face: chatFace(name) };
    if (name) return { key: `${i}`, kind: "loose", text: bit };
    return { key: `${i}`, kind: "text", text: bit };
  });
}

function rowOf(task) {
  const seat = seatOf(task);
  const talk = talkOf(task);
  const owned = mine(task);
  const act = !owned || task.done ? null
    : seat?.live ? { kind: "openChat", say: phrase("open chat"), go: false }
    : { kind: "start", say: phrase("start a chat"), go: true };
  return {
    key: task.id,
    ...(raycastOn() ? { here: task.id === ui.open, when: clock(task.doneAt || task.at), talkCount: (task.comments || []).length } : {}),
    text: task.text,
    done: !!task.done,
    canCheck: owned,
    checkSay: task.done ? phrase("open it again") : phrase("mark done"),
    owner: owned ? null : { name: task.owner, face: devFaceOf(task.owner) },
    said: taskSaid(task),
    seat,
    links: linksOf(task),
    talk: talk.talk,
    talkHot: talk.hot,
    who: task.who,
    whoSay: whoSay(task),
    whoIcon: task.who === "group" ? groupIcon(groupOf(task.group)) : null,
    act
  };
}

const SECTIONS = [
  ["mine", "Mine"],
  ["withMe", "Passed to me"],
  ["team", "The team's"],
  ["done", "Done"]
];

const HINTS = {
  mine: "What you wrote, or a chat wrote because you asked. Start a chat and it gets the task as its mission.",
  withMe: "Tasks someone shared with you by name. You can comment; only they change or close them.",
  team: "Every task shared with the whole team.",
  done: "Closed in the last 14 days. After that they leave the list."
};

const EMPTY = {
  mine: ["Nothing open.", "Write one down below, or ask a chat to note what is left for later."],
  withMe: ["Nobody passed you anything.", "When someone shares a task with you by name, it shows up here."],
  team: ["The team has nothing open here.", "A task marked team shows up for everyone who uses the hive."],
  done: ["Nothing closed lately.", "Tick a task and it lands here."],
  group: ["Nothing open in this group.", "Write one down below and it lands here, for everyone in the group."]
};

function whoHint(task) {
  if (task.who === "team") return phrase("everyone who uses the hive");
  if (task.who === "people") return phrase("only the people you pick");
  if (task.who === "group") return phrase("everyone in the group");
  return phrase("stays on this machine");
}

function taskMatches(task, query) {
  const q = String(query || "").trim().toLowerCase().replace(/^@/, "");
  if (!q) return true;
  return [task.text, task.owner, task.seat, ...(task.people || []), groupOf(task.group)?.name].filter(Boolean).join(" ").toLowerCase().includes(q);
}

const shownTasks = () => sectionOf(ui.section).filter((task) => taskMatches(task, ui.query));

function keepPicked() {
  if (ui.form) return;
  const shown = shownTasks();
  if (!shown.some((task) => task.id === ui.open)) ui.open = shown[0]?.id || "";
}

function detailOf(task) {
  const owned = mine(task);
  const seat = seatOf(task);
  const devs = [...new Set((st.team.devs || []).map((one) => one.dev).concat(task.people || []))].filter((one) => one && one !== st.tasks.me).sort();
  const alive = (st.data.sessions || []).filter((one) => one.name !== task.seat);
  const back = SECTIONS.find(([key]) => key === ui.section)?.[1];
  const groups = myGroups();
  const options = [["me", "just me"], ["team", "team"], ["people", "people"]].concat(groups.length ? [["group", "group"]] : []);
  return {
    key: task.id,
    text: task.text,
    said: owned ? taskSaid(task) : phrase("{owner} wrote it · {when}", { owner: task.owner, when: clock(task.at) }),
    ...(raycastOn() ? { strip: (owned ? taskSaid(task) : phrase("{owner} wrote it · {when}", { owner: task.owner, when: clock(task.at) })).split(" · ") } : {}),
    back: back ? phrase(back) : ui.section.startsWith("dev:") ? ui.section.slice(4) : ui.section.startsWith("group:") ? groupOf(ui.section.slice(6))?.name || "" : phrase("Mine"),
    mine: owned,
    who: task.who,
    whoSay: whoSay(task),
    whoLabel: phrase("Who sees it"),
    whoHint: whoHint(task),
    whoOptions: options.map(([key, say]) => ({ key, say: phrase(say), on: task.who === key })),
    people: devs.map((key) => ({ key, on: (task.people || []).includes(key), face: devFaceOf(key) })),
    groups: groups.map((one) => ({ key: one.id, say: one.name, on: task.group === one.id })),
    nobody: phrase("nobody else shows up on the team panel yet"),
    chatLabel: phrase("Chat"),
    seat,
    noChat: phrase("no chat on it yet"),
    openSay: seat?.live ? phrase("open chat") : "",
    startSay: owned && !task.done && !seat?.live ? phrase("start a chat") : "",
    handTo: owned && !task.done && alive.length ? {
      say: phrase("hand it over"),
      pick: phrase("or hand it to an open chat…"),
      ready: !!ui.handTo,
      seats: alive.map((one) => ({ key: one.name, say: one.title ? `${one.name} · ${one.title}` : one.name, on: one.name === ui.handTo }))
    } : null,
    backLabel: phrase("Came back"),
    links: linksOf(task),
    talkLabel: phrase("Conversation"),
    quiet: phrase("No comments yet. Write @ to call a person or a chat."),
    comments: (task.comments || []).map((one) => ({
      key: one.id, who: one.who === st.tasks.me ? phrase("you") : one.who, agent: !!one.agent, agentSay: phrase("chat"),
      when: clock(one.at), parts: partsOf(one.text), face: one.agent ? chatFace(one.who) : devFaceOf(one.who)
    })),
    removeSay: owned ? phrase("remove the task") : ""
  };
}

function formOf() {
  const form = ui.form;
  const people = knownPeople();
  return {
    title: form.id ? phrase("Edit group") : phrase("New group"),
    nameLabel: phrase("name"),
    name: form.name,
    pictureLabel: phrase("picture"),
    modes: [
      { key: "image", say: phrase("Send a picture"), on: form.mode === "image" },
      { key: "icon", say: phrase("Pick an icon"), on: form.mode === "icon" },
      { key: "letter", say: phrase("Just the first letter"), on: form.mode === "letter" }
    ],
    dropSay: form.imageSrc ? phrase("click to pick another") : phrase("click to pick · png, jpg or webp, up to 200 KB"),
    imageSrc: form.imageSrc || "",
    icons: GROUP_ICONS.map((key) => ({ key, sprite: `#${key}`, on: form.icon === key })),
    colours: GROUP_COLOURS.map((key) => ({ key, css: `var(--${key})`, on: form.colour === key })),
    letter: (form.name || "?").trim().slice(0, 1).toUpperCase() || "?",
    letterColour: `var(--${form.colour})`,
    membersLabel: phrase("who is in it · {n}", { n: form.members.size }),
    members: people.map((key) => ({ key, say: key === st.tasks.me ? phrase("you") : key, on: form.members.has(key), face: devFaceOf(key) })),
    warn: phrase("The group lives in the team's repo: everyone who uses the hive sees that it exists. Its tasks only show up for the people in it."),
    cancelSay: phrase("cancel"),
    saveSay: form.id ? phrase("save the group") : phrase("create group"),
    saveKeys: [...capsOf({ meta: true, code: "Enter" }).slice(0, -1), "↵"]
  };
}

function groupHeadOf(id) {
  const group = groupOf(id);
  if (!group) return null;
  const members = group.members || [];
  return {
    key: group.id,
    name: group.name,
    icon: groupIcon(group),
    faces: members.slice(0, 8).map((key) => ({ key, face: devFaceOf(key) })),
    meta: phrase("{n} people · created by {who}", { n: members.length, who: group.by === st.tasks.me ? phrase("you") : group.by }),
    editSay: phrase("edit group")
  };
}

function mentionModel() {
  const m = ui.mention;
  if (!m || !m.items.length) return null;
  return {
    people: m.items.filter((one) => one.kind === "person").map((one) => ({ ...one, on: m.items[m.index] === one })),
    chats: m.items.filter((one) => one.kind === "chat").map((one) => ({ ...one, on: m.items[m.index] === one })),
    peopleSay: phrase("people"),
    chatsSay: phrase("chats"),
    hint: phrase("↑ ↓ pick · enter inserts · esc closes")
  };
}

function footOf(inDetail) {
  const base = { close: phrase("close"), busy: ui.busy, mention: mentionModel(), confirm: ui.confirm };
  if (ui.form) return { ...base, form: true };
  if (inDetail) return { ...base, placeholder: phrase("comment… @ calls a person or a chat"), send: phrase("comment"), who: null };
  const inGroup = ui.section.startsWith("group:") ? groupOf(ui.section.slice(6)) : null;
  const options = [["me", phrase("just me")], ["team", phrase("team")]].concat(myGroups().map((one) => [`group:${one.id}`, one.name]));
  const chosen = ui.addWho || (inGroup ? `group:${inGroup.id}` : "me");
  return {
    ...base,
    placeholder: inGroup ? phrase("write a task in {group}…", { group: inGroup.name }) : phrase("write a task…"),
    send: phrase("add"),
    who: { label: phrase("Who sees it"), options: options.map(([key, say]) => ({ key, say, on: chosen === key })) }
  };
}

function sayOf() {
  return {
    placeholder: phrase("comment… @ calls a person or a chat"), send: phrase("comment"), busy: ui.busy,
    mention: ui.mentionBox === "tk-say" ? mentionModel() : null, confirm: ui.confirm
  };
}

function windowFootOf() {
  const base = {
    close: phrase("close"), busy: ui.busy, mention: ui.mentionBox === "tk-in" ? mentionModel() : null, confirm: null,
    noteKeys: capsOf(NOTE_KEY), moreSay: phrase("Actions"), moreKeys: capsOf({ meta: true, code: "KeyK" })
  };
  if (ui.form) return { ...base, form: true };
  const inGroup = ui.section.startsWith("group:") ? groupOf(ui.section.slice(6)) : null;
  const options = [["me", phrase("just me")], ["team", phrase("team")]].concat(myGroups().map((one) => [`group:${one.id}`, one.name]));
  const chosen = ui.addWho || (inGroup ? `group:${inGroup.id}` : "me");
  return {
    ...base,
    placeholder: inGroup ? phrase("write a task in {group}… @ calls a person or a chat", { group: inGroup.name }) : phrase("write a task… @ calls a person or a chat"),
    send: phrase("Add"),
    who: { label: phrase("Who sees it"), options: options.map(([key, say]) => ({ key, say, on: chosen === key })) }
  };
}

const SECTION_ICONS = { mine: "i-user", withMe: "i-hand", team: "i-globe", done: "i-check" };

function tasksWindowModel() {
  keepPicked();
  const counts = Object.fromEntries(SECTIONS.map(([key]) => [key, sectionOf(key).length]));
  const people = [...new Set(openOnes().map((task) => task.owner).filter((one) => one !== st.tasks.me))].sort();
  const task = ui.open ? st.tasks.list.find((one) => one.id === ui.open) : null;
  const inDetail = !!task && !ui.form;
  const section = ui.section.startsWith("dev:") ? "dev" : ui.section.startsWith("group:") ? "group" : ui.section;
  const [head, say] = ui.query ? ["Nothing matches.", "No task, person or chat by that name in this list."] : EMPTY[section] || ["Nothing open.", ""];
  const title = section === "dev" ? ui.section.slice(4) : section === "group" ? groupOf(ui.section.slice(6))?.name || "" : phrase(SECTIONS.find(([key]) => key === ui.section)?.[1] || "Mine");
  const rows = shownTasks().map(rowOf);
  const open = counts.mine + counts.withMe;
  return {
    key: "tasks",
    raycast: true,
    head: {
      icon: "i-list", title: phrase("Tasks"), count: open === 1 ? phrase("1 open") : phrase("{n} open", { n: open }),
      search: { placeholder: phrase("Search a task, a person or a chat"), value: ui.query },
      hints: [{ key: "tasks", keys: capsOf(st.keys.tasks), say: "" }], closeId: "tasks-close", closeSay: phrase("close")
    },
    groups_: rows.length ? [{ key: ui.section, say: title, rows }] : [],
    say: sayOf(),
    navLabel: phrase("task lists"),
    nav: SECTIONS.map(([key, say]) => ({ key, icon: SECTION_ICONS[key], say: phrase(say), n: counts[key], hot: key === "withMe" && counts[key] > 0, on: ui.section === key && !ui.form })),
    groupsLabel: phrase("groups"),
    groups: myGroups().map((one) => {
      const list = sectionOf(`group:${one.id}`);
      return { key: one.id, say: one.name, n: list.length, hot: list.some((t) => talkOf(t).hot), on: ui.section === `group:${one.id}` && !ui.form, icon: groupIcon(one) };
    }),
    newGroupSay: phrase("new group"),
    newGroupOn: !!ui.form && !ui.form.id,
    peopleLabel: phrase("people"),
    people: people.map((key) => ({ key, n: sectionOf(`dev:${key}`).length, face: devFaceOf(key), on: ui.section === `dev:${key}` && !ui.form })),
    view: ui.form ? "form" : inDetail ? "detail" : "list",
    title: section === "dev" ? ui.section.slice(4) : phrase(SECTIONS.find(([key]) => key === ui.section)?.[1] || "Mine"),
    hint: section === "dev" ? phrase("What this person has open, that you can see.") : phrase(HINTS[section] || ""),
    groupHead: section === "group" ? groupHeadOf(ui.section.slice(6)) : null,
    rows,
    empty: { head: phrase(head), say: phrase(say) },
    detail: inDetail ? detailOf(task) : null,
    form: ui.form ? formOf() : null,
    note: ui.note,
    noteBad: ui.noteBad,
    foot: windowFootOf()
  };
}

function tasksModel() {
  if (raycastOn()) return tasksWindowModel();
  const counts = Object.fromEntries(SECTIONS.map(([key]) => [key, sectionOf(key).length]));
  const people = [...new Set(openOnes().map((task) => task.owner).filter((one) => one !== st.tasks.me))].sort();
  const task = ui.open ? st.tasks.list.find((one) => one.id === ui.open) : null;
  const inDetail = !!task && !ui.form;
  const section = ui.section.startsWith("dev:") ? "dev" : ui.section.startsWith("group:") ? "group" : ui.section;
  const [head, say] = EMPTY[section] || ["Nothing open.", ""];
  return {
    key: "tasks",
    navLabel: phrase("task lists"),
    nav: SECTIONS.map(([key, say]) => ({ key, say: phrase(say), n: counts[key], hot: key === "withMe" && counts[key] > 0, on: ui.section === key && !ui.form })),
    groupsLabel: phrase("groups"),
    groups: myGroups().map((one) => {
      const list = sectionOf(`group:${one.id}`);
      return { key: one.id, say: one.name, n: list.length, hot: list.some((t) => talkOf(t).hot), on: ui.section === `group:${one.id}` && !ui.form, icon: groupIcon(one) };
    }),
    newGroupSay: phrase("+ new group"),
    newGroupOn: !!ui.form && !ui.form.id,
    peopleLabel: phrase("people"),
    people: people.map((key) => ({ key, n: sectionOf(`dev:${key}`).length, face: devFaceOf(key), on: ui.section === `dev:${key}` && !ui.form })),
    view: ui.form ? "form" : inDetail ? "detail" : "list",
    title: section === "dev" ? ui.section.slice(4) : phrase(SECTIONS.find(([key]) => key === ui.section)?.[1] || "Mine"),
    hint: section === "dev" ? phrase("What this person has open, that you can see.") : phrase(HINTS[section] || ""),
    groupHead: section === "group" ? groupHeadOf(ui.section.slice(6)) : null,
    rows: sectionOf(ui.section).map(rowOf),
    empty: { head: phrase(head), say: phrase(say) },
    detail: inDetail ? detailOf(task) : null,
    form: ui.form ? formOf() : null,
    note: ui.note,
    noteBad: ui.noteBad,
    foot: footOf(inDetail)
  };
}

let tasksView = null;

function paintTasks() {
  paintTasksButton();
  if (!tasksOn()) return;
  tasksView ||= mountTasks($("tasks-box"), { actions: ACTIONS });
  tasksView.show(tasksModel());
}

function paintTasksButton() {
  const btn = $("btn-tasks");
  if (!btn) return;
  const open = sectionOf("mine").length + sectionOf("withMe").length;
  const fresh = openOnes().some((task) => talkOf(task).hot) || sectionOf("withMe").some((task) => !(st.tasksSeen?.[task.id]));
  btn.querySelector("b").textContent = String(open);
  if (raycastOn()) {
    const say = $("tasks-say");
    if (say) say.textContent = open === 1 ? phrase("task") : phrase("tasks");
    btn.hidden = open === 0;
  }
  btn.classList.toggle("fresh", fresh);
  btn.title = phrase("your tasks ({key})", { key: keyHint("tasks") });
}

function markSeen(task) {
  if (!task) return;
  st.tasksSeen = { ...(st.tasksSeen || {}), [task.id]: Date.now() };
  try { localStorage.setItem("hive.tasksSeen", JSON.stringify(st.tasksSeen)); } catch {}
}

try { st.tasksSeen = JSON.parse(localStorage.getItem("hive.tasksSeen") || "{}") || {}; } catch { st.tasksSeen = {}; }

async function act(path, body, okNote = "") {
  ui.busy = true;
  paintTasks();
  const said = await ask(path, body);
  ui.busy = false;
  if (said.error) { tell(said.error, true); return null; }
  if (said.warning) tell(phrase("saved here, but it did not reach the team yet: {why}", { why: said.warning }), true);
  else tell(okNote);
  await pullTasks();
  return said;
}

const input = () => document.getElementById(ui.mentionBox || "tk-in");

function mentionAt(box) {
  const before = box.value.slice(0, box.selectionStart ?? box.value.length);
  const found = before.match(MENTION_AT);
  if (!found) return null;
  const query = found[2];
  const start = before.length - query.length - 1;
  const task = ui.open ? st.tasks.list.find((one) => one.id === ui.open) : null;
  const byName = (a, b) => (a.startsWith(query) === b.startsWith(query) ? a.localeCompare(b) : a.startsWith(query) ? -1 : 1);
  const people = knownPeople().filter((one) => one.includes(query)).sort(byName).slice(0, 6).map((key) => ({
    key: `p:${key}`, kind: "person", name: key, face: devFaceOf(key), match: query,
    sub: task && !seesTask(task, key) ? phrase("does not see this task") : key === st.tasks.me ? phrase("you") : ""
  }));
  const chats = liveChats().filter((one) => one.includes(query)).sort(byName).slice(0, 4).map((key) => ({
    key: `c:${key}`, kind: "chat", name: key, face: chatFace(key), match: query, sub: phrase("open")
  }));
  return { start, query, items: [...people, ...chats], index: 0 };
}

function pickMention(item) {
  const box = input();
  if (!box || !ui.mention) return;
  const end = ui.mention.start + ui.mention.query.length + 1;
  box.value = `${box.value.slice(0, ui.mention.start)}@${item.name} ${box.value.slice(end)}`;
  const caret = ui.mention.start + item.name.length + 2;
  box.setSelectionRange(caret, caret);
  ui.mention = null;
  paintTasks();
  box.focus();
}

function mentionedPeople(text) {
  const people = new Set(knownPeople());
  return [...new Set([...String(text).matchAll(MENTION_IN)].map((found) => found[1].slice(1)))].filter((name) => people.has(name));
}

async function sendComment(text, share = []) {
  const task = st.tasks.list.find((one) => one.id === ui.open);
  if (!task) return null;
  if (share.length) {
    const people = [...new Set([...(task.who === "people" ? task.people || [] : []), ...share])];
    const shared = await act("/api/tasks/edit", { id: task.id, who: "people", people });
    if (!shared) return null;
  }
  return act("/api/tasks/comment", { id: task.id, text });
}

function readPicture(file) {
  return new Promise((resolve) => {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) { resolve({ error: phrase("the group picture has to be a png, jpg or webp") }); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(PICTURE_SIDE, img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = side;
      canvas.height = side;
      const crop = Math.min(img.width, img.height);
      canvas.getContext("2d").drawImage(img, (img.width - crop) / 2, (img.height - crop) / 2, crop, crop, 0, 0, side, side);
      URL.revokeObjectURL(url);
      const data = canvas.toDataURL("image/webp", 0.85);
      const size = Math.ceil((data.length - data.indexOf(",") - 1) * 0.75);
      resolve(size > PICTURE_MAX ? { error: phrase("the group picture can be at most 200 KB — pick a smaller one") } : { data });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ error: phrase("the group picture has to be a png, jpg or webp") }); };
    img.src = url;
  });
}

const ACTIONS = {
  section(key) { ui.section = key; ui.addWho = ""; ui.open = ""; ui.form = null; ui.note = ""; ui.confirm = null; paintTasks(); },
  open(id) {
    if (raycastOn()) {
      pickTask(id);
      searchBox()?.focus();
      return;
    }
    ui.open = id;
    ui.handTo = "";
    ui.note = "";
    ui.confirm = null;
    markSeen(st.tasks.list.find((one) => one.id === id));
    paintTasks();
    input()?.focus();
  },
  search(text) { ui.query = text; ui.form = null; paintTasks(); },
  act: (key) => runAction(panelOf("tasks"), key),
  more: () => openActions(panelOf("tasks")),
  back() { ui.open = ""; ui.note = ""; ui.confirm = null; paintTasks(); },
  close: () => closeTasks(),
  goto(name) { closeTasks(); goTo(name); },
  openChat(id) {
    const task = st.tasks.list.find((one) => one.id === id);
    if (task?.seat) { closeTasks(); goTo(task.seat); }
  },
  addWho(key) { ui.addWho = key === "team" || key.startsWith("group:") ? key : "me"; },
  pickSeat(name) { ui.handTo = name; paintTasks(); },
  async toggle(id, done) { await act("/api/tasks/edit", { id, done }); },
  async share(id, who) {
    const task = st.tasks.list.find((one) => one.id === id);
    if (!task || task.who === who) return;
    if (who === "people") {
      const first = (task.people || []).length ? task.people : (st.team.devs || []).map((one) => one.dev).filter((one) => one && one !== st.tasks.me).slice(0, 1);
      if (!first.length) { tell(phrase("nobody else shows up on the team panel yet"), true); return; }
      await act("/api/tasks/edit", { id, who, people: first });
      return;
    }
    if (who === "group") {
      const first = myGroups()[0];
      if (!first) return;
      await act("/api/tasks/edit", { id, who, group: first.id });
      return;
    }
    await act("/api/tasks/edit", { id, who });
  },
  async pickGroup(id, group) { await act("/api/tasks/edit", { id, who: "group", group }); },
  async person(id, dev, on) {
    const task = st.tasks.list.find((one) => one.id === id);
    if (!task) return;
    const people = on ? [...new Set([...(task.people || []), dev])] : (task.people || []).filter((one) => one !== dev);
    if (!people.length) { tell(phrase("pick at least one person to share it with"), true); return; }
    await act("/api/tasks/edit", { id, people });
  },
  async start(id) {
    const said = await act("/api/tasks/start", { id }, phrase("opening a chat with this task as its mission"));
    if (said?.seat) await pull();
  },
  async assign(id) {
    if (!ui.handTo) return;
    const said = await act("/api/tasks/assign", { id, seat: ui.handTo }, phrase("handed to {seat}", { seat: ui.handTo }));
    if (said) ui.handTo = "";
  },
  async remove(id) {
    const said = await act("/api/tasks/remove", { id });
    if (said) { ui.open = ""; paintTasks(); }
  },
  newGroup() {
    ui.form = { id: "", name: "", mode: "icon", icon: GROUP_ICONS[0], colour: GROUP_COLOURS[0], imageData: "", imageSrc: "", members: new Set([st.tasks.me]) };
    ui.open = "";
    ui.note = "";
    paintTasks();
  },
  editGroup(id) {
    const group = groupOf(id);
    if (!group) return;
    ui.form = {
      id, name: group.name, mode: group.image ? "image" : "icon", icon: group.icon, colour: group.colour,
      imageData: "", imageSrc: group.image ? groupIcon(group).src : "", members: new Set(group.members || [])
    };
    ui.note = "";
    paintTasks();
  },
  formName(value) { if (ui.form) ui.form.name = value; },
  formMode(mode) { if (ui.form) { ui.form.mode = mode; paintTasks(); } },
  formIcon(icon) { if (ui.form) { ui.form.icon = icon; ui.form.mode = "icon"; paintTasks(); } },
  formColour(colour) { if (ui.form) { ui.form.colour = colour; paintTasks(); } },
  formMember(dev, on) {
    if (!ui.form) return;
    if (on) ui.form.members.add(dev);
    else ui.form.members.delete(dev);
    paintTasks();
  },
  async formPicture(file) {
    const read = await readPicture(file);
    if (read.error) { tell(read.error, true); return; }
    ui.form.imageData = read.data;
    ui.form.imageSrc = read.data;
    ui.form.mode = "image";
    ui.note = "";
    paintTasks();
  },
  cancelForm() { ui.form = null; ui.note = ""; paintTasks(); },
  async saveForm() {
    const form = ui.form;
    if (!form) return;
    const body = {
      name: form.name,
      icon: form.icon,
      colour: form.colour,
      members: [...form.members],
      ...(form.mode === "image" && form.imageData ? { imageData: form.imageData } : {}),
      ...(form.mode !== "image" && form.id ? { image: "" } : {})
    };
    const said = form.id
      ? await act("/api/tasks/groups/edit", { id: form.id, ...body })
      : await act("/api/tasks/groups", body);
    if (!said?.group) return;
    ui.form = null;
    ui.section = `group:${said.group.id}`;
    paintTasks();
  },
  typed(box) {
    if (raycastOn()) {
      if (!box) { if (ui.mention) { ui.mention = null; paintTasks(); } return; }
      ui.mentionBox = box.id;
    }
    ui.mention = mentionAt(box);
    paintTasks();
  },
  key(ev) {
    const m = ui.mention;
    if (!m || !m.items.length) return;
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      m.index = (m.index + (ev.key === "ArrowDown" ? 1 : -1) + m.items.length) % m.items.length;
      paintTasks();
      return;
    }
    if (ev.key === "Enter" || ev.key === "Tab") {
      ev.preventDefault();
      pickMention(m.items[m.index]);
      return;
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      ui.mention = null;
      paintTasks();
    }
  },
  mention(key) {
    const item = ui.mention?.items.find((one) => one.key === key);
    if (item) pickMention(item);
  },
  async confirmShare(share) {
    const pending = ui.confirm;
    ui.confirm = null;
    if (!pending) return;
    const said = await sendComment(pending.text, share ? pending.outsiders : []);
    const box = input();
    if (said && box) { box.value = ""; box.focus(); }
    if (said && !share) tell(phrase("{who} will not see this comment", { who: pending.outsiders.join(", ") }));
  },
  cancelConfirm() { ui.confirm = null; paintTasks(); },
  async submit(kind) {
    if (ui.form) return ACTIONS.saveForm();
    const raycast = raycastOn();
    const box = raycast ? document.getElementById(kind === "comment" ? "tk-say" : "tk-in") : input();
    const text = String(box?.value || "").trim();
    if (!text) return;
    ui.mention = null;
    if (raycast) ui.mentionBox = box.id;
    if (raycast ? kind === "comment" && ui.open : ui.open) {
      const task = st.tasks.list.find((one) => one.id === ui.open);
      const outsiders = mentionedPeople(text).filter((dev) => !seesTask(task, dev));
      if (outsiders.length) {
        const canShare = mine(task) && (task.who === "me" || task.who === "people");
        ui.confirm = {
          text, outsiders, canShare,
          say: phrase("{who} does not see this task.", { who: outsiders.join(", ") }),
          shareSay: phrase("share with {who} and comment", { who: outsiders.join(", ") }),
          justSay: phrase("just comment"),
          cancelSay: phrase("cancel")
        };
        paintTasks();
        return;
      }
      const said = await sendComment(text);
      if (said && box) { box.value = ""; box.focus(); }
      if (said) markSeen(st.tasks.list.find((one) => one.id === ui.open));
      return;
    }
    const inGroup = ui.addWho || (ui.section.startsWith("group:") ? ui.section : "me");
    const body = inGroup.startsWith("group:") ? { text, who: "group", group: inGroup.slice(6) } : { text, who: inGroup };
    const said = await act("/api/tasks", body);
    if (said && box) { box.value = ""; box.focus(); }
  }
};

const searchBox = () => $("tasks-box").querySelector("[data-pw-search]");

function pickTask(id) {
  ui.open = id;
  ui.handTo = "";
  ui.note = "";
  ui.confirm = null;
  ui.form = null;
  markSeen(st.tasks.list.find((one) => one.id === id));
  paintTasks();
  $("tasks-box").querySelector(`[data-task="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
}

function stepTask(step) {
  const shown = shownTasks();
  if (!shown.length) return;
  const at = shown.findIndex((task) => task.id === ui.open);
  pickTask(shown[(at + step + shown.length) % shown.length].id);
}

function taskActions() {
  const task = ui.open && !ui.form ? st.tasks.list.find((one) => one.id === ui.open) : null;
  const note = { key: "note", say: phrase("Write a task"), icon: "i-plus", combo: NOTE_KEY, go: () => document.getElementById("tk-in")?.focus() };
  if (!task) return [note];
  const seat = seatOf(task);
  const owned = mine(task);
  return [
    seat?.live ? { key: "chat", say: phrase("Open chat"), icon: "i-agent", primary: true, go: () => ACTIONS.openChat(task.id) }
      : owned && !task.done ? { key: "start", say: phrase("Start a chat"), icon: "i-agent", primary: true, go: () => ACTIONS.start(task.id) } : null,
    note,
    { key: "comment", say: phrase("Comment"), icon: "i-quote", go: () => document.getElementById("tk-say")?.focus() },
    owned ? { key: "done", say: task.done ? phrase("Open it again") : phrase("Mark done"), icon: "i-check", go: () => ACTIONS.toggle(task.id, !task.done) } : null,
    ...(task.prs || []).map((href, at) => ({ key: `pr${at}`, say: linksOf(task)[at].say, icon: "i-pr", group: phrase("Came back"), go: () => window.open(href, "_blank", "noreferrer") })),
    owned ? { key: "remove", say: phrase("Remove the task"), icon: "i-close", group: phrase("Task"), go: () => ACTIONS.remove(task.id) } : null
  ];
}

registerPanel("tasks", {
  el: () => $("tasks-box"),
  search: searchBox,
  list: () => $("tasks-box").querySelector(".tk-list"),
  actions: taskActions,
  step: stepTask,
  subject: () => st.tasks.list.find((one) => one.id === ui.open)?.text || phrase("Tasks")
});

function openTasks() {
  releaseKeyboard();
  $("tasks").classList.add("on");
  $("btn-tasks")?.setAttribute("aria-expanded", "true");
  paintTasks();
  pullTasks(true);
  setTimeout(() => (raycastOn() ? searchBox() : input())?.focus(), 30);
}

function closeTasks() {
  if (raycastOn()) leavePanel($("tasks"));
  $("tasks").classList.remove("on");
  $("btn-tasks")?.setAttribute("aria-expanded", "false");
  ui.open = "";
  ui.note = "";
  ui.form = null;
  ui.mention = null;
  ui.confirm = null;
  ui.query = "";
}

followRaycast((on) => {
  for (const name of ["pw", "compact"]) $("tasks-box").classList.toggle(name, on);
  if (tasksOn()) paintTasks();
});

$("btn-tasks")?.addEventListener("click", () => (tasksOn() ? closeTasks() : openTasks()));

$("btn-tasks-menu")?.addEventListener("click", () => { closeMore(); openTasks(); });

$("tasks").addEventListener("mousedown", (ev) => { if (ev.target === $("tasks")) closeTasks(); });

$("tasks").addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape" || ev.defaultPrevented) return;
  ev.preventDefault();
  ev.stopPropagation();
  if (ui.confirm) { ui.confirm = null; paintTasks(); return; }
  if (ui.form) { ui.form = null; paintTasks(); return; }
  if (ui.open && !raycastOn()) { ui.open = ""; paintTasks(); return; }
  closeTasks();
});

setTimeout(() => pullTasks(), 1500);
setInterval(() => pullTasks(), TASKS_POLL);

export { closeTasks, openTasks, paintTasks, pickTask, pullTasks, shownTasks, stepTask, taskActions, taskMatches, tasksModel, tasksOn, ui as tasksUi };
