import { $, esc, every, phrase, raycastOn, screenOpens, solidMounts, st, stopBeat, svgIcon } from "./core.js";
import { closeDay, dayOnScreen } from "./day.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { closeMore } from "./new-chat.js";
import { closeShelf, shelfOnScreen } from "./shelf.js";
import { toClipboard } from "./terminal-history.js";
import { closePrs, exitReview, prsOnScreen } from "./thread.js";
import { closeUsage, usageOnScreen } from "./usage.js";

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const BYTES_PER_SESSION = 2.2e9;

function bytes(n) {
  if (!n && n !== 0) return "—";
  const g = n / 1024 ** 3;
  if (g >= 1) return `${g.toFixed(1)} GB`;
  return `${Math.round(n / 1024 ** 2)} MB`;
}

function ago(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 60) return phrase("{n} min", { n: Math.max(1, min) });
  const h = Math.floor(min / 60);
  if (h < 48) return phrase("{n}h", { n: h });
  return phrase("{n} days", { n: Math.floor(h / 24) });
}

function button(action, text, cls = "btn") {
  const working = podBusy === action;
  return `<button class="${cls}" data-action="${action}"${working ? " disabled" : ""}>${working ? "…" : phrase(text)}</button>`;
}

st.confirmResolve = null;

function ask(title, text, buttonText, opts) {
  const { who = "", at = null } = opts || {};
  $("c-title").textContent = title;
  $("c-text").innerHTML = text;
  $("c-who").textContent = who;
  $("c-who").hidden = !who;
  $("c-yes").textContent = buttonText || phrase("confirm");
  if (raycastOn()) {
    $("c-who").hidden = !who || title.includes(who);
    $("c-yes").innerHTML = `${esc(buttonText || phrase("confirm"))}<span class="rc-key">↵</span>`;
  }
  $("confirm").classList.add("on");
  placeConfirm(at);
  $("c-yes").focus();
  return new Promise((r) => { st.confirmResolve = r; });
}

function placeConfirm(at) {
  const el = $("confirm");
  const card = el.querySelector(".box");
  el.classList.toggle("at", !!at);
  if (!at) {
    card.style.left = "";
    card.style.top = "";
    return;
  }
  const box = card.getBoundingClientRect();
  card.style.left = `${Math.max(6, Math.min(at.right - box.width, innerWidth - box.width - 6))}px`;
  card.style.top = `${Math.max(6, Math.min(at.bottom + 8, innerHeight - box.height - 6))}px`;
}

addEventListener("resize", () => { if ($("confirm").classList.contains("at")) placeConfirm(null); });

function closeConfirm(value) {
  $("confirm").classList.remove("on");
  placeConfirm(null);
  const r = st.confirmResolve;
  st.confirmResolve = null;
  r?.(value);
}

$("c-yes").addEventListener("click", () => closeConfirm(true));

$("c-no").addEventListener("click", () => closeConfirm(false));

$("confirm").addEventListener("click", (e) => { if (e.target === $("confirm")) closeConfirm(false); });

$("c-text").addEventListener("click", async (e) => {
  const hit = raycastOn() && e.target.closest("[data-copy]");
  if (!hit || !await toClipboard(hit.dataset.copy)) return;
  hit.classList.add("copied");
  setTimeout(() => hit.classList.remove("copied"), 1200);
});

st.wsState = null;

const wsOnScreen = () => !$("workspace").hidden;

function paintWorkspace() {
  workspaceSolid.show(workspaceViewModel());
}

let workspaceSolid = null;

function wsRepoModel(r, read = false) {
  const unlisted = read && !r.declared;
  const job = ["cloning", "failed", "queued"].includes(r.job?.state) ? r.job.state : "";
  return {
    key: r.name, name: r.name, tech: r.tech || "", entry: r.entry || "",
    shape: job || (!r.cloned ? "gone" : r.loose || r.ahead ? "loose" : unlisted ? "undeclared" : ""),
    mark: job === "cloning" ? esc(phrase("cloning…"))
      : job === "queued" ? esc(phrase("queued"))
      : job === "failed" ? esc(phrase("clone failed"))
      : !r.cloned ? esc(phrase("not cloned"))
      : r.loose || r.ahead ? `${svgIcon("i-pen")}<b>${r.loose || 0}</b>${svgIcon("i-arrow-up")}<b>${r.ahead || 0}</b>`
      : unlisted ? esc(phrase("no line in hive.json"))
      : esc(r.branch || ""),
    retry: job === "failed" ? phrase("try again") : "",
    why: job === "failed" ? phrase("the clone failed: {why}", { why: r.job.error || "?" }) : ""
  };
}

st.wsAdd = null;

st.wsSaid = null;

const WS_SAY = () => ({
  changes: phrase("changes"), new: phrase("new"), same: phrase("same"), "no-block": phrase("no block"), missing: phrase("missing"),
  "+1 line": phrase("+1 line"), "+1 line in the hive block": phrase("+1 line in the hive block"), "+1 line, in a new hive block": phrase("+1 line, in a new hive block"),
  "already there": phrase("already there"), "already cloned": phrase("already cloned"), "git clone": phrase("git clone"), "not in the hub": phrase("not in the hub"),
  "the hive block is missing": phrase("the hive block is missing"), "left without the block": phrase("left without the block"),
  "+the hub entry; every command rides on it": phrase("+the hub entry; every command rides on it"), "served by the hub entry": phrase("served by the hub entry"), "+1 remote server": phrase("+1 remote server"), "+1 command; the gateway reloads": phrase("+1 command; the gateway reloads"),
  "every variable is set": phrase("every variable is set"), "nothing needed": phrase("nothing needed"), "a SKILL.md to write": phrase("a SKILL.md to write"),
  "the skills block is missing": phrase("the skills block is missing"), "+1 line in the skills block": phrase("+1 line in the skills block"), "+1 line, in a new skills block": phrase("+1 line, in a new skills block")
});

