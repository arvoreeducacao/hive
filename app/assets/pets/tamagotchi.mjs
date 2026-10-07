import { BASE, COLOURS, PAPER, avatarFor, avatarKey, isAvatar, wearKey } from "../avatar/avatar.mjs";
import { frameOf, frameSvg, holdOf, playHasEyes } from "../avatar/avatar-play.mjs";
import { phrase } from "../i18n.mjs";
import { ASK, RALLY, askDue, mountRally } from "./rally.mjs";


export const TAMAGOTCHI_ID = "blob";

export const NEST_KEY = "hive.tamagotchi";

export const CARE_MAX = 100;

export const HATCH_CARE = 80;

/* a full heart takes about seven hours of being ignored to empty — a workday, not a weekend */
export const DECAY_PER_HOUR = 14;

export const CARE_OF_ACT = { pet: 10, feed: 32, rally: 14 };

export const HUNGRY_BELOW = 40;

export const PET_PLAYS = ["wink", "swirl", "play"];

export const PARTY_PLAYS = ["burst", "play"];

export const PARTY_STREAK = 3;

/* two clicks are a hug, three to five are a cheer, and whoever keeps going finds the show:
   the escalation is the easter egg's front door, discovered by playing, never announced */
export const HUG_STREAK = 2;

export const SING_STREAK = 6;

export const TICKLE_HOLD_MS = 650;

export const PLAY_OF_MOOD = { needs: "siren", answered: "wide", working: "muse", done: "burst", stalled: "snooze" };

export const STAGES = ["forlorn", "lonely", "content", "beaming"];

/* the night took the ball away and the first day in the wild took it from abandonment too: a
   creature that shrinks to a bead reads as gone, and a bead that bobs reads as a bug. however
   forlorn, it stays a body — the sleepy eyes are what says it is waiting for you. */
export const REST_OF_STAGE = { beaming: "idle", content: "idle", lonely: "idle", forlorn: "snooze" };

export const WHINE_OF_STAGE = { beaming: "", content: "", lonely: "notify", forlorn: "exclaim" };

export const TALK_OF_STAGE = {
  beaming: "glowing — you take good care of it",
  content: "wobbling happily at the foot of the rail",
  lonely: "feeling a bit forgotten… one click would help",
  forlorn: "dozing off alone, waiting for you…"
};

export const TALK_OF_MOOD = {
  needs: "siren spinning — a seat needs you!",
  answered: "wide-eyed — you answered!",
  working: "thinking along with the fleet",
  done: "bursting with pride — a turn came home!",
  stalled: "dozed off with the fleet…"
};

export const HATCH_TALK = "fresh out of the egg — it has your colours!";

export const NEAR_TALK = "holding still, breathing, eyes on you";

export const NEAR_PX = 150;

export const GAZE_REACH_PX = 110;

export const GAZE_YAW = 26;

export const GAZE_PITCH = 22;

export const COMPANY_EASE = 0.16;

/* the reach was a circle of a hundred and ten pixels drawn around a face that sits at the foot of
   the rail, and the cursor spends the day in a terminal well outside it — so the eyes never once
   looked up. the same thing had already happened to the mug in the title bar, and was fixed there
   by making the reach the window. this takes the reach as an argument so the setting can hand it
   the window, or the whole screen, and keeps the old pair as the default the tests pin. */
export const GAZE_CUTOFF = NEAR_PX / GAZE_REACH_PX;

export function gazeAt(dx, dy, reach = GAZE_REACH_PX) {
  if (!(reach > 0)) return null;
  if (Math.hypot(dx, dy) > reach * GAZE_CUTOFF) return null;
  const toward = (v) => Math.min(Math.max(v / reach, -1), 1);
  return { yaw: toward(dx) * GAZE_YAW, pitch: -toward(dy) * GAZE_PITCH };
}

/* ── the balloon ──
   the creature says one short line, rarely: a balloon that talks all day is a notification
   center wearing a costume. the cooldown is the whole design — and calm mode mutes it. */
export const SAY_HOLD_MS = 6000;

export const SAY_COOLDOWN_MS = 240000;

export const SAY_LINES = {
  morning: "good morning",
  turn: "a turn came home!",
  hungry: "i'm hungry…",
  stalled: "snoring along…",
  toast: "a toast to the easy life",
  pong: "ping pong? tap me",
  youWin: "you win! {score}",
  iWin: "i win! {score}"
};

export function sayGate(now, lastAt, line, lastLine) {
  const wait = line === lastLine ? 6 * SAY_COOLDOWN_MS : SAY_COOLDOWN_MS;
  return now - lastAt >= wait;
}

/* ── the night, and the easy life ── */
export const NIGHT_FROM = 22;

export const NIGHT_TO = 7;

export const nightAt = (hour) => hour >= NIGHT_FROM || hour < NIGHT_TO;

export const TOAST_KEY = "hive.tamagotchi.toast";

export const MORNING_KEY = "hive.tamagotchi.morning";

export const BUSY_MOODS = ["needs", "answered", "working"];

export const dayStamp = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/* the joke only lands if it is true: a weekday, an afternoon that started busy and went
   quiet before six — someone clocked out early, and the creature raises a glass to it */
export function vidaMansaDue(date, sawBusy, quietNow, lastDay) {
  const dow = date.getDay();
  const hour = date.getHours();
  return sawBusy && quietNow && dow >= 1 && dow <= 5 && hour >= 14 && hour < 18 && dayStamp(date) !== lastDay;
}

/* ── the throw ──
   pixels and seconds, one gravity: the creature is picked up when the pointer moves past the
   start threshold, flies with the hand's own velocity, bounces off the walls of its strip and
   off the ceiling, and lands when the floor takes the last of the fall. calm mode never lifts
   it — a drag under calm is just a pat that wandered. */
