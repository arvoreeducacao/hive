import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { app, state, views } from "./dom.mjs";

const st = await state();
await views();
const { shortBranch } = await app("seat-layout");
const { createTile, tileChipsModel } = await app("seat-menu");

const seatWith = (tree) => {
  st.lentHere = [];
  st.prs = [];
  st.data = { sessions: [], spawning: [], archived: [], pod: { up: false, name: "" } };
  return { name: "s1", title: "s1", where: "local", state: "idle", kind: "chat", trees: [tree] };
};

const chipModel = (tree) => tileChipsModel(seatWith(tree))[0];
const chipNode = (tree) => createTile(seatWith(tree)).querySelector(".t-chips .c");

test("the chip carries the repo and the tail of the branch, because the card has no room for the rest", () => {
  const chip = chipModel({ repo: "api-arvore", branch: "jott4-/-mcp-despachante-readonly", path: "/x/api-arvore", main: true });
  assert.equal(chip.text, "api-arvore");
  assert.equal(chip.twig, "mcp-despachante-readonly");
  assert.ok(!chip.twig.includes("jott4-"), "the owner prefix is in the tooltip, not on the card");
});

test("the whole branch and the folder are in the tooltip, so nothing is only shortened away", () => {
  const chip = chipModel({ repo: "dev-workspaces", branch: "joao/-/humor", path: "/Users/x/hive-humor", main: false });
  assert.equal(chip.title, "/Users/x/hive-humor\njoao/-/humor\nworktree");
});

test("a worktree is marked apart from the repo's own folder", () => {
  const apart = chipModel({ repo: "dev-workspaces", branch: "joao/-/humor", path: "/Users/x/hive-humor", main: false });
  const home = chipModel({ repo: "dev-workspaces", branch: "main", path: "/Users/x/dev-workspaces", main: true });
  assert.equal(apart.cls, "tree apart");
  assert.equal(home.cls, "tree");
  assert.ok(!home.title.includes("worktree"), "the repo's own folder is not called a worktree");
  assert.equal(chipNode({ repo: "dev-workspaces", branch: "joao/-/humor", path: "/Users/x/hive-humor", main: false }).className, "c tree apart");
  assert.equal(chipNode({ repo: "dev-workspaces", branch: "main", path: "/Users/x/dev-workspaces", main: true }).className, "c tree");
});

test("a detached head has no branch to shorten and the chip is just the repo", () => {
  const chip = chipModel({ repo: "migrations", branch: "", path: "/x/migrations", main: true });
  assert.equal(chip.twig, "");
  assert.equal(chip.text, "migrations");
  assert.equal(chipNode({ repo: "migrations", branch: "", path: "/x/migrations", main: true }).querySelector("b"), null);
});

test("the repo is the half the chip may cut, and the branch is the half that survives", () => {
  const node = chipNode({ repo: "dev-workspaces", branch: "joao/-/uma-conexao-por-pod", path: "/x", main: false });
  assert.equal(node.querySelector("span.tx").textContent, "dev-workspaces");
  assert.equal(node.querySelector("b").textContent, "uma-conexao-por-pod");

  const page = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "app.html"), "utf8");
  const cut = page.slice(page.indexOf(".t-chips .c, .t-where .c {"), page.indexOf(".t-chips .c.lent {"));
  assert.ok(/\.t-chips \.c \.tx[^{]*\{[^}]*text-overflow: ellipsis/.test(cut), "the ellipsis has to sit on a child, never on the flex box itself");
  assert.ok(!/\.t-chips \.c, \.t-where \.c \{[^}]*text-overflow/.test(cut), "text-overflow on a flex container does nothing but hide the cut");
});

test("a branch named after someone is escaped, never pasted into the card as markup", () => {
  const node = chipNode({ repo: "x", branch: "<img src=x onerror=1>", path: "/x", main: true });
  assert.equal(node.querySelector("img"), null);
  assert.match(node.innerHTML, /&lt;img/);
  assert.equal(node.querySelector("b").textContent, "<img src=x onerror=1>");
});

test("a branch with no slashes is left whole", () => {
  assert.equal(shortBranch("main"), "main");
  assert.equal(shortBranch("PED-9-abrir-thread"), "PED-9-abrir-thread");
  assert.equal(shortBranch(""), "");
});

test("the dash of the <quem>/-/<o-que> separator does not survive into the chip", () => {
  assert.equal(shortBranch("jott4-/-mcp-despachante-readonly"), "mcp-despachante-readonly");
  assert.equal(shortBranch("joao-cunha/-/painel-de-pedidos"), "painel-de-pedidos");
  assert.equal(shortBranch("oms/a2b-conector"), "a2b-conector");
});
