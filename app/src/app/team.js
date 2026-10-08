import { render } from "./arrange.js";
import { lentFlash, teamFlash } from "./avatars.js";
import { getStructured } from "./chat-stretches.js";
import { NOTICES_AT_ONCE, earcon, showNotice } from "./chimes-and-notices.js";
import { $, apiGet, avatarFor, avatarKey, avatarSvg, BLOB_FACE, beatOn, dealFaces, esc, every, faceSlot, GLYPH, LABEL, mountVisitor, parseAvatar, parseWear, phrase, raycastOn, renderMarkdown, screenOpens, solidMounts, st, stateColor, stopBeat } from "./core.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { personFace } from "./person-face.js";
import { armMirrorLive, closeMirrorChat, forgetMirrorChats, openMirrorChat, sweepMirrorChats, teamSeatKey } from "./mirror.js";
import { wireShelfLinks } from "./picture-preview.js";
import { ago } from "./pod.js";
import { calmly, paintMachines, paintPhone, paintShare } from "./pure-helpers.js";

const TONES = ["#7DCFFF", "#4EA96F", "#8A7CB0", "#E0AF68", "#6FA3B4", "#CD694A", "#9C988F"];

st.team = { me: "", sharing: true, machines: false, devs: [] };

st.teamTrouble = 0;

st.teamSeenAt = 0;
st.mirrorKey = "";

st.myFace = null;

st.myBlob = false;

st.mirrorDev = "";

const knocked = new Map();
const knockRefused = new Map();

const KNOCK_HOLD = 45000;

const knockedAt = (dev, seat) => knocked.get(`${dev}/${seat}`) || 0;

const knockHolds = (dev, seat) => Date.now() - knockedAt(dev, seat) < KNOCK_HOLD;

st.lentHere = [];

st.knocksOpen = [];

const knocksSeen = new Set();

const pokesSeen = new Set();

const holdingKeyboard = () => st.team.devs.some((d) => (d.seats || []).some((s) => s.keyboard && s.keyboard.with === st.team.me));

const teamFocus = () => st.mirrorDev
  || (st.team.devs.find((d) => (d.seats || []).some((s) => s.keyboard && s.keyboard.with === st.team.me)) || {}).dev
  || "";

function paceTeam() {
  const fast = holdingKeyboard();
  every("team", fast ? 5000 : 45000, () => (fast ? pullTeam(true, teamFocus()) : pullTeam(!!st.mirrorDev)));
}

async function askForKeyboard(dev, seat) {
  knocked.set(`${dev}/${seat}`, Date.now());
  knockRefused.delete(`${dev}/${seat}`);
  render();
  const r = await fetch("/api/team/knock", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ dev, seat })
  }).then((x) => x.json()).catch(() => ({ error: phrase("the cluster did not answer") }));
  if (r.error) { knocked.delete(`${dev}/${seat}`); knockRefused.set(`${dev}/${seat}`, r.error); render(); return; }
}

async function giveKeyboardBack(dev, seat) {
  const r = await fetch("/api/team/bye", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ dev, seat })
  }).then((x) => x.json()).catch(() => ({ error: phrase("the cluster did not answer") }));
  knocked.delete(`${dev}/${seat}`);
  if (r.error) return;
  pullTeam(true, dev);
}

async function sayToTeamSeat(dev, seat, text, box) {
  const said = text.trim();
  if (!said) return;
  box.value = "";
  const row = teamRow(dev);
  const card = (row?.seats || []).find((x) => x.name === seat);
  if (card?.keyboard) card.keyboard.turns = [...(card.keyboard.turns || []), { who: "you", text: said }].slice(-14);
  render();
  await fetch("/api/team/say", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ dev, seat, text: said })
  }).catch(() => {});
  setTimeout(() => pullTeam(true, dev), 1200);
}

function knockId(k) {
  return `${k.from}:${k.seat}:${k.at}`;
}

