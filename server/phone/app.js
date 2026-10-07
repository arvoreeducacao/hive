import { Device } from "/phone/device.mjs";
import { avatarFor, avatarSvg, parseAvatar } from "/phone/avatar.mjs";
import { renderMarkdown } from "/phone/markdown.mjs";

const DB = "hive-phone";
const HOST = `${location.origin}/sync`;
const $ = (id) => document.getElementById(id);
const IC_AGENT = '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 1.9 13.4 5v6L8 14.1 2.6 11V5Z" fill="none" stroke="#9C988F" stroke-width="1.2" stroke-linejoin="round"/><circle cx="8" cy="8" r="1.9" fill="#CD694A"/></svg>';
const GROUPS = [["needs", "waiting on you", true], ["working", "on the way", false], ["done", "came back, nobody looked", false], ["asleep", "asleep", false]];
const PILL = { needs: "answer", working: "working", done: "done", asleep: "asleep" };
const WHERE = { mac: "Mac", pod: "cloud", phone: "phone" };
const SEEN_KEY = "hive-phone-seen";
const LANGUAGE_KEY = "hive-phone-language";
const PUSHED = new Set(["seatScreen", "settingsScreen", "draftScreen", "pageScreen"]);
const PICTURES_CEILING = 6;
const BIRTH_WAIT_MS = 60000;
const PAGE_WAIT_MS = 25000;
const PEOPLE_FRESH_MS = 60000;
const SWIPE_EDGE = 32;
const SWIPE_DONE = 90;

const PT_BR = {
  "your chats, in your pocket, with nobody in between reading them": "seus chats, no bolso, sem ninguém no caminho lendo",
  "invite code": "código de convite",
  "8 letters": "8 letras",
  "this device": "este aparelho",
  "come in": "entrar",
  "the code comes from your Hive on the Mac, under \"who gets in\". It works once and closes after five wrong tries. Once in, this device signs every request with a key that never leaves it, and every chat arrives sealed with a key only your devices hold.": "o código sai do seu Hive no Mac, em \"quem entra\". Vale uma vez e fecha em cinco erros. Depois de entrar, este aparelho assina cada pedido com uma chave que nunca sai daqui, e cada chat chega fechado com uma chave que só os seus aparelhos têm.",
  "settings": "ajustes",
  "no network · showing what you already had": "sem rede · mostrando o que você já tinha",
  "no chat has arrived yet": "nenhum chat chegou ainda",
  "open the Hive on the Mac with \"my phone\" on: it hands over the keys of the open chats in a few seconds": "abra o Hive no Mac com \"meu celular\" ligado: ele entrega as chaves dos chats abertos em alguns segundos",
  "back": "voltar",
  "end to end": "ponta a ponta",
  "envelopes": "envelopes",
  "talk to the chat": "fale com o chat",
  "stop the turn": "parar o turno",
  "send": "enviar",
  "add a picture": "juntar uma imagem",
  "jump to the end": "ir pro fim",
  "remove": "tirar",
  "notices": "avisos",
  "when a chat stops, this device tells you, if you let it. On an iPhone it only rings with the app closed once you add the Hive to the home screen.": "quando um chat parar, o aparelho avisa, se você deixar. No iPhone, com o app fechado, só toca depois que você põe o Hive na tela de início.",
  "let it tell me": "deixar avisar",
  "ended or asked": "terminou ou perguntou",
  "only when it asks": "só quando pergunta",
  "it rings with the app closed": "toca com o app fechado",
  "it only rings while this page is open: add the Hive to the home screen": "só toca com esta página aberta: ponha o Hive na tela de início",
  "a chat": "um chat",
  "it ended its turn": "terminou o turno",
  "and {n} other chats came back": "e outros {n} chats voltaram",
  "it is waiting on you": "está esperando você",
  "leave this device": "sair deste aparelho",
  "erases the keys and the copy of the chats from here. To take the device out for good, revoke it on the Mac under \"who gets in\".": "apaga as chaves e a cópia dos chats daqui. Para tirar o aparelho de vez, revogue no Mac em \"quem entra\".",
  "erase everything here": "apagar tudo daqui",
  "waiting on you": "espera você",
  "on the way": "a caminho",
  "came back, nobody looked": "voltou e ninguém olhou",
  "asleep": "dormindo",
  "answer": "responder",
  "working": "trabalhando",
  "done": "feito",
  "cloud": "nuvem",
  "phone": "celular",
  "now": "agora",
  "{n} min": "{n} min",
  "{n} h": "{n} h",
  "question: {q}": "pergunta: {q}",
  "sent a picture": "mandou uma imagem",
  "you: ": "você: ",
  "nothing online": "nada online",
  "{m} online": "{m} online",
  "{m} online · cloud awake": "{m} online · nuvem acordada",
  "{n} open · {m} waiting on you": "{n} abertos · {m} esperam você",
  "{n} open · nothing waiting on you": "{n} abertos · nada esperando você",
  "1 open · nothing waiting on you": "1 aberto · nada esperando você",
  "1 open · 1 waiting on you": "1 aberto · espera você",
  "no recent message": "sem mensagem recente",
  "closed": "encerrado",
  "the start of this conversation stayed on the Mac: only what happened after it arrives here": "o começo desta conversa ficou no Mac: aqui só chega o que aconteceu depois",
  "the turn ended with an error: {e}": "o turno terminou com erro: {e}",
  "turn finished": "turno terminou",
  "the chat did not take it: {e}": "o chat não recebeu: {e}",
  "1 step": "1 passo",
  "{n} steps": "{n} passos",
  "see": "ver",
  "close": "fechar",
  "a message sealed with a key this device does not have": "uma mensagem fechada com uma chave que este aparelho não tem",
  "asked it to stop": "pediu para parar",
  "you, from here": "você, daqui",
  "another device of yours": "outro aparelho seu",
  "the chat called: {t}": "o chat chamou: {t}",
  "you, from the Mac": "você, pelo Mac",
  "the chat showed": "o chat mostrou",
  "a picture this device cannot open": "imagem que este aparelho não abre",
  "question": "pergunta",
  "plan": "plano",
  "waiting for you": "esperando você",
  "approve and open": "aprovar e abrir",
  "the chats it describes are opened; nothing runs before that": "os chats que ele descreve são abertos; nada roda antes disso",
  "to change the plan: write it below": "pra mudar o plano: escreva abaixo",
  "a plan is waiting for you": "um plano está esperando você",
  "{a} of {b}": "{a} de {b}",
  "recommended": "recomendada",
  "another answer: write it below": "outra resposta: escreva embaixo",
  "agent": "agente",
  "copy": "copiar",
  "copied": "copiado",
  "that opens on the Mac": "isso abre no Mac",
  "online": "online",
  "away": "fora",
  "this device was taken out of the Hive on the Mac": "este aparelho foi tirado do Hive no Mac",
  "this browser does not give notices": "este navegador não avisa",
  "notices on": "avisos ligados",
  "notices blocked by the system": "avisos bloqueados no sistema",
  "erase the keys and the chats from this device?": "apagar as chaves e os chats deste aparelho?",
  "asked the chat to stop": "pedi para parar",
  "what the hive keeps of this chat:": "o que o hive guarda deste chat:",
  "title": "título",
  "keys": "chaves",
  "(wrapped per device)": "(embrulhadas por aparelho)",
  "{n} events, the last one:": "{n} eventos, o último:",
  "new chat": "chat novo",
  "what should this chat do?": "o que esse chat deve fazer?",
  "write it below and send: the Mac opens the chat and names it": "escreva embaixo e mande: o Mac abre o chat e dá nome a ele",
  "the mission": "a missão",
  "opening on the Mac…": "abrindo no Mac…",
  "your Mac is not listening right now: open the Hive there first": "seu Mac não está ouvindo agora: abra o Hive lá primeiro",
  "the chat did not open: {e}": "o chat não abriu: {e}",
  "chat opened: {n}": "chat aberto: {n}",
  "the Mac is taking its time; the chat shows up in the list when it opens": "o Mac está demorando; o chat aparece na lista quando abrir",
  "the command list arrives with the chat's first turn": "a lista de comandos chega com o primeiro turno do chat",
  "no other chat to mention": "nenhum outro chat pra mencionar",
  "searching the chat's directory…": "buscando no diretório do chat…",
  "nothing with that name in the chat's directory": "nada com esse nome no diretório do chat",
  "asking the Mac who is on the team…": "perguntando ao Mac quem está no time…",
  "nobody on the team by that name": "ninguém no time com esse nome",
  "your Mac is not listening right now": "seu Mac não está ouvindo agora",
  "up to {n} pictures in one message": "no máximo {n} imagens por mensagem",
  "that is not a picture": "isso não é uma imagem",
  "page": "página",
  "fetching from the Mac…": "buscando no Mac…",
  "the page did not come: {e}": "a página não veio: {e}",
  "this browser cannot show pages; open it on the Mac": "este navegador não mostra páginas; abra no Mac",
  "model": "modelo",
  "effort": "esforço",
  "account": "conta",
  "repo": "repositório",
  "auto": "auto",
  "default": "padrão",
  "asking the chat what it can run…": "perguntando ao chat o que ele roda…",
  "asking the Mac what it can run…": "perguntando ao Mac o que ele roda…",
  "which model": "qual modelo",
  "how hard should it think": "quanto esforço",
  "which login": "qual conta",
  "which repository": "qual repositório",
  "this model has no levels": "este modelo não tem níveis",
  "no login on the Mac for this agent": "nenhuma conta no Mac pra este agente",
  "the chat did not answer in time": "o chat não respondeu a tempo",
  "changed: {v}": "trocado: {v}",
  "the account default": "o padrão da conta",
  "which repository? (as the Mac knows it)": "qual repositório? (como o Mac conhece)"
};

