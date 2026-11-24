import { For, Index, Show } from "solid-js";
import { mountView } from "../view.jsx";

function Marked(props) {
  return <Index each={props.parts}>{(part) => <Show when={part().lit} fallback={part().text}><mark>{part().text}</mark></Show>}</Index>;
}

function Row(props) {
  return (
    <div class="hist-row" classList={{ picked: props.row.picked }}>
      <input type="checkbox" class="hist-pick" data-pick={props.row.key} checked={props.row.picked} aria-label={props.row.pickSay} />
      <span class={`hist-where ${props.row.where}`}>{props.row.whereSay}</span>
      <span class="hist-title" title={props.row.hint}>
        <b><Marked parts={props.row.title} /><Show when={props.row.agentSay}><i class="hist-agent">{props.row.agentSay}</i></Show></b>
        <small><Marked parts={props.row.sub} /></small>
      </span>
      <span class="hist-when">{props.row.when}</span>
      <span class="hist-actions">
        <button class="hist-revive" data-arch={props.row.name} data-where={props.row.where} disabled={props.row.busy}>{props.row.reviveSay}</button>
        <button class="hist-erase" data-erase={props.row.name} data-where={props.row.where} disabled={props.row.busy} title={props.row.eraseHint} aria-label={props.row.eraseHint}>{props.row.eraseSay}</button>
      </span>
    </div>
  );
}

function Group(props) {
  return (
    <section class="arch-group">
      <h3><span>{props.group.label}</span><b>{props.group.rows.length}</b></h3>
      <For each={props.group.rows}>{(row) => <Row row={row} />}</For>
    </section>
  );
}

function Archived(props) {
  return (
    <Show when={!props.model.hint} fallback={<p class="hint" style="padding:14px">{props.model.hint}</p>}>
      <Show when={props.model.bar}>{(bar) => (
        <div class="arch-bar" role="toolbar" aria-label={bar().say}>
          <span>{bar().say}</span>
          <button type="button" class="hist-erase" data-erase-picked>{bar().eraseSay}</button>
          <button type="button" class="ghost" data-pick-none>{bar().clearSay}</button>
        </div>
      )}</Show>
      <For each={props.model.groups}>{(group) => <Group group={group} />}</For>
    </Show>
  );
}

export function mountArchived(host) {
  return mountView(host, Archived, { hint: "", bar: null, groups: [] });
}
