import { For, Show } from "solid-js";
import { mountView } from "./view.jsx";

function Copied(props) {
  return <span class="cd-copied"><svg aria-hidden="true"><use href="#i-check" /></svg>{props.said}</span>;
}

function Eyebrow(props) {
  return (
    <div class="i-eh">
      <span>{props.text}</span>
      <Show when={props.count}><span class="c">{props.count}</span></Show>
      <Show when={props.children}>{props.children}</Show>
    </div>
  );
}

export function InfoWhere(props) {
  return (
    <Show when={props.model}>
      {(where) => (
        <section class="i-sec i-where">
          <Eyebrow text={where().heading} />
          <For each={where().rows}>{(row) => (
            <div class="i-kv" title={row.full}>
              <span class="k">{row.label}</span>
              <span class="v">{row.value}</span>
              <Show when={row.copied} fallback={
                <button class="i-cpy" aria-label={`${row.copy} ${row.label}`} title={row.copy}
                  onClick={(ev) => { ev.stopPropagation(); props.actions.copy(row.key, row.full); }}><svg aria-hidden="true"><use href="#i-copy" /></svg></button>
              }><Copied said={props.copied} /></Show>
            </div>
          )}</For>
        </section>
      )}
    </Show>
  );
}

function ChangeRow(props) {
  return (
    <button class="cd-row" classList={{ on: props.row.on, done: props.row.reviewed }} title={props.row.path} data-path={props.row.path}
      onClick={(ev) => { ev.stopPropagation(); props.actions.showDiff(props.row.path); }}>
      <span class="stl" data-letter={props.row.letter}>{props.row.letter}</span>
      <span class="pth">{props.row.dir}<b>{props.row.leaf}</b></span>
      <span class="cnt">
        <Show when={props.row.added}><span class="plus">{props.row.added}</span></Show>
        <Show when={props.row.removed}><span class="minus">{props.row.removed}</span></Show>
        <Show when={props.row.binary}><span class="minus">{props.row.binary}</span></Show>
      </span>
      <Show when={props.row.reviewed}><svg class="ok" aria-hidden="true"><use href="#i-check" /></svg></Show>
    </button>
  );
}

export function InfoChanges(props) {
  return (
    <Show when={props.model}>
      {(changes) => (
        <>
          <section class="i-sec i-changes" data-state={changes().state}>
            <Eyebrow text={changes().heading}>
              <Show when={changes().count}>
                <span class="c"><span class="plus">{changes().count.added}</span> <span class="minus">{changes().count.removed}</span></span>
              </Show>
            </Eyebrow>
            <Show when={changes().state === "loading"}>
              <div class="cd-sk" aria-label={changes().loading}><i /><i /><i /></div>
            </Show>
            <Show when={changes().unread}><p class="i-note">{changes().unread}</p></Show>
            <Show when={changes().empty}>
              {(empty) => (
                <div class="cd-empty">
                  <span class="t"><svg aria-hidden="true"><use href="#i-check" /></svg>{empty().title}</span>
                  <span class="s">{empty().text}</span>
                  <span class="m">{empty().meta}</span>
                </div>
              )}
            </Show>
            <Show when={changes().gone}>
              {(gone) => (
                <div class="cd-err">
                  <span class="hd"><svg aria-hidden="true"><use href="#i-warn" /></svg>{gone().title}</span>
                  <span class="bd">{gone().path}</span>
                  <span class="bd">{gone().text}</span>
                  <span class="acts">
                    <button class="cd-btn ghost sm" onClick={(ev) => { ev.stopPropagation(); props.actions.copy("gone", gone().full); }}>{gone().copy}</button>
                    <Show when={gone().copied}><Copied said={props.copied} /></Show>
                  </span>
                </div>
              )}
            </Show>
            <div class="cd-list"><For each={changes().rows}>{(row) => <ChangeRow row={row} actions={props.actions} />}</For>
              <Show when={changes().more}>
                <button class="cd-row cd-more" onClick={(ev) => { ev.stopPropagation(); props.actions.showAll(); }}>{changes().more}</button>
              </Show>
            </div>
          </section>
          <Show when={changes().ahead}>
            {(ahead) => (
              <section class="i-sec i-ahead">
                <Eyebrow text={ahead().heading} count={ahead().count} />
                <For each={ahead().rows}>{(row) => (
                  <div class="i-commit">
                    <span class="sha">{row.sha}</span>
                    <span class="sub" title={row.subject}>{row.subject}</span>
                    <Show when={row.copied} fallback={
                      <button class="i-cpy" aria-label={row.copy} title={row.copy}
                        onClick={(ev) => { ev.stopPropagation(); props.actions.copySha(row.sha); }}><svg aria-hidden="true"><use href="#i-copy" /></svg></button>
                    }><Copied said={props.copied} /></Show>
                  </div>
                )}</For>
              </section>
            )}
          </Show>
          <Show when={changes().progress}>
            {(progress) => (
              <section class="i-sec i-progress">
                <Eyebrow text={progress().heading} />
                <span class="cd-bar"><i style={{ width: `${progress().pct}%` }} /></span>
                <span class="i-line"><span>{progress().text}</span><span class="r">{progress().hint}</span></span>
              </section>
            )}
          </Show>
        </>
      )}
    </Show>
  );
}

export function InfoLast(props) {
  return (
    <Show when={props.model}>
      {(last) => (
        <section class="i-sec i-last">
          <Eyebrow text={last().heading} />
          <Show when={last().meta}><span class="i-meta">{last().meta}</span></Show>
          <Show when={last().ctx}>
            {(ctx) => (
              <span class="i-ctx">
                <span class="cd-bar"><i style={{ width: `${ctx().pct}%` }} /></span>
                <span class="tx">{ctx().text}</span>
                <Show when={ctx().compact}>
                  <button class="rc-badge mono i-compact" title={ctx().compactHint}
                    onClick={(ev) => { ev.stopPropagation(); props.actions.compact(); }}>{ctx().compact}</button>
                </Show>
              </span>
            )}
          </Show>
        </section>
      )}
    </Show>
  );
}

