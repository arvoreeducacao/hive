import { render } from "./arrange.js";
import { codeOf, isLeader, keyLabel, saveBindings, silenced, whichChord } from "./brand-face.js";
import { paintNotices } from "./chimes-and-notices.js";
import { $, ACTION_GROUPS, ACTION_SAID, ACTIONS, COOLS_AFTER, DEFAULT_LEADER, DIGIT_ACTIONS, IS_MAC, STALE_AFTER, digitSpan, esc, phrase, raycastOn, solidMounts, st } from "./core.js";
import { ago } from "./pod.js";
import { run } from "./themes.js";

function armLeader() {
  st.pending = true;
  $("mode").hidden = false;
  $("mode").classList.add("leader");
  $("mode-txt").textContent = `${keyLabel(st.leader)} …`;
  clearTimeout(st.whichTimer);
  st.whichTimer = setTimeout(showWhich, 350);
}

function disarmLeader() {
  if (!st.pending) return;
  st.pending = false;
  clearTimeout(st.whichTimer);
  $("which").classList.remove("on");
  $("mode").classList.remove("leader");
  $("mode-txt").textContent = "";
  $("mode").hidden = true;
}

function showWhich() {
  if (raycastOn()) return showWhichRaycast();
  const literal = st.typing && literalOf(st.leader)
    ? ` · <b>${keyLabel(st.leader)} ${keyLabel(st.leader)}</b> ${phrase("goes to the terminal")}`
    : "";
  $("which-head").innerHTML = `<span>${phrase("after")} <b>${keyLabel(st.leader)}</b>${phrase(", one key")}</span><span>${phrase("esc gives up{literal}", { literal: literal })}</span>`;
  $("which-grid").innerHTML = ACTIONS.filter(([a]) => st.chords[a])
    .map(([a, d]) => `<div><b>${keyLabel(st.chords[a])}</b><span>${d}</span></div>`).join("");
  $("which").classList.add("on");
}

function showWhichRaycast() {
  const literal = st.typing && literalOf(st.leader)
    ? ` · ${keyCaps(keyLabel(st.leader))} ${keyCaps(keyLabel(st.leader))} ${phrase("goes to the terminal")}`
    : "";
  $("which-head").innerHTML = `<span>${phrase("after")}</span>${keyCaps(keyLabel(st.leader))}<span>${phrase("one key")}</span><span class="grow"></span>${keyCaps("esc")}<span>${phrase("gives up")}${literal}</span>`;
  $("which-grid").innerHTML = ACTIONS.filter(([a]) => st.chords[a])
    .map(([a]) => {
      const said = phrase(ACTION_SAID[a], { limit: st.LIMIT });
      return `<div title="${esc(said)}">${keyCaps(keyLabel(st.chords[a]))}<span>${esc(said)}</span></div>`;
    }).join("");
  $("which").classList.add("on");
}

const MOD_GLYPHS = "⌃⌥⇧⌘";

const KEY_GLYPH = { Enter: "↵", Return: "↵", Esc: "esc", Escape: "esc", Space: "␣", Tab: "⇥" };

function keyParts(label) {
  const said = String(label || "").trim();
  if (!said || said === "—") return [];
  return said.split(/\s+/).flatMap((chunk) => {
    if (/\w\+./.test(chunk)) return chunk.split("+").filter(Boolean);
    const mods = [];
    let rest = chunk;
    while (rest.length > 1 && MOD_GLYPHS.includes(rest[0])) {
      mods.push(rest[0]);
      rest = rest.slice(1);
    }
    return [...mods, rest];
  }).map((one) => KEY_GLYPH[one] || one);
}

const keyCaps = (label) => keyParts(label).map((one) => `<span class="rc-key">${esc(one)}</span>`).join("");

function literalOf(b) {
  let ch = "";
  if (!b) return "";
  if (b.code.startsWith("Key")) ch = b.code.slice(3).toLowerCase();
  else if (/^Digit\d$/.test(b.code)) ch = b.code.slice(5);
  else if (b.code === "Space") ch = " ";
  else if (b.code === "BracketLeft") ch = "[";
  else if (b.code === "BracketRight") ch = "]";
  else return "";
  if (b.meta) return "";
  if (b.ctrl) {
    if (ch === " ") return "\x00";
    const up = ch.toUpperCase().charCodeAt(0);
    return up >= 64 && up <= 95 ? String.fromCharCode(up - 64) : "";
  }
  return b.alt ? `\x1b${ch}` : ch;
}

