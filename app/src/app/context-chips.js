import { esc, phrase, st } from "./core.js";
import { personSays, seatHandle, seatLabel, seatSays } from "./pure-helpers.js";

const PR_URL = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)[^\s<>"'`)\]]*/g;

const ONE_PR = new RegExp(`^${PR_URL.source}`);

const IMAGE_MARK = /\[Image #(\d+)\]/g;

const AT_PATH = /(^|[\s([{'"])@([\w./~-]*[\w/~-])/g;

const HANDLE = /(^|[\s([{'"])([#~])([\w.-]{1,64})/g;

const GLYPH = { pr: "i-pr", chat: "i-hash", person: "i-user", file: "i-file", folder: "i-folder", image: "i-image" };

const PR_STATES = ["open", "draft", "merged", "closed"];

const prKey = (owner, repo, number) => `${owner}/${repo}#${number}`;

function prOf(url) {
  const m = ONE_PR.exec(String(url || ""));
  if (!m) return null;
  const key = prKey(m[1], m[2], m[3]);
  const known = (st.prs || []).find((p) => p.key === key);
  return { key, repo: m[2], number: m[3], state: PR_STATES.includes(known?.state) ? known.state : "", title: known?.title || "" };
}

function seatOfHandle(raw, sessions = st.data?.sessions || []) {
  const q = String(raw).toLowerCase();
  return sessions.find((s) => seatHandle(s) === q) || sessions.find((s) => s.name.toLowerCase() === q) || null;
}

const personOfHandle = (raw, devs = st.team?.devs || []) => devs.find((d) => d.dev.toLowerCase() === String(raw).toLowerCase()) || null;

const pathKind = (path) => (path.endsWith("/") || !/\.[\w-]+$/.test(path.split("/").pop()) ? "folder" : "file");

function chipSpans(text, { sessions, devs } = {}) {
  const said = String(text ?? "");
  const spans = [];
  for (const m of said.matchAll(IMAGE_MARK)) spans.push({ start: m.index, end: m.index + m[0].length, kind: "image", n: Number(m[1]) });
  for (const m of said.matchAll(PR_URL)) {
    const url = m[0].replace(/[.,;:!?]+$/, "");
    spans.push({ start: m.index, end: m.index + url.length, kind: "pr", url, pr: prOf(url) });
  }
  for (const m of said.matchAll(AT_PATH)) {
    const start = m.index + m[1].length;
    spans.push({ start, end: start + 1 + m[2].length, kind: pathKind(m[2]), path: m[2] });
  }
  for (const m of said.matchAll(HANDLE)) {
    const start = m.index + m[1].length;
    const end = start + 1 + m[3].length;
    if (m[2] === "#") {
      const seat = seatOfHandle(m[3], sessions);
      if (seat) spans.push({ start, end, kind: "chat", seat });
    } else {
      const person = personOfHandle(m[3], devs);
      if (person) spans.push({ start, end, kind: "person", person });
    }
  }
  return spans
    .sort((a, b) => a.start - b.start)
    .filter((span, at, all) => !at || span.start >= all[at - 1].end);
}

const inkClass = (span) => `ink-chip ink-${span.kind === "pr" ? `pr-${span.pr?.state || "unknown"}` : span.kind}`;

const inkChips = (text, ctx) => chipSpans(text, ctx).map((span) => ({ start: span.start, end: span.end, cls: inkClass(span) }));

const middleCut = (name, max = 36) => {
  const chars = Array.from(String(name));
  if (chars.length <= max) return String(name);
  const tail = Math.min(14, Math.ceil((max - 1) / 2));
  return `${chars.slice(0, max - 1 - tail).join("")}…${chars.slice(-tail).join("")}`;
};

const glyph = (kind) => `<svg aria-hidden="true"><use href="#${GLYPH[kind]}"/></svg>`;

const chipLabel = (label) => `<span class="cl">${esc(label)}</span>`;

function chipHtml(span) {
  if (span.kind === "image") {
    return `<span class="ctx-chip said-img" data-kind="image" data-n="${span.n}">${glyph("image")}${chipLabel(phrase("Image #{n}", { n: span.n }))}</span>`;
  }
  if (span.kind === "pr") {
    const pr = span.pr;
    const title = pr?.title ? `${pr.key} · ${pr.title}` : pr?.key || span.url;
    return `<a class="ctx-chip" data-kind="pr" data-state="${pr?.state || "unknown"}" data-pr="${esc(pr?.key || "")}" href="${esc(span.url)}" title="${esc(title)}">${glyph("pr")}${chipLabel(pr ? `${pr.repo}#${pr.number}` : span.url)}</a>`;
  }
  if (span.kind === "file" || span.kind === "folder") {
    const name = span.path.replace(/\/+$/, "").split("/").pop() || span.path;
    return `<span class="ctx-chip" data-kind="${span.kind}" data-path="${esc(span.path)}" title="${esc(span.path)}">${glyph(span.kind)}${chipLabel(middleCut(span.kind === "folder" ? `${name}/` : name))}</span>`;
  }
  if (span.kind === "chat") {
    const seat = span.seat;
    return `<span class="ctx-chip" data-kind="chat" data-seat="${esc(seat.name)}" title="${esc(`${phrase(seatSays(seat).state)} · ${phrase("go to this chat")}`)}">${glyph("chat")}${chipLabel(seatLabel(seat))}</span>`;
  }
  const row = span.person;
  return `<span class="ctx-chip" data-kind="person" data-dev="${esc(row.dev)}" title="${esc(`${phrase(personSays(row).state)} · ${phrase("this is their hive, not yours")}`)}">${glyph("person")}${chipLabel(row.dev)}</span>`;
}

function paintSaidChips(el, ctx) {
  const doc = el.ownerDocument;
  for (const a of [...el.querySelectorAll("a[href]")]) {
    if (a.textContent !== a.getAttribute("href")) continue;
    const pr = prOf(a.getAttribute("href"));
    if (!pr) continue;
    const hold = doc.createElement("template");
    hold.innerHTML = chipHtml({ kind: "pr", url: a.getAttribute("href"), pr });
    a.replaceWith(hold.content);
  }
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (!node.parentElement?.closest(".ctx-chip, a")) texts.push(node);
  for (const node of texts) {
    const said = node.nodeValue;
    const spans = chipSpans(said, ctx).filter((span) => span.kind !== "pr");
    if (!spans.length) continue;
    let out = "";
    let last = 0;
    for (const span of spans) {
      out += esc(said.slice(last, span.start)) + chipHtml(span);
      last = span.end;
    }
    const hold = doc.createElement("template");
    hold.innerHTML = out + esc(said.slice(last));
    node.replaceWith(hold.content);
  }
  return el;
}

function giveImageChipItsPicture(body, n, { src, name, path }) {
  if (!body.includes(`data-n="${n}"`)) return null;
  const hold = document.createElement("div");
  hold.innerHTML = body;
  const chip = hold.querySelector(`.ctx-chip[data-kind="image"][data-n="${n}"]`);
  if (!chip) return null;
  chip.querySelector("svg")?.replaceWith(Object.assign(document.createElement("img"), { src, alt: "" }));
  chip.dataset.path = path;
  chip.title = name;
  chip.querySelector(".cl").textContent = middleCut(name, 24);
  return hold.innerHTML;
}

function averageColor(img) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const paint = canvas.getContext("2d");
    if (!paint) return "";
    paint.drawImage(img, 0, 0, 16, 16);
    const { data } = paint.getImageData(0, 0, 16, 16);
    let r = 0;
    let g = 0;
    let b = 0;
    let weight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      r += data[i] * a;
      g += data[i + 1] * a;
      b += data[i + 2] * a;
      weight += a;
    }
    return weight ? `rgb(${Math.round(r / weight)} ${Math.round(g / weight)} ${Math.round(b / weight)})` : "";
  } catch {
    return "";
  }
}

function tintFromPicture(chip) {
  const img = chip.querySelector("img");
  if (!img || chip.dataset.tinted) return;
  img.addEventListener("error", () => {
    const hold = document.createElement("template");
    hold.innerHTML = glyph("image");
    img.replaceWith(hold.content);
  }, { once: true });
  const tint = () => {
    const color = averageColor(img);
    if (color) chip.style.setProperty("--cc", color);
    chip.dataset.tinted = "1";
  };
  if (img.complete && img.naturalWidth) tint();
  else img.addEventListener("load", tint, { once: true });
}

/* the bubble html is reused on every reconcile, but a PR's state keeps moving after the message was sent. */
function wireChips(root) {
  for (const chip of root.querySelectorAll(".ctx-chip[data-kind=pr][data-pr]")) {
    const known = (st.prs || []).find((p) => p.key === chip.dataset.pr);
    if (PR_STATES.includes(known?.state)) chip.dataset.state = known.state;
  }
  for (const chip of root.querySelectorAll(".ctx-chip[data-kind=image][data-path]")) tintFromPicture(chip);
}

export { chipSpans, giveImageChipItsPicture, inkChips, middleCut, paintSaidChips, prOf, tintFromPicture, wireChips };
