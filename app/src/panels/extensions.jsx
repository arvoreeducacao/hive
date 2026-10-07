import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";

function Mark(props) {
  return (
    <span class="pv-mark ex-mark" classList={{ "ex-logo": !!props.logo, big: !!props.big }} style={{ "--pv-color": props.color }} aria-hidden="true">
      <Show when={props.logo} fallback={<Show when={props.icon} fallback={props.text}><svg viewBox="0 0 16 16" aria-hidden="true"><use href={`#${props.icon}`} /></svg></Show>}>
        <img src={props.logo} alt="" />
      </Show>
    </span>
  );
}

function ViewTabs(props) {
  return (
    <div class="ex-views" role="tablist" aria-label={props.label}>
      <For each={props.tabs}>{(tab) => (
        <button type="button" role="tab" class="ex-view" classList={{ on: tab.on }} aria-selected={String(tab.on)} data-ex-view={tab.key} onClick={() => props.actions.view(tab.key)}>{tab.label}</button>
      )}</For>
    </div>
  );
}

function Card(props) {
  return (
    <div class="ex-card" classList={{ dim: props.card.state === "newer" }} data-ex-card={props.card.name}>
      <button type="button" class="ex-card-open" onClick={() => props.actions.card(props.card.name)}>
        <span class="ex-card-top">
          <Mark text={props.card.mark} logo={props.card.logo} color="var(--txt-2)" />
          <b>{props.card.title}</b>
          <Show when={props.card.chip}><span class="chip ex-chip-ok">{props.card.chip}</span></Show>
        </span>
        <span class="ex-card-say">{props.card.description}</span>
        <span class="ex-tags"><For each={props.card.tags}>{(tag) => <span class="chip">{tag}</span>}</For></span>
      </button>
      <span class="ex-card-foot">
        <span class="ex-version">{props.card.version ? `v${props.card.version}` : ""}</span>
        <button type="button" class="nbtn ex-act" classList={{ main: props.card.primary }} disabled={props.card.disabled} title={props.card.newerSay || undefined} data-ex-act={props.card.name}
          onClick={() => (props.card.primary ? props.actions.install(props.card.name) : props.actions.card(props.card.name))}>{props.card.action}</button>
      </span>
    </div>
  );
}

function CatalogDetail(props) {
  const d = () => props.detail;
  return (
    <div class="ex-cdetail">
      <button type="button" class="nbtn ex-back" data-ex-back="1" onClick={() => props.actions.back()}>{d().back}</button>
      <div class="pv-head">
        <Mark text={d().mark} logo={d().logo} color="var(--txt-2)" big />
        <div class="pv-head-say">
          <h2>{d().title}<Show when={d().version}> <span class="chip">{d().version}</span></Show></h2>
          <p>{d().where}</p>
        </div>
        <div class="pv-head-acts">
          <button type="button" class="nbtn ex-act" classList={{ main: d().primary }} disabled={d().disabled} title={d().newerSay || undefined} data-ex-install={d().name}
            onClick={() => (d().primary ? props.actions.install(d().name) : props.actions.card(d().name))}>{d().action}</button>
        </div>
      </div>
      <p class="panel-sub ex-cdesc">{d().description}</p>
      <Show when={d().newerSay}><p class="ex-problem">{d().newerSay}</p></Show>
      <Show when={d().can.length}>
        <p class="ex-cap ex-cap-in">{d().canCap}</p>
        <ul class="ex-can"><For each={d().can}>{(line) => <li>{line}</li>}</For></ul>
      </Show>
      <p class="ex-trust">{d().trust}</p>
    </div>
  );
}

