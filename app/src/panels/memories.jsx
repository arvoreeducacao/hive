import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";

function SearchIcon() {
  return <svg class="mem-ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>;
}

function Top(props) {
  const h = () => props.head;
  return (
    <header class="mem-top">
      <h2 class="mem-title">{h().title}</h2>
      <nav class="mem-tabs" role="tablist">
        <For each={h().tabs}>{(tab) => (
          <button type="button" role="tab" class="mem-tab" data-mem-tab={tab.key} aria-selected={tab.on ? "true" : "false"} onClick={() => props.actions.tab(tab.key)}>
            {tab.say}<Show when={tab.n}><span class="mem-n">{tab.n}</span></Show>
          </button>
        )}</For>
      </nav>
      <span class="mem-grow" />
      <Show when={h().key}><kbd class="mem-key">{h().key}</kbd></Show>
      <button class="ghost" id="mem-close" onClick={() => props.actions.close()}>{h().closeSay} <kbd>esc</kbd></button>
    </header>
  );
}

function Search(props) {
  return (
    <label class="mem-search">
      <SearchIcon />
      <input data-mem-search spellcheck="false" autocomplete="off" placeholder={props.search.placeholder} aria-label={props.search.placeholder}
        value={props.search.value} onInput={(ev) => props.onInput(ev.currentTarget.value)} />
    </label>
  );
}

function Blocked(props) {
  return (
    <div class="mem-states">
      <div class="mem-card" data-mem-state="blocked" role="status">
        <div class="mem-ct">{props.blocked.head}</div>
        <Show when={props.blocked.say}><p class="mem-p">{props.blocked.say}</p></Show>
        <button type="button" class="mem-btn" onClick={() => props.actions.retry()}>{props.blocked.retry}</button>
      </div>
    </div>
  );
}

function Empty(props) {
  return (
    <div class="mem-card mem-empty" data-mem-state="empty">
      <div class="mem-ct">{props.empty.head}</div>
      <p class="mem-p">{props.empty.say}</p>
      <Show when={props.empty.button}><button type="button" class="mem-btn" onClick={() => props.actions.all()}>{props.empty.button}</button></Show>
    </div>
  );
}

function Notices(props) {
  return (
    <>
      <Show when={props.error}>
        <div class="mem-err" role="alert" data-mem-error>
          <b>{props.error.head}</b>
          <Show when={props.error.lines.length}><ul><For each={props.error.lines}>{(line) => <li>{line}</li>}</For></ul></Show>
          <button type="button" class="mem-link" onClick={() => props.actions.dismiss()}>×</button>
        </div>
      </Show>
      <Show when={props.notice}>
        <div class="mem-notice-bar" role="status" data-mem-notice>
          <span>{props.notice.say}</span>
          <Show when={props.notice.url}><button type="button" class="mem-link" onClick={() => props.actions.open(props.notice.url)}>{props.notice.urlSay}</button></Show>
          <button type="button" class="mem-link" onClick={() => props.actions.dismiss()}>×</button>
        </div>
      </Show>
      <Show when={props.undo}>
        <div class="mem-notice-bar" role="status" data-mem-undo-bar>
          <span>{props.undo.say}</span>
          <button type="button" class="mem-link" data-mem-undo onClick={() => props.actions.undo()}>{props.undo.undoSay}</button>
        </div>
      </Show>
    </>
  );
}

function ScopeChip(props) {
  return (
    <button type="button" class="mem-scope" data-scope={props.scope} title={props.hint} disabled={props.busy}
      onClick={(ev) => { ev.stopPropagation(); props.onClick(); }}>{props.say}</button>
  );
}

function MineRow(props) {
  const r = () => props.row;
  return (
    <div class="mem-row" role="option" data-memory={r().id} aria-selected={r().here ? "true" : "false"} classList={{ chosen: r().chosen }} onClick={() => props.actions.pick(r().id)}>
      <input type="checkbox" class="mem-check" data-mem-choose aria-label={props.chooseSay} checked={r().chosen} disabled={!r().canChoose}
        onClick={(ev) => ev.stopPropagation()} onChange={() => props.actions.choose(r().id)} />
      <span class="mem-t">{r().name}</span>
      <span class="mem-side-tags">
        <Show when={r().proposed}><button type="button" class="mem-pr" onClick={(ev) => { ev.stopPropagation(); props.actions.open(r().proposedUrl); }}>{r().proposed}</button></Show>
        <ScopeChip scope={r().scope} say={r().scopeSay} hint={r().scopeHint} busy={r().busy} onClick={() => props.actions.flipScope(r().id)} />
      </span>
      <span class="mem-sn">{r().description}</span>
      <Show when={r().project}><span class="mem-meta"><span>{r().project}</span></span></Show>
    </div>
  );
}

