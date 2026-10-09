import { followPointer, follower, wPaint } from "./avatars.js";
import { $, BLOB_FACE, COLOURS, FACES, SHAPES, WEAR, WEAR_SLOTS, avatarFor, avatarKey, avatarSvg, esc, faceSlot, fitsBody, phrase, solidMounts, st, wearKey } from "./core.js";
import { faceSheetOpen, paintFaceSheet, toggleFaceSheet } from "./face-door.js";
import { personFace } from "./person-face.js";
import { brandWanted } from "./preferences.js";
import { devFace, reDeal, wroteFace } from "./team.js";

const W_STEPS = [
  { id: "hello", label: "hello", short: "hello" },
  { id: "machine", label: "your machine", short: "machine" },
  { id: "setup", label: "your key", short: "key" },
  { id: "server", label: "your server", short: "server" },
  { id: "authorize", label: "key on it", short: "trust" },
  { id: "login", label: "an agent on it", short: "agent" },
  { id: "flight", label: "first flight", short: "flight" }
];

const W_SERVER_STEPS = ["server", "authorize", "login"];

const W_ESSENTIAL = ["machine", "setup", "server", "authorize", "login"];

const wSkipped = (id, s = wb.s) => W_SERVER_STEPS.includes(id) && s?.wantsServer === false;

let wb = { step: "hello", dev: "", hub: "", nameWrong: false, s: null, busy: "", login: null, model: "", seenOk: {}, ready: false, facePicker: false };

const welcomeOn = () => !$("welcome").hidden;

function wDone(id, s = wb.s) {
  if (!s) return false;
  if (wSkipped(id, s)) return true;
  switch (id) {
    case "hello": return !!wb.ready;
    case "machine": return !!s.machine?.ok;
    case "setup": return !!s.setup?.ok;
    case "server": return !!s.server?.answers;
    case "authorize": return !!s.signature?.ok;
    case "login": return !!s.claudeOnServer?.loggedIn;
    case "flight": return !!s.firstFlight || !!wb.flightSeen;
  }
  return false;
}

const wReachable = (id) => !wSkipped(id) && !wLocked(id);

function wLocked(id) {
  const i = W_STEPS.findIndex((x) => x.id === id);
  if (i <= 0) return false;
  if (W_SERVER_STEPS.includes(id) && !wDone("setup")) return true;
  if (id === "authorize" && !wDone("server")) return true;
  if (id === "login" && !wDone("server")) return true;
  return false;
}

function wFirstOpen() {
  return W_STEPS.find((x) => !wDone(x.id) && wReachable(x.id))?.id || "flight";
}

function wAllEssential(s) {
  return W_ESSENTIAL.every((id) => wDone(id, s));
}

async function wFetch(force) {
  const q = new URLSearchParams();
  if (wb.dev) q.set("dev", wb.dev);
  if (wb.hub) q.set("hub", wb.hub);
  if (force) q.set("force", "1");
  const r = await fetch(`/api/onboarding?${q}`);
  return r.json();
}

async function wAct(action, extra) {
  wb.busy = action;
  wPaint();
  let d = null;
  try {
    const r = await fetch("/api/onboarding/action", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...(extra || {}) })
    });
    d = await r.json();
  } catch {}
  wb.busy = "";
  if (d?.ok) {
    await wPull(true);
    return d;
  }
  wPaint();
  wPull(true);
  return d;
}

async function wPull(force) {
  if (!welcomeOn()) return;
  try {
    const before = wb.s;
    wb.s = await wFetch(force);
    if (!wb.dev) wb.dev = wb.s.dev || "";
    if (!wb.hub) wb.hub = wb.s.hub || "";
    wAutoAdvance(before);
    wPaint();
  } catch {}
}

function wAutoAdvance(before) {
  const waiting = ["machine", phrase("cocoon"), "authorize", "login"];
  const here = wb.step;
  if (!waiting.includes(here) || !wDone(here)) return;
  if (before && wDone(here, before)) return;
  setTimeout(() => { if (welcomeOn() && wb.step === here) wGo(wNext()); }, 900);
}

