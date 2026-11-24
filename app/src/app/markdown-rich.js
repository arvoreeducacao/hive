import { esc, phrase, raycastOn, st } from "./core.js";
import { middleCut } from "./context-chips.js";
import { openInEditor } from "./files-editor.js";
import { seatLabel, seatSays } from "./pure-helpers.js";
import { changes, openDiff, openInMachineEditor } from "./seat-changes.js";
import { tableAsHtml } from "./table-html.js";
import { boxText, htmlToClipboard, toClipboard } from "./terminal-history.js";
import { canDragFilesOf } from "./file-drag.js";

const PLAIN = new Set(["", "text", "txt", "plaintext", "plain", "output", "log", "mermaid", "math"]);

const LIVE_HIGHLIGHT_CAP = 6000;

const KATEX_CSS = "/assets/dist/lazy/katex/katex.min.css";

const COPIED_FOR = 1200;

function lru(limit) {
  const held = new Map();
  return {
    get: (key) => {
      if (!held.has(key)) return undefined;
      const value = held.get(key);
      held.delete(key);
      held.set(key, value);
      return value;
    },
    set: (key, value) => {
      held.delete(key);
      held.set(key, value);
      if (held.size > limit) held.delete(held.keys().next().value);
    }
  };
}

const highlighted = lru(500);
const typeset = lru(1000);
const diagrams = lru(100);
const lookedUp = new Map();
const MISSING_FOR_MS = 10000;

function lazily(load) {
  let module = null;
  let loading = null;
  return {
    now: () => module,
    load: () => (loading ||= load().then((loaded) => (module = loaded), () => {
      loading = null;
      return null;
    }))
  };
}

const highlighter = lazily(() => import("./markdown-highlight.js"));
const katex = lazily(() => {
  if (typeof document !== "undefined" && !document.querySelector(`link[href="${KATEX_CSS}"]`)) {
    const sheet = document.createElement("link");
    sheet.rel = "stylesheet";
    sheet.href = KATEX_CSS;
    document.head.append(sheet);
  }
  return import("./markdown-katex.js");
});
const mermaid = lazily(() => import("./markdown-mermaid.js"));

const within = (root, selector) => [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];

function paintCode(box) {
  const pre = box.querySelector(":scope > pre.md-code");
  if (!pre || pre.dataset.hl || pre.classList.contains("md-diff")) return;
  const lang = String(box.dataset.lang || "").toLowerCase();
  if (PLAIN.has(lang)) return;
  const code = pre.textContent;
  const open = box.hasAttribute("data-open");
  if (open && code.length > LIVE_HIGHLIGHT_CAP) return;
  const key = `${lang}\n${code}`;
  let html = highlighted.get(key);
  if (html === undefined) {
    const hl = highlighter.now();
    if (!hl) {
      highlighter.load().then((loaded) => { if (loaded) paintCode(box); });
      return;
    }
    html = hl.highlightCode(code, lang) || "";
    if (!open) highlighted.set(key, html);
  }
  if (!html) return;
  pre.innerHTML = html;
  pre.dataset.hl = "1";
}

