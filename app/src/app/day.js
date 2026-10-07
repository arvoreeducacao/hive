import { questionCard } from "./chat-and-panes.js";
import { $, esc, GLYPH, LABEL, phrase, raycastOn, screenOpens, solidMounts, st, stateColor, svgIcon } from "./core.js";
import { goTo, pull, releaseKeyboard } from "./focus-navigation.js";
import { liveAge, liveOf } from "./leader-key.js";
import { capsOf, dressHost, followRaycast, leavePanel, openActions, panelOf, registerPanel, undressHost } from "./panel-window.js";
import { ask, closePortaria, portariaOnScreen } from "./pod.js";
import { sendToSeat } from "./seat-layout.js";
import { closeShelf, shelfOnScreen } from "./shelf.js";
import { closePrs, prsOnScreen } from "./thread.js";
import { closeUsage, usageOnScreen } from "./usage.js";
import { closeWorktrees, worktreesOnScreen } from "./worktrees.js";

const dayOnScreen = () => !$("day").hidden;

function openDay() {
  screenOpens();
  releaseKeyboard();
  if (prsOnScreen()) closePrs();
  if (usageOnScreen()) closeUsage();
  if (worktreesOnScreen()) closeWorktrees();
  if (shelfOnScreen()) closeShelf();
  if (portariaOnScreen()) closePortaria();
  $("day").hidden = false;
  paintDay(true);
  $("day-in").focus();
}

function closeDay() {
  if (raycastOn()) leavePanel($("day"));
  $("day").hidden = true;
}

function dressDay() {
  const say = (text) => esc(phrase(text));
  const keys = (combo) => `<span class="pw-keys">${capsOf(combo).map((cap) => `<kbd class="rc-key">${esc(cap)}</kbd>`).join("")}</span>`;
  dressHost($("day"), `
    <header class="pw-head" data-no-t>
      <span class="pw-ico">${svgIcon("i-cal")}</span>
      <h2 class="pw-title">${say("Your day")}</h2>
      <span data-pw-keep="day-count" class="pw-count"></span>
      <span class="pw-grow"></span>
      <span class="pw-hint">${keys({ code: "Enter" })}${say("sends to your conductor")}</span>
      <span class="pw-vsep"></span>
      <button type="button" class="pw-esc" id="day-shut" aria-label="${say("close")}" title="${say("close")}">esc</button>
    </header>
    <div data-pw-keep="day-body" class="pw-body"></div>
    <div data-pw-keep="day-note"></div>
    <form data-pw-keep="day-say" class="pw-foot day-say" data-no-t><label class="day-field">${svgIcon("i-send")}<textarea data-pw-keep="day-in" placeholder="${say("what needs to happen…")}" aria-label="${say("what needs to happen…")}"></textarea></label><button data-pw-keep="day-send" type="submit" class="pw-go" title="${say("sends it to your conductor")}">${say("Send")}${keys({ code: "Enter" })}</button><span class="pw-vsep"></span><button type="button" class="pw-act" id="day-more" data-pw-more aria-haspopup="menu">${say("Actions")}${keys({ meta: true, code: "KeyK" })}</button></form>`, {
    on: (host) => {
      host.querySelector("#day-shut").addEventListener("click", closeDay);
      host.querySelector("#day-more").addEventListener("click", () => openActions(panelOf("day")));
    }
  });
}

const PR_IN_URL = /github\.com\/[\w.-]+\/([\w.-]+)\/pull\/(\d+)/;

const dayCards = new Map();

let dayPainted = "";

st.dayBoardOpen = false;

st.dayRenaming = false;

st.dayPick = "";

function dayAsking(day) {
  const open = new Map();
  for (const one of day.needsYou || []) {
    for (const seat of one.seats || []) {
      for (const ask of seat.asks || []) open.set(ask.id, { seat, questions: ask.questions || [] });
    }
  }
  return open;
}

async function answerFromTheDay(seat, id, answers) {
  try {
    const r = await fetch("/api/answer", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: seat.name, where: seat.where || "local", id, answers })
    }).then((x) => x.json());
    if (!r?.ok) return { ok: false, error: r?.error || phrase("the seat did not take the answer") };
  } catch (wrong) {
    return { ok: false, error: wrong?.message || phrase("the answer did not land — try again") };
  }
  await pull();
  if (dayOnScreen()) paintDay(true);
  return { ok: true };
}

