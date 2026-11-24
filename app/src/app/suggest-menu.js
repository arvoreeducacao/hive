import { dimYardsUnderScrims } from "./chat-and-panes.js";
import { editBox } from "./composer-editing.js";
import { fileIconOf, fileKindOf, fileParts } from "./composer-file-kinds.js";
import { rankCommands } from "./composer-search.js";
import { esc, experienceNext, phrase, st, composerShaped } from "./core.js";
import { peerChoices, personChoices, seatHandle, seatLabel } from "./pure-helpers.js";
import { MENU_MARK, SLASH_FAMILY_NAME, SLASH_FAMILY_ORDER, slashFamily } from "./structured-seats.js";
import { PR_SETTLE_MS, filterPullRequests, prEmptyText, prRowHtml } from "./pr-mentions.js";

const CARET_GAP = 6;
const COMPOSER_GAP = 8;

const CARET_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

const plainKeys = () => `<span>${phrase("enter inserts")}</span><span>${phrase("tab completes")}</span><span>${phrase("esc closes")}</span>`;

const suggestMarkup = () => `<div class="sv-suggest" hidden><div class="sg-card"><div class="sg-list"></div><div class="sgkeys" hidden>${plainKeys()}</div></div></div>`;


function matchMarked(text, q) {
  const at = q ? text.toLowerCase().indexOf(q) : -1;
  if (at < 0) return esc(text);
  return `${esc(text.slice(0, at))}<u>${esc(text.slice(at, at + q.length))}</u>${esc(text.slice(at + q.length))}`;
}

function fileRow(path, i, sel) {
  const kind = fileKindOf(path);
  const parts = fileParts(path);
  return `<div class="sg sg-file${sel ? " sel" : ""}" data-i="${i}" title="${esc(path)}"><svg class="ft" data-kind="${kind}" aria-hidden="true"><use href="#${fileIconOf(kind)}"/></svg><span class="val"><bdi>${esc(parts.name)}</bdi></span><span class="desc">${esc(parts.folder)}</span></div>`;
}

const familyOf = (name, info) => info?.[name]?.family || slashFamily(name);