function wNext() {
  const i = W_STEPS.findIndex((x) => x.id === wb.step);
  for (let j = i + 1; j < W_STEPS.length; j++) if (wReachable(W_STEPS[j].id)) return W_STEPS[j].id;
  return "flight";
}

function wPrev() {
  const i = W_STEPS.findIndex((x) => x.id === wb.step);
  for (let j = i - 1; j >= 0; j--) if (wReachable(W_STEPS[j].id)) return W_STEPS[j].id;
  return null;
}

function wGo(id) {
  if (!wReachable(id)) return;
  if (id !== "hello") wb.ready = true;
  wb.step = id;
  wb.login = null;
  wb.setupError = "";
  wPaint();
  $("w-stage").scrollTop = 0;
}

function copyBox(text, label) {
  return `<div class="w-code"><button class="copy" data-copy="${esc(text)}">${phrase(label || "copy")}</button>${esc(text)}</div>`;
}

function check(ok, name, why, right) {
  const state = ok === "wait" ? "wait" : ok ? "true" : "false";
  return `<div class="w-check" data-ok="${state}"><span class="dot"></span><span class="name">${esc(phrase(name))}</span><span class="why">${why}</span>${right || ""}</div>`;
}

const HEX = `<svg viewBox="0 0 96 96" aria-hidden="true"><defs><linearGradient id="w-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E88A6A"/><stop offset="1" stop-color="#9E4A30"/></linearGradient></defs><path d="M48 6 84.4 27v42L48 90 11.6 69V27Z" fill="none" stroke="url(#w-g)" stroke-width="3" stroke-linejoin="round"/><path d="M48 26 65.3 36v20L48 66 30.7 56V36Z" fill="url(#w-g)"/><circle cx="48" cy="46" r="4" fill="#0C0C0C"/></svg>`;

const ICON = {
  machine: `<svg viewBox="0 0 96 96" aria-hidden="true"><rect x="14" y="22" width="68" height="44" rx="6" fill="none" stroke="var(--txt-2)" stroke-width="3"/><path d="M8 74h80" stroke="var(--txt-2)" stroke-width="3" stroke-linecap="round"/><path d="M30 44l8 8-8 8M44 60h16" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  setup: `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="38" cy="40" r="16" fill="none" stroke="var(--txt-2)" stroke-width="3"/><circle cx="38" cy="40" r="5" fill="var(--accent)"/><path d="M50 51l30 30M72 73l6-6M64 65l6-6" stroke="var(--txt-2)" stroke-width="3" stroke-linecap="round"/></svg>`,
  pod: `<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M30 66h38a15 15 0 0 0 1.5-29.9A21 21 0 0 0 29.5 40 13 13 0 0 0 30 66Z" fill="none" stroke="var(--txt-2)" stroke-width="3" stroke-linejoin="round"/><circle cx="48" cy="52" r="4" fill="var(--accent)"/></svg>`,
  authorize: `<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M48 10 78 22v22c0 18-13 32-30 40C31 76 18 62 18 44V22Z" fill="none" stroke="var(--txt-2)" stroke-width="3" stroke-linejoin="round"/><path d="M36 48l9 9 16-18" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  login: `<svg viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="36" r="14" fill="none" stroke="var(--txt-2)" stroke-width="3"/><path d="M22 80c4-14 14-22 26-22s22 8 26 22" fill="none" stroke="var(--txt-2)" stroke-width="3" stroke-linecap="round"/><circle cx="70" cy="30" r="9" fill="var(--accent)"/><path d="M66 30l3 3 5-6" fill="none" stroke="#0C0C0C" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  flight: `<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M14 54 82 24 60 82 48 58Z" fill="none" stroke="var(--txt-2)" stroke-width="3" stroke-linejoin="round"/><path d="M48 58 82 24" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/></svg>`
};

const icon = (id) => `<div class="w-icon small">${ICON[id] || HEX}</div>`;

function wAvatar() {
  return st.myFace || avatarFor(wb.dev || st.team.me || "");
}

function rollAvatar() {
  const any = (list) => list[Math.floor(Math.random() * list.length)];
  return { shape: any(SHAPES), face: any(FACES), colour: any(COLOURS) };
}

/* who you are and what you wear travel together on screen, apart in the config, and only the
   first one enters the deal: a shape and colour are one each, a hat is anybody's. */