function dayAskCard(id, asking) {
  const had = dayCards.get(id);
  if (had) return had;
  const card = questionCard(asking.questions, (answers) => answerFromTheDay(asking.seat, id, answers));
  dayCards.set(id, card);
  return card;
}

function paintDay(force = false) {
  const day = st.data.day || { needsYou: [], cameBack: [], onTheWay: [], byHand: [] };
  const mark = JSON.stringify(day);
  if (!force && (st.dayRenaming || mark === dayPainted)) return;
  dayPainted = mark;
  const asking = dayAsking(day);
  for (const id of [...dayCards.keys()]) if (!asking.has(id)) dayCards.delete(id);
  if (raycastOn()) dressDay();
  const model = raycastOn() ? dayWindowModel(day) : dayViewModel(day);
  $("day-count").textContent = model.count;
  const keeping = keptFocus($("day-body"));
  daySolid.show(model);
  for (const slot of $("day-body").querySelectorAll(".dask")) {
    const found = asking.get(slot.dataset.ask);
    if (found) slot.appendChild(dayAskCard(slot.dataset.ask, found));
  }
  keeping();
  for (const one of $("day-body").querySelectorAll("[data-seen]")) one.disabled = false;
}

let daySolid = null;

const dayPrLinks = (links) => (links || []).map((link) => {
  const bits = PR_IN_URL.exec(link);
  return { key: link, href: link, say: bits ? `${bits[1]}#${bits[2]}` : link };
});

function dayLineModel(one, kind) {
  const slots = kind !== "needs" ? [] : one.seats.flatMap((seat) => (seat.asks || []).map((ask) => ({
    key: ask.id, ask: ask.id, seat: seat.name,
    head: one.seats.length > 1 ? `<div class="daskw">${phrase("{seat} is asking", { seat: esc(seat.title || seat.name) })}</div>` : ""
  })));
  const links = dayPrLinks(one.prs);
  return {
    key: `${kind}:${one.errand}`, kind,
    cap: kind === "needs" ? phrase("waiting on you") : kind === "back" ? phrase("came back, and you have not looked") : phrase("on the way"),
    errand: one.errand, renameHint: phrase("click to rename this request"),
    name: one.errand || one.seats[0]?.title || one.seats[0]?.name || "",
    fronts: one.seats.length > 1 ? `· ${phrase("{n} fronts", { n: one.seats.length })}` : "",
    said: kind === "back"
      ? (one.closed ? phrase("the chats of this request are closed — what is left is the PR") : one.seats.map((seat) => seat.now).filter(Boolean).join(" · "))
      : (one.seats.find((seat) => seat.state === "needs")?.now || one.seats.map((seat) => seat.now).filter(Boolean).slice(-1)[0] || ""),
    asked: one.asked ? `${phrase("you asked")}: “${one.asked}”` : "",
    slots,
    acts: kind === "back"
      ? { kind: "back", links, nothing: phrase("nothing to open yet"), errand: one.errand, seenSay: phrase("I saw this") }
      : (kind === "needs" && !slots.length && one.seats[0]
        ? { kind: "goto", links: [], goto: one.seats[0].name, gotoSay: phrase("open this chat") }
        : (links.length ? { kind: "links", links } : { kind: "none", links: [] }))
  };
}

function dayBriefModel(day) {
  const lines = [
    ...day.needsYou.map((one) => dayLineModel(one, "needs")),
    ...day.cameBack.map((one) => dayLineModel(one, "back")),
    ...day.onTheWay.map((one) => dayLineModel(one, "way"))
  ];
  if (!lines.length) return null;
  const waiting = day.needsYou.length;
  return {
    hi: waiting
      ? {
        lead: phrase("{n} things of yours are up.", { n: day.needsYou.length + day.cameBack.length + day.onTheWay.length }),
        bold: waiting === 1 ? phrase("One is waiting on you.") : phrase("{n} are waiting on you.", { n: waiting })
      }
      : { lead: phrase("Nothing is waiting on you."), bold: "" },
    lines
  };
}

