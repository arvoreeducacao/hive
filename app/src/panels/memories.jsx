import { For, Index, Show } from "solid-js";
import { mountView } from "../view.jsx";

function FolderIcon(props) {
  return (
    <svg class="mem-ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true">
      <Show when={props.all} fallback={<Show when={props.archived} fallback={<path d="M2 5h4l1.5 1.5H14V13H2z" />}><path d="M2.5 4h11v3h-11zM3.5 7v6h9V7M6.5 9.5h3" /></Show>}>
        <rect x="2" y="3" width="12" height="10" rx="2" />
      </Show>
    </svg>
  );
}

function Top(props) {
  const h = () => props.head;
  return (
    <header class="mem-top">
      <h2 class="mem-title">{h().title}</h2>
      <nav class="mem-tabs" role="tablist">
        <For each={h().tabs}>{(tab) => (
          <button type="button" role="tab" class="mem-tab" data-mem-tab={tab.key} aria-selected={tab.on ? "true" : "false"} onClick={() => props.actions.tab(tab.key)}>{tab.say}</button>
        )}</For>
      </nav>
      <span class="mem-grow" />
      <Show when={h().demo}><span class="mem-demo" title={h().demoHint}>{h().demo}</span></Show>
      <Show when={h().fresh}><span class="mem-fresh" data-mem-fresh>{h().fresh}</span></Show>
      <Show when={h().source}><span class="mem-source">{h().source}</span></Show>
      <Login login={h().login} actions={props.actions} />
      <Show when={h().key}><kbd class="mem-key">{h().key}</kbd></Show>
      <button class="ghost" id="mem-close" onClick={() => props.actions.close()}>{h().closeSay} <kbd>esc</kbd></button>
    </header>
  );
}

function Login(props) {
  const l = () => props.login || { state: "unknown" };
  return (
    <div class="mem-login" data-mem-login={l().state}>
      <Show when={l().state === "in"}>
        <span class="mem-who" title={l().title}><i class="mem-on" aria-hidden="true" />{l().email}</span>
        <Show when={l().demo}><span class="mem-demo">{l().demo}</span></Show>
        <button type="button" class="mem-link" data-mem-signout onClick={() => props.actions.signOut()}>{l().outSay}</button>
      </Show>
      <Show when={l().state === "out"}>
        <Show when={l().notice}><span class="mem-notice" role="status">{l().notice}</span></Show>
        <button type="button" class="mem-btn go mem-google" data-mem-signin disabled={l().busy || l().disabled} aria-describedby={l().error ? "mem-login-err" : undefined} title={l().disabled ? l().error : undefined} onClick={() => props.actions.signIn()}>{l().inSay}</button>
      </Show>
      <Show when={l().state === "waiting"}>
        <span class="mem-notice" role="status">{l().say}</span>
        <Show when={l().url}><button type="button" class="mem-link" onClick={() => props.actions.openAgain(l().url)}>{l().againSay}</button></Show>
        <button type="button" class="mem-link" onClick={() => props.actions.cancelSignIn()}>{l().cancelSay}</button>
      </Show>
      <Show when={l().state === "pod" || l().state === "no-vault"}>
        <span class="mem-notice" data-mem-nologin>{l().say}</span>
      </Show>
    </div>
  );
}

function LoginTrouble(props) {
  const l = () => props.login;
  return (
    <p class="mem-login-err" id="mem-login-err" role={l().missing ? "status" : "alert"} data-mem-login-err={l().missing ? "missing" : "failed"}>{l().error}</p>
  );
}

function Card(props) {
  const c = () => props.card;
  return (
    <div class="mem-card" data-mem-state={c().key}>
      <span class="mem-lb">{c().label}</span>
      <div class="mem-ct">{c().head}</div>
      <For each={c().lines}>{(line) => <p class="mem-p"><For each={line}>{(part) => (part.code ? <code>{part.text}</code> : part.text)}</For></p>}</For>
      <button type="button" class="mem-btn" classList={{ pri: !c().retry }} onClick={() => (c().retry ? props.actions.retry() : props.actions.doctor())}>{c().button}</button>
    </div>
  );
}

