import { For, Show, createComputed, createRoot, on } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { Raw } from "./raw.jsx";

function QuestionOption(props) {
  return (
    <button class="qo" classList={{ sel: props.option.picked }} type="button" aria-pressed={props.raycast ? String(props.option.picked) : undefined} on:click={() => props.pick()}>
      <Show when={props.option.digit}><span class={props.raycast ? "qn rc-key" : "qn"}>{props.option.digit}</span></Show>
      <span class="qob">
        <span class="qol">{props.option.label}</span>
        <Show when={props.option.description}><span class="qod">{props.option.description}</span></Show>
      </span>
      <Show when={props.raycast}><span class="qchosen"><Raw html={props.marks.check} /><span>{props.marks.chosen}</span></span></Show>
    </button>
  );
}

function QuestionStep(props) {
  const keys = (kev) => {
    kev.stopPropagation();
    if (kev.key !== "Enter") return;
    kev.preventDefault();
    props.enter();
  };
  return (
    <div class="qstep" hidden={!props.shown}>
      <div class="qh">
        <Show when={props.raycast}><i class="rc-dot needs" aria-hidden="true"></i></Show>
        <span>{props.step.title}</span>
        <Show when={props.step.count}><span class="qcount">{props.step.count}</span></Show>
      </div>
      <div class="qq">{props.step.question}</div>
      <div class="qhint">{props.step.hint}</div>
      <div class="qopts">
        <For each={props.step.options}>{(option, at) => <QuestionOption option={option} raycast={props.raycast} marks={props.marks} pick={() => props.actions.pick(props.at, at())} />}</For>
      </div>
      <div class="qfree"><input placeholder={props.placeholder} value={props.step.typed} on:input={(ev) => props.actions.type(props.at, ev.currentTarget.value)} on:keydown={keys} /></div>
    </div>
  );
}

function QuestionCard(props) {
  const m = props.model;
  const actions = props.actions;
  let card;
  let next;
  const steps = () => card.querySelectorAll(":scope > .qstep");
  const focusStep = () => {
    const step = steps()[m.at];
    (step?.querySelector(".qo.sel") || step?.querySelector(".qo"))?.focus({ preventScroll: true });
  };
  const toComposer = () => card.closest(".sv")?.querySelector(".sv-composer textarea")?.focus();
  const walk = (move) => {
    const was = m.at;
    move();
    if (m.raycast && m.at !== was) focusStep();
  };
  const putOff = (off) => {
    const hadFocus = card.contains(document.activeElement);
    actions.putOff(off);
    if (off && hadFocus) toComposer();
    if (!off) focusStep();
  };
  const keys = (kev) => {
    if (!m.raycast || kev.target.closest(".qfree")) return;
    if (kev.key === "Escape" && !m.later) {
      kev.preventDefault();
      kev.stopPropagation();
      return putOff(true);
    }
    if (kev.key === "Enter" && !kev.shiftKey && !kev.metaKey && !kev.ctrlKey && !kev.altKey && kev.target.closest(".qo, .qnext")) {
      kev.preventDefault();
      kev.stopPropagation();
      if (!next.disabled) next.click();
      return;
    }
    if (/^[1-9]$/.test(kev.key) && !kev.metaKey && !kev.ctrlKey && !kev.altKey) {
      const option = steps()[m.at]?.querySelectorAll(".qo")[Number(kev.key) - 1];
      if (!option) return;
      kev.preventDefault();
      kev.stopPropagation();
      option.click();
      option.focus({ preventScroll: true });
    }
  };
  createComputed(on(() => m.answered, (answered) => {
    if (answered && m.refocus && card.contains(document.activeElement)) toComposer();
  }, { defer: true }));
  return (
    <div ref={card} class="sv-q" classList={{ later: m.later, answered: m.answered, summed: m.summed, dropped: !!m.note }} data-id={m.id} inert={m.answered} on:keydown={keys}>
      <For each={m.steps}>
        {(step, at) => <QuestionStep step={step} at={at()} shown={at() === m.at} raycast={m.raycast} placeholder={m.placeholder} marks={m.marks} actions={actions} enter={() => walk(() => actions.enter(at()))} />}
      </For>
      <div class="qerr">{m.error}</div>
      <div class="qnav">
        <button class="qback" type="button" hidden={m.at === 0} on:click={() => actions.go(m.at - 1)}>{m.back}</button>
        <Show when={m.raycast}>
          <span class="qgrow"></span>
          <button class="qlater" type="button" on:click={() => putOff(true)}><span>{m.laterLabel}</span><span class="rc-key">esc</span></button>
        </Show>
        <button ref={next} class="qnext" type="button" disabled={m.nextOff} on:click={() => walk(() => actions.next())}><span>{m.next}</span><span class={m.raycast ? "rc-key" : "qkey"}>{m.nextKey}</span></button>
      </div>
      <Show when={m.raycast}>
        <button class="qwake" type="button" on:click={() => putOff(false)}>
          <Show when={m.wake}>
            <i class="rc-dot needs" aria-hidden="true"></i><span>{m.wake.question}</span><span class="qwake-go">{m.wake.go}</span>
          </Show>
        </button>
      </Show>
      <Show when={m.summed}>
        <div class="qsum">
          <For each={m.summary}>{(row) => <div class="qsum-row"><span class="qsum-q">{row.question}</span><span class="qsum-to" aria-hidden="true">→</span><span class="qsum-a">{row.answer}</span></div>}</For>
        </div>
      </Show>
      <Show when={m.note}><div class="qdesc">{m.note}</div></Show>
    </div>
  );
}

export function questionCardView(initial, actions) {
  const [model, setModel] = createStore(initial);
  const el = createRoot(() => <QuestionCard model={model} actions={actions} />);
  return {
    el,
    show(next) { setModel(reconcile(next, { key: "key" })); }
  };
}
