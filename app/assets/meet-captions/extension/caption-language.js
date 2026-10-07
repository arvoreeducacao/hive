(function (root) {
  const DEFAULT = "pt-BR";
  const KEEP = "keep";
  const LANGUAGES = {
    "pt-BR": { first: ["Português (Brasil)", "Portuguese (Brazil)", "Portugués (Brasil)"], second: ["Português", "Portuguese", "Portugués"] },
    en: { first: ["Inglês", "English", "Inglés"], second: ["Inglês (Estados Unidos)", "English (United States)", "English (US)", "Inglés (Estados Unidos)"] },
    es: { first: ["Espanhol (Espanha)", "Spanish (Spain)", "Español (España)", "Espanhol", "Spanish", "Español"], second: ["Espanhol (México)", "Spanish (Mexico)", "Español (México)"] }
  };
  const CODES = [...Object.keys(LANGUAGES), KEEP];
  const LABELS = {
    pt: { "pt-BR": "Português (Brasil)", en: "Inglês", es: "Espanhol", keep: "Não mexer no idioma do Meet" },
    en: { "pt-BR": "Portuguese (Brazil)", en: "English", es: "Spanish", keep: "Leave Meet's language alone" }
  };
  const POPUP = '[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="menu"], [aria-haspopup="true"]';
  const CLICKABLE = 'button, [role="button"], [tabindex]';
  const LABELLED = "[aria-label]";
  const OPTION = '[role="option"], [role="menuitemradio"], [role="menuitem"], li';
  const LIST = '[role="listbox"], [role="menu"]';
  const OPTION_ROLES = ["option", "menuitemradio", "menuitem"];
  const ABOUT_LANGUAGE = /idioma|language|l[ií]ngua|lengua|langue|sprache/i;
  const ABOUT_CAPTIONS = /legenda|caption|subt[ií]tulo/i;
  const TOGGLE = /turn o(n|ff)|ativar|desativar|activar|desactivar|aktivieren|activer|attiva/i;
  const PIECES_MAX = 4;
  const SHOWN_MAX = 60;
  const OPEN_WAITS = 6;
  const OPEN_WAIT_MS = 150;
  const SCROLL_WAIT_MS = 120;
  const SETTLE_MS = 400;
  const SCROLLS_MAX = 40;

  const normalize = (text) => String(text || "")
    .replace(/BETA\s*$/, " ")
    .replace(/\bbeta\b/gi, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*\(\s*/g, " (")
    .replace(/\s*\)/g, ")")
    .replace(/\s+/g, " ")
    .trim();

  const TABLE = Object.fromEntries(Object.entries(LANGUAGES).map(([code, names]) => [code, { first: names.first.map(normalize), all: [...names.first, ...names.second].map(normalize) }]));

  const prefOf = (value) => (CODES.includes(value) ? value : DEFAULT);
  const labelOf = (code, portuguese) => (portuguese ? LABELS.pt : LABELS.en)[prefOf(code)];

  function rankOf(code, text) {
    const known = TABLE[code];
    return known ? known.all.indexOf(normalize(text)) : -1;
  }

  const isFirstChoice = (code, text) => !!TABLE[code] && TABLE[code].first.includes(normalize(text));

  function codeOf(text) {
    for (const code of Object.keys(TABLE)) if (rankOf(code, text) >= 0) return code;
    return "";
  }

  function decide(pref, shown) {
    const wanted = prefOf(pref);
    if (wanted === KEEP) return "keep";
    return rankOf(wanted, shown) >= 0 ? "same" : "switch";
  }

  const needsSwitch = (pref, shown) => decide(pref, shown) === "switch";

  function pickOption(pref, texts) {
    let best = -1;
    let rank = Infinity;
    texts.forEach((text, index) => {
      const at = rankOf(prefOf(pref), text);
      if (at >= 0 && at < rank) { rank = at; best = index; }
    });
    return best;
  }

  function piecesOf(el, most = Infinity) {
    const pieces = [];
    const walk = (node) => {
      if (pieces.length > most) return;
      if (node.nodeType === 3) { const said = String(node.nodeValue || "").replace(/\s+/g, " ").trim(); if (said) pieces.push(said); return; }
      if (node.nodeType !== 1) return;
      for (const child of node.childNodes || []) walk(child);
    };
    walk(el);
    return pieces;
  }

  function nameIn(el, matches) {
    const pieces = piecesOf(el, PIECES_MAX);
    if (!pieces.length || pieces.length > PIECES_MAX) return "";
    const whole = pieces.join(" ");
    if (whole.length > SHOWN_MAX) return "";
    return [...pieces, whole, pieces.join("")].find(matches) || "";
  }

  const shownIn = (el) => nameIn(el, (piece) => !!codeOf(piece));
  const roleOf = (el) => (el.getAttribute && el.getAttribute("role")) || "";
  const isOption = (el) => OPTION_ROLES.includes(roleOf(el)) || String(el.tagName || "").toLowerCase() === "li";

  function insideOption(el) {
    for (let at = el; at; at = at.parentElement) if (isOption(at)) return true;
    return false;
  }

  function findPicker(doc) {
    const popups = new Set(doc.querySelectorAll(POPUP));
    const seen = new Set();
    let best = null;
    for (const el of [...popups, ...doc.querySelectorAll(CLICKABLE), ...doc.querySelectorAll(LABELLED)]) {
      if (seen.has(el)) continue;
      seen.add(el);
      const role = roleOf(el);
      if (insideOption(el) || role === "region" || role === "listbox" || role === "menu" || el.getAttribute("aria-live")) continue;
      const label = el.getAttribute("aria-label") || "";
      if (TOGGLE.test(label)) continue;
      const shown = shownIn(el);
      const popup = popups.has(el);
      const named = ABOUT_LANGUAGE.test(label);
      if (!shown && !(named && popup)) continue;
      const score = (popup ? 4 : 0) + (shown ? 2 : 0) + (named ? 2 : ABOUT_CAPTIONS.test(label) ? 1 : 0);
      if (!best || score > best.score) best = { el, shown, score, how: popup ? "popup" : named ? "label" : "text" };
    }
    return best;
  }

  function optionsOf(doc, pref) {
    const found = [];
    for (const el of doc.querySelectorAll(OPTION)) {
      const name = nameIn(el, (piece) => rankOf(pref, piece) >= 0);
      if (name) found.push({ el, name, rank: rankOf(pref, name), first: isFirstChoice(pref, name) });
    }
    const inner = found.filter((one) => !found.some((other) => other !== one && one.el.contains(other.el)));
    inner.sort((a, b) => a.rank - b.rank);
    return inner;
  }

  const countOptions = (doc) => doc.querySelectorAll(OPTION).length;

  function isOpen(doc, idle = Infinity) {
    const options = doc.querySelectorAll(OPTION);
    if (options.length > idle) return true;
    for (const el of options) if (nameIn(el, (piece) => !!codeOf(piece))) return true;
    return false;
  }

  function scrollerOf(doc) {
    const tried = new Set();
    const scrolls = (el) => !!el && !tried.has(el) && (tried.add(el), el.scrollHeight > el.clientHeight + 4);
    const lists = [...doc.querySelectorAll(LIST)].reverse();
    for (const list of lists) {
      let at = list;
      for (let up = 0; at && up < 4; up++, at = at.parentElement) if (scrolls(at)) return at;
    }
    for (const el of doc.querySelectorAll(OPTION)) {
      if (!nameIn(el, (piece) => !!codeOf(piece))) continue;
      let at = el.parentElement;
      for (let up = 0; at && up < 5; up++, at = at.parentElement) if (scrolls(at)) return at;
      break;
    }
    return null;
  }

  const pause = (ms) => new Promise((done) => setTimeout(done, ms));

  async function waitOpen(doc, wait, idle) {
    for (let turn = 0; turn < OPEN_WAITS; turn++) {
      if (isOpen(doc, idle)) return true;
      await wait(OPEN_WAIT_MS);
    }
    return isOpen(doc, idle);
  }

  function press(el, doc, kinds) {
    const view = doc.defaultView || root;
    if (typeof view.MouseEvent !== "function") return;
    for (const kind of kinds) el.dispatchEvent(new view.MouseEvent(kind, { bubbles: true, cancelable: true }));
  }

  async function openPicker(doc, picker, wait, idle) {
    picker.el.click();
    if (await waitOpen(doc, wait, idle)) return true;
    press(picker.el, doc, ["pointerdown", "mousedown", "pointerup", "mouseup"]);
    return waitOpen(doc, wait, idle);
  }

  async function closePicker(doc, picker, wait, idle) {
    if (!isOpen(doc, idle)) return;
    const view = doc.defaultView || root;
    if (typeof view.KeyboardEvent === "function") {
      const at = doc.querySelectorAll(OPTION)[0] || doc.querySelectorAll(LIST)[0] || picker.el;
      at.dispatchEvent(new view.KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
      await wait(OPEN_WAIT_MS);
    }
    if (!isOpen(doc, idle)) return;
    picker.el.click();
    await wait(OPEN_WAIT_MS);
  }

  async function seekOption(doc, pref, wait, scrolls) {
    const look = () => optionsOf(doc, pref)[0] || null;
    let seen = look();
    if (seen && seen.first) return seen;
    const box = scrollerOf(doc);
    if (!box) return seen;
    let spare = seen ? box.scrollTop : -1;
    box.scrollTop = 0;
    await wait(SCROLL_WAIT_MS);
    for (let turn = 0; turn < scrolls; turn++) {
      seen = look();
      if (seen && seen.first) return seen;
      if (seen && spare < 0) spare = box.scrollTop;
      const at = box.scrollTop;
      box.scrollTop = at + Math.max(40, Math.round(box.clientHeight * 0.8));
      await wait(SCROLL_WAIT_MS);
      if (box.scrollTop <= at) break;
    }
    seen = look();
    if (seen) return seen;
    if (spare < 0) return null;
    box.scrollTop = spare;
    await wait(SCROLL_WAIT_MS);
    return look();
  }

  async function setLanguage(doc, pref, { wait = pause, scrolls = SCROLLS_MAX } = {}) {
    const wanted = prefOf(pref);
    if (wanted === KEEP) return { state: "keep" };
    const picker = findPicker(doc);
    if (!picker) return { state: "no-picker" };
    if (!needsSwitch(wanted, picker.shown)) return { state: "same", shown: picker.shown };
    const idle = countOptions(doc);
    if (!(await openPicker(doc, picker, wait, idle))) return { state: "no-list", shown: picker.shown };
    const option = await seekOption(doc, wanted, wait, scrolls);
    if (!option) {
      await closePicker(doc, picker, wait, idle);
      return { state: "no-option", shown: picker.shown };
    }
    option.el.click();
    await wait(SETTLE_MS);
    const after = findPicker(doc);
    await closePicker(doc, after || picker, wait, idle);
    if (after && !needsSwitch(wanted, after.shown)) return { state: "switched", shown: after.shown };
    return { state: "unsure", shown: after ? after.shown : "", picked: option.name };
  }

  const api = { DEFAULT, KEEP, CODES, LANGUAGES, normalize, prefOf, labelOf, rankOf, codeOf, decide, needsSwitch, pickOption, piecesOf, findPicker, optionsOf, isOpen, scrollerOf, setLanguage };
  root.AveiaCaptionLanguage = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
