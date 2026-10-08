import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  commentOnTask, editGroup, editTask, GROUP_IMAGE_MAX, imageFromDataUrl, newGroup, readGroups, writeGroup, isShared, keptTasks, mentionsIn, newTask, readLocalTasks, readSharedTasks, seatOfErrand,
  seatsToTell, seesTask, sharedTaskFile, TASK_KEPT_DONE, taskMission, tasksOf, writeLocalTasks, writeSharedTask
} from "../lib/tasks.mjs";

const home = () => mkdtempSync(join(tmpdir(), "hive-tasks-"));

test("a task is born private to the person who wrote it", () => {
  const { task } = newTask({ text: "  trocar o token   do cofre ", owner: "rafael", at: 10 });
  assert.equal(task.text, "trocar o token do cofre");
  assert.equal(task.who, "me");
  assert.deepEqual(task.people, []);
  assert.match(task.id, /^t-[0-9a-f]{10}$/);
  assert.equal(isShared(task), false);
});

test("a task without words, or without a name for the person, is refused", () => {
  assert.ok(newTask({ text: "   ", owner: "rafael" }).error);
  assert.ok(newTask({ text: "algo", owner: "" }).error);
});

test("sharing with people needs at least one person, and never the owner", () => {
  assert.ok(newTask({ text: "x", owner: "rafael", who: "people", people: ["rafael"] }).error);
  const { task } = newTask({ text: "x", owner: "rafael", who: "people", people: ["mari", "Mari", "rafael", "no way"] });
  assert.deepEqual(task.people, ["mari"]);
});

test("who sees a task: the owner always, the team when shared, the people picked by name", () => {
  const mine = newTask({ text: "a", owner: "rafael" }).task;
  const team = newTask({ text: "b", owner: "rafael", who: "team" }).task;
  const picked = newTask({ text: "c", owner: "rafael", who: "people", people: ["mari"] }).task;
  assert.equal(seesTask(mine, "mari"), false);
  assert.equal(seesTask(team, "mari"), true);
  assert.equal(seesTask(picked, "mari"), true);
  assert.equal(seesTask(picked, "jonas"), false);
  assert.equal(seesTask(mine, "rafael"), true);
});

test("only the owner edits, closes or reshares a task", () => {
  const { task } = newTask({ text: "a", owner: "rafael", who: "team" });
  assert.ok(editTask(task, { done: true }, { me: "mari" }).error);
  const closed = editTask(task, { done: true }, { me: "rafael", at: 5 }).task;
  assert.equal(closed.done, true);
  assert.equal(closed.doneAt, 5);
  const reopened = editTask(closed, { done: false }, { me: "rafael" }).task;
  assert.equal(reopened.done, false);
  assert.equal(reopened.doneAt, undefined);
  const back = editTask(task, { who: "me" }, { me: "rafael" }).task;
  assert.equal(back.who, "me");
  assert.deepEqual(back.people, []);
});

test("a comment keeps who said it, and a chat's comment is marked as the chat's", () => {
  const { task } = newTask({ text: "a", owner: "rafael" });
  const said = commentOnTask(task, { who: "doacoes-capas", text: "subi 11 de 12", agent: true, at: 3 });
  assert.equal(said.task.comments.length, 1);
  assert.equal(said.comment.agent, true);
  assert.ok(commentOnTask(task, { who: "rafael", text: "  " }).error);
});

test("a comment reaches a chat only when it calls the chat by name, on the owner's machine", () => {
  const { task } = newTask({ text: "a", owner: "rafael" });
  const loose = commentOnTask(task, { who: "mari", text: "lembra das capas em PDF" }).comment;
  const called = commentOnTask(task, { who: "mari", text: "@doacoes-capas pode seguir sem a 88" }).comment;
  assert.deepEqual(mentionsIn(called.text), ["doacoes-capas"]);
  assert.deepEqual(seatsToTell(task, loose, { alive: ["doacoes-capas"], me: "rafael" }), []);
  assert.deepEqual(seatsToTell(task, called, { alive: ["doacoes-capas"], me: "rafael" }), ["doacoes-capas"]);
  assert.deepEqual(seatsToTell(task, called, { alive: ["doacoes-capas"], me: "mari" }), [], "a teammate's machine never types into the owner's chats");
  assert.deepEqual(seatsToTell(task, called, { alive: [], me: "rafael" }), []);
  assert.deepEqual(mentionsIn("mande pra alguem@example.com"), [], "an e-mail is not a mention");
});

