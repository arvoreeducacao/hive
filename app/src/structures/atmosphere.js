const SMALL = new Set(["ready", "idle", "done"]);

const TALLY = ["answered", "working", "stalled", "done", "ready", "idle"];

const RAYS = [
  ["wide", 68, 1], ["", 38.9, 1], ["", 52.8, 0.8], ["thin", 62.5, 1], ["thin", 84, 0.5],
  ["line", 77.8, 1], ["line", 44.4, 0.35], ["", 92.4, 0.6], ["cool", 15.3, 0.5]
];

const EDGE = 56;
const FAR_EDGE = 28;
const GAP = 24;
const TOP = 92;
const MINI_H = 48;
const MINI_STEP = 30;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const onMac = () => /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || "");

const spreadKey = () => (onMac() ? "⌥⇧E" : "Alt+Shift+E");

const isSpreadKey = (event) => event.code === "KeyE" && event.altKey && event.shiftKey && !event.metaKey && !event.ctrlKey;

const isSeatDigit = (event) => /^Digit[1-9]$/.test(event.code) && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey;

function spreadBoxes(here, width, height) {
  const boxes = new Map();
  const n = here.length;
  const cols = n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const w = Math.floor((width - EDGE * 2 - GAP * (cols - 1)) / cols);
  const h = Math.floor((height - TOP - 68 - GAP * (rows - 1)) / rows);
  [...here].sort((a, b) => a.at - b.at).forEach((one, i) => {
    boxes.set(one.key, { x: EDGE + (i % cols) * (w + GAP), y: TOP + Math.floor(i / cols) * (h + GAP), w, h, size: "eq", z: 6, depth: 0 });
  });
  return boxes;
}

function arrange(seats, { width = 1440, height = 900, front = null, spread = false } = {}) {
  const here = seats.filter((one) => one.here);
  const heroW = clamp(Math.round(width * 0.272), 280, 392);
  const lead = here.find((one) => one.key === front) || here[0] || null;
  if (!lead) return { front: null, boxes: new Map(), stack: null, spread: false, heroW };
  if (spread) return { front: lead.key, boxes: spreadBoxes(here, width, height), stack: null, spread: true, heroW };
  const boxes = new Map();
  const frontX = EDGE + heroW + 32;
  const sideW = clamp(Math.round(width * 0.208), 240, 300);
  const sideX = width - FAR_EDGE - sideW;
  boxes.set(lead.key, { x: frontX, y: TOP, w: sideX - GAP - frontX, h: height - 132 - TOP, size: "lg", z: 10, depth: 0 });
  const rest = here.filter((one) => one !== lead);
  const minis = rest.filter((one) => SMALL.has(one.state));
  const mids = rest.filter((one) => !SMALL.has(one.state));
  const room = height - 188 - 120 - 36;
  const tall = Math.round(room * 0.62);
  const side = [
    { x: sideX, y: 120, w: sideW, h: tall },
    { x: sideX, y: 120 + tall + 36, w: sideW, h: room - tall }
  ];
  const left = { x: EDGE, y: Math.round(height * 0.54), w: heroW - 16, h: clamp(Math.round(height * 0.173), 120, 180) };
  const leftFirst = mids.find((one) => one.state === "answered");
  let leftTaken = false;
  let sideAt = 0;
  const overflow = [];
  for (const one of mids) {
    if (one === leftFirst) { boxes.set(one.key, { ...left, size: "md", z: 6, depth: 0 }); leftTaken = true; continue; }
    if (sideAt < side.length) { boxes.set(one.key, { ...side[sideAt++], size: "md", z: 6, depth: 0 }); continue; }
    if (!leftTaken) { boxes.set(one.key, { ...left, size: "md", z: 6, depth: 0 }); leftTaken = true; continue; }
    overflow.push(one);
  }
  const small = [...overflow, ...minis];
  if (!small.length) return { front: lead.key, boxes, stack: null, spread: false, heroW };
  const bottom = height - 68;
  const ceiling = leftTaken ? left.y + left.h + 44 : Math.round(height * 0.54);
  const step = small.length > 1 ? clamp(Math.floor((bottom - MINI_H - ceiling) / (small.length - 1)), 6, MINI_STEP) : 0;
  const miniW = clamp(heroW - 92, 240, 300);
  small.forEach((one, i) => {
    boxes.set(one.key, { x: EDGE, y: bottom - MINI_H - i * step, w: miniW, h: MINI_H, size: "sm", z: 5 - Math.min(i, 4), depth: Math.min(i, 3) });
  });
  return { front: lead.key, boxes, stack: { x: EDGE, y: bottom - MINI_H - (small.length - 1) * step - 26, count: small.length }, spread: false, heroW };
}

