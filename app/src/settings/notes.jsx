import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";

function Relnotes(props) {
  return (
    <For each={props.model.notes}>{(note) => (
      <li style={{ "animation-delay": note.delay }}>
        <span class={`k ${note.kind}`}>{note.tag}</span>
        <span class="t">{note.text}</span>
      </li>
    )}</For>
  );
}

function WhatsNewGroups(props) {
  return (
    <For each={props.model.groups}>{(group) => (
      <div class="wn-group">
        <div class="wn-gh">{group.label}{" "}<b>{group.count}</b><span class="ln"></span></div>
        <ul class="wn-list">
          <For each={group.items}>{(item) => (
            <li style={{ "animation-delay": item.delay }}>
              <span>{item.text}</span>
              <Show when={item.pr}><i>{item.pr}</i></Show>
            </li>
          )}</For>
        </ul>
      </div>
    )}</For>
  );
}

export function mountRelnotes(host) {
  return mountView(host, Relnotes, { notes: [] });
}

export function mountWhatsNewGroups(host) {
  return mountView(host, WhatsNewGroups, { groups: [] });
}
