import { spokenNow } from "/assets/i18n.mjs";
import { $, phrase, renderMarkdown, screenOpens, solidMounts, st } from "./core.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { keyHint } from "./leader-key.js";
import { copyWithWord } from "./panel-window.js";

const DAY = 86400000;

const ARCHIVE_AFTER_DAYS = 60;

const SOON_DAYS = 14;

const GENERAL = "-";

const ARCHIVED = "archived";

const ALL = "all";

const CHART = { width: 640, height: 170, left: 30, floor: 140, top: 20 };

const CATEGORIES = ["decisions", "conventions", "incidents", "domain", "gotchas"];

const LOGIN_POLL_MS = 1500;

const LOGIN_POLL_FOR_MS = 5 * 60 * 1000;

st.mem = { tab: "memories", active: null, archived: null, stats: null, folder: ALL, origin: ALL, query: "", pick: "", detail: {}, asked: false, login: null, edit: null, confirm: "", busy: "", actError: null };

const memoriesOnScreen = () => !$("memories").hidden;

const memNow = () => st.memNow || Date.now();

const repoKey = (memory) => (memory?.repo ? memory.repo : GENERAL);

const repoSay = (repo) => (!repo || repo === GENERAL ? phrase("General") : repo);

function daysSince(iso, now = memNow()) {
  const at = Date.parse(iso || "");
  return Number.isFinite(at) ? Math.floor((now - at) / DAY) : null;
}

function daysUntilArchive(memory, now = memNow()) {
  if (!memory || memory.status === ARCHIVED || memory.origin !== "automatica" || Number(memory.retrieved_count) > 0) return null;
  const since = daysSince(memory.date, now);
  return since === null ? null : Math.max(0, ARCHIVE_AFTER_DAYS - since);
}

