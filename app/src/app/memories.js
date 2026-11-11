import { $, phrase, renderMarkdown, screenOpens, solidMounts, st } from "./core.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { keyHint } from "./leader-key.js";

const ALL = "all";

const TABS = ["mine", "proposals", "team"];

const FILTERS = ["candidates", "personal", "none", ALL];

const SCOPES = ["team", "personal"];

const CLASSIFY_CHUNK = 120;

const fresh = () => ({
  tab: "mine",
  mine: null, project: ALL, filter: ALL, query: "", pick: "", detail: {}, chosen: [],
  classify: null, undo: null, notice: null, error: null, busy: "",
  proposals: null, pickPr: 0, prBusy: 0, prError: null,
  team: null, pickTeam: "", teamQuery: "", teamEdit: null, teamConfirm: "", teamBusy: ""
});

st.mem = fresh();

const memoriesOnScreen = () => !$("memories").hidden;

const folded = (text) => String(text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const scopeSay = (scope) => (scope === "team" ? phrase("Team") : scope === "personal" ? phrase("Personal") : phrase("no scope"));

const nextScope = (scope) => (scope === "team" ? "personal" : "team");

const isCandidate = (one) => one.scope === "team" && !one.proposed;

function inFilter(one, filter) {
  if (filter === "candidates") return isCandidate(one);
  if (filter === "personal") return one.scope === "personal";
  if (filter === "none") return !one.scope;
  return true;
}

function matches(one, query) {
  const words = folded(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = folded(`${one.title} ${one.name} ${one.description} ${one.hook} ${one.file} ${one.text || one.body || ""}`);
  return words.every((word) => hay.includes(word));
}

function shownMine(memories, { project = ALL, filter = ALL, query = "" } = {}) {
  return (memories || [])
    .filter((one) => project === ALL || one.project === project)
    .filter((one) => inFilter(one, filter))
    .filter((one) => matches(one, query))
    .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0) || a.name.localeCompare(b.name));
}

function filterCounts(memories, project = ALL) {
  const pool = (memories || []).filter((one) => project === ALL || one.project === project);
  return Object.fromEntries(FILTERS.map((key) => [key, pool.filter((one) => inFilter(one, key)).length]));
}

function proposalText(memories) {
  const list = memories || [];
  const title = list.length === 1
    ? phrase("Team memory: {name}", { name: list[0].title || list[0].name })
    : phrase("Team memory: {n} memories", { n: list.length });
  const lines = list.map((one) => `- **${String(one.title || one.name).replace(/\s+/g, " ").trim()}**: ${String(one.description || one.hook || "").replace(/\s+/g, " ").trim()}`);
  const body = [
    phrase("Proposed from the Hive memories panel. Each file enters .claude/team-memory with scope team, and its line goes into the team MEMORY.md."),
    "",
    ...lines,
    "",
    phrase("Someone other than the author approves it, in the Proposals tab of the memories panel or here.")
  ].join("\n");
  return { title, body };
}

function teamChangeText(kind, memory) {
  const name = memory?.name || "";
  return kind === "delete"
    ? { title: phrase("Team memory: remove {name}", { name }), body: phrase("Removes {file} from the team memory and its line from MEMORY.md. Opened from the Hive memories panel.", { file: memory?.file || "" }) }
    : { title: phrase("Team memory: edit {name}", { name }), body: phrase("Edits {file} in the team memory. Opened from the Hive memories panel.", { file: memory?.file || "" }) };
}

const PROBLEM_SAY = {
  secret: "{file} looks like it has a {what}",
  exists: "{file} already exists in the team memory",
  "file-name": "{file}: use only lowercase letters without accents, digits and hyphens in the name",
  "no-frontmatter": "{file} has no frontmatter between --- lines",
  name: "{file}: the name in the frontmatter must be {want}",
  "no-description": "{file} has no description",
  type: "{file}: the type must be user, feedback, project or reference",
  empty: "{file} has an empty body",
  unlisted: "{file} is not in the MEMORY.md index",
  dangling: "MEMORY.md points to {what}, which does not exist",
  "index-lines": "MEMORY.md would have {what} lines; Claude Code reads only the first 200",
  "index-bytes": "MEMORY.md would have {what} bytes; Claude Code reads only the first 25000"
};

const SECRET_SAY = { "AWS key": "AWS key", "GitHub token": "GitHub token", "Slack token": "Slack token", "API key": "API key", "private key": "private key", "user secret": "user secret" };

