import { render } from "./arrange.js";
import { phrase, raycastOn, st } from "./core.js";
import { draftItem, drafts } from "./draft-seat.js";
import { editors } from "./files-editor.js";
import { jobName, justCreated } from "./leader-key.js";
import { isShelved, sweepSeatMarks } from "./seat-marks.js";
import { swapSeats } from "./tiles.js";

let seq = 0;

const newId = () => `b${Date.now().toString(36)}${++seq}`;

const SPACE_TINTS = ["#CD694A", "#4A7C8C", "#8A7CB0", "#4EA96F", "#E0AF68", "#7DCFFF"];

function readSpaces() {
  try {
    const raw = JSON.parse(localStorage.getItem("hive.spaces") || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((w) => w && typeof w.id === "string" && w.id).map((w, i) => ({
      id: w.id,
      name: String(w.name || ""),
      tint: SPACE_TINTS.includes(w.tint) ? w.tint : SPACE_TINTS[i % SPACE_TINTS.length]
    }));
  } catch { return []; }
}

function readBlocks() {
  try {
    const raw = JSON.parse(localStorage.getItem("hive.blocks") || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((b) => b && Array.isArray(b.keys)).map((b) => ({
      id: b.id || newId(), ws: String(b.ws || ""), label: String(b.label || ""), manual: !!b.manual,
      keys: b.keys.filter((c) => typeof c === "string").slice(0, st.LIMIT)
    }));
  } catch { return []; }
}

const soloSeat = (() => {
  try { return String(new URLSearchParams(location.search).get("seat") || "").trim(); } catch { return ""; }
})();

function readDetached() {
  try {
    const raw = JSON.parse(localStorage.getItem("hive.detached") || "[]");
    return Array.isArray(raw) ? raw.filter((c) => typeof c === "string") : [];
  } catch { return []; }
}

const detached = new Set(soloSeat ? [] : readDetached());

const WAKES_ON = new Set(["working", "needs"]);

const HIDE_UNTIL = new Set(["works", "ends", "parked"]);

const armsNow = (until, state) => (until === "ends" ? state === "working" : !WAKES_ON.has(state));

const backNow = (one, state) => (one.until === "ends" ? state === "needs" || (one.armed && state !== "working") : one.armed && WAKES_ON.has(state));

const SEAT_GRACE = 60000;

function seatGrace() {
  const missingSince = new Map();
  return (key, alive) => {
    for (const back of missingSince.keys()) if (alive.has(back)) missingSince.delete(back);
    if (alive.has(key)) return false;
    const since = missingSince.get(key) ?? Date.now();
    if (Date.now() - since >= SEAT_GRACE) { missingSince.delete(key); return false; }
    missingSince.set(key, since);
    return true;
  };
}

const awayBriefly = seatGrace();

const closedOnPurpose = (key) => (st.data.shut || []).includes(key);

const leftForGood = (key, alive) => !alive.has(key) && (closedOnPurpose(key) || !awayBriefly(key, alive));

function readHidden() {
  try {
    const raw = JSON.parse(localStorage.getItem("hive.hidden") || "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    return Object.entries(raw).filter(([key]) => typeof key === "string" && key).map(([key, one]) => [key, {
      until: HIDE_UNTIL.has(one?.until) ? one.until : "works",
      armed: !!one?.armed,
      from: typeof one?.from === "string" ? one.from : ""
    }]);
  } catch { return []; }
}

const hidden = new Map(soloSeat ? [] : readHidden());

const saveHidden = () => { if (!soloSeat) localStorage.setItem("hive.hidden", JSON.stringify(Object.fromEntries(hidden))); };

const isHidden = (key) => hidden.has(key);

