import { test } from "node:test";
import { assert, composerOf, core, drawerOf, fakeTerminal, focused, lay, net, pool, press, read, render, saved, selected, sentToShell, settle, st, tileOf, toggleKeys, wellOf } from "./chat-terminal-harness.mjs";

lay();
read("ada");

const bar = (name) => tileOf(name).querySelector('.chat-ctl [data-act="chat-terminal"]');
const killButton = (name) => drawerOf(name).querySelector('[data-act="ct-kill"]');

test("the terminal key opens a drawer at the bottom of the chat being read, with a shell in the chat's folder", async () => {
  assert.equal(drawerOf("ada"), null, "nothing is built before it is asked for");
  const ev = toggleKeys();
  assert.ok(ev.defaultPrevented);
  await settle();
  const drawer = drawerOf("ada");
  assert.ok(drawer && !drawer.hidden, "the drawer opens");
  assert.equal(drawer.parentElement, wellOf("ada"), "inside the chat's own well");
  assert.ok(wellOf("ada").classList.contains("ct-on"), "the conversation makes room for it");
  assert.equal(wellOf("ada").style.getPropertyValue("--ct-height"), "280px");
  assert.equal(net.shells.length, 1);
  assert.deepEqual({ ...net.shells[0], name: "" }, { where: "local", name: "", of: "ada", cwd: "/tmp/ada" });
  assert.match(net.shells[0].name, /^sh-[a-z0-9]{6,}$/, "a name of its own, known before the answer");
  assert.equal(drawer.querySelector(".ct-well > .host"), pool.get("ada-terminal").host, "the shell is mounted in the drawer");
  await settle();
  assert.equal(focused.at(-1), "ada-terminal", "an explicit open gives the terminal the keyboard");
  assert.equal(saved().ada.open, true);
  assert.equal(saved().ada.active, "ada-terminal");
});

