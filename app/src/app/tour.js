import { closeWelcome, openWelcome } from "./avatars.js";
import { askForNotices, ensureAudio } from "./chimes-and-notices.js";
import { $, apiGet, esc, every, phrase, raycastOn, solidMounts, st, stopBeat } from "./core.js";
import { goTo } from "./focus-navigation.js";
import { keyHint } from "./leader-key.js";
import { openPortaria, paintPortaria, portariaOnScreen } from "./pod.js";
import { openShelf, openShelfPage, paintShelf, pullShelf, shelfVersionsOf } from "./shelf.js";
import { wAllEssential, wb, welcomeOn } from "./welcome.js";

const TOUR = [
  {
    el: "#rail", title: "Every session, in one rail",
    get text() {
      return raycastOn()
        ? "Grouped by block, with the key that jumps to it, and what each seat is doing written beside it. Local and cloud are a filter at the top, and / searches."
        : "Local and cloud together, each with where it runs and the number of the block it sits in. Orange means it needs you.";
    }
  },
  { el: "#blocks", title: "Blocks", text: "The screen holds at most {limit} chats at once — you pick how many in the settings, and 4 is the ceiling of what one person follows. The next one opens a new block; {prev} and {next} move between them, {seat} picks a seat." },
  { el: "#composer", title: "New chat", text: "{new}, or the /new chip in this bar. Write the mission, pick local or cloud and a model. The seat appears at once while the session boots, and the AI names it from the mission." },
  { el: "#btn-calls", title: "Next one that needs you", text: "{calls} jumps to the next session waiting on an answer. With the chime on ({sound}), it also beeps once when a tile turns orange, and {answered} adds a desktop notice when a seat finishes answering." },
  { el: "#mode", title: "Who owns the keyboard", text: "By default, hive does. Click inside a terminal (or press Enter on the focused tile) to hand it to that Claude Code — the tile turns blue. {release} takes it back." },
  { el: "#btn-prs", title: "PRs without leaving", text: "{prs}. The app notices when a session opens a PR, and lets you review file by file and merge when CI is green — right here." },
  { el: "#btn-help", title: "That is the hive", text: "{settings} shows every shortcut and lets you rebind them — it is where your face and the little you live too — and it reopens this setup. Now go answer your first chat." }
];

st.tourAt = -1;

const tourSaid = new Map();

function sayHelpful(helpful) {
  const step = TOUR[st.tourAt];
  if (!step || tourSaid.has(st.tourAt)) return;
  tourSaid.set(st.tourAt, helpful);
  paintTour();
  fetch("/api/tour-feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stop: st.tourAt + 1, el: step.el, title: step.title, helpful: helpful === "yes" })
  }).catch(() => {});
}

function startTour() {
  if (welcomeOn()) closeWelcome();
  st.tourAt = 0;
  $("coach").hidden = false;
  paintTour();
}

function endTour() {
  st.tourAt = -1;
  $("coach").hidden = true;
  localStorage.setItem("hive.toured", "1");
  const flight = st.data.sessions.find((x) => x.name === "first-flight");
  if (flight) goTo(flight.name);
}

function paintTour() {
  const step = TOUR[st.tourAt];
  if (!step) return endTour();
  const el = document.querySelector(step.el);
  const r = el ? el.getBoundingClientRect() : { left: 20, top: 20, width: 0, height: 0 };
  const pad = 6;
  const hole = $("coach-hole");
  hole.style.left = `${r.left - pad}px`; hole.style.top = `${r.top - pad}px`;
  hole.style.width = `${r.width + pad * 2}px`; hole.style.height = `${r.height + pad * 2}px`;
  const pop = $("coach-pop");
  tourSolid.show(tourViewModel());
  const h = pop.offsetHeight || 180;
  let left, top;
  if (r.height > 300) {
    left = Math.min(window.innerWidth - 352, r.left + r.width + 14);
    top = Math.max(12, r.top + 14);
  } else {
    left = Math.max(12, Math.min(window.innerWidth - 352, r.left + r.width / 2 - 170));
    const below = r.top + r.height + 14;
    top = below + h + 12 > window.innerHeight ? Math.max(12, r.top - 14 - h) : below;
  }
  pop.style.left = `${r.width === 0 ? 20 : left}px`;
  pop.style.top = `${top}px`;
}

