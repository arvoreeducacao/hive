import { render } from "./arrange.js";
import { activeItems, blockWithRoom, openBlock, saveBlocks, soloSeat } from "./blocks.js";
import { AGENT_NAMES, artifactTabOf, draftCarriesEffort, openSeatPicker, paintPills, paintWebOfChat, refreshCatalog, seatAgent, shelfLinkOf, weaveHandles, webOfSeat } from "./chat-and-panes.js";
import { SV_FLOOR, drawInk, listInkMarks, loadingChips, shapeComposer, svRoom, svTypePath } from "./chat-stretches.js";
import { COMPOSER_MIN, IS_MAC, esc, isImageName, phrase, st, svgIcon, composerShaped } from "./core.js";
import { BEHIND_KEY, NO_PROJECT, baseItems, baseOf, branchPlaceOf, closePlaceMenu, isBehindKey, openPlaceMenu, paintPlace, placeMarkup, projectItems, projectNamed, projectOfSeat, projectsKnown, pullBranches, pullProjects, repaintPlaceMenu } from "./draft-place.js";
import { closeTile, focusSeat, goTo, pull, releaseKeyboard } from "./focus-navigation.js";
import { hud } from "./hud.js";
import { sendIntent } from "./composer-modes.js";
import { jobName, justCreated } from "./leader-key.js";
import { providerReady, pullAccounts, readyAgents } from "./providers.js";
import { imageTray, outboundImageMarks } from "./pinned-images.js";
import { structPool } from "./structured-seats.js";
import { wireTalkButton } from "./stt.js";
import { clipMarkup, wireClip } from "./composer-bar.js";
import { COMPOSER_ASK } from "./composer-actions.js";
import { editingKeys } from "./composer-editing.js";
import { followTooLong, refuseTooLong } from "./composer-length.js";
import { blockedSend, wireAttachments } from "./composer-attachments.js";
import { composerClipboardAdapter, pasteFragment, wireChipClipboard } from "./chip-clipboard.js";
import { suggestMarkup, suggestMenu } from "./suggest-menu.js";
import { projectOfSession } from "./composer-models.js";
import { focusedSeat } from "./mirror.js";
import { newChatSelection, projectPinOf, rememberedOptions } from "./model-memory.js";

const drafts = new Map();

let draftSeq = 0;

const DRAFT_KEPT = "hive.draft";

const DRAFT_KINDS = ["structured", "terminal"];

const DRAFT_WHERES = ["local", "cloud"];

const DRAFT_ANONYMOUS = "anonymous";

const draftIsAnonymous = (d) => d.where === DRAFT_ANONYMOUS;

const draftWhere = (d) => (d.where === "cloud" ? "cloud" : "local");

const draftKey = (id) => `draft:${id}`;

function keptChoices() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEPT) || "{}") || {}; } catch { return {}; }
}

function keepChoices(d) {
  try {
    const kept = keptChoices();
    const where = draftIsAnonymous(d) ? kept.where || "local" : d.where;
    const project = draftIsAnonymous(d) || d.where === "cloud" ? kept.project || "" : d.project || "";
    localStorage.setItem(DRAFT_KEPT, JSON.stringify({ ...kept, where, kind: d.kind, project }));
  } catch {}
}

const recentProject = () => (typeof keptChoices().project === "string" ? keptChoices().project : NO_PROJECT);

const draftPlaced = (d) => !draftIsAnonymous(d) && d.where !== "cloud";

function placeOfDraft(d) {
  if (!draftPlaced(d) || !d.project) return {};
  if (d.tree) return { project: d.project, tree: d.tree };
  if (!d.worktree) return { project: d.project };
  return { project: d.project, ...(d.base ? { base: d.base } : {}), worktree: true };
}

function draftChoices(kept) {
  return {
    agent: AGENT_NAMES[kept?.agent] && providerReady(kept.agent) ? kept.agent : (readyAgents()[0] || "claude"),
    model: typeof kept?.model === "string" ? kept.model : "",
    where: DRAFT_WHERES.includes(kept?.where) ? kept.where : "local",
    kind: DRAFT_KINDS.includes(kept?.kind) ? kept.kind : "structured"
  };
}

