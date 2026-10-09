import { openOutside, paintPills } from "./chat-and-panes.js";
import { $, esc, every, phrase, solidMounts, st, stopBeat, Terminal, FitAddon, WebLinksAddon, THEME, RAYCAST_FONT, RAYCAST_TERMINAL, raycastOn } from "./core.js";
import { HiveSocket } from "./terminal-history.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { ask, closePortaria, portariaOnScreen } from "./pod.js";
import { structPool } from "./structured-seats.js";
import { artClock } from "./subagents-dock.js";
import { closePrs, prsOnScreen } from "./thread.js";
import { closeUsage, usageOnScreen } from "./usage.js";
import { closeWorktrees, worktreesOnScreen } from "./worktrees.js";

const PV_BEAT = 30000;
const PV_LOGIN_BEAT = 2000;
const PV_MODELS = new Map();

st.providers = [];

st.providersAsked = false;

st.providersTrouble = "";

st.providerOpen = "";

st.providerTab = "accounts";

st.providerLogin = null;

st.providersCheckedAt = 0;

st.providerModelsAsked = "";

st.accounts = [];

st.accountsAsked = false;

let providersSolid = null;

function providersOnScreen() {
  return !$("providers").hidden;
}

function providerOf(id) {
  return (st.providers || []).find((one) => one.id === id) || null;
}

function providerAccounts(id) {
  return providerOf(id)?.accounts || [];
}

/* the pickers ask one thing: may a chat open on this agent right now. Before the
   list arrives the answer is yes, so a hive that cannot reach its server keeps
   opening chats the way it always did. */
function providerReady(id) {
  const one = providerOf(id);
  return one ? one.ready : true;
}

function providerWhyNot(id) {
  return providerOf(id)?.why || "";
}

function readyAgents(keep = "") {
  const all = (st.providers || []).length ? st.providers.map((one) => one.id) : ["claude", "codex", "kimi", "kiro", "cursor", "opencode"];
  return all.filter((id) => id === keep || providerReady(id));
}

function providerName(id) {
  return providerOf(id)?.name || id;
}

function providerColor(id) {
  return providerOf(id)?.color || "";
}

async function pullProviders(force = false) {
  st.providersAsked = true;
  let d;
  try {
    d = await (await fetch(`/api/providers${force ? "?force=1" : ""}`)).json();
  } catch {
    st.providersTrouble = phrase("the app could not read which providers this machine holds");
    return false;
  }
  st.providersTrouble = d.error || "";
  st.providers = Array.isArray(d.providers) ? d.providers : [];
  st.providersCheckedAt = Date.now();
  st.accounts = providerAccounts("claude");
  st.accountsAsked = true;
  if (!st.providerOpen || !providerOf(st.providerOpen)) st.providerOpen = st.providers[0]?.id || "";
  for (const seat of structPool.values()) paintPills(seat);
  paintNewChatKinds();
  paintNewChatAccounts();
  if (providersOnScreen()) paintProviders();
  document.dispatchEvent(new CustomEvent("hive:providers"));
  return true;
}

function pullAccounts() {
  return pullProviders();
}

function accountSaid(a) {
  return a.blind ? phrase("could not ask this login who it is") : phrase("signed out — the login never finished");
}

function accountRoomSay(one) {
  const spent = one.spent;
  if (!spent) return "";
  if (spent.why === "login") return one.loggedIn ? "" : phrase("signed out mid-answer — sign in again for chats to come back to it");
  if (!spent.until || spent.until <= Date.now()) return "";
  return phrase("out of room until {when}", { when: artClock(spent.until) });
}

function whoSay(a) {
  if (!a?.loggedIn) return "";
  return [a.email, a.tier].filter(Boolean).join(" · ") || phrase("signed in");
}

function statusOf(one) {
  if (!one.installed) return { status: phrase("not installed"), tone: "dim" };
  if (!one.enabled) return { status: phrase("turned off"), tone: "dim" };
  const signed = one.accounts.filter((a) => a.loggedIn);
  if (!signed.length) return { status: phrase("signed out"), tone: "warn" };
  const first = signed.find((a) => a.name === (one.order?.[0] || "default")) || signed[0];
  const tier = first.tier ? ` · ${first.tier}` : "";
  return { status: signed.length > 1 ? phrase("{n} logins{tier}", { n: signed.length, tier }) : `${phrase("authenticated")}${tier}`, tone: "ok" };
}

