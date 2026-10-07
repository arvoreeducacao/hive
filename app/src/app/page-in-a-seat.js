import { openArtifactTab, openBrowser, openWebPage, webAddress, webOfSeat } from "./chat-and-panes.js";
import { openDraft } from "./draft-seat.js";
import { $, st } from "./core.js";
import { closeShelf, pullShelf, shelfOnScreen, shelfTabsOf } from "./shelf.js";
import { shelfPageOf, shelfPaneIndex } from "./subagents-dock.js";
import { chatOfPr } from "./seat-menu.js";
import { closePrs, prsOnScreen } from "./thread.js";
import { PR_PAGE_ADDRESS, prPageAddress } from "/assets/pr-page.mjs";

const SEAT_NAME_MAX = 40;

function nameForPage(slug, taken) {
  const base = slug.slice(0, SEAT_NAME_MAX).replace(/^-+|-+$/g, "") || "page";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const tail = `-${n}`;
    const tried = `${base.slice(0, SEAT_NAME_MAX - tail.length)}${tail}`;
    if (!taken.has(tried)) return tried;
  }
  return `${base.slice(0, SEAT_NAME_MAX - 6)}-${Date.now().toString().slice(-4)}`;
}

function seatThatPublished(slug) {
  const onTheShelf = (st.shelf?.pages || []).find((one) => one.slug === slug)?.seat || "";
  const keptHere = (st.published || []).find((one) => one.slug === slug)?.session || "";
  const seat = onTheShelf || keptHere;
  if (!seat) return "";
  return (st.data?.sessions || []).some((s) => s.name === seat) ? seat : "";
}

function seatYouClickedFrom(asked) {
  const here = String(asked?.from || "");
  if (!here) return "";
  return (st.data?.sessions || []).some((s) => s.name === here) ? here : "";
}

function seatOfPage(slug) {
  const base = nameForPage(slug, new Set());
  const mine = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(-\\d+)?$`);
  for (const [name, web] of webOfSeat) {
    if (!mine.test(name)) continue;
    if ((web.tabs || []).some((t) => t.kind === "artifact" && t.slug === slug)) return name;
  }
  return "";
}

async function pageOnTheShelf(slug) {
  if (!st.shelf) await pullShelf(false);
  const here = shelfPageOf(slug);
  if (here) return here;
  await pullShelf(true);
  return shelfPageOf(slug);
}

async function openPageInASeat(asked) {
  const slug = String(asked?.slug || "");
  if (!slug) return;
  const page = await pageOnTheShelf(slug);
  if (!page) return window.hiveOpenShelf(asked);
  const wanted = String(asked?.tab || "");
  const version = Number(asked?.version) || 0;
  const index = shelfPaneIndex(page, wanted, version);
  if (!index) return window.hiveOpenShelf(asked);
  const already = seatThatPublished(slug) || seatOfPage(slug) || seatYouClickedFrom(asked);
  const name = already || openDraft().key;
  if (!name) return window.hiveOpenShelf(asked);
  const landed = openArtifactTab(name, { ...index, at: String(asked?.at || "") }, version);
  if (!landed) return window.hiveOpenShelf(asked);
  if (shelfOnScreen()) closeShelf();
  if (already && st.webChat !== name) openBrowser(name);
}

const tabOnThePr = (web, address) => (web?.tabs || []).find((t) => t.kind !== "artifact" && (t.url === address || String(t.url || "").startsWith(`${address}/`)));

const PR_PAGE = /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+(?:[/?#]|$)/;

const tabOnAnyPr = (web) => (web?.tabs || []).find((t) => t.kind !== "artifact" && (PR_PAGE.test(String(t.url || "")) || PR_PAGE_ADDRESS.test(String(t.url || ""))));

function chatShowing(address) {
  for (const [name, web] of webOfSeat) if (tabOnThePr(web, address)) return name;
  return "";
}

function openPrInASeat(p) {
  const address = p?.key ? prPageAddress(p.key) : webAddress(p?.url || "");
  if (!address) return;
  if (prsOnScreen()) closePrs();
  const name = chatOfPr(p) || chatShowing(address) || openDraft().key;
  if (!name) return window.open(address, "_blank");
  const web = webOfSeat.get(name);
  const same = tabOnThePr(web, address);
  if (same) return openWebPage(name, same.url);
  openWebPage(name, address, tabOnAnyPr(web));
}

window.hiveOpenPage = openPageInASeat;

$("sh-seat")?.addEventListener("click", () => {
  const page = (st.shelf?.pages || []).find((one) => one.slug === st.shelfOpen);
  if (!page) return;
  const tabs = shelfTabsOf(page);
  openPageInASeat({
    slug: page.slug,
    tab: tabs.includes(st.shelfTab) ? st.shelfTab : "",
    version: Number(st.shelfVersion) || 0
  });
});

export { chatShowing, nameForPage, openPageInASeat, openPrInASeat, pageOnTheShelf, seatOfPage, seatThatPublished, seatYouClickedFrom };
