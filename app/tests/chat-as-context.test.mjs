import test from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { SEATS_MIME, handleOf, seatsInLinks } = await app("chat-as-context");
const { clearPicks, isPicked, pickClick } = await app("seat-selection");

const fleet = () => [
  { name: "login-bug", title: "Bug do login", where: "local", state: "idle", structured: true },
  { name: "checkout", title: "Checkout", where: "local", state: "working", structured: true },
  { name: "api-cloud", title: "API na nuvem", where: "cloud", state: "idle", structured: true },
  { name: "segredo", title: "Segredo", where: "local", state: "idle", structured: true, anon: true },
  { name: "terminal-velho", title: "Terminal velho", where: "local", state: "idle", structured: false },
];

function hive() {
  st.data = { sessions: fleet(), spawning: [], archived: [], pod: { up: false, name: "" } };
  document.querySelectorAll(".tile, .item").forEach((el) => el.remove());
}

function railRow(name) {
  const row = document.createElement("div");
  row.className = "item";
  row.dataset.name = name;
  row.textContent = name;
  document.getElementById("rail-sessions").append(row);
  return row;
}

function tile(name, text = "") {
  const el = document.createElement("article");
  el.className = "tile";
  el.dataset.name = name;
  el.dataset.key = name;
  el.innerHTML = `<div class="t-head"></div><div class="sv"><form class="sv-composer"><div class="sv-well"><textarea></textarea></div></form></div>`;
  document.body.append(el);
  const box = el.querySelector("textarea");
  box.value = text;
  box.setSelectionRange(text.length, text.length);
  return { el, box, composer: el.querySelector(".sv-composer") };
}

function transfer(data = {}) {
  const held = new Map(Object.entries(data));
  return {
    get types() { return [...held.keys()]; },
    setData(kind, value) { held.set(kind, value); },
    getData(kind) { return held.get(kind) || ""; },
    setDragImage(el, x, y) { this.image = { el, x, y }; },
    effectAllowed: "",
    dropEffect: "",
  };
}

function fire(kind, on, dataTransfer) {
  const ev = new window.Event(kind, { bubbles: true, cancelable: true });
  ev.dataTransfer = dataTransfer;
  on.dispatchEvent(ev);
  return ev;
}

function pick(row) {
  row.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
  const carried = transfer();
  fire("dragstart", row, carried);
  return carried;
}

const frame = () => new Promise((done) => setTimeout(done, 40));

test("a chat is written by the name the person reads, or by its machine name when that name is taken", () => {
  hive();
  assert.equal(handleOf(st.data.sessions[0]), "bug-do-login");
  const twins = [...fleet(), { name: "login-bug-2", title: "Bug do login", where: "local" }];
  assert.equal(handleOf(twins[0], twins), "login-bug");
  assert.equal(handleOf({ name: "q4", title: "2026" }, [{ name: "q4", title: "2026" }]), "q4", "a handle made only of digits is never read as a chat");
});

test("picking a chat on the rail carries it as a chat and as its link, with a ghost that names it", async () => {
  hive();
  const row = railRow("login-bug");
  const carried = pick(row);
  assert.equal(row.draggable, true);
  assert.deepEqual(JSON.parse(carried.getData(SEATS_MIME)), ["login-bug"]);
  assert.equal(carried.getData("text/plain"), "hive://seat/login-bug");
  assert.equal(carried.effectAllowed, "copy");
  assert.match(carried.image.el.textContent, /Bug do login/);
  assert.ok(document.body.classList.contains("chat-dragging"));
  fire("dragend", row, carried);
  assert.equal(document.body.classList.contains("chat-dragging"), false);
  assert.notEqual(row.draggable, true);
  await frame();
  assert.equal(document.querySelector(".chat-drag-ghost"), null);
});

test("an anonymous chat, a draft and a closed chat cannot be picked up", () => {
  hive();
  for (const name of ["segredo", "draft:x1", "gone-chat"]) {
    const row = railRow(name);
    row.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
    assert.notEqual(row.draggable, true, `${name} became draggable`);
  }
});

test("dropping a chat on another chat's composer writes its handle at the caret, as a chip the box already paints", () => {
  hive();
  const row = railRow("login-bug");
  const target = tile("checkout", "olha o que ele achou");
  const carried = pick(row);
  const over = fire("dragover", target.box, carried);
  assert.equal(over.defaultPrevented, true);
  assert.equal(carried.dropEffect, "copy");
  assert.ok(target.composer.classList.contains("chat-drop-over"));
  fire("drop", target.box, carried);
  fire("dragend", row, carried);
  assert.equal(target.box.value, "olha o que ele achou #bug-do-login ");
  assert.equal(target.composer.classList.contains("chat-drop-over"), false);
});

test("the whole tile takes the drop, and a chat already in the text is not written twice", () => {
  hive();
  const row = railRow("login-bug");
  const target = tile("checkout", "#bug-do-login resume");
  target.box.setSelectionRange(0, 0);
  const carried = pick(row);
  fire("dragover", target.el.querySelector(".t-head"), carried);
  fire("drop", target.el.querySelector(".t-head"), carried);
  assert.equal(target.box.value, "#bug-do-login resume");
});

