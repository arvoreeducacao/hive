import { $, BLOCK_SIZE_DEFAULT, phrase, st, svgIcon } from "./core.js";

const fontDefault = (field) => () => st.fontDefaults?.[field] ?? null;

const SETTING_DEFAULTS = {
  "f-look": "classic",
  "f-clock": "system",
  "f-structure": "classic",
  "f-sans": "",
  "f-mono": "",
  "f-term": fontDefault("terminalSize"),
  "f-chat-line": fontDefault("chatLineHeight"),
  "f-chat-gap": fontDefault("chatSpacing"),
  "f-visual": "lean",
  "f-pet": "off",
  "f-brand": "auto",
  "f-gaze": "screen",
  "s-needs": "chime",
  "t-needs": false,
  "s-answered": "settle",
  "t-answered": false,
  "s-volume": 70,
  "t-knocks": true,
  "f-layout": "grid",
  "f-size": BLOCK_SIZE_DEFAULT,
  "f-tools": "all",
  "f-compact": "",
  "t-context-usage": false,
  "t-agent-updates": true,
  "f-quiet-days": ["2", ""],
  "f-diary-days": ["30", ""]
};

const foldText = (text) => String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const controlsOf = (row) => String(row.dataset.control || "").split(/\s+/).filter(Boolean).map((id) => $(id)).filter(Boolean);

const isSwitch = (el) => el.tagName === "BUTTON" && el.classList.contains("flip");

const isRadioList = (el) => el.getAttribute("role") === "radiogroup";

function valueOf(el) {
  if (isSwitch(el)) return el.classList.contains("on");
  if (isRadioList(el)) {
    const picked = el.querySelector('[aria-checked="true"]');
    return picked ? picked.dataset.value ?? picked.dataset.structure ?? null : null;
  }
  return el.value;
}

function defaultsOf(el) {
  const said = el.dataset.default ?? SETTING_DEFAULTS[el.id];
  const value = typeof said === "function" ? said() : said;
  if (value === undefined || value === null) return null;
  return Array.isArray(value) ? value : [value];
}

const sameValue = (now, want) => (typeof want === "boolean" ? now === want : String(now) === String(want));

function changed(el) {
  const defaults = defaultsOf(el);
  if (!defaults) return false;
  return !defaults.some((want) => sameValue(valueOf(el), want));
}