function MineDetail(props) {
  const d = () => props.detail;
  return (
    <article class="mem-detail" data-mem-detail={d().id}>
      <div class="mem-crumb">{d().crumb}</div>
      <h3 class="mem-dt">{d().title}</h3>
      <Show when={d().description}><p class="mem-desc">{d().description}</p></Show>
      <div class="mem-scope-row" role="group" aria-label={d().scopeLabel}>
        <span class="mem-lab">{d().scopeLabel}</span>
        <For each={d().scopes}>{(one) => (
          <button type="button" class="mem-chip" data-mem-set-scope={one.key} aria-pressed={one.on ? "true" : "false"} disabled={d().busy} onClick={() => props.actions.scope(d().id, one.key)}>{one.say}</button>
        )}</For>
      </div>
      <Show when={d().proposed}>
        <p class="mem-p mem-proposed">{d().proposed} <button type="button" class="mem-link" onClick={() => props.actions.open(d().proposedUrl)}>{d().openPrSay}</button></p>
      </Show>
      <Show when={d().html} fallback={<div class="mem-body"><div class="mem-sk" /></div>}>
        <div class="mem-body md" innerHTML={d().html} />
      </Show>
      <div class="mem-act">
        <Show when={d().canPropose}><button type="button" class="mem-btn pri" data-mem-propose-one disabled={d().busy} onClick={() => props.actions.propose([d().id])}>{d().proposeSay}</button></Show>
        <button type="button" class="mem-btn warn" data-mem-delete disabled={d().busy} onClick={() => props.actions.remove(d().id)}>{d().deleteSay}</button>
      </div>
    </article>
  );
}

function Classify(props) {
  const c = () => props.classify;
  return (
    <section class="mem-list mem-classify" data-mem-classify>
      <Show when={!c().busy} fallback={
        <div class="mem-loading" role="status"><p class="mem-p">{c().say}</p><For each={[70, 92, 55]}>{(width) => <div class="mem-sk" style={{ width: `${width}%` }} />}</For>
          <button type="button" class="mem-btn" onClick={() => props.actions.classifyCancel()}>{c().cancelSay}</button></div>
      }>
        <div class="mem-bar">
          <p class="mem-p mem-grow">{c().head}</p>
          <button type="button" class="mem-btn solid" data-mem-classify-save disabled={!c().canSave} onClick={() => props.actions.classifySave()}>{c().saveSay}</button>
          <button type="button" class="mem-btn" onClick={() => props.actions.classifyCancel()}>{c().cancelSay}</button>
        </div>
        <Show when={c().failed}><p class="mem-p mem-warn">{c().failed}</p></Show>
        <Show when={c().error}><p class="mem-err" role="alert">{c().error}</p></Show>
        <div class="mem-rows">
          <For each={c().rows}>{(row) => (
            <div class="mem-row" data-mem-verdict={row.id} classList={{ quiet: !row.keep }}>
              <input type="checkbox" class="mem-check" checked={row.keep} aria-label={row.name} onChange={() => props.actions.classifyKeep(row.id)} />
              <span class="mem-t">{row.name}</span>
              <span class="mem-side-tags"><ScopeChip scope={row.scope} say={row.scopeSay} onClick={() => props.actions.classifyFlip(row.id)} /></span>
              <span class="mem-sn">{row.description}</span>
              <Show when={row.reason}><span class="mem-reason">{row.reason}</span></Show>
            </div>
          )}</For>
        </div>
      </Show>
    </section>
  );
}