function dayFoldModel(day, byHand) {
  const seats = [...day.needsYou, ...day.cameBack, ...day.onTheWay].reduce((n, one) => n + one.seats.length, 0);
  const asked = day.needsYou.length + day.cameBack.length + day.onTheWay.length;
  if (!asked && !byHand.length) return null;
  return {
    bits: [
      asked ? { key: "asked", bold: true, say: asked === 1 ? phrase("1 request") : phrase("{n} requests", { n: asked }) } : null,
      seats ? { key: "seats", bold: false, say: seats === 1 ? phrase("1 chat open") : phrase("{n} chats open", { n: seats }) } : null,
      byHand.length ? { key: "hand", bold: false, say: byHand.length === 1 ? phrase("1 you opened by hand") : phrase("{n} you opened by hand", { n: byHand.length }) } : null
    ].filter(Boolean),
    say: st.dayBoardOpen ? phrase("close") : phrase("open the board"),
    up: st.dayBoardOpen
  };
}

const dayIsRace = (one) => Number(one.race) > 1 && one.seats.length > 1;

function dayFrontsSay(one) {
  if (!dayIsRace(one)) return one.seats.length === 1 ? phrase("1 front") : phrase("{n} fronts", { n: one.seats.length });
  const still = one.seats.length < one.race ? ` · ${phrase("{n} still in", { n: one.seats.length })}` : "";
  return `${phrase("race of {n}", { n: one.race })}${still}`;
}

async function keepFromTheDay(keep) {
  const yes = await ask(
    phrase("keep {seat}?", { seat: keep.title }),
    esc(phrase("the other chats of this race go to the archive — you can bring them back from there")),
    phrase("keep this one")
  );
  if (!yes) return;
  const said = await fetch("/api/errands/keep", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ errand: keep.errand, seat: keep.seat }) })
    .then((r) => r.json()).catch(() => ({}));
  if (!said.ok) return;
  await pull();
  paintDay(true);
}

function dayZoneModel(title, groups, kind) {
  if (!groups.length) return null;
  return {
    key: kind, title, count: groups.length, hand: kind === "hand",
    errands: groups.map((one) => ({
      key: one.errand, kind,
      name: one.errand || one.seats[0]?.title || one.seats[0]?.name || "",
      asked: one.asked ? `${phrase("you asked")}: “${one.asked}”` : "",
      fronts: dayFrontsSay(one),
      race: dayIsRace(one),
      seats: one.seats.map((seat) => ({
        key: seat.name, name: seat.name, hint: phrase("open this chat"),
        colour: stateColor(seat.state), glyph: GLYPH[seat.state] || "g-idle",
        title: seat.title || seat.name, now: seat.now || "",
        live: !!liveOf(seat).length,
        state: liveOf(seat).length
          ? phrase("{n} running", { n: liveOf(seat).length }) + (liveAge(seat) ? ` · ${liveAge(seat)}` : "")
          : phrase(LABEL[seat.state] || seat.state || ""),
        prs: dayIsRace(one) ? dayPrLinks(seat.prs) : [],
        keep: dayIsRace(one)
          ? { errand: one.errand, seat: seat.name, title: seat.title || seat.name, say: phrase("keep this one"), hint: phrase("the other chats of this race go to the archive — you can bring them back from there") }
          : null
      })),
      foot: kind === "back"
        ? { links: dayPrLinks(one.prs), nothing: phrase("nothing to open yet"), seen: one.errand, seenSay: phrase("I saw this") }
        : ((one.prs || []).length ? { links: dayPrLinks(one.prs), nothing: "", seen: "" } : null)
    }))
  };
}

const DAY_KINDS = [["needs", "needsYou", "waiting on you"], ["back", "cameBack", "came back"], ["way", "onTheWay", "on the way"], ["hand", "byHand", "opened by hand"]];

const DAY_DOTS = { needs: "needs", back: "done", way: "working", hand: "idle" };

const dayKeyOf = (kind, one) => `${kind}:${one.errand || one.seats[0]?.name || ""}`;

function daySectionsModel(day) {
  const sections = DAY_KINDS.map(([kind, field, say]) => ({
    key: kind, say: phrase(say),
    rows: (day[field] || []).map((one) => ({
      key: dayKeyOf(kind, one), kind, dot: DAY_DOTS[kind],
      name: one.errand || one.seats[0]?.title || one.seats[0]?.name || "",
      sub: one.seats.length === 1 ? phrase("1 front") : phrase("{n} fronts", { n: one.seats.length }),
      say: kind === "needs" ? phrase("asks for you") : kind === "back" ? phrase("came back") : kind === "way" ? phrase("working") : phrase(LABEL[one.seats[0]?.state] || ""),
      here: false
    }))
  })).filter((section) => section.rows.length);
  const all = sections.flatMap((section) => section.rows);
  if (!all.some((row) => row.key === st.dayPick)) st.dayPick = all[0]?.key || "";
  for (const row of all) row.here = row.key === st.dayPick;
  return sections;
}

