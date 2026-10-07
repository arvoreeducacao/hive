import { For, Show } from "solid-js";
import { mountView } from "./view.jsx";

function PlaneBar(props) {
  return (
    <Show when={props.model.on}>
      <Show when={props.model.area} fallback={
        <For each={props.model.tints}>{(tint) => (
          <button
            class={`tint ${tint.cls}`}
            classList={{ on: tint.on }}
            data-tint={tint.value}
            aria-label={props.model.tintLabel}
            onClick={(ev) => props.actions.tint(ev, tint.value)}
          ></button>
        )}</For>
      }>
        <Show when={props.model.raycast} fallback={<button data-do="write" onClick={(ev) => props.actions.write(ev)}>{props.model.rename}</button>}>
          <button data-do="write" onClick={(ev) => props.actions.write(ev)}><svg aria-hidden="true"><use href="#i-pen" /></svg>{props.model.rename}<span class="rc-key">↵</span></button>
        </Show>
      </Show>
      <span class="sep"></span>
      <button data-do="copy" onClick={(ev) => props.actions.copy(ev)}>{props.model.duplicate}</button>
      <span class="sep"></span>
      <Show when={props.model.raycast} fallback={<button class="danger" data-do="drop" onClick={(ev) => props.actions.drop(ev)}>{props.model.remove}</button>}>
        <button class="danger" data-do="drop" onClick={(ev) => props.actions.drop(ev)}><svg aria-hidden="true"><use href="#i-close" /></svg>{props.model.remove}<span class="rc-key">{props.model.removeKey}</span></button>
      </Show>
    </Show>
  );
}

function PlaneMap(props) {
  return (
    <>
      <For each={props.model.dots}>{(dot) => <i class={dot.cls} style={dot.at}></i>}</For>
      <div class="vp" style={props.model.seen}></div>
    </>
  );
}

function PlaneCard(props) {
  return (
    <>
      <div class="pc-top">
        <Show when={props.model.raycast} fallback={<svg aria-hidden="true"><use href={`#${props.model.glyph}`} /></svg>}>
          <span class={`rc-dot ${props.model.glyph.replace(/^g-/, "")}`} aria-hidden="true" />
        </Show>
        <span class="pc-name">{props.model.name}</span>
        <span class="pc-when">{props.model.when}</span>
      </div>
      <div class="pc-of">{props.model.of}</div>
      <div class="pc-state">{props.model.said}</div>
      <p class="pc-sum">{props.model.sum}</p>
      <div class="pc-chips"><For each={props.model.chips}>{(chip) => <span>{chip.text}</span>}</For></div>
    </>
  );
}

export function mountPlaneBar(host, actions) {
  return mountView(host, PlaneBar, { on: false, area: false, tints: [], tintLabel: "", rename: "", duplicate: "", remove: "" }, { actions });
}

export function mountPlaneMap(host) {
  return mountView(host, PlaneMap, { dots: [], seen: {} });
}

export function mountPlaneCard(host) {
  return mountView(host, PlaneCard, { glyph: "g-idle", name: "", when: "", of: "", said: "", sum: "", chips: [] }, {});
}
