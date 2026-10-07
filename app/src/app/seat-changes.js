import { byteSize, contextWindow, diffRows, nextUnreviewed, reviewedKey, shortHome, splitPath, stepFile } from "/assets/changes-view.mjs";
import { render } from "./arrange.js";
import { closeBrowser, closeCockpit, closeDevice, runNativeCommand } from "./chat-and-panes.js";
import { keyLabel } from "./brand-face.js";
import { IS_MAC, esc, every, phrase, raycastOn, solidMounts, st } from "./core.js";
import { openTile } from "./focus-navigation.js";
import { openInEditor } from "./files-editor.js";
import { ask } from "./pod.js";
import { finishMeta } from "./seat-menu.js";
import { structPool } from "./structured-seats.js";
import { toClipboard } from "./terminal-history.js";
import { closeThreadPanel, exitReview } from "./thread.js";

const CHANGES_BEAT = 8000;

const COPIED_FOR = 1600;

const WELL_CAP = 1500;

const REVIEWED_KEY = "hive.changes.reviewed";

const ROWS_SHOWN = 12;

const unfoldedLists = new Set();

const changes = new Map();

const diffs = new Map();

const diffViews = new WeakMap();

st.diffChat = null;

st.diffPath = "";

let copiedKey = "";

let copiedTimer = 0;

let editorTrouble = null;

let diffView = null;

let infoView = null;

const infoViews = new WeakMap();

const readMarks = () => {
  try { return JSON.parse(localStorage.getItem(REVIEWED_KEY) || "{}") || {}; }
  catch { return {}; }
};

let marks = readMarks();

const saveMarks = () => {
  try { localStorage.setItem(REVIEWED_KEY, JSON.stringify(marks)); } catch {}
};

const seatOf = (name) => st.data.sessions.find((one) => one.name === name) || null;

const signatureOf = (file) => `${file.status}:${file.added}:${file.removed}`;

const treeOf = (name) => changes.get(name)?.data?.tree || "";

const filesOf = (name) => changes.get(name)?.data?.files || [];

const isReviewed = (name, file) => marks[reviewedKey(name, treeOf(name), file.path)] === signatureOf(file);

async function pullChanges(name) {
  const s = seatOf(name);
  if (!s) return;
  const had = changes.get(name);
  if (had?.asking) return;
  changes.set(name, { ...(had || {}), asking: true });
  let data = null;
  try {
    const answer = await fetch(`/api/changes?name=${encodeURIComponent(name)}&where=${s.where}`);
    data = answer.ok ? await answer.json() : { state: "unread", files: [], ahead: [], error: `${answer.status}` };
  } catch (e) { data = { state: "unread", files: [], ahead: [], error: String(e?.message || e) }; }
  changes.set(name, { at: Date.now(), data, asking: false });
  if (st.diffChat === name && st.diffPath && !data.files?.some((file) => file.path === st.diffPath)) st.diffPath = data.files?.[0]?.path || "";
  if (st.diffChat === name && st.diffPath) pullDiff(name, st.diffPath);
  render();
}

async function pullDiff(name, path, force = false) {
  const s = seatOf(name);
  const key = `${name}|${path}`;
  const file = filesOf(name).find((one) => one.path === path);
  const sign = file ? signatureOf(file) : "";
  const had = diffs.get(key);
  if (!s || had?.asking || (!force && had?.sign === sign && had.data)) return;
  diffs.set(key, { ...(had || {}), asking: true });
  let data = null;
  try {
    const tree = encodeURIComponent(treeOf(name));
    const answer = await fetch(`/api/changes/diff?name=${encodeURIComponent(name)}&where=${s.where}&tree=${tree}&path=${encodeURIComponent(path)}`);
    data = answer.ok ? await answer.json() : { state: "unread", hunks: [], error: `${answer.status}` };
  } catch (e) { data = { state: "unread", hunks: [], error: String(e?.message || e) }; }
  diffs.set(key, { data, sign, asking: false });
  render();
}

every("changes", CHANGES_BEAT, () => { if (raycastOn() && st.open) pullChanges(st.open); });

function keepChangesFresh(name) {
  const held = changes.get(name);
  if (!held || (!held.asking && Date.now() - (held.at || 0) > CHANGES_BEAT)) pullChanges(name);
}

