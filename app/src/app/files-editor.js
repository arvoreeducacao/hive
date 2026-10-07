import { render } from "./arrange.js";
import { activeItems, blockWithRoom, openBlock, saveBlocks } from "./blocks.js";
import { esc, phrase, RAYCAST_FONT, raycastOn, st } from "./core.js";
import { tiles } from "./leader-key.js";
import { ask } from "./pod.js";

const TAB_LIMIT = 8;

const editors = new Map();

let editorSeq = 0;

let monacoWanted = null;

function loadMonaco() {
  if (monacoWanted) return monacoWanted;
  monacoWanted = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/vendor/monaco/editor/editor.main.css";
    document.head.appendChild(css);
    const tag = document.createElement("script");
    tag.src = "/vendor/monaco/loader.js";
    tag.onerror = () => reject(new Error("monaco did not load"));
    tag.onload = () => {
      try {
        window.require.config({ paths: { vs: "/vendor/monaco" } });
        window.MonacoEnvironment = {
          getWorkerUrl: () => URL.createObjectURL(new Blob([
            `self.MonacoEnvironment={baseUrl:"${location.origin}/vendor/monaco/"};`,
            `importScripts("${location.origin}/vendor/monaco/loader.js");`,
            `require(["vs/editor/editor.worker"],function(){});`
          ], { type: "text/javascript" }))
        };
        window.require(["vs/editor", "vs/basic-languages/monaco.contribution"], (api) => {
          try { defineHiveTheme(api); } catch {}
          resolve(api);
        }, reject);
      } catch (e) { reject(e); }
    };
    document.head.appendChild(tag);
  });
  return monacoWanted;
}

function defineHiveTheme(api) {
  api.editor.defineTheme("hive", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "C9C5BE" },
      { token: "comment", foreground: "6E6A63", fontStyle: "italic" },
      { token: "keyword", foreground: "9B8CC4" },
      { token: "keyword.control", foreground: "9B8CC4" },
      { token: "string", foreground: "4EA96F" },
      { token: "string.escape", foreground: "4EA96F" },
      { token: "number", foreground: "E0AF68" },
      { token: "constant", foreground: "E0AF68" },
      { token: "type", foreground: "6FA3B4" },
      { token: "type.identifier", foreground: "6FA3B4" },
      { token: "identifier", foreground: "C9C5BE" },
      { token: "delimiter", foreground: "8E8A83" },
      { token: "annotation", foreground: "CD694A" },
      { token: "tag", foreground: "6FA3B4" },
      { token: "attribute.name", foreground: "7DCFFF" }
    ],
    colors: {
      "editor.background": "#0A0A0A",
      "editor.foreground": "#C9C5BE",
      "editorLineNumber.foreground": "#5A5751",
      "editorLineNumber.activeForeground": "#C4C0B9",
      "editorCursor.foreground": "#CD694A",
      "editor.selectionBackground": "#1D2E36",
      "editor.lineHighlightBackground": "#151514",
      "editorIndentGuide.background1": "#2B2A28",
      "editorIndentGuide.activeBackground1": "#45423C",
      "editorGutter.modifiedBackground": "#4A7C8C",
      "editorGutter.addedBackground": "#4EA96F",
      "editorGutter.deletedBackground": "#CD694A",
      "editorWidget.background": "#191919",
      "editorWidget.border": "#3A3A3A",
      "editorSuggestWidget.background": "#191919",
      "editorSuggestWidget.selectedBackground": "#202020",
      "scrollbarSlider.background": "#26262680",
      "minimap.background": "#0A0A0A"
    }
  });
}

const fileKey = (f) => `${f.where || "local"}|${f.repo}|${f.path}`;

const baseName = (path) => String(path || "").split("/").pop();

function editorOf(key) {
  return key && key.startsWith("file:") ? editors.get(key.slice(5)) : null;
}

