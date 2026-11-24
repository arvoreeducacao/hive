import { esc, phrase, st } from "./core.js";
import { composerIcon } from "./composer-icons.js";
import { composerLive, onComposerMode } from "./composer-modes.js";

const folderName = (path) => String(path || "").split("/").filter(Boolean).pop() || "";

function placeOfSeat(seat) {
  const tree = Array.isArray(seat?.trees) ? seat.trees.find((one) => one?.repo) : null;
  if (!tree) return null;
  if (seat.where === "cloud") return { icon: "cloud", label: phrase("Cloud"), branch: tree.branch || "" };
  if (tree.main) return { icon: "folder", label: phrase("Local checkout"), branch: tree.branch || "" };
  return { icon: "worktree", label: folderName(tree.path) || phrase("Worktree"), title: tree.path || "", branch: tree.branch || "" };
}

function placeHtml(place) {
  if (!place) return "";
  const title = place.title ? ` title="${esc(place.title)}"` : "";
  const branch = place.branch ? `<span class="cp-place-branch" title="${esc(place.branch)}">${composerIcon("branch")}<span>${esc(place.branch)}</span></span>` : "";
  return `<span class="cp-place-where"${title}>${composerIcon(place.icon)}<span>${esc(place.label)}</span></span><span class="cp-place-fill"></span>${branch}`;
}

function paintPlaceHtml(strip, html) {
  if (!strip || strip.dataset.h === html) return;
  strip.dataset.h = html;
  strip.innerHTML = html;
}

onComposerMode({
  paint(e) {
    if (!composerLive(e)) return;
    const seat = (st.data?.sessions || []).find((one) => one.name === e.name);
    paintPlaceHtml(e.host.querySelector(":scope > .cp-place"), placeHtml(placeOfSeat(seat)));
  }
});

export { placeOfSeat };
