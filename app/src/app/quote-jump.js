import { blockTexts, centre, findOffsets, findRanges } from "./chat-find.js";
import { svLoadWhole, svRevealBlock } from "./chat-stretches.js";
import { svConvElements } from "./conversation-model.js";
import { phrase } from "./core.js";

const QUOTE_HIT = "hive-quote";
const QUOTE_FOR = 2200;
const QUOTE_KINDS = new Set(["said", "bubble"]);
const NEEDLE_MAX = 160;

let clearing = 0;

const quoteLines = (quote) => String(quote ?? "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);

const needleOf = (lines) => lines.reduce((most, line) => (line.length > most.length ? line : most), "").slice(0, NEEDLE_MAX);

function quotedBlock(blocks, before, needle) {
  for (let at = Math.min(before, blocks.length) - 1; at >= 0; at--) {
    const block = blocks[at];
    if (!QUOTE_KINDS.has(block.kind)) continue;
    if (blockTexts(block).some((text) => findOffsets(text.replace(/\s+/g, " "), needle).length)) return block;
  }
  return null;
}

function keyOfCard(e, card) {
  for (const [key, el] of svConvElements(e)) if (el.contains(card)) return key;
  return null;
}

const nextFrame = () => new Promise((done) => requestAnimationFrame(() => done()));

const canHighlight = () => typeof CSS !== "undefined" && !!CSS.highlights && typeof Highlight !== "undefined";

function flash(el, ranges) {
  clearTimeout(clearing);
  if (canHighlight() && ranges.length) CSS.highlights.set(QUOTE_HIT, new Highlight(...ranges));
  else el.classList.add("sv-quoted");
  clearing = setTimeout(() => {
    if (canHighlight()) CSS.highlights.delete(QUOTE_HIT);
    el.classList.remove("sv-quoted");
  }, QUOTE_FOR);
}

function missing(card) {
  card.dataset.missing = "1";
  card.setAttribute("aria-disabled", "true");
  card.title = phrase("The original answer is no longer in this conversation");
  return false;
}

async function jumpToQuote(e, card) {
  const lines = quoteLines(card.querySelector(".qt")?.textContent);
  const needle = needleOf(lines);
  if (!needle) return false;
  const find = () => {
    const key = keyOfCard(e, card);
    const at = e.conv.blocks.findIndex((one) => one.key === key);
    return quotedBlock(e.conv.blocks, at < 0 ? e.conv.blocks.length : at, needle);
  };
  let block = find();
  if (!block && e.earlier?.more) {
    if (!(await svLoadWhole(e))) return missing(card);
    block = find();
  }
  if (!block) return missing(card);
  svRevealBlock(e, block.key);
  await nextFrame();
  let el = svConvElements(e).get(block.key);
  if (!el) return missing(card);
  if (!el.getClientRects().length || el.closest("[hidden]")) {
    el.dispatchEvent(new Event("beforematch", { bubbles: true }));
    await nextFrame();
    el = svConvElements(e).get(block.key) || el;
  }
  const ranges = lines.flatMap((line) => findRanges(el, line).slice(0, 1));
  centre(e, ranges[0] || el);
  flash(el, ranges);
  return true;
}

export { jumpToQuote, needleOf, quotedBlock, quoteLines };