/* the switch can only offer what the machine holds: with no binary on the PATH
   there is nothing to turn on, so it reads off and refuses the click. */
function toggleShape(one) {
  if (!one.installed) {
    return {
      toggleOn: false,
      canToggle: false,
      toggleSay: phrase("{name} is not installed on this machine", { name: one.name }),
      toggleTitle: phrase("install it and this switch comes alive — until then it has nothing to run")
    };
  }
  return {
    toggleOn: one.enabled,
    canToggle: true,
    toggleSay: one.enabled ? phrase("turn {name} off", { name: one.name }) : phrase("turn {name} on", { name: one.name }),
    toggleTitle: one.enabled ? phrase("off: its models leave every picker, chats already open keep running") : phrase("on: its models come back to the pickers")
  };
}

function seatsOnAccount(id, name) {
  let n = 0;
  for (const seat of structPool.values()) {
    if ((seat.agent || "claude") !== id) continue;
    if ((seat.account || "") === (name === "default" ? "" : name)) n += 1;
  }
  return n;
}

function accountRows(one) {
  const order = one.order?.length ? one.order : one.accounts.map((a) => a.name);
  const sorted = one.accounts.slice().sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  return sorted.map((a, i) => ({
    key: a.name, name: a.name, loggedIn: !!a.loggedIn, isDefault: a.name === "default",
    said: a.loggedIn ? whoSay(a) : accountSaid(a),
    room: accountRoomSay(a),
    first: i === 0 && sorted.length > 1, firstSay: phrase("first"),
    inUse: seatsOnAccount(one.id, a.name) > 0, inUseSay: phrase("in use"),
    canUp: i > 0, canDown: i < sorted.length - 1,
    upSay: phrase("try this login sooner"), downSay: phrase("try this login later"),
    canSignIn: !a.loggedIn && !a.blind, signInSay: a.name === "default" ? phrase("sign in") : phrase("finish the sign-in"),
    canRemove: a.name !== "default", removeSay: phrase("remove"),
    defaultSay: phrase("the CLI's own login")
  }));
}

function modelGroups(id) {
  const held = PV_MODELS.get(id);
  const one = providerOf(id);
  if (!held) return { groups: [], hint: one && !one.ready ? one.why : "" };
  if (held.error) return { groups: [], hint: held.error };
  const groups = new Map();
  for (const m of held.models || []) {
    const key = m.group || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ key: m.value, label: m.label || m.value, value: m.value, description: m.description || "", context: m.context || "", isDefault: !!m.isDefault, defaultSay: phrase("default") });
  }
  return { groups: [...groups].map(([name, rows]) => ({ key: name || "_", name, rows })), hint: held.models?.length ? "" : phrase("{agent} has no model to offer on this machine", { agent: providerName(id) }) };
}

function checkedSay() {
  const ago = Date.now() - (st.providersCheckedAt || 0);
  if (!st.providersCheckedAt) return phrase("not checked yet");
  if (ago < 15000) return phrase("checked just now");
  if (ago < 120000) return phrase("checked {n}s ago", { n: Math.round(ago / 1000) });
  return phrase("checked {n} min ago", { n: Math.round(ago / 60000) });
}

st.agentUpdateSaid = {};

function versionSay(one) {
  return one.behind ? `${one.version} → ${one.latest}` : one.version;
}

function agentsBehind() {
  return (st.providers || []).filter((one) => one.installed && one.enabled && one.behind);
}

function updateShape(one) {
  if (!one.installed) return null;
  const done = st.agentUpdateSaid[one.id] || "";
  const behindTheHive = one.seatsRun ? phrase("chats use the claude that came with the hive ({version}) until this one is at least as new", { version: one.seatsRun }) : "";
  const said = [behindTheHive, done].filter(Boolean).join("\n");
  if (one.updating) return { say: phrase("updating {name}…", { name: one.name }), go: "", busy: true, said };
  if (one.bundled) return { say: phrase("this claude came with the hive — install claude on this machine and the hive uses it, and keeps it up to date"), go: "", busy: false, said };
  if (one.behind && one.canUpdate) return { say: phrase("{version} is out", { version: one.latest }), go: phrase("update"), busy: false, said };
  if (one.behind) return { say: phrase("{version} is out — the hive cannot run this one for you, so in a terminal: {command}", { version: one.latest, command: one.updateCommand }), go: "", busy: false, said };
  if (one.canUpdate && !one.latest) return { say: "", go: phrase("look for an update"), busy: false, said };
  return said ? { say: "", go: "", busy: false, said } : null;
}