function MineTab(props) {
  const m = () => props.mine;
  return (
    <div class="mem-wrap">
      <aside class="mem-side" aria-label={m().projectsSay}>
        <div class="mem-h">{m().projectsSay}</div>
        <For each={m().projects}>{(one) => (
          <button type="button" class="mem-f" data-mem-project={one.key} title={one.title || one.say} aria-pressed={one.on ? "true" : "false"} onClick={() => props.actions.project(one.key)}>
            <span class="mem-fn">{one.say}</span><span class="n">{one.n}</span>
          </button>
        )}</For>
      </aside>
      <Show when={!m().classify} fallback={<Classify classify={m().classify} actions={props.actions} />}>
        <section class="mem-list">
          <div class="mem-bar">
            <Search search={m().search} onInput={(text) => props.actions.search(text)} />
            <Show when={m().classifySay}><button type="button" class="mem-btn" data-mem-classify-start onClick={() => props.actions.classify()}>{m().classifySay}</button></Show>
            <button type="button" class="mem-btn pri" data-mem-propose disabled={!m().canPropose} onClick={() => props.actions.propose()}>{m().proposing ? m().proposingSay : m().proposeSay}</button>
          </div>
          <div class="mem-bar mem-filters">
            <For each={m().filters}>{(one) => (
              <button type="button" class="mem-chip" data-mem-filter={one.key} aria-pressed={one.on ? "true" : "false"} onClick={() => props.actions.filter(one.key)}>{one.say} <span class="mem-n">{one.n}</span></button>
            )}</For>
          </div>
          <Notices error={m().error} notice={m().notice} undo={m().undo} actions={props.actions} />
          <div class="mem-rows" role="listbox">
            <For each={m().rows}>{(row) => <MineRow row={row} chooseSay={m().chooseSay} actions={props.actions} />}</For>
            <Show when={m().empty}><Empty empty={m().empty} actions={props.actions} /></Show>
          </div>
        </section>
      </Show>
      <Show when={m().detail} fallback={<article class="mem-detail" />}><MineDetail detail={m().detail} actions={props.actions} /></Show>
    </div>
  );
}

function ProposalDetail(props) {
  const d = () => props.detail;
  return (
    <article class="mem-detail" data-mem-proposal={d().number}>
      <div class="mem-crumb"><span class="mem-checks" data-checks={d().checks} />{d().crumb}</div>
      <h3 class="mem-dt">{d().title}</h3>
      <div class="mem-act">
        <button type="button" class="mem-btn solid" data-mem-approve disabled={!d().canApprove} title={d().approveHint} onClick={() => props.actions.approve(d().number)}>{d().approveSay}</button>
        <button type="button" class="mem-btn" onClick={() => props.actions.open(d().url)}>{d().openSay}</button>
      </div>
      <Show when={d().approveHint}><p class="mem-p mem-hint" data-mem-approve-hint>{d().approveHint}</p></Show>
      <Show when={d().error}><p class="mem-err" role="alert">{d().error}</p></Show>
      <Show when={d().problems.length}>
        <div class="mem-err" data-mem-problems><b>{d().problemsHead}</b><ul><For each={d().problems}>{(one) => <li>{one.say}</li>}</For></ul></div>
      </Show>
      <For each={d().memories}>{(one) => (
        <section class="mem-piece" data-mem-piece={one.file}>
          <div class="mem-crumb"><span class="mem-change" data-change={one.change}>{one.changeSay}</span>{one.file}</div>
          <h4 class="mem-pt">{one.name}</h4>
          <Show when={one.description}><p class="mem-desc">{one.description}</p></Show>
          <Show when={one.html}><div class="mem-body md" innerHTML={one.html} /></Show>
        </section>
      )}</For>
    </article>
  );
}

function ProposalsTab(props) {
  const p = () => props.proposals;
  return (
    <div class="mem-wrap two">
      <section class="mem-list">
        <Notices notice={p().notice} actions={props.actions} />
        <div class="mem-rows" role="listbox">
          <For each={p().rows}>{(row) => (
            <button type="button" class="mem-row" role="option" data-mem-pr={row.number} aria-selected={row.here ? "true" : "false"} onClick={() => props.actions.pickPr(row.number)}>
              <span class="mem-t">{row.title}</span>
              <span class="mem-side-tags"><span class="mem-checks" data-checks={row.checks}>{row.checksSay}</span></span>
              <span class="mem-meta"><span>{row.meta}</span></span>
            </button>
          )}</For>
          <Show when={p().empty}><Empty empty={p().empty} actions={props.actions} /></Show>
        </div>
      </section>
      <Show when={p().detail} fallback={<article class="mem-detail" />}><ProposalDetail detail={p().detail} actions={props.actions} /></Show>
    </div>
  );
}

function TeamEditor(props) {
  const e = () => props.editor;
  return (
    <article class="mem-detail mem-editor" data-mem-editor={e().file}>
      <div class="mem-crumb">{e().file}</div>
      <label class="mem-field">
        <span class="mem-lab">{e().descriptionSay}</span>
        <input class="mem-in" data-mem-edit="description" spellcheck="false" value={e().description} onInput={(ev) => props.actions.teamField("description", ev.currentTarget.value)} />
      </label>
      <label class="mem-field mem-grow-field">
        <span class="mem-lab">{e().bodySay}</span>
        <textarea class="mem-in mem-area" data-mem-edit="body" spellcheck="false" value={e().body} onInput={(ev) => props.actions.teamField("body", ev.currentTarget.value)} />
      </label>
      <Show when={e().error}><p class="mem-err" role="alert">{e().error}</p></Show>
      <div class="mem-act">
        <button type="button" class="mem-btn solid" data-mem-team-save disabled={e().busy} onClick={() => props.actions.teamSave()}>{e().saveSay}</button>
        <button type="button" class="mem-btn" disabled={e().busy} onClick={() => props.actions.teamCancel()}>{e().cancelSay}</button>
      </div>
    </article>
  );
}

