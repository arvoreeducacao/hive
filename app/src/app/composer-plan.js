import { wireLinks } from "./chat-and-panes.js";
import { esc, phrase, renderMarkdown } from "./core.js";
import { composerIcon } from "./composer-icons.js";
import { composerLive, paintComposer } from "./composer-modes.js";
import { openDraft } from "./draft-seat.js";
import { toClipboard } from "./terminal-history.js";

const PLAN_PROMPT = "PLEASE IMPLEMENT THIS PLAN:\n";

const PLAN_FOLD_CHARS = 900;

const PLAN_FOLD_LINES = 20;

const PLAN_PREVIEW_LINES = 10;

const HEADING = /^\s{0,3}#{1,6}\s+(.+)$/;

function planTitle(plan) {
  const heading = String(plan || "").match(/^\s{0,3}#{1,6}\s+(.+)$/m)?.[1]?.trim();
  return heading || null;
}

function displayedPlan(plan) {
  const lines = String(plan || "").trimEnd().split(/\r?\n/);
  const rest = lines[0] && HEADING.test(lines[0]) ? lines.slice(1) : [...lines];
  while (rest[0]?.trim() === "") rest.shift();
  if (rest[0]?.match(HEADING)?.[1]?.trim().toLowerCase() === "summary") {
    rest.shift();
    while (rest[0]?.trim() === "") rest.shift();
  }
  return rest.join("\n");
}

function planPreview(plan, maxLines = PLAN_PREVIEW_LINES) {
  const lines = displayedPlan(plan).trimEnd().split(/\r?\n/).map((line) => line.trimEnd());
  const kept = [];
  let seen = 0;
  let more = false;
  for (const line of lines) {
    const visible = line.trim().length > 0;
    if (visible && seen >= maxLines) { more = true; break; }
    kept.push(line);
    if (visible) seen++;
  }
  while (kept.length && !kept.at(-1).trim()) kept.pop();
  if (!kept.length) return planTitle(plan) || phrase("Plan preview unavailable.");
  if (more) kept.push("", "...");
  return kept.join("\n");
}

const planFolds = (plan) => String(plan || "").length > PLAN_FOLD_CHARS || String(plan || "").split("\n").length > PLAN_FOLD_LINES;

function planFileName(plan) {
  const stem = String(planTitle(plan) || "plan").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[`'".,!?()[\]{}]+/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${stem || "plan"}.md`;
}

const planPrompt = (plan) => `${PLAN_PROMPT}${String(plan || "").trim()}`;

function downloadPlan(name, contents) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function closeOnOutside(holder, pop) {
  document.addEventListener("pointerdown", (out) => { if (!holder.contains(out.target)) pop.hidden = true; }, { once: true, capture: true });
}

function savePlanDialog(e, card, name, contents) {
  card.querySelector(":scope > .cp-plan-save")?.remove();
  const box = document.createElement("form");
  box.className = "cp-plan-save";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", phrase("Save plan to workspace"));
  box.innerHTML = `<b class="cp-plan-save-h">${esc(phrase("Save plan to workspace"))}</b>`
    + `<label class="cp-plan-save-l"><span>${esc(phrase("File path"))}</span><input type="text" spellcheck="false" autocomplete="off"></label>`
    + `<p class="cp-plan-save-err" hidden></p>`
    + `<div class="cp-plan-save-acts"><button type="button" class="cp-btn" data-act="cancel">${esc(phrase("Cancel"))}</button><button type="submit" class="cp-btn cp-btn-pri">${esc(phrase("Save"))}</button></div>`;
  const input = box.querySelector("input");
  input.value = name;
  const err = box.querySelector(".cp-plan-save-err");
  const close = () => box.remove();
  box.querySelector('[data-act="cancel"]').addEventListener("click", close);
  input.addEventListener("keydown", (kev) => {
    kev.stopPropagation();
    if (kev.key === "Escape") { kev.preventDefault(); close(); }
  });
  box.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const go = box.querySelector('button[type="submit"]');
    go.disabled = true;
    const r = await fetch("/api/seat/plan-file", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: e.name, where: e.where, path: input.value.trim(), text: contents })
    }).then((x) => x.json()).catch((wrong) => ({ error: wrong.message }));
    go.disabled = false;
    if (!r?.ok) {
      err.hidden = false;
      err.textContent = r?.error || phrase("Could not save plan");
      return;
    }
    close();
    e.box?.warn?.(phrase("Plan saved to workspace"), "sv-meta");
  });
  card.append(box);
  input.focus();
  input.setSelectionRange(0, Math.max(0, input.value.length - 3));
}