function problemSay(problem) {
  const pattern = PROBLEM_SAY[problem?.kind];
  if (!pattern) return phrase("{file} did not pass the check", { file: problem?.file || "" });
  return phrase(pattern, { file: problem.file || "", what: problem.kind === "secret" ? phrase(SECRET_SAY[problem.what] || "secret") : problem.what || "", want: problem.want || "" });
}

function downSay(said) {
  const state = said?.body?.state;
  if (state === "no-repo") return phrase("The Hive does not know the hub repository. Check that the hub has a GitHub remote, or set HIVE_TEAM_MEMORY_REPO in ~/.hive/config.");
  const why = String(said?.body?.why || "").trim();
  return why ? phrase("GitHub did not answer: {why}", { why }) : phrase("GitHub did not answer. Check that gh is signed in and try again.");
}

async function getJson(path) {
  try {
    const r = await fetch(path);
    let body = {};
    try { body = await r.json(); } catch {}
    return { ok: r.ok, status: r.status ?? 200, body: body || {} };
  } catch {
    return { ok: false, status: 0, body: {} };
  }
}

async function send(path, payload = {}) {
  try {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    let body = {};
    try { body = await r.json(); } catch {}
    return { ok: r.ok, status: r.status ?? 200, body: body || {} };
  } catch {
    return { ok: false, status: 0, body: { state: "down" } };
  }
}

const errorModel = (error) => (!error ? null : typeof error === "string" ? { head: error, lines: [] } : { head: error.head || "", lines: error.lines || [] });

const mineList = () => st.mem.mine?.memories || [];

const projectLabel = (id) => (st.mem.mine?.projects || []).find((one) => one.id === id)?.label || id;

function headModel() {
  return {
    title: phrase("Memories"),
    tabs: TABS.map((key) => ({ key, say: phrase({ mine: "Mine", proposals: "Proposals", team: "The team's" }[key]), on: st.mem.tab === key, n: key === "proposals" && st.mem.proposals?.proposals ? String(st.mem.proposals.proposals.length) : "" })),
    key: keyHint("memories"),
    closeSay: phrase("close")
  };
}

function rowOfMine(one) {
  return {
    key: one.id, id: one.id,
    name: one.title || one.name,
    description: one.description || one.hook || "",
    scope: one.scope || "none",
    scopeSay: scopeSay(one.scope),
    scopeHint: one.scope ? phrase("click to make it {scope}", { scope: scopeSay(nextScope(one.scope)) }) : phrase("click to mark it as team"),
    project: st.mem.project === ALL ? projectLabel(one.project) : "",
    proposed: one.proposed ? phrase("in PR #{n}", { n: one.proposed.number }) : "",
    proposedUrl: one.proposed?.url || "",
    chosen: st.mem.chosen.includes(one.id),
    canChoose: !one.proposed,
    here: one.id === st.mem.pick,
    busy: st.mem.busy === one.id
  };
}

function detailOfMine(one) {
  if (!one) return null;
  const full = st.mem.detail[one.id];
  const body = full?.body ?? "";
  return {
    key: one.id, id: one.id,
    title: one.title || one.name,
    crumb: [projectLabel(one.project), one.type, one.file].filter(Boolean).join(" · "),
    description: one.description,
    html: body ? renderMarkdown(body) : "",
    loading: !full,
    scope: one.scope || "none",
    scopes: SCOPES.map((key) => ({ key, say: scopeSay(key), on: one.scope === key })),
    scopeLabel: phrase("Scope"),
    proposed: one.proposed ? phrase("Proposed to the team in PR #{n}. When it is merged, this personal copy is deleted so the sessions do not read the same fact twice.", { n: one.proposed.number }) : "",
    proposedUrl: one.proposed?.url || "",
    canPropose: !one.proposed,
    busy: st.mem.busy === one.id || st.mem.busy === "propose",
    deleteSay: phrase("Delete"), proposeSay: phrase("Propose to the team"), openPrSay: phrase("open the PR ↗")
  };
}

