import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";
import { Empty, Foot, Head, Icon, Loading } from "./window.jsx";

function Top(props) {
  return (
    <div class="usage-top">
      <h2>{props.top.title}</h2>
      <span class="when">{props.top.hub} · {props.top.read}</span>
      <div class="wt-acts">
        <label>{props.top.idleAfter}<select id="wt-hours">
          <For each={props.top.hours}>{(one) => <option value={one.value} selected={one.on}>{one.say}</option>}</For>
        </select></label>
        <button class="btn" id="wt-refresh">{props.top.refresh}</button>
        <button class="ghost" id="wt-close">{props.top.closeSay} <kbd>esc</kbd></button>
      </div>
    </div>
  );
}

function Row(props) {
  return (
    <div class="wt" data-idle={props.row.idle} data-live={props.row.live}>
      <span class="dot"></span>
      <div class="what">
        <div class="top"><b>{props.row.head}</b><For each={props.row.badges}>{(one) => <span class={one.cls}>{one.say}</span>}</For></div>
        <code data-copy={props.row.path} title={props.row.copyHint}>{props.row.path}</code>
      </div>
      <div class="wt-size"><span>{props.row.size}</span><i class="track"><i style={{ width: `${props.row.share}%` }}></i></i></div>
      <span class="wt-when">{props.row.when}</span>
      <button class="wt-del" data-del={props.row.path} disabled={props.row.busy}>{props.row.delSay}</button>
    </div>
  );
}

function Worktrees(props) {
  return (
    <Show when={!props.model.trouble} fallback={<p class="usage-note">{props.model.note}</p>}>
      <Show when={props.model.top} fallback={
        <>
          <div class="usage-top"><h2>{props.model.title}</h2></div>
          <p class="usage-note">{props.model.note}</p>
        </>
      }>
      <Top top={props.model.top} />
      <Show when={props.model.tiles} fallback={<p class="wt-none">{props.model.none}</p>}>
        <div class="tiles">
          <For each={props.model.tiles}>{(tile) => (
            <div class="tile-n"><span class="label">{tile.label}</span><span class="val">{tile.value} <small>{tile.small}</small></span></div>
          )}</For>
        </div>
        <div class="wt-bar">
          <button class="sweep" id="wt-sweep" disabled={props.model.sweep.off}>{props.model.sweep.say}</button>
          <span class="says">{props.model.sweep.says}</span>
        </div>
        <For each={props.model.groups}>{(group) => (
          <div class="wt-group">
            <div class="head"><b>{group.repo}</b><span>{group.count} · {group.size}</span></div>
            <For each={group.rows}>{(row) => <Row row={row} />}</For>
          </div>
        )}</For>
        </Show>
      </Show>
    </Show>
  );
}


function WtRow(props) {
  const r = () => props.row;
  return (
    <button type="button" class="pw-row wt" role="option" aria-selected={r().here ? "true" : "false"} data-path={r().path}
      data-idle={r().idle} data-live={r().live} title={r().path} onClick={() => props.actions.pick(r().path)}>
      <Icon id="i-tree" />
      <span class="pw-txt"><span class="pw-t">{r().head}</span><span class="pw-m">{r().size}</span></span>
      <span class="pw-acc">
        <Show when={r().status.badge} fallback={
          <span class="pw-st"><Show when={r().status.dot}><span class={`rc-dot ${r().status.dot}`} aria-hidden="true" /></Show>{r().status.say}</span>
        }><span class="pw-lab">{r().status.say}</span></Show>
      </span>
    </button>
  );
}

function WtDetail(props) {
  const d = () => props.detail;
  return (
    <>
      <h2 class="pw-h1">{d().head}</h2>
      <div class="pw-strip"><For each={d().strip}>{(bit) => <span>{bit}</span>}</For></div>
      <dl class="pw-kv">
        <dt>{d().pathSay}</dt>
        <dd><span class="pw-mono" title={d().path}>{d().pathCut}</span>
          <button type="button" class="pw-copy" aria-label={d().copySay} title={d().copySay} onClick={(ev) => props.actions.copy(ev.currentTarget, d().path)}><Icon id="i-copy" /></button></dd>
        <dt>{d().sizeSay}</dt>
        <dd><span class="wt-size"><span>{d().size}</span><i class="track"><i style={{ width: `${d().share}%` }}></i></i></span></dd>
        <dt>{d().whenSay}</dt><dd>{d().when}</dd>
        <dt>{d().keptSay}</dt>
        <dd>
          <Show when={d().badges.length} fallback={<span class="pw-mono">{d().free}</span>}>
            <For each={d().badges}>{(one) => <span class={`pw-lab ${one.cls}`}>{one.say}</span>}</For>
          </Show>
        </dd>
      </dl>
      <div class="pw-hr" />
      <p class="wt-says">{props.sweep.says}</p>
    </>
  );
}

function WorktreesWindow(props) {
  const m = () => props.model;
  return (
    <>
      <Head head={m().head} actions={props.actions} />
      <div class="pw-body">
        <div class="pw-list" role="listbox" aria-label={m().head.title}>
          <Show when={!m().loading} fallback={<Loading say={m().loading} />}>
            <For each={m().groups}>{(group) => (
              <>
                <div class="pw-sec">{group.repo}<span class="n">{group.count} · {group.size}</span></div>
                <For each={group.rows}>{(row) => <WtRow row={row} actions={props.actions} />}</For>
              </>
            )}</For>
          </Show>
        </div>
        <div class="pw-detail">
          <Show when={m().detail} fallback={<Show when={m().blank}><Empty empty={m().blank} /></Show>}>
            <WtDetail detail={m().detail} sweep={m().sweep} actions={props.actions} />
          </Show>
        </div>
      </div>
      <Foot foot={m().bar} actions={props.actions} />
    </>
  );
}

function WorktreesPanel(props) {
  return <Show when={props.model.raycast} fallback={<Worktrees model={props.model} />}><WorktreesWindow model={props.model} actions={props.actions} /></Show>;
}

export function mountWorktrees(host, extras = {}) {
  return mountView(host, WorktreesPanel, { top: null, title: "", note: "" }, extras, { lazy: true });
}
