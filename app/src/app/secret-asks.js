import { apiGet, esc, phrase, st } from "./core.js";
import { render } from "./arrange.js";

const POLL_MS = 2000;

st.secretAsks = [];

let host = null;
let typed = new Map();
let plain = new Set();
let polling = 0;

const KEY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></svg>';

const siteOf = (url) => { try { return new URL(url).host; } catch { return ""; } };

function openOutside(url) {
  if (!/^https?:/i.test(url || "")) return;
  if (window.seatBrowser?.openExternal) window.seatBrowser.openExternal(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

function placeHtml(ask) {
  if (!ask.envKey) return `<div class="sa-note">${esc(phrase("It never enters the conversation: the chat only gets the path of a private file, deleted in 24 hours."))}</div>`;
  return `<div class="sa-note">${esc(phrase("It never enters the conversation: the Hive writes it as {key} in the .env of the hub, and the chat never gets the value.", { key: ask.envKey }))}</div>
    ${ask.replaces ? `<div class="sa-note sa-warn">${esc(phrase("{key} already has a value in the .env. This one replaces it.", { key: ask.envKey }))}</div>` : ""}
    ${ask.vault ? `<label class="sa-vault"><input type="checkbox" name="vault"${plain.has(ask.id) ? "" : " checked"}><span>${esc(phrase("Keep the value in 1Password; the .env gets only the reference"))}</span></label>` : ""}`;
}

function cardHtml(ask) {
  const seat = (st.data?.sessions || []).find((one) => one.name === ask.seat);
  const who = seat?.title || ask.seat;
  const site = siteOf(ask.url);
  return `<form class="sa-card" data-id="${esc(ask.id)}" autocomplete="off">
    <div class="sa-head"><span class="sa-icon">${KEY_ICON}</span><span class="sa-title">${esc(phrase("{seat} needs a secret", { seat: who }))}</span></div>
    <div class="sa-label">${esc(ask.label)}</div>
    ${ask.why ? `<div class="sa-why">${esc(ask.why)}</div>` : ""}
    <input class="sa-input" type="password" name="value" placeholder="${esc(phrase("Paste the secret"))}" spellcheck="false" autocomplete="new-password">
    ${placeHtml(ask)}
    <div class="sa-acts">${site ? `<button type="button" class="sa-page" data-page="${esc(ask.url)}" title="${esc(ask.url)}">${esc(phrase("Open {site}", { site }))}</button>` : ""}<button type="button" class="sa-no" data-decline="1">${esc(phrase("Decline"))}</button><button type="submit" class="sa-yes">${esc(phrase("Save secret"))}</button></div>
    <div class="sa-err" hidden></div>
  </form>`;
}

function paint() {
  if (!host) {
    host = document.createElement("div");
    host.id = "secret-asks";
    host.addEventListener("submit", (event) => { event.preventDefault(); send(event.target, false); });
    host.addEventListener("click", (event) => {
      const page = event.target.closest("[data-page]");
      if (page) return openOutside(page.dataset.page);
      if (event.target.closest("[data-decline]")) send(event.target.closest(".sa-card"), true);
    });
    host.addEventListener("input", (event) => {
      const card = event.target.closest(".sa-card");
      if (!card) return;
      if (event.target.name !== "vault") return void typed.set(card.dataset.id, event.target.value);
      if (event.target.checked) plain.delete(card.dataset.id);
      else plain.add(card.dataset.id);
    });
    document.body.append(host);
  }
  const ids = `${st.secretAsks.map((one) => one.id).join(",")}|${phrase("Save secret")}`;
  if (host.dataset.ids === ids) return;
  host.dataset.ids = ids;
  host.innerHTML = st.secretAsks.map(cardHtml).join("");
  for (const card of host.querySelectorAll(".sa-card")) {
    const input = card.querySelector(".sa-input");
    input.value = typed.get(card.dataset.id) || "";
  }
  host.querySelector(".sa-input")?.focus({ preventScroll: true });
}

async function send(card, decline) {
  if (!card) return;
  const id = card.dataset.id;
  const value = card.querySelector(".sa-input").value;
  if (!decline && !value) return card.querySelector(".sa-input").focus();
  if (card.dataset.busy) return;
  const vault = card.querySelector('[name="vault"]');
  const save = card.querySelector(".sa-yes");
  card.dataset.busy = "1";
  if (!decline) save.textContent = phrase("Saving…");
  const said = await fetch("/api/secrets/answer", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(decline ? { id, decline: true } : { id, value, ...(vault ? { vault: vault.checked } : {}) })
  }).then((r) => r.json()).catch((wrong) => ({ error: String(wrong?.message || wrong) }));
  delete card.dataset.busy;
  save.textContent = phrase("Save secret");
  if (said?.error) {
    const err = card.querySelector(".sa-err");
    err.hidden = false;
    err.textContent = said.error;
    return;
  }
  typed.delete(id);
  plain.delete(id);
  await pull();
}

async function pull() {
  const said = await apiGet("/api/secrets/pending").catch(() => null);
  const asks = Array.isArray(said?.asks) ? said.asks : [];
  const changed = asks.map((one) => one.id).join(",") !== st.secretAsks.map((one) => one.id).join(",");
  st.secretAsks = asks;
  for (const id of [...typed.keys()]) if (!asks.some((one) => one.id === id)) typed.delete(id);
  for (const id of [...plain]) if (!asks.some((one) => one.id === id)) plain.delete(id);
  paint();
  if (changed && st.seatsKnown) render({ animate: false });
}

function startSecretAsks() {
  if (polling) return;
  pull();
  polling = setInterval(pull, POLL_MS);
}

startSecretAsks();

export { startSecretAsks };
