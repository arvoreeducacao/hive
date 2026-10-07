import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";

function Icon(props) {
  return <svg aria-hidden="true"><use href={`#${props.name}`} /></svg>;
}

function PalDetail(props) {
  return (
    <div class="pal-det">
      <div class="dh">
        <span class="pal-ic"><Icon name={props.model.icon} /></span>
        <span class="dh-say">
          <b><Show when={props.model.state}><i class={`rc-dot ${props.model.state}`} /></Show><span>{props.model.name}</span></b>
          <Show when={props.model.where}><span class="mono">{props.model.where}</span></Show>
        </span>
      </div>
      <Show when={props.model.say}><p class="dsay">{props.model.say}</p></Show>
      <Show when={props.model.keys?.length}>
        <div class="dkeys"><For each={props.model.keys}>{(one) => <span class="rc-key">{one}</span>}</For></div>
      </Show>
      <Show when={props.model.facts?.length}>
        <div class="mlist">
          <For each={props.model.facts}>{(fact) => (
            <>
              <span class="k">{fact.k}</span>
              <span title={fact.full || undefined}>
                <Show when={fact.state}><i class={`rc-dot ${fact.state}`} /></Show>
                <Show when={fact.icon}><Icon name={fact.icon} /></Show>
                <Show when={fact.badge}><span class="rc-badge">{fact.badge}</span></Show>
                <Show when={fact.text}><span class="txt">{fact.text}</span></Show>
                <Show when={fact.mono}><span class="mono">{fact.mono}</span></Show>
                <Show when={fact.copy}>
                  <button type="button" class="pal-copy" data-copy={fact.copy} aria-label={fact.copySay}><Icon name="i-copy" /><Icon name="i-check" /></button>
                </Show>
              </span>
            </>
          )}</For>
        </div>
      </Show>
    </div>
  );
}

function PalPreview(props) {
  return (
    <Show when={props.model.mode !== "seat" && props.model.mode !== "row"} fallback={<PalDetail model={props.model} />}>
      <Show when={props.model.mode !== "off"}>
        <Show when={props.model.mode === "note"} fallback={
          <div class="pv">
            <For each={props.model.lines}>{(line) => (
              <div class="pv-line" classList={{ on: line.on }}>
                <span class="pv-n">{line.n}</span>
                <span class="pv-c" innerHTML={line.html} />
              </div>
            )}</For>
          </div>
        }>
          <div class="pv-none">{props.model.note}</div>
        </Show>
      </Show>
    </Show>
  );
}

export function mountPalPreview(host) {
  return mountView(host, PalPreview, { mode: "off", note: "", lines: [] });
}
