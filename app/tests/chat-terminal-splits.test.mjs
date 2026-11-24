import { test } from "node:test";
import { assert, composerOf, core, drawerOf, lay, net, paneNames, pool, press, read, render, saved, settle, st, toggleKeys } from "./chat-terminal-harness.mjs";

const { IS_MAC } = core;

lay();
read("ada");

const drawer = () => drawerOf("ada");
const panes = () => [...drawer().querySelectorAll(".ct-panes > .ct-pane")];
const side = () => drawer().querySelector(".ct-side");
const tabNames = () => [...side().querySelectorAll(".ct-tab-name")].map((one) => one.textContent);
const hostOf = (name) => pool.get(name).host;
const inside = (name) => {
  const host = hostOf(name);
  host.focus();
  return host;
};
const BUTTON_OF = { KeyD: "ct-split", "shift+KeyD": "ct-split-down", KeyN: "ct-new", KeyW: "ct-kill" };
const drawerKey = (name, code, extra = {}) => {
  const host = inside(name);
  if (IS_MAC) {
    assert.ok(press(host, code, { metaKey: true, ...extra }).defaultPrevented, `${code} belongs to the drawer on the Mac`);
    return;
  }
  drawer().querySelector(`[data-act="${BUTTON_OF[`${extra.shiftKey ? "shift+" : ""}${code}`]}"]`).click();
};

test("one terminal shows the toolbar in the bar and no list beside it", async () => {
  net.nextNames.push("ada-1");
  toggleKeys(composerOf("ada"));
  await settle();
  assert.ok(!drawer().hidden);
  assert.deepEqual(paneNames("ada"), ["ada-1"]);
  assert.ok(side().hidden, "a lone terminal has no list beside it");
  const acts = [...drawer().querySelectorAll(".ct-acts > button")].map((one) => one.dataset.act);
  assert.deepEqual(acts, ["ct-split", "ct-split-down", "ct-new", "ct-kill"]);
  const label = (act) => drawer().querySelector(`[data-act="${act}"]`).getAttribute("aria-label");
  const keyed = (said, key) => (IS_MAC ? `${said} (${key})` : said);
  assert.equal(label("ct-split"), keyed("Split Terminal Horizontally", "⌘D"));
  assert.equal(label("ct-split-down"), keyed("Split Terminal Vertically", "⇧⌘D"));
  assert.equal(label("ct-new"), keyed("New Terminal", "⌘N"));
  assert.equal(label("ct-kill"), keyed("Close Terminal", "⌘W"));
  assert.equal(drawer().querySelector('[data-act="ct-kill"]').title, label("ct-kill"), "the title says the same, with no key off the Mac");
  assert.equal(drawer().querySelector(".ct-acts").getAttribute("role"), "group");
});

test("split puts a new shell of the same chat side by side, and it takes the keyboard", async () => {
  const before = net.shells.length;
  net.nextNames.push("ada-2");
  drawerKey("ada-1", "KeyD");
  await settle();
  assert.equal(net.shells.length, before + 1);
  assert.equal(net.shells.at(-1).of, "ada");
  assert.equal(net.shells.at(-1).cwd, "/tmp/ada");
  assert.deepEqual(paneNames("ada"), ["ada-1", "ada-2"]);
  assert.equal(drawer().querySelector(".ct-panes").style.gridTemplateColumns, "repeat(2, minmax(0, 1fr))");
  assert.ok(document.activeElement === hostOf("ada-2"), "the new terminal has the keyboard");
  assert.ok(!side().hidden, "two terminals bring the list");
  assert.deepEqual(tabNames(), ["Terminal 1", "Terminal 2"]);
  assert.equal(side().querySelector('[aria-current="true"]').textContent, "Terminal 2");
  assert.equal(side().querySelector(".ct-group").getAttribute("aria-label"), "Side by side, 2 terminals");
  assert.ok(panes()[1].classList.contains("on"));
});

