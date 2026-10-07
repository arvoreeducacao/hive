import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PT_BR } from "../assets/i18n.mjs";
import { app, state, views } from "./dom.mjs";
import { test } from "node:test";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");

const st = await state();
await views();
const { ACTIONS } = await app("core");
const shelf = await app("shelf");
const { LIVE_AFTER_MS } = await import("../src/panels/shelf.jsx").catch(() => ({ LIVE_AFTER_MS: 300 }));
const { SHELF_BANDS, SHELF_TABS, closeShelf, openShelf, openShelfPage, paintPageChrome, shelfBandOf, shelfBandShut, shelfCardChips, shelfDeepLink, shelfGithubUrl, shelfLabelState, shelfOnScreen, shelfRows, shelfStatesOf, shelfTabsOf, shelfVersionsOf } = shelf;
await app("hold-numbers");
await app("themes");

globalThis.fetch = async () => ({ ok: true, text: async () => "{}", json: async () => ({ pages: [] }) });

const seed = (next) => { st.shelf = next; };
const filters = (who, state_, query) => { st.shelfWho = who; st.shelfState = state_; st.shelfQuery = query; };

const pageOf = (over = {}) => ({
  slug: "atividade-com-etapas",
  title: "Uma atividade, N etapas",
  description: "RFC · plataforma",
  owner: "joao",
  label: "in-review",
  at: 1_700_000_000_000,
  tabs: { documento: { versions: [{ n: 1, label: "draft", at: 1 }, { n: 2, label: "in-review", at: 2 }] } },
  ...over
});

test("the label the page carries decides which state it filters under", () => {
  assert.equal(shelfLabelState("in-review-after-the-team-read-it"), "in-review");
  assert.equal(shelfLabelState("decided-d1"), "decided");
  assert.equal(shelfLabelState("delivered"), "delivered");
  assert.equal(shelfLabelState("qualquer-coisa"), "");
  assert.equal(shelfLabelState(undefined), "");
});

test("a page shelved before the labels turned english still filters under its state", () => {
  assert.equal(shelfLabelState("em-revisao-virada-etapas"), "in-review");
  assert.equal(shelfLabelState("rascunho"), "draft");
  assert.equal(shelfLabelState("entregue"), "delivered");
  assert.equal(shelfLabelState("encerrado"), "closed");
});

test("a tab the desktop does not know yet is shown at the end instead of hidden", () => {
  assert.deepEqual(SHELF_TABS, ["documento", "telas", "plano", "lente", "prints"]);
  assert.deepEqual(shelfTabsOf(pageOf({
    tabs: { lente: { versions: [{ n: 1 }] }, plano: { versions: [{ n: 1 }] }, inventada: { versions: [{ n: 1 }] }, documento: { versions: [{ n: 1 }] } }
  })), ["documento", "plano", "lente", "inventada"]);
});

test("the ruler shows the lente tab once something was published into it, and opens on it", () => {
  const withLens = pageOf({
    tabs: {
      documento: { versions: [{ n: 1, label: "draft", at: 1 }] },
      lente: { versions: [{ n: 1, label: "draft", at: 2 }, { n: 2, label: "in-review", at: 3 }] }
    }
  });
  seed({ me: "joao", pages: [withLens] });
  filters("team", "", "");
  openShelf();
  openShelfPage(withLens, "lente");
  const tabs = [...document.getElementById("sh-tabs").querySelectorAll(".sh-tab")];
  assert.deepEqual(tabs.map((b) => b.firstChild.textContent), ["documento", "lente"]);
  const lens = tabs[1];
  assert.equal(lens.getAttribute("aria-selected"), "true");
  assert.equal(lens.querySelector("i").textContent, "v2");
  assert.equal(st.shelfTab, "lente");
  assert.match(document.getElementById("sh-frame").dataset.here, /tab=lente&v=2/);
  closeShelf();
});

test("a tab only exists when something was actually published into it", () => {
  assert.deepEqual(shelfTabsOf(pageOf()), ["documento"]);
  assert.deepEqual(shelfTabsOf(pageOf({
    tabs: { documento: { versions: [{ n: 1 }] }, telas: { versions: [{ n: 1 }] } }
  })), ["documento", "telas"]);
  assert.deepEqual(shelfTabsOf(pageOf({ tabs: { telas: { versions: [] } } })), []);
  assert.deepEqual(shelfTabsOf(null), []);
  assert.deepEqual(shelfVersionsOf(pageOf(), "telas"), []);
});

