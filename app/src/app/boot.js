import { reloadConfig } from "./brand-face.js";
import { flushDrafts } from "./kept-drafts.js";
import { PAGE_BEAT, openPopupTab, pullPages } from "./chat-and-panes.js";
import { DEFAULT_SOUNDS, SWITCHED, VOLUME_DEFAULT, ensureAudio, flipNotice, playSound, setAnswered, setKnocks, setSound, setSounds, setVolume } from "./chimes-and-notices.js";
import { $, every, st } from "./core.js";
import { goTo, pull } from "./focus-navigation.js";
import { pullHistory } from "./history.js";
import { disarmLeader, paintKeys } from "./leader-key.js";
import { LIMIT_BEAT, pullLimits } from "./limit-chip.js";
import { imageTray } from "./pinned-images.js";
import { bootPlane } from "./plane.js";
import { bootBrandFace, bootGaze, bootLanguage, bootPet } from "./preferences.js";
import { pullThreads } from "./prs.js";
import { BAR_KEY, CALM_KEY, DIM_KEY, paintCalm, paintPrefs } from "./pure-helpers.js";
import { bootLayout } from "./seat-layout.js";
import { bootStructure } from "./structure.js";
import { bootSolid } from "./shared.js";
import { bootSttPrefs } from "./stt-prefs.js";
import { DICTATION_BEAT, pullDictation, wireTalkButton } from "./stt.js";
import { structPool } from "./structured-seats.js";
import { ART_WEBVIEW } from "./subagents-dock.js";
import { KNOCKS_TICK, paceTeam, pullKnocks, pullTeam } from "./team.js";
import { PR_BEAT_AWAY, pullPrs } from "./thread.js";
import { bootWelcome, pullUpdate } from "./tour.js";
import { bootWhatsNew } from "./whats-new.js";

window.__hiveSeats = () => structPool;

if (ART_WEBVIEW) window.seatBrowser?.onPopup?.((wcId, url) => openPopupTab(wcId, url));

st.cmpTray = imageTray($("cmp-attach"), $("cmp-in"), () => ({ where: "local", name: "" }));

try {
  const d = localStorage.getItem(DIM_KEY); if (d !== null) st.dimOn = !!d;
  const b2 = localStorage.getItem(BAR_KEY); if (b2 !== null) st.barOn = !!b2;
  const c = localStorage.getItem(CALM_KEY); if (c !== null) st.calmOn = c !== "full";
} catch {}

paintPrefs();

paintCalm();

for (const kind of SWITCHED) {
  $(`s-${kind}`).addEventListener("change", (e) => {
    setSounds({ ...st.sounds, [kind]: e.target.value });
    playSound(st.sounds[kind]);
  });
  $(`p-${kind}`).addEventListener("click", () => { ensureAudio(); playSound($(`s-${kind}`).value); });
  $(`t-${kind}`).addEventListener("click", () => flipNotice(kind));
}
$("t-knocks").addEventListener("click", () => setKnocks(!st.teamKnocks));

bootWelcome().then(bootWhatsNew);

window.hiveGoTo = goTo;

setSounds(DEFAULT_SOUNDS, true);

setVolume(VOLUME_DEFAULT, true);

setSound(false, true);

setAnswered(false, true);

bootLayout();

bootStructure();

bootPlane();

bootLanguage();

bootSolid();

bootPet();

bootBrandFace();

bootGaze();

paintKeys();

window.addEventListener("blur", disarmLeader);

reloadConfig();

pull();

every("hive", 2500, pull, { background: true });

document.addEventListener("visibilitychange", () => { if (document.hidden) flushDrafts(); });

window.addEventListener("beforeunload", flushDrafts);

pullPrs();

st.prBeat = PR_BEAT_AWAY;

every("prs", PR_BEAT_AWAY, pullPrs);

pullPages();

every("pages", PAGE_BEAT, pullPages);

pullThreads(false);

pullHistory(true);

pullUpdate();

every("update", 15000, pullUpdate);

pullTeam(false);

paceTeam();

pullKnocks();

every("knocks", KNOCKS_TICK, pullKnocks, { background: true });

pullLimits();

every("limits", LIMIT_BEAT, () => pullLimits());

bootSttPrefs();

wireTalkButton($("cmp-talk"), () => $("cmp-in"));

pullDictation();

every("dictation", DICTATION_BEAT, pullDictation);

