import { artifactTabOf, closeBrowser, openArtifactTab, showingArtifact } from "./chat-and-panes.js";
import { svConvCards, svConvDiff, svConvShow, svConvShowSubs, svConvSubLanded, svConvSubOpen, svConvSubPin, svConvSubStep, svConvSubUnpin, svConvSubs, svConvTool, svConvToolLanded } from "./conversation-model.js";
import { esc, phrase, raycastOn, st } from "./core.js";
import { openTile } from "./focus-navigation.js";
import { liveOf } from "./leader-key.js";
import { isMemorySave, svMemorySaveRow } from "./memory-signal.js";
import { shotOfInput } from "./session-images.js";
import { pullShelf, shelfTabsOf, shelfVersionsOf } from "./shelf.js";
import { structPool, svAppend } from "./structured-seats.js";
import { SKILL_TOOL, artifactLink, oneLine, toolArg, toolFace, toolTitle } from "./tool-face.js";

const AGENT_TOOL = /^(agent|task)$/i;

const ASYNC_LAUNCH = /^Async agent launched successfully/;

const SUB_STALE = 6 * 60 * 60 * 1000;

function svSubPin(e, block) {
  return svConvSubPin(e, block);
}

const SUB_LOG_MAX = 200;

function svSubStep(e, id, kind, glyph, text, key) {
  return svConvSubStep(e, id, kind, glyph, text, key);
}

function svSubEcho(e, id, text) {
  return svSubStep(e, id, "say", "i-agent", text);
}

function svSubCall(e, id, block) {
  const face = toolFace(block.name);
  const label = face.server ? `${face.server} ${face.label}` : face.label;
  const step = svSubStep(e, id, face.kind, face.glyph, `${label} ${toolArg(block.name, block.input)}`.trim(), block.id);
  if (step) return svConvSubOpen(e, step, toolTitle(block.name, block.input));
  return step;
}

function svSubLanded(e, id, toolUseId, bad) {
  return svConvSubLanded(e, id, toolUseId, bad);
}

function svSubAsync(e, id) {
  const item = e.subs?.get(id);
  if (!item) return;
  item.dataset.bg = "1";
  svConvShowSubs(e);
}

function svSubUnpin(e, id) {
  return svConvSubUnpin(e, id);
}

const TASK_DONE = /^(completed|failed|cancell?ed|killed|error|timed_out)$/i;

function svSubTask(e, ev) {
  if (!e.subs?.size) return;
  if (ev.subtype === "task_started") {
    const item = ev.tool_use_id ? e.subs.get(ev.tool_use_id) : null;
    if (item && ev.task_id) item.dataset.task = String(ev.task_id);
    return;
  }
  if (ev.subtype === "task_notification") {
    if (TASK_DONE.test(String(ev.status || "completed"))) svSubUnpin(e, ev.tool_use_id);
    return;
  }
  if (ev.subtype === "task_updated") {
    if (TASK_DONE.test(String(ev.patch?.status || ""))) svSubUnpinTask(e, ev.task_id);
    return;
  }
  /* the list is the truth, but only for the pins that already know their task id: two agents
     launched in the same message see a list carrying the first one while the second is still
     being registered, and that list is not evidence about the second. */
  if (ev.subtype === "background_tasks_changed") {
    const alive = new Set((ev.tasks || []).map((t) => String(t.task_id)));
    for (const [id, item] of [...e.subs]) if (item.dataset.task && !alive.has(item.dataset.task)) svSubUnpin(e, id);
  }
}

function svSubUnpinTask(e, taskId) {
  if (!taskId) return;
  for (const [id, item] of [...(e.subs || [])]) if (item.dataset.task === String(taskId)) svSubUnpin(e, id);
}

function paintSubs(e) {
  return svConvSubs(e);
}

