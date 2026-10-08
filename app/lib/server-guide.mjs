export function serverGuideOf(pkg) {
  const home = String(pkg?.homepage || "").replace(/\/+$/, "");
  return /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(home) ? `${home}/blob/main/docs/run-your-own.md` : "";
}