async function updateAgentNow(id) {
  const one = providerOf(id);
  if (!one || one.updating) return;
  one.updating = true;
  st.agentUpdateSaid[id] = "";
  if (providersOnScreen()) paintProviders();
  document.dispatchEvent(new CustomEvent("hive:providers"));
  const d = await tellProvider("update", { provider: id }).catch(() => ({ error: phrase("the app lost the server while it was updating") }));
  st.agentUpdateSaid[id] = d.error ? d.error
    : d.moved ? phrase("updated from {before} to {after}", { before: d.before, after: d.after })
    : phrase("already on the newest version");
  PV_MODELS.delete(id);
  await pullProviders(true);
  return d;
}

function detailOf(one) {
  const { status, tone } = statusOf(one);
  const signed = one.accounts.filter((a) => a.loggedIn);
  const first = signed[0];
  const who = !one.installed ? phrase("{binary} is not on the PATH of this machine", { binary: one.label.toLowerCase() === "kiro" ? "kiro-cli" : one.label.toLowerCase() })
    : !one.enabled ? phrase("turned off — its models stay out of every picker until it is on again")
    : !first ? phrase("nobody is signed in — sign in below, and its models appear in the pickers")
    : first.email ? phrase("authenticated as {email}", { email: first.email }) + (first.tier ? ` · ${first.tier}` : "")
    : `${phrase("authenticated")}${first.tier ? ` · ${first.tier}` : ""}`;
  const held = PV_MODELS.get(one.id);
  const tabs = [
    { key: "accounts", label: phrase("Accounts"), count: String(one.accounts.length), on: st.providerTab === "accounts" },
    { key: "configuration", label: phrase("Configuration"), count: "", on: st.providerTab === "configuration" },
    { key: "models", label: phrase("Models"), count: held?.models ? String(held.models.length) : "", on: st.providerTab === "models" },
  ];
  return {
    id: one.id, name: one.name, color: one.color, version: versionSay(one), behind: !!one.behind, update: updateShape(one), enabled: one.enabled, who, tone: status ? tone : "",
    checked: checkedSay(), checkedTitle: phrase("when the binaries, versions and logins were last read"),
    checkSay: phrase("check again"), checkTitle: phrase("read the binaries, versions and logins again"),
    ...toggleShape(one),
    tabs, tab: st.providerTab,
    accounts: {
      sub: one.oneLogin
        ? phrase("One login for {name} on this machine, with the limit that comes with it.", { name: one.name })
        : phrase("Each login is its own home for {name} — the sign-in and the limit that comes with it. The order is the order chats fall back in when a login runs out of room.", { name: one.name }),
      rows: accountRows(one)
    },
    configuration: { sub: phrase("How this hive runs {name}. Saved in your config file.", { name: one.name }) },
    models: { sub: phrase("What {name} can run here, as it answered the hive.", { name: one.name }), ...modelGroups(one.id) }
  };
}

function providersViewModel() {
  if (st.providersTrouble && !(st.providers || []).length) return { trouble: st.providersTrouble, title: phrase("Providers"), sub: "", foot: "", none: "", rows: [], detail: null };
  const rows = (st.providers || []).map((one) => {
    const { status, tone } = statusOf(one);
    return {
      key: one.id, id: one.id, name: one.name, color: one.color, version: versionSay(one), behind: !!one.behind, enabled: one.enabled, installed: one.installed, ready: one.ready,
      status, tone, here: one.id === st.providerOpen,
      ...toggleShape(one)
    };
  });
  const open = providerOf(st.providerOpen);
  return {
    trouble: "",
    title: phrase("Providers"),
    sub: phrase("the agents this hive can seat, and their logins"),
    foot: phrase("A model shows in the pickers only while its provider is on, installed and signed in. Every provider hands a chat to its next login when one runs out of room; with no login left, the message fails and says so."),
    none: phrase("pick a provider on the left"),
    rows,
    detail: open ? detailOf(open) : null
  };
}

