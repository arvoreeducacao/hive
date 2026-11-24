import { seatAgent } from "./chat-and-panes.js";
import { phrase, st } from "./core.js";
import { goTo, pull } from "./focus-navigation.js";
import { seatLabel } from "./pure-helpers.js";
import { svAppend, svLine } from "./structured-seats.js";

const ARRIVE_TRIES = 20;
const ARRIVE_EVERY_MS = 500;

const forking = new Set();

const FORK_ICON = '<svg class="fk-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9"/><path d="M12 12v3"/></svg>';

function seatForks(e) {
  if (!e?.conv || e.mirror || (e.where && e.where !== "local") || seatAgent(e) !== "claude") return false;
  return !st.data?.sessions?.find((one) => one.name === e.name)?.anon;
}

function endsTheTurn(e, answer) {
  for (let next = answer.nextElementSibling; next; next = next.nextElementSibling) {
    if (next.classList.contains("sv-user")) return true;
    if (next.classList.contains("sv-msg")) return false;
  }
  return !e.turnOpen;
}

function forkable(e, answer) {
  if (!answer?.classList.contains("sv-msg") || !answer.classList.contains("stamped")) return false;
  return Number(answer.dataset.seq) > 0 && seatForks(e) && endsTheTurn(e, answer);
}

function paintForkButton(e, answer) {
  const stamp = answer?.querySelector(":scope > .sv-stamp");
  if (!stamp) return;
  let button = stamp.querySelector(":scope > .st-fork");
  if (!forkable(e, answer)) return void button?.remove();
  if (button) return;
  button = document.createElement("button");
  button.type = "button";
  button.className = "st-fork";
  button.title = phrase("Fork from this response");
  button.setAttribute("aria-label", button.title);
  button.innerHTML = `<svg aria-hidden="true"><use href="#i-fork"/></svg>`;
  button.addEventListener("click", (ev) => {
    ev.stopPropagation();
    forkFrom(e, answer, button);
  });
  stamp.append(button);
}

async function arrive(name) {
  for (let tries = 0; tries < ARRIVE_TRIES; tries++) {
    await pull();
    if ((st.data?.sessions || []).some((one) => one.name === name)) {
      goTo(name);
      return true;
    }
    await new Promise((done) => setTimeout(done, ARRIVE_EVERY_MS));
  }
  return false;
}

async function forkFrom(e, answer, button) {
  const seq = Number(answer.dataset.seq);
  if (!seq || forking.has(e.name)) return;
  forking.add(e.name);
  button.disabled = true;
  button.classList.add("busy");
  const title = st.data?.sessions?.find((one) => one.name === e.name)?.title || "";
  let said = null;
  try {
    const reply = await fetch("/api/chat/fork", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: e.name, seq, title }) });
    said = await reply.json();
  } catch (wrong) {
    said = { error: String(wrong?.message || wrong) };
  }
  forking.delete(e.name);
  button.disabled = false;
  button.classList.remove("busy");
  if (!said?.ok) return void svLine(e, "sv-meta warn", said?.error || phrase("the fork did not open"));
  if (!(await arrive(said.name))) svLine(e, "sv-meta warn", phrase("the fork did not open — it stopped as it started, and its conversation is in the history"));
}

function svForked(e, ev) {
  const source = String(ev.from || "");
  const live = (st.data?.sessions || []).find((one) => one.name === source);
  const el = document.createElement("div");
  el.className = "sv-forked";
  el.innerHTML = `<span class="fk-line" aria-hidden="true"></span><button type="button" class="fk-pill">${FORK_ICON}<span class="fk-label"></span></button><span class="fk-line" aria-hidden="true"></span>`;
  const button = el.querySelector(".fk-pill");
  el.querySelector(".fk-label").textContent = phrase("Forked from {chat}", { chat: (live && seatLabel(live)) || ev.title || source || phrase("conversation") });
  button.title = phrase("Open source conversation");
  button.setAttribute("aria-label", button.title);
  button.disabled = !live;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (source) goTo(source);
  });
  svAppend(e, el);
}

export { forkable, paintForkButton, svForked };
