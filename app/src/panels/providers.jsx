import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";

function Mark(props) {
  return (
    <span class="pv-mark" style={{ "--pv-color": props.color }}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><use href={`#i-${props.icon}`} /></svg>
    </span>
  );
}

function Switch(props) {
  return (
    <button type="button" class="pv-switch" role="switch" aria-checked={String(props.on)} aria-label={props.label} title={props.title} disabled={props.can === false}
      data-pv-toggle={props.id} onClick={(ev) => { ev.stopPropagation(); props.actions.toggle(props.id, !props.on); }}>
      <i class="tog" aria-hidden="true"></i>
    </button>
  );
}

function Item(props) {
  return (
    <button type="button" class="pv-item" classList={{ here: props.row.here, off: !props.row.enabled, missing: !props.row.installed }}
      data-pv-item={props.row.id} onClick={() => props.actions.select(props.row.id)}>
      <Mark icon={props.row.id} color={props.row.color} />
      <span class="pv-item-body">
        <span class="pv-item-top">
          <b>{props.row.name}</b>
          <Show when={props.row.version}><span class="chip" classList={{ behind: props.row.behind }}>{props.row.version}</span></Show>
        </span>
        <small classList={{ ok: props.row.tone === "ok", warn: props.row.tone === "warn", dim: props.row.tone === "dim" }}>{props.row.status}</small>
      </span>
      <Switch id={props.row.id} on={props.row.toggleOn} can={props.row.canToggle} label={props.row.toggleSay} title={props.row.toggleTitle} actions={props.actions} />
    </button>
  );
}

function AccountRow(props) {
  return (
    <div class="acc-row pv-acc" classList={{ out: !props.row.loggedIn }} data-pv-account={props.row.name}>
      <div class="pv-acc-order">
        <button class="nbtn tiny" data-pv-up={props.row.name} disabled={!props.row.canUp} title={props.row.upSay} onClick={() => props.actions.move(props.row.name, -1)}>↑</button>
        <button class="nbtn tiny" data-pv-down={props.row.name} disabled={!props.row.canDown} title={props.row.downSay} onClick={() => props.actions.move(props.row.name, 1)}>↓</button>
      </div>
      <div class="pv-acc-body">
        <b>{props.row.name}<Show when={props.row.first}> <span class="wt-badge live">{props.row.firstSay}</span></Show><Show when={props.row.inUse}> <span class="wt-badge">{props.row.inUseSay}</span></Show></b>
        <small class={props.row.loggedIn ? "" : "out"}>{props.row.said}</small>
        <Show when={props.row.room}><small class="out">{props.row.room}</small></Show>
      </div>
      <div class="acc-acts">
        <Show when={props.row.canSignIn}>
          <button class="acc-drop" data-pv-signin={props.row.name} onClick={() => props.actions.signIn(props.row.name)}>{props.row.signInSay}</button>
        </Show>
        <Show when={props.row.canRemove} fallback={<Show when={props.row.isDefault}><span class="acct">{props.row.defaultSay}</span></Show>}>
          <button class="acc-drop" data-pv-remove={props.row.name} onClick={() => props.actions.remove(props.row.name)}>{props.row.removeSay}</button>
        </Show>
      </div>
    </div>
  );
}

function Accounts(props) {
  return (
    <div class="pv-accounts">
      <p class="panel-sub">{props.tab.sub}</p>
      <div class="acc-list"><For each={props.tab.rows}>{(row) => <AccountRow row={row} actions={props.actions} />}</For></div>
      <div id="pv-add" data-no-t></div>
      <div id="pv-login" data-no-t></div>
    </div>
  );
}

function Configuration(props) {
  return (
    <div class="pv-config">
      <p class="panel-sub">{props.tab.sub}</p>
      <div id="pv-form" data-no-t></div>
    </div>
  );
}

