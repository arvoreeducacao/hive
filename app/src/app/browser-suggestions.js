import { esc, phrase } from "./core.js";
import { openWebPage } from "./chat-and-panes.js";
import { lucide } from "./lucide.js";
import { WEB_ID, registerSurface } from "./side-panel.js";
import { ART_WEBVIEW } from "./subagents-dock.js";
import { recentPages } from "./web-pane-extras.js";

const FRESH = 15000;

const found = { at: 0, asking: false, servers: [] };

function localServers(repaint) {
  if (!found.asking && Date.now() - found.at > FRESH) {
    found.asking = true;
    fetch("/api/local-servers").then((answer) => answer.json()).then((said) => { found.servers = said.servers || []; }).catch(() => {}).finally(() => {
      found.asking = false;
      found.at = Date.now();
      repaint();
    });
  }
  return found.servers;
}

const shortUrl = (url) => String(url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

function rowHtml(url, title, icon) {
  return `<button type="button" class="sp-li" data-act="web-suggest" data-url="${esc(url)}" title="${esc(url)}">${lucide(icon)}<span>${esc(title || shortUrl(url))}</span></button>`;
}

const listHtml = (label, rows) => `<div class="sp-list sp-more" role="group" aria-label="${esc(label)}">${rows}</div>`;

function suggestionsHtml(s, repaint) {
  if (!ART_WEBVIEW || !s) return "";
  const servers = localServers(repaint);
  const recent = recentPages().filter((one) => !servers.some((server) => shortUrl(server.url) === shortUrl(one.url)));
  const blocks = [];
  if (servers.length) blocks.push(listHtml(phrase("Local servers"), servers.map((one) => rowHtml(one.url, one.title || `localhost:${one.port}`, "server")).join("")));
  if (recent.length) blocks.push(listHtml(phrase("Recent pages"), recent.map((one) => rowHtml(one.url, one.title, "globe")).join("")));
  return blocks.join("");
}

registerSurface({
  id: WEB_ID,
  launcherExtra: (s, repaint) => suggestionsHtml(s, repaint),
  acts: (act, hit, s) => {
    if (act !== "web-suggest" || !s) return false;
    openWebPage(s.name, hit.dataset.url);
    return true;
  }
});