const wWear = () => st.myWear || {};

const wDressed = () => ({ ...wAvatar(), wear: wWear() });

const dressedKey = (spec) => `${avatarKey(spec)} ${wearKey(spec?.wear)}`.trim();

const myName = () => wb.dev || st.team.me || "";

const faceChoiceKey = () => (st.myBlob ? BLOB_FACE : avatarKey(wAvatar()));

const myFaceSvg = (salt) => (st.myBlob ? personFace(myName()) : avatarSvg(wDressed(), { salt }));

const brandKey = () => (st.myBlob ? `${BLOB_FACE} ${st.team.me}` : dressedKey(devFace(st.team.me)));

const WEAR_SLOT_WORD = { glasses: "glasses", hat: "hat", extra: "extra bits" };

const WEAR_WORD = {
  none: "none", round: "round", square: "square",
  cap: "cap", beanie: "beanie", bucket: "bucket hat", headband: "headband", tophat: "top hat", crown: "crown", party: "party hat", wizard: "wizard hat", fedora: "fedora hat", cowboy: "cowboy hat",
  bowtie: "bow tie", bow: "bow", scarf: "scarf", tie: "tie", moustache: "moustache"
};


function ownerOfSlot(spec) {
  reDeal();
  for (const [dev, other] of st.dealt) if (dev !== st.team.me && wroteFace(dev) && faceSlot(other) === faceSlot(spec)) return dev;
  return "";
}

function facePicker() {
  return facePickerViewModel().map((row) => `<div><p class="cap">${esc(phrase(row.cap))}</p><div class="opts">${row.opts.map((opt) =>
    `<button type="button" class="opt${opt.taken ? " taken" : ""}" data-w="face-set" data-part="${row.part}" data-value="${opt.value}" title="${esc(opt.title)}" aria-pressed="${opt.worn}"${opt.taken ? ' aria-disabled="true"' : ""}>${opt.svg}</button>`).join("")}</div></div>`).join("");
}

/* the face first — shape, expression, colour, a shape and colour somebody else wears greyed
   out — and the wardrobe under it, one row per slot with "none" first. every option is drawn on
   your own face over what you already wear, so the combination is seen before it is clicked.
   nothing in the wardrobe is ever taken: clothes are not part of the deal. */
function facePickerViewModel() {
  const me = wAvatar();
  const worn = wWear();
  const style = {
    key: "style", cap: phrase("style"), part: "style",
    opts: [
      { key: "robot", value: "robot", taken: false, worn: !st.myBlob, title: phrase("robot"), svg: avatarSvg(wDressed(), { salt: "style-robot" }) },
      { key: BLOB_FACE, value: BLOB_FACE, taken: false, worn: !!st.myBlob, title: BLOB_FACE, svg: personFace(myName()) }
    ]
  };
  if (st.myBlob) return [style];
  const face = (cap, part, list) => ({
    key: part, cap, part,
    opts: list.map((value) => {
      const spec = { ...me, [part]: value, wear: worn };
      const owner = part === "face" ? "" : ownerOfSlot(spec);
      return {
        key: value, value, taken: !!owner, worn: me[part] === value,
        title: owner ? `${value} — ${owner} already wears it` : value,
        svg: avatarSvg(spec, { salt: `${part}-${value}` })
      };
    })
  });
  const wardrobe = (slot) => ({
    key: slot, cap: phrase(WEAR_SLOT_WORD[slot]), part: slot,
    opts: ["none", ...WEAR[slot].filter((value) => fitsBody(me.shape, slot, value))].map((value) => ({
      key: value, value, taken: false, worn: (worn[slot] || "none") === value,
      title: phrase(WEAR_WORD[value]),
      svg: avatarSvg({ ...me, wear: { ...worn, [slot]: value === "none" ? undefined : value } }, { salt: `${slot}-${value}` })
    }))
  });
  return [style, face("body", "shape", SHAPES), face("screen", "face", FACES), face("colour", "colour", COLOURS), ...WEAR_SLOTS.map(wardrobe)].filter((row) => row.opts.length > 1);
}