function agoSay(iso, now = memNow()) {
  const at = Date.parse(iso || "");
  if (!Number.isFinite(at)) return "";
  const min = Math.floor((now - at) / 60000);
  if (min < 1) return phrase("just now");
  if (min < 60) return phrase("{n} min ago", { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return phrase("{n} h ago", { n: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return phrase("yesterday");
  if (days < 14) return phrase("{n} days ago", { n: days });
  if (days < 30) return phrase("{n} weeks ago", { n: Math.floor(days / 7) });
  const months = Math.floor(days / 30);
  return months === 1 ? phrase("a month ago") : phrase("{n} months ago", { n: months });
}

function dateSay(iso) {
  const at = new Date(iso || "");
  if (Number.isNaN(at.getTime())) return "";
  return `${String(at.getDate()).padStart(2, "0")}/${String(at.getMonth() + 1).padStart(2, "0")}`;
}

function clockSay(at) {
  const when = new Date(at || 0);
  return `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
}

const thousands = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const decimal = (n, digits) => (Number(n) || 0).toLocaleString(spokenNow(), { minimumFractionDigits: digits, maximumFractionDigits: digits });

const signedIn = () => st.mem.login?.state === "in";

const canWrite = () => signedIn() && st.mem.login?.canEdit !== false && !!st.mem.login?.email;

const sameMonth = (iso, now) => {
  const at = new Date(iso || "");
  const here = new Date(now);
  return !Number.isNaN(at.getTime()) && at.getUTCFullYear() === here.getUTCFullYear() && at.getUTCMonth() === here.getUTCMonth();
};

function spendModel(spend, now) {
  if (!spend || !Number.isFinite(Number(spend.month_usd)) || !sameMonth(spend.updated_at, now)) return null;
  const month = Number(spend.month_usd) || 0;
  const cap = Number(spend.cap_usd) || 0;
  const share = cap > 0 ? Math.min(100, Math.round((month / cap) * 100)) : 0;
  const calls = Number(spend.requests) || 0;
  const when = agoSay(spend.updated_at, now);
  return {
    value: `US$ ${decimal(month, 2)}`,
    say: cap > 0 ? phrase("Jev's spend in the month, of US$ {cap}", { cap: decimal(cap, 0) }) : phrase("Jev's spend in the month"),
    bar: cap > 0 ? share : null,
    hot: cap > 0 && share >= 80,
    sub: [calls === 1 ? phrase("1 call") : phrase("{n} calls", { n: thousands(calls) }), when ? phrase("updated {when}", { when }) : ""].filter(Boolean).join(" · ")
  };
}

function judgeHealth(health) {
  const calls = Number(health?.calls) || 0;
  if (!calls) return null;
  const answered = Math.max(0, calls - (Number(health.fallbacks) || 0));
  const share = (answered / calls) * 100;
  return {
    share,
    say: phrase("Jev answered in {share}% of the searches · +{seconds} s on average", { share: decimal(share, share >= 99.95 || share < 10 ? 0 : 1), seconds: decimal((Number(health.avg_ms) || 0) / 1000, 1) }),
    good: share >= 95
  };
}

function unansweredModel(unanswered, now) {
  if (!unanswered || !Number.isFinite(Number(unanswered.total))) return null;
  return {
    say: phrase("Questions without an answer"),
    periodSay: phrase("in the period"),
    total: thousands(unanswered.total),
    totalSay: phrase("searches where no memory helped"),
    cap: phrase("It is what the team asks and the memory does not know yet."),
    rows: (unanswered.top || []).slice(0, 5).map((one, at) => {
      const count = Number(one?.count) || 0;
      const when = agoSay(one?.last_at, now);
      return {
        key: `${at}:${String(one?.topic ?? "")}`,
        topic: String(one?.topic ?? ""),
        n: [count === 1 ? phrase("once") : phrase("{n} times", { n: thousands(count) }), when].filter(Boolean).join(" · ")
      };
    }),
    none: (unanswered.top || []).length ? "" : phrase("Every search found something in the period.")
  };
}

const usesSay = (n) => (Number(n) === 1 ? phrase("1 use") : phrase("{n} uses", { n: Number(n) || 0 }));

function weekStart(now = memNow()) {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day.getTime();
}

function newThisWeek(list, now = memNow()) {
  const from = weekStart(now);
  return (list || []).filter((one) => Date.parse(one.date || "") >= from).length;
}

function memoryFolders(active, archived) {
  const counts = new Map();
  for (const one of active || []) counts.set(repoKey(one), (counts.get(repoKey(one)) || 0) + 1);
  const repos = [...counts].filter(([key]) => key !== GENERAL).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return [
    { key: ALL, n: (active || []).length },
    ...repos.map(([key, n]) => ({ key, n })),
    { key: GENERAL, n: counts.get(GENERAL) || 0 },
    { key: ARCHIVED, n: (archived || []).length }
  ];
}

function shownMemories(active, archived, { folder = ALL, origin = ALL, query = "" } = {}) {
  const q = String(query).trim().toLowerCase();
  const pool = folder === ARCHIVED ? archived || [] : (active || []).filter((one) => folder === ALL || repoKey(one) === folder);
  return pool
    .filter((one) => origin === ALL || one.origin === origin)
    .filter((one) => !q || `${one.title} ${one.snippet || ""} ${(one.tags || []).join(" ")} ${one.category || ""} ${one.author || ""}`.toLowerCase().includes(q))
    .sort((a, b) => (Number(b.retrieved_count) || 0) - (Number(a.retrieved_count) || 0) || Date.parse(b.date || 0) - Date.parse(a.date || 0));
}

function weeklyChart(weekly, box = CHART) {
  const weeks = weekly || [];
  const totals = weeks.map((one) => (Number(one.automatica) || 0) + (Number(one.manual) || 0));
  const peak = Math.max(1, ...totals);
  const step = peak <= 10 ? 5 : peak <= 40 ? 10 : Math.ceil(peak / 4 / 10) * 10;
  const top = Math.max(step, Math.ceil(peak / step) * step);
  const tall = box.floor - box.top;
  const slot = weeks.length ? (box.width - box.left) / weeks.length : 0;
  const bar = Math.max(4, Math.round(slot * 0.68));
  const scale = (n) => (n / top) * tall;
  const firstAuto = weeks.findIndex((one) => Number(one.automatica) > 0);
  const bridgeAt = firstAuto > 0 ? firstAuto : -1;
  return {
    width: box.width, height: box.height, floor: box.floor, left: box.left,
    ticks: Array.from({ length: Math.floor(top / step) + 1 }, (_, at) => ({ value: at * step, y: box.floor - scale(at * step) })),
    bars: weeks.map((one, at) => {
      const auto = Number(one.automatica) || 0;
      const hand = Number(one.manual) || 0;
      const x = box.left + at * slot + (slot - bar) / 2;
      const autoH = scale(auto);
      const handH = scale(hand);
      return {
        key: one.week, x, w: bar,
        autoY: box.floor - autoH, autoH,
        handY: box.floor - autoH - handH, handH,
        label: at % 2 === 0 ? String(one.week || "").replace(/^\d{4}-/, "") : "",
        auto, hand
      };
    }),
    bridgeX: bridgeAt > 0 ? box.left + bridgeAt * slot : null
  };
}

function bridgeCeilingHeld(daily, ceiling = 10) {
  return (daily || []).length > 0 && (daily || []).every((one) => (Number(one.bridge_created) || 0) < ceiling);
}

function judgeFunnel(judge) {
  const j = judge || {};
  const created = Number(j.bridge_created) || 0;
  const updated = Number(j.bridge_updated) || 0;
  const discarded = Number(j.bridge_discarded) || 0;
  const duplicates = Number(j.duplicates_blocked) || 0;
  const came = created + updated + discarded + duplicates;
  const share = (n) => (came ? Math.max(n ? 2 : 0, Math.round((n / came) * 100)) : 0);
  return {
    came,
    rows: [
      { key: "came", n: came, share: came ? 100 : 0, on: false },
      { key: "discarded", n: discarded, share: share(discarded), on: false },
      { key: "duplicates", n: duplicates, share: share(duplicates), on: false },
      { key: "created", n: created, share: share(created), on: true },
      { key: "updated", n: updated, share: share(updated), on: false }
    ],
    judged: Number(j.candidates_judged) || 0,
    cutShare: j.candidates_judged ? Math.round(((Number(j.cut_by_judge) || 0) / j.candidates_judged) * 100) : 0,
    helped: Math.max(0, (Number(j.candidates_judged) || 0) - (Number(j.cut_by_judge) || 0)),
    searches: Number(j.searches) || 0
  };
}

function lastWeeksAdded(weekly, weeks = 4) {
  return (weekly || []).slice(-weeks).reduce((n, one) => n + (Number(one.automatica) || 0) + (Number(one.manual) || 0), 0);
}

function repoBars(byRepo, keep = 6) {
  const rows = [...(byRepo || [])].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, keep);
  const peak = Math.max(1, ...rows.map((one) => one.count || 0));
  return rows.map((one, at) => ({ key: one.repo || GENERAL, say: repoSay(one.repo), n: one.count || 0, share: Math.round(((one.count || 0) / peak) * 100), on: at === 0 }));
}

function soonArchived(active, now = memNow(), within = SOON_DAYS) {
  return (active || []).filter((one) => {
    const left = daysUntilArchive(one, now);
    return left !== null && left <= within;
  }).length;
}

const originSay = (origin) => (origin === "automatica" ? phrase("automatic") : phrase("written by hand"));

function folderSay(key) {
  if (key === ALL) return phrase("All memories");
  if (key === ARCHIVED) return phrase("Archived");
  return repoSay(key);
}

function rowModel(one, now) {
  const left = daysUntilArchive(one, now);
  return {
    key: one.id, id: one.id, title: one.title || "", snippet: one.snippet || "",
    uses: usesSay(one.retrieved_count),
    origin: one.origin === "automatica" ? "auto" : "hand", originSay: originSay(one.origin),
    category: one.category || "", author: one.author || "", when: agoSay(one.date, now),
    repo: one.repo ? "" : phrase("General"),
    fades: left === null ? "" : left === 0 ? phrase("archives today if nobody uses it") : left === 1 ? phrase("archives tomorrow if nobody uses it") : phrase("archives in {n} days if nobody uses it", { n: left }),
    gone: one.status === ARCHIVED ? (one.archived_reason === "unused" ? phrase("archived: nobody used it") : phrase("archived: by a person")) : "",
    here: one.id === st.mem.pick
  };
}

const HISTORY_SHOWN = 6;
const HISTORY_SAY = { edited: "edited", merged: "added to", archived: "archived it", unarchived: "unarchived" };
const VIA_SAY = { chat: "in a chat", painel: "in the panel", ponte: "by the team memory bridge", automatico: "unused for too long" };

function historyRows(memory) {
  const history = Array.isArray(memory.history) ? memory.history.filter((one) => one && HISTORY_SAY[one.action] && one.by && one.at) : [];
  if (!history.length) {
    if (!memory.updated_by) return [];
    const at = memory.updated_at || memory.updated;
    return [{ key: "edited", say: phrase("edited"), value: at ? phrase("by {who} on {date}", { who: memory.updated_by, date: dateSay(at) }) : phrase("by {who}", { who: memory.updated_by }) }];
  }
  return history.slice(-HISTORY_SHOWN).reverse().map((one, at) => ({
    key: `history-${at}`,
    say: phrase(HISTORY_SAY[one.action]),
    value: [phrase("by {who} on {date}", { who: one.by, date: dateSay(`${one.at}T12:00:00`) }), VIA_SAY[one.via] ? phrase(VIA_SAY[one.via]) : ""].filter(Boolean).join(" · ")
  }));
}

function detailModel(one, now) {
  if (!one) return null;
  const full = st.mem.detail[one.id];
  const memory = full?.memory ? { ...one, ...full.memory } : one;
  const auto = memory.origin === "automatica";
  const where = memory.repo || phrase("General");
  const content = String(memory.content || "").replace(/^#\s+(.+)\n+/, (line, head) => (head.trim() === String(memory.title).trim() ? "" : line));
  const used = Number(memory.retrieved_count) || 0;
  return {
    key: memory.id, id: memory.id, title: memory.title,
    origin: auto ? "auto" : "hand", originSay: originSay(memory.origin),
    crumb: [memory.category, where].filter(Boolean).join(" · "),
    rows: [
      { key: "author", say: phrase("author"), value: auto ? phrase("{who}, from a conversation in {repo}", { who: memory.author || "?", repo: where }) : memory.author || "?" },
      { key: "created", say: phrase("created"), value: auto ? phrase("{date}, by the team memory bridge", { date: dateSay(memory.date) }) : dateSay(memory.date) },
      { key: "used", say: phrase("used"), value: used ? `${used === 1 ? phrase("once in searches") : phrase("{n} times in searches", { n: used })}${memory.last_retrieved_at ? ` · ${phrase("last {when}", { when: agoSay(memory.last_retrieved_at, now) })}` : ""}` : phrase("never in a search yet") },
      ...(memory.tags?.length ? [{ key: "tags", say: phrase("tags"), value: memory.tags.join(" · ") }] : []),
      ...historyRows(memory)
    ],
    html: content ? renderMarkdown(content) : "",
    snippet: content ? "" : memory.snippet || "",
    loading: !full && !content,
    archived: memory.status === ARCHIVED,
    can: canWrite(),
    canEdit: canWrite() && !!full?.memory,
    confirm: st.mem.confirm === memory.id,
    busy: st.mem.busy === memory.id,
    error: st.mem.actError?.id === memory.id ? st.mem.actError.say : "",
    archiveSay: phrase("Archive"), unarchiveSay: phrase("Unarchive"), editSay: phrase("Edit"), copySay: phrase("Copy the text"),
    confirmSay: phrase("Archive this memory? It stops showing up in the chats' searches, and it can come back from the Archived folder."),
    confirmYes: phrase("Archive"), confirmNo: phrase("Cancel"), busySay: phrase("saving…"),
    lock: canWrite() ? null : lockModel(),
    copyText: `${memory.title}\n\n${content || memory.snippet || ""}`.trim()
  };
}

function lockModel() {
  const login = loginModel();
  if (login.state === "in") return { say: phrase("your account has no e-mail, so it cannot edit"), button: "" };
  if (login.state === "pod" || login.state === "no-vault" || login.state === "waiting") return { say: login.say, button: "" };
  if (login.state === "unknown") return { say: phrase("editing and archiving ask you to sign in"), button: "" };
  if (login.missing) return { say: login.error, button: "" };
  return { say: phrase("editing and archiving ask you to sign in with your Google account"), button: login.inSay };
}

function noticeSay(notice) {
  return ({
    expired: phrase("your sign-in expired — sign in again"),
    timeout: phrase("the sign-in waited 5 minutes and gave up"),
    refused: phrase("the sign-in was refused in the browser"),
    failed: phrase("the sign-in did not finish — try again")
  })[notice] || "";
}

function loginModel() {
  const login = st.mem.login;
  if (!login) return { state: "unknown" };
  const demo = login.demo ? phrase("sample login") : "";
  if (login.state === "in") return { state: "in", email: login.email || phrase("account without e-mail"), demo, outSay: phrase("sign out"), title: phrase("signed in as {email}", { email: login.email || "" }) };
  if (login.state === "waiting") return { state: "waiting", say: phrase("finish signing in in the browser…"), againSay: phrase("open it again"), cancelSay: phrase("cancel"), url: login.url || "" };
  if (login.reach === "pod") return { state: "pod", say: phrase("signing in only works in the Hive on your machine") };
  if (login.reach === "no-vault") return { state: "no-vault", say: phrase("this machine has no keychain to keep the sign-in") };
  const missing = login.configured === false;
  const error = missing ? loginErrorSay(MISSING_ADDRESS) : loginErrorSay(login.error);
  return { state: "out", inSay: phrase("Sign in with Google"), busy: st.mem.busy === "login", disabled: missing, missing, error, notice: error ? "" : noticeSay(login.notice), demo };
}

const MISSING_ADDRESS = "HIVE_MEMORY_URL is not set";

function loginErrorSay(why) {
  if (!why) return "";
  if (why === MISSING_ADDRESS) return phrase("The memory address is not set up in this Hive. Run infra/scripts/setup.sh again and reopen the Hive.");
  if (why === "network") return phrase("The Hive did not answer the sign-in. Check that it is still open and try again.");
  return phrase("The sign-in did not start. Try again in a moment ({why}).", { why });
}

function signInError(said) {
  if (said.status === 0) return "network";
  const why = String(said.body?.why || "");
  if (why === "pod" || why === "no-vault") return "";
  return why || `HTTP ${said.status}`;
}

function editorModel(memory) {
  const edit = st.mem.edit;
  if (!edit || !memory || edit.id !== memory.id) return null;
  return {
    key: `edit:${edit.id}`, id: edit.id,
    whoSay: phrase("editing as"), email: st.mem.login?.email || "",
    authorSay: memory.author ? phrase("original author {who}", { who: memory.author }) : "",
    titleSay: phrase("Title"), title: edit.title,
    categorySay: phrase("Kind"), category: edit.category,
    categories: CATEGORIES.map((key) => ({ key, say: key })),
    tagsSay: phrase("Tags"),
    tags: edit.tags.map((tag) => ({ key: tag, say: tag, dropSay: phrase("remove the tag {tag}", { tag }) })),
    tagDraft: edit.tagDraft, tagPlaceholder: phrase("+ tag"),
    contentSay: phrase("Content"), content: edit.content,
    view: edit.view, writeSay: phrase("Write"), previewSay: phrase("Preview"),
    preview: edit.view === "preview" ? renderMarkdown(edit.content || "") : "",
    saveSay: edit.saving ? phrase("saving…") : phrase("Save"), cancelSay: phrase("Cancel"),
    note: phrase("the edit carries your name"),
    saving: edit.saving, error: edit.error || ""
  };
}

function headModel() {
  const answer = st.mem.active;
  const fresh = answer?.memories ? newThisWeek(answer.memories) : 0;
  return {
    title: phrase("Memories"),
    tabs: [
      { key: "memories", say: phrase("Memories"), on: st.mem.tab === "memories" },
      { key: "summary", say: phrase("Summary"), on: st.mem.tab === "summary" }
    ],
    fresh: fresh ? (fresh === 1 ? phrase("1 new this week") : phrase("{n} new this week", { n: fresh })) : "",
    source: answer?.source ? (signedIn() ? answer.source : phrase("{source} · read only", { source: answer.source })) : "",
    login: loginModel(),
    demo: answer?.demo ? phrase("sample data") : "",
    demoHint: phrase("the memory server does not answer these routes yet, so the panel shows made-up memories"),
    key: keyHint("memories"),
    closeSay: phrase("close")
  };
}

function withCodes(text, codes) {
  const marks = (codes || []).filter(Boolean);
  if (!marks.length) return [{ text, code: false }];
  const pattern = new RegExp(`(${marks.map((one) => one.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`);
  return String(text).split(pattern).filter(Boolean).map((part) => ({ text: part, code: marks.includes(part) }));
}

function blockedModel(answer) {
  if (!answer) return null;
  if (answer.state === "no-token" || answer.state === "refused") {
    return {
      key: answer.state,
      label: phrase("no access"),
      head: answer.state === "refused" ? phrase("The memory server refused the Hive's token") : phrase("The Hive does not read the shared memory yet"),
      lines: (answer.state === "refused"
        ? [phrase("{key} in the hub .env was rejected. Ask for a new read token and put it in its place.", { key: answer.key })]
        : [phrase("The read token {key} is missing from the hub .env. On a server, it arrives through {script}.", { key: answer.key, script: "pod-env.sh" }), phrase("The hive doctor shows the same warning.")])
        .map((line) => withCodes(line, [answer.key, "pod-env.sh"])),
      button: phrase("Open the doctor")
    };
  }
  if (answer.state === "no-server") {
    return {
      key: "no-server",
      label: phrase("no access"),
      head: phrase("The Hive does not know where the shared memory lives"),
      lines: [phrase("Set {key} in {file}, or run the setup again to pick it up from the deployment defaults.", { key: answer.key, file: "~/.hive/config" })].map((line) => withCodes(line, [answer.key, "~/.hive/config"])),
      button: phrase("Open the doctor")
    };
  }
  if (answer.state === "down" && !answer.memories) {
    return { key: "down", label: phrase("error"), head: phrase("{source} did not answer", { source: answer.source }), lines: [withCodes(phrase("No list was kept on this machine yet. The chats keep searching the memory without the judge."))], button: phrase("try again"), retry: true };
  }
  return null;
}

function troubleModel(answer) {
  if (answer?.state !== "down" || !answer.memories) return null;
  return {
    head: phrase("{source} did not answer", { source: answer.source }),
    say: phrase("Showing the last list the Hive kept, from {clock}. Nothing is lost: the chats keep searching the memory without the judge.", { clock: clockSay(answer.keptAt) }),
    retry: phrase("try again")
  };
}

function listModel(now) {
  const active = st.mem.active?.memories || [];
  const archived = st.mem.archived?.memories || [];
  const shown = shownMemories(active, archived, st.mem);
  if (!shown.some((one) => one.id === st.mem.pick)) st.mem.pick = shown[0]?.id || "";
  const where = st.mem.folder === ALL ? phrase("every memory") : folderSay(st.mem.folder);
  return {
    folders: memoryFolders(active, archived).map((one) => ({ ...one, say: folderSay(one.key), on: one.key === st.mem.folder, archived: one.key === ARCHIVED, all: one.key === ALL })),
    reposSay: phrase("Repositories"), stateSay: phrase("Status"),
    search: { placeholder: phrase("Search in {where}…", { where }), value: st.mem.query },
    origins: [
      { key: ALL, say: phrase("All kinds"), on: st.mem.origin === ALL },
      { key: "automatica", say: phrase("Automatic"), on: st.mem.origin === "automatica" },
      { key: "manual", say: phrase("Written by hand"), on: st.mem.origin === "manual" }
    ],
    rows: shown.map((one) => rowModel(one, now)),
    empty: shown.length ? null : emptyModel(),
    detail: detailModel(shown.find((one) => one.id === st.mem.pick), now),
    editor: editorModel(pickedMemory(shown)),
    editing: !!st.mem.edit
  };
}

function pickedMemory(shown) {
  const one = (shown || shownMemories(st.mem.active?.memories, st.mem.archived?.memories, st.mem)).find((row) => row.id === st.mem.pick);
  if (!one) return null;
  const full = st.mem.detail[one.id]?.memory;
  return full ? { ...one, ...full } : one;
}

function emptyModel() {
  if (st.mem.query.trim() || st.mem.origin !== ALL) {
    return { head: phrase("Nothing matches"), lines: [phrase("No memory here with those words or that origin.")], button: phrase("See every memory") };
  }
  if (st.mem.folder === ARCHIVED) return { head: phrase("Nothing archived"), lines: [phrase("A memory nobody uses for 60 days lands here.")], button: phrase("See every memory") };
  return {
    head: phrase("No memory from {repo} yet", { repo: folderSay(st.mem.folder) }),
    lines: [
      phrase("Memories arrive on their own when a conversation in this repository proves useful: someone promotes it, or it comes back in 5 searches. The bridge runs every night."),
      phrase("To record something now, ask the chat: “save it in the shared memory”.")
    ],
    button: phrase("See every memory")
  };
}

function summaryModel(now) {
  const answer = st.mem.stats;
  if (!answer || answer.state === "loading") return { loading: true, say: phrase("reading the numbers…") };
  const stats = answer.stats;
  if (!stats) return { loading: false, missing: true, say: phrase("{source} did not answer", { source: answer.source || "memory" }) };
  const totals = stats.totals || {};
  const both = (Number(totals.automatica) || 0) + (Number(totals.manual) || 0);
  const funnel = judgeFunnel(stats.judge);
  const chart = weeklyChart(stats.weekly);
  const unused = stats.archived_unused || [];
  const soon = soonArchived(st.mem.active?.memories, now);
  const spend = spendModel(stats.spend, now);
  const health = judgeHealth(stats.judge?.health);
  const funnelSay = (key) => ({
    came: phrase("candidates from the team memory"),
    discarded: phrase("discarded by Jev"),
    duplicates: phrase("blocked as duplicates"),
    created: phrase("became a new memory"),
    updated: phrase("updated one that existed")
  })[key];
  return {
    loading: false,
    kpis: [
      { key: "active", value: thousands(totals.active), say: phrase("active memories"), sub: phrase("+{n} in the last 4 weeks", { n: lastWeeksAdded(stats.weekly) }), good: true },
      { key: "auto", value: both ? `${Math.round(((Number(totals.automatica) || 0) / both) * 100)}%` : "—", say: phrase("came in on their own through the bridge"), sub: phrase("{auto} automatic · {hand} by hand", { auto: thousands(totals.automatica), hand: thousands(totals.manual) }), accent: true },
      { key: "helped", value: thousands(funnel.helped), say: phrase("times a memory reached a chat, in the period"), sub: phrase("{n} searches", { n: thousands(funnel.searches) }), good: true },
      spend
        ? { key: "cost", value: spend.value, say: spend.say, sub: spend.sub, bar: spend.bar, hot: spend.hot, muted: true }
        : { key: "cost", value: "—", say: phrase("Jev's spend in the month"), sub: phrase("see it in ai-costs"), muted: true }
    ],
    chartSay: phrase("New memories per week"),
    autoSay: phrase("automatic ones"), handSay: phrase("by hand"),
    chartTitle: phrase("New memories per week, automatic and by hand"),
    chart,
    bridgeSay: phrase("bridge on"),
    chartCap: [chart.bridgeX !== null ? phrase("Before the bridge, only what someone wrote by hand came in.") : "", bridgeCeilingHeld(stats.daily) ? phrase("The ceiling of 10 a day was never reached.") : ""].filter(Boolean).join(" "),
    funnelSay: phrase("What Jev did in the period"),
    funnel: funnel.rows.map((one) => ({ ...one, say: funnelSay(one.key), n: thousands(one.n) })),
    funnelCap: funnel.judged ? phrase("In search: {n} candidates judged, {share}% cut for not helping the request.", { n: thousands(funnel.judged), share: funnel.cutShare }) : "",
    health: health ? health.say : "",
    healthGood: !!health?.good,
    unanswered: unansweredModel(stats.unanswered, now),
    reposSay: phrase("Where they come from"),
    repos: repoBars(stats.by_repo),
    topSay: phrase("Most used"), usesSay: phrase("uses"),
    top: (stats.top_retrieved || []).slice(0, 5).map((one) => ({ key: one.id, id: one.id, title: one.title, n: thousands(one.retrieved_count) })),
    cleanSay: phrase("Cleanup"),
    cleanCount: thousands(unused.length),
    cleanLine: phrase("archived because nobody used them in 60 days"),
    cleanRows: unused.slice(0, 2).map((one) => ({ key: one.id, title: one.title, when: dateSay(one.archived_at) })),
    soon: soon ? (soon === 1 ? phrase("1 will be archived in the next 14 days") : phrase("{n} will be archived in the next 14 days", { n: soon })) : ""
  };
}

function memoriesViewModel(now = memNow()) {
  const head = headModel();
  const blocked = blockedModel(st.mem.active);
  return {
    head,
    tab: st.mem.tab,
    loading: !st.mem.active,
    loadingSay: phrase("reading the shared memory…"),
    blocked,
    trouble: troubleModel(st.mem.active),
    list: blocked || !st.mem.active ? null : listModel(now),
    summary: st.mem.tab === "summary" && !blocked && st.mem.active ? summaryModel(now) : null
  };
}

let memoriesSolid = null;

function paintMemories() {
  if (!memoriesSolid || !memoriesOnScreen()) return;
  memoriesSolid.show(memoriesViewModel());
}

async function getJson(path) {
  const r = await fetch(path);
  return r.json();
}

async function pullMemories(fresh = false) {
  const tail = fresh ? "&fresh=1" : "";
  try {
    const [active, archived] = await Promise.all([getJson(`/api/memories?status=active${tail}`), getJson(`/api/memories?status=archived${tail}`)]);
    st.mem.active = active;
    st.mem.archived = archived;
  } catch {
    st.mem.active = { state: "down", source: "memory", memories: st.mem.active?.memories, keptAt: st.mem.active?.at };
  }
  paintMemories();
  if (st.mem.tab === "summary") pullMemoryStats(fresh);
  pickMemory(st.mem.pick);
}

async function send(path, payload = {}) {
  try {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    let body = {};
    try { body = await r.json(); } catch {}
    return { status: r.status ?? 200, ok: r.ok, body: body || {} };
  } catch {
    return { status: 0, ok: false, body: { state: "down" } };
  }
}

let loginPoll = null;

async function pullLogin() {
  try {
    st.mem.login = await getJson("/api/memories/login");
  } catch {
    st.mem.login = st.mem.login || { state: "out", reach: "here" };
  }
  paintMemories();
  return st.mem.login;
}

function waitForLogin(until = Date.now() + LOGIN_POLL_FOR_MS) {
  clearTimeout(loginPoll);
  loginPoll = setTimeout(async () => {
    if (!memoriesOnScreen()) return;
    const was = st.mem.login?.state;
    const now = await pullLogin();
    if (now?.state === "waiting" && Date.now() < until) return waitForLogin(until);
    if (was === "waiting" && now?.state === "in") pullMemories(true);
  }, LOGIN_POLL_MS);
}

async function signIn() {
  if (st.mem.login?.configured === false || st.mem.busy === "login") return;
  st.mem.busy = "login";
  paintMemories();
  const said = await send("/api/memories/login");
  st.mem.busy = "";
  if (said.ok) {
    st.mem.login = said.body;
    if (said.body.state === "waiting") waitForLogin();
    if (said.body.state === "in") pullMemories(true);
  } else {
    st.mem.login = { ...(st.mem.login || {}), ...said.body, state: "out", error: signInError(said) };
  }
  paintMemories();
}

async function cancelSignIn() {
  clearTimeout(loginPoll);
  const said = await send("/api/memories/login/cancel");
  st.mem.login = said.ok ? said.body : { state: "out", reach: st.mem.login?.reach };
  paintMemories();
}

async function signOut() {
  st.mem.edit = null;
  st.mem.confirm = "";
  const said = await send("/api/memories/logout");
  st.mem.login = said.ok ? said.body : { state: "out", reach: st.mem.login?.reach };
  paintMemories();
}

function openOutside(url) {
  if (!url) return;
  if (window.seatBrowser?.openExternal) window.seatBrowser.openExternal(url);
  else window.open(url, "_blank", "noopener");
}

function writeErrorSay(said) {
  const state = said.body?.state || (said.status === 0 ? "down" : "");
  if (state === "out" || said.status === 401) return phrase("your sign-in expired — sign in again to save");
  if (state === "forbidden" || said.status === 403) return phrase("your account cannot edit this memory");
  if (state === "unsupported" || said.status === 501) return phrase("the memory server does not have this feature yet");
  if (state === "gone" || said.status === 404) return phrase("this memory is no longer on the memory server");
  if (state === "bad" || said.status === 400) return phrase("the memory server refused the change: {why}", { why: String(said.body?.why || "?") });
  return phrase("the memory server did not answer — nothing was saved");
}

function signedOutBy(said) {
  if (said.status !== 401 && said.body?.state !== "out") return;
  st.mem.login = { ...(st.mem.login || {}), state: "out", email: "", notice: "expired" };
}

function changeListed(memory, to) {
  const keys = to === ARCHIVED ? ["active", "archived"] : to === "active" ? ["archived", "active"] : null;
  if (!keys) {
    for (const key of ["active", "archived"]) {
      if (!st.mem[key]?.memories) continue;
      st.mem[key] = { ...st.mem[key], memories: st.mem[key].memories.map((one) => (one.id === memory.id ? { ...one, ...memory, content: undefined } : one)) };
    }
    return;
  }
  const [from, into] = keys;
  const was = (st.mem[from]?.memories || []).find((one) => one.id === memory.id) || {};
  const moved = { ...was, ...memory, content: undefined, status: to === ARCHIVED ? "archived" : "active" };
  if (st.mem[from]?.memories) st.mem[from] = { ...st.mem[from], memories: st.mem[from].memories.filter((one) => one.id !== memory.id) };
  if (st.mem[into]?.memories) st.mem[into] = { ...st.mem[into], memories: [moved, ...st.mem[into].memories.filter((one) => one.id !== memory.id)] };
}

function askArchive(id) {
  st.mem.confirm = id;
  st.mem.actError = null;
  paintMemories();
  requestAnimationFrame(() => $("memories").querySelector("[data-mem-confirm-yes]")?.focus());
}

async function archiveMemory(id, kind) {
  st.mem.busy = id;
  st.mem.actError = null;
  paintMemories();
  const said = await send(`/api/memories/${kind}`, { id });
  st.mem.busy = "";
  st.mem.confirm = "";
  if (said.ok && said.body?.state === "ok") {
    const memory = { ...(said.body.memory || { id }), id };
    st.mem.detail[id] = { state: "ok", memory: { ...(st.mem.detail[id]?.memory || {}), ...memory } };
    changeListed(memory, kind === "archive" ? ARCHIVED : "active");
    paintMemories();
    pullMemories(true);
    return;
  }
  signedOutBy(said);
  st.mem.actError = { id, say: writeErrorSay(said) };
  paintMemories();
}

function startEdit() {
  const memory = pickedMemory();
  if (!memory || !canWrite()) return;
  const was = { title: String(memory.title || ""), category: CATEGORIES.includes(memory.category) ? memory.category : CATEGORIES[0], tags: [...(memory.tags || [])], content: String(memory.content || "") };
  st.mem.confirm = "";
  st.mem.actError = null;
  st.mem.edit = { id: memory.id, ...was, tags: [...was.tags], tagDraft: "", view: "write", saving: false, error: "", was };
  paintMemories();
  requestAnimationFrame(() => $("memories").querySelector("[data-mem-edit='title']")?.focus());
}

function cleanTag(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/^#/, "").slice(0, 40);
}

function addTags(text) {
  const edit = st.mem.edit;
  if (!edit) return;
  for (const part of String(text).split(",")) {
    const tag = cleanTag(part);
    if (tag && !edit.tags.includes(tag) && edit.tags.length < 12) edit.tags.push(tag);
  }
}

function editField(key, value, field = null) {
  const edit = st.mem.edit;
  if (!edit) return;
  if (key === "tagDraft" && value.includes(",")) {
    const parts = value.split(",");
    addTags(parts.slice(0, -1).join(","));
    edit.tagDraft = parts.at(-1);
    if (field) field.value = edit.tagDraft;
    paintMemories();
    return;
  }
  edit[key] = value;
  if (key === "category" || key === "view") paintMemories();
}

function tagKey(ev) {
  const edit = st.mem.edit;
  if (!edit) return;
  if (ev.key === "Enter" && edit.tagDraft.trim()) {
    ev.preventDefault();
    addTags(edit.tagDraft);
    edit.tagDraft = "";
    ev.currentTarget.value = "";
    paintMemories();
  } else if (ev.key === "Backspace" && !ev.currentTarget.value && edit.tags.length) {
    edit.tags.pop();
    paintMemories();
  }
}

function dropTag(tag) {
  if (!st.mem.edit) return;
  st.mem.edit.tags = st.mem.edit.tags.filter((one) => one !== tag);
  paintMemories();
}

function editChanges(edit) {
  const out = {};
  if (edit.title.trim() !== edit.was.title.trim()) out.title = edit.title.trim();
  if (edit.category !== edit.was.category) out.category = edit.category;
  if (edit.content !== edit.was.content) out.content = edit.content;
  if (edit.tags.join("\n") !== edit.was.tags.join("\n")) out.tags = [...edit.tags];
  return out;
}

async function saveEdit() {
  const edit = st.mem.edit;
  if (!edit || edit.saving) return;
  if (edit.tagDraft.trim()) { addTags(edit.tagDraft); edit.tagDraft = ""; }
  if (!edit.title.trim()) { edit.error = phrase("the title cannot be empty"); paintMemories(); return; }
  if (!edit.content.trim()) { edit.error = phrase("the content cannot be empty"); paintMemories(); return; }
  const changes = editChanges(edit);
  if (!Object.keys(changes).length) { st.mem.edit = null; paintMemories(); return; }
  edit.saving = true;
  edit.error = "";
  paintMemories();
  const said = await send("/api/memories/edit", { id: edit.id, ...changes });
  if (st.mem.edit !== edit) return;
  edit.saving = false;
  if (said.ok && said.body?.state === "ok") {
    const memory = { ...(said.body.memory || {}), id: edit.id };
    st.mem.detail[edit.id] = { state: "ok", memory: { ...(st.mem.detail[edit.id]?.memory || {}), ...changes, ...memory } };
    changeListed({ ...changes, ...memory }, null);
    st.mem.edit = null;
    paintMemories();
    return;
  }
  signedOutBy(said);
  edit.error = writeErrorSay(said);
  paintMemories();
}

function cancelEdit() {
  st.mem.edit = null;
  paintMemories();
}

function memoryEscape() {
  if (st.mem.edit) { cancelEdit(); return true; }
  if (st.mem.confirm) { st.mem.confirm = ""; paintMemories(); return true; }
  return false;
}

const inMemoryEditor = (target) => !!target?.closest?.("#memories .mem-editor");

async function pullMemoryStats(fresh = false) {
  try {
    st.mem.stats = await getJson(`/api/memories/stats?weeks=12${fresh ? "&fresh=1" : ""}`);
  } catch {
    st.mem.stats = { state: "down", stats: null, source: "memory" };
  }
  paintMemories();
}

async function pullMemory(id) {
  if (!id || st.mem.detail[id]) return;
  try {
    const said = await getJson(`/api/memories/one?id=${encodeURIComponent(id)}`);
    if (said?.memory) st.mem.detail[id] = said;
  } catch {}
  paintMemories();
}

function pickMemory(id) {
  if (st.mem.edit && st.mem.edit.id !== id) st.mem.edit = null;
  if (st.mem.confirm && st.mem.confirm !== id) st.mem.confirm = "";
  st.mem.pick = id || "";
  paintMemories();
  if (st.mem.pick) pullMemory(st.mem.pick);
}

function setMemoryFolder(key) {
  st.mem.folder = key;
  st.mem.pick = "";
  paintMemories();
  pickMemory(st.mem.pick);
}

function setMemoryTab(tab) {
  st.mem.tab = tab === "summary" ? "summary" : "memories";
  paintMemories();
  if (st.mem.tab === "summary" && !st.mem.stats) pullMemoryStats(false);
}

function stepMemory(step) {
  const rows = shownMemories(st.mem.active?.memories, st.mem.archived?.memories, st.mem);
  if (!rows.length) return;
  const at = rows.findIndex((one) => one.id === st.mem.pick);
  pickMemory(rows[(at + step + rows.length) % rows.length].id);
  $("memories").querySelector(`[data-memory="${CSS.escape(st.mem.pick)}"]`)?.scrollIntoView({ block: "nearest" });
}

function openMemories() {
  screenOpens();
  releaseKeyboard();
  $("memories").hidden = false;
  paintMemories();
  pullMemories(false);
  pullLogin().then((login) => { if (login?.state === "waiting") waitForLogin(); });
  if (st.mem.tab === "summary") pullMemoryStats(false);
}

function openMemoryAt(id) {
  if (!memoriesOnScreen()) openMemories();
  if (!id) return;
  st.mem.tab = "memories";
  st.mem.folder = ALL;
  st.mem.query = "";
  st.mem.origin = ALL;
  pickMemory(String(id));
}

function closeMemories() {
  clearTimeout(loginPoll);
  st.mem.edit = null;
  st.mem.confirm = "";
  $("memories").hidden = true;
  memoriesSolid?.dispose();
}

document.addEventListener("hive:screen", () => { if (memoriesOnScreen()) closeMemories(); });

solidMounts.push((hive) => {
  memoriesSolid = hive.mountMemories($("memories"), {
    actions: {
      close: () => closeMemories(),
      tab: (key) => setMemoryTab(key),
      folder: (key) => setMemoryFolder(key),
      origin: (key) => { st.mem.origin = key; paintMemories(); pickMemory(st.mem.pick); },
      search: (text) => { st.mem.query = text; paintMemories(); pickMemory(st.mem.pick); },
      pick: (id) => pickMemory(id),
      retry: () => { st.mem.active = st.mem.active?.memories ? st.mem.active : null; paintMemories(); pullMemories(true); },
      doctor: () => window.hiveDoctorCheck?.(),
      all: () => { st.mem.query = ""; st.mem.origin = ALL; setMemoryFolder(ALL); },
      copy: (button, text) => copyWithWord(button, text),
      seeOne: (id) => { st.mem.tab = "memories"; st.mem.folder = ALL; st.mem.query = ""; st.mem.origin = ALL; pickMemory(id); },
      signIn: () => signIn(),
      signOut: () => signOut(),
      cancelSignIn: () => cancelSignIn(),
      openAgain: (url) => openOutside(url),
      edit: () => startEdit(),
      editField: (key, value, field) => editField(key, value, field),
      tagKey: (ev) => tagKey(ev),
      dropTag: (tag) => dropTag(tag),
      save: () => saveEdit(),
      cancelEdit: () => cancelEdit(),
      askArchive: (id) => askArchive(id),
      keepIt: () => { st.mem.confirm = ""; paintMemories(); },
      archive: (id) => archiveMemory(id, "archive"),
      unarchive: (id) => archiveMemory(id, "unarchive")
    }
  });
});

$("btn-memories")?.addEventListener("click", () => (memoriesOnScreen() ? closeMemories() : openMemories()));

export {
  ARCHIVE_AFTER_DAYS, agoSay, inMemoryEditor, judgeHealth, memoryEscape, spendModel, unansweredModel, signIn, signOut, saveEdit, startEdit, bridgeCeilingHeld, closeMemories, dateSay, daysUntilArchive, judgeFunnel, lastWeeksAdded, memoriesOnScreen,
  memoriesViewModel, memoryFolders, newThisWeek, openMemories, openMemoryAt, paintMemories, pickMemory, pullMemories, repoBars, setMemoryFolder,
  setMemoryTab, shownMemories, soonArchived, stepMemory, weeklyChart, weekStart
};
