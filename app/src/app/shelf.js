import { $, esc, fullThemeDef, phrase, raycastOn, screenOpens, solidMounts, st, svgIcon, themeDef, wornThemeName } from "./core.js";
import { closeDay, dayOnScreen, openDay } from "./day.js";
import { releaseKeyboard } from "./focus-navigation.js";
import { closeMore } from "./new-chat.js";
import { copyWithWord, dressHost, followRaycast, footModel, leavePanel, openActions, panelOf, registerPanel, runAction, undressHost } from "./panel-window.js";
import { giveTheScreenBack, takeTheScreen, whenTheScreenGoesBack } from "./screen-alone.js";
import { bytes, closePortaria, portariaOnScreen } from "./pod.js";
import { artClock } from "./subagents-dock.js";
import { toClipboard } from "./terminal-history.js";
import { closePrs, prsOnScreen } from "./thread.js";
import { closeUsage, usageOnScreen } from "./usage.js";
import { closeWorktrees, worktreesOnScreen } from "./worktrees.js";

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

const SHELF_THUMB_W = 1280;

const GITHUB_SHELF_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/;

st.shelf = null;

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

st.shelfTalk = { slug: "", v: 0, comments: [], me: "", open: false, pinning: false, draftPin: null, draftRe: "", frames: [], focus: "", note: "", busy: false };

const shelfOnScreen = () => !$("shelf").hidden;

const shelfWideOn = () => shelfOnScreen() && !!st.shelfOpen && st.shelfWide;

const shelfLabelState = (label) => {
  const named = String(label || "").trim().toLowerCase();
  const known = SHELF_STATES.map((state) => [state, state]).concat(Object.entries(SHELF_STATE_WAS));
  const found = known.find(([head]) => named === head || named.startsWith(`${head}-`));
  return found ? found[1] : "";
};

const shelfTabsOf = (page) => {
  const kept = Object.keys(page?.tabs || {}).filter((t) => (page.tabs[t]?.versions || []).length);
  return [...SHELF_TABS.filter((t) => kept.includes(t)), ...kept.filter((t) => !SHELF_TABS.includes(t))];
};

const shelfVersionsOf = (page, tab) => page?.tabs?.[tab]?.versions || [];

const shelfTopVersion = (page, tab) => shelfVersionsOf(page, tab).at(-1) || null;

const shelfTabLabel = (page, tab) => shelfTopVersion(page, tab)?.label || "";

const shelfTabState = (page, tab) => shelfLabelState(shelfTabLabel(page, tab));

function shelfStatesOf(page) {
  const states = new Set(shelfTabsOf(page).map((t) => shelfTabState(page, t)).filter(Boolean));
  const own = shelfLabelState(page?.label);
  if (own) states.add(own);
  return [...states];
}

const shelfBandShut = (band) => !st.shelfState && st.shelfShut.has(band.key);

function shelfBandOf(page) {
  const states = shelfStatesOf(page);
  const first = states.reduce((soonest, state) =>
    (soonest === "" || SHELF_STATES.indexOf(state) < SHELF_STATES.indexOf(soonest) ? state : soonest), "");
  return SHELF_BANDS.find((band) => band.states.includes(first)) || SHELF_BANDS[0];
}

function paintPageChrome(host, { page, tab, version, onTab, onVersion }) {
  const tabs = shelfTabsOf(page);
  const here = tabs.includes(tab) ? tab : (tabs[0] || SHELF_TABS[0]);
  const versions = shelfVersionsOf(page, here);
  const now = versions.find((v) => v.n === version) || versions[versions.length - 1];
  host.textContent = "";
  for (const name of tabs) {
    const b = document.createElement("button");
    b.className = "sh-tab";
    b.setAttribute("aria-selected", name === here ? "true" : "false");
    b.textContent = name;
    const n = document.createElement("i");
    n.textContent = `v${shelfTopVersion(page, name)?.n || 0}`;
    b.appendChild(n);
    b.addEventListener("click", (ev) => { ev.stopPropagation(); onTab(name); });
    host.appendChild(b);
  }
  const rail = document.createElement("div");
  rail.className = "sh-vers";
  for (const v of [...versions].reverse()) {
    const b = document.createElement("button");
    b.className = "sh-ver";
    b.setAttribute("aria-pressed", v.n === now?.n ? "true" : "false");
    b.title = [v.label, artClock(v.at)].filter(Boolean).join(" · ");
    b.textContent = `v${v.n}`;
    b.addEventListener("click", (ev) => { ev.stopPropagation(); onVersion(v.n); });
    rail.appendChild(b);
  }
  host.appendChild(rail);
  return { tab: here, now };
}