function classifyModel() {
  const c = st.mem.classify;
  if (!c) return null;
  if (c.busy) return { busy: true, say: c.n > CLASSIFY_CHUNK ? phrase("Asking Claude for the scope of {n} memories… {done} done", { n: c.n, done: c.done || 0 }) : phrase("Asking Claude for the scope of {n} memories…", { n: c.n }), cancelSay: phrase("Cancel") };
  const byId = new Map(mineList().map((one) => [one.id, one]));
  const rows = c.verdicts.filter((one) => byId.has(one.id)).map((one) => ({
    key: one.id, id: one.id,
    name: byId.get(one.id).title || byId.get(one.id).name,
    description: byId.get(one.id).description,
    reason: one.reason,
    scope: one.scope, scopeSay: scopeSay(one.scope),
    keep: one.keep
  }));
  const kept = rows.filter((one) => one.keep).length;
  return {
    busy: false,
    head: phrase("Claude suggested a scope for {n} memories. Click a scope to switch it, untick what you do not want, then save.", { n: rows.length }),
    failed: c.failures?.length ? phrase("{n} batches did not come back; run it again for the rest.", { n: c.failures.length }) : "",
    rows,
    saveSay: kept === 1 ? phrase("Save 1 scope") : phrase("Save {n} scopes", { n: kept }),
    canSave: kept > 0 && !c.saving,
    cancelSay: phrase("Cancel"),
    error: c.error || ""
  };
}

function mineModel() {
  const answer = st.mem.mine;
  if (!answer) return null;
  if (answer.state !== "ok") return { blocked: { head: phrase("The Hive could not read your memories"), say: String(answer.why || ""), retry: phrase("try again") } };
  const memories = answer.memories || [];
  const shown = shownMine(memories, st.mem);
  if (!shown.some((one) => one.id === st.mem.pick)) st.mem.pick = shown[0]?.id || "";
  const counts = filterCounts(memories, st.mem.project);
  const unscoped = memories.filter((one) => (st.mem.project === ALL || one.project === st.mem.project) && !one.scope).length;
  const chosen = st.mem.chosen.filter((id) => memories.some((one) => one.id === id && !one.proposed));
  st.mem.chosen = chosen;
  const where = st.mem.project === ALL ? phrase("every folder") : projectLabel(st.mem.project);
  return {
    projects: [{ key: ALL, say: phrase("All folders"), n: memories.length, on: st.mem.project === ALL }, ...(answer.projects || []).map((one) => ({ key: one.id, say: one.label, title: one.id, n: one.count, on: st.mem.project === one.id }))],
    projectsSay: phrase("Folders"),
    search: { placeholder: phrase("Search in {where}…", { where }), value: st.mem.query },
    filters: FILTERS.map((key) => ({ key, say: phrase({ candidates: "Team candidates", personal: "Personal", none: "No scope", all: "All of them" }[key]), n: counts[key], on: st.mem.filter === key })),
    classifySay: unscoped ? phrase("Classify {n} without scope", { n: unscoped }) : "",
    proposeSay: chosen.length ? (chosen.length === 1 ? phrase("Propose 1 to the team") : phrase("Propose {n} to the team", { n: chosen.length })) : phrase("Propose to the team"),
    canPropose: chosen.length > 0 && st.mem.busy !== "propose",
    proposing: st.mem.busy === "propose",
    proposingSay: phrase("opening the PR…"),
    chooseSay: phrase("choose to propose"),
    rows: shown.map(rowOfMine),
    empty: shown.length ? null : emptyMine(memories.length),
    detail: detailOfMine(shown.find((one) => one.id === st.mem.pick)),
    classify: classifyModel(),
    undo: st.mem.undo ? { say: st.mem.undo.say, undoSay: phrase("Undo") } : null,
    notice: st.mem.notice,
    error: errorModel(st.mem.error)
  };
}

function emptyMine(total) {
  if (!total) return { head: phrase("No memory saved on this machine yet"), say: phrase("Claude Code keeps what it learns in ~/.claude/projects/<folder>/memory. Ask a chat to remember something and it shows up here."), button: "" };
  if (st.mem.filter === "candidates" && !st.mem.query.trim()) return { head: phrase("No team candidate here"), say: phrase("A memory marked Team and not proposed yet shows up here. Classify the ones without scope, or click the scope of a memory."), button: phrase("See all") };
  return { head: phrase("Nothing matches"), say: phrase("No memory here with those words or that filter."), button: phrase("See all") };
}

