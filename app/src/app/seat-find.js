import { phrase } from "./core.js";

const WAIT_MS = 250;
const SHORTEST = 3;

let held = { q: "", found: new Map() };
let asking = "";
let timer = 0;

function findInChats(asked) {
  const want = String(asked || "").trim();
  if (want === held.q || want === asking) return;
  clearTimeout(timer);
  if (want.length < SHORTEST) {
    held = { q: want, found: new Map() };
    return;
  }
  timer = setTimeout(async () => {
    asking = want;
    const said = await fetch(`/api/seats/find?q=${encodeURIComponent(want)}`).then((r) => r.json()).catch(() => null);
    asking = "";
    if (!said || !Array.isArray(said.found)) return;
    held = { q: said.q, found: new Map(said.found.map((one) => [one.name, one])) };
    document.dispatchEvent(new CustomEvent("hive:marks"));
  }, WAIT_MS);
}

const messageHit = (name, asked) => (held.q === String(asked || "").trim() ? held.found.get(name) || null : null);

const hitSays = (hit) => `${phrase(hit.who === "you" ? "You:" : "Agent:")} ${hit.text}`;

export { findInChats, hitSays, messageHit };
