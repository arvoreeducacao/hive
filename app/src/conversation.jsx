import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { phrase, spokenNow } from "/assets/i18n.mjs";
import { nextHive, raycast } from "./raycast.js";
import { mountView } from "./view.jsx";
import { ansiSpans, clockOf, fullTimeOf, liveThoughtLine, workingSays } from "./app/timeline-rows.js";
import { jsonSpans } from "./app/tool-inspector.js";

function Raw(props) {
  const hold = document.createElement("div");
  hold.innerHTML = props.html ?? "";
  props.wire?.(hold);
  return [...hold.childNodes];
}

function Icon(props) {
  return <svg class={props.class} aria-hidden="true"><use href={`#${props.glyph}`} /></svg>;
}

const TL_ICONS = {
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  pen: '<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>',
  terminal: '<path d="M12 19h8"/><path d="m4 17 6-6-6-6"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  brain: '<path d="M12 18V5"/><path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4"/><path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5"/><path d="M17.997 5.125a4 4 0 0 1 2.526 5.77"/><path d="M18 18a4 4 0 0 0 2-7.464"/><path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517"/><path d="M6 18a4 4 0 0 1-2-7.464"/><path d="M6.003 5.125a4 4 0 0 0-2.526 5.77"/>',
  hammer: '<path d="m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  alarm: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/><path d="M6.38 18.7 4 21"/><path d="M17.64 18.67 20 21"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  working: '<path d="M10.1 2.182a10 10 0 0 1 3.8 0"/><path d="M13.9 21.818a10 10 0 0 1-3.8 0"/><path d="M17.609 3.721a10 10 0 0 1 2.69 2.7"/><path d="M2.182 13.9a10 10 0 0 1 0-3.8"/><path d="M20.279 17.609a10 10 0 0 1-2.7 2.69"/><path d="M21.818 10.1a10 10 0 0 1 0 3.8"/><path d="M3.721 6.391a10 10 0 0 1 2.7-2.69"/><path d="M6.391 20.279a10 10 0 0 1-2.69-2.7"/>'
};