function takePokes(pokes) {
  const fresh = pokes.filter((p) => p && p.id && !pokesSeen.has(p.id));
  for (const p of fresh) pokesSeen.add(p.id);
  if (!fresh.length) return;
  const hellos = fresh.filter((p) => p.hello);
  const shakes = fresh.filter((p) => !p.hello);
  /* a hello is a face, not a shake: whoever sent it walks in at the foot of the rail, waves,
     and leaves on their own. two at once and the last one in is the one you see. */
  if (hellos.length) greetFrom(hellos[hellos.length - 1].from);
  if (shakes.length) shakeWindow();
  earcon("asked");
  /* no line on the screen: the shake and the sound are the whole message, the way MSN meant it.
     Away from the window there is nothing to feel, so that one case still gets a notice with a name on it. */
  if (!document.hidden) return;
  const who = [...new Set(fresh.map((p) => p.from))][0];
  if (shakes.length) showNotice(phrase("{who} poked you", { who }), phrase("just that — a poke"));
  else showNotice(phrase("{who} says hi", { who }), phrase("their face is waving at the foot of your rail"));
}

function greetFrom(from) {
  st.visitor?.destroy();
  st.visitor = mountVisitor($("shell"), { face: devFace(from), svg: wearsBlob(from) ? personFace(from) : "", from, reducedMotion: () => calmly() });
  st.pet?.wave();
}

const lentSeen = new Map();

function takeLent(lent) {
  const live = new Set();
  for (const k of lent) {
    if (!k || !k.seat) continue;
    live.add(k.seat);
    const before = lentSeen.get(k.seat) || 0;
    lentSeen.set(k.seat, Number(k.until) || 0);
    if (before && (Number(k.until) || 0) > before) lentFlash(k.seat, k.with);
  }
  for (const seat of [...lentSeen.keys()]) if (!live.has(seat)) lentSeen.delete(seat);
}

const KNOCKS_TICK = 3000;

async function pullKnocks() {
  try {
    const r = await apiGet("/api/knocks");
    st.lentHere = Array.isArray(r.lent) ? r.lent : [];
    takeLent(st.lentHere);
    st.knocksOpen = Array.isArray(r.knocks) ? r.knocks : [];
    takePokes(Array.isArray(r.pokes) ? r.pokes : []);
    /* somebody answered a knock of ours: their deck already says so, so read it now instead of at the hour */
    if (r.moved) pullTeam(true);
    const fresh = st.knocksOpen.filter((k) => !knocksSeen.has(knockId(k)));
    for (const k of fresh) knocksSeen.add(knockId(k));
    if (fresh.length) {
      nudge(fresh);
      if (document.hidden) for (const k of fresh.slice(0, NOTICES_AT_ONCE)) {
        const seat = st.data.sessions.find((x) => x.name === k.seat);
        showNotice(phrase("{n} wants the keyboard", { n: k.from }), phrase("{seat} — the ask is waiting in the hive", { seat: seat?.title || k.seat }), k.seat);
      }
    }
    const key = JSON.stringify({ lent: r.lent, knocks: r.knocks });
    if (key !== knocksKey) {
      knocksKey = key;
      render();
    }
  } catch {}
}

let knocksKey = "";

function paintKnocks() {
  $("knock-dock").hidden = !st.knocksOpen.length;
  knocksSolid.show(knocksViewModel());
}

let knocksSolid = null;

function knocksViewModel() {
  return {
    title: st.knocksOpen.length === 1 ? "wants the keyboard" : `${st.knocksOpen.length} want the keyboard`,
    knocks: st.knocksOpen.map((k) => {
      const seat = st.data.sessions.find((x) => x.name === k.seat);
      const when = ago(k.at);
      return {
        key: knockId(k), from: k.from, seat: k.seat, avatar: avatar(k.from),
        line: `${seat?.title || k.seat}${when ? ` · ${when}` : ""}`,
        hint: `${phrase("{who} asked for the keyboard of {seat}", { who: k.from, seat: seat?.title || k.seat })}${when ? phrase(" — {when} ago", { when }) : ""}`,
        yes: phrase("lend it"), no: phrase("not now")
      };
    })
  };
}