function openShelf() {
  screenOpens();
  releaseKeyboard();
  if (prsOnScreen()) closePrs();
  if (usageOnScreen()) closeUsage();
  if (worktreesOnScreen()) closeWorktrees();
  if (portariaOnScreen()) closePortaria();
  $("shelf").hidden = false;
  paintShelf();
  if (raycastOn()) $("sh-search").focus();
  pullShelf(!st.shelfAsked);
  st.shelfAsked = true;
}

function forgetShelfFrame() {
  const frame = $("sh-frame");
  if (!frame.dataset.here) return;
  delete frame.dataset.here;
  frame.src = "about:blank";
}

function closeShelf() {
  if (raycastOn()) leavePanel($("shelf"));
  giveTheScreenBack("shelf");
  $("shelf").hidden = true;
  $("shelf").dataset.wide = "no";
  st.shelfOpen = null;
  st.shelfWide = false;
  $("shelf").dataset.on = "gallery";
  forgetShelfFrame();
  shelfGallerySolid?.dispose();
  if (raycastOn()) shelfPreviewSolid?.dispose();
}

function shelfBack() {
  giveTheScreenBack("shelf");
  st.shelfOpen = null;
  st.shelfAt = "";
  st.shelfWide = false;
  forgetShelfFrame();
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
  const tabs = shelfTabsOf(page);
  const head = tabs.includes("documento") ? "documento" : tabs[0] || "";
  const state = shelfTabState(page, head) || shelfLabelState(page.label);
  const label = shelfTabLabel(page, head) || page.label || "";
  const chips = [{ state, label, say: state ? phrase(state) : (label || phrase("no label yet")) }];
  for (const tab of tabs) {
    if (tab === head || shelfTabState(page, tab) === state) continue;
    const mine = shelfTabState(page, tab);
    chips.push({
      state: mine, tab, label: shelfTabLabel(page, tab),
      say: `${tab} · ${mine ? phrase(mine) : shelfTabLabel(page, tab)}`
    });
  }
  return chips;
}

function fitShelfThumbs() {
  if (raycastOn()) {
    for (const shot of $("shelf").querySelectorAll(".sh-shot")) {
      const frame = shot.querySelector("iframe");
      if (frame) frame.style.transform = `scale(${shot.clientWidth / SHELF_THUMB_W})`;
    }
    return;
  }
  for (const th of $("sh-gal").querySelectorAll(".sh-th")) {
    const frame = th.querySelector("iframe");
    if (!frame) continue;
    const scale = th.clientWidth / SHELF_THUMB_W;
    frame.style.transform = `scale(${scale})`;
  }
}

