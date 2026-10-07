import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";
import { Empty, Foot, Head, Icon, Loading } from "./window.jsx";

function Top(props) {
  return (
    <div class="usage-top">
      <h2>{props.top.title}</h2>
      <span class="when">{props.top.read}</span>
      <div class="wt-acts">
        <button class="btn" data-rt-new="1" onClick={() => props.actions.create()}>{props.top.create}</button>
      </div>
    </div>
  );
}

function Run(props) {
  return (
    <span class={`rt-run ${props.run.cls}`} title={props.run.hint}>
      <Show when={props.run.seat} fallback={props.run.say}>
        {props.run.say}{" "}<a data-goto={props.run.seat} onClick={(ev) => { ev.preventDefault(); props.actions.goto(props.run.seat); }} href="#">{props.run.seat}</a>
      </Show>
    </span>
  );
}

function Row(props) {
  return (
    <div class="rt" classList={{ off: !props.row.on, editing: props.row.editing }} data-routine={props.row.id}>
      <span class="dot"></span>
      <div class="what">
        <div class="top">
          <b>{props.row.name}</b>
          <span class="wt-badge" classList={{ live: props.row.on }}>{props.row.state}</span>
          <Show when={props.row.where}><span class="wt-badge">{props.row.where}</span></Show>
        </div>
        <div class="rt-when">{props.row.schedule}<Show when={props.row.next}>{" · "}<span class="rt-next">{props.row.next}</span></Show></div>
        <Show when={props.row.precheck}><code class="rt-pre" title={props.row.precheckHint}>{props.row.precheck}</code></Show>
        <Show when={props.row.last}><Run run={props.row.last} actions={props.actions} /></Show>
      </div>
      <div class="rt-acts">
        <button class="nbtn" data-rt-run={props.row.id} onClick={() => props.actions.run(props.row.id)}>{props.row.runSay}</button>
        <button class="nbtn" data-rt-toggle={props.row.id} onClick={() => props.actions.toggle(props.row.id, !props.row.on)}>{props.row.toggleSay}</button>
        <button class="nbtn" data-rt-edit={props.row.id} onClick={() => props.actions.edit(props.row.id)}>{props.row.editSay}</button>
        <button class="nbtn danger" data-rt-remove={props.row.id} onClick={() => props.actions.remove(props.row.id)}>{props.row.removeSay}</button>
      </div>
    </div>
  );
}

function Routines(props) {
  return (
    <Show when={!props.model.trouble} fallback={<><div class="usage-top"><h2>{props.model.title}</h2></div><p class="usage-note">{props.model.note}</p></>}>
      <Top top={props.model.top} actions={props.actions} />
      <p class="panel-sub">{props.model.sub}</p>
      <div id="rt-form" data-no-t></div>
      <Show when={props.model.rows.length} fallback={<p class="wt-none">{props.model.none}</p>}>
        <div class="rt-list"><For each={props.model.rows}>{(row) => <Row row={row} actions={props.actions} />}</For></div>
      </Show>
      <p class="usage-note" innerHTML={props.model.foot} />
    </Show>
  );
}

function RtRun(props) {
  return (
    <span class={`rt-run ${props.run.cls}`} title={props.run.hint}>
      <Show when={props.run.seat} fallback={props.run.say}>
        {props.run.say}{" "}<a data-goto={props.run.seat} onClick={(ev) => { ev.preventDefault(); props.actions.goto(props.run.seat); }} href="#">{props.run.seat}</a>
      </Show>
    </span>
  );
}

function RtRow(props) {
  const r = () => props.row;
  return (
    <button type="button" class="pw-row rt" classList={{ off: !r().on }} role="option" aria-selected={r().here ? "true" : "false"}
      data-routine={r().id} title={r().name} onClick={() => props.actions.pick(r().id)}>
      <Icon id="i-clock" />
      <span class="pw-txt"><span class="pw-t">{r().name}</span><span class="pw-m">{r().schedule}</span></span>
      <span class="pw-st"><span class={`rc-dot ${r().on ? "done" : "idle"}`} aria-hidden="true" />{r().state}</span>
    </button>
  );
}

function RtDetail(props) {
  const d = () => props.row;
  return (
    <>
      <h2 class="pw-h1">{d().name}</h2>
      <div class="pw-strip"><span>{d().schedule}</span><Show when={d().next}><span>{d().next}</span></Show><span>{d().state}</span></div>
      <dl class="pw-kv">
        <dt>{props.labels.where}</dt><dd>{d().where || props.labels.local}</dd>
        <dt>{props.labels.agent}</dt><dd><span class="pw-mono">{d().agent}</span></dd>
        <Show when={d().precheck}><dt>{props.labels.precheck}</dt><dd><code class="pw-mono rt-pre" title={d().precheckHint}>{d().precheck}</code></dd></Show>
        <dt>{props.labels.last}</dt><dd><Show when={d().last} fallback={<span class="pw-mono">{props.labels.never}</span>}><RtRun run={d().last} actions={props.actions} /></Show></dd>
      </dl>
      <div class="pw-cap">{props.labels.mission}</div>
      <p class="rt-mission">{d().prompt}</p>
    </>
  );
}

function RoutinesWindow(props) {
  const m = () => props.model;
  return (
    <>
      <Head head={m().head} actions={props.actions} />
      <div class="pw-body">
        <div class="pw-list" role="listbox" aria-label={m().title}>
          <Show when={m().loaded} fallback={<Loading say={m().none} />}>
            <Show when={m().rows.length}><div class="pw-sec">{m().title}<span class="n">{m().rows.length}</span></div></Show>
            <For each={m().rows}>{(row) => <RtRow row={row} actions={props.actions} />}</For>
          </Show>
        </div>
        <div class="pw-detail">
          <div id="rt-form" data-no-t></div>
          <Show when={!m().editing}>
            <Show when={m().picked} fallback={<Show when={m().blank}><Empty empty={m().blank} /></Show>}>
              <RtDetail row={m().picked} labels={m().labels} actions={props.actions} />
            </Show>
          </Show>
          <Show when={!m().editing}><p class="usage-note" innerHTML={m().foot} /></Show>
        </div>
      </div>
      <Foot foot={m().bar} actions={props.actions} />
    </>
  );
}

function RoutinesPanel(props) {
  return <Show when={props.model.raycast} fallback={<Routines model={props.model} actions={props.actions} />}><RoutinesWindow model={props.model} actions={props.actions} /></Show>;
}

export function mountRoutines(host, extras) {
  return mountView(host, RoutinesPanel, { title: "", note: "", top: { title: "", read: "", create: "" }, sub: "", rows: [], none: "", foot: "" }, extras, { lazy: true });
}