function paintProviders() {
  if (!providersSolid) return;
  providersSolid.show(providersViewModel());
  paintProviderHosts();
}

let hostsPainted = "";

const HOST_OF_TAB = { accounts: "pv-add", configuration: "pv-form" };

function paintProviderHosts(force = false, tries = 0) {
  const one = providerOf(st.providerOpen);
  if (!one) return;
  const stamp = `${one.id}:${st.providerTab}:${st.providerLogin ? "login" : "no"}`;
  if (!force && stamp === hostsPainted) return fitLogin();
  const hostId = HOST_OF_TAB[st.providerTab];
  const host = hostId ? $(hostId) : null;
  if (hostId && !host) {
    if (tries === 0) queueMicrotask(() => paintProviderHosts(force, 1));
    else if (tries === 1) setTimeout(() => paintProviderHosts(force, 2), 0);
    return;
  }
  hostsPainted = stamp;
  if (st.providerTab === "accounts") {
    host.innerHTML = addAccountHtml(one);
    paintLoginBox(one);
  }
  if (st.providerTab === "configuration") host.innerHTML = configFormHtml(one);
}

const NICKNAME_OK = /^[a-z0-9][a-z0-9-]{0,30}$/;

const LOOKS_LIKE_EMAIL = /@|\.(com|com\.br|br|net|org|io|dev)$/;

function nicknameTrouble(name, id = st.providerOpen) {
  if (!name) return phrase("give it a nickname — a short label like work or personal");
  if (LOOKS_LIKE_EMAIL.test(name)) return phrase("that looks like an email — the nickname is just a label; you pick the account in the browser sign-in");
  if (name === "default") return phrase("“default” is the account you already use — pick another word");
  if (!NICKNAME_OK.test(name)) return phrase("lowercase letters, numbers and dashes only, starting with a letter or a number");
  if (providerAccounts(id).some((a) => a.name === name)) return phrase("there is already an account called {name}", { name: name });
  return "";
}

function addAccountHtml(one) {
  if (one.oneLogin) return `<p class="hint">${esc(one.oneLogin)}</p>`;
  return `<div class="pair pv-add-row">
    <div>
      <label for="pv-name">${phrase("another login — its nickname")}</label>
      <input id="pv-name" autocomplete="off" spellcheck="false" placeholder="${phrase("work")}" aria-describedby="pv-name-err" />
      <p class="field-err" id="pv-name-err" hidden></p>
    </div>
    <div><label>&nbsp;</label><button class="btn" id="pv-signin" ${one.installed ? "" : "disabled"}>${phrase("sign in to {name} with another login", { name: esc(one.name) })}</button></div>
  </div>`;
}

function paintLoginBox(one) {
  const box = $("pv-login");
  if (!box) return;
  const login = st.providerLogin;
  if (!login || login.provider !== one.id) { box.innerHTML = ""; teardownLoginTerminal(); return; }
  box.innerHTML = `<div class="pv-login">
    <div class="pv-login-top">
      <b>${phrase("signing in to {name} as {login}", { name: esc(one.name), login: esc(login.name) })}</b>
      <span class="hint">${phrase("the CLI's own sign-in, live — pick with the arrows, paste a key, the links open outside")}</span>
      <button class="nbtn" id="pv-login-close">${phrase("cancel")}</button>
    </div>
    <div class="pv-term" id="pv-term"></div>
    <p class="hint" id="pv-login-hint">${login.direct ? phrase("finish the sign-in in the browser — it comes back here on its own, and the login below turns green") : phrase("when the sign-in lands, the login below turns green on its own")}</p>
  </div>`;
  attachLoginTerminal(one.id);
}

let loginTerm = null;