function svToolCard(e, block, live) {
  if (artifactPublish(block.name, block.input)) return svArtRow(e, block, live);
  if (isMemorySave(block.name)) return svMemorySaveRow(e, block, live);
  return svConvTool(e, block, live);
  const card = document.createElement("details");
  card.className = "sv-tool running";
  const face = toolFace(block.name);
  card.dataset.kind = face.kind;
  card.dataset.tool = String(block.name || "");
  card.innerHTML = `<summary><svg class="tico" aria-hidden="true"><use href="#${face.glyph}"/></svg>`
    + `<span class="tname"></span><span class="tsrv"></span><span class="targ"></span>`
    + `<span class="tlink"></span><span class="tms"></span><span class="tstat">…</span></summary><pre class="tbody"></pre>`;
  if (live) card.dataset.t0 = String(Date.now());
  card.querySelector(".tname").textContent = face.label;
  const srv = card.querySelector(".tsrv");
  srv.textContent = face.server;
  srv.hidden = !face.server;
  card.querySelector(".targ").textContent = toolArg(block.name, block.input).slice(0, 300);
  card.querySelector("summary").title = toolTitle(block.name, block.input);
  const asked = shotOfInput(block.input);
  if (asked) card.dataset.shot = asked;
  e.skillCard = SKILL_TOOL.test(String(block.name || "")) ? card : null;
  e.tools.set(block.id, card);
  svAppend(e, card);
  if (live && AGENT_TOOL.test(String(block.name || ""))) svSubPin(e, block);
  return card;
}

function svToolResult(e, block, live) {
  return svConvToolLanded(e, block, live);
}

const IMAGE_NOTE_ONLY = /^\s*\[Image[^\]]*\]\s*$/;

