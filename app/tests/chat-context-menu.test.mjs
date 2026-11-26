import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state } from "./dom.mjs";

const st = await state();
const { structPool } = await app("structured-seats");
const menus = await app("chat-context-menu");

const copied = [];
Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text) => { copied.push(text); } }, configurable: true });

function chat(name, html, where = "local") {
  const host = document.createElement("div");
  host.className = "sv";
  host.innerHTML = `<div class="sv-scroll"><div class="sv-msg md">${html}</div></div>`;
  document.body.append(host);
  structPool.set(name, { name, where, host });
  return host;
}

function drop(name, host) {
  menus.closeContextMenu();
  structPool.delete(name);
  host.remove();
}

const rightClick = (el) => {
  const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 60 });
  el.dispatchEvent(ev);
  return ev;
};

const key = (el, said, extra = {}) => el.dispatchEvent(new KeyboardEvent("keydown", { key: said, bubbles: true, cancelable: true, ...extra }));

const shown = () => document.querySelector(".md-menu.md-ctx");

const labels = () => [...(shown()?.querySelectorAll("button") || [])].map((one) => one.textContent);

const settle = () => new Promise((done) => setTimeout(done, 0));

test("a right click on a web link in the chat opens the link menu instead of the browser's own", () => {
  st.data = { hub: "/h", sessions: [{ name: "api", where: "local", cwd: "/h/api" }] };
  const host = chat("api", '<p>veja <a href="https://example.com/doc" target="_blank">a doc</a></p>');
  try {
    const link = host.querySelector("a");
    const ev = rightClick(link);
    assert.equal(ev.defaultPrevented, true);
    assert.deepEqual(labels(), ["Open in system browser", "Copy link"]);
    assert.equal(shown().getAttribute("role"), "menu");
    assert.equal(shown().style.left, "40px");
    assert.equal(shown().style.top, "60px");
    assert.ok(document.activeElement === shown().querySelector("button"), "the first item takes the keyboard");
  } finally {
    drop("api", host);
  }
});

test("the panel browser is offered only where the hive has one, and names the chat it opens in", () => {
  const seat = { name: "api", where: "local" };
  assert.deepEqual(menus.linkMenuItems("https://a.dev", seat, { panel: true }).map((one) => one.label), ["Open in panel browser", "Open in system browser", "Copy link"]);
  assert.deepEqual(menus.linkMenuItems("https://a.dev", seat, { panel: false }).map((one) => one.label), ["Open in system browser", "Copy link"]);
  assert.deepEqual(menus.linkMenuItems("https://a.dev", null, { panel: true }).map((one) => one.label), ["Open in system browser", "Copy link"]);
});

test("copy link puts the address on the clipboard and closes the menu", async () => {
  const host = chat("api", '<p><a href="https://example.com/x?y=1">x</a></p>');
  try {
    copied.length = 0;
    rightClick(host.querySelector("a"));
    [...shown().querySelectorAll("button")].find((one) => one.textContent === "Copy link").click();
    await settle();
    await settle();
    assert.deepEqual(copied, ["https://example.com/x?y=1"]);
    assert.equal(shown(), null);
  } finally {
    drop("api", host);
  }
});

test("links outside the chat, and links that are not web addresses, keep the browser's menu", () => {
  const outside = document.createElement("a");
  outside.href = "https://example.com";
  document.body.append(outside);
  const host = chat("api", '<p><a href="#" class="md-shelf">page</a></p>');
  try {
    assert.equal(rightClick(outside).defaultPrevented, false);
    assert.equal(rightClick(host.querySelector("a")).defaultPrevented, false);
    assert.equal(shown(), null);
  } finally {
    outside.remove();
    drop("api", host);
  }
});

test("a file chip offers the editor, the folder and both paths, built from the chat's folder", async () => {
  st.data = { hub: "/h", sessions: [{ name: "api", where: "local", cwd: "/h/api/" }] };
  const host = chat("api", '<p><span class="ctx-chip md-chip" data-kind="file" data-path="src/app.ts" data-seat="api" data-where="local" data-line="42" tabindex="0">app.ts:42</span></p>');
  try {
    copied.length = 0;
    rightClick(host.querySelector(".md-chip"));
    const said = labels();
    assert.equal(said.length, 4);
    assert.equal(said[0], "Open in editor");
    assert.ok(["Reveal in Finder", "Show in folder"].includes(said[1]));
    assert.deepEqual(said.slice(2), ["Copy relative path", "Copy full path"]);
    [...shown().querySelectorAll("button")].find((one) => one.textContent === "Copy full path").click();
    await settle();
    await settle();
    rightClick(host.querySelector(".md-chip"));
    [...shown().querySelectorAll("button")].find((one) => one.textContent === "Copy relative path").click();
    await settle();
    await settle();
    assert.deepEqual(copied, ["/h/api/src/app.ts", "src/app.ts"]);
  } finally {
    drop("api", host);
  }
});

