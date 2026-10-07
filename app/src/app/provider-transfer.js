import { closeSeatPicker, paintPills, refreshCatalog } from "./chat-and-panes.js";
import { svCmd } from "./chat-stretches.js";
import { esc, phrase, raycastOn } from "./core.js";
import { pull } from "./focus-navigation.js";
import { providerName } from "./providers.js";
import { refreshContext } from "./structured-seats.js";

const TRANSFER_STEP = { preparing: "2/3", starting: "3/3" };

export function providerTransferState(e, job) {
  e.providerTransfer = job && !["done", "failed"].includes(job.phase) ? job : null;
  const composer = e.host.querySelector(".sv-composer");
  let status = e.host.querySelector(".sv-provider-transfer");
  if (!status && job) {
    status = document.createElement("div");
    status.className = "sv-provider-transfer";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    composer?.before(status);
  }
  if (!status) return;
  const labels = {
    waiting: "waiting for the current turn before changing providers…",
    preparing: "preparing the conversation for {agent}…",
    starting: "connecting to {agent}…",
    recovering: "restoring the previous provider…"
  };
  if (raycastOn()) return paintTransferBar(e, job, status, composer, labels);
  if (status.classList.contains("failed")) status.classList.remove("failed");
  status.textContent = job?.phase === "failed" ? phrase("could not change providers: {error}", { error: job.error })
    : e.providerTransfer ? phrase(labels[job.phase] || labels.preparing, { agent: providerName(job.agent) }) : "";
  status.hidden = !status.textContent;
  if (job?.phase === "waiting") {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = phrase("cancel provider change");
    cancel.addEventListener("click", () => svCmd(e, { type: "control", op: "cancelTransfer" }));
    status.appendChild(cancel);
  }
  composer?.setAttribute("aria-busy", e.providerTransfer ? "true" : "false");
}

function paintTransferBar(e, job, status, composer, labels) {
  const failed = job?.phase === "failed";
  const said = failed ? phrase("could not change providers: {error}", { error: esc(job.error || "") })
    : e.providerTransfer ? phrase(labels[job.phase] || labels.preparing, { agent: `<b>${esc(providerName(job.agent))}</b>` }) : "";
  status.hidden = !said;
  status.classList.toggle("failed", failed);
  if (!said) {
    status.textContent = "";
    return void composer?.setAttribute("aria-busy", "false");
  }
  const mark = failed ? `<svg class="warn" aria-hidden="true"><use href="#i-warn"/></svg>` : `<i class="spin" aria-hidden="true"></i>`;
  const step = TRANSFER_STEP[job.phase] ? `<span class="r">${TRANSFER_STEP[job.phase]}</span>` : "";
  status.innerHTML = `${mark}<span class="tx">${said}</span>${step}`;
  if (job.phase === "waiting") {
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.innerHTML = `${phrase("cancel provider change")}<span class="rc-key">esc</span>`;
    cancel.addEventListener("click", () => svCmd(e, { type: "control", op: "cancelTransfer" }));
    status.appendChild(cancel);
  }
  if (failed && job.agent && job.model) {
    const again = document.createElement("button");
    again.type = "button";
    again.textContent = phrase("Try again");
    again.addEventListener("click", () => switchSeatProvider(e, job.agent, job.model));
    status.appendChild(again);
  }
  composer?.setAttribute("aria-busy", e.providerTransfer ? "true" : "false");
}

export async function watchProviderTransfer(e) {
  if (e.transferWatching) return;
  e.transferWatching = true;
  try {
    while (e.host.isConnected) {
      const result = await svCmd(e, { type: "control", op: "transferStatus" });
      if (!result?.ok) {
        if (!e.providerTransfer) return;
        await new Promise((done) => setTimeout(done, 1500));
        continue;
      }
      const job = result.data;
      if (!job) { providerTransferState(e, null); return; }
      const wasChanging = !!e.providerTransfer;
      providerTransferState(e, job);
      if (["done", "failed"].includes(job.phase)) {
        if (!wasChanging) return;
        const selected = job.phase === "done" ? job : job.source;
        if (selected) { e.agent = selected.agent; e.model = selected.model; }
        e.catalog = null;
        e.catalogPull = null;
        e.catalogError = "";
        e.effort = "";
        e.account = undefined;
        paintPills(e);
        await refreshCatalog(e, true);
        refreshContext(e);
        pull();
        return;
      }
      await new Promise((done) => setTimeout(done, 1000));
    }
  } finally { e.transferWatching = false; }
}

export async function switchSeatProvider(e, agent, model) {
  closeSeatPicker(e);
  if (e.providerTransfer) return;
  providerTransferState(e, { agent, model, phase: "preparing" });
  const result = await svCmd(e, { type: "control", op: "switchProvider", agent, model });
  if (!result?.ok && !result?.silent) {
    providerTransferState(e, { phase: "failed", error: result.error || phrase("the session did not answer") });
    return;
  }
  void watchProviderTransfer(e);
}