let tourSolid = null;

function tourViewModel() {
  const step = TOUR[st.tourAt];
  const answered = tourSaid.get(st.tourAt);
  return {
    count: `${st.tourAt + 1} / ${TOUR.length}`,
    title: phrase(step.title),
    text: phrase(step.text, { limit: st.LIMIT, settings: keyHint("help"), prev: keyHint("prevBlock"), next: keyHint("nextBlock"), seat: keyHint("seat"), new: keyHint("new"), calls: keyHint("calls"), sound: keyHint("sound"), answered: keyHint("answered"), release: keyHint("release"), prs: keyHint("prs") }),
    thanks: answered ? (answered === "yes" ? phrase("glad it helped") : phrase("noted — this one gets rewritten")) : "",
    asking: phrase("was this helpful?"),
    yes: phrase("yes, it helped"),
    no: phrase("no, it did not help"),
    back: st.tourAt ? phrase("back") : "",
    skip: phrase("skip the tour"),
    next: st.tourAt === TOUR.length - 1 ? phrase("done") : phrase("next")
  };
}

solidMounts.push((hive) => {
  const pop = $("coach-pop");
  if (pop) tourSolid = hive.mountTourPop(pop);
});

$("coach").addEventListener("click", (e) => {
  const say = e.target.closest("[data-helpful]");
  if (say) return sayHelpful(say.dataset.helpful);
  const b = e.target.closest("[data-tour]");
  if (!b) return;
  if (b.dataset.tour === "end") return endTour();
  st.tourAt += b.dataset.tour === "back" ? -1 : 1;
  paintTour();
});

window.addEventListener("resize", () => { if (st.tourAt >= 0) paintTour(); });

function tourKeys(e) {
  if (e.key === "Escape") { e.preventDefault(); return endTour(); }
  if (e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); st.tourAt += 1; return paintTour(); }
  if (e.key === "ArrowLeft") { e.preventDefault(); st.tourAt = Math.max(0, st.tourAt - 1); return paintTour(); }
}

