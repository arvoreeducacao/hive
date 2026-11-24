function guardPage() {
  const FRAMES = "iframe, frame, object, embed, fencedframe, portal";
  const seal = (owner, name, value) => {
    try { Object.defineProperty(owner, name, { value, writable: false, configurable: false }); } catch {}
  };
  for (const name of Object.getOwnPropertyNames(window)) {
    if (!/^(webkit|moz)?RTC/.test(name)) continue;
    try { delete window[name]; } catch {}
    if (Object.prototype.hasOwnProperty.call(window, name)) seal(window, name, undefined);
  }
  const roots = [];
  const sweep = () => {
    for (const root of roots) for (const frame of root.querySelectorAll(FRAMES)) frame.remove();
    if (window.length > 0) document.replaceChildren();
  };
  const watcher = new MutationObserver(sweep);
  const watch = (root) => {
    roots.push(root);
    watcher.observe(root, { childList: true, subtree: true });
  };
  const attachShadow = Element.prototype.attachShadow;
  seal(Element.prototype, "attachShadow", function attachWatchedShadow(options) {
    const root = attachShadow.call(this, { ...options, clonable: false });
    watch(root);
    return root;
  });
  const switchOff = (start, name) => {
    for (let owner = start; owner; owner = Object.getPrototypeOf(owner)) {
      if (Object.prototype.hasOwnProperty.call(owner, name)) seal(owner, name, undefined);
    }
  };
  for (const [start, name] of [[document, "write"], [document, "writeln"], [document.createElement("div"), "setHTMLUnsafe"], [ShadowRoot.prototype, "setHTMLUnsafe"], [Document, "parseHTMLUnsafe"]]) switchOff(start, name);
  watch(document);
}

export const PAGE_SHIELD = `(${guardPage})();`;

export const disarmShadowRoots = (html) => String(html ?? "").replace(/shadowrootmode/gi, "data-shadowrootmode");
