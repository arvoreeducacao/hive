import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, dom, state } from "./dom.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");

const st = await state();
const { SV_ASK, SV_ASK_SLIM, esc, phrase } = await app("core");
const { palAt, pickSeat, roomTakesKey } = await app("pure-helpers");
const { DIFF_HUNK, diffLines, repaintToolDiffs } = await app("subagents-dock");
const { MCP_GLYPHS, TOOL_FACES, shortPath, toolArg, toolFace, toolSays, toolTitle } = await app("tool-face");
const { flipEnd, flipStart } = await app("seat-layout");
const { tiles } = await app("leader-key");
const { paintSlim } = await app("shared");
const { structPool } = await app("structured-seats");
const { svConvSeed, svConvTool, svConvToolLanded } = await app("conversation-model");
await app("hold-numbers");
st.calmOn = false;

function slice(from, to) {
  const a = page.indexOf(from);
  const b = page.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of app.html`);
  return page.slice(a, b);
}

/* ── the room keys the terminal is allowed to keep ── */

test("with the keyboard in a session a key the pty reads goes down to it", () => {
  assert.equal(roomTakesKey("compose", true), false);
});

test("a key the pty never reads stays with the hive", () => {
  assert.equal(roomTakesKey("compose", false), true);
});

test("the palette is taken whether or not the pty reads its key", () => {
  assert.equal(roomTakesKey("palette", true), true);
  assert.equal(roomTakesKey("palette", false), true);
});

test("with the keyboard in a session, opening it alone answers on a key the pty never reads", () => {
  const wasKeys = st.keys;
  const wasTyping = st.typing;
  st.mirrorDev = "jott4";
  st.mirrorOpen = false;
  st.team = { me: "rafa", devs: [{ dev: "jott4", up: true, seats: [] }] };
  st.typing = "a-seat";
  const press = (binding) => {
    st.keys = { fullscreen: binding };
    const ev = new dom.KeyboardEvent("keydown", { code: "KeyF", key: "f", bubbles: true, cancelable: true, altKey: !!binding.alt, ctrlKey: !!binding.ctrl, metaKey: !!binding.meta });
    document.dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  assert.equal(press({ meta: true, code: "KeyF" }), true, "fullscreen has to answer on a chord the terminal never sees");
  assert.equal(press({ alt: true, code: "KeyF" }), false, "a key the pty reads has to go down to it");
  assert.equal(press({ code: "KeyF" }), false, "a bare key would be taken from the session every time");
  st.keys = wasKeys;
  st.typing = wasTyping;
  st.mirrorDev = "";
});

/* ── the palette keeps the row, not the position ── */

const rows = (...ids) => ids.map((id) => ({ id }));

test("the selection follows the row when the doctor drops a warning above it", () => {
  const before = rows("env:node", "seat:a", "seat:b");
  const at = 2;
  assert.equal(before[at].id, "seat:b");
  const after = rows("seat:a", "seat:b");
  assert.equal(palAt(after, "seat:b", at), 1);
});

test("the selection follows the row when the doctor adds one above it", () => {
  const after = rows("env:node", "env:pod", "seat:a", "seat:b");
  assert.equal(palAt(after, "seat:b", 2), 3);
});

test("a row that is gone falls back to the nearest position, never past the end", () => {
  assert.equal(palAt(rows("seat:a", "seat:b"), "seat:gone", 7), 1);
  assert.equal(palAt(rows("seat:a", "seat:b"), "seat:gone", 0), 0);
  assert.equal(palAt([], "seat:a", 3), 0);
});

test("with no row remembered the position is kept", () => {
  assert.equal(palAt(rows("a", "b", "c"), "", 2), 2);
});

/* ── @name in the composer ── */

const seats = [
  { name: "rafa-api", title: "the api work" },
  { name: "rafa-front", title: "the front work" },
  { name: "solo", title: "" }
];

test("the whole name wins even when it is a prefix of another", () => {
  assert.equal(pickSeat([{ name: "rafa" }, { name: "rafael" }], "rafa").seat.name, "rafa");
});

test("an ambiguous prefix says so instead of picking the first in silence", () => {
  const got = pickSeat(seats, "rafa");
  assert.equal(got.seat, undefined);
  assert.match(got.error, /fits 2 seats/);
  assert.match(got.error, /the-api-work, the-front-work/, "it says the names the person reads, not the ones the machine handed out");
});

test("one near miss answers", () => {
  assert.equal(pickSeat(seats, "sol").seat.name, "solo");
});

test("a name nobody answers to is said out loud", () => {
  assert.match(pickSeat(seats, "zzz").error, /no seat called/);
});

/* ── what counts as a diff ── */

const CHANGELOG = [
  "# changelog",
  "",
  "--- unreleased ---",
  "+++ next +++",
  "- the fold no longer traps the block",
  "- the palette keeps the row",
  "+ a new coloured diff",
  "context line"
].join("\n");

const REAL = [
  "--- a/app/app.html",
  "+++ b/app/app.html",
  "@@ -1,4 +1,4 @@",
  " kept",
  "-gone",
  "+arrived",
  " kept"
].join("\n");

test("a changelog with --- and +++ and bullets is not a diff", () => {
  assert.equal(diffLines(CHANGELOG), null);
});

test("a unified diff with a real hunk is one", () => {
  assert.ok(diffLines(REAL));
  assert.match(REAL.split("\n")[2], DIFF_HUNK);
});

test("a hunk header alone, with nothing added or removed under it, is not a diff", () => {
  assert.equal(diffLines("@@ -1,2 +1,2 @@\n kept\n kept"), null);
});

test("the changes have to come after the hunk, not before it", () => {
  assert.equal(diffLines("- a bullet\n- another\n@@ -1,2 +1,2 @@"), null);
});

test("a big diff is still coloured — the old 600 line ceiling turned it off", () => {
  const body = Array.from({ length: 4000 }, (_, i) => (i % 2 ? `+line ${i}` : `-line ${i}`));
  const big = ["--- a/x", "+++ b/x", "@@ -1,4000 +1,4000 @@", ...body].join("\n");
  assert.equal(diffLines(big).length, 4003);
});

/* ── escaping ── */

test("esc closes the attribute hole: quotes never survive into html", () => {
  const nasty = 'x" onmouseover="alert(1)';
  const out = esc(nasty);
  assert.ok(!out.includes('"'));
  assert.ok(!out.includes("'"));
  assert.equal(esc("<b>&</b>"), "&lt;b&gt;&amp;&lt;/b&gt;");
});

/* ── the bits of the card ── */

const seatWithChat = (name) => {
  const host = document.createElement("div");
  host.innerHTML = `<div class="sv-composer"><textarea></textarea></div>`;
  document.body.appendChild(host);
  return {
    name, tag: name, where: "local", at: Date.now(), atBottom: false,
    scroll: { scrollTop: 0, scrollHeight: 0 }, host,
    tools: new Map(), subs: new Map(), conv: svConvSeed(), convView: null, subsView: null
  };
};

test("a replayed tool call is not given a start time it never had", () => {
  const e = seatWithChat("replay");
  const live = svConvTool(e, { id: "t1", name: "Bash", input: { command: "ls" } }, true);
  const replayed = svConvTool(e, { id: "t2", name: "Bash", input: { command: "ls" } }, false);
  assert.match(live.t0, /^\d+$/);
  assert.equal(replayed.t0, "");
});

test("the coloured diff is built for every tool card that carries one", () => {
  const e = seatWithChat("diffy");
  structPool.set(e.name, e);
  try {
    svConvTool(e, { id: "d1", name: "Edit", input: { file_path: "x" } }, true);
    svConvToolLanded(e, { tool_use_id: "d1", content: REAL }, true);
    const card = e.conv.blocks.find((one) => one.kind === "tool");
    assert.ok(card.diff, "the answer carried a diff and the card kept none of it");
    assert.deepEqual(card.diff.map((one) => one.cls), ["ctx", "ctx", "ctx", "ctx", "del", "add", "ctx"]);
    card.diff = null;
    repaintToolDiffs();
    assert.ok(card.diff, "a look that changes has to colour the cards already on screen again");
  } finally {
    structPool.delete(e.name);
  }
});

test("the one-line composer never shrinks over a draft, and never over the seat you are in", () => {
  const rules = [...page.matchAll(/^\s*(\S[^\n]*\.sv-composer[^\n]*)\{/gm)]
    .map((m) => m[1])
    .filter((r) => r.includes(":not(.focused)"));
  assert.ok(rules.length, "no shrinking rule at all");
  for (const r of rules) {
    assert.match(r, /:not\(\.open\)/, `${r} shrinks the seat that is open`);
    assert.match(r, /\.sv-composer:not\(\.ready\)/, `${r} shrinks over a draft`);
  }
});

test("the placeholder of a shrunk composer is short enough to be a whole sentence", () => {
  assert.ok(SV_ASK_SLIM.length <= 28, `"${SV_ASK_SLIM}" is too long for a one-line composer`);
  const e = seatWithChat("slim");
  structPool.set(e.name, e);
  try {
    const tile = document.createElement("div");
    const ta = e.host.querySelector("textarea");
    paintSlim(e.name, tile);
    assert.equal(ta.placeholder, phrase(SV_ASK_SLIM));
    tile.classList.add("focused");
    paintSlim(e.name, tile);
    assert.equal(ta.placeholder, phrase(SV_ASK));
    tile.classList.remove("focused");
    tile.classList.add("open");
    paintSlim(e.name, tile);
    assert.equal(ta.placeholder, phrase(SV_ASK));
  } finally {
    structPool.delete(e.name);
  }
});

/* ── the chip that says whose hive you are reading ── */

test("the mirror chip sits in the top bar at the height of the block chips beside it", () => {
  const rule = page.match(/^\s*#blocks[^\n]*\.team-av\.face[^\n]*\{([^}]*)\}/m);
  assert.ok(rule, "nothing sizes the face inside #blocks, so it keeps the size the rail gave it");
  const px = Number(rule[1].match(/height:\s*([\d.]+)px/)?.[1]);
  assert.ok(px > 0 && px <= 18, `a ${px}px face is taller than the row of text the chips are`);
  assert.match(page, /^\s*#blocks \.mirror-btn \{[^}]*align-items:\s*center/m,
    "on the baseline the face hangs above the text and the chip grows anyway");
});

test("the face keeps its own size everywhere it is not a chip", () => {
  const rule = page.match(/^\s*\.team-av\.face \{([^}]*)\}/m);
  assert.ok(rule, "no .team-av.face rule at all");
  assert.match(rule[1], /height:\s*30px/, "shrinking it here shrinks the rail and the knock too");
});

/* ── the face of a tool card ── */

test("every family's glyph is a symbol the sprite really defines", () => {
  const sprite = slice("<svg width=\"0\" height=\"0\"", "</defs></svg>");
  const glyphs = [...TOOL_FACES, ...MCP_GLYPHS].map((one) => one[1]);
  assert.ok(glyphs.length > 10, "the map lost its glyphs");
  for (const id of [...new Set(glyphs), "i-plug", "i-bolt"]) {
    assert.ok(sprite.includes(`id="${id}"`), `#${id} is drawn by nothing`);
  }
});