let language = "en";
function pickLanguage(said) {
  const asked = String(said || "");
  if (asked) { language = asked; try { localStorage.setItem(LANGUAGE_KEY, asked); } catch {} return; }
  let kept = "";
  try { kept = localStorage.getItem(LANGUAGE_KEY) || ""; } catch {}
  language = kept || navigator.language || "en";
}
const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (m, key) => (vars && key in vars ? String(vars[key]) : m));
const t = (text, vars) => fill(/^pt/i.test(language) ? (PT_BR[text] ?? text) : text, vars);
const locale = () => (/^pt/i.test(language) ? "pt-BR" : "en-US");
const clock = (at) => new Date(at || 0).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

function paintStatic() {
  document.documentElement.lang = locale();
  for (const el of document.querySelectorAll("[data-t]")) {
    if (!el.dataset.tSource) el.dataset.tSource = el.textContent;
    el.textContent = t(el.dataset.tSource);
  }
  for (const attr of ["placeholder", "aria-label", "title"]) {
    for (const el of document.querySelectorAll(`[data-t-${attr}]`)) el.setAttribute(attr, t(el.getAttribute(`data-t-${attr}`)));
  }
}

function openDb() {
  return new Promise((done, fail) => {
    const asked = indexedDB.open(DB, 1);
    asked.onupgradeneeded = () => asked.result.createObjectStore("kept");
    asked.onsuccess = () => done(asked.result);
    asked.onerror = () => fail(asked.error);
  });
}

const MIRRORED = new Set(["identity", "seatKeys"]);
const mirrorKey = (key) => `hive-phone:${key}`;

async function idbStore() {
  let db = null;
  try { db = await openDb(); } catch {}
  const run = (mode, job) => new Promise((done, fail) => {
    if (!db) return done(undefined);
    let tx;
    try { tx = db.transaction("kept", mode); } catch (wrong) { return fail(wrong); }
    const req = job(tx.objectStore("kept"));
    req.onsuccess = () => done(req.result);
    req.onerror = () => fail(req.error);
  });
  const mirrored = (key) => { try { const held = localStorage.getItem(mirrorKey(key)); return held ? JSON.parse(held) : undefined; } catch { return undefined; } };
  return {
    async get(key) {
      let held;
      try { held = await run("readonly", (kept) => kept.get(key)); } catch {}
      if (held === undefined || held === null) held = MIRRORED.has(key) ? mirrored(key) : undefined;
      return held;
    },
    async set(key, value) {
      if (MIRRORED.has(key)) { try { localStorage.setItem(mirrorKey(key), JSON.stringify(value)); } catch {} }
      try { await run("readwrite", (kept) => kept.put(value, key)); } catch {}
    },
    async clear() {
      for (const key of MIRRORED) { try { localStorage.removeItem(mirrorKey(key)); } catch {} }
      try { await run("readwrite", (kept) => kept.clear()); } catch {}
    }
  };
}

pickLanguage();
paintStatic();

const store = await idbStore();
let device = await Device.restore({ name: "phone", store });
let shown = "";
let streamUp = false;
let attached = [];
let whereWanted = "local";
let pendingBirth = null;
let people = { at: 0, list: [], job: null };
let fileSearch = { timer: null, q: null };
let pageShown = null;
const catalogs = new Map();
let providers = { at: 0, data: null, job: null };
let draftPick = { agent: "", model: "", account: "", repo: "" };
const scrolled = new Map();
let stick = true;
let seen = {};
try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"); } catch {}
const pictures = new Map();
const wasIn = new Map();
const WANTS_KEY = "hive.phone.notices";
const NAMES_CACHE = "hive-phone-names";
const NAMES_FILE = "/phone/names.json";
let namesKept = "";
let pushArmed = "";
let arming = null;

function show(id) {
  const focused = document.activeElement;
  if (focused && focused !== document.body && !$(id).contains(focused)) focused.blur();
  const main = document.querySelector("main");
  main.scrollLeft = 0;
  main.scrollTop = 0;
  if (PUSHED.has(id)) {
    $("fleet").classList.add("on", "under");
    for (const other of PUSHED) $(other).classList.toggle("on", other === id);
    return;
  }
  for (const one of document.querySelectorAll(".screen")) one.classList.toggle("on", one.id === id);
  $("fleet").classList.remove("under");
}

const whereAmI = () => (history.state && typeof history.state === "object" ? history.state : { screen: "fleet" });

function land(state, { replace = false } = {}) {
  const url = state.screen === "seat" ? `${location.pathname}?open=${encodeURIComponent(state.id)}` : state.screen === "fleet" ? location.pathname : `${location.pathname}#${state.screen}`;
  if (replace) history.replaceState(state, "", url);
  else history.pushState(state, "", url);
}

function goBack() {
  rememberScroll();
  if (whereAmI().screen !== "fleet") history.back();
  else arrive({ screen: "fleet" });
}

function arrive(state) {
  if (state.screen === "seat" && device?.seats.has(state.id)) { paintSeat(state.id); return; }
  if (state.screen === "settings") { paintSettings(); show("settingsScreen"); return; }
  if (state.screen === "draft") { shown = ""; paintDraft(); show("draftScreen"); return; }
  if (state.screen === "page" && state.slug) { shown = ""; openPage(state.slug, state.tab, state.v, { push: false }); return; }
  shown = "";
  pageShown = null;
  paintFleet();
  show("fleet");
}

window.addEventListener("popstate", () => { rememberScroll(); arrive(whereAmI()); });

function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("on");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("toast").classList.remove("on"), 2600);
}

function profile() {
  const mine = (device?.people || []).filter((one) => one.person === device.person && one.profile?.avatar);
  const mac = mine.find((one) => one.kind === "mac") || mine[0];
  return mac?.profile || { avatar: "", wear: "", language: "" };
}

function followLanguage() {
  const said = profile().language;
  if (said && said !== language) { pickLanguage(said); paintStatic(); }
}

function paintFace() {
  const me = profile();
  const spec = (me.avatar && parseAvatar(me.avatar)) || avatarFor(device?.person || "hive");
  spec.wear = me.wear || "";
  const key = `${me.avatar}|${me.wear}|${device?.person}`;
  if ($("face").dataset.key === key) return;
  $("face").dataset.key = key;
  $("face").innerHTML = avatarSvg(spec, { size: 34, title: device?.person || "" });
}

const ago = (at) => {
  if (!at) return "";
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 50) return t("now");
  if (s < 3600) return t("{n} min", { n: Math.round(s / 60) });
  if (s < 86400) return t("{n} h", { n: Math.round(s / 3600) });
  return new Date(at).toLocaleDateString(locale(), { day: "2-digit", month: "short" });
};

function openQuestion(held) {
  let open = null;
  for (const one of held?.events || []) {
    if (one.locked) continue;
    if (one.value?.type === "question" || one.value?.type === "plan") open = one.value;
    if ((one.value?.type === "question-closed" || one.value?.type === "plan-closed") && open && open.id === one.value.id) open = null;
  }
  return open;
}

function lastAt(held) {
  return Math.max(held?.events.at(-1)?.at || 0, held?.intents.at(-1)?.at || 0);
}

function stateOf(seat, held) {
  if (seat.closedAt || !seat.online) return "asleep";
  if (openQuestion(held)) return "needs";
  const last = held?.events.filter((one) => !one.locked && one.value?.type !== "intent-done").at(-1);
  if (!last) return "working";
  if (last.value?.type === "result") return (seen[seat.id] || 0) >= last.seq ? "asleep" : "done";
  if (last.value?.type === "note" && ["exit", "slept", "interrupted"].includes(last.value.subtype)) return "asleep";
  return "working";
}

function unreadOf(seat, held) {
  const floor = seen[seat.id] || 0;
  return (held?.events || []).filter((one) => !one.locked && one.seq > floor && ["assistant", "question", "plan", "shot", "buzz"].includes(one.value?.type)).length;
}

function lastLine(held) {
  const q = openQuestion(held);
  if (q?.type === "plan") return { text: t("a plan is waiting for you"), hot: true };
  if (q) return { text: t("question: {q}", { q: q.questions?.[0]?.question || "" }), hot: true };
  const last = held?.events.filter((one) => !one.locked && ["assistant", "user", "shot", "buzz"].includes(one.value?.type)).at(-1);
  if (!last) return { text: "", hot: false };
  if (last.value.type === "shot") return { text: t("sent a picture"), hot: false };
  if (last.value.type === "buzz") return { text: last.value.text, hot: true };
  const plain = String(last.value.text || "").replace(/```[\s\S]*?```/g, " ").replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim();
  return { text: `${last.value.type === "user" ? t("you: ") : ""}${plain.slice(0, 120)}`, hot: false };
}

function runsOn(held) {
  const on = { model: "", effort: "", account: "", agent: "" };
  for (const one of held?.events || []) {
    if (one.locked) continue;
    const v = one.value || {};
    if (v.type === "system") { on.model = v.model || on.model; on.effort = v.effort || on.effort; on.agent = v.agent || on.agent; }
    if (v.type === "note" && v.subtype === "model_changed" && v.model !== undefined) on.model = v.model;
    if (v.type === "note" && v.subtype === "effort_changed" && v.level !== undefined) on.effort = v.level;
    if (v.type === "note" && v.subtype === "account_changed" && v.account !== undefined) on.account = v.account;
  }
  return on;
}

const shortModel = (value) => String(value || "").split("/").pop().replace(/^claude-/, "").slice(0, 22);