function sendLiteral() {
  const seq = literalOf(st.leader);
  const e = st.typing ? pool.get(st.typing) : null;
  if (!seq || !e || e.ws?.readyState !== 1) return;
  e.ws.send(seq);
}

function resolveLeader(e) {
  if (["Alt", "Shift", "Control", "Meta"].includes(e.key)) return;
  e.preventDefault();
  e.stopPropagation();
  const again = isLeader(e);
  disarmLeader();
  if (again) return sendLiteral();
  if (codeOf(e) === "Escape") return;
  const m = whichChord(e);
  if (!m) return;
  run(m.action, m.digit);
}

function keyHint(a) {
  if (st.leader && st.chords[a] && (silenced(a) || !st.keys[a])) return `${keyLabel(st.leader)} ${keyLabel(st.chords[a], null, digitSpan(a))}`;
  return keyLabel(st.keys[a], null, digitSpan(a));
}

function paintKeys() {
  const said = keysViewModel();
  for (const [id, hint] of said.hints) $(id).textContent = hint;
  paintNotices();
  $("k-pal").textContent = said.palette;
  keysLeaderSolid.show(said.leader);
  $("help-hint").innerHTML = said.hint;
  keysGridSolid.show(said.grid);
  document.querySelectorAll(".b-reconnect").forEach((b) => b.textContent = said.reconnect);
  document.querySelectorAll(".cover span").forEach((s) => s.textContent = said.cover);
}

let keysGridSolid = null;

let keysLeaderSolid = null;

const KEY_SLOTS = ["term", "dim", "bar", "accounts", "usage", "routines", "shelf", "memories", "day", "tasks", "plane", "history", "help"];

function keysLeaderModel() {
  if (!st.leader) {
    return {
      on: false, press: "", change: "", label: "", tail: "", direct: "", flip: "",
      off: phrase("one prefix ({n}) and then a single key, tmux style — with it on you can hand every {n2} combination back to Claude Code.", { n: keyLabel(DEFAULT_LEADER), n2: IS_MAC ? "⌥" : "ctrl" }),
      turn: phrase("turn the leader key on")
    };
  }
  return {
    on: true, off: "",
    press: phrase("press"),
    change: phrase("click to change"),
    label: st.capturing === "leader" ? "press…" : keyLabel(st.leader),
    tail: `${phrase("and then one key, tmux style — the second column below.")} Pressing it twice sends it to the terminal.`,
    turn: phrase("turn the leader key off"),
    direct: st.directMode === "off"
      ? phrase("the direct shortcuts are off — every {n} combination goes to Claude Code", { n: IS_MAC ? "⌥" : "ctrl" })
      : phrase("the direct shortcuts on the left work too"),
    flip: st.directMode === "off" ? phrase("bring them back") : phrase("turn them off")
  };
}

const FIXED_KEYS = () => [
  { key: "paste", combo: IS_MAC ? "⌘V" : "Ctrl+V", desc: phrase("pastes a screenshot into the focused session") },
  { key: "newline", combo: phrase("⇧Enter"), desc: phrase("breaks the line without sending, while you type in a session") },
  { key: "drop", combo: phrase("drag"), desc: phrase("drop a file on the session under the cursor — or on the new chat box") },
  { key: "swap", combo: phrase("drag"), desc: phrase("a seat by its title swaps places with the seat you drop it on") },
  { key: "escape", combo: phrase("Esc"), desc: phrase("leaves fullscreen") }
];

const SET_ONE = "no shortcut yet — click to set one";

function keyRow(a) {
  const capturing = st.capturing === a ? "direct" : st.capturing === `chord:${a}` ? "chord" : "";
  const chord = st.chords[a];
  return {
    key: a, action: a, muted: silenced(a), unset: !st.keys[a], capturing,
    title: silenced(a) ? phrase("off while the leader is on") : phrase(st.keys[a] ? "click to change" : SET_ONE),
    label: capturing === "direct" ? "press…" : keyLabel(st.keys[a], null, digitSpan(a)),
    chord: st.leader
      ? { unset: !chord, title: phrase(chord ? "click to change" : SET_ONE), label: capturing === "chord" ? "press…" : (chord ? keyLabel(chord) : "—") }
      : null,
    desc: phrase(ACTION_SAID[a], { limit: st.LIMIT })
  };
}

