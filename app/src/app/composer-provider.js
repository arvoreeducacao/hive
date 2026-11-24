import { refreshCatalog, seatAgent } from "./chat-and-panes.js";
import { esc, phrase } from "./core.js";
import { addDrawerBanner, onDrawerAct } from "./composer-drawer.js";
import { composerIcon } from "./composer-icons.js";
import { repaintComposers } from "./composer-modes.js";
import { openProviders, providerName, providerOf, pullProviders } from "./providers.js";

const dismissed = new Set();

const refreshing = new Set();

function providerStatus(e) {
  if (!e?.box || e.mirror || e.draft) return null;
  const id = seatAgent(e);
  const one = providerOf(id);
  if (!one || one.enabled === false) return null;
  const provider = providerName(id);
  const accounts = Array.isArray(one.accounts) ? one.accounts : [];
  if (one.installed === false) {
    return { id, kind: "warning", title: phrase("{provider} provider status", { provider }), message: phrase("Open provider setup to install {provider} on this environment.", { provider }) };
  }
  if (accounts.length && !accounts.some((a) => a.loggedIn) && !accounts.some((a) => a.blind)) {
    return { id, kind: "error", title: phrase("{provider} is unauthenticated", { provider }), message: phrase("Open provider setup to sign in.") };
  }
  if (Array.isArray(e.catalog) && !e.catalog.length) {
    return { id, kind: "warning", title: phrase("{provider} provider status", { provider }), message: phrase("No models are available for this provider.") };
  }
  return null;
}

const statusKey = (status) => `${status.id}:${status.kind}:${status.message}`;

function providerBanner(e) {
  const status = providerStatus(e);
  if (!status || dismissed.has(statusKey(status))) return "";
  const provider = providerName(status.id);
  const busy = refreshing.has(status.id);
  const dismiss = status.kind === "error" ? phrase("Dismiss {provider} provider error", { provider }) : phrase("Dismiss {provider} provider warning", { provider });
  return `<section class="cp-ban cp-provider ${status.kind}" role="alert" data-key="${esc(statusKey(status))}"><div class="cp-brow"><span class="cp-bi">${composerIcon("info")}</span>`
    + `<span class="cp-bc cp-provider-say"><span class="cp-bstrong">${esc(status.title)}</span><span class="cp-provider-why" title="${esc(status.message)}">${esc(status.message)}</span></span>`
    + `<span class="cp-ba"><button type="button" class="cp-bbtn" data-act="provider-setup" data-id="${esc(status.id)}">${esc(phrase("Open provider setup"))}</button>`
    + `<button type="button" class="cp-bbtn" data-act="provider-refresh" data-id="${esc(status.id)}" aria-label="${esc(phrase("Refresh {provider} provider status", { provider }))}"${busy ? " disabled" : ""}>${esc(busy ? phrase("Refreshing...") : phrase("Refresh"))}</button>`
    + `<button type="button" class="cp-bx" data-act="provider-dismiss" aria-label="${esc(dismiss)}">${composerIcon("x")}</button></span></div></section>`;
}

async function refreshProvider(e, id) {
  if (!id || refreshing.has(id)) return;
  refreshing.add(id);
  repaintComposers();
  try {
    await pullProviders(true);
    if (seatAgent(e) === id) await refreshCatalog(e, true);
  } finally {
    refreshing.delete(id);
    repaintComposers();
  }
}

addDrawerBanner({ order: 1, html: providerBanner });

onDrawerAct("provider-setup", (e, hit) => openProviders(hit.dataset.id || seatAgent(e)));

onDrawerAct("provider-refresh", (e, hit) => refreshProvider(e, hit.dataset.id || seatAgent(e)));

onDrawerAct("provider-dismiss", (e, hit) => {
  const key = hit.closest(".cp-provider")?.dataset.key;
  if (key) dismissed.add(key);
  repaintComposers();
});

if (typeof document !== "undefined") document.addEventListener("hive:providers", () => repaintComposers());

export { providerBanner, providerStatus };