function darkSurface(el) {
  const probe = el.isConnected ? el : document.querySelector(".sv-msg.md") || document.body;
  const said = typeof getComputedStyle === "function" && probe ? getComputedStyle(probe).color : "";
  const rgb = /(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/.exec(said || "");
  if (!rgb) return true;
  const [r, g, b] = rgb.slice(1).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 128;
}

function viewSay(box) {
  const button = box.querySelector(".md-view");
  if (!button) return;
  const said = box.dataset.view === "code" ? phrase("Show diagram") : phrase("Show code");
  button.title = said;
  button.setAttribute("aria-label", said);
}

function showDiagram(box, held) {
  const pre = box.querySelector(":scope > pre.md-code");
  let stage = box.querySelector(":scope > .md-mermaid");
  box.querySelector(":scope > .md-mermaid-error")?.remove();
  if (held.error) {
    stage?.remove();
    box.dataset.view = "code";
    const note = document.createElement("p");
    note.className = "md-mermaid-error";
    note.textContent = phrase("Unable to render diagram: {why}", { why: held.error });
    box.insertBefore(note, pre);
    viewSay(box);
    return;
  }
  if (!stage) {
    stage = document.createElement("div");
    stage.className = "md-mermaid";
    stage.dataset.mdCopy = `\`\`\`mermaid\n${pre.textContent.trim()}\n\`\`\``;
    stage.tabIndex = 0;
    stage.setAttribute("role", "button");
    stage.setAttribute("aria-label", phrase("Expand diagram"));
    pre.after(stage);
  }
  stage.innerHTML = held.svg;
  box.dataset.view = "diagram";
  viewSay(box);
}

function paintDiagram(box) {
  if (box.hasAttribute("data-open") || box.dataset.view === "code") return;
  const pre = box.querySelector(":scope > pre.md-code");
  const source = pre?.textContent.trim();
  if (!source) return;
  const dark = darkSurface(box);
  const key = `${dark ? "dark" : "light"}\n${source}`;
  const held = diagrams.get(key);
  if (held) return showDiagram(box, held);
  box.dataset.view = "loading";
  mermaid.load()
    .then((loaded) => {
      if (!loaded) throw new Error(phrase("The diagram renderer failed to load."));
      return loaded.renderDiagram(source, dark);
    })
    .then((svg) => ({ svg }), (failure) => ({ error: String(failure?.message || failure || "?").split("\n")[0].slice(0, 200) }))
    .then((done) => {
      if (done.svg) diagrams.set(key, done);
      if (box.dataset.view === "loading") showDiagram(box, done);
    });
}

function paintMath(el) {
  if (el.dataset.typeset || el.hasAttribute("data-open")) return;
  const tex = el.dataset.tex || "";
  if (!tex.trim()) return;
  const display = el.hasAttribute("data-display");
  const key = `${display ? "d" : "i"}:${tex}`;
  let html = typeset.get(key);
  if (html === undefined) {
    const kx = katex.now();
    if (!kx) {
      katex.load().then((loaded) => { if (loaded) paintMath(el); });
      return;
    }
    html = kx.typeset(tex, display);
    typeset.set(key, html);
  }
  if (!html) return;
  el.innerHTML = display ? `<span class="md-math-scroll" tabindex="0">${html}</span>` : html;
  el.dataset.typeset = "1";
}

const sessionOf = (seat) => (st.data?.sessions || []).find((one) => one.name === seat.name && (!seat.where || one.where === seat.where)) || null;

const CLOUD_ROOT = "/workspace/repos";

function homeOf(cwd) {
  const hit = /^\/(?:Users|home)\/[^/]+/.exec(cwd || "");
  return hit ? hit[0] : "";
}

function normalized(path) {
  const out = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!out.length) return null;
      out.pop();
    } else out.push(part);
  }
  return out.join("/");
}

function landingOf(raw, seat) {
  const hit = /^(.*?)(?::(\d+)(?::(\d+))?)?$/.exec(String(raw || "").trim());
  if (!hit) return null;
  let path = hit[1];
  const cwd = sessionOf(seat)?.cwd || "";
  if (path.startsWith("~/")) {
    const home = homeOf(cwd);
    if (!home) return null;
    path = home + path.slice(1);
  }
  if (path.startsWith("/")) {
    if (!cwd || !path.startsWith(`${cwd.replace(/\/+$/, "")}/`)) return null;
    path = path.slice(cwd.replace(/\/+$/, "").length + 1);
  }
  const rel = normalized(path);
  return rel ? { rel, line: Number(hit[2]) || 0, col: Number(hit[3]) || 0 } : null;
}

