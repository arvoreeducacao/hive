import { render } from "./arrange.js";
import { saveConfig } from "./brand-face.js";
import { $, phrase, st } from "./core.js";
import { paintBrandAvatar } from "./welcome.js";

const roomTakesKey = (action, reachesPty) => action === "palette" || action === "openFile" || action === "searchCode" || !reachesPty;

function palAt(runnable, id, at) {
  if (!runnable.length) return 0;
  const found = id ? runnable.findIndex((r) => r.id === id) : -1;
  if (found >= 0) return found;
  return Math.min(Math.max(0, at), runnable.length - 1);
}

const MENTION = /(^|[\s([{'"])#([\w.-]{1,64})/g;

const IMAGE_MARK = /\[Image #\d+\]/g;

/* #1287 is a card, #4 is an issue, #2 is the second item of a list the person is writing:
   a handle made only of digits is never a seat, and it must not be weighed against titles. */
const JUST_A_NUMBER = /^\d+$/;

const TITLE_NEEDS = 3;

const HANDLE_CUT = 64;

const seatLabel = (seat) => String(seat?.title || seat?.name || "");

/* the chat is called by the name the person reads on the rail — the name it gave itself — and not
   by the name the machine gave it when it opened. a handle is that same name cut to one token, so
   what the menu offers is what lands in the box, and what lands in the box is what they can read
   back. the machine name goes on answering, for the mentions already written and for the tools. */
function seatHandle(seat) {
  const slug = seatLabel(seat)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, HANDLE_CUT);
  return slug || String(seat?.name || "");
}

function nameSlug(text) {
  return String(text || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
}

function peerChoices(sessions, q, mine) {
  const want = String(q || "").toLowerCase();
  return sessions
    .filter((s) => s.name !== mine && !s.root)
    .filter((s) => !want || seatHandle(s).includes(want) || s.name.toLowerCase().includes(want) || (s.title || "").toLowerCase().includes(want))
    .sort((a, b) => (seatHandle(b).startsWith(want) - seatHandle(a).startsWith(want))
      || (b.name.toLowerCase().startsWith(want) - a.name.toLowerCase().startsWith(want))
      || seatLabel(a).localeCompare(seatLabel(b)))
    .slice(0, 8);
}

const SEAT_STATE = { needs: "needs you", done: "done", working: "working", idle: "idle" };

function seatSays(seat) {
  const spot = [seat.where === "cloud" ? "cloud" : "local"];
  if (seat.model) spot.push(seat.model);
  const bits = [...spot];
  if (seat.title && seat.title !== seat.name) bits.push(seat.title);
  return {
    state: SEAT_STATE[seat.state] || "alive",
    meta: bits.join(" · "),
    spot: spot.join(" · "),
    now: seat.now || seat.summary || "",
  };
}

function peerHandle(seat, mine) {
  const said = seatSays(seat);
  const now = said.now ? ` · "${said.now}"` : "";
  const lines = [
    `[hive] peer: ${seat.name} · ${said.meta} · ${said.state}${now}`,
    `[hive] reach it: message(seat, text) · ask(seat, question) · peek(seat) — the hive tools`,
  ];
  if (mine) lines.push(`[hive] you are: ${mine} — it answers you by this name`);
  return lines.join("\n");
}

function expandMentions(text, sessions, mine, oneLine = false, side = "") {
  const body = String(text || "");
  const named = [];
  const here = side || sessions.find((s) => s.name === mine)?.where || "";
  let ambiguous = "";
  let unreachable = "";
  /* the box writes its own attachments as "[Image #1]", and that # is not a handle. read over the
     marks, or a picture pinned in a hive with two chats whose names carry that digit turns every
     message with an image into an ambiguity nobody asked for. */
  const scanned = body.replace(IMAGE_MARK, (mark) => " ".repeat(mark.length));
  MENTION.lastIndex = 0;
  for (let m; (m = MENTION.exec(scanned)); ) {
    const others = sessions.filter((s) => s.name !== mine);
    if (JUST_A_NUMBER.test(m[2]) && !others.some((s) => s.name.toLowerCase() === m[2].toLowerCase())) continue;
    const found = pickSeat(others, m[2]);
    /* a # that fits nobody is a hex colour, an issue number, a hashtag — it stays text.
       a # that fits two seats is a mention with a real ambiguity, and that one has to be said. */
    if (found.error) {
      if (/fits \d+ seats/.test(found.error)) ambiguous = ambiguous || found.error;
      continue;
    }
    /* the pod cannot open a connection to your machine, so a handle that crosses sides is a promise
       nobody can keep. say it here, where it can still be changed, instead of at the far end. */
    if (here && found.seat.where !== here) {
      unreachable = unreachable
        || phrase("{name} runs {there} and this chat runs {here} — they cannot reach each other. Mention a chat on the same side, or pass the answer yourself.", { name: seatLabel(found.seat), there: found.seat.where === "cloud" ? phrase("on the server") : phrase("on your machine"), here: here === "cloud" ? phrase("on the server") : phrase("on your machine") });
      continue;
    }
    if (!named.some((s) => s.name === found.seat.name)) named.push(found.seat);
  }
  if (ambiguous) return { error: ambiguous };
  if (unreachable) return { error: unreachable };
  if (!named.length) return { text: body, peers: [] };
  const handles = named.map((seat) => peerHandle(seat, mine)).join("\n");
  const woven = oneLine
    ? `${handles.replace(/\s*\n\s*/g, " · ")} — ${body.replace(/\s*\n\s*/g, " · ")}`
    : `${handles}\n\n${body}`;
  return { text: woven, peers: named.map((s) => s.name) };
}

function splitPeerHandle(text) {
  const raw = String(text || "");
  const lines = raw.split("\n");
  let cut = 0;
  while (cut < lines.length && lines[cut].startsWith("[hive] ")) cut += 1;
  if (!cut) return { handle: "", body: raw };
  const body = lines.slice(cut).join("\n").replace(/^\n+/, "");
  return { handle: lines.slice(0, cut).join("\n"), body };
}

function pickSeat(sessions, raw) {
  const q = String(raw).toLowerCase();
  /* the whole handle beats everything else, so two chats that carry the same name are an ambiguity
     the person is told about instead of a coin the menu flips for them. */
  const named = sessions.filter((s) => seatHandle(s) === q);
  if (named.length === 1) return { seat: named[0] };
  if (!named.length) {
    const machine = sessions.find((s) => s.name.toLowerCase() === q);
    if (machine) return { seat: machine };
  }
  /* the title is a sentence in the person's words, so a piece of it only means a seat once it is
     long enough to be a word: matching "1" against every title that carries a digit turned a card
     number into an ambiguity between two chats that had nothing to do with it. */
  const near = named.length ? named : sessions.filter((s) => seatHandle(s).startsWith(q) || s.name.toLowerCase().startsWith(q) || (q.length >= TITLE_NEEDS && (s.title || "").toLowerCase().includes(q)));
  if (!near.length) return { error: phrase("no seat called “{raw}”", { raw: raw }) };
  if (near.length > 1) return { error: phrase("“{raw}” fits {n} seats — {seats}. write the whole name", { raw: raw, n: near.length, seats: near.map((s) => seatHandle(s)).join(", ") }) };
  return { seat: near[0] };
}

const PERSON = /(^|[\s([{'"])~([a-z0-9][a-z0-9-]{0,30})/g;

const shellModeOf = (text) => (String(text ?? "").startsWith("!!") ? "quiet" : String(text ?? "").startsWith("!") ? "kept" : "");

function shellLineOf(text) {
  const line = String(text ?? "");
  if (!line.startsWith("!")) return null;
  const quiet = line.startsWith("!!");
  const command = line.slice(quiet ? 2 : 1).trim();
  return command ? { command, quiet } : null;
}

const personAwake = (row) => !!row && !!row.up && !!row.sharing;

function personSays(row) {
  const seats = (row && row.seats || []).length;
  const state = personAwake(row) ? "hive open" : (row && row.up ? "hive closed" : "server asleep");
  return {
    state,
    meta: personAwake(row)
      ? (seats === 1 ? phrase("1 seat awake") : phrase("{n} seats awake", { n: seats }))
      : phrase("nothing reaches them until they open it"),
  };
}

function personChoices(rows, q, me) {
  const want = String(q || "").toLowerCase();
  return (rows || [])
    .filter((r) => r && r.dev && r.dev !== me)
    .filter((r) => !want || r.dev.toLowerCase().includes(want))
    .sort((a, b) =>
      (personAwake(b) - personAwake(a))
      || (b.dev.toLowerCase().startsWith(want) - a.dev.toLowerCase().startsWith(want))
      || a.dev.localeCompare(b.dev))
    .slice(0, 8);
}

function pickPerson(rows, raw) {
  const q = String(raw).toLowerCase();
  const exact = (rows || []).find((r) => r.dev.toLowerCase() === q);
  if (exact) return { person: exact };
  const near = (rows || []).filter((r) => r.dev.toLowerCase().startsWith(q));
  if (!near.length) return { error: phrase("nobody here is called “{raw}”", { raw: raw }) };
  if (near.length > 1) return { error: phrase("“{raw}” fits {n} people — {devs}. write the whole name", { raw: raw, n: near.length, devs: near.map((r) => r.dev).join(", ") }) };
  return { person: near[0] };
}

const PERSON_SEATS = 12;

function personSeatLine(card) {
  const called = card.title && card.title !== card.name ? ` "${card.title}"` : "";
  const bits = [card.where, card.model, card.state].filter(Boolean).join(" · ");
  const doing = card.now ? ` · "${card.now}"` : "";
  return `  - ${card.name}${called}${bits ? ` · ${bits}` : ""}${doing}`;
}

function personHandle(row, me, seat) {
  const said = personSays(row);
  const cards = (personAwake(row) ? row.seats || [] : []).slice(0, PERSON_SEATS);
  const more = Math.max(0, (row.seats || []).length - cards.length);
  const lines = [
    `[hive] person: ${row.dev} · ${said.state} · ${said.meta}`,
  ];
  if (cards.length) {
    lines.push(`[hive] their chats — name the one you mean when you ask, so ${row.dev} does not have to guess:`);
    lines.push(...cards.map(personSeatLine));
    if (more) lines.push(`  - and ${more} more`);
  }
  lines.push(`[hive] reach it: ask_person(person, question) — ${row.dev} sees the question and approves before it lands`);
  if (me) lines.push(`[hive] you are: ${me}${seat ? ` · ${seat}` : ""} — the answer comes back into this chat`);
  return lines.join("\n");
}

function expandPeople(text, rows, me, seat, oneLine = false) {
  const body = String(text || "");
  const named = [];
  let ambiguous = "";
  let asleep = "";
  PERSON.lastIndex = 0;
  for (let m; (m = PERSON.exec(body)); ) {
    const found = pickPerson((rows || []).filter((r) => r.dev !== me), m[2]);
    if (found.error) {
      if (/fits \d+ people/.test(found.error)) ambiguous = ambiguous || found.error;
      continue;
    }
    if (!personAwake(found.person)) {
      asleep = asleep || phrase("{name} has the hive closed — a question would land nowhere. Ask someone who is up, or wait.", { name: found.person.dev });
      continue;
    }
    if (!named.some((r) => r.dev === found.person.dev)) named.push(found.person);
  }
  if (ambiguous) return { error: ambiguous };
  if (asleep) return { error: asleep };
  if (!named.length) return { text: body, people: [] };
  const handles = named.map((row) => personHandle(row, me, seat)).join("\n");
  const woven = oneLine
    ? `${handles.replace(/\s*\n\s*/g, " · ")} — ${body.replace(/\s*\n\s*/g, " · ")}`
    : `${handles}\n\n${body}`;
  return { text: woven, people: named.map((r) => r.dev) };
}

const calmly = () => st.calmOn || st.away || matchMedia("(prefers-reduced-motion: reduce)").matches;

st.calmOn = true;

st.away = false;

const CALM_KEY = "hive.visual";

const visualWorn = () => (st.calmOn ? "lean" : "full");

const whenMotionChanges = [];

function paintCalm() {
  document.body.classList.toggle("no-motion", st.calmOn || st.away);
  document.body.classList.toggle("lean", st.calmOn);
  document.body.classList.toggle("unwatched", st.away);
  const pick = $("f-visual");
  if (pick) pick.value = visualWorn();
}

function setCalm(on, quiet) {
  st.calmOn = !!on;
  try { localStorage.setItem(CALM_KEY, visualWorn()); } catch {}
  paintCalm();
  if (st.calmOn && st.mugPlayer) paintBrandAvatar();
  st.pet?.refreshMotion?.();
  for (const hear of whenMotionChanges) hear();
  if (quiet) return;
  saveConfig({ visual: visualWorn() }).catch(() => {});
}

function setAway(away) {
  if (st.away === away) return;
  st.away = away;
  paintCalm();
  if (st.away && st.mugPlayer) paintBrandAvatar();
  st.pet?.refreshMotion?.();
  for (const hear of whenMotionChanges) hear();
}

window.hiveAway?.hear(setAway);

function adoptCalm(r) {
  if (!r.has?.visual) return;
  const lean = r.config.visual !== "full";
  if (lean !== st.calmOn) setCalm(lean, true);
}

st.dimOn = true;

st.barOn = true;

const DIM_KEY = "hive.dim";

const BAR_KEY = "hive.bar";

function paintShare() {
  const b = $("btn-share");
  if (!b) return;
  b.setAttribute("aria-pressed", st.team.sharing ? "true" : "false");
}

function paintPhone() {
  const b = $("btn-phone");
  if (!b) return;
  b.setAttribute("aria-pressed", st.team.phone ? "true" : "false");
}

function paintMachines() {
  const b = $("btn-machines");
  if (b) b.setAttribute("aria-pressed", st.team.machines ? "true" : "false");
  const f = $("in-machine");
  if (f && document.activeElement !== f) {
    f.value = st.team.machine || "";
    f.placeholder = st.team.machineHere || "";
  }
}

function paintPrefs() {
  document.body.classList.toggle("no-dim", !st.dimOn);
  document.body.classList.toggle("no-bar", !st.barOn);
  const d = $("btn-dim"), b = $("btn-bar");
  if (d) d.setAttribute("aria-pressed", String(st.dimOn));
  if (b) b.setAttribute("aria-pressed", String(st.barOn));
}

function setPref(which, on, quiet) {
  if (which === "dim") { st.dimOn = on; try { localStorage.setItem(DIM_KEY, on ? "1" : ""); } catch {} }
  else { st.barOn = on; try { localStorage.setItem(BAR_KEY, on ? "1" : ""); } catch {} }
  paintPrefs();
  render();
  if (quiet) return;
  saveConfig(which === "dim" ? { dim: on } : { composer: on }).catch(() => {});
}

function adoptPrefs(r) {
  if (r.has?.dim && r.config.dim !== st.dimOn) setPref("dim", r.config.dim, true);
  if (r.has?.composer && r.config.composer !== st.barOn) setPref("bar", r.config.composer, true);
}

const AUTOCOMPACT_AUTO = "auto";

const AUTOCOMPACT_RANGE_K = [100, 1000];

function autocompactK(said) {
  const shape = /^([1-9]\d*)\s*k?$/i.exec(String(said ?? "").trim());
  if (!shape) return 0;
  const k = Number(shape[1]);
  const [low, high] = AUTOCOMPACT_RANGE_K;
  return k >= low && k <= high ? k : 0;
}

/* every native driver takes the ceiling; a terminal takes it only on Claude, whose CLI
   has the flag — a terminal on codex, kimi or kiro compacts by its own rules. */
function seatTakesCeiling(s) {
  if (s.kind === "shell") return false;
  return (s.agent || "claude") === "claude" || s.kind === "structured";
}

function ceilingReachesASeat(seats) {
  const known = (seats || []).filter((s) => s.kind !== "shell");
  return !known.length || known.some(seatTakesCeiling);
}

function paintAutocompactReach() {
  const field = $("f-compact");
  if (!field) return;
  field.disabled = !ceilingReachesASeat(st.data?.sessions);
}

function adoptAutocompact(r) {
  const field = $("f-compact");
  if (!field || field === document.activeElement) return;
  const k = autocompactK(r.config?.autocompact);
  field.value = k ? String(k) : "";
  paintAutocompactReach();
}

function setAutocompact(raw) {
  const k = autocompactK(raw);
  saveConfig({ autocompact: k ? `${k}k` : AUTOCOMPACT_AUTO }).then((r) => adoptAutocompact(r)).catch(() => {});
}

const QUIET_DAYS_RANGE = [1, 90];

function quietDays(said) {
  const shape = /^\s*([1-9]\d*)\s*$/.exec(String(said ?? ""));
  if (!shape) return 0;
  const days = Number(shape[1]);
  const [low, high] = QUIET_DAYS_RANGE;
  return days >= low && days <= high ? days : 0;
}

function adoptQuietDays(r) {
  const field = $("f-quiet-days");
  if (!field || field === document.activeElement) return;
  const days = quietDays(r.config?.closeQuietAfterDays);
  field.value = days ? String(days) : "";
}

function setQuietDays(raw) {
  saveConfig({ closeQuietAfterDays: quietDays(raw) }).then((r) => adoptQuietDays(r)).catch(() => {});
}

const DIARY_DAYS_DEFAULT = 30;
const DIARY_DAYS_RANGE = [1, 365];

function diaryDays(said) {
  const shape = /^\s*(\d+)\s*$/.exec(String(said ?? ""));
  if (!shape) return DIARY_DAYS_DEFAULT;
  const days = Number(shape[1]);
  if (days === 0) return 0;
  const [low, high] = DIARY_DAYS_RANGE;
  return days >= low && days <= high ? days : DIARY_DAYS_DEFAULT;
}

function adoptDiaryDays(r) {
  const field = $("f-diary-days");
  if (!field || field === document.activeElement) return;
  field.value = String(r.config?.pruneDiariesAfterDays ?? DIARY_DAYS_DEFAULT);
}

function setDiaryDays(raw) {
  saveConfig({ pruneDiariesAfterDays: diaryDays(raw) }).then((r) => adoptDiaryDays(r)).catch(() => {});
}

export { QUIET_DAYS_RANGE, adoptQuietDays, quietDays, setQuietDays, DIARY_DAYS_DEFAULT, adoptDiaryDays, diaryDays, setDiaryDays, AUTOCOMPACT_AUTO, AUTOCOMPACT_RANGE_K, BAR_KEY, CALM_KEY, visualWorn, whenMotionChanges, DIM_KEY, MENTION, PERSON, SEAT_STATE, adoptAutocompact, adoptCalm, adoptPrefs, autocompactK, calmly, ceilingReachesASeat, nameSlug, expandMentions, expandPeople, paintAutocompactReach, paintCalm, paintMachines, paintPhone, paintPrefs, paintShare, palAt, peerChoices, peerHandle, personAwake, personChoices, personHandle, personSays, pickPerson, pickSeat, roomTakesKey, seatHandle, seatLabel, seatSays, seatTakesCeiling, setAutocompact, setAway, setCalm, setPref, shellLineOf, shellModeOf, splitPeerHandle };
