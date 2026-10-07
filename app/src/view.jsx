import { render } from "solid-js/web";
import { createStore, reconcile } from "solid-js/store";

export function mountView(host, Component, initial, extras = {}, { lazy = false } = {}) {
  const [model, setModel] = createStore(initial);
  host.textContent = "";
  host.dataset.view = "solid";
  let dispose = null;
  const draw = () => { dispose = render(() => <Component model={model} {...extras} />, host); };
  if (!lazy) draw();
  return {
    show(next) {
      setModel(reconcile(next, { key: "key" }));
      if (!dispose) draw();
    },
    dispose() {
      dispose?.();
      dispose = null;
      delete host.dataset.view;
    }
  };
}