test("a cloud chat's file has no folder on this machine to show", () => {
  st.data = { hub: "/h", sessions: [{ name: "far", where: "cloud", cwd: "/workspace/repos/api" }] };
  const host = chat("far", '<p><span class="ctx-chip md-chip" data-kind="file" data-path="a.ts" data-seat="far" data-where="cloud" tabindex="0">a.ts</span></p>', "cloud");
  try {
    rightClick(host.querySelector(".md-chip"));
    assert.deepEqual(labels(), ["Open in editor", "Copy relative path", "Copy full path"]);
  } finally {
    drop("far", host);
  }
});

test("a file link the chip painter has not reached yet still finds its chat and its path", () => {
  st.data = { hub: "/h", sessions: [{ name: "api", where: "local", cwd: "/h/api" }] };
  const host = chat("api", '<p><a href="#" class="md-file" data-path="/h/api/lib/a.ts:9">a.ts</a> e <a href="#" class="md-file" data-path="/etc/hosts">hosts</a></p>');
  try {
    const [inside, outside] = host.querySelectorAll("a.md-file");
    const target = menus.menuTargetOf(inside);
    assert.ok(target.el === inside);
    assert.equal(target.items.length, 4);
    assert.equal(menus.menuTargetOf(outside), null, "a path outside the chat's folder is never offered");
  } finally {
    drop("api", host);
  }
});

test("revealing posts the chat and the path, and a refusal stays on the menu as an alert", async () => {
  st.data = { hub: "/h", sessions: [{ name: "api", where: "local", cwd: "/h/api" }] };
  const host = chat("api", '<p><span class="ctx-chip md-chip" data-kind="file" data-path="gone.ts" data-seat="api" data-where="local" tabindex="0">gone.ts</span></p>');
  const before = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push([String(url), JSON.parse(init.body)]);
    return { ok: false, json: async () => ({ error: "that file is not there any more" }) };
  };
  try {
    rightClick(host.querySelector(".md-chip"));
    shown().querySelectorAll("button")[1].click();
    await settle();
    await settle();
    assert.deepEqual(asked, [["/api/changes/reveal", { name: "api", where: "local", path: "gone.ts" }]]);
    assert.ok(shown(), "the menu stays so the reason can be read");
    assert.equal(shown().querySelector(".md-ctx-note[role=alert]").textContent, "that file is not there any more");
  } finally {
    globalThis.fetch = before;
    drop("api", host);
  }
});

test("shift+f10 on a focused chip opens the menu, the arrows walk it and escape gives the focus back", () => {
  st.data = { hub: "/h", sessions: [{ name: "api", where: "local", cwd: "/h/api" }] };
  const host = chat("api", '<p><span class="ctx-chip md-chip" data-kind="file" data-path="a.ts" data-seat="api" data-where="local" tabindex="0">a.ts</span></p>');
  try {
    const chip = host.querySelector(".md-chip");
    chip.focus();
    key(chip, "F10", { shiftKey: true });
    const items = [...shown().querySelectorAll("button")];
    assert.ok(document.activeElement === items[0]);
    key(items[0], "ArrowDown");
    assert.ok(document.activeElement === items[1]);
    key(items[1], "ArrowUp");
    key(items[0], "ArrowUp");
    assert.ok(document.activeElement === items.at(-1), "the arrows wrap around");
    key(items.at(-1), "Escape");
    assert.equal(shown(), null);
    assert.ok(document.activeElement === chip);
  } finally {
    drop("api", host);
  }
});

test("the context menu key opens it on a focused link, and tab closes it", () => {
  const host = chat("api", '<p><a href="https://example.com">x</a></p>');
  try {
    const link = host.querySelector("a");
    link.focus();
    key(link, "ContextMenu");
    assert.ok(shown());
    assert.equal(rightClick(link).defaultPrevented, true, "the echo the key sends right after is swallowed");
    assert.equal(document.querySelectorAll(".md-menu.md-ctx").length, 1);
    key(document.activeElement, "Tab");
    assert.equal(shown(), null);
    assert.ok(document.activeElement === link);
  } finally {
    drop("api", host);
  }
});

