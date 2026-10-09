import { render } from "./arrange.js";
import { blockWithRoom, openBlock, saveBlockAt, saveBlocks } from "./blocks.js";
import { offerFace, pickFace, stripWear } from "./brand-face.js";
import { $, BLOB_FACE, GLYPH, LABEL, MOOD_BREATH, STAYS, avatarFor, avatarKey, avatarSvg, esc, every, fleetMood, holdOf, lookDeltas, mountPlayer, nearestFree, phrase, playOfMood, st, stopBeat, wearKey, stateColor } from "./core.js";
import { pull, releaseKeyboard } from "./focus-navigation.js";
import { justCreated, keyHint } from "./leader-key.js";
import { paintRail } from "./mirror.js";
import { personFace } from "./person-face.js";
import { calmly, nameSlug } from "./pure-helpers.js";
import { devFace, faceSvg, holdingKeyboard, takenSlots, wearsBlob } from "./team.js";
import { toClipboard } from "./terminal-history.js";
import { closePrs, exitReview, prsOnScreen } from "./thread.js";
import { startTour } from "./tour.js";
import { closeUsage, usageOnScreen } from "./usage.js";
import { HEX, W_STEPS, brandKey, check, copyBox, facePicker, icon, myFaceSvg, ownerOfSlot, paintAvatar, paintBrandAvatar, rollAvatar, wAct, wAllEssential, wAvatar, wDone, wFirstOpen, wGo, wLocked, wNext, wPrev, wPull, wSkipped, wb, welcomeOn } from "./welcome.js";
import { closeWorktrees, worktreesOnScreen } from "./worktrees.js";

st.mugPlayer = null;

/* a blobatar has no robot plays: a play is an event that flashes an expression for its hold, and
   a feeling in STAYS is a state whose expression stays until the fleet changes */
const PLAY_LOOK = {
  sleep: "sleepy", wide: "surprised", alert: "scared", exclaim: "surprised", notify: "surprised",
  burst: "happy", egg: "sleepy", wink: "wink", orbit: "thinking", play: "happy", comet: "happy", swirl: "happy"
};

/* a focused fleet is most of the day, and a face surprised all day says nothing */
const HELD_LOOK = { wide: "thinking" };

const guideLink = () => (wb.s?.serverGuide
  ? `<a href="${esc(wb.s.serverGuide)}" target="_blank" rel="noreferrer">${phrase("the server guide ↗")}</a>`
  : `${phrase("the server guide")} (<code>docs/run-your-own.md</code>)`);

const serverIsOptional = () => (wb.s?.wantsServer === false
  ? `<p class="sub">${phrase("Everything runs on this machine. A server of your own is optional: it keeps chats going with the computer closed, and brings in the team and the phone. It runs in Docker, and {guide} sets it up step by step.", { guide: guideLink() })}</p>`
  : "");

st.mugLook = "";

st.mugHeld = "";

const mugFace = () => ({ ...(st.myFace || (wb.dev ? avatarFor(wb.dev) : null) || avatarFor(st.team?.me || "")), wear: st.myWear || {} });

function fleetFeeling() {
  const mine = st.data.sessions || [];
  if (!mine.length) return "sleepy";
  return fleetMood(mine.map((s) => s.mood));
}

function mugMood() {
  const feeling = fleetFeeling();
  if (feeling !== "sleepy") return playOfMood(feeling);
  return (st.data.sessions || []).length ? "idle" : "sleep";
}

function mugBreath(feeling) {
  const slot = $("brand-mug");
  if (slot) slot.style.setProperty("--av-breath", MOOD_BREATH[feeling] || "4s");
}

let restTimer = 0;

const REST_WALK = 0.9;

function mugRest() {
  window.clearTimeout(restTimer);
  st.mugLook = st.mugHeld;
  if (st.mugPlayer) {
    st.mugPlayer.play("idle", { hold: false });
    restTimer = window.setTimeout(paintBrandAvatar, 1000 * REST_WALK);
    return;
  }
  paintBrandAvatar();
}

function mugPlay(state, { hold = true } = {}) {
  const slot = $("brand-mug");
  if (!slot || !slot.isConnected || slot.hidden || calmly()) return;
  /* a mood arriving during the walk back cancels it, or the face would snap to still mid-pose */
  window.clearTimeout(restTimer);
  if (state === "idle") { mugRest(); return; }
  if (st.myBlob) {
    const look = (!hold && HELD_LOOK[state]) || PLAY_LOOK[state] || "";
    if (!hold) st.mugHeld = look;
    st.mugLook = look;
    paintBrandAvatar();
    if (hold) restTimer = window.setTimeout(mugRest, 1000 * holdOf(state));
    return;
  }
  if (!st.mugPlayer) {
    st.mugPlayer = mountPlayer(slot, mugFace(), { salt: "brand", onRest: () => mugRest() });
    slot.classList.remove("av-alive", "av-follow");
  }
  st.mugPlayer.play(state, { hold });
}

st.lastMood = "";

st.lastKnockCount = 0;

let hadKeyboard = false;

const seenDevs = new Set();

st.wasFailing = null;

st.wasBehind = null;

st.brandDrawn = "";

