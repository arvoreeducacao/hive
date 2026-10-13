const STORE_NAME = /^[\w.-]+\/[\w.-]+$/;
const PART = /^[a-z0-9][a-z0-9-]{0,99}$/;
const SCREEN_ID = /^[\w-]{1,100}$/;

export const screenbookStoreOf = (named) => (STORE_NAME.test(String(named || "").trim()) ? String(named).trim() : "");

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

export async function proposalFromStore({ ghApi, store, product, id }) {
  if (!screenbookStoreOf(store)) return { error: "no screenbook store is set on this hive" };
  if (!PART.test(String(product || "")) || !PART.test(String(id || ""))) return { error: "that is not a proposal of the screenbook" };
  const file = await fileFromStore({ ghApi, store, path: `${product}/proposals/${id}/proposal.json` });
  if (file.missing) return { error: file.error, missing: (await ghApi(`repos/${store}`)).ok };
  if (file.error) return file;
  let record;
  try { record = JSON.parse(file.data.toString("utf8")); } catch { return { error: "the proposal file is not json" }; }
  return { screens: pinnedScreens(record?.screens), status: String(record?.status || "") };
}

export async function pictureFromStore({ ghApi, store, product, screens }) {
  if (!screenbookStoreOf(store) || !PART.test(String(product || ""))) return { error: "no screenbook store to read the picture from" };
  const [first] = Object.entries(pinnedScreens(screens));
  if (!first) return { error: "the proposal has no screen to picture" };
  const [screen, version] = first;
  return fileFromStore({ ghApi, store, path: `${product}/screens/${screen}/v${version}.png` });
}