function proposalsModel() {
  const answer = st.mem.proposals;
  if (!answer) return null;
  if (answer.state !== "ok") return { blocked: { head: phrase("The proposals did not load"), say: downSay({ body: answer }), retry: phrase("try again") } };
  const list = answer.proposals || [];
  if (!list.some((one) => one.number === st.mem.pickPr)) st.mem.pickPr = list[0]?.number || 0;
  const mine = String(answer.me || "").toLowerCase();
  const checkSay = { passing: phrase("checks passed"), failing: phrase("checks failed"), pending: phrase("checks running"), none: phrase("no checks") };
  const picked = list.find((one) => one.number === st.mem.pickPr);
  const own = !!picked && !!mine && picked.author.toLowerCase() === mine;
  return {
    rows: list.map((one) => ({
      key: String(one.number), number: one.number, title: one.title, author: one.author,
      meta: [`#${one.number}`, one.author, phrase("{n} memories", { n: one.memories.length })].join(" · "),
      checks: one.checks, checksSay: checkSay[one.checks] || "",
      here: one.number === st.mem.pickPr
    })),
    empty: list.length ? null : { head: phrase("No open proposal"), say: phrase("A proposal opened from the Mine tab, by you or by a teammate, waits here for someone to approve it.") },
    detail: picked ? {
      key: String(picked.number), number: picked.number, title: picked.title, url: picked.url,
      crumb: [`#${picked.number}`, phrase("by {who}", { who: picked.author }), checkSay[picked.checks]].filter(Boolean).join(" · "),
      checks: picked.checks,
      problems: (picked.problems || []).map((one, at) => ({ key: String(at), say: problemSay(one) })),
      problemsHead: phrase("The team memory check finds problems in this branch"),
      memories: picked.memories.map((one) => ({
        key: one.file, file: one.file, name: one.name, description: one.description || "",
        change: one.change, changeSay: { added: phrase("comes in"), modified: phrase("edited"), deleted: phrase("goes out") }[one.change] || "",
        html: one.body ? renderMarkdown(one.body) : ""
      })),
      own,
      approveSay: st.mem.prBusy === picked.number ? phrase("approving…") : phrase("Approve and merge"),
      approveHint: own ? phrase("You opened this proposal, so someone else has to approve it.") : picked.checks === "failing" ? phrase("The checks failed; GitHub may refuse the merge.") : "",
      canApprove: !own && !st.mem.prBusy,
      openSay: phrase("open on GitHub ↗"),
      error: st.mem.prError?.number === picked.number ? st.mem.prError.say : ""
    } : null,
    notice: st.mem.notice
  };
}

function teamModel() {
  const answer = st.mem.team;
  if (!answer) return null;
  if (answer.state !== "ok") return { blocked: { head: phrase("The team memory did not load"), say: downSay({ body: answer }), retry: phrase("try again") } };
  const shown = (answer.memories || []).filter((one) => matches(one, st.mem.teamQuery));
  if (!shown.some((one) => one.file === st.mem.pickTeam)) st.mem.pickTeam = shown[0]?.file || "";
  const picked = shown.find((one) => one.file === st.mem.pickTeam);
  const edit = st.mem.teamEdit && picked && st.mem.teamEdit.file === picked.file ? st.mem.teamEdit : null;
  return {
    search: { placeholder: phrase("Search in the team memory…"), value: st.mem.teamQuery },
    source: phrase("{repo} · main", { repo: answer.repo }),
    rows: shown.map((one) => ({ key: one.file, file: one.file, name: one.name, description: one.description, here: one.file === st.mem.pickTeam })),
    empty: shown.length ? null : answer.found === false
      ? { head: phrase("The team memory is not on main yet"), say: phrase("The folder .claude/team-memory appears in {repo} when the first proposal is merged.", { repo: answer.repo }) }
      : st.mem.teamQuery.trim() ? { head: phrase("Nothing matches"), say: phrase("No team memory with those words.") } : { head: phrase("The team memory is empty"), say: phrase("Propose a memory from the Mine tab.") },
    detail: picked ? {
      key: picked.file, file: picked.file, name: picked.name,
      crumb: [picked.type, picked.file].filter(Boolean).join(" · "),
      description: picked.description,
      html: renderMarkdown(picked.body || ""),
      editSay: phrase("Edit"), deleteSay: phrase("Delete"),
      note: phrase("Editing or deleting opens a PR; nothing changes on main until someone approves it."),
      confirm: st.mem.teamConfirm === picked.file,
      confirmSay: phrase("Open a PR that removes this memory from the team?"),
      confirmYes: phrase("Open the PR"), confirmNo: phrase("Cancel"),
      busy: st.mem.teamBusy === picked.file,
      busySay: phrase("opening the PR…")
    } : null,
    editor: edit ? {
      key: `edit:${edit.file}`, file: edit.file,
      descriptionSay: phrase("Description"), description: edit.description,
      bodySay: phrase("Content"), body: edit.body,
      saveSay: edit.busy ? phrase("opening the PR…") : phrase("Open a PR with the change"), cancelSay: phrase("Cancel"),
      busy: !!edit.busy, error: edit.error || ""
    } : null,
    notice: st.mem.notice,
    error: errorModel(st.mem.error)
  };
}