function Folders(props) {
  const l = () => props.list;
  const repos = () => l().folders.filter((one) => !one.archived);
  const shelf = () => l().folders.filter((one) => one.archived);
  return (
    <aside class="mem-side" aria-label={l().reposSay}>
      <div class="mem-h">{l().reposSay}</div>
      <For each={repos()}>{(one) => (
        <button type="button" class="mem-f" data-mem-folder={one.key} aria-pressed={one.on ? "true" : "false"} onClick={() => props.actions.folder(one.key)}>
          <FolderIcon all={one.all} /><span class="mem-fn">{one.say}</span><span class="n">{one.n}</span>
        </button>
      )}</For>
      <div class="mem-h mem-h2">{l().stateSay}</div>
      <For each={shelf()}>{(one) => (
        <button type="button" class="mem-f" data-mem-folder={one.key} aria-pressed={one.on ? "true" : "false"} onClick={() => props.actions.folder(one.key)}>
          <FolderIcon archived /><span class="mem-fn">{one.say}</span><span class="n">{one.n}</span>
        </button>
      )}</For>
    </aside>
  );
}

function Row(props) {
  const r = () => props.row;
  return (
    <button type="button" class="mem-row" classList={{ quiet: props.quiet && !r().here }} role="option" data-memory={r().id} aria-selected={r().here ? "true" : "false"} onClick={() => props.actions.pick(r().id)}>
      <span class="mem-t">{r().title}</span><span class="mem-uses">{r().uses}</span>
      <span class="mem-sn">{r().snippet}</span>
      <span class="mem-meta">
        <span class={`mem-tag ${r().origin}`} data-mem-origin={r().origin}>{r().originSay}</span>
        <Show when={r().category}><span>{r().category}</span></Show>
        <Show when={r().repo}><span>{r().repo}</span></Show>
        <Show when={r().author}><span>{r().author}</span></Show>
        <span>{r().when}</span>
        <Show when={r().fades}><span class="mem-fades">{r().fades}</span></Show>
        <Show when={r().gone}><span class="mem-gone">{r().gone}</span></Show>
      </span>
    </button>
  );
}

function Detail(props) {
  const d = () => props.detail;
  return (
    <article class="mem-detail" data-mem-detail={d().id}>
      <div class="mem-crumb"><span class={`mem-tag ${d().origin}`}>{d().originSay}</span>{d().crumb}</div>
      <h3 class="mem-dt">{d().title}</h3>
      <dl class="mem-kv">
        <For each={d().rows}>{(row) => <><dt>{row.say}</dt><dd>{row.value}</dd></>}</For>
      </dl>
      <Show when={d().html} fallback={<div class="mem-body"><p>{d().snippet}</p></div>}>
        <div class="mem-body md" innerHTML={d().html} />
      </Show>
      <Show when={d().confirm} fallback={
        <div class="mem-act">
          <Show when={!d().archived}>
            <button type="button" class="mem-btn" data-mem-edit-open disabled={!d().canEdit} title={d().lock?.say || ""} onClick={() => props.actions.edit()}>{d().editSay}</button>
          </Show>
          <Show when={d().archived} fallback={
            <button type="button" class="mem-btn warn" data-mem-archive disabled={!d().can || d().busy} title={d().lock?.say || ""} onClick={() => props.actions.askArchive(d().id)}>{d().archiveSay}</button>
          }>
            <button type="button" class="mem-btn go" data-mem-unarchive disabled={!d().can || d().busy} title={d().lock?.say || ""} onClick={() => props.actions.unarchive(d().id)}>{d().busy ? d().busySay : d().unarchiveSay}</button>
          </Show>
          <button type="button" class="mem-btn" onClick={(ev) => props.actions.copy(ev.currentTarget, d().copyText)}>{d().copySay}</button>
        </div>
      }>
        <div class="mem-confirm" role="alertdialog" aria-label={d().confirmSay} data-mem-confirm>
          <p>{d().confirmSay}</p>
          <div class="mem-act">
            <button type="button" class="mem-btn danger" data-mem-confirm-yes disabled={d().busy} onClick={() => props.actions.archive(d().id)}>{d().busy ? d().busySay : d().confirmYes}</button>
            <button type="button" class="mem-btn" disabled={d().busy} onClick={() => props.actions.keepIt()}>{d().confirmNo}</button>
          </div>
        </div>
      </Show>
      <Show when={d().error}><p class="mem-err" role="alert">{d().error}</p></Show>
      <Show when={d().lock}>
        <div class="mem-lock">
          <span>{d().lock.say}</span>
          <Show when={d().lock.button}><button type="button" class="mem-btn go mem-google" data-mem-signin-here onClick={() => props.actions.signIn()}>{d().lock.button}</button></Show>
        </div>
      </Show>
    </article>
  );
}