function editorInBlock(at = st.block) {
  const b = st.blocks[at];
  if (!b) return null;
  for (const key of b.keys) {
    const ed = editorOf(key);
    if (ed) return ed;
  }
  return null;
}

function openInEditor(file, opts = {}) {
  if (!file || !file.repo || !file.path) return;
  const where = file.where === "cloud" ? "cloud" : "local";
  const tab = {
    key: fileKey({ ...file, where }),
    repo: file.repo,
    name: file.name || file.repo.split("/").pop(),
    branch: file.branch || "",
    where,
    path: file.path,
    line: Number(file.line) || 0,
    text: null,
    dirty: false,
    error: "",
    loading: true
  };
  const ed = opts.beside ? null : editorInBlock();
  if (ed) {
    addTab(ed, tab);
    render();
    return ed;
  }
  const b = blockWithRoom() || openBlock();
  const id = `e${++editorSeq}`;
  const made = { id, tabs: [], active: 0, saving: false, said: "" };
  editors.set(id, made);
  addTab(made, tab);
  b.keys.push(`file:${id}`);
  st.block = st.blocks.indexOf(b);
  b.manual = true;
  saveBlocks();
  render();
  return made;
}

function addTab(ed, tab) {
  const at = ed.tabs.findIndex((t) => t.key === tab.key);
  if (at >= 0) {
    ed.active = at;
    if (tab.line) revealLine(ed, tab.line);
    return;
  }
  ed.tabs.push(tab);
  if (ed.tabs.length > TAB_LIMIT) {
    const drop = ed.tabs.findIndex((t) => !t.dirty);
    if (drop >= 0) disposeTab(ed.tabs.splice(drop, 1)[0]);
  }
  ed.active = ed.tabs.length - 1;
  pullFile(ed, tab);
}

async function pullFile(ed, tab) {
  const at = `/api/file?where=${tab.where}&repo=${encodeURIComponent(tab.repo)}&path=${encodeURIComponent(tab.path)}`;
  try {
    const res = await fetch(at);
    const got = await res.json();
    tab.loading = false;
    if (got.error) tab.error = got.error;
    else { tab.text = got.text; tab.language = got.language || ""; }
  } catch (e) {
    tab.loading = false;
    tab.error = String(e?.message || e).slice(0, 120);
  }
  render();
}

function disposeTab(tab) {
  try { tab.model?.dispose(); } catch {}
  tab.model = null;
}

async function closeEditorTab(ed, at) {
  const tab = ed.tabs[at];
  if (!tab) return;
  if (tab.dirty && !(await ask(phrase("Close it without saving?"),
    `<code>${esc(baseName(tab.path))}</code> ${phrase("has changes that never reached the worktree. Closing the tab throws them away.")}`,
    "close it anyway"))) return;
  disposeTab(tab);
  ed.tabs.splice(at, 1);
  if (!ed.tabs.length) return closeEditor(ed);
  ed.active = Math.min(ed.active, ed.tabs.length - 1);
  render();
}

function closeEditor(ed) {
  const key = `file:${ed.id}`;
  for (const b of st.blocks) {
    const at = b.keys.indexOf(key);
    if (at >= 0) b.keys.splice(at, 1);
  }
  dropEditor(key);
  saveBlocks();
  render();
}

function dropEditor(key) {
  const ed = editorOf(key);
  if (!ed) return;
  for (const tab of ed.tabs) disposeTab(tab);
  try { ed.view?.dispose(); } catch {}
  editors.delete(ed.id);
}

function revealLine(ed, line) {
  if (!ed.view || !line) return;
  ed.view.revealLineNearTop(line);
  ed.view.setPosition({ lineNumber: line, column: 1 });
  ed.view.focus();
}