function TlIcon(props) {
  return <svg class={`tl-i${props.class ? ` ${props.class}` : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" innerHTML={TL_ICONS[props.name] || TL_ICONS.hammer} />;
}

const gone = new Set();

function Favicon(props) {
  const [failed, setFailed] = createSignal(gone.has(props.src));
  return (
    <Show when={!failed()} fallback={props.fallback}>
      <img class={props.class} src={props.src} alt="" width="16" height="16" loading="lazy" decoding="async" referrerpolicy="no-referrer" on:error={() => { gone.add(props.src); setFailed(true); }} />
    </Show>
  );
}

function TlTime(props) {
  return <Show when={props.at}><span class="tl-time" title={fullTimeOf(props.at, spokenNow())}>{clockOf(Number(props.at), phrase)}</span></Show>;
}

/* the stamp is not the component's: a hover paints it straight into the block, and a run that
   grows takes it off the one that no longer ends the run. so the block keeps whatever was hung on
   it, and lets go of it the moment the model says this is no longer the tail. */
function keepsTheStamp(el, block) {
  createEffect(() => {
    if (block.stamped) return;
    el.classList.remove("lit");
    el.querySelector(":scope > .sv-stamp")?.remove();
  });
}

function filesClicked(ev, actions) {
  const hit = ev.target.closest("[data-act]");
  if (!hit || !ev.currentTarget.contains(hit)) return;
  ev.stopPropagation();
  actions.files?.(hit);
}

function Said(props) {
  return (
    <div
      ref={(node) => keepsTheStamp(node, props.block)}
      class="sv-msg md"
      classList={{ streaming: !!props.block.streaming, stamped: !!props.block.stamped, "tl-nometa": !!props.row?.derived && !props.row.meta }}
      data-seq={props.block.seq || undefined}
      data-at={props.block.at || undefined}
      data-said={props.block.said || undefined}
      attr:hidden={props.row?.hidden ? "until-found" : undefined}
      data-fold={props.row?.hidden ? props.row.fold : undefined}
    >
      <For each={props.block.parts}>{(html) => <Raw html={html} wire={props.actions.wire} />}</For>
      <Show when={props.block.shots?.length}>
        <div class="mshots">
          <For each={props.block.shots}>{(one) => (
            <span class="mshot" classList={{ kept: !!one.kept }}>
              <img
                src={one.src}
                alt={one.alt}
                title={one.title}
                data-path={one.path}
                on:click={(ev) => props.actions.shot(one.path, ev.currentTarget)}
                on:error={(ev) => props.actions.shotGone(ev.currentTarget)}
              />
              <span class="mkeep">
                <Show when={one.kept} fallback={
                  <Show when={one.keeping} fallback={
                    <button type="button" class="mk" title={props.block.words.keepTitle} on:click={() => props.actions.keepAsk(one)}>{props.block.words.keep}</button>
                  }>
                    <Show when={one.keeping === "busy"} fallback={
                      <span class="mk-ask">
                        <input
                          type="text"
                          class="mk-cap"
                          placeholder={props.block.words.caption}
                          maxlength="200"
                          ref={(node) => queueMicrotask(() => node.focus())}
                          on:keydown={(ev) => {
                            if (ev.key === "Enter") { ev.preventDefault(); props.actions.keepPrint(one, ev.currentTarget.value, ev.currentTarget.parentElement.querySelector(".mk-after")?.value ?? "last"); }
                            if (ev.key === "Escape") { ev.preventDefault(); props.actions.keepAsk(one); }
                          }}
                        />
                        <input
                          type="text"
                          class="mk-after"
                          inputmode="numeric"
                          placeholder={props.block.words.after}
                          title={props.block.words.afterTitle}
                          maxlength="4"
                          on:keydown={(ev) => {
                            if (ev.key === "Enter") { ev.preventDefault(); props.actions.keepPrint(one, ev.currentTarget.parentElement.querySelector(".mk-cap")?.value ?? "", ev.currentTarget.value); }
                            if (ev.key === "Escape") { ev.preventDefault(); props.actions.keepAsk(one); }
                          }}
                        />
                      </span>
                    }>
                      <span class="mk-busy">{props.block.words.keeping}</span>
                    </Show>
                    <Show when={one.keepError}><span class="mk-err">{one.keepError}</span></Show>
                  </Show>
                }>
                  <a class="mk-done" href={one.kept} on:click={(ev) => { ev.preventDefault(); props.actions.openKept(one); }}>{props.block.words.kept}</a>
                </Show>
              </span>
            </span>
          )}</For>
        </div>
      </Show>
      <Show keyed when={props.row?.files}>{(html) => <div class="tx-cf" innerHTML={html} on:click={(ev) => filesClicked(ev, props.actions)} />}</Show>
    </div>
  );
}

const CHATS_ICON = '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>';

function PeerBubble(props) {
  const from = () => props.row.from;
  return (
    <div
      ref={(node) => keepsTheStamp(node, props.block)}
      class="sv-user peer sv-peer-fold"
      classList={{ stamped: !!props.block.stamped, open: !!props.row.open, "tl-steer": !!props.row.steer }}
      data-cid={props.block.dataset.cid || undefined}
      data-seq={props.block.seq || undefined}
      data-at={props.block.at || undefined}
      data-said={props.block.said || undefined}
    >
      <div class="pf-head">
        <button type="button" class="pf-toggle" aria-expanded={props.row.open ? "true" : "false"} title={from().says} on:click={() => props.actions.toggle?.("users", props.block.key)}>
          <svg class="pf-i" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" innerHTML={CHATS_ICON} />
          <span class="pf-from">{from().name}</span>
          <Show when={!props.row.open}><span class="pf-gist">{props.row.gist}</span></Show>
          <TlIcon name={props.row.open ? "chevronDown" : "chevron"} class="pf-chev" />
        </button>
        <button type="button" class="pf-open" on:click={(ev) => { ev.stopPropagation(); props.actions.openSeat?.(from().seat); }}>{phrase("Open thread")}</button>
      </div>
      <div class="pf-body" hidden={!props.row.open}>
        <Show when={props.block.thumbs.some((thumb) => !thumb.inline)}>
          <span class="uatts">
            <For each={props.block.thumbs.filter((thumb) => !thumb.inline)}>{(thumb) => (
              <span class="uatt" title={thumb.title} data-path={thumb.path} on:click={(ev) => props.actions.shot(thumb.path, ev.currentTarget)}>
                <img src={thumb.src} alt={thumb.alt} />
                <span class="am">{thumb.mark}</span>
                <span class="an">{thumb.name}</span>
              </span>
            )}</For>
          </span>
        </Show>
        <Show keyed when={props.block.body}>{(html) => <Raw html={html} wire={props.actions.wire} />}</Show>
      </div>
    </div>
  );
}

function Switched(props) {
  return (
    <div class="tl-switch tl-quiet" role="note">
      <span class="tl-switch-line" aria-hidden="true" />
      <span class="tl-switch-label">{props.block.from}<span class="tl-switch-arrow"> → </span>{props.block.to}</span>
      <span class="tl-switch-line" aria-hidden="true" />
    </div>
  );
}

function Bubble(props) {
  return (
    <Show when={!props.row?.from || props.block.editing} fallback={<PeerBubble block={props.block} row={props.row} actions={props.actions} />}>
    <Show when={props.block.editing} fallback={
      <div
        ref={(node) => keepsTheStamp(node, props.block)}
        class="sv-user"
        classList={{ peer: !!props.block.peer, stamped: !!props.block.stamped, "tl-steer": !!props.row?.steer }}
        data-cid={props.block.dataset.cid || undefined}
        data-uuid={props.block.dataset.uuid || undefined}
        data-seq={props.block.seq || undefined}
        data-turn-start={props.block.turnStart ? "1" : undefined}
        data-at={props.block.at || undefined}
        data-said={props.block.said || undefined}
      >
        <Show when={props.block.thumbs.some((thumb) => !thumb.inline)}>
          <span class="uatts">
            <For each={props.block.thumbs.filter((thumb) => !thumb.inline)}>{(thumb) => (
              <span class="uatt" title={thumb.title} data-path={thumb.path} on:click={(ev) => props.actions.shot(thumb.path, ev.currentTarget)}>
                <img src={thumb.src} alt={thumb.alt} />
                <span class="am">{thumb.mark}</span>
                <span class="an">{thumb.name}</span>
              </span>
            )}</For>
          </span>
        </Show>
        <Show when={props.row?.long} fallback={<Show keyed when={props.block.body}>{(html) => <Raw html={html} wire={props.actions.wire} />}</Show>}>
          <div class="tl-ubody" classList={{ "tl-folded": !props.row.open }}>
            <Show keyed when={props.block.body}>{(html) => <Raw html={html} wire={props.actions.wire} />}</Show>
          </div>
          <div class="tl-ufoot">
            <button type="button" class="tl-ubtn" aria-expanded={props.row.open ? "true" : "false"} on:click={() => props.actions.toggle?.("users", props.block.key)}>{props.row.toggle}</button>
          </div>
        </Show>
      </div>
    }>
      <EditBubble block={props.block} actions={props.actions} />
    </Show>
    </Show>
  );
}

const EDIT_TALLEST = 320;

function fitEdit(node) {
  node.style.height = "auto";
  node.style.height = `${Math.min(node.scrollHeight, EDIT_TALLEST)}px`;
}

function EditBubble(props) {
  const edit = () => props.block.editing || {};
  let box = null;
  const [revert, setRevert] = createSignal(false);
  const save = () => props.actions.editSave(props.block, box?.value ?? "", !!edit().revert && revert());
  const cancel = () => props.actions.editCancel(props.block);
  return (
    <div class="sv-edit" classList={{ busy: !!edit().busy }}>
      <div class="sv-edit-box">
        <textarea
          ref={(node) => {
            box = node;
            node.value = edit().text || "";
            queueMicrotask(() => {
              node.focus();
              node.setSelectionRange(node.value.length, node.value.length);
              fitEdit(node);
            });
          }}
          class="sv-edit-text"
          rows="1"
          aria-label={edit().label}
          on:input={(ev) => fitEdit(ev.currentTarget)}
          on:keydown={(ev) => {
            ev.stopPropagation();
            if (ev.key === "Escape") { ev.preventDefault(); cancel(); }
            else if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); save(); }
          }}
        />
        <Show when={props.block.thumbs.length}>
          <span class="sv-edit-att">
            <For each={props.block.thumbs}>{(thumb) => (
              <span class="sv-edit-chip"><img src={thumb.src} alt={thumb.alt} /><span>{thumb.mark} · {thumb.name}</span></span>
            )}</For>
          </span>
        </Show>
      </div>
      <div class="sv-edit-row">
        <span class="sv-edit-hint" classList={{ bad: !!edit().error }} role={edit().error ? "alert" : undefined}>{edit().error || (edit().revert && revert() ? edit().revertHint : edit().hint)}</span>
        <Show when={edit().revert}>
          <label class="sv-edit-revert">
            <input type="checkbox" checked={revert()} disabled={!!edit().busy} on:change={(ev) => setRevert(ev.currentTarget.checked)} />
            <span>{edit().revert}</span>
          </label>
        </Show>
        <button type="button" class="sv-edit-cancel" on:click={cancel}>{edit().cancel}<kbd>esc</kbd></button>
        <button type="button" class="sv-edit-save" disabled={!!edit().busy} on:click={save}>{edit().save}<kbd>⏎</kbd></button>
      </div>
    </div>
  );
}

function Meta(props) {
  return <div class={props.block.cls}>{props.block.text}</div>;
}

function Think(props) {
  return (
    <details class="sv-think" classList={{ timed: !!props.block.dur, "tl-log": !!props.row?.derived }}>
      <Show when={props.block.label !== undefined} fallback={
        <summary><span class="tw c">{props.block.thinking}</span><span class="tw n">{props.block.thought}</span><span class="tdur">{props.block.dur}</span></summary>
      }>
        <summary>{props.block.label}</summary>
      </Show>
      <div class="tk">{props.block.body}</div>
    </details>
  );
}

function Command(props) {
  const spans = createMemo(() => (props.block.whole ? ansiSpans(props.block.out ?? "") : []));
  createEffect(() => { if (!props.block.whole && !props.block.loading && !props.block.loadError) props.actions.output?.(props.block); });
  return (
    <div class="tl-cmd">
      <div class="tl-cmd-line">{props.block.cmd}</div>
      <Switch>
        <Match when={props.block.loadError}><div class="tl-cmd-exit">{phrase("Couldn't load output: {error}", { error: props.block.loadError })}</div></Match>
        <Match when={!props.block.whole}><div class="tl-cmd-note">{phrase("Loading output…")}</div></Match>
        <Match when={!props.block.out}><div class="tl-cmd-note">{props.block.running ? "" : phrase("No output.")}</div></Match>
        <Match when={props.block.out}>
          <Show when={props.block.cut}><div class="tl-cmd-note">{phrase("Earlier output not shown")}</div></Show>
          <div class="tl-cmd-out">
            <For each={spans()}>{(span) => (span.cls || span.css ? <span class={span.cls || undefined} style={span.css || undefined}>{span.text}</span> : span.text)}</For>
          </div>
        </Match>
      </Switch>
      <Show when={props.block.exit !== null && props.block.exit !== undefined && props.block.exit !== 0}>
        <div class="tl-cmd-exit">{phrase("exit {n}", { n: props.block.exit })}</div>
      </Show>
    </div>
  );
}

function JsonText(props) {
  const spans = createMemo(() => jsonSpans(props.text));
  return <For each={spans()}>{(span) => (span.cls ? <span class={span.cls}>{span.text}</span> : span.text)}</For>;
}

function ToolArgs(props) {
  return (
    <div class="tinsp">
      <For each={props.rows}>{(row) => (
        <div class="tinsp-row" classList={{ "tinsp-block": !!row.json || row.text.includes("\n") }}>
          <span class="tinsp-key">{row.key}</span>
          <Show when={row.json} fallback={<span class="tinsp-val">{row.text}</span>}>
            <span class="tinsp-val tinsp-json"><JsonText text={row.text} /></span>
          </Show>
        </div>
      )}</For>
    </div>
  );
}

const EXTERNAL_ICON = '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>';

function WebResults(props) {
  return (
    <div class="tweb">
      <div class="tweb-q">{props.web.query}</div>
      <Show when={props.web.links.length}>
        <ul class="tweb-links">
          <For each={props.web.links}>{(one) => (
            <li>
              <a href={one.url} target="_blank" rel="noopener noreferrer" title={one.url} on:click={(ev) => ev.stopPropagation()}>
                <span class="tweb-title">{one.title}</span>
                <svg class="tweb-out" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" innerHTML={EXTERNAL_ICON} />
              </a>
              <Show when={one.snippet}><p class="tweb-snip">{one.snippet}</p></Show>
            </li>
          )}</For>
        </ul>
      </Show>
      <Show when={props.web.rest}><div class="tweb-rest">{props.web.rest}</div></Show>
    </div>
  );
}

function TlThink(props) {
  return (
    <details class="tl-think tl-log tl-quiet">
      <summary class="tl-line">
        <span class="tl-ico"><TlIcon name={props.block.label === undefined ? "brain" : "hammer"} /></span>
        <span class="tl-label"><span class="tl-think-head">{props.block.label ?? phrase("Thought")}</span> {liveThoughtLine(props.block.body || "")}</span>
        <TlIcon name="chevron" class="tl-chev" />
      </summary>
      <div class="tl-think-body">{props.block.body}</div>
    </details>
  );
}

function Tool(props) {
  const [open, setOpen] = createSignal(false);
  const shell = () => !!props.row?.derived && !!props.block.cmd;
  return (
    <details
      class="sv-tool"
      classList={{ running: !!props.block.running, "sv-keep": !!props.block.keep, "tl-log": !!props.row?.derived }}
      data-kind={props.block.face}
      data-tool={props.block.tool}
      data-t0={props.block.t0 || undefined}
      data-ms={props.block.ms || undefined}
      data-shot={props.block.shot || undefined}
      on:toggle={(ev) => setOpen(ev.currentTarget.open)}
    >
      <summary title={props.block.title}>
        <Show when={props.block.favicon && !(raycast() && props.block.stat === "bad")} fallback={<Icon class="tico" glyph={raycast() && props.block.stat === "bad" ? "i-warn" : props.block.glyph} />}>
          <Favicon src={props.block.favicon} class="tico tfav" fallback={<Icon class="tico" glyph={props.block.glyph} />} />
        </Show>
        <span class="tname">{props.block.name}</span>
        <span class="tsrv" hidden={!props.block.server}>{props.block.server}</span>
        <span class="targ">{props.block.arg}</span>
        <span class="tlink">
          <Show when={props.block.link}>
            <a href={props.block.link.url} target="_blank" rel="noopener noreferrer" on:click={(ev) => ev.stopPropagation()}>{props.block.link.label}</a>
          </Show>
        </span>
        <span class="tms">{props.block.took}</span>
        <Show when={props.row?.derived}><TlTime at={props.block.at} /></Show>
        <Show when={raycast()} fallback={
          <Show when={props.block.stat} fallback={<span class="tstat">…</span>}>
            <span class={`tstat ${props.block.stat}`}><Icon glyph={props.block.stat === "bad" ? "i-x" : "i-check"} /></span>
          </Show>
        }>
          <Switch fallback={<span class="tstat"><i class="tspin" /></span>}>
            <Match when={props.block.stat === "bad"}><span class="tstat bad">{props.block.failed}</span></Match>
            <Match when={props.block.stat}><span class={`tstat ${props.block.stat}`}><Icon glyph="i-check" /></span></Match>
          </Switch>
        </Show>
      </summary>
      <Show when={props.block.edit}>
        <div class="tedit" data-file={props.block.edit.file}>
          <span class="tepath">{props.block.edit.path}</span>
          <span class="tedelta"><span class="add">+{props.block.edit.added}</span> <span class="del">-{props.block.edit.removed}</span></span>
          <Show when={props.row?.diff}>
            <button type="button" class="tx-cf-edit" data-act="turn-diff" data-n={props.row.diff.n} data-file={props.row.diff.file} on:click={(ev) => { ev.preventDefault(); ev.stopPropagation(); props.actions.files?.(ev.currentTarget); }}>{props.row.diff.label}</button>
          </Show>
        </div>
      </Show>
      <Show when={shell()} fallback={
        <>
          <Show when={open() && props.block.args?.length && !props.block.web}><ToolArgs rows={props.block.args} /></Show>
          <Show when={open() && props.block.web} fallback={
            <pre class="tbody" classList={{ "has-diff": !!props.block.diff, "tjson": open() && !!props.block.json }}>
              <Show when={open() && props.block.json} fallback={props.block.body}><JsonText text={props.block.json} /></Show>
            </pre>
          }>
            <WebResults web={props.block.web} />
          </Show>
          <Show when={props.block.diff}>
            <div class="tdiff"><For each={props.block.diff}>{(line) => <span class={line.cls}>{line.text || "​"}</span>}</For></div>
          </Show>
        </>
      }>
        <Show when={open()}><Command block={props.block} actions={props.actions} /></Show>
      </Show>
      <Show when={props.block.sub !== undefined}><div class="tsub">{props.block.sub}</div></Show>
      <Show when={props.block.shots?.length}>
        <div class="tshots">
          <For each={props.block.shots}>{(one) => (
            <img
              src={one.src}
              alt={one.alt}
              title={one.title}
              data-path={one.path}
              on:click={(ev) => props.actions.shot(one.path, ev.currentTarget)}
              on:load={(ev) => props.actions.shotSeen(ev.currentTarget)}
              on:error={(ev) => props.actions.shotGone(ev.currentTarget)}
            />
          )}</For>
        </div>
      </Show>
    </details>
  );
}

function PeerFrom(props) {
  return (
    <div class="sv-peer-from">
      {props.block.from}
      <b on:click={(ev) => { ev.stopPropagation(); props.actions.seat(props.block.seat || props.block.name); }}>{props.block.name}</b>
      <span class="kind">{props.block.says}</span>
    </div>
  );
}

function MemoryTurn(props) {
  const b = () => props.block;
  return (
    <div class="sv-memturn" data-memory="turn">
      <div class="mh"><span class="mglyph" aria-hidden="true">🧠</span><span>{b().head}</span></div>
      <For each={b().items}>{(one) => (
        <div class="mrow" data-id={one.id} classList={{ gone: one.gone, busy: one.busy }}>
          <button type="button" class="mtext" title={b().openSay} on:click={() => props.actions.memory(one.id)}>
            <span class="mname">{one.shown}</span>
            <Show when={one.description}><span class="mdesc">{one.description}</span></Show>
          </button>
          <Show when={!one.gone} fallback={
            <span class="macts"><span class="mgone">{b().goneSay}</span><button type="button" class="mlink" data-mem-undo disabled={one.busy} on:click={() => props.actions.memoryUndo(b(), one)}>{b().undoSay}</button></span>
          }>
            <span class="macts">
              <span class="mscope" role="group" aria-label={b().scopeSay}>
                <For each={b().scopes}>{(opt) => (
                  <button type="button" data-scope={opt.scope} aria-pressed={one.scope === opt.scope ? "true" : "false"} disabled={one.busy} on:click={() => props.actions.memoryScope(b(), one, opt.scope)}>{opt.say}</button>
                )}</For>
              </span>
              <Show when={one.scope === "team"}><button type="button" class="mlink" data-mem-propose on:click={() => props.actions.memory(one.id)}>{b().proposeSay}</button></Show>
              <button type="button" class="mlink mdrop" data-mem-drop disabled={one.busy} on:click={() => props.actions.memoryDrop(b(), one)}>{b().dropSay}</button>
            </span>
          </Show>
          <Show when={one.error}><span class="merr" role="alert">{one.error}</span></Show>
        </div>
      )}</For>
      <div class="mfoot">{b().foot}</div>
    </div>
  );
}

function Work(props) {
  return (
    <details class="sv-work" classList={{ bad: !!props.block.bad }}>
      <summary><Show when={raycast()}><Icon class="wchev" glyph="i-chev" /></Show><span class="wname">{props.block.name}</span><span class="wbad">{props.block.badly}</span><span class="wms">{props.block.ms}</span></summary>
      <div class="wbody"><For each={props.block.items}>{(one) => <Block block={one} actions={props.actions} />}</For></div>
    </details>
  );
}

function Retry(props) {
  return (
    <div class="tl-retry tl-quiet tl-log" data-state={props.block.state} role={props.block.state === "retrying" ? "status" : undefined}>
      <span class="tl-ico"><TlIcon name={props.block.state === "failed" ? "alert" : "refresh"} /></span>
      <span class="tl-label" classList={{ "tl-shine": props.block.state === "retrying" }}>{props.block.label}</span>
      <Show when={props.block.why}><span class="tl-why">· {props.block.why}</span></Show>
    </div>
  );
}

function Block(props) {
  return (
    <Switch>
      <Match when={props.block.kind === "said"}><Said block={props.block} row={props.row} actions={props.actions} /></Match>
      <Match when={props.block.kind === "bubble"}><Bubble block={props.block} row={props.row} actions={props.actions} /></Match>
      <Match when={props.block.kind === "meta"}><Meta block={props.block} /></Match>
      <Match when={props.block.kind === "think"}>
        <Show when={props.row?.derived} fallback={<Think block={props.block} row={props.row} />}><TlThink block={props.block} /></Show>
      </Match>
      <Match when={props.block.kind === "tool"}><Tool block={props.block} row={props.row} actions={props.actions} /></Match>
      <Match when={props.block.kind === "retry"}><Retry block={props.block} /></Match>
      <Match when={props.block.kind === "peer"}><PeerFrom block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "switch"}><Switched block={props.block} /></Match>
      <Match when={props.block.kind === "memturn"}><MemoryTurn block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "work"}><Work block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "node"}>{props.block.el}</Match>
    </Switch>
  );
}

function TurnFold(props) {
  return (
    <div class="tl-fold tl-quiet" classList={{ open: !!props.row.open }}>
      <button type="button" aria-expanded={props.row.open ? "true" : "false"} on:click={() => props.actions.toggle("unfolded", props.row.fold)}>
        <span>{props.row.label}</span>
        <TlIcon name={props.row.open ? "chevronDown" : "chevron"} class="tl-chev" />
      </button>
      <TlTime at={props.row.at} />
    </div>
  );
}

function WorkToggle(props) {
  return (
    <div class="tl-work tl-quiet tl-log" classList={{ open: !!props.row.open, bad: !!props.row.bad }}>
      <button type="button" class="tl-line" aria-expanded={props.row.open ? "true" : "false"} on:click={() => props.actions.toggle("expanded", props.row.group)}>
        <span class="tl-ico"><TlIcon name={props.row.icon} /></span>
        <span class="tl-label">{props.row.summary}</span>
        <TlTime at={props.row.at} />
      </button>
    </div>
  );
}

function WorkGroup(props) {
  return (
    <div class="tl-group tl-quiet tl-log">
      <For each={props.row.items}>{(item) => <Block block={item.block} row={item} actions={props.actions} />}</For>
    </div>
  );
}

function ThoughtLine(props) {
  return (
    <span class="tl-line tl-thought">
      <span class="tl-ico"><TlIcon name="brain" /></span>
      <span class="tl-label">{props.text}</span>
    </span>
  );
}

function WorkLive(props) {
  return (
    <div class="tl-live tl-quiet tl-log" classList={{ active: !!props.row.active, open: !!props.row.open }}>
      <button type="button" class="tl-live-btn" aria-expanded={props.row.open ? "true" : "false"} on:click={() => props.actions.toggle("expanded", props.row.group)}>
        <Show when={props.row.thought}><ThoughtLine text={props.row.thought} /></Show>
        <span class="tl-line">
          <span class="tl-ico"><Show when={props.row.favicon} fallback={<TlIcon name={props.row.icon} />}><Favicon src={props.row.favicon} class="tl-i tl-fav" fallback={<TlIcon name={props.row.icon} />} /></Show></span>
          <span class="tl-label" classList={{ "tl-shine": !!props.row.active }}>{props.row.label}</span>
        </span>
      </button>
    </div>
  );
}

function ThinkingRow(props) {
  const inside = () => (
    <>
      <Show when={props.row.thought}><ThoughtLine text={props.row.thought} /></Show>
      <span class="tl-line">
        <span class="tl-ico"><TlIcon name="brain" /></span>
        <span class="tl-label tl-shine">{props.row.label}</span>
      </span>
    </>
  );
  return (
    <div class="tl-live tl-quiet tl-log active" classList={{ open: !!props.row.open }}>
      <Show when={props.row.group} fallback={<div class="tl-live-btn">{inside()}</div>}>
        <button type="button" class="tl-live-btn" aria-expanded={props.row.open ? "true" : "false"} on:click={() => props.actions.toggle("expanded", props.row.group)}>{inside()}</button>
      </Show>
    </div>
  );
}

const ticking = new Set();
let tickTimer = 0;

function tickAll() {
  const now = Date.now();
  for (const el of ticking) {
    if (!el.dataset.t0) continue;
    const said = workingSays(Number(el.dataset.t0), phrase, now);
    if (el.textContent !== said) el.textContent = said;
  }
  if (!ticking.size) {
    clearInterval(tickTimer);
    tickTimer = 0;
  }
}

function tickRef(el, t0) {
  ticking.add(el);
  if (!tickTimer) tickTimer = setInterval(tickAll, 1000);
  onCleanup(() => ticking.delete(el));
  createEffect(() => {
    const at = Number(t0()) || 0;
    if (at) el.dataset.t0 = String(at);
    else delete el.dataset.t0;
    el.textContent = workingSays(at, phrase);
  });
}

function Working(props) {
  return (
    <div class="tl-working tl-quiet">
      <span class="tl-tick" ref={(el) => tickRef(el, () => props.row.t0)} />
    </div>
  );
}

function StatusLine(props) {
  return (
    <div class="tl-status tl-quiet" data-tone={props.row.tone || undefined}>
      <TlIcon name={props.row.icon} />
      <span class="tl-status-label">{props.row.label}</span>
      <Show when={props.row.action}>
        <span aria-hidden="true">·</span>
        <button type="button" class="tl-inline" on:click={() => props.actions.status?.(props.row.act)}>{props.row.action}</button>
      </Show>
    </div>
  );
}

function Row(props) {
  return (
    <Switch>
      <Match when={props.row.kind === "block"}><Block block={props.row.block} row={props.row} actions={props.actions} /></Match>
      <Match when={props.row.kind === "work"}><Work block={props.row} actions={props.actions} /></Match>
      <Match when={props.row.kind === "turn-fold"}><TurnFold row={props.row} actions={props.actions} /></Match>
      <Match when={props.row.kind === "work-toggle"}><WorkToggle row={props.row} actions={props.actions} /></Match>
      <Match when={props.row.kind === "work-group"}><WorkGroup row={props.row} actions={props.actions} /></Match>
      <Match when={props.row.kind === "work-live"}><WorkLive row={props.row} actions={props.actions} /></Match>
      <Match when={props.row.kind === "thinking"}><ThinkingRow row={props.row} actions={props.actions} /></Match>
      <Match when={props.row.kind === "working"}><Working row={props.row} /></Match>
      <Match when={props.row.kind === "status"}><StatusLine row={props.row} actions={props.actions} /></Match>
    </Switch>
  );
}

export function Conversation(props) {
  return <For each={props.model.rows}>{(row) => <Row row={row} actions={props.actions} />}</For>;
}

export function mountConversation(host, actions) {
  const view = mountView(host, Conversation, { rows: [] }, { actions });
  const quoteOf = (ev) => ev.target.closest?.(".sv-said-quote[role=button]:not([data-missing])");
  const onClick = (ev) => {
    const quote = quoteOf(ev);
    if (quote) {
      ev.stopPropagation();
      if (!ev.target.ownerDocument.getSelection?.()?.toString()) actions.quote?.(quote);
      return;
    }
    const chip = ev.target.closest?.(".ctx-chip[data-kind=chat], .ctx-chip[data-kind=image][data-path]");
    if (!chip) return;
    ev.stopPropagation();
    if (chip.dataset.kind === "chat") actions.seat(chip.dataset.seat);
    else actions.shot(chip.dataset.path, chip);
  };
  const onKey = (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const quote = quoteOf(ev);
    if (!quote || ev.target !== quote) return;
    ev.preventDefault();
    ev.stopPropagation();
    actions.quote?.(quote);
  };
  host.addEventListener("click", onClick);
  host.addEventListener("keydown", onKey);
  return {
    show(model) { view.show(model); },
    dispose() { host.removeEventListener("click", onClick); host.removeEventListener("keydown", onKey); view.dispose(); }
  };
}

function Sub(props) {
  return (
    <details class="sv-sub" data-t0={props.sub.dataset.t0} data-bg={props.sub.dataset.bg || undefined} data-task={props.sub.dataset.task || undefined}>
      <summary title={props.sub.hint} on:click={(ev) => { if (ev.currentTarget.ownerDocument.body.classList.contains("experience-next")) ev.preventDefault(); }}>
        <Icon class="sico" glyph="i-agent" />
        <span class="sname">{props.sub.name}</span>
        <span class="sarg">{props.sub.arg}</span>
        <span class="sbg" hidden={!props.sub.dataset.bg}>{props.sub.background}</span>
        <span class="sms">{props.sub.ms}</span>
      </summary>
      <pre class="sbody">{props.sub.body}</pre>
      <ol class="slog" classList={{ on: !!props.sub.steps.length }}>
        <For each={props.sub.steps}>{(step) => (
          <li
            class="sstep"
            classList={{ now: !!step.now, open: !!step.open, bad: !!step.bad }}
            data-kind={step.face}
            data-key={step.of || undefined}
            title={step.hint || undefined}
          >
            <Icon class="stico" glyph={step.glyph} />
            <span class="stxt">{step.text}</span>
            <span class="sok"><Show when={step.landed}><Icon glyph={step.bad ? "i-x" : "i-check"} /></Show></span>
          </li>
        )}</For>
      </ol>
    </details>
  );
}

export function Subs(props) {
  return <For each={props.model.subs}>{(sub) => <Sub sub={sub} />}</For>;
}

export function mountSubs(host) {
  return mountView(host, Subs, { subs: [] }, {});
}
