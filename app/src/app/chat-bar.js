import { activeItems } from "./blocks.js";
import { esc, phrase, st } from "./core.js";
import { goTo } from "./focus-navigation.js";
import { keyHint } from "./leader-key.js";
import { lucide } from "./lucide.js";

const withKey = (said, action) => (keyHint(action) ? `${said} (${keyHint(action)})` : said);
import { sidePanelToggleHtml, toggleSidePanel } from "./side-panel.js";

const TRAIL_MAX = 50;

const trail = { keys: [], at: -1, stepping: false };

const extras = [];

const seatAlive = (name) => (st.data?.sessions || []).some((one) => one.name === name);

function noteVisit(name) {
  if (!name) return;
  if (trail.stepping || trail.keys[trail.at] === name) { trail.stepping = false; return; }
  trail.keys = [...trail.keys.slice(0, trail.at + 1), name].slice(-TRAIL_MAX);
  trail.at = trail.keys.length - 1;
}

function trailTarget(d) {
  for (let at = trail.at + d; at >= 0 && at < trail.keys.length; at += d) if (seatAlive(trail.keys[at]) && trail.keys[at] !== trail.keys[trail.at]) return at;
  return -1;
}

const canStep = (d) => trailTarget(d) >= 0;

function stepVisit(d) {
  const at = trailTarget(d);
  if (at < 0) return false;
  trail.at = at;
  trail.stepping = true;
  goTo(trail.keys[at]);
  return true;
}

const readerName = () => st.open || activeItems()[st.focus]?.key || "";

function chatAction(action) {
  const name = readerName();
  if (!name) return false;
  for (const one of extras) if (one.key?.(action, name) === true) return true;
  return false;
}

function registerChatControl(control) {
  extras.push(control);
  extras.sort((a, b) => (a.order || 50) - (b.order || 50));
}

function controlsHtml(name) {
  const own = extras.map((one) => one.html(name)).filter(Boolean).join("");
  return `<span class="chat-ctl" data-name="${esc(name)}">${own}${sidePanelToggleHtml(name)}</span>`;
}

function trailHtml() {
  const back = withKey(phrase("Go back"), "back");
  const forward = withKey(phrase("Go forward"), "forward");
  return `<span class="chat-trail"><button type="button" class="cb-btn" data-act="trail-back" aria-label="${esc(phrase("Go back"))}" title="${esc(back)}"${canStep(-1) ? "" : " disabled"}>${lucide("arrowLeft")}</button><button type="button" class="cb-btn" data-act="trail-forward" aria-label="${esc(phrase("Go forward"))}" title="${esc(forward)}"${canStep(1) ? "" : " disabled"}>${lucide("arrowRight")}</button></span>`;
}

function chatBarHtml(name) {
  return `${trailHtml()}<span class="cb-fill"></span>${controlsHtml(name)}`;
}

function paintChatBarOfChat(el, s) {
  const well = el.querySelector(":scope > .well");
  if (!well) return;
  const on = !!s.structured && st.open === s.name;
  let bar = well.querySelector(":scope > .chat-bar");
  well.classList.toggle("barred", on);
  if (!on) { bar?.remove(); return; }
  noteVisit(s.name);
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "chat-bar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", phrase("Chat controls"));
    well.prepend(bar);
  }
  const html = chatBarHtml(s.name);
  if (bar.dataset.h === html) return;
  const held = bar.contains(document.activeElement) ? document.activeElement.dataset.act : "";
  bar.innerHTML = html;
  bar.dataset.h = html;
  if (held) bar.querySelector(`[data-act="${CSS.escape(held)}"]:not(:disabled)`)?.focus({ preventScroll: true });
}

function chatControlAct(act, name, hit) {
  if (act === "trail-back") return stepVisit(-1);
  if (act === "trail-forward") return stepVisit(1);
  if (act === "side-panel") return toggleSidePanel(name);
  for (const one of extras) if (one.act?.(act, name, hit) === true) return true;
  return false;
}

document.addEventListener("click", (event) => {
  const hit = event.target.closest?.(".chat-bar [data-act], .chat-ctl [data-act]");
  if (!hit || hit.disabled) return;
  const name = hit.closest(".chat-ctl")?.dataset.name || hit.closest(".tile")?.dataset.name || readerName();
  if (!name) return;
  event.preventDefault();
  event.stopPropagation();
  chatControlAct(hit.dataset.act, name, hit);
}, true);

export { canStep, chatAction, chatBarHtml, chatControlAct, noteVisit, paintChatBarOfChat, registerChatControl, stepVisit };
