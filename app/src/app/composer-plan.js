import { planCardView } from "../views.js";
import { AGENT_NAMES, modelNamed, normalizeLooseModels, pillLabel, seatAgent, wireLinks } from "./chat-and-panes.js";
import { svCmd } from "./chat-stretches.js";
import { esc, phrase, renderMarkdown } from "./core.js";
import { composerIcon } from "./composer-icons.js";
import { composerLive, paintComposer } from "./composer-modes.js";
import { openDraft } from "./draft-seat.js";
import { enrichMarkdown } from "./markdown-rich.js";
import { providerName, providerReady, readyAgents } from "./providers.js";
import { svAppend } from "./structured-seats.js";
import { toClipboard } from "./terminal-history.js";

const PLAN_PROMPT = "PLEASE IMPLEMENT THIS PLAN:\n";

const PLAN_FOLD_CHARS = 900;

const PLAN_FOLD_LINES = 20;

const PLAN_PREVIEW_LINES = 10;

const HEADING = /^\s{0,3}#{1,6}\s+(.+)$/;

function planTitle(plan) {
  const heading = String(plan || "").match(/^\s{0,3}#{1,6}\s+(.+)$/m)?.[1]?.trim();
  return heading || null;
}

function displayedPlan(plan) {
  const lines = String(plan || "").trimEnd().split(/\r?\n/);
  const rest = lines[0] && HEADING.test(lines[0]) ? lines.slice(1) : [...lines];
  while (rest[0]?.trim() === "") rest.shift();
  if (rest[0]?.match(HEADING)?.[1]?.trim().toLowerCase() === "summary") {
    rest.shift();
    while (rest[0]?.trim() === "") rest.shift();
  }
  return rest.join("\n");
}

function planPreview(plan, maxLines = PLAN_PREVIEW_LINES) {
  const lines = displayedPlan(plan).trimEnd().split(/\r?\n/).map((line) => line.trimEnd());
  const kept = [];
  let seen = 0;
  let more = false;
  for (const line of lines) {
    const visible = line.trim().length > 0;
    if (visible && seen >= maxLines) { more = true; break; }
    kept.push(line);
    if (visible) seen++;
  }
  while (kept.length && !kept.at(-1).trim()) kept.pop();
  if (!kept.length) return planTitle(plan) || phrase("Plan preview unavailable.");
  if (more) kept.push("", "...");
  return kept.join("\n");
}

const planFolds = (plan) => String(plan || "").length > PLAN_FOLD_CHARS || String(plan || "").split("\n").length > PLAN_FOLD_LINES;

function planFileName(plan) {
  const stem = String(planTitle(plan) || "plan").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[`'".,!?()[\]{}]+/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${stem || "plan"}.md`;
}

const planPrompt = (plan) => `${PLAN_PROMPT}${String(plan || "").trim()}`;

const PLAN_FRONTS = /```frentes\s*\n([\s\S]*?)```/;

const PLAN_HERE = { aqui: "local", local: "local", "this machine": "local", maquina: "local", servidor: "cloud", cloud: "cloud", pod: "cloud", server: "cloud" };

const NO_MODEL = /^(padr[aã]o|default|-|—)$/i;

function frontAgentAndModel(said) {
  const raw = String(said || "").trim();
  if (!raw || NO_MODEL.test(raw)) return { agent: "", model: "" };
  const cut = raw.indexOf("/");
  const agent = cut > 0 ? raw.slice(0, cut).trim().toLowerCase() : "";
  const model = cut > 0 ? raw.slice(cut + 1).trim() : raw;
  if (agent && !AGENT_NAMES[agent]) return { agent: "", model: raw };
  return { agent, model: NO_MODEL.test(model) ? "" : model };
}

function planFronts(plan) {
  const block = PLAN_FRONTS.exec(String(plan || ""));
  if (!block) return [];
  return block[1].split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [name, said, where, repo, ...does] = line.split("·").map((piece) => piece.trim());
    return {
      name: String(name || "").toLowerCase(),
      ...frontAgentAndModel(said),
      where: PLAN_HERE[String(where || "").toLowerCase()] || "",
      repo: repo || "",
      does: does.join(" · "),
    };
  }).filter((one) => one.name);
}

const planWithoutFronts = (plan) => String(plan || "").replace(PLAN_FRONTS, "").trim();

const modelsOfAgent = new Map();

