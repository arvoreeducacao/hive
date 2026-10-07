import { test } from "node:test";
import assert from "node:assert/strict";
import { app } from "./dom.mjs";

const { phrase } = await app("core");
const { shotSrc, shotsHtml } = await app("thread");

const pr = { key: "o/r#7", updatedAt: "2026-08-22T05:00:00Z" };
const file = (over) => ({ path: "docs/tela.png", picture: true, binary: true, mode: "changed", ...over });

function drawn(p, f) {
  const wrap = document.createElement("div");
  wrap.innerHTML = shotsHtml(p, f);
  return [...wrap.querySelectorAll("figure.shot")].map((fig) => ({
    fig,
    was: fig.classList.contains("was"),
    heading: fig.querySelector("b").textContent,
    img: fig.querySelector("img"),
    side: new URLSearchParams(fig.querySelector("img").getAttribute("src").split("?")[1]).get("side")
  }));
}

const sides = (p, f) => drawn(p, f).map((one) => one.side);

test("a changed image is shown as it was and as it is now, side by side", () => {
  const shots = drawn(pr, file());
  assert.deepEqual(shots.map((one) => one.side), ["before", "after"]);
  assert.deepEqual(shots.map((one) => one.heading), [phrase("was"), phrase("now")]);
  assert.deepEqual(shots.map((one) => one.was), [true, false]);
});

test("an image the PR adds only has a now, one it deletes only has a was", () => {
  assert.deepEqual(sides(pr, file({ mode: "new" })), ["after"]);
  assert.deepEqual(sides(pr, file({ mode: "deleted" })), ["before"]);
  assert.deepEqual(sides(pr, file({ mode: "renamed" })), ["after"]);
});

test("a file that is not an image draws nothing", () => {
  assert.equal(shotsHtml(pr, file({ path: "app/server.mjs", picture: false })), "");
});

test("the picture is asked for by pull request, path and side, and moves when the PR moves", () => {
  const src = shotSrc(pr, file(), "after");
  const asked = new URLSearchParams(src.split("?")[1]);
  assert.equal(asked.get("key"), "o/r#7");
  assert.equal(asked.get("path"), "docs/tela.png");
  assert.equal(asked.get("side"), "after");
  assert.equal(asked.get("at"), pr.updatedAt, "without the moment the PR last moved, a new push shows yesterday's picture");
});

test("the picture the panel asks for is the one the figure carries", () => {
  const [before, after] = drawn(pr, file());
  assert.equal(before.img.getAttribute("src"), shotSrc(pr, file(), "before"));
  assert.equal(after.img.getAttribute("src"), shotSrc(pr, file(), "after"));
  assert.equal(after.img.getAttribute("loading"), "lazy", "eager images make a diff of screenshots pull the whole PR at once");
});

test("the path of the image goes into the page escaped", () => {
  const nasty = 'docs/a"><script>.png';
  const wrap = document.createElement("div");
  wrap.innerHTML = shotsHtml(pr, file({ path: nasty }));
  assert.equal(wrap.querySelector("script"), null);
  assert.equal(wrap.querySelectorAll("figure.shot").length, 2);
  for (const img of wrap.querySelectorAll("img")) assert.equal(img.getAttribute("alt"), nasty);
});