function TeamDetail(props) {
  const d = () => props.detail;
  return (
    <article class="mem-detail" data-mem-team-detail={d().file}>
      <div class="mem-crumb">{d().crumb}</div>
      <h3 class="mem-dt">{d().name}</h3>
      <Show when={d().description}><p class="mem-desc">{d().description}</p></Show>
      <div class="mem-body md" innerHTML={d().html} />
      <Show when={d().confirm} fallback={
        <div class="mem-act">
          <button type="button" class="mem-btn" data-mem-team-edit disabled={d().busy} onClick={() => props.actions.teamEdit()}>{d().editSay}</button>
          <button type="button" class="mem-btn warn" data-mem-team-delete disabled={d().busy} onClick={() => props.actions.teamAskDelete()}>{d().deleteSay}</button>
        </div>
      }>
        <div class="mem-confirm" role="alertdialog" aria-label={d().confirmSay} data-mem-confirm>
          <p>{d().confirmSay}</p>
          <div class="mem-act">
            <button type="button" class="mem-btn danger" data-mem-confirm-yes disabled={d().busy} onClick={() => props.actions.teamDelete()}>{d().busy ? d().busySay : d().confirmYes}</button>
            <button type="button" class="mem-btn" disabled={d().busy} onClick={() => props.actions.teamKeep()}>{d().confirmNo}</button>
          </div>
        </div>
      </Show>
      <p class="mem-p mem-hint">{d().note}</p>
    </article>
  );
}

function TeamTab(props) {
  const t = () => props.team;
  return (
    <div class="mem-wrap two">
      <section class="mem-list">
        <div class="mem-bar">
          <Search search={t().search} onInput={(text) => props.actions.teamSearch(text)} />
          <span class="mem-source">{t().source}</span>
        </div>
        <Notices error={t().error} notice={t().notice} actions={props.actions} />
        <div class="mem-rows" role="listbox">
          <For each={t().rows}>{(row) => (
            <button type="button" class="mem-row" role="option" data-mem-team={row.file} aria-selected={row.here ? "true" : "false"} onClick={() => props.actions.pickTeam(row.file)}>
              <span class="mem-t">{row.name}</span>
              <span class="mem-sn">{row.description}</span>
            </button>
          )}</For>
          <Show when={t().empty}><Empty empty={t().empty} actions={props.actions} /></Show>
        </div>
      </section>
      <Show when={t().editor} fallback={<Show when={t().detail} fallback={<article class="mem-detail" />}><TeamDetail detail={t().detail} actions={props.actions} /></Show>}>
        <TeamEditor editor={t().editor} actions={props.actions} />
      </Show>
    </div>
  );
}

function Loading(props) {
  return (
    <div class="mem-loading" role="status">
      <p class="mem-p">{props.say}</p>
      <For each={[70, 92, 55]}>{(width) => <div class="mem-sk" style={{ width: `${width}%` }} />}</For>
    </div>
  );
}

function Body(props) {
  const m = () => props.model;
  const blocked = () => m().mine?.blocked || m().proposals?.blocked || m().team?.blocked;
  return (
    <Show when={!m().loading} fallback={<Loading say={m().loadingSay} />}>
      <Show when={!blocked()} fallback={<Blocked blocked={blocked()} actions={props.actions} />}>
        <Show when={m().tab === "mine" && m().mine}><MineTab mine={m().mine} actions={props.actions} /></Show>
        <Show when={m().tab === "proposals" && m().proposals}><ProposalsTab proposals={m().proposals} actions={props.actions} /></Show>
        <Show when={m().tab === "team" && m().team}><TeamTab team={m().team} actions={props.actions} /></Show>
      </Show>
    </Show>
  );
}

function MemoriesPanel(props) {
  return (
    <>
      <Top head={props.model.head} actions={props.actions} />
      <div class="mem-main"><Body model={props.model} actions={props.actions} /></div>
    </>
  );
}

export function mountMemories(host, extras) {
  return mountView(host, MemoriesPanel, { head: { title: "", tabs: [], key: "", closeSay: "" }, tab: "mine", loading: true, loadingSay: "", mine: null, proposals: null, team: null }, extras, { lazy: true });
}