function wsPlanModel(plan, chosen) {
  const say = WS_SAY();
  const changing = plan.files.filter((f) => f.verdict === "changes" || (f.verdict === "new" && !f.file.endsWith("/"))).length;
  const files = plan.files.map((f) => ({
    key: f.file, file: f.file, shape: f.verdict, verdict: say[f.verdict] || f.verdict,
    say: Array.isArray(f.missing) && f.missing.length ? phrase("{names} not set", { names: f.missing.join(", ") }) : say[f.say] || f.say || "", excerpt: f.excerpt || "",
    ask: f.asks ? phrase("the hive block is missing from {file}: where does it go?", { file: f.file }) : "",
    missing: Array.isArray(f.missing) && f.missing.length ? phrase("set {names} in the .env of the hub; until then the gateway answers Connection closed", { names: f.missing.join(", ") }) : "",
    choices: f.asks ? [["top", phrase("at the top")], ["end", phrase("at the end")], ["skip", phrase("leave it without the block")]]
      .map(([key, text]) => ({ key, say: text, on: chosen[f.file] === key })) : []
  }));
  return {
    head: phrase("adding {entry}", { entry: plan.entry || plan.name }),
    sum: [phrase("{n} file(s) change", { n: changing }), plan.clone ? phrase("1 clone") : plan.entry ? phrase("no clone") : "", phrase("no commit")].filter(Boolean).join(" · "),
    files,
    note: phrase("The hive writes only between the markers of the block. The rest of the file stays yours. Git is your call: nothing here commits."),
    canApply: !plan.asks
  };
}

function wsFieldsOf(a) {
  const scopeField = { id: "ws-in-scope", field: "scope", label: phrase("applies to (empty: every repository)"), placeholder: phrase("repository names, separated by commas"), value: a.scope || "" };
  if (a.what === "skill") {
    return [
      { id: "ws-in-name", field: "name", label: phrase("name"), placeholder: "copy-check-mobile", value: a.name || "" },
      { id: "ws-in-description", field: "description", label: phrase("when it applies, in one line"), placeholder: phrase("Use when…"), value: a.description || "" },
      scopeField
    ];
  }
  const stdio = a.kind === "stdio";
  return [
    { id: "ws-in-name", field: "name", label: phrase("name"), placeholder: "sentry", value: a.name || "" },
    stdio
      ? { id: "ws-in-command", field: "command", label: phrase("command that starts it"), placeholder: "npx -y @sentry/mcp-server@latest", value: a.command || "" }
      : { id: "ws-in-url", field: "url", label: phrase("url"), placeholder: "https://mcp.example.com/mcp", value: a.url || "" },
    { id: "ws-in-env", field: "env", label: phrase("variables it needs (names only)"), placeholder: "SENTRY_ACCESS_TOKEN", value: a.env || "" },
    scopeField
  ];
}

function wsItemModel(a) {
  const mcp = a.what === "mcp";
  return {
    what: a.what,
    kinds: mcp ? [["remote", phrase("remote (url)")], ["stdio", phrase("command (stdio)")]].map(([key, say]) => ({ key, say, on: (a.kind || "remote") === key })) : null,
    fields: wsFieldsOf(a),
    note: mcp
      ? phrase("Goes into .mcp.json and, for a command, into the servers.json of the gateway, which reloads by itself. The hive keeps no secret: variables come from the .env of the hub.")
      : phrase("Creates .claude/skills/<name>/SKILL.md for you to write, records where it applies in hive.json, and lists it in the AGENTS.md index, which is how Codex, Kimi and Kiro see it."),
    error: a.error || "", busy: Boolean(a.busy),
    cancelSay: phrase("cancel"), planSay: phrase("see what changes"), backSay: phrase("back"),
    applySay: phrase("write"),
    plan: a.plan ? wsPlanModel(a.plan, a.block || {}) : null
  };
}

function wsAddModel() {
  const a = st.wsAdd;
  if (!a) return null;
  if (a.what !== "repo") return wsItemModel(a);
  const name = String(a.typed || "").trim().replace(/\/+$/, "").replace(/\.git$/, "").split("/").pop() || "";
  const org = (st.wsState?.repos || []).map((r) => String(r.entry || "").split("/")[0]).find(Boolean) || "org";
  return {
    what: "repo", typed: a.typed || "", label: phrase("org/name"), placeholder: `${org}/…`,
    where: name ? phrase("where: ./{name} (the root of the hub)", { name }) : "",
    note: phrase("Clones into the hub and writes the line in hive.json, CLAUDE.md and AGENTS.md. Nothing is committed."),
    error: a.error || "", busy: Boolean(a.busy),
    cancelSay: phrase("cancel"), planSay: phrase("see what changes"), backSay: phrase("back"),
    applySay: a.plan?.clone ? phrase("write and clone") : phrase("write"),
    plan: a.plan ? wsPlanModel(a.plan, a.block || {}) : null
  };
}

