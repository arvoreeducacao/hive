import { blockNumber, labelOf as blockLabelOf, ofBlock } from "../app/blocks.js";
import { keyLabel, whichAction } from "../app/brand-face.js";
import { openBrowser, openPrLink, webOfSeat } from "../app/chat-and-panes.js";
import { IS_MAC, st } from "../app/core.js";
import { ago } from "../app/pod.js";
import { changes, openDiff, pullChanges } from "../app/seat-changes.js";
import { shortBranch } from "../app/seat-layout.js";
import { prsOfChat } from "../app/seat-menu.js";

const BEHIND_SHOWN = 2;

const SNIPPET_CHARS = 220;

const CHANGES_FRESH_MS = 60000;

const SWAP_GIVE_UP_MS = 1500;

const CALL_KEY = { code: "KeyJ" };

const plain = (text) => String(text || "")
  .replace(/```[\s\S]*?```/g, " ")
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/https?:\/\/\S+/g, (url) => url.replace(/^https?:\/\/(www\.)?/, "").split("/").slice(-3).join("/"))
  .replace(/[*_`#>|]+/g, "")
  .replace(/^\s*[-•]\s+/gm, "")
  .replace(/\s+/g, " ")
  .trim();

const cut = (text, n) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);

function askOf(seat) {
  const asked = (seat.asks || []).flatMap((one) => one.questions || [])[0];
  const said = asked?.question || asked?.header || "";
  if (said) return plain(said);
  if (seat.state !== "needs") return "";
  const questions = plain(seat.finish?.text).match(/[^.!?]*\?/g);
  return questions ? questions[questions.length - 1].trim() : "";
}

function cardOf(seat, { keyOf = () => "" } = {}) {
  const ask = askOf(seat);
  const said = plain(seat.now || seat.finish?.text || seat.summary || seat.description);
  return {
    key: seat.key,
    name: seat.title || seat.name || seat.key,
    state: seat.state || "idle",
    block: seat.block,
    here: !!seat.here,
    hint: keyOf(seat),
    text: cut(ask && said.endsWith(ask) ? said.slice(0, -ask.length).trim() : said, SNIPPET_CHARS),
    ask: cut(ask, SNIPPET_CHARS / 2),
    busy: seat.state === "working",
    when: seat.state === "needs" ? (seat.finish?.at || seat.when || "") : ""
  };
}

function stageModel(seats, focused, { keyOf, labelOf = () => "" } = {}) {
  const onStage = seats.some((one) => one.key === focused) ? focused : seats[0]?.key || null;
  const stageSeat = seats.find((one) => one.key === onStage) || null;
  const card = (seat) => cardOf(seat, { keyOf });
  const calling = seats.filter((one) => one.state === "needs" && one.key !== onStage).map(card);
  const callingKeys = new Set(calling.map((one) => one.key));
  const blocks = [...new Set(seats.map((one) => one.block))].sort((a, b) => a - b);
  const stacks = blocks.map((block) => {
    const all = seats.filter((one) => one.block === block && one.key !== onStage && !callingKeys.has(one.key)).map(card);
    const hole = stageSeat?.block === block;
    return {
      block,
      label: labelOf(block),
      here: seats.some((one) => one.block === block && one.here),
      hole,
      front: all[0] || null,
      behind: all.slice(1, 1 + BEHIND_SHOWN).reverse(),
      all
    };
  }).filter((one) => one.all.length || one.hole);
  return { onStage, stageSeat: stageSeat ? card(stageSeat) : null, calling, stacks };
}

const sameKey = (event, want) => {
  const cmd = IS_MAC ? event.metaKey : event.ctrlKey;
  const other = IS_MAC ? event.ctrlKey : event.metaKey;
  return cmd && !other && !event.altKey && !event.shiftKey && event.code === want.code;
};

const callBinding = () => (IS_MAC ? { meta: true, ...CALL_KEY } : { ctrl: true, ...CALL_KEY });

function miniHtml(ctx, one, extra = "") {
  const { esc } = ctx;
  const bars = one.busy ? '<i class="tool"></i><i style="width:88%"></i><i style="width:64%"></i>' : '<i style="width:90%"></i><i style="width:70%"></i>';
  return `<button type="button" class="stg-mini${extra}" data-seat="${esc(one.key)}" title="${esc(`${one.name} — ${ctx.label(one.state)}`)}">
    <span class="stg-mini-top"><i class="rc-dot ${esc(one.state)}"></i><span class="t">${esc(one.name)}</span>${one.hint ? `<span class="k">${esc(one.hint)}</span>` : ""}</span>
    <span class="stg-mini-body">${one.text ? `<span class="p">${esc(one.text)}</span>` : ""}${bars}${one.ask ? `<span class="p q">${esc(one.ask)}</span>` : ""}</span>
    <span class="stg-mini-comp"></span>
  </button>`;
}

function whoHtml(ctx, list) {
  const { esc } = ctx;
  return list.map((one) => `<button type="button" class="stg-who-one" data-seat="${esc(one.key)}"><i class="rc-dot ${esc(one.state)}"></i><span>${esc(one.name)}</span></button>`).join("");
}

function wingHtml(ctx, model) {
  const { esc, phrase } = ctx;
  const parts = [];
  const [first, ...more] = model.calling;
  if (first) {
    parts.push(`<div class="stg-eye"><i class="rc-dot needs"></i>${esc(phrase("needs you"))}<span class="rc-key">${esc(keyLabel(callBinding()))}</span></div>`);
    const since = first.when ? ago(first.when) : "";
    parts.push(`<div class="stg-stack pop">
      <span class="stg-selo">${ctx.svgIcon("i-hand")}</span>
      <div class="stg-deck">${miniHtml(ctx, first)}</div>
      <div class="stg-lbl">${esc(first.name)}${since ? `<span class="n">${esc(since)}</span>` : ""}</div>
      <div class="stg-who"><span class="from">${esc(phrase("jumped from block {n}", { n: blockNumber(first.block) }))}</span>${whoHtml(ctx, more)}</div>
    </div>`);
  }
  for (const stack of model.stacks) {
    const n = blockNumber(stack.block);
    const name = [phrase("block {n}", { n }), stack.label].filter(Boolean).join(" · ");
    parts.push(`<div class="stg-eye"><span class="t">${esc(name)}</span><span class="rc-key">${esc(keyLabel(st.keys.block, n))}</span></div>`);
    const deck = [
      stack.hole && stack.front && !stack.behind.length ? '<span class="stg-trail" aria-hidden="true"></span><span class="stg-mini hole" aria-hidden="true"></span>' : "",
      ...stack.behind.map((one, at) => miniHtml(ctx, one, ` b${stack.behind.length - at}`)),
      stack.front ? miniHtml(ctx, stack.front) : ""
    ].join("");
    parts.push(`<div class="stg-stack${stack.here ? " cur" : ""}${stack.front ? "" : " bare"}">
      ${stack.front ? `<div class="stg-deck${stack.behind.length ? " tall" : ""}">${deck}</div>` : `<div class="stg-bare">${esc(phrase("on the stage"))}</div>`}
      <div class="stg-who">${whoHtml(ctx, stack.all)}</div>
    </div>`);
  }
  return parts.join("");
}

function ctxModel(seat) {
  if (!seat || seat.kind !== "session") return null;
  const held = changes.get(seat.name)?.data;
  const tree = (seat.trees || []).find((one) => !one.main) || (seat.trees || [])[0] || null;
  const files = held?.files || [];
  const added = files.reduce((sum, one) => sum + (one.added || 0), 0);
  const removed = files.reduce((sum, one) => sum + (one.removed || 0), 0);
  const web = webOfSeat.get(seat.name);
  const tab = web?.tabs?.[web.active] || null;
  return {
    name: seat.name,
    tree: tree ? { place: String(tree.path || "").split("/").filter(Boolean).pop() || tree.repo || "", branch: shortBranch(tree.branch) || tree.repo || "", more: Math.max(0, (seat.trees || []).length - 1) } : null,
    diff: held ? { files: files.map((one) => String(one.path || "").split("/").pop()), added, removed } : null,
    prs: prsOfChat(seat.name).map((pr) => ({ url: pr.url, say: `#${pr.number}`, repo: String(pr.repo || "").split("/").pop(), ci: pr.ci || "none", state: pr.state })),
    links: (seat.prs || []).length,
    page: tab?.url ? tab.url.replace(/^https?:\/\//, "") : ""
  };
}

const CI_DOT = { passed: "done", failed: "needs", running: "working", none: "idle" };

function ctxHtml(ctx, model) {
  const { esc, phrase, svgIcon } = ctx;
  if (!model) return "";
  const eye = (icon, text, key = "") => `<div class="eye">${svgIcon(icon)}<span>${esc(text)}</span>${key ? `<span class="rc-key">${esc(key)}</span>` : ""}</div>`;
  const tree = model.tree
    ? `<div class="v mono">${esc(model.tree.place)}</div><div class="d mono">${esc(model.tree.branch)}</div>${model.tree.more ? `<div class="d mono">${esc(phrase("+{n} more", { n: model.tree.more }))}</div>` : ""}`
    : `<div class="d">${esc(phrase("no worktree"))}</div>`;
  const diff = !model.diff
    ? `<div class="d">${esc(phrase("reading the diff…"))}</div>`
    : model.diff.files.length
      ? `<div class="d mono"><span class="plus">+${model.diff.added}</span> <span class="minus">−${model.diff.removed}</span> · ${esc(phrase("{n} files", { n: model.diff.files.length }))}</div><div class="d">${esc(cut(model.diff.files.slice(0, 3).join(", "), 60))}</div>`
      : `<div class="d">${esc(phrase("nothing uncommitted"))}</div>`;
  const prs = model.prs.length
    ? model.prs.map((pr) => `<button type="button" class="stg-pr" data-pr="${esc(pr.url)}"><i class="rc-dot ${CI_DOT[pr.ci] || "idle"}"></i><b>${esc(pr.say)}</b><span>${esc(pr.repo)}</span></button>`).join("")
    : `<div class="v">${esc(phrase(model.links ? "{n} PRs linked" : "not opened yet", { n: model.links }))}</div>`;
  return `<section class="sec">${eye("i-tree", "worktree")}${tree}</section>
    <section class="sec act" data-act="diff">${eye("i-file", "diff")}${diff}</section>
    <section class="sec">${eye("i-pr", "PR")}${prs}</section>
    <section class="sec act" data-act="browser">${eye("i-browser", phrase("browser"), ctx.keyHint("browser"))}
      <div class="stg-page"><div class="u">${esc(model.page || phrase("no page open"))}</div><div class="g"><i></i><i></i><i></i><i></i></div></div>
      <div class="d">${esc(phrase("opens beside the conversation"))}</div></section>`;
}

let parts = null;

let lastStage = null;

let lastCall = null;

let swapTimer = 0;

function focusComposerOf(ctx, key) {
  requestAnimationFrame(() => {
    const box = ctx.tile(key)?.querySelector("textarea, [contenteditable='true']");
    if (box && !box.disabled) box.focus({ preventScroll: true });
  });
}

function putOnStage(ctx, key) {
  if (!key) return;
  ctx.focusSeat(key);
  focusComposerOf(ctx, key);
}

function onClick(ctx, event) {
  const seat = event.target.closest("[data-seat]");
  if (seat && parts?.wing.contains(seat)) return putOnStage(ctx, seat.dataset.seat);
  const pr = event.target.closest("[data-pr]");
  const name = parts?.ctxFor;
  if (pr && name) return void openPrLink(name, pr.dataset.pr);
  const act = event.target.closest("[data-act]")?.dataset.act;
  if (!act || !name) return;
  if (act === "diff") return openDiff(name);
  if (act === "browser") return openBrowser(name);
}

function swap() {
  const host = parts.host;
  clearTimeout(swapTimer);
  host.classList.remove("swap");
  void host.offsetWidth;
  host.classList.add("swap");
  swapTimer = setTimeout(() => host.classList.remove("swap"), SWAP_GIVE_UP_MS);
}

function keepChangesFresh(seat) {
  if (!seat || seat.kind !== "session") return;
  const held = changes.get(seat.name);
  if (held?.asking || (held?.at && Date.now() - held.at < CHANGES_FRESH_MS)) return;
  pullChanges(seat.name);
}

const stage = {
  id: "stage",
  ready: true,
  model: stageModel,
  card: cardOf,
  enter(ctx) {
    const shell = document.createElement("div");
    shell.className = "stg";
    shell.innerHTML = '<aside class="stg-wing"></aside><main class="stg-stage"><div class="stg-host"></div></main><aside class="stg-ctx"></aside>';
    ctx.root.append(shell);
    parts = { shell, wing: shell.querySelector(".stg-wing"), host: shell.querySelector(".stg-host"), side: shell.querySelector(".stg-ctx"), ctxFor: null };
    parts.wing.setAttribute("aria-label", ctx.phrase("the other seats, stacked by block"));
    lastStage = null;
    lastCall = null;
    ctx.listen(shell, "click", (event) => onClick(ctx, event));
    ctx.listen(parts.host, "animationend", (event) => { if (event.animationName === "rc-stg-land") parts?.host.classList.remove("swap"); });
  },
  leave() {
    clearTimeout(swapTimer);
    parts = null;
    lastStage = null;
    lastCall = null;
  },
  paint(ctx) {
    if (!parts) return;
    const seats = ctx.seats().filter((one) => one.space === st.space);
    ctx.root.hidden = ctx.onPlane() || !seats.length;
    if (ctx.root.hidden) return;
    const keyOf = (seat) => (seat.here ? keyLabel(st.keys.seat, seat.at + 1) : "");
    const labelOf = (block) => {
      const b = st.blocks[block];
      return b ? blockLabelOf(b, ofBlock(b)).txt : "";
    };
    const model = stageModel(seats, ctx.focused(), { keyOf, labelOf });
    const wing = wingHtml(ctx, model);
    if (parts.wing.dataset.h !== wing) { parts.wing.dataset.h = wing; parts.wing.innerHTML = wing; }
    const calling = model.calling[0]?.key || null;
    if (calling && calling !== lastCall) parts.wing.querySelector(".stg-stack.pop")?.classList.add("fresh");
    lastCall = calling;
    const seat = seats.find((one) => one.key === model.onStage) || null;
    keepChangesFresh(seat);
    parts.ctxFor = seat?.kind === "session" ? seat.name : null;
    const side = ctxHtml(ctx, ctxModel(seat));
    if (parts.side.dataset.h !== side) { parts.side.dataset.h = side; parts.side.innerHTML = side; }
    parts.shell.classList.toggle("no-ctx", !side);
    if (model.onStage) ctx.place(model.onStage, parts.host);
    if (lastStage && model.onStage && lastStage !== model.onStage) swap();
    lastStage = model.onStage;
  },
  keydown(event, ctx) {
    if (!sameKey(event, CALL_KEY) || whichAction(event)) return false;
    const calling = ctx.seats().find((one) => one.state === "needs" && one.key !== ctx.focused());
    if (!calling) return false;
    putOnStage(ctx, calling.key);
    return true;
  }
};

export { stage };