function tellCounts(seats) {
  const counts = { needs: 0, answered: 0, working: 0, done: 0, ready: 0, stalled: 0, idle: 0 };
  for (const one of seats) if (one.state in counts) counts[one.state] += 1;
  return counts;
}

function headlineOf(seats, phrase) {
  const counts = tellCounts(seats);
  const said = (one, many, n) => (n === 1 ? phrase(one) : phrase(many, { n }));
  if (counts.needs) return said("1 seat needs you", "{n} seats need you", counts.needs);
  if (counts.answered) return said("1 seat answered", "{n} seats answered", counts.answered);
  if (counts.working) return said("1 seat at work", "{n} seats at work", counts.working);
  return seats.length ? phrase("All quiet") : phrase("No seat yet");
}

const clip = (text, room) => (text.length > room ? `${text.slice(0, room - 1).trimEnd()}…` : text);

function leadOf(seats, phrase) {
  const first = seats.find((one) => one.state === "needs") || seats.find((one) => one.state === "answered") || seats.find((one) => one.state === "working");
  if (!first) return null;
  const fallback = first.state === "needs" ? "it stopped to ask you something" : first.state === "answered" ? "it finished its turn and is waiting for you" : "";
  return { key: first.key, name: first.title || first.name || first.key, says: clip(String(first.now || first.summary || (fallback && phrase(fallback))).replace(/\s+/g, " ").trim(), 150) };
}

function storyOf(seats, phrase) {
  const counts = tellCounts(seats);
  return {
    headline: headlineOf(seats, phrase),
    lead: leadOf(seats, phrase),
    needs: counts.needs,
    tally: TALLY.filter((state) => counts[state]).map((state) => [state, counts[state]])
  };
}

function nextNeeding(seats, from, step = 1) {
  const needing = seats.filter((one) => one.state === "needs");
  if (!needing.length) return null;
  const at = needing.findIndex((one) => one.key === from);
  if (at < 0) return needing[step > 0 ? 0 : needing.length - 1].key;
  return needing[(at + step + needing.length) % needing.length].key;
}

let view = null;
let chosen = null;
let seen;
let lastBlock;
let spread = false;
let shown = null;
let frameRaf = 0;

function forget() {
  view = null;
  chosen = null;
  seen = undefined;
  lastBlock = undefined;
  spread = false;
  shown = null;
  if (frameRaf) cancelAnimationFrame(frameRaf);
  frameRaf = 0;
}

function skyHtml() {
  const rays = RAYS.map(([kind, left, opacity]) => `<i class="ray${kind ? ` ${kind}` : ""}" style="left:${left}%;${opacity < 1 ? ` opacity:${opacity};` : ""}"></i>`).join("");
  return `<i class="stars"></i>${rays}<i class="halo"></i><i class="vignette"></i>`;
}

function build(ctx) {
  const part = (tag, cls) => {
    const el = document.createElement(tag);
    el.className = cls;
    return el;
  };
  const sky = part("div", "atmo-sky");
  sky.setAttribute("aria-hidden", "true");
  sky.innerHTML = skyHtml();
  const hero = part("section", "atmo-hero");
  const stack = part("div", "atmo-stack");
  stack.hidden = true;
  const wins = part("div", "atmo-wins");
  const keys = part("div", "atmo-keys");
  ctx.root.append(sky, hero, stack, wins, keys);
  view = { hero, stack, wins, keys, frames: new Map(), heroHtml: "", keysHtml: "", stackHtml: "", rootKey: "" };
}