function Editor(props) {
  const e = () => props.editor;
  const act = props.actions;
  const keys = (ev) => { if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); act.save(); } };
  return (
    <article class="mem-detail mem-editor" data-mem-editor={e().id} onKeyDown={keys}>
      <div class="mem-who-line">
        <span>{e().whoSay}</span><b>{e().email}</b><Show when={e().authorSay}><span>· {e().authorSay}</span></Show>
      </div>
      <label class="mem-field">
        <span class="mem-lab">{e().titleSay}</span>
        <input class="mem-in" data-mem-edit="title" maxlength="200" spellcheck="false" value={e().title} onInput={(ev) => act.editField("title", ev.currentTarget.value)} />
      </label>
      <div class="mem-two">
        <label class="mem-field">
          <span class="mem-lab">{e().categorySay}</span>
          <select class="mem-in" data-mem-edit="category" value={e().category} onChange={(ev) => act.editField("category", ev.currentTarget.value)}>
            <For each={e().categories}>{(one) => <option value={one.key} selected={one.key === e().category}>{one.say}</option>}</For>
          </select>
        </label>
        <div class="mem-field">
          <span class="mem-lab" id="mem-tags-lab">{e().tagsSay}</span>
          <div class="mem-in mem-tags" role="group" aria-labelledby="mem-tags-lab">
            <For each={e().tags}>{(tag) => (
              <span class="mem-tg" data-mem-tag={tag.say}>{tag.say}<button type="button" aria-label={tag.dropSay} onClick={() => act.dropTag(tag.key)}>×</button></span>
            )}</For>
            <input data-mem-edit="tag" spellcheck="false" placeholder={e().tagPlaceholder} aria-label={e().tagsSay} value={e().tagDraft}
              onInput={(ev) => act.editField("tagDraft", ev.currentTarget.value, ev.currentTarget)} onKeyDown={(ev) => act.tagKey(ev)} />
          </div>
        </div>
      </div>
      <div class="mem-field mem-grow-field">
        <div class="mem-lab-row">
          <span class="mem-lab" id="mem-content-lab">{e().contentSay}</span>
          <div class="mem-mini-tabs" role="tablist">
            <button type="button" role="tab" data-mem-view="write" aria-selected={e().view === "write" ? "true" : "false"} onClick={() => act.editField("view", "write")}>{e().writeSay}</button>
            <button type="button" role="tab" data-mem-view="preview" aria-selected={e().view === "preview" ? "true" : "false"} onClick={() => act.editField("view", "preview")}>{e().previewSay}</button>
          </div>
        </div>
        <Show when={e().view === "preview"} fallback={
          <textarea class="mem-in mem-area" data-mem-edit="content" spellcheck="false" aria-labelledby="mem-content-lab" value={e().content} onInput={(ev) => act.editField("content", ev.currentTarget.value)} />
        }>
          <div class="mem-in mem-area mem-body md" data-mem-preview innerHTML={e().preview} />
        </Show>
      </div>
      <Show when={e().error}><p class="mem-err" role="alert" data-mem-edit-error>{e().error}</p></Show>
      <div class="mem-act mem-edit-act">
        <button type="button" class="mem-btn solid" data-mem-save disabled={e().saving} onClick={() => act.save()}>{e().saveSay}</button>
        <button type="button" class="mem-btn" data-mem-cancel disabled={e().saving} onClick={() => act.cancelEdit()}>{e().cancelSay}</button>
        <span class="mem-note">{e().note}</span>
      </div>
    </article>
  );
}

function Trouble(props) {
  const t = () => props.trouble;
  return (
    <div class="mem-trouble" role="status">
      <b>{t().head}</b><span>{t().say}</span>
      <button type="button" class="mem-btn" onClick={() => props.actions.retry()}>{t().retry}</button>
    </div>
  );
}