test("split down stacks the group instead, right after the focused terminal", async () => {
  net.nextNames.push("ada-3");
  drawerKey("ada-1", "KeyD", { shiftKey: true });
  await settle();
  assert.deepEqual(paneNames("ada"), ["ada-1", "ada-3", "ada-2"]);
  const grid = drawer().querySelector(".ct-panes");
  assert.ok(grid.classList.contains("stacked"));
  assert.equal(grid.style.gridTemplateRows, "repeat(3, minmax(0, 1fr))");
  assert.equal(side().querySelector(".ct-group").getAttribute("aria-label"), "Stacked, 3 terminals");
  assert.ok(document.activeElement === hostOf("ada-3"));
});

test("off the Mac, a plain ctrl key typed in the terminal is the shell's and never the app's", async () => {
  if (IS_MAC) return;
  const before = { shells: net.shells.length, open: st.open };
  for (const code of ["KeyD", "KeyN", "KeyW", "KeyK", "KeyJ", "KeyU", "KeyE", "KeyH"]) {
    const ev = press(inside("ada-3"), code, { ctrlKey: true });
    assert.equal(ev.defaultPrevented, false, `ctrl+${code.slice(3)} reaches the shell`);
  }
  await settle();
  assert.equal(net.shells.length, before.shells);
  assert.equal(st.open, before.open);
  assert.ok(!drawer().hidden);
});

test("the drawer's chords stay with the rest of the app outside the drawer", async () => {
  const before = net.shells.length;
  const composer = composerOf("ada");
  composer.focus();
  press(composer, "KeyD", IS_MAC ? { metaKey: true } : { ctrlKey: true });
  await settle();
  assert.equal(net.shells.length, before);
  assert.equal(paneNames("ada").length, 3);
});

test("a group stops at four: the split buttons say so and nothing more opens", async () => {
  net.nextNames.push("ada-4");
  drawerKey("ada-2", "KeyD");
  await settle();
  assert.equal(paneNames("ada").length, 4);
  const split = drawer().querySelector('[data-act="ct-split"]');
  assert.equal(split.getAttribute("aria-disabled"), "true");
  assert.equal(split.getAttribute("aria-label"), "Split Terminal Horizontally (max 4 per group)");
  assert.equal(drawer().querySelector('[data-act="ct-split-down"]').getAttribute("aria-label"), "Split Terminal Vertically (max 4 per group)");
  const before = net.shells.length;
  drawerKey("ada-4", "KeyD");
  split.click();
  await settle();
  assert.equal(net.shells.length, before, "no fifth shell");
  assert.equal(paneNames("ada").length, 4);
});

test("new opens a terminal in a group of its own; the list shows both groups and picking one brings its panes back", async () => {
  net.nextNames.push("ada-5");
  drawerKey("ada-4", "KeyN");
  await settle();
  assert.deepEqual(paneNames("ada"), ["ada-5"]);
  assert.ok(document.activeElement === hostOf("ada-5"));
  const heads = [...side().querySelectorAll(".ct-group")].map((one) => one.getAttribute("aria-label"));
  assert.deepEqual(heads, ["Side by side, 4 terminals", "Single, 1 terminals"]);
  assert.deepEqual(tabNames(), ["Terminal 1", "Terminal 3", "Terminal 2", "Terminal 4", "Terminal 5"]);
  side().querySelector(".ct-group").click();
  await settle();
  assert.equal(paneNames("ada").length, 4, "the first group is back on screen");
  assert.ok(document.activeElement === hostOf("ada-1"), "with the group's first terminal focused");
});

test("the terminals belong to the chat: another chat has none, and coming back finds every one in its place", async () => {
  read("bea");
  await settle();
  assert.ok(!drawerOf("bea") || drawerOf("bea").hidden);
  read("ada");
  await settle();
  assert.ok(!drawer().hidden);
  assert.equal(paneNames("ada").length, 4);
  assert.equal(saved().ada.terminals.length, 5);
  assert.deepEqual(saved().ada.groups.map((group) => group.names.length), [4, 1]);
  assert.equal(saved().ada.groups[0].dir, "row");
});