test("the chat bar holds the toggle, says its key, and shows whether the drawer is open", async () => {
  const button = bar("ada");
  assert.ok(button, "the button is in the chat's controls");
  assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.match(button.title, core.IS_MAC ? /\(⌘J\)$/ : /\(Ctrl\+`\)$/);
  assert.ok(button.querySelector("svg.lu"), "with the panel-bottom icon");
  button.click();
  await settle();
  assert.ok(drawerOf("ada").hidden, "the button hides it");
  assert.equal(bar("ada").getAttribute("aria-pressed"), "false");
  assert.equal(net.kills.length, 0, "hiding never kills the shell");
  bar("ada").click();
  await settle();
  assert.ok(!drawerOf("ada").hidden);
  assert.equal(net.shells.length, 1, "showing it again brings the same shell back");
});

test("the key again hides it from inside the terminal, the shell lives on and the composer gets the keyboard", async () => {
  pool.get("ada-terminal").host.focus();
  toggleKeys(pool.get("ada-terminal").host);
  await settle();
  assert.ok(drawerOf("ada").hidden);
  assert.equal(net.kills.length, 0);
  assert.equal(document.activeElement, composerOf("ada"));
  toggleKeys(composerOf("ada"));
  await settle();
  assert.ok(!drawerOf("ada").hidden);
  assert.equal(net.shells.length, 1);
});

test("each chat has its own drawer: another chat has none until asked, and coming back finds it", async () => {
  read("bea");
  await settle();
  assert.ok(!drawerOf("bea") || drawerOf("bea").hidden, "the other chat's drawer is closed");
  assert.ok(!wellOf("bea").classList.contains("ct-on"));
  read("ada");
  await settle();
  assert.ok(!drawerOf("ada").hidden);
  assert.equal(drawerOf("ada").querySelector(".ct-well > .host"), pool.get("ada-terminal").host);
  assert.equal(net.shells.length, 1);
});

test("a chat in the cloud has the button turned off, and the key does nothing for it", async () => {
  read("cid");
  await settle();
  const button = tileOf("cid").querySelector('[data-act="chat-terminal"]');
  if (button) {
    assert.ok(button.disabled);
    assert.match(button.title, /this machine/);
  }
  const before = net.shells.length;
  toggleKeys(document.body);
  await settle();
  assert.equal(net.shells.length, before);
  assert.ok(!drawerOf("cid"));
  read("ada");
  await settle();
});

test("a chat this screen never opened a terminal for takes the shell it already has instead of opening another", async () => {
  fakeTerminal("bea-before");
  st.data.sessions.push({ name: "bea-before", where: "local", kind: "shell", of: "bea", state: "idle", title: "Terminal", trees: [] });
  try {
    read("bea");
    await settle();
    assert.equal(saved().bea, undefined, "nothing was kept for this chat yet");
    const before = net.shells.length;
    toggleKeys(composerOf("bea"));
    await settle();
    assert.equal(net.shells.length, before, "no new shell is opened");
    assert.equal(saved().bea.active, "bea-before");
    assert.equal(drawerOf("bea").querySelector(".ct-well > .host"), pool.get("bea-before").host);
    killButton("bea").click();
    await settle();
    assert.ok(drawerOf("bea").hidden);
  } finally {
    st.data.sessions = st.data.sessions.filter((one) => one.name !== "bea-before");
    read("ada");
    await settle();
  }
});

test("the grip resizes the drawer within bounds, by pointer or keys, and a double click puts it back at 280", () => {
  const drawer = drawerOf("ada");
  const well = wellOf("ada");
  well.getBoundingClientRect = () => ({ top: 0, left: 0, right: 900, bottom: 860, width: 900, height: 860 });
  const grip = drawer.querySelector(".ct-grip");
  assert.equal(grip.getAttribute("role"), "separator");
  grip.dispatchEvent(new PointerEvent("pointerdown", { button: 0, clientY: 500, bubbles: true }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientY: 440 }));
  window.dispatchEvent(new PointerEvent("pointerup", {}));
  assert.equal(well.style.getPropertyValue("--ct-height"), "340px", "dragging up grows it");
  grip.dispatchEvent(new PointerEvent("pointerdown", { button: 0, clientY: 500, bubbles: true }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientY: 2000 }));
  window.dispatchEvent(new PointerEvent("pointerup", {}));
  assert.equal(well.style.getPropertyValue("--ct-height"), "180px", "never below 180px");
  assert.equal(saved().ada.height, 180, "the height is kept for the chat");
  grip.focus();
  const up = new KeyboardEvent("keydown", { key: "ArrowUp", code: "ArrowUp", bubbles: true, cancelable: true });
  grip.dispatchEvent(up);
  assert.ok(up.defaultPrevented);
  assert.equal(well.style.getPropertyValue("--ct-height"), "204px", "the arrows move it too");
  grip.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  assert.equal(well.style.getPropertyValue("--ct-height"), "280px");
});

test("the close button kills the shell, closes the drawer and gives the composer the keyboard", async () => {
  killButton("ada").click();
  await settle();
  assert.ok(drawerOf("ada").hidden);
  assert.deepEqual(net.kills.at(-1), { name: "ada-terminal", where: "local" });
  assert.equal(saved().ada.active, "");
  assert.equal(document.activeElement, composerOf("ada"));
  assert.ok(!pool.has("ada-terminal"), "the closed terminal lets go of its screen");
});

test("a kill the server could not confirm keeps the shell, says so, and the button can try again", async () => {
  net.nextNames.push("ada-second");
  toggleKeys(composerOf("ada"));
  await settle();
  assert.equal(saved().ada.active, "ada-second");
  net.killRefused = true;
  try {
    killButton("ada").click();
    await settle();
    assert.ok(!drawerOf("ada").hidden, "the drawer stays");
    assert.equal(saved().ada.active, "ada-second");
    const title = drawerOf("ada").querySelector(".ct-title");
    assert.ok(title.classList.contains("bad"));
    assert.equal(title.getAttribute("role"), "alert");
    assert.match(title.textContent, /would not close|não fechou/);
  } finally {
    net.killRefused = false;
  }
  killButton("ada").click();
  await settle();
  assert.ok(drawerOf("ada").hidden, "the second try closes it");
  assert.equal(saved().ada.active, "");
});

test("a shell tied to a chat never shows up as a chat: not in a block, not in the palette, not in the rail", async () => {
  const { bringSeatIn, tidy } = await import("../src/app/blocks.js");
  const { openPal, closePal } = await import("../src/app/palette.js");
  fakeTerminal("ada-loose");
  st.data.sessions.push({ name: "ada-loose", where: "local", kind: "shell", of: "dee", state: "idle", title: "Terminal", trees: [] });
  try {
    render();
    assert.equal(bringSeatIn("ada-loose"), false, "going to it never puts it in a block");
    st.blocks[0].keys.push("ada-loose");
    tidy();
    assert.ok(!st.blocks.some((b) => b.keys.includes("ada-loose")), "and one already in a block is taken out");
    openPal();
    assert.ok(!st.palRows.some((row) => JSON.stringify(row).includes("ada-loose")), "the palette does not offer it");
    closePal();
    assert.ok(!document.querySelector('#rail [data-name="ada-loose"]'), "the rail does not list it");
  } finally {
    st.data.sessions = st.data.sessions.filter((one) => one.name !== "ada-loose");
    render();
  }
});

test("closing while the shell is still being opened kills the late shell instead of keeping it", async () => {
  read("bea");
  await settle();
  net.holdShells = true;
  try {
    toggleKeys(composerOf("bea"));
    await settle();
    assert.equal(net.held.length, 1);
    assert.match(drawerOf("bea").querySelector(".ct-pane-say").textContent, /Starting the terminal|Abrindo o terminal/);
    killButton("bea").click();
    await settle();
    assert.ok(drawerOf("bea").hidden);
    net.held.shift().go();
    await settle();
    assert.ok(net.kills.some((one) => one.name === "bea-terminal"), "the shell that arrived late is killed");
    assert.equal(saved().bea.terminals.length, 0, "and never kept");
  } finally {
    net.holdShells = false;
    net.held.length = 0;
  }
});

test("the composer keeps the keyboard when a terminal finishes starting while the person types", async () => {
  net.holdShells = true;
  try {
    net.nextNames.push("bea-late");
    toggleKeys(composerOf("bea"));
    await settle();
    assert.ok(drawerOf("bea").contains(document.activeElement), "the explicit open holds the drawer's place");
    composerOf("bea").focus();
    const before = focused.length;
    net.held.shift().go();
    await settle();
    await settle();
    assert.equal(saved().bea.active, "bea-late");
    assert.equal(document.activeElement, composerOf("bea"), "the composer still has the keyboard");
    assert.equal(focused.length, before, "the terminal never took the focus");
  } finally {
    net.holdShells = false;
    net.held.length = 0;
  }
});

test("a shell of the chat that the drawer lost track of is taken back instead of opening another", async () => {
  killButton("bea").click();
  await settle();
  fakeTerminal("bea-kept");
  st.data.sessions.push({ name: "bea-kept", where: "local", kind: "shell", of: "bea", state: "idle", title: "Terminal", trees: [] });
  try {
    render();
    await settle();
    const before = net.shells.length;
    toggleKeys(composerOf("bea"));
    await settle();
    assert.equal(net.shells.length, before, "no new shell is opened");
    assert.equal(saved().bea.active, "bea-kept");
    assert.equal(drawerOf("bea").querySelector(".ct-well > .host"), pool.get("bea-kept").host);
  } finally {
    killButton("bea").click();
    await settle();
    st.data.sessions = st.data.sessions.filter((one) => one.name !== "bea-kept");
    render();
  }
});

test("a shell that ends on its own closes the drawer after a short wait, and only the next key opens a new one", async () => {
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    read("ada");
    net.nextNames.push("ada-ends");
    toggleKeys(composerOf("ada"));
    await settle();
    const listed = { name: "ada-ends", where: "local", kind: "shell", of: "ada", state: "idle", title: "Terminal", trees: [] };
    st.data.sessions.push(listed);
    render();
    st.data.sessions = st.data.sessions.filter((one) => one.name !== "ada-ends");
    render();
    assert.ok(!drawerOf("ada").hidden, "one list without the shell is not its end");
    clock += 9000;
    render();
    assert.ok(drawerOf("ada").hidden, "gone for longer than the wait, the drawer closes");
    assert.equal(saved().ada.terminals.length, 0);
    const before = net.shells.length;
    toggleKeys(composerOf("ada"));
    await settle();
    assert.equal(net.shells.length, before + 1, "the next key opens a fresh one");
  } finally {
    Date.now = realNow;
  }
});

test("a ▶ on a one-line shell block of the answer runs it in the chat's terminal", async () => {
  const { enrichMarkdown } = await import("../src/app/markdown-rich.js");
  const { renderMarkdown } = await import("../assets/markdown.mjs");
  const message = document.createElement("div");
  message.className = "sv-msg md";
  message.innerHTML = renderMarkdown("```bash\nnpm test\n```\n\n```zsh\nls\npwd\n```\n\n```js\nconst a = 1;\n```");
  const conversation = document.createElement("div");
  conversation.className = "sv";
  conversation.addEventListener("click", (ev) => ev.stopPropagation());
  conversation.append(message);
  document.body.append(conversation);
  try {
    enrichMarkdown(message, { seat: { name: "ada", where: "local" } });
    const runs = [...message.querySelectorAll(".md-runterm")];
    assert.equal(runs.length, 1, "only the one-line shell block can be run");
    const [run] = runs;
    assert.match(run.getAttribute("aria-label"), /Run in terminal|Rodar no terminal/);
    assert.equal(run.nextElementSibling, message.querySelector(".md-copy"), "right before copy");
    const target = saved().ada.active;
    const sent = sentToShell.length;
    run.click();
    await settle();
    await settle();
    assert.ok(!drawerOf("ada").hidden, "the drawer opens");
    assert.deepEqual(sentToShell.slice(sent).at(-1), [target, "npm test\r"], "even inside a conversation that keeps its clicks to itself");
  } finally {
    conversation.remove();
  }
});

test("the ▶ starts a terminal when the chat has none, and runs the command once it is there", async () => {
  killButton("ada").click();
  await settle();
  const { enrichMarkdown } = await import("../src/app/markdown-rich.js");
  const { renderMarkdown } = await import("../assets/markdown.mjs");
  const message = document.createElement("div");
  message.className = "sv-msg md";
  message.innerHTML = renderMarkdown("```sh\ngit status\n```");
  document.body.append(message);
  try {
    enrichMarkdown(message, { seat: { name: "ada", where: "local" } });
    net.nextNames.push("ada-runs");
    const before = net.shells.length;
    message.querySelector(".md-runterm").click();
    await settle();
    await settle();
    assert.equal(net.shells.length, before + 1);
    assert.deepEqual(sentToShell.at(-1), ["ada-runs", "git status\r"]);
  } finally {
    message.remove();
  }
});

test("a code block in the person's own message, in a cloud chat or still being written gets no ▶", async () => {
  const { enrichMarkdown } = await import("../src/app/markdown-rich.js");
  const { renderMarkdown } = await import("../assets/markdown.mjs");
  const mine = document.createElement("div");
  mine.className = "sv-user";
  mine.innerHTML = renderMarkdown("```bash\nnpm test\n```");
  document.body.append(mine);
  const cloud = document.createElement("div");
  cloud.className = "sv-msg md";
  cloud.innerHTML = renderMarkdown("```bash\nnpm test\n```");
  const open = document.createElement("div");
  open.className = "sv-msg md";
  open.innerHTML = renderMarkdown("```bash\nnpm test\n```").replace('data-wrap="true"', 'data-wrap="true" data-open');
  try {
    enrichMarkdown(mine, { seat: { name: "ada", where: "local" } });
    enrichMarkdown(cloud, { seat: { name: "cid", where: "cloud" } });
    enrichMarkdown(open, { seat: { name: "ada", where: "local" } });
    assert.equal(mine.querySelector(".md-runterm"), null);
    assert.equal(cloud.querySelector(".md-runterm"), null);
    assert.equal(open.querySelector(".md-runterm"), null);
  } finally {
    mine.remove();
  }
});

test("right-click on a drawer terminal offers Select all, which selects what the terminal kept", async () => {
  const name = saved().ada.active;
  assert.ok(name && !drawerOf("ada").hidden);
  const pane = drawerOf("ada").querySelector(`.ct-pane[data-name="${name}"]`);
  const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 120, clientY: 140 });
  pane.dispatchEvent(ev);
  assert.ok(ev.defaultPrevented, "the drawer's menu replaces the chat's");
  const menu = document.querySelector(".term-menu");
  assert.ok(menu, "a menu opens");
  assert.equal(menu.getAttribute("role"), "menu");
  const items = [...menu.querySelectorAll(".term-mi")];
  assert.deepEqual(items.map((one) => one.textContent), ["Copy", "Select all", "Jump to latest"]);
  assert.ok(items[0].disabled, "nothing to copy yet");
  assert.ok(!items[1].disabled);
  assert.ok(items[2].disabled, "already at the latest output");
  assert.equal(document.activeElement, items[1], "the keyboard lands on the first thing it can do");
  items[1].click();
  await settle();
  assert.equal(document.querySelector(".term-menu"), null, "the menu goes away");
  assert.equal(selected.at(-1), name, "the terminal selected everything");
});

test("⌘K inside a drawer terminal clears it on the Mac; off the Mac ctrl+K is the shell's", async () => {
  const name = saved().ada.active;
  const host = pool.get(name).host;
  host.focus();
  const sent = sentToShell.length;
  const ev = press(host, "KeyK", core.IS_MAC ? { metaKey: true } : { ctrlKey: true });
  if (!core.IS_MAC) {
    assert.equal(ev.defaultPrevented, false);
    assert.equal(sentToShell.length, sent, "the drawer sends nothing of its own");
    return;
  }
  assert.ok(ev.defaultPrevented);
  assert.deepEqual(sentToShell.at(-1), [name, "\f"], "the shell gets ctrl+L");
  assert.ok(document.getElementById("pal").hidden, "the palette stays shut");
});