test("pressing anywhere else, or a right click on plain text, closes the menu", () => {
  const host = chat("api", '<p>texto <a href="https://example.com">x</a></p>');
  try {
    rightClick(host.querySelector("a"));
    assert.ok(shown());
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    assert.equal(shown(), null);
    rightClick(host.querySelector("a"));
    assert.equal(rightClick(host.querySelector("p")).defaultPrevented, false);
    assert.equal(shown(), null);
  } finally {
    drop("api", host);
  }
});

test("opening the link menu closes the table's copy menu, so only one menu is ever open", () => {
  const host = chat("api", '<div class="md-table"><div class="md-table-scroll"><table><thead><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></div><div class="md-tablebar"><button type="button" class="md-table-copy">c</button></div></div><p><a href="https://example.com">x</a></p>');
  try {
    host.querySelector(".md-table-copy").click();
    assert.equal(document.querySelectorAll(".md-menu").length, 1);
    rightClick(host.querySelector("a"));
    assert.equal(document.querySelectorAll(".md-menu").length, 1);
    assert.ok(shown());
  } finally {
    drop("api", host);
  }
});

const PR_2633 = "https://github.com/o/lead-engine/pull/2633";

test("a pull request link offers to link it to the chat in place of the one the hive found, and unlinking waits for a hand-made link", () => {
  st.data = { hub: "/h", sessions: [{ name: "retry", where: "local", cwd: "/h/sales" }] };
  st.prs = [{ key: "o/lead-engine#2648", number: 2648, session: "retry", state: "open" }];
  const host = chat("retry", `<p>o <a href="${PR_2633}">lead-engine#2633</a> é o da autenticação</p>`);
  try {
    rightClick(host.querySelector("a"));
    assert.deepEqual(labels(), ["Open in system browser", "Copy link", "Link to this chatin place of #2648", "Unlink from this chat"]);
    assert.equal(shown().querySelectorAll(".md-ctx-sep[role=separator]").length, 1);
    const [link, unlink] = [...shown().querySelectorAll("button")].slice(-2);
    assert.equal(link.disabled, false);
    assert.equal(link.querySelector(".md-ctx-hint").textContent, "in place of #2648");
    assert.equal(unlink.disabled, true);
    assert.equal(unlink.getAttribute("aria-disabled"), "true");
  } finally {
    drop("retry", host);
    st.prs = [];
  }
});

test("on the pull request linked by hand, only unlinking is offered, and the arrows skip what cannot be picked", () => {
  st.data = { hub: "/h", sessions: [{ name: "retry", where: "local", cwd: "/h/sales" }] };
  st.prs = [{ key: "o/lead-engine#2633", number: 2633, session: "retry", state: "merged", linked: true }];
  const host = chat("retry", `<p><a href="${PR_2633}/files">o PR</a></p>`);
  try {
    const link = host.querySelector("a");
    link.focus();
    key(link, "ContextMenu");
    const items = [...shown().querySelectorAll("button")];
    assert.equal(items.at(-2).disabled, true);
    assert.equal(items.at(-2).textContent, "Link to this chat");
    assert.equal(items.at(-1).disabled, false);
    assert.ok(document.activeElement === items[0]);
    key(items[0], "ArrowDown");
    key(items[1], "ArrowDown");
    assert.ok(document.activeElement === items.at(-1), "the arrow went past the item that cannot be picked");
    key(items.at(-1), "ArrowDown");
    assert.ok(document.activeElement === items[0]);
  } finally {
    drop("retry", host);
    st.prs = [];
  }
});