solidMounts.push((hive) => {
  knocksSolid = hive.mountKnocks($("knock-dock"), {
    actions: { answer: (from, seat, ok) => answerKnock({ from, seat }, ok) }
  });
});

const NUDGE_AGAIN = 5000;

st.nudgeQueue = [];

st.nudgeNow = null;

st.nudgeHeld = false;

const sameKnock = (a, b) => !!a && !!b && a.from === b.from && (a.id || b.id ? a.id === b.id : a.seat === b.seat);

const isAsk = (k) => !!k && k.kind === "ask";

function nudgeAhead(queue, open) {
  return queue.filter((k) => open.some((x) => sameKnock(x, k)));
}

function shakeWindow() {
  if (calmly()) return;
  document.body.classList.remove("nudged");
  void document.body.offsetWidth;
  document.body.classList.add("nudged");
  clearTimeout(shakeWindow.until);
  shakeWindow.until = setTimeout(() => document.body.classList.remove("nudged"), 900);
}

function pulseNudge() {
  if (!st.nudgeNow) return stopNudging();
  if (document.hidden) { st.nudgeHeld = true; return; }
  st.nudgeHeld = false;
  shakeWindow();
  earcon("asked");
}

function keepNudging() {
  every("nudge", NUDGE_AGAIN, pulseNudge);
}

function stopNudging() {
  stopBeat("nudge");
}

function nudge(knocks) {
  for (const k of knocks) if (!st.nudgeQueue.some((x) => sameKnock(x, k))) st.nudgeQueue.push(k);
  paintNudge();
  if (!st.nudgeNow) return;
  if (!document.hidden) { releaseKeyboard(); $("nudge-yes").focus(); }
  pulseNudge();
  keepNudging();
}

function paintNudge() {
  const ahead = nudgeAhead(st.nudgeQueue, st.knocksOpen);
  if (ahead.length !== st.nudgeQueue.length) st.nudgeQueue = ahead;
  const k = st.nudgeQueue[0] || null;
  st.nudgeNow = k;
  $("nudge").hidden = !k;
  $("nudge-scrim").hidden = !k;
  if (!k) return stopNudging();
  const mine = st.data.sessions.filter((x) => x.name && x.kind !== "shell");
  $("nudge-asked").hidden = !isAsk(k);
  $("nudge-where").hidden = !isAsk(k);
  $("nudge-yes").textContent = isAsk(k) ? phrase("let it in") : phrase("lend it");
  if (raycastOn()) {
    $("nudge-yes").innerHTML = `${esc(isAsk(k) ? phrase("let it in") : phrase("lend it"))} <kbd>↵</kbd>`;
    if ($("nudge-kind")) $("nudge-kind").textContent = isAsk(k) ? phrase("question from someone else") : phrase("keyboard request");
  }
  if (isAsk(k)) {
    $("nudge-what").textContent = phrase("It goes into the chat you pick, as a question — the answer that chat gives goes back to {who}, and nothing else does. Tool calls stay here.", { who: k.from });
    $("nudge-asked").textContent = k.text || "";
    $("nudge-seat").innerHTML = mine.map((s) => `<option value="${esc(s.name)}">${esc(s.title || s.name)}</option>`).join("")
      || `<option value="">${esc(phrase("no chat open here to answer it"))}</option>`;
    if (raycastOn()) $("nudge-seat").innerHTML = mine.map((s) => `<option value="${esc(s.name)}">${esc(s.title || s.name)} · ${esc(phrase(LABEL[s.state] || "idle"))}</option>`).join("")
      || `<option value="">${esc(phrase("no chat open here to answer it"))}</option>`;
    $("nudge-yes").disabled = !mine.length;
  } else {
    $("nudge-yes").disabled = false;
    $("nudge-what").textContent = phrase("Lend it and {who} types into this chat from their own hive. It comes back on its own in half an hour, or the moment you take it back.", { who: k.from });
  }
  nudgeSolid.show(nudgeViewModel(k));
}

