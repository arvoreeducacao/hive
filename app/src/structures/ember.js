import { blockNumber, blocksOf, itemOf, labelOf } from "../app/blocks.js";
import { IS_MAC, st } from "../app/core.js";
import { goToBlock } from "../app/focus-navigation.js";
import { goToTeam } from "../app/team.js";

const QUICK_ANSWERS = 3;

const SAID_ROOM = 220;

let view = null;

let cursor = null;

const squash = (text, room = SAID_ROOM) => {
  const said = String(text || "").replace(/\s+/g, " ").trim();
  return said.length > room ? `${said.slice(0, room - 1).trimEnd()}…` : said;
};

const keyPrefix = (hint) => String(hint || "").match(/^\D*/)[0];

function lastSaid(tile) {
  const msgs = tile?.querySelectorAll(".sv-scroll .sv-msg");
  const last = msgs?.[msgs.length - 1];
  if (!last) return "";
  const paras = [...last.querySelectorAll(":scope > p, :scope > ul > li")];
  return squash((paras[paras.length - 1] || last).textContent);
}

function openQuestion(tile) {
  const cards = tile ? [...tile.querySelectorAll(".sv-q:not(.answered)")] : [];
  return cards[cards.length - 1] || null;
}

function quickAnswers(card) {
  if (!card) return [];
  const step = card.querySelector(".qstep:not([hidden])");
  return [...(step?.querySelectorAll(".qo") || [])].slice(0, QUICK_ANSWERS).map((one) => squash(one.querySelector(".qol")?.textContent || one.textContent, 40));
}

function emberModel({ seats, focused, block, cursor: at = null, heard = () => ({}) }) {
  const here = seats.filter((one) => one.block === block);
  const page = here.find((one) => one.key === focused) || seats.find((one) => one.key === focused) || here[0] || null;
  const queue = seats.filter((one) => one !== page && (one.block === block || one.state === "needs"));
  const cards = queue.map((one) => {
    const said = heard(one) || {};
    const asks = one.state === "needs" ? said.answers || [] : [];
    return {
      key: one.key,
      name: one.kind === "session" && one.naming ? "" : one.title || one.name || one.key,
      state: one.state,
      asks: one.state === "needs",
      text: squash(said.text || one.now || one.summary || one.description || ""),
      when: one.when || "",
      verb: one.verb ? `${one.verb}… ${one.measure || ""}`.trim() : "",
      at: one.block === block ? one.at : -1,
      block: one.block,
      away: one.block !== block,
      answers: asks,
      picked: one.key === at
    };
  });
  return {
    page: page ? {
      key: page.key,
      name: page.title || page.name || page.key,
      state: page.state,
      at: page.block === block ? page.at : -1,
      block: page.block,
      when: page.when || "",
      verb: page.verb ? `${page.verb}… ${page.measure || ""}`.trim() : "",
      model: page.model || "",
      where: page.where || "",
      tree: ((page.trees || []).find((one) => !one.main) || (page.trees || [])[0] || null),
      live: (page.live || []).length
    } : null,
    cards,
    others: cards.length
  };
}

function stepCursor(cards, d) {
  if (!cards.length) return null;
  const at = cards.findIndex((one) => one.key === cursor);
  const next = at < 0 ? (d > 0 ? 0 : cards.length - 1) : Math.max(0, Math.min(cards.length - 1, at + d));
  return cards[next].key;
}