test("clicking a pane makes it the active one, so close shuts it and the next of its group takes over", async () => {
  const pane = panes().find((one) => one.dataset.name === "ada-3");
  pane.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  await settle();
  assert.ok(pane.classList.contains("on"));
  assert.equal(side().querySelector('[aria-current="true"]').textContent, "Terminal 3");
  drawerKey("ada-3", "KeyW");
  await settle();
  assert.deepEqual(net.kills.at(-1), { name: "ada-3", where: "local" });
  assert.deepEqual(paneNames("ada"), ["ada-1", "ada-2", "ada-4"]);
  assert.ok(document.activeElement === hostOf("ada-2"), "the next one in the group has the keyboard");
});

test("the list works by keyboard: arrows walk it, Enter picks and focuses, the x closes one, Esc goes back to the shell", async () => {
  const names = () => [...side().querySelectorAll(".ct-tab-name")];
  names()[0].focus();
  document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", code: "ArrowDown", bubbles: true, cancelable: true }));
  assert.ok(document.activeElement === names()[1]);
  document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "End", code: "End", bubbles: true, cancelable: true }));
  assert.ok(document.activeElement === names().at(-1));
  document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", code: "Home", bubbles: true, cancelable: true }));
  assert.ok(document.activeElement === side().querySelector(".ct-group"), "the group heads are stops too");
  const two = names().find((one) => one.textContent === "Terminal 2");
  two.focus();
  two.click();
  await settle();
  assert.ok(document.activeElement === hostOf("ada-2"));
  const five = names().find((one) => one.textContent === "Terminal 5");
  five.focus();
  five.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
  await settle();
  assert.ok(document.activeElement === hostOf("ada-2"), "Esc goes to the active terminal, not the one under the cursor");
  const x = side().querySelector('.ct-tab-x[data-name="ada-5"]');
  assert.equal(x.getAttribute("aria-label"), "Close Terminal 5");
  x.focus();
  x.click();
  await settle();
  assert.deepEqual(net.kills.at(-1), { name: "ada-5", where: "local" });
  assert.deepEqual(tabNames(), ["Terminal 1", "Terminal 2", "Terminal 4"]);
});

test("a terminal that ends on its own leaves the others, and the last one closes the drawer", async () => {
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    const listed = (name) => ({ name, where: "local", kind: "shell", of: "ada", state: "idle", title: "Terminal", trees: [] });
    st.data.sessions = st.data.sessions.filter((one) => one.of !== "ada");
    st.data.sessions.push(listed("ada-1"), listed("ada-2"), listed("ada-4"));
    render();
    inside("ada-2");
    st.data.sessions = st.data.sessions.filter((one) => one.name !== "ada-2");
    render();
    clock += 9000;
    render();
    await settle();
    assert.ok(!drawer().hidden);
    assert.ok(!paneNames("ada").includes("ada-2"));
    assert.ok(drawer().contains(document.activeElement), "the keyboard stays in the drawer");
    const closed = [];
    for (let left = 3; left > 0 && !drawer().hidden; left -= 1) {
      const active = saved().ada.active;
      closed.push(active);
      drawerKey(active, "KeyW");
      await settle();
    }
    assert.deepEqual([...closed].sort(), ["ada-1", "ada-4"]);
    assert.ok(drawer().hidden, "closing the last terminal closes the drawer");
    assert.ok(document.activeElement === composerOf("ada"));
    assert.equal(saved().ada.terminals.length, 0);
  } finally {
    Date.now = realNow;
    st.data.sessions = st.data.sessions.filter((one) => one.of !== "ada");
    render();
  }
});
