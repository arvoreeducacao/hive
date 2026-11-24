import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";
import { renderMarkdown } from "../assets/markdown.mjs";

const { tableAsHtml } = await app("table-html");

const tableOf = (markup) => {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  return holder.querySelector("table");
};

const structure = (table) => tableAsHtml(table).replace(/ style="([^"]*)"/g, (_, style) => {
  const align = /text-align:(\w+)/.exec(style)?.[1];
  return align ? ` align="${align}"` : "";
});

test("a chat table keeps its markdown alignment, escapes its text and starts headers on the left", () => {
  const holder = document.createElement("div");
  holder.innerHTML = renderMarkdown("| Name | Amount | Mid |\n|---|--:|:-:|\n| A & B <\"Ltd\"> | 1,200 | x |");
  assert.equal(structure(holder.querySelector("table")), [
    '<table dir="ltr">',
    "  <thead>",
    '    <tr><th align="left">Name</th><th align="right">Amount</th><th align="center">Mid</th></tr>',
    "  </thead>",
    "  <tbody>",
    '    <tr><td>A &amp; B &lt;&quot;Ltd&quot;&gt;</td><td align="right">1,200</td><td align="center">x</td></tr>',
    "  </tbody>",
    "</table>"
  ].join("\n"));
});

test("the copy is inline styled and theme independent, with a light header band and dark header text", () => {
  const markup = tableAsHtml(tableOf("<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>c</td></tr></tbody></table>"));
  assert.match(markup, /^<table dir="ltr" style="border-collapse:collapse">/);
  assert.match(markup, /<th style="border:1px solid #d0d7de;padding:6px 12px;vertical-align:top;background-color:#f6f8fa;color:#1f2328;font-weight:600;text-align:left">h<\/th>/);
  assert.match(markup, /<td style="border:1px solid #d0d7de;padding:6px 12px;vertical-align:top">c<\/td>/);
  assert.doesNotMatch(markup, /var\(--|class=/);
});

test("alignment also comes from an inline style or the align attribute, and logical sides become physical", () => {
  const table = tableOf('<table><tbody><tr><td style="text-align:right">a</td><td align="center">b</td><td align="justify">c</td><td style="text-align:end">d</td></tr></tbody></table>');
  assert.equal(structure(table).split("\n")[2], '    <tr><td align="right">a</td><td align="center">b</td><td align="justify">c</td><td align="right">d</td></tr>');
});

test("every header row, body header cells, footers and merged cells survive, with spans read the way HTML reads them", () => {
  const table = tableOf([
    "<table>",
    '<thead><tr><th rowspan="2">Region</th><th colspan="2">Sales</th></tr><tr><th>Q1</th><th colspan="1">Q2</th></tr></thead>',
    '<tbody><tr><th>EU</th><td rowspan="0">1</td><td rowspan="-1">2</td></tr><tr></tr></tbody>',
    '<tfoot><tr><td>Total</td><td colspan="2garbage">3</td></tr></tfoot>',
    "</table>"
  ].join(""));
  assert.equal(structure(table), [
    '<table dir="ltr">',
    "  <thead>",
    '    <tr><th align="left" rowspan="2">Region</th><th align="left" colspan="2">Sales</th></tr>',
    '    <tr><th align="left">Q1</th><th align="left">Q2</th></tr>',
    "  </thead>",
    "  <tbody>",
    '    <tr><th align="left">EU</th><td rowspan="0">1</td><td>2</td></tr>',
    "    <tr></tr>",
    "  </tbody>",
    "  <tfoot>",
    '    <tr><td>Total</td><td colspan="2">3</td></tr>',
    "  </tfoot>",
    "</table>"
  ].join("\n"));
});

test("line breaks stay breaks, paragraphs split into lines and spaces collapse", () => {
  const table = tableOf("<table><tbody><tr><td>first<br><b>second</b></td><td><p>one</p><p>two</p></td><td>  Bob\n  Smith </td><td>a<br><br>b</td><td><br> lead <br></td><td><p>a <br></p><p>b</p></td><td>1 000   EUR</td></tr></tbody></table>");
  assert.equal(structure(table).split("\n")[2], "    <tr><td>first<br>second</td><td>one<br>two</td><td>Bob Smith</td><td>a<br><br>b</td><td><br>lead<br></td><td>a<br>b</td><td>1&nbsp;000 EUR</td></tr>");
});

test("a formula is copied as its TeX, buttons and hidden icons are left out", () => {
  const holder = document.createElement("div");
  holder.innerHTML = renderMarkdown("| area |\n|---|\n| circle $\\pi r^2$ |");
  const formula = holder.querySelector(".md-math");
  formula.innerHTML = '<span class="katex"><span aria-hidden="true">πr²</span></span>';
  holder.querySelector("td").append(Object.assign(document.createElement("button"), { textContent: "copy" }));
  assert.equal(structure(holder.querySelector("table")).split("\n")[5], "    <tr><td>circle $\\pi r^2$</td></tr>");
});

test("a right-to-left table keeps its direction and puts headers on its start side", () => {
  const table = tableOf('<table dir="rtl"><thead><tr><th>Name</th><th style="text-align:end">End</th></tr></thead></table>');
  assert.equal(structure(table), ['<table dir="rtl">', "  <thead>", '    <tr><th align="right">Name</th><th align="left">End</th></tr>', "  </thead>", "</table>"].join("\n"));
});

test("rows outside any section go in a body, and a table without cells copies nothing", () => {
  const loose = document.createElement("table");
  loose.innerHTML = "<tr><td>only</td><td>cells</td></tr>";
  for (const section of loose.querySelectorAll("tbody")) section.replaceWith(...section.children);
  assert.equal(structure(loose), '<table dir="ltr">\n  <tbody>\n    <tr><td>only</td><td>cells</td></tr>\n  </tbody>\n</table>');
  assert.equal(tableAsHtml(tableOf("<table><tbody><tr></tr></tbody></table>")), "");
});