test("linking and unlinking post the chat and the link to the same routes the agent uses, then read the pull requests again", async () => {
  st.data = { hub: "/h", sessions: [{ name: "retry", where: "local", cwd: "/h/sales" }] };
  st.prs = [];
  const host = chat("retry", `<p><a href="${PR_2633}">o PR</a></p>`);
  const before = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (url, init) => {
    asked.push([String(url), init?.body ? JSON.parse(init.body) : null]);
    const answer = (ok, said) => ({ ok, json: async () => said, text: async () => JSON.stringify(said) });
    if (String(url).startsWith("/api/prs/link")) return answer(true, { ok: true, key: "o/lead-engine#2633", linked: "o/lead-engine#2633" });
    if (String(url).startsWith("/api/prs/unlink")) return answer(false, { error: "this chat has no pull request linked by hand" });
    return answer(true, { prs: [{ key: "o/lead-engine#2633", number: 2633, session: "retry", linked: true }] });
  };
  try {
    rightClick(host.querySelector("a"));
    [...shown().querySelectorAll("button")].find((one) => one.textContent.startsWith("Link to this chat")).click();
    for (let n = 0; n < 6; n++) await settle();
    assert.deepEqual(asked[0], ["/api/prs/link", { name: "retry", where: "local", url: PR_2633 }]);
    assert.ok(asked.some(([url]) => url === "/api/prs"), "the pull requests are read again so the chat shows the new one at once");
    assert.equal(shown(), null);
    assert.ok(st.prs.some((pr) => pr.key === "o/lead-engine#2633" && pr.linked));

    rightClick(host.querySelector("a"));
    [...shown().querySelectorAll("button")].find((one) => one.textContent === "Unlink from this chat").click();
    for (let n = 0; n < 6; n++) await settle();
    assert.deepEqual(asked.find(([url]) => url === "/api/prs/unlink"), ["/api/prs/unlink", { name: "retry", where: "local", url: PR_2633 }]);
    assert.equal(shown().querySelector(".md-ctx-note[role=alert]").textContent, "this chat has no pull request linked by hand");
  } finally {
    globalThis.fetch = before;
    drop("retry", host);
    st.prs = [];
  }
});

test("a pull request link outside any chat, or a link that is not a pull request, has no link items", () => {
  assert.deepEqual(menus.prMenuItems(PR_2633, null), []);
  assert.deepEqual(menus.prMenuItems("https://github.com/o/r/issues/1", { name: "a" }), []);
  assert.deepEqual(menus.prMenuItems("https://github.com/o/r/pulls", { name: "a" }), []);
  assert.equal(menus.pullKeyOf("https://github.com/o/r/pull/12/files#diff"), "o/r#12");
});

test("the menu wears the tone of the place it opened from, names itself only when told, and leaves nothing behind when it closes", () => {
  const owner = document.createElement("button");
  const toned = document.createElement("div");
  toned.dataset.tone = "warm";
  toned.append(owner);
  document.body.append(toned);
  try {
    menus.openContextMenu([{ label: "um", run: () => ({ ok: true }) }, { separator: true }, { label: "dois", hint: "atalho", disabled: true, run: () => ({ ok: true }) }], { x: 10, y: 20, owner });
    assert.equal(document.querySelectorAll(".md-menu.md-ctx").length, 1);
    assert.equal(shown().dataset.tone, "warm");
    assert.equal(shown().hasAttribute("aria-label"), false, "a menu opened with no label still says one");
    assert.deepEqual([...shown().children].map((one) => one.className || one.tagName), ["BUTTON", "md-ctx-sep", "BUTTON"]);
    const [first, last] = shown().querySelectorAll("button");
    assert.equal(first.tabIndex, -1);
    assert.equal(first.getAttribute("role"), "menuitem");
    assert.equal(last.disabled, true);
    assert.equal(last.getAttribute("aria-disabled"), "true");
    assert.equal(last.querySelector(".md-ctx-hint").textContent, "atalho");
    const swallowed = new MouseEvent("contextmenu", { bubbles: false, cancelable: true });
    shown().dispatchEvent(swallowed);
    assert.equal(swallowed.defaultPrevented, true, "a right click on the menu itself opened the browser's menu");
    menus.closeContextMenu();
    assert.equal(document.querySelector(".md-ctx"), null, "the closed menu stayed in the page");
  } finally {
    menus.closeContextMenu();
    toned.remove();
  }
});

test("opening a second menu replaces the first, so only one is ever in the page", () => {
  const items = [{ label: "um", run: () => ({ ok: true }) }];
  menus.openContextMenu(items, { x: 1, y: 1, label: "primeiro" });
  menus.openContextMenu(items, { x: 2, y: 2, label: "segundo" });
  try {
    assert.equal(document.querySelectorAll(".md-menu.md-ctx").length, 1);
    assert.equal(shown().getAttribute("aria-label"), "segundo");
  } finally {
    menus.closeContextMenu();
  }
});
