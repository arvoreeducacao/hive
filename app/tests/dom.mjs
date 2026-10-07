import { registerHooks } from "node:module";
import { after } from "node:test";
import * as hooks from "./hooks.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Window } from "happy-dom";

registerHooks(hooks);

const APP = fileURLToPath(new URL("..", import.meta.url));
const window = new Window({ url: "http://localhost/", settings: { disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true, disableCSSFileLoading: true } });
const markup = readFileSync(join(APP, "app.html"), "utf8").replace(/<script[^>]*src="\/assets\/dist\/hive\.mjs"[^>]*><\/script>/, "");
window.document.write(markup);
if (!window.document.fonts) Object.defineProperty(window.document, "fonts", { value: { load: async () => [], check: () => true, ready: Promise.resolve() }, configurable: true });

const SHARED = ["document", "navigator", "location", "localStorage", "sessionStorage", "HTMLElement", "Element", "Node", "Event", "CustomEvent", "KeyboardEvent", "PointerEvent", "MouseEvent", "MutationObserver", "ResizeObserver", "IntersectionObserver", "DOMParser", "Image", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "CSS", "Range", "Selection", "NodeFilter", "FileReader", "Blob", "File", "FormData", "AbortController", "Audio", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "SVGElement", "Text", "DocumentFragment", "history", "screen", "innerWidth", "innerHeight", "devicePixelRatio"];
globalThis.window = window;
const FORCED = new Set(["document", "navigator", "location", "localStorage", "sessionStorage", "history", "Event", "CustomEvent", "KeyboardEvent", "MouseEvent", "PointerEvent", "InputEvent", "FocusEvent", "DragEvent", "WheelEvent"]);
const seen = new Set();
for (let proto = window; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
  for (const name of Object.getOwnPropertyNames(proto)) {
    if (seen.has(name) || name === "window" || name === "globalThis" || name === "self" || name === "constructor") continue;
    seen.add(name);
    if (name in globalThis && !FORCED.has(name)) continue;
    let value;
    try { value = window[name]; } catch { continue; }
    if (typeof value === "function" && !/^[A-Z]/.test(name)) value = value.bind(window);
    try { Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); } catch {}
  }
}
for (const name of SHARED) if (!(name in globalThis)) try { Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true }); } catch {}
if (!globalThis.requestAnimationFrame) globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16);
if (!globalThis.cancelAnimationFrame) globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
if (!globalThis.matchMedia) globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
if (!globalThis.WebSocket) globalThis.WebSocket = class { constructor() { this.readyState = 3; } send() {} close() {} };
if (!globalThis.Option) globalThis.Option = function (text = "", value = "") { const option = window.document.createElement("option"); option.text = text; option.value = value; return option; };
globalThis.__hiveTestWindow = window;
after(() => window.happyDOM.abort());

export const dom = window;
export const app = (module) => import(new URL(`../src/app/${module}.js`, import.meta.url).href);
export const state = () => import(new URL("../src/state.js", import.meta.url).href).then((m) => m.st);
let mounted = null;
export const views = () => mounted ||= app("shared").then((shared) => { shared.bootSolid(); return shared; });