function readParkSeen() {
  try {
    const raw = JSON.parse(localStorage.getItem("hive.parkSeen") || "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    return Object.entries(raw).filter(([key, at]) => typeof key === "string" && key && Number.isFinite(at));
  } catch { return []; }
}

const parkSeen = new Map(soloSeat ? [] : readParkSeen());

const saveParkSeen = () => { if (!soloSeat) localStorage.setItem("hive.parkSeen", JSON.stringify(Object.fromEntries(parkSeen))); };

function hideParked() {
  let changed = false;
  for (const s of st.data.sessions) {
    const at = s.parked?.at;
    if (!at || parkSeen.get(s.name) === at) continue;
    parkSeen.set(s.name, at);
    changed = true;
    if (st.open === s.name) continue;
    const one = hidden.get(s.name);
    if (one) Object.assign(one, { until: "parked", armed: false });
    else {
      const from = st.blocks.find((b) => b.keys.includes(s.name));
      if (from) from.keys.splice(from.keys.indexOf(s.name), 1);
      hidden.set(s.name, { until: "parked", armed: false, from: from?.id || "" });
    }
    document.dispatchEvent(new CustomEvent("hive:parked", { detail: { name: s.name, title: s.title || s.name, until: s.parked.until } }));
  }
  for (const key of [...parkSeen.keys()]) {
    if (!st.data.sessions.some((s) => s.name === key && !s.parked)) continue;
    parkSeen.delete(key);
    changed = true;
  }
  if (changed) { saveParkSeen(); saveHidden(); }
}

const hiddenUntil = (key) => hidden.get(key)?.until || "";

const shelvedFrom = new Map();

st.peek = "";

const shelvedAway = (key) => key !== st.peek && isShelved(key);

function hideSeat(key, until = "works") {
  if (soloSeat) return false;
  const s = st.data.sessions.find((one) => one.name === key);
  if (!s) return false;
  const from = st.blocks.find((b) => b.keys.includes(key));
  if (from) from.keys.splice(from.keys.indexOf(key), 1);
  const kind = HIDE_UNTIL.has(until) ? until : "works";
  hidden.set(key, { until: kind, armed: armsNow(kind, s.raw || s.state), from: from?.id || "" });
  saveHidden();
  saveBlocks();
  render();
  return true;
}

function forgetSeat(key) {
  let changed = false;
  for (const b of st.blocks) {
    const at = b.keys.indexOf(key);
    if (at >= 0) { b.keys.splice(at, 1); changed = true; }
  }
  if (changed) saveBlocks();
}

function unhideSeat(key) {
  if (!hidden.delete(key)) return false;
  saveHidden();
  return true;
}

function wakeHidden() {
  if (!hidden.size) return;
  const alive = new Map(st.data.sessions.map((s) => [s.name, s]));
  let changed = false;
  for (const [key, one] of hidden) {
    const s = alive.get(key);
    if (!s) {
      if (!closedOnPurpose(key) && awayBriefly(key, alive)) continue;
      hidden.delete(key);
      changed = true;
      continue;
    }
    const state = s.raw || s.state;
    if (one.until === "parked") {
      if (s.parked) continue;
      Object.assign(one, { until: "ends", armed: state === "working" });
      changed = true;
      continue;
    }
    if (backNow(one, state)) { hidden.delete(key); landHome(key, one.from); changed = true; }
    else if (!one.armed && armsNow(one.until, state)) { one.armed = true; changed = true; }
  }
  if (changed) saveHidden();
}

function landHome(key, from) {
  const home = from && st.blocks.find((b) => b.id === from);
  if (!home || home.keys.length >= st.LIMIT || st.blocks.some((b) => b.keys.includes(key))) return;
  home.keys.push(key);
}

st.blocks = readBlocks();

st.spaces = readSpaces();

if (!st.spaces.length) st.spaces = [{ id: "w0", name: "", tint: SPACE_TINTS[0] }];

st.space = String(localStorage.getItem("hive.space") || "");

if (!st.spaces.some((w) => w.id === st.space)) st.space = st.spaces[0].id;

st.block = Math.min(Number(localStorage.getItem("hive.block") || 0), Math.max(0, st.blocks.length - 1));

let blocksSaved = "";

const saveBlocks = () => {
  if (soloSeat) return;
  const now = JSON.stringify(st.blocks);
  if (now === blocksSaved) return;
  blocksSaved = now;
  localStorage.setItem("hive.blocks", now);
};

const saveBlockAt = (i) => { if (!soloSeat) localStorage.setItem("hive.block", String(i)); };

const saveSpaces = () => { if (!soloSeat) localStorage.setItem("hive.spaces", JSON.stringify(st.spaces)); };

const saveSpaceAt = () => { if (!soloSeat) localStorage.setItem("hive.space", st.space); };

const spaceOf = (id) => st.spaces.find((w) => w.id === id) || st.spaces[0];

const blocksOf = (id) => st.blocks.filter((b) => b.ws === id);

const blockNumber = (i) => {
  const b = st.blocks[i];
  if (!b) return i + 1;
  const at = blocksOf(b.ws).indexOf(b);
  return at < 0 ? i + 1 : at + 1;
};

const spaceAt = () => Math.max(0, st.spaces.findIndex((w) => w.id === st.space));

const seatsOf = (id) => blocksOf(id).reduce((n, b) => n + b.keys.length, 0);

const spaceName = (w) => w.name || phrase("workspace {n}", { n: st.spaces.findIndex((x) => x.id === w.id) + 1 });

function openSpace(name) {
  const w = { id: `w${Date.now().toString(36)}${++seq}`, name: String(name || ""), tint: SPACE_TINTS[st.spaces.length % SPACE_TINTS.length] };
  st.spaces.push(w);
  saveSpaces();
  return st.spaces[st.spaces.length - 1];
}

function nameSpace(id, name) {
  const w = st.spaces.find((x) => x.id === id);
  if (!w) return;
  w.name = String(name || "").trim().slice(0, 40);
  saveSpaces();
}

function shutSpace(id) {
  if (st.spaces.length < 2) return false;
  const i = st.spaces.findIndex((w) => w.id === id);
  if (i < 0) return false;
  const to = st.spaces[i === 0 ? 1 : i - 1];
  for (const b of st.blocks) if (b.ws === id) { b.ws = to.id; b.manual = true; }
  st.spaces.splice(i, 1);
  if (st.space === id) st.space = to.id;
  saveSpaces();
  saveSpaceAt();
  saveBlocks();
  return true;
}

const saveDetached = () => { if (!soloSeat) localStorage.setItem("hive.detached", JSON.stringify([...detached])); };

const canGiveBack = () => !!soloSeat && !!window.hiveSeatWindow?.giveBack;

function giveSeatBack(key) {
  if (!canGiveBack() || key !== soloSeat) return false;
  window.hiveSeatWindow.giveBack(key);
  return true;
}

function detachSeat(key) {
  if (soloSeat) return false;
  const from = st.blocks.find((b) => b.keys.includes(key));
  if (!from) return false;
  from.keys.splice(from.keys.indexOf(key), 1);
  detached.add(key);
  saveDetached();
  saveBlocks();
  render();
  return true;
}

function attachSeat(key) {
  if (!detached.delete(key)) return false;
  saveDetached();
  render();
  return true;
}

const prNumberOf = (link) => {
  const said = String(link?.url || link || "");
  const hit = said.match(/\/pull\/(\d+)/);
  return hit ? `#${hit[1]}` : said;
};

function itemOf(key) {
  if (key.startsWith("job:")) {
    const id = key.slice(4);
    const j = (st.data.spawning || []).find((x) => x.id === id);
    if (j) return { ...j, kind: "job", key, state: "spawning" };
    const asked = justCreated.get(id);
    return asked ? { id, name: jobName.get(id) || "", where: "local", step: "", mission: "", error: "", model: "", at: asked, kind: "job", key, state: "spawning" } : null;
  }
  if (key.startsWith("file:")) {
    const ed = editors.get(key.slice(5));
    if (!ed) return null;
    ed.kind = "file";
    ed.key = key;
    return ed;
  }
  if (key.startsWith("gone:")) {
    const name = key.slice(5);
    const one = (st.data.gone || []).find((x) => x.name === name);
    if (!one) return null;
    const pr = (one.prs || []).find(Boolean);
    return {
      ...one, kind: "gone", key, title: name, state: "closed", where: "",
      summary: pr ? phrase("closed, and it became {pr}", { pr: prNumberOf(pr) }) : phrase("closed")
    };
  }
  if (key.startsWith("draft:")) return draftItem(key);
  const s = st.data.sessions.find((x) => x.name === key);
  return s ? { ...s, kind: "session", key } : null;
}

const ofBlock = (b) => (b ? b.keys.map(itemOf).filter(Boolean) : []);

function subchatOf(key) {
  const by = st.data.sessions.find((s) => s.name === key)?.by || "";
  if (!by || by === key) return "";
  return st.data.sessions.some((s) => s.name === by && !s.of) ? by : "";
}

function subchatOpen() {
  if (!st.open || !st.data.sessions.some((s) => s.name === st.open && s.by)) return null;
  return st.blocks.some((b) => b.keys.includes(st.open)) ? null : itemOf(st.open);
}

function activeItems() {
  const alone = subchatOpen();
  return alone ? [alone] : ofBlock(st.blocks[st.block]);
}

const stripItems = () => blocksOf(st.space).flatMap((b, lane) => ofBlock(b).map((it, at) => ({ it, lane, at, here: b === st.blocks[st.block] })));

function blockWithRoom() {
  const b = st.blocks[st.block];
  return b && b.ws === st.space && b.keys.length < st.LIMIT ? b : null;
}

function openBlock(ws) {
  const b = { id: newId(), ws: ws || st.space, label: "", manual: false, keys: [] };
  st.blocks.push(b);
  return st.blocks[st.blocks.length - 1];
}

function mergeWholeBlocks() {
  const filled = st.blocks.filter((b) => b.keys.length);
  if (filled.length !== st.blocks.length) st.blocks = filled;
  for (let i = 0; i < st.blocks.length - 1; ) {
    const here = st.blocks[i], next = st.blocks[i + 1];
    if (here.ws !== next.ws) { i++; continue; }
    if (here.manual || next.manual || here.keys.length + next.keys.length > st.LIMIT) { i++; continue; }
    here.keys.push(...next.keys);
    st.blocks.splice(i + 1, 1);
  }
}

function moveSeatToBlock(key, i) {
  const to = st.blocks[i];
  const from = st.blocks.find((b) => b.keys.includes(key));
  if (!to || !from || from === to) return;
  if (to.keys.length >= st.LIMIT) return;
  from.keys.splice(from.keys.indexOf(key), 1);
  to.keys.push(key);
  from.manual = true;
  to.manual = true;
  saveBlocks();
  render();
}

function moveToNewBlock(key, ws) {
  const from = st.blocks.find((b) => b.keys.includes(key));
  if (!from) return;
  const to = ws || from.ws || st.space;
  if ((from.ws || st.space) === to && from.keys.length < 2) return;
  const b = openBlock(to);
  b.manual = true;
  moveSeatToBlock(key, st.blocks.indexOf(b));
}

function seatsToTradeOn(i, key) {
  const b = st.blocks[i];
  if (!b || b.keys.includes(key) || b.keys.length < st.LIMIT) return [];
  return [...b.keys];
}

function landOnBlock(key, i, onto) {
  const to = st.blocks[i];
  const from = st.blocks.find((b) => b.keys.includes(key));
  if (!to || !from || from === to) return false;
  if (to.keys.length < st.LIMIT) {
    moveSeatToBlock(key, i);
    return true;
  }
  const leaving = to.keys.includes(onto) ? onto : to.keys[to.keys.length - 1];
  from.manual = true;
  to.manual = true;
  swapSeats(key, leaving);
  return true;
}

function bringSeatIn(key) {
  if (detached.has(key) || subchatOf(key)) return false;
  unhideSeat(key);
  if (st.blocks.some((b) => b.keys.includes(key))) return false;
  if (!st.data.sessions.some((s) => s.name === key && !s.of)) return false;
  const landing = blockWithRoom() || openBlock();
  landing.keys.push(key);
  saveBlocks();
  return true;
}

function bringShelvedIn(key) {
  if (st.blocks.some((b) => b.keys.includes(key))) return;
  landHome(key, shelvedFrom.get(key));
  if (!st.blocks.some((b) => b.keys.includes(key))) {
    const room = blockWithRoom() || st.blocks.find((b) => b.ws === st.space && b.keys.length < st.LIMIT);
    if (!room) return void bringSeatIn(key);
    room.keys.push(key);
  }
  saveBlocks();
}

function tidy() {
  if (soloSeat) {
    const here = st.data.sessions.some((s) => s.name === soloSeat);
    st.blocks = [{ id: "solo", ws: st.space, label: "", manual: true, keys: here ? [soloSeat] : [] }];
    st.block = 0;
    return;
  }
  if (!st.seatsKnown) return;
  settleSpaces();
  const alive = new Set(st.data.sessions.map((s) => s.name));
  let shed = false;
  for (const key of [...detached]) if (leftForGood(key, alive)) { detached.delete(key); shed = true; }
  if (shed) saveDetached();
  hideParked();
  wakeHidden();
  sweepSeatMarks();
  if (st.peek && !isShelved(st.peek)) st.peek = "";
  const jobs = new Map((st.data.spawning || []).map((j) => [j.id, j]));
  for (const j of jobs.values()) if (j.name && j.settled) jobName.set(j.id, j.name);
  for (const [id, at] of justCreated) if (jobs.has(id) || Date.now() - at > 20000) justCreated.delete(id);

  const currentId = st.blocks[st.block]?.id;
  const seen = new Set();

  for (const b of st.blocks) {
    const kept = [];
    for (const c of b.keys) {
      let key = c;
      if (c.startsWith("job:")) {
        const id = c.slice(4);
        const job = jobs.get(id);
        /* while the job is still being born its name is only what the mission's first words
           asked for, and another seat may already answer to it. The tile follows a name the
           server has settled, never a wish. */
        const name = job ? (job.settled ? job.name : "") : jobName.get(id);
        if (name && alive.has(name)) {
          key = name;
          if (st.open === c) st.open = name;
          if (subchatOf(name)) continue;
        } else if (!jobs.has(id) && !justCreated.has(id)) continue;
      } else if (c.startsWith("file:")) {
        if (!editors.has(c.slice(5))) continue;
      } else if (c.startsWith("draft:")) {
        if (!drafts.has(c.slice(6))) continue;
      } else if (shelvedAway(c)) {
        shelvedFrom.set(c, b.id);
        continue;
      } else if (leftForGood(c, alive) || detached.has(c) || hidden.has(c) || subchatOf(c) || st.data.sessions.some((s) => s.name === c && s.of)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(key);
    }
    if (kept.length !== b.keys.length || kept.some((key, at) => key !== b.keys[at])) b.keys = kept;
  }

  const loose = [];
  for (const s of st.data.sessions) {
    if (seen.has(s.name) || detached.has(s.name) || hidden.has(s.name) || s.by || s.of || shelvedAway(s.name)) continue;
    const from = shelvedFrom.get(s.name);
    shelvedFrom.delete(s.name);
    landHome(s.name, from);
    if (!st.blocks.some((b) => b.keys.includes(s.name))) loose.push(s.name);
  }
  for (const j of jobs.values()) {
    if (seen.has(`job:${j.id}`)) continue;
    if (j.name && seen.has(j.name)) continue;
    if (j.settled && j.name && alive.has(j.name)) continue;
    /* a chat another chat opened does not take the screen while it is being born, for the same
       reason it does not take it once it is alive: the person did not ask for that tile. It is
       read beside the chat that opened it, and it is one click from the field. */
    if (j.by) continue;
    loose.push(`job:${j.id}`);
  }
  let landing = blockWithRoom();
  for (const key of loose) {
    if (!landing || landing.keys.length >= st.LIMIT) landing = openBlock();
    landing.keys.push(key);
  }

  mergeWholeBlocks();
  const i = st.blocks.findIndex((b) => b.id === currentId);
  st.block = i >= 0 ? i : Math.min(st.block, Math.max(0, st.blocks.length - 1));
  if (!st.blocks[st.block] || st.blocks[st.block].ws !== st.space) st.block = st.blocks.findIndex((b) => b.ws === st.space);
  saveBlocks();
}

function settleSpaces() {
  if (!st.spaces.length) st.spaces = [{ id: "w0", name: "", tint: SPACE_TINTS[0] }];
  const known = new Set(st.spaces.map((w) => w.id));
  if (!known.has(st.space)) st.space = st.spaces[0].id;
  let moved = false;
  for (const b of st.blocks) if (!known.has(b.ws)) { b.ws = st.spaces[0].id; moved = true; }
  if (moved) saveBlocks();
  saveSpaces();
}

function labelOf(b, items) {
  const sess = items.filter((i) => i.kind === "session");
  if (b.manual && b.label) return { txt: b.label };
  if (!sess.length) return { txt: !items.length ? "" : items.every((i) => i.kind === "draft") ? phrase("new chat") : "starting…" };
  if (raycastOn()) return { txt: seatName(sess[0]) };
  const shown = (s) => (s.naming ? phrase("new chat") : s.title || s.name);
  if (sess.length === 1) return { txt: shown(sess[0]) };
  const first = shown(sess[0]);
  return { txt: `${first} +${sess.length - 1}`, head: first };
}

const seatName = (s) => (s.kind !== "session" ? s.title || s.name || "" : s.naming ? phrase("new chat") : s.title || s.name);

function blockTitle(b, items) {
  const label = labelOf(b, items);
  const head = label.head || label.txt;
  const names = items.map(seatName).filter(Boolean);
  if (names[0] !== head) return names.length ? `${head}: ${names.join(", ")}` : head;
  const rest = names.slice(1);
  if (!rest.length) return head;
  return rest.length === 1
    ? phrase("{name} and 1 more seat: {names}", { name: head, names: rest[0] })
    : phrase("{name} and {n} more seats: {names}", { name: head, n: rest.length, names: rest.join(", ") });
}

export { SPACE_TINTS, activeItems, stripItems, attachSeat, bringSeatIn, subchatOf, subchatOpen, blockNumber, blockTitle, blockWithRoom, blocksOf, blocksSaved, canGiveBack, detachSeat, detached, forgetSeat, giveSeatBack, bringShelvedIn, hideSeat, hidden, hiddenUntil, isHidden, shelvedAway, itemOf, labelOf, landOnBlock, mergeWholeBlocks, moveSeatToBlock, moveToNewBlock, nameSpace, newId, ofBlock, openBlock, openSpace, readBlocks, readDetached, readSpaces, saveBlockAt, saveBlocks, saveDetached, saveSpaceAt, saveSpaces, seatGrace, seatsOf, seatsToTradeOn, seq, settleSpaces, shutSpace, soloSeat, spaceAt, spaceName, spaceOf, tidy, unhideSeat, wakeHidden };
