import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const TASK_MAX = 300;
export const TASK_COMMENT_MAX = 2000;
export const TASK_KEPT_DONE = 14 * 24 * 60 * 60 * 1000;
export const TASK_SHELF_DIR = "t";
export const TASK_WHO = ["me", "team", "people", "group"];
export const GROUP_DIR = "grupos";
export const GROUP_ICONS = ["i-book", "i-tree", "i-bolt", "i-db", "i-globe", "i-heart", "i-chart", "i-pen", "i-target", "i-camera", "i-mail", "i-flow"];
export const GROUP_COLOURS = ["accent", "green", "blue", "violet", "yellow"];
export const GROUP_IMAGE_MAX = 200 * 1024;
const GROUP_ID = /^g-[0-9a-f]{10}$/;
const IMAGE_KINDS = { png: [0x89, 0x50, 0x4e, 0x47], jpg: [0xff, 0xd8, 0xff], webp: [0x52, 0x49, 0x46, 0x46] };

const DEV = /^[a-z0-9][a-z0-9-]{0,30}$/;
const SEAT = /^[a-z0-9][a-z0-9-]{0,39}$/;
const TASK_ID = /^t-[0-9a-f]{10}$/;
const MENTION = /(^|[^\w@])@([a-z0-9][a-z0-9-]{0,39})/g;

export const isTaskId = (id) => TASK_ID.test(String(id || ""));
export const isGroupId = (id) => GROUP_ID.test(String(id || ""));

export const tasksFile = (home) => join(home, "tasks.json");
export const toldFile = (home) => join(home, "tasks-told.json");
export const sharedTaskDir = (shelf) => join(shelf, TASK_SHELF_DIR);
export const sharedTaskFile = (shelf, id) => join(sharedTaskDir(shelf), `${id}.json`);
export const groupDir = (shelf) => join(sharedTaskDir(shelf), GROUP_DIR);
export const groupFile = (shelf, id) => join(groupDir(shelf), `${id}.json`);

const oneLine = (text, max) => String(text || "").replace(/\s+/g, " ").trim().slice(0, max);

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const cleanPeople = (people, owner) =>
  [...new Set((Array.isArray(people) ? people : []).map((one) => String(one || "").trim().toLowerCase()))]
    .filter((one) => DEV.test(one) && one !== owner)
    .slice(0, 20);

export function readLocalTasks(home) {
  try {
    const kept = JSON.parse(readFileSync(tasksFile(home), "utf8"));
    return Array.isArray(kept?.tasks) ? kept.tasks.filter((one) => isTaskId(one?.id)) : [];
  } catch { return []; }
}

export function writeLocalTasks(home, tasks) {
  writeJson(tasksFile(home), { tasks });
}

export function readSharedTasks(shelf) {
  if (!shelf) return [];
  const dir = sharedTaskDir(shelf);
  if (!existsSync(dir)) return [];
  const found = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const one = JSON.parse(readFileSync(join(dir, name), "utf8"));
      if (isTaskId(one?.id) && `${one.id}.json` === name) found.push(one);
    } catch {}
  }
  return found;
}

export function writeSharedTask(shelf, task) {
  writeJson(sharedTaskFile(shelf, task.id), task);
}

export function dropSharedTask(shelf, id) {
  rmSync(sharedTaskFile(shelf, id), { force: true });
}

export function newTask({ text, owner, who = "me", people = [], group = "", from = "", at = Date.now() }) {
  const said = oneLine(text, TASK_MAX);
  const mine = String(owner || "").trim().toLowerCase();
  if (!said) return { error: "a task needs some words" };
  if (!DEV.test(mine)) return { error: "this hive has no name for you yet — set HIVE_DEV before writing tasks" };
  const seen = TASK_WHO.includes(who) ? who : "me";
  const chosen = seen === "people" ? cleanPeople(people, mine) : [];
  if (seen === "people" && !chosen.length) return { error: "pick at least one person to share it with" };
  if (seen === "group" && !isGroupId(group)) return { error: "pick the group this task belongs to" };
  const seat = String(from || "").trim().toLowerCase();
  const id = `t-${createHash("sha1").update(`${mine}|${at}|${said}|${Math.random()}`).digest("hex").slice(0, 10)}`;
  return {
    task: {
      id, text: said, owner: mine, who: seen, people: chosen, ...(seen === "group" ? { group } : {}), at,
      ...(SEAT.test(seat) ? { from: seat } : {}),
      seat: "", errand: "", done: false, comments: []
    }
  };
}

export const isShared = (task) => task?.who === "team" || task?.who === "people" || task?.who === "group";

