import { For, Match, Show, Switch, createEffect, createSignal } from "solid-js";
import { raycast } from "./raycast.js";
import { mountView } from "./view.jsx";

function Raw(props) {
  const hold = document.createElement("div");
  hold.innerHTML = props.html ?? "";
  props.wire?.(hold);
  return [...hold.childNodes];
}

function Icon(props) {
  return <svg class={props.class} aria-hidden="true"><use href={`#${props.glyph}`} /></svg>;
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

function Said(props) {
  return (
    <div
      ref={(node) => keepsTheStamp(node, props.block)}
      class="sv-msg md"
      classList={{ streaming: !!props.block.streaming, stamped: !!props.block.stamped, "sv-folded": !!props.block.folded }}
      data-at={props.block.at || undefined}
      data-said={props.block.said || undefined}
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
                on:click={() => props.actions.shot(one.path)}
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
    </div>
  );
}

function Bubble(props) {
  const [open, setOpen] = createSignal(false);
  return (
    <Show when={props.block.editing} fallback={
      <div
        ref={(node) => keepsTheStamp(node, props.block)}
        class="sv-user"
        classList={{ peer: !!props.block.peer, stamped: !!props.block.stamped }}
        data-cid={props.block.dataset.cid || undefined}
        data-uuid={props.block.dataset.uuid || undefined}
        data-at={props.block.at || undefined}
        data-said={props.block.said || undefined}
      >
        <Show when={props.block.thumbs.some((thumb) => !thumb.inline)}>
          <span class="uatts">
            <For each={props.block.thumbs.filter((thumb) => !thumb.inline)}>{(thumb) => (
              <span class="uatt" title={thumb.title} on:click={() => props.actions.shot(thumb.path)}>
                <img src={thumb.src} alt={thumb.alt} />
                <span class="am">{thumb.mark}</span>
                <span class="an">{thumb.name}</span>
              </span>
            )}</For>
          </span>
        </Show>
        <Show keyed when={props.block.body}>{(html) => (
          <Show when={props.block.clip} fallback={<Raw html={html} wire={props.actions.wire} />}>
            <div class="sv-said-clip" classList={{ open: open() }}><Raw html={html} wire={props.actions.wire} /></div>
          </Show>
        )}</Show>
        <Show when={props.block.clip}>{(clip) => (
          <button type="button" class="sv-said-more" aria-expanded={open() ? "true" : "false"} on:click={() => setOpen(!open())}>
            {open() ? clip().less : clip().more}
          </button>
        )}</Show>
      </div>
    }>
      <EditBubble block={props.block} actions={props.actions} />
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
  const save = () => props.actions.editSave(props.block, box?.value ?? "");
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
        <span class="sv-edit-hint" classList={{ bad: !!edit().error }} role={edit().error ? "alert" : undefined}>{edit().error || edit().hint}</span>
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
    <details class="sv-think" classList={{ timed: !!props.block.dur, "sv-folded": !!props.block.folded }}>
      <Show when={props.block.label !== undefined} fallback={
        <summary><span class="tw c">{props.block.thinking}</span><span class="tw n">{props.block.thought}</span><span class="tdur">{props.block.dur}</span></summary>
      }>
        <summary>{props.block.label}</summary>
      </Show>
      <div class="tk">{props.block.body}</div>
    </details>
  );
}

function Tool(props) {
  return (
    <details
      class="sv-tool"
      classList={{ running: !!props.block.running, "sv-keep": !!props.block.keep, "sv-folded": !!props.block.folded }}
      data-kind={props.block.face}
      data-tool={props.block.tool}
      data-t0={props.block.t0 || undefined}
      data-ms={props.block.ms || undefined}
      data-shot={props.block.shot || undefined}
    >
      <summary title={props.block.title}>
        <Icon class="tico" glyph={raycast() && props.block.stat === "bad" ? "i-warn" : props.block.glyph} />
        <span class="tname">{props.block.name}</span>
        <span class="tsrv" hidden={!props.block.server}>{props.block.server}</span>
        <span class="targ">{props.block.arg}</span>
        <span class="tlink">
          <Show when={props.block.link}>
            <a href={props.block.link.url} target="_blank" rel="noopener noreferrer" on:click={(ev) => ev.stopPropagation()}>{props.block.link.label}</a>
          </Show>
        </span>
        <span class="tms">{props.block.took}</span>
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
      <pre class="tbody" classList={{ "has-diff": !!props.block.diff }}>{props.block.body}</pre>
      <Show when={props.block.diff}>
        <div class="tdiff"><For each={props.block.diff}>{(line) => <span class={line.cls}>{line.text || "​"}</span>}</For></div>
      </Show>
      <Show when={props.block.sub !== undefined}><div class="tsub">{props.block.sub}</div></Show>
      <Show when={props.block.shots?.length}>
        <div class="tshots">
          <For each={props.block.shots}>{(one) => (
            <img
              src={one.src}
              alt={one.alt}
              title={one.title}
              on:click={() => props.actions.shot(one.path)}
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
      <b on:click={(ev) => { ev.stopPropagation(); props.actions.seat(props.block.name); }}>{props.block.name}</b>
      <span class="kind">{props.block.says}</span>
    </div>
  );
}

function MemoryTurn(props) {
  const b = () => props.block;
  return (
    <div class="sv-memturn" classList={{ "sv-folded": !!b().folded }} data-memory="turn">
      <div class="mh"><span class="mglyph" aria-hidden="true">🧠</span><span>{b().head}</span></div>
      <For each={b().items}>{(one) => (
        <div class="mrow" data-id={one.id} classList={{ gone: one.gone, busy: one.busy }}>
          <span class="mtext">
            <button type="button" class="mname" title={b().openSay} on:click={() => props.actions.memory(one.id)}>{one.name}</button>
            <Show when={one.description}><span class="mdesc">{one.description}</span></Show>
          </span>
          <Show when={!one.gone} fallback={
            <span class="macts"><span class="mgone">{b().goneSay}</span><button type="button" class="mlink" data-mem-undo disabled={one.busy} on:click={() => props.actions.memoryUndo(b(), one)}>{b().undoSay}</button></span>
          }>
            <span class="macts">
              <button type="button" class="mscope" data-scope={one.scope || "none"} title={b().scopeHint} disabled={one.busy} on:click={() => props.actions.memoryScope(b(), one)}>{one.scopeSay}</button>
              <button type="button" class="mlink" data-mem-drop disabled={one.busy} on:click={() => props.actions.memoryDrop(b(), one)}>{b().dropSay}</button>
            </span>
          </Show>
          <Show when={one.error}><span class="merr" role="alert">{one.error}</span></Show>
        </div>
      )}</For>
      <div class="mfoot">{b().foot}</div>
    </div>
  );
}

function TurnFold(props) {
  return (
    <div class="sv-turn" classList={{ open: !!props.block.open }}>
      <button type="button" class="sv-turn-btn" aria-expanded={props.block.open ? "true" : "false"} on:click={() => props.actions.turn(props.block.key)}>
        <span class="sv-turn-label">{props.block.label}</span>
        <Icon class="sv-turn-chev" glyph="i-chev" />
      </button>
    </div>
  );
}

function Work(props) {
  return (
    <details class="sv-work" classList={{ bad: !!props.block.bad, "sv-folded": !!props.block.folded }}>
      <summary><Show when={raycast()}><Icon class="wchev" glyph="i-chev" /></Show><span class="wname">{props.block.name}</span><span class="wbad">{props.block.badly}</span><span class="wms">{props.block.ms}</span></summary>
      <div class="wbody"><For each={props.block.items}>{(one) => <Block block={one} actions={props.actions} />}</For></div>
    </details>
  );
}

function Block(props) {
  return (
    <Switch>
      <Match when={props.block.kind === "said"}><Said block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "bubble"}><Bubble block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "meta"}><Meta block={props.block} /></Match>
      <Match when={props.block.kind === "think"}><Think block={props.block} /></Match>
      <Match when={props.block.kind === "tool"}><Tool block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "peer"}><PeerFrom block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "memturn"}><MemoryTurn block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "work"}><Work block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "turn"}><TurnFold block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "node"}>{props.block.el}</Match>
    </Switch>
  );
}

export function Conversation(props) {
  return <For each={props.model.blocks}>{(block) => <Block block={block} actions={props.actions} />}</For>;
}

export function mountConversation(host, actions) {
  const view = mountView(host, Conversation, { blocks: [] }, { actions });
  const onClick = (ev) => {
    const chip = ev.target.closest?.(".ctx-chip[data-kind=chat], .ctx-chip[data-kind=image][data-path]");
    if (!chip) return;
    ev.stopPropagation();
    if (chip.dataset.kind === "chat") actions.seat(chip.dataset.seat);
    else actions.shot(chip.dataset.path);
  };
  host.addEventListener("click", onClick);
  return {
    show(model) { view.show(model); },
    dispose() { host.removeEventListener("click", onClick); view.dispose(); }
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