function dressPlanCard(e, card, plan, prose) {
  const head = card.querySelector(".ph");
  if (!head || head.querySelector(".cp-plan-title")) return;
  const title = planTitle(prose) || phrase("Proposed plan");
  const badge = document.createElement("span");
  badge.className = "cp-plan-badge";
  badge.textContent = phrase("Plan");
  const name = document.createElement("h3");
  name.className = "cp-plan-title";
  name.textContent = title;
  const menu = document.createElement("span");
  menu.className = "cp-plan-menu";
  menu.innerHTML = `<button type="button" class="cp-plan-dots" aria-label="${esc(phrase("Plan actions"))}" aria-haspopup="menu">${composerIcon("ellipsis")}</button>`
    + `<span class="cp-plan-pop" role="menu" hidden><button type="button" role="menuitem" data-act="copy">${esc(phrase("Copy to clipboard"))}</button><button type="button" role="menuitem" data-act="download">${esc(phrase("Download as markdown"))}</button><button type="button" role="menuitem" data-act="save">${esc(phrase("Save to workspace"))}</button></span>`;
  const pop = menu.querySelector(".cp-plan-pop");
  const saved = `${String(plan || "").trimEnd()}\n`;
  menu.querySelector(".cp-plan-dots").addEventListener("click", (ev) => {
    ev.stopPropagation();
    pop.hidden = !pop.hidden;
    if (!pop.hidden) closeOnOutside(menu, pop);
  });
  pop.addEventListener("click", async (ev) => {
    const button = ev.target.closest("[data-act]");
    const act = button?.dataset.act;
    if (act === "copy") {
      if (await toClipboard(saved)) {
        button.textContent = phrase("Copied!");
        setTimeout(() => { button.textContent = phrase("Copy to clipboard"); pop.hidden = true; }, 900);
      }
      return;
    }
    pop.hidden = true;
    if (act === "download") downloadPlan(planFileName(prose), saved);
    if (act === "save") savePlanDialog(e, card, `plans/${planFileName(prose)}`, saved);
  });
  head.prepend(badge, name);
  head.append(menu);
  card.classList.add("cp-plan");
  if (!planFolds(prose)) return;
  const body = card.querySelector(".pb");
  if (!body) return;
  const preview = document.createElement("div");
  preview.className = "cp-plan-preview md";
  preview.innerHTML = renderMarkdown(planPreview(prose));
  wireLinks(e.name, preview);
  const more = document.createElement("div");
  more.className = "cp-plan-more";
  more.innerHTML = `<span class="cp-plan-fade" aria-hidden="true"></span><button type="button" class="cp-plan-toggle"></button>`;
  const toggle = more.querySelector(".cp-plan-toggle");
  const paint = () => {
    const open = card.classList.contains("cp-plan-open");
    toggle.textContent = open ? phrase("Collapse plan") : phrase("Expand plan");
    toggle.setAttribute("aria-expanded", String(open));
  };
  card.classList.add("cp-plan-folds");
  toggle.addEventListener("click", () => { card.classList.toggle("cp-plan-open"); paint(); });
  paint();
  body.after(preview, more);
}

function notePlan(e, ev, card) {
  e.planAsk = { id: ev.id, plan: String(ev.plan || ""), card, sending: false };
  if (composerLive(e)) card?.classList.add("cp-plan-held");
  paintComposer(e);
}

function forgetPlan(e, id) {
  if (!e.planAsk || e.planAsk.id !== id) return;
  e.planAsk.card?.classList.remove("cp-plan-held");
  e.planAsk = null;
  paintComposer(e);
}

function implementPlan(e) {
  const held = e.planAsk;
  const go = held?.card?.querySelector(".pf .btn.pri");
  if (!go || go.disabled || held.sending) return;
  held.sending = true;
  paintComposer(e);
  go.click();
  setTimeout(() => {
    if (e.planAsk !== held) return;
    held.sending = !!go.disabled;
    paintComposer(e);
  }, 1500);
}

function implementInNewChat(e) {
  const held = e.planAsk;
  if (held) openDraft(planPrompt(held.plan));
}

function planBanner(e) {
  const title = planTitle(e.planAsk.plan);
  return `<section class="cp-ban"><div class="cp-brow"><span class="cp-bi"></span><span class="cp-bc"><span class="cp-bstrong">${esc(phrase("Plan ready"))}</span>${title ? `<span class="cp-btitle">${esc(title)}</span>` : ""}</span></div></section>`;
}

export { PLAN_PROMPT, displayedPlan, dressPlanCard, forgetPlan, implementInNewChat, implementPlan, notePlan, planBanner, planFileName, planFolds, planPreview, planPrompt, planTitle };