const membersOf = (groups, id) => (groups || []).find((one) => one.id === id)?.members || [];

export const seesTask = (task, me, groups = []) =>
  !!task && (task.owner === me || task.who === "team"
    || (task.who === "people" && (task.people || []).includes(me))
    || (task.who === "group" && membersOf(groups, task.group).includes(me)));

export const ownsTask = (task, me) => !!task && task.owner === me;

export function editTask(task, change, { me, at = Date.now() }) {
  if (!ownsTask(task, me)) return { error: "only the person who wrote this task changes it — you can still comment" };
  const next = { ...task };
  if (change.text !== undefined) {
    const said = oneLine(change.text, TASK_MAX);
    if (!said) return { error: "a task needs some words" };
    next.text = said;
  }
  if (change.done !== undefined) {
    next.done = !!change.done;
    if (next.done) { next.doneAt = at; next.doneBy = me; }
    else { delete next.doneAt; delete next.doneBy; }
  }
  if (change.who !== undefined) {
    if (!TASK_WHO.includes(change.who)) return { error: "a task is yours, the team's, or for people you pick" };
    next.who = change.who;
    next.people = change.who === "people" ? cleanPeople(change.people ?? task.people, task.owner) : [];
    if (next.who === "people" && !next.people.length) return { error: "pick at least one person to share it with" };
    if (next.who === "group") {
      const group = change.group ?? task.group;
      if (!isGroupId(group)) return { error: "pick the group this task belongs to" };
      next.group = group;
    } else delete next.group;
  } else if (change.people !== undefined && next.who === "people") {
    next.people = cleanPeople(change.people, task.owner);
    if (!next.people.length) return { error: "pick at least one person to share it with" };
  }
  return { task: next };
}

export function linkSeat(task, { seat, errand = "" }) {
  const name = String(seat || "").trim().toLowerCase();
  if (!SEAT.test(name)) return { error: "that is not a chat name" };
  return { task: { ...task, seat: name, ...(errand ? { errand: oneLine(errand, 60) } : {}) } };
}

export function commentOnTask(task, { who, text, agent = false, at = Date.now() }) {
  const said = String(text || "").trim();
  if (!said) return { error: "a comment needs some words" };
  if (said.length > TASK_COMMENT_MAX) return { error: `a comment stops at ${TASK_COMMENT_MAX} characters` };
  const comments = Array.isArray(task.comments) ? task.comments : [];
  const comment = {
    id: `c-${createHash("sha1").update(`${task.id}|${who}|${at}|${said}|${comments.length}`).digest("hex").slice(0, 10)}`,
    who: String(who || ""),
    at,
    text: said,
    ...(agent ? { agent: true } : {})
  };
  return { task: { ...task, comments: comments.concat([comment]) }, comment };
}

export const mentionsIn = (text) => [...new Set([...String(text || "").matchAll(MENTION)].map((found) => found[2]))];

export function seatsToTell(task, comment, { alive = [], me } = {}) {
  if (!task || !comment || task.owner !== me) return [];
  const here = new Set((alive || []).map((one) => String(one || "").toLowerCase()));
  return mentionsIn(comment.text).filter((name) => here.has(name) && name !== comment.who);
}

export const taskLabel = (task) => oneLine(task?.text, 60);

export function taskMission(task, { me }) {
  const lines = [task.text];
  const talk = (task.comments || []).slice(-6).map((one) => `- ${one.who}: ${one.text}`);
  if (talk.length) lines.push("", "what was said on it so far:", ...talk);
  lines.push("", `this came from a task in ${me}'s task list in the hive (id ${task.id}). When it is done, say so in one line so ${me} can close it.`);
  return lines.join("\n");
}

export function readTold(home) {
  try {
    const kept = JSON.parse(readFileSync(toldFile(home), "utf8"));
    return Array.isArray(kept?.told) ? kept.told : [];
  } catch { return []; }
}

export function noteTold(home, ids) {
  const told = [...new Set(readTold(home).concat(ids))].slice(-500);
  writeJson(toldFile(home), { told });
  return told;
}

export function keptTasks(tasks, now = Date.now()) {
  return (tasks || []).filter((one) => !one.done || !one.doneAt || now - one.doneAt <= TASK_KEPT_DONE);
}

export function tasksOf({ local = [], shared = [], groups = [], me, now = Date.now() }) {
  const seen = new Map();
  for (const one of local) if (one.owner === me) seen.set(one.id, { ...one, where: "local" });
  for (const one of shared) if (seesTask(one, me, groups)) seen.set(one.id, { ...one, where: "shelf" });
  return keptTasks([...seen.values()], now).sort((a, b) => (Number(a.done) - Number(b.done)) || (b.at - a.at));
}

