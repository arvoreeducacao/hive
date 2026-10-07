import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";

function Marked(props) {
  return <For each={props.parts}>{(part) => (part.lit ? <mark>{part.text}</mark> : part.text)}</For>;
}

function Row(props) {
  return (
    <div class="hist-row">
      <span class={`hist-where ${props.row.where}`}>{props.row.whereSay}</span>
      <span class="hist-title" title={props.row.hint}>
        <b><Marked parts={props.row.title} /><Show when={props.row.agentSay}><i class="hist-agent">{props.row.agentSay}</i></Show></b>
        <small><Marked parts={props.row.sub} /></small>
      </span>
      <span class="hist-when">{props.row.when}</span>
      <span class="hist-actions">
        <button class="hist-revive" data-arch={props.row.name} data-where={props.row.where} disabled={props.row.busy}>{props.row.reviveSay}</button>
      </span>
    </div>
  );
}

function Archived(props) {
  return (
    <Show when={!props.model.hint} fallback={<p class="hint" style="padding:14px">{props.model.hint}</p>}>
      <For each={props.model.rows}>{(row) => <Row row={row} />}</For>
    </Show>
  );
}

export function mountArchived(host) {
  return mountView(host, Archived, { hint: "", rows: [] });
}