function spawnPayloadOf(d, prompt, images = []) {
  const cloud = d.where === "cloud";
  const anon = draftIsAnonymous(d);
  return {
    name: "",
    prompt,
    images,
    where: anon ? "local" : d.where,
    ...(anon ? { anon: true } : {}),
    model: d.e.model || "",
    ...(draftCarriesEffort(d.e.agent, d.kind) && d.e.effort ? { effort: d.e.effort } : {}),
    ...(d.e.fast === true && (anon || (d.e.agent === "claude" && d.kind === "structured")) ? { fast: true } : {}),
    agent: anon ? "claude" : d.e.agent,
    structured: anon || d.kind === "structured",
    account: cloud ? "" : (d.e.account || ""),
    repo: cloud ? String(d.repo || "").trim() : "",
    branch: cloud ? String(d.branch || "").trim() : "",
    ...placeOfDraft(d)
  };
}

function hexPoints(cx, cy, r) {
  const corners = [];
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 3;
    corners.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return corners.join(" ");
}

function hiveMark() {
  const radius = 9.4;
  const gap = 1.8;
  const spacing = radius * Math.sqrt(3) + gap;
  const cells = [{ x: 32, y: 32, lit: true }];
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3;
    cells.push({ x: 32 + spacing * Math.cos(a), y: 32 + spacing * Math.sin(a), lit: false });
  }
  return `<svg class="hive-mark" viewBox="0 0 64 64" aria-hidden="true">${
    cells.map((c) => `<polygon points="${hexPoints(c.x, c.y, radius)}" class="${c.lit ? "lit" : "cell"}"/>`).join("")
  }</svg>`;
}

const DRAFT_PICKER_COMMAND = /^\/(model|effort|account)$/;

const pickerCommandOf = (text) => DRAFT_PICKER_COMMAND.exec(String(text || "").trim())?.[1] || "";

