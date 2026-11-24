import { AGENT_NAMES, modelNamed, seatAgent } from "./chat-and-panes.js";
import { lucide, seatProject } from "./composer-models.js";
import { $, phrase, st } from "./core.js";
import { draftInFocus, draftTakesLink, openDraft, paintDraftHost } from "./draft-seat.js";
import { goTo } from "./focus-navigation.js";
import { hud, hudCopied } from "./hud.js";
import { focusedSeat } from "./mirror.js";
import { buildPromptLink, parsePromptLink, promptLinkErrorText, promptLinkable } from "./prompt-link-text.js";
import { providerName, providerReady } from "./providers.js";
import { structPool } from "./structured-seats.js";
import { blockText, toClipboard } from "./terminal-history.js";

const COPIED_FOR_MS = 2000;

const BOX_WAIT_STEPS = 25;

const BOX_WAIT_MS = 120;

const PR_URL = (pr) => `https://github.com/${pr.owner}/${pr.name}/pull/${pr.number}`;

function hiddenSaid(count) {
  return count === 1
    ? phrase("The Hive removed {count} hidden character. Read the prompt before you send it.", { count })
    : phrase("The Hive removed {count} hidden characters. Read the prompt before you send it.", { count });
}


function refuseLink(code) {
  hud({ icon: "i-warn", tone: "warn", text: phrase("Could not open the linked prompt"), mono: phrase(promptLinkErrorText(code)), stays: 0 });
}

function fillBox(textarea, text) {
  textarea.value = text;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
  textarea.setSelectionRange(text.length, text.length);
}

function placedSaid(hidden, notes) {
  if (hidden) return { icon: "i-warn", tone: "warn", text: phrase("This prompt had hidden characters, it may be malicious"), mono: [hiddenSaid(hidden), ...notes].join(" "), stays: 0 };
  return { icon: "i-check", text: phrase("Prompt added from a link"), mono: [phrase("Read it before you send."), ...notes].join(" ") };
}

function placeLinkedPrompt(textarea, text, { notes = [], hidden = 0, before = () => {} } = {}) {
  if (!textarea || !text) return false;
  const now = textarea.value.trim();
  const place = () => {
    before();
    fillBox(textarea, text);
    queueMicrotask(() => hud(placedSaid(hidden, notes)));
  };
  if (!now || now === text) {
    place();
    return true;
  }
  const ask = [phrase("This chat already has a draft. Replace it with the linked prompt?"), hidden ? hiddenSaid(hidden) : ""].filter(Boolean).join(" ");
  hud({ icon: "i-warn", tone: hidden ? "warn" : "ok", text: phrase("Linked prompt ready"), mono: ask, stays: 0, act: { label: phrase("Replace draft"), run: place } });
  return true;
}

async function boxOfSeat(name) {
  for (let step = 0; step < BOX_WAIT_STEPS; step++) {
    const box = structPool.get(name)?.box?.textarea;
    if (box?.isConnected) return box;
    await new Promise((later) => setTimeout(later, BOX_WAIT_MS));
  }
  return null;
}

async function openSeatPrompt(name, prompt, hidden = 0) {
  if (!(st.data?.sessions || []).some((one) => one.name === name)) {
    hud({ icon: "i-warn", tone: "warn", text: phrase("Could not open the linked prompt"), mono: phrase("no chat named {name} here", { name }), stays: 0 });
    return true;
  }
  goTo(name);
  if (!prompt) return true;
  const box = await boxOfSeat(name);
  if (!box) {
    hud({ icon: "i-warn", tone: "warn", text: phrase("Could not open the linked prompt"), mono: phrase("{name} has no composer to put it in", { name }), stays: 0 });
    return true;
  }
  return placeLinkedPrompt(box, prompt, { hidden });
}

function chatOfPullRequest(pr) {
  const repo = `${pr.owner}/${pr.name}`.toLowerCase();
  const alive = new Set((st.data?.sessions || []).map((one) => one.name));
  const found = (st.prs || []).find((p) => String(p.repo || "").toLowerCase() === repo && Number(p.number) === pr.number && alive.has(p.session));
  return found?.session || "";
}

async function settleLinkedModel(d, agent, model) {
  if (!agent || !model) return [];
  const row = modelNamed(d.e.catalog || [], model);
  if (row) {
    d.e.model = row.value;
    paintDraftHost(d);
    return [];
  }
  return [phrase("The link asked for {model}, which {provider} does not offer here, so its default model is used.", { model, provider: providerName(agent) })];
}

function openNewPrompt(said) {
  const d = openDraft();
  const textarea = d.e.host.querySelector("textarea");
  const notes = [];
  let agent = "";
  if (said.provider) {
    if (AGENT_NAMES[said.provider] && providerReady(said.provider)) agent = said.provider;
    else notes.push(phrase("The link asked for {provider}, which is not set up here, so your default model is used.", { provider: said.provider }));
  }
  const project = said.repo?.name || "";
  const wear = () => {
    Promise.resolve(draftTakesLink(d, { agent, model: "", project }))
      .then(() => settleLinkedModel(d, agent, said.model))
      .then((more) => {
        if (more.length) hud({ icon: "i-warn", tone: "warn", text: phrase("Prompt added from a link"), mono: more.join(" "), stays: 0 });
      })
      .catch(() => {});
  };
  return placeLinkedPrompt(textarea, said.prompt?.text || "", { notes, hidden: said.prompt?.hidden || 0, before: wear });
}

