import { For, Match, Show, Switch, createEffect } from "solid-js";
import { nextHive, raycast } from "./raycast.js";
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
      classList={{ streaming: !!props.block.streaming, stamped: !!props.block.stamped }}
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
  return (
    <div
      ref={(node) => keepsTheStamp(node, props.block)}
      class="sv-user"
      classList={{ peer: !!props.block.peer, stamped: !!props.block.stamped }}
      data-cid={props.block.dataset.cid || undefined}
      data-at={props.block.at || undefined}
      data-said={props.block.said || undefined}
    >
      <Show when={props.block.thumbs.length}>
        <span class="uatts">
          <For each={props.block.thumbs}>{(thumb) => (
            <span class="uatt" title={thumb.title} on:click={() => props.actions.shot(thumb.path)}>
              <img src={thumb.src} alt={thumb.alt} />
              <span class="am">{thumb.mark}</span>
              <span class="an">{thumb.name}</span>
            </span>
          )}</For>
        </span>
      </Show>
      <Show keyed when={props.block.body}>{(html) => <Raw html={html} wire={props.actions.wire} />}</Show>
    </div>
  );
}

function Meta(props) {
  return <div class={props.block.cls}>{props.block.text}</div>;
}

function Think(props) {
  return (
    <details class="sv-think" classList={{ timed: !!props.block.dur }}>
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
      classList={{ running: !!props.block.running, "sv-keep": !!props.block.keep }}
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

const memoryRowOpens = (one) => (nextHive() ? one.opens : "");

function MemoryUsed(props) {
  return (
    <details class="sv-mem" data-memory="used" data-state={props.block.state}>
      <summary class="mchip">
        <span class="mglyph" aria-hidden="true">🧠</span>
        <For each={props.block.parts}>{(part, at) => (
          <>
            <Show when={at()}><span class="msep">·</span></Show>
            <span class="mpart" data-part={part.key}><b>{part.n}</b> {part.say}</span>
          </>
        )}</For>
      </summary>
      <div class="mpop">
        <div class="mhead">{props.block.head}</div>
        <For each={props.block.items}>{(one) => (
          <div
            class="mit"
            data-source={one.source}
            data-verified={one.verified ? "yes" : "no"}
            data-id={one.id || undefined}
            data-opens={memoryRowOpens(one) ? "yes" : undefined}
            role={memoryRowOpens(one) ? "button" : undefined}
            tabindex={memoryRowOpens(one) ? 0 : undefined}
            on:click={() => { if (memoryRowOpens(one)) props.actions.memory(memoryRowOpens(one)); }}
            on:keydown={(ev) => {
              if (!memoryRowOpens(one) || (ev.key !== "Enter" && ev.key !== " ")) return;
              ev.preventDefault();
              props.actions.memory(memoryRowOpens(one));
            }}
          >
            <span class="mrel">{one.rel}</span>
            <span class="mtitle">{one.title}</span>
            <span class="mby">{one.by}</span>
          </div>
        )}</For>
        <button type="button" class="mopen" on:click={(ev) => { ev.stopPropagation(); props.actions.memory(props.block.focus); }}>{props.block.more}</button>
      </div>
    </details>
  );
}

function MemorySave(props) {
  return (
    <div class="sv-memsave" classList={{ running: !!props.block.running, bad: props.block.stat === "bad" }} data-memory="saved">
      <span class="mk"><span class="mglyph" aria-hidden="true">🧠</span> {props.block.said}</span>
      <span class="mv">{props.block.title}</span>
      <span class="ma">{props.block.failed || props.block.when}</span>
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

function Block(props) {
  return (
    <Switch>
      <Match when={props.block.kind === "said"}><Said block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "bubble"}><Bubble block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "meta"}><Meta block={props.block} /></Match>
      <Match when={props.block.kind === "think"}><Think block={props.block} /></Match>
      <Match when={props.block.kind === "tool"}><Tool block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "peer"}><PeerFrom block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "memory"}><MemoryUsed block={props.block} actions={props.actions} /></Match>
      <Match when={props.block.kind === "memsave"}><MemorySave block={props.block} /></Match>
      <Match when={props.block.kind === "work"}><Work block={props.block} actions={props.actions} /></Match>
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
    const chip = ev.target.closest?.(".mention:not(.person)");
    if (!chip) return;
    ev.stopPropagation();
    actions.seat(chip.dataset.seat);
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