function inWorkspace(seat, rel) {
  const key = `${seat.where || "local"}|${seat.name}|${rel}`;
  const known = lookedUp.get(key);
  if (known !== undefined && !(known?.missingAt && Date.now() - known.missingAt > MISSING_FOR_MS)) return known?.missingAt ? false : known;
  const missing = () => {
    lookedUp.set(key, { missingAt: Date.now() });
    return false;
  };
  const asked = fetch(`/api/files?name=${encodeURIComponent(seat.name)}&where=${seat.where === "cloud" ? "cloud" : "local"}&q=${encodeURIComponent(rel)}`)
    .then((answer) => (answer.ok ? answer.json() : null))
    .then((said) => {
      if (!said?.files?.includes(rel)) return missing();
      lookedUp.set(key, true);
      return true;
    }, missing);
  lookedUp.set(key, asked);
  return asked;
}

const fileGlyph = '<svg aria-hidden="true"><use href="#i-file"/></svg>';
const chatGlyph = '<svg aria-hidden="true"><use href="#i-hash"/></svg>';

function fileChipOf(el, seat, landing) {
  const name = landing.rel.split("/").pop();
  const at = landing.line ? `:${landing.line}` : "";
  const chip = document.createElement("span");
  chip.className = "ctx-chip md-chip";
  chip.dataset.kind = "file";
  chip.dataset.path = landing.rel;
  chip.dataset.seat = seat.name;
  chip.dataset.where = seat.where || "local";
  if (landing.line) chip.dataset.line = String(landing.line);
  if (canDragFilesOf(seat)) chip.setAttribute("draggable", "true");
  chip.dataset.mdCopy = el.tagName === "CODE" ? `\`${el.textContent}\`` : el.textContent;
  chip.setAttribute("role", "link");
  chip.tabIndex = 0;
  chip.title = `${landing.rel}${at} · ${phrase("open the file")}`;
  chip.innerHTML = `${fileGlyph}<span class="cl">${esc(middleCut(`${name}${at}`, 40))}</span>`;
  return chip;
}