st.wsFix = null;

st.wsShowAll = {};

const WS_FOLD = 12;

const FIX_TYPE = () => ({ "repo-line": phrase("repository"), "clone-all": phrase("repositories"), "clone-stop": phrase("repositories"), "skill-line": phrase("skills"), "skill-file": phrase("skill"), "mcp-serve": phrase("mcp"), "mcp-line": phrase("mcp") });

const wsNames = (names) => (names.length > 3 ? `${names.slice(0, 3).join(", ")}, +${names.length - 3}` : names.join(", "));

function wsAttentionRows(w) {
  const rows = [];
  const repos = w.repos || [];
  for (const r of repos.filter((r) => !r.declared && r.cloned)) {
    rows.push({ key: `repo-line:${r.name}`, what: "repo-line", name: r.name, say: phrase("{name} is on disk, but not in hive.json", { name: r.name }), act: phrase("write it into hive.json") });
  }
  const busy = repos.filter((r) => ["cloning", "queued"].includes(r.job?.state));
  const failed = repos.filter((r) => r.job?.state === "failed");
  const missing = repos.filter((r) => r.declared && !r.cloned && !r.job);
  if (busy.length) {
    const done = repos.filter((r) => r.declared && r.cloned).length;
    rows.push({ key: "clone-stop", what: "clone-stop", name: "", say: phrase("cloning one at a time: {cloning} now, {queued} queued, {failed} failed", { cloning: busy.filter((r) => r.job.state === "cloning").length, queued: busy.filter((r) => r.job.state === "queued").length, failed: failed.length }), act: phrase("stop"), live: true, done });
  } else if (missing.length) {
    rows.push({ key: "clone-all", what: "clone-all", name: "", say: phrase("{n} in hive.json, but not on disk: {names}", { n: missing.length, names: wsNames(missing.map((r) => r.name)) }), act: phrase("clone them all") });
  }
  const skills = w.skills || [];
  const folders = skills.filter((s) => s.onDisk && !s.declared);
  if (folders.length) rows.push({ key: "skill-line", what: "skill-line", name: "", say: phrase("{n} folder(s) in .claude/skills, but not in hive.json: {names}", { n: folders.length, names: wsNames(folders.map((s) => s.name)) }), act: folders.length > 1 ? phrase("write them into hive.json") : phrase("write it into hive.json") });
  for (const sk of skills.filter((s) => s.declared && !s.onDisk)) {
    rows.push({ key: `skill-file:${sk.name}`, what: "skill-file", name: sk.name, say: phrase("{name} is in hive.json, but .claude/skills/{name}/SKILL.md does not exist", { name: sk.name }), act: phrase("create the SKILL.md") });
  }
  const mcps = w.mcps || [];
  const unserved = mcps.filter((m) => m.declared && !m.wired);
  if (unserved.length) {
    const first = unserved[0];
    rows.push({ key: "mcp-serve", what: "mcp-serve", name: first.name, scope: (first.repos || []).join(", "), say: phrase("{n} in hive.json with no url and no command, so the hive knows where they apply but not how to reach them: {names}", { n: unserved.length, names: wsNames(unserved.map((m) => m.name)) }), act: unserved.length > 1 ? phrase("set them up one by one") : phrase("set it up") });
  }
  const wired = mcps.filter((m) => m.wired && !m.declared);
  if (wired.length) rows.push({ key: "mcp-line", what: "mcp-line", name: "", say: phrase("{n} reachable (in .mcp.json or servers.json), but not in hive.json, so the hive does not know where they apply: {names}", { n: wired.length, names: wsNames(wired.map((m) => m.name)) }), act: wired.length > 1 ? phrase("write them into hive.json") : phrase("write it into hive.json") });
  return rows;
}

const FIX_ITEM = () => ({ "repo-line": phrase("repository"), "skill-line": phrase("skill"), "skill-file": phrase("skill"), "mcp-line": phrase("mcp") });

function wsFixPlanModel(plan) {
  const say = WS_SAY();
  const type = FIX_ITEM();
  const many = (plan.items || []).length > 1;
  const items = (plan.items || []).map((item) => ({
    key: `${item.what}:${item.name}`,
    head: item.what === "clone-all" ? phrase("{n} clone(s)", { n: item.clone || item.files.length }) : `${type[item.what] || item.what} ${item.name}`,
    error: item.error || "",
    files: (item.files || []).map((f) => ({
      key: f.file, file: f.file, shape: f.verdict, verdict: say[f.verdict] || f.verdict, say: say[f.say] || f.say || "", excerpt: many ? "" : f.excerpt || "",
      ask: f.asks ? phrase("the hive block is missing from {file}: where does it go?", { file: f.file }) : "",
      missing: "",
      choices: f.asks ? [["top", phrase("at the top")], ["end", phrase("at the end")], ["skip", phrase("leave it without the block")]]
        .map(([key, text]) => ({ key, say: text, on: (st.wsFix?.block || {})[f.file] === key })) : []
    }))
  }));
  const changing = new Set(items.flatMap((i) => i.files.filter((f) => f.shape === "changes" || (f.shape === "new" && !f.file.endsWith("/"))).map((f) => f.file))).size;
  const clones = items.reduce((n, i) => n + i.files.filter((f) => f.file.endsWith("/") && f.shape === "new").length, 0);
  return {
    head: phrase("adjusting {n} item(s)", { n: items.length }),
    sum: [phrase("{n} file(s) change", { n: changing }), clones ? phrase("{n} clone(s)", { n: clones }) : "", phrase("no commit")].filter(Boolean).join(" · "),
    items,
    note: phrase("The hive writes only between the markers of the block. The rest of the file stays yours. Git is your call: nothing here commits."),
    canApply: !plan.asks && items.some((i) => !i.error)
  };
}

