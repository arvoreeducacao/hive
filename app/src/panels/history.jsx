import { For, Index, Show } from "solid-js";
import { mountView } from "../view.jsx";

const onBackdrop = (close) => (ev) => { if (ev.target === ev.currentTarget) close(); };

function Marked(props) {
  return <Index each={props.parts}>{(part) => <Show when={part().lit} fallback={part().text}><mark>{part().text}</mark></Show>}</Index>;
}

function Row(props) {
  return (
    <div class="hist-row">
      <span class={`hist-where ${props.row.where}`}>{props.row.whereSay}</span>
      <span class="hist-title" title={props.row.prompt}>
        <b><Marked parts={props.row.title} /><Show when={props.row.agentSay}><i class="hist-agent">{props.row.agentSay}</i></Show></b>
        <small><Marked parts={props.row.sub} /></small>
        <Show when={props.row.formerly}><small class="hist-hit"><Marked parts={props.row.formerly} /></small></Show>
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
        <button class="hist-revive hist-peek" data-peek={props.row.at} title={props.row.peekHint} onClick={() => props.actions.peek(props.row.at)}>{props.row.peekSay}</button>
        <Show when={props.row.down}>
          <button class="hist-revive down" data-down={props.row.at} title={props.row.downHint} disabled={props.row.downBusy} onClick={() => props.actions.down(props.row.at)}>{props.row.downSay}</button>
        </Show>
        <button class="hist-revive" data-i={props.row.at} onClick={() => props.actions.revive(props.row.at)}>{props.row.reviveSay}</button>
      </span>
    </div>
  );
}

function History(props) {
  return (
    <Show when={!props.model.hint} fallback={<p class="hint" style="padding:14px">{props.model.hint}</p>}>
      <For each={props.model.rows}>{(row) => <Row row={row} actions={props.actions} />}</For>
    </Show>
  );
}

function SyncStrip(props) {
  return (
    <Show when={props.model.mode !== "off"}>
      <Show when={props.model.mode === "set"} fallback={
        <>
          <span class="hint">{props.model.hint}</span>
          <input id="sync-repo" spellcheck="false" autocomplete="off" placeholder={props.model.placeholder} value={props.model.typed}
            onInput={(ev) => props.actions.syncTyped(ev.currentTarget.value)}
            onKeyDown={(ev) => { if (ev.key === "Enter") props.actions.syncGo(); }} />
          <button class="btn" id="sync-go" disabled={props.model.goBusy} onClick={() => props.actions.syncGo()}>{props.model.goSay}</button>
          <Show when={props.model.cancelSay}><button class="ghost" id="sync-cancel" onClick={() => props.actions.syncEdit(false)}>{props.model.cancelSay}</button></Show>
        </>
      }>
        <span class="hint">{props.model.lead} <b>{props.model.repo}</b> · {props.model.local} · {props.model.pod}</span>
        <Show when={props.model.trouble}><span class="hint bad">{props.model.trouble}</span></Show>
        <button class="ghost" id="sync-now" title={props.model.nowHint} disabled={props.model.busy} onClick={() => props.actions.syncNow()}>{props.model.nowSay}</button>
        <button class="ghost" id="sync-change" onClick={() => props.actions.syncEdit(true)}>{props.model.changeSay}</button>
      </Show>
    </Show>
  );
}

function ReviveHow(props) {
  return (
    <div class="modal" id="revive-how" classList={{ on: props.model.open }} onClick={onBackdrop(() => props.actions.closeRevive())}>
      <div class="box" style="width: min(520px, 92vw)">
        <h2>{props.words.head}</h2>
        <p class="hint" id="rh-title">{props.model.title}</p>
        <div class="rh-opts">
          <button class="rh-opt" id="rh-native" onClick={() => props.actions.reviveAs(true)}><b>{props.words.native}</b><span>{props.words.nativeSay}</span></button>
          <button class="rh-opt" id="rh-tui" onClick={() => props.actions.reviveAs(false)}><b>{props.words.tui}</b><span>{props.words.tuiSay}</span></button>
        </div>
        <div class="foot"><span>{props.words.foot}</span></div>
      </div>
    </div>
  );
}

function Preview(props) {
  return (
    <div class="modal" id="hist-preview" classList={{ on: props.model.open }} onClick={onBackdrop(() => props.actions.closePreview())}>
      <div class="box">
        <h2 id="hp-title">{props.model.title}</h2>
        <p class="hint" id="hp-meta">{props.model.meta}</p>
        <div class="hp-msgs" id="hp-msgs">
          <Show when={props.model.messages.length} fallback={<p class="hint">{props.model.note}</p>}>
            <For each={props.model.messages}>{(m) => <div class={`hp-msg ${m.role}`}><b>{m.who}</b><span>{m.text}</span></div>}</For>
          </Show>
        </div>
        <div class="foot"><span>{props.words.foot}</span><button class="btn" id="hp-revive" onClick={() => props.actions.reviveFromPreview()}>{props.words.revive}</button></div>
      </div>
    </div>
  );
}

function Archive(props) {
  return (
    <div class="modal" id="history" classList={{ on: props.model.open }} onClick={onBackdrop(() => props.actions.close())}>
      <div class="box">
        <h2>{props.words.title}</h2>
        <div class="hist-top">
          <input id="hist-search" autocomplete="off" spellcheck="false" placeholder={props.words.search} value={props.model.query}
            onInput={(ev) => props.actions.search(ev.currentTarget.value)} />
          <span class="hint" id="hist-count">{props.model.list.count}</span>
        </div>
        <div class="arch" id="hist-list" onScroll={(ev) => props.actions.scrolled(ev.currentTarget)}><History model={props.model.list} actions={props.actions} /></div>
        <div class="hist-sync" id="hist-sync"><SyncStrip model={props.model.sync} actions={props.actions} /></div>
        <div class="foot"><span><b>{props.words.revive}</b> {props.words.reviveSay}</span><button class="btn" id="hist-ok" onClick={() => props.actions.close()}>{props.words.close}</button></div>
      </div>
    </div>
  );
}

function HistoryScreens(props) {
  return (
    <>
      <ReviveHow model={props.model.revive} words={props.model.words.revive} actions={props.actions} />
      <Preview model={props.model.preview} words={props.model.words.preview} actions={props.actions} />
      <Archive model={props.model} words={props.model.words.archive} actions={props.actions} />
    </>
  );
}

const CLOSED = {
  open: false, query: "",
  list: { count: "", hint: "", rows: [], scanning: false },
  sync: { mode: "off" },
  preview: { open: false, title: "", meta: "", note: "", messages: [] },
  revive: { open: false, title: "" },
  words: {
    archive: { title: "", search: "", revive: "", reviveSay: "", close: "" },
    preview: { foot: "", revive: "" },
    revive: { head: "", native: "", nativeSay: "", tui: "", tuiSay: "", foot: "" }
  }
};

export function mountHistory(host, extras) {
  return mountView(host, HistoryScreens, CLOSED, extras);
}