function copyText(key, text) {
  if (!text) return;
  toClipboard(text);
  copiedKey = key;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => { copiedKey = ""; render(); }, COPIED_FOR);
  render();
}

function openDiff(name, path) {
  if (st.reviewChat) exitReview();
  if (st.threadChat === name) closeThreadPanel();
  if (st.webChat === name) closeBrowser();
  if (st.cockChat === name) closeCockpit();
  if (st.deviceChat === name) closeDevice();
  editorTrouble = null;
  st.diffChat = name;
  st.diffPath = path;
  if (st.open !== name) openTile(name, false);
  pullDiff(name, path);
  render();
  requestAnimationFrame(() => document.querySelector(".tile.open .cd-window")?.focus({ preventScroll: true }));
}

function closeDiff() {
  if (!st.diffChat) return;
  const name = st.diffChat;
  st.diffChat = null;
  editorTrouble = null;
  render();
  requestAnimationFrame(() => document.querySelector(`.tile[data-name="${CSS.escape(name)}"] .cd-row.on`)?.focus({ preventScroll: true }));
}

function stepDiff(by) {
  const name = st.diffChat;
  const next = stepFile(filesOf(name).map((file) => file.path), st.diffPath, by);
  if (!next || next === st.diffPath) return;
  editorTrouble = null;
  st.diffPath = next;
  pullDiff(name, next);
  render();
}

function acceptFile(name, path) {
  const file = filesOf(name).find((one) => one.path === path);
  if (!file) return;
  const key = reviewedKey(name, treeOf(name), path);
  if (marks[key] === signatureOf(file)) delete marks[key];
  else marks[key] = signatureOf(file);
  saveMarks();
  if (marks[key] && st.diffChat === name) {
    const done = new Set(filesOf(name).filter((one) => isReviewed(name, one)).map((one) => one.path));
    const next = nextUnreviewed(filesOf(name).map((one) => one.path), path, done);
    if (next) {
      st.diffPath = next;
      pullDiff(name, next);
    }
  }
  render();
}

async function openInMachineEditor(name, path, line = 1) {
  const s = seatOf(name);
  if (!s) return;
  editorTrouble = null;
  const data = changes.get(name)?.data;
  if (s.where === "cloud") {
    const repo = String(data?.top || "").replace(/^\/workspace\/repos\/?/, "");
    if (repo && repo !== data?.top) return void openInEditor({ repo, path, where: "cloud", line });
    editorTrouble = { path, why: phrase("a cloud seat's files are only reachable from the seat itself") };
    return render();
  }
  let said = null;
  try {
    said = await (await fetch("/api/changes/open", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, where: s.where, tree: treeOf(name), path, line })
    })).json();
  } catch (e) { said = { error: String(e?.message || e) }; }
  if (said?.error) editorTrouble = { path, why: said.error };
  render();
}

async function discardFile(name, path, at) {
  const s = seatOf(name);
  const data = changes.get(name)?.data;
  const file = filesOf(name).find((one) => one.path === path);
  if (!s || !file) return;
  const lines = file.added + file.removed;
  const where = [data?.repo, data?.branch].filter(Boolean).map(esc).join(" · ");
  const sure = await ask(
    phrase("Discard the changes in {file}?", { file: path.split("/").pop() }),
    `${file.untracked
      ? phrase("The file is new: it goes away, and this cannot be undone.")
      : phrase("The file goes back to the last commit ({sha}). The {n} lines the seat wrote are lost, and this cannot be undone.", { sha: esc(data?.head || "HEAD"), n: lines })}${where ? `<br><span class="cd-ask-where">${where}</span>` : ""}`,
    phrase("Discard"),
    { at }
  );
  if (!sure) return;
  let said = null;
  try {
    said = await (await fetch("/api/changes/discard", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, where: s.where, tree: treeOf(name), path })
    })).json();
  } catch (e) { said = { error: String(e?.message || e) }; }
  if (said?.error) {
    editorTrouble = { path, why: said.error, discard: true };
    return render();
  }
  diffs.delete(`${name}|${path}`);
  st.diffPath = stepFile(filesOf(name).map((one) => one.path).filter((one) => one !== path), path, 1);
  pullChanges(name);
}

const modKey = (code) => (IS_MAC ? `⌘${code}` : `Ctrl+${code}`);