function wsFixModel() {
  const f = st.wsFix;
  if (!f) return null;
  return {
    what: f.what, error: f.error || "", busy: Boolean(f.busy),
    cancelSay: phrase("cancel"), applySay: phrase("write"),
    plan: f.plan ? wsFixPlanModel(f.plan) : null
  };
}

function wsAttentionModel(w) {
  const rows = wsAttentionRows(w);
  const off = (items, have, want) => items.filter((i) => Boolean(i[have]) !== Boolean(i[want])).length;
  const count = off(w.repos || [], "declared", "cloned") + off(w.skills || [], "declared", "onDisk") + off(w.mcps || [], "declared", "wired");
  const said = st.wsSaid?.what === "fix" ? st.wsSaid.text : "";
  if (!count && !said) return null;
  const type = FIX_TYPE();
  return {
    title: count ? phrase("needs attention") : phrase("in step"), count,
    line: count ? phrase("The hive.json and the disk disagree in {n} point(s). Each line writes only between the markers of the hive; nothing is committed.", { n: count }) : "",
    said,
    fixAll: rows.some((r) => !["mcp-serve", "clone-stop"].includes(r.what)) && !st.wsFix ? phrase("adjust everything") : "",
    rows: rows.map((r) => ({ ...r, type: type[r.what] || "" })),
    fix: wsFixModel()
  };
}

function wsFold(kind, items) {
  const all = Boolean(st.wsShowAll[kind]);
  const hidden = all ? 0 : Math.max(0, items.length - WS_FOLD);
  return {
    items: hidden ? items.slice(0, WS_FOLD) : items,
    more: hidden ? phrase("+{n} show all", { n: hidden }) : items.length > WS_FOLD ? phrase("fold") : "",
    hidden
  };
}

function wsChipModel(item, sides, marks) {
  const [have, want] = sides;
  const shape = item[have] && !item[want] ? "only-declared" : !item[have] && item[want] ? "only-on-disk" : "";
  const mark = shape === "only-declared" ? marks.onlyDeclared : shape === "only-on-disk" ? phrase("no line in hive.json") : "";
  const icons = `${item.gateway ? svgIcon("i-swap") : ""}${item.remote ? svgIcon("i-cloud") : ""}`;
  return {
    key: item.name, name: item.name, shape, scoped: Boolean(item.scoped),
    html: `${esc(item.name)}${icons}${mark ? `<em>${esc(mark)}</em>` : ""}`
  };
}

function workspaceViewModel() {
  const w = st.wsState;
  const title = phrase("The workspace");
  if (!w) return { top: null, title, note: phrase("reading the hub…") };
  const top = { title, hub: w.hub || "", refresh: phrase("refresh"), closeSay: phrase("close") };
  const read = w.state === "read";
  const shared = {
    top, title, state: w.state, repos: (w.repos || []).map((r) => wsRepoModel(r, read)),
    reposTitle: phrase("repositories"), reposCount: (w.repos || []).length,
    noneDeclared: phrase("none declared")
  };
  if (w.state === "none") return { ...shared, said: phrase("No hive.json here — the hive is listing what it found on disk.") };
  if (w.state === "unreadable") {
    return { ...shared, brokeTitle: phrase("the hive.json did not load"), path: w.path || "", said: w.said || "" };
  }
  const c = w.counts || {};
  const mc = c.mcps || {};
  const inStep = {
    repos: (w.repos || []).filter((r) => (r.declared && r.cloned) || r.job).map((r) => wsRepoModel(r, read)),
    skills: (w.skills || []).filter((s) => s.declared && s.onDisk).map((s) => wsChipModel(s, ["declared", "onDisk"], { onlyDeclared: phrase("no folder") })),
    mcps: (w.mcps || []).filter((m) => m.declared && m.wired).map((m) => wsChipModel(m, ["declared", "wired"], { onlyDeclared: phrase("not in .mcp.json") }))
  };
  const repos = wsFold("repos", inStep.repos);
  const skills = wsFold("skills", inStep.skills);
  const mcps = wsFold("mcps", inStep.mcps);
  const remote = (w.mcps || []).filter((m) => m.declared && m.wired && m.remote).length;
  const cloned = (w.repos || []).filter((r) => r.declared && r.cloned).length;
  return {
    ...shared, state: "read", name: w.name, path: w.path || "",
    addSay: `+ ${phrase("add")}`, add: wsAddModel(), addSaid: st.wsSaid?.what === "skill" ? st.wsSaid.text : "", mcpSaid: st.wsSaid?.what === "mcp" ? st.wsSaid.text : "",
    attention: wsAttentionModel(w),
    issuesTitle: phrase("what the hive.json says wrong"),
    issues: (w.issues || []).slice(0, 12).map((i, at) => ({ key: `${at}:${i.path}`, path: i.path, message: i.message })),
    declared: c.declared || 0,
    counts: repos.hidden ? phrase("{cloned} cloned, {hidden} folded because they are in step", { cloned: cloned, hidden: repos.hidden }) : phrase("{cloned} cloned", { cloned }),
    repos: repos.items, reposMore: repos.more,
    skillsTitle: phrase("skills"),
    skillsCount: (w.skills || []).length,
    skillsLine: phrase("{n} in step", { n: inStep.skills.length }),
    skills: skills.items, skillsMore: skills.more,
    skillsLegend: phrase("dashed: only in some repositories"),
    mcpsTitle: phrase("mcp servers"),
    mcpsCount: (w.mcps || []).length,
    mcpsLine: `${phrase("{n} through the gateway", { n: mc.gateway || 0 })} · ${phrase("{n} remote", { n: remote })}`,
    mcps: mcps.items, mcpsMore: mcps.more,
    legend: `${svgIcon("i-swap")} ${phrase("through the gateway")} · ${svgIcon("i-cloud")} ${phrase("a remote server")} · ${phrase("dashed: only in some repositories")}`
  };
}