function bring(ctx, key) {
  chosen = key;
  spread = false;
  ctx.focusSeat(key);
}

function answer(ctx) {
  const key = nextNeeding(ctx.seats(), null);
  if (!key) return;
  bring(ctx, key);
  requestAnimationFrame(() => ctx.tile(key)?.querySelector("textarea, [contenteditable='true']")?.focus({ preventScroll: true }));
}

function toggleSpread(ctx) {
  spread = !spread;
  ctx.render();
}

function heroHtml(ctx, story) {
  const { esc, phrase } = ctx;
  const now = new Date();
  const lang = document.documentElement.lang || undefined;
  let day = "";
  try { day = now.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "short" }); } catch {}
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const eyebrow = [day, time].filter(Boolean).map(esc).join(" · ");
  const lead = story.lead ? `<p class="lead"><button type="button" data-act="go" data-key="${esc(story.lead.key)}">${esc(story.lead.name)}</button>${story.lead.says ? ` ${esc(story.lead.says)}` : ""}</p>` : "";
  const answerBtn = story.needs ? `<button type="button" class="atmo-btn primary" data-act="answer">${esc(phrase("Answer"))}<kbd class="rc-key">⇥</kbd></button>` : "";
  const spreadLabel = spread ? phrase("Gather") : phrase("Spread");
  const tally = story.tally.map(([state, n]) => `<span><i class="rc-dot ${esc(state)}"></i>${esc(ctx.label(state))} <b>${n}</b></span>`).join("");
  return `<div class="eyebrow">${eyebrow}</div><h1>${esc(story.headline)}</h1>${lead}
    <div class="cta">${answerBtn}<button type="button" class="atmo-btn ghost" data-act="spread" aria-pressed="${spread}">${esc(spreadLabel)}<kbd class="rc-key">${esc(spreadKey())}</kbd></button></div>
    ${tally ? `<div class="tally">${tally}</div>` : ""}`;
}

function keysHtml(ctx) {
  const { esc, phrase } = ctx;
  return `<span><kbd class="rc-key">${esc(ctx.keyHint("seat"))}</kbd>${esc(phrase("seats"))}</span>`
    + `<span><kbd class="rc-key">⇥</kbd>${esc(phrase("next that asks"))}</span>`
    + `<span><kbd class="rc-key">${esc(spreadKey())}</kbd>${esc(spread ? phrase("gather") : phrase("spread"))}</span>`;
}

function adopt(ctx, here) {
  const block = here[0]?.block ?? null;
  const focused = ctx.focused();
  const has = (key) => here.some((one) => one.key === key);
  if (block !== lastBlock) {
    lastBlock = block;
    seen = focused;
    if (!has(chosen)) chosen = null;
  } else if (focused !== seen) {
    seen = focused;
    if (has(focused)) chosen = focused;
  }
  if (chosen && !has(chosen)) chosen = null;
}