test("bash is the shell family and an unknown tool still gets a face", () => {
  assert.deepEqual(toolFace("Bash"), { glyph: "i-term", kind: "run", label: "Bash", server: "" });
  assert.equal(toolFace("SomeToolFromAPlugin").glyph, "i-bolt");
  assert.equal(toolFace("SomeToolFromAPlugin").kind, "misc");
});

test("an mcp call keeps the verb on the row and the server in the chip", () => {
  const f = toolFace("mcp__arvore-mysql__read_query");
  assert.equal(f.label, "read_query");
  assert.equal(f.server, "arvore-mysql");
  assert.equal(f.kind, "mcp");
  assert.equal(f.glyph, "i-db");
  assert.equal(toolFace("mcp__claude_ai_Gmail__send_message").server, "Gmail");
  assert.equal(toolFace("mcp__canopy__browser_act").glyph, "i-browser");
});

test("the row shows the command, not the walk to it", () => {
  const cmd = "cd /Users/jott4/Developer/arvore-hub/frontend && sed -n 1,120p Hybrid.tsx";
  assert.equal(toolArg("Bash", { command: cmd }), "sed -n 1,120p Hybrid.tsx");
  assert.equal(toolArg("Bash", { command: "cd a && cd b && ls" }), "ls");
  assert.equal(toolArg("Bash", { command: "cd /tmp" }), "cd /tmp");
  assert.equal(toolArg("Bash", { command: "grep -n foo \\\n  bar.js" }), "grep -n foo \\ bar.js");
});