function paintPills() {
  const seat = device?.seats.get(shown);
  if (!seat) { $("pills").hidden = true; return; }
  const on = runsOn(device.replica.get(shown));
  const known = catalogs.get(shown);
  const account = on.account || known?.current?.account || "";
  $("pills").hidden = false;
  $("pillModel").textContent = on.model ? shortModel(on.model) : t("default");
  $("pillModel").title = t("model");
  $("pillEffort").textContent = on.effort || t("auto");
  $("pillEffort").title = t("effort");
  $("pillAccount").hidden = seat.runnerKind !== "mac" || !account;
  $("pillAccount").textContent = account;
  $("pillAccount").title = t("account");
}

function awaitDone(seatId, n, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const kept = device.replica.get(seatId);
    const already = kept?.events.find((one) => one.value?.type === "intent-done" && one.value.n === n);
    if (already) return already.value.ok ? resolve(already.value.reply || {}) : reject(new Error(already.value.error || "no"));
    const timer = setTimeout(() => { off(); reject(new Error(t("the chat did not answer in time"))); }, timeoutMs);
    const off = device.listen((note) => {
      if (note.kind !== "event" || note.seat !== seatId || note.value?.type !== "intent-done" || note.value.n !== n) return;
      clearTimeout(timer);
      off();
      if (note.value.ok) resolve(note.value.reply || {});
      else reject(new Error(note.value.error || "no"));
    });
  });
}

async function control(seatId, payload, timeoutMs) {
  const said = await device.intend(seatId, { type: "control", ...payload });
  paintThread();
  return awaitDone(seatId, said.n, timeoutMs);
}

async function catalogOf(seatId, refresh = false) {
  const known = catalogs.get(seatId);
  if (known && !refresh && Date.now() - known.at < 5 * 60 * 1000) return known;
  const reply = await control(seatId, { op: "catalog", ...(refresh ? { refresh: true } : {}) }, 30000);
  const held = { at: Date.now(), models: reply.models || [], current: reply.current || {}, agent: reply.agent || "" };
  catalogs.set(seatId, held);
  return held;
}

async function providerList() {
  if (providers.data && Date.now() - providers.at < 5 * 60 * 1000) return providers.data;
  if (providers.job) return providers.job;
  const mac = macOnline();
  if (!mac) throw new Error(t("your Mac is not listening right now"));
  providers.job = device.ask(mac.fingerprint, "providers", {}, { timeoutMs: 40000 }).then((said) => {
    providers = { at: Date.now(), data: said, job: null };
    return said;
  }).catch((wrong) => { providers.job = null; throw wrong; });
  return providers.job;
}

function closePicker() {
  $("picker").classList.remove("on");
}

function openPicker({ title, meta = "", items, current, none, onPick }) {
  const list = $("pickerList");
  $("pickerTitle").textContent = title;
  $("pickerMeta").textContent = meta;
  list.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "none";
    empty.textContent = none || "";
    list.appendChild(empty);
  }
  let group = null;
  for (const item of items) {
    if (item.group && item.group !== group) {
      group = item.group;
      const cap = document.createElement("div");
      cap.className = "cap grp2";
      cap.textContent = group;
      list.appendChild(cap);
    }
    const row = document.createElement("button");
    row.type = "button";
    row.className = `pk ${item.value === current ? "on" : ""}`;
    row.innerHTML = `<span></span><small></small>`;
    row.querySelector("span").textContent = item.label;
    row.querySelector("small").textContent = item.hint || "";
    row.onclick = () => { closePicker(); onPick(item.value); };
    list.appendChild(row);
  }
  $("picker").classList.add("on");
}

function pickerWaiting(title, text) {
  openPicker({ title, items: [], none: text, onPick: () => {} });
}

async function pickForSeat(kind) {
  if (!shown) return;
  const seatId = shown;
  const on = runsOn(device.replica.get(seatId));
  const titles = { model: t("which model"), effort: t("how hard should it think"), account: t("which login") };
  pickerWaiting(titles[kind], kind === "account" ? t("asking the Mac what it can run…") : t("asking the chat what it can run…"));
  try {
    if (kind === "account") {
      const [known, said] = await Promise.all([catalogOf(seatId).catch(() => null), providerList()]);
      const agent = on.agent || known?.agent || said.defaultAgent || "claude";
      const found = (said.agents || []).find((one) => one.id === agent);
      const accounts = (found?.accounts || []).filter((one) => one.loggedIn !== false).map((one) => ({ value: one.name, label: one.name }));
      if (shown !== seatId) return;
      openPicker({ title: titles.account, meta: found?.label || agent, items: accounts, current: on.account || known?.current?.account || "", none: t("no login on the Mac for this agent"), onPick: (account) => switchSeat(seatId, { op: "setAccount", account }, account) });
      return;
    }
    const known = await catalogOf(seatId);
    if (shown !== seatId) return;
    if (kind === "model") {
      const items = known.models.map((one) => ({ value: one.value, label: one.label || one.value, group: one.group || "", hint: one.value !== one.label ? one.value : "" }));
      openPicker({ title: titles.model, meta: known.agent || on.agent, items, current: on.model || known.current?.model || "", none: t("asking the chat what it can run…"), onPick: (model) => switchSeat(seatId, { op: "setModel", model }, shortModel(model)) });
      return;
    }
    const model = on.model || known.current?.model || "";
    const row = known.models.find((one) => one.value === model) || known.models.find((one) => one.isDefault);
    const levels = (row?.efforts || []).map((one) => ({ value: one, label: one, hint: one === row?.defaultEffort ? t("default") : "" }));
    openPicker({ title: titles.effort, meta: shortModel(model), items: levels, current: on.effort || known.current?.effort || "", none: t("this model has no levels"), onPick: (level) => switchSeat(seatId, { op: "setEffort", level }, level) });
  } catch (wrong) {
    closePicker();
    toast(wrong.message);
  }
}

async function switchSeat(seatId, payload, said) {
  try {
    await control(seatId, payload);
    toast(t("changed: {v}", { v: said }));
    paintPills();
  } catch (wrong) { toast(wrong.message); }
}

function draftAgent(said) {
  return draftPick.agent || said?.defaultAgent || (said?.agents || []).find((one) => one.ready)?.id || "claude";
}

function paintDraftPills(said) {
  const agent = draftAgent(said);
  const found = (said?.agents || []).find((one) => one.id === agent);
  $("draftModel").textContent = draftPick.model ? shortModel(draftPick.model) : said ? t("default") : "…";
  $("draftModel").title = t("model");
  $("draftAccount").hidden = whereWanted !== "local";
  $("draftAccount").textContent = draftPick.account || found?.accounts?.[0]?.name || (said ? t("default") : "…");
  $("draftAccount").title = t("account");
  $("draftRepo").hidden = whereWanted !== "cloud";
  $("draftRepo").textContent = draftPick.repo || t("repo");
  $("draftRepo").title = t("repo");
}

async function pickForDraft(kind) {
  if (kind === "repo") {
    const repo = window.prompt(t("which repository? (as the Mac knows it)"), draftPick.repo || "");
    if (repo !== null) { draftPick.repo = repo.trim(); paintDraftPills(providers.data); }
    return;
  }
  pickerWaiting(kind === "model" ? t("which model") : t("which login"), t("asking the Mac what it can run…"));
  try {
    const said = await providerList();
    const agent = draftAgent(said);
    const found = (said.agents || []).find((one) => one.id === agent);
    if (kind === "model") {
      const items = (said.models?.[agent] || []).map((one) => ({ value: one.value, label: one.value === "default" ? t("the account default") : one.label || one.value, group: one.group || "", hint: one.value !== one.label ? one.value : "" }));
      openPicker({ title: t("which model"), meta: found?.label || agent, items, current: draftPick.model, none: found?.why || t("asking the Mac what it can run…"), onPick: (model) => { draftPick.model = model === "default" ? "" : model; draftPick.agent = agent; paintDraftPills(said); } });
      return;
    }
    const accounts = (found?.accounts || []).filter((one) => one.loggedIn !== false).map((one) => ({ value: one.name, label: one.name }));
    openPicker({ title: t("which login"), meta: found?.label || agent, items: accounts, current: draftPick.account || accounts[0]?.value || "", none: t("no login on the Mac for this agent"), onPick: (account) => { draftPick.account = account; draftPick.agent = agent; paintDraftPills(said); } });
  } catch (wrong) {
    closePicker();
    toast(wrong.message);
  }
}

function slashOf(held) {
  let names = [];
  for (const one of held?.events || []) {
    if (one.locked) continue;
    if (one.value?.type === "system" && Array.isArray(one.value.slash)) names = one.value.slash;
    if (one.value?.type === "commands" && Array.isArray(one.value.names)) names = one.value.names;
  }
  return names;
}

function macOnline() {
  return (device?.people || []).find((one) => one.person === device.person && one.kind === "mac" && one.online && one.agreer) || null;
}

function paintHeader() {
  const seats = [...(device?.seats.values() || [])].filter((one) => !one.closedAt);
  const mine = (device?.people || []).filter((one) => one.person === device.person && one.kind !== "phone");
  const macs = mine.filter((one) => one.kind === "mac" && one.online).map((one) => one.name);
  const podUp = mine.some((one) => one.kind === "pod" && one.online);
  const online = macs.length > 0 || podUp;
  const named = macs.length ? macs.join(" + ") : t("cloud");
  $("machine").innerHTML = `<span class="dot ${online ? "" : "off"}"></span>&nbsp;${online ? (macs.length && podUp ? t("{m} online · cloud awake", { m: named }) : t("{m} online", { m: named })) : t("nothing online")}`;
  const needs = seats.filter((one) => summaryOf(one, device.replica.get(one.id)).state === "needs").length;
  const n = seats.length;
  $("fleetSub").textContent = n === 1 ? (needs ? t("1 open · 1 waiting on you") : t("1 open · nothing waiting on you")) : needs ? t("{n} open · {m} waiting on you", { n, m: needs }) : t("{n} open · nothing waiting on you", { n });
  $("offline").hidden = streamUp;
  $("offline2").hidden = streamUp;
  if (device) { followLanguage(); paintFace(); }
  if ($("draftScreen").classList.contains("on")) paintDraft();
}