function dressShelf() {
  const say = (text) => esc(phrase(text));
  dressHost($("shelf"), `
    <header class="pw-head" data-no-t>
      <span class="pw-ico">${svgIcon("i-book")}</span>
      <h2 class="pw-title">${say("Shelf")}</h2>
      <span data-pw-keep="sh-count" class="pw-count"></span>
      <span class="pw-vsep"></span>
      <label class="pw-search">${svgIcon("i-mag")}<input data-pw-keep="sh-search" placeholder="${say("Search by title, author or slug")}" aria-label="${say("Search by title, author or slug")}"></label>
      <div data-pw-keep="sh-filters" class="pw-drop"></div>
      <span class="pw-vsep"></span>
      <button type="button" class="pw-esc" id="sh-close" aria-label="${say("close")}" title="${say("close")}">esc</button>
    </header>
    <div class="pw-body">
      <div data-pw-keep="sh-gal" class="pw-list" role="listbox" aria-label="${say("pages on the shelf")}"></div>
      <div class="pw-detail sh-prev" id="sh-prev" data-no-t></div>
      <div data-pw-keep="sh-view"></div>
    </div>
    <footer class="pw-foot" id="sh-foot" data-no-t></footer>`, {
    on: (host) => host.querySelector("#sh-close").addEventListener("click", () => closeShelf())
  });
  if (!shelfHive) return;
  shelfPreviewSolid ||= shelfHive.mountShelfPreview($("sh-prev"), {
    actions: {
      fit: () => requestAnimationFrame(fitShelfThumbs),
      tab: (name) => { st.shelfTab = name; st.shelfTabFor = st.shelfPick; paintShelf(); },
      copy: (button, text) => copyWithWord(button, text)
    }
  });
  shelfFootSolid ||= shelfHive.mountFoot($("sh-foot"), {
    actions: { act: (key) => runAction(panelOf("shelf"), key), more: () => openActions(panelOf("shelf")) }
  });
}

function undressShelf() {
  shelfPreviewSolid?.dispose();
  shelfPreviewSolid = null;
  shelfFootSolid?.dispose();
  shelfFootSolid = null;
  undressHost($("shelf"));
}

function paintShelfWindow() {
  dressShelf();
  const pages = st.shelf?.pages || [];
  $("shelf").dataset.on = st.shelfOpen ? "view" : "gallery";
  $("sh-view").hidden = !st.shelfOpen;
  $("sh-count").textContent = pages.length === 1 ? phrase("1 page") : phrase("{n} pages", { n: pages.length });
  shelfFiltersSolid.show(shelfFiltersWindowModel(pages));
  shelfGallerySolid.show(shelfGalleryWindowModel());
  if (st.shelfOpen) paintShelfView();
  else {
    shelfPreviewSolid?.show(shelfPreviewModel());
    requestAnimationFrame(fitShelfThumbs);
  }
  paintShelfFoot();
}

function paintShelf() {
  if (raycastOn()) return paintShelfWindow();
  const pages = st.shelf?.pages || [];
  $("shelf").dataset.on = st.shelfOpen ? "view" : "gallery";
  $("sh-view").hidden = !st.shelfOpen;
  if (st.shelfOpen) {
    shelfGallerySolid?.show(shelfGalleryViewModel());
    return paintShelfView();
  }

  $("sh-count").textContent = st.shelf?.repo
    ? `${pages.length} ${phrase("pages")} · ${st.shelf.repo.replace(/^https:\/\/github\.com\//, "")}`
    : "";
  shelfFiltersSolid.show(shelfFiltersViewModel(pages));
  const gallery = shelfGalleryViewModel();
  shelfGallerySolid.show(gallery);
  if (gallery.bands.length) requestAnimationFrame(fitShelfThumbs);
}

let shelfFiltersSolid = null;

let shelfGallerySolid = null;

let shelfPreviewSolid = null;

let shelfFootSolid = null;

let shelfHive = null;

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
  const tab = tabs.includes("telas") ? "telas" : (tabs[0] || "documento");
  const top = shelfTopVersion(page, tab);
  const shot = page.thumbs?.[tab];
  return {
    key: page.slug, slug: page.slug, tab,
    shut: shelfLabelState(page.label) === "closed" ? "yes" : "no",
    hint: [page.title || page.slug, page.at ? artClock(page.at) : ""].filter(Boolean).join(" · "),
    thumb: top ? {
      src: `/api/shelf/page?slug=${encodeURIComponent(page.slug)}&tab=${tab}&v=${top.n}`,
      img: shot ? `/api/shelf/thumb?slug=${encodeURIComponent(page.slug)}&tab=${tab}&v=${shot}` : "",
      say: `v${top.n}${tabs.length > 1 ? ` · ${tabs.length} ${phrase("tabs")}` : ""}`
    } : null,
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
  return tabs.includes("telas") ? "telas" : (tabs[0] || "documento");
};