let nudgeSolid = null;

function nudgeViewModel(k) {
  const seat = st.data.sessions.find((x) => x.name === k.seat);
  const when = ago(k.at);
  const rest = st.nudgeQueue.slice(1);
  if (raycastOn()) {
    return {
      avatar: avatar(k.from),
      title: isAsk(k) ? phrase("{n} is asking something", { n: k.from }) : phrase("{n} wants the keyboard", { n: k.from }),
      sub: isAsk(k)
        ? `${phrase("through their chat {agent}", { agent: k.agent || "" })}${when ? ` · ${phrase("{when} ago", { when })}` : ""}`
        : `${seat?.title || k.seat}${when ? ` · ${phrase("{when} ago", { when })}` : ""}`,
      next: rest.length ? nextInLine(rest) : "",
      nextLabel: phrase("next")
    };
  }
  return {
    avatar: avatar(k.from),
    title: isAsk(k) ? phrase("{n} is asking something", { n: k.from }) : phrase("{n} wants the keyboard", { n: k.from }),
    sub: isAsk(k)
      ? `${phrase("through their chat {agent}", { agent: k.agent || "" })}${when ? ` · asked ${when} ago` : ""}`
      : `${seat?.title || k.seat}${when ? ` · asked ${when} ago` : ""}`,
    next: rest.length ? nextInLine(rest) : "",
    nextLabel: phrase("next")
  };
}

solidMounts.push((hive) => {
  nudgeSolid = hive.mountNudge($("nudge"));
});

function nextInLine(rest) {
  const seatOf = (k) => st.data.sessions.find((x) => x.name === k.seat)?.title || k.seat;
  if (rest.length === 1 && raycastOn()) return `${rest[0].from} · ${seatOf(rest[0])}`;
  if (rest.length === 1) return `${rest[0].from}, for ${seatOf(rest[0])}`;
  return phrase("{n} more asking — {who}", { n: rest.length, who: rest.map((k) => k.from).join(", ") });
}

function closeNudge() {
  st.nudgeQueue = st.nudgeQueue.filter((k) => !sameKnock(k, st.nudgeNow));
  paintNudge();
}

function answerNudge(ok) {
  const k = st.nudgeNow;
  if (!k) return;
  const where = isAsk(k) && ok ? ($("nudge-seat").value || "") : k.seat;
  if (isAsk(k) && ok && !where) return;
  closeNudge();
  answerKnock({ ...k, seat: where }, ok);
}

async function answerKnock(knock, ok) {
  st.knocksOpen = st.knocksOpen.filter((k) => !sameKnock(k, knock));
  paintKnocks();
  paintNudge();
  await fetch("/api/knocks/answer", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ from: knock.from, seat: knock.seat, id: knock.id || "", ok })
  }).catch(() => {});
  if (isAsk(knock)) {
    return pullKnocks();
  }
  pullKnocks();
}

async function takeKeyboardBack(seat) {
  await fetch("/api/knocks/revoke", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ seat })
  }).catch(() => {});
  pullKnocks();
}

const toneOf = (dev) => TONES[[...String(dev)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 997, 7) % TONES.length];

st.dealt = new Map();

let dealtKey = "";

function reDeal() {
  const rows = (st.team.devs || []).map((d) => ({ dev: d.dev, avatar: d.dev === st.team.me ? myAvatarKey() || d.avatar || "" : d.avatar || "" }));
  if (st.team.me && !rows.some((r) => r.dev === st.team.me)) rows.push({ dev: st.team.me, avatar: myAvatarKey() });
  const key = rows.map((r) => `${r.dev}:${r.avatar}`).sort().join("|");
  if (key === dealtKey) return;
  dealtKey = key;
  st.dealt = dealFaces(rows);
}