const tookLabel = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`);

const DIFF_HUNK = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/;

function diffLines(text) {
  const lines = String(text).split("\n");
  if (lines.length < 3) return null;
  const hunk = lines.findIndex((l) => DIFF_HUNK.test(l));
  if (hunk < 0) return null;
  if (!lines.slice(hunk + 1).some((l) => /^[+-][^+-]/.test(l))) return null;
  return lines;
}

function repaintToolDiffs() {
  for (const e of structPool.values()) {
    for (const one of svConvCards(e)) one.diff = svConvDiff(one.body);
    svConvShow(e);
  }
}

const ARTIFACT_TOOL = /^artifact$/i;

const SHELF_TOOL = /^(mcp__)?hive(__|:)publish$/i;

function artifactPublish(name, input) {
  const inp = input && typeof input === "object" ? input : {};
  const called = String(name || "");
  if (SHELF_TOOL.test(called)) return typeof inp.path === "string" && !!inp.path.trim();
  if (!ARTIFACT_TOOL.test(called)) return false;
  const action = String(inp.action || "publish");
  return action === "publish" && typeof inp.file_path === "string" && !!inp.file_path.trim();
}

function artifactSaid(text) {
  const said = String(text || "");
  const shape = /Published\s+(\S+)\s+at\s+(https?:\/\/\S+)/.exec(said);
  if (shape) return { path: shape[1], url: shape[2].replace(/[.,;)\]]+$/, "") };
  const shelved = /hive:\/\/shelf\/\S+/.exec(said);
  if (shelved) return { path: "", url: shelved[0].replace(/[.,;)\]]+$/, "") };
  return { path: "", url: artifactLink(said) };
}

function artifactFace(input) {
  const inp = input && typeof input === "object" ? input : {};
  const path = String(inp.file_path || inp.path || "");
  return {
    path,
    name: path.split("/").pop() || "page.html",
    tab: String(inp.tab || ""),
    glyph: /(canvas|mockup|screens?|telas)/i.test(path) ? "i-screen" : "i-doc",
    label: String(inp.label || ""),
    says: oneLine(inp.description || "")
  };
}

function artifactTag(version, label) {
  return [version ? `v${version}` : "", label].filter(Boolean).join(" \u00b7 ");
}

const artClock = (at) => (at ? new Date(at).toTimeString().slice(0, 5) : "");

function svArtRow(e, block, live) {
  const face = artifactFace(block.input);
  const row = document.createElement("div");
  row.className = "sv-art running";
  row.dataset.path = face.path;
  row.dataset.label = face.label;
  row.dataset.tab = face.tab;
  row.dataset.shelved = SHELF_TOOL.test(String(block.name || "")) ? "1" : "";
  row.innerHTML = `<svg class="aface" aria-hidden="true"><use href="#${face.glyph}"/></svg><span class="aname"></span><span class="aver"></span>`
    + `<span class="asay"></span><span class="ago">${phrase("publishing…")}</span>`;
  row.querySelector(".aname").textContent = face.name;
  row.querySelector(".aver").textContent = face.label ? `\u00b7 ${face.label}` : "";
  row.querySelector(".asay").textContent = face.says;
  row.title = `${face.path}\n\n${face.says}`.trim();
  row.addEventListener("click", () => openArtifact(e, row));
  e.tools.set(block.id, row);
  svAppend(e, row);
  if (!live) row.classList.remove("running");
  return row;
}

function svArtLanded(e, row, block, live) {
  row.classList.remove("running");
  const text = typeof block.content === "string"
    ? block.content
    : (block.content || []).map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("\n");
  if (block.is_error) {
    row.classList.add("bad");
    row.querySelector(".ago").textContent = phrase("did not publish");
    row.title = oneLine(text).slice(0, 300);
    return;
  }
  const said = artifactSaid(text);
  if (said.path) row.dataset.path = said.path;
  if (said.url) row.dataset.url = said.url;
  row.querySelector(".ago").textContent = phrase("open");
  if (live) keepArtifact(e, row).then((index) => paintArtRow(row, index));
}

function paintArtRow(row, index) {
  if (!index || index.error) return;
  const versions = index.versions || [];
  const mine = versions.find((v) => v.label && v.label === row.dataset.label) || versions[versions.length - 1];
  row.dataset.key = index.key;
  row.dataset.slug = index.slug || "";
  if (mine) row.dataset.v = String(mine.n);
  const tag = artifactTag(mine?.n, row.dataset.label);
  row.querySelector(".aver").textContent = tag ? `\u00b7 ${tag}` : "";
}

async function keepArtifact(e, row) {
  try {
    const r = await fetch("/api/artifact/keep", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: e.name, where: e.where, path: row.dataset.path,
        label: row.dataset.label || "", url: row.dataset.url || "", at: Date.now(),
        tab: row.dataset.tab || "", shelve: row.dataset.shelved !== "1"
      })
    });
    return await r.json();
  } catch { return null; }
}

async function artifactIndexAt(name, path) {
  try {
    const r = await fetch(`/api/artifact/index?name=${encodeURIComponent(name)}&path=${encodeURIComponent(path)}`);
    return await r.json();
  } catch { return null; }
}

const artifactIndexOf = (e, row) => artifactIndexAt(e.name, row.dataset.path);

st.published = [];

const ART_WEBVIEW = /Electron/i.test(navigator.userAgent);

const artFileOf = (index) => (index.shelf ? `a/${index.slug}/${index.tab}` : String(index.path || "").split("/").pop());

const shelfPageOf = (slug) => (st.shelf?.pages || []).find((one) => one.slug === slug) || null;

function shelfPaneIndex(page, wanted, v) {
  const tabs = shelfTabsOf(page);
  if (!tabs.length) return null;
  const tab = tabs.includes(wanted) ? wanted : tabs[0];
  const versions = shelfVersionsOf(page, tab);
  if (!versions.length) return null;
  const top = versions[versions.length - 1];
  return {
    shelf: true,
    slug: page.slug,
    tab,
    tabs,
    versions,
    counts: Object.fromEntries(tabs.map((one) => [one, shelfVersionsOf(page, one).length])),
    title: page.title || page.slug,
    label: page.label || "",
    url: "",
    v: versions.some((one) => one.n === v) ? v : (top.n || 0)
  };
}


async function openArtifact(e, row) {
  if (!row.dataset.path || row.classList.contains("running")) return;
  let index = await artifactIndexOf(e, row);
  if (!index || !(index.versions || []).length) index = await keepArtifact(e, row);
  if (!index || index.error) return;
  paintArtRow(row, index);
  if (showingArtifact(e.name, index.slug)) return closeBrowser();
  openArtifactTab(e.name, index, 0);
}

const LIVE_SHELL = /bash|shell|command/i;

function liveListModel(s) {
  const since = Date.parse(s.liveSince || "");
  return {
    title: phrase("live in this seat"),
    since: Number.isFinite(since) ? phrase("since {t}", { t: new Date(since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }) : "",
    rows: liveOf(s).map((one) => ({ glyph: LIVE_SHELL.test(one.kind) ? "i-term" : "i-agent", said: one.said || one.kind || phrase("a task") })),
    open: phrase("opens in the dock"),
    close: phrase("closes")
  };
}

function closeLiveList() {
  const pop = document.getElementById("livepop");
  if (pop) pop.hidden = true;
}

function openLiveList(name, at) {
  const s = st.data.sessions.find((one) => one.name === name);
  if (!s || !liveOf(s).length) return;
  let pop = document.getElementById("livepop");
  if (!pop) {
    pop = document.createElement("div");
    pop.id = "livepop";
    pop.setAttribute("role", "dialog");
    document.body.appendChild(pop);
  }
  const m = liveListModel(s);
  pop.innerHTML = `<div class="lp-head"><span>${esc(m.title)}</span><span class="r">${esc(m.since)}</span></div>`
    + m.rows.map((row) => `<button type="button" class="lp-row"><svg aria-hidden="true"><use href="#${row.glyph}"/></svg><span class="tx">${esc(row.said)}</span></button>`).join("")
    + `<div class="lp-foot"><span><span class="rc-key">↵</span>${esc(m.open)}</span><span><span class="rc-key">esc</span>${esc(m.close)}</span></div>`;
  const go = () => {
    closeLiveList();
    openTile(name);
    const dock = structPool.get(name)?.host.querySelector(".sv-subs");
    if (dock) dock.dataset.fold = "open";
  };
  for (const row of pop.querySelectorAll(".lp-row")) row.addEventListener("click", go);
  pop.hidden = false;
  const box = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(6, Math.min(at.left, innerWidth - box.width - 6))}px`;
  pop.style.top = `${Math.max(6, Math.min(at.bottom + 6, innerHeight - box.height - 6))}px`;
  pop.querySelector(".lp-row")?.focus();
}

