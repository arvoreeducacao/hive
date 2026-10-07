import { test } from "node:test";
import assert from "node:assert/strict";
import { app, state, views } from "./dom.mjs";

Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 Hive/1.0 Electron/38.0.0", configurable: true });

const st = await state();
await views();
const { openArtifactUrl, webStateOf, wireLinks } = await app("chat-and-panes");

const URL_A = "https://claude.ai/code/artifact/aaa1";

const apple = (on) => Object.defineProperty(navigator, "platform", { value: on ? "MacIntel" : "Linux x86_64", configurable: true });

const opened = [];
window.open = (...how) => { opened.push(how); return null; };

function root(...hrefs) {
  const box = document.createElement("div");
  box.innerHTML = hrefs.map((href) => `<a href="${href}">link</a>`).join("");
  return { box, links: [...box.querySelectorAll("a")] };
}

const click = (link, over = {}) => link.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, ...over }));
const aux = (link, over = {}) => link.dispatchEvent(new window.MouseEvent("auxclick", { bubbles: true, cancelable: true, ...over }));

let born = 0;
const seat = () => {
  opened.length = 0;
  st.open = "";
  st.webChat = "";
  st.data = { sessions: [], spawning: [], archived: [], pod: {} };
  const name = `reader-${++born}`;
  webStateOf(name).tabs.length = 0;
  return name;
};

const tabsOf = (name) => webStateOf(name).tabs.map((t) => t.url).filter(Boolean);

test("only a link that is exactly a published page is claimed by the hive", () => {
  const name = seat();
  apple(true);
  const { box, links } = root(URL_A, "https://linear.app/arvore/issue/EXP-231", `${URL_A}?v=3`);
  wireLinks(name, box);
  const [art, elsewhere, versioned] = links;
  assert.equal(art.classList.contains("md-art"), true);
  assert.equal(art.dataset.here, "1");
  assert.equal(elsewhere.classList.contains("md-art"), false);
  assert.equal(versioned.classList.contains("md-art"), false);
});

test("clicking it opens the page in the seat's browser, not in a pane of its own", () => {
  const name = seat();
  apple(true);
  const { box, links } = root(URL_A);
  wireLinks(name, box);
  click(links[0]);
  assert.deepEqual(tabsOf(name), [URL_A]);
  assert.deepEqual(opened, [], "it never leaves for the person's own browser");
});

test("the hive no longer asks the server which seat kept that url", () => {
  const name = seat();
  const saved = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("the renderer stopped asking"); };
  openArtifactUrl(name, URL_A);
  assert.deepEqual(tabsOf(name), [URL_A]);
  globalThis.fetch = saved;
});

test("⌘+click hands the link to the person's own browser instead", () => {
  const name = seat();
  apple(true);
  const { box, links } = root(URL_A);
  wireLinks(name, box);
  click(links[0], { metaKey: true });
  assert.deepEqual(opened, [[URL_A, "_blank", "noopener,noreferrer"]]);
  assert.deepEqual(tabsOf(name), [], "the seat's browser was never asked");
});

test("the middle button does the same, and it only ever arrives as auxclick", () => {
  const name = seat();
  apple(true);
  const { box, links } = root(URL_A);
  wireLinks(name, box);
  aux(links[0], { button: 1 });
  assert.deepEqual(opened, [[URL_A, "_blank", "noopener,noreferrer"]]);
  assert.deepEqual(tabsOf(name), []);
});

test("ctrl+click on a mac is the context menu, so the link stays in the hive", () => {
  const name = seat();
  apple(true);
  const { box, links } = root(URL_A);
  wireLinks(name, box);
  click(links[0], { ctrlKey: true });
  assert.deepEqual(tabsOf(name), [URL_A]);
  assert.deepEqual(opened, []);
});

test("where there is no ⌘, ctrl is the chord and ⌘ is not", () => {
  const left = seat();
  apple(false);
  const out = root(URL_A);
  wireLinks(left, out.box);
  click(out.links[0], { ctrlKey: true });
  assert.deepEqual(opened, [[URL_A, "_blank", "noopener,noreferrer"]]);
  assert.deepEqual(tabsOf(left), []);

  const here = seat();
  apple(false);
  const stayed = root(URL_A);
  wireLinks(here, stayed.box);
  click(stayed.links[0], { metaKey: true });
  assert.deepEqual(opened, []);
  assert.deepEqual(tabsOf(here), [URL_A]);
});

test("the link says out loud that the chord exists", () => {
  apple(true);
  const mac = root(URL_A);
  wireLinks(seat(), mac.box);
  assert.match(mac.links[0].title, /⌘\+click/);
  apple(false);
  const linux = root(URL_A);
  wireLinks(seat(), linux.box);
  assert.match(linux.links[0].title, /ctrl\+click/);
});