function MemoriesTab(props) {
  const l = () => props.list;
  return (
    <div class="mem-wrap" classList={{ editing: !!l().editor }}>
      <Folders list={l()} actions={props.actions} />
      <section class="mem-list">
        <div class="mem-bar">
          <label class="mem-search">
            <svg class="mem-ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
            <input data-mem-search spellcheck="false" autocomplete="off" placeholder={l().search.placeholder} aria-label={l().search.placeholder}
              value={l().search.value} onInput={(ev) => props.actions.search(ev.currentTarget.value)} />
          </label>
          <For each={l().origins}>{(one) => (
            <button type="button" class="mem-chip" data-mem-filter={one.key} aria-pressed={one.on ? "true" : "false"} onClick={() => props.actions.origin(one.key)}>{one.say}</button>
          )}</For>
        </div>
        <Show when={props.trouble}><Trouble trouble={props.trouble} actions={props.actions} /></Show>
        <div class="mem-rows" role="listbox">
          <For each={l().rows}>{(row) => <Row row={row} quiet={l().editing} actions={props.actions} />}</For>
          <Show when={l().empty}>
            <div class="mem-card mem-empty" data-mem-state="empty">
              <div class="mem-ct">{l().empty.head}</div>
              <For each={l().empty.lines}>{(line) => <p class="mem-p">{line}</p>}</For>
              <button type="button" class="mem-btn" onClick={() => props.actions.all()}>{l().empty.button}</button>
            </div>
          </Show>
        </div>
      </section>
      <Show when={l().editor} fallback={
        <Show when={l().detail} fallback={<article class="mem-detail" />}>
          <Detail detail={l().detail} actions={props.actions} />
        </Show>
      }>
        <Editor editor={l().editor} actions={props.actions} />
      </Show>
    </div>
  );
}

function Chart(props) {
  const c = () => props.chart;
  return (
    <svg class="mem-chart" viewBox={`0 0 ${c().width} ${c().height}`} width="100%" height={c().height} role="img" aria-label={props.title}>
      <title>{props.title}</title>
      <Index each={c().ticks}>{(tick) => (
        <g class="mem-grid">
          <line x1={c().left} y1={tick().y} x2={c().width} y2={tick().y} classList={{ base: tick().value === 0 }} />
          <text x="0" y={tick().y + 3}>{tick().value}</text>
        </g>
      )}</Index>
      <Index each={c().bars}>{(bar) => (
        <g>
          <Show when={bar().handH > 0}><rect class="mem-hand" x={bar().x} y={bar().handY} width={bar().w} height={bar().handH}><title>{`${bar().key} · ${bar().hand}`}</title></rect></Show>
          <Show when={bar().autoH > 0}><rect class="mem-auto" x={bar().x} y={bar().autoY} width={bar().w} height={bar().autoH}><title>{`${bar().key} · ${bar().auto}`}</title></rect></Show>
          <Show when={bar().label}><text class="mem-wk" x={bar().x + 2} y={c().floor + 18}>{bar().label}</text></Show>
        </g>
      )}</Index>
      <Show when={c().bridgeX !== null}>
        <line class="mem-bridge" x1={c().bridgeX} y1="20" x2={c().bridgeX} y2={c().floor} />
        <text class="mem-bridge-t" x={c().bridgeX + 6} y="28">{props.bridgeSay}</text>
      </Show>
    </svg>
  );
}