test("mine hides other people's pages and the team's hides nobody", () => {
  seed({ me: "joao", pages: [pageOf(), pageOf({ slug: "outra", owner: "marina" })] });
  filters("mine", "", "");
  assert.deepEqual(shelfRows().map((p) => p.slug), ["atividade-com-etapas"]);
  filters("team", "", "");
  assert.equal(shelfRows().length, 2);
});

const deliveredPage = (over = {}) => pageOf({
  slug: "b", label: "delivered",
  tabs: { documento: { versions: [{ n: 1, label: "delivered", at: 3 }] } },
  ...over
});

const splitPage = (over = {}) => pageOf({
  slug: "missao-partida", label: "in-review-plano",
  tabs: {
    documento: { versions: [{ n: 1, label: "draft", at: 1 }, { n: 2, label: "decided", at: 2 }] },
    telas: { versions: [{ n: 1, label: "decided", at: 2 }] },
    plano: { versions: [{ n: 1, label: "in-review", at: 3 }] }
  },
  ...over
});

test("the state chip filters by the whole family, not by the exact label", () => {
  seed({ me: "joao", pages: [pageOf({ label: "in-review-virada-etapas" }), deliveredPage()] });
  filters("team", "in-review", "");
  assert.deepEqual(shelfRows().map((p) => p.slug), ["atividade-com-etapas"]);
  filters("team", "closed", "");
  assert.deepEqual(shelfRows(), []);
});

test("a mission whose plan is still in review is found by both filters, not only by the newest tab", () => {
  assert.deepEqual(shelfStatesOf(splitPage()).sort(), ["decided", "in-review"]);
  seed({ me: "joao", pages: [splitPage()] });
  filters("team", "in-review", "");
  assert.deepEqual(shelfRows().map((p) => p.slug), ["missao-partida"]);
  filters("team", "decided", "");
  assert.deepEqual(shelfRows().map((p) => p.slug), ["missao-partida"]);
  filters("team", "delivered", "");
  assert.deepEqual(shelfRows(), []);
});

test("the card says the state of the documento and names only the tab that disagrees", () => {
  assert.deepEqual(shelfCardChips(splitPage()).map((chip) => chip.say), ["decided", "plano · in-review"]);
  assert.deepEqual(shelfCardChips(pageOf()).map((chip) => chip.say), ["in-review"]);
  assert.deepEqual(shelfCardChips(pageOf({ label: "", tabs: { documento: { versions: [{ n: 1, label: "panorama" }] } } }))
    .map((chip) => chip.say), ["panorama"]);
});

test("a page lands in the band of the soonest state any of its tabs is in", () => {
  assert.equal(shelfBandOf(splitPage()).key, "waiting");
  assert.equal(shelfBandOf(pageOf({ label: "decided", tabs: { documento: { versions: [{ n: 1, label: "decided" }] } } })).key, "building");
  assert.equal(shelfBandOf(deliveredPage()).key, "done");
  assert.equal(shelfBandOf(pageOf({ label: "qui-27-08-duplicatas-bot", tabs: { documento: { versions: [{ n: 1, label: "qui-27-08-duplicatas-bot" }] } } })).key, "stateless");
});

test("a band a filter asked for opens itself, so the chip never answers with a folded band", () => {
  const done = SHELF_BANDS.find((band) => band.key === "done");
  filters("team", "", "");
  assert.equal(shelfBandShut(done), true);
  filters("team", "delivered", "");
  assert.equal(shelfBandShut(done), false);
  filters("team", "", "");
});

test("the bands the shelf shows are the four the team decided on, and only what already happened starts folded", () => {
  assert.deepEqual(SHELF_BANDS.map((band) => band.key), ["waiting", "building", "stateless", "done"]);
  assert.deepEqual(SHELF_BANDS.filter((band) => band.shut).map((band) => band.key), ["stateless", "done"]);
});

test("search looks at the title, the description and the name of the folder", () => {
  seed({ me: "joao", pages: [pageOf(), pageOf({ slug: "crm", title: "CRM", description: "sdr-engine" })] });
  filters("team", "", "sdr");
  assert.deepEqual(shelfRows().map((p) => p.slug), ["crm"]);
  filters("team", "", "ETAPAS");
  assert.deepEqual(shelfRows().map((p) => p.slug), ["atividade-com-etapas"]);
  filters("team", "", "nada disso");
  assert.deepEqual(shelfRows(), []);
});

