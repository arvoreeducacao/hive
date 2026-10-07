import { $, phrase, solidMounts, st } from "./core.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { shortDir } from "./history.js";
import { archKey, reviveArchived, reviving } from "./mirror.js";
import { ago } from "./pod.js";
import { markUp } from "/assets/archive-search.mjs";

let archivedSolid = null;

solidMounts.push((hive) => {
  archivedSolid = hive.mountArchived($("arch-list"));
});

function archivedOnScreen() {
  return $("archived").classList.contains("on");
}

function archivedMatches(entry, asked) {
  if (!asked) return true;
  const said = [entry.title, entry.name, entry.cwd, entry.model, entry.why].filter(Boolean).join("\n").toLowerCase();
  return asked.toLowerCase().split(/\s+/).every((word) => said.includes(word));
}

function archivedViewModel() {
  const all = st.data.archived || [];
  const asked = $("arch-search").value.trim();
  const found = all.filter((entry) => archivedMatches(entry, asked));
  const count = asked
    ? phrase("{n} of {total}", { n: found.length, total: all.length })
    : phrase("{n} archived", { n: all.length });
  if (!found.length) {
    return { count, hint: all.length ? phrase("nothing matches") : phrase("no archived chats — archiving a chat frees its slot and parks it here"), rows: [] };
  }
  return {
    count, hint: "",
    rows: found.map((entry) => {
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
        when, busy,
        reviveSay: busy ? phrase("coming back…") : phrase("revive")
      };
    })
  };
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
