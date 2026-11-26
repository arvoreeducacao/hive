import { $, fullThemeDef, phrase, raycastOn, screenOpens, st, themeDef, wornThemeName } from "./core.js";
import { closeDay, dayOnScreen, openDay } from "./day.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { closeMore } from "./new-chat.js";
import { copyWithWord, followRaycast, footModel, leavePanel, openActions, panelOf, registerPanel, runAction } from "./panel-window.js";
import { giveTheScreenBack, takeTheScreen, whenTheScreenGoesBack } from "./screen-alone.js";
import { bytes, closePortaria, portariaOnScreen } from "./pod.js";
import { artClock } from "./subagents-dock.js";
import { toClipboard } from "./terminal-history.js";
import { closePrs, prsOnScreen } from "./thread.js";
import { closeUsage, usageOnScreen } from "./usage.js";
import { closeWorktrees, worktreesOnScreen } from "./worktrees.js";
import { SHELF_THUMB_W, mountPageChrome, mountShelf, shelfViewClosed } from "../panels/shelf.jsx";

const SHELF_STATES = ["draft", "in-review", "decided", "delivered", "closed"];

const EMBEDDED_TABS = new Set(["lente"]);

function wornThemeIsDark() {
  const bg = String(fullThemeDef(themeDef(wornThemeName())).ui.bg || "").replace("#", "");
  if (bg.length !== 6) return true;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(bg.slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}

function shelfFrameHints(tab) {
  if (!EMBEDDED_TABS.has(tab)) return "";
  return `&embed=1&theme=${wornThemeIsDark() ? "dark" : "light"}`;
}

const SHELF_STATE_WAS = {
  rascunho: "draft", "em-revisao": "in-review", "em-revisão": "in-review",
  decidido: "decided", entregue: "delivered", encerrado: "closed"
};

const SHELF_TABS = ["documento", "telas", "plano", "lente", "prints"];

const SHELF_BANDS = [
  { key: "waiting", say: "waiting on someone", states: ["draft", "in-review"], shut: false },
  { key: "building", say: "being built", states: ["decided"], shut: false },
  { key: "stateless", say: "no state", states: [""], shut: true },
  { key: "done", say: "already done", states: ["delivered", "closed"], shut: true }
];

const GITHUB_SHELF_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;

st.shelf = null;

st.shelfShown = false;

st.shelfWho = "team";

st.shelfState = "";

st.shelfQuery = "";

st.shelfOpen = null;

st.shelfTab = SHELF_TABS[0];

st.shelfVersion = 0;

st.shelfAt = "";

st.shelfAsked = false;

st.shelfWide = false;

st.shelfPick = "";

st.shelfShut = new Set(SHELF_BANDS.filter((band) => band.shut).map((band) => band.key));

const TALK_CHANNEL = "hive-shelf";

st.shelfTalk = { slug: "", v: 0, comments: [], me: "", open: false, pinning: false, draftPin: null, draftRe: "", frames: [], focus: "", note: "", busy: false, cleared: 0 };

const shelfOnScreen = () => !!st.shelfShown;

const shelfWideOn = () => shelfOnScreen() && !!st.shelfOpen && st.shelfWide;

const shelfLabelState = (label) => {
  const named = String(label || "").trim().toLowerCase();
  const known = SHELF_STATES.map((state) => [state, state]).concat(Object.entries(SHELF_STATE_WAS));
  const found = known.find(([head]) => named === head || named.startsWith(`${head}-`));
  return found ? found[1] : "";
};

const shelfLinkTab = (page, tab) => page?.tabs?.[tab]?.kind === "link";

const shelfProposalsOf = (page) => (shelfLinkTab(page, "telas") ? page.tabs.telas.proposals || [] : []);

const shelfNewestProposal = (page) => shelfProposalsOf(page).at(-1) || null;

const shelfPickedProposal = (page, n) => shelfProposalsOf(page)[n - 1] || shelfNewestProposal(page);

const shelfTabsOf = (page) => {
  const kept = Object.keys(page?.tabs || {}).filter((t) => (page.tabs[t]?.versions || page.tabs[t]?.proposals || []).length);
  return [...SHELF_TABS.filter((t) => kept.includes(t)), ...kept.filter((t) => !SHELF_TABS.includes(t))];
};

const shelfVersionsOf = (page, tab) => page?.tabs?.[tab]?.versions || [];

const shelfTopVersion = (page, tab) => shelfVersionsOf(page, tab).at(-1) || null;

const shelfTabLabel = (page, tab) => shelfTopVersion(page, tab)?.label || "";

const shelfTabState = (page, tab) => shelfLabelState(shelfTabLabel(page, tab));

function shelfStatesOf(page) {
  const own = shelfLabelState(page?.label);
  return own ? [own] : [];
}

const shelfBandShut = (band) => !st.shelfState && st.shelfShut.has(band.key);

function shelfBandOf(page) {
  const [state = ""] = shelfStatesOf(page);
  return SHELF_BANDS.find((band) => band.states.includes(state)) || SHELF_BANDS[0];
}

function pageChromeModel(page, tab, version) {
  const tabs = shelfTabsOf(page);
  const here = tabs.includes(tab) ? tab : (tabs[0] || SHELF_TABS[0]);
  const versions = shelfVersionsOf(page, here);
  const now = versions.find((v) => v.n === version) || versions[versions.length - 1];
  const proposals = shelfLinkTab(page, here) ? shelfProposalsOf(page) : [];
  const picked = shelfPickedProposal(page, version);
  return {
    tab: here, now,
    model: {
      tabs: tabs.map((name) => ({ key: name, name, on: name === here, say: shelfTabSay(page, name) })),
      proposals: proposals.length > 1
        ? proposals.map((one, at) => ({ one, n: at + 1 })).reverse().map(({ one, n }) => ({
          key: `p:${n}`, n, on: one === picked, say: `${one.product}/${one.id}`,
          hint: [one.url, one.at ? artClock(one.at) : ""].filter(Boolean).join(" · ")
        }))
        : [],
      versions: [...versions].reverse().map((v) => ({
        key: `v:${v.n}`, n: v.n, on: v.n === now?.n, say: `v${v.n}`,
        hint: [v.label, artClock(v.at)].filter(Boolean).join(" · ")
      }))
    }
  };
}

const chromeViews = new WeakMap();

function paintPageChrome(host, { page, tab, version, onTab, onVersion }) {
  const drawn = pageChromeModel(page, tab, version);
  let held = chromeViews.get(host);
  if (!held) {
    const asked = {};
    held = { asked, view: mountPageChrome(host, { actions: { tab: (name) => asked.onTab(name), version: (n) => asked.onVersion(n) } }) };
    chromeViews.set(host, held);
  }
  Object.assign(held.asked, { onTab, onVersion });
  held.view.show(drawn.model);
  return { tab: drawn.tab, now: drawn.now };
}

function openShelf() {
  screenOpens();
  releaseKeyboard();
  if (prsOnScreen()) closePrs();
  if (usageOnScreen()) closeUsage();
  if (worktreesOnScreen()) closeWorktrees();
  if (portariaOnScreen()) closePortaria();
  st.shelfShown = true;
  paintShelf();
  if (raycastOn()) $("sh-search").focus();
  pullShelf(!st.shelfAsked);
  st.shelfAsked = true;
}

function closeShelf() {
  if (raycastOn()) leavePanel($("shelf"));
  giveTheScreenBack("shelf");
  st.shelfShown = false;
  st.shelfOpen = null;
  st.shelfWide = false;
  paintShelf();
}

function shelfBack() {
  giveTheScreenBack("shelf");
  st.shelfOpen = null;
  st.shelfAt = "";
  st.shelfWide = false;
  paintShelf();
}

function setShelfWide(wide) {
  if (!st.shelfOpen) return;
  st.shelfWide = !!wide;
  if (st.shelfWide) takeTheScreen("shelf", { eatsEscape: true });
  else giveTheScreenBack("shelf");
  paintShelf();
  $(st.shelfWide ? "sh-narrow" : "sh-wide").focus();
}

function toggleShelfWide() {
  setShelfWide(!st.shelfWide);
}

function screenWentBackToAWindow() {
  if (st.shelfWide) setShelfWide(false);
}

whenTheScreenGoesBack(screenWentBackToAWindow);

window.hiveWindow?.onLeaveReading?.(() => setShelfWide(false));

async function pullShelf(fresh) {
  try {
    const r = await fetch(`/api/shelf${fresh ? "?pull=1" : ""}`);
    st.shelf = await r.json();
  } catch { st.shelf = { error: phrase("could not reach the server"), pages: [] }; }
  if (shelfOnScreen()) paintShelf();
}

function shelfRows() {
  const pages = st.shelf?.pages || [];
  const q = st.shelfQuery.trim().toLowerCase();
  return pages.filter((p) => {
    if (st.shelfWho === "mine" && p.owner && st.shelf?.me && p.owner !== st.shelf.me) return false;
    if (st.shelfState && !shelfStatesOf(p).includes(st.shelfState)) return false;
    if (q && !`${p.title} ${p.description} ${p.slug}${raycastOn() ? ` ${p.owner || ""}` : ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function shelfCardChips(page) {
  const label = page?.label || "";
  const state = shelfLabelState(label);
  return [{ state, label, say: state ? phrase(state) : (label || phrase("no label yet")) }];
}

let shelfSolid = null;

let paintSeq = 0;

let frameUsed = false;

let proposalAt = "";

let wordsSaid = { language: null, words: null };

function shelfWords() {
  if (wordsSaid.language === st.language && wordsSaid.words) return wordsSaid.words;
  wordsSaid = {
    language: st.language,
    words: {
      shelf: phrase("Shelf"), search: phrase("search"), label: phrase("The pages this team published"),
      find: phrase("Search by title, author or slug"), close: phrase("close"), list: phrase("pages on the shelf"),
      web: phrase("the screenbook proposal of this page")
    }
  };
  return wordsSaid.words;
}

function shelfCountSay(pages) {
  if (raycastOn()) return pages.length === 1 ? phrase("1 page") : phrase("{n} pages", { n: pages.length });
  return st.shelf?.repo ? `${pages.length} ${phrase("pages")} · ${st.shelf.repo.replace(/^https:\/\/github\.com\//, "")}` : "";
}

const openedPage = () => (st.shelf?.pages || []).find((p) => p.slug === st.shelfOpen) || null;

function shelfScreenModel() {
  const raycast = raycastOn();
  const pages = st.shelf?.pages || [];
  const gallery = raycast ? shelfGalleryWindowModel() : shelfGalleryViewModel();
  return {
    open: shelfOnScreen(), raycast,
    on: st.shelfOpen ? "view" : "gallery",
    wide: st.shelfOpen && st.shelfWide ? "yes" : "no",
    count: shelfCountSay(pages),
    query: st.shelfQuery,
    fit: ++paintSeq,
    words: shelfWords(),
    filters: raycast ? shelfFiltersWindowModel(pages) : shelfFiltersViewModel(pages),
    gallery,
    preview: raycast ? shelfPreviewModel() : { page: null, empty: null },
    foot: raycast ? footModel(panelOf("shelf"), { icon: "i-book", title: phrase("Shelf"), trail: [shelfPicked()?.slug || ""] }) : { icon: "i-book", title: "", trail: [], acts: [] },
    view: shelfViewModel()
  };
}

function paintShelf() {
  if (st.shelfOpen && !openedPage()) st.shelfOpen = null;
  const page = openedPage();
  if (page) settleOpenPage(page);
  shelfSolid?.show(shelfScreenModel());
  if (page && talk().open) $("sh-side")?.querySelector('[data-hot="yes"]')?.scrollIntoView?.({ block: "nearest" });
}

function shelfFiltersViewModel(pages) {
  const mine = pages.filter((p) => p.owner && st.shelf?.me && p.owner === st.shelf.me).length;
  return {
    chips: [
      { key: "who:mine", on: st.shelfWho === "mine", say: phrase("mine"), n: mine },
      { key: "who:team", on: st.shelfWho === "team", say: phrase("the team's"), n: pages.length },
      ...SHELF_STATES.map((state) => ({
        key: `state:${state}`, on: st.shelfState === state, say: phrase(state),
        n: pages.filter((p) => shelfStatesOf(p).includes(state)).length
      }))
    ]
  };
}

function shelfFiltersWindowModel(pages) {
  const mine = pages.filter((p) => p.owner && st.shelf?.me && p.owner === st.shelf.me).length;
  return {
    raycast: true,
    label: phrase("which pages"),
    chips: [
      { key: "who:mine", on: !st.shelfState && st.shelfWho === "mine", say: phrase("mine"), n: mine },
      { key: "who:team", on: !st.shelfState && st.shelfWho === "team", say: phrase("the team's"), n: pages.length },
      ...SHELF_STATES.map((state) => ({
        key: `state:${state}`, on: st.shelfState === state, say: phrase(state),
        n: pages.filter((p) => shelfStatesOf(p).includes(state)).length
      }))
    ]
  };
}

function shelfPickWindowFilter(key) {
  if (key.startsWith("who:")) { st.shelfWho = key.slice(4); st.shelfState = ""; }
  else { st.shelfState = key.slice(6); st.shelfWho = "team"; }
  paintShelf();
}

function shelfPickFilter(key) {
  if (key.startsWith("who:")) st.shelfWho = key.slice(4);
  else st.shelfState = st.shelfState === key.slice(6) ? "" : key.slice(6);
  paintShelf();
}

function shelfCardModel(page) {
  const tabs = shelfTabsOf(page);
  const tab = shelfMainTab(page);
  return {
    key: page.slug, slug: page.slug, tab,
    shut: shelfLabelState(page.label) === "closed" ? "yes" : "no",
    hint: [page.title || page.slug, page.at ? artClock(page.at) : ""].filter(Boolean).join(" · "),
    thumb: page.thumbs?.telas === "proposal" ? shelfThumbModel(page, "telas") : shelfThumbModel(page, tab),
    title: page.title || page.slug,
    owner: page.owner || "",
    sub: page.description || tabs.join(" · ") || page.slug,
    chips: shelfCardChips(page).map((chip, at) => ({ key: `${at}:${chip.say}`, state: chip.state, label: chip.label, say: chip.say }))
  };
}

function shelfGalleryViewModel() {
  const pages = st.shelf?.pages || [];
  if (!st.shelf?.repo) {
    return { blank: { html: phrase("The shelf has no repo yet. Point the hive at a private repo — <code>shelf</code> in the config file — and every page you publish lands there, versioned, readable by whoever is in the organisation."), say: "" }, bands: [] };
  }
  const rows = shelfRows();
  if (!rows.length) {
    return {
      blank: {
        html: "",
        say: pages.length
          ? phrase("Nothing here with those filters.")
          : phrase("Nothing on the shelf yet — the first page you publish lands here, draft and all.")
      },
      bands: []
    };
  }
  const bands = [];
  for (const band of SHELF_BANDS) {
    const mine = rows.filter((page) => shelfBandOf(page).key === band.key);
    if (!mine.length) continue;
    const shut = shelfBandShut(band);
    bands.push({
      key: band.key, open: !shut, caret: shut ? "▸" : "▾", say: phrase(band.say), count: mine.length,
      cards: shut ? [] : mine.map(shelfCardModel)
    });
  }
  return { blank: null, bands, shown: shelfOnScreen() && !st.shelfOpen };
}

const SHELF_TAB_ICONS = { telas: "i-grid", documento: "i-doc", plano: "i-list", lente: "i-mag", prints: "i-image" };

const shelfMainTab = (page) => {
  const tabs = shelfTabsOf(page);
  return tabs.includes("documento") ? "documento" : (tabs[0] || "documento");
};

const shelfTabSay = (page, tab) => {
  const count = shelfProposalsOf(page).length;
  if (shelfLinkTab(page, tab)) return count === 1 ? phrase("1 proposal") : phrase("{n} proposals", { n: count });
  return `v${shelfTopVersion(page, tab)?.n || 0}`;
};

function shelfThumbModel(page, tab) {
  const tabs = shelfTabsOf(page);
  const slug = encodeURIComponent(page.slug);
  const say = `${shelfTabSay(page, tab)}${tabs.length > 1 ? ` · ${tabs.length} ${phrase("tabs")}` : ""}`;
  if (shelfLinkTab(page, tab)) {
    if (!shelfNewestProposal(page)) return null;
    return { src: "", img: page.thumbs?.telas === "proposal" ? `/api/shelf/thumb?slug=${slug}&tab=telas&v=proposal` : "", say };
  }
  const top = shelfTopVersion(page, tab);
  const shot = page.thumbs?.[tab];
  return top ? {
    src: `/api/shelf/page?slug=${slug}&tab=${tab}&v=${top.n}`,
    img: shot ? `/api/shelf/thumb?slug=${slug}&tab=${tab}&v=${shot}` : "",
    say
  } : null;
}

function shelfRowModel(page) {
  const tab = shelfMainTab(page);
  const top = shelfTopVersion(page, tab);
  const [chip] = shelfCardChips(page);
  return {
    key: page.slug, slug: page.slug, tab,
    icon: SHELF_TAB_ICONS[tab] || "i-doc",
    here: page.slug === st.shelfPick,
    shut: shelfLabelState(page.label) === "closed" ? "yes" : "no",
    hint: [page.title || page.slug, page.description, page.at ? artClock(page.at) : ""].filter(Boolean).join(" · "),
    title: page.title || page.slug,
    meta: [page.owner, top ? `v${top.n}` : ""].filter(Boolean).join(" · "),
    say: chip.say, state: chip.state, label: chip.label
  };
}

function shelfShownRows(rows = shelfRows()) {
  return SHELF_BANDS.filter((band) => !shelfBandShut(band)).flatMap((band) => rows.filter((page) => shelfBandOf(page).key === band.key));
}

function shelfGalleryWindowModel() {
  if (!st.shelf) return { raycast: true, blank: null, bands: [], loading: phrase("reading the team's shelf…") };
  const model = shelfGalleryViewModel();
  if (model.blank) return { ...model, raycast: true, loading: "" };
  const shown = shelfShownRows();
  if (!shown.some((page) => page.slug === st.shelfPick)) st.shelfPick = shown[0]?.slug || "";
  const rows = shelfRows();
  return {
    raycast: true, blank: null, loading: "",
    bands: model.bands.map((band) => ({ key: band.key, open: band.open, caret: band.caret, say: band.say, count: band.count, rows: band.open ? rows.filter((page) => shelfBandOf(page).key === band.key).map(shelfRowModel) : [] }))
  };
}

const shelfPicked = () => (st.shelf?.pages || []).find((p) => p.slug === (st.shelfOpen || st.shelfPick)) || null;

function shelfPreviewModel() {
  const page = (st.shelf?.pages || []).find((p) => p.slug === st.shelfPick);
  if (!page) {
    return {
      page: null,
      empty: st.shelf && !shelfRows().length
        ? { icon: "i-book", head: phrase("Nothing on the shelf yet"), say: (st.shelf?.pages || []).length ? phrase("Nothing here with those filters.") : phrase("The first page you publish lands here, draft and all.") }
        : st.shelf?.error ? { icon: "i-warn", warn: true, head: phrase("The shelf did not load"), say: phrase("The hub did not answer when asked for the team's pages."), detail: st.shelf.error, copySay: phrase("copy") } : null
    };
  }
  const tabs = shelfTabsOf(page);
  const tab = tabs.includes(st.shelfTab) && st.shelfTabFor === page.slug ? st.shelfTab : shelfMainTab(page);
  const top = shelfTopVersion(page, tab);
  const state = shelfLabelState(page.label);
  const link = page.url || "";
  const proposal = shelfLinkTab(page, tab) ? shelfNewestProposal(page) : null;
  const flow = ["draft", "in-review", "decided", "delivered"];
  return {
    empty: null,
    page: {
      key: page.slug, slug: page.slug, title: page.title || page.slug, description: page.description || "",
      shot: shelfThumbModel(page, tab),
      strip: [page.owner, page.slug, page.at ? artClock(page.at) : ""].filter(Boolean),
      tabs: tabs.map((one) => ({ key: one, say: one, on: one === tab, ver: shelfTabSay(page, one) })),
      labelSay: phrase("Label"),
      trail: flow.map((one) => ({ key: one, say: phrase(one), on: one === state })),
      loose: state && flow.includes(state) ? "" : state ? phrase(state) : (page.label || ""),
      linkSay: "Link", link, linkShort: link.replace(/^https?:\/\//, ""), copySay: phrase("copy link"),
      fileSay: proposal ? "Screenbook" : phrase("File"), file: proposal ? proposal.url : `a/${page.slug}/${tab}.v${top?.n || 0}.html`
    }
  };
}

function pickShelf(slug) {
  st.shelfPick = slug;
  paintShelf();
  $("sh-gal").querySelector(`[data-slug="${CSS.escape(slug)}"]`)?.scrollIntoView({ block: "nearest" });
}

function stepShelf(step) {
  if (st.shelfOpen) return;
  const shown = shelfShownRows();
  if (!shown.length) return;
  const at = shown.findIndex((page) => page.slug === st.shelfPick);
  pickShelf(shown[(at + step + shown.length) % shown.length].slug);
}

function openPicked(tab) {
  const page = shelfPicked();
  if (page) openShelfPage(page, tab || (st.shelfTabFor === page.slug ? st.shelfTab : shelfMainTab(page)));
}

function shelfInASeat() {
  const page = shelfPicked();
  if (!page) return;
  const tab = st.shelfOpen ? st.shelfTab : shelfMainTab(page);
  window.hiveOpenPage?.({ slug: page.slug, tab: shelfTabsOf(page).includes(tab) ? tab : "", version: st.shelfOpen ? Number(st.shelfVersion) || 0 : 0 });
}

function shelfComments() {
  const page = shelfPicked();
  if (!page) return;
  if (!st.shelfOpen) openShelfPage(page, shelfMainTab(page));
  talk().open = !talk().open;
  paintShelfView();
}

function shelfDeepLink(page, tab, version) {
  const asked = new URLSearchParams();
  if (tab) asked.set("tab", tab);
  if (Number(version) > 0) asked.set("v", String(version));
  const query = asked.toString();
  return `hive://shelf/${page.slug}${query ? `?${query}` : ""}`;
}

function shelfCopyLink() {
  const page = shelfPicked();
  if (page) copyWithWord(null, st.shelfOpen ? shelfDeepLink(page, st.shelfTab, st.shelfVersion) : shelfDeepLink(page, shelfMainTab(page), 0));
}

function shelfGithub() {
  const page = shelfPicked();
  if (!page) return;
  const tab = st.shelfOpen ? st.shelfTab : shelfMainTab(page);
  const versions = shelfVersionsOf(page, tab);
  const now = versions.find((v) => v.n === st.shelfVersion) || versions[versions.length - 1];
  const href = shelfGithubUrl(page, tab, now?.n || 0);
  if (href) window.open(href, "_blank", "noreferrer");
}

function shelfActions() {
  const page = shelfPicked();
  if (!page) return [];
  const tab = st.shelfOpen ? st.shelfTab : shelfMainTab(page);
  const github = !shelfLinkTab(page, tab) && !!shelfGithubUrl(page, tab, 1);
  return [
    st.shelfOpen
      ? { key: "seat", say: phrase("Open in a seat"), icon: "i-agent", primary: true, combo: { meta: true, code: "Enter" }, go: shelfInASeat }
      : { key: "open", say: phrase("Open"), icon: "i-expand", primary: true, go: () => openPicked() },
    st.shelfOpen ? null : { key: "seat", say: phrase("Open in a seat"), icon: "i-agent", combo: { meta: true, code: "Enter" }, go: shelfInASeat },
    { key: "talk", say: phrase("Comments"), icon: "i-quote", combo: { meta: true, shift: true, code: "KeyM" }, go: shelfComments },
    { key: "copy", say: phrase("Copy link"), icon: "i-copy", combo: { meta: true, shift: true, code: "KeyC" }, go: shelfCopyLink },
    github ? { key: "github", say: phrase("See on GitHub"), icon: "i-globe", combo: { meta: true, shift: true, code: "KeyG" }, go: shelfGithub } : null,
    st.shelfOpen ? { key: "wide", say: phrase("Full screen"), icon: "i-expand", group: phrase("Page"), go: toggleShelfWide } : null,
    st.shelfOpen ? { key: "back", say: phrase("Back to the shelf"), icon: "i-rail", group: phrase("Page"), go: shelfBack } : null
  ];
}

registerPanel("shelf", {
  el: () => $("shelf"),
  search: () => $("sh-search"),
  list: () => $("sh-gal"),
  actions: shelfActions,
  step: stepShelf,
  subject: () => shelfPicked()?.title || phrase("Shelf")
});

function shelfFoldBand(key) {
  if (st.shelfShut.has(key)) st.shelfShut.delete(key);
  else st.shelfShut.add(key);
  paintShelf();
}

function openShelfPage(page, tab) {
  giveTheScreenBack("shelf");
  st.shelfOpen = page.slug;
  st.shelfWide = false;
  st.shelfTalk.slug = "";
  const tabs = shelfTabsOf(page);
  st.shelfTab = tabs.includes(tab) ? tab : (tabs[0] || SHELF_TABS[0]);
  st.shelfVersion = 0;
  paintShelf();
}

function shelfGithubUrl(page, tab, n) {
  const m = GITHUB_SHELF_URL.exec(String(st.shelf?.repo || ""));
  if (!m) return "";
  return `https://github.com/${m[1]}/${m[2]}/blob/HEAD/a/${page.slug}/${tab}.v${n}.html`;
}

function settleOpenPage(page) {
  const tabs = shelfTabsOf(page);
  if (!tabs.includes(st.shelfTab)) st.shelfTab = tabs[0] || SHELF_TABS[0];
  const versions = shelfVersionsOf(page, st.shelfTab);
  const now = versions.find((v) => v.n === st.shelfVersion) || versions[versions.length - 1];
  const mine = talk();
  if (mine.slug !== page.slug) {
    Object.assign(mine, { slug: page.slug, comments: [], pinning: false, draftPin: null, draftRe: "", frames: [], focus: "", note: "", busy: false });
    pullComments(page.slug, false);
  }
  mine.v = now?.n || 0;
}

function shelfViewModel() {
  const page = openedPage();
  const words = shelfWords();
  if (!page) {
    return {
      ...shelfViewClosed(),
      frame: { src: frameUsed ? "about:blank" : undefined, here: undefined, away: false },
      web: { made: !!proposalAt, url: proposalAt, on: false, title: words.web },
      talk: talkModel()
    };
  }
  const versions = shelfVersionsOf(page, st.shelfTab);
  const now = versions.find((v) => v.n === st.shelfVersion) || versions[versions.length - 1];
  const linked = shelfLinkTab(page, st.shelfTab);
  const proposal = linked ? shelfPickedProposal(page, st.shelfVersion) : null;
  if (proposal) proposalAt = proposal.url;
  const src = linked
    ? "about:blank"
    : now
    ? `/api/shelf/page?slug=${encodeURIComponent(page.slug)}&tab=${st.shelfTab}&v=${now.n}${shelfFrameHints(st.shelfTab)}${st.shelfAt ? `#${encodeURIComponent(st.shelfAt)}` : ""}`
    : "about:blank";
  frameUsed = true;
  const state = shelfLabelState(page.label);
  return {
    shown: true,
    title: page.title || page.slug,
    lab: { state, say: state ? phrase(state) : (page.label || ""), title: page.label || "" },
    who: [page.owner, page.at ? artClock(page.at) : ""].filter(Boolean).join(" · "),
    chrome: pageChromeModel(page, st.shelfTab, st.shelfVersion).model,
    frame: { src, here: src, away: !!proposal },
    web: { made: !!proposalAt, url: proposalAt, on: !!proposal, title: words.web },
    wide: !!st.shelfWide,
    github: !linked && !!shelfGithubUrl(page, st.shelfTab, now?.n || 0),
    file: linked ? (proposal?.url || "") : [
      `a/${page.slug}/${st.shelfTab}.v${now?.n || 0}.html`,
      now?.label || "",
      now?.bytes ? bytes(now.bytes) : ""
    ].filter(Boolean).join("  ·  "),
    talk: talkModel()
  };
}

const paintShelfView = () => paintShelf();

function copyOpenLink() {
  const page = openedPage();
  if (page) toClipboard(shelfDeepLink(page, st.shelfTab, st.shelfVersion));
}

function openOnGithub() {
  const page = openedPage();
  const versions = shelfVersionsOf(page, st.shelfTab);
  const now = versions.find((v) => v.n === st.shelfVersion) || versions[versions.length - 1];
  const href = page && shelfGithubUrl(page, st.shelfTab, now?.n || 0);
  if (href) window.open(href, "_blank", "noreferrer");
}

function searchTyped(text) {
  st.shelfQuery = text;
  if (raycastOn() && st.shelfOpen) shelfBack();
  else paintShelf();
}

function toggleTalk() {
  talk().open = !talk().open;
  paintShelf();
}

const talk = () => st.shelfTalk;

function tellPage(message) {
  try { $("sh-frame").contentWindow?.postMessage({ hive: TALK_CHANNEL, ...message }, "*"); } catch {}
}

const commentsHere = () => talk().comments.filter((one) => !one.tab || one.tab === st.shelfTab);

const pinsHere = () => commentsHere().filter((one) => one.pin && !one.re).map((one, at) => ({ ...one, n: at + 1 }));

const pinNumberOf = (id) => pinsHere().find((one) => one.id === id)?.n || 0;

function postPins() {
  tellPage({ type: "pins", pins: pinsHere().map((one) => ({ id: one.id, n: one.n, frame: one.pin.frame, x: one.pin.x, y: one.pin.y, done: !!one.done })) });
}

function setPinning(on) {
  talk().pinning = !!on;
  tellPage({ type: "pin-mode", on: talk().pinning });
  paintTalk();
}

async function pullComments(slug, fresh) {
  let said = null;
  try {
    const r = await fetch(`/api/shelf/comments?slug=${encodeURIComponent(slug)}${fresh ? "&pull=1" : ""}`);
    said = await r.json();
  } catch { said = { error: phrase("could not reach the server") }; }
  if (talk().slug !== slug) return;
  if (Array.isArray(said.comments)) talk().comments = said.comments;
  talk().me = said.me || talk().me;
  talk().note = said.error || "";
  paintTalk();
  postPins();
}

function commentModel(one, n) {
  return {
    key: one.id, id: one.id, done: !!one.done, reply: !!one.re, hot: talk().focus === one.id, n,
    goSay: phrase("go to the pin"),
    who: one.who || phrase("someone"),
    when: [artClock(one.at), one.v ? `v${one.v}` : "", one.pin?.name || ""].filter(Boolean).join(" · "),
    text: one.text,
    replySay: phrase("reply"),
    settleSay: one.done ? phrase("reopen") : phrase("settled"),
    by: one.done && one.doneBy ? phrase("settled by {who}", { who: one.doneBy }) : ""
  };
}

function talkItems() {
  const here = commentsHere();
  const tops = here.filter((one) => !one.re);
  return [
    ...tops.flatMap((top) => [commentModel(top, pinNumberOf(top.id)), ...here.filter((one) => one.re === top.id).map((reply) => commentModel(reply, 0))]),
    ...here.filter((one) => one.re && !tops.some((top) => top.id === one.re)).map((loose) => commentModel(loose, 0))
  ];
}

function talkModel() {
  const mine = talk();
  const count = commentsHere().length;
  const replyingTo = mine.draftRe ? (mine.comments.find((one) => one.id === mine.draftRe)?.who || phrase("someone")) : "";
  return {
    open: !!mine.open,
    buttonSay: count ? `${phrase("comments")} · ${count}` : phrase("comments"),
    title: phrase("comments"),
    count: count ? String(count) : "",
    pinning: !!mine.pinning,
    pinSay: mine.pinning ? phrase("stop marking") : phrase("mark on the page"),
    againSay: phrase("read again"),
    hint: phrase("click on the page where you want to comment"),
    items: talkItems(),
    blank: phrase("nothing said about this page yet — mark a spot on the drawing, or write below"),
    ctx: mine.draftPin
      ? (mine.draftPin.name ? phrase("pinned to {name}", { name: mine.draftPin.name }) : phrase("pinned to the page"))
      : (replyingTo ? phrase("replying to {who}", { who: replyingTo }) : ""),
    dropSay: mine.draftPin ? phrase("remove the pin") : phrase("cancel"),
    placeholder: phrase("write the comment"),
    note: mine.note || "",
    sendSay: phrase("send"),
    busy: !!mine.busy,
    cleared: mine.cleared || 0
  };
}

const paintTalk = () => paintShelf();

function talkParts() {
  const side = $("sh-side");
  const one = (selector) => side?.querySelector(selector) || null;
  return {
    side,
    title: one(".sh-th b"),
    count: one(".sh-tn"),
    pin: one(".sh-tpin"),
    again: one(".sh-tagain"),
    hint: one(".sh-thint"),
    list: one(".sh-tlist"),
    form: one(".sh-tform"),
    ctx: one(".sh-tctx"),
    ctxSay: one(".sh-tctx span"),
    drop: one(".sh-tdrop"),
    box: one("textarea"),
    note: one(".sh-tnote"),
    send: one(".sh-tsend button")
  };
}

function replyTo(id) {
  Object.assign(talk(), { draftRe: id, draftPin: null });
  paintTalk();
  talkParts().box?.focus();
}

function goToPin(id) {
  talk().focus = id;
  tellPage({ type: "goto", id });
  paintTalk();
}

function dropDraft() {
  Object.assign(talk(), { draftPin: null, draftRe: "" });
  paintTalk();
}

async function sendComment() {
  const mine = talk();
  const text = String(talkParts().box?.value || "").trim();
  if (!text || mine.busy) return;
  mine.busy = true;
  mine.note = "";
  paintTalk();
  let said;
  try {
    const r = await fetch("/api/shelf/comment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: mine.slug, tab: st.shelfTab, v: mine.v, text, pin: mine.draftPin, re: mine.draftRe })
    });
    said = await r.json();
  } catch { said = { error: phrase("could not reach the server") }; }
  mine.busy = false;
  if (!said.comment) {
    mine.note = said.error || phrase("could not reach the server");
    paintTalk();
    return;
  }
  if (Array.isArray(said.comments)) mine.comments = said.comments;
  Object.assign(mine, { draftPin: null, draftRe: "", focus: said.comment.id });
  mine.note = said.pushed ? "" : phrase("kept on this machine, but the push to the team's repo failed: {why}", { why: said.error || "" });
  mine.cleared = (mine.cleared || 0) + 1;
  paintShelfView();
  postPins();
}

async function settleComment(id, done) {
  const mine = talk();
  let said;
  try {
    const r = await fetch("/api/shelf/comment/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: mine.slug, id, done })
    });
    said = await r.json();
  } catch { said = { error: phrase("could not reach the server") }; }
  if (!said.comment) {
    mine.note = said.error || phrase("could not reach the server");
    paintTalk();
    return;
  }
  if (Array.isArray(said.comments)) mine.comments = said.comments;
  mine.note = said.pushed ? "" : phrase("kept on this machine, but the push to the team's repo failed: {why}", { why: said.error || "" });
  paintTalk();
  postPins();
}

function heardFromPage(said) {
  const mine = talk();
  if (said.type === "hello") {
    mine.frames = Array.isArray(said.frames) ? said.frames : [];
    postPins();
    if (mine.pinning) tellPage({ type: "pin-mode", on: true });
    return;
  }
  if (said.type === "pin") {
    Object.assign(mine, {
      draftPin: { frame: String(said.frame || ""), name: String(said.name || ""), x: Number(said.x) || 0, y: Number(said.y) || 0 },
      draftRe: "",
      pinning: false,
      open: true
    });
    paintShelfView();
    talkParts().box?.focus();
    return;
  }
  if (said.type === "open") {
    Object.assign(mine, { open: true, focus: String(said.id || "") });
    paintShelfView();
  }
}

shelfSolid = mountShelf($("shelf-screen"), {
  actions: {
    search: searchTyped,
    close: () => closeShelf(),
    filters: {
      pick: (key) => {
        if (!raycastOn()) return shelfPickFilter(key);
        shelfPickWindowFilter(key);
        $("sh-search").focus();
      }
    },
    gallery: {
      fold: shelfFoldBand,
      pick: (slug) => { pickShelf(slug); $("sh-search").focus(); },
      open: (slug, tab) => {
        const page = (st.shelf?.pages || []).find((p) => p.slug === slug);
        if (page) openShelfPage(page, tab);
      }
    },
    preview: {
      tab: (name) => { st.shelfTab = name; st.shelfTabFor = st.shelfPick; paintShelf(); },
      copy: (button, text) => copyWithWord(button, text)
    },
    foot: { act: (key) => runAction(panelOf("shelf"), key), more: () => openActions(panelOf("shelf")) },
    view: {
      back: shelfBack,
      talk: toggleTalk,
      seat: shelfInASeat,
      copy: copyOpenLink,
      github: openOnGithub,
      wide: toggleShelfWide,
      narrow: () => setShelfWide(false),
      loaded: () => postPins(),
      chrome: {
        tab: (name) => { st.shelfTab = name; st.shelfVersion = 0; paintShelf(); },
        version: (n) => { st.shelfVersion = n; paintShelf(); }
      },
      comments: {
        pinning: setPinning,
        again: () => pullComments(talk().slug, true),
        goto: goToPin,
        reply: replyTo,
        settle: settleComment,
        drop: dropDraft,
        send: () => sendComment()
      }
    }
  }
});

followRaycast(() => paintShelf());

$("btn-shelf").addEventListener("click", () => { closeMore(); shelfOnScreen() ? closeShelf() : openShelf(); });

$("btn-day").addEventListener("click", () => { closeMore(); dayOnScreen() ? closeDay() : openDay(); });

window.addEventListener("message", (ev) => {
  const said = ev.data;
  if (!said || said.hive !== TALK_CHANNEL) return;
  if (ev.source !== $("sh-frame").contentWindow) return;
  heardFromPage(said);
});

export { shelfLinkTab, shelfMainTab, shelfNewestProposal, shelfPickedProposal, shelfProposalsOf, shelfThumbModel, pickShelf, shelfActions, shelfFiltersWindowModel, shelfGalleryWindowModel, shelfPreviewModel, shelfRowModel, shelfShownRows, stepShelf, commentsHere, heardFromPage, paintTalk, pinsHere, postPins, pullComments, sendComment, settleComment, talkParts, GITHUB_SHELF_URL, SHELF_BANDS, SHELF_STATES, SHELF_STATE_WAS, SHELF_TABS, SHELF_THUMB_W, closeShelf, openShelf, openShelfPage, setShelfWide, shelfWideOn, toggleShelfWide, paintPageChrome, paintShelf, paintShelfView, pullShelf, shelfBack, shelfBandOf, shelfBandShut, shelfCardChips, shelfCardModel, shelfDeepLink, shelfFiltersViewModel, shelfFoldBand, shelfGalleryViewModel, shelfGithubUrl, shelfLabelState, shelfOnScreen, shelfPickFilter, shelfRows, shelfStatesOf, shelfTabLabel, shelfTabState, shelfTabsOf, shelfTopVersion, shelfVersionsOf };