function dayPickedModel(day) {
  for (const [kind, field] of DAY_KINDS) {
    const one = (day[field] || []).find((group) => dayKeyOf(kind, group) === st.dayPick);
    if (!one) continue;
    const zone = dayZoneModel("", [one], kind);
    return { key: st.dayPick, kind, line: kind === "hand" ? null : dayLineModel(one, kind), errand: zone.errands[0] };
  }
  return null;
}

function dayWindowModel(day) {
  return { ...dayViewModel(day), raycast: true, sections: daySectionsModel(day), picked: dayPickedModel(day), listSay: phrase("what you asked for") };
}

const byHandSay = (n) => n === 1 ? phrase("1 chat you opened by hand") : phrase("{n} chats you opened by hand", { n });

function dayViewModel(day) {
  const byHand = day.byHand || [];
  const asked = day.needsYou.length + day.cameBack.length + day.onTheWay.length;
  return {
    count: asked
      ? `${asked === 1 ? phrase("1 thing you asked for") : phrase("{n} things you asked for", { n: asked })}${byHand.length ? ` · ${byHandSay(byHand.length)}` : ""}`
      : (byHand.length ? byHandSay(byHand.length) : ""),
    brief: dayBriefModel(day),
    fold: dayFoldModel(day, byHand),
    boardOpen: st.dayBoardOpen,
    zones: [
      dayZoneModel(phrase("waiting on you"), day.needsYou, "needs"),
      dayZoneModel(phrase("came back, and you have not looked"), day.cameBack, "back"),
      dayZoneModel(phrase("on the way — nothing for you"), day.onTheWay, "way"),
      dayZoneModel(phrase("chats you opened by hand — not something you asked the conductor"), byHand, "hand")
    ].filter(Boolean),
    emptyHead: phrase("Nothing open."),
    emptySay: phrase("Say what needs to happen down below. The conductor splits it and the fronts show up here, grouped by what you asked for.")
  };
}

async function daySawIt(el) {
  el.disabled = true;
  try {
    await fetch("/api/errands/seen", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ errand: el.dataset.seen })
    });
  } catch {}
  await pull();
  if (dayOnScreen()) paintDay();
}

solidMounts.push((hive) => {
  daySolid = hive.mountDay($("day-body"), {
    actions: {
      board: () => { st.dayBoardOpen = !st.dayBoardOpen; paintDay(true); },
      rename: (el) => renameFromTheDay(el),
      goto: (name) => { closeDay(); goTo(name); },
      seen: (el) => daySawIt(el),
      keep: (keep) => keepFromTheDay(keep),
      pick: (key) => { st.dayPick = key; paintDay(true); }
    }
  });
});

const CONDUCTOR = "orquestrador";

const CONDUCTOR_BRIEF = [
  "Você é o assento orquestrador desta pessoa. Carregue a skill `orquestrador` e siga por ela.",
  "Ela fala com você pela tela do dia e não vai ler este chat. O que ela precisa saber tem que caber no que a tela mostra.",
  "ANTES de abrir qualquer assento, decida ONDE a frase dela entra. A lista do que já está aberto e do que ela já pediu nos últimos dias vem junto com a frase:",
  "· se a frase PARECE ser algo que ela já pediu — aberto ou fechado —, NÃO decida sozinho e NÃO abra nada: pergunte com a tool AskUserQuestion, uma pergunta só. Escreva no enunciado o nome daquele pedido, desde quando ele existe e a última coisa que aconteceu nele. Ofereça duas opções: continuar o pedido que já existe, e abrir um novo porque é outra coisa. É o momento mais importante do seu trabalho: ela esquece se já mandou, e esta pergunta é o que a impede de pedir duas vezes.",
  "· se ela responder que é o mesmo pedido, mande a frase para o assento daquele pedido com `message` e não abra assento novo. Se o pedido já fechou e não tem assento vivo, abra um assento com a MESMA `errand` de antes.",
  "· se é claramente coisa nova, sem nada parecido na lista, abra os assentos direto, sem perguntar, e etiquete todos com a MESMA `errand`. A etiqueta é o que ela lê na tela: escreva a frase que ela reconheceria amanhã, não o nome do processo.",
  "· se cabe em você, faça e diga que fez.",
  "Termine sempre com UMA linha dizendo o que você decidiu — \"completei o pedido X com isso\" ou \"abri N assentos para X\". Essa linha é o que aparece na tela dela; é o único retorno que ela vai ler.",
  "Não investigue as suas próprias ferramentas nem leia o código do hive: `peers`, `spawn`, `message`, `ask` e `peek` estão à mão, e a descrição de cada uma basta."
].join("\n");

