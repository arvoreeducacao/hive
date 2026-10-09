import { apiGet, esc, phrase, st } from "./core.js";
import { render } from "./arrange.js";

const POLL_MS = 2000;

st.secretAsks = [];

let host = null;
let typed = new Map();
let polling = 0;

const KEY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></svg>';

const secretAskOf = (seat) => st.secretAsks.find((one) => one.seat === seat) || null;

function cardHtml(ask) {
  const seat = (st.data?.sessions || []).find((one) => one.name === ask.seat);
  const who = seat?.title || ask.seat;
  return `<form class="sa-card" data-id="${esc(ask.id)}" autocomplete="off">
    <div class="sa-head"><span class="sa-icon">${KEY_ICON}</span><span class="sa-title">${esc(phrase("{seat} needs a secret", { seat: who }))}</span></div>
    <div class="sa-label">${esc(ask.label)}</div>
    ${ask.why ? `<div class="sa-why">${esc(ask.why)}</div>` : ""}
    <input class="sa-input" type="password" name="value" placeholder="${esc(phrase("Paste the secret"))}" spellcheck="false" autocomplete="new-password">
    <div class="sa-note">${esc(phrase("It never enters the conversation: the chat only gets the path of a private file, deleted in 24 hours."))}</div>
    <div class="sa-acts"><button type="button" class="sa-no" data-decline="1">${esc(phrase("Decline"))}</button><button type="submit" class="sa-yes">${esc(phrase("Save secret"))}</button></div>
    <div class="sa-err" hidden></div>
  </form>`;
}

function paint() {
  if (!host) {
    host = document.createElement("div");
    host.id = "secret-asks";
    host.addEventListener("submit", (event) => { event.preventDefault(); send(event.target, false); });
    host.addEventListener("click", (event) => { if (event.target.closest("[data-decline]")) send(event.target.closest(".sa-card"), true); });
    host.addEventListener("input", (event) => { const card = event.target.closest(".sa-card"); if (card) typed.set(card.dataset.id, event.target.value); });
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
  const said = await fetch("/api/secrets/answer", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(decline ? { id, decline: true } : { id, value })
  }).then((r) => r.json()).catch((wrong) => ({ error: String(wrong?.message || wrong) }));
  if (said?.error) {
    const err = card.querySelector(".sa-err");
    err.hidden = false;
    err.textContent = said.error;
    return;
  }
  typed.delete(id);
  await pull();
}

async function pull() {
  const said = await apiGet("/api/secrets/pending").catch(() => null);
  const asks = Array.isArray(said?.asks) ? said.asks : [];
  const changed = asks.map((one) => one.id).join(",") !== st.secretAsks.map((one) => one.id).join(",");
  st.secretAsks = asks;
  for (const id of [...typed.keys()]) if (!asks.some((one) => one.id === id)) typed.delete(id);
  paint();
  if (changed && st.seatsKnown) render({ animate: false });
}

function startSecretAsks() {
  if (polling) return;
  pull();
  polling = setInterval(pull, POLL_MS);
}

startSecretAsks();

export { secretAskOf, startSecretAsks };