const rowSays = (row) => `${row.desc} ${row.combo || row.label || ""} ${row.chord?.label || ""}`.toLowerCase();

const keyWords = () => st.keysFilter.trim().toLowerCase().split(/\s+/).filter(Boolean);

const rowMatches = (row, words) => words.every((w) => rowSays(row).includes(w));

function keysGridModel() {
  const words = keyWords();
  const groups = ACTION_GROUPS
    .map(([key, title, actions]) => ({ key, title: phrase(title), rows: actions.map(keyRow).filter((row) => rowMatches(row, words)) }))
    .filter((group) => group.rows.length);
  const fixed = FIXED_KEYS().map((row) => ({ ...row, fixed: true })).filter((row) => rowMatches(row, words));
  if (fixed.length) groups.push({ key: "fixed", fixed: true, title: phrase("the ones you cannot change"), rows: fixed });
  const total = ACTIONS.length;
  const bound = ACTIONS.filter(([a]) => st.keys[a] || (st.leader && st.chords[a])).length;
  return {
    open: st.keysOpen,
    summary: phrase("{bound} of {total} actions answer a key — the rest are one click from having one", { bound, total }),
    toggle: st.keysOpen ? phrase("fold the list") : phrase("show them all"),
    edit: `<b>${phrase("Click a shortcut to change it")}</b> ${phrase("— press the new combination (Esc cancels). A shortcut with no {n} only works while the keyboard belongs to hive; if your system steals a combination (common with Alt on Linux, and with Ctrl+Esc on Windows), just pick another.", { n: IS_MAC ? "⌃/⌥/⌘" : "Ctrl/Alt" })}`,
    find: phrase("find an action…"),
    filter: st.keysFilter,
    head: {
      action: phrase("what it does"),
      direct: phrase("shortcut"),
      chord: st.leader ? phrase("after {n}", { n: keyLabel(st.leader) }) : null
    },
    groups,
    empty: groups.length ? "" : phrase("nothing here answers to that")
  };
}

function keysViewModel() {
  return {
    hints: [...KEY_SLOTS.map((slot) => [`k-${slot}`, keyHint(slot)]), ["k-plane-top", keyHint("plane")]],
    palette: keyHint("palette"),
    leader: keysLeaderModel(),
    grid: keysGridModel(),
    hint: `${phrase("By default the keyboard belongs to")} <b>${phrase("hive")}</b>${phrase(". Clicking inside a terminal — or pressing")} <code>${keyLabel(st.keys.type)}</code> ${phrase("on the focused session — hands the keyboard to the Claude Code in that session; the tile turns blue and the top bar says so. Click outside, or")} <code>${keyLabel(st.keys.release)}</code>${phrase(", to take it back.")}` +
      (st.leader ? ` ${phrase("With the")} <b>${phrase("leader key")}</b> ${phrase("on, the second column is what to press after")} <code>${keyLabel(st.leader)}</code> ${phrase("— that one works even while you are typing in a terminal.")}` : ""),
    reconnect: phrase("reconnect ({n})", { n: keyHint("reconnect") }),
    cover: phrase("click or {n} to type in this session", { n: keyHint("type") })
  };
}

solidMounts.push((hive) => {
  const grid = $("help-keys");
  const lead = $("help-leader");
  if (!grid || !lead) return;
  keysGridSolid = hive.mountKeysGrid(grid);
  keysLeaderSolid = hive.mountKeysLeader(lead);
  paintKeys();
});

const sameBinding = (x, b) => !!x && x.code === b.code && !!x.alt === b.alt && !!x.ctrl === b.ctrl && !!x.shift === b.shift && !!x.meta === b.meta;

function commitKeys(said) {
  st.capturing = null;
  paintKeys();
  render();
  saveBindings().catch(() => {});
}