function shelfThumbModel(page, tab) {
  const tabs = shelfTabsOf(page);
  const top = shelfTopVersion(page, tab);
  const shot = page.thumbs?.[tab];
  return top ? {
    src: `/api/shelf/page?slug=${encodeURIComponent(page.slug)}&tab=${tab}&v=${top.n}`,
    img: shot ? `/api/shelf/thumb?slug=${encodeURIComponent(page.slug)}&tab=${tab}&v=${shot}` : "",
    say: `v${top.n}${tabs.length > 1 ? ` · ${tabs.length} ${phrase("tabs")}` : ""}`
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
  const state = shelfTabState(page, tab) || shelfLabelState(page.label);
  const link = page.url || "";
  const flow = ["draft", "in-review", "decided", "delivered"];
  return {
    empty: null,
    page: {
      key: page.slug, slug: page.slug, title: page.title || page.slug, description: page.description || "",
      shot: shelfThumbModel(page, tab),
      strip: [page.owner, page.slug, page.at ? artClock(page.at) : ""].filter(Boolean),
      tabs: tabs.map((one) => ({ key: one, say: one, on: one === tab, ver: `v${shelfTopVersion(page, one)?.n || 0}` })),
      labelSay: phrase("Label"),
      trail: flow.map((one) => ({ key: one, say: phrase(one), on: one === state })),
      loose: state && flow.includes(state) ? "" : state ? phrase(state) : (shelfTabLabel(page, tab) || page.label || ""),
      linkSay: "Leaf", link, linkShort: link.replace(/^https?:\/\//, ""), copySay: phrase("copy link"),
      fileSay: phrase("File"), file: `a/${page.slug}/${tab}.v${top?.n || 0}.html`
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
  const github = !!shelfGithubUrl(page, tab, 1);
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

function paintShelfFoot() {
  const page = shelfPicked();
  shelfFootSolid?.show(footModel(panelOf("shelf"), { icon: "i-book", title: phrase("Shelf"), trail: [page?.slug || ""] }));
}

function shelfFoldBand(key) {
  if (st.shelfShut.has(key)) st.shelfShut.delete(key);
  else st.shelfShut.add(key);
  paintShelf();
}

solidMounts.push((hive) => {
  shelfHive = hive;
  shelfFiltersSolid = hive.mountShelfFilters($("sh-filters"), {
    actions: {
      pick: (key) => {
        if (!raycastOn()) return shelfPickFilter(key);
        shelfPickWindowFilter(key);
        $("sh-search").focus();
      }
    }
  });
  shelfGallerySolid = hive.mountShelfGallery($("sh-gal"), {
    actions: {
      fold: shelfFoldBand,
      fit: () => requestAnimationFrame(fitShelfThumbs),
      pick: (slug) => { pickShelf(slug); $("sh-search").focus(); },
      open: (slug, tab) => {
        const page = (st.shelf?.pages || []).find((p) => p.slug === slug);
        if (page) openShelfPage(page, tab);
      }
    }
  });
});

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

function paintShelfView() {
  const page = (st.shelf?.pages || []).find((p) => p.slug === st.shelfOpen);
  if (!page) { st.shelfOpen = null; return paintShelf(); }
  const tabs = shelfTabsOf(page);
  if (!tabs.includes(st.shelfTab)) st.shelfTab = tabs[0] || SHELF_TABS[0];
  const versions = shelfVersionsOf(page, st.shelfTab);
  const now = versions.find((v) => v.n === st.shelfVersion) || versions[versions.length - 1];

  $("sh-vtitle").textContent = page.title || page.slug;
  const lab = $("sh-vlab");
  const state = shelfLabelState(page.label);
  lab.dataset.state = state;
  lab.textContent = state ? phrase(state) : (page.label || "");
  lab.title = page.label || "";
  $("sh-vwho").textContent = [page.owner, page.at ? artClock(page.at) : ""].filter(Boolean).join(" · ");

  paintPageChrome($("sh-tabs"), {
    page,
    tab: st.shelfTab,
    version: st.shelfVersion,
    onTab: (name) => { st.shelfTab = name; st.shelfVersion = 0; paintShelf(); },
    onVersion: (n) => { st.shelfVersion = n; paintShelf(); }
  });

  const frame = $("sh-frame");
  const src = now
    ? `/api/shelf/page?slug=${encodeURIComponent(page.slug)}&tab=${st.shelfTab}&v=${now.n}${shelfFrameHints(st.shelfTab)}${st.shelfAt ? `#${encodeURIComponent(st.shelfAt)}` : ""}`
    : "about:blank";
  if (frame.dataset.here !== src) { frame.dataset.here = src; frame.src = src; }
  paintTalkChrome(page, now);

  $("sh-wide").setAttribute("aria-pressed", st.shelfWide ? "true" : "false");
  $("shelf").dataset.wide = st.shelfWide ? "yes" : "no";
  $("sh-narrow").hidden = !st.shelfWide;

  $("sh-vf").textContent = [
    `a/${page.slug}/${st.shelfTab}.v${now?.n || 0}.html`,
    now?.label || "",
    now?.bytes ? bytes(now.bytes) : ""
  ].filter(Boolean).join("  ·  ");
  $("sh-gh").hidden = !shelfGithubUrl(page, st.shelfTab, now?.n || 0);
}

$("sh-back").addEventListener("click", shelfBack);

$("sh-wide").addEventListener("click", toggleShelfWide);

$("sh-narrow").addEventListener("click", () => setShelfWide(false));

$("sh-search").addEventListener("input", (e) => {
  st.shelfQuery = e.target.value;
  if (raycastOn() && st.shelfOpen) shelfBack();
  else paintShelf();
});

followRaycast((on) => {
  if (!on) undressShelf();
  if (shelfFiltersSolid && shelfOnScreen()) paintShelf();
});

$("btn-shelf").addEventListener("click", () => { closeMore(); shelfOnScreen() ? closeShelf() : openShelf(); });

$("btn-day").addEventListener("click", () => { closeMore(); dayOnScreen() ? closeDay() : openDay(); });

$("sh-copy").addEventListener("click", () => {
  const page = (st.shelf?.pages || []).find((p) => p.slug === st.shelfOpen);
  if (page) toClipboard(shelfDeepLink(page, st.shelfTab, st.shelfVersion));
});

$("sh-gh").addEventListener("click", () => {
  const page = (st.shelf?.pages || []).find((p) => p.slug === st.shelfOpen);
  const versions = shelfVersionsOf(page, st.shelfTab);
  const now = versions.find((v) => v.n === st.shelfVersion) || versions[versions.length - 1];
  const href = page && shelfGithubUrl(page, st.shelfTab, now?.n || 0);
  if (href) window.open(href, "_blank", "noreferrer");
});

window.addEventListener("resize", () => { if (shelfOnScreen() && !st.shelfOpen) fitShelfThumbs(); });

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
  paintTalkButton();
  paintTalk();
  postPins();
}

function paintTalkButton() {
  const count = commentsHere().length;
  const button = $("sh-talk");
  button.textContent = count ? `${phrase("comments")} · ${count}` : phrase("comments");
  button.setAttribute("aria-pressed", talk().open ? "true" : "false");
}

function paintTalkChrome(page, now) {
  const mine = talk();
  if (mine.slug !== page.slug) {
    Object.assign(mine, { slug: page.slug, comments: [], pinning: false, draftPin: null, draftRe: "", frames: [], focus: "", note: "", busy: false });
    pullComments(page.slug, false);
  }
  mine.v = now?.n || 0;
  paintTalkButton();
  $("sh-side").hidden = !mine.open;
  paintTalk();
}

let talkDom = null;

function talkParts() {
  if (talkDom) return talkDom;
  const side = $("sh-side");
  side.innerHTML = `
    <div class="sh-th"><b></b><span class="sh-tn"></span><span class="grow"></span>
      <button type="button" class="btn sh-tpin" aria-pressed="false"></button>
      <button type="button" class="btn sh-tagain"></button></div>
    <p class="sh-thint" hidden></p>
    <div class="sh-tlist"></div>
    <form class="sh-tform">
      <div class="sh-tctx" hidden><span></span><button type="button" class="sh-tdrop"></button></div>
      <textarea rows="3"></textarea>
      <div class="sh-tsend"><span class="sh-tnote" hidden></span><button type="submit" class="btn"></button></div>
    </form>`;
  talkDom = {
    side,
    title: side.querySelector(".sh-th b"),
    count: side.querySelector(".sh-tn"),
    pin: side.querySelector(".sh-tpin"),
    again: side.querySelector(".sh-tagain"),
    hint: side.querySelector(".sh-thint"),
    list: side.querySelector(".sh-tlist"),
    form: side.querySelector(".sh-tform"),
    ctx: side.querySelector(".sh-tctx"),
    ctxSay: side.querySelector(".sh-tctx span"),
    drop: side.querySelector(".sh-tdrop"),
    box: side.querySelector("textarea"),
    note: side.querySelector(".sh-tnote"),
    send: side.querySelector(".sh-tsend button")
  };
  talkDom.pin.addEventListener("click", () => setPinning(!talk().pinning));
  talkDom.again.addEventListener("click", () => pullComments(talk().slug, true));
  talkDom.drop.addEventListener("click", () => { Object.assign(talk(), { draftPin: null, draftRe: "" }); paintTalk(); });
  talkDom.form.addEventListener("submit", (ev) => { ev.preventDefault(); sendComment(); });
  talkDom.box.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); sendComment(); }
  });
  return talkDom;
}