function memoriesViewModel() {
  const tab = st.mem.tab;
  const loading = tab === "mine" ? !st.mem.mine : tab === "proposals" ? !st.mem.proposals : !st.mem.team;
  return {
    head: headModel(),
    tab,
    loading,
    loadingSay: { mine: phrase("reading your memories…"), proposals: phrase("reading the open proposals…"), team: phrase("reading the team memory…") }[tab],
    mine: tab === "mine" ? mineModel() : null,
    proposals: tab === "proposals" ? proposalsModel() : null,
    team: tab === "team" ? teamModel() : null
  };
}

let memoriesSolid = null;

function paintMemories() {
  if (!memoriesSolid || !memoriesOnScreen()) return;
  memoriesSolid.show(memoriesViewModel());
}

function settledNotice(settled) {
  if (!settled?.merged?.length) return null;
  const n = settled.merged.reduce((sum, one) => sum + one.count, 0);
  const prs = settled.merged.map((one) => `#${one.number}`).join(", ");
  return {
    say: n === 1 ? phrase("1 memory came into the team through {prs}; its personal copy was deleted.", { prs }) : phrase("{n} memories came into the team through {prs}; their personal copies were deleted.", { n, prs }),
    undo: settled.entry || ""
  };
}

async function pullMine(freshly = false) {
  const said = await getJson(`/api/memories/mine${freshly ? "?fresh=1" : ""}`);
  st.mem.mine = said.ok ? said.body : { state: "down", why: said.body?.why || "" };
  const settled = settledNotice(said.body?.settled);
  if (settled) {
    st.mem.notice = { say: settled.say, url: "" };
    if (settled.undo) st.mem.undo = { entry: settled.undo, say: settled.say };
  }
  paintMemories();
  pickMine(st.mem.pick);
}

async function pullProposals() {
  const said = await getJson("/api/memories/proposals");
  st.mem.proposals = said.body?.state ? said.body : { state: "down" };
  paintMemories();
}

async function pullTeam() {
  const said = await getJson("/api/memories/team");
  st.mem.team = said.body?.state ? said.body : { state: "down" };
  paintMemories();
}

const pullTab = (tab, freshly = false) => (tab === "mine" ? pullMine(freshly) : tab === "proposals" ? pullProposals() : pullTeam());

async function pullOne(id) {
  if (!id || st.mem.detail[id]) return;
  const said = await getJson(`/api/memories/mine/one?id=${encodeURIComponent(id)}`);
  if (said.ok && said.body?.memory) st.mem.detail[id] = said.body.memory;
  paintMemories();
}

function pickMine(id) {
  st.mem.pick = id || "";
  paintMemories();
  if (st.mem.pick) pullOne(st.mem.pick);
}

function patchMine(id, change) {
  if (!st.mem.mine?.memories) return;
  st.mem.mine = { ...st.mem.mine, memories: st.mem.mine.memories.map((one) => (one.id === id ? { ...one, ...change } : one)) };
}

function failedSay(said) {
  if (said.status === 409) return phrase("The file changed outside the panel. The list was read again; try once more.");
  if (said.status === 404) return phrase("That memory is no longer on this machine.");
  return phrase("Nothing was saved: {why}", { why: String(said.body?.why || phrase("the Hive did not answer")) });
}

async function setScope(id, scope) {
  if (!SCOPES.includes(scope) || st.mem.busy) return;
  st.mem.busy = id;
  st.mem.error = null;
  paintMemories();
  const said = await send("/api/memories/mine/scope", { id, scope });
  st.mem.busy = "";
  if (said.ok) {
    patchMine(id, { scope });
    paintMemories();
    return;
  }
  st.mem.error = failedSay(said);
  if (said.status === 409) await pullMine(false);
  paintMemories();
}

async function deleteMine(id) {
  const one = mineList().find((memory) => memory.id === id);
  if (!one || st.mem.busy) return;
  st.mem.busy = id;
  st.mem.error = null;
  paintMemories();
  const said = await send("/api/memories/mine/delete", { id });
  st.mem.busy = "";
  if (said.ok) {
    st.mem.mine = { ...st.mem.mine, memories: st.mem.mine.memories.filter((memory) => memory.id !== id), projects: (st.mem.mine.projects || []).map((project) => (project.id === one.project ? { ...project, count: Math.max(0, project.count - 1) } : project)) };
    st.mem.chosen = st.mem.chosen.filter((chosen) => chosen !== id);
    st.mem.undo = { entry: said.body.entry, say: phrase("“{name}” was deleted, and its line left the MEMORY.md.", { name: one.title || one.name }) };
    paintMemories();
    pickMine(st.mem.pick);
    return;
  }
  st.mem.error = failedSay(said);
  paintMemories();
}

