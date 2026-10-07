import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, views } from "./dom.mjs";

await views();

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const seats = readFileSync(join(HERE, "src", "app", "structured-seats.js"), "utf8");

const { getStructured, svReserve } = await app("chat-stretches");
const { paintActivity } = await app("structured-seats");

function slice(from, to) {
  const a = page.indexOf(from);
  const b = page.indexOf(to, a);
  assert.ok(a >= 0 && b > a, `could not cut ${from} … ${to} out of app.html`);
  return page.slice(a, b);
}

const FLOOR = 400;
let born = 0;

const laid = (el, top, bottom) => el.setAttribute("data-box", `${top},${bottom}`);
const boxOf = (el) => {
  const said = el.getAttribute("data-box");
  if (!said) return { top: 0, bottom: 0, height: 0 };
  const [top, bottom] = said.split(",").map(Number);
  return { top, bottom, height: bottom - top };
};
const scaleOf = (el) => {
  for (let at = el; at; at = at.parentElement) {
    const said = at.getAttribute?.("data-scale");
    if (said) return Number(said);
  }
  return 1;
};
Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return boxOf(this).height; } });
window.HTMLElement.prototype.getBoundingClientRect = function () {
  const box = boxOf(this);
  const k = scaleOf(this);
  return { top: box.top * k, bottom: box.bottom * k, height: box.height * k, left: 0, right: 0, width: 0 };
};

function seat({ composerTop = 300, tab = 0, floating = [] } = {}) {
  const e = getStructured({ name: `sv-${++born}`, where: "local" });
  document.body.appendChild(e.host);
  laid(e.host, 0, FLOOR);
  laid(e.scroll, 0, FLOOR);
  Object.defineProperty(e.scroll, "scrollHeight", { value: 1000, configurable: true, writable: true });
  e.scroll.scrollTop = 0;
  const composer = e.host.querySelector(".sv-composer");
  composer.style.marginTop = "0px";
  laid(composer, composerTop, FLOOR);
  laid(e.host.querySelector(".sv-activity"), composerTop - tab, tab ? composerTop : composerTop - tab);
  for (const one of floating) {
    const el = document.createElement("div");
    el.style.position = one.position;
    laid(el, one.top, one.bottom);
    e.host.appendChild(el);
  }
  return e;
}

const box = (top, bottom, position) => ({ top, bottom, position });

const grow = (e, composerTop) => laid(e.host.querySelector(".sv-composer"), composerTop, FLOOR);

test("the badge riding on top of the composer is part of the room the chat keeps clear", () => {
  const e = seat({ composerTop: 300, tab: 24 });
  svReserve(e);
  assert.equal(e.reserved, 162);
  assert.equal(e.scroll.style.paddingBottom, "162px");
  assert.equal(e.scroll.style.getPropertyValue("--sv-fade"), "162px");
  assert.equal(e.scroll.style.getPropertyValue("--sv-air"), "38px");
});

test("with no badge showing the room is the composer alone", () => {
  const e = seat({ composerTop: 300, tab: 0 });
  svReserve(e);
  assert.equal(e.reserved, 138);
});

test("the quote button floating over a selection up in the chat reserves no room at all", () => {
  const e = seat({ composerTop: 300, floating: [box(40, 62, "absolute")] });
  svReserve(e);
  assert.equal(e.reserved, 138);
});

test("a composer that grows pins the chat to the end again, so it never lands on the last message", () => {
  const e = seat({ composerTop: 300 });
  svReserve(e);
  e.scroll.scrollTop = 0;
  grow(e, 200);
  svReserve(e);
  assert.equal(e.reserved, 238);
  assert.equal(e.scroll.scrollTop, e.scroll.scrollHeight);
});

test("a reader who scrolled up is left where they are", () => {
  const e = seat({ composerTop: 200 });
  e.atBottom = false;
  e.scroll.scrollTop = 120;
  svReserve(e);
  assert.equal(e.scroll.scrollTop, 120);
});

test("a card still flying — the wall re-laying itself, the plane zoomed in — reserves the room it lands with, not the room the animation shows", () => {
  const e = seat({ composerTop: 300 });
  e.host.setAttribute("data-scale", "2");
  svReserve(e);
  assert.equal(e.reserved, 138);
});

test("a card flying the other way, shrinking into the wall, keeps the same room", () => {
  const e = seat({ composerTop: 300 });
  e.host.setAttribute("data-scale", "0.5");
  svReserve(e);
  assert.equal(e.reserved, 138);
});

test("the composer's own margin counts once, in the size the card will settle at", () => {
  const e = seat({ composerTop: 300 });
  e.host.querySelector(".sv-composer").style.marginTop = "8px";
  e.host.setAttribute("data-scale", "2");
  svReserve(e);
  assert.equal(e.reserved, 146);
});

test("the fade band lives in the air the chat reserves, never on the last line", () => {
  const css = slice(".sv-scroll {", ".sv-subs, .sv-queue");
  assert.match(css, /#000 calc\(100% - var\(--sv-fade\)\), transparent calc\(100% - var\(--sv-fade\) \+ var\(--sv-air\)\)/);
  assert.ok(!/var\(--sv-fade\) - \d+px/.test(css), "the band must not start above where the transcript comes to rest");
});

test("the badge hangs off the composer itself, not off a row of its own", () => {
  const e = seat();
  const badges = [...e.host.querySelectorAll(".sv-activity")];
  assert.equal(badges.length, 1);
  assert.ok(badges[0].parentElement.classList.contains("sv-composer"), "the activity badge belongs inside the composer form");
  assert.equal(badges[0].parentElement.tagName, "FORM");
});

test("the badge never lands on the queue tray — the tray gives it the room", () => {
  const css = slice(".sv-activity { position: absolute", ".sv-jump-anchor");
  assert.match(css, /\.sv:has\(\.sv-activity\.on\) \.sv-queue\.on \{ margin-bottom:/);
  assert.match(css, /:not\(:has\(\.sv-queue\.on\)\) \.sv-subs\.on \{ margin-bottom:/);
});

test("the badge does not repeat the queue the tray is already showing", () => {
  const e = seat();
  e.activity = "writing the file";
  e.activitySince = 0;
  e.queuedEls = [document.createElement("div"), document.createElement("div")];
  paintActivity(e);
  const strip = e.host.querySelector(".sv-activity");
  assert.equal(strip.classList.contains("on"), true);
  assert.equal(strip.querySelector(".verb").textContent, "writing the file");
  assert.equal(strip.textContent.trim(), "writing the file", "the tray under it lists every queued message by hand");
  assert.doesNotMatch(seats.slice(seats.indexOf("function paintActivity(e)"), seats.indexOf("function refreshContext")), /queued/);
});
