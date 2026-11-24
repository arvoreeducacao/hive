import { test } from "node:test";
import assert from "node:assert/strict";
import { app, dom, state, views } from "./dom.mjs";

const st = await state();
await views();
const { $ } = await app("core");
const { closePal, openPal, palKeys, palPaint, togglePalOption } = await app("palette");
await app("hold-numbers");

const asked = [];
let answer = () => ({ hits: [], total: 0 });

globalThis.fetch = async (url) => {
  asked.push(String(url));
  return { ok: true, json: async () => answer(new URL(String(url), "http://hive")) };
};

const settle = async () => { for (let i = 0; i < 8; i += 1) await new Promise((done) => setTimeout(done, 0)); };

const typeQuery = async (text) => {
  $("pal-q").value = text;
  $("pal-q").dispatchEvent(new dom.Event("input", { bubbles: true }));
  await new Promise((done) => setTimeout(done, 320));
  await settle();
};

const options = () => [...$("pal-opts").querySelectorAll(".pal-opt")].map((one) => [one.dataset.opt, one.getAttribute("aria-pressed")]);

test("the code search shows its three toggles only while it searches code", async () => {
  st.data = { ...(st.data || {}), pod: { up: false } };
  openPal("code");
  try {
    assert.equal($("pal-opts").hidden, false);
    assert.deepEqual(options(), [["matchCase", "false"], ["wholeWord", "false"], ["regex", "false"]]);
    openPal("file");
    assert.equal($("pal-opts").hidden, true);
  } finally { closePal(); }
});

test("each toggle travels to the server and the alt keys flip them", async () => {
  openPal("code");
  try {
    await typeQuery("canClose");
    assert.match(asked.at(-1), /\/api\/code\?where=local&q=canClose&case=0&word=0&regex=0$/);
    togglePalOption("matchCase");
    await settle();
    assert.match(asked.at(-1), /case=1&word=0&regex=0$/);
    const alt = new dom.KeyboardEvent("keydown", { key: "∑", code: "KeyW", altKey: true, bubbles: true, cancelable: true });
    palKeys(alt);
    assert.equal(alt.defaultPrevented, true);
    await settle();
    assert.match(asked.at(-1), /case=1&word=1&regex=0$/);
    assert.deepEqual(options(), [["matchCase", "true"], ["wholeWord", "true"], ["regex", "false"]]);
    assert.equal(JSON.parse(localStorage.getItem("hive.codeSearch")).wholeWord, true);
    togglePalOption("matchCase");
    togglePalOption("wholeWord");
  } finally { closePal(); }
});

test("a broken regular expression shows the reason instead of an empty list", async () => {
  answer = (url) => (url.searchParams.get("regex") === "1" ? { hits: [], total: 0, problem: "Unterminated group" } : { hits: [], total: 0 });
  openPal("code");
  try {
    togglePalOption("regex");
    await typeQuery("run(");
    palPaint();
    const list = $("pal-list").textContent;
    assert.match(list, /invalid regular expression/);
    assert.match(list, /Unterminated group/);
    togglePalOption("regex");
  } finally {
    closePal();
    answer = () => ({ hits: [], total: 0 });
  }
});

test("the hits are marked by what the search matched, not by the raw text", async () => {
  answer = () => ({ hits: [{ repo: "api", name: "api", path: "src/a.ts", line: 3, text: "lock unlocked lock" }], total: 1 });
  openPal("code");
  try {
    togglePalOption("wholeWord");
    await typeQuery("lock");
    palPaint();
    const marks = [...$("pal-list").querySelectorAll("mark")].map((one) => one.textContent);
    assert.deepEqual(marks, ["lock", "lock"]);
    togglePalOption("wholeWord");
  } finally {
    closePal();
    answer = () => ({ hits: [], total: 0 });
  }
});