function avatarPulse() {
  /* the config is read before the team is, so the name we belong to may not be known yet:
     the ask waits here until it is, and then only happens once. */
  offerFace();
  if (st.team.me && !st.mugPlayer) {
    const now = brandKey();
    if (now !== st.brandDrawn) { st.brandDrawn = now; paintBrandAvatar(); }
  }
  /* `hold` in the player means "hand the face back after a couple of seconds", so a mood that
     STAYS is the one that asks for hold:false. reading it the other way round is the easy
     mistake here, and it is the difference between a face that says something and one that does
     not. a fleet holds one mood for minutes: flashed, it is two seconds of movement an hour. */
  const feeling = fleetFeeling();
  const mood = mugMood();
  const stays = STAYS.has(feeling);
  /* the second condition is the one this cost an evening: `first` used to swallow the mood the
     fleet was already in when you launched, because a flash at startup is a moment nobody is
     looking at. that is true of a moment and false of a state — and a fleet that is working when
     you open the window and goes on working never changes mood, so the pose never went on at all.
     a state is also re-armed if anything took the player away from us since the last poll. */
  if (mood !== st.lastMood || (stays && !st.mugPlayer && !st.myBlob)) {
    const first = st.lastMood === "";
    st.lastMood = mood;
    if (!stays) st.mugHeld = "";
    if (mood === "idle") mugRest();
    else if (first && !stays) mugRest();
    else mugPlay(mood, { hold: !stays });
  }
  mugBreath(feeling);

  const failing = st.alerts.state === "fail";
  if (st.wasFailing === false && failing) mugPlay("alert");
  st.wasFailing = failing;

  const behind = st.updateState.behind > 0;
  if (st.wasBehind === false && behind) mugPlay("wide");
  st.wasBehind = behind;

  const knocks = (st.knocksOpen || []).length;
  if (knocks > st.lastKnockCount) mugPlay("exclaim");
  st.lastKnockCount = knocks;

  const lent = holdingKeyboard();
  if (lent && !hadKeyboard) mugPlay("wink");
  hadKeyboard = lent;

  for (const d of st.team.devs || []) {
    if (seenDevs.has(d.dev)) continue;
    seenDevs.add(d.dev);
    if (seenDevs.size > st.team.devs.length) teamFlash(d.dev, "comet");
  }
  if (st.team.sharing && !(st.team.devs || []).length) teamWaiting();

  if (!st.hatched && flightAlive()) {
    st.hatched = true;
    mugPlay("egg");
    window.setTimeout(() => mugPlay("burst"), 1000 * holdOf("egg"));
  }
}

st.hatched = false;

function lentFace(dev) {
  return `<span class="team-av face av-alive">${faceSvg(dev, `lent-${dev}`)}</span>`;
}

function flashBlob(host, dev, state) {
  host.innerHTML = personFace(dev, PLAY_LOOK[state]);
  window.setTimeout(() => { if (host.isConnected) host.innerHTML = personFace(dev); }, 1000 * holdOf(state));
}

const lentPlayers = new Map();

function lentFlash(seat, dev) {
  if (calmly()) return;
  const host = document.querySelector(`[data-take="${CSS.escape(seat)}"] .team-av`);
  if (!host || !dev) return;
  if (wearsBlob(dev)) return flashBlob(host, dev, "notify");
  let player = lentPlayers.get(seat);
  if (!player) {
    player = mountPlayer(host, devFace(dev), {
      salt: `lent-${dev}`,
      onRest: () => {
        player.stop();
        lentPlayers.delete(seat);
        if (!host.isConnected) return;
        host.classList.add("av-alive");
        host.innerHTML = avatarSvg(devFace(dev), { salt: `lent-${dev}`, title: dev });
      }
    });
    lentPlayers.set(seat, player);
    host.classList.remove("av-alive");
  }
  player.play("notify");
}

const teamPlayers = new Map();

function teamFlash(dev, state) {
  if (calmly()) return;
  const row = $("rail-team")?.querySelector(`.item.team[data-dev="${CSS.escape(dev)}"] .team-av`);
  if (!row) return;
  if (wearsBlob(dev)) return flashBlob(row, dev, state);
  let player = teamPlayers.get(dev);
  if (!player) {
    player = mountPlayer(row, devFace(dev), {
      salt: `team-${dev}`,
      onRest: () => {
        player.stop();
        teamPlayers.delete(dev);
        row.classList.add("av-alive");
        row.innerHTML = avatarSvg(devFace(dev), { salt: `team-${dev}`, title: dev });
      }
    });
    teamPlayers.set(dev, player);
    row.classList.remove("av-alive");
  }
  player.play(state);
}

let waitingPlayer = null;

let orbited = false;

function teamWaiting() {
  if (orbited || !$("brand-mug")) return;
  orbited = true;
  mugPlay("orbit");
}

const followReach = () => Math.hypot(innerWidth, innerHeight);

const follower = { slot: null, spec: null, eyes: [], near: false, idle: 0 };

function followPointer(slot, spec) {
  follower.slot = slot;
  follower.spec = spec;
  follower.eyes = [...slot.querySelectorAll(".av-seat")];
  follower.near = false;
  slot.classList.remove("av-follow");
}