/* the face the deal settled, wearing what its owner put on: mine from this session, a mate's
   from the panel their hive publishes. the clothes never enter the deal. */
const devFace = (dev) => {
  reDeal();
  const face = st.dealt.get(dev) || (dev === st.team.me && st.myFace) || parseAvatar(teamRow(dev)?.avatar) || avatarFor(String(dev || ""));
  const wear = dev === st.team.me ? (st.myWear || {}) : parseWear(teamRow(dev)?.wear);
  return { ...face, wear };
};

const myAvatarKey = () => (st.myBlob ? BLOB_FACE : st.myFace ? avatarKey(st.myFace) : "");

const wearsBlob = (dev) => (dev === st.team.me ? !!st.myBlob : teamRow(dev)?.avatar === BLOB_FACE);

const faceSvg = (dev, salt) => (wearsBlob(dev) ? personFace(dev) : avatarSvg(devFace(dev), { salt, title: String(dev || "") }));

const wroteFace = (dev) => !!parseAvatar(teamRow(dev)?.avatar);

function takenSlots() {
  reDeal();
  const out = new Set();
  for (const [dev, spec] of st.dealt) if (dev !== st.team.me && wroteFace(dev)) out.add(faceSlot(spec));
  return out;
}

const avatar = (dev) => `<span class="team-av face av-alive">${faceSvg(dev, `team-${dev}`)}</span>`;

const machinesOf = (dev) => st.team.devs.filter((d) => d.dev === dev);
const teamRow = (dev) => {
  const his = machinesOf(dev);
  const up = his.filter((d) => d.up);
  if (!up.length) return his[0] || null;
  return up.reduce((best, d) => (d.at > best.at ? d : best), up[0]);
};
const machineRow = (key) => st.team.devs.find((d) => d.key === key) || null;
const mirrorRow = () => machineRow(st.mirrorKey) || teamRow(st.mirrorDev);

let teamShape = "";

async function pullTeam(force, only = "") {
  try {
    const ask = only ? `?dev=${encodeURIComponent(only)}` : force ? "?force=1" : "";
    const r = await apiGet(`/api/team${ask}`).catch((wrong) => {
      if (!raycastOn()) throw wrong;
      if (!only) st.teamTrouble = Date.now();
      return null;
    });
    if (!r || !Array.isArray(r.devs)) {
      if (raycastOn() && st.teamTrouble) render();
      return;
    }
    const recovered = !!st.teamTrouble;
    st.teamTrouble = 0;
    st.teamSeenAt = Date.now();
    const shape = JSON.stringify(r);
    if (shape === teamShape) {
      if (recovered && raycastOn()) render();
      return;
    }
    teamShape = shape;
    const wasFast = holdingKeyboard();
    st.team = r;
    for (const d of st.team.devs) {
      for (const seat of d.seats || []) {
        if (seat.keyboard && seat.keyboard.with === st.team.me) knocked.delete(`${d.dev}/${seat.name}`);
      }
    }
    paintShare();
    paintPhone();
    paintMachines();
    if (wasFast !== holdingKeyboard()) paceTeam();
    if (st.mirrorDev && !mirrorRow()) st.mirrorDev = "";
    render();
  } catch {}
}

function goToTeam(key) {
  const row = machineRow(key);
  if (!row) return;
  teamFlash(row.dev, "swirl");
  screenOpens();
  releaseKeyboard();
  /* the chat belongs to the hive we are leaving, and its key is written with that hive's name in it */
  closeMirrorChat(false);
  const leaving = st.mirrorKey === key;
  st.mirrorKey = leaving ? "" : key;
  st.mirrorDev = leaving ? "" : row.dev;
  forgetMirrorChats(st.mirrorDev);
  render();
  if (st.mirrorDev) pullTeam(true, st.mirrorDev);
}

function leaveMirror() {
  if (!st.mirrorDev) return;
  closeMirrorChat(false);
  st.mirrorDev = "";
  forgetMirrorChats("");
  render();
}