async function bootWelcome() {
  try {
    const r = await fetch("/api/onboarding");
    const s = await r.json();
    if (s.finished) return;
    if (wAllEssential(s)) {
      await fetch("/api/onboarding/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "finish" }) });
      return;
    }
    wb.s = s; wb.dev = s.dev || ""; wb.hub = s.hub || "";
    openWelcome("hello");
  } catch {}
}

window.hiveOpenShelf = async (asked) => {
  const slug = String(asked?.slug || "");
  if (!slug) return;
  st.shelfAt = String(asked?.at || "");
  openShelf();
  await pullShelf(true);
  const page = (st.shelf?.pages || []).find((one) => one.slug === slug);
  if (!page) {
    st.shelfQuery = slug;
    $("sh-search").value = slug;
    return paintShelf();
  }
  openShelfPage(page, String(asked?.tab || ""));
  const wanted = Number(asked?.version) || 0;
  if (wanted && shelfVersionsOf(page, st.shelfTab).some((v) => v.n === wanted)) {
    st.shelfVersion = wanted;
    paintShelf();
  }
};

window.hiveOpenJoin = (asked) => {
  const link = String(asked?.link || "");
  if (!link) return;
  st.portariaLink = link;
  st.portariaSaid = phrase("an invite came in from {where} — go in when you know who sent it", { where: String(asked?.at || "") });
  if (portariaOnScreen()) paintPortaria(); else openPortaria();
  $("pt-link")?.focus();
};

document.addEventListener("click", () => { ensureAudio(); askForNotices(); }, { once: true });

st.updating = false;

st.updateState = {};

st.showAllNotes = false;

st.held = null;

const releasesUrl = () => (st.updateState.releaseRepo ? `https://github.com/${st.updateState.releaseRepo}/releases` : "");

const NOTE_TAG = { new: "new", fixed: "fix", faster: "fast", changed: "changed" };

const NOTE_GROUP = [["new", "new"], ["fixed", "fixed"], ["faster", "faster"], ["changed", "changed"], ["", "also"]];

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function versionOf(tag, number) {
  if (number > 0) return `#${number}`;
  const found = /^hive-([\d.]+)-([0-9a-f]+)$/.exec(String(tag || ""));
  return found ? `${found[1]} · ${found[2].slice(0, 7)}` : String(tag || "");
}

const megabytes = (bytes) => (bytes > 0 ? `${(bytes / 1048576).toFixed(0)} MB` : "");

const notesIn = (state) => (state.notes || []).length
  ? state.notes
  : (state.commits || []).map((text) => ({ kind: "", text, pr: "" }));

function paintRunning(mine) {
  const el = $("ver");
  const running = mine || {};
  const numbered = running.number > 0;
  const label = numbered || running.tag ? versionOf(running.tag, running.number) : (running.sha || "").slice(0, 7);
  el.hidden = !label;
  el.textContent = label;
  const where = releasesUrl();
  if (running.tag && where) el.href = `${where}/tag/${encodeURIComponent(running.tag)}`;
  else el.removeAttribute("href");
  el.title = numbered
    ? phrase("release {n}, the one this app is running — click to read it on GitHub", { n: running.number })
    : running.tag
      ? phrase("the release this app is running — click to read it on GitHub")
      : phrase("running from your checkout on {branch}, never from a release", { branch: running.branch || "a detached head" });
}

function paintUpdate(d) {
  st.updateState = d || {};
  paintRunning(st.updateState.mine);
  if (st.updating) return;
  if (st.held && st.held.tag !== (st.updateState.tag || "")) clearHeld();
  const b = $("btn-update");
  const behind = st.updateState.behind || 0;
  b.hidden = !behind && !st.held;
  $("n-update").textContent = behind ? String(behind) : "";
  b.title = st.held ? st.held.why
    : behind ? phrase("{what} since your build — click to read them", { what: plural(behind, phrase("change")) })
    : "";
  if (!behind && !st.held) closeRelnotes();
  else if (!$("relnotes").hidden) paintRelnotes();
}

function paintRelnotes() {
  const said = relnotesViewModel();
  $("rp-ver").textContent = said.ver;
  $("rp-count").textContent = said.count;
  $("rp-sub").textContent = said.sub;
  relnotesSolid.show({ notes: said.notes });
  $("rp-more").hidden = !said.more;
  $("rp-more").textContent = said.more;
  $("rp-size").textContent = said.size;
  $("rp-why").hidden = !said.why;
  if (said.why) $("rp-why").innerHTML = `<b>${esc(said.why.lead)}</b><span>${esc(said.why.said)}</span>`;
  $("rp-go").textContent = said.go;
}

let relnotesSolid = null;

function relnotesViewModel() {
  const d = st.updateState;
  const all = notesIn(d);
  const shown = st.showAllNotes ? all : all.slice(0, 3);
  const rest = all.length - shown.length;
  const how = d.via === "pack"
    ? phrase("Just the javascript — the app stays where it is and your seats keep running.")
    : d.via === "release"
    ? phrase("Straight out of CI — nothing rebuilds on this machine.")
    : d.packaged ? phrase("Your machine rebuilds the app, which takes a few minutes.") : phrase("The checkout pulls and installs.");
  return {
    ver: versionOf(d.tag, d.number),
    count: plural(d.behind || all.length, phrase("change")),
    sub: d.quiet ? `${how} ${phrase("{what} stayed out of this list.", { what: plural(d.quiet, phrase("housekeeping commit")) })}` : how,
    notes: shown.map((note, at) => ({
      key: `${at}:${note.text}`, kind: note.kind || "", tag: phrase(NOTE_TAG[note.kind] || "·"),
      text: note.text, delay: `${40 + at * 45}ms`
    })),
    more: rest > 0 ? phrase("+{n} more", { n: rest }) : "",
    size: megabytes(d.assetSize),
    why: st.held ? { lead: st.held.lead, said: st.held.why } : null,
    go: st.held ? phrase("try again")
      : d.via === "pack" ? phrase("Update")
      : d.via === "release" || !d.packaged ? phrase("Update and restart")
      : phrase("Rebuild and restart")
  };
}

solidMounts.push((hive) => {
  const list = $("rp-list");
  if (list) relnotesSolid = hive.mountRelnotes(list);
});

function openRelnotes() {
  st.showAllNotes = false;
  paintRelnotes();
  $("relnotes").hidden = false;
  $("btn-update").setAttribute("aria-expanded", "true");
}

function closeRelnotes() {
  $("relnotes").hidden = true;
  $("btn-update").setAttribute("aria-expanded", "false");
}

async function pullUpdate() {
  try { paintUpdate(await apiGet("/api/update")); } catch {}
}

function stopPhase() { stopBeat("phases"); }

function startPhase() {
  stopPhase();
  every("phases", 700, async () => {
    try {
      const p = await apiGet("/api/update/phase");
      if (!p || !p.step) return;
      $("upd-step").textContent = p.step;
      const share = p.total > 0 ? Math.min(100, Math.round((p.done / p.total) * 100)) : 100;
      $("upd-fill").style.width = `${p.step === "downloading" ? share : 100}%`;
    } catch {}
  });
}

function clearHeld() {
  st.held = null;
  $("btn-update").classList.remove("held");
  $("rp-why").hidden = true;
}

function holdUpdate(lead, why) {
  st.updating = false;
  stopPhase();
  st.held = { lead, why, tag: st.updateState.tag || "" };
  const b = $("btn-update");
  b.classList.remove("busy");
  b.classList.add("held");
  b.hidden = false;
  $("upd-step").textContent = lead;
  openRelnotes();
  pullUpdate();
}

async function applyUpdate() {
  if (st.updating) return;
  st.updating = true;
  clearHeld();
  closeRelnotes();
  $("btn-update").classList.add("busy");
  $("upd-step").textContent = phrase("starting");
  $("upd-fill").style.width = "0%";
  startPhase();
  try {
    const r = await fetch("/api/update/apply", { method: "POST" });
    const d = await r.json();
    if (d.error) return holdUpdate(phrase("update failed"), d.error);
    if (d.note) return holdUpdate(phrase("your turn"), d.note);
    if (!d.ok) return holdUpdate(phrase("update failed"), phrase("the update stopped without saying why"));
  } catch {
    holdUpdate(phrase("update failed"), phrase("the app lost the server while it was updating — nothing was replaced"));
  }
}

$("btn-update").addEventListener("click", (e) => {
  e.stopPropagation();
  if (st.updating) return;
  if ($("relnotes").hidden) openRelnotes(); else closeRelnotes();
});

$("rp-more").addEventListener("click", () => { st.showAllNotes = true; paintRelnotes(); });

$("rp-later").addEventListener("click", closeRelnotes);

$("rp-go").addEventListener("click", applyUpdate);

$("relnotes").addEventListener("click", (e) => e.stopPropagation());

document.addEventListener("click", () => { if (!$("relnotes").hidden) closeRelnotes(); });

export { NOTE_GROUP, NOTE_TAG, TOUR, applyUpdate, bootWelcome, clearHeld, closeRelnotes, endTour, holdUpdate, megabytes, notesIn, openRelnotes, paintRelnotes, paintRunning, paintTour, paintUpdate, plural, pullUpdate, releasesUrl, relnotesSolid, relnotesViewModel, sayHelpful, startPhase, startTour, stopPhase, tourKeys, tourSaid, tourSolid, tourViewModel, versionOf };