const summaries = new WeakMap();

function summaryOf(seat, held) {
  const mark = `${held?.events.length}|${held?.intents.length}|${held?.lastSeq}|${held?.title}|${seen[seat.id] || 0}|${seat.online}|${seat.closedAt}|${language}`;
  const kept = held && summaries.get(held);
  if (kept?.mark === mark) return kept;
  const state = stateOf(seat, held);
  const summary = { mark, state, at: lastAt(held), line: lastLine(held), unread: state === "asleep" ? 0 : unreadOf(seat, held) };
  if (held) summaries.set(held, summary);
  return summary;
}

const keyed = (box) => new Map([...box.children].map((el) => [el.dataset.key, el]));

const FLEET_UNDER_EVERY_MS = 1500;
let paintAsked = { fleet: false, thread: false, frame: 0 };
let fleetPaintedAt = 0;

function askPaint({ fleet = false, thread = false }) {
  paintAsked.fleet ||= fleet;
  paintAsked.thread ||= thread;
  if (paintAsked.frame) return;
  paintAsked.frame = requestAnimationFrame(paintAskedNow);
}

function paintAskedNow() {
  const { fleet, thread } = paintAsked;
  paintAsked = { fleet: false, thread: false, frame: 0 };
  if (thread) paintThread();
  if (!fleet) return;
  const waited = Date.now() - fleetPaintedAt;
  if (shown && waited < FLEET_UNDER_EVERY_MS) {
    paintAsked.fleet = true;
    paintAsked.frame = setTimeout(() => { paintAsked.frame = 0; askPaint({ fleet: true }); }, FLEET_UNDER_EVERY_MS - waited);
    return;
  }
  paintFleet();
}

function paintFleet() {
  if (!device) return;
  fleetPaintedAt = Date.now();
  const list = $("list");
  const seats = [...device.seats.values()];
  $("noSeats").hidden = seats.length > 0;
  const rows = seats.map((seat) => {
    const held = device.replica.get(seat.id);
    const summary = summaryOf(seat, held);
    return { seat, held, state: summary.state, summary };
  });
  const wanted = [];
  for (const [state, label, hot] of GROUPS) {
    const mine = rows.filter((one) => one.state === state).sort((a, b) => b.summary.at - a.summary.at);
    if (!mine.length) continue;
    wanted.push({ kind: "grp", key: `g-${state}`, label: t(label), hot, n: mine.length });
    for (const one of mine) wanted.push({ kind: "row", key: `r-${one.seat.id}`, ...one });
  }
  const keep = new Set(wanted.map((one) => one.key));
  for (const el of [...list.children]) if (!keep.has(el.dataset.key)) el.remove();
  const present = keyed(list);
  let cursor = null;
  for (const item of wanted) {
    let el = present.get(item.key);
    if (!el) {
      el = document.createElement("div");
      el.dataset.key = item.key;
      if (item.kind === "grp") { el.className = "grp"; el.innerHTML = `<span class="cap"></span><span class="n"></span>`; }
      else { el.className = "row"; el.innerHTML = `<div class="ic">${IC_AGENT}</div><div class="t"></div><div class="when"><span class="ago"></span><span class="badge" hidden></span></div><div class="m"></div><div class="chip"><span class="pill"></span><span class="where"></span></div>`; el.onclick = () => openSeat(item.seat.id); }
    }
    if (cursor ? cursor.nextSibling !== el : list.firstChild !== el) list.insertBefore(el, cursor ? cursor.nextSibling : list.firstChild);
    cursor = el;
    if (item.kind === "grp") {
      el.querySelector(".cap").textContent = item.label;
      el.querySelector(".cap").classList.toggle("hot", item.hot);
      el.querySelector(".n").textContent = String(item.n);
    } else {
      const { line, unread } = item.summary;
      el.className = `row st-${item.state} ${item.state === "needs" ? "needs" : ""} ${item.state === "asleep" ? "asleep" : ""}`;
      el.querySelector(".t").textContent = item.held?.title || item.seat.id;
      el.querySelector(".ago").textContent = ago(item.summary.at);
      const badge = el.querySelector(".badge");
      badge.hidden = !unread;
      badge.textContent = unread > 99 ? "99+" : String(unread);
      el.querySelector(".m").textContent = line.text || t("no recent message");
      el.querySelector(".m").classList.toggle("q", line.hot);
      const pill = el.querySelector(".pill");
      pill.textContent = item.seat.closedAt ? t("closed") : t(PILL[item.state]);
      pill.className = `pill ${item.state}`;
      el.querySelector(".where").textContent = t(WHERE[item.seat.runnerKind] || "");
    }
  }
  paintHeader();
  notifyTurns(rows);
}

function notifyTurns(rows) {
  for (const one of rows) {
    const was = wasIn.get(one.seat.id) || "";
    const now = one.state;
    wasIn.set(one.seat.id, now);
    if (was === now || !wasIn.armed) continue;
    if (now === "needs") buzz(one.held?.title || one.seat.id, one.summary.line.text, one.seat.id);
    if (now === "done" && wants().done) buzz(one.held?.title || one.seat.id, one.summary.line.text || t("it ended its turn"), one.seat.id);
  }
  wasIn.armed = true;
  keepNamesForTheWorker(rows);
}

function wants() {
  let held;
  try { held = JSON.parse(localStorage.getItem(WANTS_KEY) || "null"); } catch {}
  return { needs: true, done: held?.done !== false };
}

function keepWants(next) {
  try { localStorage.setItem(WANTS_KEY, JSON.stringify(next)); } catch {}
}

async function keepNamesForTheWorker(rows) {
  if (!self.caches) return;
  const names = Object.fromEntries(rows.map((one) => [one.seat.id, one.held?.title || one.seat.id]));
  const body = JSON.stringify({ names, words: { chat: t("a chat"), done: t("it ended its turn"), needs: t("it is waiting on you"), more: t("and {n} other chats came back") } });
  if (body === namesKept) return;
  namesKept = body;
  try {
    const cache = await caches.open(NAMES_CACHE);
    await cache.put(new Request(NAMES_FILE), new Response(body, { headers: { "content-type": "application/json" } }));
  } catch {}
}

const keyBytes = (text) => {
  const padded = String(text).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) out[at] = binary.charCodeAt(at);
  return out;
};

