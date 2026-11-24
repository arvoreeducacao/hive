import { phrase } from "./core.js";

const PROMPT_MAX_CHARS = 120_000;

const promptExcess = (text) => Math.max(0, String(text ?? "").trim().length - PROMPT_MAX_CHARS);

function tooLongSaid(excess) {
  const vars = { excess: excess.toLocaleString(), limit: PROMPT_MAX_CHARS.toLocaleString() };
  return excess === 1
    ? phrase("Prompt is {excess} character over the {limit}-character limit. Shorten or split it before sending.", vars)
    : phrase("Prompt is {excess} characters over the {limit}-character limit. Shorten or split it before sending.", vars);
}

const alertOf = (host) => host.querySelector(".sv-composer .sv-too-long");

function clearTooLong(host) {
  alertOf(host)?.remove();
}

function paintTooLong(host, excess) {
  if (!excess) return void clearTooLong(host);
  const well = host.querySelector(".sv-composer .sv-well");
  if (!well) return;
  let alert = alertOf(host);
  if (!alert) {
    alert = document.createElement("p");
    alert.className = "sv-too-long";
    alert.setAttribute("role", "alert");
  }
  if (alert.previousElementSibling !== well) well.after(alert);
  alert.textContent = tooLongSaid(excess);
}

function refuseTooLong(host, text) {
  const excess = promptExcess(text);
  paintTooLong(host, excess);
  return excess > 0;
}

function followTooLong(host, textNow) {
  if (alertOf(host)) paintTooLong(host, promptExcess(textNow()));
}

export { PROMPT_MAX_CHARS, clearTooLong, followTooLong, promptExcess, refuseTooLong, tooLongSaid };