test("a deep path keeps its tail and gives home back its tilde", () => {
  assert.equal(shortPath("/Users/jott4/Developer/arvore-hub/app/app.html"), "…/arvore-hub/app/app.html");
  assert.equal(shortPath("/Users/jott4/notes.md"), "~/notes.md");
  assert.equal(toolArg("Read", { file_path: "/Users/jott4/a/b/c/d.ts", offset: 40 }), "…/b/c/d.ts");
});

test("the argument is the field that carries the call, never the json around it", () => {
  assert.equal(toolArg("Grep", { pattern: "svToolCard", path: "/Users/jott4/app", output_mode: "content" }),
    "svToolCard · ~/app");
  assert.equal(toolArg("mcp__arvore-mysql__read_query", { query: "SELECT state,\n  COUNT(*)\nFROM t" }),
    "SELECT state, COUNT(*) FROM t");
  assert.equal(toolArg("TodoWrite", { todos: [
    { content: "one", status: "completed" },
    { content: "two", activeForm: "doing two", status: "in_progress" },
    { content: "three", status: "pending" }
  ] }), "1/3 · doing two");
  assert.equal(toolArg("AskUserQuestion", { questions: [{ question: "which icon?" }] }), "which icon?");
  assert.equal(toolArg("Odd", { limit: 3, on: true }), "limit: 3 · on: true");
  assert.equal(toolArg("Empty", null), "");
});