function becomeFileChip(el, seat, landing) {
  if (!el.isConnected && !el.parentNode) return;
  const chip = fileChipOf(el, seat, landing);
  const label = el.textContent.trim();
  const bare = label.replace(/^file:\/\//, "");
  const same = el.tagName === "CODE" || [landing.rel, landing.rel.split("/").pop(), String(el.dataset.path || "")].some((one) => bare === one || bare.startsWith(`${one}:`) || bare.endsWith(`/${one}`));
  if (same) return void el.replaceWith(chip);
  const kept = document.createElement("span");
  kept.dataset.mdCopy = el.textContent;
  kept.append(...el.childNodes, " ", chip);
  el.replaceWith(kept);
}

function paintFile(el, seat) {
  if (el.dataset.looked) return;
  el.dataset.looked = "1";
  el.dataset.seat = seat.name;
  el.dataset.where = seat.where || "local";
  const landing = landingOf(el.dataset.path, seat);
  if (!landing) return;
  const there = inWorkspace(seat, landing.rel);
  if (there === true) return becomeFileChip(el, seat, landing);
  if (there && typeof there.then === "function") there.then((yes) => { if (yes) becomeFileChip(el, seat, landing); });
}

function paintSeat(el) {
  const name = el.dataset.seat;
  const seat = (st.data?.sessions || []).find((one) => one.name === name);
  if (!seat) return;
  const chip = document.createElement("span");
  chip.className = "ctx-chip md-chip";
  chip.dataset.kind = "chat";
  chip.dataset.seat = seat.name;
  chip.dataset.mdCopy = `hive://seat/${seat.name}`;
  chip.title = `${phrase(seatSays(seat).state)} · ${phrase("go to this chat")}`;
  chip.setAttribute("role", "link");
  chip.tabIndex = 0;
  chip.setAttribute("aria-label", `${seatLabel(seat)} · ${chip.title}`);
  chip.innerHTML = `${chatGlyph}<span class="cl">${esc(seatLabel(seat))}</span>`;
  const label = el.textContent.trim();
  if (label === `hive://seat/${name}` || label === name || label === seatLabel(seat)) return void el.replaceWith(chip);
  const kept = document.createElement("span");
  kept.dataset.mdCopy = `[${label}](hive://seat/${name})`;
  kept.append(...el.childNodes, " ", chip);
  el.replaceWith(kept);
}

export function enrichMarkdown(root, { seat = null } = {}) {
  if (!root?.querySelectorAll) return root;
  for (const box of within(root, ".md-codebox")) {
    paintCode(box);
    if (box.hasAttribute("data-mermaid")) paintDiagram(box);
  }
  for (const math of within(root, ".md-math")) paintMath(math);
  if (seat?.name) for (const one of within(root, "code.md-pathish, a.md-file")) paintFile(one, seat);
  for (const one of within(root, "a.md-seat")) paintSeat(one);
  return root;
}

function flashCopied(button) {
  clearTimeout(Number(button.dataset.back || 0));
  if (!button.dataset.said) button.dataset.said = button.title;
  button.classList.add("copied");
  button.title = phrase("Copied");
  button.setAttribute("aria-label", phrase("Copied"));
  button.dataset.back = String(setTimeout(() => {
    button.classList.remove("copied");
    button.title = button.dataset.said;
    button.setAttribute("aria-label", button.dataset.said);
  }, COPIED_FOR));
}

function toggleWrap(box, button) {
  const wrapped = box.dataset.wrap !== "false";
  box.dataset.wrap = wrapped ? "false" : "true";
  const said = wrapped ? phrase("Wrap lines") : phrase("Disable line wrap");
  button.setAttribute("aria-pressed", wrapped ? "false" : "true");
  button.title = said;
  button.setAttribute("aria-label", said);
}

function toggleView(box) {
  if (box.dataset.view === "code") {
    box.dataset.view = "";
    box.querySelector(":scope > .md-mermaid-error")?.remove();
    paintDiagram(box);
  } else {
    box.dataset.view = "code";
  }
  viewSay(box);
}

function cellText(cell) {
  const copy = cell.cloneNode(true);
  for (const kept of copy.querySelectorAll("[data-md-copy]")) kept.replaceWith(kept.dataset.mdCopy);
  return copy.textContent.replace(/\s+/g, " ").trim();
}

function tableRows(table) {
  return [...table.querySelectorAll("tr")].map((row) => [...row.children].filter((cell) => /^T[HD]$/.test(cell.tagName)));
}

export function tableAsMarkdown(table) {
  const rows = tableRows(table);
  if (!rows.length) return "";
  const line = (cells) => `| ${cells.map((cell) => cellText(cell).replaceAll("|", "\\|")).join(" | ")} |`;
  const rule = rows[0].map((cell) => ({ center: ":---:", right: "---:", left: ":---" })[cell.dataset.align] || "---");
  return [line(rows[0]), `| ${rule.join(" | ")} |`, ...rows.slice(1).map(line)].join("\n");
}

export function tableAsCsv(table) {
  const csv = (said) => (/[",\n]/.test(said) ? `"${said.replaceAll('"', '""')}"` : said);
  return tableRows(table).filter((cells) => cells.length).map((cells) => cells.map((cell) => csv(cellText(cell))).join(",")).join("\n");
}

const TABLE_COPIES = [
  ["Copy as Markdown", (table) => toClipboard(tableAsMarkdown(table))],
  ["Copy as CSV", (table) => toClipboard(tableAsCsv(table))],
  ["Copy as HTML", (table) => {
    const markup = tableAsHtml(table);
    return htmlToClipboard(markup, `<meta charset="utf-8">${markup}`);
  }]
];

let menu = null;

function closeMenu() {
  menu?.remove();
  menu = null;
}

function openTableMenu(button) {
  const was = menu?.dataset.for === "1" && menu.owner === button;
  closeMenu();
  if (was) return;
  const table = button.closest(".md-table")?.querySelector("table");
  if (!table) return;
  menu = document.createElement("div");
  menu.className = "md-menu";
  menu.setAttribute("role", "menu");
  menu.dataset.for = "1";
  menu.owner = button;
  for (const [said, copy] of TABLE_COPIES) {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.textContent = phrase(said);
    item.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      closeMenu();
      if (await copy(table)) flashCopied(button);
    });
    menu.append(item);
  }
  const box = button.getBoundingClientRect();
  menu.style.top = `${Math.round(box.bottom + 4)}px`;
  menu.style.right = `${Math.round(Math.max(4, (document.documentElement.clientWidth || 0) - box.right))}px`;
  const tone = button.closest("[data-tone]")?.dataset.tone;
  if (tone) menu.dataset.tone = tone;
  document.body.append(menu);
  menu.querySelector("button")?.focus({ preventScroll: true });
}

const canvasCovered = () => raycastOn() && document.getElementById("structure-root")?.hidden === false;

const leavesForEditor = (ev) => (/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "") ? !!ev.metaKey : !!ev.ctrlKey);