function aimFace(x, y) {
  const slot = follower.slot;
  if (!slot || !slot.isConnected || !follower.eyes.length) return;
  const box = slot.getBoundingClientRect();
  if (!box.width) return;
  const dx = x - (box.left + box.width / 2);
  const dy = y - (box.top + box.height / 2);
  const reach = followReach();
  const near = Math.hypot(dx, dy) < reach;
  if (near !== follower.near) {
    follower.near = near;
    slot.classList.toggle("av-follow", near);
    if (!near) for (const g of follower.eyes) g.querySelector(".av-look")?.removeAttribute("style");
  }
  if (!near) return;
  const yaw = clampAim(dx / (reach / 2)) * 15;
  const pitch = -clampAim(dy / (reach / 2)) * 11;
  const deltas = lookDeltas(follower.spec, yaw, pitch);
  for (const g of follower.eyes) {
    const d = deltas[Number(g.dataset.eye)] || { dx: 0, dy: 0 };
    const look = g.querySelector(".av-look");
    if (look) look.style.transform = `translate(${d.dx}px, ${d.dy}px)`;
  }
}

const clampAim = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);

st.aimQueued = 0;

addEventListener("pointermove", (ev) => {
  if (ev.pointerType === "touch" || st.aimQueued) return;
  st.aimQueued = requestAnimationFrame(() => { st.aimQueued = 0; aimFace(ev.clientX, ev.clientY); });
}, { passive: true });

document.addEventListener("pointerleave", () => aimFace(-9999, -9999));

/* the one place the face and its clothes are written down — the gate, the sheet and the
   settings all come through here, so no door can change the face on screen and forget the file.
   `quiet` is for a piece of clothing: the burst is for a new face, not for every hat tried on. */