solidMounts.push((hive) => {
  workspaceSolid = hive.mountWorkspace($("ws-scroll"));
});

let wsCloneTimer = 0;

function wsWatchClones() {
  clearTimeout(wsCloneTimer);
  if (!wsOnScreen()) return;
  if ((st.wsState?.repos || []).some((r) => r.job?.state === "cloning")) wsCloneTimer = setTimeout(() => pullWorkspace(false), 3000);
}

async function pullWorkspace(force) {
  try {
    st.wsState = await (await fetch(`/api/workspace${force ? "?force=1" : ""}`)).json();
  } catch {
    st.wsState = { state: "unreadable", said: phrase("the hive could not read the workspace"), repos: [] };
  }
  if (wsOnScreen()) paintWorkspace();
  wsWatchClones();
}

async function wsRepoDo(asked) {
  try {
    return await (await fetch("/api/workspace/repo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(asked) })).json();
  } catch {
    return { error: phrase("the hive could not reach the hub") };
  }
}

function wsAsked(a, apply = false) {
  const block = a.block || {};
  if (a.what === "repo") return { repo: a.typed, block, apply };
  if (a.what === "skill") return { name: a.name, description: a.description, scope: a.scope, block, apply };
  return { name: a.name, kind: a.kind || "remote", url: a.url, command: a.command, env: a.env, scope: a.scope, block, apply };
}

async function wsItemDo(what, asked) {
  try {
    return await (await fetch(`/api/workspace/${what}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(asked) })).json();
  } catch {
    return { error: phrase("the hive could not reach the hub") };
  }
}

function wsSaidAfter(a, got) {
  if (a.what === "mcp") {
    const missing = Object.entries(got.gateway?.missing || {}).filter(([name]) => name === a.name).flatMap(([, keys]) => keys);
    const gone = got.plan?.files?.find((f) => f.file === ".env" && f.verdict === "missing")?.missing || [];
    const keys = missing.length ? missing : gone;
    return { what: "mcp", text: keys.length
      ? phrase("{name} is in, but has no credentials: set {keys} in the .env of the hub", { name: a.name, keys: keys.join(", ") })
      : got.gateway?.reached ? phrase("{name} is in; the gateway reloaded", { name: a.name }) : phrase("{name} is in", { name: a.name }) };
  }
  const skillFile = `.claude/skills/${a.name}/SKILL.md`;
  const kept = got.plan?.files?.find((f) => f.file === skillFile)?.verdict === "same";
  return { what: "skill", text: kept
    ? phrase("{name} is in; {file} was already there", { name: a.name, file: skillFile })
    : phrase("{name} created: write {file}", { name: a.name, file: skillFile }) };
}

async function wsPlan() {
  const a = st.wsAdd;
  if (!a || a.busy) return;
  a.busy = true;
  a.error = "";
  paintWorkspace();
  const got = await wsItemDo(a.what, wsAsked(a));
  a.busy = false;
  if (got.plan) a.plan = got.plan;
  if (got.error && !got.plan) a.error = got.error;
  paintWorkspace();
}

async function wsApply() {
  const a = st.wsAdd;
  if (!a || a.busy) return;
  a.busy = true;
  a.error = "";
  paintWorkspace();
  const got = await wsItemDo(a.what, wsAsked(a, true));
  if (got.ok) {
    st.wsAdd = null;
    st.wsSaid = a.what === "repo" ? null : wsSaidAfter(a, got);
    paintWorkspace();
    return pullWorkspace(true);
  }
  a.busy = false;
  a.error = got.error || "?";
  if (got.plan) a.plan = got.plan;
  paintWorkspace();
}

function wsChoose(file, key) {
  if (st.wsFix) {
    st.wsFix.block = { ...(st.wsFix.block || {}), [file]: key };
    return wsFixPlan();
  }
  const a = st.wsAdd;
  if (!a) return;
  a.block = { ...(a.block || {}), [file]: key };
  return wsPlan();
}

async function wsRetry(entry) {
  await wsRepoDo({ repo: entry, apply: true });
  return pullWorkspace(false);
}

function wsFixSaid(got) {
  const items = (got.items || []).filter((i) => !i.error && !i.asks);
  const clones = items.reduce((n, i) => n + (i.clone || 0), 0);
  const written = items.filter((i) => i.what !== "clone-all").length;
  const failed = (got.items || []).filter((i) => i.error).map((i) => i.name);
  return [
    written ? phrase("{n} line(s) written", { n: written }) : "",
    clones ? phrase("{n} clone(s) queued", { n: clones }) : "",
    failed.length ? phrase("could not adjust: {names}", { names: failed.join(", ") }) : ""
  ].filter(Boolean).join(" · ");
}

async function wsFixStart(what, name, scope) {
  if (what === "mcp-serve") {
    st.wsAdd = { what: "mcp", typed: "", kind: "remote", name, scope, plan: null, error: "", busy: false, block: {} };
    st.wsFix = null;
    st.wsSaid = null;
    paintWorkspace();
    return $("ws-scroll").querySelector("#ws-in-url, #ws-in-command")?.focus();
  }
  if (what === "clone-all" || what === "clone-stop") {
    const got = await wsItemDo("fix", { what, name, apply: true });
    st.wsSaid = got.ok ? { what: "fix", text: what === "clone-stop" ? phrase("the queue stopped; the clone under way finishes") : wsFixSaid(got) } : { what: "fix", text: got.error || "?" };
    return pullWorkspace(true);
  }
  st.wsFix = { what, name, plan: null, error: "", busy: false, block: {} };
  st.wsAdd = null;
  st.wsSaid = null;
  return wsFixPlan();
}

async function wsFixPlan() {
  const f = st.wsFix;
  if (!f || f.busy) return;
  f.busy = true;
  f.error = "";
  paintWorkspace();
  const got = await wsItemDo("fix", { what: f.what, name: f.name, block: f.block });
  f.busy = false;
  if (got.plan) f.plan = got.plan;
  if (got.error && !got.plan) f.error = got.error;
  paintWorkspace();
}

async function wsFixApply() {
  const f = st.wsFix;
  if (!f || f.busy) return;
  f.busy = true;
  f.error = "";
  paintWorkspace();
  const got = await wsItemDo("fix", { what: f.what, name: f.name, block: f.block, apply: true });
  if (got.ok) {
    st.wsFix = null;
    st.wsSaid = { what: "fix", text: wsFixSaid(got) };
    paintWorkspace();
    return pullWorkspace(true);
  }
  f.busy = false;
  f.error = got.error || "?";
  if (got.plan) f.plan = got.plan;
  paintWorkspace();
}

st.portaria = null;

st.portariaSaid = "";

st.portariaLink = "";

const portariaOnScreen = () => !$("portaria").hidden;

const KIND_GLYPH = { phone: "i-screen", mac: "i-local", pod: "i-cloud", peer: "i-user" };

function ptAgo(at) {
  if (!at) return phrase("never");
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return phrase("just now");
  if (mins < 60) return phrase("{n} min ago", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 48) return phrase("{n} h ago", { n: hours });
  return phrase("{n} days ago", { n: Math.round(hours / 24) });
}

function ptLeft(until) {
  const secs = Math.max(0, Math.round((until - Date.now()) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

const ptCount = (n, one, many) => (n === 1 ? phrase(one) : phrase(many, { n }));

function ptIn(at) {
  const mins = Math.round((at - Date.now()) / 60000);
  if (mins <= 0) return phrase("now");
  if (mins < 60) return phrase("in {n} min", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 48) return phrase("in {n} h", { n: hours });
  return phrase("in {n} days", { n: Math.round(hours / 24) });
}

function ptDeviceLine(one) {
  if (one.kind === "phone") {
    return `${phrase("paired {when}", { when: ptAgo(one.pairedAt) })} · ${one.online ? phrase("reading now") : phrase("last awake {when}", { when: ptAgo(one.lastSeen) })}`;
  }
  if (one.kind === "mac") {
    if (one.here) return phrase("the machine you are on");
    if (one.fromFile) return phrase("a key the trust file vouches for — no machine ever came in with it");
    return phrase("another machine of yours · {when}", { when: ptAgo(one.lastSeen) });
  }
  if (one.kind === "pod") return phrase("in the cloud · {when}", { when: ptAgo(one.lastSeen) });
  return phrase("paired {when}", { when: ptAgo(one.pairedAt) });
}

function paintPortaria() {
  const model = portariaViewModel();
  $("pt-count").textContent = model.count;
  portariaSolid.show(model);
  for (const one of $("pt-body").querySelectorAll("[data-pt]")) one.disabled = false;
}

let portariaSolid = null;

function ptPillModel(one) {
  if (one.kind === "phone") return one.online ? { cls: "pt-pill ok", say: phrase("reading") } : { cls: "pt-pill wait", say: phrase("paired") };
  if (one.kind === "pod") return { cls: "pt-pill cloud", say: phrase("cloud") };
  return { cls: "pt-pill ok", say: phrase("inside") };
}

function ptDeviceActModels(one) {
  return [{ key: "revoke", kind: "button", cls: "btn risk", pt: "revoke", dataKey: one.fingerprint, say: phrase("revoke") }];
}

function portariaViewModel() {
  if (!st.portaria) return { count: phrase("reading…"), zones: false, error: "" };
  if (st.portaria.error) {
    return { count: "", zones: false, error: st.portaria.error, shutSay: phrase("the door is shut") };
  }
  const devices = st.portaria.devices || [];
  const peers = st.portaria.peers || [];
  const invites = st.portaria.invites || [];
  const inside = peers.filter((one) => !one.fromFile).length;
  const door = st.portaria.door === "cloud" ? phrase("on the machine that stays online")
    : st.portaria.door === "local" ? phrase("on this machine only — nobody outside can knock here") : "";
  const phoneSaid = st.portaria.phone || {};
  return {
    count: [
      `${ptCount(devices.length, "1 device", "{n} devices")} · ${ptCount(inside, "1 person", "{n} people")}`,
      door
    ].filter(Boolean).join(" · "),
    zones: true, error: "",
    devicesSay: phrase("devices"), devicesCount: devices.length, pairSay: phrase("pair a device"),
    code: st.portaria.pairing ? {
      num: st.portaria.pairing.code,
      say: phrase("open {url} on the phone and type it · {left} left · works once · five wrong tries close it", { url: phoneSaid.host ? phoneSaid.host.replace(/\/sync$/, "/phone/") : "the hive address, /phone/", left: ptLeft(st.portaria.pairing.expiresAt) }),
      close: phrase("close")
    } : null,
    devices: devices.map((one) => ({
      key: one.fingerprint, icon: KIND_GLYPH[one.kind] || "i-user", title: one.name, said: ptDeviceLine(one),
      pill: ptPillModel(one),
      ghost: one.kind === "phone" ? "" : phrase("always"),
      acts: one.kind === "phone" ? ptDeviceActModels(one) : []
    })),
    devicesEmpty: { head: phrase("no device of yours is here"), say: phrase("a phone comes in with an eight-letter code") },
    behind: phoneSaid.error ? phrase("the phones could not be listed: {why}", { why: phoneSaid.error }) : phoneSaid.why || "",
    peopleSay: phrase("people"), peopleCount: inside, inviteSay: phrase("invite someone"),
    people: [
      ...peers.map((one) => ({
        key: `peer:${one.fingerprint}`, icon: "i-user",
        title: one.name && one.name !== "peer" ? one.name : one.fingerprint.slice(7, 19),
        said: one.fromFile
          ? phrase("allowed by the signers file · has never come in")
          : phrase("in since {when} · sees your seat cards and can ask for the keyboard", { when: ptAgo(one.knownAt) }),
        pill: { cls: `pt-pill ${one.fromFile ? "wait" : "ok"}`, say: one.fromFile ? phrase("by file") : phrase("inside") },
        ghost: "",
        acts: [{ key: "forget", kind: "button", cls: "btn risk", pt: "forget", dataKey: one.fingerprint, say: phrase("revoke") }]
      })),
      ...invites.map((one) => ({
        key: `invite:${one.link}`, icon: "i-user", title: phrase("an open invite"),
        said: phrase("opened {when} · nobody used it · closes {when2}", { when: ptAgo(one.at), when2: ptIn(one.expiresAt) }),
        pill: { cls: "pt-pill wait", say: phrase("invite") },
        ghost: "",
        acts: [
          { key: "copy", kind: "button", cls: "btn", pt: "copy", dataLink: one.link, say: phrase("copy the link") },
          { key: "cancel", kind: "button", cls: "btn risk", pt: "cancel", dataLink: one.link, say: phrase("cancel") }
        ]
      }))
    ],
    never: !peers.length && !(st.portaria.used || []).length
      ? { head: phrase("nobody has come in this way yet"), say: phrase("the invite works between servers and passes its tests, but the only ones that ever used it were your own two servers. Worth proving with one person before telling the team.") }
      : null,
    pasteSay: phrase("someone invited you? paste the link here"),
    pastePlaceholder: phrase("the link they sent you"),
    link: st.portariaLink,
    goSay: phrase("go in"),
    said: st.portariaSaid,
    foot: phrase("Revoking access drops whatever is open on it, right away. An invite lasts seven days and works once.")
  };
}

solidMounts.push((hive) => {
  portariaSolid = hive.mountPortaria($("pt-body"));
});

async function pullPortaria() {
  try {
    st.portaria = await (await fetch("/api/portaria")).json();
  } catch {
    st.portaria = { error: phrase("the hive on this machine did not answer") };
  }
  if (portariaOnScreen()) paintPortaria();
}

async function portariaDo(op, extra = {}) {
  st.portariaSaid = "";
  try {
    const r = await fetch("/api/portaria/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op, ...extra })
    });
    const d = await r.json();
    if (d.error) st.portariaSaid = d.error;
    return d;
  } catch (wrong) {
    st.portariaSaid = String(wrong.message || wrong);
    return { error: st.portariaSaid };
  }
}

function openPortaria() {
  screenOpens();
  releaseKeyboard();
  exitReview();
  if (prsOnScreen()) closePrs();
  if (usageOnScreen()) closeUsage();
  if (wsOnScreen()) closeWorkspace();
  if (shelfOnScreen()) closeShelf();
  if (dayOnScreen()) closeDay();
  $("portaria").hidden = false;
  paintPortaria();
  pullPortaria();
  every("portaria", 15000, pullPortaria);
  every("portaria-tick", 1000, () => { if (st.portaria?.pairing) paintPortaria(); });
}

function closePortaria() {
  $("portaria").hidden = true;
  stopBeat("portaria");
  stopBeat("portaria-tick");
}

$("btn-portaria").addEventListener("click", () => (portariaOnScreen() ? closePortaria() : openPortaria()));

$("pt-refresh").addEventListener("click", () => pullPortaria());
$("pt-close").addEventListener("click", () => closePortaria());

$("pt-body").addEventListener("input", (e) => {
  if (e.target?.id === "pt-link") st.portariaLink = e.target.value;
});

$("pt-body").addEventListener("click", async (e) => {
  const hit = e.target.closest("[data-pt]");
  if (!hit) return;
  const what = hit.dataset.pt;
  if (what === "copy") {
    try { await navigator.clipboard.writeText(hit.dataset.link || ""); st.portariaSaid = phrase("link copied · send it in a DM, not in a channel"); } catch {}
    return paintPortaria();
  }
  if (what === "join") {
    const box = $("pt-link");
    const link = String(box?.value || "").trim();
    if (!link) { st.portariaSaid = phrase("paste the link they sent you first"); return paintPortaria(); }
    hit.disabled = true;
    st.portariaLink = link;
    const done = await portariaDo("join", { link });
    if (done.joined) {
      st.portariaLink = "";
      st.portariaSaid = phrase("in — {who} is on the list now", { who: done.peer?.name || phrase("the other hive") });
    }
    await pullPortaria();
    return paintPortaria();
  }
  if (what === "revoke" || what === "forget" || what === "cancel") {
    const label = what === "cancel" ? phrase("cancel this invite?") : phrase("revoke this access? whatever is open on it drops now.");
    if (!window.confirm(label)) return;
  }
  hit.disabled = true;
  await portariaDo(what, { fingerprint: hit.dataset.key || "", link: hit.dataset.link || "" });
  await pullPortaria();
  paintPortaria();
});

function openWorkspace() {
  screenOpens();
  releaseKeyboard();
  exitReview();
  if (prsOnScreen()) closePrs();
  if (usageOnScreen()) closeUsage();
  if (portariaOnScreen()) closePortaria();
  $("workspace").hidden = false;
  paintWorkspace();
  pullWorkspace(false);
}

function closeWorkspace() {
  $("workspace").hidden = true;
  clearTimeout(wsCloneTimer);
}

$("btn-workspace").addEventListener("click", () => (wsOnScreen() ? closeWorkspace() : openWorkspace()));

$("ws-scroll").addEventListener("click", (e) => {
  if (e.target.closest("#ws-close")) return closeWorkspace();
  if (e.target.closest("#ws-refresh")) return pullWorkspace(true);
  const opener = e.target.closest("#ws-add, #ws-add-skill, #ws-add-mcp");
  if (opener) {
    const what = opener.id === "ws-add-skill" ? "skill" : opener.id === "ws-add-mcp" ? "mcp" : "repo";
    st.wsAdd = { what, typed: "", kind: "remote", plan: null, error: "", busy: false, block: {} };
    st.wsFix = null;
    st.wsSaid = null;
    paintWorkspace();
    return $("ws-scroll").querySelector("#ws-repo-in, #ws-in-name")?.focus();
  }
  const fixer = e.target.closest("[data-fix]");
  if (fixer) return wsFixStart(fixer.dataset.fix, fixer.dataset.name || "", fixer.dataset.scope || "");
  if (e.target.closest("#ws-fix-cancel")) { st.wsFix = null; return paintWorkspace(); }
  if (e.target.closest("#ws-fix-apply")) return wsFixApply();
  const more = e.target.closest("[data-show]");
  if (more) { st.wsShowAll[more.dataset.show] = !st.wsShowAll[more.dataset.show]; return paintWorkspace(); }
  const kind = e.target.closest("[data-kind]");
  if (kind && st.wsAdd) { st.wsAdd.kind = kind.dataset.kind; return paintWorkspace(); }
  if (e.target.closest("#ws-add-cancel")) { st.wsAdd = null; return paintWorkspace(); }
  if (e.target.closest("#ws-add-plan")) return wsPlan();
  if (e.target.closest("#ws-add-back")) { if (st.wsAdd) { st.wsAdd.plan = null; st.wsAdd.error = ""; } return paintWorkspace(); }
  if (e.target.closest("#ws-add-apply")) return wsApply();
  const choice = e.target.closest("[data-block]");
  if (choice) return wsChoose(choice.dataset.file, choice.dataset.block);
  const retry = e.target.closest("[data-retry]");
  if (retry) return wsRetry(retry.dataset.retry);
});

$("ws-scroll").addEventListener("input", (e) => {
  if (!st.wsAdd) return;
  if (e.target?.id === "ws-repo-in") st.wsAdd.typed = e.target.value;
  else if (e.target?.dataset?.field) st.wsAdd[e.target.dataset.field] = e.target.value;
});

$("ws-scroll").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.target?.id === "ws-repo-in" || e.target?.dataset?.field)) { e.preventDefault(); wsPlan(); }
});

export { BYTES_PER_SESSION, DAYS, KIND_GLYPH, ago, ask, button, bytes, closeConfirm, closePortaria, closeWorkspace, openPortaria, openWorkspace, paintPortaria, paintWorkspace, placeConfirm, portariaDo, portariaOnScreen, portariaSolid, portariaViewModel, ptAgo, ptCount, ptDeviceActModels, ptDeviceLine, ptIn, ptLeft, ptPillModel, pullPortaria, pullWorkspace, workspaceSolid, workspaceViewModel, wsAddModel, wsAttentionModel, wsAttentionRows, wsChipModel, wsFixPlanModel, wsItemModel, wsOnScreen, wsPlanModel, wsRepoModel };
