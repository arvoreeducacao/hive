import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";

function Row(props) {
  const r = () => props.row;
  return (
    <button type="button" class="mt-row" classList={{ here: r().here, indent: r().indent }} data-meeting={r().id} onClick={() => props.actions.pick(r().id)}
      onContextMenu={(ev) => { if (!r().mine) return; ev.preventDefault(); props.actions.rowMenu(r().id, ev.clientX, ev.clientY); }}>
      <Show when={!r().indent}>
        <Show when={r().live} fallback={<span class="mt-av">{r().initials}</span>}><span class="mt-dot" /></Show>
      </Show>
      <span class="mt-t"><b>{r().title}</b><span class="mt-m">{r().meta}</span></span>
      <span class="mt-chip" classList={{ hot: r().hot }}>{r().chip}</span>
    </button>
  );
}

function List(props) {
  const m = () => props.model;
  return (
    <div class="mt-list">
      <div class="mt-seg" role="tablist">
        <button type="button" classList={{ on: m().scope === "mine" }} data-mt-scope="mine" onClick={() => props.actions.scope("mine")}>{m().say.mine}</button>
        <button type="button" classList={{ on: m().scope === "team" }} data-mt-scope="team" onClick={() => props.actions.scope("team")}>{m().say.team}</button>
        <button type="button" classList={{ on: m().scope === "people" }} data-mt-scope="people" onClick={() => props.actions.scope("people")}>{m().say.people}</button>
      </div>
      <input class="mt-find" type="search" spellcheck={false} placeholder={m().say.search} value={m().query} onInput={(ev) => props.actions.search(ev.currentTarget.value)} />
      <div class="mt-rows">
        <For each={m().groups} fallback={<p class="mt-none">{m().none}</p>}>{(group) => (
          <>
            <div class="mt-sec"><Show when={group.initials}><span class="mt-av">{group.initials}</span></Show>{group.title}<span class="n">{group.count}</span></div>
            <For each={group.rows}>{(row) => <Row row={row} actions={props.actions} />}</For>
          </>
        )}</For>
      </div>
    </div>
  );
}

function WhoMenu(props) {
  const d = () => props.detail;
  const say = () => props.say;
  return (
    <div class="mt-menu" data-mt-menu="1">
      <div class="mt-cap">{say().whoHead}</div>
      <button type="button" class="mt-opt" classList={{ on: d().whoKey === "team" }} data-mt-who="team" onClick={() => props.actions.who("team")}><i /><span><b>{say().whoTeam}</b><span>{say().whoTeamSay}</span></span></button>
      <button type="button" class="mt-opt" classList={{ on: d().whoKey === "me" }} data-mt-who="me" onClick={() => props.actions.who("me")}><i /><span><b>{say().whoMe}</b><span>{say().whoMeSay}</span></span></button>
      <Show when={!d().live && d().team.length}>
        <div class="mt-opt flat" classList={{ on: d().whoKey === "people" }}><i /><span><b>{say().whoPeople}</b></span></div>
        <div class="mt-people">
          <For each={d().team}>{(one) => (
            <button type="button" classList={{ on: one.on }} data-mt-person={one.name} onClick={() => props.actions.person(one.name)}>{one.name}</button>
          )}</For>
        </div>
      </Show>
      <Show when={!d().live}>
        <div class="mt-rule" />
        <button type="button" class="mt-opt danger" data-mt-remove="1" onClick={() => props.actions.remove()}>{say().remove}</button>
      </Show>
    </div>
  );
}

function Notes(props) {
  const d = () => props.detail;
  const say = () => props.say;
  return (
    <Show when={d().state !== "summarizing"} fallback={<div class="mt-note"><b>{say().writingHead}</b><p>{say().writing}</p></div>}>
      <Show when={d().state !== "summary-failed"} fallback={
        <div class="mt-note warn"><b>{say().failedHead}</b><p>{say().failed}</p><Show when={d().trouble}><code class="mt-why">{d().trouble}</code></Show>
          <Show when={d().mine}><button type="button" class="btn" data-mt-retry="1" onClick={() => props.actions.redo()}>{say().retry}</button></Show>
        </div>
      }>
        <Show when={d().summary} fallback={<p class="mt-none">{say().noWords}</p>}>
          <h3>{say().oneLine}</h3>
          <p>{d().summary.oneLine}</p>
          <Show when={d().summary.decisions.length}><h3>{say().decisions}</h3><ul><For each={d().summary.decisions}>{(line) => <li>{line}</li>}</For></ul></Show>
          <Show when={d().summary.nextSteps.length}><h3>{say().nextSteps}</h3><ul><For each={d().summary.nextSteps}>{(step) => <li><Show when={step.who}><span class="mt-who">{step.who}</span>{" "}</Show>{step.what}</li>}</For></ul></Show>
          <Show when={d().summary.open.length}><h3>{say().open}</h3><ul><For each={d().summary.open}>{(line) => <li>{line}</li>}</For></ul></Show>
        </Show>
      </Show>
    </Show>
  );
}

function Words(props) {
  const d = () => props.detail;
  return (
    <>
      <For each={d().lines} fallback={<Show when={!d().live}><p class="mt-none">{props.say.noLines}</p></Show>}>{(line) => (
        <div class="mt-line"><span class="ts">{line.clock}</span><span class="src" classList={{ mine: line.mine }}>{line.source}</span><span>{line.text}</span></div>
      )}</For>
      <Show when={d().live}><div class="mt-line dim"><span class="ts" /><span class="src" /><span>{props.say.hearing}</span></div></Show>
    </>
  );
}

