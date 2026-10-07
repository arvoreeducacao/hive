import { render } from "./arrange.js";
import { activeItems, stripItems } from "./blocks.js";
import { $, phrase, st } from "./core.js";
import { focusSeat, takeKeyboard } from "./focus-navigation.js";
import { tiles } from "./leader-key.js";
import { calmly } from "./pure-helpers.js";

let followed = { block: "", key: "" };

const wholeInView = (el, box) => {
  const r = el.getBoundingClientRect();
  return r.left >= box.left - 1 && r.right <= box.right + 1;
};

function followInStrip(canvas) {
  const block = st.blocks[st.block]?.id || "";
  const key = activeItems()[st.focus]?.key || "";
  if (block === followed.block && key === followed.key) return;
  const jumped = block !== followed.block;
  followed = { block, key };
  const el = tiles.get(key);
  if (!el?.isConnected || el.parentElement !== canvas) return;
  if (wholeInView(el, canvas.getBoundingClientRect())) return;
  el.scrollIntoView({ block: "nearest", inline: jumped ? "start" : "nearest", behavior: calmly() ? "auto" : "smooth" });
}

function forgetFollow() {
  followed = { block: "", key: "" };
}

function stepAcrossLanes(dx) {
  const flat = stripItems();
  const at = flat.findIndex((one) => one.here && one.at === st.focus);
  const next = at < 0 ? null : flat[at + dx];
  if (!next) return false;
  focusSeat(next.it.key);
  if (st.moveMode === "type" && next.it.kind === "session") takeKeyboard(next.it.key);
  return true;
}

const edges = { left: null, right: null };

function edgeButton(side) {
  if (edges[side]) return edges[side];
  const btn = document.createElement("button");
  btn.className = `strip-edge ${side}`;
  btn.type = "button";
  btn.hidden = true;
  btn.addEventListener("click", () => {
    const key = btn.dataset.key;
    const el = key && tiles.get(key);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: calmly() ? "auto" : "smooth" });
    if (focusSeat(key)) render();
  });
  document.body.appendChild(btn);
  edges[side] = btn;
  return btn;
}

function hideEdges() {
  for (const btn of Object.values(edges)) if (btn) btn.hidden = true;
}

function paintStripEdges() {
  const canvas = $("canvas");
  if (!canvas || canvas.hidden || !canvas.classList.contains("strip")) return hideEdges();
  const box = canvas.getBoundingClientRect();
  const away = { left: [], right: [] };
  for (const el of canvas.children) {
    if (!el.dataset.key || el.dataset.state !== "needs" || el.dataset.gone) continue;
    const r = el.getBoundingClientRect();
    if (r.right <= box.left + 24) away.left.push(el);
    else if (r.left >= box.right - 24) away.right.push(el);
  }
  const mid = `${Math.round(box.top + box.height / 2)}px`;
  for (const side of ["left", "right"]) {
    const btn = edgeButton(side);
    const list = away[side];
    btn.hidden = !list.length;
    if (!list.length) continue;
    const nearest = side === "left" ? list[list.length - 1] : list[0];
    const said = phrase("{n} waiting for you", { n: list.length });
    btn.textContent = side === "left" ? `← ${said}` : `${said} →`;
    btn.title = said;
    btn.dataset.key = nearest.dataset.key;
    btn.style.top = mid;
    btn.style.left = side === "left" ? `${Math.round(box.left + 12)}px` : "";
    btn.style.right = side === "right" ? `${Math.round(window.innerWidth - box.right + 12)}px` : "";
  }
}

let scrollFrame = 0;

function watchStripScroll(canvas) {
  if (canvas.dataset.stripWatched) return;
  canvas.dataset.stripWatched = "1";
  const later = () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; paintStripEdges(); });
  };
  canvas.addEventListener("scroll", later, { passive: true });
  window.addEventListener("resize", later);
}

export { followInStrip, forgetFollow, paintStripEdges, stepAcrossLanes, watchStripScroll };