const b64Of = (buffer) => {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function armNotices() {
  if (!arming) arming = reallyArmNotices().finally(() => { arming = null; });
  return arming;
}

async function reallyArmNotices() {
  pushArmed = "";
  if (!device?.paired || !("Notification" in window) || Notification.permission !== "granted") return;
  const registration = (await navigator.serviceWorker?.getRegistration("/phone/")) || (await navigator.serviceWorker?.ready);
  if (!registration?.pushManager) return;
  try {
    const { key } = await device.noticesKey();
    const held = (await registration.pushManager.getSubscription()) || (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
    await device.takeNotices({ endpoint: held.endpoint, p256dh: b64Of(held.getKey("p256dh")), auth: b64Of(held.getKey("auth")) }, wants());
    pushArmed = "on";
  } catch (wrong) {
    pushArmed = "off";
    console.log("notices failed:", wrong.message);
  }
  paintSettings();
}

async function buzz(title, body, seat) {
  if (!("Notification" in window) || Notification.permission !== "granted" || document.visibilityState === "visible") return;
  try {
    const registration = await navigator.serviceWorker?.getRegistration("/phone/");
    if (registration) await registration.showNotification(title, { body, tag: `seat-${seat}`, data: { seat }, icon: "/phone/icon-180.png", badge: "/phone/icon-180.png" });
    else new Notification(title, { body, tag: `seat-${seat}` });
  } catch {}
}

async function pictureUrl(seatId, blobId, mime) {
  const key = `${seatId}/${blobId}`;
  if (pictures.has(key)) return pictures.get(key);
  const job = device.getBlob(seatId, blobId).then((bytes) => (bytes ? URL.createObjectURL(new Blob([bytes], { type: mime || "image/png" })) : "")).catch(() => "");
  pictures.set(key, job);
  return job;
}

const sameText = (a, b) => String(a || "").trim().replace(/\s+/g, " ") === String(b || "").trim().replace(/\s+/g, " ");
const withoutShots = (text) => String(text || "").replace(/(\s\/\S+celular-\d+(?:-\d+)?\.\w+)+$/, "");
const picturesOf = (intent) => [...(Array.isArray(intent?.images) ? intent.images : []), ...(intent?.image?.id ? [intent.image] : [])].filter((one) => one?.id);

function rowsOf(held) {
  const events = (held?.events || []).map((one) => ({ ...one, lane: "events" }));
  const intents = (held?.intents || []).map((one) => ({ ...one, lane: "intents" }));
  const done = new Set(events.filter((one) => one.value?.type === "intent-done").map((one) => one.value.n));
  const echoes = events.filter((one) => one.value?.type === "user" && !one.value.from);
  const landed = new Set();
  const taken = new Set();
  for (const intent of intents) {
    if (intent.intent?.type !== "say") continue;
    const echoed = echoes.find((one) => !taken.has(one) && one.at >= (intent.at || 0) - 2000 && sameText(withoutShots(one.value.text), intent.intent.text));
    if (!echoed) continue;
    taken.add(echoed);
    echoed.said = intent.mine ? "here" : "other";
    echoed.pictures = picturesOf(intent.intent);
    landed.add(`${intent.by}:${intent.seq}`);
  }
  return [...events, ...intents.map((one) => ({ ...one, landed: landed.has(`${one.by}:${one.seq}`), done: done.has(one.n) }))].sort((a, b) => (a.at || 0) - (b.at || 0));
}

function paintThread() {
  if (!shown) return;
  const held = device.replica.get(shown);
  const seat = device.seats.get(shown);
  const thread = $("thread");
  const rows = rowsOf(held);
  const answered = new Set(rows.filter((one) => one.value?.type === "question-closed" || one.value?.type === "plan-closed").map((one) => one.value.id));
  const nodes = [];
  if (held?.gapBefore) nodes.push({ key: "gap", kind: "note", text: t("the start of this conversation stayed on the Mac: only what happened after it arrives here") });
  let steps = null;
  const flush = () => { if (steps) { nodes.push(steps); steps = null; } };
  for (const row of rows) {
    if (row.lane === "events" && !row.locked && row.value?.type === "tool") {
      steps = steps || { key: `steps-${row.seq}`, kind: "steps", items: [] };
      steps.items.push(row.value);
      continue;
    }
    if (row.lane === "intents" && row.intent?.type === "control") continue;
    if (row.lane === "events" && !row.locked && ["result", "system", "commands", "question-closed", "intent-done"].includes(row.value?.type)) {
      if (row.value.type === "result") { flush(); nodes.push({ key: `e-${row.seq}`, kind: "note", text: row.value.error ? t("the turn ended with an error: {e}", { e: row.value.error }) : `${t("turn finished")}${row.value.cost ? ` · $${row.value.cost.toFixed(2)}` : ""}`, bad: !!row.value.error }); }
      if (row.value.type === "intent-done" && row.value.ok === false) { flush(); nodes.push({ key: `e-${row.seq}`, kind: "note", text: t("the chat did not take it: {e}", { e: row.value.error }), bad: true }); }
      continue;
    }
    if (row.lane === "intents" && row.landed) continue;
    flush();
    nodes.push({ key: row.lane === "intents" ? `i-${row.by}-${row.seq}` : `e-${row.seq}`, kind: "row", row, answered });
  }
  flush();
  const keep = new Set(nodes.map((one) => one.key));
  for (const el of [...thread.children]) if (!keep.has(el.dataset.key)) el.remove();
  const present = keyed(thread);
  let cursor = null;
  for (const node of nodes) {
    let el = present.get(node.key);
    if (!el) { el = renderNode(node); el.dataset.key = node.key; }
    else if (node.kind === "steps") updateSteps(el, node);
    else if (node.kind === "row" && (node.row.value?.type === "question" || node.row.value?.type === "plan")) el.classList.toggle("closed", node.answered.has(node.row.value.id));
    else if (node.kind === "row" && node.row.lane === "intents") el.classList.toggle("waiting", !node.row.done);
    if (cursor ? cursor.nextSibling !== el : thread.firstChild !== el) thread.insertBefore(el, cursor ? cursor.nextSibling : thread.firstChild);
    cursor = el;
  }
  if (stick) thread.scrollTop = thread.scrollHeight;
  paintToBottom();
  const working = seat && !seat.closedAt && seat.online && stateOf(seat, held) === "working";
  $("stop").classList.toggle("on", !!working);
  $("seatMeta").textContent = seat?.closedAt ? t("closed") : `${t(WHERE[seat?.runnerKind] || "Mac")} · ${seat?.online ? t("online") : t("away")}`;
  const last = held?.events.at(-1)?.seq || 0;
  if (last && (seen[shown] || 0) < last) { seen[shown] = last; try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch {} }
  paintPills();
}

function paintToBottom() {
  const thread = $("thread");
  $("toBottom").classList.toggle("on", thread.scrollHeight - thread.scrollTop - thread.clientHeight > 220);
}

let handOnThread = 0;
const handOn = (ms) => { handOnThread = Date.now() + ms; };

function followScroll() {
  const thread = $("thread");
  paintToBottom();
  if (Date.now() > handOnThread) { if (stick) toTheEnd(); return; }
  stick = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
}

function updateSteps(el, node) {
  const names = [...new Set(node.items.map((one) => one.name))].slice(0, 4).join(" · ");
  el.querySelector("b").textContent = node.items.length === 1 ? t("1 step") : t("{n} steps", { n: node.items.length });
  el.querySelector(".names").textContent = names;
  el.querySelector(".all").textContent = node.items.map((one) => `${one.name} ${one.target || ""}`.trim()).join("\n");
}

function whoLine(text, at) {
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = `${text} · ${clock(at)}`;
  return who;
}

function picturesInto(div, seatId, list) {
  if (!list.length) return;
  const pics = document.createElement("div");
  pics.className = "pics";
  for (const one of list) {
    const img = document.createElement("img");
    pictureUrl(seatId, one.id, one.mime).then((url) => { if (url) img.src = url; else img.remove(); });
    pics.appendChild(img);
  }
  div.appendChild(pics);
}

function renderNode(node) {
  const div = document.createElement("div");
  if (node.kind === "note") { div.className = `note ${node.bad ? "bad" : ""}`; div.textContent = node.text; return div; }
  if (node.kind === "steps") {
    div.className = "steps";
    div.innerHTML = `<b></b><span class="names"></span><span class="more"></span><span class="all"></span>`;
    div.querySelector(".more").textContent = t("see");
    div.onclick = () => { div.classList.toggle("open"); div.querySelector(".more").textContent = div.classList.contains("open") ? t("close") : t("see"); };
    updateSteps(div, node);
    return div;
  }
  const row = node.row;
  if (row.locked) { div.className = "note"; div.textContent = t("a message sealed with a key this device does not have"); return div; }
  const v = row.lane === "intents" ? (row.intent || {}) : (row.value || {});
  if (row.lane === "intents") {
    div.className = `bub me ${row.done ? "" : "waiting"}`;
    if (v.type === "interrupt") { div.className = "note"; div.textContent = `${t("asked it to stop")} · ${clock(row.at)}`; return div; }
    div.textContent = v.text ?? (v.type === "answer" ? Object.values(v.answers || {}).join(", ") : JSON.stringify(v));
    picturesInto(div, shown, picturesOf(v));
    div.appendChild(whoLine(row.mine ? t("you, from here") : t("another device of yours"), row.at));
    return div;
  }
  if (v.type === "note") { div.className = `note ${["error", "warning", "exit"].includes(v.subtype) ? "warn" : ""}`; div.textContent = v.text; return div; }
  if (v.type === "buzz") { div.className = "note bad"; div.textContent = t("the chat called: {t}", { t: v.text }); return div; }
  if (v.type === "user") {
    div.className = "bub me";
    div.textContent = row.said ? withoutShots(v.text) : v.text;
    picturesInto(div, shown, row.pictures || []);
    div.appendChild(whoLine(v.from ? v.from : row.said === "here" ? t("you, from here") : row.said === "other" ? t("another device of yours") : t("you, from the Mac"), row.at));
    return div;
  }
  if (v.type === "shot") {
    div.className = "shotbub";
    const img = document.createElement("img");
    img.alt = v.name || "";
    pictureUrl(shown, v.blob, v.mime).then((url) => { if (url) img.src = url; else img.replaceWith(Object.assign(document.createElement("span"), { className: "who", textContent: t("a picture this device cannot open") })); });
    div.appendChild(img);
    div.appendChild(whoLine(`${t("the chat showed")}${v.name ? ` · ${v.name}` : ""}`, row.at));
    return div;
  }
  if (v.type === "plan") {
    div.className = `qcard plan ${node.answered.has(v.id) ? "closed" : ""}`;
    const box = document.createElement("div");
    box.innerHTML = `<div class="qh"><span class="cap"></span><span class="cap" style="margin-left:auto"></span></div><div class="qt md"></div><div class="opts"></div>`;
    box.querySelectorAll(".cap")[0].textContent = t("plan");
    box.querySelectorAll(".cap")[1].textContent = t("waiting for you");
    box.querySelector(".qt").innerHTML = renderMarkdown(v.plan || "");
    const go = document.createElement("button");
    go.type = "button";
    go.className = "opt rec";
    go.innerHTML = `<span class="lbl"></span><small></small>`;
    go.querySelector(".lbl").textContent = t("approve and open");
    go.querySelector("small").textContent = t("the chats it describes are opened; nothing runs before that");
    go.onclick = () => {
      go.classList.add("picked");
      device.intend(shown, { type: "answer", id: v.id, answers: { plan: "go" } }).then(paintThread).catch((wrong) => toast(wrong.message));
    };
    box.querySelector(".opts").appendChild(go);
    div.appendChild(box);
    const other = document.createElement("div");
    other.className = "other";
    other.textContent = t("to change the plan: write it below");
    div.appendChild(other);
    return div;
  }
  if (v.type === "question") {
    div.className = `qcard ${node.answered.has(v.id) ? "closed" : ""}`;
    const qs = v.questions || [];
    qs.forEach((q, at) => {
      const box = document.createElement("div");
      box.innerHTML = `<div class="qh"><span class="cap"></span><span class="cap" style="margin-left:auto"></span></div><div class="qt"></div><div class="opts"></div>`;
      box.querySelectorAll(".cap")[0].textContent = t("question");
      box.querySelectorAll(".cap")[1].textContent = t("{a} of {b}", { a: at + 1, b: qs.length });
      box.querySelector(".qt").textContent = q.question;
      for (const o of q.options || []) {
        const b = document.createElement("button");
        b.type = "button";
        const rec = /recommended|recomendad/i.test(o.label);
        b.className = `opt ${rec ? "rec" : ""}`;
        b.innerHTML = `${rec ? '<span class="tag"></span>' : ""}<span class="lbl"></span><small></small>`;
        if (rec) b.querySelector(".tag").textContent = t("recommended");
        b.querySelector(".lbl").textContent = o.label.replace(/\s*\((Recommended|Recomendad[oa])\)\s*/i, "");
        b.querySelector("small").textContent = o.description || "";
        b.onclick = () => {
          for (const other of box.querySelectorAll(".opt")) other.classList.remove("picked");
          b.classList.add("picked");
          device.intend(shown, { type: "answer", id: v.id, answers: { [q.question]: o.label } }).then(paintThread).catch((wrong) => toast(wrong.message));
        };
        box.querySelector(".opts").appendChild(b);
      }
      div.appendChild(box);
    });
    const other = document.createElement("div");
    other.className = "other";
    other.textContent = t("another answer: write it below");
    div.appendChild(other);
    return div;
  }
  if (v.type === "assistant") {
    div.className = "bub md";
    div.innerHTML = renderMarkdown(v.text || "");
    for (const copy of div.querySelectorAll(".md-copy")) {
      copy.textContent = t("copy");
      copy.onclick = (event) => { event.stopPropagation(); navigator.clipboard?.writeText(copy.parentElement.querySelector("pre")?.textContent || "").then(() => toast(t("copied"))); };
    }
    for (const link of div.querySelectorAll("a.md-shelf")) { link.onclick = (event) => { event.preventDefault(); openPage(link.dataset.slug, link.dataset.tab, Number(link.dataset.v) || 0); }; }
    for (const link of div.querySelectorAll("a.md-shot")) { link.onclick = (event) => { event.preventDefault(); toast(t("that opens on the Mac")); }; }
    div.appendChild(whoLine(t("agent"), row.at));
    return div;
  }
  div.className = "bub";
  div.textContent = v.text ?? JSON.stringify(v);
  div.appendChild(whoLine(t("agent"), row.at));
  return div;
}

function rememberScroll() {
  if (!shown) return;
  const thread = $("thread");
  const atBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
  scrolled.set(shown, { top: thread.scrollTop, atBottom });
}

function toTheEnd() {
  const thread = $("thread");
  thread.scrollTop = thread.scrollHeight;
  paintToBottom();
}

function settleScroll(id) {
  const thread = $("thread");
  const kept = scrolled.get(id);
  stick = !kept || kept.atBottom;
  const place = () => {
    if (shown !== id) return;
    if (stick) toTheEnd();
    else { thread.scrollTop = kept.top; paintToBottom(); }
  };
  place();
  requestAnimationFrame(() => requestAnimationFrame(place));
  for (const wait of [80, 250, 600, 1200]) setTimeout(place, wait);
  for (const img of thread.querySelectorAll("img")) img.addEventListener("load", () => { if (stick) toTheEnd(); }, { once: true });
}

function paintSeat(id) {
  if (shown && shown !== id) { rememberScroll(); keepShownDraft({ now: true }); }
  shown = id;
  const held = device.replica.get(id);
  $("seatTitle").textContent = held?.title || id;
  $("peek").classList.remove("on");
  $("thread").innerHTML = "";
  show("seatScreen");
  paintThread();
  settleScroll(id);
  fillDraft(id);
  paintPills();
}

function paintBox() {
  $("box").classList.toggle("blank", !$("typed").value.trim() && !attached.length);
  $("draftBox").classList.toggle("blank", !$("draftTyped").value.trim());
}

function openSeat(id, { replace = false } = {}) {
  const here = whereAmI();
  if (here.screen === "seat" && here.id === id) { paintSeat(id); return; }
  land({ screen: "seat", id }, { replace: replace || here.screen === "seat" });
  paintSeat(id);
}

function paintDraft() {
  const mac = macOnline();
  $("draftMeta").textContent = mac ? `${mac.name} · ${t("online")}` : t("your Mac is not listening right now: open the Hive there first");
  $("whereMac").classList.toggle("on", whereWanted === "local");
  $("whereCloud").classList.toggle("on", whereWanted === "cloud");
  paintDraftPills(providers.data);
}

function openDraft() {
  land({ screen: "draft" });
  shown = "";
  paintDraft();
  paintDraftPills(providers.data);
  providerList().then((said) => paintDraftPills(said)).catch(() => {});
  show("draftScreen");
  setTimeout(() => $("draftTyped").focus(), 340);
}

function draftNote(text, bad = false) {
  const note = document.createElement("div");
  note.className = `note ${bad ? "bad" : ""}`;
  note.textContent = text;
  $("draftThread").appendChild(note);
  $("draftThread").scrollTop = $("draftThread").scrollHeight;
  return note;
}

function restDraft() {
  $("draftSend").disabled = false;
  $("draftTyped").disabled = false;
}

function openWhenItLands(name) {
  if (!name) return;
  const open = () => openSeat(name, { replace: whereAmI().screen === "draft" });
  if (device.seats.has(name)) { open(); return; }
  const until = Date.now() + 120000;
  const once = device.listen(() => {
    if (device.seats.has(name)) { once(); open(); }
    else if (Date.now() > until) once();
  });
}

function landBirth(note) {
  const pending = pendingBirth;
  if (!pending || note.id !== pending.id) return;
  clearTimeout(pending.timer);
  pendingBirth = null;
  restDraft();
  if (note.error) {
    draftNote(t("the chat did not open: {e}", { e: note.error }), true);
    if (!$("draftScreen").classList.contains("on")) toast(t("the chat did not open: {e}", { e: note.error }));
    return;
  }
  toast(t("chat opened: {n}", { n: note.name }));
  openWhenItLands(note.name);
}

const pageId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())).replace(/[^a-z0-9-]/gi, "");

