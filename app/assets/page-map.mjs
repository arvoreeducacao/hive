export const MAP_CEILING = 4000;
export const NAME_CEILING = 120;
export const TEXT_CEILING = 300;

export function readPage(within = "", ceiling = 4000) {
  const NAME = 120;
  const TEXT = 300;
  const ROLES = {
    A: "link", BUTTON: "button", TEXTAREA: "textbox", SELECT: "combobox", OPTION: "option",
    H1: "heading", H2: "heading", H3: "heading", H4: "heading", H5: "heading", H6: "heading",
    IMG: "image", SUMMARY: "summary", DIALOG: "dialog", NAV: "navigation", MAIN: "main",
    FORM: "form", TABLE: "table", THEAD: "rowgroup", TBODY: "rowgroup", TR: "row",
    TH: "columnheader", TD: "cell", UL: "list", OL: "list", LI: "listitem", DL: "list",
    ASIDE: "complementary", HEADER: "banner", FOOTER: "contentinfo", SECTION: "region",
    ARTICLE: "article", FIGURE: "figure", VIDEO: "video", AUDIO: "audio", DETAILS: "details",
    PROGRESS: "progressbar", METER: "meter", FIELDSET: "group", LEGEND: "legend",
    IFRAME: "frame", CANVAS: "canvas", SVG: "graphic"
  };
  const INPUT_ROLES = {
    checkbox: "checkbox", radio: "radio", submit: "button", button: "button", reset: "button",
    image: "button", file: "file", range: "slider", color: "colorpicker", date: "datepicker",
    "datetime-local": "datepicker", month: "datepicker", week: "datepicker", time: "timepicker",
    search: "searchbox", email: "textbox", tel: "textbox", url: "textbox", number: "spinbutton",
    password: "password", hidden: ""
  };
  const NAMED_BY_TEXT = {
    button: 1, link: 1, heading: 1, option: 1, columnheader: 1, cell: 1, listitem: 1, clickable: 1,
    summary: 1, legend: 1, label: 1, checkbox: 1, radio: 1, menuitem: 1, tab: 1, treeitem: 1, text: 1
  };
  const SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, HEAD: 1, LINK: 1, META: 1, TITLE: 1, BR: 1, PATH: 1, DEFS: 1 };
  const BORING = { list: 1, listitem: 1, rowgroup: 1, group: 1, region: 1, article: 1, figure: 1, generic: 1 };
  const trim = (raw, ceiling) => String(raw == null ? "" : raw).replace(/\s+/g, " ").trim().slice(0, ceiling);
  const tagOf = (el) => String(el.tagName || "").toUpperCase();
  const spoken = (el) => {
    let out = "";
    const gather = (node) => {
      for (const kid of node.childNodes) {
        if (kid.nodeType === 3) out += kid.nodeValue;
        else if (kid.nodeType === 1 && !SKIP[tagOf(kid)]) gather(kid);
      }
    };
    gather(el);
    return out;
  };

  const seen = new Map();
  window.__hiveRefs = seen;
  let count = 0;
  let cut = false;

  const roleOf = (el) => {
    const asked = el.getAttribute && el.getAttribute("role");
    if (asked) return trim(asked, 30);
    if (el.tagName === "INPUT") {
      const kind = (el.getAttribute("type") || "text").toLowerCase();
      return kind in INPUT_ROLES ? INPUT_ROLES[kind] : "textbox";
    }
    if (el.isContentEditable) return "textbox";
    const known = ROLES[el.tagName];
    if (known) return known;
    if (el.tagName === "DIV" || el.tagName === "SPAN" || el.tagName === "P" || el.tagName === "LABEL") {
      const clickable = el.hasAttribute("onclick") || el.hasAttribute("tabindex")
        || getComputedStyle(el).cursor === "pointer";
      if (clickable) return "clickable";
    }
    return "";
  };

  const nameOf = (el, doc, role) => {
    const by = el.getAttribute && el.getAttribute("aria-labelledby");
    if (by) {
      const said = by.split(/\s+/).map((id) => doc.getElementById(id)?.textContent || "").join(" ");
      if (said.trim()) return trim(said, NAME);
    }
    const label = el.getAttribute && el.getAttribute("aria-label");
    if (label) return trim(label, NAME);
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
      if (el.id) {
        const tied = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (tied?.textContent?.trim()) return trim(tied.textContent, NAME);
      }
      const wrapping = el.closest("label");
      if (wrapping?.textContent?.trim()) return trim(wrapping.textContent, NAME);
      return trim(el.getAttribute("placeholder") || el.getAttribute("title") || el.getAttribute("name") || "", NAME);
    }
    if (el.tagName === "IMG") return trim(el.getAttribute("alt") || el.getAttribute("title") || "", NAME);
    const title = el.getAttribute && el.getAttribute("title");
    if (NAMED_BY_TEXT[role]) {
      const said = trim(spoken(el), NAME);
      if (said) return said;
    }
    return trim(title || "", NAME);
  };

  const valueOf = (el) => {
    if (el.tagName === "SELECT") return trim(el.options?.[el.selectedIndex]?.textContent || el.value, TEXT);
    if (el.tagName === "INPUT") {
      const kind = (el.getAttribute("type") || "text").toLowerCase();
      if (kind === "password") return el.value ? "•".repeat(Math.min(8, el.value.length)) : "";
      if (kind === "checkbox" || kind === "radio") return "";
      return trim(el.value, TEXT);
    }
    if (el.tagName === "TEXTAREA") return trim(el.value, TEXT);
    if (el.isContentEditable) return trim(el.textContent, TEXT);
    return "";
  };

  const marksOf = (el) => {
    const marks = [];
    const said = (name) => el.getAttribute && el.getAttribute(name);
    if (el.disabled || said("aria-disabled") === "true") marks.push("disabled");
    if (el.readOnly || said("aria-readonly") === "true") marks.push("readonly");
    if (el.required || said("aria-required") === "true") marks.push("required");
    if (el.checked || said("aria-checked") === "true") marks.push("checked");
    if (said("aria-expanded") === "true") marks.push("expanded");
    if (said("aria-expanded") === "false") marks.push("collapsed");
    if (said("aria-selected") === "true" || el.selected) marks.push("selected");
    if (said("aria-pressed") === "true") marks.push("pressed");
    if (said("aria-invalid") === "true") marks.push("invalid");
    if (el === (el.ownerDocument?.activeElement)) marks.push("focused");
    return marks;
  };

  const fileField = (el) => el.tagName === "INPUT" && (el.getAttribute("type") || "").toLowerCase() === "file";

  const hidden = (el) => {
    if (el.getAttribute && el.getAttribute("aria-hidden") === "true") return true;
    if (fileField(el)) return false;
    const box = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    if (!box || box.width < 1 || box.height < 1) return true;
    const styled = getComputedStyle(el);
    return styled.visibility === "hidden" || styled.display === "none" || styled.opacity === "0";
  };

  const rows = [];
  const keep = (row) => { rows.push(row); return row; };

  const walk = (node, depth, doc, host) => {
    if (count >= ceiling) { cut = true; return; }
    if (node.nodeType === 3) {
      const said = trim(node.textContent, TEXT);
      if (said && said.length > 1) keep({ role: "text", depth, text: said });
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node;
    if (SKIP[tagOf(el)]) return;
    if (hidden(el)) return;

    const role = roleOf(el);
    const shown = role && !(BORING[role] && !el.getAttribute("aria-label"));
    let deeper = depth;
    if (shown) {
      const ref = `e${++count}`;
      seen.set(ref, { el, host: host || null });
      const name = nameOf(el, doc, role);
      keep({
        ref, role, depth,
        name,
        value: valueOf(el),
        marks: marksOf(el),
        url: el.tagName === "A" ? trim(el.getAttribute("href") || "", TEXT) : ""
      });
      deeper = depth + 1;
      if (name && NAMED_BY_TEXT[role] && trim(spoken(el), NAME) === name) return;
    }

    if (el.shadowRoot) {
      for (const kid of el.shadowRoot.childNodes) walk(kid, deeper, doc, host);
    }
    if (el.tagName === "IFRAME") {
      let inside = null;
      try { inside = el.contentDocument; } catch { inside = null; }
      if (!inside || !inside.body) { keep({ role: "text", depth: deeper, text: "(this frame is from another origin and cannot be read)" }); return; }
      walk(inside.body, deeper, inside, el);
      return;
    }
    for (const kid of el.childNodes) walk(kid, deeper, doc, host);
  };

  const root = within ? document.querySelector(within) : document.body;
  if (!root) return { url: location.href, title: document.title, missing: within, rows: [] };
  walk(root, 0, document, null);

  return { url: location.href, title: trim(document.title, NAME), within, cut, rows };
}