function draftHost(d) {
  const host = document.createElement("div");
  host.className = "sv sv-draft";
  host.innerHTML = `
    <div class="sv-scroll">
      <div class="sv-empty">
        ${hiveMark()}
        ${placeMarkup()}
        <b class="sv-draft-title" hidden>${phrase("New chat")}</b>
        <b>${phrase("a chat with nothing in it yet")}</b>
        <p>${phrase("where it runs and how it opens are here; the provider and the model are in the pills below. The seat opens on the first send.")}</p>
        <div class="sv-choices" data-tag="${phrase("Setup")}">
          <div class="sv-seg" data-pick="where" data-caption="${phrase("Where it runs")}" role="radiogroup" aria-label="${phrase("where the chat runs")}">
            <button type="button" data-v="local" data-short="${phrase("Local")}" role="radio">${svgIcon("i-local")}<span>${phrase("local · your machine")}</span></button>
            <button type="button" data-v="cloud" data-short="${phrase("Cloud")}" role="radio">${svgIcon("i-cloud")}<span>${phrase("cloud · server")}</span></button>
            <button type="button" data-v="anonymous" data-short="${phrase("Anonymous")}" role="radio" class="anon" title="${phrase("a chat that leaves nothing behind")}">${svgIcon("i-anon")}<span>${phrase("anonymous")}</span></button>
          </div>
          <div class="sv-seg" data-pick="kind" data-caption="${phrase("How it opens")}" role="radiogroup" aria-label="${phrase("what kind of seat it opens")}">
            <button type="button" data-v="structured" data-short="${phrase("Chat")}" role="radio" title="${phrase("markdown, cards, instant commands, questions as buttons")}">${svgIcon("i-answered")}<span>${phrase("native chat")}</span></button>
            <button type="button" data-v="terminal" data-short="${phrase("Terminal")}" role="radio" title="${phrase("the terminal exactly as you know it")}">${svgIcon("i-term")}<span>${phrase("the TUI")}</span></button>
          </div>
        </div>
        <div class="sv-cloud" hidden>
          <input class="sv-repo" autocomplete="off" spellcheck="false" placeholder="${phrase("repo")}" aria-label="${phrase("repo")}" title="${phrase("the repo the cloud seat clones")}" />
          <input class="sv-branch" autocomplete="off" spellcheck="false" placeholder="${phrase("branch")}" aria-label="${phrase("branch")}" title="${phrase("the branch it starts from")}" />
        </div>
        <p class="sv-anon-said" hidden><b>${phrase("Runs on this mac and leaves nothing behind.")}</b> ${phrase("No hub rules, skills or memories. The other chats, the phone and the summaries never see it, and closing it erases it.")}</p>
        <p class="sv-empty-said" hidden></p>
      </div>
      <div class="sv-sent" hidden></div>
    </div>
    ${suggestMarkup()}
    <form class="sv-composer">
      <div class="sv-activity"><span class="pulse"></span><span class="verb"></span><span class="clock"></span></div>
      <div class="sv-attach"></div>
      <div class="sv-well"><div class="sv-ink" aria-hidden="true"></div><textarea rows="1" spellcheck="false" placeholder="${phrase(COMPOSER_ASK)}"></textarea></div>
      <div class="sv-foot">
        ${clipMarkup()}
        <span class="sv-pick">
          <button type="button" class="sv-pill sv-pill-model"></button>
          <button type="button" class="sv-pill sv-pill-effort"></button>
          <button type="button" class="sv-pill sv-pill-account"></button>
        </span>
        <span class="sv-btns">
          <button type="button" class="sv-talk" hidden aria-pressed="false" aria-label="${phrase("talk instead of typing")}"><svg viewBox="0 0 16 16" aria-hidden="true"><use href="#i-mic"/></svg></button>
          <button type="button" class="sv-behind" title="${phrase("start it in the background ({key})", { key: BEHIND_KEY })}" aria-label="${phrase("start it in the background")}">${svgIcon("i-send")}</button>
          <button type="submit" class="sv-send" title="${phrase("open the chat (enter)")}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 12.6V3.8M4.4 7.2 8 3.6l3.6 3.6" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </span>
      </div>
    </form>`;
  if (composerShaped()) shapeComposer(host, true);
  wireClip(host);
  const textarea = host.querySelector("textarea");
  const autosize = () => {
    textarea.style.height = "auto";
    const room = svRoom(host, textarea);
    textarea.style.minHeight = room < COMPOSER_MIN ? `${Math.max(SV_FLOOR, room)}px` : "";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220, room)}px`;
  };
  new ResizeObserver(() => { if (textarea.value) autosize(); }).observe(host);
  const paintReady = () => {
    const ready = draftHasContent(d, textarea);
    host.querySelector(".sv-composer").classList.toggle("ready", ready);
    host.querySelector(".sv-send").disabled = !!d.sending || !ready;
  };
  const ink = host.querySelector(".sv-ink");
  const paintInk = () => drawInk(host.querySelector(".sv-composer"), ink, textarea, listInkMarks(textarea.value));
  d.e.tray = imageTray(host.querySelector(".sv-attach"), textarea, () => ({ where: "local", name: "" }));
  wireAttachments(d.e, {
    host,
    textarea,
    target: (kind) => ({ name: "", where: kind === "image" ? "local" : draftWhere(d) }),
    busy: () => (d.sending ? phrase("The composer is busy; try again once it is ready.") : "")
  });
  const clipboard = composerClipboardAdapter(d.e, { where: () => draftWhere(d), seat: () => "" });
  wireChipClipboard(textarea, clipboard);
  textarea.addEventListener("paste", (pev) => {
    if (d.e.plainPaste) return void (d.e.plainPaste = false);
    if ([...(pev.clipboardData?.items || [])].some((one) => one.kind === "file")) return;
    pasteFragment(textarea, pev, clipboard);
  });
  const menu = suggestMenu({
    textarea,
    suggest: host.querySelector(".sv-suggest"),
    mine: () => d.key,
    commands: () => draftCommands(d),
    files: {
      searching: () => phrase("searching the hub…"),
      none: () => phrase("nothing with that name in the hub"),
      find: (q) => hubFiles(d.where, q)
    },
    grow: autosize
  });
  host.querySelector(".sv-composer").addEventListener("submit", (ev) => { ev.preventDefault(); sendDraft(d, textarea.value); });
  host.querySelector(".sv-behind").addEventListener("click", () => sendDraft(d, textarea.value, true));
  textarea.addEventListener("keydown", (kev) => {
    kev.stopPropagation();
    if (kev.key === "v" && (IS_MAC ? kev.metaKey : kev.ctrlKey) && kev.shiftKey && !kev.altKey) d.e.plainPaste = true;
    if (menu.key(kev)) return;
    if (isBehindKey(kev)) { kev.preventDefault(); menu.close(); return void sendDraft(d, textarea.value, true); }
    if (editingKeys(kev, textarea)) return;
    const intent = sendIntent(kev, { text: textarea.value, running: true });
    if (intent) { kev.preventDefault(); menu.close(); return void sendDraft(d, textarea.value); }
    if (kev.key === "Escape") {
      kev.preventDefault();
      if (!textarea.value.trim()) return void discardDraft(d);
      textarea.blur();
    }
  });
  textarea.addEventListener("input", () => { autosize(); d.e.tray.sync(); d.e.files.sync(); menu.compute(); paintReady(); paintInk(); followTooLong(host, () => textarea.value); });
  textarea.addEventListener("scroll", () => { ink.scrollTop = textarea.scrollTop; });
  textarea.addEventListener("blur", () => setTimeout(menu.close, 150));
  for (const seg of host.querySelectorAll(".sv-seg")) {
    seg.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button[data-v]");
      if (!btn) return;
      ev.stopPropagation();
      if (btn.disabled) return;
      d[seg.dataset.pick] = btn.dataset.v;
      if (draftIsAnonymous(d)) d.kind = "structured";
      d.e.where = draftIsAnonymous(d) ? "local" : d.where;
      paintDraftHost(d);
      textarea.focus();
    });
  }
  host.querySelector(".sv-repo").addEventListener("input", (ev) => { d.repo = ev.target.value; paintDraftHost(d); });
  host.querySelector(".sv-branch").addEventListener("input", (ev) => { d.branch = ev.target.value; paintDraftHost(d); });
  for (const input of host.querySelectorAll(".sv-cloud input")) input.addEventListener("keydown", (kev) => kev.stopPropagation());
  for (const pick of host.querySelectorAll(".sv-place-pick")) {
    pick.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (pick.classList.contains("open")) return closePlaceMenu({ refocus: true });
      openPlaceMenuOf(d, pick.dataset.place);
    });
  }
  host.querySelector(".sv-pill-model").addEventListener("click", () => openSeatPicker(d.e, "model"));
  host.querySelector(".sv-pill-effort").addEventListener("click", () => openSeatPicker(d.e, "effort"));
  host.querySelector(".sv-pill-account").addEventListener("click", () => openSeatPicker(d.e, "account"));
  host.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (focusSeat(d.key)) render();
  });
  return host;
}

function draftCommands(d) {
  const twin = [...structPool.values()].find((one) => !one.mirror && !one.draft && seatAgent(one) === d.e.agent && one.slash?.length);
  return {
    list: twin?.slash || [],
    info: twin?.slashInfo || {},
    none: phrase("the commands come from a chat of the same kind that is already open — none is open right now")
  };
}

function carriedProject() {
  try {
    return projectOfSession(focusedSeat());
  } catch {
    return "";
  }
}

function startingPick(project, kept = keptChoices()) {
  const ready = (agent) => !!AGENT_NAMES[agent] && providerReady(agent);
  const pick = newChatSelection({ kept, pin: projectPinOf(project), ready, fallback: readyAgents()[0] || "claude" });
  const traits = pick.from === "project" ? pick : rememberedOptions(pick.agent, pick.model) || {};
  return { agent: pick.agent, model: pick.model, effort: typeof traits.effort === "string" ? traits.effort : "", fast: traits.fast === true };
}

function draftWears(d, pick) {
  const moved = d.e.agent !== pick.agent;
  d.e.agent = pick.agent;
  d.e.model = pick.model || "";
  d.e.effort = pick.effort || "";
  d.e.effortFrom = d.e.effort ? "session" : "";
  d.e.fast = pick.fast === true;
  if (moved) {
    d.e.catalog = null;
    d.e.catalogError = "";
    d.e.catalogPull = null;
    d.e.catalogTries = 0;
  }
  paintDraftHost(d);
  return refreshCatalog(d.e);
}

function draftTakesLink(d, { agent = "", model = "", project = "" } = {}) {
  if (project) {
    d.e.project = project;
    if (!d.repo) d.repo = project;
  }
  if (agent) return draftWears(d, { agent, model, effort: "", fast: false });
  if (project) return draftWears(d, startingPick(project));
  return refreshCatalog(d.e);
}

async function hubFiles(where, q) {
  if (where === DRAFT_ANONYMOUS) return { files: [], error: "" };
  const r = await fetch(`/api/index?where=${where}&q=${encodeURIComponent(q)}&limit=20`).then((x) => x.json()).catch(() => null);
  return { files: (r?.files || []).map((row) => `${row.repo}/${row.path}`), error: r?.error || "" };
}

const BEHIND_WORDS = 26;

const focusedDraftOrSeatKey = () => st.open || activeItems()[st.focus]?.key || "";

function projectInFocus() {
  const key = focusedDraftOrSeatKey();
  if (key.startsWith("draft:")) return drafts.get(key.slice(6))?.project || NO_PROJECT;
  return projectOfSeat((st.data?.sessions || []).find((one) => one.name === key));
}

function placeDraft(d, { repo = NO_PROJECT, branch = "", tree = "", main = false, worktree = false } = {}) {
  d.project = String(repo || "");
  d.tree = d.project && tree ? String(tree) : "";
  d.treeBranch = d.tree ? String(branch || "") : "";
  d.treeMain = !!d.tree && !!main;
  d.base = d.project && !d.tree ? String(branch || "") : "";
  d.worktree = !!d.project && !d.tree && !!worktree;
  if (d.project && !d.tree) pullBranches(d.project).then(() => repaintDraft(d));
  repaintDraft(d);
}

function repaintDraft(d) {
  if (!drafts.has(d.id)) return;
  const held = d.e.host.contains(document.activeElement) ? document.activeElement : null;
  paintDraftHost(d);
  render({ animate: false });
  if (held?.isConnected && !held.disabled && document.activeElement !== held) held.focus({ preventScroll: true });
}

function focusDraftComposer(d) {
  const textarea = d.e.host.querySelector("textarea");
  if (!textarea || textarea.disabled) return;
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function openPlaceMenuOf(d, kind) {
  if (d.sending) return;
  const anchor = d.e.host.querySelector(`.sv-place-pick[data-place="${kind}"]`);
  if (!anchor || anchor.hidden || anchor.disabled) return;
  const refocus = () => focusDraftComposer(d);
  if (kind === "mode") {
    closePlaceMenu();
    placeDraft(d, { repo: d.project, branch: d.base, worktree: !d.worktree });
    return void refocus();
  }
  if (kind === "project") {
    const recent = recentProject();
    openPlaceMenu(anchor, {
      kind,
      items: () => projectItems(d, recent),
      loading: !projectsKnown(),
      refocus,
      onPick: (project) => { placeDraft(d, { repo: project }); refocus(); }
    });
    if (!projectsKnown()) pullProjects().then(() => repaintPlaceMenu("project", { loading: false }));
    return;
  }
  openPlaceMenu(anchor, {
    kind,
    items: () => baseItems(d),
    loading: true,
    refocus,
    onPick: (base) => { d.base = base; repaintDraft(d); refocus(); }
  });
  pullBranches(d.project).then(() => repaintPlaceMenu("base", { loading: false }));
}

function openDraftIn({ repo = NO_PROJECT, branch = "", tree = "", main = false, worktree = false, seed = "" } = {}) {
  const d = openDraft(seed);
  placeDraft(d, { repo, branch, tree, main, worktree });
  pullProjects().then(() => {
    if (d.project && !d.tree && projectsKnown() && !projectNamed(d.project)) placeDraft(d, { repo: NO_PROJECT });
    else repaintDraft(d);
  });
  return d;
}

function askNewChat({ here = false } = {}) {
  if (here) return openDraftIn({ repo: projectInFocus() });
  return openDraftIn();
}

function openDraftOnBranchOf(seat) {
  const place = branchPlaceOf(seat);
  return place ? openDraftIn(place) : null;
}

let arrived = false;

const ARRIVAL_TRIES = 20;

const ARRIVAL_WAIT = 1500;

function nothingInFocus() {
  const welcome = document.getElementById("welcome");
  return !soloSeat && !st.open && !st.mirrorDev && !activeItems().length && !(welcome && !welcome.hidden);
}

function arriveOnADraft(tries = 0) {
  if (arrived) return;
  if (!st.seatsKnown) {
    if (tries < ARRIVAL_TRIES) setTimeout(() => arriveOnADraft(tries + 1), ARRIVAL_WAIT);
    return;
  }
  arrived = true;
  render({ animate: false });
  if (nothingInFocus()) openDraftIn();
}

function newDraft() {
  const id = `d${++draftSeq}`;
  const chosen = draftChoices(keptChoices());
  const project = carriedProject();
  const pick = startingPick(project);
  const d = {
    id,
    key: draftKey(id),
    kind: chosen.kind,
    where: chosen.where,
    repo: "",
    branch: "",
    project: NO_PROJECT,
    base: "",
    worktree: false,
    tree: "",
    treeBranch: "",
    treeMain: false,
    at: Date.now(),
    sending: false,
    error: "",
    e: null
  };
  d.e = {
    name: d.key,
    draft: true,
    where: chosen.where,
    agent: pick.agent,
    model: pick.model,
    effort: pick.effort,
    effortFrom: pick.effort ? "session" : "",
    fast: pick.fast,
    project,
    account: "",
    host: null,
    catalog: null,
    catalogError: "",
    catalogPull: null,
    catalogTries: 0,
    catalogWait: null,
    menu: null,
    turnOpen: false,
    mirror: null,
    tray: null,
    talkOff: null
  };
  d.e.host = draftHost(d);
  d.e.talkOff = wireTalkButton(d.e.host.querySelector(".sv-talk"), () => d.e.host.querySelector(".sv-composer textarea"));
  drafts.set(id, d);
  refreshCatalog(d.e);
  return d;
}

function openDraft(seed = "") {
  releaseKeyboard();
  const idle = activeItems().find((it) => it.kind === "draft" && !it.sending);
  const d = idle ? drafts.get(idle.id) : newDraft();
  if (st.open && st.open !== d.key) closeTile();
  if (!idle) {
    const b = blockWithRoom() || openBlock();
    b.keys.push(d.key);
    st.block = st.blocks.indexOf(b);
    saveBlocks();
  }
  render();
  focusSeat(d.key);
  render();
  if (!st.accountsAsked) pullAccounts();
  const textarea = d.e.host.querySelector("textarea");
  if (seed) {
    textarea.value = seed;
    textarea.dispatchEvent(new Event("input"));
  }
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  return d;
}

function discardDraft(d) {
  closePlaceMenu();
  const b = st.blocks.find((x) => x.keys.includes(d.key));
  if (b) b.keys.splice(b.keys.indexOf(d.key), 1);
  try { d.e.talkOff?.(); } catch {}
  drafts.delete(d.id);
  if (st.open === d.key) st.open = null;
  saveBlocks();
  render();
}

const draftHasContent = (d, textarea) => !!textarea.value.trim() || !!d.e.tray?.count() || !!d.e.files?.count();

async function sendDraft(d, text, behind = false) {
  const picker = pickerCommandOf(text);
  if (picker) {
    const textarea = d.e.host.querySelector("textarea");
    textarea.value = "";
    textarea.dispatchEvent(new Event("input"));
    return void openSeatPicker(d.e, picker);
  }
  const anon = draftIsAnonymous(d);
  const art = anon ? null : artifactTabOf(d.key);
  const seeded = art && !String(text || "").includes(`hive://shelf/${art.slug}`)
    ? `${shelfLinkOf(art.slug, art.tab)}\n${text}`
    : text;
  if (blockedSend(d.e)) return;
  const marked = outboundImageMarks(d.e.files ? d.e.files.outbound(String(seeded || "")) : String(seeded || ""), d.e.tray?.marks || new Map());
  const woven = anon ? { text: marked.text } : weaveHandles(marked.text.trim(), st.data?.sessions || [], "", false, d.where);
  if (woven.error) {
    d.error = woven.error;
    paintDraftHost(d);
    render();
    return;
  }
  const prompt = woven.text.trim();
  if ((!prompt && !marked.images.length) || d.sending) return;
  closePlaceMenu();
  if (refuseTooLong(d.e.host, text)) return;
  d.sending = true;
  d.error = "";
  d.said = marked.text.trim();
  paintDraftHost(d);
  render();
  const r = await fetch("/api/spawn", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(spawnPayloadOf(d, prompt, marked.images))
  }).then((x) => x.json()).catch((wrong) => ({ error: wrong.message }));
  if (!r?.ok) {
    d.sending = false;
    d.error = r?.error || phrase("the chat did not open");
    paintDraftHost(d);
    render();
    return;
  }
  keepChoices(d);
  const place = { repo: d.project, branch: d.tree ? d.treeBranch : d.base, tree: d.tree, main: d.treeMain, worktree: d.worktree };
  const jobKey = `job:${r.id}`;
  if (r.name) jobName.set(r.id, r.name);
  const b = st.blocks.find((x) => x.keys.includes(d.key));
  if (b) b.keys[b.keys.indexOf(d.key)] = jobKey;
  justCreated.set(r.id, Date.now());
  try { d.e.talkOff?.(); } catch {}
  drafts.delete(d.id);
  const page = webOfSeat.get(d.key);
  if (st.open === d.key) st.open = jobKey;
  saveBlocks();
  render();
  await pull();
  const born = jobName.get(r.id) || "";
  if (page && born) {
    webOfSeat.set(born, page);
    webOfSeat.delete(d.key);
    if (st.webChat === d.key) st.webChat = born;
    if (st.blocks.some((b) => b.keys.includes(born))) st.open = born;
  }
  if (behind) {
    if (draftPlaced(d)) openDraftIn(place);
    else openDraft();
    noteStartedBehind(born || r.name || "", place.repo, d.said);
    return;
  }
  focusSeat(jobKey);
  render();
}

