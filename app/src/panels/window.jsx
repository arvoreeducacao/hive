import { For, Show } from "solid-js";
import { mountView } from "../view.jsx";

export function Keys(props) {
  return <span class="pw-keys"><For each={props.keys}>{(cap) => <kbd class="rc-key">{cap}</kbd>}</For></span>;
}

export function Icon(props) {
  return <svg aria-hidden="true"><use href={`#${props.id}`} /></svg>;
}

export function Head(props) {
  const h = () => props.head;
  return (
    <header class="pw-head">
      <span class="pw-ico"><Icon id={h().icon} /></span>
      <h2 class="pw-title">{h().title}</h2>
      <Show when={h().count}><span class="pw-count">{h().count}</span></Show>
      <Show when={h().search}>
        <span class="pw-vsep" />
        <label class="pw-search">
          <Icon id="i-mag" />
          <input data-pw-search spellcheck="false" autocomplete="off" placeholder={h().search.placeholder} aria-label={h().search.placeholder}
            value={h().search.value} onInput={(ev) => props.actions.search?.(ev.currentTarget.value)} />
        </label>
      </Show>
      <Show when={!h().search}><span class="pw-grow" /></Show>
      <Show when={h().drop}>
        <label class="pw-drop">
          <select aria-label={h().drop.label} onChange={(ev) => props.actions.drop?.(ev.currentTarget.value)}>
            <For each={h().drop.options}>{(one) => <option value={one.key} selected={one.on}>{one.say}</option>}</For>
          </select>
        </label>
      </Show>
      <For each={h().hints}>{(hint) => <span class="pw-hint"><Keys keys={hint.keys} />{hint.say}</span>}</For>
      <span class="pw-vsep" />
      <button type="button" class="pw-esc" id={h().closeId} aria-label={h().closeSay} title={h().closeSay} onClick={() => props.actions.close()}>esc</button>
    </header>
  );
}

function FootParts(props) {
  const f = () => props.model;
  return (
    <>
      <span class="pw-crumb">
        <Icon id={f().icon} /><span>{f().title}</span>
        <For each={f().trail}>{(bit) => <><span aria-hidden="true">›</span><span class="pw-mono" title={bit}>{bit}</span></>}</For>
      </span>
      <Show when={f().gauge}>
        <span class="pw-gauge" classList={{ full: f().gauge.full }} title={f().gauge.message || undefined}>
          <span>{f().gauge.read}</span><i><b style={{ width: `${f().gauge.slice}%` }} /></i><span>{f().gauge.say}</span>
        </span>
      </Show>
      <span class="pw-grow" />
      <For each={f().acts}>{(act) => (
        <button type="button" class="pw-act" disabled={act.off} onClick={() => props.actions.act(act.key)}>{act.say}<Keys keys={act.keys} /></button>
      )}</For>
      <Show when={f().go}>
        <button type="button" class="pw-go" disabled={f().go.off} onClick={() => props.actions.act(f().go.key)}>{f().go.say}<Keys keys={f().go.keys} /></button>
      </Show>
      <Show when={f().more}>
        <span class="pw-vsep" />
        <button type="button" class="pw-act" data-pw-more aria-haspopup="menu" onClick={() => props.actions.more()}>{f().more.say}<Keys keys={f().more.keys} /></button>
      </Show>
    </>
  );
}

export function Foot(props) {
  return <footer class="pw-foot"><FootParts model={props.foot} actions={props.actions} /></footer>;
}

export function Loading(props) {
  return (
    <div class="pw-loading" role="status">
      <p class="pw-load"><span class="pw-spin" aria-hidden="true" />{props.say}</p>
      <For each={[0, 1, 2, 3, 4, 5]}>{(at) => <div class="pw-skel" aria-hidden="true"><i /><i classList={{ w: at % 2 === 0, s: at % 2 === 1 }} /><i /></div>}</For>
    </div>
  );
}

export function Empty(props) {
  const e = () => props.empty;
  return (
    <div class="pw-empty" role={e().warn ? "alert" : undefined}>
      <span class="pw-ico" classList={{ warn: e().warn }}><Icon id={e().icon} /></span>
      <h3>{e().head}</h3>
      <Show when={e().say}><p>{e().say}</p></Show>
      <Show when={e().paste}>
        <label class="pw-paste">
          <Icon id={e().icon} />
          <input data-pw-paste spellcheck="false" autocomplete="off" placeholder={e().paste.placeholder} aria-label={e().paste.placeholder}
            onKeyDown={(ev) => { if (ev.key === "Enter") props.actions?.paste?.(ev.currentTarget.value); }} />
          <Keys keys={e().paste.keys} />
        </label>
      </Show>
      <Show when={e().detail}>
        <p class="pw-err"><span title={e().detail}>{e().detail}</span>
          <button type="button" class="pw-copy" aria-label={e().copySay} title={e().copySay} onClick={(ev) => props.actions?.copy?.(ev.currentTarget, e().detail)}><Icon id="i-copy" /></button></p>
      </Show>
      <Show when={e().tips?.length}>
        <div class="pw-tips"><For each={e().tips}>{(tip) => <span><Keys keys={tip.keys} />{tip.say}</span>}</For></div>
      </Show>
    </div>
  );
}

export function mountFoot(host, extras) {
  return mountView(host, FootParts, { icon: "i-grid", title: "", trail: [], acts: [] }, extras);
}