function wireMirrorTalk(name, talk) {
  if (!talk) return;
  for (const a of talk.querySelectorAll("a.md-shot")) a.addEventListener("click", (ev) => ev.preventDefault());
  wireShelfLinks(name, talk);
}

const mirrorCards = new Map();

function renderMirror() {
  const row = mirrorRow();
  const box = $("mirror");
  const watched = st.mirrorOpen ? (row?.seats || []).find((x) => x.name === st.mirrorOpen) : null;
  if (st.mirrorOpen && !watched) closeMirrorChat(false);
  box.classList.toggle("zoom", !!st.mirrorOpen);
  sweepMirrorChats(row);
  if (watched && watched.keyboard?.with === st.team.me && !beatOn("mirror")) armMirrorLive();
  const stuck = new Map();
  for (const talk of box.querySelectorAll(".mirror-talk")) {
    stuck.set(talk.closest("article")?.dataset.key || "", talk.scrollHeight - talk.scrollTop - talk.clientHeight < 24);
  }
  mirrorSolid.show(mirrorViewModel());
  for (const talk of box.querySelectorAll(".mirror-talk")) {
    if (stuck.get(talk.closest("article")?.dataset.key || "") === false) continue;
    talk.scrollTop = talk.scrollHeight;
  }
  if (!watched || !row) return;
  const card = [...box.children].find((one) => one.dataset.key === `${row.dev}/${watched.name}`);
  const well = card?.querySelector(".well");
  const e = getStructured({ name: teamSeatKey(row.dev, watched.name, row.key), where: watched.where, mirror: { dev: row.dev, seat: watched.name } });
  e.host.classList.toggle("sv-cold", watched.keyboard?.with !== st.team.me);
  if (well && e.host.parentElement !== well) well.appendChild(e.host);
}

let mirrorSolid = null;

const mirrorFace = (dev) => faceSvg(dev, `team-${dev}`);

function mirrorEmptyModel(row) {
  if (!row) return { key: "gone", dev: "", said: "" };
  if (row.up) return { key: "up", dev: String(row.dev ?? ""), said: phrase("has the server up and nothing running — or the panel is closed, and the cards went stale.") };
  return {
    key: "asleep", dev: "",
    said: `${phrase("{dev}'s server", { dev: row.dev })} ${phrase("is asleep. Opening it here does not wake it: the hive comes back when {dev} does.", { dev: row.dev })}`
  };
}

function mirrorSideModel(seat, row) {
  return {
    title: String(seat.title ?? ""), name: String(seat.name ?? ""), dev: String(row.dev ?? ""), face: mirrorFace(row.dev),
    colour: stateColor(seat.state), glyph: GLYPH[seat.state], label: phrase(LABEL[seat.state]),
    when: String(seat.when ?? ""), where: seat.where,
    whereSaid: seat.where === "cloud" ? phrase("{dev}'s server", { dev: row.dev }) : phrase("{dev}'s machine", { dev: row.dev }),
    model: seat.model ? String(seat.model) : "",
    blank: !(seat.summary || seat.description),
    summary: seat.summary || seat.description || phrase("no card written yet")
  };
}

function mirrorKbModel(seat, row) {
  const lent = seat.keyboard;
  if (lent && lent.with === st.team.me) {
    return {
      mine: true, face: mirrorFace(st.team.me), who: phrase("you"),
      say: phrase("are at this keyboard · {n} sees it live", { n: row.dev }),
      act: { kind: "give", dev: row.dev, seat: seat.name, give: seat.name, knock: undefined, quiet: true, off: false, label: phrase("give it back") }
    };
  }
  if (lent) return { mine: false, face: mirrorFace(lent.with), who: String(lent.with), say: phrase("is at this keyboard right now"), act: null };
  if (row.knocks === false) return { mine: false, face: mirrorFace(row.dev), who: String(row.dev), say: phrase("is not taking keyboard asks right now"), act: null };
  const holding = knockHolds(row.dev, seat.name);
  const asked = knockedAt(row.dev, seat.name) > 0;
  const refused = knockRefused.get(`${row.dev}/${seat.name}`);
  return {
    mine: false, face: mirrorFace(row.dev), who: String(row.dev), say: refused ? phrase("has the keyboard · your ask did not leave: {why}", { why: refused }) : phrase("has the keyboard of this seat"),
    act: {
      kind: "knock", dev: row.dev, seat: seat.name, give: undefined, knock: seat.name, quiet: holding, off: holding,
      label: holding ? phrase("asked — waiting") : asked ? phrase("ask again") : phrase("ask for the keyboard")
    }
  };
}

