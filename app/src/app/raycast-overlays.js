import { $, paintStatic, raycastOn } from "./core.js";
import { closePalActs } from "./palette.js";
import { forgetPalActs } from "./seat-menu.js";

const undo = [];

let dressed = false;

function make(html) {
  const holder = document.createElement("template");
  holder.innerHTML = html.trim();
  return holder.content.firstElementChild;
}

function put(node, where, ref) {
  if (!ref) return null;
  if (where === "before") ref.before(node);
  else if (where === "after") ref.after(node);
  else if (where === "into") ref.appendChild(node);
  else if (where === "first") ref.prepend(node);
  undo.push(() => node.remove());
  return node;
}

function move(node, where, ref) {
  if (!node || !ref) return;
  const parent = node.parentNode;
  const next = node.nextSibling;
  if (where === "before") ref.before(node);
  else if (where === "after") ref.after(node);
  else ref.appendChild(node);
  undo.push(() => parent.insertBefore(node, next && next.parentNode === parent ? next : null));
}

function stash(node) {
  if (!node?.parentNode) return;
  const parent = node.parentNode;
  const next = node.nextSibling;
  node.remove();
  undo.push(() => parent.insertBefore(node, next && next.parentNode === parent ? next : null));
}

function attr(el, name, value) {
  if (!el) return;
  const had = el.hasAttribute(name);
  const was = el.getAttribute(name);
  el.setAttribute(name, value);
  undo.push(() => (had ? el.setAttribute(name, was) : el.removeAttribute(name)));
}

function swapClass(el, from, to) {
  if (!el) return;
  const was = el.className;
  el.className = [...el.classList].filter((one) => one !== from).concat(to ? [to] : []).join(" ");
  undo.push(() => { el.className = was; });
}

function textOf(el) {
  return [...(el?.childNodes || [])].find((node) => node.nodeType === 3 && node.nodeValue.trim());
}

function dressConfirm() {
  const box = $("confirm")?.querySelector(".box");
  if (!box) return;
  attr(box, "role", "alertdialog");
  attr(box, "aria-modal", "true");
  attr(box, "aria-labelledby", "c-title");
  const head = put(make('<div class="c-head"><button type="button" class="c-x" id="c-x" aria-label="cancel"><svg aria-hidden="true"><use href="#i-x"/></svg></button></div>'), "before", $("c-title"));
  head.querySelector(".c-x").addEventListener("click", () => $("c-no").click());
  move($("c-title"), "into", head);
  const no = $("c-no");
  const yes = $("c-yes");
  const wrap = no.parentElement;
  move(no, "before", yes);
  if (wrap?.tagName === "SPAN" && !wrap.childNodes.length) stash(wrap);
  swapClass(no, "ghost", "c-btn");
  swapClass(yes, "btn", "c-btn");
  swapClass(yes, "", "primary");
  attr(no, "type", "button");
  attr(yes, "type", "button");
  stash(textOf(no));
  put(make("<span>cancel</span>"), "into", no);
  put(make('<span class="rc-key">esc</span>'), "into", no);
}

function dressNudge() {
  const kind = $("nudge")?.querySelector(".nd-kind > span");
  if (!kind) return;
  put(make('<span id="nudge-kind">keyboard request</span>'), "after", kind);
  stash(kind);
  put(make('<i class="rc-dot needs" aria-hidden="true"></i>'), "after", $("nudge-kind"));
  move($("nudge-what"), "after", $("nudge-asked"));
  move($("nudge-no"), "before", $("nudge-yes"));
}

function dressPalette() {
  const scope = $("pal-scope");
  if (!scope) return;
  attr(scope, "role", "button");
  attr(scope, "tabindex", "0");
  attr(scope, "title", "what the search looks through — files, code or everything");
  attr($("pal-prev"), "aria-hidden", "false");
  undo.push(() => { closePalActs(); $("pal-acts")?.remove(); forgetPalActs(); });
}

function dressNotices() {
  undo.push(() => { for (const card of document.querySelectorAll("#canopyNotices .cn-seat-card")) card.remove(); });
}

function dress() {
  if (dressed) return;
  dressed = true;
  dressConfirm();
  dressNudge();
  dressPalette();
  dressNotices();
  paintStatic(document);
}

function undress() {
  if (!dressed) return;
  dressed = false;
  while (undo.length) undo.pop()();
}

function settleOverlays() {
  if (raycastOn()) dress();
  else undress();
}

document.addEventListener("hive:experience", settleOverlays);

settleOverlays();

export { settleOverlays };
