import { attachSeat, soloSeat } from "./blocks.js";
import { $, esc, every, phrase, solidMounts } from "./core.js";
import { pullThreads } from "./prs.js";
import { calmly } from "./pure-helpers.js";
import { NOTE_GROUP, NOTE_TAG, closeRelnotes, plural, releasesUrl, versionOf } from "./tour.js";

function combCells() {
  const g = $("wn-comb");
  if (!g || g.childElementCount) return;
  const r = 13, across = 0.866 * r, down = 1.5 * r;
  const spots = [[0, 0, "core"], [2 * across, 0, ""], [across, down, ""], [-across, down, ""], [-2 * across, 0, ""], [-across, -down, ""], [across, -down, ""]];
  spots.forEach(([dx, dy, cls], i) => {
    const cx = 50 + dx, cy = 50 + dy;
    const points = [[cx, cy - r], [cx + across, cy - r / 2], [cx + across, cy + r / 2], [cx, cy + r], [cx - across, cy + r / 2], [cx - across, cy - r / 2]];
    const cell = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    cell.setAttribute("points", points.map((p) => p.map((n) => n.toFixed(2)).join(",")).join(" "));
    cell.setAttribute("class", `hx ${cls}`);
    cell.style.animationDelay = `${i * 140}ms`;
    g.appendChild(cell);
  });
}

function countUp(el, total) {
  if (calmly()) { el.textContent = String(total); return; }
  const started = performance.now();
  const step = (now) => {
    const share = Math.min(1, (now - started) / 760);
    el.textContent = String(Math.round(total * (1 - Math.pow(1 - share, 3))));
    if (share < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function paintWhatsNew(d) {
  const said = whatsNewViewModel(d);
  combCells();
  $("wn-headline").textContent = said.headline;
  $("wn-chip").innerHTML = said.chip;
  $("wn-quiet").innerHTML = said.quiet;
  $("wn-says").innerHTML = said.says;
  $("wn-lead").hidden = !said.lead;
  if (said.lead) {
    $("wn-lead-tag").textContent = said.lead.tag;
    $("wn-lead-title").textContent = said.lead.title;
    $("wn-lead-body").textContent = said.lead.body;
    $("wn-lead-pr").hidden = !said.lead.pr;
    if (said.lead.pr) $("wn-lead-pr").querySelector("span").textContent = said.lead.pr;
  }
  whatsNewSolid.show({ groups: said.groups });
}

let whatsNewSolid = null;

function whatsNewViewModel(d) {
  const notes = d.notes || [];
  const lead = notes.find((note) => note.kind === "new") || notes[0];
  const rest = notes.filter((note) => note !== lead);
  const where = releasesUrl();
  const link = where ? `<a href="${esc(where)}/tag/${encodeURIComponent(d.tag)}" target="_blank" rel="noreferrer">${phrase("See the whole release ↗")}</a>` : "";
  return {
    headline: phrase(notes.length === 1 ? "change landed while you were working" : "changes landed while you were working"),
    chip: d.from
      ? `<s>${esc(versionOf(d.from, d.fromNumber))}</s><em>→</em>${esc(versionOf(d.tag, d.number))}`
      : esc(versionOf(d.tag, d.number)),
    quiet: d.quiet
      ? `${phrase("{what} stayed out of this list.", { what: plural(d.quiet, phrase("housekeeping commit")) })}<br />${link}`
      : link,
    says: `Hive <b>${esc(versionOf(d.tag, d.number))}</b>`,
    lead: lead ? {
      tag: NOTE_TAG[lead.kind] || phrase("change"),
      title: lead.text,
      body: d.releases > 1
        ? phrase("It came in with {what} that went out while this app was on {version}.", { what: plural(d.releases, phrase("build")), version: versionOf(d.from, d.fromNumber) || phrase("an older build") })
        : phrase("It came out of CI and landed here without a rebuild on your machine."),
      pr: lead.pr || ""
    } : null,
    groups: NOTE_GROUP.map(([kind, said]) => {
      const items = rest.filter((note) => (note.kind || "") === kind);
      return items.length ? {
        key: kind, label: phrase(said), count: items.length,
        items: items.map((note, at) => ({ key: `${at}:${note.text}`, text: note.text, pr: note.pr || "", delay: `${420 + at * 55}ms` }))
      } : null;
    }).filter(Boolean)
  };
}

solidMounts.push((hive) => {
  const groups = $("wn-groups");
  if (groups) whatsNewSolid = hive.mountWhatsNewGroups(groups);
});

async function closeWhatsNew() {
  $("whatsnew").hidden = true;
  try { await fetch("/api/whatsnew/seen", { method: "POST" }); } catch {}
}

$("wn-go").addEventListener("click", closeWhatsNew);

$("wn-skip").addEventListener("click", closeWhatsNew);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("relnotes").hidden) { e.preventDefault(); e.stopPropagation(); return closeRelnotes(); }
  if ($("whatsnew").hidden) return;
  if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); closeWhatsNew(); }
}, true);

async function bootWhatsNew() {
  if (!$("welcome").hidden) return;
  try {
    const d = await (await fetch("/api/whatsnew")).json();
    if (!d || !d.ready || !(d.notes || []).length) return;
    paintWhatsNew(d);
    $("whatsnew").hidden = false;
    countUp($("wn-count"), d.notes.length);
  } catch {}
}

function bootSolo() {
  if (!soloSeat) {
    window.hiveSeatWindow?.onBack((name) => attachSeat(name));
    return;
  }
  document.documentElement.classList.add("solo");
  document.title = soloSeat;
  const mark = document.createElement("span");
  mark.className = "seat-of";
  mark.textContent = soloSeat;
  mark.title = phrase("drag this seat out of the window to put it back in the grid");
  document.querySelector(".brand")?.appendChild(mark);
}

bootSolo();

every("threads", 45000, () => pullThreads(false));

export { bootSolo, bootWhatsNew, closeWhatsNew, combCells, countUp, paintWhatsNew, whatsNewSolid, whatsNewViewModel };