function captureKey(e) {
  e.preventDefault();
  e.stopPropagation();
  if (["Alt", "Shift", "Control", "Meta"].includes(e.key)) return;
  if (codeOf(e) === "Escape" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    st.capturing = null;
    paintKeys();
    return;
  }
  const chord = st.capturing.startsWith("chord:");
  const action = chord ? st.capturing.slice(6) : st.capturing;
  const b = {
    alt: e.altKey, ctrl: e.ctrlKey, shift: e.shiftKey, meta: e.metaKey,
    code: DIGIT_ACTIONS.includes(action) && /^Digit[1-9]$/.test(codeOf(e)) ? "Digit" : codeOf(e)
  };
  if (st.capturing === "leader") {
    if (!(b.alt || b.ctrl || b.meta)) return;
    st.leader = b;
    return commitKeys();
  }
  if (DIGIT_ACTIONS.includes(action) && b.code !== "Digit") return;
  if (chord) {
    const owner = Object.entries(st.chords).find(([a, x]) => a !== action && sameBinding(x, b));
    if (owner) return;
    st.chords[action] = b;
    return commitKeys();
  }
  if (action === "release" && !(b.alt || b.ctrl || b.meta || b.shift)) return;
  const owner = Object.entries(st.keys).find(([a, x]) => a !== action && sameBinding(x, b));
  if (owner && st.explicitKeys.has(owner[0])) return;
  if (owner) st.keys[owner[0]] = null;
  st.keys[action] = b;
  st.explicitKeys.add(action);
  return commitKeys();
}

const tiles = new Map();

const pool = new Map();

const receiving = new Map();

const readMark = new Map();

const sawWorking = new Map();

const lastLively = new Map();

const lastMark = new Map();

function seatMark(s) {
  return `${s.raw ?? s.state}|${s.summary || ""}|${s.now || ""}|${s.history?.at(-1)?.at || ""}|${s.when || ""}`;
}

function markSeatRead(name) {
  const s = st.data.sessions.find((x) => x.name === name);
  if (s) readMark.set(name, seatMark(s));
}

const liveOf = (s) => (Array.isArray(s?.live) ? s.live : []);

function liveAge(s) {
  const at = Date.parse(s?.liveSince || "");
  return Number.isFinite(at) ? ago(new Date(at).toISOString()) : "";
}

function liveBadge(s) {
  const n = liveOf(s).length;
  if (!n) return "";
  const age = liveAge(s);
  return age ? `${n} · ${age}` : String(n);
}

function liveTitle(s) {
  const live = liveOf(s);
  if (!live.length) return "";
  const said = live.map((one) => one.said || one.kind).filter(Boolean).join(" · ");
  return said || phrase("{n} running", { n: live.length });
}

function stateOf(s) {
  const raw = s.raw ?? s.state;
  if (raw === "needs" || raw === "working") {
    if (raw === "working") sawWorking.set(s.name, Date.now());
    lastLively.set(s.name, Date.now());
    lastMark.set(s.name, seatMark(s));
    return raw;
  }
  const mark = seatMark(s);
  const seen = readMark.get(s.name);
  const before = lastMark.get(s.name);
  if (before !== mark) { lastLively.set(s.name, Date.now()); lastMark.set(s.name, mark); }
  if (seen === undefined) { readMark.set(s.name, mark); return raw; }
  if (seen !== mark && raw !== "done") return "answered";
  const since = sawWorking.get(s.name);
  if (raw === "idle" && since && Date.now() - since > STALE_AFTER && !liveOf(s).length) return "stalled";
  if (raw === "idle") {
    const touched = lastLively.get(s.name);
    if (touched && Date.now() - touched < COOLS_AFTER) return "ready";
  }
  return raw;
}

const previousState = new Map();

const jobName = new Map();

const justCreated = new Map();

export { KEY_SLOTS, armLeader, captureKey, commitKeys, disarmLeader, jobName, justCreated, keyCaps, keyHint, keyParts, keysGridModel, keysGridSolid, keysLeaderModel, keysLeaderSolid, keysViewModel, lastLively, lastMark, literalOf, liveAge, liveBadge, liveOf, liveTitle, markSeatRead, paintKeys, pool, previousState, readMark, receiving, resolveLeader, sameBinding, sawWorking, seatMark, sendLiteral, showWhich, stateOf, tiles };