function build(ctx) {
  const { root } = ctx;
  root.innerHTML = `
    <div class="em">
      <article class="em-page">
        <div class="em-eyebrow"><span class="em-where"></span><span class="em-state"><i class="rc-dot"></i><span></span></span><span class="rc-key em-pkey" hidden></span></div>
        <h1 class="em-title"></h1>
        <div class="em-meta"></div>
        <div class="em-tile"></div>
        <p class="em-empty" hidden></p>
      </article>
      <aside class="em-queue">
        <div class="em-qhead"><h3></h3><span class="em-hint"></span></div>
        <div class="em-cards"></div>
        <p class="em-calm" hidden></p>
        <div class="em-blocks"></div>
      </aside>
    </div>`;
  const team = document.createElement("span");
  team.className = "em-team";
  return {
    wrap: root.querySelector(".em"),
    page: root.querySelector(".em-page"),
    queue: root.querySelector(".em-queue"),
    where: root.querySelector(".em-where"),
    state: root.querySelector(".em-state"),
    pkey: root.querySelector(".em-pkey"),
    title: root.querySelector(".em-title"),
    meta: root.querySelector(".em-meta"),
    tile: root.querySelector(".em-tile"),
    empty: root.querySelector(".em-empty"),
    qhead: root.querySelector(".em-qhead h3"),
    hint: root.querySelector(".em-hint"),
    cards: root.querySelector(".em-cards"),
    calm: root.querySelector(".em-calm"),
    blocks: root.querySelector(".em-blocks"),
    team,
    made: new Map(),
    said: new Map()
  };
}

const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

const setHtml = (el, html) => {
  if (view.said.get(el) === html) return;
  view.said.set(el, html);
  el.innerHTML = html;
};

function cardHtml(card, ctx, seatKey) {
  const { esc, phrase } = ctx;
  const key = card.at >= 0 && card.at < 9 ? `<span class="rc-key">${esc(seatKey)}${card.at + 1}</span>` : "";
  const note = card.verb || (card.when ? phrase("{when} ago", { when: card.when }) : "");
  const away = card.away ? `<span class="em-away">${esc(phrase("block {n}", { n: blockNumber(card.block) }))}</span>` : "";
  const answers = card.answers.length ? `<div class="em-quick">${card.answers.map((one, i) => `<button type="button" class="em-q" data-answer="${i + 1}"><span class="rc-key">${i + 1}</span><span>${esc(one)}</span></button>`).join("")}</div>` : "";
  const text = card.text ? `<p class="em-ctxt">${esc(card.text)}</p>` : "";
  const name = esc(card.name || phrase("new chat"));
  if (card.asks) {
    return `<div class="em-strip"><svg aria-hidden="true"><use href="#i-hand"/></svg><span>${esc(ctx.label("needs"))}${note ? ` · ${esc(note)}` : ""}</span>${away}${key}</div>
      <div class="em-cbody"><div class="em-cname">${name}</div>${text}${answers}</div>`;
  }
  return `<div class="em-cbody"><div class="em-crow"><i class="rc-dot ${esc(card.state)}"></i><span class="em-cname">${name}</span><span class="em-cst">${esc(ctx.label(card.state))}${note ? ` · ${esc(note)}` : ""}</span>${away}${key}</div>${text}</div>`;
}

function paintPage(ctx, page, seatKey) {
  const { phrase } = ctx;
  view.page.dataset.state = page?.state || "";
  view.empty.hidden = !!page;
  if (!page) {
    setText(view.where, "");
    setText(view.title, phrase("no seats here yet"));
    setText(view.empty, phrase("open a chat and it becomes the page; the rest line up on the right"));
    view.state.hidden = true;
    view.pkey.hidden = true;
    setHtml(view.meta, "");
    return;
  }
  const b = st.blocks[page.block];
  const blockName = b ? labelOf(b, b.keys.map(itemOf).filter(Boolean)).txt : "";
  setText(view.where, [page.at >= 0 ? phrase("seat {n}", { n: page.at + 1 }) : "", `${phrase("block {n}", { n: blockNumber(page.block) })}${blockName && blockName !== page.name ? ` · ${blockName}` : ""}`].filter(Boolean).join(" · "));
  view.state.hidden = false;
  view.state.querySelector("i").className = `rc-dot ${page.state}`;
  const note = page.verb || (page.when ? phrase("{when} ago", { when: page.when }) : "");
  setText(view.state.querySelector("span"), `${ctx.label(page.state)}${note ? ` · ${note}` : ""}`);
  view.pkey.hidden = !(page.at >= 0 && page.at < 9);
  setText(view.pkey, `${seatKey}${page.at + 1}`);
  setText(view.title, page.name);
  const bits = [page.model, page.tree ? (page.tree.main ? page.tree.repo : `${page.tree.repo} · ${page.tree.branch}`) : "", page.where, page.live ? phrase("{n} in the background", { n: page.live }) : ""].filter(Boolean);
  setHtml(view.meta, bits.map((one) => `<span>${ctx.esc(one)}</span>`).join("<i>/</i>"));
}

