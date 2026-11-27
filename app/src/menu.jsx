import { For, Show, createEffect, createRenderEffect, on } from "solid-js";
import { mountView } from "./view.jsx";

function RaycastMenu(props) {
  return (
    <>
      <Show when={props.model.head}>
        <div class="mhead">
          <Show when={props.model.back}>
            <button type="button" class="mback" aria-label={props.model.backSay} onClick={() => props.actions.back?.()}>
              <svg aria-hidden="true"><use href="#i-chev" /></svg>
            </button>
          </Show>
          <div class="cap">{props.model.cap}</div>
          <Show when={props.model.at}><span class="cap-at">{props.model.at}</span></Show>
        </div>
      </Show>
      <For each={props.model.rows}>{(row) => (
        <Show when={!row.sep} fallback={<div class="sep"></div>}>
          <button
            class="mi"
            classList={{ danger: row.danger, sel: row.sel }}
            role="menuitem"
            data-i={row.at}
            title={row.tip || undefined}
            attr:disabled={row.off ? "" : undefined}
            onMouseMove={() => props.actions.hover?.(row.at)}
            onClick={(ev) => props.actions.pick(row.at, ev.currentTarget.getBoundingClientRect())}
          >
            <Show when={row.icon} fallback={<span class="mi-ic" />}>
              <svg class="mi-ic" aria-hidden="true"><use href={`#${row.icon}`} /></svg>
            </Show>
            <span class="lbl">{row.label}</span>
            <Show when={row.note}><b>{row.note}</b></Show>
            <Show when={row.keys.length}>
              <span class="mi-keys"><For each={row.keys}>{(one) => <span class="rc-key">{one}</span>}</For></span>
            </Show>
            <Show when={row.sub}><svg class="mi-sub" aria-hidden="true"><use href="#i-chev" /></svg></Show>
          </button>
        </Show>
      )}</For>
      <Show when={props.model.find}>
        <label class="mfind" classList={{ typed: !!props.model.q }}>
          <svg aria-hidden="true"><use href="#i-mag" /></svg>
          <input
            class="mi-q"
            spellcheck="false"
            autocomplete="off"
            aria-label={props.model.findSay}
            placeholder={props.model.findSay}
            value={props.model.q}
            onInput={(ev) => props.actions.find?.(ev.currentTarget.value)}
            onKeyDown={(ev) => props.actions.key?.(ev)}
          />
        </label>
      </Show>
    </>
  );
}

function driveHost(props) {
  const host = props.host;
  createRenderEffect(() => host.classList.toggle("on", !!props.model.open));
  createRenderEffect(on(() => [props.model.label, props.model.painted], ([label]) => { if (label) host.setAttribute("aria-label", label); }));
  createEffect(on(() => props.model.placed, (placed) => {
    if (!placed) return;
    const box = host.getBoundingClientRect();
    host.style.left = `${Math.max(6, Math.min(props.model.x, innerWidth - box.width - 6))}px`;
    host.style.top = `${Math.max(6, Math.min(props.model.y, innerHeight - box.height - 6))}px`;
  }));
}

function Menu(props) {
  if (props.host) driveHost(props);
  return (
    <Show when={props.model.on}>
      <Show when={!props.model.raycast} fallback={<RaycastMenu model={props.model} actions={props.actions} />}>
        <Show when={props.model.back}>
          <button type="button" class="ghost mback" aria-label={props.model.backSay} title={props.model.backSay} onClick={() => props.actions.back?.()}>
            <svg class="mi-back" aria-hidden="true"><use href="#i-chev" /></svg>{props.model.cap}
          </button>
          <div class="sep"></div>
        </Show>
        <For each={props.model.rows}>{(row) => (
          <Show when={!row.sep} fallback={<div class="sep"></div>}>
            <button
              class="ghost"
              classList={{ danger: row.danger, sub: row.sub }}
              data-i={row.at}
              title={row.note || undefined}
              aria-haspopup={row.sub ? "menu" : undefined}
              aria-checked={row.on ? "true" : undefined}
              attr:disabled={row.off ? "" : undefined}
              onClick={(ev) => props.actions.pick(row.at, ev.currentTarget.getBoundingClientRect())}
            >
              {row.label}
              <Show when={row.sub}><svg class="mi-sub" aria-hidden="true"><use href="#i-chev" /></svg></Show>
              <Show when={row.on}><svg class="mi-on" aria-hidden="true"><use href="#i-check" /></svg></Show>
            </button>
          </Show>
        )}</For>
      </Show>
    </Show>
  );
}

export function mountMenu(host, actions, { ownHost = false } = {}) {
  return mountView(host, Menu, { on: false, cap: "", rows: [] }, ownHost ? { actions, host } : { actions });
}
