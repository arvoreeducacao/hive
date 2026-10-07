import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRINT_CEILING, TABS, askedTab, keepPrint, printsFlow, printsPage, readPrints, tabOf } from "../lib/shelf.mjs";

const sandbox = () => {
  const home = mkdtempSync(join(tmpdir(), "hive-prints."));
  return { home, gone: () => rmSync(home, { recursive: true, force: true }) };
};

test("prints is the fifth tab, and a file called prints lands on it", () => {
  assert.deepEqual(TABS, ["documento", "telas", "plano", "lente", "prints"]);
  assert.equal(tabOf("prints.html"), "prints");
  assert.deepEqual(askedTab("prints"), { tab: "prints" });
});

test("a kept print gets a numbered file named by its caption, and the list remembers it", () => {
  const { home, gone } = sandbox();
  try {
    const first = keepPrint(home, "card-do-livro", { bytes: Buffer.from("jpg"), ext: "jpeg", caption: "Card inteiro em 2000×1130, depois", who: "mateus", seat: "chat-a", from: "/x/tela.png", at: 1_790_000_000_000 });
    assert.equal(first.print.file, "01-card-inteiro-em-2000-1130-depois.jpg");
    assert.ok(existsSync(join(home, "a", "card-do-livro", "prints", first.print.file)));
    const second = keepPrint(home, "card-do-livro", { bytes: Buffer.from("png"), ext: "png", caption: "  mobile  390px ", who: "mateus", seat: "chat-a", from: "m.png", at: 1_790_000_001_000 });
    assert.equal(second.print.n, 2);
    assert.equal(second.print.caption, "mobile 390px");
    assert.deepEqual(readPrints(home, "card-do-livro").map((p) => p.file), [first.print.file, "02-mobile-390px.png"]);
    assert.equal(readPrints(home, "card-do-livro")[0].from, "tela.png");
  } finally { gone(); }
});

test("a print without a caption, too big, or of an unknown kind is refused", () => {
  const { home, gone } = sandbox();
  try {
    assert.match(keepPrint(home, "x", { bytes: Buffer.from("a"), ext: "jpg", caption: "  " }).error, /caption/);
    assert.match(keepPrint(home, "x", { bytes: Buffer.alloc(PRINT_CEILING + 1), ext: "jpg", caption: "grande" }).error, /300 KB/);
    assert.match(keepPrint(home, "x", { bytes: Buffer.from("a"), ext: "gif", caption: "gif" }).error, /jpg, png or webp/);
    assert.equal(readPrints(home, "x").length, 0);
  } finally { gone(); }
});

test("the prints page lists every print with its caption, relative by default and embedded on request", () => {
  const prints = [{ n: 1, file: "01-a.jpg", caption: "a <tela>", who: "mateus", at: 1_790_000_000_000 }];
  const relative = printsPage({ title: "Card do livro", slug: "card-do-livro", prints });
  assert.match(relative, /<title>Card do livro<\/title>/);
  assert.match(relative, /src="prints\/01-a\.jpg"/);
  assert.match(relative, /a &lt;tela&gt;/);
  const embedded = printsPage({ title: "Card do livro", slug: "card-do-livro", prints, src: (p) => `data:image/jpeg;base64,AAAA` });
  assert.match(embedded, /src="data:image\/jpeg;base64,AAAA"/);
  assert.match(printsPage({ title: "t", slug: "t", prints: [] }), /nenhum print guardado ainda/);
});

test("a print follows the last one by default, a number picks another, and zero starts a flow of its own", () => {
  const { home, gone } = sandbox();
  try {
    const keep = (caption, after) => keepPrint(home, "fluxo", { bytes: Buffer.from("x"), ext: "jpg", caption, after }).print;
    assert.equal(keep("home").after, null);
    assert.equal(keep("clicou em entrar").after, 1);
    assert.equal(keep("erro de senha", 2).after, 2);
    assert.equal(keep("outra tela, do zero", 0).after, null);
    assert.equal(keep("aponta pra um que não existe", 99).after, null);
    assert.equal(keep("volta pro início", "1").after, 1);
  } finally { gone(); }
});

test("the flow groups prints into rows: a chain stays on one row, a branch starts a row that says where it came from", () => {
  const prints = [
    { n: 1, after: null }, { n: 2, after: 1 }, { n: 3, after: 2 },
    { n: 4, after: 2 }, { n: 5, after: null }
  ];
  const rows = printsFlow(prints).map((row) => ({ from: row.from, ns: row.prints.map((p) => p.n) }));
  assert.deepEqual(rows, [{ from: null, ns: [1, 2, 3] }, { from: 2, ns: [4] }, { from: null, ns: [5] }]);
});

test("the page draws arrows between prints of a row and a branch label, and a lone list stays a list", () => {
  const chain = printsPage({ title: "t", slug: "t", prints: [{ n: 1, file: "a.jpg", caption: "a", at: 1 }, { n: 2, file: "b.jpg", caption: "b", after: 1, at: 2 }, { n: 3, file: "c.jpg", caption: "c", after: 1, at: 3 }] });
  assert.match(chain, /class="row flow"/);
  assert.match(chain, /class="arrow"/);
  assert.match(chain, /↳ de #1/);
  assert.match(chain, /2 fluxos/);
  const alone = printsPage({ title: "t", slug: "t", prints: [{ n: 1, file: "a.jpg", caption: "a", at: 1 }] });
  assert.ok(!alone.includes('class="row flow"'));
  assert.ok(!alone.includes("fluxo"));
});
