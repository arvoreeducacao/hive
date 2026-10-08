import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

const asked = [];
const toldItIsReading = [];
let theWindowSaysLeave = null;
window.hiveWindow = {
  act: (what) => asked.push(what),
  readingAlone: (on) => toldItIsReading.push(on),
  onLeaveReading: (heard) => { theWindowSaysLeave = heard; }
};
const theScreen = () => document.documentElement.classList;

const st = await state();
await views();

const { closeShelf, openShelfPage, paintShelf, setShelfWide, shelfBack, shelfWideOn, toggleShelfWide } = await app("shelf");
const { screenWentBackToAWindow } = await app("screen-alone");

const PAGE = {
  slug: "publicar-sem-claude-ai",
  title: "Publicar sem claude.ai",
  label: "em-revisao",
  owner: "jonas",
  at: 1787428353481,
  tabs: { documento: { versions: [{ n: 1, label: "em-revisao", at: 1, bytes: 15150 }] } }
};

const OTHER = { ...PAGE, slug: "outra-pagina", title: "Outra página" };

function shelf({ open = PAGE.slug, wide = false, full = false } = {}) {
  asked.length = 0;
  toldItIsReading.length = 0;
  theScreen().toggle("fullscreen", full);
  document.getElementById("shelf").hidden = false;
  st.shelf = { repo: "https://github.com/acme/artifacts", me: "jonas", pages: [PAGE, OTHER] };
  st.shelfQuery = "";
  st.shelfWho = "team";
  st.shelfState = "";
  st.shelfShut = new Set();
  st.shelfAt = "";
  st.shelfOpen = open;
  st.shelfTab = "documento";
  st.shelfVersion = 0;
  st.shelfWide = wide;
  paintShelf();
  return {
    shelf: document.getElementById("shelf"),
    view: document.getElementById("sh-view"),
    head: document.getElementById("sh-vh"),
    wide: document.getElementById("sh-wide"),
    exit: document.getElementById("sh-narrow"),
    frame: document.getElementById("sh-frame")
  };
}

test("reading a page alone strips the chrome and leaves a way out", () => {
  const els = shelf();
  assert.equal(els.shelf.dataset.wide, "no");
  assert.equal(els.exit.hidden, true, "nothing to leave while the chrome is up");
  setShelfWide(true);
  assert.equal(els.shelf.dataset.wide, "yes");
  assert.equal(els.exit.hidden, false, "with the header gone, the way back has to be on the page");
  assert.equal(els.wide.getAttribute("aria-pressed"), "true");
  assert.equal(shelfWideOn(), true);
});

test("the button carries its own name — with no label inside it, the icon is all a reader gets", () => {
  const els = shelf();
  assert.equal(els.wide.textContent.trim(), "", "this one says what it does with an icon, not a word");
  assert.ok(els.wide.getAttribute("aria-label")?.trim(), "an icon with no name is a mystery to anyone not looking");
  assert.ok(els.wide.getAttribute("title")?.trim(), "and a mystery to anyone hovering it");
  assert.equal(els.wide.querySelector("svg use")?.getAttribute("href"), "#i-expand");
});

test("leaving the reading brings the header, the tabs and the footer back", () => {
  const els = shelf({ wide: true });
  toggleShelfWide();
  assert.equal(els.shelf.dataset.wide, "no");
  assert.equal(els.exit.hidden, true);
  assert.equal(els.wide.getAttribute("aria-pressed"), "false");
  assert.equal(shelfWideOn(), false);
});

test("the page keeps being the same one — reading alone is chrome, not navigation", () => {
  const els = shelf();
  const was = els.frame.dataset.here;
  setShelfWide(true);
  assert.equal(els.frame.dataset.here, was, "turning the chrome off must not reload the page");
});

test("going back to the gallery leaves the reading behind", () => {
  shelf({ wide: true });
  shelfBack();
  assert.equal(st.shelfWide, false, "the gallery would come back with no header otherwise");
  assert.equal(shelfWideOn(), false);
});

test("another page opens with its chrome up, whatever the last one was read like", () => {
  shelf({ wide: true });
  openShelfPage(OTHER, "documento");
  assert.equal(st.shelfWide, false);
  assert.equal(document.getElementById("shelf").dataset.wide, "no");
});

test("reading alone is refused with no page open — there would be nothing to read", () => {
  shelf({ open: null });
  setShelfWide(true);
  assert.equal(st.shelfWide, false);
  assert.equal(shelfWideOn(), false);
});

test("the whole screen means the whole screen — the window goes fullscreen with the page", () => {
  const els = shelf();
  setShelfWide(true);
  assert.deepEqual(asked, ["full"], "the page covering the app bar is not fullscreen, it is a page hiding the way out");
  assert.equal(els.shelf.dataset.wide, "yes");
  toggleShelfWide();
  assert.deepEqual(asked, ["full", "windowed"], "what the reading took, the reading gives back");
});

test("a window already fullscreen is left exactly as the person put it", () => {
  shelf({ full: true });
  setShelfWide(true);
  assert.deepEqual(asked, [], "it was already fullscreen — nothing to take");
  setShelfWide(false);
  assert.deepEqual(asked, [], "and nothing to give back: leaving must not windowed the person's own fullscreen");
});

test("closing the shelf from the reading gives the screen back too", () => {
  shelf();
  setShelfWide(true);
  closeShelf();
  assert.deepEqual(asked, ["full", "windowed"], "the shelf would close and leave the window stuck fullscreen");
  assert.equal(document.getElementById("shelf").dataset.wide, "no");
});

test("leaving fullscreen by the window brings the chrome back, instead of a page with no way out", () => {
  const els = shelf();
  setShelfWide(true);
  theScreen().remove("fullscreen");
  screenWentBackToAWindow();
  assert.equal(els.shelf.dataset.wide, "no", "in a window, that page would be sitting on top of the app bar");
  assert.deepEqual(asked, ["full"], "the window is already back — asking it again would fight the person");
});

test("esc gets out even with the page holding the keyboard — the reason it felt like a trap", () => {
  const els = shelf();
  setShelfWide(true);
  assert.ok(theWindowSaysLeave, "nobody is listening above the frame, so esc inside the page reaches no one");
  assert.deepEqual(toldItIsReading, [true], "the window has to know it is reading, or it will not spend escape on it");

  theWindowSaysLeave();

  assert.equal(els.shelf.dataset.wide, "no");
  assert.equal(shelfWideOn(), false);
  assert.deepEqual(asked, ["full", "windowed"], "and the screen comes back with it");
  assert.deepEqual(toldItIsReading, [true, false], "the window stops spending escape on a reading that ended");
});

test("the window stops being told to eat escape when the shelf closes", () => {
  shelf();
  setShelfWide(true);
  closeShelf();
  assert.equal(toldItIsReading.at(-1), false, "escape would keep being swallowed with no reading on screen");
});
