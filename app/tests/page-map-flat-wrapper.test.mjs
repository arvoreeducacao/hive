import test from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";

const pageOf = (html) => {
  const window = new Window({ url: "https://app.slack.test/", settings: { disableJavaScriptEvaluation: true, disableCSSFileLoading: true } });
  window.document.body.innerHTML = html;
  const realBox = window.Element.prototype.getBoundingClientRect;
  window.Element.prototype.getBoundingClientRect = function () {
    if (this.hasAttribute("data-flat")) return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
    return { left: 10, top: 10, width: 120, height: 30, right: 130, bottom: 40 };
  };
  void realBox;
  return window;
};

const read = async (window) => {
  const saved = {};
  for (const name of ["document", "window", "getComputedStyle", "location"]) {
    saved[name] = globalThis[name];
    Object.defineProperty(globalThis, name, { value: name === "window" ? window : name === "getComputedStyle" ? window.getComputedStyle.bind(window) : window[name], configurable: true, writable: true });
  }
  try {
    const { readPage, sayPage } = await import(`../assets/page-map.mjs?${Math.random()}`);
    return sayPage(readPage());
  } finally {
    for (const [name, value] of Object.entries(saved)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
};

test("a wrapper with no box of its own (display: contents) still lets its buttons be read", async () => {
  const said = await read(pageOf(`<main><div data-flat><section><button>Adicionar um escopo de OAuth</button></section></div></main>`));
  assert.match(said, /button "Adicionar um escopo de OAuth" \[ref=e\d+\]/);
});

test("what is really hidden stays out of the map", async () => {
  const said = await read(pageOf(`<main><div aria-hidden="true"><button>Escondido</button></div><div style="display:none"><button>Sumido</button></div><button>Visível</button></main>`));
  assert.doesNotMatch(said, /Escondido|Sumido/);
  assert.match(said, /button "Visível"/);
});