function SummaryTab(props) {
  const s = () => props.summary;
  return (
    <Show when={!s().loading} fallback={<div class="mem-pg"><p class="mem-p">{s().say}</p></div>}>
      <Show when={!s().missing} fallback={<div class="mem-pg"><p class="mem-p">{s().say}</p></div>}>
        <div class="mem-pg">
          <For each={s().kpis}>{(kpi) => (
            <div class="mem-box mem-k" data-mem-kpi={kpi.key}>
              <div class="mem-kv-big" classList={{ accent: kpi.accent }}>{kpi.value}</div>
              <div class="mem-kl">{kpi.say}</div>
              <Show when={kpi.bar !== undefined && kpi.bar !== null}>
                <div class="mem-cap-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow={kpi.bar} aria-label={kpi.say}><i classList={{ hot: kpi.hot }} style={{ width: `${kpi.bar}%` }} /></div>
              </Show>
              <div class="mem-kd" classList={{ good: kpi.good, muted: kpi.muted }}>{kpi.sub}</div>
            </div>
          )}</For>
          <div class="mem-box mem-span8" data-mem-chart>
            <div class="mem-h"><span>{s().chartSay}</span><span class="mem-lg"><span><i class="mem-dot auto" />{s().autoSay}</span><span><i class="mem-dot hand" />{s().handSay}</span></span></div>
            <Chart chart={s().chart} title={s().chartTitle} bridgeSay={s().bridgeSay} />
            <Show when={s().chartCap}><div class="mem-cap">{s().chartCap}</div></Show>
          </div>
          <div class="mem-box mem-span4" data-mem-funnel>
            <div class="mem-h"><span>{s().funnelSay}</span></div>
            <div class="mem-fun">
              <For each={s().funnel}>{(row) => (
                <div class="mem-fr"><span class="mem-fl">{row.say}</span><i class="mem-fb" classList={{ on: row.on }} style={{ width: `${row.share}%` }} /><span class="mem-fv">{row.n}</span></div>
              )}</For>
            </div>
            <Show when={s().funnelCap}><div class="mem-cap">{s().funnelCap}</div></Show>
            <Show when={s().health}><div class="mem-cap mem-health" classList={{ good: s().healthGood }} data-mem-health>{s().health}</div></Show>
          </div>
          <div class="mem-box mem-span4" data-mem-repos>
            <div class="mem-h"><span>{s().reposSay}</span></div>
            <For each={s().repos}>{(one) => (
              <div class="mem-hb"><span>{one.say}</span><span class="mem-tr"><i classList={{ on: one.on }} style={{ width: `${one.share}%` }} /></span><span class="v">{one.n}</span></div>
            )}</For>
          </div>
          <div class="mem-box mem-span5" data-mem-top>
            <div class="mem-h"><span>{s().topSay}</span><span>{s().usesSay}</span></div>
            <For each={s().top}>{(one) => (
              <button type="button" class="mem-li" onClick={() => props.actions.seeOne(one.id)}><span>{one.title}</span><span class="n">{one.n}</span></button>
            )}</For>
          </div>
          <div class="mem-box mem-span3" data-mem-clean>
            <div class="mem-h"><span>{s().cleanSay}</span></div>
            <div class="mem-kv-big small">{s().cleanCount}</div>
            <div class="mem-kl">{s().cleanLine}</div>
            <div class="mem-clean">
              <For each={s().cleanRows}>{(one) => <div class="mem-li"><span>{one.title}</span><span class="n">{one.when}</span></div>}</For>
            </div>
            <Show when={s().soon}><div class="mem-cap mem-soon">{s().soon}</div></Show>
          </div>
          <Show when={s().unanswered}>
            <div class="mem-box mem-span12" data-mem-unanswered>
              <div class="mem-h"><span>{s().unanswered.say}</span><span>{s().unanswered.periodSay}</span></div>
              <div class="mem-un">
                <div>
                  <div class="mem-kv-big">{s().unanswered.total}</div>
                  <div class="mem-kl">{s().unanswered.totalSay}</div>
                  <div class="mem-cap">{s().unanswered.cap}</div>
                </div>
                <div>
                  <For each={s().unanswered.rows}>{(one) => <div class="mem-li" data-mem-question><span>{one.topic}</span><span class="n">{one.n}</span></div>}</For>
                  <Show when={s().unanswered.none}><p class="mem-p">{s().unanswered.none}</p></Show>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </Show>
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

function MemoriesPanel(props) {
  const m = () => props.model;
  return (
    <>
      <Top head={m().head} actions={props.actions} />
      <Show when={m().head.login?.state === "out" && m().head.login.error}><LoginTrouble login={m().head.login} /></Show>
      <div class="mem-main">
        <Show when={!m().loading} fallback={<Loading say={m().loadingSay} />}>
          <Show when={!m().blocked} fallback={<div class="mem-states"><Card card={m().blocked} actions={props.actions} /></div>}>
            <Show when={m().tab === "summary" && m().summary} fallback={<Show when={m().list}><MemoriesTab list={m().list} trouble={m().trouble} actions={props.actions} /></Show>}>
              <SummaryTab summary={m().summary} actions={props.actions} />
            </Show>
          </Show>
        </Show>
      </div>
    </>
  );
}

export function mountMemories(host, extras) {
  return mountView(host, MemoriesPanel, { head: { title: "", tabs: [], fresh: "", source: "", demo: "", key: "", closeSay: "", login: { state: "unknown" } }, tab: "memories", loading: true, loadingSay: "", blocked: null, trouble: null, list: null, summary: null }, extras, { lazy: true });
}
