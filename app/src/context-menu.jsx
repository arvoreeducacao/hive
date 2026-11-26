import { For, Show, createRoot, createSignal } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

const EDGE = 6;

function spotFor(box, x, y) {
  const wide = document.documentElement.clientWidth || innerWidth;
  const tall = document.documentElement.clientHeight || innerHeight;
  const left = Math.max(EDGE, Math.min(x, wide - box.width - EDGE));
  const top = y + box.height + EDGE > tall ? Math.max(EDGE, y - box.height) : y;
  return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` };
}

function ContextMenu(props) {
  const m = props.model;
  let box;
  const keys = (ev) => {
    const items = [...box.querySelectorAll("button:not(:disabled)")];
    const at = items.indexOf(document.activeElement);
    const go = (n) => items[(n + items.length) % items.length]?.focus({ preventScroll: true });
    if (ev.key === "Tab") {
      ev.stopPropagation();
      return props.actions.close(true);
    }
    if (ev.key === "Enter" || ev.key === " ") return void ev.stopPropagation();
    if (ev.key === "ArrowDown") go(at + 1);
    else if (ev.key === "ArrowUp") go(at < 0 ? items.length - 1 : at - 1);
    else if (ev.key === "Home") go(0);
    else if (ev.key === "End") go(items.length - 1);
    else if (ev.key === "Escape") props.actions.close(true);
    else return;
    ev.preventDefault();
    ev.stopPropagation();
  };
  const pick = (ev, at) => {
    ev.preventDefault();
    ev.stopPropagation();
    props.actions.pick(at);
  };
  return (
    <div ref={box} class="md-menu md-ctx" role="menu" aria-label={m.label || undefined} data-tone={m.tone || undefined} style={props.spot()} on:keydown={keys} on:contextmenu={(ev) => ev.preventDefault()}>
      <For each={m.items}>
        {(item, at) => (
          <Show when={!item.separator} fallback={<div class="md-ctx-sep" role="separator"></div>}>
            <button type="button" tabIndex={-1} role="menuitem" disabled={item.disabled} aria-disabled={item.disabled ? "true" : undefined} on:click={(ev) => pick(ev, at())}>
              {item.label}
              <Show when={item.hint}><span class="md-ctx-hint">{item.hint}</span></Show>
            </button>
          </Show>
        )}
      </For>
      <Show when={m.note}><p class="md-ctx-note" role="alert">{m.note}</p></Show>
    </div>
  );
}

export function contextMenuView(initial, actions) {
  const [model, setModel] = createStore(initial);
  const [spot, setSpot] = createSignal();
  let dispose;
  const el = createRoot((done) => {
    dispose = done;
    return <ContextMenu model={model} spot={spot} actions={actions} />;
  });
  document.body.append(el);
  setSpot(spotFor(el.getBoundingClientRect(), initial.x, initial.y));
  return {
    el,
    show(next) { setModel(reconcile(next, { key: "key" })); },
    focusFirst() { el.querySelector("button:not(:disabled)")?.focus({ preventScroll: true }); },
    close() {
      dispose();
      el.remove();
    }
  };
}