function noteStartedBehind(name, project, said = "") {
  const seat = (st.data?.sessions || []).find((one) => one.name === name);
  const words = String(said || "").split("\n")[0].trim();
  const title = seat?.title && seat.title !== name ? seat.title : words.length > BEHIND_WORDS ? `${words.slice(0, BEHIND_WORDS - 1)}…` : words;
  hud({
    icon: "i-check",
    text: phrase("Started in the background"),
    mono: [title, project].filter(Boolean).join(" · "),
    act: name ? { label: phrase("Open"), run: () => goTo(name) } : null
  });
}

const draftLoadingChips = (d, files) => loadingChips(d.e.host.querySelector(".sv-attach"), files);

function draftFrom(node) {
  const key = node?.closest?.(".tile")?.dataset.key || "";
  return key.startsWith("draft:") ? drafts.get(key.slice(6)) || null : null;
}

function draftInFocus() {
  const key = st.open || activeItems()[st.focus]?.key || "";
  return key.startsWith("draft:") ? drafts.get(key.slice(6)) || null : null;
}

async function attachFilesToDraft(d, files, marked) {
  if (d.sending) return;
  const done = marked ? () => {} : draftLoadingChips(d, files);
  d.error = "";
  const r = await fetch("/api/attach", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files })
  }).then((x) => x.json()).catch((wrong) => ({ error: wrong.message }));
  done();
  if (!r?.ok) d.error = r?.error || phrase("the file did not land");
  else for (const path of r.paths) {
    if (isImageName(path)) d.e.tray.add(path);
    else if (d.e.files) d.e.files.addReady({ path });
    else svTypePath(d.e, path);
  }
  paintDraftHost(d);
  render();
  if (!d.error) d.e.host.querySelector("textarea").focus();
}