function paintCards(ctx, cards, seatKey) {
  const keep = new Set();
  const order = [];
  for (const card of cards) {
    let el = view.made.get(card.key);
    if (!el) {
      el = document.createElement("div");
      el.className = "em-card";
      el.dataset.key = card.key;
      el.tabIndex = -1;
      view.made.set(card.key, el);
    }
    el.classList.toggle("needs", card.asks);
    el.classList.toggle("low", !card.asks && card.state !== "answered" && card.state !== "done");
    el.classList.toggle("picked", card.picked);
    el.dataset.state = card.state;
    setHtml(el, cardHtml(card, ctx, seatKey));
    keep.add(card.key);
    order.push(el);
  }
  for (const [key, el] of view.made) if (!keep.has(key)) { el.remove(); view.made.delete(key); view.said.delete(el); }
  const now = [...view.cards.children];
  if (now.length !== order.length || now.some((el, i) => el !== order[i])) view.cards.replaceChildren(...order);
}

function paintBlocks(ctx, blockKey) {
  const { esc, phrase } = ctx;
  const rows = blocksOf(st.space).map((b) => ({ b, i: st.blocks.indexOf(b) })).filter(({ i }) => i !== st.block).map(({ b, i }) => {
    const items = b.keys.map(itemOf).filter(Boolean);
    const n = blockNumber(i);
    const calling = items.filter((one) => one.state === "needs").length;
    return `<button type="button" class="em-next" data-block="${i}"><span class="em-eyebrow-t">${esc(phrase("block {n}", { n }))}</span><span class="em-next-n">${esc(labelOf(b, items).txt)}</span>${calling ? `<span class="em-next-c"><i class="rc-dot needs"></i>${calling}</span>` : ""}<span class="em-next-r">${esc(phrase("switch block"))}${n <= 9 ? `<span class="rc-key">${esc(blockKey)}${n}</span>` : ""}</span></button>`;
  });
  setHtml(view.blocks, rows.join(""));
}

function paintTeam(ctx) {
  const { esc, phrase } = ctx;
  const foot = document.getElementById("foot");
  if (foot && view.team.parentElement !== foot) foot.prepend(view.team);
  const devs = (st.team?.devs || []).filter((d) => d.key !== st.team.here && !(d.mine && !d.seats?.length));
  const html = devs.length ? `<span class="em-team-t">${esc(phrase("team"))}</span>${devs.map((d) => {
    const who = d.mine ? d.machine || d.dev : d.dev;
    const n = (d.seats || []).length;
    return `<button type="button" class="em-mate" data-dev="${esc(d.key)}" title="${esc(who)}"><span class="em-av">${esc(String(who || "?").slice(0, 1).toUpperCase())}</span><span class="em-mate-n">${esc(who)}</span>${n ? `<b>${n}</b>` : ""}</button>`;
  }).join(`<span class="em-pipe">|</span>`)}` : "";
  setHtml(view.team, html);
}

function heardFrom(ctx) {
  return (seat) => {
    const tile = ctx.tile(seat.key);
    return { text: lastSaid(tile), answers: seat.state === "needs" ? quickAnswers(openQuestion(tile)) : [] };
  };
}