function resetControl(el) {
  const defaults = defaultsOf(el);
  if (!defaults || !changed(el)) return;
  const want = defaults[0];
  if (isSwitch(el)) {
    if (!el.disabled) el.click();
    return;
  }
  if (isRadioList(el)) {
    el.querySelector(`[data-value="${CSS.escape(String(want))}"], [data-structure="${CSS.escape(String(want))}"]`)?.click();
    return;
  }
  el.value = String(want);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

const titleOf = (row) => row.querySelector(".set-title")?.textContent.trim() || "";

function resetButton(row) {
  let button = row.querySelector(":scope > .set-ctl > .set-reset, :scope > .set-reset");
  if (button) return button;
  button = document.createElement("button");
  button.type = "button";
  button.className = "set-reset";
  button.dataset.noT = "";
  button.hidden = true;
  button.innerHTML = svgIcon("i-reload");
  button.addEventListener("click", () => {
    for (const el of controlsOf(row)) resetControl(el);
    queuePaint();
    setTimeout(() => (row.querySelector(".set-ctl select, .set-ctl input, .set-ctl button:not(.set-reset)") || row).focus?.(), 0);
  });
  const ctl = row.querySelector(":scope > .set-ctl");
  if (ctl) ctl.prepend(button);
  else row.append(button);
  return button;
}

function describe(row, at) {
  const says = row.querySelector(":scope > .set-text > .set-says");
  if (!says) return;
  if (!says.id) says.id = `set-says-${at}`;
  for (const el of controlsOf(row)) if (!el.hasAttribute("aria-describedby")) el.setAttribute("aria-describedby", says.id);
}

function syncSwitch(el) {
  if (!isSwitch(el) || !el.closest(".set-row")) return;
  el.setAttribute("role", "switch");
  el.setAttribute("aria-checked", el.classList.contains("on") ? "true" : "false");
}

function paintSettingResets() {
  const body = $("pref-body");
  if (!body) return;
  for (const el of body.querySelectorAll(".set-row .flip")) syncSwitch(el);
  body.querySelectorAll(".set-row[data-control]").forEach((row, at) => {
    const controls = controlsOf(row);
    if (!controls.some((el) => defaultsOf(el))) return;
    describe(row, at);
    const button = resetButton(row);
    const label = phrase("Back to the default: {name}", { name: titleOf(row) });
    if (button.getAttribute("aria-label") !== label) {
      button.setAttribute("aria-label", label);
      button.title = phrase("Back to the default");
    }
    const off = !controls.some((el) => !el.disabled && changed(el));
    if (button.hidden !== off) button.hidden = off;
  });
}

let queued = 0;

function queuePaint() {
  clearTimeout(queued);
  queued = setTimeout(() => {
    paintSettingResets();
    queued = setTimeout(paintSettingResets, 400);
  }, 0);
}

const SEARCH_PARTS = ".set-title, .set-says, .set-head, .set-state";

function rowText(row) {
  const parts = [...row.querySelectorAll(SEARCH_PARTS)].map((el) => el.textContent);
  for (const select of row.querySelectorAll("select")) parts.push(...[...select.options].map((one) => one.textContent));
  for (const el of row.querySelectorAll("[data-search]")) parts.push(el.dataset.search);
  if (row.dataset.search) parts.push(row.dataset.search);
  return foldText(parts.join(" "));
}

const hitsAll = (text, words) => words.every((word) => text.includes(word));

let searchFor = "";

function searchSettings(raw) {
  const body = $("pref-body");
  const nav = $("pref-nav");
  if (!body || !nav) return 0;
  searchFor = String(raw || "").trim();
  const words = foldText(searchFor).split(/\s+/).filter(Boolean);
  body.classList.toggle("searching", words.length > 0);
  let total = 0;
  for (const pane of body.querySelectorAll(".pref-pane")) {
    const name = pane.dataset.pane;
    const tab = nav.querySelector(`button[data-pane="${CSS.escape(name)}"]`);
    const paneTitle = foldText(`${tab?.textContent || ""} ${pane.querySelector(":scope > h2")?.textContent || ""}`);
    const paneHit = words.length > 0 && hitsAll(paneTitle, words);
    let paneRows = 0;
    for (const group of pane.querySelectorAll(".set-group")) {
      const groupHit = paneHit || (words.length > 0 && hitsAll(foldText(group.querySelector(".set-head")?.textContent), words));
      let groupRows = 0;
      for (const row of group.querySelectorAll(".set-row")) {
        const hit = !words.length || groupHit || hitsAll(rowText(row), words);
        row.classList.toggle("miss", !hit);
        if (hit && !row.hidden) groupRows += 1;
      }
      group.classList.toggle("miss", words.length > 0 && !groupRows);
      paneRows += groupRows;
    }
    pane.dataset.searchTitle = (tab?.textContent || pane.querySelector(":scope > h2")?.textContent || "").trim();
    const miss = words.length > 0 && !paneRows;
    pane.classList.toggle("miss", miss);
    tab?.classList.toggle("miss", miss);
    if (words.length) total += paneRows;
  }
  const none = $("pref-none");
  if (none) none.hidden = !words.length || total > 0;
  if (words.length) body.scrollTop = 0;
  return total;
}

const searching = () => !!searchFor;

function watchSettings() {
  const body = $("pref-body");
  if (!body || body.dataset.watched) return;
  body.dataset.watched = "1";
  for (const kind of ["input", "change", "click"]) body.addEventListener(kind, queuePaint);
  new MutationObserver(queuePaint).observe(body, { subtree: true, attributes: true, attributeFilter: ["class", "aria-checked", "disabled"] });
  $("pref-search")?.addEventListener("input", (event) => searchSettings(event.target.value));
  $("help")?.addEventListener("keydown", (event) => {
    const box = event.target;
    if (event.key !== "Escape" || !["pref-find", "pref-search"].includes(box?.id) || !box.value) return;
    event.preventDefault();
    event.stopPropagation();
    box.value = "";
    searchSettings("");
  });
  paintSettingResets();
}

export { SETTING_DEFAULTS, changed, foldText, paintSettingResets, resetControl, searchSettings, searching, valueOf, watchSettings };