test("the github link points at the file, and stays quiet when the repo url is not one", () => {
  seed({ repo: "https://github.com/arvoreeducacao/artefatos", pages: [] });
  assert.equal(
    shelfGithubUrl(pageOf(), "documento", 2),
    "https://github.com/arvoreeducacao/artefatos/blob/HEAD/a/atividade-com-etapas/documento.v2.html"
  );
  seed({ repo: "git@github.com:arvoreeducacao/artefatos.git", pages: [] });
  assert.equal(shelfGithubUrl(pageOf(), "documento", 2), "");
  seed({ repo: "", pages: [] });
  assert.equal(shelfGithubUrl(pageOf(), "documento", 2), "");
});

test("copy link hands the hive link of the shelf page, never the leaf or github one", () => {
  const leafed = pageOf({ url: "https://docs.example.com/doc/abc" });
  assert.equal(shelfDeepLink(leafed, "documento", 2), "hive://shelf/atividade-com-etapas?tab=documento&v=2");
  assert.equal(shelfDeepLink(leafed, "telas", 0), "hive://shelf/atividade-com-etapas?tab=telas");
  assert.equal(shelfDeepLink(leafed, "", 0), "hive://shelf/atividade-com-etapas");
});

test("every string the shelf shows has a portuguese twin", () => {
  const said = [
    "shelf", "Shelf", "mine", "the team's", "pages", "no label yet", "search",
    "copy link", "see on GitHub", "back to the shelf", "the page this team published",
    "the shelf — every page this team published", "The pages this team published",
    "Nothing here with those filters.",
    "Nothing on the shelf yet — the first page you publish lands here, draft and all.",
    "draft", "in-review", "decided", "delivered", "closed",
    "tabs", "waiting on someone", "being built", "no state", "already done"
  ];
  for (const one of said) assert.ok(PT_BR[one], `no pt-BR for "${one}"`);
});

test("the shelf markup and the strings it needs are wired into the page", () => {
  for (const id of ["shelf", "sh-gal", "sh-view", "sh-tabs", "sh-frame", "sh-back", "sh-copy", "sh-gh", "btn-shelf", "k-shelf"]) {
    assert.ok(page.includes(`id="${id}"`), `app.html has no #${id}`);
  }
  const frame = page.slice(page.indexOf('<iframe id="sh-frame"')).slice(0, 200);
  assert.match(frame, /sandbox="allow-scripts allow-popups"/);

  st.shelf = { me: "joao", repo: "https://github.com/arvoreeducacao/artefatos", pages: [pageOf()] };
  st.shelfWho = "team"; st.shelfState = ""; st.shelfQuery = "";
  st.shelfOpen = null;
  openShelf();
  const card = document.getElementById("sh-gal").querySelector(".sh-card");
  assert.equal(card.querySelector("iframe"), null, "a card holds no live page until someone lingers on it");
  assert.equal(card.querySelector("img"), null, "and a page with no picture yet shows the empty well");

  assert.ok(ACTIONS.some(([name, said]) => name === "shelf" && said === "the shelf — every page this team published"));
});

const linger = () => new Promise((done) => setTimeout(done, LIVE_AFTER_MS + 60));