async function saveEditor(ed) {
  const tab = ed.tabs[ed.active];
  if (!tab || !tab.model) return;
  ed.saving = true;
  paintEditor(ed);
  const res = await fetch("/api/file", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ where: tab.where, repo: tab.repo, path: tab.path, text: tab.model.getValue() })
  }).catch(() => null);
  const got = res ? await res.json().catch(() => ({ error: phrase("the server said nothing") })) : { error: phrase("the server did not answer") };
  ed.saving = false;
  if (got.error) {
    ed.said = got.error;
  } else {
    tab.dirty = false;
    tab.saved = Date.now();
    ed.said = tab.where === "cloud" ? phrase("saved on the server") : phrase("saved");
  }
  paintEditor(ed);
}

function createFileTile(it) {
  const el = document.createElement("article");
  el.className = "tile editor";
  el.dataset.key = it.key;
  el.innerHTML = `
    <div class="ed-bar">
      <div class="ed-tabs"></div>
      <div class="ed-acts">
        <button class="ghost ed-save" title="${phrase("save the file where it lives")}">${phrase("save")}</button>
        <button class="ghost ed-close" title="${phrase("close the editor")}" aria-label="${phrase("close the editor")}"><svg aria-hidden="true"><use href="#i-close"/></svg></button>
      </div>
    </div>
    <div class="ed-mount"></div>
    <div class="ed-status"><span class="ed-where"></span><span class="ed-at"></span><span class="ed-said"></span></div>`;
  el.addEventListener("pointerdown", () => {
    const at = activeItems().findIndex((i) => i.key === it.key);
    if (at >= 0 && at !== st.focus) { st.focus = at; render(); }
  });
  el.querySelector(".ed-save").addEventListener("click", (ev) => { ev.stopPropagation(); saveEditor(it); });
  el.querySelector(".ed-close").addEventListener("click", (ev) => { ev.stopPropagation(); closeEditor(it); });
  el.querySelector(".ed-tabs").addEventListener("click", (ev) => {
    const shut = ev.target.closest(".ed-tab-x");
    const tab = ev.target.closest(".ed-tab");
    if (!tab) return;
    ev.stopPropagation();
    const at = Number(tab.dataset.at);
    if (shut) return closeEditorTab(it, at);
    it.active = at;
    render();
  });
  mountEditor(el, it);
  return el;
}

async function mountEditor(el, ed) {
  const mount = el.querySelector(".ed-mount");
  mount.textContent = phrase("opening the editor…");
  let api;
  try { api = await loadMonaco(); }
  catch { mount.textContent = phrase("monaco did not load — the editor needs the app's own server"); return; }
  if (!el.isConnected || !editors.has(ed.id)) return;
  mount.textContent = "";
  ed.api = api;
  ed.view = api.editor.create(mount, {
    theme: "hive",
    automaticLayout: true,
    fontFamily: raycastOn() ? RAYCAST_FONT.mono : "Hack, ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12.5,
    lineHeight: 19,
    minimap: { enabled: true, renderCharacters: false },
    scrollBeyondLastLine: false,
    renderLineHighlight: "all",
    smoothScrolling: true,
    cursorBlinking: "smooth",
    padding: { top: 6 },
    tabSize: 2,
    guides: { indentation: true },
    /* no language server here: red squiggles would be a promise we do not keep */
    quickSuggestions: false,
    parameterHints: { enabled: false },
    occurrencesHighlight: "off",
    codeLens: false,
    contextmenu: false
  });
  ed.view.addCommand(api.KeyMod.CtrlCmd | api.KeyCode.KeyS, () => saveEditor(ed));
  ed.view.onDidChangeCursorPosition(() => paintEditor(ed));
  paintEditor(ed);
}

function modelFor(ed, tab) {
  if (tab.model || tab.text === null || !ed.api) return tab.model;
  const api = ed.api;
  const uri = api.Uri.parse(`hive://${tab.where}/${tab.repo}/${tab.path}`);
  tab.model = api.editor.getModel(uri) || api.editor.createModel(tab.text, monacoLanguageOf(tab.path), uri);
  tab.model.onDidChangeContent(() => {
    if (tab.dirty) return;
    tab.dirty = true;
    paintEditor(ed);
  });
  return tab.model;
}