function paintAvatar() {
  const mug = $("w-mug");
  if (mug) {
    mug.innerHTML = myFaceSvg("hello");
    mug.setAttribute("aria-expanded", wb.facePicker ? "true" : "false");
  }
  const picker = $("w-picker");
  if (picker) {
    picker.classList.toggle("on", !!wb.facePicker);
    picker.innerHTML = wb.facePicker ? facePicker() : "";
  }
  paintBrandAvatar();
  paintFaceSheet();
  paintSettingsFace();
}

st.cfgFaceOpen = false;

function paintSettingsFace() {
  const said = settingsFaceViewModel();
  const mug = $("cfg-mug");
  if (mug) mug.innerHTML = said.mug;
  const way = $("cfg-open");
  if (way) {
    way.textContent = said.way;
    way.setAttribute("aria-expanded", said.open ? "true" : "false");
  }
  const box = $("cfg-pick");
  if (box) box.hidden = !said.open;
  cfgFaceSolid.show({ rows: said.rows });
}

let cfgFaceSolid = null;

function settingsFaceViewModel() {
  return {
    mug: myFaceSvg("cfg"),
    way: phrase(st.cfgFaceOpen ? "done" : "change"),
    open: st.cfgFaceOpen,
    rows: st.cfgFaceOpen ? facePickerViewModel() : []
  };
}

solidMounts.push((hive) => {
  const pick = $("cfg-face");
  if (pick) cfgFaceSolid = hive.mountFacePicker(pick);
});

function toggleSettingsFace(on) {
  st.cfgFaceOpen = on === undefined ? !st.cfgFaceOpen : !!on;
  paintSettingsFace();
  if (st.cfgFaceOpen) $("cfg-pick")?.scrollIntoView({ block: "nearest" });
}

function paintBrandAvatar() {
  const slot = $("brand-mug");
  if (!slot) return;
  /* the setting decides whether there is a face here at all. hiding it also closes the sheet it
     opens: the picker lives in the settings too, so nothing is trapped behind a button that left. */
  slot.hidden = !brandWanted();
  if (slot.hidden) {
    st.mugPlayer?.stop();
    st.mugPlayer = null;
    if (faceSheetOpen()) toggleFaceSheet(false);
    if (follower.slot === slot) follower.slot = null;
    slot.innerHTML = "";
    return;
  }
  /* whoever was playing here is done: its loop runs until the pose is idle, and it would keep
     drawing over this face sixty times a second. */
  st.mugPlayer?.stop();
  st.mugPlayer = null;
  /* the same face the rest of the hive draws for you. the deal is what settles a clash, and it
     can move you: reading myFace here would show you a face nobody else sees. */
  if (st.myBlob) {
    st.brandDrawn = st.team.me ? brandKey() : "";
    slot.innerHTML = personFace(myName(), st.mugLook);
    slot.classList.add("av-alive");
    if (follower.slot === slot) follower.slot = null;
    return;
  }
  const me = (st.team.me && devFace(st.team.me)) || st.myFace || (wb.dev ? avatarFor(wb.dev) : null) || avatarFor(st.team?.me || "");
  st.brandDrawn = st.team.me ? dressedKey(me) : "";
  slot.innerHTML = avatarSvg(me, { salt: "brand", title: wb.dev ? `${wb.dev} — your face in the hive` : "your face in the hive" });
  /* mounting a mood took the breath, the sway and the blink away, because the engine was drawing
     every frame itself and the two would have fought. handing the face back has to hand those
     back with it — without this the first mood of the session is the last time the face moves. */
  slot.classList.add("av-alive");
  followPointer(slot, me);
}

export { HEX, ICON, W_ESSENTIAL, W_SERVER_STEPS, W_STEPS, WEAR_SLOT_WORD, WEAR_WORD, brandKey, cfgFaceSolid, check, copyBox, dressedKey, faceChoiceKey, facePicker, facePickerViewModel, icon, myFaceSvg, ownerOfSlot, paintAvatar, paintBrandAvatar, paintSettingsFace, rollAvatar, settingsFaceViewModel, toggleSettingsFace, wAct, wAllEssential, wAutoAdvance, wAvatar, wDone, wDressed, wFetch, wFirstOpen, wGo, wLocked, wNext, wPrev, wPull, wReachable, wSkipped, wWear, wb, welcomeOn };