function paintTalk() {
  const parts = talkParts();
  const mine = talk();
  parts.title.textContent = phrase("comments");
  parts.count.textContent = commentsHere().length ? String(commentsHere().length) : "";
  parts.pin.textContent = mine.pinning ? phrase("stop marking") : phrase("mark on the page");
  parts.pin.setAttribute("aria-pressed", mine.pinning ? "true" : "false");
  parts.again.textContent = phrase("read again");
  parts.hint.hidden = !mine.pinning;
  parts.hint.textContent = phrase("click on the page where you want to comment");
  paintTalkList(parts.list);
  const replyingTo = mine.draftRe ? (mine.comments.find((one) => one.id === mine.draftRe)?.who || phrase("someone")) : "";
  const ctx = mine.draftPin
    ? (mine.draftPin.name ? phrase("pinned to {name}", { name: mine.draftPin.name }) : phrase("pinned to the page"))
    : (replyingTo ? phrase("replying to {who}", { who: replyingTo }) : "");
  parts.ctx.hidden = !ctx;
  parts.ctxSay.textContent = ctx;
  parts.drop.textContent = mine.draftPin ? phrase("remove the pin") : phrase("cancel");
  parts.box.placeholder = phrase("write the comment");
  parts.note.textContent = mine.note || "";
  parts.note.hidden = !mine.note;
  parts.send.textContent = phrase("send");
  parts.send.disabled = !!mine.busy;
}

