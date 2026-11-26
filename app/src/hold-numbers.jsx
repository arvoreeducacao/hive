import { For, createRenderEffect, createRoot } from "solid-js";
import { insert } from "solid-js/web";
import { createStore, reconcile } from "solid-js/store";
import { Into } from "./into.jsx";

function HoldMarks(props) {
  createRenderEffect(() => { document.body.classList.toggle("key-caps", !!props.model.caps); });
  createRenderEffect(() => { document.body.classList.toggle("hold-seat", !!props.model.holdSeat); });
  return (
    <For each={props.model.numbers}>{(mark) => (
      <Into host={mark.well}>
        <div class="t-num" aria-hidden="true" hidden={mark.hidden}>{mark.n}</div>
      </Into>
    )}</For>
  );
}

export function mountHoldMarks() {
  const [model, setModel] = createStore({ key: "hold-marks", caps: false, holdSeat: false, numbers: [] });
  const stop = createRoot((dispose) => {
    HoldMarks({ model });
    return dispose;
  });
  return {
    show(next) { setModel(reconcile(next, { key: "key" })); },
    dispose: stop
  };
}

function TuiTray(props) {
  createRenderEffect(() => { props.host.style.bottom = props.model.on ? "60px" : ""; });
  return (
    <div class="tui-attach" classList={{ on: props.model.on }}>
      <For each={props.model.shots}>{(shot) => (
        <div class="att">
          <img alt={shot.alt} src={shot.src} title={shot.title} on:click={() => props.actions.open(shot.key)} />
          <button type="button" class="ax" title={shot.dropSay} on:click={() => props.actions.drop(shot.key)}>×</button>
        </div>
      )}</For>
    </div>
  );
}

export function mountTuiTray(host, actions) {
  const [model, setModel] = createStore({ key: "tui-tray", on: false, shots: [] });
  const stop = createRoot((dispose) => {
    insert(host, () => <TuiTray model={model} host={host} actions={actions} />, null);
    return dispose;
  });
  return {
    show(next) { setModel(reconcile(next, { key: "key" })); },
    dispose: stop
  };
}