export function seatOfErrand(errands, label) {
  const wanted = oneLine(label, 60);
  if (!wanted) return "";
  const found = Object.entries(errands || {})
    .filter(([, one]) => one?.errand === wanted)
    .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))[0];
  return found ? found[0] : "";
}

export const taskCommitLine = (task, what) => `tarefas: ${task.id} · ${what} · ${oneLine(task.text, 80)}`;

export function readGroups(shelf) {
  if (!shelf) return [];
  const dir = groupDir(shelf);
  if (!existsSync(dir)) return [];
  const found = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const one = JSON.parse(readFileSync(join(dir, name), "utf8"));
      if (isGroupId(one?.id) && `${one.id}.json` === name) found.push(one);
    } catch {}
  }
  return found.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function writeGroup(shelf, group) {
  writeJson(groupFile(shelf, group.id), group);
}

export function imageKindOf(bytes) {
  const head = [...(bytes || []).subarray(0, 4)];
  return Object.entries(IMAGE_KINDS).find(([, magic]) => magic.every((byte, i) => head[i] === byte))?.[0] || "";
}

export function readGroupImage(shelf, group) {
  if (!shelf || !group?.image || !/^g-[0-9a-f]{10}\.(png|jpg|webp)$/.test(group.image)) return null;
  const file = join(groupDir(shelf), group.image);
  if (!existsSync(file)) return null;
  const bytes = readFileSync(file);
  const kind = imageKindOf(bytes);
  return kind ? { bytes, type: kind === "jpg" ? "image/jpeg" : `image/${kind}` } : null;
}

export function imageFromDataUrl(url) {
  const found = String(url || "").match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!found) return { error: "the group picture has to be a png, jpg or webp" };
  const bytes = Buffer.from(found[2], "base64");
  if (bytes.length > GROUP_IMAGE_MAX) return { error: "the group picture stops at 200 KB — pick a smaller one" };
  const kind = imageKindOf(bytes);
  if (!kind) return { error: "the group picture has to be a png, jpg or webp" };
  return { bytes, kind };
}

export function writeGroupImage(shelf, id, { bytes, kind }) {
  mkdirSync(groupDir(shelf), { recursive: true });
  for (const other of ["png", "jpg", "webp"]) rmSync(join(groupDir(shelf), `${id}.${other}`), { force: true });
  const name = `${id}.${kind}`;
  writeFileSync(join(groupDir(shelf), name), bytes);
  return name;
}

const cleanMembers = (members) =>
  [...new Set((Array.isArray(members) ? members : []).map((one) => String(one || "").trim().toLowerCase()))]
    .filter((one) => DEV.test(one))
    .slice(0, 60);

export function newGroup({ name, icon, colour, members, by, at = Date.now() }) {
  const said = oneLine(name, 40);
  const mine = String(by || "").trim().toLowerCase();
  if (!said) return { error: "a group needs a name" };
  if (!DEV.test(mine)) return { error: "this hive has no name for you yet — set HIVE_DEV before writing tasks" };
  const people = [...new Set([mine, ...cleanMembers(members)])];
  const id = `g-${createHash("sha1").update(`${mine}|${at}|${said}|${Math.random()}`).digest("hex").slice(0, 10)}`;
  return {
    group: {
      id, name: said,
      icon: GROUP_ICONS.includes(icon) ? icon : GROUP_ICONS[0],
      colour: GROUP_COLOURS.includes(colour) ? colour : GROUP_COLOURS[0],
      image: "", members: people, by: mine, at
    }
  };
}

export function editGroup(group, change, { me }) {
  if (!group) return { error: "no group with that id — it may have been removed" };
  if (!(group.members || []).includes(me) && group.by !== me) return { error: "only people in the group change it" };
  const next = { ...group };
  if (change.name !== undefined) {
    const said = oneLine(change.name, 40);
    if (!said) return { error: "a group needs a name" };
    next.name = said;
  }
  if (change.icon !== undefined) next.icon = GROUP_ICONS.includes(change.icon) ? change.icon : group.icon;
  if (change.colour !== undefined) next.colour = GROUP_COLOURS.includes(change.colour) ? change.colour : group.colour;
  if (change.members !== undefined) {
    next.members = cleanMembers(change.members);
    if (!next.members.length) return { error: "a group needs at least one person" };
  }
  if (change.image === "") next.image = "";
  return { group: next };
}

export const groupCommitLine = (group, what) => `tarefas: ${group.id} · grupo ${what} · ${oneLine(group.name, 60)}`;
