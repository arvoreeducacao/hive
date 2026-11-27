import { st } from "./core.js";

const LUCIDE = {
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  local: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  branch: '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  prArrow: '<circle cx="5" cy="6" r="3"/><path d="M5 9v12"/><circle cx="19" cy="18" r="3"/><path d="m15 9-3-3 3-3"/><path d="M12 6h5a2 2 0 0 1 2 2v7"/>',
  merge: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  prClosed: '<circle cx="6" cy="6" r="3"/><path d="M6 9v12"/><path d="m21 3-6 6"/><path d="m21 9-6-6"/><path d="M18 11.5V15"/><circle cx="18" cy="18" r="3"/>',
  prDraft: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M18 6V5"/><path d="M18 11v-1"/><line x1="6" x2="6" y1="9" y2="21"/>',
  terminal: '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>'
};

const icon = (name, cls = "") => `<svg class="tx-i${cls ? ` ${cls}` : ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LUCIDE[name] || ""}</svg>`;

const FAV_HUES = [212, 262, 152, 28, 338, 190, 48, 286, 0, 120];

const hueOf = (text) => FAV_HUES[[...String(text)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % FAV_HUES.length];

const MIDDLE_TAIL = 10;
const MIDDLE_SEGMENT_TAIL = 16;
const MIDDLE_WORD_TAIL = 4;
const WORD_BREAK = /[-_./]/;

function splitMiddle(value) {
  const chars = Array.from(String(value));
  let keep = MIDDLE_TAIL;
  const slash = chars.lastIndexOf("/");
  if (slash > 0 && slash < chars.length - 1) {
    const segment = chars.length - slash - 1;
    keep = segment <= MIDDLE_SEGMENT_TAIL ? segment : MIDDLE_TAIL;
  }
  if (chars.length <= keep + 4) return null;
  let cut = chars.length - keep;
  if (!WORD_BREAK.test(chars[cut - 1])) {
    const startsWord = (at) => WORD_BREAK.test(chars[at - 1]);
    let snapped = -1;
    for (let at = cut + 1; at <= chars.length - MIDDLE_WORD_TAIL; at++) {
      if (startsWord(at)) { snapped = at; break; }
    }
    for (let at = cut - 1; snapped < 0 && at >= chars.length - MIDDLE_SEGMENT_TAIL && at > 4; at--) {
      if (startsWord(at)) snapped = at;
    }
    if (snapped > 0) cut = snapped;
  }
  return { head: chars.slice(0, cut).join(""), tail: chars.slice(cut).join("") };
}

function middleHtml(value, esc, cls = "") {
  const split = splitMiddle(value);
  const inner = split
    ? `<span class="tx-mid-head">${esc(split.head)}</span><span class="tx-mid-tail">${esc(split.tail)}</span>`
    : `<span class="tx-mid-whole">${esc(value)}</span>`;
  return `<span class="tx-mid${cls ? ` ${cls}` : ""}" title="${esc(value)}">${inner}</span>`;
}

function fitMiddles(root) {
  for (const head of root?.querySelectorAll(".tx-mid-head") || []) {
    head.style.maxWidth = "";
    head.removeAttribute("data-over");
    const text = head.firstChild;
    if (!(text instanceof Text) || head.scrollWidth <= head.clientWidth) continue;
    head.setAttribute("data-over", "");
    const room = head.clientWidth;
    const left = head.getBoundingClientRect().left;
    const range = document.createRange();
    const widthTo = (end) => { range.setStart(text, 0); range.setEnd(text, end); return range.getBoundingClientRect().right - left; };
    let fits = 0;
    let over = text.length;
    while (over - fits > 1) {
      const mid = (fits + over) >> 1;
      if (widthTo(mid) <= room) fits = mid;
      else over = mid;
    }
    head.style.maxWidth = `${Math.max(0, Math.floor(widthTo(fits)))}px`;
  }
}

const PR_ICONS = { open: "prArrow", merged: "merge", closed: "prClosed", draft: "prDraft" };

const treeOf = (seat) => (Array.isArray(seat.trees) ? seat.trees.find((one) => one?.repo) : null) || null;

function prsOf(name, prs) {
  return (prs || []).filter((p) => p.session === name).map((p) => ({
    key: p.key || "",
    url: p.url || "",
    tag: `${String(p.repo || "").split("/").pop()}#${p.number}`,
    title: p.title || "",
    ci: p.ci || "",
    failing: p.ci === "failed",
    conflict: p.mergeable === "conflicting",
    state: p.state || "open"
  }));
}

const MONO_COLORS = [
  ["70.7% .022 261.325", "44.6% .03 256.802"], ["70.4% .191 22.216", "57.7% .245 27.325"], ["75% .183 55.934", "64.6% .222 41.116"],
  ["82.8% .189 84.429", "66.6% .179 58.318"], ["85.2% .199 91.936", "68.1% .162 75.834"], ["84.1% .238 128.85", "64.8% .2 131.684"],
  ["79.2% .209 151.711", "62.7% .194 149.214"], ["76.5% .177 163.223", "59.6% .145 163.225"], ["77.7% .152 181.912", "60% .118 184.704"],
  ["78.9% .154 211.53", "60.9% .126 221.723"], ["74.6% .16 232.661", "58.8% .158 241.966"], ["70.7% .165 254.624", "54.6% .245 262.881"],
  ["67.3% .182 276.935", "51.1% .262 276.966"], ["70.2% .183 293.541", "54.1% .281 293.009"], ["71.4% .203 305.504", "55.8% .288 302.321"],
  ["74% .238 322.16", "59.1% .293 322.896"], ["71.8% .202 349.761", "59.2% .249 .584"], ["71.2% .194 13.428", "58.6% .253 17.585"]
];

function initialsOf(repo) {
  const words = String(repo).normalize("NFKC").trim().match(/[\p{L}\p{N}]+/gu) || [];
  if (!words.length) return "PR";
  const glyphs = [...words[0]];
  const second = glyphs.slice(1).find((g) => /\p{N}/u.test(g)) ?? (words.length > 1 ? [...words.at(-1)][0] : glyphs.at(-1)) ?? glyphs[0];
  return [...`${glyphs[0]}${second}`.toUpperCase()].slice(0, 2).join("");
}

function monoColorOf(repo) {
  let at = 0;
  for (const glyph of String(repo).normalize("NFKC").trim().toLocaleLowerCase("en-US") || "project") at = (at * 31 + glyph.codePointAt(0)) % MONO_COLORS.length;
  return MONO_COLORS[at];
}

function monogramHtml(repo, esc, cls = "") {
  const text = initialsOf(repo);
  const [dark, light] = monoColorOf(repo);
  return `<span class="tx-fav tx-mono${cls}" style="--mono:oklch(${dark});--mono-light:oklch(${light})"><svg viewBox="0 0 16 16" aria-hidden="true"><text x="8" y="10.8" text-anchor="middle" fill="currentColor" font-size="8.25" font-weight="700" textLength="${text.length === 1 ? 6 : 12}" lengthAdjust="spacingAndGlyphs">${esc(text)}</text></svg></span>`;
}

function providerHtml(row, ctx) {
  if (row.kind === "terminal") return `<span class="tx-prov-i">${icon("terminal")}</span>`;
  const agent = ["codex", "kimi", "kiro", "cursor", "gemini", "antigravity", "opencode"].includes(row.agent) ? row.agent : "claude";
  const account = row.account || "";
  const letters = (account === "default" ? agent : account).slice(0, 2).toUpperCase();
  const badge = account ? `<span class="tx-acct" style="--fav-h:${hueOf(account)}">${ctx.esc(letters)}</span>` : "";
  return `<span class="tx-prov-i ${agent}${badge ? " has-acct" : ""}" title="${ctx.esc(account)}">${ctx.svgIcon(`i-${agent}`)}${badge}</span>`;
}

const TIP_DELAY = 600;
const TIP_WARM = 400;

function tipHtml(row, ctx) {
  const { esc, phrase } = ctx;
  const line = (lead, text) => `<div class="tx-tip-row">${lead}${text}</div>`;
  const words = (text) => `<span class="tx-tip-text">${esc(text)}</span>`;
  const place = row.where === "cloud" ? phrase("remote") : st.team?.machine || st.team?.machineHere || phrase("this machine");
  const model = [row.model, row.account && row.account !== "default" ? row.account : ""].filter(Boolean).join(" · ");
  const prs = row.prs.map((p) => `<div class="tx-tip-pr pr-${esc(p.state)}">${icon(PR_ICONS[p.state] || PR_ICONS.open)}<span class="tx-tip-num">#${esc(p.tag.split("#").pop())}</span><span class="tx-tip-text">${esc(p.title || p.tag)}</span></div>`).join("");
  return `<div class="tx-tip-title">${esc(row.title)}</div>
    <div class="tx-tip-rows">
      ${row.repo ? line(monogramHtml(row.repo, esc, " tx-tip-fav"), words(row.repo)) : ""}
      ${line(icon(row.where === "cloud" ? "cloud" : "local"), words(place))}
      ${row.branch ? line(icon("branch"), middleHtml(row.branch, esc, "tx-tip-text")) : ""}
      ${model ? line(`<span class="tx-tip-prov">${providerHtml({ ...row, account: "" }, ctx)}</span>`, words(model)) : ""}
    </div>
    ${prs ? `<div class="tx-tip-foot">${prs}</div>` : ""}`;
}

export { TIP_DELAY, TIP_WARM, fitMiddles, prsOf, tipHtml, treeOf };