document.addEventListener("click", (ev) => {
  if (!raycastOn()) return;
  const chip = ev.target.closest?.(".t-live");
  if (!chip) {
    if (!ev.target.closest?.("#livepop")) closeLiveList();
    return;
  }
  const name = chip.closest(".tile")?.dataset.name;
  if (!name) return;
  ev.stopPropagation();
  ev.preventDefault();
  openLiveList(name, chip.getBoundingClientRect());
}, true);

document.addEventListener("keydown", (ev) => {
  if (!raycastOn()) return;
  const pop = document.getElementById("livepop");
  if (!pop || pop.hidden) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    closeLiveList();
  }
}, true);

export { closeLiveList, liveListModel, openLiveList, AGENT_TOOL, ARTIFACT_TOOL, ART_WEBVIEW, ASYNC_LAUNCH, DIFF_HUNK, IMAGE_NOTE_ONLY, SHELF_TOOL, SUB_LOG_MAX, SUB_STALE, TASK_DONE, artClock, artFileOf, artifactFace, artifactIndexAt, artifactIndexOf, artifactPublish, artifactSaid, artifactTag, diffLines, keepArtifact, openArtifact, paintArtRow, paintSubs, repaintToolDiffs, shelfPageOf, shelfPaneIndex, svArtLanded, svArtRow, svSubAsync, svSubCall, svSubEcho, svSubLanded, svSubPin, svSubStep, svSubTask, svSubUnpin, svSubUnpinTask, svToolCard, svToolResult, tookLabel };
