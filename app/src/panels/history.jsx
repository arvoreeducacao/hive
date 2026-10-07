import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";

function Marked(props) {
  return <For each={props.parts}>{(part) => (part.lit ? <mark>{part.text}</mark> : part.text)}</For>;
}

function Row(props) {
  return (
    <div class="hist-row">
      <span class={`hist-where ${props.row.where}`}>{props.row.whereSay}</span>
      <span class="hist-title" title={props.row.prompt}>
        <b><Marked parts={props.row.title} /><Show when={props.row.agentSay}><i class="hist-agent">{props.row.agentSay}</i></Show></b>
        <small><Marked parts={props.row.sub} /></small>
        <Show when={props.row.hit}><small class="hist-hit"><Marked parts={props.row.hit} /></small></Show>
      </span>
      <span class="hist-when">
        <Show when={props.row.sync}>
          <span class={`hist-synced ${props.row.sync.tone}`} title={props.row.sync.hint}>
            <svg aria-hidden="true"><use href={`#${props.row.sync.glyph}`} /></svg>
          </span>
        </Show>
        {props.row.when}
      </span>
      <span class="hist-actions">
        <button class="hist-revive hist-peek" data-peek={props.row.at} title={props.row.peekHint}>{props.row.peekSay}</button>
        <Show when={props.row.down}>
          <button class="hist-revive down" data-down={props.row.at} title={props.row.downHint}>{props.row.downSay}</button>
        </Show>
        <button class="hist-revive" data-i={props.row.at}>{props.row.reviveSay}</button>
      </span>
    </div>
  );
}

function History(props) {
  return (
    <Show when={!props.model.hint} fallback={<p class="hint" style="padding:14px">{props.model.hint}</p>}>
      <For each={props.model.rows}>{(row) => <Row row={row} />}</For>
    </Show>
  );
}

function SyncStrip(props) {
  return (
    <Show when={props.model.mode !== "off"}>
      <Show when={props.model.mode === "set"} fallback={
        <>
          <span class="hint">{props.model.hint}</span>
          <input id="sync-repo" spellcheck="false" autocomplete="off" placeholder={props.model.placeholder} attr:value={props.model.typed} />
          <button class="btn" id="sync-go">{props.model.goSay}</button>
          <Show when={props.model.cancelSay}><button class="ghost" id="sync-cancel">{props.model.cancelSay}</button></Show>
        </>
      }>
        <span class="hint">{props.model.lead} <b>{props.model.repo}</b> · {props.model.local} · {props.model.pod}</span>
        <Show when={props.model.trouble}><span class="hint bad">{props.model.trouble}</span></Show>
        <button class="ghost" id="sync-now" title={props.model.nowHint}>{props.model.nowSay}</button>
        <button class="ghost" id="sync-change">{props.model.changeSay}</button>
      </Show>
    </Show>
  );
}

export function mountHistory(host) {
  return mountView(host, History, { hint: "", rows: [] });
}

export function mountSyncStrip(host) {
  return mountView(host, SyncStrip, { mode: "off" });
}
