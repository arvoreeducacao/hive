import { api, apiGet, apiPost } from "/assets/api.mjs";
import { $, esc, phrase } from "./core.js";

const LOOK_AGAIN = 2500;

let watching = null;

export function slackStateSaid(state) {
  const link = state?.link || {};
  if (state?.relayed === false && state?.running) return { text: phrase("connected with this machine's own slack keys"), worry: false };
  if (link.pending) return { text: phrase("waiting for the code on slack…"), worry: false };
  if (link.linked && state?.running) return { text: `${phrase("connected")} · <b>${esc(link.linked)}</b>`, worry: false };
  if (link.linked) return { text: phrase("connected, but the bot cannot be reached right now"), worry: true };
  if (link.trouble) return { text: esc(link.trouble), worry: true };
  if (!link.relay) return { text: phrase("this hive does not know where the team's bot lives"), worry: true };
  return { text: phrase("not connected"), worry: false };
}

function paint(state) {
  const said = slackStateSaid(state);
  $("slack-state").innerHTML = said.worry ? `<span class="worry">${said.text}</span>` : said.text;
  const link = state?.link || {};
  const pending = link.pending;
  $("slack-code-box").hidden = !pending;
  $("slack-code").textContent = pending ? pending.code : "";
  const ownKeys = state?.relayed === false && state?.running;
  $("slack-connect").hidden = !!link.linked || !!pending || ownKeys || !link.relay;
  $("slack-forget").hidden = !link.linked;
}

async function look() {
  try { paint(await apiGet("/api/slack")); }
  catch { $("slack-state").innerHTML = `<span class="worry">${phrase("the hive did not answer")}</span>`; }
}

function keepLooking() {
  if (watching) return;
  watching = setInterval(() => {
    if (!$("help").classList.contains("on")) { clearInterval(watching); watching = null; return; }
    look();
  }, LOOK_AGAIN);
}

$("pref-nav").addEventListener("click", (e) => {
  if (e.target.closest("button[data-pane]")?.dataset.pane !== "slack") return;
  look();
  keepLooking();
});

$("slack-connect").addEventListener("click", async () => {
  $("slack-connect").disabled = true;
  try {
    await apiPost("/api/slack/link", {});
  } catch {
    $("slack-state").innerHTML = `<span class="worry">${phrase("the team's bot did not answer — try again in a moment")}</span>`;
  } finally {
    $("slack-connect").disabled = false;
  }
  await look();
  keepLooking();
});

$("slack-forget").addEventListener("click", async () => {
  try { await api("/api/slack/link", { method: "DELETE" }); } catch {}
  await look();
});
