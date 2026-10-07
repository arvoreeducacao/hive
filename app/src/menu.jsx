import { For, Show } from "solid-js";
import { mountView } from "./view.jsx";

function RaycastMenu(props) {
  return (
    <>
      <div class="mhead">
        <Show when={props.model.back}>
          <button type="button" class="mback" aria-label={props.model.backSay} onClick={() => props.actions.back?.()}>
            <svg aria-hidden="true"><use href="#i-chev" /></svg>
          </button>
        </Show>
        <div class="cap">{props.model.cap}</div>
        <Show when={props.model.at}><span class="cap-at">{props.model.at}</span></Show>
      </div>
      <For each={props.model.rows}>{(row) => (
        <Show when={!row.sep} fallback={<div class="sep"></div>}>
          <button
            class="mi"
            classList={{ danger: row.danger, sel: row.sel }}
            role="menuitem"
            data-i={row.at}
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
        <label class="mfind">
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

function Menu(props) {
  return (
    <Show when={props.model.on}>
      <Show when={!props.model.raycast} fallback={<RaycastMenu model={props.model} actions={props.actions} />}>
        <div class="cap">{props.model.cap}</div>
        <For each={props.model.rows}>{(row) => (
          <Show when={!row.sep} fallback={<div class="sep"></div>}>
            <button
              class="ghost"
              classList={{ danger: row.danger }}
              data-i={row.at}
              attr:disabled={row.off ? "" : undefined}
              onClick={(ev) => props.actions.pick(row.at, ev.currentTarget.getBoundingClientRect())}
            >
              {row.label}
              <Show when={row.note}><b>{row.note}</b></Show>
            </button>
          </Show>
        )}</For>
      </Show>
    </Show>
  );
}

export function mountMenu(host, actions) {
  return mountView(host, Menu, { on: false, cap: "", rows: [] }, { actions });
}
