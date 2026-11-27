import { For, Match, Show, Switch, createRoot } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

function McpRows(props) {
  return (
    <For each={props.rows}>
      {(row) => (
        <div class="mcp-row">
          <span class="dot" style={{ background: row.dot }}></span>
          <span class="nm">{row.name}</span>
          <span class="st">{row.status}</span>
          <span class="er">{row.error}</span>
          <Show when={row.auth}>
            <button class="auth" type="button" on:click={(ev) => props.actions.authenticate(row.name, ev.currentTarget.closest(".mcp-row"))}>{row.auth}</button>
          </Show>
        </div>
      )}
    </For>
  );
}

function AgentRows(props) {
  return (
    <For each={props.rows}>
      {(row) => (
        <div class="mcp-row">
          <span class="nm">{row.name}</span>
          <span class="er" style="color: var(--txt-3)">{row.about}</span>
        </div>
      )}
    </For>
  );
}

const keepKeys = (kev) => kev.stopPropagation();

function ConfigRows(props) {
  const c = () => props.config;
  let free;
  const apply = () => {
    const pair = free.value.trim();
    if (!/^[\w.-]+=/.test(pair)) return;
    props.actions.configLine(pair).then((ok) => {
      if (ok) free.value = "";
    });
  };
  return (
    <>
      <For each={c().rows}>
        {(row) => (
          <div class="cfg-row">
            <div class="ck"><span class="nm">{row.name}</span><span class="ds">{row.about}</span></div>
            <div class="cv">
              <Show when={row.opts} fallback={
                <input class="ci" placeholder="value" on:keydown={(kev) => {
                  keepKeys(kev);
                  const value = kev.currentTarget.value.trim();
                  if (kev.key === "Enter" && value) {
                    kev.preventDefault();
                    props.actions.configSet(row.name, value);
                  }
                }} />
              }>
                <For each={row.opts}>
                  {(opt) => (
                    <button class="co" classList={{ sel: opt.sel }} type="button" data-v={opt.value} on:click={() => props.actions.configSet(row.name, opt.value)}>{opt.value}</button>
                  )}
                </For>
              </Show>
            </div>
          </div>
        )}
      </For>
      <div class="qfree">
        <input ref={free} placeholder={c().freeHint} on:keydown={(kev) => {
          keepKeys(kev);
          if (kev.key === "Enter") {
            kev.preventDefault();
            apply();
          }
        }} />
        <button type="button" class="qgo" on:click={apply}>{c().apply}</button>
      </div>
      <span class="sv-meta">{c().note}</span>
    </>
  );
}

function ContextBody(props) {
  const c = () => props.context;
  return (
    <>
      <div class="bar">
        <For each={c().segments}>{(seg) => <i style={{ width: seg.width, background: seg.tone }} title={seg.title}></i>}</For>
      </div>
      <div class="legend">
        <For each={c().legend}>{(item) => <span><span class="dot" style={{ background: item.tone }}></span>{item.text}</span>}</For>
        <Show when={c().free}><span class="free">{c().free}</span></Show>
      </div>
      <span class="sv-meta">{c().meta}</span>
      <button type="button" class="ctx-go" disabled={c().go.busy} on:click={() => props.actions.compact()}>{c().go.label}</button>
    </>
  );
}

function CommandCard(props) {
  const m = props.model;
  return (
    <div class="sv-cmd">
      <div class="ch"><span>{m.title}</span><button type="button" class="cx" title={m.dismiss} on:click={() => props.actions.dismiss()}>×</button></div>
      <div class="body">
        <Switch>
          <Match when={m.state === "asking"}><span class="sv-meta">{m.asking}</span></Match>
          <Match when={m.state === "warn"}><span class="sv-meta warn">{m.warn}</span></Match>
          <Match when={m.state === "mcp"}><McpRows rows={m.mcp} actions={props.actions} /></Match>
          <Match when={m.state === "agents"}><AgentRows rows={m.agents} /></Match>
          <Match when={m.state === "config"}><ConfigRows config={m.config} actions={props.actions} /></Match>
          <Match when={m.state === "context"}><ContextBody context={m.context} actions={props.actions} /></Match>
        </Switch>
      </div>
    </div>
  );
}

export function commandCardView(initial, actions) {
  const [model, setModel] = createStore(initial);
  let dispose;
  const el = createRoot((done) => {
    dispose = done;
    return <CommandCard model={model} actions={actions} />;
  });
  return {
    el,
    show(next) { setModel(reconcile(next, { key: "key" })); },
    close() {
      dispose();
      el.remove();
    }
  };
}