async function saveAvatar({ quiet = false } = {}) {
  /* the last gate: the picker greys the taken ones and the click refuses them, but a config
     edited by hand or two hives choosing in the same second still arrive here. */
  const wanted = wAvatar();
  const owner = ownerOfSlot(wanted);
  st.myFace = owner ? nearestFree(wanted, takenSlots()) : wanted;
  if (!quiet) mugPlay("burst");
  const key = st.myBlob ? BLOB_FACE : avatarKey(st.myFace);
  const worn = wearKey(st.myWear);
  /* the server answers a write with the config it read back, so the face being in there is the
     one proof the write landed. an unrelated complaint about some other key is not our failure,
     which is why this looks for our own keys and not for `error`. */
  let written = false;
  try {
    const r = await (await fetch("/api/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ config: { avatar: key, wear: worn } }) })).json();
    written = r?.config?.avatar === key && wearKey(r?.config?.wear) === worn;
  } catch {}
  paintRail();
  return written;
}

function nameNote(s) {
  const echo = `<span id="w-dev-echo">${esc(wb.dev || phrase("name"))}</span>`;
  if (s?.machine?.wantsCluster) return `${phrase("Becomes")} <code>ws-${echo}</code> ${phrase("on the cluster and the branch prefix of everything you open.")}`;
  return `${phrase("Becomes the prefix of every branch you open:")} <code>${echo}/-/…</code>.`;
}

function hubNote(s) {
  const look = s.hubLooks || {};
  if (!look.ok) return esc(look.why || "");
  if (s.wantsServer && s.machine?.wantsCluster) return look.env ? phrase("found it, with a .env") : phrase("found it — no .env yet, the server will need one");
  return look.instructions ? phrase("found it — chats open here and read the instructions it holds") : phrase("found it — chats open here, next to your repositories");
}

function pageHello() {
  const s = wb.s;
  return `<div class="w-page">
    <div class="w-icon">${HEX}</div>
    <h2>${phrase("Welcome to the hive.")}</h2>
    <p class="lead">${phrase("A fleet of coding agents and one screen to run them. Every chat lands here as a tile with a real terminal, next to what it says about itself — what it is doing, what is done, what it needs from you. Some run on this machine; the rest run on your own server.")}</p>
    <p class="sub">${phrase("About five minutes. It ends with your first chat running.")}</p>
    <p class="sub w-alpha">${phrase("This is an alpha: things change and break between versions, and nothing here is promised yet.")}</p>
    <div class="w-form">
      <div class="w-me">
        <div class="w-face">
          <button type="button" class="mug av-alive" id="w-mug" data-w="face-open" title="${phrase("your face in the hive — click to change")}" aria-expanded="${wb.facePicker ? "true" : "false"}">${myFaceSvg("hello")}</button>
          <button type="button" class="again" data-w="face-roll">${phrase("another")}</button>
          <button type="button" class="again" data-w="face-strip">${phrase("take it all off")}</button>
        </div>
        <div class="w-fields">
          <div><label for="w-dev">${phrase("your name in the hive")}</label><input id="w-dev" value="${esc(wb.dev)}" spellcheck="false" autocomplete="off" placeholder="${phrase("short, lowercase")}" /><p class="note${wb.nameWrong ? " bad" : ""}" id="w-dev-note">${wb.nameWrong ? phrase("the name needs 2 to 30 characters: lowercase letters, digits and hyphens") : `${nameNote(s)} ${phrase("The face is yours too — click it to change; the team sees it next to your name.")}`}</p></div>
          <div><label for="w-hub">${phrase("where your workspace lives on this machine")}</label><input id="w-hub" value="${esc(wb.hub)}" spellcheck="false" autocomplete="off" placeholder="${phrase("/Users/you/workspace")}" /><p class="note ${s?.hubLooks?.ok ? "good" : "bad"}" id="w-hub-note">${s ? hubNote(s) : phrase("checking…")}</p></div>
        </div>
        <div class="w-picker facepick${wb.facePicker ? " on" : ""}" id="w-picker">${wb.facePicker ? facePicker() : ""}</div>
      </div>
    </div>
  </div>`;
}

function pageMachine() {
  const m = wb.s?.machine;
  if (!m) return `<div class="w-page">${icon("machine")}<div class="w-kicker"><span class="live"></span> ${phrase("checking")}</div><h2>${phrase("Looking at what is installed…")}</h2></div>`;
  const MERGED = ["gh", "claude"];
  const where = (d) => `<span class="ok" title="${esc(d.path)}">${esc(d.path.replace(/^\/(?:Users|home)\/[^/]+/, "~"))}</span>`;
  const missing = (d) => [`${d.why} — <code>${esc(d.install)}</code>`, `<button class="fix" data-copy="${esc(d.install)}">${phrase("copy")}</button>`];
  const merged = (name, loggedIn, why, right) => {
    const label = name === "gh" ? "github" : name;
    const d = m.deps.find((one) => one.name === name);
    if (d && !d.ok && d.needed !== false) return check(false, label, ...missing(d));
    return check(loggedIn, label, why, loggedIn ? (d?.ok ? where(d) : "") : right);
  };
  const rows = m.deps.filter((d) => d.needed !== false && !MERGED.includes(d.name)).map((d) => d.ok
    ? check(true, d.name, d.why, where(d))
    : check(false, d.name, ...missing(d))).join("");
  const more = [
    ...(m.wantsCluster === false ? [] : [
    check(m.aws.ok, "aws profile", m.aws.ok ? `<code>${esc(m.aws.profile)}</code> ${phrase("answers as {who}", { who: esc(m.aws.detail || phrase("you")) })}` : `<code>${esc(m.aws.profile)}</code> ${phrase("does not answer: {why}. Ask whoever runs the cluster for the profile, then", { why: esc(m.aws.detail || phrase("no profile")) })} <code>aws sso login --profile ${esc(m.aws.profile)}</code>`, m.aws.ok ? "" : `<button class="fix" data-copy="aws sso login --profile ${esc(m.aws.profile)}">${phrase("copy")}</button>`),
    check(m.cluster.ok, "hosting", m.cluster.ok ? phrase("whoever hosts your server answers") : `${phrase("the host does not answer: {why}.", { why: esc(m.cluster.detail) })} <code>aws eks update-kubeconfig --name ${esc(m.cluster.name)} --profile ${esc(m.aws.profile)}</code>`, m.cluster.ok ? "" : `<button class="fix" data-copy="aws eks update-kubeconfig --name ${esc(m.cluster.name)} --profile ${esc(m.aws.profile)}">${phrase("copy")}</button>`)
    ]),
    merged("gh", m.gh.ok, m.gh.ok ? phrase("logged in as {who} — reviews and merges carry your name", { who: esc(m.gh.detail) }) : `${phrase("not logged in —")} <code>gh auth login</code>`, `<button class="fix" data-copy="gh auth login">${phrase("copy")}</button>`),
    merged("claude", m.claude.loggedIn, m.claude.loggedIn ? (m.claude.email ? phrase("logged in as {who}", { who: esc(m.claude.email) }) : phrase("logged in")) : claudeSignInSay(), claudeSignInButton())
  ].join("");
  return `<div class="w-page">
    ${icon("machine")}
    <h2>${m.ok ? phrase("This machine has everything the hive needs.") : phrase("A few things the hive needs on this machine.")}</h2>
    <p class="lead">${m.ok ? (m.wantsCluster === false ? phrase("The tools, GitHub and Claude — all answering.") : phrase("Six tools, the cluster credential, GitHub and Claude — all answering.")) : phrase("Fix what is red in a terminal; this screen notices on its own, every few seconds. Nothing here is hive-specific — it is the same toolbelt the rest of the team runs.")}</p>
    <div class="w-checks">${rows}${more}</div>
    ${m.ok ? "" : `<div class="w-actions"><button class="later" data-w="next">${phrase("continue anyway — the next steps will wait")}</button></div>`}
  </div>`;
}

function pageSetup() {
  const s = wb.s || {};
  const own = s.setup || {};
  if (own.ok) {
    return `<div class="w-page">
      ${icon("setup")}
      <h2>${phrase("Your key and your config are in place.")}</h2>
      <p class="lead">${phrase("Every command that reaches your server leaves this machine signed with")} <code>~/.hive/key-${esc(wb.dev)}</code>${phrase(". The private half never moves; the server only keeps the public line below.")}</p>
      ${copyBox(own.line, "copy the line")}
    </div>`;
  }
  return `<div class="w-page">
    ${icon("setup")}
    <h2>${phrase("One click makes your key and your config.")}</h2>
    <p class="lead">${phrase("Generates an ed25519 key at")} <code>~/.hive/key-${esc(wb.dev)}</code> ${phrase("and writes")} <code>~/.hive/config</code> ${wb.s?.wantsServer ? phrase("with your name, your server and where the hub lives. Nothing is installed on your PATH: the app carries what it runs.") : phrase("with your name and where your workspace lives. Nothing is installed on your PATH: the app carries what it runs.")}</p>
    <div class="w-checks">
      ${check(own.key, "signing key", own.key ? phrase("already at ~/.hive") : phrase("will be generated — the private half never leaves this machine"))}
      ${check(own.config, "config", own.config ? phrase("already written") : wb.hub ? `${phrase("will point at")} <code>${esc(wb.hub)}</code>` : phrase("no hub folder yet — go back to the first step and pick one"))}
      ${wb.setupError ? check(false, "last try", `<span role="alert">${esc(wb.setupError)}</span>`) : ""}
    </div>
  </div>`;
}

function pageServer() {
  const s = wb.s || {};
  const server = s.server || {};
  if (server.wanted === false) {
    return `<div class="w-page">
      ${icon("pod")}
      <h2>${phrase("Seats run on this machine.")}</h2>
      <p class="lead">${phrase("Nothing here needs a server: every chat opens in a window on your own computer.")}</p>
      <p class="sub">${phrase("To use one anyway — yours, or your team's — put its address in {file}.", { file: "<code>~/.hive/config</code>" })} <code>HIVE_SERVER_URL=https://…</code></p>
    </div>`;
  }
  if (!server.answers) {
    return `<div class="w-page">
      ${icon("pod")}
      <div class="w-kicker"><span class="live"></span> ${phrase("retrying")}</div>
      <h2>${phrase("No answer from your server yet.")}</h2>
      <p class="lead"><code>${esc(server.url || phrase("no address"))}</code></p>
      <p class="sub">${esc(server.error || phrase("it did not answer"))} ${phrase("This screen retries on its own. A server that was never started has to be started first: {guide} walks you through it.", { guide: guideLink() })}</p>
      <div class="w-actions"><button class="later" data-w="next">${phrase("continue anyway — the next steps wait for it")}</button></div>
    </div>`;
  }
  return `<div class="w-page">
    ${icon("pod")}
    <h2>${phrase("Your server is answering.")}</h2>
    <p class="lead"><code>${esc(server.url)}</code></p>
    <p class="sub">${phrase("It named this key, and your client pins it from now on:")} <code>${esc(server.key)}</code></p>
  </div>`;
}

function pageAuthorize() {
  const s = wb.s || {};
  const sig = s.signature || {};
  if (sig.ok) {
    return `<div class="w-page">
      ${icon("authorize")}
      <h2>${phrase("Your server recognizes your signature.")}</h2>
      <p class="lead">${phrase("Every call arrives signed and dated, and the server refuses anything older than 90 seconds. What you type in the app goes through the same door.")}</p>
    </div>`;
  }
  return `<div class="w-page">
    ${icon("authorize")}
    <h2>${phrase("Your server does not know this key yet.")}</h2>
    <p class="lead">${phrase("A server trusts the key it was started with. Hand it yours and restart it:")} <code>HIVE_OWNER_KEY</code></p>
    ${copyBox(s.ownerKey ? `HIVE_OWNER_KEY="${s.ownerKey}"` : "", "copy the line")}
    <p class="sub">${sig.why ? phrase("right now: {why}.", { why: esc(sig.why) }) + " " : ""}${phrase("Someone already inside can also let you in with an invite.")}</p>
  </div>`;
}

function pageLogin() {
  const s = wb.s || {};
  const c = s.claudeOnServer || {};
  if (wb.login?.step === "code") {
    return `<div class="w-page">
      ${icon("login")}
      <div class="w-kicker"><span class="live"></span> ${phrase("waiting for the code")}</div>
      <h2>${phrase("Sign in on the page, then paste the code.")}</h2>
      <p class="lead">${phrase("The page forces a logout and a fresh login first — that is the pairing flow, not a bug. Use")} <b>${phrase("your")}</b> ${phrase("Claude account: the server is yours and its identity is this login.")}</p>
      <div class="w-form">
        <div style="text-align:center"><a class="btn" href="${esc(wb.login.url)}" target="_blank" rel="noreferrer" style="display:inline-block;border-radius:8px">${phrase("open the authorization page ↗")}</a> <button class="btn" data-copy="${esc(wb.login.url)}" style="border-radius:8px">${phrase("copy the link")}</button></div>
        <div><label for="w-code">${phrase("code from the page")}</label><input id="w-code" spellcheck="false" autocomplete="off" placeholder="${phrase("paste it here and hit enter")}" /></div>
      </div>
      <div class="w-actions"><button class="later" data-w="login-cancel">${phrase("cancel")}</button></div>
    </div>`;
  }
  if (c.loggedIn) {
    return `<div class="w-page">
      ${icon("login")}
      <h2>${c.plan ? phrase("Claude is logged in on the server — {plan} account.", { plan: esc(c.plan) }) : phrase("Claude is logged in on the server.")}</h2>
      <p class="lead">${phrase("The credential lives on the volume, so this is once per server, not once per day.")}</p>
      ${c.remoteControl ? "" : `<div class="w-actions"><button class="btn" data-w="control">${phrase("start remote control")}</button></div>`}
    </div>`;
  }
  return `<div class="w-page">
    ${icon("login")}
    <h2>${phrase("Last door: log Claude in on the server.")}</h2>
    <p class="lead">${phrase("The app opens")} <code>claude auth login</code> ${phrase("inside the server, hands you the authorization link, and takes the code back. It also pre-accepts the trust and bypass dialogs and starts Remote Control, so cloud chats never stall on a prompt nobody sees.")}</p>
    <p class="sub">${phrase("About 15 seconds to get the link.")}</p>
  </div>`;
}

function flightCard() {
  const s = st.data.sessions.find((x) => x.name === "first-flight" && x.where === "local");
  const job = st.data.spawning.find((j) => j.name === "first-flight");
  if (!s && !job) return "";
  if (!s) return `<div class="w-flight"><div class="head"><svg><use href="#g-working"/></svg><b>first-flight</b> · ${esc(job.step)}${job.error ? ` · ${esc(job.error)}` : ""}</div><div class="empty">${phrase("booting the session — the tile shows up in the hive as soon as it answers")}</div></div>`;
  return `<div class="w-flight" data-state="${s.state}"><div class="head"><svg style="color:${stateColor(s.state)}"><use href="#${GLYPH[s.state]}"/></svg><b>${esc(s.title || s.name)}</b> · ${LABEL[s.state]}${s.model ? ` · ${esc(s.model)}` : ""}</div>
    <div class="body">
      ${s.summary ? `<div class="k">${phrase("summary")}</div><div class="v">${esc(s.summary)}</div>` : ""}
      ${s.now ? `<div class="k">${phrase("now")}</div><div class="v now">${esc(s.now)}</div>` : ""}
      ${s.next ? `<div class="k">${phrase("next")}</div><div class="v">${esc(s.next)}</div>` : ""}
      ${!s.summary && !s.now ? `<div class="v">${phrase("no status written yet — the worker is about to")}</div>` : ""}
    </div></div>`;
}

const flightAlive = () => !!wb.s?.firstFlight || st.data.sessions.some((x) => x.name === "first-flight") || st.data.spawning.some((j) => j.name === "first-flight");

function pageFlight() {
  if (!flightAlive()) {
    return `<div class="w-page">
      ${icon("flight")}
      <h2>${phrase("Open your first chat and watch it think.")}</h2>
      <p class="lead">${phrase("This one runs on this machine with a fixed mission: introduce itself, write its status file while you watch the tile fill in, then ask you a question — so you see what")} <b>${phrase("needs you")}</b> ${phrase("looks like and answer from the app. It touches nothing but its own status file.")}</p>
      ${serverIsOptional()}
      <div class="w-form"><div><label for="w-model">${phrase("model")}</label><select id="w-model">
        <option value="">${phrase("the account default")}</option>
        <option value="haiku">${phrase("Haiku 4.5 — fast and cheap, plenty for this")}</option>
        <option value="sonnet">Sonnet 5</option>
        <option value="opus">Opus 5</option>
      </select></div></div>
      <div class="w-actions"><button class="later" data-w="finish">${phrase("skip — take me to the hive")}</button></div>
    </div>`;
  }
  return `<div class="w-page">
    ${icon("flight")}
    <div class="w-kicker"><span class="live"></span> ${phrase("live")}</div>
    <h2>${phrase("It is alive. This is what a tile reads.")}</h2>
    <p class="lead">${phrase("The same status the hive shows beside every terminal — written by the session itself, in a file, while it works. When it turns")} <b>${phrase("needs you")}</b>${phrase(", that is your cue.")}</p>
    ${flightCard()}
    <p class="sub">${phrase("Eight stops, about a minute, over the real screen — or go straight in and read them later with")} <code>${keyHint("help")}</code>.</p>
    ${serverIsOptional()}
    <div class="w-actions"><button class="later" data-w="finish">${phrase("take me to the hive — skip the tour")}</button></div>
  </div>`;
}

function wPrimary() {
  const s = wb.s || {};
  const b = wb.busy;
  const p = (label, action, disabled) => ({ label, action, disabled: !!disabled || (b && b === action) });
  switch (wb.step) {
    case "hello": return s.machine && wAllEssential(s) ? p(phrase("Take the tour"), "hello") : p(phrase("Continue"), "hello");
    case "machine": return s.machine?.ok ? p(phrase("Continue"), "next") : p(phrase("Check again"), "recheck", !s.machine);
    case "setup": return s.setup?.ok ? p(phrase("Continue"), "next") : p(phrase("Create my key"), "setup");
    case "server":
      /* wSkipped/wDone already treat this step as done when no server is wanted —
         the button has to agree, or a local-only setup is stuck on "Check again"
         forever waiting on a server that was never going to answer */
      return (s.server?.answers || s.wantsServer === false) ? p(phrase("Continue"), "next") : p(phrase("Check again"), "recheck");
    case "authorize": return s.signature?.ok ? p(phrase("Continue"), "next") : p(phrase("Check again"), "recheck");
    case "login":
      if (wb.login?.step === "code") return p(phrase("Finish the login"), "login-finish");
      return s.claudeOnServer?.loggedIn ? p(phrase("Continue"), "next") : p(phrase("Start the login"), "login-start");
    case "flight": return flightAlive() ? p(phrase("Show me around"), "tour") : p(phrase("Open the first chat"), "first-flight");
  }
  return p(phrase("Continue"), "next");
}

const W_PAGES = { hello: pageHello, machine: pageMachine, setup: pageSetup, server: pageServer, authorize: pageAuthorize, login: pageLogin, flight: pageFlight };

const wHtml = {};

function wSet(id, html) {
  if (wHtml[id] === html) return false;
  wHtml[id] = html;
  $(id).innerHTML = html;
  return true;
}

function wForget() { for (const k in wHtml) delete wHtml[k]; }

function wPaint() {
  if (!welcomeOn()) return;
  const s = wb.s;
  wSet("w-dots", W_STEPS.filter((own) => !wSkipped(own.id)).map((own, i) => {
    const done = wDone(own.id);
    const locked = wLocked(own.id);
    return `<button data-id="${own.id}" data-done="${done}" data-locked="${locked}" title="${i + 1} · ${phrase(own.label)}" ${wb.step === own.id ? 'aria-current="step"' : ""} aria-label="${phrase(own.label)}"><i>${i + 1}</i><span>${esc(phrase(own.short))}</span></button>`;
  }).join(""));
  const focused = document.activeElement?.id;
  const value = focused ? document.activeElement.value : null;
  const start = document.activeElement?.selectionStart;
  if (wSet("w-stage", (W_PAGES[wb.step] || pageHello)())) {
    if (focused && $(focused)) { $(focused).value = value; $(focused).focus(); try { $(focused).setSelectionRange(start, start); } catch {} }
    else if (wb.step === "hello") $("w-dev")?.focus();
    else if (wb.login?.step === "code") $("w-code")?.focus();
  }
  const prev = wPrev();
  const i = W_STEPS.findIndex((x) => x.id === wb.step);
  const shown = W_STEPS.filter((own) => !wSkipped(own.id));
  const done = shown.filter((own) => wDone(own.id)).length;
  const at = shown.findIndex((own) => own.id === wb.step);
  wSet("w-bar-left", `${prev ? `<button class="btn" data-w="back">${phrase("Back")}</button>` : ""}<span class="says">${phrase("{i} of {total}", { i: Math.max(at, 0) + 1, total: shown.length })} · ${phrase(W_STEPS[i].label)} · <b>${phrase("{n} done", { n: done })}</b>${s?.server?.url ? ` · ${esc(new URL(s.server.url).host)}` : ""}</span>`);
  const pr = wPrimary();
  wSet("w-bar-right", `<button class="go" data-w="${pr.action}"${pr.disabled ? " disabled" : ""}>${wb.busy && wb.busy === pr.action ? phrase("working…") : esc(phrase(pr.label))} <kbd>↵</kbd></button>`);
  $("w-sandbox").hidden = !s?.sandbox;
}

function claudeSignInSay() {
  const signing = wb.claudeSignIn;
  if (signing?.error) return esc(signing.error);
  if (signing?.step === "opening") return phrase("opening the sign-in…");
  if (signing?.step === "browser") return phrase("finish the sign-in in the browser — it comes back here on its own, and this turns green");
  if (signing?.step === "page") return phrase("the browser did not come back on its own — finish it in the providers settings, where the sign-in can take a code");
  return phrase("not logged in on this machine — sign in, and the browser brings you back here");
}

function claudeSignInButton() {
  const step = wb.claudeSignIn?.step;
  if (step === "opening") return "";
  if (step === "browser" && wb.claudeSignIn.url) return `<button class="fix" data-w="claude-sign-in-again">${phrase("open it again")}</button>`;
  return `<button class="fix" data-w="claude-sign-in">${phrase("sign in")}</button>`;
}

async function claudeSignIn() {
  wb.claudeSignIn = { step: "opening" };
  wPaint();
  let d = {};
  try {
    d = await (await fetch("/api/provider", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sign-in", provider: "claude", name: "default" }) })).json();
  } catch {
    d = { error: phrase("the sign-in did not open — try again") };
  }
  if (d.error) wb.claudeSignIn = { error: d.error };
  else wb.claudeSignIn = { step: d.direct ? "browser" : "page", url: d.url || "" };
  if (d.url) window.open(d.url, "_blank", "noopener,noreferrer");
  wPaint();
}

function claudeSignInLanded() {
  if (!wb.claudeSignIn || !wb.s?.machine?.claude?.loggedIn) return;
  wb.claudeSignIn = null;
  fetch("/api/provider", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "close", provider: "claude" }) }).catch(() => {});
}

async function wRun(action, el) {
  if (action === "next") return wGo(wNext());
  if (action === "back") { const p = wPrev(); return p ? wGo(p) : null; }
  if (action === "recheck") { wb.busy = "recheck"; wPaint(); await wPull(true); wb.busy = ""; return wPaint(); }
  if (action === "claude-sign-in") return claudeSignIn();
  if (action === "claude-sign-in-again") { if (wb.claudeSignIn?.url) window.open(wb.claudeSignIn.url, "_blank", "noopener,noreferrer"); return; }
  if (action === "face-open") { wb.facePicker = !wb.facePicker; return paintAvatar(); }
  if (action === "face-roll") { st.myBlob = false; st.myFace = nearestFree(rollAvatar(), takenSlots()); paintAvatar(); return saveAvatar(); }
  if (action === "face-strip") return stripWear();
  if (action === "face-set") return pickFace(el?.dataset?.part, el?.dataset?.value);
  if (action === "hello") {
    const dev = nameSlug($("w-dev")?.value);
    const hub = ($("w-hub")?.value || "").trim();
    wb.hub = hub;
    if (!/^[a-z][a-z0-9-]{1,29}$/.test(dev)) { wb.nameWrong = true; wPaint(); return $("w-dev")?.focus(); }
    wb.dev = dev; wb.ready = true;
    await saveAvatar();
    await wPull(false);
    if (!wb.s?.hubLooks?.ok) return;
    if (wAllEssential(wb.s)) return startTour();
    return wGo(wFirstOpen());
  }
  if (action === "setup") {
    wb.setupError = "";
    const d = await wAct("setup", { name: wb.dev, hub: wb.hub });
    if (d?.ok) {
      document.dispatchEvent(new Event("hive:machine-changed"));
      return wGo(wNext());
    }
    wb.setupError = d?.error || phrase("the app did not answer — try again in a moment");
    return wPaint();
  }
  if (action === "wake") return wAct("wake");
  if (action === "authorize") {
    const d = await wAct("authorize");
    if (d?.ok) wGo(wNext());
    return;
  }
  if (action === "control") return wAct("control");
  if (action === "login-start") {
    const d = await wAct("login-start");
    if (d?.url) { wb.login = { step: "code", url: d.url }; wPaint(); }
    return;
  }
  if (action === "login-cancel") { wb.login = null; wPaint(); return wAct("login-cancel"); }
  if (action === "login-finish") {
    const code = $("w-code")?.value.trim();
    if (!code) return;
    const saved = wb.login;
    wb.login = null;
    const d = await wAct("login-code", { code });
    if (!d?.ok) { wb.login = saved; wPaint(); return; }
    return wGo(wNext());
  }
  if (action === "first-flight") {
    const model = $("w-model")?.value || "";
    const d = await wAct("first-flight", { model, language: st.language, newChat: keyHint("new") });
    if (d?.ok) {
      wb.flightSeen = true;
      const target = blockWithRoom() || openBlock();
      if (d.id && !target.keys.includes(`job:${d.id}`)) { target.keys.push(`job:${d.id}`); justCreated.set(d.id, Date.now()); }
      st.block = st.blocks.indexOf(target); st.focus = Math.max(0, target.keys.length - 1);
      saveBlockAt(st.block);
      saveBlocks();
      pull();
    }
    return;
  }
  if (action === "finish" || action === "tour") {
    await wAct("finish");
    closeWelcome();
    if (action === "tour") startTour();
    return;
  }
}

function openWelcome(step) {
  releaseKeyboard();
  exitReview?.();
  if (prsOnScreen()) closePrs();
  if (usageOnScreen()) closeUsage();
  if (worktreesOnScreen()) closeWorktrees();
  $("welcome").hidden = false;
  wb.step = step || "hello";
  wb.login = null;
  wForget();
  wPaint();
  wPull(true);
  every("welcome", 4000, async () => { await wPull(!!wb.claudeSignIn?.step); claudeSignInLanded(); });
}

function markCopied(button) {
  clearTimeout(button.dataset.back && Number(button.dataset.back));
  if (!button.dataset.said) button.dataset.said = button.textContent;
  button.textContent = phrase("copied");
  button.classList.add("said");
  button.dataset.back = String(setTimeout(() => {
    if (!button.isConnected) return;
    button.textContent = button.dataset.said;
    button.classList.remove("said");
  }, 1600));
}

function closeWelcome() {
  $("welcome").hidden = true;
  stopBeat("welcome");
  render();
}

$("welcome").addEventListener("click", async (e) => {
  const copy = e.target.closest("[data-copy]");
  if (copy) {
    const ok = await toClipboard(copy.dataset.copy);
    if (ok) markCopied(copy);
    return;
  }
  const dot = e.target.closest(".w-dots button[data-id]");
  if (dot) return wGo(dot.dataset.id);
  const b = e.target.closest("[data-w]");
  if (b && !b.disabled) return wRun(b.dataset.w, b);
});

let hubRecheck = 0;

$("welcome").addEventListener("input", (e) => {
  if (e.target.id === "w-dev") {
    const v = nameSlug(e.target.value);
    wb.dev = v;
    if (wb.nameWrong) { wb.nameWrong = false; wPaint(); }
    const echo = $("w-dev-echo");
    if (echo) echo.textContent = v || phrase("name");
    if (!st.myFace || st.myBlob) paintAvatar();
  }
  if (e.target.id === "w-hub") {
    wb.hub = e.target.value.trim();
    clearTimeout(hubRecheck);
    hubRecheck = setTimeout(() => wPull(false), 400);
  }
});

$("w-skip").addEventListener("click", () => closeWelcome());

function welcomeKeys(e) {
  if (e.key === "Escape") { e.preventDefault(); if (wb.login?.step === "code") return wRun("login-cancel"); return; }
  if (e.key === "Enter" && !(e.metaKey || e.ctrlKey || e.altKey)) {
    const tag = document.activeElement?.tagName;
    if (tag === "SELECT" || tag === "TEXTAREA") return;
    if (document.activeElement?.id === "w-hub" || document.activeElement?.id === "w-dev") { e.preventDefault(); return wRun("hello"); }
    if (document.activeElement?.id === "w-code") { e.preventDefault(); return wRun("login-finish"); }
    const go = $("w-bar-right").querySelector(".go[data-w]");
    if (go && !go.disabled) { e.preventDefault(); wRun(go.dataset.w); }
  }
}

export { PLAY_LOOK, REST_WALK, W_PAGES, aimFace, avatarPulse, clampAim, closeWelcome, fleetFeeling, flightAlive, flightCard, followPointer, followReach, follower, hadKeyboard, lentFace, lentFlash, lentPlayers, markCopied, mugBreath, mugFace, mugMood, mugPlay, mugRest, openWelcome, orbited, pageAuthorize, pageFlight, pageHello, pageLogin, pageMachine, pageServer, pageSetup, restTimer, saveAvatar, seenDevs, teamFlash, teamPlayers, teamWaiting, wForget, wHtml, wPaint, wPrimary, wRun, wSet, waitingPlayer, welcomeKeys };
