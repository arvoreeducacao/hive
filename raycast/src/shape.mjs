const LABEL_STATES = ["in-review", "delivered", "decided", "closed", "draft"];

export function seatLink(name) {
  return `hive://seat/${encodeURIComponent(name)}`;
}

export function shelfLink(slug, tab = "") {
  return `hive://shelf/${encodeURIComponent(slug)}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`;
}

export function labelState(label) {
  const said = String(label || "").toLowerCase();
  return LABEL_STATES.find((one) => said === one || said.startsWith(`${one}-`)) || "";
}

function questionsOf(seat) {
  return (seat.asks || []).flatMap((ask) => (ask.questions || []).map((question) => ({ ...question, ask: ask.id })));
}

function chatOf(seat) {
  return {
    name: seat.name,
    where: seat.where || "local",
    title: String(seat.title || "").trim() || seat.name,
    mission: String(seat.description || "").trim(),
    now: String(seat.now || seat.summary || "").trim(),
    state: seat.state || "",
    model: seat.model || "",
    asks: seat.asks || [],
    questions: questionsOf(seat)
  };
}

function startingOf(job) {
  return {
    name: job.name,
    where: job.where || "local",
    title: String(job.mission || "").trim() || job.name,
    mission: String(job.mission || "").trim(),
    now: job.error ? job.error : job.step || "",
    state: job.error ? "failed" : "starting",
    model: job.model || "",
    asks: [],
    questions: []
  };
}

export function groupChats(hive) {
  const sessions = Array.isArray(hive?.sessions) ? hive.sessions : [];
  const alive = new Set(sessions.map((seat) => seat.name));
  const starting = (Array.isArray(hive?.spawning) ? hive.spawning : []).filter((job) => job.name && !alive.has(job.name) && job.step !== "up");
  const chats = sessions.filter((seat) => seat.name).map(chatOf);
  const waiting = chats.filter((chat) => chat.questions.length || chat.state === "waiting");
  const taken = new Set(waiting.map((chat) => chat.name));
  const working = chats.filter((chat) => !taken.has(chat.name) && chat.state === "working");
  working.forEach((chat) => taken.add(chat.name));
  const quiet = chats.filter((chat) => !taken.has(chat.name));
  return [
    { key: "waiting", title: "Waiting on you", chats: waiting },
    { key: "working", title: "Working", chats: [...starting.map(startingOf), ...working] },
    { key: "quiet", title: "Quiet", chats: quiet }
  ].filter((section) => section.chats.length);
}

function thumbOf(page) {
  const thumbs = page.thumbs || {};
  const tab = [page.kind, ...Object.keys(thumbs)].find((one) => one && Number(thumbs[one]) > 0);
  return tab ? { tab, version: Number(thumbs[tab]) } : null;
}

export const SHELF_FILTERS = [
  { value: "all", title: "All pages" },
  { value: "mine", title: "Mine" },
  { value: "open", title: "Waiting for review" },
  { value: "draft", title: "Drafts" }
];

export function pageMatches(page, filter, me) {
  if (filter === "mine") return Boolean(me) && page.owner === me;
  if (filter === "open") return page.state === "in-review" || page.state === "decided";
  if (filter === "draft") return page.state === "draft";
  return true;
}

const DAY = 24 * 60 * 60 * 1000;

export function whenBucket(at, now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (at >= start.getTime()) return "Today";
  if (at >= start.getTime() - 6 * DAY) return "This week";
  return "Earlier";
}

export function bucketed(rows, now = Date.now()) {
  const order = ["Today", "This week", "Earlier"];
  const groups = new Map(order.map((one) => [one, []]));
  for (const row of rows) groups.get(whenBucket(row.at, now)).push(row);
  return order.map((title) => ({ title, rows: groups.get(title) })).filter((group) => group.rows.length);
}

export function engines(providers) {
  return (Array.isArray(providers) ? providers : [])
    .filter((one) => one.installed && one.enabled && (one.accounts || []).some((account) => account.loggedIn))
    .map((one) => ({
      id: one.id,
      title: one.label || one.name || one.id,
      accounts: one.accounts.filter((account) => account.loggedIn).map((account) => account.name)
    }));
}

export function spawnBody({ prompt, agent, model, effort, account }) {
  return {
    name: "",
    prompt,
    where: "local",
    agent: agent || "claude",
    structured: true,
    model: model && model !== "default" ? model : "",
    account: account && account !== "default" ? account : "",
    ...(effort ? { effort } : {})
  };
}

export function shelfRows(shelf) {
  const pages = Array.isArray(shelf?.pages) ? shelf.pages : [];
  const leaf = String(shelf?.leaf || "").replace(/\/+$/, "");
  return pages
    .filter((page) => page.slug)
    .map((page) => {
      const tabs = Object.keys(page.tabs || {});
      const leafTab = leaf ? tabs.find((tab) => page.tabs[tab]?.leafId) : "";
      return {
        slug: page.slug,
        title: String(page.title || "").trim() || page.slug,
        kind: page.kind || tabs[0] || "",
        tabs,
        owner: page.owner || "",
        state: labelState(page.label),
        at: Number(page.at) || 0,
        versions: tabs.reduce((sum, tab) => sum + (page.tabs[tab]?.versions?.length || 0), 0),
        thumb: thumbOf(page),
        leaf: leafTab ? `${leaf}/doc/${encodeURIComponent(page.tabs[leafTab].leafId)}` : ""
      };
    })
    .sort((a, b) => b.at - a.at);
}

export function missionWith(mission, selected) {
  const said = String(mission || "").trim();
  const picked = String(selected || "").trim();
  if (!picked) return said;
  const quoted = picked.split("\n").map((line) => `> ${line}`).join("\n");
  return said ? `${said}\n\n${quoted}` : quoted;
}

export function answersOf(questions, values) {
  const answers = {};
  for (const [i, question] of questions.entries()) {
    const typed = String(values[`other-${i}`] || "").trim();
    const picked = values[`pick-${i}`];
    if (question.multiSelect) {
      const chosen = [...(Array.isArray(picked) ? picked : []), ...(typed ? [typed] : [])];
      if (chosen.length) answers[question.question] = chosen;
    } else if (typed || picked) {
      answers[question.question] = typed || picked;
    }
  }
  return answers;
}