const modShiftKey = (code) => (IS_MAC ? `⌘⇧${code}` : `Ctrl+Shift+${code}`);

function changesModel(s) {
  const held = changes.get(s.name);
  const data = held?.data;
  const heading = phrase("Changes · not committed");
  const base = String(data?.base || "main").replace(/^origin\//, "");
  if (!data) return { state: "loading", heading, loading: phrase("reading the diff…"), rows: [], ahead: null, progress: null, count: null };
  if (data.state === "gone") {
    return {
      state: "gone", heading, rows: [], ahead: null, progress: null, count: null,
      gone: {
        title: phrase("The worktree is gone"),
        path: shortHome(data.tree),
        full: data.tree || "",
        text: phrase("It was deleted outside the Hive. The seat goes on, without a list of changes."),
        copy: phrase("Copy the path"),
        copied: copiedKey === `gone:${s.name}`
      }
    };
  }
  if (data.state !== "ok") {
    return {
      state: "unread", heading, rows: [], ahead: null, progress: null, count: null,
      unread: data.state === "norepo" ? phrase("this seat is not working inside a git repo") : phrase("could not read the changes: {n}", { n: data.error || "?" })
    };
  }
  const reviewed = data.files.filter((file) => isReviewed(s.name, file)).length;
  const rows = data.files.map((file) => {
    const { dir, base: leaf } = splitPath(file.path);
    return {
      key: file.path,
      path: file.path,
      letter: file.status,
      dir,
      leaf,
      added: file.binary ? "" : file.added ? `+${file.added}` : "",
      removed: file.binary ? "" : file.removed ? `−${file.removed}` : "",
      binary: file.binary ? phrase("binary") : "",
      reviewed: isReviewed(s.name, file),
      on: st.diffChat === s.name && st.diffPath === file.path
    };
  });
  const all = unfoldedLists.has(s.name) || rows.length <= ROWS_SHOWN + 2;
  const shown = all ? rows : rows.filter((row, at) => at < ROWS_SHOWN || row.on);
  return {
    state: rows.length ? "ok" : "empty",
    heading,
    count: rows.length ? { added: `+${data.added}`, removed: `−${data.removed}` } : null,
    rows: shown,
    more: all ? "" : phrase("{n} more files", { n: rows.length - shown.length }),
    empty: rows.length ? null : {
      title: phrase("Nothing changed in the worktree"),
      text: phrase("The seat has not written to any file since the last commit."),
      meta: [data.branch, phrase("clean"), data.head].filter(Boolean).join(" · ")
    },
    ahead: data.ahead.length ? {
      heading: phrase("Commits ahead of {base}", { base }),
      count: String(data.ahead.length),
      rows: data.ahead.map((one) => ({ key: one.sha, sha: one.sha, subject: one.subject, copied: copiedKey === `sha:${one.sha}`, copy: phrase("copy the SHA") }))
    } : null,
    progress: rows.length ? {
      heading: phrase("Progress"),
      pct: Math.round((reviewed / rows.length) * 100),
      text: phrase("{n} of {total} reviewed", { n: reviewed, total: rows.length }),
      hint: reviewed < rows.length ? phrase("the rest stays on the list") : phrase("all reviewed")
    } : null
  };
}

function whereModel(s) {
  const data = changes.get(s.name)?.data;
  const tree = (s.trees || [])[0] || (data?.state === "ok" ? { path: data.top, repo: data.repo, branch: data.branch } : null);
  if (!tree?.path) return null;
  const row = (key, label, value, full) => ({ key, label, value, full, copy: phrase("copy"), copied: copiedKey === `${key}:${s.name}` });
  return {
    heading: phrase("Where"),
    rows: [
      row("repo", phrase("repo"), tree.repo, tree.repo),
      row("tree", tree.main === false || /\/\.?worktrees\//.test(tree.path) ? phrase("worktree") : phrase("folder"), shortHome(tree.path), tree.path),
      ...(tree.branch || data?.branch ? [row("branch", phrase("branch"), tree.branch || data.branch, tree.branch || data.branch)] : [])
    ]
  };
}

function lastTurnModel(s) {
  const f = s.finish;
  const context = structPool.get(s.name)?.context;
  if (!f && !context) return null;
  const meta = f ? finishMeta(f) : [];
  return {
    heading: phrase("Last turn"),
    meta: meta.join(" · "),
    ctx: context ? {
      pct: Math.min(100, Math.max(0, Math.round(context.p))),
      text: phrase("{pct} of {size} context", { pct: `${Math.round(context.p)}%`, size: contextWindow(context.m) }),
      compact: structPool.has(s.name) ? "/compact" : "",
      compactHint: phrase("compact the conversation now")
    } : null
  };
}

function infoViewModel(s) {
  const open = raycastOn() && st.open === s.name;
  if (open) keepChangesFresh(s.name);
  return {
    open,
    copied: phrase("copied"),
    where: open ? whereModel(s) : null,
    changes: open ? changesModel(s) : null,
    last: open ? lastTurnModel(s) : null,
    acts: open ? {
      back: phrase("Back"),
      backKey: "esc",
      reconnect: phrase("Reconnect"),
      reconnectKey: keyLabel(st.keys.reconnect),
      kill: phrase("Close the seat"),
      killKey: keyLabel(st.keys.kill)
    } : null
  };
}

function infoActions(s) {
  return {
    copy: (key, text) => copyText(`${key}:${s.name}`, text),
    copySha: (sha) => copyText(`sha:${sha}`, sha),
    showAll: () => {
      unfoldedLists.add(s.name);
      render();
    },
    showDiff: (path) => (st.diffChat === s.name && st.diffPath === path ? closeDiff() : openDiff(s.name, path)),
    compact: () => {
      const e = structPool.get(s.name);
      if (e) runNativeCommand(e, "compact");
    }
  };
}

function diffViewModel(s) {
  const path = st.diffPath;
  const file = filesOf(s.name).find((one) => one.path === path);
  const held = diffs.get(`${s.name}|${path}`);
  const files = filesOf(s.name);
  const { dir, base } = splitPath(path, 80);
  const at = files.findIndex((one) => one.path === path);
  const head = {
    key: "cd",
    letter: file?.status || "",
    dir,
    leaf: base,
    full: path,
    copyHint: phrase("copy the path ({n})", { n: modShiftKey("C") }),
    copied: copiedKey === `path:${s.name}`,
    copiedSaid: phrase("copied"),
    editor: phrase("Open in editor"),
    editorKey: modKey("E"),
    editorHint: s.where === "cloud" ? phrase("opens in the Hive's own editor — the file lives on the server") : phrase("opens the file in this machine's editor"),
    accept: file && isReviewed(s.name, file) ? phrase("Reviewed") : phrase("Accept"),
    acceptOn: !!file && isReviewed(s.name, file),
    acceptHint: phrase("mark it reviewed — only here, git does not change"),
    acceptKey: "A",
    close: phrase("close the diff (esc)")
  };
  const foot = {
    at: files.length ? phrase("{n} of {total}", { n: at + 1, total: files.length }) : "",
    keys: [
      { key: "j", caps: ["J", "K"], said: phrase("file") },
      { key: "a", caps: ["A"], said: phrase("accept and go to the next") },
      { key: "e", caps: [modKey("E")], said: phrase("editor") },
      { key: "c", caps: [modShiftKey("C")], said: phrase("path") }
    ],
    discard: phrase("discard…"),
    discardKey: IS_MAC ? "⌘⌫" : "Ctrl+⌫"
  };
  const trouble = editorTrouble && editorTrouble.path === path ? {
    title: editorTrouble.discard ? phrase("Could not discard it") : phrase("The editor did not open"),
    why: editorTrouble.why,
    retry: phrase("Try again"),
    copy: phrase("Copy the path"),
    copyKey: modShiftKey("C"),
    discard: !!editorTrouble.discard
  } : null;
  if (!file) {
    return { ...head, foot, trouble, state: "empty", rows: [], empty: phrase("Pick a file on the list to see what changed in it.") };
  }
  if (!held?.data) return { ...head, foot, trouble, state: "loading", rows: [], loading: phrase("reading the diff…") };
  const data = held.data;
  if (data.state === "gone") return { ...head, foot, trouble, state: "gone", rows: [], empty: phrase("The worktree is gone") };
  if (data.state !== "ok") return { ...head, foot, trouble, state: "error", rows: [], empty: phrase("could not read the changes: {n}", { n: data.error || "?" }) };
  if (data.binary) {
    return {
      ...head, foot, trouble, state: "binary", rows: [],
      binary: {
        title: phrase("Binary, no text diff"),
        sizes: data.before && data.after ? `${byteSize(data.before)} → ${byteSize(data.after)}` : byteSize(data.after || data.before)
      }
    };
  }
  const { rows, hidden } = diffRows(data.hunks, WELL_CAP);
  const more = hidden + (data.cut || 0);
  return {
    ...head, foot, trouble,
    state: rows.length ? "ok" : "empty",
    rows,
    more: more ? phrase("… {n} more lines — open it in the editor to see the rest", { n: more }) : "",
    empty: rows.length ? "" : phrase("Only the file mode changed — there is no line to show.")
  };
}

function diffActions(name) {
  return {
    copyPath: () => copyText(`path:${name}`, st.diffPath),
    editor: () => openInMachineEditor(name, st.diffPath),
    accept: () => acceptFile(name, st.diffPath),
    discard: (at) => discardFile(name, st.diffPath, at),
    close: () => closeDiff(),
    retry: () => openInMachineEditor(name, st.diffPath)
  };
}

const typingInField = () => {
  const el = document.activeElement;
  return !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
};

function diffKeys(name, ev) {
  if (typingInField() || st.diffChat !== name) return;
  const mod = IS_MAC ? ev.metaKey : ev.ctrlKey;
  const bare = !ev.metaKey && !ev.ctrlKey && !ev.altKey && !ev.shiftKey;
  const take = (fn) => { ev.preventDefault(); ev.stopPropagation(); fn(); };
  if (ev.key === "Escape" && bare) return take(closeDiff);
  if (bare && ev.code === "KeyJ") return take(() => stepDiff(1));
  if (bare && ev.code === "KeyK") return take(() => stepDiff(-1));
  if (bare && ev.code === "KeyA") return take(() => acceptFile(name, st.diffPath));
  if (mod && ev.shiftKey && !ev.altKey && ev.code === "KeyC") return take(() => copyText(`path:${name}`, st.diffPath));
  if (mod && !ev.shiftKey && !ev.altKey && ev.code === "KeyE") return take(() => openInMachineEditor(name, st.diffPath));
  if (mod && !ev.shiftKey && !ev.altKey && ev.code === "Backspace") {
    const box = ev.currentTarget.getBoundingClientRect();
    return take(() => discardFile(name, st.diffPath, { right: box.right - 16, bottom: box.bottom - 220 }));
  }
}

function paintInfoOfChat(el, s, seatActions) {
  const side = el.querySelector(":scope > .side");
  let host = side?.querySelector(":scope > .i-col");
  const model = infoViewModel(s);
  if (!model.open || !infoView || !side) {
    if (host) {
      infoViews.get(host)?.dispose();
      host.remove();
    }
    return;
  }
  if (!host) {
    host = document.createElement("div");
    host.className = "i-col";
    side.appendChild(host);
    const tile = seatActions(s);
    infoViews.set(host, infoView(host, model, {
      ...infoActions(s),
      back: () => tile.back(),
      reconnect: () => tile.reconnect(),
      close: (at) => tile.close(at)
    }));
  }
  infoViews.get(host).show(model);
}

function paintDiffOfChat(el, s) {
  if (st.diffChat === s.name && (st.open !== s.name || !raycastOn())) st.diffChat = null;
  const on = st.diffChat === s.name;
  el.classList.toggle("diffing", on);
  let win = el.querySelector(":scope > .cd-window");
  if (!on) {
    if (win) {
      diffViews.get(win)?.dispose();
      win.remove();
    }
    return;
  }
  if (!win) {
    win = document.createElement("section");
    win.className = "cd-window";
    win.tabIndex = -1;
    win.addEventListener("click", (ev) => ev.stopPropagation());
    win.addEventListener("keydown", (ev) => diffKeys(s.name, ev));
    el.appendChild(win);
    diffViews.set(win, diffView(win, diffViewModel(s), diffActions(s.name)));
  }
  diffViews.get(win).show(diffViewModel(s));
}

solidMounts.push((hive) => {
  diffView = hive.mountDiffWindow;
  infoView = hive.mountInfoColumn;
});

export { acceptFile, changes, changesModel, closeDiff, diffViewModel, diffs, infoActions, infoViewModel, openDiff, paintDiffOfChat, paintInfoOfChat, pullChanges, pullDiff, stepDiff };