test("private tasks stay in the hive home, shared ones in the shelf, one file each", () => {
  const here = home();
  const shelf = home();
  const mine = newTask({ text: "a", owner: "rafael" }).task;
  const team = newTask({ text: "b", owner: "mari", who: "team" }).task;
  writeLocalTasks(here, [mine]);
  writeSharedTask(shelf, team);
  assert.deepEqual(readLocalTasks(here).map((one) => one.id), [mine.id]);
  assert.ok(existsSync(sharedTaskFile(shelf, team.id)));
  assert.equal(JSON.parse(readFileSync(sharedTaskFile(shelf, team.id), "utf8")).owner, "mari");
  assert.deepEqual(readSharedTasks(shelf).map((one) => one.id), [team.id]);
  assert.deepEqual(readSharedTasks(""), []);
});

test("the list a person sees: their own, the team's, the ones passed to them; closed ones leave after 14 days", () => {
  const now = 100 * TASK_KEPT_DONE;
  const mine = newTask({ text: "a", owner: "rafael", at: 1 }).task;
  const hidden = newTask({ text: "b", owner: "mari", who: "people", people: ["jonas"], at: 2 }).task;
  const passed = newTask({ text: "c", owner: "mari", who: "people", people: ["rafael"], at: 3 }).task;
  const old = { ...newTask({ text: "d", owner: "rafael", at: 4 }).task, done: true, doneAt: now - TASK_KEPT_DONE - 1 };
  const seen = tasksOf({ local: [mine, old], shared: [hidden, passed], me: "rafael", now });
  assert.deepEqual(seen.map((one) => one.text), ["c", "a"]);
  assert.equal(keptTasks([old], now).length, 0);
});

test("a chat opened from a task is found again by the task's line, even after its name settles", () => {
  const errands = { "capas-1": { errand: "subir as capas", at: 1 }, "capas-2": { errand: "subir as capas", at: 5 }, other: { errand: "x", at: 9 } };
  assert.equal(seatOfErrand(errands, "subir as capas"), "capas-2");
  assert.equal(seatOfErrand(errands, "ninguém"), "");
});

test("the mission a chat gets carries the task and what was said on it", () => {
  const { task } = newTask({ text: "subir as capas", owner: "rafael" });
  const talked = commentOnTask(task, { who: "mari", text: "converte pra JPG antes" }).task;
  const mission = taskMission(talked, { me: "rafael" });
  assert.match(mission, /^subir as capas/);
  assert.match(mission, /mari: converte pra JPG antes/);
  assert.match(mission, new RegExp(task.id));
});

test("a group always has its creator, a known icon and colour, and no picture until one is sent", () => {
  const { group } = newGroup({ name: " Leitura ", icon: "i-nope", colour: "pink", members: ["mari", "Mari", "no way"], by: "rafael" });
  assert.equal(group.name, "Leitura");
  assert.deepEqual(group.members, ["rafael", "mari"]);
  assert.equal(group.icon, "i-book");
  assert.equal(group.colour, "accent");
  assert.equal(group.image, "");
  assert.ok(newGroup({ name: "  ", by: "rafael" }).error);
});

test("a group task is seen by the group's people and nobody else", () => {
  const { group } = newGroup({ name: "Leitura", members: ["mari"], by: "rafael" });
  const { task } = newTask({ text: "a", owner: "rafael", who: "group", group: group.id });
  assert.equal(seesTask(task, "mari", [group]), true);
  assert.equal(seesTask(task, "jonas", [group]), false);
  assert.ok(newTask({ text: "a", owner: "rafael", who: "group" }).error, "a group task names its group");
  const moved = editTask(task, { who: "me" }, { me: "rafael" }).task;
  assert.equal(moved.group, undefined);
});

test("only people in a group change it", () => {
  const { group } = newGroup({ name: "Leitura", members: ["mari"], by: "rafael" });
  assert.ok(editGroup(group, { name: "x" }, { me: "jonas" }).error);
  assert.equal(editGroup(group, { name: "Leitura BR" }, { me: "mari" }).group.name, "Leitura BR");
  assert.ok(editGroup(group, { members: [] }, { me: "mari" }).error);
});

test("a group picture is a small png, jpg or webp, checked by its bytes and not by its name", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  assert.equal(imageFromDataUrl(`data:image/png;base64,${png.toString("base64")}`).kind, "png");
  assert.ok(imageFromDataUrl(`data:image/png;base64,${Buffer.from("<svg onload=x>").toString("base64")}`).error);
  assert.ok(imageFromDataUrl("data:image/svg+xml;base64,PHN2Zz4=").error);
  const big = Buffer.concat([png, Buffer.alloc(GROUP_IMAGE_MAX)]);
  assert.ok(imageFromDataUrl(`data:image/png;base64,${big.toString("base64")}`).error);
});

test("groups live next to the team's tasks and are never read as tasks", () => {
  const shelf = home();
  const { group } = newGroup({ name: "Hive", by: "rafael" });
  writeGroup(shelf, group);
  assert.deepEqual(readGroups(shelf).map((one) => one.id), [group.id]);
  assert.deepEqual(readSharedTasks(shelf), []);
});