function draftRefused(d, said) {
  d.error = [d.error, said].filter(Boolean).join(" · ");
  paintDraftHost(d);
  render();
}

function paintDraftHost(d) {
  const host = d.e.host;
  for (const seg of host.querySelectorAll(".sv-seg")) {
    for (const btn of seg.querySelectorAll("button[data-v]")) {
      const on = btn.dataset.v === d[seg.dataset.pick];
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-checked", String(on));
    }
  }
  host.querySelector(".sv-cloud").hidden = d.where !== "cloud";
  host.querySelector(".sv-place").hidden = !draftPlaced(d);
  paintPlace(host, d);
  host.querySelector(".sv-anon-said").hidden = !draftIsAnonymous(d);
  host.classList.toggle("anon", draftIsAnonymous(d));
  const tui = host.querySelector('.sv-seg[data-pick="kind"] button[data-v="terminal"]');
  if (tui) tui.disabled = draftIsAnonymous(d);
  const said = host.querySelector(".sv-empty-said");
  said.hidden = !d.error;
  said.textContent = d.error || "";
  const sent = host.querySelector(".sv-sent");
  sent.hidden = !d.sending;
  if (d.sending) sent.innerHTML = `<div class="sv-user">${esc(d.said || "")}</div>`;
  const activity = host.querySelector(".sv-activity");
  activity.classList.toggle("on", !!d.sending);
  activity.querySelector(".verb").textContent = d.sending ? phrase("opening the chat…") : "";
  const textarea = host.querySelector("textarea");
  textarea.disabled = !!d.sending;
  host.querySelector(".sv-send").disabled = !!d.sending || !draftHasContent(d, textarea);
  host.querySelector(".sv-behind").disabled = !!d.sending;
  host.classList.toggle("sending", !!d.sending);
  d.e.draftKind = d.kind;
  paintPills(d.e);
}