function Store(props) {
  const m = () => props.store;
  return (
    <div class="ex-store">
      <div class="ex-store-top">
        <h2>{props.title}</h2>
        <ViewTabs tabs={props.tabs} actions={props.actions} label={props.title} />
        <Show when={!m().detail}>
          <input class="ex-search" type="search" value={m().query} placeholder={m().searchSay} aria-label={m().searchSay} spellcheck={false} data-ex-search="1"
            onInput={(ev) => props.actions.search(ev.currentTarget.value)} />
        </Show>
      </div>
      <Show when={m().trouble}>
        <div class="ex-problem ex-trouble"><span>{m().trouble}</span> <button type="button" class="nbtn" data-ex-retry="1" onClick={() => props.actions.retry()}>{m().retry}</button></div>
      </Show>
      <Show when={m().warning}><p class="ex-none">{m().warning}</p></Show>
      <Show when={m().detail} fallback={
        <Show when={!m().loading} fallback={<p class="wt-none">{m().loadingSay}</p>}>
          <Show when={m().cards.length} fallback={<p class="ex-empty">{m().none}</p>}>
            <Show when={m().all}><p class="ex-empty">{m().none}</p></Show>
            <div class="ex-grid"><For each={m().cards}>{(card) => <Card card={card} actions={props.actions} />}</For></div>
          </Show>
          <p class="ex-none ex-foot">{m().foot}</p>
        </Show>
      }>
        <CatalogDetail detail={m().detail} actions={props.actions} />
      </Show>
    </div>
  );
}

function Uninstall(props) {
  const u = () => props.uninstall;
  return (
    <div class="ex-danger" data-ex-uninstall-zone={u().name}>
      <p class="ex-cap ex-cap-in">{u().cap}</p>
      <p class="panel-sub">{u().say}</p>
      <Show when={u().confirm} fallback={
        <button type="button" class="nbtn ex-bad" disabled={u().busy} data-ex-uninstall={u().name} onClick={() => props.actions.uninstall(u().name)}>{u().busy ? u().busySay : u().button}</button>
      }>
        <div class="ex-confirm" role="alertdialog" aria-label={u().confirm.title}>
          <b>{u().confirm.title}</b>
          <p class="panel-sub">{u().confirm.body}</p>
          <label class="ex-forget"><input type="checkbox" checked={u().confirm.forget} data-ex-forget="1" onChange={(ev) => props.actions.forget(ev.currentTarget.checked)} /> {u().confirm.forgetSay}</label>
          <Show when={!u().confirm.forget}><small class="hint">{u().confirm.keepSay}</small></Show>
          <span class="ex-confirm-acts">
            <button type="button" class="nbtn" data-ex-cancel="1" onClick={() => props.actions.cancel()}>{u().confirm.cancel}</button>
            <button type="button" class="nbtn ex-bad go" data-ex-confirm="1" onClick={() => props.actions.confirm()}>{u().confirm.go}</button>
          </span>
        </div>
      </Show>
    </div>
  );
}

function Switch(props) {
  return (
    <button type="button" class="pv-switch" role="switch" aria-checked={String(props.on)} aria-label={props.label} title={props.title} disabled={props.can === false}
      data-ex-toggle={props.name} onClick={(ev) => { ev.stopPropagation(); props.actions.toggle(props.name, !props.on); }}>
      <i class="tog" aria-hidden="true"></i>
    </button>
  );
}

function Item(props) {
  return (
    <button type="button" class="pv-item" classList={{ here: props.row.here, off: !props.row.on && !props.row.trouble, missing: props.row.trouble }}
      data-ex-item={props.row.key} onClick={() => props.actions.select(props.row.key)}>
      <Mark text={props.row.mark} icon={props.row.icon} logo={props.row.logo} color={props.row.color} />
      <span class="pv-item-body">
        <span class="pv-item-top">
          <b>{props.row.title}</b>
          <Show when={props.row.chip}><span class="chip">{props.row.chip}</span></Show>
        </span>
        <small classList={{ ok: props.row.tone === "ok", warn: props.row.tone === "warn", dim: props.row.tone === "dim" }}>{props.row.status}</small>
      </span>
      <Switch name={props.row.name} on={props.row.toggleOn} can={props.row.canToggle} label={props.row.toggleSay} title={props.row.toggleTitle} actions={props.actions} />
    </button>
  );
}