async function undoLast() {
  const undo = st.mem.undo;
  if (!undo?.entry) return;
  st.mem.undo = null;
  const said = await send("/api/memories/mine/undo", { entry: undo.entry });
  if (!said.ok) st.mem.error = failedSay(said);
  else st.mem.notice = null;
  await pullMine(false);
}

async function classify() {
  const ids = mineList().filter((one) => (st.mem.project === ALL || one.project === st.mem.project) && !one.scope).map((one) => one.id);
  if (!ids.length || st.mem.classify) return;
  const ticket = Date.now() + Math.random();
  st.mem.classify = { busy: true, n: ids.length, done: 0, ticket };
  st.mem.error = null;
  paintMemories();
  const verdicts = [];
  const failures = [];
  for (let at = 0; at < ids.length; at += CLASSIFY_CHUNK) {
    const said = await send("/api/memories/mine/classify", { ids: ids.slice(at, at + CLASSIFY_CHUNK) });
    if (st.mem.classify?.ticket !== ticket) return;
    if (said.ok) {
      verdicts.push(...(said.body.verdicts || []));
      failures.push(...(said.body.failures || []));
    } else failures.push(String(said.body?.why || phrase("no answer")));
    st.mem.classify.done = Math.min(ids.length, at + CLASSIFY_CHUNK);
    paintMemories();
  }
  if (!verdicts.length) {
    st.mem.classify = null;
    st.mem.error = phrase("Claude did not classify: {why}", { why: failures[0] || phrase("no answer") });
    paintMemories();
    return;
  }
  st.mem.classify = { busy: false, verdicts: verdicts.map((one) => ({ ...one, keep: true })), failures };
  paintMemories();
}

function classifyFlip(id) {
  const one = st.mem.classify?.verdicts?.find((verdict) => verdict.id === id);
  if (!one) return;
  one.scope = nextScope(one.scope);
  paintMemories();
}

function classifyKeep(id) {
  const one = st.mem.classify?.verdicts?.find((verdict) => verdict.id === id);
  if (!one) return;
  one.keep = !one.keep;
  paintMemories();
}

async function classifySave() {
  const c = st.mem.classify;
  if (!c || c.busy || c.saving) return;
  const scopes = c.verdicts.filter((one) => one.keep).map((one) => ({ id: one.id, scope: one.scope }));
  if (!scopes.length) return;
  c.saving = true;
  c.error = "";
  paintMemories();
  const said = await send("/api/memories/mine/scope", { scopes });
  c.saving = false;
  if (!said.ok) {
    c.error = failedSay(said);
    paintMemories();
    return;
  }
  for (const one of scopes) patchMine(one.id, { scope: one.scope });
  st.mem.classify = null;
  if (said.body.entry) st.mem.undo = { entry: said.body.entry, say: scopes.length === 1 ? phrase("1 scope saved.") : phrase("{n} scopes saved.", { n: scopes.length }) };
  paintMemories();
}

function choose(id) {
  st.mem.chosen = st.mem.chosen.includes(id) ? st.mem.chosen.filter((one) => one !== id) : [...st.mem.chosen, id];
  paintMemories();
}

async function propose(ids = st.mem.chosen) {
  const picked = mineList().filter((one) => ids.includes(one.id) && !one.proposed);
  if (!picked.length || st.mem.busy) return;
  st.mem.busy = "propose";
  st.mem.error = null;
  st.mem.notice = null;
  paintMemories();
  const { title, body } = proposalText(picked);
  const said = await send("/api/memories/propose", { ids: picked.map((one) => one.id), title, body });
  st.mem.busy = "";
  if (said.body?.state === "ok") {
    const pr = said.body.pr;
    for (const one of picked) patchMine(one.id, { proposed: { number: pr.number, url: pr.url, repo: pr.repo } });
    st.mem.chosen = [];
    st.mem.proposals = null;
    st.mem.notice = { say: phrase("Proposal open in PR #{n}. A teammate approves it in the Proposals tab.", { n: pr.number }), url: pr.url, urlSay: phrase("open the PR ↗") };
  } else if (said.body?.state === "blocked") {
    st.mem.error = { head: phrase("The proposal did not go out: the team memory check found problems"), lines: (said.body.problems || []).map(problemSay) };
  } else {
    st.mem.error = downSay(said);
  }
  paintMemories();
}

