import { For, Show, createRoot } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { Raw } from "./raw.jsx";

function Toasts(props) {
  const m = props.model;
  return (
    <div id="cp-toasts" class="cp-toasts" role="region" aria-live="polite">
      <For each={m.toasts}>
        {(one) => (
          <div ref={(el) => props.cards.set(one.key, el)} class={`cp-toast ${one.tone}`} role={one.role}>
            <div class="cp-toast-text">
              <b>{one.title}</b>
              <Show when={one.description}><span>{one.description}</span></Show>
            </div>
            <button type="button" class="cp-toast-x" aria-label={m.dismiss} on:click={() => props.actions.close(one.key)}><Raw html={m.icon} /></button>
          </div>
        )}
      </For>
    </div>
  );
}

export function toastStackView(initial, actions) {
  const [model, setModel] = createStore(initial);
  const cards = new Map();
  const el = createRoot(() => <Toasts model={model} cards={cards} actions={actions} />);
  return {
    show(next) {
      setModel(reconcile(next, { key: "key" }));
      for (const key of [...cards.keys()]) if (!next.toasts.some((one) => one.key === key)) cards.delete(key);
      if (next.toasts.length && !el.isConnected) document.body.append(el);
    },
    cardOf: (key) => cards.get(key) || null
  };
}