function Overview(props) {
  return (
    <div class="ex-overview">
      <p class="panel-sub">{props.tab.description}</p>
      <dl class="ex-kv">
        <For each={props.tab.rows}>{(row) => <><dt>{row.label}</dt><dd classList={{ mono: row.mono }}>{row.value}</dd></>}</For>
      </dl>
    </div>
  );
}

function Field(props) {
  const id = () => `ex-set-${props.field.key}`;
  const change = (ev) => {
    const raw = ev.currentTarget.value;
    if (props.field.type === "number" && (raw.trim() === "" || Number.isNaN(Number(raw)))) { ev.currentTarget.value = String(props.field.value); return; }
    if (props.field.type === "password" && raw === "") return;
    props.actions.setting(props.name, props.field.key, props.field.type === "number" ? Number(raw) : raw);
    if (props.field.type === "password") ev.currentTarget.value = "";
  };
  return (
    <div class="pv-add-row ex-field" classList={{ missing: props.field.missing }}>
      <div>
        <label for={id()}>{props.field.label}<Show when={props.field.required}> <span class="ex-required" aria-hidden="true">*</span></Show></label>
        <Show when={props.field.type === "boolean"}>
          <button type="button" id={id()} class="pv-switch" role="switch" aria-checked={String(props.field.value)} aria-label={props.field.label} aria-required={props.field.required ? "true" : undefined} aria-describedby={props.field.description ? `${id()}-say` : undefined}
            data-ex-setting={props.field.key} onClick={() => props.actions.setting(props.name, props.field.key, !props.field.value)}>
            <i class="tog" aria-hidden="true"></i>
          </button>
        </Show>
        <Show when={props.field.type === "dropdown"}>
          <select id={id()} data-ex-setting={props.field.key} aria-required={props.field.required ? "true" : undefined} aria-invalid={props.field.missing ? "true" : undefined} aria-describedby={props.field.description || props.field.missing ? `${id()}-say` : undefined} onChange={change}>
            <For each={props.field.data}>{(row) => <option value={row.value} selected={row.value === props.field.value}>{row.title}</option>}</For>
          </select>
        </Show>
        <Show when={props.field.type !== "boolean" && props.field.type !== "dropdown"}>
          <input id={id()} type={props.field.type === "number" ? "number" : props.field.type === "password" ? "password" : "text"} value={String(props.field.value)} placeholder={props.field.placeholder}
            autocomplete={props.field.type === "password" ? "new-password" : "off"} spellcheck={false} aria-required={props.field.required ? "true" : undefined} aria-invalid={props.field.missing ? "true" : undefined} aria-describedby={props.field.description || props.field.missing ? `${id()}-say` : undefined}
            data-ex-setting={props.field.key} onChange={change} />
        </Show>
        <Show when={props.field.description || props.field.missing}><small class="hint ex-say" id={`${id()}-say`}>{props.field.description || props.field.requiredSay}</small></Show>
      </div>
    </div>
  );
}

function Settings(props) {
  return (
    <div class="ex-settings">
      <p class="panel-sub">{props.tab.sub}</p>
      <Show when={props.tab.fields.length} fallback={<p class="wt-none">{props.tab.none}</p>}>
        <For each={props.tab.fields}>{(field) => <Field field={field} name={props.name} actions={props.actions} />}</For>
      </Show>
      <Show when={props.tab.uninstall}><Uninstall uninstall={props.tab.uninstall} actions={props.actions} /></Show>
    </div>
  );
}

function Problems(props) {
  return (
    <div class="ex-problems">
      <Show when={props.tab.rows.length} fallback={<p class="wt-none">{props.tab.none}</p>}>
        <For each={props.tab.rows}>{(row) => <p class="ex-problem">{row}</p>}</For>
        <p class="panel-sub">{props.tab.sub}</p>
      </Show>
    </div>
  );
}