test("a chat is not dropped on itself, across machine and cloud, or on a chat with no composer", () => {
  hive();
  const row = railRow("login-bug");
  const self = tile("login-bug");
  const cloud = tile("api-cloud");
  const carried = pick(row);
  for (const one of [self, cloud]) {
    const over = fire("dragover", one.box, carried);
    assert.equal(over.defaultPrevented, false);
    assert.equal(carried.dropEffect, "none");
    fire("drop", one.box, carried);
    assert.equal(one.box.value, "");
  }
  const terminal = railRow("terminal-velho");
  assert.equal(fire("dragover", terminal, carried).defaultPrevented, false);
});

test("dropping on another chat's row opens that chat and puts the chip in its composer", async () => {
  hive();
  const row = railRow("login-bug");
  const other = railRow("checkout");
  const target = tile("checkout", "resume");
  let opened = "";
  other.addEventListener("click", () => { opened = other.dataset.name; });
  const carried = pick(row);
  fire("dragover", other, carried);
  assert.ok(other.classList.contains("chat-drop-over"));
  fire("drop", other, carried);
  assert.equal(opened, "checkout");
  await frame();
  assert.equal(target.box.value, "resume #bug-do-login ");
});

test("a chat link pasted in the composer becomes the chat's chip, and other text stays as it was", () => {
  hive();
  const here = { name: "checkout", side: "local" };
  assert.equal(seatsInLinks("hive://seat/login-bug", here), "#bug-do-login ", "a link at the end leaves a space, so the mention menu does not open on it");
  assert.equal(seatsInLinks("veja [o bug](hive://seat/login-bug) agora", here), "veja #bug-do-login agora");
  assert.equal(seatsInLinks("hive://seat/api-cloud", here), "", "a chat on the other side stays a link");
  assert.equal(seatsInLinks("hive://seat/checkout", here), "", "the chat's own link stays a link");
  assert.equal(seatsInLinks("hive://seat/ninguem e https://x.com", here), "");
});

test("pasting a chat link into a composer types the chip instead of the link", () => {
  hive();
  const target = tile("checkout", "fala com ");
  const ev = new window.Event("paste", { bubbles: true, cancelable: true });
  ev.clipboardData = { items: [{ type: "text/plain" }], getData: (kind) => (kind === "text/plain" ? "hive://seat/login-bug" : "") };
  let reachedTheBox = false;
  target.box.addEventListener("paste", () => { reachedTheBox = true; }, { once: true });
  target.box.dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(reachedTheBox, false, "the composer's own paste handling must not run on a link that already became a chip");
  assert.equal(target.box.value, "fala com #bug-do-login ");
});

test("a chat row of the palette carries its chat, whether it was listed by name or found by a message", () => {
  hive();
  const list = document.getElementById("pal-list");
  list.innerHTML = "";
  st.palRows = [{ sec: "Chats" }, { id: "seat:login-bug" }, { id: "msg:checkout" }, { id: "action:0" }];
  const rows = ["0", "1", "2"].map((i) => {
    const row = document.createElement("div");
    row.className = "pal-row";
    row.dataset.i = i;
    list.append(row);
    return row;
  });
  assert.deepEqual(JSON.parse(pick(rows[0]).getData(SEATS_MIME)), ["login-bug"]);
  fire("dragend", rows[0], transfer());
  assert.deepEqual(JSON.parse(pick(rows[1]).getData(SEATS_MIME)), ["checkout"]);
  fire("dragend", rows[1], transfer());
  rows[2].dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
  assert.notEqual(rows[2].draggable, true, "an action row is not a chat");
  list.innerHTML = "";
  st.palRows = [];
});

const choose = (name) => pickClick({ metaKey: true, ctrlKey: true, altKey: false, shiftKey: false, preventDefault() {} }, name, []);

test("dragging one of the chosen chats carries all of them, the dragged one first, and the drop clears the choice", () => {
  hive();
  clearPicks();
  st.data.sessions.push({ name: "deploy", title: "Deploy", where: "local", state: "idle", structured: true });
  const row = railRow("checkout");
  choose("login-bug");
  choose("checkout");
  choose("deploy");
  const target = tile("deploy", "junta estes:");
  const carried = pick(row);
  assert.deepEqual(JSON.parse(carried.getData(SEATS_MIME)), ["checkout", "login-bug", "deploy"]);
  assert.match(carried.image.el.textContent, /Checkout\+2/);
  const over = fire("dragover", target.box, carried);
  assert.equal(over.defaultPrevented, true, "a chosen chat that is the target itself does not refuse the drop");
  fire("drop", target.box, carried);
  fire("dragend", row, carried);
  assert.equal(target.box.value, "junta estes: #checkout #bug-do-login ");
  assert.equal(isPicked("checkout"), false, "the drop clears the choice");
});

test("dragging a chat that is not chosen carries only that chat and keeps the choice", () => {
  hive();
  clearPicks();
  choose("checkout");
  const row = railRow("login-bug");
  const carried = pick(row);
  assert.deepEqual(JSON.parse(carried.getData(SEATS_MIME)), ["login-bug"]);
  fire("dragend", row, carried);
  assert.equal(isPicked("checkout"), true);
  clearPicks();
});
