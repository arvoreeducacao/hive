import { For, Show, createEffect, createRenderEffect, on } from "solid-js";
import { mountView } from "./view.jsx";
import { Raw } from "./raw.jsx";

function FinishPop(props) {
  const host = props.host;
  const pop = () => props.model;
  createRenderEffect(() => host.classList.toggle("on", !!pop().open));
  createEffect(on(() => pop().shown, (shown) => {
    if (!shown) return;
    props.actions.wire(host, pop().name);
    host.scrollTop = 0;
    const box = host.getBoundingClientRect();
    const anchor = pop().anchor || { left: innerWidth / 2 - box.width / 2, bottom: 80 };
    host.style.left = `${Math.max(6, Math.min(anchor.left, innerWidth - box.width - 6))}px`;
    host.style.top = `${Math.max(6, Math.min(anchor.bottom + 6, innerHeight - box.height - 6))}px`;
  }));
  return (
    <Show when={pop().shown} keyed>{(shown) => shown && (
      <>
        <div class="cap">{`${pop().title} ${pop().capSay}`}</div>
        <div class="fin-meta">
          <For each={pop().meta}>{(bit) => <span>{bit}</span>}</For>
          <For each={pop().warnings}>{(warning) => <span class="bad">{warning}</span>}</For>
        </div>
        <div class="fin-say sv-msg md">
          <Show when={pop().said} fallback={<p>{pop().emptySay}</p>}><Raw html={pop().html} /></Show>
          <Show when={pop().clipped}><span class="fin-clip">{pop().clipSay}</span></Show>
        </div>
        <For each={pop().prs}>{(pr) => (
          <a class="fin-pr" href={pr.url} target="_blank" rel="noreferrer"><b>{pr.where}</b><span>{pr.title}</span></a>
        )}</For>
        <div class="fin-go">
          <button class="ghost b-open" on:click={() => props.actions.open(pop().name)}>{pop().openSay}</button>
          <button class="ghost b-shut" on:click={() => props.actions.shut()}>{pop().shutSay}</button>
        </div>
      </>
    )}</Show>
  );
}

const FINISH_SHUT = { key: "finish", open: false, shown: 0, name: "", anchor: null, title: "", capSay: "", meta: [], warnings: [], said: false, html: "", emptySay: "", clipped: false, clipSay: "", prs: [], openSay: "", shutSay: "" };

export function mountFinishPop(host, actions) {
  return mountView(host, FinishPop, FINISH_SHUT, { actions, host });
}