function createDraftTile(it) {
  const d = drafts.get(it.id);
  const el = document.createElement("article");
  el.className = "tile draft";
  el.dataset.key = it.key;
  el.dataset.name = it.key;
  el.innerHTML = `
    <div class="side">
      <div class="t-head">
        <div class="t-ident"><div class="t-name"></div><div class="t-sub"></div></div>
        <span class="t-tags"><button class="t-close" title="${phrase("discard this chat")}" aria-label="${phrase("discard this chat")}"><svg aria-hidden="true"><use href="#i-close"/></svg></button></span>
      </div>
    </div>
    <div class="well structured"></div>
    <div class="x-split-pane" role="separator" aria-orientation="vertical" tabindex="0" aria-label="${phrase("Width of the pane")}" title="${phrase("Drag or use the arrows to resize the pane — double-click restores it")}"></div>`;
  el.addEventListener("pointerdown", () => { if (focusSeat(it.key)) render(); });
  el.querySelector(".t-close").addEventListener("click", (ev) => { ev.stopPropagation(); discardDraft(d); });
  el.querySelector(".well").appendChild(d.e.host);
  return el;
}

function updateDraft(el, it, pos) {
  const d = drafts.get(it.id);
  if (!d) return;
  el.classList.toggle("focused", pos === st.focus);
  el.classList.toggle("open", st.open === it.key);
  el.classList.toggle("sending", !!d.sending);
  el.classList.toggle("bad", !!d.error);
  el.classList.toggle("anon", draftIsAnonymous(d));
  el.querySelector(".t-name").textContent = draftIsAnonymous(d) ? phrase("new anonymous chat") : phrase("new chat");
  el.querySelector(".t-sub").textContent = d.sending ? phrase("opening the chat") : d.error ? phrase("did not open") : phrase("nothing sent yet");
  paintWebOfChat(el, { name: it.key });
  paintDraftHost(d);
}

