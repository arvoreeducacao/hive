export const PR_VIEW_NAME_MAX = 80;
export const PR_VIEW_QUERY_MAX = 200;
export const PR_VIEWS_MAX = 40;
export const PR_VIEW_FILTERS = ["all", "asks", "mine", "team", "failing"];

const VIEW_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function prViewOf(state) {
  const filter = PR_VIEW_FILTERS.includes(state?.filter) ? state.filter : "all";
  return { filter, query: String(state?.query ?? "").trim() };
}

export function cleanPrView(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!VIEW_ID.test(id) || !name || name.length > PR_VIEW_NAME_MAX) return null;
  if (raw.filter !== undefined && !PR_VIEW_FILTERS.includes(raw.filter)) return null;
  if (raw.query !== undefined && (typeof raw.query !== "string" || raw.query.trim().length > PR_VIEW_QUERY_MAX)) return null;
  return { id, name, ...prViewOf(raw) };
}

export function prViewMatches(view, state) {
  if (!view) return false;
  const want = prViewOf(view);
  const now = prViewOf(state);
  return want.filter === now.filter && want.query === now.query;
}

export function prViewNameTrouble(name, views, editingId = "") {
  const said = String(name ?? "").trim();
  if (!said) return "empty";
  if (said.length > PR_VIEW_NAME_MAX) return "long";
  const taken = (views || []).some((view) => view.id !== editingId && view.name.toLowerCase() === said.toLowerCase());
  return taken ? "taken" : "";
}

export const addPrView = (views, { id, name, state }) => [...(views || []), { id, name: String(name).trim(), ...prViewOf(state) }];

export const renamePrView = (views, id, name) => (views || []).map((view) => (view.id === id ? { ...view, name: String(name).trim() } : view));

export const updatePrView = (views, id, state) => (views || []).map((view) => (view.id === id ? { ...view, ...prViewOf(state) } : view));

export const dropPrView = (views, id) => (views || []).filter((view) => view.id !== id);