function loginTerminal() {
  if (loginTerm) return loginTerm;
  const host = document.createElement("div");
  host.className = "pv-term-host";
  const term = new Terminal({ fontFamily: raycastOn() ? RAYCAST_FONT.mono : "Hack, ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1, cursorBlink: true, allowProposedApi: true, scrollback: 2000, theme: raycastOn() ? RAYCAST_TERMINAL : THEME });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon((ev, uri) => openOutside(uri)));
  loginTerm = { term, fit, host, ws: null, size: "", opened: false };
  term.onData((d) => { if (loginTerm?.ws?.readyState === 1) loginTerm.ws.send(d); });
  return loginTerm;
}

function attachLoginTerminal(providerId) {
  const slot = $("pv-term");
  if (!slot) return;
  const t = loginTerminal();
  if (t.host.parentElement !== slot) slot.appendChild(t.host);
  if (!t.opened) { t.term.open(t.host); t.opened = true; }
  fitLogin();
  connectLogin(providerId);
  t.term.focus();
}

function connectLogin(providerId) {
  const t = loginTerm;
  if (!t || t.ws) return;
  const cols = t.term.cols || 100;
  const rows = t.term.rows || 28;
  const ws = new HiveSocket(`/pty?auth=${encodeURIComponent(providerId)}&cols=${cols}&rows=${rows}`);
  ws.binaryType = "arraybuffer";
  t.ws = ws;
  ws.onopen = () => { t.size = ""; fitLogin(); };
  ws.onmessage = (ev) => t.term.write(typeof ev.data === "string" ? ev.data : new Uint8Array(ev.data));
  ws.onclose = () => { if (t.ws === ws) t.ws = null; };
  ws.onerror = () => {};
}

function fitLogin() {
  const t = loginTerm;
  if (!t?.opened || !t.host.isConnected || !t.host.clientWidth) return;
  try { t.fit.fit(); } catch { return; }
  const size = `${t.term.cols}x${t.term.rows}`;
  if (t.ws?.readyState !== 1 || t.size === size) return;
  t.size = size;
  t.ws.send("\x01" + JSON.stringify({ c: t.term.cols, r: t.term.rows }));
}

function teardownLoginTerminal() {
  const t = loginTerm;
  if (!t) return;
  loginTerm = null;
  try { t.ws?.close(); } catch {}
  try { t.term.dispose(); } catch {}
  try { t.host.remove(); } catch {}
}

function configFormHtml(one) {
  const envRows = Object.entries(one.env || {});
  const swatches = ["#D97757", "#10A37F", "#2E6FEF", "#8B5CF6", "#E8A33D", "#E11D48", "#0EA5E9", "#22C55E", "#A3A3A3"];
  const field = (id, label, control, hint) => `<label class="rt-field" for="${id}"><span>${label}</span>${control}${hint ? `<em class="pv-hint">${hint}</em>` : ""}</label>`;
  return `<form class="rt-editor pv-form" id="pv-config">
    <div class="rt-grid pv-grid">
      ${field("pv-display", phrase("display name"), `<input id="pv-display" maxlength="40" value="${esc(one.name)}" placeholder="${esc(one.label)}">`, phrase("how this provider is called in the pickers and the rail"))}
      <div class="rt-field"><span>${phrase("colour")}</span><div class="pv-swatches" id="pv-swatches">${swatches.map((hex) => `<button type="button" class="pv-swatch${hex.toLowerCase() === String(one.color).toLowerCase() ? " on" : ""}" data-pv-swatch="${hex}" style="--pv-color:${hex}" title="${hex}"></button>`).join("")}<input id="pv-color" value="${esc(one.color)}" maxlength="9" placeholder="#RRGGBB" aria-label="${phrase("colour")}"></div></div>
    </div>
    <p class="pv-cap">${phrase("runtime")}</p>
    <div class="rt-grid pv-grid">
      ${field("pv-binary", phrase("binary path"), `<input id="pv-binary" value="${esc(one.binary)}" placeholder="${esc(one.path || phrase("found on the PATH"))}" spellcheck="false">`, one.path ? phrase("found at {path}", { path: esc(one.path) }) : phrase("nothing on the PATH answers to {binary}", { binary: esc(one.label.toLowerCase()) }))}
      ${field("pv-home", phrase("home path"), `<input id="pv-home" value="${esc(one.home)}" disabled>`, phrase("where the CLI keeps itself for the login you already use"))}
      ${field("pv-shadow", phrase("shadow home path"), `<input id="pv-shadow" value="${esc(one.accountsRoot)}" disabled>`, phrase("account-specific home. Keeps auth separate while sharing state — every other login lives in a folder here, with links to the real home for everything but the sign-in, and {env} points the CLI at it", { env: esc(one.homeEnv) }))}
      ${field("pv-args", phrase("launch arguments"), `<input id="pv-args" value="${esc((one.args || []).join(" "))}" placeholder="--profile work" spellcheck="false">`, phrase("added to every chat this hive opens on it (space separated)"))}
    </div>
    <p class="pv-cap">${phrase("environment")}</p>
    <div class="pv-env" id="pv-env">
      ${envRows.map(([k, v]) => envRowHtml(k, v)).join("")}
    </div>
    <div class="pr-actions pv-form-acts">
      <button class="nbtn" type="button" id="pv-env-add">+ ${phrase("add variable")}</button>
      <span class="hint" id="pv-form-said"></span>
      <button class="btn" type="submit" id="pv-save">${phrase("save")}</button>
    </div>
  </form>`;
}

function envRowHtml(k = "", v = "") {
  return `<div class="pv-env-row"><input class="pv-env-k" value="${esc(k)}" placeholder="NAME" spellcheck="false" aria-label="${phrase("variable")}"><input class="pv-env-v" value="${esc(v)}" placeholder="${phrase("value")}" spellcheck="false" aria-label="${phrase("value")}"><button type="button" class="nbtn danger pv-env-drop" title="${phrase("remove")}">×</button></div>`;
}

async function tellProvider(action, payload) {
  const r = await fetch("/api/provider", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
  return r.json();
}

async function toggleProvider(id, enabled) {
  const one = providerOf(id);
  if (!one?.installed) return;
  one.enabled = enabled;
  paintProviders();
  const d = await tellProvider("toggle", { provider: id, enabled });
  if (d.error) st.providersTrouble = d.error;
  PV_MODELS.delete(id);
  await pullProviders(true);
}

function selectProvider(id) {
  st.providerOpen = id;
  paintProviders();
  if (st.providerTab === "models") pullProviderModels(id);
}

function pickTab(key) {
  st.providerTab = key;
  paintProviders();
  if (key === "models") pullProviderModels(st.providerOpen);
}

async function pullProviderModels(id, refresh = false) {
  if (!id) return;
  if (!refresh && PV_MODELS.has(id)) return paintProviders();
  if (st.providerModelsAsked === id) return;
  st.providerModelsAsked = id;
  PV_MODELS.set(id, { models: null, error: phrase("asking {agent} what it can run…", { agent: providerName(id) }) });
  paintProviders();
  const answer = await fetch(`/api/catalog?agent=${encodeURIComponent(id)}`).then((r) => r.json()).catch(() => null);
  st.providerModelsAsked = "";
  PV_MODELS.set(id, answer?.models?.length ? { models: answer.models, error: "" } : { models: [], error: answer?.error || "" });
  paintProviders();
}

async function moveAccount(name, by) {
  const one = providerOf(st.providerOpen);
  if (!one) return;
  const order = (one.order?.length ? one.order : one.accounts.map((a) => a.name)).slice();
  const i = order.indexOf(name);
  const j = i + by;
  if (i < 0 || j < 0 || j >= order.length) return;
  [order[i], order[j]] = [order[j], order[i]];
  one.order = order;
  paintProviders();
  const d = await tellProvider("order", { provider: one.id, order });
  if (d.error) st.providersTrouble = d.error;
  await pullProviders(true);
}

async function removeAccount(name) {
  const one = providerOf(st.providerOpen);
  if (!one) return;
  const sure = await ask(
    phrase("Remove the login {name}?", { name: esc(name) }),
    phrase("The folder that holds this sign-in for {provider} is deleted. Chats on it keep running until they close; the sign-in itself is not revoked anywhere else.", { provider: esc(one.name) }),
    phrase("remove it")
  );
  if (!sure) return;
  const d = await tellProvider("remove", { provider: one.id, name });
  if (d.error) st.providersTrouble = d.error;
  await pullProviders(true);
}

function sayNickname(text) {
  const err = $("pv-name-err");
  if (!err) return;
  err.textContent = text;
  err.hidden = !text;
  $("pv-name")?.classList.toggle("wrong", !!text);
}

async function signIn(name) {
  const one = providerOf(st.providerOpen);
  if (!one) return;
  const button = $("pv-signin");
  if (button) { button.disabled = true; button.textContent = phrase("opening the sign-in…"); }
  const d = await tellProvider("sign-in", { provider: one.id, name });
  if (button) { button.disabled = false; button.textContent = phrase("sign in to {name} with another login", { name: one.name }); }
  if (d.error) return sayNickname(d.error);
  st.providerLogin = { provider: one.id, name, text: d.text || "", url: d.url || "", code: d.code || "", direct: !!d.direct, done: false, since: Date.now() };
  paintProviders();
  every("pv-login", PV_LOGIN_BEAT, watchLogin);
  if (d.url) openOutside(d.url);
}

async function addAccount() {
  const name = ($("pv-name")?.value || "").trim().toLowerCase();
  const trouble = nicknameTrouble(name);
  sayNickname(trouble);
  if (trouble) return $("pv-name")?.focus();
  await signIn(name);
}

async function watchLogin() {
  const login = st.providerLogin;
  if (!login || !providersOnScreen()) return stopBeat("pv-login");
  fitLogin();
  if (Date.now() - (login.checked || 0) > 4000) {
    await pullProviders(true);
    login.checked = Date.now();
  }
  if (!st.providerLogin || st.providerLogin !== login) return;
  const held = providerAccounts(login.provider).find((a) => a.name === login.name);
  if (held?.loggedIn && !login.done) {
    login.done = true;
    const hint = $("pv-login-hint");
    if (hint) hint.textContent = phrase("signed in — this login is ready for chats");
    tellProvider("close", { provider: login.provider }).catch(() => {});
    stopBeat("pv-login");
    setTimeout(() => { if (st.providerLogin === login) { st.providerLogin = null; teardownLoginTerminal(); paintProviders(); } }, 4000);
  }
}

function closeLogin() {
  const login = st.providerLogin;
  if (!login) return;
  st.providerLogin = null;
  stopBeat("pv-login");
  teardownLoginTerminal();
  tellProvider("close", { provider: login.provider }).catch(() => {});
  paintProviders();
}

function readConfigForm() {
  const args = ($("pv-args")?.value || "").trim().split(/\s+/).filter(Boolean);
  const env = {};
  for (const row of document.querySelectorAll("#pv-env .pv-env-row")) {
    const k = row.querySelector(".pv-env-k")?.value.trim() || "";
    const v = row.querySelector(".pv-env-v")?.value || "";
    if (k) env[k] = v;
  }
  return { name: ($("pv-display")?.value || "").trim(), color: ($("pv-color")?.value || "").trim(), binary: ($("pv-binary")?.value || "").trim(), args, env };
}

async function saveConfigForm() {
  const one = providerOf(st.providerOpen);
  if (!one) return;
  const said = $("pv-form-said");
  const patch = readConfigForm();
  if (patch.color && !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(patch.color)) { if (said) said.textContent = phrase("the colour should be hex, like #CD694A"); return; }
  if (said) said.textContent = phrase("saving…");
  const d = await tellProvider("settings", { provider: one.id, ...patch });
  if (d.error) { if (said) said.textContent = d.error; return; }
  await pullProviders(true);
  hostsPainted = "";
  paintProviders();
  const again = $("pv-form-said");
  if (again) again.textContent = phrase("saved");
}

function checkProviders() {
  st.providersCheckedAt = 0;
  paintProviders();
  PV_MODELS.clear();
  pullProviders(true).then(() => { if (st.providerTab === "models") pullProviderModels(st.providerOpen); });
}

function openProviders(id = "") {
  releaseKeyboard();
  if (prsOnScreen()) closePrs();
  if (usageOnScreen()) closeUsage();
  if (worktreesOnScreen()) closeWorktrees();
  if (portariaOnScreen()) closePortaria();
  if (id) st.providerOpen = id;
  $("providers").hidden = false;
  hostsPainted = "";
  paintProviders();
  pullProviders(!st.providersAsked);
  every("providers", PV_BEAT, () => pullProviders());
  if (st.providerLogin) every("pv-login", PV_LOGIN_BEAT, watchLogin);
}

async function closeProviders() {
  if (st.providerLogin && !st.providerLogin.done) {
    const drop = await ask(
      phrase("A sign-in is still open"),
      phrase("The window is still waiting on the sign-in for <b>{name}</b>. Closing this screen drops it, and the login stays signed out.", { name: esc(st.providerLogin.name) }),
      phrase("abandon it")
    );
    if (!drop) return;
    closeLogin();
  }
  $("providers").hidden = true;
  stopBeat("providers");
  stopBeat("pv-login");
  teardownLoginTerminal();
}

function paintNewChatKinds() {
  const sel = $("n-kind");
  if (!sel) return;
  const ready = new Set(readyAgents());
  let kept = sel.value;
  for (const opt of sel.options) {
    const agent = /^opencode/.test(opt.value) ? "opencode" : /^codex/.test(opt.value) ? "codex" : /^kimi/.test(opt.value) ? "kimi" : /^kiro/.test(opt.value) ? "kiro" : /^cursor/.test(opt.value) ? "cursor" : "claude";
    const ok = ready.has(agent);
    opt.disabled = !ok;
    opt.hidden = !ok;
    if (!ok) opt.title = providerWhyNot(agent);
  }
  if (sel.selectedOptions[0]?.disabled) {
    const first = [...sel.options].find((opt) => !opt.disabled);
    if (first) { sel.value = first.value; kept = first.value; sel.dispatchEvent(new Event("change")); }
  }
  return kept;
}

function paintNewChatAccounts() {
  const sel = $("n-account");
  if (!sel) return;
  const agent = /^opencode/.test($("n-kind")?.value || "") ? "opencode" : /^codex/.test($("n-kind")?.value || "") ? "codex" : /^kimi/.test($("n-kind")?.value || "") ? "kimi" : /^kiro/.test($("n-kind")?.value || "") ? "kiro" : /^cursor/.test($("n-kind")?.value || "") ? "cursor" : "claude";
  const accounts = providerAccounts(agent);
  sel.hidden = accounts.length < 2;
  if (sel.hidden) return;
  const chosen = sel.value;
  sel.innerHTML = accounts.map((a) => {
    const who = a.loggedIn ? whoSay(a) : phrase("signed out");
    return `<option value="${a.name === "default" ? "" : esc(a.name)}">${esc(a.name)} — ${esc(who)}</option>`;
  }).join("");
  sel.value = [...sel.options].some((o) => o.value === chosen) ? chosen : "";
}

solidMounts.push((hive) => {
  providersSolid = hive.mountProviders($("providers"), {
    actions: {
      select: selectProvider,
      toggle: toggleProvider,
      tab: pickTab,
      check: checkProviders,
      update: updateAgentNow,
      move: moveAccount,
      remove: removeAccount,
      signIn
    }
  });
});

$("providers").addEventListener("click", (ev) => {
  const t = ev.target.closest("button, a");
  if (!t) return;
  if (t.id === "pv-signin") return void addAccount();
  if (t.id === "pv-login-close") return void closeLogin();
  if (t.id === "pv-env-add") return void $("pv-env")?.insertAdjacentHTML("beforeend", envRowHtml());
  if (t.classList.contains("pv-env-drop")) return void t.closest(".pv-env-row")?.remove();
  if (t.dataset.pvSwatch) {
    const input = $("pv-color");
    if (input) input.value = t.dataset.pvSwatch;
    for (const other of document.querySelectorAll("#pv-swatches .pv-swatch")) other.classList.toggle("on", other === t);
  }
});

$("providers").addEventListener("submit", (ev) => {
  if (ev.target.id !== "pv-config") return;
  ev.preventDefault();
  saveConfigForm();
});

$("providers").addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.target.id === "pv-name") { ev.preventDefault(); addAccount(); }
  ev.stopPropagation();
});

$("providers").addEventListener("input", (ev) => {
  if (ev.target.id === "pv-name") {
    const name = ev.target.value.trim().toLowerCase();
    if (!name) return sayNickname("");
    if ($("pv-name-err")?.hidden && !LOOKS_LIKE_EMAIL.test(name)) return;
    sayNickname(nicknameTrouble(name));
  }
});


export { agentsBehind, updateAgentNow, versionSay, LOOKS_LIKE_EMAIL, NICKNAME_OK, PV_BEAT, accountRoomSay, accountSaid, checkedSay, closeLogin, closeProviders, configFormHtml, nicknameTrouble, openProviders, paintNewChatAccounts, paintNewChatKinds, paintProviders, providerAccounts, providerColor, providerName, providerOf, providerReady, providerWhyNot, providersOnScreen, providersViewModel, pullAccounts, pullProviders, readyAgents, statusOf, whoSay };