const HOW_LONG_AGO = (at) => {
  const ms = Date.now() - (at || 0);
  if (!at || ms < 0) return "";
  const min = Math.round(ms / 60000);
  if (min < 60) return `há ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} dias`;
};

function whatIsOpen() {
  const day = st.data.day || {};
  const groups = [...(day.needsYou || []), ...(day.onTheWay || []), ...(day.cameBack || [])];
  const live = groups.map((one) => {
    const fronts = one.seats.map((seat) => seat.name).join(", ");
    const said = one.asked ? ` · ela pediu assim: “${one.asked}”` : "";
    return `· “${one.errand}” — ${fronts ? `assentos: ${fronts}` : "sem chat aberto, só o PR"}${said}`;
  });
  const open = new Set(groups.map((one) => one.errand));
  const shut = (st.data.closed || []).filter((one) => !open.has(one.errand)).slice(0, 12).map((one) => {
    const when = HOW_LONG_AGO(one.endedAt);
    const said = one.asked ? ` · ela pediu assim: “${one.asked}”` : "";
    return `· “${one.errand}” — fechou${when ? ` ${when}` : ""}${one.prs.length ? `, com PR` : ""}${said}`;
  });
  const parts = [];
  if (live.length) parts.push("Pedidos dela abertos agora:", ...live);
  else parts.push("Nada aberto no nome dela agora.");
  if (shut.length) parts.push("", "Pedidos que ela já fez e já fecharam (é aqui que mora o “eu já mandei isso?”):", ...shut);
  return parts.join("\n");
}

const conductorAsk = (said) => [whatIsOpen(), "", "O que ela acabou de dizer:", said].join("\n");

const conductorSeat = () => (st.data.sessions || []).find((s) => s.name === CONDUCTOR);

async function renameErrandTo(was, now) {
  try {
    const r = await fetch("/api/errands/rename", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: was, to: now })
    }).then((x) => x.json());
    if (!r?.ok) return r?.error || phrase("that name did not stick");
  } catch (wrong) {
    return wrong?.message || phrase("that name did not stick");
  }
  await pull();
  if (dayOnScreen()) paintDay(true);
  return "";
}

function renameFromTheDay(el) {
  const was = el.dataset.rename;
  if (!was || el.dataset.editing) return;
  el.dataset.editing = "1";
  st.dayRenaming = true;
  const box = document.createElement("input");
  box.className = "dedit";
  box.value = was;
  box.title = phrase("enter saves · esc leaves it as it was");
  el.replaceWith(box);
  box.focus();
  box.select();
  let done = false;
  const give = (text) => {
    if (done) return;
    done = true;
    st.dayRenaming = false;
    box.replaceWith(el);
    delete el.dataset.editing;
    if (text) dayNote(esc(text));
  };
  box.addEventListener("keydown", async (ev) => {
    ev.stopPropagation();
    if (ev.key === "Escape") { ev.preventDefault(); return give(""); }
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    const now = box.value.trim();
    if (!now || now === was) return give("");
    box.disabled = true;
    st.dayRenaming = false;
    const wrong = await renameErrandTo(was, now);
    if (!wrong) { done = true; return; }
    st.dayRenaming = true;
    box.disabled = false;
    box.focus();
    dayNote(esc(wrong));
  });
  box.addEventListener("blur", () => give(""));
}

function keptFocus(box) {
  const was = document.activeElement;
  if (!box.contains(was) || !("value" in was) || !was.closest(".sv-q")) return () => {};
  const at = was.selectionStart;
  const to = was.selectionEnd;
  return () => {
    if (!was.isConnected) return;
    was.focus();
    try { was.setSelectionRange(at, to); } catch {}
  };
}

function dayNote(html) {
  const box = $("day-note");
  box.innerHTML = html || "";
  box.hidden = !html;
}

st.dayHeard = null;