function openPrPrompt(said) {
  const seat = chatOfPullRequest(said.pr);
  if (seat) return openSeatPrompt(seat, said.prompt?.text || "", said.prompt?.hidden || 0);
  const text = said.prompt?.text ? `${PR_URL(said.pr)}\n\n${said.prompt.text}` : PR_URL(said.pr);
  return openNewPrompt({ ...said, prompt: { text, hidden: said.prompt?.hidden || 0 }, provider: "", model: "" });
}

function openPromptLink(raw) {
  const said = parsePromptLink(raw);
  if (!said) return false;
  if (!said.ok) {
    refuseLink(said.error);
    return true;
  }
  if (said.kind === "seat") {
    openSeatPrompt(said.seat, said.prompt.text, said.prompt.hidden);
    return true;
  }
  if (said.kind === "pr") {
    openPrPrompt(said);
    return true;
  }
  return openNewPrompt(said);
}

function repoOfProject(project) {
  const name = String(project || "").toLowerCase();
  if (!name) return null;
  const found = (st.prs || []).map((p) => String(p.repo || "")).find((repo) => repo.split("/").pop().toLowerCase() === name);
  const [owner, repoName] = found ? found.split("/") : [];
  return owner && repoName ? { owner, name: repoName } : null;
}

function composerInFocus() {
  const d = draftInFocus();
  if (d) return { e: d.e, textarea: d.e.host.querySelector("textarea") };
  let session = null;
  try { session = focusedSeat(); } catch {}
  const e = session ? structPool.get(session.name) : null;
  if (!e || e.mirror || !e.box?.textarea) return null;
  return { e, textarea: e.box.textarea };
}

function promptLinksOf(target) {
  const text = String(target?.textarea?.value || "").trim();
  if (!promptLinkable(text)) return { plain: "", rich: "" };
  const plain = buildPromptLink({ prompt: text });
  const repo = repoOfProject(seatProject(target.e));
  const model = target.e.model && target.e.model !== "default" ? target.e.model : "";
  const rich = repo ? buildPromptLink({ prompt: text, repo, provider: seatAgent(target.e), model }) : "";
  return { plain, rich };
}

async function copyPromptLink(link) {
  if (!link) return false;
  const ok = await toClipboard(link);
  if (ok) hudCopied(link, true);
  else hud({ icon: "i-warn", tone: "warn", text: phrase("Could not copy the prompt link"), mono: phrase("An error occurred.") });
  return ok;
}

function promptLinkOpenRow() {
  const raw = String($("pal-q")?.value || "").trim();
  const asked = raw ? parsePromptLink(raw) : null;
  if (!asked) return null;
  return {
    id: "prompt-link:open",
    icon: "i-bolt",
    name: phrase("Open prompt link"),
    ctx: asked.ok ? (asked.prompt?.text || "").replace(/\s+/g, " ").slice(0, 80) : phrase(promptLinkErrorText(asked.error)),
    search: raw.toLowerCase(),
    go: () => openPromptLink(raw)
  };
}

function promptLinkPaletteRows() {
  const rows = [];
  const links = promptLinksOf(composerInFocus());
  if (links.plain) rows.push({ icon: "i-copy", name: phrase("Copy prompt link"), ctx: phrase("a link that opens this prompt as a draft — nothing runs until someone sends it"), search: "copy share prompt link copiar compartilhar", go: () => copyPromptLink(links.plain) });
  if (links.rich) rows.push({ icon: "i-copy", name: phrase("Copy prompt link with repo and model"), ctx: phrase("the same link, with the repository and the model of this chat"), search: "copy share prompt link repository model copiar compartilhar repositório modelo", go: () => copyPromptLink(links.rich) });
  return rows;
}

function paintPromptLinkButton(e, el) {
  const stamp = el?.querySelector(":scope > .sv-stamp");
  if (!stamp) return;
  let button = stamp.querySelector(":scope > .st-link");
  if (!el.classList.contains("sv-user") || el.classList.contains("peer") || e.mirror) return void button?.remove();
  if (button) return;
  button = document.createElement("button");
  button.type = "button";
  button.className = "st-link";
  button.title = phrase("Copy prompt link");
  button.setAttribute("aria-label", phrase("Copy prompt link"));
  button.innerHTML = `${lucide("link", "mark")}${lucide("check", "tick")}`;
  button.addEventListener("click", async (ev) => {
    ev.stopPropagation();
    if (button.disabled) return;
    const link = buildPromptLink({ prompt: blockText(el) });
    if (!link) return;
    if (!(await copyPromptLink(link))) return;
    button.disabled = true;
    button.classList.add("said");
    setTimeout(() => {
      button.disabled = false;
      button.classList.remove("said");
    }, COPIED_FOR_MS);
  });
  const copy = stamp.querySelector(":scope > .st-copy");
  if (copy) copy.after(button);
  else stamp.append(button);
}

if (typeof window !== "undefined") window.hiveOpenPromptLink = (asked) => openPromptLink(typeof asked === "string" ? asked : asked?.link || "");

export { copyPromptLink, openPromptLink, paintPromptLinkButton, placeLinkedPrompt, promptLinkOpenRow, promptLinkPaletteRows, promptLinksOf, repoOfProject };