const MONACO_BY_EXTENSION = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  json: "json", md: "markdown", css: "css", scss: "scss", html: "html", heex: "elixir", ex: "elixir", exs: "elixir",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", swift: "swift", sh: "shell",
  bash: "shell", zsh: "shell", yml: "yaml", yaml: "yaml", sql: "sql", graphql: "graphql", xml: "xml", toml: "ini", ini: "ini"
};

function monacoLanguageOf(path) {
  const name = baseName(path).toLowerCase();
  if (name.startsWith("dockerfile")) return "dockerfile";
  return MONACO_BY_EXTENSION[name.split(".").pop()] || "plaintext";
}

function showEditorTab(ed, tab) {
  if (!tab || !ed.view) return;
  const model = modelFor(ed, tab);
  if (!model || ed.view.getModel() === model) return;
  if (ed.showing) ed.state = { ...(ed.state || {}), [ed.showing]: ed.view.saveViewState() };
  ed.view.setModel(model);
  ed.showing = tab.key;
  const back = (ed.state || {})[tab.key];
  if (back) ed.view.restoreViewState(back);
  if (tab.line) revealLine(ed, tab.line);
}

function paintEditor(ed) {
  const el = tiles.get(`file:${ed.id}`);
  if (!el) return;
  const side = fileSideOf(el, ed);
  const tab = ed.tabs[ed.active];
  showEditorTab(ed, tab);
  side.show(fileViewModel(ed));
  el.classList.toggle("loading", !!(tab && tab.loading));
  if (tab?.error && !ed.view) el.querySelector(".ed-mount").textContent = tab.error;
}

st.fileSide = null;

const fileSides = new WeakMap();

function fileViewModel(ed) {
  const tab = ed.tabs[ed.active];
  const at = ed.view?.getPosition?.();
  const parts = tab ? [
    tab.where === "cloud" ? "pod" : "this machine",
    `${tab.name}${tab.branch ? ` · ${tab.branch}` : ""}`,
    tab.path
  ] : ["nothing open"];
  return {
    bar: {
      tabs: ed.tabs.map((t, i) => ({
        key: t.key || String(i), at: i, on: i === ed.active,
        hint: `${t.name} · ${t.path}`, name: baseName(t.path), dirty: !!t.dirty
      })),
      dirty: !!tab?.dirty,
      save: phrase("save"),
      saveHint: phrase("save the file where it lives"),
      closeHint: phrase("close the editor")
    },
    status: {
      where: parts.map((one, i) => ({ key: `w${i}`, text: one, un: false })),
      at: [
        at ? { key: "at", text: `Ln ${at.lineNumber}, Col ${at.column}`, un: false } : null,
        tab?.dirty ? { key: "un", text: phrase("not saved"), un: true } : null
      ].filter(Boolean),
      said: ed.saving ? "saving…" : (ed.said || (tab?.error ? tab.error : ""))
    }
  };
}

function fileActions(it) {
  return {
    save: () => saveEditor(it),
    close: () => closeEditor(it),
    pickTab: (at) => { it.active = at; render(); },
    closeTab: (at) => closeEditorTab(it, at)
  };
}

function fileSideOf(el, it) {
  let side = fileSides.get(el);
  if (!side) {
    side = st.fileSide(el, fileViewModel(it), fileActions(it));
    fileSides.set(el, side);
  }
  return side;
}

function updateFile(el, it, pos) {
  el.classList.toggle("focused", pos === st.focus);
  paintEditor(it);
}

export { MONACO_BY_EXTENSION, TAB_LIMIT, addTab, baseName, closeEditor, closeEditorTab, createFileTile, defineHiveTheme, disposeTab, dropEditor, editorInBlock, editorOf, editorSeq, editors, fileActions, fileKey, fileSideOf, fileSides, fileViewModel, loadMonaco, modelFor, monacoLanguageOf, monacoWanted, mountEditor, openInEditor, paintEditor, pullFile, revealLine, saveEditor, showEditorTab, updateFile };