function commentItem(one, n) {
  const item = document.createElement("article");
  item.className = "sh-c";
  item.dataset.id = one.id;
  item.dataset.done = one.done ? "yes" : "no";
  if (one.re) item.dataset.reply = "yes";
  if (talk().focus === one.id) item.dataset.hot = "yes";

  const head = document.createElement("div");
  head.className = "sh-ch";
  if (n) {
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "sh-cn";
    badge.textContent = String(n);
    badge.title = phrase("go to the pin");
    badge.addEventListener("click", () => { talk().focus = one.id; tellPage({ type: "goto", id: one.id }); paintTalk(); });
    head.appendChild(badge);
  }
  const who = document.createElement("b");
  who.textContent = one.who || phrase("someone");
  const when = document.createElement("span");
  when.textContent = [artClock(one.at), one.v ? `v${one.v}` : "", one.pin?.name || ""].filter(Boolean).join(" · ");
  head.append(who, when);

  const text = document.createElement("p");
  text.textContent = one.text;

  const acts = document.createElement("div");
  acts.className = "sh-ca";
  if (!one.re) {
    const reply = document.createElement("button");
    reply.type = "button";
    reply.textContent = phrase("reply");
    reply.addEventListener("click", () => {
      Object.assign(talk(), { draftRe: one.id, draftPin: null });
      paintTalk();
      talkParts().box.focus();
    });
    acts.appendChild(reply);
    const settle = document.createElement("button");
    settle.type = "button";
    settle.textContent = one.done ? phrase("reopen") : phrase("settled");
    settle.addEventListener("click", () => settleComment(one.id, !one.done));
    acts.appendChild(settle);
  }
  if (one.done && one.doneBy) {
    const by = document.createElement("span");
    by.className = "sh-cby";
    by.textContent = phrase("settled by {who}", { who: one.doneBy });
    acts.appendChild(by);
  }
  item.append(head, text, acts);
  return item;
}