export function sayPage(map) {
  if (!map || !map.rows) return "the page answered nothing";
  if (map.missing) return `nothing on this page matches ${map.missing}`;
  const head = `${map.title || "(untitled)"} — ${map.url}${map.within ? ` (inside ${map.within})` : ""}`;
  const lines = map.rows.map((r) => {
    const pad = "  ".repeat(Math.min(r.depth, 14));
    if (r.role === "text") return `${pad}- text: ${JSON.stringify(r.text)}`;
    const said = [r.role];
    if (r.name) said.push(`"${r.name}"`);
    if (r.value) said.push(`= "${r.value}"`);
    if (r.url) said.push(`→ ${r.url}`);
    if (r.marks?.length) said.push(`[${r.marks.join(" ")}]`);
    said.push(`[ref=${r.ref}]`);
    return `${pad}- ${said.join(" ")}`;
  });
  const tail = map.cut
    ? [`… cut at ${MAP_CEILING} elements — call browser_snapshot again with within: "<css selector>" to read one part of this page`]
    : [];
  return [head, "", ...lines, ...tail].join("\n");
}

export function reachRef(ref) {
  const seen = window.__hiveRefs;
  if (!seen) return { error: "no map of this page yet — browser_snapshot first" };
  const found = seen.get(ref);
  if (!found) return { error: `${ref} is not on the map — browser_snapshot again, the page may have changed` };
  const el = found.el || found;
  const host = found.host || null;
  if (!el.isConnected) return { error: `${ref} left the page — browser_snapshot again` };
  el.scrollIntoView({ block: "center", inline: "center" });
  const box = el.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return { error: `${ref} is on the page but has no size, so it cannot be clicked` };
  const frame = host ? host.getBoundingClientRect() : { left: 0, top: 0 };
  const said = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 60);
  try { el.focus({ preventScroll: true }); } catch {}
  return {
    x: frame.left + box.left + box.width / 2,
    y: frame.top + box.top + box.height / 2,
    said, tag: el.tagName.toLowerCase(),
    kind: el.tagName === "SELECT" ? "select" : ""
  };
}