function repoOf(seat, rel) {
  const session = sessionOf(seat);
  const root = (seat.where === "cloud" ? CLOUD_ROOT : st.data?.hub || "").replace(/\/+$/, "");
  const cwd = String(session?.cwd || "").replace(/\/+$/, "");
  if (!root || !cwd) return null;
  if (cwd === root) {
    const [repo, ...rest] = rel.split("/");
    return rest.length ? { repo, path: rest.join("/") } : null;
  }
  return cwd.startsWith(`${root}/`) ? { repo: cwd.slice(root.length + 1), path: rel } : null;
}

function openChatFile(chip, ev) {
  const seat = { name: chip.dataset.seat, where: chip.dataset.where || "local" };
  const rel = chip.dataset.path;
  const line = Number(chip.dataset.line) || 0;
  if (!seat.name || !rel) return;
  if (leavesForEditor(ev)) return void openInMachineEditor(seat.name, rel, line || 1);
  if (canvasCovered()) {
    if ((changes.get(seat.name)?.data?.files || []).some((one) => one.path === rel)) return void openDiff(seat.name, rel);
    return void openInMachineEditor(seat.name, rel, line || 1);
  }
  const at = repoOf(seat, rel);
  if (!at) return void openInMachineEditor(seat.name, rel, line || 1);
  openInEditor({ ...at, where: seat.where, line });
}

function onClick(ev) {
  const target = ev.target;
  if (menu && !target.closest?.(".md-menu, .md-table-copy")) closeMenu();
  const button = target.closest?.(".md-copy, .md-wrap, .md-view, .md-table-copy");
  if (button) {
    ev.preventDefault();
    const box = button.closest(".md-codebox");
    if (button.classList.contains("md-table-copy")) return openTableMenu(button);
    if (!box) return;
    if (button.classList.contains("md-wrap")) return toggleWrap(box, button);
    if (button.classList.contains("md-view")) return toggleView(box);
    const pre = box.querySelector(":scope > pre.md-code");
    if (pre) toClipboard(boxText(pre)).then((done) => { if (done) flashCopied(button); });
    return;
  }
  const file = target.closest?.(".md-chip[data-kind=file], a.md-file");
  if (file) {
    ev.preventDefault();
    if (file.classList.contains("md-chip")) return openChatFile(file, ev);
    const seat = { name: file.dataset.seat, where: file.dataset.where || "local" };
    const landing = seat.name ? landingOf(file.dataset.path, seat) : null;
    if (landing) openChatFile({ dataset: { seat: seat.name, where: seat.where, path: landing.rel, line: String(landing.line || "") } }, ev);
    return;
  }
  const chat = target.closest?.(".md-chip[data-kind=chat], a.md-seat");
  if (chat) {
    ev.preventDefault();
    window.hiveGoTo?.(chat.dataset.seat);
  }
}

function onKey(ev) {
  if (ev.key === "Escape" && menu) {
    const owner = menu.owner;
    closeMenu();
    owner?.focus?.({ preventScroll: true });
    return;
  }
  if ((ev.key === "Enter" || ev.key === " ") && ev.target?.matches?.(".md-chip[data-kind=file]")) {
    ev.preventDefault();
    openChatFile(ev.target, ev);
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("scroll", (ev) => { if (menu && ev.target?.contains?.(menu.owner)) closeMenu(); }, true);
}

export { closeMenu as closeTableMenu, landingOf };