test("a card shows the picture of the page, and the page itself only while the pointer rests on it", async () => {
  const shelved = { me: "joao", repo: "https://github.com/arvoreeducacao/artefatos", pages: [pageOf({ thumbs: { documento: 1 } })] };
  const saved = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify(shelved), json: async () => shelved });
  st.shelf = shelved;
  st.shelfWho = "team"; st.shelfState = ""; st.shelfQuery = "";
  st.shelfOpen = null;
  openShelf();
  await new Promise((done) => setTimeout(done, 0));
  const card = document.getElementById("sh-gal").querySelector(".sh-card");
  const img = card.querySelector("img.sh-img");
  assert.equal(img.getAttribute("src"), "/api/shelf/thumb?slug=atividade-com-etapas&tab=documento&v=1");
  assert.equal(img.getAttribute("loading"), "lazy");
  assert.equal(card.querySelector("iframe"), null);

  card.dispatchEvent(new window.Event("pointerenter"));
  card.dispatchEvent(new window.Event("pointerleave"));
  await linger();
  assert.equal(card.querySelector("iframe"), null, "passing over a card does not load it");

  card.dispatchEvent(new window.Event("pointerenter"));
  await linger();
  const live = card.querySelector("iframe");
  assert.equal(live.getAttribute("sandbox"), "allow-scripts", "a page on a card runs with no door out of its frame");
  assert.equal(live.getAttribute("aria-hidden"), "true");
  assert.equal(live.getAttribute("src"), "/api/shelf/page?slug=atividade-com-etapas&tab=documento&v=2");

  card.dispatchEvent(new window.Event("pointerleave"));
  assert.equal(card.querySelector("iframe"), null, "and it goes the moment the pointer leaves");

  card.dispatchEvent(new window.Event("pointerenter"));
  await linger();
  assert.ok(card.querySelector("iframe"));
  closeShelf();
  assert.equal(document.getElementById("sh-gal").querySelector("iframe"), null, "closing the shelf leaves no page alive behind it");
  globalThis.fetch = saved;
});

const showing = () => !document.getElementById("shelf").hidden;

const press = (key, mods = {}) => document.dispatchEvent(new window.KeyboardEvent("keydown", {
  key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, bubbles: true, cancelable: true,
  altKey: !!mods.alt, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, metaKey: !!mods.meta
}));

const onTheShelf = (open = null) => {
  seed({ me: "joao", pages: [pageOf()] });
  filters("team", "", "");
  openShelf();
  st.shelfOpen = open;
  st.typing = null;
};

test("the key that opens the shelf is the key that closes it", () => {
  closeShelf();
  assert.equal(shelfOnScreen(), false);
  st.keys = { ...st.keys, shelf: { alt: true, code: "KeyE" } };
  seed({ me: "joao", pages: [pageOf()] });
  press("e", { alt: true });
  assert.equal(showing(), true);
  press("e", { alt: true });
  assert.equal(showing(), false, "a shortcut with a modifier still gets through, so ⌥E closes the shelf again");
});

test("esc closes the shelf when the gallery is what you are looking at", () => {
  onTheShelf();
  press("Escape");
  assert.equal(showing(), false);
  assert.equal(st.shelfOpen, null);
});

test("esc on an open page goes back to the gallery instead of leaving the shelf", () => {
  onTheShelf("atividade-com-etapas");
  press("Escape");
  assert.equal(showing(), true, "the shelf itself stays");
  assert.equal(st.shelfOpen, null, "and the page it was showing is let go");
  closeShelf();
});

test("the arrow and esc take the same way back, so they cannot drift apart", () => {
  onTheShelf("atividade-com-etapas");
  document.getElementById("sh-back").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.equal(st.shelfOpen, null);
  assert.equal(showing(), true);
  closeShelf();
});

test("a bare key never reaches the seats sitting behind the shelf", () => {
  st.keys = { ...st.keys, shelf: { code: "KeyE" } };
  closeShelf();
  seed({ me: "joao", pages: [pageOf()] });
  press("e");
  assert.equal(showing(), true, "the bare key does reach the app when nothing is over it");
  press("e");
  assert.equal(showing(), true, "but the shelf swallows it instead of handing it on");
  closeShelf();
  st.keys = { ...st.keys, shelf: { alt: true, code: "KeyE" } };
});

test("the number on a tab is the version it shows, not how many were kept", () => {
  const kept = Array.from({ length: 12 }, (_, at) => ({ n: at + 6, label: "delivered", at: at + 6 }));
  const host = document.createElement("div");
  paintPageChrome(host, {
    page: pageOf({ tabs: { documento: { versions: [{ n: 1, label: "draft", at: 1 }] }, telas: { versions: kept } } }),
    tab: "telas",
    version: 0,
    onTab: () => {},
    onVersion: () => {}
  });
  const chips = [...host.querySelectorAll(".sh-tab i")].map((one) => one.textContent);
  const rail = [...host.querySelectorAll(".sh-ver")].map((one) => one.textContent);
  assert.deepEqual(chips, ["v1", "v17"], "a tab that kept 12 of 17 still says v17");
  assert.equal(rail[0], "v17", "the rail counts the same way");
  assert.equal(rail.length, 12, "and it only offers what the shelf still has");
  assert.equal(chips[1], rail[0], "the tab and the newest on the rail never disagree");
});
