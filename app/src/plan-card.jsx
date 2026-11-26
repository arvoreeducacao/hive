import { For, Show, createMemo, createRoot, createSignal, onMount } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { Raw } from "./raw.jsx";

function Markdown(props) {
  return createMemo(() => {
    const hold = document.createElement("div");
    hold.innerHTML = props.html || "";
    props.wire?.(hold);
    return [...hold.childNodes];
  });
}

function downloadText(name, contents) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function Picker(props) {
  return (
    <select class={props.class} aria-label={props.label} value={props.value} disabled={props.locked} on:change={(ev) => props.pick(ev.currentTarget.value)}>
      <For each={props.options}>{(option) => <option value={option.value} disabled={!!option.disabled} selected={option.value === props.value}>{option.label}</option>}</For>
    </select>
  );
}

function FrontRow(props) {
  const pick = (field) => (value) => props.actions.pick(props.at, field, value);
  return (
    <div class="prow">
      <span class="rn">{props.row.name}</span>
      <span class="rd">{props.row.about}</span>
      <span class="rr">
        <Picker class="ra" label={props.labels.agent} value={props.row.agent} options={props.row.agents} locked={props.row.locked} pick={pick("agent")} />
        <Picker class="rm" label={props.labels.model} value={props.row.model} options={props.row.models} locked={props.row.locked} pick={pick("model")} />
        <Picker class="rw" label={props.labels.where} value={props.row.where} options={props.row.wheres} locked={props.row.locked} pick={pick("where")} />
      </span>
    </div>
  );
}

function SavePlan(props) {
  let input;
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  onMount(() => {
    input.focus();
    input.setSelectionRange(0, Math.max(0, input.value.length - 3));
  });
  const keys = (ev) => {
    ev.stopPropagation();
    if (ev.key === "Escape") { ev.preventDefault(); props.close(); }
  };
  const submit = async (ev) => {
    ev.preventDefault();
    setBusy(true);
    const answer = await props.save(input.value.trim());
    setBusy(false);
    if (!answer?.ok) {
      setError(answer?.error || props.labels.failed);
      return;
    }
    props.close();
  };
  return (
    <form class="cp-plan-save" role="dialog" aria-label={props.labels.title} on:submit={submit}>
      <b class="cp-plan-save-h">{props.labels.title}</b>
      <label class="cp-plan-save-l"><span>{props.labels.path}</span><input ref={input} type="text" spellcheck="false" autocomplete="off" value={props.path} on:keydown={keys} /></label>
      <p class="cp-plan-save-err" hidden={!error()}>{error()}</p>
      <div class="cp-plan-save-acts">
        <button type="button" class="cp-btn" data-act="cancel" on:click={props.close}>{props.labels.cancel}</button>
        <button type="submit" class="cp-btn cp-btn-pri" disabled={busy()}>{props.labels.save}</button>
      </div>
    </form>
  );
}

function PlanMenu(props) {
  let holder;
  const [open, setOpen] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  const toggle = (ev) => {
    ev.stopPropagation();
    const next = !open();
    setOpen(next);
    if (next) document.addEventListener("pointerdown", (out) => { if (!holder.contains(out.target)) setOpen(false); }, { once: true, capture: true });
  };
  const choose = async (ev) => {
    const act = ev.target.closest("[data-act]")?.dataset.act;
    if (act === "copy") {
      if (await props.actions.copy()) {
        setCopied(true);
        setTimeout(() => { setCopied(false); setOpen(false); }, 900);
      }
      return;
    }
    setOpen(false);
    if (act === "download") downloadText(props.menu.file, props.menu.text);
    if (act === "save") props.onSave();
  };
  return (
    <span class="cp-plan-menu" ref={holder}>
      <button type="button" class="cp-plan-dots" aria-label={props.menu.label} aria-haspopup="menu" on:click={toggle}><Raw html={props.menu.icon} /></button>
      <span class="cp-plan-pop" role="menu" hidden={!open()} on:click={choose}>
        <button type="button" role="menuitem" data-act="copy">{copied() ? props.menu.copied : props.menu.copy}</button>
        <button type="button" role="menuitem" data-act="download">{props.menu.download}</button>
        <button type="button" role="menuitem" data-act="save">{props.menu.save}</button>
      </span>
    </span>
  );
}

function PlanCard(props) {
  const m = props.model;
  const [open, setOpen] = createSignal(false);
  const [saving, setSaving] = createSignal(0);
  return (
    <div class="sv-plan cp-plan" classList={{ "cp-plan-folds": m.folds, "cp-plan-open": open(), "cp-plan-held": m.held, answered: m.answered }} data-id={m.id}>
      <div class="ph">
        <span class="cp-plan-badge">{m.badge}</span>
        <h3 class="cp-plan-title">{m.title}</h3>
        <span class="tag">{m.tag}</span>
        <span class="say">{m.say}</span>
        <span class="phn">{m.count}</span>
        <PlanMenu menu={m.menu} actions={props.actions} onSave={() => setSaving(saving() + 1)} />
      </div>
      <div class="pb"><Markdown html={m.body} wire={props.actions.wireBody} /></div>
      <Show when={m.folds}>
        <div class="cp-plan-preview md"><Markdown html={m.preview} wire={props.actions.wirePreview} /></div>
        <div class="cp-plan-more">
          <span class="cp-plan-fade" aria-hidden="true"></span>
          <button type="button" class="cp-plan-toggle" aria-expanded={String(open())} on:click={() => setOpen(!open())}>{open() ? m.collapse : m.expand}</button>
        </div>
      </Show>
      <div class="prows"><For each={m.rows}>{(row, at) => <FrontRow row={row} at={at()} labels={m.pickers} actions={props.actions} />}</For></div>
      <div class="pf">
        <Show when={!m.outcome} fallback={<span class="cost">{m.outcome}</span>}>
          <button type="button" class="btn pri" disabled={m.busy} on:click={() => props.actions.approve()}>{m.go}</button>
          <button type="button" class="btn ghost" on:click={() => props.actions.change()}>{m.change}</button>
          <span class="cost">{m.cost}</span>
        </Show>
      </div>
      <Show keyed when={saving()}>
        {() => <SavePlan path={m.saveAs} labels={m.saving} save={props.actions.save} close={() => setSaving(0)} />}
      </Show>
    </div>
  );
}

export function planCardView(initial, actions) {
  const [model, setModel] = createStore(initial);
  const el = createRoot(() => <PlanCard model={model} actions={actions} />);
  return {
    el,
    show(next) { setModel(reconcile(next, { key: "key" })); }
  };
}