function InfoActions(props) {
  return (
    <Show when={props.model}>
      {(acts) => (
        <div class="actions i-acts">
          <button class="btn b-back" onClick={(ev) => { ev.stopPropagation(); props.actions.back(); }}>{acts().back}<span class="rc-key">{acts().backKey}</span></button>
          <button class="btn b-reconnect" onClick={(ev) => { ev.stopPropagation(); props.actions.reconnect(); }}>{acts().reconnect}<span class="rc-key">{acts().reconnectKey}</span></button>
          <button class="btn b-kill" onClick={(ev) => { ev.stopPropagation(); props.actions.close(ev.currentTarget.getBoundingClientRect()); }}>{acts().kill}<span class="rc-key">{acts().killKey}</span></button>
        </div>
      )}
    </Show>
  );
}

function InfoColumn(props) {
  return (
    <>
      <InfoWhere model={props.model.where} copied={props.model.copied} actions={props.actions} />
      <InfoChanges model={props.model.changes} copied={props.model.copied} actions={props.actions} />
      <InfoLast model={props.model.last} actions={props.actions} />
      <InfoActions model={props.model.acts} actions={props.actions} />
    </>
  );
}

export function mountInfoColumn(host, initial, actions) {
  return mountView(host, InfoColumn, initial, { actions });
}

function DiffLine(props) {
  return (
    <div class={`cd-dl ${props.row.kind}`}>
      <span class="n">{props.row.old}</span>
      <span class="n">{props.row.new}</span>
      <span class="g">{props.row.sign}</span>
      <span class="c">{props.row.text}</span>
    </div>
  );
}

function DiffWindow(props) {
  const m = () => props.model;
  return (
    <>
      <header class="cd-head">
        <Show when={m().letter}><span class="stl" data-letter={m().letter}>{m().letter}</span></Show>
        <span class="path" title={m().full}>{m().dir}<b>{m().leaf}</b></span>
        <button class="cd-icon" aria-label={m().copyHint} title={m().copyHint} onClick={() => props.actions.copyPath()}>
          <svg aria-hidden="true"><use href="#i-copy" /></svg>
        </button>
        <Show when={m().copied}><Copied said={m().copiedSaid} /></Show>
        <span class="sp" />
        <button class="cd-btn ghost cd-editor" title={m().editorHint} onClick={() => props.actions.editor()}>
          <svg aria-hidden="true"><use href="#i-file" /></svg>{m().editor}<span class="rc-key">{m().editorKey}</span>
        </button>
        <button class="cd-btn primary cd-accept" classList={{ on: m().acceptOn }} aria-pressed={m().acceptOn ? "true" : "false"} title={m().acceptHint}
          onClick={() => props.actions.accept()}>
          <svg aria-hidden="true"><use href="#i-check" /></svg>{m().accept}<span class="rc-key">{m().acceptKey}</span>
        </button>
        <button class="cd-icon" aria-label={m().close} title={m().close} onClick={() => props.actions.close()}>
          <svg aria-hidden="true"><use href="#i-close" /></svg>
        </button>
      </header>
      <Show when={m().trouble}>
        {(trouble) => (
          <div class="cd-err cd-trouble">
            <span class="hd"><svg aria-hidden="true"><use href="#i-warn" /></svg>{trouble().title}</span>
            <span class="bd">{trouble().why}</span>
            <span class="acts">
              <Show when={!trouble().discard}><button class="cd-btn ghost sm" onClick={() => props.actions.retry()}>{trouble().retry}</button></Show>
              <button class="cd-btn quiet sm" onClick={() => props.actions.copyPath()}>{trouble().copy}<span class="rc-key">{trouble().copyKey}</span></button>
            </span>
          </div>
        )}
      </Show>
      <div class="cd-body" data-state={m().state}>
        <Show when={m().state === "loading"}>
          <div class="cd-sk wide" aria-label={m().loading}><i /><i /><i /><i /><span>{m().loading}</span></div>
        </Show>
        <Show when={m().binary}>
          {(binary) => (
            <div class="cd-center">
              <span class="cd-circle"><svg aria-hidden="true"><use href="#i-image" /></svg></span>
              <span class="t">{binary().title}</span>
              <span class="m">{binary().sizes}</span>
            </div>
          )}
        </Show>
        <Show when={m().empty}><div class="cd-center"><span class="s">{m().empty}</span></div></Show>
        <Show when={m().rows.length}>
          <div class="cd-diff"><For each={m().rows}>{(row) => <DiffLine row={row} />}</For>
            <Show when={m().more}><div class="cd-dl more"><span class="n" /><span class="n" /><span class="g" /><span class="c">{m().more}</span></div></Show>
          </div>
        </Show>
      </div>
      <footer class="cd-foot">
        <span class="at">{m().foot.at}</span>
        <For each={m().foot.keys}>{(one) => (
          <span class="kr"><For each={one.caps}>{(cap) => <span class="rc-key">{cap}</span>}</For>{one.said}</span>
        )}</For>
        <button class="cd-discard" onClick={(ev) => props.actions.discard(ev.currentTarget.getBoundingClientRect())}>
          <span class="rc-key">{m().foot.discardKey}</span>{m().foot.discard}
        </button>
      </footer>
    </>
  );
}

export function mountDiffWindow(host, initial, actions) {
  return mountView(host, DiffWindow, initial, { actions });
}