function mirrorTalkModel(seat, row) {
  return {
    chat: teamSeatKey(row.dev, seat.name, row.key),
    nothing: phrase("nothing said yet — what you send lands in {n}'s seat", { n: row.dev }),
    turns: (seat.keyboard?.turns || []).map((t, at) => ({ key: `${at}:${t.who}:${t.text}`, you: t.who === "you", html: renderMarkdown(t.text) }))
  };
}

function mirrorCardModel(seat, row) {
  const mine = !!(seat.keyboard && seat.keyboard.with === st.team.me);
  const shown = st.mirrorOpen === seat.name;
  return {
    key: `${row.key || row.dev}/${seat.name}`, name: seat.name, dev: row.dev, state: seat.state, tone: toneOf(row.dev), mine, shown,
    side: mirrorSideModel(seat, row),
    kb: mirrorKbModel(seat, row),
    talk: mine && !shown ? mirrorTalkModel(seat, row) : null,
    composer: mine && !shown ? { placeholder: phrase("message this seat as {me}", { me: st.team.me }), send: phrase("send") } : null
  };
}

function mirrorViewModel() {
  const row = mirrorRow();
  if (!row || !row.seats.length) return { empty: mirrorEmptyModel(row), cards: [] };
  return { empty: null, cards: row.seats.map((seat) => mirrorCardModel(seat, row)) };
}

solidMounts.push((hive) => {
  mirrorSolid = hive.mountMirror($("mirror"), {
    side: (key) => {
      const row = mirrorRow();
      const seat = (row?.seats || []).find((one) => `${row.dev}/${one.name}` === key);
      if (!seat) return;
      if (st.mirrorOpen === seat.name) return closeMirrorChat();
      if (seat.keyboard && seat.keyboard.with === st.team.me) openMirrorChat(seat.name);
    },
    keyboard: (act) => (act.kind === "give" ? giveKeyboardBack(act.dev, act.seat) : askForKeyboard(act.dev, act.seat)),
    say: (dev, seat, box) => sayToTeamSeat(dev, seat, box.value, box),
    wireTalk: (name, el) => wireMirrorTalk(name, el)
  });
  mirrorCards.clear();
});

export { KNOCKS_TICK, KNOCK_HOLD, NUDGE_AGAIN, TONES, answerKnock, wroteFace, answerNudge, askForKeyboard, avatar, closeNudge, dealtKey, devFace, faceSvg, giveKeyboardBack, goToTeam, greetFrom, holdingKeyboard, isAsk, keepNudging, knockHolds, knockId, knocked, knockedAt, knocksKey, knocksSeen, knocksSolid, knocksViewModel, leaveMirror, lentSeen, mirrorCardModel, mirrorCards, mirrorEmptyModel, mirrorFace, mirrorKbModel, mirrorSideModel, mirrorSolid, mirrorTalkModel, mirrorViewModel, nextInLine, nudge, nudgeAhead, nudgeSolid, nudgeViewModel, paceTeam, paintKnocks, paintNudge, pokesSeen, pullKnocks, pullTeam, pulseNudge, reDeal, renderMirror, sameKnock, sayToTeamSeat, shakeWindow, stopNudging, takeKeyboardBack, takeLent, takePokes, takenSlots, teamFocus, teamRow, mirrorRow, toneOf, wearsBlob, wireMirrorTalk };
