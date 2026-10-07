import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { app, state } from "./dom.mjs";

const st = await state();
const { $ } = await app("core");
const { bootSolid } = await app("shared");
const { composerToViewModel, paintComposerTo } = await app("seat-layout");

const seat = (over) => ({ where: "local", state: "idle", kind: "chat", ...over });

function hive({ sessions = [], spawning = [], keys = [], mission = false }) {
  st.LIMIT = 4;
  st.data = { sessions, spawning, archived: [], pod: { up: false, name: "" } };
  st.blocks = [{ id: "b1", ws: "w0", label: "", manual: true, keys }];
  st.spaces = [{ id: "w0", name: "" }];
  st.space = "w0";
  st.block = 0;
  st.focus = 0;
  st.open = null;
  st.barOn = false;
  st.missionPinned = false;
  st.missionMode = mission;
  st.seatsKnown = true;
}

const aim = (title) => hive({ sessions: [seat({ name: "oi", title })], keys: ["oi"] });

test("the chip says where enter goes, as a destination and not as a label", () => {
  aim("");
  assert.equal(composerToViewModel().text, "→ oi", "a bare name reads as a tag, not as a destination");
  assert.equal(composerToViewModel().title, "enter sends it to oi");
  assert.equal(composerToViewModel().none, false);
});

test("the seat's own title wins over its name, and the arrow stays", () => {
  aim("saudação inicial");
  assert.equal(composerToViewModel().text, "→ saudação inicial");
  assert.equal(composerToViewModel().title, "enter sends it to oi", "the tooltip names the seat, which is what /kill and @ take");
});

test("in mission mode the chip does not go quiet — it names the other destination", () => {
  aim("");
  st.missionMode = true;
  assert.equal(composerToViewModel().text, "→ new chat");
  assert.equal(composerToViewModel().title, "enter opens a new chat");
  assert.equal(composerToViewModel().none, false, "the new-chat destination is a real one, not an absence");
});

test("with nothing in focus it says so, and says what to do", () => {
  hive({});
  assert.equal(composerToViewModel().text, "no seat in focus");
  assert.match(composerToViewModel().title, /\/new/);
  assert.equal(composerToViewModel().none, true);
});

test("a chat still opening takes the message, and says that too", () => {
  hive({ spawning: [{ id: "j1", title: "abrindo" }], keys: ["job:j1"] });
  assert.match(composerToViewModel().text, /booting/);
  assert.equal(composerToViewModel().none, true);
});

test("the chip is never hidden, and the screen reader hears the same sentence", () => {
  bootSolid();
  aim("");
  paintComposerTo();
  assert.equal($("cmp-to").hidden, false, "hiding it is how the mode became invisible in the first place");
  assert.equal($("cmp-to").textContent, "→ oi");
  assert.equal($("cmp-in").getAttribute("aria-label"), "enter sends it to oi");
});

test("nothing hides the chip any more", () => {
  bootSolid();
  aim("");
  st.missionMode = true;
  paintComposerTo();
  assert.equal($("cmp-to").hidden, false, "mission mode hides the destination again");
  assert.equal($("cmp-to").textContent, "→ new chat");
});

test("the two destinations do not look alike", () => {
  const page = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "app.html"), "utf8");
  assert.match(page, /#composer\.mission \.to \{[^}]*accent/, "mission mode paints the chip like the mode it is");
});
