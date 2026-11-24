import { For } from "solid-js";
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

export function mountRelnotes(host) {
  return mountView(host, Relnotes, { notes: [] });
}
