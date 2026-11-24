import { phrase, esc } from "./core.js";
import { addDrawerBanner, onDrawerAct } from "./composer-drawer.js";
import { composerIcon } from "./composer-icons.js";
import { boxHasContent, onComposerDriver, onComposerSend, onComposerSlash, paintComposer } from "./composer-modes.js";
import { startFresh } from "./provider-transfer.js";
import { refreshContext, svLine } from "./structured-seats.js";

const CLEAR = /^\/clear\s*$/i;

const CLEAR_TOKEN = /(^|\s)\/clear(?=\s|$)\s?/i;

function armFresh(e) {
  e.freshArmed = Date.now();
  paintComposer(e);
}

function disarmFresh(e) {
  if (!e.freshArmed) return;
  e.freshArmed = 0;
  paintComposer(e);
}

const freshOffered = (e) => !!e.box && !e.ask && !e.planAsk && !e.editing;

function onlyClear(e) {
  const box = e.box?.snapshot?.();
  return !!box && CLEAR.test(box.text.trim()) && !box.images.length && !box.quotes.length;
}

function freshBanner(e) {
  if (!e.freshArmed || e.ask || e.planAsk) return "";
  return `<section class="cp-ban cp-fresh"><div class="cp-brow"><span class="cp-bi">${composerIcon("eraser")}</span>`
    + `<span class="cp-bc cp-fresh-say"><span class="cp-bstrong">${esc(phrase("Your next message starts a fresh session"))}</span><span class="cp-fresh-why">${esc(phrase("The agent won't see earlier messages in this chat."))}</span></span>`
    + `<span class="cp-ba"><button type="button" class="cp-bx" data-act="fresh-keep" aria-label="${esc(phrase("Keep the current session"))}" title="${esc(phrase("Keep the current session"))}">${composerIcon("x")}</button></span></div></section>`;
}

async function freshThenSend(e, alternate) {
  if (e.freshStarting) return;
  e.freshStarting = true;
  paintComposer(e);
  const job = await startFresh(e, { clean: true });
  e.freshStarting = false;
  if (job?.phase !== "done") return void paintComposer(e);
  e.freshArmed = 0;
  e.freshPass = true;
  try { e.box.say(alternate); }
  finally { e.freshPass = false; }
  paintComposer(e);
}

onComposerSlash({
  offer: (e) => (freshOffered(e) ? [["clear", { description: phrase("Start a fresh session; earlier messages stay visible"), argumentHint: "" }]] : []),
  pick(e, name) {
    if (name !== "clear" || !freshOffered(e)) return false;
    const box = e.box.textarea;
    box.value = box.value.replace(CLEAR_TOKEN, "$1");
    box.setSelectionRange(box.value.length, box.value.length);
    box.dispatchEvent(new Event("input"));
    armFresh(e);
    return true;
  }
});

onComposerSend({
  order: 30,
  take(e) {
    if (!freshOffered(e) || !onlyClear(e)) return false;
    e.box.restore({ text: "" });
    armFresh(e);
    return true;
  }
});

onComposerSend({
  order: 40,
  take(e, asked) {
    if (!e.freshArmed || e.freshPass || e.ask || e.planAsk || e.editing || !boxHasContent(e)) return false;
    freshThenSend(e, !!asked.alternate);
    return true;
  }
});

addDrawerBanner({ order: 40, html: freshBanner });

onDrawerAct("fresh-keep", (e) => {
  disarmFresh(e);
  e.box?.textarea.focus();
});

onComposerDriver({
  note(e, ev, live) {
    if (ev.subtype !== "started_fresh" || !ev.clean) return false;
    if (live) {
      e.turnOpen = false;
      refreshContext(e);
    }
    svLine(e, "sv-meta sv-new-session", phrase("New session"));
    return true;
  }
});

export { armFresh, disarmFresh, freshBanner, onlyClear };
