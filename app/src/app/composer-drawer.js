import { wireLinks } from "./chat-and-panes.js";
import { IS_MAC, esc, phrase } from "./core.js";
import { askActive, askBanner, confirmAsk, foldAsk, goToStep, pickOption, stepAsk } from "./composer-ask.js";
import { composerIcon } from "./composer-icons.js";
import { composerLive, onComposerMode, paintComposer } from "./composer-modes.js";
import { planBanner } from "./composer-plan.js";
import { cancelEdit, editingBanner } from "./composer-queue.js";
import { ago } from "./pod.js";
import { readStash, stashPrompt, stashSnippet, takeStash } from "./prompt-stash.js";

const banners = [];

function addDrawerBanner(banner) {
  banners.push(banner);
  banners.sort((a, b) => (a.order || 0) - (b.order || 0));
}

const drawerActs = new Map();

function onDrawerAct(act, run) {
  drawerActs.set(act, run);
}

const stashKeys = IS_MAC ? "⌘S" : "Ctrl+S";

function stashMenuHtml(e, entries) {
  const at = Math.max(0, Math.min(entries.length - 1, e.stashAt || 0));
  const rows = entries.length
    ? entries.map((entry, i) => {
      const snippet = stashSnippet(entry, phrase);
      const pics = (entry.images || []).slice(0, 3).map(([, path]) => `<img alt="" aria-hidden="true" src="/api/image?path=${encodeURIComponent(path)}&where=${e.where}&name=${encodeURIComponent(e.name)}">`).join("");
      return `<li class="cp-brow cp-stash-row${i === at ? " hl" : ""}" data-id="${esc(entry.id)}"><span class="cp-bi">${composerIcon("fileText")}</span>`
        + `<span class="cp-bc"><button type="button" class="cp-stash-go" data-act="stash-restore" data-id="${esc(entry.id)}" aria-label="${esc(phrase("Restore stashed prompt: {snippet}", { snippet }))}">${esc(snippet)}</button></span>`
        + `<span class="cp-ba">${pics ? `<span class="cp-stash-pics">${pics}</span>` : ""}<time class="cp-stash-at">${esc(phrase("{when} ago", { when: ago(new Date(entry.at).toISOString()) }))}</time>`
        + `<button type="button" class="cp-bx" data-act="stash-drop" data-id="${esc(entry.id)}" aria-label="${esc(phrase("Delete stashed prompt"))}">${composerIcon("x")}</button></span></li>`;
    }).join("")
    : `<li class="cp-brow"><span class="cp-bi"></span><span class="cp-bc cp-bmuted">${esc(phrase("Nothing stashed yet."))} ${esc(phrase("Press {keys} with a prompt in the composer to stash it.", { keys: stashKeys }))}</span></li>`;
  return `<section class="cp-ban cp-stash"><button type="button" class="cp-brow" data-act="stash-close" aria-label="${esc(phrase("Close stash"))}" aria-expanded="true">`
    + `<span class="cp-bi">${composerIcon("bookmark")}</span><span class="cp-bc cp-bmuted">${esc(phrase("Stash"))}</span>`
    + `<span class="cp-ba"><span class="cp-bcount">${entries.length}</span><span class="cp-bfold open">${composerIcon("chevronDown")}</span></span></button>`
    + `<ul class="cp-stash-list" aria-label="${esc(phrase("Stashed prompts"))}">${rows}</ul></section>`;
}

addDrawerBanner({ order: 10, html: (e) => (askActive(e) || e.ask?.waiting ? askBanner(e) : "") });
addDrawerBanner({ order: 20, html: (e) => (e.editing ? editingBanner() : "") });
addDrawerBanner({ order: 30, html: (e) => (e.planAsk && !e.ask ? planBanner(e) : "") });
addDrawerBanner({ order: 90, html: (e) => (e.stashOpen ? stashMenuHtml(e, readStash()) : "") });

function stashTabHtml(e) {
  if (e.stashOpen || e.editing) return "";
  const entries = readStash();
  if (!entries.length) return "";
  const pulse = e.stashPulse ? ` pulse${e.stashPulse % 2 ? "" : " alt"}` : "";
  return `<button type="button" class="cp-stash-tab${pulse}" data-act="stash-open" aria-label="${esc(phrase("Stashed prompts: {count}. Open stash.", { count: entries.length }))}"><span class="cp-bi">${composerIcon("bookmark")}</span><span class="cp-bc">${esc(phrase("Stash"))}</span><span class="cp-bcount">${entries.length}</span></button>`;
}

