const SHELF_HOST = "shelf";
const JOIN_HOST = "join";
const SEAT_HOST = "seat";
const SEAT_NAME = /^[A-Za-z0-9._-]{1,80}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
const TABS = ["documento", "telas", "plano", "lente"];
const KEY = /^SHA256:[A-Za-z0-9+/]{43}$/;

function hostAndPath(raw, host) {
  let url = null;
  try { url = new URL(String(raw || "")); } catch { return null; }
  if (url.protocol !== "hive:" || url.hostname !== host) return null;
  return { url, path: decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, "")) };
}

function shelfLinkOf(raw) {
  const asked = hostAndPath(raw, SHELF_HOST);
  if (!asked || !SLUG.test(asked.path)) return null;
  const tab = asked.url.searchParams.get("tab") || "";
  const at = String(asked.url.hash || "").replace(/^#/, "").replace(/[^\w-]/g, "");
  const version = Number(asked.url.searchParams.get("v"));
  return {
    slug: asked.path,
    tab: TABS.includes(tab) ? tab : "",
    at,
    version: Number.isInteger(version) && version > 0 ? version : 0
  };
}

function joinLinkOf(raw) {
  const asked = hostAndPath(raw, JOIN_HOST);
  if (!asked || asked.path) return null;
  const key = asked.url.searchParams.get("key") || "";
  const token = asked.url.searchParams.get("token") || "";
  if (!KEY.test(key) || !token) return null;
  let at = null;
  try { at = new URL(String(asked.url.searchParams.get("at") || "")); } catch { return null; }
  if ((at.protocol !== "http:" && at.protocol !== "https:") || !at.hostname) return null;
  return { link: asked.url.toString(), at: at.toString().replace(/\/$/, "") };
}

function seatLinkOf(raw) {
  const asked = hostAndPath(raw, SEAT_HOST);
  if (!asked || !SEAT_NAME.test(asked.path) || /^\.+$/.test(asked.path)) return null;
  return asked.path;
}

function linkOf(raw) {
  const shelf = shelfLinkOf(raw);
  if (shelf) return { kind: SHELF_HOST, asked: shelf };
  const join = joinLinkOf(raw);
  if (join) return { kind: JOIN_HOST, asked: join };
  const seat = seatLinkOf(raw);
  if (seat) return { kind: SEAT_HOST, asked: seat };
  return null;
}

const LINK_TRIES = 20;
const LINK_WAIT = 400;

async function deliverLink({ asked, offer, again, tries = 0, max = LINK_TRIES }) {
  let taken = false;
  try { taken = Boolean(await offer(asked)); } catch { taken = false; }
  if (taken || tries >= max) return taken;
  return new Promise((done) => {
    again(() => { done(deliverLink({ asked, offer, again, tries: tries + 1, max })); });
  });
}

module.exports = { SHELF_HOST, JOIN_HOST, SEAT_HOST, LINK_TRIES, LINK_WAIT, shelfLinkOf, joinLinkOf, seatLinkOf, linkOf, deliverLink };