function holdPage(id, html) {
  return new Promise((done) => {
    const worker = navigator.serviceWorker?.controller;
    if (!worker) return done(false);
    const channel = new MessageChannel();
    const timer = setTimeout(() => done(false), 1500);
    channel.port1.onmessage = () => { clearTimeout(timer); done(true); };
    const onSaid = (event) => { if (event.data?.kept === id) { clearTimeout(timer); navigator.serviceWorker.removeEventListener("message", onSaid); done(true); } };
    navigator.serviceWorker.addEventListener("message", onSaid);
    worker.postMessage({ page: { id, html } });
  });
}

async function openPage(slug, tab, v, { push = true } = {}) {
  const wanted = { screen: "page", slug: String(slug || ""), tab: String(tab || "documento"), v: Number(v) || 0 };
  if (push) land(wanted);
  pageShown = wanted;
  shown = "";
  $("pageTitle").textContent = wanted.slug.replace(/-/g, " ");
  $("pageMeta").textContent = `${t("page")} · ${wanted.tab}${wanted.v ? ` · v${wanted.v}` : ""}`;
  const note = $("pageNote");
  const frame = $("pageFrame");
  frame.removeAttribute("src");
  frame.removeAttribute("srcdoc");
  note.hidden = false;
  note.className = "pagenote";
  note.textContent = t("fetching from the Mac…");
  show("pageScreen");
  const mac = macOnline();
  if (!mac) { note.className = "pagenote bad"; note.textContent = t("your Mac is not listening right now: open the Hive there first"); return; }
  try {
    const page = await device.ask(mac.fingerprint, "shelf", { slug: wanted.slug, tab: wanted.tab, v: wanted.v }, { timeoutMs: PAGE_WAIT_MS });
    if (pageShown !== wanted) return;
    const id = pageId();
    const held = await holdPage(id, page.html);
    if (pageShown !== wanted) return;
    if (held) { frame.setAttribute("sandbox", "allow-scripts allow-forms"); frame.removeAttribute("sandbox"); frame.src = `/phone/page/${id}`; }
    else { frame.setAttribute("sandbox", "allow-scripts"); frame.srcdoc = page.html; }
    note.hidden = true;
  } catch (wrong) {
    if (pageShown !== wanted) return;
    note.className = "pagenote bad";
    note.textContent = t("the page did not come: {e}", { e: wrong.message });
  }
}

function attach() {
  device.listen((note) => {
    if (note.kind === "state") { streamUp = note.up; paintHeader(); }
    if (note.kind === "revoked") { toast(t("this device was taken out of the Hive on the Mac")); }
    if (note.kind === "seat-reborn" && note.seat === shown) { $("thread").innerHTML = ""; }
    if (note.kind === "seat-gone" && note.seat === shown) { shown = ""; if (whereAmI().screen === "seat") history.back(); else show("fleet"); }
    if (note.kind === "birth-done") landBirth(note);
    if (note.kind === "draft") soakDraft(note);
    if (["event", "intent", "caught-up", "seat", "seat-gone", "seat-reborn", "presence", "roster"].includes(note.kind)) askPaint({ fleet: true, thread: !!shown && (!note.seat || note.seat === shown) });
  });
}

async function shrink(file) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((done, fail) => { const i = new Image(); i.onload = () => done(i); i.onerror = fail; i.src = url; });
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.85));
  URL.revokeObjectURL(url);
  return { bytes: new Uint8Array(await blob.arrayBuffer()), preview: URL.createObjectURL(blob) };
}

function paintTray() {
  const tray = $("tray");
  tray.hidden = !attached.length;
  tray.innerHTML = "";
  attached.forEach((one, at) => {
    const th = document.createElement("div");
    th.className = "th";
    const img = document.createElement("img");
    img.src = one.preview;
    const drop = document.createElement("button");
    drop.type = "button";
    drop.setAttribute("aria-label", t("remove"));
    drop.textContent = "×";
    drop.onclick = () => { URL.revokeObjectURL(one.preview); attached.splice(at, 1); paintTray(); };
    th.append(img, drop);
    tray.appendChild(th);
  });
  fitCompose();
  paintBox();
}