function answer(ctx, key, n) {
  const card = openQuestion(ctx.tile(key));
  const step = card?.querySelector(".qstep:not([hidden])");
  const btn = step?.querySelectorAll(".qo")[n - 1];
  if (!btn) return false;
  if (card.classList.contains("later")) card.querySelector(".qwake")?.click();
  btn.click();
  const next = card.querySelector(".qnext");
  if (card.querySelectorAll(".qstep").length === 1 && next && !next.disabled) next.click();
  else ctx.focusSeat(key);
  ctx.render();
  return true;
}

const ember = {
  id: "ember",
  ready: true,
  enter(ctx) {
    cursor = null;
    view = build(ctx);
    view.model = null;
    ctx.listen(view.queue, "click", (event) => {
      const quick = event.target.closest("[data-answer]");
      const card = event.target.closest(".em-card");
      if (quick && card) { answer(ctx, card.dataset.key, Number(quick.dataset.answer)); return; }
      if (card) { cursor = null; ctx.focusSeat(card.dataset.key); return; }
      const next = event.target.closest("[data-block]");
      if (next) goToBlock(Number(next.dataset.block));
    });
    ctx.listen(view.team, "click", (event) => {
      const mate = event.target.closest("[data-dev]");
      if (mate) goToTeam(mate.dataset.dev);
    });
  },
  leave() {
    view?.team.remove();
    view = null;
    cursor = null;
  },
  paint(ctx) {
    if (!view) return;
    view.wrap.hidden = ctx.onPlane();
    if (view.wrap.hidden) return;
    const seatKey = keyPrefix(ctx.keyHint("seat"));
    const blockKey = keyPrefix(ctx.keyHint("block"));
    const model = emberModel({ seats: ctx.seats(), focused: ctx.focused(), block: st.block, cursor, heard: heardFrom(ctx) });
    if (cursor && !model.cards.some((one) => one.key === cursor)) cursor = null;
    view.model = model;
    paintPage(ctx, model.page, seatKey);
    if (model.page) ctx.place(model.page.key, view.tile);
    setText(view.qhead, model.others ? ctx.phrase("The other {n}", { n: model.others }) : ctx.phrase("Nobody else"));
    setHtml(view.hint, model.others ? `<span class="rc-key">${IS_MAC ? "⌘↑" : "Ctrl+↑"}</span><span class="rc-key">${IS_MAC ? "⌘↓" : "Ctrl+↓"}</span>${ctx.esc(ctx.phrase("switch"))}<span class="rc-key">↵</span>${ctx.esc(ctx.phrase("bring to the page"))}` : "");
    view.calm.hidden = model.others > 0;
    setText(view.calm, ctx.phrase("every other seat of this block shows up here, the one that needs you on top"));
    paintCards(ctx, model.cards, seatKey);
    paintBlocks(ctx, blockKey);
    paintTeam(ctx);
  },
  keydown(event, ctx) {
    if (!view || ctx.onPlane()) return false;
    const mod = IS_MAC ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    const cards = view.model?.cards || [];
    if (mod && !event.altKey && !event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      if (ctx.inField() || !cards.length) return false;
      cursor = stepCursor(cards, event.key === "ArrowDown" ? 1 : -1);
      ctx.render();
      view.made.get(cursor)?.scrollIntoView({ block: "nearest" });
      return true;
    }
    if (ctx.inField() || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    if (event.key === "Enter" && cursor) {
      const key = cursor;
      cursor = null;
      ctx.focusSeat(key);
      return true;
    }
    if (event.key === "Escape" && cursor) {
      cursor = null;
      ctx.render();
      return true;
    }
    if (/^Digit[1-9]$/.test(event.code) && view.model?.page && !openQuestion(ctx.tile(view.model.page.key))) {
      const asking = cards.find((one) => one.asks && one.answers.length);
      const n = Number(event.code.slice(5));
      if (asking && n <= asking.answers.length) return answer(ctx, asking.key, n);
    }
    return false;
  }
};

export { ember, emberModel };