async function approve(number) {
  if (st.mem.prBusy) return;
  st.mem.prBusy = number;
  st.mem.prError = null;
  paintMemories();
  const said = await send("/api/memories/proposals/approve", { number });
  st.mem.prBusy = 0;
  const state = said.body?.state;
  if (state === "ok") {
    st.mem.notice = { say: phrase("PR #{n} was approved and merged. The memory is in the team's from now on.", { n: number }), url: "" };
    st.mem.team = null;
    st.mem.mine = null;
    await pullProposals();
    return;
  }
  const say = state === "own" ? phrase("You opened this proposal, so someone else has to approve it.")
    : state === "approved" ? phrase("Approved, but GitHub did not merge yet: {why}", { why: String(said.body?.why || "") })
    : state === "bad" ? phrase("GitHub refused: {why}", { why: String(said.body?.why || "") })
    : downSay(said);
  st.mem.prError = { number, say };
  paintMemories();
}

function startTeamEdit() {
  const one = (st.mem.team?.memories || []).find((memory) => memory.file === st.mem.pickTeam);
  if (!one) return;
  st.mem.teamConfirm = "";
  st.mem.teamEdit = { file: one.file, description: one.description || "", body: one.body || "", busy: false, error: "" };
  paintMemories();
  requestAnimationFrame(() => $("memories").querySelector("[data-mem-edit='description']")?.focus());
}

function teamEditField(key, value) {
  if (st.mem.teamEdit && (key === "description" || key === "body")) st.mem.teamEdit[key] = value;
}

async function changeTeam(kind) {
  const one = (st.mem.team?.memories || []).find((memory) => memory.file === st.mem.pickTeam);
  if (!one || st.mem.teamBusy) return;
  const edit = st.mem.teamEdit;
  if (kind === "edit" && (!edit || !edit.body.trim() || !edit.description.trim())) {
    if (edit) { edit.error = phrase("The description and the content cannot be empty."); paintMemories(); }
    return;
  }
  st.mem.teamBusy = one.file;
  if (edit) { edit.busy = true; edit.error = ""; }
  st.mem.error = null;
  st.mem.notice = null;
  paintMemories();
  const { title, body } = teamChangeText(kind, one);
  const said = await send(`/api/memories/team/${kind}`, { file: one.file, title, prBody: body, ...(kind === "edit" ? { description: edit.description, body: edit.body } : {}) });
  st.mem.teamBusy = "";
  st.mem.teamConfirm = "";
  if (said.body?.state === "ok") {
    st.mem.teamEdit = null;
    st.mem.proposals = null;
    st.mem.notice = { say: phrase("PR #{n} is open with the change. It enters main when a teammate approves it.", { n: said.body.pr.number }), url: said.body.pr.url, urlSay: phrase("open the PR ↗") };
  } else {
    const say = said.body?.state === "blocked" ? (said.body.problems || []).map(problemSay).join(" · ") : downSay(said);
    if (edit && st.mem.teamEdit === edit) { edit.busy = false; edit.error = say; } else st.mem.error = say;
  }
  paintMemories();
}

function memoryEscape() {
  if (st.mem.teamEdit) { st.mem.teamEdit = null; paintMemories(); return true; }
  if (st.mem.teamConfirm) { st.mem.teamConfirm = ""; paintMemories(); return true; }
  if (st.mem.classify) { st.mem.classify = null; paintMemories(); return true; }
  return false;
}

const inMemoryEditor = (target) => !!target?.closest?.("#memories .mem-editor");

function stepMemory(step) {
  if (st.mem.tab === "mine") {
    const rows = shownMine(mineList(), st.mem);
    if (!rows.length) return;
    const at = rows.findIndex((one) => one.id === st.mem.pick);
    pickMine(rows[(at + step + rows.length) % rows.length].id);
    $("memories").querySelector(`[data-memory="${CSS.escape(st.mem.pick)}"]`)?.scrollIntoView({ block: "nearest" });
    return;
  }
  if (st.mem.tab === "proposals") {
    const rows = st.mem.proposals?.proposals || [];
    if (!rows.length) return;
    const at = rows.findIndex((one) => one.number === st.mem.pickPr);
    st.mem.pickPr = rows[(at + step + rows.length) % rows.length].number;
    paintMemories();
    return;
  }
  const rows = (st.mem.team?.memories || []).filter((one) => matches(one, st.mem.teamQuery));
  if (!rows.length) return;
  const at = rows.findIndex((one) => one.file === st.mem.pickTeam);
  st.mem.pickTeam = rows[(at + step + rows.length) % rows.length].file;
  st.mem.teamEdit = null;
  st.mem.teamConfirm = "";
  paintMemories();
}