function Models(props) {
  return (
    <div class="pv-models">
      <p class="panel-sub">{props.tab.sub}</p>
      <Show when={!props.tab.hint} fallback={<p class="wt-none">{props.tab.hint}</p>}>
        <For each={props.tab.groups}>{(group) => (
          <div class="pv-group">
            <Show when={group.name}><p class="cap">{group.name}</p></Show>
            <For each={group.rows}>{(row) => (
              <div class="pv-model" classList={{ chosen: row.isDefault }}>
                <b>{row.label}</b>
                <Show when={row.isDefault}><span class="wt-badge live">{row.defaultSay}</span></Show>
                <Show when={row.context}><span class="chip">{row.context}</span></Show>
                <small>{row.description || row.value}</small>
              </div>
            )}</For>
          </div>
        )}</For>
      </Show>
    </div>
  );
}

function Detail(props) {
  return (
    <div class="pv-detail">
      <div class="pv-head">
        <Mark icon={props.detail.id} color={props.detail.color} />
        <div class="pv-head-say">
          <h2>{props.detail.name}<Show when={props.detail.version}> <span class="chip" classList={{ behind: props.detail.behind }}>{props.detail.version}</span></Show></h2>
          <p classList={{ ok: props.detail.tone === "ok", warn: props.detail.tone === "warn" }}>{props.detail.who}</p>
          <Show when={props.detail.update}>
            <p class="pv-update" classList={{ busy: props.detail.update.busy }} data-no-t>
              <Show when={props.detail.update.say}><span>{props.detail.update.say}</span></Show>
              <Show when={props.detail.update.go}>
                <button type="button" class="nbtn" data-pv-update={props.detail.id} onClick={() => props.actions.update(props.detail.id)}>{props.detail.update.go}</button>
              </Show>
              <Show when={props.detail.update.said}><small>{props.detail.update.said}</small></Show>
            </p>
          </Show>
        </div>
        <div class="pv-head-acts">
          <span class="pv-checked" title={props.detail.checkedTitle}>{props.detail.checked}</span>
          <button class="nbtn" data-pv-check="1" title={props.detail.checkTitle} onClick={() => props.actions.check()}>{props.detail.checkSay}</button>
          <Switch id={props.detail.id} on={props.detail.toggleOn} can={props.detail.canToggle} label={props.detail.toggleSay} title={props.detail.toggleTitle} actions={props.actions} />
        </div>
      </div>
      <div class="pv-tabs" role="tablist">
        <For each={props.detail.tabs}>{(tab) => (
          <button type="button" role="tab" class="pv-tab" classList={{ on: tab.on }} aria-selected={String(tab.on)} data-pv-tab={tab.key} onClick={() => props.actions.tab(tab.key)}>
            {tab.label}<Show when={tab.count !== ""}><span class="pv-count">{tab.count}</span></Show>
          </button>
        )}</For>
      </div>
      <div class="pv-body">
        <Show when={props.detail.tab === "accounts"}><Accounts tab={props.detail.accounts} actions={props.actions} /></Show>
        <Show when={props.detail.tab === "configuration"}><Configuration tab={props.detail.configuration} /></Show>
        <Show when={props.detail.tab === "models"}><Models tab={props.detail.models} /></Show>
      </div>
    </div>
  );
}

function Providers(props) {
  return (
    <Show when={!props.model.trouble} fallback={<><div class="usage-top"><h2>{props.model.title}</h2></div><p class="usage-note">{props.model.trouble}</p></>}>
      <div class="pv-list">
        <div class="pv-list-top"><h2>{props.model.title}</h2><span class="hint">{props.model.sub}</span></div>
        <For each={props.model.rows}>{(row) => <Item row={row} actions={props.actions} />}</For>
        <p class="pv-foot" innerHTML={props.model.foot} />
      </div>
      <Show when={props.model.detail} fallback={<div class="pv-detail"><p class="wt-none">{props.model.none}</p></div>}>
        <Detail detail={props.model.detail} actions={props.actions} />
      </Show>
    </Show>
  );
}

export function mountProviders(host, extras) {
  return mountView(host, Providers, { trouble: "", title: "", sub: "", foot: "", none: "", rows: [], detail: null }, extras);
}