function Detail(props) {
  return (
    <div class="pv-detail">
      <div class="pv-head">
        <Mark text={props.detail.mark} icon={props.detail.icon} logo={props.detail.logo} color={props.detail.color} big />
        <div class="pv-head-say">
          <h2>{props.detail.title}<Show when={props.detail.chip}> <span class="chip">{props.detail.chip}</span></Show><Show when={props.detail.version}> <span class="chip">{props.detail.version}</span></Show></h2>
          <p classList={{ ok: props.detail.tone === "ok", warn: props.detail.tone === "warn" }}>{props.detail.who}</p>
        </div>
        <div class="pv-head-acts">
          <button class="nbtn" data-ex-check="1" title={props.detail.checkTitle} onClick={() => props.actions.check()}>{props.detail.checkSay}</button>
          <Switch name={props.detail.name} on={props.detail.toggleOn} can={props.detail.canToggle} label={props.detail.toggleSay} title={props.detail.toggleTitle} actions={props.actions} />
        </div>
      </div>
      <div class="pv-tabs" role="tablist">
        <For each={props.detail.tabs}>{(tab) => (
          <button type="button" role="tab" id={`ex-tab-${tab.key}`} aria-controls="ex-tabpanel" class="pv-tab" classList={{ on: tab.on }} aria-selected={String(tab.on)} tabindex={tab.on ? 0 : -1} data-ex-tab={tab.key}
            onClick={() => props.actions.tab(tab.key)}
            onKeyDown={(ev) => { const keys = props.detail.tabs.map((one) => one.key); const at = keys.indexOf(tab.key); const next = ev.key === "ArrowRight" ? keys[(at + 1) % keys.length] : ev.key === "ArrowLeft" ? keys[(at - 1 + keys.length) % keys.length] : ""; if (next) { ev.preventDefault(); props.actions.tab(next); } }}>
            {tab.label}<Show when={tab.count !== ""}><span class="pv-count">{tab.count}</span></Show>
          </button>
        )}</For>
      </div>
      <div class="pv-body" role="tabpanel" id="ex-tabpanel" aria-labelledby={`ex-tab-${props.detail.tab}`}>
        <Show when={props.detail.tab === "overview"}><Overview tab={props.detail.overview} /></Show>
        <Show when={props.detail.tab === "settings"}><Settings tab={props.detail.settings} name={props.detail.name} actions={props.actions} /></Show>
        <Show when={props.detail.tab === "problems"}><Problems tab={props.detail.problems} /></Show>
      </div>
    </div>
  );
}

function Extensions(props) {
  return (
    <Show when={!props.model.trouble} fallback={<><div class="usage-top"><h2>{props.model.title}</h2></div><p class="usage-note">{props.model.trouble}</p></>}>
     <Show when={props.model.view !== "explore"} fallback={<Store store={props.model.store} tabs={props.model.tabs} title={props.model.title} actions={props.actions} />}>
      <div class="pv-list">
        <div class="pv-list-top"><h2>{props.model.title}</h2><ViewTabs tabs={props.model.tabs} actions={props.actions} label={props.model.title} /><span class="hint">{props.model.sub}</span></div>
        <For each={props.model.groups}>{(group) => (
          <>
            <p class="ex-cap">{group.label}</p>
            <Show when={!group.rows.length}><p class="ex-none">{group.none}</p></Show>
            <For each={group.rows}>{(row) => <Item row={row} actions={props.actions} />}</For>
          </>
        )}</For>
        <p class="pv-foot">{props.model.foot}</p>
      </div>
      <Show when={props.model.detail} fallback={<div class="pv-detail"><p class="wt-none">{props.model.none}</p></div>}>
        <Detail detail={props.model.detail} actions={props.actions} />
      </Show>
     </Show>
    </Show>
  );
}

export function mountExtensions(host, extras) {
  return mountView(host, Extensions, { trouble: "", title: "", sub: "", foot: "", none: "", groups: [], detail: null, view: "installed", tabs: [], store: null }, extras);
}