function Detail(props) {
  const d = () => props.detail;
  const say = () => props.say;
  return (
    <div class="mt-view" data-mt-detail={d().id}>
      <div class="mt-vh">
        <div class="mt-top">
          <Show when={d().mine} fallback={<h1>{d().title}</h1>}>
            <input class="mt-title" value={d().title} maxlength={120} spellcheck={false}
              onKeyDown={(ev) => { ev.stopPropagation(); if (ev.key === "Enter") ev.currentTarget.blur(); }}
              onBlur={(ev) => props.actions.rename(ev.currentTarget.value)} />
          </Show>
          <Show when={d().live} fallback={<button type="button" class="btn sm" data-mt-copy="1" onClick={() => props.actions.copy()}>{d().tab === "transcript" || !d().summary ? say().copyWords : say().copyNotes}</button>}>
            <span class="mt-timer">{d().timer}</span>
          </Show>
        </div>
        <div class="mt-meta">
          <Show when={d().live} fallback={<><span class="mt-av">{d().initials}</span><span>{d().by}</span><span>·</span><span>{d().when}</span><span>·</span><span>{d().length}</span><span>·</span></>}>
            <Show when={d().local}><span class="mt-meter">{say().mic}<i><b style={{ width: `${d().mic}%` }} /></i></span></Show>
            <Show when={d().systemOn}><span class="mt-meter">{say().system}<i><b style={{ width: `${d().system}%` }} /></i></span></Show>
            <Show when={d().captions}><span class="mt-chip hot" data-mt-captions="1" title={say().captionsSay}>{say().captions}</span></Show>
            <span class="mt-sp" />
            <span>{say().onFinish}</span>
          </Show>
          <Show when={d().mine} fallback={<span class="mt-chip">{d().who}</span>}>
            <button type="button" class="mt-chip pick" classList={{ hot: d().whoHot }} data-mt-who-open="1" onClick={() => props.actions.menu()}>{d().who} ▾</button>
          </Show>
        </div>
        <Show when={!d().live}>
          <div class="mt-tabs" role="tablist">
            <button type="button" classList={{ on: d().tab === "summary" }} data-mt-tab="summary" onClick={() => props.actions.tab("summary")}>{say().summary}</button>
            <button type="button" classList={{ on: d().tab === "transcript" }} data-mt-tab="transcript" onClick={() => props.actions.tab("transcript")}>{say().transcript}</button>
          </div>
        </Show>
        <Show when={d().menu}><WhoMenu detail={d()} say={say()} actions={props.actions} /></Show>
      </div>
      <Show when={d().systemDenied}><p class="mt-warn">{say().micOnly}</p></Show>
      <div class="mt-body">
        <Show when={d().tab === "summary"} fallback={<Words detail={d()} say={say()} />}><Notes detail={d()} say={say()} actions={props.actions} /></Show>
      </div>
      <div class="mt-ft">
        <Show when={d().live} fallback={
          <>
            <span>{d().tab === "summary" && d().model ? say().madeBy.replace("{model}", d().model) : say().sources}</span>
            <span class="mt-sp" />
            <Show when={d().mine && d().tab === "summary" && d().state === "ready" && d().lines.length}><button type="button" class="btn sm" data-mt-redo="1" onClick={() => props.actions.redo()}>{say().redo}</button></Show>
          </>
        }>
          <span>{d().local ? say().privacy : say().fromCall}</span><span class="mt-sp" />
          <button type="button" class="btn sm" data-mt-discard="1" onClick={() => props.actions.discard()}>{say().discard}</button>
        </Show>
      </div>
    </div>
  );
}

function Blank(props) {
  const b = () => props.blank;
  return (
    <div class="mt-blank">
      <div class="mt-note" classList={{ warn: b().warn }}>
        <b>{b().head}</b><p>{b().say}</p>
        <Show when={b().act}><button type="button" class="btn go" data-mt-blank={b().act} onClick={() => props.actions.blank(b().act)}>{b().actSay}</button></Show>
      </div>
    </div>
  );
}

function Meetings(props) {
  const m = () => props.model;
  return (
    <div class="mt-pane" onClick={() => props.actions.closeRowMenu()}>
      <Show when={m().rowMenu}>
        <div class="mt-menu mt-ctx" data-mt-row-menu="1" style={{ left: `${m().rowMenu.x}px`, top: `${m().rowMenu.y}px` }}>
          <button type="button" class="mt-opt danger" data-mt-row-remove="1" onClick={(ev) => { ev.stopPropagation(); props.actions.removeRow(); }}>{m().rowMenu.say}</button>
        </div>
      </Show>
      <div class="mt-ph">
        <b>{m().title}</b>
        <span class="mt-sp" />
        <Show when={m().recording} fallback={
          <button type="button" class="btn go" data-mt-record="1" disabled={!m().canRecord} onClick={() => props.actions.record()}><span class="mt-dot white" />{m().say.record}</button>
        }>
          <button type="button" class="btn stop" data-mt-stop="1" onClick={() => props.actions.stop()}><span class="mt-dot" />{m().say.stop}</button>
        </Show>
        <button type="button" class="nbtn" data-mt-close="1" aria-label={m().say.close} onClick={() => props.actions.close()}>✕</button>
      </div>
      <Show when={!m().blank} fallback={<Blank blank={m().blank} actions={props.actions} />}>
        <div class="mt-pb">
          <List model={m()} actions={props.actions} />
          <Show when={m().detail} fallback={<div class="mt-view" />}>
            <Detail detail={m().detail} say={m().say} actions={props.actions} />
          </Show>
        </div>
      </Show>
    </div>
  );
}

export function mountMeetings(host, extras) {
  return mountView(host, Meetings, { title: "", loaded: false, recording: false, canRecord: false, scope: "team", query: "", groups: [], none: "", blank: null, detail: null, rowMenu: null, say: {} }, extras, { lazy: true });
}