function agentModels(agent) {
  const id = AGENT_NAMES[agent] || "claude";
  if (modelsOfAgent.has(id)) return Promise.resolve(modelsOfAgent.get(id));
  return fetch(`/api/catalog?agent=${encodeURIComponent(id)}`)
    .then((r) => r.json())
    .then((answer) => {
      const rows = answer?.error ? [] : normalizeLooseModels(answer?.models);
      if (rows.length) modelsOfAgent.set(id, rows);
      return rows;
    })
    .catch(() => []);
}

function fillModels(row, rows, wanted) {
  const chosen = wanted || row.want || "";
  const known = modelNamed(rows, chosen);
  row.models = [
    { key: "", value: "", label: phrase("the account default") },
    ...rows.filter((m) => !m.isDefault).map((m) => ({ key: m.value, value: m.value, label: pillLabel(m.label) + (m.context ? ` · ${m.context}` : "") })),
    ...(chosen && !known ? [{ key: chosen, value: chosen, label: chosen }] : [])
  ];
  row.model = known ? known.value : chosen;
  row.want = row.model;
}

function pickAgent(row, wanted) {
  const cloud = row.where === "cloud";
  const ids = cloud ? Object.keys(AGENT_NAMES) : readyAgents(wanted);
  row.agents = ids.map((id) => ({ key: id, value: id, label: providerName(id), disabled: !cloud && !providerReady(id) }));
  row.agent = ids.includes(wanted) ? wanted : (ids.find((id) => cloud || providerReady(id)) || ids[0] || "claude");
}

const FRONT_SIDES = () => [{ key: "local", value: "local", label: phrase("here") }, { key: "cloud", value: "cloud", label: phrase("on the server") }];

function frontRow(one, mine) {
  const row = { key: one.name, name: one.name, about: [one.repo, one.does].filter(Boolean).join(" · "), where: one.where || mine.where, wheres: FRONT_SIDES(), agents: [], agent: "", models: [], model: "", want: one.model || "", locked: false };
  pickAgent(row, AGENT_NAMES[one.agent] ? one.agent : mine.agent);
  fillModels(row, [], one.model || "");
  return row;
}

const chosenFront = (row) => ({ name: row.name, agent: row.agent, model: row.model, where: row.where });

function wearFronts(card, chosen) {
  for (const row of card.rows) {
    const wish = (Array.isArray(chosen) ? chosen : []).find((one) => one?.name === row.name);
    if (wish) {
      if (wish.agent) row.agent = wish.agent;
      if (wish.where) row.where = wish.where;
      if (wish.model && !row.models.some((o) => o.value === wish.model)) row.models = [...row.models, { key: wish.model, value: wish.model, label: wish.model }];
      row.model = wish.model || "";
    }
    row.locked = true;
  }
}

function planCardModel(card) {
  const title = planTitle(card.prose) || phrase("Proposed plan");
  return {
    id: card.id,
    badge: phrase("Plan"),
    title,
    tag: phrase("plan"),
    say: phrase("this chat stopped, and it is waiting for you"),
    count: card.rows.length ? phrase("{n} chats", { n: card.rows.length }) : "",
    body: card.body,
    folds: card.folds,
    preview: card.preview,
    expand: phrase("Expand plan"),
    collapse: phrase("Collapse plan"),
    held: card.held,
    answered: card.answered,
    busy: card.busy,
    outcome: card.outcome,
    go: card.rows.length ? phrase("Approve and open") : phrase("Approve"),
    change: phrase("Change the plan"),
    cost: card.rows.length ? phrase("{n} of {max} of the budget", { n: card.rows.length, max: 3 }) : "",
    rows: structuredClone(card.rows),
    pickers: { agent: phrase("which chat program runs this front"), model: phrase("the model this front runs on"), where: phrase("where this front runs") },
    menu: {
      label: phrase("Plan actions"), icon: composerIcon("ellipsis"),
      copy: phrase("Copy to clipboard"), copied: phrase("Copied!"), download: phrase("Download as markdown"), save: phrase("Save to workspace"),
      file: planFileName(card.prose), text: card.saved
    },
    saveAs: `plans/${planFileName(card.prose)}`,
    saving: { title: phrase("Save plan to workspace"), path: phrase("File path"), cancel: phrase("Cancel"), save: phrase("Save"), failed: phrase("Could not save plan") }
  };
}

const showCard = (card) => card.view?.show(planCardModel(card));

function loadModels(card, row) {
  const asked = row.agent;
  return agentModels(asked).then((rows) => {
    if (row.agent !== asked) return;
    fillModels(row, rows, row.want);
    showCard(card);
  });
}