async function addPictures(files) {
  const list = [...(files || [])].filter((one) => one && one.type?.startsWith("image/"));
  if (!list.length) { if (files?.length) toast(t("that is not a picture")); return; }
  for (const file of list) {
    if (attached.length >= PICTURES_CEILING) { toast(t("up to {n} pictures in one message", { n: PICTURES_CEILING })); break; }
    try { attached.push(await shrink(file)); } catch {}
  }
  paintTray();
}

function fitCompose() {
  document.documentElement.style.setProperty("--compose-h", `${$("compose").offsetHeight}px`);
}

async function peopleList() {
  if (Date.now() - people.at < PEOPLE_FRESH_MS) return people.list;
  if (people.job) return people.job;
  const mac = macOnline();
  if (!mac) throw new Error(t("your Mac is not listening right now"));
  people.job = device.ask(mac.fingerprint, "people", {}, { timeoutMs: 8000 }).then((said) => {
    people = { at: Date.now(), list: (said.people || []).filter((one) => one.name && !one.mine), job: null };
    return people.list;
  }).catch((wrong) => { people.job = null; throw wrong; });
  return people.job;
}

function chipsInto(box, mark, items, start, before, hints = {}) {
  const typed = $("typed");
  box.innerHTML = "";
  for (const item of items.slice(0, 30)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "sg";
    chip.innerHTML = `<b></b><span></span><small></small>`;
    chip.querySelector("b").textContent = mark;
    chip.querySelector("span").textContent = mark === "@" ? item.split("/").slice(-2).join("/") : item;
    chip.querySelector("small").textContent = hints[item] || "";
    chip.onclick = () => {
      const after = typed.value.slice(before.length);
      typed.value = `${typed.value.slice(0, start)}${mark}${item} ${after}`;
      const caret = start + mark.length + item.length + 1;
      typed.focus();
      typed.setSelectionRange(caret, caret);
      growTyped();
      paintSuggest();
    };
    box.appendChild(chip);
  }
}

function noneChip(box, text) {
  box.innerHTML = "";
  const chip = document.createElement("span");
  chip.className = "sg none";
  chip.textContent = text;
  box.appendChild(chip);
}

