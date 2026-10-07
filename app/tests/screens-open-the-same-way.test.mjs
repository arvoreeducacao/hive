import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const page = readFileSync(join(HERE, "app.html"), "utf8");
const src = (file) => readFileSync(join(HERE, "src", file), "utf8");
const map = readFileSync(join(HERE, "assets", "page-map.mjs"), "utf8");

test("every full screen and every modal comes in with the same short motion, and none of it under reduced motion", () => {
  assert.match(page, /\.modal\.on \.box \{ animation: boxIn 200ms var\(--ease\); \}/);
  assert.match(page, /#day:not\(\[hidden\]\), #shelf:not\(\[hidden\]\), #prs:not\(\[hidden\]\), #usage:not\(\[hidden\]\), #worktrees:not\(\[hidden\]\), #pod:not\(\[hidden\]\), #portaria:not\(\[hidden\]\), #workspace:not\(\[hidden\]\) \{ animation: screenIn 180ms/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\) \{ \.modal\.on, \.modal\.on \.box \{ animation: none; \} \}/);
  assert.match(page, /@media \(prefers-reduced-motion: reduce\) \{ #day:not\(\[hidden\]\)[^}]*\{ animation: none; \} \}/);
});

test("every full screen has a close button that says esc, not only the two that had one", () => {
  assert.match(page, /<button class="ghost" id="day-close">close <kbd>esc<\/kbd><\/button>/);
  assert.match(page, /<button class="ghost" id="pt-close">close <kbd>esc<\/kbd><\/button>/);
  assert.match(src("panels/usage.jsx"), /<button class="ghost" id="usage-close" onClick=\{\(\) => props\.actions\.close\(\)\}>\{props\.model\.top\.closeSay\} <kbd>esc<\/kbd><\/button>/);
  assert.match(src("panels/workspace.jsx"), /<button class="ghost" id="ws-close">\{props\.top\.closeSay\} <kbd>esc<\/kbd><\/button>/);
  assert.match(src("panels/worktrees.jsx"), /<button class="ghost" id="wt-close">\{props\.top\.closeSay\} <kbd>esc<\/kbd><\/button>/);
  assert.match(src("app/usage.js"), /close: \(\) => closeUsage\(\)/);
  assert.match(src("app/pod.js"), /closest\("#ws-close"\)\) return closeWorkspace\(\)/);
  assert.match(src("app/pod.js"), /\$\("pt-close"\)\.addEventListener\("click", \(\) => closePortaria\(\)\)/);
  assert.match(src("app/worktrees.js"), /closest\("#wt-close"\)\) return closeWorktrees\(\)/);
});

test("a screen opening tells the popovers, and each popover closes on the word", () => {
  for (const [file, opener] of [["app/usage.js", "openUsage"], ["app/day.js", "openDay"], ["app/shelf.js", "openShelf"], ["app/worktrees.js", "openWorktrees"], ["app/pod.js", "openPortaria"], ["app/pod.js", "openWorkspace"], ["app/team.js", "goToTeam"]]) {
    const body = src(file);
    const at = body.indexOf(`function ${opener}(`);
    assert.ok(at >= 0, `${file} has no ${opener}`);
    assert.match(body.slice(at, at + 200), /screenOpens\(\);/, `${opener} does not tell the popovers`);
  }
  assert.match(src("app/core.js"), /const screenOpens = \(\) => document\.dispatchEvent\(new CustomEvent\("hive:screen"\)\);/);
  for (const [file, closer] of [["app/limit-chip.js", "closeLimPop"], ["app/seat-menu.js", "closePrPop"], ["app/new-chat.js", "closeMore"]]) {
    assert.match(src(file), new RegExp(`document\\.addEventListener\\("hive:screen", \\(\\) => ${closer}\\(\\)\\);`), `${closer} does not listen`);
  }
});

test("the fold button is an icon like its neighbours, and the plus exists in the sprite", () => {
  assert.match(src("app/core.js"), /b\.innerHTML = svgIcon\(on \? "i-plus" : "i-minus"\);/);
  assert.match(page, /<symbol id="i-plus" viewBox="0 0 16 16">/);
});

test("the picker's agent rail is only there for the model menu, and the effort menu always marks a level", () => {
  assert.match(page, /\.sv-menu \.rail\[hidden\] \{ display: none; \}/);
  const panes = src("app/chat-and-panes.js");
  assert.match(panes, /if \(!now\) \{\s*const own = pickerRow\(\{ label: phrase\("default"\), hint: phrase\("the model decides on its own"\), on: true \}\);/);
});

test("theme cards keep the name on one line and the actions on their own", () => {
  assert.match(page, /\.thm-meta b \{ flex: 1; min-width: 0;/);
  assert.match(page, /\.thm-acts \{ flex: 1 0 100%;/);
});

test("the icon-only buttons of the top bar carry a name a reader can say", () => {
  assert.match(page, /id="btn-more" title="everything else" aria-label="everything else"/);
  assert.match(page, /id="btn-pal" title="search anything — sessions, blocks, commands" aria-label="search anything — sessions, blocks, commands"/);
});

test("the page map never reads a <style> inside an svg as the name of what holds it", () => {
  assert.match(map, /const tagOf = \(el\) => String\(el\.tagName \|\| ""\)\.toUpperCase\(\);/);
  assert.match(map, /if \(SKIP\[tagOf\(el\)\]\) return;/);
  assert.match(map, /const said = trim\(spoken\(el\), NAME\);/);
  assert.doesNotMatch(map, /trim\(el\.textContent, NAME\)/);
});
