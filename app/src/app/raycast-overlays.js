import { $, paintStatic, phrase, raycastOn } from "./core.js";
import { closePalActs } from "./palette.js";
import { forgetPalActs } from "./seat-menu.js";
import { paintNewChatForm } from "./new-chat.js";

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

const FORM_ROWS = [
  { label: "where it runs", body: ["n-where", '<span class="nf-seg" data-seg="n-where" role="group" aria-label="where it runs"></span>'] },
  { label: "repo and branch", cloud: true, body: ["n-repo", "n-branch"] },
  { label: "agent", body: ['<select id="n-agent" aria-label="agent" title="the agent that sits in the chat"></select>', '<span class="nf-seg" data-seg="n-face" role="group" aria-label="chat or terminal"></span>', "n-kind"] },
  { label: "model", body: ["n-model", "n-account"] },
  { label: "how many", body: ["n-count", '<span class="nf-seg" data-seg="n-count" role="group" aria-label="how many chats"></span>', '<span class="nf-note">race: the same mission in separate worktrees</span>'] },
  { label: "name", body: ["n-name"] }
];

function dressComposer() {
  const controls = $("cmp-controls");
  const head = $("mission-head");
  if (!controls || !head) return;
  put(make('<span class="nf-ic" aria-hidden="true"><svg><use href="#i-bolt"/></svg></span>'), "first", head);
  const said = head.querySelector(":scope > span:not(.nf-ic)");
  if (said) stash(said);
  put(make('<span class="nf-at" id="mission-where" data-no-t></span>'), "before", $("mission-esc"));
  const esc = $("mission-esc");
  stash(textOf(esc));
  attr(esc, "aria-label", "close the box");
  put(make('<svg aria-hidden="true"><use href="#i-x"/></svg>'), "into", esc);
  put(make('<span class="nf-l nf-mission">mission</span>'), "first", $("composer").querySelector(".line"));
  const kept = [...controls.childNodes];
  undo.push(() => {
    for (const node of [...controls.childNodes]) node.remove();
    for (const node of kept) controls.appendChild(node);
  });
  const fresh = [make('<p class="nf-hint" id="nf-hint"><span>the mission names the chat</span><span class="rc-key">⇧</span><span class="rc-key">↵</span><span>breaks the line</span></p>')];
  for (const row of FORM_ROWS) {
    const box = make(`<div class="nf-row${row.cloud ? " nf-cloud" : ""}"><span class="nf-l">${row.label}</span><div class="nf-c"></div></div>`);
    const cell = box.querySelector(".nf-c");
    for (const one of row.body) cell.appendChild(one.startsWith("<") ? make(one) : $(one));
    fresh.push(box);
  }
  const foot = make('<div class="nf-foot"></div>');
  foot.append($("n-cloud-account"), make('<span class="nf-grow"></span>'), $("mission-go"), make('<button type="button" id="mission-cancel"><span>cancel</span> <span class="rc-key">esc</span></button>'), $("cmp-keys"));
  fresh.push(foot);
  for (const node of [...controls.childNodes]) node.remove();
  controls.append(...fresh);
  for (const value of ["3", "4"]) {
    const option = $("n-count").querySelector(`option[value="${value}"]`);
    attr(option, "data-short", value);
  }
  const go = $("mission-go");
  stash(textOf(go));
  put(make("<span>open chat</span>"), "into", go);
  put(make('<span class="rc-key">↵</span>'), "into", go);
}

function dress() {
  if (dressed) return;
  dressed = true;
  dressConfirm();
  dressNudge();
  dressPalette();
  dressNotices();
  dressComposer();
  paintStatic(document);
  attr($("n-name"), "placeholder", phrase("leave it empty and the AI names it from the mission"));
  paintNewChatForm();
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
