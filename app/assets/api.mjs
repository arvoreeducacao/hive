export async function api(path, { method = "GET", body, signal } = {}) {
  const r = await fetch(path, {
    method,
    signal,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`${method} ${path} answered ${r.status}`);
  const text = await r.text();
  return text ? JSON.parse(text) : {};
}

export const apiGet = (path, opts) => api(path, { ...opts, method: "GET" });

export const apiPost = (path, body, opts = {}) => api(path, { ...opts, method: "POST", body });

export async function apiBinary(path, bytes, { signal } = {}) {
  const r = await fetch(path, {
    method: "POST",
    signal,
    headers: { "content-type": "application/octet-stream" },
    body: bytes
  });
  const text = await r.text();
  const said = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(said.error || `POST ${path} answered ${r.status}`);
  return said;
}