/* `ceil` saiu: a arena deixou de ser a caixinha do rodapé e passou a ser a janela, que se mede na
   hora. `step`, `catchup` e `home` são o preço de desenhar o voo a cada quadro da tela em vez de
   nos 25 do tick — sem eles as constantes acima só valeriam a 25fps. */
export const FLING = { start: 8, grav: 2600, bounce: 0.55, settle: 130, max: 1600, window: 90, step: 1 / 120, catchup: 0.05, home: 47, edge: 10 };

/* the walls are answered by clamping the position and turning the velocity around, so nothing can
   leave the arena in a single step however hard it is thrown.

   the settle threshold has to know the step. a bounce smaller than one tick of gravity can never
   leave the floor again: kept, it feeds a cycle where the fall hands back exactly what the floor
   took, and the creature hovers a pixel above the ground forever without ever being slow enough
   to land. at 25 frames a second one tick of gravity is 104 and the tuned 130 covered it by luck;
   at 120 it is 22, and the luck runs out in the other direction. */
export function flightStep(fly, dt, walls) {
  const next = { ...fly };
  next.vy += FLING.grav * dt;
  next.x += next.vx * dt;
  next.y += next.vy * dt;
  let event = "";
  if (next.x < walls.left || next.x > walls.right) {
    next.x = next.x < walls.left ? walls.left : walls.right;
    next.vx = -next.vx * FLING.bounce;
    event = "bounce";
  }
  if (next.y < walls.top) {
    next.y = walls.top;
    next.vy = Math.abs(next.vy) * FLING.bounce;
    event = "bounce";
  }
  if (next.y >= walls.floor) {
    next.y = walls.floor;
    if (Math.abs(next.vy) <= Math.max(FLING.settle, FLING.grav * dt)) return { fly: next, event: "landed" };
    next.vy = -Math.abs(next.vy) * FLING.bounce;
    next.vx *= 0.82;
    event = "bounce";
  }
  return { fly: next, event };
}

/* the hand's velocity is read off the last few pointer samples, not the whole drag: a slow
   carry that ends in a flick should fly like the flick */
export const THROWS_BEFORE_SULK = 5;

export const SULK_MS = 300000;

export function landedMood(tally, now) {
  const kept = tally.sulkUntil && now >= tally.sulkUntil ? { throws: 0, sulkUntil: 0 } : { ...tally };
  kept.throws += 1;
  if (kept.sulkUntil && now < kept.sulkUntil) return { tally: kept, play: "cross" };
  if (kept.throws > THROWS_BEFORE_SULK) return { tally: { ...kept, sulkUntil: now + SULK_MS }, play: "cross" };
  return { tally: kept, play: "glee" };
}

export function launchFrom(swings, at) {
  const seen = swings.filter((s) => at - s.t <= FLING.window);
  if (seen.length < 2) return null;
  const a = seen[0];
  const b = seen[seen.length - 1];
  const ms = Math.max(b.t - a.t, 16);
  const cap = (v) => Math.max(-FLING.max, Math.min(FLING.max, v));
  return { vx: cap(((b.x - a.x) / ms) * 1000), vy: cap(((b.y - a.y) / ms) * 1000) };
}

export const clampCare = (v) => Math.min(Math.max(Math.round(v), 0), CARE_MAX);

export function decayedCare(care, sinceMs) {
  return clampCare(care - (Math.max(0, sinceMs) / 3600000) * DECAY_PER_HOUR);
}

export function careAfter(care, act) {
  return clampCare(care + (CARE_OF_ACT[act] || 0));
}

export function stageOf(care) {
  return care >= 70 ? "beaming" : care >= 40 ? "content" : care >= 15 ? "lonely" : "forlorn";
}

export function isHungry(care) {
  return care < HUNGRY_BELOW;
}

export function reactionTo(care, streak, roll = 0) {
  if (isHungry(care)) return { act: "feed", play: "burst" };
  if (streak >= SING_STREAK) return { act: "sing", play: "sing" };
  if (streak === HUG_STREAK) return { act: "hug", play: "hug" };
  const deck = streak >= PARTY_STREAK ? PARTY_PLAYS : PET_PLAYS;
  return { act: streak >= PARTY_STREAK ? "party" : "pet", play: deck[Math.floor(Math.min(Math.max(roll, 0), 0.999) * deck.length)] };
}

export function heartsOf(care) {
  const lit = Math.round((care / CARE_MAX) * 5);
  return "♥".repeat(lit) + "♡".repeat(5 - lit);
}

export function hatchNest(now) {
  return { care: HATCH_CARE, at: now, born: now };
}

export function readNest(store, now) {
  let raw = null;
  try { raw = store && store.getItem(NEST_KEY); } catch { return null; }
  if (!raw) return null;
  let kept = null;
  try { kept = JSON.parse(raw); } catch { return null; }
  if (!kept || typeof kept.care !== "number" || typeof kept.at !== "number") return null;
  return { care: decayedCare(kept.care, now - kept.at), at: now, born: typeof kept.born === "number" ? kept.born : kept.at };
}

export function writeNest(store, nest) {
  try { store && store.setItem(NEST_KEY, JSON.stringify(nest)); } catch {}
}

const TICK_MS = 40;

const STROLL_PX = 0.55;

const PATROL_PX = 1.1;

const STAGE_PAD = 10;

const SETTLE_MS = 2600;

const SETTLE_SPREAD_MS = 4200;

const WHINE_MS = 34000;

const WHINE_SPREAD_MS = 36000;

const NAG_MS = 8000;

const CARE_TICK_MS = 60000;