function plannedTrees(d) {
  if (!draftPlaced(d) || !d.project) return [];
  if (d.tree) return [{ repo: d.project, branch: d.treeBranch, path: d.tree, main: d.treeMain }];
  return [{ repo: d.project, branch: d.base || baseOf(d.project), path: "", main: !d.worktree }];
}

function draftItem(key) {
  const d = drafts.get(key.slice(6));
  if (!d) return null;
  const anon = draftIsAnonymous(d);
  return { id: d.id, key, kind: "draft", where: anon ? "local" : d.where, anon, sending: d.sending, state: "idle", name: key, title: anon ? phrase("new anonymous chat") : phrase("new chat"), project: draftPlaced(d) ? d.project : NO_PROJECT, trees: plannedTrees(d) };
}

document.addEventListener("hive:experience", (event) => {
  const { experience, was } = event.detail || {};
  if (experience !== "raycast" && was !== "raycast") return;
  for (const d of drafts.values()) if (d.e?.host) shapeComposer(d.e.host, composerShaped());
});

export { DRAFT_ANONYMOUS, DRAFT_KEPT, DRAFT_KINDS, DRAFT_WHERES, arriveOnADraft, askNewChat, attachFilesToDraft, createDraftTile, discardDraft, draftChoices, draftFrom, draftInFocus, draftItem, draftKey, draftLoadingChips, draftRefused, drafts, hexPoints, hiveMark, newDraft, nothingInFocus, openDraft, openDraftIn, openDraftOnBranchOf, paintDraftHost, placeDraft, projectInFocus, sendDraft, spawnPayloadOf, updateDraft, draftTakesLink, startingPick };