function suggestMenu({ textarea, suggest, mine, commands, files, prs = null, grow = () => {}, onPick = () => {} }) {
  const suggestList = suggest.querySelector(".sg-list");
  const suggestKeys = suggest.querySelector(".sgkeys");
  let menu = null;
  let fileTimer = null;
  let dismissed = null;
  let prTimer = null;

  let scrim = null;

  const dropScrim = () => {
    scrim?.remove();
    scrim = null;
    dimYardsUnderScrims();
  };

  const raiseScrim = () => {
    if (scrim?.isConnected || !experienceNext()) return;
    scrim = document.createElement("div");
    scrim.className = "sv-scrim";
    scrim.addEventListener("mousedown", (mev) => {
      mev.preventDefault();
      closeMenu();
    });
    (suggest.closest(".tile") || suggest.parentElement).appendChild(scrim);
    dimYardsUnderScrims();
  };

  const caretLineTop = () => {
    const ink = textarea.parentElement?.querySelector(".sv-ink");
    if (!ink) return null;
    const probe = ink.cloneNode(false);
    probe.style.visibility = "hidden";
    const mark = document.createElement("span");
    mark.textContent = "\u200b";
    probe.append(document.createTextNode(textarea.value.slice(0, textarea.selectionStart ?? textarea.value.length)), mark);
    ink.after(probe);
    const top = mark.getBoundingClientRect().top - textarea.scrollTop;
    probe.remove();
    return top;
  };

  const placeOverCaret = () => {
    suggest.style.transform = "";
    suggest.classList.remove("over-text");
    if (!experienceNext() || suggest.hidden) return;
    const line = caretLineTop();
    if (line === null) return;
    const box = getComputedStyle(textarea);
    const firstLine = textarea.getBoundingClientRect().top + (parseFloat(box.borderTopWidth) || 0) + (parseFloat(box.paddingTop) || 0);
    const composer = textarea.closest(".sv-composer");
    const tray = composer?.querySelector(".sv-attach");
    const nothingAbove = line <= firstLine + 1 && !(tray && tray.getBoundingClientRect().height > 0);
    const bottom = suggest.getBoundingClientRect().bottom;
    const lift = nothingAbove && composer
      ? composer.getBoundingClientRect().top - COMPOSER_GAP - bottom
      : line - CARET_GAP - bottom;
    if (nothingAbove ? Math.abs(lift) < 1 : lift <= 0) return;
    suggest.style.transform = `translateY(${Math.round(lift)}px)`;
    if (!nothingAbove) suggest.classList.add("over-text");
  };

  textarea.addEventListener("scroll", () => { if (menu) placeOverCaret(); });

  const closeMenu = () => {
    menu = null;
    dropScrim();
    suggest.style.transform = "";
    suggest.classList.remove("over-text");
    suggest.hidden = true;
    suggestKeys.hidden = true;
    suggestList.innerHTML = "";
  };

  const pickPr = (pr) => {
    const m = menu;
    const v = textarea.value;
    const inserted = `#${pr.number} `;
    textarea.value = v.slice(0, m.start) + inserted + v.slice(m.end);
    const caret = m.start + inserted.length;
    textarea.setSelectionRange(caret, caret);
    closeMenu();
    textarea.focus();
    grow();
    prs.picked(pr);
    onPick("pr", pr);
  };

  const pickMenu = (i) => {
    const m = menu;
    if (m?.prItems && i >= m.items.length) return void (m.prItems[i - m.items.length] && pickPr(m.prItems[i - m.items.length]));
    const item = m?.items[i];
    if (!item) return;
    const inserted = MENU_MARK[m.kind] + (m.kind === "peer" ? seatHandle(item) : item) + " ";
    const end = textarea.value[m.end] === " " ? m.end + 1 : m.end;
    closeMenu();
    editBox(textarea, m.start, end, inserted);
    textarea.focus();
    grow();
    onPick(m.kind, item);
  };

  const renderMenu = (emptyMsg) => {
    const m = menu;
    if (!m) return closeMenu();
    suggest.hidden = false;
    raiseScrim();
    placeOverCaret();
    const raycast = composerShaped();
    if (m.prItems) return renderHashMenu(m, emptyMsg);
    if (!m.items.length && raycast) {
      const how = m.kind === "slash" && m.known ? `<span>${esc(phrase("check the spelling — {n} goes back to the whole list", { n: "⌫" }))}</span>` : "";
      suggestList.innerHTML = `<div class="none"><b>${esc(emptyMsg || "nothing here")}</b>${how}</div>`;
      suggestKeys.hidden = true;
      return;
    }
    if (!m.items.length) {
      suggestList.innerHTML = `<div class="none">${esc(emptyMsg || "nothing here")}</div>`;
      suggestKeys.hidden = true;
      return;
    }
    let group = "";
    const rows = m.items.map((item, i) => {
      if (m.kind === "file") return fileRow(item, i, i === m.sel);
      const info = m.kind === "slash" ? m.info?.[item] : null;
      /* a chat is offered by the name it goes by on the rail, and the handle under it is what the
         box will carry — the person picks the name they know and reads back the word they typed. */
      const shown = m.kind === "peer" ? seatLabel(item) : item;
      const handle = m.kind === "peer" && seatHandle(item) !== shown ? `<span class="hint">#${esc(seatHandle(item))}</span>` : "";
      const hint = info?.argumentHint ? `<span class="hint">${esc(info.argumentHint)}</span>` : "";
      const desc = info?.description ? `<span class="desc">${esc(info.description)}</span>` : "";
      const row = raycast
        ? `<div class="sg${i === m.sel ? " sel" : ""}" data-i="${i}"><span class="mark">${MENU_MARK[m.kind]}</span><span class="val"><bdi>${m.kind === "slash" ? matchMarked(shown, m.q) : esc(shown)}</bdi></span>${handle}${hint}${desc}</div>`
        : `<div class="sg${i === m.sel ? " sel" : ""}" data-i="${i}"><span class="mark">${MENU_MARK[m.kind]}</span><span class="val"><bdi>${esc(shown)}</bdi></span>${handle}${hint}${desc}</div>`;
      if (m.kind !== "slash") return row;
      const family = familyOf(item, m.info);
      const head = family === group ? "" : `<div class="grp">${esc(phrase(SLASH_FAMILY_NAME[family]))}</div>`;
      group = family;
      return head + row;
    }).join("");
    suggestList.innerHTML = rows;
    suggestKeys.hidden = raycast || m.kind !== "slash";
    for (const el of suggestList.querySelectorAll(".sg")) {
      el.addEventListener("mousedown", (mev) => { mev.preventDefault(); pickMenu(Number(el.dataset.i)); });
      el.addEventListener("mousemove", () => {
        const i = Number(el.dataset.i);
        if (!menu || menu.sel === i) return;
        menu.sel = i;
        suggestList.querySelector(".sel")?.classList.remove("sel");
        el.classList.add("sel");
      });
    }
    suggestList.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
  };

  const keptShut = (kind, start) => {
    if (dismissed?.kind === kind && dismissed.start === start) {
      closeMenu();
      return true;
    }
    dismissed = null;
    return false;
  };

  const followCaret = () => {
    if (!dismissed) return;
    const caret = textarea.selectionStart ?? 0;
    const word = textarea.value.slice(dismissed.start, caret);
    if (caret <= dismissed.start || word[0] !== MENU_MARK[dismissed.kind] || /\s/.test(word)) dismissed = null;
  };

  textarea.addEventListener("click", followCaret);
  textarea.addEventListener("keyup", (kev) => { if (CARET_KEYS.has(kev.key)) followCaret(); });

  function renderHashMenu(m, emptyMsg) {
    const chats = m.items.map((item, i) => {
      const shown = seatLabel(item);
      const handle = seatHandle(item) !== shown ? `<span class="hint">#${esc(seatHandle(item))}</span>` : "";
      return `<div class="sg${i === m.sel ? " sel" : ""}" data-i="${i}"><span class="mark">#</span><span class="val"><bdi>${esc(shown)}</bdi></span>${handle}</div>`;
    }).join("");
    const pullRows = m.prItems.map((pr, j) => prRowHtml(pr, { selected: m.items.length + j === m.sel, index: m.items.length + j, here: m.prRepo })).join("");
    const prSays = m.prLoading ? phrase("Finding pull request...") : prEmptyText({ error: m.prError, available: m.prAvailable, query: m.q });
    const prBlock = pullRows || (m.prLoading || m.prAvailable || /^\d+$/.test(m.q) ? `<div class="none sg-pr-none">${esc(prSays)}</div>` : "");
    const head = (label) => `<div class="grp">${esc(label)}</div>`;
    if (!chats && !prBlock) {
      suggestList.innerHTML = `<div class="none">${esc(emptyMsg || "nothing here")}</div>`;
      suggestKeys.hidden = true;
      return;
    }
    suggestList.innerHTML = `${chats ? head(phrase("Chats to mention")) + chats : ""}${prBlock ? `<div role="listbox" aria-label="${esc(phrase("Repository pull requests"))}">${head(phrase("Repository pull requests"))}${prBlock}</div>` : ""}`;
    suggestKeys.hidden = true;
    for (const el of suggestList.querySelectorAll(".sg")) {
      el.addEventListener("mousedown", (mev) => { mev.preventDefault(); pickMenu(Number(el.dataset.i)); });
      el.addEventListener("mousemove", () => {
        const i = Number(el.dataset.i);
        if (!menu || menu.sel === i) return;
        menu.sel = i;
        suggestList.querySelector(".sel")?.classList.remove("sel");
        el.classList.add("sel");
      });
    }
    suggestList.querySelector(".sel")?.scrollIntoView({ block: "nearest" });
  }

  const askPullRequests = (q) => {
    clearTimeout(prTimer);
    prTimer = setTimeout(async () => {
      const said = await prs.find(q);
      if (!menu || menu.kind !== "peer" || menu.q !== q) return;
      menu.prItems = filterPullRequests(said.prs, q, { searched: said.searched });
      menu.prAvailable = said.available;
      menu.prError = said.error;
      menu.prRepo = said.repo || "";
      menu.prLoading = false;
      if (menu.sel >= menu.items.length + menu.prItems.length) menu.sel = 0;
      renderMenu();
    }, PR_SETTLE_MS);
  };

  const computeSuggest = () => {
    const v = textarea.value;
    const caret = textarea.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const slash = before.match(/(^|[\s([{'"])\/([\w:-]*)$/);
    if (slash) {
      const q = slash[2].toLowerCase();
      if (keptShut("slash", caret - q.length - 1)) return;
      const known = commands();
      const hits = rankCommands((known.list || []).filter((c) => !c.startsWith("__")), known.info, q);
      /* the sort is stable, so grouping by family keeps the ranking inside each family — and the
         best match stays selected wherever the grouping moved it. */
      const rank = (name) => SLASH_FAMILY_ORDER.indexOf(familyOf(name, known.info));
      const items = hits.slice().sort((a, b) => rank(a) - rank(b));
      const best = q ? Math.max(0, items.indexOf(hits[0] || "")) : 0;
      const total = (known.list || []).filter((c) => !c.startsWith("__")).length;
      menu = { kind: "slash", items, info: known.info || {}, sel: best, start: caret - q.length - 1, end: caret, q, total, known: total > 0 };
      renderMenu(known.list?.length ? phrase("no command with that name") : known.none);
      return;
    }
    const hash = before.match(/(^|[\s([{'"])#([\w.-]*)$/);
    if (hash) {
      const q = hash[2];
      if (keptShut("peer", caret - q.length - 1)) return;
      const carried = menu?.kind === "peer" && menu.prItems ? menu.prItems : [];
      const chats = peerChoices(st.data.sessions, q, mine());
      menu = { kind: "peer", items: chats, sel: 0, start: caret - q.length - 1, end: caret, q, ...(prs ? { prItems: carried, prLoading: true, prAvailable: true, prError: "", prRepo: "" } : {}) };
      renderMenu(phrase(st.data.sessions.length > 1 ? "no other chat with that name" : "no other chat open to mention"));
      if (prs) askPullRequests(q);
      return;
    }
    const tilde = before.match(/(^|[\s([{'"])~([a-z0-9-]*)$/);
    if (tilde) {
      const q = tilde[2];
      if (keptShut("person", caret - q.length - 1)) return;
      menu = { kind: "person", items: personChoices(st.team.devs, q, st.team.me).map((r) => r.dev), sel: 0, start: caret - q.length - 1, end: caret, q };
      renderMenu(phrase("nobody on the team by that name"));
      return;
    }
    const at = before.match(/(^|[\s([{'"])@([\w./~-]*)$/);
    if (at) {
      const q = at[2];
      const start = caret - q.length - 1;
      if (keptShut("file", start)) return;
      const carried = menu?.kind === "file" ? menu.items : [];
      menu = { kind: "file", items: carried, sel: 0, start, end: caret, q };
      renderMenu(files.searching());
      clearTimeout(fileTimer);
      fileTimer = setTimeout(async () => {
        const r = await files.find(q);
        if (!menu || menu.kind !== "file" || menu.q !== q) return;
        menu.items = r?.files || [];
        menu.sel = 0;
        renderMenu(r?.error || files.none());
      }, 160);
      return;
    }
    dismissed = null;
    closeMenu();
  };

  const key = (kev) => {
    if (!menu || suggest.hidden || kev.isComposing || kev.keyCode === 229) return false;
    if ((kev.key === "ArrowDown" || kev.key === "ArrowUp") && !kev.shiftKey) {
      kev.preventDefault();
      const n = menu.items.length + (menu.prItems?.length || 0);
      if (n) { menu.sel = (menu.sel + (kev.key === "ArrowDown" ? 1 : n - 1)) % n; renderMenu(); }
      return true;
    }
    if ((kev.key === "Enter" && !kev.shiftKey && !kev.metaKey && !kev.ctrlKey) || (kev.key === "Tab" && !kev.shiftKey)) {
      if (!menu.items.length && !menu.prItems?.length) return false;
      kev.preventDefault();
      pickMenu(menu.sel);
      return true;
    }
    if (kev.key === "Escape") {
      kev.preventDefault();
      dismissed = { kind: menu.kind, start: menu.start };
      closeMenu();
      return true;
    }
    return false;
  };

  return { compute: computeSuggest, close: closeMenu, pick: pickMenu, key, open: () => !!menu && !suggest.hidden };
}

export { suggestMarkup, suggestMenu };