const FACE_EVERY_TICKS = 25;

const HATCH_MS = 2200;

const SNACK_MS = 520;

const STREAK_MS = 1400;

const FACE_PX = 84;

const STYLE = `
#pet.tama-home { pointer-events: none; }
#pet .tama-face { display: block; width: ${FACE_PX}px; height: ${FACE_PX}px; }
#pet .tama-face svg { display: block; width: 100%; height: 100%; }
#pet .tama { position: relative; }
/* out of the corner it flies over the panes and the title bar, so it has to sit above them
   — but under the menus, which start at 65, so it can never cover one that is open */
#pet.tama-aloft { z-index: 60; }
#pet.tama-aloft .tama { cursor: grabbing; }
#pet .tama-heart { position: absolute; left: 50%; top: 6%; width: 18px; height: 18px; pointer-events: none; animation: tama-float 1.1s ease-out forwards; }
#pet .tama-squish { animation: tama-squish 340ms cubic-bezier(.34, 1.56, .64, 1); transform-origin: 50% 100%; }
@keyframes tama-squish { 0% { transform: scale(1); } 35% { transform: scale(1.12, .8); } 70% { transform: scale(.94, 1.08); } 100% { transform: scale(1); } }
#pet .tama-snack { position: absolute; left: 50%; top: -44px; width: 18px; height: 18px; margin-left: -9px; pointer-events: none; animation: tama-drop ${SNACK_MS}ms cubic-bezier(.3,0,.6,1.4) forwards; }
#pet .tama-pulse { position: absolute; left: 50%; bottom: 4px; width: 72px; height: 22px; margin-left: -36px; border-radius: 50%; pointer-events: none; background: radial-gradient(closest-side, rgba(255, 255, 255, .3), transparent 70%); animation: tama-pulse 420ms ease-out forwards; }
@keyframes tama-pulse { from { transform: scale(.5); opacity: .9; } to { transform: scale(1.6); opacity: 0; } }
@keyframes tama-float { from { transform: translate(-50%, 0) scale(.6); opacity: .95; } to { transform: translate(calc(-50% + var(--drift)), -48px) scale(1.15); opacity: 0; } }
@keyframes tama-drop { from { transform: translateY(0); opacity: 0; } 30% { opacity: 1; } to { transform: translateY(56px); opacity: 1; } }
#pet .tama-say { position: absolute; left: 50%; bottom: calc(100% + 8px); transform: translateX(-50%) scale(.85); max-width: 150px; width: max-content; padding: 5px 9px; border-radius: 9px; background: var(--panel2, #1f1f24); border: 1px solid var(--hair-line, #2a2a2f); color: var(--text, #e8e6e1); font-size: 11.5px; line-height: 1.3; text-align: center; opacity: 0; visibility: hidden; transition: opacity 180ms ease, transform 180ms ease, visibility 180ms; pointer-events: none; }
#pet .tama-say::after { content: ""; position: absolute; left: 50%; bottom: -5px; margin-left: -5px; border: 5px solid transparent; border-top-color: var(--panel2, #1f1f24); border-bottom: 0; }
#pet .tama-say.on { opacity: 1; visibility: visible; transform: translateX(-50%) scale(1); }
#pet .tama-note, #pet .tama-zee { position: absolute; left: 50%; top: 10%; pointer-events: none; font-weight: 700; animation: tama-float 1.6s ease-out forwards; }
#pet .tama-note { color: #f0b429; font-size: 14px; }
#pet .tama-zee { color: #8b8b93; font-size: 12px; animation-duration: 2.4s; }
@media (prefers-reduced-motion: reduce) { #pet .tama-heart, #pet .tama-snack, #pet .tama-pulse, #pet .tama-note, #pet .tama-zee, #pet .tama-say { display: none; } }
body.no-motion #pet .tama-heart, body.no-motion #pet .tama-snack, body.no-motion #pet .tama-pulse, body.no-motion #pet .tama-note, body.no-motion #pet .tama-zee, body.no-motion #pet .tama-say { display: none; }
`;

const HEART_SVG = (colour) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.6-9.5-9C.7 8.6 2.6 5 6 5c2 0 3.2 1 4 2.2C10.8 6 12 5 14 5c3.4 0 5.3 3.6 3.5 7-2.5 4.4-9.5 9-9.5 9z" fill="${colour}"/></svg>`;

const SNACK_SVG = (colour) => `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="12" r="7" fill="${colour}"/><circle cx="7.5" cy="9.5" r="2" fill="#ffffff" opacity=".35"/><path d="M10 5c1-2 3-2.6 4-2.4-.3 1.6-1.8 2.8-4 2.9z" fill="#3ecf8e"/></svg>`;

export function snackColour(colour, roll = 0) {
  const others = COLOURS.filter((one) => one !== colour);
  return BASE[others[Math.floor(Math.min(Math.max(roll, 0), 0.999) * others.length)]];
}

