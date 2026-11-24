import { $, phrase, solidMounts, st } from "./core.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { shortDir } from "./history.js";
import { archKey, reviveArchived, reviving } from "./mirror.js";
import { ago } from "./pod.js";
import { askToErase } from "./seat-marks-menu.js";
import { markUp, rankSessions } from "/assets/archive-search.mjs";

let archivedSolid = null;

const picked = new Set();

const projectOf = (entry) => {
  const cwd = String(entry.cwd || "").replace(/\/+$/, "");
  if (!cwd || cwd === st.data?.hub) return phrase("no project");
  return cwd.split("/").pop();
};

solidMounts.push((hive) => {
  archivedSolid = hive.mountArchived($("arch-list"));
});

function archivedOnScreen() {
  return $("archived").classList.contains("on");
}

function archivedFound(all, asked) {
  const searchable = all.map((entry) => ({ entry, title: entry.title || entry.name, seat: entry.name, cwd: entry.cwd, prompt: [entry.model, entry.why].filter(Boolean).join(" ") }));
  return rankSessions(searchable, asked).map((one) => one.session.entry);
}

function archivedViewModel() {
  const all = st.data.archived || [];
  const asked = $("arch-search").value.trim();
  const found = archivedFound(all, asked);
  const count = asked
    ? phrase("{n} of {total}", { n: found.length, total: all.length })
    : phrase("{n} archived", { n: all.length });
  for (const key of [...picked]) if (!all.some((entry) => archKey(entry) === key)) picked.delete(key);
  if (!found.length) {
    return { count, hint: all.length ? phrase("nothing matches") : phrase("no archived chats — archiving a chat frees its slot and parks it here"), bar: null, groups: [] };
  }
  const rows = found.map((entry) => {
      const busy = reviving.has(archKey(entry));
      const agent = entry.agent && entry.agent !== "claude" ? String(entry.agent) : "";
      const when = ago(new Date(entry.archivedAt).toISOString());
      return {
        key: archKey(entry), name: entry.name, where: entry.where === "cloud" ? "cloud" : "local",
        whereSay: entry.where === "cloud" ? "cloud" : "local",
        agentSay: agent,
        title: markUp(entry.title || entry.name, asked),
        sub: markUp([entry.title && entry.title !== entry.name ? entry.name : "", entry.model, shortDir(entry.cwd), entry.why].filter(Boolean).join(" · "), asked),
        hint: `${entry.title || entry.name} — ${phrase("archived {when}", { when })}`,
        when, busy, picked: picked.has(archKey(entry)), project: projectOf(entry),
        pickSay: phrase("pick {title}", { title: entry.title || entry.name }),
        reviveSay: busy ? phrase("coming back…") : phrase("revive"),
        eraseSay: phrase("delete"), eraseHint: phrase("delete for good")
      };
    });
  const groups = [];
  for (const row of rows) {
    const group = groups.find((one) => one.key === row.project) || groups[groups.push({ key: row.project, label: row.project, rows: [] }) - 1];
    group.rows.push(row);
  }
  const bar = picked.size ? { say: phrase("{n} picked", { n: picked.size }), eraseSay: phrase("delete {n} for good", { n: picked.size }), clearSay: phrase("clear") } : null;
  return { count, hint: "", bar, groups };
}

function renderArchived() {
  if (!archivedSolid) return;
  const model = archivedViewModel();
  $("arch-count").textContent = model.count;
  archivedSolid.show(model);
}

function openArchived() {
  releaseKeyboard();
  $("archived").classList.add("on");
  $("arch-search").value = "";
  $("arch-search").focus();
  renderArchived();
}

function closeArchived() {
  $("archived").classList.remove("on");
  picked.clear();
}

const entryOf = (key) => (st.data.archived || []).find((entry) => archKey(entry) === key);

async function eraseArchived(keys) {
  const list = keys.map(entryOf).filter(Boolean).map((entry) => ({ name: entry.name, where: entry.where === "cloud" ? "cloud" : "local", title: entry.title || entry.name }));
  const done = await askToErase(list);
  if (done) for (const key of keys) picked.delete(key);
  renderArchived();
}

async function reviveFromArchived(name, where) {
  const revived = reviveArchived(name, where);
  renderArchived();
  await revived;
  const still = (st.data.archived || []).some((entry) => entry.name === name && entry.where === where);
  if (still) return renderArchived();
  closeArchived();
}

$("arch-list").addEventListener("click", (e) => {
  const pick = e.target.closest(".hist-pick[data-pick]");
  if (pick) {
    if (pick.checked) picked.add(pick.dataset.pick);
    else picked.delete(pick.dataset.pick);
    return renderArchived();
  }
  if (e.target.closest("[data-pick-none]")) {
    picked.clear();
    return renderArchived();
  }
  if (e.target.closest("[data-erase-picked]")) return void eraseArchived([...picked]);
  const erase = e.target.closest(".hist-erase[data-erase]");
  if (erase && !erase.disabled) return void eraseArchived([`${erase.dataset.where === "cloud" ? "cloud" : "local"}:${erase.dataset.erase}`]);
  const btn = e.target.closest(".hist-revive[data-arch]");
  if (!btn || btn.disabled) return;
  reviveFromArchived(btn.dataset.arch, btn.dataset.where);
});

$("arch-search").addEventListener("input", renderArchived);

$("arch-search").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const first = $("arch-list").querySelector(".hist-revive[data-arch]:not(:disabled)");
  if (!first) return;
  e.preventDefault();
  first.click();
});

$("rail-sessions").addEventListener("click", (e) => {
  if (e.target.closest("[data-arch-all]")) openArchived();
});

$("arch-ok").addEventListener("click", closeArchived);

$("archived").addEventListener("click", (e) => { if (e.target === $("archived")) closeArchived(); });

export { archivedOnScreen, archivedViewModel, closeArchived, openArchived, renderArchived };