function paintFrame(ctx, key, box, front, seat) {
  let frame = view.frames.get(key);
  if (!frame) {
    frame = document.createElement("div");
    frame.className = "atmo-win";
    frame.dataset.key = key;
    frame.setAttribute("role", "group");
    view.wins.append(frame);
    view.frames.set(key, frame);
  }
  const look = `${box.size}|${key === front}|${box.depth}|${seat.state}|${seat.title || seat.name || key}|${box.x},${box.y},${box.w},${box.h},${box.z}`;
  if (frame.dataset.look !== look) {
    frame.dataset.look = look;
    frame.className = `atmo-win ${box.size}${key === front ? " front" : ""}`;
    frame.dataset.state = seat.state || "";
    frame.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;z-index:${box.z};--depth:${box.depth}`;
    frame.setAttribute("aria-label", seat.title || seat.name || key);
  }
  ctx.place(key, frame);
}

function paint(ctx) {
  if (!view) build(ctx);
  const all = ctx.seats();
  const here = all.filter((one) => one.here);
  adopt(ctx, here);
  const width = ctx.root.clientWidth || globalThis.innerWidth || 1440;
  const height = ctx.root.clientHeight || globalThis.innerHeight || 900;
  const laid = arrange(all, { width, height, front: chosen, spread });
  shown = laid.front;
  const rootKey = `${laid.heroW}|${laid.spread}`;
  if (view.rootKey !== rootKey) {
    view.rootKey = rootKey;
    ctx.root.style.setProperty("--atmo-hero-w", `${laid.heroW}px`);
    ctx.root.classList.toggle("spread", laid.spread);
  }
  const story = storyOf(all, ctx.phrase);
  const hero = heroHtml(ctx, story);
  if (view.heroHtml !== hero) { view.heroHtml = hero; view.hero.innerHTML = hero; }
  const keys = keysHtml(ctx);
  if (view.keysHtml !== keys) { view.keysHtml = keys; view.keys.innerHTML = keys; }
  const pile = laid.stack ? ctx.phrase("{n} at the back", { n: laid.stack.count }) : "";
  const stack = laid.stack ? `${laid.stack.x},${laid.stack.y}|${pile}` : "";
  if (view.stackHtml !== stack) {
    view.stackHtml = stack;
    view.stack.hidden = !laid.stack;
    if (laid.stack) {
      view.stack.style.cssText = `left:${laid.stack.x}px;top:${laid.stack.y}px`;
      view.stack.textContent = pile;
    }
  }
  const bySeat = new Map(here.map((one) => [one.key, one]));
  for (const [key, box] of laid.boxes) paintFrame(ctx, key, box, laid.front, bySeat.get(key));
  for (const [key, frame] of view.frames) {
    if (laid.boxes.has(key)) continue;
    frame.remove();
    view.frames.delete(key);
  }
}

function enter(ctx) {
  forget();
  build(ctx);
  ctx.root.classList.add("atmo");
  ctx.listen(ctx.root, "click", (event) => {
    const act = event.target.closest?.("[data-act]");
    if (act?.dataset.act === "answer") return answer(ctx);
    if (act?.dataset.act === "spread") return toggleSpread(ctx);
    if (act?.dataset.act === "go") return bring(ctx, act.dataset.key);
    const frame = event.target.closest?.(".atmo-win");
    if (!frame || spread || frame.classList.contains("front")) return;
    bring(ctx, frame.dataset.key);
  });
  ctx.listen(window, "resize", () => {
    if (frameRaf) return;
    frameRaf = requestAnimationFrame(() => { frameRaf = 0; ctx.render(); });
  });
}

function leave(ctx) {
  ctx.root.classList.remove("atmo", "spread");
  ctx.root.style.removeProperty("--atmo-hero-w");
  forget();
}

function keydown(event, ctx) {
  if (ctx.onPlane()) return false;
  if (isSpreadKey(event)) {
    toggleSpread(ctx);
    return true;
  }
  if (isSeatDigit(event)) {
    const byPlace = ctx.seats().filter((one) => one.here).sort((a, b) => a.at - b.at);
    const pick = byPlace[Number(event.code.slice(5)) - 1];
    if (pick) { chosen = pick.key; spread = false; }
    return false;
  }
  if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey || ctx.inField()) return false;
  const key = nextNeeding(ctx.seats(), shown || ctx.focused(), event.shiftKey ? -1 : 1);
  if (!key) return false;
  bring(ctx, key);
  return true;
}

const atmosphere = {
  id: "atmosphere",
  ready: true,
  enter,
  leave,
  paint,
  keydown,
  arrange,
  storyOf,
  nextNeeding
};

export { atmosphere };