test("the hover keeps the whole command the row had to cut", () => {
  const cmd = "cd /Users/jott4/somewhere/deep && ls";
  assert.ok(toolTitle("Bash", { command: cmd }).includes(cmd));
});

/* ── the flip that carries a tile from one box to the other ── */

const HIDDEN = { left: 0, top: 0, width: 0, height: 0 };

function fakeTile() {
  return {
    isConnected: true,
    dataset: {},
    box: HIDDEN,
    moves: [],
    getBoundingClientRect() { return this.box; },
    animate(frames) { this.moves.push(frames[0].transform); return { finished: Promise.resolve() }; }
  };
}

function mosaic(names) {
  tiles.clear();
  names.forEach((name, i) => {
    const el = fakeTile();
    el.box = { left: 8 + i * 400, top: 8, width: 396, height: 500 };
    tiles.set(name, el);
  });
}

const zoomOn = (name) => {
  for (const [key, el] of tiles) el.box = key === name ? { left: 8, top: 8, width: 1196, height: 500 } : HIDDEN;
};

const zoomOff = (names) => names.forEach((name, i) => { tiles.get(name).box = { left: 8 + i * 400, top: 8, width: 396, height: 500 }; });

test("opening a seat alone moves only the seat that grew", () => {
  const names = ["a", "b", "c"];
  mosaic(names);
  const before = flipStart();
  zoomOn("c");
  flipEnd(before);
  assert.deepEqual(tiles.get("a").moves, []);
  assert.deepEqual(tiles.get("b").moves, []);
  assert.equal(tiles.get("c").moves.length, 1);
});

test("coming back to the mosaic moves only the seat that shrank, never the ones that were hidden", () => {
  const names = ["a", "b", "c"];
  mosaic(names);
  zoomOn("c");
  const before = flipStart();
  zoomOff(names);
  flipEnd(before);
  assert.deepEqual(tiles.get("a").moves, []);
  assert.deepEqual(tiles.get("b").moves, []);
  assert.equal(tiles.get("c").moves.length, 1);
});

test("a seat that grows starts on the box it grew out of, never at its full size somewhere else", () => {
  const names = ["a", "b", "c"];
  mosaic(names);
  const wide = tiles.get("c").box;
  const before = flipStart();
  zoomOn("c");
  flipEnd(before);
  const c = tiles.get("c");
  const tall = c.box;
  assert.equal(c.moves.length, 1);
  const sx = wide.width / tall.width;
  const sy = wide.height / tall.height;
  const dx = wide.left - tall.left;
  const dy = wide.top - tall.top;
  assert.equal(c.moves[0], `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`);
  assert.ok(sx < 1, "it starts smaller than it ends, which is what growing into place means");
});

test("the flip hands back what it set moving, so the browser can wait for it to land", () => {
  const names = ["a", "b", "c"];
  mosaic(names);
  const before = flipStart();
  zoomOn("c");
  const flights = flipEnd(before);
  assert.equal(flights.length, 1);
  assert.ok(flights[0].finished instanceof Promise);
  assert.deepEqual(flipEnd(null), []);
});

test("a seat that really changes cell in the mosaic still travels", () => {
  const names = ["a", "b", "c"];
  mosaic(names);
  const before = flipStart();
  const a = tiles.get("a"), b = tiles.get("b");
  const swap = a.box;
  a.box = b.box;
  b.box = swap;
  flipEnd(before);
  assert.equal(a.moves.length, 1);
  assert.equal(b.moves.length, 1);
  assert.equal(a.moves[0], "translate(-400px, 0px)");
  tiles.clear();
});

test("the running line names an mcp tool by its own name and server, not the wire name", () => {
  assert.equal(toolSays("mcp__hive__browser_eval"), "browser_eval · hive");
  assert.equal(toolSays("mcp__claude_ai_Slack__slack_send_message"), "slack_send_message · Slack");
  assert.equal(toolSays("Bash"), "Bash");
});
