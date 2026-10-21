import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { app } from "./dom.mjs";
import { speak } from "../assets/i18n.mjs";

const { paintStamp, stampClock, stampDate } = await app("structured-seats");
const inbox = readFileSync(new URL("../assets/structures/inbox.css", import.meta.url), "utf8");
const page = readFileSync(new URL("../app.html", import.meta.url), "utf8");

const at = new Date(2026, 9, 21, 14, 41).getTime();
const day = 86400000;
const time = (when) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(when));

test("a stamp from today is the clock time alone", () => {
  assert.equal(stampClock(at, at + 3 * 3600000), time(at));
});

test("a stamp from yesterday says so, in the language the app speaks", () => {
  assert.equal(stampClock(at, at + day), `yesterday at ${time(at)}`);
  speak("pt-BR");
  try {
    assert.equal(stampClock(at, at + day), "ontem às 14:41");
  } finally {
    speak("en");
  }
});

test("an older stamp carries its date, and the year only when it is not this one", () => {
  const dated = (when, extra) => `${new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric", ...extra }).format(new Date(when))} ${time(when)}`;
  assert.equal(stampClock(at - 8 * day, at), dated(at - 8 * day, {}));
  const lastYear = new Date(2025, 11, 30, 9, 5).getTime();
  assert.equal(stampClock(lastYear, at), dated(lastYear, { year: "numeric" }));
  assert.equal(stampClock(Number.NaN, at), "");
});

test("the stamp keeps the relative time, adds the clock, and hangs the full date on hover", () => {
  const block = document.createElement("div");
  block.className = "sv-msg stamped";
  block.dataset.at = String(at);
  paintStamp(block);
  const when = block.querySelector(".sv-stamp .st-when");
  assert.match(when.querySelector(".st-ago").textContent, / ago$/);
  assert.equal(when.querySelector(".st-clock").textContent, stampClock(at));
  assert.equal(when.title, stampDate(at));
  assert.match(when.title, /2026/);
});

test("only the inbox swaps to the clock and keeps the footer out of sight until the message is hovered", () => {
  assert.match(page, /\.sv-stamp \.st-clock \{ display: none; \}/, "every other structure keeps saying how long ago");
  assert.match(inbox, /\.sv-msg\.stamped > \.sv-stamp \{ opacity: 0;/);
  for (const shown of [":hover", ":focus-within", ".lit"]) assert.ok(inbox.includes(`.sv-msg.stamped${shown} > .sv-stamp`), `the footer shows on ${shown}`);
  assert.match(inbox, /@media \(pointer: coarse\)/, "a touch screen has no hover, so the footer stays");
  assert.match(inbox, /\.sv-stamp \.st-ago \{ display: none; \}/);
});