function pickFront(card, at, field, value) {
  const row = card.rows[at];
  if (!row) return;
  if (field === "agent") {
    row.agent = value;
    row.want = "";
    void loadModels(card, row);
  }
  if (field === "model") {
    row.model = value;
    row.want = value;
  }
  if (field === "where") {
    row.where = value;
    pickAgent(row, row.agent);
    void loadModels(card, row);
  }
  showCard(card);
}

function approvePlan(e, card) {
  if (card.busy || card.outcome) return;
  card.busy = true;
  showCard(card);
  const chosen = card.rows.map(chosenFront);
  svCmd(e, { type: "answer", id: card.id, answers: { plan: "go", fronts: chosen } }).then((r) => {
    if (r?.ok) {
      e.asked.delete(card.id);
      wearFronts(card, chosen);
    } else card.busy = false;
    showCard(card);
  });
}

async function savePlanFile(e, card, path) {
  const r = await fetch("/api/seat/plan-file", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: e.name, where: e.where, path, text: card.saved })
  }).then((x) => x.json()).catch((wrong) => ({ error: wrong.message }));
  if (r?.ok) e.box?.warn?.(phrase("Plan saved to workspace"), "sv-meta");
  return r;
}

function planCardActions(e, card) {
  return {
    wireBody: (root) => {
      wireLinks(e.name, root);
      enrichMarkdown(root, { seat: e });
    },
    wirePreview: (root) => wireLinks(e.name, root),
    pick: (at, field, value) => pickFront(card, at, field, value),
    approve: () => approvePlan(e, card),
    change: () => { e.host.querySelector(".sv-composer textarea")?.focus(); },
    copy: () => toClipboard(card.saved),
    save: (path) => savePlanFile(e, card, path)
  };
}

const planCards = new WeakMap();

function svPlanCard(e, ev) {
  const prose = planWithoutFronts(ev.plan);
  const mine = { agent: seatAgent(e), where: e?.where === "cloud" ? "cloud" : "local" };
  const folds = planFolds(prose);
  const card = {
    id: ev.id, prose, saved: `${String(ev.plan || "").trimEnd()}\n`,
    body: renderMarkdown(prose), folds, preview: folds ? renderMarkdown(planPreview(prose)) : "",
    rows: planFronts(ev.plan).map((one) => frontRow(one, mine)),
    held: false, answered: false, busy: false, outcome: "", view: null
  };
  card.view = planCardView(planCardModel(card), planCardActions(e, card));
  for (const row of card.rows) void loadModels(card, row);
  planCards.set(card.view.el, card);
  e.asked.set(ev.id, card.view.el);
  svAppend(e, card.view.el);
  notePlan(e, ev, card);
}

function closePlanCard(e, ev) {
  forgetPlan(e, ev.id);
  const card = planCards.get(e.asked.get(ev.id));
  e.asked.delete(ev.id);
  if (!card) return;
  card.answered = true;
  wearFronts(card, ev.fronts);
  card.outcome = ev.subtype === "plan_approved" ? phrase("approved") : phrase("dropped — you said it in the chat instead");
  showCard(card);
}

function notePlan(e, ev, card) {
  e.planAsk = { id: ev.id, plan: String(ev.plan || ""), card: card || null, sending: false };
  if (card && composerLive(e)) {
    card.held = true;
    showCard(card);
  }
  paintComposer(e);
}

function forgetPlan(e, id) {
  if (!e.planAsk || e.planAsk.id !== id) return;
  const card = e.planAsk.card;
  if (card) {
    card.held = false;
    showCard(card);
  }
  e.planAsk = null;
  paintComposer(e);
}

function implementPlan(e) {
  const held = e.planAsk;
  const card = held?.card;
  if (!card || card.outcome || card.busy || held.sending) return;
  held.sending = true;
  paintComposer(e);
  approvePlan(e, card);
  setTimeout(() => {
    if (e.planAsk !== held) return;
    held.sending = !!card.busy;
    paintComposer(e);
  }, 1500);
}

function implementInNewChat(e) {
  const held = e.planAsk;
  if (held) openDraft(planPrompt(held.plan));
}

function planBanner(e) {
  const title = planTitle(e.planAsk.plan);
  return `<section class="cp-ban"><div class="cp-brow"><span class="cp-bi"></span><span class="cp-bc"><span class="cp-bstrong">${esc(phrase("Plan ready"))}</span>${title ? `<span class="cp-btitle">${esc(title)}</span>` : ""}</span></div></section>`;
}

export { PLAN_PROMPT, closePlanCard, displayedPlan, forgetPlan, implementInNewChat, implementPlan, notePlan, planBanner, planFileName, planFolds, planPreview, planPrompt, planTitle, svPlanCard };
