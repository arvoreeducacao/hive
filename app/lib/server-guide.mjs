export function docsLinkOf(pkg, path) {
  const home = String(pkg?.homepage || "").replace(/\/+$/, "");
  return /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(home) ? `${home}/blob/main/${path}` : "";
}

export function serverGuideOf(pkg) {
  return docsLinkOf(pkg, "docs/run-your-own.md");
}

export function meetingsGuideOf(pkg) {
  return docsLinkOf(pkg, "docs/meetings.md");
}