function dayWhatItDecided() {
  if (!st.dayHeard) return;
  const seat = conductorSeat();
  const done = seat?.finish;
  if (!done || (done.seq || 0) <= st.dayHeard.seq) return;
  st.dayHeard = null;
  const line = String(done.text || "").split("\n").map((one) => one.trim()).filter(Boolean)[0] || "";
  if (!line) return dayNote(phrase("it finished and said nothing — open the chat to see why"));
  dayNote(`<b>${esc(phrase("your conductor"))}</b> — ${esc(line)}`);
}

async function askTheConductor(text) {
  const said = text.trim();
  if (!said) return;
  const form = $("day-say");
  form.classList.add("busy");
  try {
    const seat = conductorSeat();
    if (seat) {
      if (!sendToSeat(seat, conductorAsk(said))) {
        dayNote(phrase("the conductor is not answering right now — try again in a moment"));
        return;
      }
      st.dayHeard = { seq: seat.finish?.seq || 0 };
      dayNote(phrase("sent — it is deciding whether this opens a chat or goes into one."));
    } else {
      const r = await fetch("/api/spawn", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: CONDUCTOR, title: phrase("your conductor"), where: "local",
          prompt: `${CONDUCTOR_BRIEF}\n\n${conductorAsk(said)}`, structured: true, agent: "claude"
        })
      }).then((x) => x.json()).catch((e) => ({ error: e.message }));
      if (!r?.ok) {
        dayNote(phrase("could not open the conductor: {why}", { why: esc(r?.error || "unknown") }));
        return;
      }
      st.dayHeard = { seq: 0 };
      dayNote(phrase("opening your conductor — what it decides shows up right here."));
    }
    $("day-in").value = "";
    await pull();
    if (dayOnScreen()) paintDay();
  } finally {
    form.classList.remove("busy");
  }
}

$("day-say").addEventListener("submit", (ev) => { ev.preventDefault(); askTheConductor($("day-in").value); });

$("day-in").addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") { ev.preventDefault(); return $("day-in").value ? ($("day-in").value = "") : closeDay(); }
  ev.stopPropagation();
  if (ev.key !== "Enter" || ev.shiftKey) return;
  ev.preventDefault();
  askTheConductor($("day-in").value);
});

$("day-close").addEventListener("click", closeDay);

const NO_DAY = { needsYou: [], cameBack: [], onTheWay: [], byHand: [] };

function stepDay(step) {
  const rows = daySectionsModel(st.data.day || NO_DAY).flatMap((section) => section.rows);
  if (!rows.length) return;
  const at = rows.findIndex((row) => row.key === st.dayPick);
  st.dayPick = rows[(at + step + rows.length) % rows.length].key;
  paintDay(true);
  $("day-body").querySelector(`[data-pick="${CSS.escape(st.dayPick)}"]`)?.focus();
}

function dayActions() {
  const picked = dayPickedModel(st.data.day || NO_DAY);
  if (!picked) return [];
  const seat = picked.errand.seats[0];
  const seen = picked.kind === "back" ? picked.errand.foot?.seen : "";
  return [
    seat ? { key: "goto", say: phrase("Open this chat"), icon: "i-agent", combo: { meta: true, code: "Enter" }, go: () => { closeDay(); goTo(seat.name); } } : null,
    seen ? { key: "seen", say: phrase("I saw this"), icon: "i-check", go: () => daySawIt({ dataset: { seen } }) } : null,
    ...(picked.errand.foot?.links || []).map((link) => ({ key: link.key, say: link.say, icon: "i-pr", group: phrase("Came back"), go: () => window.open(link.href, "_blank", "noreferrer") }))
  ];
}

registerPanel("day", {
  el: () => $("day"),
  list: () => $("day-body").querySelector(".day-list"),
  actions: dayActions,
  step: stepDay,
  subject: () => dayPickedModel(st.data.day || NO_DAY)?.errand.name || phrase("Your day")
});

followRaycast((on) => {
  if (!on) undressHost($("day"));
  if (daySolid && dayOnScreen()) paintDay(true);
});

export { dayPickedModel, daySectionsModel, dayWindowModel, CONDUCTOR, CONDUCTOR_BRIEF, HOW_LONG_AGO, PR_IN_URL, answerFromTheDay, askTheConductor, closeDay, conductorAsk, conductorSeat, dayAskCard, dayAsking, dayBriefModel, dayCards, dayFoldModel, dayLineModel, dayNote, dayOnScreen, dayPainted, dayPrLinks, daySawIt, daySolid, dayViewModel, dayWhatItDecided, dayZoneModel, keptFocus, openDay, paintDay, renameErrandTo, renameFromTheDay, whatIsOpen };