export function chooseOption(ref, wanted) {
  const seen = window.__hiveRefs;
  if (!seen) return { error: "no map of this page yet — browser_snapshot first" };
  const found = seen.get(ref);
  if (!found) return { error: `${ref} is not on the map — browser_snapshot again` };
  const el = found.el || found;
  if (!el.isConnected) return { error: `${ref} left the page — browser_snapshot again` };
  if (el.tagName !== "SELECT") return { error: `${ref} is a ${el.tagName.toLowerCase()}, not a dropdown — click it instead` };
  const said = String(wanted || "").trim().toLowerCase();
  const options = [...el.options];
  const pick = options.find((o) => (o.textContent || "").trim().toLowerCase() === said)
    || options.find((o) => (o.value || "").toLowerCase() === said)
    || options.find((o) => (o.textContent || "").trim().toLowerCase().includes(said));
  if (!pick) return { error: `"${wanted}" is not one of the options — ${options.map((o) => `"${(o.textContent || "").trim()}"`).join(", ")}` };
  el.value = pick.value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { chose: (pick.textContent || pick.value).trim() };
}

export function markUpload(ref) {
  const seen = window.__hiveRefs;
  if (!seen) return { error: "no map of this page yet — browser_snapshot first" };
  const found = seen.get(ref);
  if (!found) return { error: `${ref} is not on the map — browser_snapshot again` };
  const el = found.el || found;
  if (!el.isConnected) return { error: `${ref} left the page — browser_snapshot again` };
  const file = el.tagName === "INPUT" && (el.getAttribute("type") || "").toLowerCase() === "file"
    ? el
    : el.querySelector && el.querySelector('input[type="file"]');
  if (!file) return { error: `${ref} is not a file field, and there is none inside it` };
  if (found.host) return { error: "the file field is inside a frame, and files can only be handed to the page itself for now" };
  document.querySelectorAll("[data-hive-upload]").forEach((old) => old.removeAttribute("data-hive-upload"));
  file.setAttribute("data-hive-upload", "1");
  return { said: (file.getAttribute("name") || file.id || "the file field") };
}

export function forgetUpload() {
  document.querySelectorAll("[data-hive-upload]").forEach((old) => old.removeAttribute("data-hive-upload"));
  return true;
}

export function lookFor(text, gone) {
  const said = String(text || "").toLowerCase();
  const here = (document.body.innerText || "").toLowerCase().includes(said);
  return { here, done: gone ? !here : here };
}
