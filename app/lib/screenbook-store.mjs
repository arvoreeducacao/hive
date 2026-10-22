const STORE_NAME = /^[\w.-]+\/[\w.-]+$/;
const PART = /^[a-z0-9][a-z0-9-]{0,99}$/;
const SCREEN_ID = /^[\w-]{1,100}$/;

function serverOf(named) {
  let parsed;
  try { parsed = new URL(named); } catch { return ""; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) return "";
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}

export function screenbookStoreOf(named) {
  const store = String(named || "").trim();
  if (STORE_NAME.test(store)) return store;
  return /^https:\/\//i.test(store) ? serverOf(store) : "";
}

const isServer = (store) => store.startsWith("https://");

async function askServer({ fetchFn, ghToken, store, product, method, args }) {
  const token = String((await ghToken?.()) || "").trim();
  if (!token) return { error: "no github login on this machine to read the screenbook" };
  let answer;
  try {
    answer = await fetchFn(`${store}/${product}/api/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ method, args }),
      signal: AbortSignal.timeout(30000)
    });
  } catch (err) {
    return { error: `the screenbook did not answer: ${String(err?.message || err)}`.slice(0, 200) };
  }
  let body;
  try { body = await answer.json(); } catch { body = null; }
  if (!answer.ok) {
    const said = String(body?.error || `HTTP ${answer.status}`).slice(0, 200);
    return { error: said, missing: answer.status === 404 && /\bno proposal\b/i.test(said) };
  }
  if (!body || !("result" in body)) return { error: "the screenbook answered something that is not a result" };
  return { result: body.result };
}

const bufferOf = (value) => (typeof value?.$buffer === "string" ? Buffer.from(value.$buffer, "base64") : null);

const BLOB_SHA = /^[0-9a-f]{40}$/;

async function jsonFromStore(ghApi, route) {
  const answer = await ghApi(route);
  if (!answer.ok) return { error: String(answer.error || "the screenbook store did not answer").slice(0, 200), missing: /\b404\b|not found/i.test(String(answer.error || "")) };
  try { return { parsed: JSON.parse(answer.out) }; } catch { return { error: "the screenbook store answered something that is not a file" }; }
}

async function fileFromStore({ ghApi, store, path }) {
  const file = await jsonFromStore(ghApi, `repos/${store}/contents/${path}`);
  if (file.error) return file;
  let { parsed } = file;
  if ((parsed?.encoding !== "base64" || !parsed.content) && BLOB_SHA.test(String(parsed?.sha || ""))) {
    const blob = await jsonFromStore(ghApi, `repos/${store}/git/blobs/${parsed.sha}`);
    if (blob.error) return blob;
    parsed = blob.parsed;
  }
  if (parsed?.encoding !== "base64" || !parsed.content) return { error: "that file is too big to read through the store" };
  return { data: Buffer.from(String(parsed.content).replace(/\s+/g, ""), "base64") };
}

export function pinnedScreens(screens) {
  const pinned = {};
  for (const [id, version] of Object.entries(screens && typeof screens === "object" ? screens : {})) {
    if (SCREEN_ID.test(id) && Number.isInteger(version) && version > 0) pinned[id] = version;
  }
  return pinned;
}

export async function proposalFromStore({ ghApi, ghToken, fetchFn = globalThis.fetch, store: named, product, id }) {
  const store = screenbookStoreOf(named);
  if (!store) return { error: "no screenbook store is set on this hive" };
  if (!PART.test(String(product || "")) || !PART.test(String(id || ""))) return { error: "that is not a proposal of the screenbook" };
  if (isServer(store)) {
    const asked = await askServer({ fetchFn, ghToken, store, product, method: "proposal", args: [id] });
    if (asked.error) return asked;
    if (!asked.result || typeof asked.result !== "object") return { error: "the screenbook answered a proposal that is not a record" };
    return { screens: pinnedScreens(asked.result.screens), status: String(asked.result.status || "") };
  }
  const file = await fileFromStore({ ghApi, store, path: `${product}/proposals/${id}/proposal.json` });
  if (file.missing) return { error: file.error, missing: (await ghApi(`repos/${store}`)).ok };
  if (file.error) return file;
  let record;
  try { record = JSON.parse(file.data.toString("utf8")); } catch { return { error: "the proposal file is not json" }; }
  return { screens: pinnedScreens(record?.screens), status: String(record?.status || "") };
}

export async function pictureFromStore({ ghApi, ghToken, fetchFn = globalThis.fetch, store: named, product, screens }) {
  const store = screenbookStoreOf(named);
  if (!store || !PART.test(String(product || ""))) return { error: "no screenbook store to read the picture from" };
  const [first] = Object.entries(pinnedScreens(screens));
  if (!first) return { error: "the proposal has no screen to picture" };
  const [screen, version] = first;
  if (isServer(store)) {
    const asked = await askServer({ fetchFn, ghToken, store, product, method: "png", args: [screen, version] });
    if (asked.error) return asked;
    const data = bufferOf(asked.result);
    return data ? { data } : { error: `the screenbook has no picture of ${screen} v${version}`, missing: true };
  }
  return fileFromStore({ ghApi, store, path: `${product}/screens/${screen}/v${version}.png` });
}