function paintTalkList(host) {
  host.textContent = "";
  const here = commentsHere();
  if (!here.length) {
    const blank = document.createElement("p");
    blank.className = "sh-tblank";
    blank.textContent = phrase("nothing said about this page yet — mark a spot on the drawing, or write below");
    host.appendChild(blank);
    return;
  }
  const tops = here.filter((one) => !one.re);
  for (const top of tops) {
    host.appendChild(commentItem(top, pinNumberOf(top.id)));
    for (const reply of here.filter((one) => one.re === top.id)) host.appendChild(commentItem(reply, 0));
  }
  for (const loose of here.filter((one) => one.re && !tops.some((top) => top.id === one.re))) host.appendChild(commentItem(loose, 0));
  const hot = host.querySelector('[data-hot="yes"]');
  if (hot && hot.scrollIntoView) hot.scrollIntoView({ block: "nearest" });
}

async function sendComment() {
  const parts = talkParts();
  const mine = talk();
  const text = parts.box.value.trim();
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
  parts.box.value = "";
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
    talkParts().box.focus();
    return;
  }
  if (said.type === "open") {
    Object.assign(mine, { open: true, focus: String(said.id || "") });
    paintShelfView();
  }
}

window.addEventListener("message", (ev) => {
  const said = ev.data;
  if (!said || said.hive !== TALK_CHANNEL) return;
  if (ev.source !== $("sh-frame").contentWindow) return;
  heardFromPage(said);
});

$("sh-frame").addEventListener("load", () => postPins());

$("sh-talk").addEventListener("click", () => {
  talk().open = !talk().open;
  paintShelfView();
});

export { pickShelf, shelfActions, shelfFiltersWindowModel, shelfGalleryWindowModel, shelfPreviewModel, shelfRowModel, shelfShownRows, stepShelf, commentsHere, heardFromPage, paintTalk, pinsHere, postPins, pullComments, sendComment, settleComment, talkParts, GITHUB_SHELF_URL, SHELF_BANDS, SHELF_STATES, SHELF_STATE_WAS, SHELF_TABS, SHELF_THUMB_W, closeShelf, fitShelfThumbs, openShelf, openShelfPage, setShelfWide, shelfWideOn, toggleShelfWide, paintPageChrome, paintShelf, paintShelfView, pullShelf, shelfBack, shelfBandOf, shelfBandShut, shelfCardChips, shelfCardModel, shelfDeepLink, shelfFiltersSolid, shelfFiltersViewModel, shelfFoldBand, shelfGallerySolid, shelfGalleryViewModel, shelfGithubUrl, shelfLabelState, shelfOnScreen, shelfPickFilter, shelfRows, shelfStatesOf, shelfTabLabel, shelfTabState, shelfTabsOf, shelfTopVersion, shelfVersionsOf };