function drawerHtml(e) {
  const shown = banners.map((one) => one.html(e)).filter(Boolean);
  const tab = stashTabHtml(e);
  if (!shown.length && !tab) return "";
  return `${shown.length ? `<div class="cp-dcol">${shown.join("")}</div>` : `<span class="cp-dfill"></span>`}${tab}`;
}

function drawerOf(e) {
  const drawer = e.host?.querySelector(":scope > .sv-drawer");
  if (drawer && !drawer.dataset.wired) {
    drawer.dataset.wired = "1";
    drawer.addEventListener("pointerdown", (ev) => { if (ev.target.closest("button")) ev.preventDefault(); });
    drawer.addEventListener("click", (ev) => drawerClick(e, ev));
  }
  return drawer;
}

function paintDrawer(e) {
  const drawer = drawerOf(e);
  if (!drawer) return;
  const html = composerLive(e) ? drawerHtml(e) : "";
  if (drawer.dataset.h === html) return;
  drawer.dataset.h = html;
  drawer.innerHTML = html;
  for (const md of drawer.querySelectorAll(".cp-ask-q")) wireLinks(e.name, md);
}

function drawerClick(e, ev) {
  const hit = ev.target.closest("[data-act]");
  if (!hit) return;
  const act = hit.dataset.act;
  if (act === "ask-fold") return foldAsk(e);
  if (act === "ask-pick") return pickOption(e, Number(hit.dataset.i));
  if (act === "ask-to") return goToStep(e, Number(hit.dataset.at));
  if (act === "ask-step") return stepAsk(e, Number(hit.dataset.d));
  if (act === "ask-confirm") return confirmAsk(e);
  if (act === "edit-cancel") return cancelEdit(e, true);
  if (act === "stash-open") return toggleStash(e, true);
  if (act === "stash-close") return toggleStash(e, false);
  if (act === "stash-restore") return restoreStash(e, hit.dataset.id);
  if (act === "stash-drop") {
    takeStash(hit.dataset.id);
    return paintComposer(e);
  }
  drawerActs.get(act)?.(e, hit, ev);
}

function toggleStash(e, open = !e.stashOpen) {
  e.stashOpen = !!open;
  e.stashAt = 0;
  paintComposer(e);
}

function restoreStash(e, id) {
  const entry = takeStash(id);
  e.stashOpen = false;
  if (entry && e.box) e.box.merge(entry);
  paintComposer(e);
  e.box?.textarea.focus();
}

function stashBox(e) {
  if (!e.box || e.editing) return;
  if (e.ask) return toggleStash(e);
  const box = e.box.snapshot();
  const empty = !box.text.trim() && !box.images.length && !box.quotes.length;
  if (empty) {
    const entries = readStash();
    if (entries.length === 1) return restoreStash(e, entries[0].id);
    return toggleStash(e);
  }
  const kept = stashPrompt(box);
  if (!kept.ok) return void e.box.warn(phrase("the stash is full on this machine — nothing was stashed"));
  e.stashPulse = (e.stashPulse || 0) + 1;
  e.box.restore({ text: "" });
  paintComposer(e);
}

function stashMenuKeys(e, kev) {
  const entries = readStash();
  if (kev.key === "Escape") {
    toggleStash(e, false);
    return true;
  }
  if ((kev.key === "ArrowDown" || kev.key === "ArrowUp") && entries.length) {
    e.stashAt = ((e.stashAt || 0) + (kev.key === "ArrowDown" ? 1 : -1) + entries.length) % entries.length;
    paintComposer(e);
    return true;
  }
  if (kev.key === "Enter" && !kev.shiftKey && entries.length) {
    restoreStash(e, entries[Math.min(entries.length - 1, e.stashAt || 0)].id);
    return true;
  }
  if (kev.key === "Backspace" && (kev.metaKey || kev.ctrlKey) && entries.length) {
    takeStash(entries[Math.min(entries.length - 1, e.stashAt || 0)].id);
    e.stashAt = 0;
    paintComposer(e);
    return true;
  }
  return false;
}

onComposerMode({ paint: (e) => paintDrawer(e) });

export { addDrawerBanner, onDrawerAct, paintDrawer, stashBox, stashMenuKeys, toggleStash };