function setTab(tab) {
  st.mem.tab = TABS.includes(tab) ? tab : "mine";
  st.mem.notice = null;
  st.mem.error = null;
  paintMemories();
  const held = { mine: st.mem.mine, proposals: st.mem.proposals, team: st.mem.team }[st.mem.tab];
  if (!held) pullTab(st.mem.tab);
}

function openMemories() {
  screenOpens();
  releaseKeyboard();
  $("memories").hidden = false;
  paintMemories();
  pullTab(st.mem.tab, true);
  if (st.mem.tab !== "proposals") pullProposals();
}

function openMemoryAt(id) {
  st.mem.tab = "mine";
  if (id) {
    st.mem.project = ALL;
    st.mem.filter = ALL;
    st.mem.query = "";
    st.mem.pick = String(id);
    delete st.mem.detail[st.mem.pick];
  }
  if (!memoriesOnScreen()) openMemories();
  else { paintMemories(); pullMine(false); }
}

function closeMemories() {
  st.mem.teamEdit = null;
  st.mem.teamConfirm = "";
  st.mem.classify = null;
  $("memories").hidden = true;
  memoriesSolid?.dispose();
}

function openOutside(url) {
  if (!url) return;
  if (window.seatBrowser?.openExternal) window.seatBrowser.openExternal(url);
  else window.open(url, "_blank", "noopener");
}

document.addEventListener("hive:screen", () => { if (memoriesOnScreen()) closeMemories(); });

solidMounts.push((hive) => {
  memoriesSolid = hive.mountMemories($("memories"), {
    actions: {
      close: () => closeMemories(),
      tab: (key) => setTab(key),
      retry: () => { if (st.mem.tab === "mine") st.mem.mine = null; if (st.mem.tab === "proposals") st.mem.proposals = null; if (st.mem.tab === "team") st.mem.team = null; paintMemories(); pullTab(st.mem.tab, true); },
      project: (key) => { st.mem.project = key; st.mem.pick = ""; paintMemories(); pickMine(st.mem.pick); },
      filter: (key) => { st.mem.filter = FILTERS.includes(key) ? key : ALL; paintMemories(); pickMine(st.mem.pick); },
      search: (text) => { st.mem.query = text; paintMemories(); pickMine(st.mem.pick); },
      all: () => { st.mem.query = ""; st.mem.filter = ALL; paintMemories(); pickMine(st.mem.pick); },
      pick: (id) => pickMine(id),
      choose: (id) => choose(id),
      scope: (id, scope) => setScope(id, scope),
      flipScope: (id) => setScope(id, nextScope(mineList().find((one) => one.id === id)?.scope)),
      remove: (id) => deleteMine(id),
      undo: () => undoLast(),
      dismiss: () => { st.mem.notice = null; st.mem.error = null; paintMemories(); },
      classify: () => classify(),
      classifyFlip: (id) => classifyFlip(id),
      classifyKeep: (id) => classifyKeep(id),
      classifySave: () => classifySave(),
      classifyCancel: () => { st.mem.classify = null; paintMemories(); },
      propose: (ids) => propose(ids),
      pickPr: (number) => { st.mem.pickPr = number; paintMemories(); },
      approve: (number) => approve(number),
      teamSearch: (text) => { st.mem.teamQuery = text; paintMemories(); },
      pickTeam: (file) => { st.mem.pickTeam = file; st.mem.teamEdit = null; st.mem.teamConfirm = ""; paintMemories(); },
      teamEdit: () => startTeamEdit(),
      teamField: (key, value) => teamEditField(key, value),
      teamSave: () => changeTeam("edit"),
      teamCancel: () => { st.mem.teamEdit = null; paintMemories(); },
      teamAskDelete: () => { st.mem.teamConfirm = st.mem.pickTeam; st.mem.teamEdit = null; paintMemories(); },
      teamKeep: () => { st.mem.teamConfirm = ""; paintMemories(); },
      teamDelete: () => changeTeam("delete"),
      open: (url) => openOutside(url)
    }
  });
});

$("btn-memories")?.addEventListener("click", () => (memoriesOnScreen() ? closeMemories() : openMemories()));

export {
  closeMemories, filterCounts, inMemoryEditor, isCandidate, memoriesOnScreen, memoriesViewModel, memoryEscape, nextScope, openMemories, openMemoryAt, paintMemories,
  pickMine, problemSay, proposalText, pullMine, setTab, shownMine, stepMemory
};