export function mountTamagotchi(host, options = {}) {
  const doc = options.document || (host && host.ownerDocument) || document;
  const win = doc.defaultView;
  const store = options.store || (win && win.localStorage);
  const asked = options.reducedMotion;
  const still = () => (typeof asked === "function" ? asked() : asked)
    || (win && win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const nowMs = options.now || (() => Date.now());
  const paper = options.paper || PAPER;

  const faceOf = () => {
    const spec = typeof options.face === "function" ? options.face() : options.face;
    return isAvatar(spec) ? spec : avatarFor(String(options.seed || ""));
  };

  const style = doc.createElement("style");
  style.textContent = STYLE;
  doc.head.appendChild(style);

  const button = doc.createElement("button");
  button.type = "button";
  button.className = "tama";
  const face = doc.createElement("div");
  face.className = "tama-face";
  face.setAttribute("aria-hidden", "true");
  button.appendChild(face);
  const bubble = doc.createElement("div");
  bubble.className = "tama-say";
  bubble.setAttribute("aria-hidden", "true");
  button.appendChild(bubble);
  host.appendChild(button);
  host.classList.add("tama-home");

  const dressedKey = (one) => `${avatarKey(one)} ${wearKey(one?.wear)}`;
  let spec = faceOf();
  let worn = dressedKey(spec);
  let nest = readNest(store, nowMs());
  const hatching = !nest;
  if (hatching) {
    nest = hatchNest(nowMs());
    writeNest(store, nest);
  }
  let care = nest.care;
  let mood = "idle";
  let state = "idle";
  let clock = 0.35;
  let since = 0;
  let from = null;
  let spot = 0;
  let heading = 1;
  let goal = null;
  let settleUntil = 0;
  let hatched = !hatching;
  let streak = 0;
  let lastClick = 0;
  let courting = false;
  let pointer = null;
  let near = false;
  const company = { yaw: 0, pitch: 0, calm: 0 };
  let frameTimer = null;
  let faceTimer = null;
  let careTimer = null;
  let whineTimer = null;
  let nagTimer = null;
  let seqTimer = null;
  let holdTimer = null;
  let sayTimer = null;
  let tickleTimer = null;
  let lastSayAt = -SAY_COOLDOWN_MS;
  let lastSayLine = "";
  let night = nightAt(new Date(nowMs()).getHours());
  let busyDay = "";
  let grab = null;
  let held = null;
  let fly = null;
  let corner = null;
  let homing = false;
  let cross = false;
  let glee = false;
  let tally = { throws: 0, sulkUntil: 0 };
  let raf = 0;
  let lastFrame = 0;
  let owed = 0;
  let aloftClock = 0;
  let swings = [];
  let ticks = 0;
  let quietSince = nowMs();
  let lastGame = null;
  let asking = false;
  let askTimer = null;
  let askHold = null;
  let gameFrom = 0;
  let arena = { mid: 0, floor: 0, span: 0 };

  const stage = () => stageOf(care);

  const overrideOf = () => PLAY_OF_MOOD[mood] || "";

  /* a seat calling for you is the one thing the sulk does not get to swallow: the siren is the
     only play here that exists to fetch a person, and a joke about a thrown creature is not worth
     a missed hand-off. everything else waits until the pat or the nest ends it. */
  const restPose = () => {
    if (mood === "needs") return PLAY_OF_MOOD.needs;
    if (cross) return "cross";
    if (glee) return "glee";
    if (overrideOf() && mood !== "answered" && mood !== "done") return overrideOf();
    if (night) return "snooze";
    return REST_OF_STAGE[stage()];
  };

  const say = (line, { force = false, slots = null } = {}) => {
    if (still()) return false;
    const now = nowMs();
    if (!force && !sayGate(now, lastSayAt, line, lastSayLine)) return false;
    lastSayAt = now;
    lastSayLine = line;
    bubble.textContent = slots ? phrase(line, slots) : phrase(line);
    bubble.classList.add("on");
    if (sayTimer) win.clearTimeout(sayTimer);
    sayTimer = win.setTimeout(() => bubble.classList.remove("on"), SAY_HOLD_MS);
    return true;
  };

  const drift = (kind, glyph) => {
    if (still()) return;
    const bit = doc.createElement("span");
    bit.className = kind;
    bit.textContent = glyph;
    bit.style.setProperty("--drift", `${Math.round((Math.random() * 2 - 1) * 30)}px`);
    button.appendChild(bit);
    win.setTimeout(() => bit.remove(), 2600);
  };

  const talkNow = () => {
    if (!hatched) return HATCH_TALK;
    if (near) return NEAR_TALK;
    return TALK_OF_MOOD[mood] || TALK_OF_STAGE[stage()];
  };

  const tell = () => {
    button.title = phrase("the little you — {talk} · {hearts} · a click is a pat, ⌥ a game", { talk: phrase(talkNow()), hearts: heartsOf(care) });
    button.setAttribute("aria-label", phrase("the little you at the foot of the rail — a click is a pat, ⌥ a game"));
  };

  const draw = () => {
    const kept = company.calm > 0.01 ? company : null;
    const svg = frameSvg(spec, frameOf(spec, state, clock, since, from, kept), "tama", paper);
    face.innerHTML = svg;
  };

  const clearHold = () => {
    if (holdTimer) win.clearTimeout(holdTimer);
    holdTimer = null;
  };

  /* the same play asked for again starts over instead of being swallowed: a click must always
     land somewhere the eye can see, even when the dice roll what is already on screen */
  function play(next, { hold = true } = {}) {
    if (next !== state) from = frameOf(spec, state, clock, since, from).pose;
    state = next;
    since = 0;
    clearHold();
    if (hold) holdTimer = win.setTimeout(rest, 1000 * holdOf(next));
    if (still()) draw();
  }

  function rest() {
    const pose = restPose();
    if (pose !== state) play(pose, { hold: false });
    tell();
  }

  const roomAcross = () => Math.max(0, (host.clientWidth - FACE_PX) / 2 - STAGE_PAD);

  /* where the nest sits in the window, with whatever offset it is currently wearing taken back
     out — the flight is measured from the nest, so the walls have to be too. */
  const findNest = () => {
    const box = button.getBoundingClientRect();
    const at = held || fly;
    corner = { x: box.left - (at ? at.x : spot), y: box.top - (at ? at.y : 0) };
  };

  /* the whole window, not the strip: the creature is placed with a transform and nothing between
     it and the viewport clips one, so the arena costs a measurement rather than an overlay. */
  /* the edge is held back by a margin because the creature leans as it flies: an 84px body tilted
     fourteen degrees measures a hundred and six, so a wall it touches exactly is a wall it pokes
     nine pixels through — clipped by the window in the app, and a scrollbar anywhere the page is
     allowed to scroll. */
  const walls = () => {
    const w = win.innerWidth - FACE_PX - FLING.edge;
    const h = win.innerHeight - FACE_PX - FLING.edge;
    return {
      left: -corner.x + FLING.edge,
      right: Math.max(-corner.x + FLING.edge, w - corner.x),
      top: -corner.y + FLING.edge,
      floor: Math.max(-corner.y + FLING.edge, h - corner.y)
    };
  };

  const place = () => {
    if (held || fly) {
      const x = held ? held.x : fly.x;
      const y = held ? held.y : fly.y;
      /* the walk home is a walk: it gets the same hop and lean the stroll has, or it reads as the
         creature being slid across the floor by somebody else. the flight keeps its own lean,
         taken from how fast it is travelling sideways. */
      const hop = homing && !courting ? Math.abs(Math.sin(aloftClock * 9)) * 3.5 : 0;
      const lean = homing ? heading * 3 : (fly ? Math.max(-14, Math.min(14, fly.vx / 60)) : 0);
      button.style.transform = `translate(${x.toFixed(1)}px, ${(y - hop).toFixed(1)}px) rotate(${lean.toFixed(1)}deg)`;
      return;
    }
    const walking = !courting && (goal !== null || state === "muse");
    const hop = walking ? Math.abs(Math.sin(clock * 9)) * 3.5 : 0;
    const lean = walking ? heading * 3 : 0;
    button.style.transform = `translate(${spot.toFixed(1)}px, ${-hop.toFixed(1)}px) rotate(${lean}deg)`;
  };

  const patrol = () => {
    const span = roomAcross();
    if (span < PATROL_PX) return;
    spot += heading * PATROL_PX;
    if (Math.abs(spot) >= span) {
      spot = Math.sign(spot) * span;
      heading = -heading;
    }
  };

  const wander = () => {
    const span = roomAcross();
    if (goal === null) {
      if (clock * 1000 < settleUntil) return;
      if (span < STROLL_PX * 8) {
        settleUntil = clock * 1000 + SETTLE_MS;
        return;
      }
      goal = (Math.random() * 2 - 1) * span;
      if (Math.abs(goal - spot) < span / 3) goal = -goal;
      heading = goal > spot ? 1 : -1;
      return;
    }
    spot += heading * STROLL_PX;
    if ((heading > 0 && spot >= goal) || (heading < 0 && spot <= goal)) {
      spot = goal;
      goal = null;
      settleUntil = clock * 1000 + SETTLE_MS + Math.random() * SETTLE_SPREAD_MS;
    }
  };

  /* a pointer the window can see wins, because it is the exact one. the far one comes from the
     main process and keeps arriving while the cursor is in somebody else's window, which is the
     whole point of it. */
  const aimedAt = () => (pointer || (options.farPointer ? options.farPointer() : null));

  /* the eyes used to be answered only while resting, which is also the only state the creature
     ever strolls in — so it could look at you, or move, never both. what actually decides it is
     whether the play left a face on screen at all: the ones that put a mark where the body was
     have nothing to look with. being thrown is the one time it is too busy. */
  const noticed = () => {
    if (!hatched || !playHasEyes(state)) return null;
    if (held || fly) return null;
    const at = aimedAt();
    if (!at) return null;
    const box = face.getBoundingClientRect();
    if (!box.width) return null;
    const reach = options.reach ? options.reach() : GAZE_REACH_PX;
    return gazeAt(at.x - (box.left + box.width / 2), at.y - (box.top + box.height / 2), reach);
  };

  const keepCompany = () => {
    const seen = noticed();
    const was = near;
    near = seen !== null;
    if (seen) {
      company.yaw += (seen.yaw - company.yaw) * COMPANY_EASE;
      company.pitch += (seen.pitch - company.pitch) * COMPANY_EASE;
    }
    company.calm += ((near ? 1 : 0) - company.calm) * COMPANY_EASE;
    if (near !== was) {
      if (!near) settleUntil = clock * 1000 + SETTLE_MS;
      tell();
    }
  };

  const greetMorning = () => {
    const day = dayStamp(new Date(nowMs()));
    let seen = "";
    try { seen = (store && store.getItem(MORNING_KEY)) || ""; } catch {}
    if (seen === day) return;
    try { store && store.setItem(MORNING_KEY, day); } catch {}
    say(SAY_LINES.morning);
  };

  const checkNight = () => {
    const was = night;
    night = nightAt(new Date(nowMs()).getHours());
    if (night === was) return false;
    if (night) rest();
    else {
      play("wide");
      greetMorning();
    }
    return true;
  };

  const advance = (dt) => {
    if (homing) return walkHome(dt);
    const out = flightStep(fly, dt, walls());
    fly = out.fly;
    spot = fly.x;
    if (out.event === "bounce" && state !== "soar") play("soar", { hold: false });
    if (out.event !== "landed") return true;
    /* landed. the sulk starts here rather than at the throw: surprise belongs to the air, and
       being cross is what you are once you are back on the floor with a walk ahead of you. */
    homing = true;
    const landed = landedMood(tally, nowMs());
    tally = landed.tally;
    cross = landed.play === "cross";
    glee = !cross;
    sparkle(cross ? 2 : 3);
    play(landed.play, { hold: false });
    tell();
    return true;
  };

  /* it always comes to a stop on the floor of the window, and the nest is on that same floor, so
     the way back is the walk it already knows rather than a flight it would have to invent. the
     pointer resting on it holds the sulk where it is, the same way it holds the stroll: asking
     someone to catch a moving target they are already touching is the difference between a toy
     and a chore. it glares at you while it waits. */
  const walkHome = (dt) => {
    if (courting) return true;
    const reach = FLING.home * dt;
    const near1 = (d) => Math.max(-reach, Math.min(reach, d));
    if (Math.abs(fly.x) < 1 && Math.abs(fly.y) < 1) {
      nestAgain();
      return false;
    }
    heading = fly.x <= 0 ? 1 : -1;
    fly = { ...fly, x: fly.x + near1(-fly.x), y: fly.y + near1(-fly.y) };
    spot = fly.x;
    return true;
  };

  const nestAgain = () => {
    grounded();
    fly = null;
    homing = false;
    cross = false;
    glee = false;
    spot = 0;
    goal = null;
    host.classList.remove("tama-aloft");
    settleUntil = clock * 1000 + SETTLE_MS;
    /* the strut was the old landing, back when the throw ended where it started. it reads better
       as the arrival: thrown, surprised, cross the whole way home, and then a little dignity
       recovered on the doorstep. the hold hands the face back to rest by itself. */
    play("strut");
    sparkle(2);
    place();
  };

  /* the screen sets how often this is drawn; the physics is stepped at its own fixed rate however
     many of those fit in the frame, so a 120Hz mac and a 60Hz one see the same throw, and a frame
     the browser skipped while the window was hidden cannot teleport the creature. the 40ms tick
     the rest of the creature lives on is 25 frames a second: enough for a face that breathes, far
     too few for something crossing the window. */
  const glide = (now) => {
    raf = 0;
    if (!fly) return;
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, FLING.catchup) : FLING.step;
    lastFrame = now;
    aloftClock += dt;
    if (!grab) {
      owed += dt;
      while (owed >= FLING.step) {
        owed -= FLING.step;
        if (!advance(FLING.step)) return;
      }
    }
    place();
    raf = win.requestAnimationFrame(glide);
  };

  const soar = () => {
    if (raf || still()) return;
    lastFrame = 0;
    owed = 0;
    raf = win.requestAnimationFrame(glide);
  };

  const grounded = () => {
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
  };

  const step = () => {
    clock += TICK_MS / 1000;
    since += TICK_MS / 1000;
    keepCompany();
    /* being hovered still stops it, because a click is coming. being merely looked at no longer
       does: with the reach set to the whole screen you are always within it, and cancelling the
       stroll on that meant the creature had not taken a step in months. */
    if (rally.playing() && nowMs() - gameFrom > RALLY.longest) rally.stop();
    if (held || fly || courting || rally.playing()) goal = null;
    else if (state === "idle") wander();
    else if (state === "muse" && mood === "working") patrol();
    else goal = null;
    ticks += 1;
    if (state === "sing" && ticks % 16 === 0) drift("tama-note", ticks % 32 ? "♪" : "♫");
    if (state === "snooze" && ticks % 70 === 0) drift("tama-zee", "z");
    draw();
    place();
  };

  const adoptFace = () => {
    const next = faceOf();
    const key = dressedKey(next);
    if (key === worn) return false;
    spec = next;
    worn = key;
    from = null;
    draw();
    return true;
  };

  /* the body it wears is not part of the motion budget: the tick loop above never starts under calm,
     and a creature that cannot move must still put on the face its person picked. */
  const faceTick = () => {
    const dressed = adoptFace();
    if (checkNight() && !dressed) draw();
  };

  const save = () => {
    nest = { care, at: nowMs(), born: nest.born };
    writeNest(store, nest);
  };

  const careTick = () => {
    const was = stage();
    care = decayedCare(care, CARE_TICK_MS);
    save();
    if (stage() !== was && !overrideOf() && (state === "idle" || state === "sleep" || state === "snooze")) rest();
    if (isHungry(care) && !night) say(SAY_LINES.hungry);
    tell();
  };

  const whine = () => {
    whineTimer = win.setTimeout(whine, WHINE_MS + Math.random() * WHINE_SPREAD_MS);
    if (overrideOf() || !hatched || rally.playing() || asking) return;
    const cry = WHINE_OF_STAGE[stage()];
    if (cry && (state === "idle" || state === "sleep" || state === "snooze")) play(cry);
  };

  const sparkle = (count) => {
    if (still()) return;
    for (let i = 0; i < count; i += 1) {
      const bit = doc.createElement("span");
      bit.className = "tama-heart";
      bit.style.setProperty("--drift", `${Math.round((Math.random() * 2 - 1) * 26)}px`);
      bit.style.animationDelay = `${i * 90}ms`;
      bit.innerHTML = HEART_SVG(BASE[spec.colour] || BASE.blue);
      button.appendChild(bit);
      win.setTimeout(() => bit.remove(), 1400 + i * 90);
    }
  };

  const feed = () => {
    const snack = doc.createElement("span");
    snack.className = "tama-snack";
    snack.innerHTML = SNACK_SVG(snackColour(spec.colour, Math.random()));
    button.appendChild(snack);
    play("wide", { hold: false });
    if (seqTimer) win.clearTimeout(seqTimer);
    seqTimer = win.setTimeout(() => {
      snack.remove();
      play("burst");
      sparkle(4);
    }, still() ? 0 : SNACK_MS);
  };

  const squish = () => {
    if (still()) return;
    face.classList.remove("tama-squish");
    void face.offsetWidth;
    face.classList.add("tama-squish");
  };

  const pulse = () => {
    if (still()) return;
    const glow = doc.createElement("span");
    glow.className = "tama-pulse";
    button.appendChild(glow);
    win.setTimeout(() => glow.remove(), 460);
  };

  const measureCourt = () => {
    const strip = host.getBoundingClientRect();
    const nest = button.getBoundingClientRect();
    arena = {
      mid: strip.left + strip.width / 2,
      floor: nest.top - strip.top + 16,
      span: Math.max(24, (strip.width - RALLY.ball * 2 - 16) / 2)
    };
  };

  const rally = mountRally(host, {
    document: doc,
    still,
    colour: () => BASE[spec.colour] || BASE.blue,
    floorAt: () => arena.floor,
    spanAt: () => arena.span,
    petAt: () => spot,
    aimAt: () => (pointer ? Math.max(-arena.span, Math.min(arena.span, pointer.x - arena.mid)) : 0),
    movePet: (x) => {
      spot = x;
      place();
    },
    onHit: (kind) => {
      if (kind === "hit-pet") squish();
    },
    onPoint: (who) => {
      if (who === "you") sparkle(1);
    },
    onEnd: ({ winner, score }) => {
      care = careAfter(care, "rally");
      save();
      sparkle(winner === "you" ? 5 : 2);
      play(winner === "you" ? "burst" : "strut");
      say(winner === "you" ? SAY_LINES.youWin : SAY_LINES.iWin, { force: true, slots: { score } });
      tell();
    },
    onOver: () => {
      lastGame = nowMs();
      goal = null;
      settleUntil = clock * 1000 + SETTLE_MS;
    }
  });

  const dropAsk = () => {
    asking = false;
    if (askHold) win.clearTimeout(askHold);
    askHold = null;
  };

  const showtime = () => {
    play("sing");
    say(SAY_LINES.toast, { force: true });
  };

  const attend = () => {
    if (!hatched) return crack();
    cross = false;
    glee = false;
    const now = nowMs();
    streak = now - lastClick < STREAK_MS ? streak + 1 : 1;
    lastClick = now;
    const r = reactionTo(care, streak, Math.random());
    care = careAfter(care, r.act === "feed" ? "feed" : "pet");
    save();
    pulse();
    squish();
    if (r.act === "feed") feed();
    else if (r.act === "sing") {
      sparkle(5);
      showtime();
    } else {
      sparkle(r.act === "party" ? 5 : 2);
      play(r.play);
    }
    tell();
  };

  const takeUp = () => {
    dropAsk();
    cross = false;
    glee = false;
    measureCourt();
    if (!rally.start()) return attend();
    gameFrom = nowMs();
    clearHold();
    pulse();
    play("wide");
    tell();
  };

  const askAround = () => {
    askTimer = win.setTimeout(askAround, ASK.every + Math.random() * ASK.spread);
    const seen = {
      playing: rally.playing(),
      asking,
      still: still(),
      night,
      hatched,
      hungry: isHungry(care),
      mood,
      quietSince,
      lastGame
    };
    if (!askDue(nowMs(), seen) || !say(SAY_LINES.pong)) return;
    asking = true;
    play("wave");
    askHold = win.setTimeout(dropAsk, ASK.hold);
  };

  const crack = () => {
    if (hatched) return;
    if (seqTimer) win.clearTimeout(seqTimer);
    hatched = true;
    pulse();
    squish();
    play("burst");
    sparkle(3);
    tell();
  };

  const hatch = () => {
    play("egg", { hold: false });
    seqTimer = win.setTimeout(crack, still() ? 0 : HATCH_MS);
  };

  const nag = () => {
    nagTimer = win.setTimeout(nag, NAG_MS);
    if (mood === "needs") play("siren");
  };

  const toastDayRead = () => {
    try { return (store && store.getItem(TOAST_KEY)) || ""; } catch { return ""; }
  };

  const toastDayWrite = (day) => {
    try { store && store.setItem(TOAST_KEY, day); } catch {}
  };

  const setMood = (next) => {
    if (next === mood) return;
    const was = ASK.free.includes(mood);
    mood = next;
    const free = ASK.free.includes(mood);
    if (!free) {
      quietSince = 0;
      dropAsk();
      rally.stop();
    } else if (!was) quietSince = nowMs();
    if (nagTimer) win.clearTimeout(nagTimer);
    nagTimer = null;
    if (!hatched) return;
    if (!rally.playing()) {
      const override = overrideOf();
      if (mood === "needs") { play("siren"); nagTimer = win.setTimeout(nag, NAG_MS); }
      else if (mood === "answered" || mood === "done") play(override);
      else if (override) play(override, { hold: false });
      else rest();
    }
    if (BUSY_MOODS.includes(mood)) busyDay = dayStamp(new Date(nowMs()));
    if (mood === "done") say(SAY_LINES.turn);
    else if (mood === "stalled") say(SAY_LINES.stalled);
    else if (mood === "idle") {
      const date = new Date(nowMs());
      if (vidaMansaDue(date, busyDay === dayStamp(date), true, toastDayRead())) {
        toastDayWrite(dayStamp(date));
        showtime();
      }
    }
    tell();
  };

  const wake = () => {
    if (frameTimer || still()) return;
    frameTimer = win.setInterval(step, TICK_MS);
  };

  const refreshMotion = () => {
    if (doc.hidden || still()) return sleep();
    wake();
  };

  const sleep = () => {
    if (frameTimer) win.clearInterval(frameTimer);
    frameTimer = null;
  };

  const onVisibility = () => {
    if (doc.hidden) {
      dropAsk();
      rally.stop();
      sleep();
      return;
    }
    wake();
  };

  /* the pat used to land on the way down. now it waits for the release to say what the gesture
     was: a throw that also pets would settle the sulk it just caused, and the pat is what ends
     it. the capture below is what makes waiting safe. */
  const press = (e) => {
    if (e.button !== 0 || rally.playing()) return;
    if (tickleTimer) win.clearTimeout(tickleTimer);
    tickleTimer = win.setTimeout(() => play("giggle"), TICKLE_HOLD_MS);
    grab = { x0: e.clientX, y0: e.clientY, spot0: spot, from0: fly ? fly.y : 0, moved: false, asked: e.altKey };
    grounded();
    findNest();
    swings = [{ t: nowMs(), x: e.clientX, y: e.clientY }];
    /* the capture keeps move and up coming to the strip however far the hand strays — without
       it the strip's own pointerleave would end every throw an inch after it began */
    try { host.setPointerCapture(e.pointerId); } catch {}
  };
  const release = () => {
    if (tickleTimer) win.clearTimeout(tickleTimer);
    tickleTimer = null;
    /* a release that never had a press of ours is not a gesture at all: pointerup arrives here for
       anything that finishes over the strip, and treating that as a pat handed the creature free
       affection — including mid-throw, which settled the very sulk the throw had just caused. */
    const had = !!grab;
    const thrown = had && grab.moved && held;
    const asked = had && grab.asked && hatched;
    if (thrown) {
      const v = launchFrom(swings, nowMs());
      spot = held.x;
      /* a hand on it always wins, and it can arrive at any point of the round trip: mid-air, or
         on the walk back. calling off the walk home first is what lets it be thrown again before
         it has finished sulking. */
      homing = false;
      fly = { x: held.x, y: held.y, vx: v ? v.vx : 0, vy: v ? v.vy : 0 };
      tell();
    }
    grab = null;
    held = null;
    swings = [];
    if (had && !thrown) (asking || asked ? takeUp : attend)();
    /* the press stopped the frame loop so the hand could hold it still, and every way out of the
       press has to start it again — a pat taken mid-sulk left the creature hanging wherever it
       was, forever, because nothing was stepping it any more. */
    if (fly) soar();
  };
  const court = () => {
    courting = true;
    goal = null;
  };
  const uncourt = () => {
    courting = false;
    settleUntil = clock * 1000 + SETTLE_MS;
  };
  const follow = (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    if (!grab) return;
    swings.push({ t: nowMs(), x: e.clientX, y: e.clientY });
    if (swings.length > 8) swings.shift();
    if (!grab.moved && Math.hypot(e.clientX - grab.x0, e.clientY - grab.y0) < FLING.start) return;
    if (still()) return;
    if (!grab.moved) {
      grab.moved = true;
      if (tickleTimer) win.clearTimeout(tickleTimer);
      tickleTimer = null;
      clearHold();
      host.classList.add("tama-aloft");
      play("soar", { hold: false });
    }
    /* held, it follows the hand rather than the physics, but it still may not leave the window:
       pointer capture keeps delivering coordinates once the drag passes the edge, and following
       those put the creature off screen for as long as the button was down. */
    const box = walls();
    const stay = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    held = {
      x: stay(grab.spot0 + (e.clientX - grab.x0), box.left, box.right),
      y: stay(grab.from0 + (e.clientY - grab.y0), box.top, box.floor)
    };
    fly = null;
    place();
  };
  const lose = (e) => {
    if (!e.relatedTarget) pointer = null;
  };
  host.addEventListener("pointerdown", press);
  host.addEventListener("pointerup", release);
  host.addEventListener("pointerenter", court);
  host.addEventListener("pointerleave", uncourt);
  host.addEventListener("pointerleave", release);
  doc.addEventListener("pointermove", follow);
  doc.addEventListener("pointerout", lose);
  button.addEventListener("click", (e) => { if (e.detail === 0) (asking || (e.altKey && hatched) ? takeUp : attend)(); });
  doc.addEventListener("visibilitychange", onVisibility);

  if (night) rest();
  draw();
  place();
  tell();
  wake();
  faceTimer = win.setInterval(faceTick, FACE_EVERY_TICKS * TICK_MS);
  careTimer = win.setInterval(careTick, CARE_TICK_MS);
  whineTimer = win.setTimeout(whine, WHINE_MS + Math.random() * WHINE_SPREAD_MS);
  askTimer = win.setTimeout(askAround, ASK.every + Math.random() * ASK.spread);
  if (hatching) hatch();
  else if (!night) greetMorning();

  return {
    setMood,
    toast: showtime,
    wave: () => play("wave"),
    careNow: () => care,
    stageNow: stage,
    playNow: () => state,
    sayNow: () => (bubble.classList.contains("on") ? bubble.textContent : ""),
    scoreNow: () => (rally.playing() ? rally.scoreNow() : ""),
    refreshMotion,
    destroy() {
      sleep();
      grounded();
      clearHold();
      if (careTimer) win.clearInterval(careTimer);
      if (faceTimer) win.clearInterval(faceTimer);
      for (const t of [whineTimer, nagTimer, seqTimer, sayTimer, tickleTimer, askTimer, askHold]) if (t) win.clearTimeout(t);
      rally.destroy();
      host.removeEventListener("pointerdown", press);
      host.removeEventListener("pointerup", release);
      host.removeEventListener("pointerenter", court);
      host.removeEventListener("pointerleave", uncourt);
      host.removeEventListener("pointerleave", release);
      doc.removeEventListener("pointermove", follow);
      doc.removeEventListener("pointerout", lose);
      host.classList.remove("tama-aloft");
      host.classList.remove("tama-home");
      doc.removeEventListener("visibilitychange", onVisibility);
      save();
      button.remove();
      style.remove();
    }
  };
}