function paintSuggest() {
  const box = $("suggest");
  const typed = $("typed");
  const before = typed.value.slice(0, typed.selectionStart ?? typed.value.length);
  const slash = before.match(/(^|\s)\/([\w:-]*)$/);
  const hash = before.match(/(^|[\s([{'"])#([\w.-]*)$/);
  const at = before.match(/(^|[\s([{'"])@([\w./~-]*)$/);
  const tilde = before.match(/(^|[\s([{'"])~([a-z0-9-]*)$/i);
  const found = slash || hash || at || tilde;
  if (!found) { box.hidden = true; box.innerHTML = ""; fileSearch.q = null; return; }
  const q = found[2];
  const mark = slash ? "/" : hash ? "#" : at ? "@" : "~";
  const start = before.length - q.length - 1;
  box.hidden = false;
  if (slash) {
    const items = slashOf(device.replica.get(shown)).filter((one) => one.startsWith(q));
    return items.length ? chipsInto(box, mark, items, start, before) : noneChip(box, t("the command list arrives with the chat's first turn"));
  }
  if (hash) {
    const items = [...device.seats.keys()].filter((one) => one !== shown && one.startsWith(q));
    return items.length ? chipsInto(box, mark, items, start, before) : noneChip(box, t("no other chat to mention"));
  }
  if (tilde) {
    const paint = (list) => {
      const items = list.filter((one) => one.name.startsWith(q.toLowerCase()));
      const hints = Object.fromEntries(list.map((one) => [one.name, one.up ? t("online") : t("away")]));
      return items.length ? chipsInto(box, mark, items.map((one) => one.name), start, before, hints) : noneChip(box, t("nobody on the team by that name"));
    };
    if (Date.now() - people.at < PEOPLE_FRESH_MS) return paint(people.list);
    noneChip(box, t("asking the Mac who is on the team…"));
    peopleList().then((list) => { if (!box.hidden && $("typed").value.slice(0, $("typed").selectionStart ?? undefined).endsWith(`~${q}`)) paint(list); }).catch((wrong) => noneChip(box, wrong.message));
    return;
  }
  if (fileSearch.q === q && box.children.length) return;
  fileSearch.q = q;
  noneChip(box, t("searching the chat's directory…"));
  clearTimeout(fileSearch.timer);
  fileSearch.timer = setTimeout(async () => {
    const mac = macOnline();
    if (!mac) return noneChip(box, t("your Mac is not listening right now"));
    const seat = device.seats.get(shown);
    try {
      const said = await device.ask(mac.fingerprint, "files", { seat: shown, where: seat?.runnerKind === "pod" ? "cloud" : "local", q }, { timeoutMs: 8000 });
      if (fileSearch.q !== q) return;
      const items = (said.files || []).map((one) => (typeof one === "string" ? one : one?.path || one?.file || "")).filter(Boolean);
      return items.length ? chipsInto(box, mark, items, start, before) : noneChip(box, said.error || t("nothing with that name in the chat's directory"));
    } catch (wrong) { if (fileSearch.q === q) noneChip(box, wrong.message); }
  }, 220);
}

const KEEP_DRAFT_AFTER = 400;

let draftWaiting = null;

let draftKept = { seat: "", text: "", at: 0 };

function sendDraft(seat, text) {
  const at = Date.now();
  draftKept = { seat, text, at };
  device.putDraft(seat, text, at).catch(() => {});
}

function keepDraft(seat, text, { now = false } = {}) {
  if (!seat) return;
  clearTimeout(draftWaiting?.timer);
  draftWaiting = null;
  if (draftKept.seat === seat && draftKept.text === text) return;
  if (now) return void sendDraft(seat, text);
  draftWaiting = { seat, timer: setTimeout(() => { draftWaiting = null; sendDraft(seat, text); }, KEEP_DRAFT_AFTER) };
}

function keepShownDraft(options = {}) {
  if (shown) keepDraft(shown, $("typed").value, options);
}

function fillDraft(seat) {
  if (draftWaiting?.seat === seat) return;
  const said = device.replica.get(seat)?.draft || "";
  draftKept = { seat, text: said, at: Number(device.replica.get(seat)?.draftAt) || 0 };
  $("typed").value = said;
  growTyped();
  paintSuggest();
  paintBox();
}

function soakDraft(note) {
  if (note.seat !== shown || note.mine || note.text === $("typed").value) return;
  fillDraft(note.seat);
}

function growTyped() {
  const box = $("typed");
  box.style.height = "auto";
  box.style.height = `${Math.min(140, box.scrollHeight)}px`;
  fitCompose();
}

function swipeBack(el, onDone) {
  let startX = 0;
  let startY = 0;
  let dx = 0;
  let live = false;
  let decided = false;
  const fleet = $("fleet");
  el.addEventListener("touchstart", (event) => {
    const touch = event.touches[0];
    live = touch.clientX <= SWIPE_EDGE && el.classList.contains("on");
    decided = false;
    dx = 0;
    startX = touch.clientX;
    startY = touch.clientY;
  }, { passive: true });
  el.addEventListener("touchmove", (event) => {
    if (!live) return;
    const touch = event.touches[0];
    const moveX = touch.clientX - startX;
    const moveY = touch.clientY - startY;
    if (!decided) {
      if (Math.abs(moveX) < 8 && Math.abs(moveY) < 8) return;
      decided = true;
      if (Math.abs(moveY) > Math.abs(moveX) || moveX < 0) { live = false; return; }
      el.classList.add("dragging");
      fleet.classList.add("dragging");
    }
    dx = Math.max(0, moveX);
    el.style.transform = `translateX(${dx}px)`;
    const share = Math.min(1, dx / el.clientWidth);
    fleet.style.transform = `translateX(${-18 + share * 18}%)`;
    fleet.style.opacity = String(0.55 + share * 0.45);
  }, { passive: true });
  const end = () => {
    if (!live) return;
    live = false;
    el.classList.remove("dragging");
    fleet.classList.remove("dragging");
    el.style.transform = "";
    fleet.style.transform = "";
    fleet.style.opacity = "";
    if (dx > SWIPE_DONE) onDone();
  };
  el.addEventListener("touchend", end, { passive: true });
  el.addEventListener("touchcancel", end, { passive: true });
}

function paintSettings() {
  $("setPerson").textContent = `${device.name} · ${device.person}`;
  $("setHost").textContent = device.host.replace(/\/sync$/, "");
  $("setKey").textContent = device.fingerprint;
  $("setWhy").hidden = streamUp || !device.lastStreamWhy;
  $("setWhy").textContent = streamUp ? "" : device.lastStreamWhy || "";
  $("notify").textContent = !("Notification" in window) ? t("this browser does not give notices") : Notification.permission === "granted" ? t("notices on") : Notification.permission === "denied" ? t("notices blocked by the system") : t("let it tell me");
  $("notify").disabled = !("Notification" in window) || Notification.permission !== "default";
  const on = "Notification" in window && Notification.permission === "granted";
  $("notifyWhen").hidden = !on;
  $("notifyWhy").textContent = !on ? "" : pushArmed === "on" ? t("it rings with the app closed") : pushArmed === "off" ? t("it only rings while this page is open: add the Hive to the home screen") : "";
  $("notifyBoth").classList.toggle("on", wants().done);
  $("notifyAsked").classList.toggle("on", !wants().done);
}

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get("forget")) { await store.clear(); device = null; }
  if (!device && params.get("code")) {
    device = await Device.create({ name: params.get("name") || "iPhone", store });
    try { await device.pair(HOST, params.get("code")); history.replaceState(null, "", location.pathname); }
    catch (wrong) { $("pairWhy").textContent = wrong.message; $("code").value = params.get("code"); device = null; }
  }
  if (!device?.paired) { show("pair"); return; }
  history.replaceState({ screen: "fleet" }, "", location.pathname);
  show("fleet");
  try { await device.sync(); } catch (wrong) { console.log("sync failed:", wrong.message); }
  paintFleet();
  const wanted = params.get("open");
  if (wanted && device.seats.has(wanted)) openSeat(wanted);
  attach();
  armNotices();
  if (wanted && !device.seats.has(wanted)) {
    const once = device.listen((note) => { if ((note.kind === "seat" || note.kind === "caught-up") && device.seats.has(wanted) && !shown) { openSeat(wanted); once(); } });
  }
}

$("pairForm").onsubmit = async (event) => {
  event.preventDefault();
  $("pairBtn").disabled = true;
  try {
    device = await Device.create({ name: $("name").value.trim() || "iPhone", store });
    await device.pair(HOST, $("code").value.trim());
    history.replaceState({ screen: "fleet" }, "", location.pathname);
    show("fleet");
    await device.sync();
    paintFleet();
    attach();
  } catch (wrong) { $("pairWhy").textContent = wrong.message; device = null; }
  finally { $("pairBtn").disabled = false; }
};

$("back").onclick = goBack;
$("settingsBack").onclick = goBack;
$("draftBack").onclick = goBack;
$("pageBack").onclick = goBack;
$("face").onclick = () => { paintSettings(); land({ screen: "settings" }); show("settingsScreen"); };
$("notify").onclick = async () => { try { await Notification.requestPermission(); } catch {} paintSettings(); armNotices(); };
$("notifyBoth").onclick = () => { keepWants({ needs: true, done: true }); paintSettings(); armNotices(); };
$("notifyAsked").onclick = () => { keepWants({ needs: true, done: false }); paintSettings(); armNotices(); };
$("forget").onclick = async () => {
  if (!window.confirm(t("erase the keys and the chats from this device?"))) return;
  device?.stream?.stop();
  await store.clear();
  location.replace(location.pathname);
};

for (const id of PUSHED) swipeBack($(id), goBack);

$("newChat").onclick = openDraft;
$("pillModel").onclick = () => pickForSeat("model");
$("pillEffort").onclick = () => pickForSeat("effort");
$("pillAccount").onclick = () => pickForSeat("account");
$("draftModel").onclick = () => pickForDraft("model");
$("draftAccount").onclick = () => pickForDraft("account");
$("draftRepo").onclick = () => pickForDraft("repo");
$("pickerBackdrop").onclick = closePicker;
$("whereMac").onclick = () => { whereWanted = "local"; paintDraft(); };
$("whereCloud").onclick = () => { whereWanted = "cloud"; paintDraft(); };
$("draftTyped").oninput = () => { const box = $("draftTyped"); box.style.height = "auto"; box.style.height = `${Math.min(140, box.scrollHeight)}px`; paintBox(); };
$("draftTyped").onkeydown = (event) => { if (event.key === "Enter" && !event.shiftKey && !/Mobi|Android|iPhone/i.test(navigator.userAgent)) { event.preventDefault(); $("draftCompose").requestSubmit(); } };
$("draftCompose").onsubmit = async (event) => {
  event.preventDefault();
  const prompt = $("draftTyped").value.trim();
  if (!prompt || pendingBirth) return;
  pendingBirth = { asking: true };
  $("draftSend").disabled = true;
  $("draftTyped").disabled = true;
  await device.refreshPeople().catch(() => {});
  const mac = macOnline();
  paintDraft();
  if (!mac) { pendingBirth = null; restDraft(); draftNote(t("your Mac is not listening right now: open the Hive there first"), true); return; }
  $("draftHint").hidden = true;
  const bubble = document.createElement("div");
  bubble.className = "bub me waiting";
  bubble.textContent = prompt;
  bubble.appendChild(whoLine(t("you, from here"), Date.now()));
  $("draftThread").appendChild(bubble);
  const note = draftNote(t("opening on the Mac…"));
  try {
    const said = providers.data;
    const mission = { prompt, where: whereWanted, agent: draftAgent(said) };
    if (draftPick.model) mission.model = draftPick.model;
    if (whereWanted === "local" && draftPick.account) mission.account = draftPick.account;
    if (whereWanted === "cloud" && draftPick.repo) mission.repo = draftPick.repo;
    const asked = await device.askBirth(mac.fingerprint, mission);
    pendingBirth = { id: asked.id, at: Date.now() };
    $("draftTyped").value = "";
    $("draftTyped").style.height = "auto";
    paintBox();
    pendingBirth.timer = setTimeout(() => {
      if (!pendingBirth || pendingBirth.id !== asked.id) return;
      restDraft();
      note.textContent = t("the Mac is taking its time; the chat shows up in the list when it opens");
    }, BIRTH_WAIT_MS);
  } catch (wrong) {
    pendingBirth = null;
    restDraft();
    note.className = "note bad";
    note.textContent = t("the chat did not open: {e}", { e: wrong.message });
  }
};

$("pick").onchange = async () => { await addPictures($("pick").files); $("pick").value = ""; };
$("typed").addEventListener("paste", (event) => {
  const files = [...(event.clipboardData?.files || [])].filter((one) => one.type.startsWith("image/"));
  if (!files.length) return;
  event.preventDefault();
  addPictures(files);
});
$("typed").oninput = () => { growTyped(); paintSuggest(); paintBox(); keepShownDraft(); };
$("typed").onblur = () => keepShownDraft({ now: true });
$("typed").onclick = paintSuggest;
$("typed").onkeyup = (event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) paintSuggest(); };
$("typed").onkeydown = (event) => { if (event.key === "Enter" && !event.shiftKey && !/Mobi|Android|iPhone/i.test(navigator.userAgent)) { event.preventDefault(); $("compose").requestSubmit(); } };
$("thread").addEventListener("scroll", followScroll, { passive: true });
$("thread").addEventListener("touchstart", () => handOn(60000), { passive: true });
$("thread").addEventListener("touchend", () => handOn(1500), { passive: true });
$("thread").addEventListener("touchcancel", () => handOn(1500), { passive: true });
$("thread").addEventListener("wheel", () => handOn(600), { passive: true });
$("toBottom").onclick = () => { stick = true; $("thread").scrollTo({ top: $("thread").scrollHeight, behavior: "smooth" }); };
new ResizeObserver(() => { if (shown && stick) toTheEnd(); }).observe($("thread"));

$("stop").onclick = async () => {
  if (!shown) return;
  try { await device.intend(shown, { type: "interrupt" }); paintThread(); toast(t("asked the chat to stop")); } catch (wrong) { toast(wrong.message); }
};

$("compose").onsubmit = async (event) => {
  event.preventDefault();
  const text = $("typed").value.trim();
  if ((!text && !attached.length) || !shown) return;
  const sending = attached;
  attached = [];
  $("typed").value = "";
  $("typed").style.height = "auto";
  keepDraft(shown, "", { now: true });
  paintTray();
  paintSuggest();
  $("send").disabled = true;
  try {
    const images = [];
    for (const one of sending) images.push({ id: await device.putBlob(shown, one.bytes), mime: "image/jpeg" });
    await device.intend(shown, images.length ? { type: "say", text, images } : { type: "say", text });
    for (const one of sending) URL.revokeObjectURL(one.preview);
    stick = true;
    paintThread();
    toTheEnd();
  } catch (wrong) { toast(wrong.message); $("typed").value = text; keepShownDraft({ now: true }); attached = sending; paintTray(); }
  finally { $("send").disabled = false; fitCompose(); paintBox(); }
};

$("peekBtn").onclick = async () => {
  const peek = $("peek");
  if (peek.classList.contains("on")) { peek.classList.remove("on"); return; }
  try {
    const held = await device.call("GET", `/peek/${encodeURIComponent(shown)}`);
    const last = held.events.at(-1);
    peek.textContent = `${t("what the hive keeps of this chat:")}\n${t("title")}  ${JSON.stringify(held.seat.title).slice(0, 100)}…\n${t("keys")}  ${Object.keys(held.seat.keys).join(", ")} ${t("(wrapped per device)")}\n${t("{n} events, the last one:", { n: held.events.length })}\n${JSON.stringify(last, null, 1)}`;
  } catch (wrong) { peek.textContent = wrong.message; }
  peek.classList.add("on");
};

if (window.visualViewport) {
  const fitKeyboard = () => {
    const covered = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
    document.documentElement.style.setProperty("--kb", `${Math.round(covered)}px`);
  };
  window.visualViewport.addEventListener("resize", fitKeyboard);
  window.visualViewport.addEventListener("scroll", fitKeyboard);
}
new ResizeObserver(fitCompose).observe($("compose"));

const cameBack = () => {
  if (!device?.paired) return;
  device.wake();
  device.sync().then(() => { paintFleet(); paintThread(); }).catch(() => {});
};
navigator.serviceWorker?.addEventListener("message", (event) => { if (event.data?.open && device?.seats.has(event.data.open)) openSeat(event.data.open); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") cameBack(); else keepShownDraft({ now: true }); });
window.addEventListener("online", cameBack);
window.addEventListener("pageshow", (event) => { if (event.persisted) cameBack(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/phone/sw.js", { scope: "/phone/" }).then(() => armNotices()).catch(() => {});
boot();
