import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";

function KeyCell(props) {
  return (
    <b
      data-action={props.row.action}
      data-slot="direct"
      classList={{ muted: props.row.muted, unset: props.row.unset, capturing: props.row.capturing === "direct" }}
      title={props.row.title}
    >{props.row.label}</b>
  );
}

function ChordCell(props) {
  return (
    <i
      data-action={props.row.action}
      data-slot="chord"
      classList={{ unset: props.chord.unset, capturing: props.row.capturing === "chord" }}
      title={props.chord.title}
    >{props.chord.label}</i>
  );
}

function KeysGrid(props) {
  return (
    <>
      <div class="keys-bar">
        <span class="say">{props.model.summary}</span>
        <button class="ghost" type="button" data-w="keys-toggle" aria-expanded={String(props.model.open)}>{props.model.toggle}</button>
      </div>
      <Show when={props.model.open}>
        <p class="hint" innerHTML={props.model.edit}></p>
        <input class="keys-find" data-w="keys-find" type="search" spellcheck="false" autocomplete="off" placeholder={props.model.find} aria-label={props.model.find} value={props.model.filter} />
        <div class="keys-list" classList={{ "no-chord": !props.model.head.chord }}>
          <div class="keys-head">
            <span>{props.model.head.action}</span>
            <span>{props.model.head.direct}</span>
            <Show when={props.model.head.chord}><span>{props.model.head.chord}</span></Show>
          </div>
          <For each={props.model.groups}>{(group) => (
            <div class="keys-group" classList={{ fixed: !!group.fixed }}>
              <h3>{group.title}</h3>
              <For each={group.rows}>{(row) => (
                <div class="keys-row">
                  <span class="desc">{row.desc}</span>
                  <Show when={!row.fixed} fallback={<b class="combo">{row.combo}</b>}>
                    <KeyCell row={row} />
                    <Show when={row.chord}>{(chord) => <ChordCell row={row} chord={chord()} />}</Show>
                  </Show>
                </div>
              )}</For>
            </div>
          )}</For>
          <Show when={props.model.empty}><div class="keys-empty">{props.model.empty}</div></Show>
        </div>
        <div class="keys-foot"><button class="ghost" type="button" data-w="keys-toggle" aria-expanded="true">{props.model.toggle}</button></div>
      </Show>
    </>
  );
}

function KeysLeader(props) {
  return (
    <Show when={props.model.on} fallback={
      <div>
        <span class="say">{props.model.off}</span>
        <button class="ghost" id="t-leader">{props.model.turn}</button>
      </div>
    }>
      <div>
        <span>{props.model.press}{" "}<b data-slot="leader" title={props.model.change}>{props.model.label}</b>{" "}{props.model.tail}</span>
        <button class="ghost" id="t-leader">{props.model.turn}</button>
      </div>
      <div>
        <span class="say">{props.model.direct}</span>
        <button class="ghost" id="t-direct">{props.model.flip}</button>
      </div>
    </Show>
  );
}

export function mountKeysGrid(host) {
  return mountView(host, KeysGrid, { open: false, summary: "", toggle: "", edit: "", find: "", filter: "", head: { action: "", direct: "", chord: null }, groups: [], empty: "" });
}

export function mountKeysLeader(host) {
  return mountView(host, KeysLeader, { on: false, press: "", label: "", change: "", tail: "", turn: "", direct: "", flip: "", off: "" });
}
